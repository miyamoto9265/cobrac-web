// 自律実行 (autonomous run): the Orchestrator acts for the owner, so a plan goes from its draft to the end without waiting
// for a person — the draft is confirmed on its own, the Orchestrator's AI answers the rows' questions (an `answer` row
// job, no limit), decides on every pull request (seeds included) and on rows that need attention or a decision (a
// `resolve` row job), re-plan proposals are applied at once, and the cost limit stops new work.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonAiReviewResult, CanonPullRequestRecord, CanonRecord, CanonRevisionRecord, CreatePlanResponse, JobRecord, MessageRecord, PlanEventRecord, PlanJobInput, PlanJobResult, PlanRecord, PlanRowRecord, ProjectRecord } from "@cobrac/shared";
import type { PlanRowJobInput } from "@cobrac/shared";
import { MAX_ROW_AUTO_RETRIES, PLAN_JOB_RESULT_SCHEMA, PLAN_ROW_JOB_RESULT_SCHEMA, canonAiReviewKey, canonPrSk, canonRevisionSk, planJobKey } from "@cobrac/shared";

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
const { autoConfirm } = await import("../src/handlers/planRunner.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");
const { planJobInput } = await import("../src/lib/planJobs.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const now = "2026-10-09T00:00:00.000Z";

function call(who: typeof A, method: string, path: string, body?: unknown) {
  const event = { requestContext: { authorizer: { jwt: { claims: who } } } };
  return app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
function user(who: typeof A, extra: Record<string, unknown> = {}) {
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, roi: string) => rowsOf(planId).find((r) => r.roi === roi)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const eventsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[];
const projectOf = (id: string) => (fake.items("projects") as unknown as ProjectRecord[]).find((p) => p.projectId === id)!;
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const jobsOf = (projectId: string) => jobs().filter((j) => j.projectId === projectId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
const messagesOf = (projectId: string) => fake.items("messages").filter((m) => m.projectId === projectId) as unknown as MessageRecord[];
const prOf = (canonId: string, no: number) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === canonPrSk(no)) as unknown as CanonPullRequestRecord;
const revOf = (canonId: string, rev: number) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === canonRevisionSk(rev)) as unknown as CanonRevisionRecord;
const canonMeta = (canonId: string) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === "META") as unknown as CanonRecord;

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

const uc = (id: string, d: string) => ({ circuitId: id, descriptor: d, names: id, roi: "internal", sourceOfId: "BNA", transmitter: "Glutamate", modulationType: "Excitatory", comments: "", interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "", outputSemantics: "" });
function workspace(ucs: ReturnType<typeof uc>[], collections: unknown[] = []) {
  return (P: string) => {
    const put = (rel: string, v: unknown) => s3.set(`users/${A.sub}/${P}/workspace/${rel}`, JSON.stringify(v));
    put(`${P}_HCD/uc.json`, { ucs, collections });
    put(`${P}_HCD/connections.json`, { bif: [], connections: [] });
    put(`${P}_HCD/references.json`, { references: [] });
    put("meta.json", { roi: "perisylvian cortex", tlf: "language", description: "x" });
  };
}
const coarse = workspace([uc("A44d(left)", "BNA:29-30/side:left")]);
/** A44d(left) as a Collection: error conflicts against a Canon where it is uniform */
const fine = workspace(
  [uc("A44d(L3.left)", "BNA:29-30/lay:L3/side:left"), uc("A44d(L5.left)", "BNA:29-30/lay:L5/side:left")],
  [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.left)", "A44d(L5.left)"], comments: "" }],
);
const own = (n: number) => workspace([uc(`R${n}(left)`, `BNA:${2 * n - 1}-${2 * n}/side:left`)]);

/** What the worker would do: the row's project completes with `content`. */
function finish(planId: string, roi: string, content: (P: string) => void, cost = 0.2) {
  const P = rowOf(planId, roi).projectId!;
  content(P);
  const p = projectOf(P);
  fake.put("projects", { ...p, status: "COMPLETED", hasArtifacts: true, revision: (p.revision ?? 0) + 1, activeJobId: null, costUsd: (p.costUsd ?? 0) + cost } as never);
  for (const j of jobs().filter((x) => x.projectId === P && ["QUEUED", "RUNNING"].includes(x.status))) fake.put("jobs", { ...j, status: "COMPLETED" } as never);
}
/** The row's agent asks a question (as the worker stores it). */
function ask(planId: string, roi: string, question = "Which reading of the ROI should I take?") {
  const P = rowOf(planId, roi).projectId!;
  const p = projectOf(P);
  fake.put("projects", { ...p, status: "WAITING_USER_INPUT", pendingQuestion: question } as never);
  const j = jobs().find((x) => x.jobId === p.activeJobId)!;
  fake.put("jobs", { ...j, status: "WAITING_USER_INPUT", pendingAnswer: null } as never);
}
/** The worker's end of a decision job: result.json with the verdict, then the job. */
function decideJob(canonId: string, verdict: "approve" | "request_changes" | "reject", extra: Record<string, unknown> = {}) {
  const j = jobs().find((x) => x.projectId === canonId && x.type === "canon-review" && x.status === "QUEUED")!;
  expect(j).toMatchObject({ reviewKind: "decide" });
  const result: CanonAiReviewResult = {
    review: { summary: "s", flags: [], verify: [], comments: [] },
    decision: { verdict, reason: `${verdict} because`, choices: [], changes: [], ...extra },
    dropped: 0,
    model: j.model ?? "m",
    locale: "ja",
    createdAt: now,
  };
  s3.set(canonAiReviewKey(canonId, j.reviewPrNo!, j.jobId, "result.json"), JSON.stringify(result));
  fake.put("jobs", { ...j, status: "COMPLETED", costUsd: 0.01 } as never);
  return j;
}

/** What the worker would do for the Orchestrator's queued job of a row: its result (completed) or a failure. */
function rowJobDone(planId: string, roi: string, decision: Record<string, unknown> | null) {
  const row = rowOf(planId, roi);
  const j = jobs().find((x) => x.projectId === planId && x.planRowId === row.rowId && x.status === "QUEUED")!;
  expect(j).toMatchObject({ type: "plan", planJobKind: row.rowJob!.kind, planId });
  if (decision) {
    const result = { schema: PLAN_ROW_JOB_RESULT_SCHEMA, kind: j.planJobKind, planId, jobId: j.jobId, rowId: row.rowId, model: "m", createdAt: now, decision: { kind: j.planJobKind, ...decision } };
    s3.set(planJobKey(planId, j.jobId, "result.json"), JSON.stringify(result));
  }
  fake.put("jobs", { ...j, status: decision ? "COMPLETED" : "FAILED", costUsd: 0.01, ...(decision ? {} : { errorMessage: "model error" }) } as never);
  return j;
}
const rowJobInputOf = (planId: string, jobId: string) => JSON.parse(s3.get(planJobKey(planId, jobId, "input.json"))!) as PlanRowJobInput;

/** An autonomous plan with the given rows, drafted (the draft job keeps the rows) and confirmed on its own. */
async function autonomousPlan(rows: string[], maxCostUsd = 50): Promise<string> {
  const created = await json<CreatePlanResponse>(
    call(A, "POST", "/plans", { name: "Language", goal: "言語の BRA を一通りそろえたい", draft: true, autonomous: { maxCostUsd }, rows: rows.map((roi) => ({ roi, tlf: `${roi} function` })), locale: "ja" }),
  );
  const planId = created.plan.planId;
  expect(planOf(planId)).toMatchObject({ status: "DRAFTING", settings: { autonomous: { maxCostUsd } }, canonNew: { name: "Language" } });
  const job = jobs().find((j) => j.projectId === planId && j.type === "plan")!;
  const input = JSON.parse(s3.get(planJobKey(planId, job.jobId, "input.json"))!) as PlanJobInput;
  const result: PlanJobResult = { schema: PLAN_JOB_RESULT_SCHEMA, kind: "draft", planId, jobId: job.jobId, model: job.model ?? "", locale: input.locale, createdAt: now, rows: [], unread: [], policy: "neocortex = area", proposals: [], notes: "", dropped: 0 };
  s3.set(planJobKey(planId, job.jobId, "result.json"), JSON.stringify(result));
  fake.put("jobs", { ...job, status: "COMPLETED", costUsd: 0.02 } as never);
  const step = await advancePlan(planId);
  expect(step.autoConfirm).toBe(true);
  await autoConfirm(planId);
  expect(planOf(planId)).toMatchObject({ status: "RUNNING", confirmedBy: "runner" });
  return planId;
}

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  vi.mocked(aws.enqueueRun).mockClear();
  user(A);
  user(ADMIN, { role: "admin", userKey: "u9a8b7c6" });
});

describe("自律実行: from the draft to the Canon without a person", () => {
  it("confirms the draft, decides on every pull request, answers questions and leaves out what it rejects", async () => {
    await setLimits(8, 8);
    const planId = await autonomousPlan(["left IFG", "STG"]);
    const canonId = planOf(planId).canonId!;
    expect(canonMeta(canonId)).toMatchObject({ name: "Language", policy: "neocortex = area" });
    for (const r of rowsOf(planId)) expect(jobsOf(r.projectId!)[0]).toMatchObject({ planId });

    // the first row finishes: pushed, and the AI decides on its pull request (no seed exception)
    finish(planId, "left IFG", coarse);
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "review", prNo: 1, aiReview: "queued", decideAttempts: 1 });
    decideJob(canonId, "approve");
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "done" });
    expect(prOf(canonId, 1)).toMatchObject({ state: "approved", decidedBy: A.sub, decidedByName: expect.stringMatching(/^AI \(/), decidedVia: { kind: "ai" } });
    expect(revOf(canonId, 1)).toMatchObject({ approvedBy: A.sub, approvedVia: { kind: "ai" } });
    expect(canonMeta(canonId).headRevision).toBe(1);
    expect(eventsOf(planId).some((e) => e.type === "row_ai_decided" && e.detail?.verdict === "approve")).toBe(true);

    // the second row's agent asks: the Orchestrator's AI reads the question and answers it for the owner
    s3.set(`users/${A.sub}/${rowOf(planId, "STG").projectId}/workspace/decision_log.md`, "## ROI\n- kept STG as given");
    ask(planId, "STG", "Left STG only, or both hemispheres?");
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "question", rowJob: { kind: "answer", status: "queued" } });
    const asked = rowJobDone(planId, "STG", { answer: "Left STG only.", reason: "The plan's language rows are left-lateralised." });
    expect(rowJobInputOf(planId, asked.jobId)).toMatchObject({ kind: "answer", row: { roi: "STG" }, project: { question: "Left STG only, or both hemispheres?", decisionLog: "## ROI\n- kept STG as given" }, situation: null });
    expect(asked.model).toBeTruthy();
    vi.mocked(aws.enqueueRun).mockClear();
    await advancePlan(planId);
    const stg = rowOf(planId, "STG");
    expect(stg).toMatchObject({ state: "running", autoAnswers: 1, rowJob: null });
    expect(jobsOf(stg.projectId!)[0]).toMatchObject({ status: "QUEUED", pendingAnswer: "Left STG only.\n\nReason: The plan's language rows are left-lateralised.", pendingAnswerSource: "auto" });
    expect(vi.mocked(aws.enqueueRun)).toHaveBeenCalledWith(expect.objectContaining({ projectId: stg.projectId, mode: "resume" }));
    expect(eventsOf(planId).find((e) => e.type === "row_auto_answered")?.detail).toMatchObject({ n: 1, answer: "Left STG only." });
    const notes = messagesOf(stg.projectId!);
    expect(notes.some((m) => m.role === "system" && (m.meta as { i18n?: string } | undefined)?.i18n === "sys.autoAnswered")).toBe(true);
    expect(notes.some((m) => m.role === "user" && (m.meta as { kind?: string } | undefined)?.kind === "answer")).toBe(false);

    // it finishes with a definition that contradicts the Canon (which moved on since its pin): a conform follow-up
    finish(planId, "STG", fine);
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "running", conformAttempts: 1 });
    const followup = jobsOf(stg.projectId!).at(-1)!;
    expect(followup).toMatchObject({ type: "followup" });

    // after the follow-up it agrees; the AI rejects it anyway: the PR is closed and the row is left out
    finish(planId, "STG", own(3));
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "review", prNo: 3, aiReview: "queued" });
    decideJob(canonId, "reject");
    await advancePlan(planId);
    expect(prOf(canonId, 3)).toMatchObject({ state: "rejected", decidedByName: expect.stringMatching(/^AI \(/), reason: "reject because" });
    expect(rowOf(planId, "STG")).toMatchObject({ state: "skipped", autoSkip: { reason: "ai_rejected", prNo: 3 } });
    await advancePlan(planId);
    expect(planOf(planId).status).toBe("COMPLETED");
  });

  it("turns requested changes into a follow-up, fixes error conflicts, and leaves a row out after its last follow-up", async () => {
    await setLimits(8, 8);
    const planId = await autonomousPlan(["left IFG"]);
    const canonId = planOf(planId).canonId!;
    const P = rowOf(planId, "left IFG").projectId!;
    finish(planId, "left IFG", coarse);
    await advancePlan(planId);
    decideJob(canonId, "request_changes", { changes: ["Cite a tracer study for the A44d output."] });
    await advancePlan(planId);
    expect(prOf(canonId, 1)).toMatchObject({ state: "open", reviewState: "changes_requested", reviewedByName: expect.stringMatching(/^AI \(/) });
    // the follow-up carries the AI's changes
    const f = jobsOf(P).at(-1)!;
    expect(f).toMatchObject({ type: "followup" });
    expect(f.instruction).toContain("AI レビューの指摘に対応");
    expect(f.instruction).toContain("Cite a tracer study for the A44d output.");
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "running", conformAttempts: 1, followup: null });

    // pushed again (superseding #1), approved this time
    finish(planId, "left IFG", coarse);
    await advancePlan(planId);
    expect(prOf(canonId, 1).state).toBe("superseded");
    decideJob(canonId, "approve");
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG").state).toBe("done");
    expect(planOf(planId).status).toBe("COMPLETED");
  });

  it("answers every question with no limit, and asks again after a job fails (answers and pull request decisions alike)", async () => {
    await setLimits(8, 8);
    const planId = await autonomousPlan(["left IFG", "STG"]);
    const canonId = planOf(planId).canonId!;
    // far past v0.40.0's three automatic answers: still answered
    fake.put("plans", { ...rowOf(planId, "left IFG"), autoAnswers: 5 } as never);
    ask(planId, "left IFG");
    await advancePlan(planId);
    rowJobDone(planId, "left IFG", null);
    await advancePlan(planId);
    // the failed job is dropped, and asked again after a back-off (not every minute)
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "question", rowJob: null, orchestratorRetry: { n: 1, error: "model error" } });
    await advancePlan(planId);
    expect(jobs().filter((j) => j.projectId === planId && j.planJobKind === "answer")).toHaveLength(1);
    await advancePlan(planId, Date.now() + 2 * 60_000);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "question", rowJob: { kind: "answer", status: "queued" } });
    expect(jobs().filter((j) => j.projectId === planId && j.planJobKind === "answer")).toHaveLength(2);
    rowJobDone(planId, "left IFG", { answer: "Take BA44 only.", reason: "r" });
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "running", autoAnswers: 6, orchestratorRetry: null });

    // a pull request whose decision jobs keep failing is never left out: the decision is asked again
    finish(planId, "STG", coarse);
    await advancePlan(planId);
    for (let i = 0; i < 4; i++) {
      const j = jobs().find((x) => x.projectId === canonId && x.type === "canon-review" && x.status === "QUEUED")!;
      fake.put("jobs", { ...j, status: "FAILED", errorMessage: "model error" } as never);
      await advancePlan(planId);
      expect(rowOf(planId, "STG")).toMatchObject({ state: "review", aiReview: "wanted", orchestratorRetry: { n: i + 1 } });
      await advancePlan(planId, Date.now() + 61 * 60_000);
    }
    expect(rowOf(planId, "STG")).toMatchObject({ state: "review", aiReview: "queued" });
    decideJob(canonId, "approve");
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "done", orchestratorRetry: null });
  });

  it("resolves rows that need attention or a decision as the owner would: retry, skip, push", async () => {
    await setLimits(8, 8);
    const planId = await autonomousPlan(["left IFG", "STG"]);
    // the project fails after its automatic retries: 「要対応」, and the Orchestrator's AI decides
    const fail = (roi: string) => {
      const row = rowOf(planId, roi);
      fake.put("plans", { ...row, attempts: MAX_ROW_AUTO_RETRIES } as never);
      const p = projectOf(row.projectId!);
      fake.put("projects", { ...p, status: "FAILED", errorMessage: "Rate limit reached", activeJobId: null } as never);
      for (const j of jobs().filter((x) => x.projectId === p.projectId && ["QUEUED", "RUNNING"].includes(x.status))) fake.put("jobs", { ...j, status: "FAILED" } as never);
    };
    fail("left IFG");
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "attention", attentionReason: "failed", rowJob: { kind: "resolve", status: "queued" } });
    const first = rowJobDone(planId, "left IFG", { action: "retry", reason: "A rate limit passes." });
    expect(rowJobInputOf(planId, first.jobId).situation).toMatchObject({ state: "attention", reason: "failed", options: ["retry", "skip"], attempts: MAX_ROW_AUTO_RETRIES });
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "running", aiResolution: { action: "retry", reason: "A rate limit passes." }, rowJob: null, aiRetries: 1 });
    expect(eventsOf(planId).find((e) => e.type === "row_ai_resolved")?.detail).toMatchObject({ action: "retry", from: "attention", cause: "failed" });

    // it fails again: this time the AI leaves it out
    fail("left IFG");
    await advancePlan(planId);
    const second = rowJobDone(planId, "left IFG", { action: "skip", reason: "It keeps failing the same way." });
    // the AI sees what it chose before
    expect(rowJobInputOf(planId, second.jobId).situation).toMatchObject({ orchestratorRetries: 1, previous: { action: "retry", reason: "A rate limit passes." } });
    await advancePlan(planId);
    expect(rowOf(planId, "left IFG")).toMatchObject({ state: "skipped", autoSkip: { reason: "ai_skipped", error: "It keeps failing the same way." }, aiResolution: { action: "skip" } });

    // a finished row whose push failed (「人の判断」): the AI pushes it again
    finish(planId, "STG", coarse);
    fake.put("plans", { ...rowOf(planId, "STG"), state: "decision", decisionReason: "push_failed", lastError: "S3 was down" } as never);
    await advancePlan(planId);
    const resolve = rowJobDone(planId, "STG", { action: "push", reason: "The push failed for a passing reason." });
    expect(rowJobInputOf(planId, resolve.jobId).situation).toMatchObject({ state: "decision", reason: "push_failed", options: ["done", "push", "skip"] });
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "running", aiResolution: { action: "push" } });
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "review", prNo: 1 });
    // an action the situation does not offer is not taken: the job counts as unreadable and is asked again
    fake.put("plans", { ...rowOf(planId, "STG"), state: "decision", decisionReason: "pr_rejected" } as never);
    vi.mocked(aws.enqueueRun).mockClear();
    await advancePlan(planId);
    rowJobDone(planId, "STG", { action: "retry", reason: "?" });
    await advancePlan(planId);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "decision", rowJob: null, orchestratorRetry: { n: 1 } });
    await advancePlan(planId, Date.now() + 2 * 60_000);
    expect(rowOf(planId, "STG")).toMatchObject({ state: "decision", rowJob: { kind: "resolve", status: "queued" } });

    // cancelling the plan stops the Orchestrator's job for the row
    const pending = jobs().find((j) => j.projectId === planId && j.planJobKind === "resolve" && j.status === "QUEUED")!;
    await json(call(A, "POST", `/plans/${planId}/cancel`));
    expect(jobs().find((j) => j.jobId === pending.jobId)!.status).toBe("CANCELLED");
    expect(rowOf(planId, "STG").rowJob).toBeNull();
  });

  it("applies re-plan proposals at once, as the Orchestrator's own decision", async () => {
    await setLimits(1, 1);
    const planId = await autonomousPlan(["left IFG", "STG", "MTG"]);
    const pending = rowsOf(planId).filter((r) => r.state === "pending");
    expect(pending).toHaveLength(2);
    const jobId = "job_replan01";
    const plan = planOf(planId);
    const input = planJobInput(plan, { kind: "replan", jobId, rows: rowsOf(planId), projects: [], canons: [], concurrency: 1, wave: 1, locale: "ja" });
    s3.set(planJobKey(planId, jobId, "input.json"), JSON.stringify(input));
    const result: PlanJobResult = {
      schema: PLAN_JOB_RESULT_SCHEMA,
      kind: "replan",
      planId,
      jobId,
      model: "m",
      locale: "ja",
      createdAt: now,
      rows: [],
      unread: [],
      policy: "",
      proposals: [
        { kind: "add", rowId: "", policy: "", reason: "Shared by finished rows", row: { roi: "Thalamus", tlf: "relay", rationale: "r", anchors: [], dependsOn: [] } },
        { kind: "remove", rowId: pending[0].rowId, policy: "", reason: "Covered already", row: null },
      ],
      notes: "",
      dropped: 0,
    } as unknown as PlanJobResult;
    s3.set(planJobKey(planId, jobId, "result.json"), JSON.stringify(result));
    fake.put("jobs", { projectId: planId, jobId, userId: A.sub, type: "plan", planJobKind: "replan", planId, status: "COMPLETED", createdAt: now, updatedAt: now } as never);
    fake.put("plans", { ...plan, replan: { kind: "replan", jobId, status: "queued", requestedAt: now, requestedBy: "runner", wave: 1, locale: "ja" } } as never);
    await advancePlan(planId);
    expect(rowOf(planId, "Thalamus")).toMatchObject({ state: "pending", source: "llm" });
    expect(rowOf(planId, pending[0].roi).state).toBe("skipped");
    const proposals = fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("PROP#")) as unknown as { status: string; decidedBy: string }[];
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.status === "accepted" && p.decidedBy === "runner")).toBe(true);
  });

  it("starts nothing new at its cost limit, pauses once nothing is in flight, and resumes with a higher limit", async () => {
    await setLimits(1, 1);
    const planId = await autonomousPlan(["left IFG", "STG"], 1);
    // one row at a time: the first one spends more than the limit
    const first = rowsOf(planId).find((r) => r.state === "running")!;
    const second = rowsOf(planId).find((r) => r.rowId !== first.rowId)!;
    finish(planId, first.roi, coarse, 2);
    await advancePlan(planId);
    expect(rowOf(planId, second.roi).state).toBe("pending");
    expect(planOf(planId).costLimitAt).toBeTruthy();
    expect(eventsOf(planId).some((e) => e.type === "cost_limit_reached")).toBe(true);
    // its decision still runs, so what was built lands in the Canon
    decideJob(planOf(planId).canonId!, "approve");
    await advancePlan(planId);
    expect(rowOf(planId, first.roi).state).toBe("done");
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "PAUSED", pausedReason: "cost_limit" });

    expect((await call(A, "POST", `/plans/${planId}/resume`, {})).status).toBe(400);
    expect((await call(A, "POST", `/plans/${planId}/resume`, { maxCostUsd: 1.5 })).status).toBe(400);
    await json(call(A, "POST", `/plans/${planId}/resume`, { maxCostUsd: 10 }));
    expect(planOf(planId)).toMatchObject({ status: "RUNNING", settings: { autonomous: { maxCostUsd: 10 } }, costLimitAt: null });
    expect(rowOf(planId, second.roi).state).toBe("running");
  });

  it("checks its settings: needs a draft, a sane limit, and keeps ordinary plans as they were", async () => {
    expect((await call(A, "POST", "/plans", { name: "x", goal: "g", autonomous: {} })).status).toBe(400);
    expect((await call(A, "POST", "/plans", { name: "x", goal: "g", draft: true, autonomous: { maxCostUsd: 0 } })).status).toBe(400);
    const p = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "x", goal: "g", draft: true, autonomous: {} }));
    expect(p.plan.settings.autonomous).toEqual({ maxCostUsd: 20 });
    const plain = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "y", goal: "g" }));
    expect(plain.plan.settings.autonomous).toBeUndefined();
    expect(plain.plan.canonNew).toBeUndefined();
  });

  it("confirms only a draft written while the run was on: switched on afterwards, the owner confirms", async () => {
    const created = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: "g", draft: true, rows: [{ roi: "STG", tlf: "hearing" }], locale: "ja" }));
    const planId = created.plan.planId;
    const job = jobs().find((j) => j.projectId === planId && j.type === "plan")!;
    const input = JSON.parse(s3.get(planJobKey(planId, job.jobId, "input.json"))!) as PlanJobInput;
    const result: PlanJobResult = { schema: PLAN_JOB_RESULT_SCHEMA, kind: "draft", planId, jobId: job.jobId, model: job.model ?? "", locale: input.locale, createdAt: now, rows: [], unread: [], policy: "", proposals: [], notes: "", dropped: 0 };
    s3.set(planJobKey(planId, job.jobId, "result.json"), JSON.stringify(result));
    fake.put("jobs", { ...job, status: "COMPLETED" } as never);
    expect((await advancePlan(planId)).autoConfirm).toBeUndefined();
    await json(call(A, "PUT", `/plans/${planId}`, { settings: { autonomous: { maxCostUsd: 30 } } }));
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", settings: { autonomous: { maxCostUsd: 30 } } });
    await autoConfirm(planId);
    expect(planOf(planId).status).toBe("DRAFT");
  });
});
