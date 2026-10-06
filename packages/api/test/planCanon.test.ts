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

describe("plans with a Canon: choosing it", () => {
  it("chooses none, one of the owner's Canons or a new one, created with the policy at confirmation", async () => {
    const mine = await newCanon(A, "Language canon");
    const others = await newCanon(B, "Bob's canon");
    const gone = await newCanon(A, "Gone");
    await json(call(A, "DELETE", `/canons/${gone.canonId}`));
    const planId = await newPlan([{ roi: "STG" }]);
    const put = (canon: unknown) => call(A, "PUT", `/plans/${planId}`, { canon });

    expect(await status(put({ mode: "existing", canonId: others.canonId }))).toBe(404);
    expect(await status(put({ mode: "existing", canonId: gone.canonId }))).toBe(404);
    expect(await status(put({ mode: "existing", canonId: "nope" }))).toBe(400);
    expect(await status(put({ mode: "new", name: "" }))).toBe(400);
    expect(await status(put({ mode: "other" }))).toBe(400);

    expect(await json<PlanRecord>(put({ mode: "existing", canonId: mine.canonId }))).toMatchObject({ canonId: mine.canonId, canonNew: null });
    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(d.canon).toEqual({ canonId: mine.canonId, name: "Language canon", headRevision: 0 });
    expect(await json<PlanRecord>(put({ mode: "none" }))).toMatchObject({ canonId: null, canonNew: null });
    expect((await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`))).canon).toBeNull();

    await json(call(A, "PUT", `/plans/${planId}`, { policy: "neocortex = area × projection class" }));
    expect(await json<PlanRecord>(put({ mode: "new", name: "Language (plan)" }))).toMatchObject({ canonId: null, canonNew: { name: "Language (plan)" } });
    const confirmed = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(confirmed.canonId).toBeTruthy();
    expect(planOf(planId)).toMatchObject({ canonId: confirmed.canonId, canonNew: null, status: "RUNNING" });
    expect(canonMeta(confirmed.canonId!)).toMatchObject({ name: "Language (plan)", policy: "neocortex = area × projection class", ownerUserId: A.sub, headRevision: 0 });
    expect(eventsOf(planId).some((e) => e.type === "canon_created" && e.detail?.canonId === confirmed.canonId)).toBe(true);
    // the first row started as a member of the new Canon
    expect(isMember(confirmed.canonId!, rowOf(planId, "STG").projectId!)).toBe(true);
    // fixed after confirmation
    expect(await status(put({ mode: "none" }))).toBe(409);
  });

  it("refuses to confirm when its Canon is gone, and shows it as missing", async () => {
    const mine = await newCanon(A, "Language canon");
    const planId = await newPlan([{ roi: "STG" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: mine.canonId } }));
    await json(call(A, "DELETE", `/canons/${mine.canonId}`));
    const r = await call(A, "POST", `/plans/${planId}/confirm`, {});
    expect(r.status).toBe(409);
    expect(await r.text()).toContain("この計画の Canon が見つかりません");
    expect(planOf(planId).status).toBe("DRAFT");
    expect((await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`))).canon).toMatchObject({ canonId: mine.canonId, missing: true });
    expect(jobs()).toEqual([]);
  });
});

describe("plans with a Canon: seeds, pushes and reviews", () => {
  it("builds seeds one at a time behind their approvals, then pushes body rows and reviews them on free slots", async () => {
    await setLimits(8, 8);
    const planId = await newPlan(
      [
        { roi: "left IFG", wave: 1 },
        { roi: "STG", wave: 2 },
        { roi: "arcuate", wave: 3 },
        { roi: "angular", wave: 3 },
      ],
      ["left IFG", "STG"],
    );
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "new", name: "Language" } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, { locale: "ja" }));
    const canonId = planOf(planId).canonId!;

    // the first seed starts alone, as a member pinned to the empty Canon
    expect(projects()).toHaveLength(1);
    const s1 = rowOf(planId, "left IFG");
    expect(s1).toMatchObject({ state: "running", canonRevision: 0 });
    expect(projectOf(s1.projectId!)).toMatchObject({ canonId, canonRevision: 0, planId });

    // completed: pushed instead of done; a seed gets no AI review
    finish(planId, "left IFG", coarse);
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "review", prNo: 1, aiReview: null });
    expect(prOf(canonId, 1)).toMatchObject({ state: "open", planId, source: `project:${s1.projectId}` });
    expect(eventsOf(planId).some((e) => e.type === "row_pushed" && e.detail?.prNo === 1)).toBe(true);
    expect(reviewJobs()).toEqual([]);

    // the next seed waits for the approval (a human's; the runner never approves)
    await advancePlan(planId);
    expect(projects()).toHaveLength(1);
    expect(prOf(canonId, 1).state).toBe("open");
    expect(await approve(canonId, 1)).toEqual({ revision: 1 });
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "done" });
    expect(rowOf(planId, "STG")).toMatchObject({ state: "running", canonRevision: 1 });
    expect(projects()).toHaveLength(2);

    finish(planId, "STG", own(1));
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "review", prNo: 2 });
    expect(rowsOf(planId).filter((r) => r.wave === 3).map((r) => r.state)).toEqual(["pending", "pending"]);
    await approve(canonId, 2);
    await advancePlan(planId);

    // body rows start together, pinned to the head
    expect(rowOf(planId, "arcuate")).toMatchObject({ state: "running", canonRevision: 2 });
    expect(rowOf(planId, "angular")).toMatchObject({ state: "running", canonRevision: 2 });
    expect(projectOf(rowOf(planId, "arcuate").projectId!).canonRevision).toBe(2);

    // no slot free: the body row's PR waits for its AI review
    await setLimits(1, 1);
    finish(planId, "arcuate", own(2));
    await advancePlan(planId);
    expect(rowOf(planId, "arcuate")).toMatchObject({ state: "review", prNo: 3, aiReview: "wanted" });
    expect(reviewJobs()).toEqual([]);
    // a slot frees: the AI review is queued on it, as the plan's owner
    await setLimits(2, 2);
    await advancePlan(planId);
    const r = rowOf(planId, "arcuate");
    expect(r).toMatchObject({ aiReview: "queued" });
    expect(reviewJobs()).toEqual([expect.objectContaining({ jobId: r.aiReviewJobId, projectId: canonId, userId: A.sub, reviewPrNo: 3, reviewLocale: "ja", status: "QUEUED" })]);
    expect(eventsOf(planId).some((e) => e.type === "row_ai_review" && e.detail?.prNo === 3)).toBe(true);
    await advancePlan(planId);
    expect(reviewJobs()).toHaveLength(1);

    // warnings (needs-review items) wait for a human too
    finish(planId, "angular", warned);
    await advancePlan(planId);
    expect(rowOf(planId, "angular")).toMatchObject({ state: "review", prNo: 4 });
    expect(prOf(canonId, 4).summary).toMatchObject({ errors: 0 });
    expect(prOf(canonId, 4).summary.warnings).toBeGreaterThan(0);

    // approved by a human → done; the plan completes once every PR is in
    await approve(canonId, 3);
    const c4 = await json<{ diff: { conflicts: { id: string; severity: string }[] } }>(call(A, "GET", `/canons/${canonId}/pulls/4`));
    const choices = Object.fromEntries(c4.diff.conflicts.filter((c) => c.severity !== "info").map((c) => [c.id, "canon"]));
    await json(call(A, "POST", `/canons/${canonId}/pulls/4/approve`, { choices }));
    await advancePlan(planId);
    expect(rowsOf(planId).map((x) => x.state)).toEqual(["done", "done", "done", "done"]);
    expect(planOf(planId).status).toBe("COMPLETED");
  });

  it("sends conform follow-ups for conflicts caused by the Canon moving on, at most twice, then asks a human", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    const planId = await newPlan([{ roi: "coarse" }, { roi: "fine" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(rowOf(planId, "fine")).toMatchObject({ state: "running", canonRevision: 0 });

    finish(planId, "coarse", coarse);
    await advancePlan(planId);
    await approve(canon.canonId, 1);
    await advancePlan(planId);
    expect(rowOf(planId, "coarse").state).toBe("done");

    // the Canon moved (rev 1) since "fine" was pinned (rev 0): error conflicts get a conform follow-up
    const fineProject = rowOf(planId, "fine").projectId!;
    finish(planId, "fine", fine);
    await advancePlan(planId);
    expect(prOf(canon.canonId, 2).summary.errors).toBeGreaterThan(0);
    let row = rowOf(planId, "fine");
    expect(row).toMatchObject({ state: "running", conform: false, conformAttempts: 1, canonRevision: 1, prNo: 2 });
    expect(projectOf(fineProject)).toMatchObject({ canonRevision: 1, status: "QUEUED" });
    const followups = () => jobs().filter((j) => j.projectId === fineProject && j.type === "followup");
    expect(followups()).toHaveLength(1);
    expect(followups()[0].instruction).toMatch(new RegExp(`^${conformTitle(1)}\\n\\n`));
    expect(followups()[0].instruction).toContain("revision 1");
    expect(eventsOf(planId).some((e) => e.type === "row_conform" && e.detail?.revision === 1 && e.detail?.attempt === 1)).toBe(true);

    // another project moves the head again: the second follow-up
    ownProject("u7m2q9xa-71", "x1", "y1", own(3), {});
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: "u7m2q9xa-71" }));
    await json(call(A, "POST", "/projects/u7m2q9xa-71/canon/push"));
    await approve(canon.canonId, 3);
    finish(planId, "fine", fine);
    await advancePlan(planId);
    row = rowOf(planId, "fine");
    expect(row).toMatchObject({ state: "running", conformAttempts: 2, canonRevision: 2, prNo: 4 });
    expect(followups()).toHaveLength(2);
    expect(followups()[1].instruction.startsWith(conformTitle(2))).toBe(true);
    expect(prOf(canon.canonId, 2).state).toBe("superseded");

    // and once more: no third follow-up, a human decides
    ownProject("u7m2q9xa-72", "x2", "y2", own(4), {});
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: "u7m2q9xa-72" }));
    await json(call(A, "POST", "/projects/u7m2q9xa-72/canon/push"));
    await approve(canon.canonId, 5);
    finish(planId, "fine", fine);
    await advancePlan(planId);
    expect(rowOf(planId, "fine")).toMatchObject({ state: "decision", decisionReason: "conform_limit", prNo: 6, conformAttempts: 2 });
    expect(followups()).toHaveLength(2);
    expect(planOf(planId).status).toBe("RUNNING");
  });

  it("hands error conflicts without a Canon move, rejected PRs and failed pushes to a human, and follows superseded PRs", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    // rev 1 holds the coarse A44d(left) before the plan starts
    ownProject("u7m2q9xa-80", "x", "y", coarse);
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: "u7m2q9xa-80" }));
    await json(call(A, "POST", "/projects/u7m2q9xa-80/canon/push"));
    await approve(canon.canonId, 1);

    const planId = await newPlan([{ roi: "fine" }, { roi: "own" }, { roi: "lost" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(rowOf(planId, "fine").canonRevision).toBe(1);

    finish(planId, "fine", fine);
    finish(planId, "own", own(5));
    // a project without uc.json cannot be pushed
    finish(planId, "lost", () => undefined);
    await advancePlan(planId);
    // the rows are pushed in row order (random IDs): only the PR number of each is fixed
    expect(rowOf(planId, "fine")).toMatchObject({ state: "decision", decisionReason: "conflicts", prNo: expect.any(Number) });
    expect(jobs().filter((j) => j.type === "followup")).toEqual([]);
    expect(rowOf(planId, "lost")).toMatchObject({ state: "decision", decisionReason: "push_failed" });
    expect(rowOf(planId, "lost").lastError).toContain("uc.json");
    const ownRow = rowOf(planId, "own");
    expect(ownRow).toMatchObject({ state: "review", aiReview: "queued" });

    // pushed again by hand: the row follows the new PR
    const newNo = (await json<{ pr: CanonPullRequestRecord }>(call(A, "POST", `/projects/${ownRow.projectId}/canon/push`))).pr.prNo;
    expect(prOf(canon.canonId, ownRow.prNo!)).toMatchObject({ state: "superseded", reason: `#${newNo}` });
    await advancePlan(planId);
    expect(rowOf(planId, "own")).toMatchObject({ state: "review", prNo: newNo });

    // rejected by a human
    await json(call(A, "POST", `/canons/${canon.canonId}/pulls/${newNo}/reject`, { reason: "粒度が違う" }));
    await advancePlan(planId);
    expect(rowOf(planId, "own")).toMatchObject({ state: "decision", decisionReason: "pr_rejected" });
    expect(eventsOf(planId).filter((e) => e.type === "row_decision").length).toBeGreaterThanOrEqual(3);
  });

  it("lets the owner resolve or skip a decision row", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    const planId = await newPlan([{ roi: "a" }, { roi: "b" }, { roi: "c" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    for (const roi of ["a", "b", "c"]) finish(planId, roi, () => undefined);
    await advancePlan(planId);
    expect(rowsOf(planId).map((r) => r.state)).toEqual(["decision", "decision", "decision"]);
    const id = (roi: string) => rowOf(planId, roi).rowId;
    const resolve = (roi: string, action: unknown, who = A) => call(who, "POST", `/plans/${planId}/rows/${id(roi)}/resolve`, { action });

    expect(await status(resolve("a", "approve"))).toBe(400);
    expect(await status(resolve("a", "done", B))).toBe(404);
    expect(await json(resolve("a", "done"))).toEqual({ ok: true });
    expect(rowOf(planId, "a")).toMatchObject({ state: "done" });
    expect(await status(resolve("a", "done"))).toBe(409);

    // pushed again once its project has what a push needs
    own(6)(rowOf(planId, "b").projectId!);
    expect(await json(resolve("b", "push"))).toEqual({ ok: true });
    expect(rowOf(planId, "b")).toMatchObject({ state: "review", decisionReason: null });
    expect(eventsOf(planId).filter((e) => e.type === "row_resolved").map((e) => e.detail?.action).sort()).toEqual(["done", "push"]);

    // not finished: cannot be pushed
    const pc = rowOf(planId, "c").projectId!;
    fake.put("projects", { ...projectOf(pc), status: "FAILED" } as never);
    expect(await status(resolve("c", "push"))).toBe(409);
    expect(await json(call(A, "POST", `/plans/${planId}/rows/${id("c")}/skip`))).toEqual({ ok: true });
    expect(rowOf(planId, "c").state).toBe("skipped");
    expect(await status(call(A, "POST", `/plans/${planId}/rows/${id("b")}/skip`))).toBe(409);
  });

  it("holds a new wave while too many PRs wait for approval", async () => {
    const canon = await newCanon(A, "Language");
    const wave1 = Array.from({ length: PLAN_MAX_WAITING_PRS }, (_, i) => ({ roi: `w1-${i}`, wave: 1 }));
    const planId = await newPlan([...wave1, { roi: "later", wave: 2 }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    for (const j of jobs()) fake.put("jobs", { ...j, status: "COMPLETED" } as never);
    // every row of wave 1 waits for its approval
    rowsOf(planId)
      .filter((r) => r.wave === 1)
      .forEach((r, i) => {
        fake.put("canons", { canonId: canon.canonId, sk: canonPrSk(i + 1), prNo: i + 1, state: "open", source: `project:x${i}`, summary: { errors: 0 } } as never);
        fake.put("plans", { ...r, state: "review", prNo: i + 1 } as never);
      });
    await setLimits(8, 8);
    await advancePlan(planId);
    expect(planOf(planId).activeWave).toBe(1);
    expect(rowOf(planId, "later").state).toBe("pending");

    // one is approved: below the limit, the next wave starts
    fake.put("canons", { ...prOf(canon.canonId, 1), state: "approved" } as never);
    await advancePlan(planId);
    expect(rowsOf(planId).filter((r) => r.state === "done")).toHaveLength(1);
    expect(planOf(planId).activeWave).toBe(2);
    expect(rowOf(planId, "later").state).toBe("running");
  });

  it("takes existing projects into account: in the Canon → done, in none → pushed, in another → a human", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    const other = await newCanon(A, "Other");
    ownProject("u7m2q9xa-91", "in", "canon", own(7));
    ownProject("u7m2q9xa-92", "no", "canon", own(8));
    ownProject("u7m2q9xa-93", "other", "canon", own(9));
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: "u7m2q9xa-91" }));
    await json(call(A, "POST", `/canons/${other.canonId}/members`, { projectId: "u7m2q9xa-93" }));
    const planId = await newPlan([
      { roi: "in", tlf: "canon" },
      { roi: "no", tlf: "canon" },
      { roi: "other", tlf: "canon" },
    ]);
    expect(rowsOf(planId).every((r) => r.existing)).toBe(true);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));

    expect(rowOf(planId, "in")).toMatchObject({ state: "done", projectId: "u7m2q9xa-91" });
    expect(rowOf(planId, "other")).toMatchObject({ state: "decision", decisionReason: "other_canon", projectId: "u7m2q9xa-93" });
    // pushed by the step the confirmation kicked: it joined the Canon pinned to its head
    expect(rowOf(planId, "no")).toMatchObject({ state: "review", projectId: "u7m2q9xa-92", prNo: 1 });
    expect(projectOf("u7m2q9xa-92")).toMatchObject({ canonId: canon.canonId, canonRevision: 0 });
    expect(prOf(canon.canonId, 1)).toMatchObject({ source: "project:u7m2q9xa-92", planId: null });
    // nothing was built
    expect(jobs().filter((j) => j.type !== "canon-review")).toEqual([]);
  });

  it("hands rows to a human when the plan's Canon was deleted", async () => {
    await setLimits(8, 8);
    const canon = await newCanon(A, "Language");
    const planId = await newPlan([{ roi: "a" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "existing", canonId: canon.canonId } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    await json(call(A, "DELETE", `/canons/${canon.canonId}`));
    finish(planId, "a", own(1));
    await advancePlan(planId);
    expect(rowOf(planId, "a")).toMatchObject({ state: "decision", decisionReason: "push_failed", lastError: "The plan's Canon was not found." });
    expect(planOf(planId).status).toBe("RUNNING");
  });

  it("leaves plans without a Canon as they were: no Canon reads, no pushes", async () => {
    const planId = await newPlan([{ roi: "a" }]);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    finish(planId, "a", own(1));
    vi.mocked(aws.getCanonJson).mockClear();
    await advancePlan(planId);
    expect(rowOf(planId, "a").state).toBe("done");
    expect(planOf(planId).status).toBe("COMPLETED");
    expect(fake.items("canons")).toEqual([]);
    expect(aws.getCanonJson).not.toHaveBeenCalled();
    expect(aws.putCanonJson).not.toHaveBeenCalled();
    expect((await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`))).canon).toBeNull();
  });
});

describe("bulk approval", () => {
  let canonId: string;
  beforeEach(async () => {
    canonId = (await newCanon(A, "Language")).canonId;
    ownProject("u7m2q9xa-1", "a", "a", coarse);
    ownProject("u7m2q9xa-2", "b", "b", own(1));
    ownProject("u7m2q9xa-3", "c", "c", fine);
    ownProject("u7m2q9xa-4", "d", "d", own(2));
    for (const p of ["u7m2q9xa-1", "u7m2q9xa-2", "u7m2q9xa-3", "u7m2q9xa-4"]) {
      await json(call(A, "POST", `/canons/${canonId}/members`, { projectId: p }));
      await json(call(A, "POST", `/projects/${p}/canon/push`));
    }
    await json(call(A, "POST", `/canons/${canonId}/editors`, { email: E.email }));
  });
  const many = (prNos: unknown, who = E) => call(who, "POST", `/canons/${canonId}/pulls/approve-many`, { prNos });

  it("approves conflict-free PRs in order and stops at the first that gained a conflict, recording the approver", async () => {
    // #3 was clean against rev 0, but conflicts with #1 once #1 is in
    expect(prOf(canonId, 3).summary.errors).toBe(0);
    const r = await json<ApproveManyResponse>(many([1, 2, 3, 4]));
    expect(r.approved).toEqual([
      { prNo: 1, revision: 1 },
      { prNo: 2, revision: 2 },
    ]);
    expect(r.stopped).toMatchObject({ prNo: 3, reason: "conflicts" });
    expect(r.stopped!.blocking).toBeGreaterThan(0);
    expect(prOf(canonId, 4).state).toBe("open");
    expect(prOf(canonId, 3).state).toBe("open");
    for (const no of [1, 2]) expect(prOf(canonId, no)).toMatchObject({ state: "approved", decidedBy: E.sub, approvals: [expect.objectContaining({ userId: E.sub })] });
    const revs = fake.items("canons").filter((x) => x.canonId === canonId && String(x.sk).startsWith("REV#"));
    expect(revs.map((x) => [x.revision, x.approvedBy])).toEqual([
      [1, E.sub],
      [2, E.sub],
    ]);

    // a closed or unknown PR stops the run; the rest is untried
    expect(await json<ApproveManyResponse>(many([2, 4]))).toEqual({ approved: [], stopped: { prNo: 2, reason: "closed" } });
    expect(await json<ApproveManyResponse>(many([99, 4]))).toEqual({ approved: [], stopped: { prNo: 99, reason: "not_found" } });
    expect(await json<ApproveManyResponse>(many([4, 4]))).toEqual({ approved: [{ prNo: 4, revision: 3 }], stopped: null });
  });

  it("checks the request and who may approve", async () => {
    expect(await status(many([]))).toBe(400);
    expect(await status(many(["1"]))).toBe(400);
    expect(await status(many([0]))).toBe(400);
    expect(await status(many(Array.from({ length: 51 }, (_, i) => i + 1)))).toBe(400);
    expect(await status(many([1], B))).toBe(404);
    expect(await status(many([1], ADMIN))).toBe(404);
    expect(prOf(canonId, 1).state).toBe("open");
  });
});
