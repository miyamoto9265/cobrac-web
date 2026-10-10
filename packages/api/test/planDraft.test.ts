// BRA Planner stage 2: drafts written by the `plan` job, capability lists attached at creation, the automatic order,
// existing projects, plan jobs and the limits, the janitor and the dispatcher for plan jobs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePlanResponse, PlanAttachmentsResponse, JobRecord, PlanDetailResponse, PlanDraftRow, PlanEventRecord, PlanJobInput, PlanJobResult, PlanRecord, PlanRowRecord, ProjectRecord, UsageSummary } from "@cobrac/shared";
import { DEFAULT_KEY_CATALOG_KEY, OVERLAP_LIMIT, PLAN_JOB_REASONING_EFFORT, PLAN_JOB_RESULT_SCHEMA, byWaveAndOrder, planJobKey, planPolicyOf, sharedAnchors } from "@cobrac/shared";

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
  deletePlanAttachment: vi.fn(async (planId: string, rel: string) => void s3.delete(`plans/${planId}/${rel}`)),
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
const { planJobInput } = await import("../src/lib/planJobs.js");
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
const eventsOf = (planId: string) => (fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[]).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
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
    // the reply schema always gives an integer (0 by default)
    priority: i === 0 ? 2 : 0,
    // the job names a finished project that covers the row under another ROI wording
    existingProjectId: r.tlf === "semantic comprehension" ? "psemant1" : null,
    source: i < 2 ? "goal" : "capabilities.xlsx row " + (i + 1),
  }));
  return { rows, policy: POLICY, unread: [{ source: "capabilities.xlsx", location: "Sheet1!A14", reason: "not a brain function" }], dropped: 1 };
}

/** Runs `before` ahead of the DynamoDB calls it picks (it may make calls of its own); undone after each test. */
function intercept(before: (cmd: { kind: string; input: Record<string, unknown> }) => Promise<void> | void) {
  const send = fake.send.bind(fake);
  fake.send = (async (cmd: { kind: string; input: Record<string, unknown> }) => {
    await before(cmd);
    return send(cmd as never);
  }) as typeof fake.send;
}

afterEach(() => {
  delete (fake as { send?: unknown }).send;
});

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
    expect(plan).toMatchObject({ status: "DRAFT", ordering: "auto", policy: planPolicyOf(POLICY), rowCount: 12, draft: { status: "done", unread: [{ source: "capabilities.xlsx", location: "Sheet1!A14", reason: "not a brain function" }], dropped: 3 } });
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

    // confirmation: the row an existing project covers is done; the plan runs as a flow, so the first seed starts with
    // the rows that share no anchor with any seed (writing), while the rows around the seeds wait for them
    const confirmed = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/confirm`, { locale: "ja" }));
    expect(confirmed.estimate).toMatchObject({ rows: 10, seedRows: seeds.length });
    expect(confirmed.scheduling).toBe("flow");
    expect(rowOf(planId, "prosody")).toMatchObject({ state: "done", projectId: "pprosody" });
    expect(rowOf(planId, "semantic comprehension")).toMatchObject({ state: "done", projectId: "psemant1" });
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.tlf)).toEqual(["speech production", "writing"]);
    const after = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(after.rows.find((r) => r.tlf === "phonological processing")!.wait).toMatchObject({ kind: "seed" });
    expect(after.rows.find((r) => r.tlf === "repetition")!.wait).toMatchObject({ kind: "dependency" });
    expect(after.rows.every((r) => r.state === "skipped" || typeof r.lane === "number")).toBe(true);
    expect(after.slots).toMatchObject({ used: 2, orchestrator: 0, limit: 4 });
  });

  it("asks for the draft only once every row is stored: a runner step during the writes queues nothing", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ roi: `R${i}`, tlf: `F${i}` }));
    const steps: Awaited<ReturnType<typeof advancePlan>>[] = [];
    let puts = 0;
    intercept(async (cmd) => {
      const item = cmd.input.Item as Record<string, unknown> | undefined;
      // the scheduled runner arrives while the third row is written
      if (cmd.kind === "Put" && item && String(item.sk).startsWith("ROW#") && ++puts === 3) steps.push(await advancePlan(String(item.planId)));
    });
    const created = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, draft: true, rows }));
    const planId = created.plan.planId;
    expect(steps).toEqual([expect.objectContaining({ skipped: "inactive", status: "DRAFT" })]);
    const [job] = planJobs(planId);
    expect(planJobs(planId)).toHaveLength(1);
    expect(inputOf(planId, job.jobId).rows.map((r) => r.tlf)).toEqual(rows.map((r) => r.tlf));
    expect(created.plan).toMatchObject({ status: "DRAFTING", draft: { status: "queued", jobId: job.jobId } });
    expect(eventsOf(planId).map((e) => e.type)).toEqual(["created", "draft_requested"]);
  });

  it("keeps the owner's priorities: the job sees them, and the draft fills in only missing ones", async () => {
    const csv = "roi,tlf,priority\nleft IFG (areas 44/45),speech production,50\nSTG,phonological processing,-10\nMTG / ITG,naming,\n";
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, csv, draft: true }))).plan.planId;
    const [job] = planJobs(planId);
    expect(inputOf(planId, job.jobId).rows.map((r) => [r.tlf, r.priority, r.dependsOn, r.rebuild])).toEqual([
      ["speech production", 50, [], false],
      ["phonological processing", -10, [], false],
      ["naming", null, [], false],
    ]);
    // the reply gives every input row a priority (0 is the schema's default)
    const reply = (tlf: string, priority: number, dependsOn: string[] = []): PlanDraftRow => {
      const r = rowOf(planId, tlf);
      return { id: r.rowId, ref: r.rowId, roi: r.roi, tlf, rationale: "", anchors: [], dependsOn, priority, existingProjectId: null, source: "capabilities.csv" };
    };
    finishJob(planId, job.jobId, { rows: [reply("speech production", 0), reply("phonological processing", 0), reply("naming", 3, [rowOf(planId, "speech production").rowId])], policy: POLICY });
    await advancePlan(planId);
    expect(planOf(planId).status).toBe("DRAFT");
    expect(rowOf(planId, "speech production").priority).toBe(50);
    expect(rowOf(planId, "phonological processing").priority).toBe(-10);
    expect(rowOf(planId, "naming").priority).toBe(3);

    // a second draft sees the dependencies the first one gave
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    const second = planJobs(planId).find((j) => j.jobId !== job.jobId)!;
    expect(inputOf(planId, second.jobId).rows.find((r) => r.tlf === "naming")).toMatchObject({ priority: 3, dependsOn: [rowOf(planId, "speech production").rowId] });
  });

  it("keeps 「作り直す」: the row is built, and a new draft does not mark it existing again", async () => {
    project("pprosody", "anterior STG", "prosody");
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, rows: [{ roi: "left IFG (areas 44/45)", tlf: "speech production" }, { roi: "anterior STG", tlf: "prosody" }] }))).plan.planId;
    expect(rowOf(planId, "prosody").existing).toMatchObject({ projectId: "pprosody" });
    const edit = (rebuild?: boolean) =>
      rowsOf(planId)
        .sort(byWaveAndOrder)
        .map((r) => ({ rowId: r.rowId, roi: r.roi, tlf: r.tlf, wave: r.wave, ...(r.tlf === "prosody" && rebuild !== undefined ? { rebuild } : {}) }));
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit(true) }));
    expect(rowOf(planId, "prosody")).toMatchObject({ rebuild: true, existing: null, duplicateOf: null });
    // saved again without the flag: the choice stays
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit() }));
    expect(rowOf(planId, "prosody")).toMatchObject({ rebuild: true, existing: null });
    // only an explicit false undoes it: the row is matched again
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit(false) }));
    expect(rowOf(planId, "prosody").rebuild).toBeUndefined();
    expect(rowOf(planId, "prosody").existing).toMatchObject({ projectId: "pprosody" });
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit(true) }));

    // a new draft: the job is told, and naming the finished project does not undo the choice
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    const [job] = planJobs(planId);
    expect(inputOf(planId, job.jobId).rows.find((r) => r.tlf === "prosody")).toMatchObject({ rebuild: true, existing: false, projectId: null });
    const reply = (tlf: string, anchors: string[], existingProjectId: string | null): PlanDraftRow => {
      const r = rowOf(planId, tlf);
      return { id: r.rowId, ref: r.rowId, roi: r.roi, tlf, rationale: "", anchors, dependsOn: [], priority: 0, existingProjectId, source: "goal" };
    };
    finishJob(planId, job.jobId, { rows: [reply("speech production", bna(29, 33), null), reply("prosody", bna(79, 77), "pprosody")], policy: POLICY });
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", ordering: "auto" });
    expect(rowOf(planId, "prosody")).toMatchObject({ rebuild: true, existing: null, anchors: bna(79, 77) });

    // confirmed: the row is built, not done by the finished project
    await setLimits(4, 4);
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(rowOf(planId, "prosody")).toMatchObject({ state: "running", existing: null });
    expect(rowOf(planId, "prosody").projectId).not.toBe("pprosody");
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

  it("runs its own jobs on the Orchestrator's model and the rows on the Agents' model", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL, rows: [{ roi: "left IFG", tlf: "speech production" }] }))).plan.planId;
    const p = await json<PlanRecord>(call(A, "PUT", `/plans/${planId}`, { settings: { model: "agents-model", orchestratorModel: "orchestrator-model" } }));
    expect(p.settings).toMatchObject({ model: "agents-model", modelChosen: true, orchestratorModel: "orchestrator-model", orchestratorModelChosen: true });
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    await advancePlan(planId);
    const [job] = planJobs(planId);
    expect(job).toMatchObject({ type: "plan", planJobKind: "draft", model: "orchestrator-model" });
    finishJob(planId, job.jobId, { rows: [], policy: POLICY });
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", policy: planPolicyOf(POLICY) });
    const confirmed = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(confirmed.settings).toMatchObject({ model: "agents-model", orchestratorModel: "orchestrator-model" });
    const project = fake.items("projects").find((x) => x.planId === planId) as unknown as ProjectRecord;
    expect(project.model).toBe("agents-model");
    // the row's agent gets the plan's policy as it was when the row started
    expect(project.planPolicy).toEqual(planPolicyOf(POLICY));
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
    // the reason as a code, so the page can say it in the owner's language
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", draft: { status: "failed", errorCode: "no_key" } });
    expect(planOf(planId).draft!.error).toMatch(/API key/);
    expect(planJobs(planId)).toEqual([]);

    // a new request starts without the old reason
    user(A);
    await json(call(A, "POST", `/plans/${planId}/draft`, {}));
    expect(planOf(planId).draft).toMatchObject({ status: "queued", error: null, errorCode: null });
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
    // a re-plan job works from the rows: it gets no files to read
    const rows = rowsOf(planId);
    const replan = planJobInput(planOf(planId), { kind: "replan", jobId: "job_r", rows, projects: [], canons: [], concurrency: 1, wave: 1, locale: null });
    expect(replan.attachments).toEqual([]);
    expect(planJobInput(planOf(planId), { kind: "draft", jobId: "job_d", rows, projects: [], canons: [], concurrency: 1, wave: null, locale: null }).attachments).toHaveLength(1);
  });

  it("accepts file names with inner dots", async () => {
    staged("up_csv00002", "capabilities..v2.csv", "roi,tlf\nSTG,phonological processing\n");
    staged("up_pdf00002", "list...pdf", "%PDF-1.7");
    const r = await json<CreatePlanResponse>(
      call(A, "POST", "/plans", { name: "Language", attachments: [{ uploadId: "up_csv00002", name: "capabilities..v2.csv" }, { uploadId: "up_pdf00002", name: "list...pdf" }] }),
    );
    expect(r.rows.map((x) => x.tlf)).toEqual(["phonological processing"]);
    expect(r.plan.attachments!.map((a) => a.key)).toEqual(["attachments/files/01-capabilities..v2.csv", "attachments/files/02-list...pdf"]);
    expect(s3.get(`plans/${r.plan.planId}/attachments/files/02-list...pdf`)).toBe("%PDF-1.7");
  });
});

describe("plans: something to build, and capability lists added to a draft", () => {
  const staged = (uploadId: string, name: string, text: string) => s3.set(`staging/${A.sub}/${uploadId}/${name}`, text);

  it("refuses a plan with neither a goal, capability lists nor rows", async () => {
    expect(await status(call(A, "POST", "/plans", { name: "Empty" }))).toBe(400);
    expect(await status(call(A, "POST", "/plans", { name: "Empty", goal: "  " }))).toBe(400);
    expect(fake.items("plans")).toEqual([]);
    expect((await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Goal only", goal: GOAL }))).rows).toEqual([]);
  });

  it("adds capability lists to a draft (CSV read at once), removes one, and refuses both once the plan is no draft", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: GOAL }))).plan.planId;
    staged("up_csv00003", "capabilities.csv", "ROI,TLF\nleft IFG,speech production\n,\n");
    staged("up_pdf00003", "review.pdf", "%PDF-1.7");
    const added = await json<PlanAttachmentsResponse>(
      call(A, "POST", `/plans/${planId}/attachments`, { attachments: [{ uploadId: "up_csv00003", name: "capabilities.csv" }, { uploadId: "up_pdf00003", name: "review.pdf" }] }),
    );
    expect(added.rows.map((r) => [r.roi, r.tlf, r.source])).toEqual([["left IFG", "speech production", "csv"]]);
    expect(added.plan.attachments!.map((a) => [a.id, a.key])).toEqual([
      ["f1", "attachments/files/01-capabilities.csv"],
      ["f2", "attachments/files/02-review.pdf"],
    ]);
    expect(rowsOf(planId)).toHaveLength(1);
    expect(planOf(planId).attachments).toHaveLength(2);

    // removing keeps the rows read from it; a file added later never reuses a removed file's ID
    const removed = await json<PlanAttachmentsResponse>(call(A, "DELETE", `/plans/${planId}/attachments/f1`));
    expect(removed.plan.attachments!.map((a) => a.id)).toEqual(["f2"]);
    expect(s3.has(`plans/${planId}/attachments/files/01-capabilities.csv`)).toBe(false);
    expect(rowsOf(planId)).toHaveLength(1);
    staged("up_txt00003", "more.txt", "reading\n");
    const again = await json<PlanAttachmentsResponse>(call(A, "POST", `/plans/${planId}/attachments`, { attachments: [{ uploadId: "up_txt00003", name: "more.txt" }] }));
    expect(again.plan.attachments!.map((a) => [a.id, a.key])).toEqual([
      ["f2", "attachments/files/02-review.pdf"],
      ["f3", "attachments/files/03-more.txt"],
    ]);
    // the highest one removed: its number is not used again, and the extracted text is made anew by the next draft
    s3.set(`plans/${planId}/attachments/derived/manifest.json`, "{}");
    await json(call(A, "DELETE", `/plans/${planId}/attachments/f3`));
    expect(s3.has(`plans/${planId}/attachments/derived/manifest.json`)).toBe(false);
    staged("up_txt00005", "other.txt", "listening\n");
    const fourth = await json<PlanAttachmentsResponse>(call(A, "POST", `/plans/${planId}/attachments`, { attachments: [{ uploadId: "up_txt00005", name: "other.txt" }] }));
    expect(fourth.plan.attachments!.map((a) => a.id)).toEqual(["f2", "f4"]);
    expect(await status(call(A, "DELETE", `/plans/${planId}/attachments/f9`))).toBe(404);
    expect(await status(call(A, "POST", `/plans/${planId}/attachments`, { attachments: [] }))).toBe(400);

    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    staged("up_txt00004", "late.txt", "writing\n");
    expect(await status(call(A, "POST", `/plans/${planId}/attachments`, { attachments: [{ uploadId: "up_txt00004", name: "late.txt" }] }))).toBe(409);
    expect(await status(call(A, "DELETE", `/plans/${planId}/attachments/f2`))).toBe(409);
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
    // the row an existing project covers is listed with the last wave, not next to the first seed
    const lastWave = Math.max(...rowsOf(planId).map((r) => r.wave));
    expect(lastWave).toBeGreaterThan(2);
    expect(rowOf(planId, "prosody")).toMatchObject({ wave: lastWave, seed: false });
    expect(ordered.rows.at(-1)!.tlf).toBe("prosody");

    // 「作り直す」 alone keeps the automatic order, which now places the row among the rows to build
    const edit = (patch: (r: PlanRowRecord) => Record<string, unknown> = () => ({})) =>
      rowsOf(planId)
        .sort(byWaveAndOrder)
        .map((r) => ({ rowId: r.rowId, roi: r.roi, tlf: r.tlf, rationale: r.rationale, wave: r.wave, ...patch(r) }));
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit((r) => (r.tlf === "prosody" ? { rebuild: true } : {})) }));
    expect(planOf(planId).ordering).toBe("auto");
    expect(rowOf(planId, "prosody")).toMatchObject({ rebuild: true, existing: null, duplicateOf: null, seed: false });
    expect(rowOf(planId, "prosody").wave).toBeGreaterThan(2);
    expect(rowsOf(planId).filter((r) => r.wave === 1).map((r) => r.tlf)).toEqual(["speech production"]);
    expect(rowOf(planId, "speech production")).toMatchObject({ seed: true, wave: 1, anchors: LANGUAGE[0].anchors, anchorsSource: "predicted" });
    for (const w of new Set(rowsOf(planId).map((r) => r.wave))) {
      const members = rowsOf(planId).filter((r) => r.wave === w);
      expect(members.length).toBeLessThanOrEqual(4);
      for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) expect(sharedAnchors(members[i].anchors, members[j].anchors)).toBeLessThan(OVERLAP_LIMIT);
    }
    // a rationale alone changes neither the ordering nor a wave
    const waves = Object.fromEntries(rowsOf(planId).map((r) => [r.rowId, r.wave]));
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit((r) => (r.tlf === "reading" ? { rationale: "Visual word form area to angular gyrus." } : {})) }));
    expect(planOf(planId).ordering).toBe("auto");
    expect(rowOf(planId, "reading").rationale).toBe("Visual word form area to angular gyrus.");
    expect(Object.fromEntries(rowsOf(planId).map((r) => [r.rowId, r.wave]))).toEqual(waves);
    // rows in another order are the owner's order
    const swapped = edit();
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: swapped }));
    expect(planOf(planId).ordering).toBe("manual");
    await json(call(A, "POST", `/plans/${planId}/order`));

    // a wave changed by hand: the owner's waves; a seed that shares its wave is no seed any more
    await json(call(A, "PUT", `/plans/${planId}/rows`, { rows: edit((r) => (r.tlf === "phonological processing" ? { wave: 3 } : {})) }));
    expect(planOf(planId).ordering).toBe("manual");
    expect(rowsOf(planId).filter((r) => r.wave === 3).length).toBeGreaterThan(1);
    expect(rowOf(planId, "phonological processing")).toMatchObject({ wave: 3, seed: false });
    expect(rowOf(planId, "speech production")).toMatchObject({ wave: 1, seed: true });
    expect((await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`))).estimate.seedRows).toBe(1);
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

  it("checks an existing project again at confirmation: a deleted or unfinished one no longer covers its row", async () => {
    await setLimits(4, 4);
    project("pprosody", "anterior STG", "prosody");
    project("pnaming1", "MTG / ITG", "naming");
    project("pwriting", "Exner's area", "writing");
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: LANGUAGE.map((r) => ({ roi: r.roi, tlf: r.tlf })) }))).plan.planId;
    for (const l of LANGUAGE) fake.put("plans", { ...rowOf(planId, l.tlf), anchors: l.anchors, anchorsSource: "predicted" } as never);
    await json(call(A, "POST", `/plans/${planId}/order`));
    for (const tlf of ["prosody", "naming", "writing"]) expect(rowOf(planId, tlf).existing).toBeTruthy();
    // meanwhile the owner deletes one project and starts a follow-up of another
    project("pprosody", "anterior STG", "prosody", { deletedAt: now });
    project("pnaming1", "MTG / ITG", "naming", { status: "RUNNING" });

    const confirmed = await json<PlanRecord>(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(rowOf(planId, "writing")).toMatchObject({ state: "done", projectId: "pwriting" });
    expect(rowOf(planId, "prosody")).toMatchObject({ existing: null, duplicateOf: null });
    expect(rowOf(planId, "naming")).toMatchObject({ existing: null, duplicateOf: "pnaming1" });
    for (const tlf of ["prosody", "naming"]) {
      expect(rowOf(planId, tlf).state).not.toBe("done");
      expect(["pprosody", "pnaming1"]).not.toContain(rowOf(planId, tlf).projectId);
    }
    // both are built in body waves of the automatic order, after the seeds
    const seeds = rowsOf(planId).filter((r) => r.seed).length;
    for (const tlf of ["prosody", "naming"]) expect(rowOf(planId, tlf).wave).toBeGreaterThan(seeds);
    expect(confirmed.estimate).toMatchObject({ rows: 11 });
    expect(eventsOf(planId).find((e) => e.type === "confirmed")).toMatchObject({ detail: { rows: 12, existingGone: 2 } });
  });

  it("leaves the policy to the Orchestrator: the owner cannot set it", async () => {
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: [{ roi: "A", tlf: "a" }] }))).plan.planId;
    expect(await status(call(A, "PUT", `/plans/${planId}`, { policy: POLICY }))).toBe(400);
    expect(planOf(planId).policy).toBeUndefined();
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(await status(call(A, "PUT", `/plans/${planId}`, { policy: "other" }))).toBe(400);
    expect(planOf(planId).policy).toBeUndefined();
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
