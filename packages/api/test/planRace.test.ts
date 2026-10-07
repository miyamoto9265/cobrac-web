// The review fix of BRA Planner stage 1: changes that depend on a plan's status (rows, settings, confirmation, drafting,
// ordering) run under the plan's lease, so saving rows in one tab while confirming in another never leaves a running
// plan whose rows changed after its confirmation. Also when a read lags behind the last writes (DynamoDB's default
// reads may come from a replica that has not seen them yet): the lease is taken on such a read, but what is decided
// under it is read again strongly consistent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePlanResponse, JobRecord, PlanEventRecord, PlanRecord, PlanRowRecord } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
const s3 = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
  getPlanJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putPlanJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
}));
vi.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: class {
    send = vi.fn(async () => ({ tasks: [{ taskArn: "arn:task/1" }] }));
  },
  RunTaskCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");
const { acquirePlanLease, planLeaseWait, PLAN_BUSY_MESSAGE, releasePlanLease } = await import("../src/lib/plans.js");
const { advancePlan } = await import("../src/lib/planRunner.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const now = "2026-10-06T00:00:00.000Z";

function call(who: typeof A, method: string, path: string, body?: unknown) {
  const event = { requestContext: { authorizer: { jwt: { claims: who } } } };
  return app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const eventsOf = (planId: string) => (fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[]).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
const rowsKey = (planId: string) => rowsOf(planId).map((r) => `${r.roi}|${r.tlf}|${r.wave}|${r.state}|${r.updatedAt}`).sort();
const planJobs = (planId: string) => (fake.items("jobs") as unknown as JobRecord[]).filter((j) => j.projectId === planId && j.type === "plan");

type Cmd = { kind: string; input: { Key?: Record<string, unknown>; ConsistentRead?: boolean; ExpressionAttributeValues?: Record<string, unknown> } };
/**
 * A replica that lags behind the plan's last writes: eventually consistent reads of its META (and, with `rows`, of its
 * rows) return the snapshot; strongly consistent reads and every write see the table. Undone after each test.
 */
function lagging(planId: string, meta: Record<string, unknown>, rows?: Record<string, unknown>[]) {
  const send = fake.send.bind(fake);
  fake.send = (async (cmd: Cmd) => {
    const i = cmd.input;
    if (!i.ConsistentRead && cmd.kind === "Get" && i.Key?.planId === planId && i.Key?.sk === "META") return { Item: structuredClone(meta) };
    if (rows && !i.ConsistentRead && cmd.kind === "Query" && i.ExpressionAttributeValues?.[":p"] === planId && i.ExpressionAttributeValues?.[":s"] === "ROW#") return { Items: structuredClone(rows) };
    return send(cmd as never);
  }) as typeof fake.send;
}
/** The next call `match` picks returns what it read, but only after `meanwhile` has run whole. */
function interleave(match: (cmd: Cmd) => boolean, meanwhile: () => Promise<unknown>) {
  const send = fake.send.bind(fake);
  let armed = true;
  fake.send = (async (cmd: Cmd) => {
    if (armed && match(cmd)) {
      armed = false;
      const read = await send(cmd as never);
      await meanwhile();
      return read;
    }
    return send(cmd as never);
  }) as typeof fake.send;
}
const metaRead = (planId: string) => (cmd: Cmd) => !cmd.input.ConsistentRead && cmd.kind === "Get" && cmd.input.Key?.planId === planId && cmd.input.Key?.sk === "META";
/** The runner's first read of a step is consistent, so it can be out of date only through a whole step running after it. */
const anyMetaRead = (planId: string) => (cmd: Cmd) => cmd.kind === "Get" && cmd.input.Key?.planId === planId && cmd.input.Key?.sk === "META";
const rowsRead = (planId: string) => (cmd: Cmd) => cmd.kind === "Query" && cmd.input.ExpressionAttributeValues?.[":p"] === planId && cmd.input.ExpressionAttributeValues?.[":s"] === "ROW#";
const caughtUp = () => delete (fake as { send?: unknown }).send;

async function newPlan(): Promise<string> {
  const r = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: [{ roi: "left IFG", tlf: "speech production" }, { roi: "STG", tlf: "phonological processing" }] }));
  return r.plan.planId;
}
const edited = (planId: string) => {
  const [first] = rowsOf(planId);
  return { rows: [{ rowId: first.rowId, roi: first.roi, tlf: first.tlf, wave: 1 }, { roi: "arcuate fasciculus", tlf: "repetition", wave: 2 }, { roi: "angular gyrus", tlf: "reading", wave: 2 }] };
};

afterEach(() => void caughtUp());

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  planLeaseWait.delayMs = 2;
  fake.put("users", { userId: A.sub, email: A.email, displayName: A.sub, contributorName: A.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now });
});

describe("plans: edits and confirmation under the plan's lease", () => {
  it("refuses with 409 and changes nothing while another step holds the plan", async () => {
    const planId = await newPlan();
    fake.put("plans", { ...planOf(planId), leaseUntil: new Date(Date.now() + 60_000).toISOString() } as never);
    const rows = rowsKey(planId);
    const events = eventsOf(planId).length;
    for (const [method, path, body] of [
      ["PUT", `/plans/${planId}/rows`, edited(planId)],
      ["POST", `/plans/${planId}/confirm`, {}],
      ["POST", `/plans/${planId}/rows/import`, { csv: "roi,tlf\nMTG,naming\n" }],
      ["POST", `/plans/${planId}/order`, undefined],
      ["POST", `/plans/${planId}/draft`, {}],
      ["PUT", `/plans/${planId}`, { canon: { mode: "new", name: "Language" } }],
      ["PUT", `/plans/${planId}`, { settings: { researchMode: false } }],
    ] as const) {
      const res = await call(A, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(409);
      expect(await res.text()).toContain(PLAN_BUSY_MESSAGE);
    }
    expect(rowsKey(planId)).toEqual(rows);
    expect(eventsOf(planId)).toHaveLength(events);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", settings: { researchMode: true } });
    expect(planOf(planId).policy).toBeUndefined();
    expect(fake.items("jobs")).toEqual([]);
    // a rename does not depend on the status and is not held up
    await json(call(A, "PUT", `/plans/${planId}`, { name: "Renamed" }));
    expect(planOf(planId).name).toBe("Renamed");
  });

  it("never leaves a running plan whose rows changed after it was confirmed (rows saved and confirmed at once)", async () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 6; i++) {
      fake.tables.delete("plans");
      const planId = await newPlan();
      const put = () => call(A, "PUT", `/plans/${planId}/rows`, edited(planId));
      const confirm = () => call(A, "POST", `/plans/${planId}/confirm`, {});
      const [p, c] = i % 2 ? await Promise.all([put(), confirm()]) : (await Promise.all([confirm(), put()])).reverse();
      expect(c.status).toBe(200);
      expect([200, 409]).toContain(p.status);
      outcomes.add(String(p.status));

      const plan = planOf(planId);
      expect(plan.status).toBe("RUNNING");
      const types = eventsOf(planId).map((e) => e.type);
      // nothing changed the rows after the confirmation
      const confirmedAt = types.indexOf("confirmed");
      expect(types.lastIndexOf("rows_changed")).toBeLessThan(confirmedAt);
      expect(rowsOf(planId).every((r) => r.updatedAt <= plan.confirmedAt! || r.state !== "pending")).toBe(true);
      // the plan runs exactly the rows it was confirmed with
      expect(plan.estimate!.rows).toBe(rowsOf(planId).length);
      expect(rowsOf(planId).map((r) => r.tlf).sort()).toEqual(p.status === 200 ? ["reading", "repetition", "speech production"] : ["phonological processing", "speech production"]);
    }
    // both orders happened
    expect(outcomes).toEqual(new Set(["200", "409"]));
  });
});

describe("plans: the lease on reads that lag", () => {
  it("gives the lease back with a value no earlier holder wrote, so a read taken before another holder's turn takes nothing", async () => {
    const planId = await newPlan();
    const lease = await acquirePlanLease({ ...planOf(planId) }, 60_000);
    await releasePlanLease(planId, lease!);
    const released = planOf(planId).leaseUntil!;
    expect(Date.parse(released)).toBeLessThanOrEqual(Date.now());
    const before = { ...planOf(planId) };
    // another holder's whole turn, a moment later
    await new Promise((resolve) => setTimeout(resolve, 3));
    const other = await acquirePlanLease({ ...planOf(planId) }, 60_000);
    await releasePlanLease(planId, other!);
    expect(planOf(planId).leaseUntil).not.toBe(released);
    expect(await acquirePlanLease(before, 60_000)).toBeNull();
    expect(await acquirePlanLease({ ...planOf(planId) }, 60_000)).toBeTruthy();
  });

  it("refuses rows saved or imported after a confirmation the replica has not seen, and changes no row", async () => {
    const planId = await newPlan();
    // the plan was leased before (an earlier save), as in a real session; the confirmation comes a moment later, so
    // its lease is given back with another value (two releases within a millisecond would repeat one: see below)
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: rowsOf(planId).map((r) => ({ rowId: r.rowId, roi: r.roi, tlf: r.tlf, wave: r.wave })) }));
    const draft = { ...planOf(planId) };
    await new Promise((resolve) => setTimeout(resolve, 3));
    const edit = edited(planId);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    const confirmed = planOf(planId);
    expect(confirmed.status).toBe("RUNNING");
    const rows = rowsKey(planId);
    const events = eventsOf(planId).length;

    for (const [method, path, body] of [
      ["PUT", `/plans/${planId}/rows`, edit],
      ["POST", `/plans/${planId}/rows/import`, { csv: "roi,tlf\nMTG,naming\n" }],
    ] as const) {
      // the replica still has the draft: its lease value is stale (the lease is busy for it) or, as with a released
      // value that repeats, the current one (the lease is taken, and the plan read under it is the confirmed one)
      for (const snapshot of [draft, { ...draft, leaseUntil: planOf(planId).leaseUntil }]) {
        lagging(planId, snapshot);
        const res = await call(A, method, path, body);
        caughtUp();
        expect(res.status, `${method} ${path}`).toBe(409);
        expect(await res.text()).toMatch(snapshot === draft ? PLAN_BUSY_MESSAGE : "確定後の計画の行は変更できません");
      }
    }
    expect(rowsKey(planId)).toEqual(rows);
    expect(eventsOf(planId)).toHaveLength(events);
    expect(planOf(planId)).toMatchObject({ status: "RUNNING", rowCount: confirmed.rowCount, estimate: confirmed.estimate });
  });

  it("confirms the rows just saved, not what a lagging replica still shows", async () => {
    const planId = await newPlan();
    await json(call(A, "POST", `/plans/${planId}/order`));
    expect(planOf(planId).ordering).toBe("auto");
    const before = { meta: { ...planOf(planId) }, rows: rowsOf(planId).map((r) => ({ ...r })) };
    // the web saves the edited rows, then confirms at once
    await json(call(A, "PUT", `/plans/${planId}/rows`, edited(planId)));
    expect(planOf(planId).ordering).toBe("manual");
    lagging(planId, { ...before.meta, leaseUntil: planOf(planId).leaseUntil }, before.rows);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    caughtUp();
    expect(rowsOf(planId).map((r) => r.tlf).sort()).toEqual(["reading", "repetition", "speech production"]);
    expect(planOf(planId)).toMatchObject({ status: "RUNNING", ordering: "manual", estimate: { rows: 3 } });
  });

  it("writes no row of a draft deleted while its rows are saved (a delete takes no lease)", async () => {
    const planId = await newPlan();
    const rows = rowsKey(planId);
    interleave(rowsRead(planId), async () => expect((await call(A, "DELETE", `/plans/${planId}`)).status).toBe(200));
    const res = await call(A, "PUT", `/plans/${planId}/rows`, edited(planId));
    caughtUp();
    expect(res.status).toBe(409);
    expect(rowsKey(planId)).toEqual(rows);
    expect(planOf(planId).deletedAt).toBeTruthy();
  });

  it("never queues a second draft job when a runner step read the plan before another step queued one", async () => {
    // slots to spare: only the plan's own state keeps a second job out
    fake.put("users", { userId: ADMIN.sub, email: ADMIN.email, displayName: "admin", role: "admin", disabled: false, createdAt: now, updatedAt: now });
    await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 8 }));
    resetLimitsCache();
    const planId = await newPlan();
    // the owner's other jobs hold every slot: the draft waits
    for (let i = 0; i < 8; i++) fake.put("jobs", { projectId: `pbusy00${i}`, jobId: `job_busy${i}`, userId: A.sub, type: "initial", status: "RUNNING", createdAt: now, updatedAt: now } as never);
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    expect(planOf(planId).draft).toMatchObject({ status: "waiting" });
    for (const j of fake.items("jobs") as unknown as JobRecord[]) if (j.jobId.startsWith("job_busy")) fake.put("jobs", { ...j, status: "COMPLETED" } as never);

    // step A reads the plan; step B (a kick, or the next scheduled run) does its whole turn and queues the job
    let b: Awaited<ReturnType<typeof advancePlan>> | null = null;
    interleave(anyMetaRead(planId), async () => (b = await advancePlan(planId)));
    const a = await advancePlan(planId);
    caughtUp();
    expect(b!.planJob).toBeTruthy();
    expect(a.planJob).toBeUndefined();

    // the same with a lease value that repeats (A takes the lease after B's turn): A reads the plan again under it
    const waiting = { ...planOf(planId), draft: { ...planOf(planId).draft!, status: "waiting", jobId: null } };
    lagging(planId, { ...waiting, leaseUntil: planOf(planId).leaseUntil });
    const again = await advancePlan(planId);
    caughtUp();
    expect(again.skipped).toBeUndefined();
    expect(again.planJob).toBeUndefined();

    expect(planJobs(planId)).toHaveLength(1);
    expect(planOf(planId).draft).toMatchObject({ status: "queued", jobId: b!.planJob });
  });
});
