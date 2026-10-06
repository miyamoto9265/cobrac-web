import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApproveManyResponse,
  CanonPullRequestRecord,
  CanonRecord,
  CreatePlanResponse,
  JobRecord,
  PlanDetailResponse,
  PlanEventRecord,
  PlanRecord,
  PlanRowRecord,
  ProjectRecord,
} from "@cobrac/shared";
import { PLAN_MAX_WAITING_PRS, canonPrSk, conformTitle } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
const s3 = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
  getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
  getCanonJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putCanonJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
  getPlanJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putPlanJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const aws = await import("../src/lib/aws.js");
const { advancePlan } = await import("../src/lib/planRunner.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
const E = { sub: "sub-erin", email: "erin@example.com" };
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
const status = async (r: Response | Promise<Response>) => (await r).status;

function user(who: typeof A, extra: Record<string, unknown> = {}) {
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, roi: string) => rowsOf(planId).find((r) => r.roi === roi)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const eventsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[];
const projects = () => fake.items("projects") as unknown as ProjectRecord[];
const projectOf = (id: string) => projects().find((p) => p.projectId === id)!;
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const reviewJobs = () => jobs().filter((j) => j.type === "canon-review");
const canonMeta = (canonId: string) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === "META") as unknown as CanonRecord;
const prOf = (canonId: string, no: number) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === canonPrSk(no)) as unknown as CanonPullRequestRecord;
const isMember = (canonId: string, projectId: string) => fake.items("canons").some((x) => x.canonId === canonId && x.sk === `MEMBER#${projectId}`);

// --- project contents (as in pulls.test.ts) ---------------------------------------------------------------------------

const uc = (id: string, d: string, tx = "Glutamate") => ({
  circuitId: id,
  descriptor: d,
  names: id,
  roi: "internal",
  sourceOfId: "BNA",
  transmitter: tx,
  modulationType: "Excitatory",
  comments: "",
  interface: "",
  requirement: "",
  requirementRealization: "",
  capability: "",
  mechanism: "",
  implementation: "",
  outputSemantics: "",
});
type Content = (P: string) => void;
function workspace(ucs: ReturnType<typeof uc>[], collections: unknown[] = [], conns: [string, string][] = []): Content {
  return (P) => {
    const put = (rel: string, v: unknown) => s3.set(`users/${A.sub}/${P}/workspace/${rel}`, JSON.stringify(v));
    put(`${P}_HCD/uc.json`, { ucs, collections });
    put(`${P}_HCD/connections.json`, {
      bif: [],
      connections: conns.map(([s, r]) => ({
        sender: s,
        senderRelation: "<",
        senderInLiterature: "area 44",
        receiver: r,
        receiverRelation: "=",
        receiverInLiterature: "area 22",
        comment: "",
        referenceIds: ["[Catani, 2005]"],
        taxon: "Human",
        measurementMethod: "DW-MRI",
        pointersOnLiterature: "The arcuate fasciculus connects Broca's territory with Wernicke's territory in humans.",
        pointersOnFigure: "Fig. 2",
      })),
    });
    put(`${P}_HCD/references.json`, { references: [{ id: "[Catani, 2005]", doi: "10.1002/ana.20319", literatureType: "Experimental results" }] });
    put("meta.json", { roi: "perisylvian cortex", tlf: "language", description: "x" });
  };
}
/** A44d(left) uniform */
const coarse = workspace([uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [], [["A44d(left)", "A22c(left)"]]);
/** A44d(left) a Collection: error conflicts (C1, C3) against a Canon where it is uniform */
const fine = workspace(
  [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left"), uc("A22c(left)", "BNA:75-76/side:left")],
  [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"], comments: "" }],
  [["A44d(L3.IT.left)", "A22c(left)"]],
);
/** A circuit of its own: never conflicts */
const own = (n: number) => workspace([uc(`R${n}(left)`, `BNA:${2 * n - 1}-${2 * n}/side:left`)]);
/** A22c(left) with another transmitter: a warning (C7, needs a human) against `coarse` */
const warned = workspace([uc("A22c(left)", "BNA:75-76/side:left", "Glutamate; GABA")]);

/** What the worker would do: the row's project completes with `content` (its active job with it). */
function finish(planId: string, roi: string, content: Content) {
  const P = rowOf(planId, roi).projectId!;
  content(P);
  const p = projectOf(P);
  fake.put("projects", { ...p, status: "COMPLETED", hasArtifacts: true, revision: (p.revision ?? 0) + 1, activeJobId: null } as never);
  for (const j of jobs().filter((x) => x.projectId === P && ["QUEUED", "RUNNING"].includes(x.status))) fake.put("jobs", { ...j, status: "COMPLETED" } as never);
}

/** A completed project of A outside any plan. */
function ownProject(projectId: string, roi: string, tlf: string, content: Content, extra: Partial<ProjectRecord> = {}) {
  fake.put("projects", {
    userId: A.sub,
    projectId,
    name: `P ${projectId}`,
    nameSource: "user",
    revision: 1,
    roi,
    tlf,
    contributor: "a",
    status: "COMPLETED",
    currentStep: "XLSX",
    stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" },
    activeJobId: null,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: true,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    ...extra,
  } as never);
  content(projectId);
}

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

const newCanon = (who: typeof A, name: string) => json<CanonRecord>(call(who, "POST", "/canons", { name }));

/** A draft plan; rows named in `seeds` are seed rows. */
async function newPlan(rows: { roi: string; tlf?: string; wave?: number }[], seeds: string[] = []): Promise<string> {
  const r = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: "言語の BRA を一通りそろえたい", rows: rows.map((x) => ({ tlf: `${x.roi} function`, ...x })) }));
  for (const s of seeds) fake.put("plans", { ...rowOf(r.plan.planId, s), seed: true } as never);
  return r.plan.planId;
}

const approve = (canonId: string, no: number, who = A) => json<{ revision: number }>(call(who, "POST", `/canons/${canonId}/pulls/${no}/approve`, {}));

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  vi.mocked(aws.enqueueRun).mockClear();
  vi.mocked(aws.getCanonJson).mockClear();
  vi.mocked(aws.putCanonJson).mockClear();
  user(A);
  user(B, { userKey: "u3k8d0hn" });
  user(E, { userKey: "u5f6g7h8" });
  user(ADMIN, { role: "admin", userKey: "u9a8b7c6" });
});

/** A job of A that holds a slot: no row or review can start until it is removed. */
const holdSlot = () => fake.put("jobs", { projectId: "u7m2q9xa-busy", jobId: "job_busy", userId: A.sub, type: "followup", status: "RUNNING", createdAt: now, updatedAt: now } as never);
const freeSlot = () => fake.table("jobs").delete(["u7m2q9xa-busy", "job_busy"].join("\u0000"));
/** Approves a PR with error conflicts, taking the incoming side of each (a human settling it in the Canon). */
async function approveIncoming(canonId: string, no: number) {
  const d = await json<{ diff: { conflicts: { id: string; severity: string }[] } }>(call(A, "GET", `/canons/${canonId}/pulls/${no}`));
  const choices = Object.fromEntries(d.diff.conflicts.filter((c) => c.severity !== "info").map((c) => [c.id, "incoming"]));
  return json<{ revision: number }>(call(A, "POST", `/canons/${canonId}/pulls/${no}/approve`, { choices }));
}
const followupsOf = (projectId: string) => jobs().filter((j) => j.projectId === projectId && j.type === "followup");

/** A plan of `coarse` (approved: rev 1) and `fine` (pinned to rev 0): `fine` is pushed with error conflicts while no slot is free. */
async function conformWaiting() {
  await setLimits(8, 8);
  const canon = await newCanon(A, "Language");
  const planId = await newPlan([{ roi: "coarse" }, { roi: "fine" }]);
  await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
  await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
  finish(planId, "coarse", coarse);
  await advancePlan(planId);
  await approve(canon.canonId, 1);
  await advancePlan(planId);
  holdSlot();
  await setLimits(1, 1);
  finish(planId, "fine", fine);
  await advancePlan(planId);
  const row = rowOf(planId, "fine");
  expect(row).toMatchObject({ state: "pending", conform: true, prNo: 2, canonRevision: 0 });
  expect(prOf(canon.canonId, 2).summary.errors).toBeGreaterThan(0);
  return { canonId: canon.canonId, planId, projectId: row.projectId! };
}

describe("plans with a Canon: following PRs a human settled", () => {
  it("sends no conform follow-up for a PR a human approved while the row waited for a slot", async () => {
    const { canonId, planId, projectId } = await conformWaiting();
    expect(await approveIncoming(canonId, 2)).toEqual({ revision: 2 });
    freeSlot();
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "done", conform: false, prNo: 2 });
    expect(rowOf(planId, "fine").conformAttempts ?? 0).toBe(0);
    expect(followupsOf(projectId)).toEqual([]);
    expect(eventsOf(planId).some((e) => e.type === "row_done" && e.detail?.prNo === 2)).toBe(true);
    expect(eventsOf(planId).some((e) => e.type === "row_conform")).toBe(false);
    expect(planOf(planId).status).toBe("COMPLETED");
  });

  it("hands a rejected PR to a human instead of sending its conform follow-up", async () => {
    const { canonId, planId, projectId } = await conformWaiting();
    await json(call(A, "POST", `/canons/${canonId}/pulls/2/reject`, { reason: "粒度が違う" }));
    // decided at once, even with no slot free
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "decision", decisionReason: "pr_rejected", conform: false, prNo: 2 });
    freeSlot();
    await advancePlan(planId);
    expect(rowOf(planId, "fine").state).toBe("decision");
    expect(followupsOf(projectId)).toEqual([]);
    // no new PR was pushed
    expect(fake.items("canons").filter((x) => x.canonId === canonId && String(x.sk).startsWith("PR#"))).toHaveLength(2);
  });

  it("follows a PR that replaced the one waiting for its conform follow-up", async () => {
    const { canonId, planId, projectId } = await conformWaiting();
    const newNo = (await json<{ pr: CanonPullRequestRecord }>(call(A, "POST", `/projects/${projectId}/canon/push`))).pr.prNo;
    expect(newNo).toBe(3);
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "review", prNo: 3, conform: false, aiReview: "wanted", aiReviewJobId: null });
    expect(followupsOf(projectId)).toEqual([]);
  });

  it("sends the conform follow-up only while the PR is open, counting the attempt with the claim; a failed start keeps it counted", async () => {
    const { canonId, planId, projectId } = await conformWaiting();
    freeSlot();
    await setLimits(8, 8);
    let claimed: PlanRowRecord | null = null;
    // the follow-up cannot be prepared (S3 fails): what the claim wrote is seen at that moment
    vi.mocked(aws.getCanonJson).mockImplementationOnce(async () => {
      claimed = { ...rowOf(planId, "fine") };
      throw new Error("S3 down");
    });
    await advancePlan(planId);
    expect(claimed).toMatchObject({ state: "starting", conform: false, conformAttempts: 1, canonRevision: 1 });
    // back to waiting with its conform and pin; the attempt stays counted, so the limit holds
    expect(rowOf(planId, "fine")).toMatchObject({ state: "pending", conform: true, canonRevision: 0, conformAttempts: 1, attempts: 1, lastError: "S3 down" });
    expect(followupsOf(projectId)).toEqual([]);

    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "running", conform: false, conformAttempts: 2, canonRevision: 1, prNo: 2 });
    expect(followupsOf(projectId)).toHaveLength(1);
    expect(prOf(canonId, 2).state).toBe("open");
  });

  it("finishes a 「人の判断」 seed whose PR a human approved in the Canon, and the next wave starts", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    // rev 1 holds the coarse A44d(left) before the plan starts: the seed's error conflicts are not caused by a Canon move
    ownProject("u7m2q9xa-80", "x", "y", coarse);
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: "u7m2q9xa-80" }));
    await json(call(A, "POST", "/projects/u7m2q9xa-80/canon/push"));
    await approve(canon.canonId, 1);
    const planId = await newPlan(
      [
        { roi: "fine", wave: 1 },
        { roi: "later", wave: 2 },
      ],
      ["fine"],
    );
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    finish(planId, "fine", fine);
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "decision", decisionReason: "conflicts", prNo: 2 });
    await advancePlan(planId);
    expect(rowOf(planId, "later").state).toBe("pending");

    await approveIncoming(canon.canonId, 2);
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "done", prNo: 2 });
    expect(eventsOf(planId).some((e) => e.type === "row_done" && e.detail?.prNo === 2)).toBe(true);
    expect(rowOf(planId, "later")).toMatchObject({ state: "running", canonRevision: 2 });
  });

  it("moves a 「人の判断」 row to 「承認待ち」 when its PR is replaced, and leaves it when its PR is rejected", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    ownProject("u7m2q9xa-80", "x", "y", coarse);
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: "u7m2q9xa-80" }));
    await json(call(A, "POST", "/projects/u7m2q9xa-80/canon/push"));
    await approve(canon.canonId, 1);
    const planId = await newPlan([{ roi: "fine" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    finish(planId, "fine", fine);
    await advancePlan(planId);
    const row = rowOf(planId, "fine");
    expect(row).toMatchObject({ state: "decision", decisionReason: "conflicts", prNo: 2 });

    await json(call(A, "POST", `/projects/${row.projectId}/canon/push`));
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "review", prNo: 3, decisionReason: null, aiReview: "queued" });

    await json(call(A, "POST", `/canons/${canon.canonId}/pulls/3/reject`, { reason: "粒度が違う" }));
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "decision", decisionReason: "pr_rejected", prNo: 3 });
    const events = eventsOf(planId).length;
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "decision", decisionReason: "pr_rejected" });
    expect(eventsOf(planId)).toHaveLength(events);
  });
});

describe("plans with a Canon: AI reviews of 「承認待ち」 rows", () => {
  it("clears the queued AI review once its job ended, reads PRs consistently, and asks a new review for a replacing PR", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    const planId = await newPlan([{ roi: "a" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    finish(planId, "a", own(1));
    const send = vi.spyOn(fake, "send");
    await advancePlan(planId);
    // every read of a PR by the runner is strongly consistent (it may have written the PR in this same step)
    const prReads = send.mock.calls
      .map(([c]) => c as unknown as { kind: string; input: { TableName?: string; Key?: { sk?: string }; ConsistentRead?: boolean } })
      .filter((c) => c.kind === "Get" && String(c.input.Key?.sk ?? "").startsWith("PR#"));
    send.mockRestore();
    expect(prReads.length).toBeGreaterThan(0);
    expect(prReads.every((c) => c.input.ConsistentRead === true)).toBe(true);

    const first = rowOf(planId, "a");
    expect(first).toMatchObject({ state: "review", prNo: 1, aiReview: "queued", aiReviewJobId: expect.any(String) });
    // still running: unchanged
    await advancePlan(planId);
    expect(rowOf(planId, "a")).toMatchObject({ aiReview: "queued", aiReviewJobId: first.aiReviewJobId });

    // ended: no longer shown as running; the job stays linked
    const job = reviewJobs().find((j) => j.jobId === first.aiReviewJobId)!;
    fake.put("jobs", { ...job, status: "COMPLETED" } as never);
    await advancePlan(planId);
    expect(rowOf(planId, "a")).toMatchObject({ state: "review", aiReview: null, aiReviewJobId: first.aiReviewJobId });
    expect(reviewJobs()).toHaveLength(1);

    // pushed again by hand: the row follows the new PR and asks its AI review
    await json(call(A, "POST", `/projects/${first.projectId}/canon/push`));
    await advancePlan(planId);
    const next = rowOf(planId, "a");
    expect(next).toMatchObject({ state: "review", prNo: 2, aiReview: "queued" });
    expect(next.aiReviewJobId).not.toBe(first.aiReviewJobId);
    expect(reviewJobs().find((j) => j.jobId === next.aiReviewJobId)).toMatchObject({ reviewPrNo: 2 });
  });

  it("follows a review a human already asked for as the row's own", async () => {
    await setLimits(1, 1);
    const canon = await newCanon(A, "Language");
    const planId = await newPlan([{ roi: "a" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    holdSlot();
    finish(planId, "a", own(1));
    await advancePlan(planId);
    expect(rowOf(planId, "a")).toMatchObject({ state: "review", aiReview: "wanted" });
    freeSlot();
    await json(call(A, "POST", `/canons/${canon.canonId}/pulls/1/ai-review`, { locale: "ja" }));
    const asked = reviewJobs()[0];
    await setLimits(8, 8);
    await advancePlan(planId);
    expect(rowOf(planId, "a")).toMatchObject({ aiReview: "queued", aiReviewJobId: asked.jobId });
    expect(reviewJobs()).toHaveLength(1);
    fake.put("jobs", { ...asked, status: "FAILED" } as never);
    await advancePlan(planId);
    expect(rowOf(planId, "a")).toMatchObject({ aiReview: null, aiReviewJobId: asked.jobId });
  });
});

describe("plans with a Canon: existing projects and re-plans", () => {
  it("pushes an existing project in no Canon only when its wave starts, behind the seed's approval", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    ownProject("u7m2q9xa-92", "no", "canon", own(8));
    const planId = await newPlan(
      [
        { roi: "hub", wave: 1 },
        { roi: "no", tlf: "canon", wave: 2 },
      ],
      ["hub"],
    );
    expect(rowOf(planId, "no").existing).toBeTruthy();
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    const existing = rowOf(planId, "no");
    expect(existing.wave).toBeGreaterThan(rowOf(planId, "hub").wave);
    expect(existing).toMatchObject({ state: "pending", projectId: "u7m2q9xa-92" });
    expect(rowOf(planId, "hub").state).toBe("running");
    expect(isMember(canon.canonId, "u7m2q9xa-92")).toBe(false);

    finish(planId, "hub", coarse);
    await advancePlan(planId);
    expect(rowOf(planId, "hub")).toMatchObject({ state: "review", prNo: 1 });
    expect(rowOf(planId, "no").state).toBe("pending");
    expect(fake.items("canons").filter((x) => String(x.sk).startsWith("PR#"))).toHaveLength(1);

    await approve(canon.canonId, 1);
    await advancePlan(planId);
    expect(rowOf(planId, "hub").state).toBe("done");
    // pushed when its wave started: joined the Canon pinned to the head; no job, no attempt
    expect(rowOf(planId, "no")).toMatchObject({ state: "review", prNo: 2, attempts: 0 });
    expect(projectOf("u7m2q9xa-92")).toMatchObject({ canonId: canon.canonId, canonRevision: 1, status: "COMPLETED" });
    expect(jobs().filter((j) => j.projectId === "u7m2q9xa-92")).toEqual([]);
    expect(eventsOf(planId).some((e) => e.type === "row_retry")).toBe(false);
  });

  it("re-plans a wave of a plan with a Canon once its PRs are approved, with the anchors they used", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    const planId = await newPlan(
      [
        { roi: "hub", wave: 1 },
        { roi: "b1", wave: 2 },
        { roi: "b2", wave: 3 },
      ],
      ["hub"],
    );
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    fake.put("plans", { ...planOf(planId), ordering: "auto" } as never);
    finish(planId, "hub", coarse);
    await advancePlan(planId);
    expect(rowOf(planId, "hub").state).toBe("review");
    // pushed, not approved yet: no re-plan with predicted anchors
    expect(eventsOf(planId).some((e) => e.type === "replanned")).toBe(false);
    expect(planOf(planId).lastReplanWave).toBeUndefined();

    await approve(canon.canonId, 1);
    await advancePlan(planId);
    expect(rowOf(planId, "hub")).toMatchObject({ state: "done", anchorsSource: "used" });
    expect(rowOf(planId, "hub").anchors?.length).toBeGreaterThan(0);
    expect(eventsOf(planId).filter((e) => e.type === "replanned").map((e) => e.detail?.wave)).toEqual([1]);
    expect(planOf(planId)).toMatchObject({ lastReplanWave: 1 });
  });
});

describe("bulk approval: an error part-way", () => {
  it("stops with the PRs approved so far when approving one throws", async () => {
    const canonId = (await newCanon(A, "Language")).canonId;
    ownProject("u7m2q9xa-1", "a", "a", own(1));
    ownProject("u7m2q9xa-2", "b", "b", own(2));
    ownProject("u7m2q9xa-3", "c", "c", own(3));
    for (const p of ["u7m2q9xa-1", "u7m2q9xa-2", "u7m2q9xa-3"]) {
      await json(call(A, "POST", `/canons/${canonId}/members`, { projectId: p }));
      await json(call(A, "POST", `/projects/${p}/canon/push`));
    }
    // the payload of #2 is gone: approving it throws
    s3.delete(`canons/${canonId}/pr/2/incoming.json`);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await json<ApproveManyResponse>(call(A, "POST", `/canons/${canonId}/pulls/approve-many`, { prNos: [1, 2, 3] }));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    expect(r).toEqual({ approved: [{ prNo: 1, revision: 1 }], stopped: { prNo: 2, reason: "race" } });
    expect(prOf(canonId, 1).state).toBe("approved");
    expect(prOf(canonId, 3).state).toBe("open");
  });
});
