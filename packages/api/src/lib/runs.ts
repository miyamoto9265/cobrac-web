// Starting, retrying and stopping project jobs. The routes (POST /projects, …/retry, …/cancel and the admin stop)
// and the BRA Planner runner call the same functions with the owner's UserRecord, so a plan row starts its project
// exactly as the create screen does.
import { HTTPException } from "hono/http-exception";
import type { HypothesisInput, JobRecord, KeySource, ModelPolicy, ProjectAttachment, ProjectRecord, ReasoningEffort, UiLocale, UserRecord } from "@cobrac/shared";
import { DEFAULT_CODEX_MODEL, HARNESS_RULES, REASONING_EFFORTS, allowedDefaultModel, attachmentFileKey, hypothesisCreateFields, isUiLocale, newId, nowIso, policyAllows } from "@cobrac/shared";
import { env } from "../env.js";
import { enqueueRun, moveStagingToProject, stopEcsTask } from "./aws.js";
import { reserveNewId } from "./catalog.js";
import { getJob, getProject, listJobsForProject, putJob, putJobIfAbsent, putMessage, putProject, updateJob, updateJobIfStatus, updateProject } from "./db.js";
import { bad } from "./http.js";
import { scopeNotice, storeHypothesisFollowup } from "./hypothesisSettings.js";
import { modelPolicy } from "./orgKey.js";

export const isEffort = (v: unknown): v is ReasoningEffort => typeof v === "string" && (REASONING_EFFORTS as string[]).includes(v);

/** Optional UI language of a request (absent / null = let the agent follow the user's language). */
export const readLocale = (v: unknown): UiLocale | null => {
  if (v === undefined || v === null) return null;
  if (!isUiLocale(v)) throw bad("locale が不正です");
  return v;
};

export const normModel = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(v)) throw bad("モデル名が不正です");
  return v;
};

/** Model of a job when neither the job nor the project names one (the worker resolves it the same way). */
export const deploymentDefaultModel = () => env.codexModel || DEFAULT_CODEX_MODEL;

/** The key a user's jobs would run with and the model policy; `source` null when the user has none. */
export async function runPolicy(u: UserRecord): Promise<ModelPolicy> {
  return (await modelPolicy(u)).policy;
}

/** The caller's key and model policy; 400 when the caller has no key to run a job with. */
export async function requireRunKey(u: UserRecord): Promise<ModelPolicy & { source: KeySource }> {
  const policy = await runPolicy(u);
  if (policy.source) return { ...policy, source: policy.source };
  if (u.orgAccess) throw bad("デフォルトの API キーが登録されていません。管理者に連絡してください");
  throw bad("OpenAI API キーが未登録です。設定画面で登録するか、管理者にデフォルトの API キーの利用承認を依頼してください");
}

/** 403 when the default-API-key tier does not include `model` (the message never names the tier). */
export function requireModel(policy: ModelPolicy, model: string) {
  if (!policyAllows(policy, model)) throw new HTTPException(403, { message: `このモデル（${model}）は利用できません` });
}

/** A default (user setting, deployment) the user did not pick for this job: replaced by an allowed model when the tier excludes it. */
export const implicitModel = (policy: ModelPolicy, preferred: string) => (policy.allowed ? allowedDefaultModel(policy, preferred) : preferred);

/**
 * The model a project's next job runs. A project made with a model the user can no longer run (made with their own
 * key, or before the tier changed) moves to the tier's default model and keeps it; null when nothing changes.
 */
export async function moveToAllowedModel(u: UserRecord, p: ProjectRecord, policy: ModelPolicy): Promise<string | null> {
  const current = p.model || deploymentDefaultModel();
  const model = implicitModel(policy, current);
  if (model === current) return null;
  await updateProject(u.userId, p.projectId, { model });
  p.model = model;
  return model;
}

export const noteModel = (p: ProjectRecord, jobId: string, model: string | null) =>
  model
    ? putMessage(p.projectId, jobId, "system", "status", `Model: ${model} / reasoning effort: ${p.reasoningEffort ?? "default"}`, {
        userId: p.userId,
        meta: { i18n: "sys.model", model, effort: p.reasoningEffort ?? "" },
      })
    : undefined;

/** A reference file checked by the create route and waiting in staging. */
export interface StagedAttachment {
  staging: string;
  safeName: string;
  name: string;
  size: number;
  contentType: string;
}

export interface NewProject {
  roi: string;
  tlf: string;
  name: string;
  contributor: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  researchMode: boolean;
  locale: UiLocale | null;
  keySource: KeySource;
  staged?: StagedAttachment[];
  urls?: string[];
  /** Harness rule set of the project (default: the current `HARNESS_RULES`; a plan passes the one it was confirmed with) */
  harnessRules?: number;
  /** BRA Planner plan that starts the project, and its name for the chat notice */
  plan?: { planId: string; name: string };
  /** IDs reserved beforehand (the plan runner records them on the row before it creates the project) */
  projectId?: string;
  jobId?: string;
  /**
   * The runner finishing a start it began earlier: a project that already exists under `projectId` for the same plan
   * is kept (no second project, messages or job), and its job is queued only if it was never stored.
   */
  recover?: boolean;
  /** Runs after the project and its first job are stored and before the job is queued (Canon membership); idempotent */
  beforeQueue?: (project: ProjectRecord) => Promise<void>;
  /** "Allow hypotheses": hypothesis mode with scope S1 on the whole HCD (absent: literature-supported only, no new attributes) */
  hypothesis?: HypothesisInput;
}

/** Stores a new project and its first job, then queues the job. */
export async function createProject(u: UserRecord, input: NewProject): Promise<ProjectRecord> {
  const projectId = input.projectId ?? (await reserveNewId("project", u.userId));
  const attachments: ProjectAttachment[] = [];
  for (const [i, f] of (input.staged ?? []).entries()) {
    const key = attachmentFileKey(i, f.safeName);
    await moveStagingToProject(f.staging, u.userId, projectId, key, f.contentType);
    attachments.push({ kind: "file", id: `f${i + 1}`, name: f.name, key, size: f.size, contentType: f.contentType });
  }
  (input.urls ?? []).forEach((url, i) => attachments.push({ kind: "url", id: `u${i + 1}`, url }));
  const now = nowIso();
  let jobId = input.jobId ?? newId("job_");
  const { roi, tlf, name, model, reasoningEffort, researchMode, locale } = input;
  let project: ProjectRecord = {
    userId: u.userId,
    projectId,
    name,
    nameSource: "provisional",
    revision: 0,
    roi,
    tlf,
    contributor: input.contributor,
    ...(attachments.length ? { attachments } : {}),
    model,
    reasoningEffort,
    researchMode,
    sabraBoundary: "neocortex",
    harnessRules: input.harnessRules ?? HARNESS_RULES,
    ...(input.hypothesis ? hypothesisCreateFields(input.hypothesis, jobId, now) : {}),
    ...(input.plan ? { planId: input.plan.planId } : {}),
    status: "QUEUED",
    currentStep: null,
    stepStates: { HCD: "pending", FRG: "pending", CSV: "pending", XLSX: "pending" },
    activeJobId: jobId,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: false,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  let fresh = true;
  try {
    await putProject(project, true);
  } catch (e) {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
    const existing = input.recover ? await getProject(u.userId, projectId) : null;
    if (!existing || !input.plan || existing.planId !== input.plan.planId) throw new HTTPException(409, { message: "Project ID の採番が衝突しました。もう一度作成してください" });
    project = existing;
    jobId = existing.activeJobId ?? jobId;
    fresh = false;
  }
  const job: JobRecord = {
    projectId,
    jobId,
    userId: u.userId,
    type: "initial",
    status: "QUEUED",
    keySource: input.keySource,
    instruction: null,
    pendingAnswer: null,
    locale,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    ...(input.plan ? { planId: input.plan.planId } : {}),
    ...(input.hypothesis ? { hypothesisScopeId: "S1" } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const jobStored = fresh ? (await putJob(job), true) : await putJobIfAbsent(job);
  if (!jobStored) return project;
  const owner = { userId: u.userId };
  if (fresh) {
    await putMessage(projectId, jobId, "user", "prompt", `ROI: ${roi || "(not set)"}\nTLF: ${tlf || "(not set)"}`, {
      ...owner,
      meta: { kind: "create", roi, tlf, projectId, name, model, reasoningEffort, researchMode, ...(attachments.length ? { attachments: attachments.length } : {}), ...(input.plan ? { planId: input.plan.planId } : {}) },
    });
    await putMessage(projectId, jobId, "system", "status", `Model: ${model ?? "default"} / reasoning effort: ${reasoningEffort ?? "default"}`, {
      ...owner,
      meta: { i18n: "sys.model", model: model ?? "", effort: reasoningEffort ?? "" },
    });
    await putMessage(projectId, jobId, "system", "status", researchMode ? "Research mode: on" : "Research mode: off", {
      ...owner,
      meta: { i18n: researchMode ? "sys.researchOn" : "sys.researchOff" },
    });
    if (project.evidenceMode === "hypothesis" && project.hypothesisScopes?.[0]) {
      const notice = scopeNotice(project.hypothesisScopes[0], project.hypothesisMaxShare ?? 0.2);
      await putMessage(projectId, jobId, "system", "status", notice.content, { ...owner, meta: { ...notice.meta, i18n: "sys.hypothesisOn" } });
    }
    if (input.plan) {
      await putMessage(projectId, jobId, "system", "status", `Started by the CoBRAC Orchestrator (plan “${input.plan.name}”).`, { ...owner, meta: { i18n: "sys.planStarted", name: input.plan.name, planId: input.plan.planId } });
    }
  }
  // also when a recovered start stores its job only now, so the job is never queued before it
  if (input.beforeQueue) await input.beforeQueue(project);
  await putMessage(projectId, jobId, "system", "status", "Job queued. Waiting for a worker to start…", { ...owner, meta: { i18n: "sys.queued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId, jobId, mode: "initial" });
  return project;
}

/** Queues a retry of a FAILED / CANCELLED project from its last non-article job; `moved` is the model the project moved to, if any. */
export async function queueRetry(u: UserRecord, p: ProjectRecord, policy: ModelPolicy & { source: KeySource }, opts: { locale: UiLocale | null; moved: string | null }): Promise<string> {
  const jobs = await listJobsForProject(p.projectId, u.userId);
  const last = jobs.filter((j) => j.type !== "article").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const now = nowIso();
  const jobId = newId("job_");
  const job: JobRecord = {
    projectId: p.projectId,
    jobId,
    userId: u.userId,
    type: last?.type ?? "initial",
    status: "QUEUED",
    keySource: policy.source,
    instruction: last?.instruction ?? null,
    pendingAnswer: null,
    locale: opts.locale ?? last?.locale ?? null,
    ecsTaskArn: null,
    retryCount: (last?.retryCount ?? 0) + 1,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    ...(p.planId ? { planId: p.planId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await putJob(job);
  await updateProject(u.userId, p.projectId, { status: "QUEUED", activeJobId: jobId, errorMessage: null, pendingQuestion: null });
  await noteModel(p, jobId, opts.moved);
  await putMessage(p.projectId, jobId, "system", "status", "Retry queued. Continuing from previous artifacts.", { userId: p.userId, meta: { i18n: "sys.retryQueued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId, mode: "retry" });
  return jobId;
}

/** Queues a follow-up job (an instruction to a COMPLETED project, checked by the caller); `moved` as in `queueRetry`. */
export async function queueFollowup(
  u: UserRecord,
  p: ProjectRecord,
  policy: ModelPolicy & { source: KeySource },
  opts: { instruction: string; locale: UiLocale | null; moved: string | null; hypothesis?: HypothesisInput | null },
): Promise<string> {
  const text = opts.instruction;
  const now = nowIso();
  const jobId = newId("job_");
  const job: JobRecord = {
    projectId: p.projectId,
    jobId,
    userId: u.userId,
    type: "followup",
    status: "QUEUED",
    keySource: policy.source,
    instruction: text,
    pendingAnswer: null,
    locale: opts.locale,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  // hypothesis mode: a follow-up that adds a scope stores the job and the project's new scope together
  const added = opts.hypothesis ? await storeHypothesisFollowup(p, job, opts.hypothesis) : null;
  if (!added) {
    await putJob(job);
    await updateProject(u.userId, p.projectId, {
      status: "QUEUED",
      activeJobId: jobId,
      errorMessage: null,
      stepStates: { ...p.stepStates, XLSX: "pending" },
    });
  }
  await putMessage(p.projectId, jobId, "user", "prompt", text, { userId: p.userId, meta: { kind: "followup" } });
  await noteModel(p, jobId, opts.moved);
  if (added) {
    const notice = scopeNotice(added.scope, added.maxShare);
    await putMessage(p.projectId, jobId, "system", "status", notice.content, { userId: p.userId, meta: notice.meta });
  }
  await putMessage(p.projectId, jobId, "system", "status", "Follow-up job queued.", { userId: p.userId, meta: { i18n: "sys.followupQueued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId, mode: "followup" });
  return jobId;
}

/** Project fields after its active job is stopped. An article job leaves the finished BRA data as it was. */
export function afterStop(p: ProjectRecord, job: JobRecord | null): Partial<ProjectRecord> {
  if (job?.type !== "article") return { status: "CANCELLED", activeJobId: null, activeStage: null, pendingQuestion: null };
  const articleJob = p.articleJob?.jobId === job.jobId ? { ...p.articleJob, status: "CANCELLED" as const } : (p.articleJob ?? null);
  return { status: "COMPLETED", activeJobId: null, pendingQuestion: null, articleJob };
}

const STOP_NOTICE = {
  user: { reason: "cancelled by user", text: "Job cancelled by the user.", i18n: "sys.cancelled" },
  admin: { reason: "cancelled by admin", text: "Job stopped by an admin.", i18n: "sys.adminStopped" },
  plan: { reason: "plan cancelled", text: "Job cancelled because its CoBRAC Orchestrator plan was cancelled.", i18n: "sys.planCancelled" },
} as const;

/** Stops the project's active job (and its Fargate task) and marks the project stopped. */
export async function stopProject(p: ProjectRecord, by: keyof typeof STOP_NOTICE): Promise<void> {
  const job = p.activeJobId ? await getJob(p.projectId, p.activeJobId) : null;
  const notice = STOP_NOTICE[by];
  if (job) {
    await updateJob(p.projectId, job.jobId, { status: "CANCELLED", endedAt: nowIso() });
    if (job.ecsTaskArn) await stopEcsTask(job.ecsTaskArn, notice.reason);
    await putMessage(p.projectId, job.jobId, "system", "status", notice.text, { userId: p.userId, meta: { i18n: notice.i18n } });
  }
  await updateProject(p.userId, p.projectId, afterStop(p, job));
}

/**
 * Answers the question a project's agent is waiting on and resumes its job. `user`: the owner's answer (shown as theirs).
 * `auto`: the Orchestrator's AI of an autonomous plan (自律実行) answers for the owner: the chat shows the question and
 * the answer as a notice of the Orchestrator (not a message of the user). False when the project no longer waits on an
 * answer (for `auto`: also when someone answered first).
 */
export async function answerQuestion(
  u: UserRecord,
  p: ProjectRecord,
  policy: ModelPolicy & { source: KeySource },
  text: string,
  opts: { source: "user" | "auto"; locale: UiLocale | null },
): Promise<boolean> {
  if (p.status !== "WAITING_USER_INPUT" || !p.activeJobId) return false;
  const job = await getJob(p.projectId, p.activeJobId, true);
  if (!job) return false;
  const moved = await moveToAllowedModel(u, p, policy);
  const values: Partial<JobRecord> = { status: "QUEUED", pendingAnswer: text, pendingAnswerSource: opts.source, keySource: policy.source, ...(opts.locale ? { locale: opts.locale } : {}) };
  if (opts.source === "auto") {
    if (!(await updateJobIfStatus(p.projectId, job.jobId, "WAITING_USER_INPUT", values))) return false;
  } else await updateJob(p.projectId, job.jobId, values);
  const question = p.pendingQuestion ?? "";
  await updateProject(u.userId, p.projectId, { status: "QUEUED", pendingQuestion: null });
  if (opts.source === "user") await putMessage(p.projectId, job.jobId, "user", "prompt", text, { userId: p.userId, meta: { kind: "answer" } });
  else {
    await putMessage(p.projectId, job.jobId, "system", "status", "The Orchestrator's AI answered the agent's question.", {
      userId: p.userId,
      meta: { i18n: "sys.autoAnswered", details: `${question.slice(0, 4000)}\n\n---\n\n${text}` },
    });
  }
  await noteModel(p, job.jobId, moved);
  await putMessage(p.projectId, job.jobId, "system", "status", "Answer received. Restarting the worker…", { userId: p.userId, meta: { i18n: "sys.answered" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId: job.jobId, mode: "resume" });
  return true;
}
