// BRA Planner stage 2: drafts written by the `plan` job, capability lists attached at creation, the automatic order,
// existing projects, plan jobs and the limits, the janitor and the dispatcher for plan jobs.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePlanResponse, JobRecord, PlanDetailResponse, PlanDraftRow, PlanEventRecord, PlanJobInput, PlanJobResult, PlanRecord, PlanRowRecord, ProjectRecord, UsageSummary } from "@cobrac/shared";
import { DEFAULT_KEY_CATALOG_KEY, OVERLAP_LIMIT, PLAN_JOB_REASONING_EFFORT, PLAN_JOB_RESULT_SCHEMA, planJobKey, sharedAnchors } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
const s3 = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
  headStaging: vi.fn(async (key: string) => (s3.has(key) ? { size: s3.get(key)!.length } : null)),
  getStagingText: vi.fn(async (key: string) => s3.get(key) ?? null),
  movePlanAttachment: vi.fn(async (staging: string, planId: string, rel: string) => {
    s3.set(`plans/${planId}/${rel}`, s3.get(staging)!);
    s3.delete(staging);
  }),
  getPlanJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putPlanJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
  getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
}));
const runTask = vi.hoisted(() => vi.fn(async () => ({ tasks: [{ taskArn: "arn:task/plan" }] })));
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
const { handler: dispatcher } = await import("../src/handlers/dispatcher.js");
const { handler: janitor } = await import("../src/handlers/janitor.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const now = "2026-10-06T00:00:00.000Z";
const GOAL = "言語の BRA を一通りそろえたい";

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

/** The owner has a key (and its ciphertext on the user item, which must never reach a job's files). */
function user(who: typeof A, extra: Record<string, unknown> = {}) {
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, encryptedApiKey: "AQICAHhsk-SECRET-CIPHERTEXT", apiKeyLast4: "sk-9", userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}
function project(projectId: string, roi: string, tlf: string, extra: Partial<ProjectRecord> = {}) {
  fake.put("projects", { userId: A.sub, projectId, name: `${tlf} project`, roi, tlf, contributor: "Alice", status: "COMPLETED", hasArtifacts: true, currentStep: "XLSX", stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" }, activeJobId: null, codexThreadId: null, pendingQuestion: null, errorMessage: null, createdAt: now, updatedAt: now, completedAt: now, ...extra } as never);
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, tlf: string) => rowsOf(planId).find((r) => r.tlf === tlf)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const eventsOf = (planId: string) => (fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[]).sort((a, b) => (a.sk < b.sk ? -1 : 1));
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const planJobs = (planId: string) => jobs().filter((j) => j.projectId === planId && j.type === "plan");
const inputOf = (planId: string, jobId: string) => JSON.parse(s3.get(planJobKey(planId, jobId, "input.json"))!) as PlanJobInput;

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

/** What the worker does when a plan job ends: result.json, then the job's end (with its cost). */
function finishJob(planId: string, jobId: string, result: Partial<PlanJobResult>, job: Partial<JobRecord> = {}) {
  const input = inputOf(planId, jobId);
  const j = jobs().find((x) => x.jobId === jobId)!;
  const full: PlanJobResult = { schema: PLAN_JOB_RESULT_SCHEMA, kind: input.kind, planId, jobId, model: j.model ?? "", locale: input.locale, createdAt: now, rows: [], unread: [], policy: "", proposals: [], notes: "", dropped: 0, ...result };
  s3.set(planJobKey(planId, jobId, "result.json"), JSON.stringify(full));
  fake.put("jobs", { ...j, status: "COMPLETED", usage: { inputTokens: 9000, cachedInputTokens: 0, outputTokens: 1500, reasoningOutputTokens: 500 }, costUsd: 0.03, endedAt: now, ...job } as never);
}

const bna = (...lefts: number[]) => lefts.map((l) => `BNA:${l}-${l + 1}`);
/** 「言語の BRA を一通りそろえたい」: the rows a draft would write (as in packages/shared/test/planOrder.test.ts). */
const LANGUAGE: { id: string; roi: string; tlf: string; anchors: string[]; dependsOn?: string[] }[] = [
  { id: "r01", tlf: "speech production", roi: "left IFG (areas 44/45)", anchors: bna(29, 33, 35, 37, 39, 61, 63, 75, 167) },
  { id: "r02", tlf: "phonological processing", roi: "STG", anchors: bna(71, 73, 75, 79, 121, 123, 145, 29, 39) },
  { id: "new3", tlf: "repetition", roi: "arcuate fasciculus", anchors: bna(75, 145, 29, 37), dependsOn: ["r01", "r02"] },
  { id: "new4", tlf: "reading", roi: "angular gyrus / VWFA", anchors: bna(135, 107, 91, 33) },
  { id: "new5", tlf: "writing", roi: "Exner's area", anchors: bna(25, 139, 57) },
  { id: "new6", tlf: "semantic comprehension", roi: "MTG", anchors: bna(81, 83, 87, 35) },
  { id: "new7", tlf: "naming", roi: "MTG / ITG", anchors: bna(83, 89, 33) },
  { id: "new8", tlf: "auditory word recognition", roi: "STG / pSTS", anchors: bna(73, 79, 121, 81) },
  { id: "new9", tlf: "verbal working memory", roi: "IPL / IFG", anchors: bna(145, 29, 17) },
  { id: "new10", tlf: "syntactic processing", roi: "IFG pars opercularis / pSTS", anchors: bna(37, 39, 123) },
  { id: "new11", tlf: "articulatory planning", roi: "ventral precentral gyrus / insula", anchors: bna(61, 63, 167) },
  { id: "new12", tlf: "prosody", roi: "anterior STG", anchors: bna(79, 77) },
];
const POLICY = "neocortex = area × projection class, subcortex = nucleus";

/** The draft result for LANGUAGE: the two input rows by their row IDs (`r01`, `r02` stand for them), ten new rows. */
function languageResult(ids: { r01: string; r02: string }): Partial<PlanJobResult> {
  const id = (x: string) => (x === "r01" ? ids.r01 : x === "r02" ? ids.r02 : x);
  const rows: PlanDraftRow[] = LANGUAGE.map((r, i) => ({
    id: id(r.id),
    ref: r.id.startsWith("r0") ? id(r.id) : null,
    roi: r.roi,
    tlf: r.tlf,
    rationale: `Rationale of ${r.tlf}.`,
    // one anchor that is not a SABRA anchor (dropped)
    anchors: i === 3 ? [...r.anchors, "Broca"] : r.anchors,
    // one dependency on a row that is not in the draft (dropped)
    dependsOn: [...(r.dependsOn ?? []).map(id), ...(i === 4 ? ["new99"] : [])],
    priority: i === 0 ? 2 : null,
    // the job names a finished project that covers the row under another ROI wording
    existingProjectId: r.tlf === "semantic comprehension" ? "psemant1" : null,
    source: i < 2 ? "goal" : "capabilities.xlsx row " + (i + 1),
  }));
  return { rows, policy: POLICY, unread: [{ source: "capabilities.xlsx", location: "Sheet1!A14", reason: "not a brain function" }], dropped: 1 };
}

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  for (const f of Object.values(aws)) if (vi.isMockFunction(f)) f.mockClear();
  runTask.mockClear();
  user(A);
  user(ADMIN, { role: "admin" });
});

describe("plans: drafting with the plan job", () => {
  it("queues nothing while no slot is free, then exactly one plan job, with no key material in its input", async () => {
    // another job of the owner holds the only slot (deployment limits: 1 per user)
    fake.put("jobs", { projectId: "pbusy001", jobId: "job_busy", userId: A.sub, type: "initial", status: "RUNNING", createdAt: now, updatedAt: now } as never);
    const created = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL }));
    const planId = created.plan.planId;
    const p = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/draft`, { locale: "ja" }));
    expect(p).toMatchObject({ status: "DRAFTING", draft: { kind: "draft", status: "waiting", jobId: null, requestedBy: A.sub, locale: "ja" } });
    await advancePlan(planId);
    expect(planJobs(planId)).toEqual([]);
    expect(aws.enqueueRun).not.toHaveBeenCalled();
    expect(eventsOf(planId).map((e) => e.type)).toEqual(["created", "draft_requested"]);
    // rows cannot change, the plan cannot be confirmed, and a second draft is not queued meanwhile
    expect(await status(call(A, "PUT", `/plans/${planId}/rows`, { rows: [{ roi: "STG", tlf: "hearing" }] }))).toBe(409);
    expect(await status(call(A, "POST", `/plans/${planId}/confirm`, {}))).toBe(409);
    expect(await status(call(A, "POST", `/plans/${planId}/draft`, {}))).toBe(409);
    expect(await status(call(A, "DELETE", `/plans/${planId}`))).toBe(409);

    // the slot frees up: one plan job
    fake.put("jobs", { ...jobs().find((j) => j.jobId === "job_busy")!, status: "COMPLETED" } as never);
    const r = await advancePlan(planId);
    expect(r.planJob).toBeTruthy();
    await advancePlan(planId);
    const [job] = planJobs(planId);
    expect(planJobs(planId)).toHaveLength(1);
    expect(job).toMatchObject({ projectId: planId, planId, userId: A.sub, type: "plan", planJobKind: "draft", status: "QUEUED", keySource: "own", reasoningEffort: PLAN_JOB_REASONING_EFFORT, locale: "ja" });
    expect(job.model).toBeTruthy();
    expect(planOf(planId).draft).toMatchObject({ status: "queued", jobId: job.jobId });
    expect(aws.enqueueRun).toHaveBeenCalledTimes(1);
    expect(aws.enqueueRun).toHaveBeenCalledWith({ version: 1, userId: A.sub, projectId: planId, jobId: job.jobId, mode: "plan" });
    const input = inputOf(planId, job.jobId);
    expect(input).toMatchObject({ kind: "draft", planId, jobId: job.jobId, goal: GOAL, locale: "ja", rows: [], attachments: [], wave: null, concurrency: 1 });
    for (const text of [s3.get(planJobKey(planId, job.jobId, "input.json"))!, JSON.stringify(job), JSON.stringify(vi.mocked(aws.enqueueRun).mock.calls)]) {
      expect(text).not.toMatch(/apiKey|encrypted|sk-|CIPHERTEXT/i);
    }
  });

  it("writes about 12 rows with anchors, one policy, seed rows in their own waves and no overlaps inside a wave", async () => {
    await setLimits(4, 4);
    project("pprosody", "anterior STG", "prosody");
    project("pnaming1", "MTG / ITG", "naming", { status: "RUNNING", hasArtifacts: false, completedAt: null });
    project("pdeleted", "MTG", "semantic comprehension", { deletedAt: now });
    project("psemant1", "middle temporal gyrus", "semantic comprehension");
    const created = await json<CreatePlanResponse>(
      call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true, rows: [{ roi: "left IFG (areas 44/45)", tlf: "speech production" }, { roi: "STG", tlf: "phonological processing" }] }),
    );
    const planId = created.plan.planId;
    expect(created.plan).toMatchObject({ status: "DRAFTING", draft: { status: "queued" } });
    const [job] = planJobs(planId);
    const input = inputOf(planId, job.jobId);
    expect(input.rows.map((r) => r.tlf)).toEqual(["speech production", "phonological processing"]);
    // the owner's projects (not deleted), so the job can tell what exists
    expect(input.projects.map((p) => [p.projectId, p.completed]).sort()).toEqual([
      ["pnaming1", false],
      ["pprosody", true],
      ["psemant1", true],
    ]);
    // the worker starts the job
    fake.put("jobs", { ...job, status: "RUNNING" } as never);
    await advancePlan(planId);
    expect(planOf(planId).draft!.status).toBe("running");

    const ids = { r01: rowOf(planId, "speech production").rowId, r02: rowOf(planId, "phonological processing").rowId };
    finishJob(planId, job.jobId, languageResult(ids));
    await advancePlan(planId);
    const plan = planOf(planId);
    expect(plan).toMatchObject({ status: "DRAFT", ordering: "auto", policy: POLICY, rowCount: 12, draft: { status: "done", unread: [{ source: "capabilities.xlsx", location: "Sheet1!A14", reason: "not a brain function" }], dropped: 3 } });
    expect(eventsOf(planId).at(-1)).toMatchObject({ type: "draft_applied", detail: { rows: 12, added: 10, unread: 1, dropped: 3 } });

    const rows = rowsOf(planId);
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      expect(r.roi && r.tlf && r.rationale).toBeTruthy();
      expect(r.anchors!.length).toBeGreaterThan(0);
      expect(r.anchorsSource).toBe("predicted");
    }
    expect(rows.filter((r) => r.source === "llm")).toHaveLength(10);
    expect(rowOf(planId, "speech production")).toMatchObject({ source: "manual", priority: 2, rationale: "Rationale of speech production." });
    expect(rowOf(planId, "reading").anchors).not.toContain("Broca");
    // dependencies point at row IDs, and come first
    const repetition = rowOf(planId, "repetition");
    expect(repetition.dependsOn!.sort()).toEqual([ids.r01, ids.r02].sort());
    expect(repetition.wave).toBeGreaterThan(Math.max(rowOf(planId, "speech production").wave, rowOf(planId, "phonological processing").wave));
    // the owner's finished project covers prosody; naming is being built elsewhere (a warning)
    expect(rowOf(planId, "prosody")).toMatchObject({ existing: { projectId: "pprosody", name: "prosody project" }, seed: false });
    expect(rowOf(planId, "naming")).toMatchObject({ existing: null, duplicateOf: "pnaming1" });
    expect(rowOf(planId, "semantic comprehension")).toMatchObject({ existing: { projectId: "psemant1" }, duplicateOf: null });
    expect(rowOf(planId, "auditory word recognition")).toMatchObject({ existing: null, duplicateOf: null });

    // 1–3 seed rows, each alone in one of the first waves; body waves within the concurrency and without overlaps
    const built = rows.filter((r) => !r.existing);
    const seeds = built.filter((r) => r.seed).sort((a, b) => a.wave - b.wave);
    expect(seeds.length).toBeGreaterThanOrEqual(1);
    expect(seeds.length).toBeLessThanOrEqual(3);
    expect(seeds.map((r) => r.wave)).toEqual(seeds.map((_, i) => i + 1));
    for (const s of seeds) expect(built.filter((r) => r.wave === s.wave)).toHaveLength(1);
    expect(seeds[0].tlf).toBe("speech production");
    const waves = new Map<number, PlanRowRecord[]>();
    for (const r of built) waves.set(r.wave, [...(waves.get(r.wave) ?? []), r]);
    for (const members of waves.values()) {
      expect(members.length).toBeLessThanOrEqual(4);
      for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) expect(sharedAnchors(members[i].anchors, members[j].anchors)).toBeLessThan(OVERLAP_LIMIT);
    }
    // order follows the waves (rows of a wave start in this order)
    const byOrder = [...built].sort((a, b) => a.order - b.order);
    expect(byOrder.map((r) => r.wave)).toEqual([...byOrder.map((r) => r.wave)].sort((a, b) => a - b));

    // the screen: hub scores, overlaps, the estimate with seeds, and the cost of the draft
    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(d.estimate).toMatchObject({ rows: 10, seedRows: seeds.length, concurrency: 4 });
    expect(d.planJobsCostUsd).toBeCloseTo(0.03);
    expect(d.actual.costUsd).toBeCloseTo(0.03);
    expect(d.proposals).toEqual([]);
    const view = d.rows.find((r) => r.tlf === "repetition")!;
    expect(view.hub).toBeGreaterThan(0);
    expect(view.overlaps!.sort()).toEqual([ids.r01, ids.r02, rowOf(planId, "verbal working memory").rowId].sort());
    expect(d.rows.find((r) => r.tlf === "speech production")!.hub).toBe(8);

    // the draft is in the owner's usage like any job
    const usage = await json<UsageSummary>(call(A, "GET", "/users/me/usage"));
    expect(usage.costUsd).toBeCloseTo(0.03);
    expect(usage.totals.inputTokens).toBe(9000);
    expect(usage.byModel).toEqual([expect.objectContaining({ model: job.model, jobs: 1 })]);

    // confirmation: the row an existing project covers is done, the first seed starts alone
    const confirmed = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/confirm`, { locale: "ja" }));
    expect(confirmed.estimate).toMatchObject({ rows: 10, seedRows: seeds.length });
    expect(rowOf(planId, "prosody")).toMatchObject({ state: "done", projectId: "pprosody" });
    expect(rowOf(planId, "semantic comprehension")).toMatchObject({ state: "done", projectId: "psemant1" });
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.tlf)).toEqual(["speech production"]);
  });

  it("goes back to an editable draft with the error when the job fails or its result cannot be read", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true }))).plan.planId;
    const [job] = planJobs(planId);
    fake.put("jobs", { ...job, status: "FAILED", errorMessage: "The plan job took longer than its time budget" } as never);
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", draft: { status: "failed", error: "The plan job took longer than its time budget" } });
    expect(eventsOf(planId).at(-1)!.type).toBe("draft_failed");

    // again: the job completes without a readable result
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    const second = planJobs(planId).find((j) => j.jobId !== job.jobId)!;
    fake.put("jobs", { ...second, status: "COMPLETED" } as never);
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", draft: { status: "failed", jobId: second.jobId } });
    expect(planOf(planId).draft!.error).toMatch(/could not be read/);
    expect(rowsOf(planId)).toEqual([]);
  });

  it("needs a key to run jobs with, and the chosen model", async () => {
    user(A, { apiKeyRegistered: false, encryptedApiKey: "" });
    expect(await status(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true }))).toBe(400);
    expect(fake.items("plans")).toEqual([]);
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL }))).plan.planId;
    expect(await status(call(A, "POST", `/plans/${planId}/draft`, {}))).toBe(400);
    expect(planOf(planId).status).toBe("DRAFT");

    // the default API key with a restricted model list: a model outside it is refused
    fake.put("catalog", { ...DEFAULT_KEY_CATALOG_KEY, encryptedApiKey: "AQICAHh", last4: "abcd", updatedAt: now } as never);
    user(A, { apiKeyRegistered: false, encryptedApiKey: "", orgAccess: { tier: 1, approvedAt: now, approvedBy: ADMIN.sub } });
    await json(call(A, "PUT", `/plans/${planId}`, { settings: { model: "custom-model" } }));
    expect(await status(call(A, "POST", `/plans/${planId}/draft`, {}))).toBe(403);

    // a draft that waits while the owner loses the key ends with the reason, without a job
    user(A);
    await json(call(A, "PUT", `/plans/${planId}`, { settings: { model: null } }));
    fake.put("jobs", { projectId: "pbusy001", jobId: "job_busy", userId: A.sub, type: "initial", status: "RUNNING", createdAt: now, updatedAt: now } as never);
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    user(A, { apiKeyRegistered: false, encryptedApiKey: "" });
    fake.put("jobs", { ...jobs().find((j) => j.jobId === "job_busy")!, status: "COMPLETED" } as never);
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", draft: { status: "failed" } });
    expect(planOf(planId).draft!.error).toMatch(/API key/);
    expect(planJobs(planId)).toEqual([]);
  });

  it("cancels a draft: its job and task are stopped and the rows can be edited again", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true, rows: [{ roi: "STG", tlf: "hearing" }] }))).plan.planId;
    const [job] = planJobs(planId);
    fake.put("jobs", { ...job, status: "RUNNING", ecsTaskArn: "arn:task/draft" } as never);
    const p = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/draft/cancel`));
    expect(p).toMatchObject({ status: "DRAFT", draft: { status: "cancelled" } });
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", draft: { status: "cancelled", jobId: job.jobId } });
    expect(jobs().find((j) => j.jobId === job.jobId)!.status).toBe("CANCELLED");
    expect(aws.stopEcsTask).toHaveBeenCalledWith("arn:task/draft", "cancelled by user");
    expect(eventsOf(planId).at(-1)!.type).toBe("draft_cancelled");
    expect(await status(call(A, "POST", `/plans/${planId}/draft/cancel`))).toBe(409);
    // a result that arrives later changes nothing
    finishJob(planId, job.jobId, { rows: [], policy: "late" });
    await advancePlan(planId);
    expect(planOf(planId).policy).toBeUndefined();
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: [{ roi: "STG", tlf: "hearing" }, { roi: "MTG", tlf: "comprehension" }] }));
    expect(rowsOf(planId)).toHaveLength(2);
  });

  it("counts a queued plan job toward the limits", async () => {
    const draft = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true }))).plan.planId;
    expect(planJobs(draft)).toHaveLength(1);
    const other = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Other", rows: [{ roi: "A", tlf: "a" }] }))).plan.planId;
    await json(call(A, "POST", `/plans/${other}/confirm`, {}));
    // deployment limits (1 per user): the queued plan job holds the owner's slot
    expect(rowOf(other, "a").state).toBe("pending");
    expect(fake.items("projects")).toEqual([]);
    fake.put("jobs", { ...planJobs(draft)[0], status: "FAILED", errorMessage: "boom" } as never);
    await advancePlan(other);
    expect(rowOf(other, "a").state).toBe("running");
  });
});

describe("plans: capability lists attached at creation", () => {
  const staged = (uploadId: string, name: string, text: string) => s3.set(`staging/${A.sub}/${uploadId}/${name}`, text);

  it("reads CSV / TSV / text at once, stores xlsx and PDF for the draft job, and refuses other types", async () => {
    staged("up_csv00001", "capabilities.csv", "ROI,TLF,理由\nleft IFG,speech production,hub\n,,only a note\nSTG,phonological processing,\n");
    staged("up_txt00001", "more.txt", "reading\nwriting\nspeech production\n");
    staged("up_xls00001", "list.xlsx", "PK-binary");
    staged("up_doc00001", "notes.docx", "PK-binary");
    expect(await status(call(A, "POST", "/plans", { name: "Language", attachments: [{ uploadId: "up_doc00001", name: "notes.docx" }] }))).toBe(400);
    expect(await status(call(A, "POST", "/plans", { name: "Language", attachments: [{ uploadId: "up_none0001", name: "gone.csv" }] }))).toBe(400);
    expect(fake.items("plans")).toEqual([]);

    const r = await json<CreatePlanResponse>(
      call(A, "POST", "/plans", {
        name: "Language",
        goal: GOAL,
        attachments: [
          { uploadId: "up_csv00001", name: "capabilities.csv" },
          { uploadId: "up_xls00001", name: "list.xlsx" },
          { uploadId: "up_txt00001", name: "more.txt" },
        ],
      }),
    );
    const planId = r.plan.planId;
    expect(r.rows.map((x) => [x.roi, x.tlf, x.source, x.sourceRow])).toEqual([
      ["left IFG", "speech production", "csv", 2],
      ["STG", "phonological processing", "csv", 4],
      ["", "reading", "csv", 1],
      ["", "writing", "csv", 2],
      ["", "speech production", "csv", 3],
    ]);
    expect(r.rejected).toEqual([{ file: "capabilities.csv", row: 3, reason: "noRoiTlf", text: "only a note" }]);
    expect(r.plan.attachments).toEqual([
      { kind: "file", id: "f1", name: "capabilities.csv", key: "attachments/files/01-capabilities.csv", size: expect.any(Number), contentType: "text/csv" },
      { kind: "file", id: "f2", name: "list.xlsx", key: "attachments/files/02-list.xlsx", size: 9, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { kind: "file", id: "f3", name: "more.txt", key: "attachments/files/03-more.txt", size: expect.any(Number), contentType: "text/plain" },
    ]);
    expect(s3.get(`plans/${planId}/attachments/files/02-list.xlsx`)).toBe("PK-binary");
    expect(s3.has(`staging/${A.sub}/up_xls00001/list.xlsx`)).toBe(false);
    expect(planJobs(planId)).toEqual([]);

    // the draft job reads only what the API could not
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    const [job] = planJobs(planId);
    expect(inputOf(planId, job.jobId).attachments).toEqual([{ id: "f2", name: "list.xlsx", key: "attachments/files/02-list.xlsx" }]);
    expect(inputOf(planId, job.jobId).rows).toHaveLength(5);
  });
});

describe("plans: order without the LLM, and manual edits", () => {
  it("orders a draft by its anchors, keeps the stage-2 fields on edit, and rebuilds an existing row on request", async () => {
    await setLimits(4, 4);
    project("pprosody", "anterior STG", "prosody");
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: LANGUAGE.map((r) => ({ roi: r.roi, tlf: r.tlf })) }))).plan.planId;
    // a typed row with the ROI × TLF of a finished project is marked existing at once
    expect(rowOf(planId, "prosody").existing).toEqual({ projectId: "pprosody", name: "prosody project" });
    for (const l of LANGUAGE) fake.put("plans", { ...rowOf(planId, l.tlf), anchors: l.anchors, anchorsSource: "predicted" } as never);
    const ordered = await json<{ plan: PlanRecord; rows: PlanRowRecord[] }>(call(A, "POST", `/plans/${planId}/order`));
    expect(ordered.plan.ordering).toBe("auto");
    expect(planOf(planId).ordering).toBe("auto");
    expect(rowOf(planId, "speech production")).toMatchObject({ seed: true, wave: 1 });
    expect(rowOf(planId, "phonological processing")).toMatchObject({ seed: true, wave: 2 });
    expect(eventsOf(planId).at(-1)).toMatchObject({ type: "ordered", detail: { rows: 12, seeds: 2 } });

    // a manual edit keeps the owner's waves and the rows' anchors; rebuild drops the existing project
    const rows = ordered.rows.map((r) => ({ rowId: r.rowId, roi: r.roi, tlf: r.tlf, wave: r.wave, ...(r.tlf === "prosody" ? { rebuild: true } : {}) }));
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows }));
    expect(planOf(planId).ordering).toBe("manual");
    expect(rowOf(planId, "speech production")).toMatchObject({ seed: true, wave: 1, anchors: LANGUAGE[0].anchors, anchorsSource: "predicted" });
    expect(rowOf(planId, "prosody").existing).toBeNull();
    // a new row matching a finished project is existing
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: rowsOf(planId).filter((r) => r.tlf !== "prosody").map((r) => ({ rowId: r.rowId, roi: r.roi, tlf: r.tlf, wave: r.wave })).concat([{ roi: "anterior STG", tlf: "prosody" } as never]) }));
    expect(rowOf(planId, "prosody").existing).toMatchObject({ projectId: "pprosody" });
    expect(rowOf(planId, "prosody").anchors).toBeUndefined();

    // waves of an automatic order at concurrency 1 may go past 99, and are kept when saved
    await setLimits(1, 1);
    await json(call(A, "POST", `/plans/${planId}/order`));
    const many = rowsOf(planId).map((r) => ({ rowId: r.rowId, roi: r.roi, tlf: r.tlf, wave: r.wave === 1 ? 1 : r.wave + 90 }));
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: many }));
    expect(Math.max(...rowsOf(planId).map((r) => r.wave))).toBeGreaterThan(99);
    expect(await status(call(A, "PUT", `/plans/${planId}/rows`, { rows: [{ roi: "A", tlf: "a", wave: 201 }] }))).toBe(400);
  });

  it("edits the policy of a draft only", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: [{ roi: "A", tlf: "a" }] }))).plan.planId;
    const p = await json<PlanRecord>(call(A, "PUT", `/plans/${planId}`, { policy: `  ${POLICY}\r\n  ` }));
    expect(p.policy).toBe(POLICY);
    expect(planOf(planId).policy).toBe(POLICY);
    expect(await status(call(A, "PUT", `/plans/${planId}`, { policy: "x".repeat(2001) }))).toBe(400);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(await status(call(A, "PUT", `/plans/${planId}`, { policy: "other" }))).toBe(409);
    expect(planOf(planId).policy).toBe(POLICY);
  });
});

describe("plan jobs outside the API", () => {
  it("the janitor fails a stale or long-queued plan job without retrying it, and the runner ends the draft with it", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true }))).plan.planId;
    const [job] = planJobs(planId);
    const old = "2020-01-01T00:00:00.000Z";
    fake.put("jobs", { ...job, status: "RUNNING", lastHeartbeat: old } as never);
    const queued = { ...job, jobId: "job_queued", status: "QUEUED", createdAt: old, updatedAt: old };
    fake.put("jobs", queued as never);
    vi.mocked(aws.enqueueRun).mockClear();
    await janitor();
    expect(jobs().find((j) => j.jobId === job.jobId)).toMatchObject({ status: "FAILED", errorMessage: "The worker stopped responding." });
    expect(jobs().find((j) => j.jobId === "job_queued")).toMatchObject({ status: "FAILED", errorMessage: "No worker could be started within 24 hours." });
    expect(jobs()).toHaveLength(2);
    expect(aws.enqueueRun).not.toHaveBeenCalled();
    expect(fake.items("projects")).toEqual([]);
    expect(fake.items("messages")).toEqual([]);
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", draft: { status: "failed", error: "The worker stopped responding." } });
  });

  it("the dispatcher starts a plan job without a project message or status", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true }))).plan.planId;
    const [job] = planJobs(planId);
    await dispatcher({ Records: [{ messageId: "m1", body: JSON.stringify({ version: 1, userId: A.sub, projectId: planId, jobId: job.jobId, mode: "plan" }) }] } as never);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(jobs().find((j) => j.jobId === job.jobId)).toMatchObject({ ecsTaskArn: "arn:task/plan", status: "QUEUED" });
    expect(fake.items("messages")).toEqual([]);
    expect(fake.items("projects")).toEqual([]);
  });
});
