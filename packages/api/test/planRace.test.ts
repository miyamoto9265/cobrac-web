// The review fix of BRA Planner stage 1: changes that depend on a plan's status (rows, settings, confirmation, drafting,
// ordering) run under the plan's lease, so saving rows in one tab while confirming in another never leaves a running
// plan whose rows changed after its confirmation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePlanResponse, PlanEventRecord, PlanRecord, PlanRowRecord } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
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
const { planLeaseWait, PLAN_BUSY_MESSAGE } = await import("../src/lib/plans.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
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
const rowsKey = (planId: string) => rowsOf(planId).map((r) => `${r.roi}|${r.tlf}|${r.wave}|${r.updatedAt}`).sort();

async function newPlan(): Promise<string> {
  const r = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: [{ roi: "left IFG", tlf: "speech production" }, { roi: "STG", tlf: "phonological processing" }] }));
  return r.plan.planId;
}
const edited = (planId: string) => {
  const [first] = rowsOf(planId);
  return { rows: [{ rowId: first.rowId, roi: first.roi, tlf: first.tlf, wave: 1 }, { roi: "arcuate fasciculus", tlf: "repetition", wave: 2 }, { roi: "angular gyrus", tlf: "reading", wave: 2 }] };
};

beforeEach(() => {
  fake.tables.clear();
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
      ["PUT", `/plans/${planId}`, { policy: "area × projection class" }],
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
