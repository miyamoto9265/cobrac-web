import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConcurrencyStatus, CreatePlanResponse, JobRecord, ListPlansResponse, PlanDetailResponse, PlanRecord, PlanRowRecord, ProjectRecord } from "@cobrac/shared";
import { HARNESS_RULES, MAX_ROW_AUTO_RETRIES, PLAN_ID_REGEX } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
}));
const runTask = vi.hoisted(() => vi.fn(async () => ({ tasks: [{ taskArn: "arn:task/1" }] })));
vi.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: class {
    send = runTask;
  },
  RunTaskCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const aws = await import("../src/lib/aws.js");
const { advancePlan } = await import("../src/lib/planRunner.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");
const { handler: runner } = await import("../src/handlers/planRunner.js");
const { handler: dispatcher } = await import("../src/handlers/dispatcher.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
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
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: `${who.sub} (contributor)`, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, roi: string) => rowsOf(planId).find((r) => r.roi === roi)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const projects = () => fake.items("projects") as unknown as ProjectRecord[];
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const activeJobs = () => jobs().filter((j) => ["QUEUED", "RUNNING", "FINALIZING"].includes(j.status));

/** What the dispatcher and the worker would do: the project of `roi` moves to `status`, its active job with it. */
function projectStatus(planId: string, roi: string, to: ProjectRecord["status"], extra: Partial<ProjectRecord> = {}) {
  const row = rowOf(planId, roi);
  const p = projects().find((x) => x.projectId === row.projectId)!;
  fake.put("projects", { ...p, status: to, ...extra } as never);
  const j = jobs().find((x) => x.jobId === p.activeJobId)!;
  fake.put("jobs", { ...j, status: to === "WAITING_USER_INPUT" ? "WAITING_USER_INPUT" : to } as never);
}

async function newPlan(rows: { roi: string; tlf: string; wave?: number }[]): Promise<string> {
  const r = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: "言語の BRA を一通りそろえたい", rows }));
  return r.plan.planId;
}

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

beforeEach(() => {
  fake.tables.clear();
  resetLimitsCache();
  vi.mocked(aws.enqueueRun).mockClear();
  vi.mocked(aws.stopEcsTask).mockClear();
  runTask.mockClear();
  user(A);
  user(B);
  user(ADMIN, { role: "admin" });
});

describe("plans: drafts", () => {
  it("puts every readable row of a capability-list CSV in the plan, lists the others with a reason, and queues nothing", async () => {
    const lines = ["ROI,TLF,理由"];
    for (let i = 1; i <= 20; i++) lines.push(`Region ${i},Function ${i},note ${i}`);
    lines.push(",,only a note");
    const r = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Capabilities", csv: lines.join("\n") }));
    expect(r.plan.planId).toMatch(PLAN_ID_REGEX);
    expect(r.plan).toMatchObject({ status: "DRAFT", rowCount: 20, ownerUserId: A.sub });
    expect(r.rows).toHaveLength(20);
    expect(r.rejected).toEqual([{ row: 22, reason: "noRoiTlf", text: "only a note" }]);
    expect(fake.items("catalog").find((x) => x.id === r.plan.planId)).toMatchObject({ kind: "id", type: "plan", ownerUserId: A.sub });
    expect(jobs()).toEqual([]);
    expect(aws.enqueueRun).not.toHaveBeenCalled();

    // more rows from a second file; duplicates of rows already in the plan are listed
    const more = await json<{ rows: PlanRowRecord[]; rejected: unknown[] }>(call(A, "POST", `/plans/${r.plan.planId}/rows/import`, { csv: "roi,tlf\nRegion 1,Function 1\nRegion 21,Function 21\n" }));
    expect(more.rows).toHaveLength(21);
    expect(more.rejected).toEqual([{ row: 2, reason: "duplicate", text: "Region 1 | Function 1" }]);
    expect(jobs()).toEqual([]);
  });

  it("edits rows, order and waves of a draft and keeps it private to its owner", async () => {
    const planId = await newPlan([{ roi: "left IFG", tlf: "speech production" }, { roi: "STG", tlf: "phonological processing" }]);
    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    const [ifg, stg] = d.rows;
    const edited = await json<{ rows: PlanRowRecord[] }>(
      call(A, "PUT", `/plans/${planId}/rows`, {
        rows: [
          { rowId: stg.rowId, roi: "STG", tlf: "phonological processing", wave: 1 },
          { rowId: ifg.rowId, roi: "left IFG (44/45)", tlf: "speech production", wave: 1, rationale: "hub" },
          { roi: "arcuate fasciculus", tlf: "repetition", wave: 2 },
        ],
      }),
    );
    expect(edited.rows.map((r) => [r.roi, r.wave, r.order])).toEqual([
      ["STG", 1, 0],
      ["left IFG (44/45)", 1, 1],
      ["arcuate fasciculus", 2, 2],
    ]);
    expect(edited.rows[1].rowId).toBe(ifg.rowId);
    expect(await status(call(A, "PUT", `/plans/${planId}/rows`, { rows: [{ roi: "", tlf: "" }] }))).toBe(400);
    expect(await status(call(A, "PUT", `/plans/${planId}/rows`, { rows: [{ roi: "a", tlf: "b" }, { roi: "A", tlf: "B" }] }))).toBe(400);
    expect(await status(call(B, "GET", `/plans/${planId}`))).toBe(404);
    expect(await status(call(B, "POST", `/plans/${planId}/confirm`, {}))).toBe(404);
    expect((await json<ListPlansResponse>(call(B, "GET", "/plans"))).items).toEqual([]);
    expect((await json<ListPlansResponse>(call(A, "GET", "/plans"))).items.map((p) => p.planId)).toEqual([planId]);
    expect(jobs()).toEqual([]);
  });

  it("cannot be confirmed without a key to run jobs with", async () => {
    const planId = await newPlan([{ roi: "STG", tlf: "hearing" }]);
    user(A, { apiKeyRegistered: false });
    expect(await status(call(A, "POST", `/plans/${planId}/confirm`, {}))).toBe(400);
    expect(planOf(planId).status).toBe("DRAFT");
    expect(jobs()).toEqual([]);
  });
});

describe("plans: running", () => {
  it("starts rows on confirmation within the limits, with planId and the plan's harness rules", async () => {
    const planId = await newPlan([
      { roi: "left IFG", tlf: "speech production" },
      { roi: "STG", tlf: "phonological processing" },
      { roi: "angular gyrus", tlf: "reading" },
    ]);
    await json(call(A, "PUT", `/plans/${planId}`, { settings: { researchMode: false, reasoningEffort: "medium" } }));
    const plan = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/confirm`, { locale: "ja" }));
    expect(plan).toMatchObject({
      status: "RUNNING",
      harnessRules: HARNESS_RULES,
      settings: { model: "gpt-6-luna", modelChosen: false, orchestratorModel: "gpt-6-luna", orchestratorModelChosen: false, researchMode: false, reasoningEffort: "medium", locale: "ja" },
    });
    // deployment limits: 2 overall, 1 per user → one row starts
    expect(projects()).toHaveLength(1);
    const p = projects()[0];
    expect(p).toMatchObject({ planId, harnessRules: HARNESS_RULES, roi: "left IFG", tlf: "speech production", researchMode: false, reasoningEffort: "medium", status: "QUEUED", contributor: "sub-alice (contributor)" });
    expect(jobs()[0]).toMatchObject({ planId, type: "initial", locale: "ja", keySource: "own" });
    expect(aws.enqueueRun).toHaveBeenCalledTimes(1);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "running", projectId: p.projectId });
    expect(fake.items("messages").some((m) => (m.meta as { i18n?: string })?.i18n === "sys.planStarted")).toBe(true);

    // a later step does not queue more while the slot is taken (queued jobs count)
    await advancePlan(planId);
    expect(projects()).toHaveLength(1);

    // the harness rules stay the plan's even for rows started later
    fake.put("plans", { ...planOf(planId), harnessRules: 1 } as never);
    projectStatus(planId, "left IFG", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG").state).toBe("done");
    expect(projects().find((x) => x.roi === "STG")).toMatchObject({ planId, harnessRules: 1 });
  });

  it("never has more jobs queued or running than the limits allow, and the admin limit applies without a deploy", async () => {
    const planId = await newPlan(Array.from({ length: 10 }, (_, i) => ({ roi: `R${i}`, tlf: `F${i}` })));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(activeJobs()).toHaveLength(1);
    expect(await status(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: 17 }))).toBe(400);
    expect(await status(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: 0 }))).toBe(400);
    expect(await status(call(A, "PUT", "/admin/concurrency", { maxConcurrentJobs: 8 }))).toBe(403);
    await setLimits(8, 8);
    const s = await json<ConcurrencyStatus>(call(ADMIN, "GET", "/admin/concurrency"));
    expect(s).toMatchObject({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 8, effective: 8, deployment: { maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 1 }, min: 1, max: 16 });
    // another user's job takes one of the 8 global slots
    fake.put("jobs", { projectId: "pothers1", jobId: "job_x", userId: B.sub, type: "initial", status: "RUNNING", createdAt: now, updatedAt: now } as never);
    await advancePlan(planId);
    expect(activeJobs()).toHaveLength(8);
    expect(activeJobs().filter((j) => j.userId === A.sub)).toHaveLength(7);
    await advancePlan(planId);
    expect(activeJobs()).toHaveLength(8);
    // back to the deployment values: nothing new starts until the running ones are below them
    await setLimits(null, null);
    expect((await json<{ maxConcurrentJobs: number }>(call(A, "GET", "/config"))).maxConcurrentJobs).toBe(2);
    for (const r of rowsOf(planId).filter((x) => x.state === "running").slice(0, 3)) projectStatus(planId, r.roi, "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(activeJobs()).toHaveLength(5);
  });

  it("holds the next wave until no row of the current one waits or runs; a question only holds its own row", async () => {
    await setLimits(8, 8);
    const planId = await newPlan([
      { roi: "left IFG", tlf: "speech production", wave: 1 },
      { roi: "STG", tlf: "phonological processing", wave: 1 },
      { roi: "arcuate fasciculus", tlf: "repetition", wave: 2 },
      { roi: "angular gyrus", tlf: "reading", wave: 3 },
      { roi: "Exner's area", tlf: "writing", wave: 3 },
    ]);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.roi).sort()).toEqual(["STG", "left IFG"]);
    projectStatus(planId, "left IFG", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(rowOf(planId, "arcuate fasciculus").state).toBe("pending");

    // the agent of STG asks a question: only that row waits, the next wave starts
    projectStatus(planId, "STG", "WAITING_USER_INPUT", { pendingQuestion: "Which hemisphere?" });
    await advancePlan(planId);
    expect(rowOf(planId, "STG").state).toBe("question");
    expect(rowOf(planId, "arcuate fasciculus").state).toBe("running");
    expect(planOf(planId).activeWave).toBe(2);
    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(d.rows.find((r) => r.roi === "STG")!.project).toMatchObject({ status: "WAITING_USER_INPUT", pendingQuestion: "Which hemisphere?" });

    // answering resumes the row through the existing answer endpoint
    const stg = rowOf(planId, "STG");
    await json(call(A, "POST", `/projects/${stg.projectId}/answer`, { answer: "Left" }));
    await advancePlan(planId);
    expect(rowOf(planId, "STG").state).toBe("running");

    projectStatus(planId, "arcuate fasciculus", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    // STG (wave 1) runs again, so wave 3 waits for it
    expect(rowOf(planId, "angular gyrus").state).toBe("pending");
    projectStatus(planId, "STG", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(rowsOf(planId).filter((r) => r.wave === 3).map((r) => r.state)).toEqual(["running", "running"]);
    projectStatus(planId, "angular gyrus", "COMPLETED", { revision: 1 });
    projectStatus(planId, "Exner's area", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "COMPLETED", rowCounts: { done: 5 } });
  });

  it("retries a failed row up to 2 times, then it needs attention while the other rows continue", async () => {
    await setLimits(8, 2);
    const planId = await newPlan([{ roi: "A", tlf: "a" }, { roi: "B", tlf: "b" }, { roi: "C", tlf: "c" }]);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    for (let attempt = 1; attempt <= MAX_ROW_AUTO_RETRIES; attempt++) {
      projectStatus(planId, "A", "FAILED", { errorMessage: "boom" });
      await advancePlan(planId);
      expect(rowOf(planId, "A")).toMatchObject({ state: "running", attempts: attempt });
      expect(aws.enqueueRun).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: rowOf(planId, "A").projectId, mode: "retry" }));
    }
    expect(jobs().filter((j) => j.projectId === rowOf(planId, "A").projectId && j.planId === planId)).toHaveLength(3);
    projectStatus(planId, "A", "FAILED", { errorMessage: "boom" });
    await advancePlan(planId);
    expect(rowOf(planId, "A")).toMatchObject({ state: "attention", attentionReason: "failed", lastError: "boom" });
    // its slot goes to the next row
    expect(rowOf(planId, "C").state).toBe("running");
    // the owner retries it by hand once the others are through
    projectStatus(planId, "B", "COMPLETED", { revision: 1 });
    projectStatus(planId, "C", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(planOf(planId).status).toBe("RUNNING");
    await json(call(A, "POST", `/plans/${planId}/rows/${rowOf(planId, "A").rowId}/retry`));
    expect(rowOf(planId, "A").state).toBe("running");
    projectStatus(planId, "A", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(planOf(planId).status).toBe("COMPLETED");
    // one project per row, never rebuilt
    expect(new Set(rowsOf(planId).map((r) => r.projectId)).size).toBe(3);
    expect(projects()).toHaveLength(3);
  });

  it("pauses (nothing new starts), resumes, and cancels running rows; resuming does not rebuild finished rows", async () => {
    await setLimits(8, 2);
    const planId = await newPlan([{ roi: "A", tlf: "a" }, { roi: "B", tlf: "b" }, { roi: "C", tlf: "c" }, { roi: "D", tlf: "d" }]);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    await json(call(A, "POST", `/plans/${planId}/pause`));
    projectStatus(planId, "A", "COMPLETED", { revision: 1 });
    await runner();
    expect(planOf(planId)).toMatchObject({ status: "PAUSED", pausedReason: "user" });
    expect(rowOf(planId, "A").state).toBe("done");
    expect(rowOf(planId, "C").state).toBe("pending");
    expect(projects()).toHaveLength(2);

    await json(call(A, "POST", `/plans/${planId}/resume`));
    expect(rowOf(planId, "C").state).toBe("running");

    vi.mocked(aws.enqueueRun).mockClear();
    const runningB = projects().find((p) => p.projectId === rowOf(planId, "B").projectId)!;
    fake.put("jobs", { ...jobs().find((j) => j.jobId === runningB.activeJobId)!, status: "RUNNING", ecsTaskArn: "arn:task/b" } as never);
    await json(call(A, "POST", `/plans/${planId}/cancel`));
    expect(planOf(planId).status).toBe("CANCELLED");
    expect(rowsOf(planId).map((r) => [r.roi, r.state]).sort()).toEqual([
      ["A", "done"],
      ["B", "cancelled"],
      ["C", "cancelled"],
      ["D", "pending"],
    ]);
    expect(projects().find((p) => p.projectId === runningB.projectId)!.status).toBe("CANCELLED");
    expect(aws.stopEcsTask).toHaveBeenCalledWith("arn:task/b", "plan cancelled");
    await runner();
    await advancePlan(planId);
    expect(aws.enqueueRun).not.toHaveBeenCalled();
    expect(activeJobs()).toEqual([]);

    // resume: the cancelled rows continue their projects, A is not rebuilt, D starts in its turn
    await json(call(A, "POST", `/plans/${planId}/resume`));
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.roi).sort()).toEqual(["B", "C"]);
    expect(vi.mocked(aws.enqueueRun).mock.calls.map((c) => c[0].mode)).toEqual(["retry", "retry"]);
    expect(projects()).toHaveLength(3);
  });

  it("pauses itself when the owner can no longer run jobs", async () => {
    const planId = await newPlan([{ roi: "A", tlf: "a" }, { roi: "B", tlf: "b" }]);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    user(A, { apiKeyRegistered: false });
    projectStatus(planId, "A", "COMPLETED", { revision: 1 });
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "PAUSED", pausedReason: "no_key" });
    expect(rowOf(planId, "B").state).toBe("pending");
    expect(await status(call(A, "POST", `/plans/${planId}/resume`))).toBe(400);
    user(A);
    await json(call(A, "POST", `/plans/${planId}/resume`));
    expect(rowOf(planId, "B").state).toBe("running");
  });

  it("does not start a row twice when two steps run at the same time", async () => {
    await setLimits(8, 8);
    const planId = await newPlan([{ roi: "A", tlf: "a" }, { roi: "B", tlf: "b" }]);
    await json(call(A, "PUT", `/plans/${planId}`, { name: "Renamed" }));
    fake.put("plans", { ...planOf(planId), status: "RUNNING", confirmedAt: now, settings: { ...planOf(planId).settings, model: "gpt-6-luna" }, harnessRules: HARNESS_RULES } as never);
    const [r1, r2] = await Promise.all([advancePlan(planId), advancePlan(planId)]);
    expect([r1.skipped, r2.skipped]).toContain("busy");
    expect(projects()).toHaveLength(2);
    expect(new Set(projects().map((p) => p.projectId)).size).toBe(2);
    // the lease is given back, so the next step runs
    expect((await advancePlan(planId)).skipped).toBeUndefined();
  });

  it("finishes a start that the runner left half done, without a second project", async () => {
    await setLimits(8, 8);
    const planId = await newPlan([{ roi: "A", tlf: "a" }]);
    fake.put("plans", { ...planOf(planId), status: "RUNNING", confirmedAt: now, settings: { ...planOf(planId).settings, model: "gpt-6-luna" }, harnessRules: HARNESS_RULES } as never);
    const row = rowOf(planId, "A");
    fake.put("plans", { ...row, state: "starting", projectId: "p7m2q9xa", startJobId: "job_1", claimedAt: "2026-10-01T00:00:00.000Z" } as never);
    await advancePlan(planId);
    expect(rowOf(planId, "A")).toMatchObject({ state: "running", projectId: "p7m2q9xa" });
    expect(projects().map((p) => p.projectId)).toEqual(["p7m2q9xa"]);
  });

  it("lets only drafts, finished and cancelled plans be deleted", async () => {
    const planId = await newPlan([{ roi: "A", tlf: "a" }]);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(await status(call(A, "DELETE", `/plans/${planId}`))).toBe(409);
    await json(call(A, "POST", `/plans/${planId}/cancel`));
    await json(call(A, "DELETE", `/plans/${planId}`));
    expect(await status(call(A, "GET", `/plans/${planId}`))).toBe(404);
    // its project stays
    expect(projects()).toHaveLength(1);
  });

  it("reports the estimate and what the rows' projects cost so far", async () => {
    await setLimits(4, 4);
    const planId = await newPlan(Array.from({ length: 5 }, (_, i) => ({ roi: `R${i}`, tlf: `F${i}` })));
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    projectStatus(planId, "R0", "COMPLETED", { revision: 1, costUsd: 0.18 });
    projectStatus(planId, "R1", "RUNNING", { costUsd: 0.05 });
    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(d.limits).toEqual({ maxConcurrentJobs: 4, maxConcurrentJobsPerUser: 4, effective: 4 });
    expect(d.estimate).toMatchObject({ rows: 5, concurrency: 4, costUsd: { min: 0.9, max: 1.95 } });
    expect(d.plan.estimate).toMatchObject({ rows: 5 });
    expect(d.actual.costUsd).toBeCloseTo(0.23);
    expect(d.actual.minutes).not.toBeNull();
    expect(d.events.map((e) => e.type)).toContain("confirmed");
  });
});

describe("dispatcher", () => {
  const message = (projectId: string, jobId: string, userId: string) => ({ Records: [{ messageId: "m1", body: JSON.stringify({ version: 1, userId, projectId, jobId, mode: "initial" }) }] });

  it("uses the admin limits", async () => {
    for (let i = 0; i < 3; i++) fake.put("jobs", { projectId: `pother${i}`, jobId: `job_${i}`, userId: B.sub, type: "initial", status: "RUNNING", createdAt: now, updatedAt: now } as never);
    fake.put("projects", { userId: A.sub, projectId: "pmine001", status: "QUEUED" } as never);
    fake.put("jobs", { projectId: "pmine001", jobId: "job_m", userId: A.sub, type: "initial", status: "QUEUED", createdAt: now, updatedAt: now } as never);
    // deployment limits (2 overall): waits
    await dispatcher(message("pmine001", "job_m", A.sub) as never);
    expect(runTask).not.toHaveBeenCalled();
    expect(aws.enqueueRun).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job_m" }), 60);
    // raised to 8 by an admin: starts
    await setLimits(8, 8);
    await dispatcher(message("pmine001", "job_m", A.sub) as never);
    expect(runTask).toHaveBeenCalledTimes(1);
  });
});
