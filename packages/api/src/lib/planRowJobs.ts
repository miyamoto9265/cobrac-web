// The Orchestrator's AI jobs for one row of an autonomous plan (自律実行), where the Orchestrator acts for the owner: an
// answer to the question of the row's agent, or the resolution of a row that needs attention (retry / skip) or a
// decision (done / push / skip). They are `plan` jobs like a draft or a re-plan (one slot, the orchestrator model,
// counted in the plan's cost); the row records the job (`rowJob`) and the runner applies its result after checking it
// against the input again (`parsePlanRowResult`).
import type {
  CanonRecord,
  JobRecord,
  KeySource,
  ModelPolicy,
  PlanRecord,
  PlanRowJobDecision,
  PlanRowJobInput,
  PlanRowJobKind,
  PlanRowJobResult,
  PlanRowRecord,
  ProjectRecord,
  UserRecord,
} from "@cobrac/shared";
import { PLAN_JOB_REASONING_EFFORT, PLAN_ROW_JOB_RESULT_SCHEMA, buildPlanRowJobInput, newId, nowIso, parsePlanRowResult, planJobKey, planRowOptions } from "@cobrac/shared";
import { enqueueRun, getObjectText, getPlanJson, putPlanJson } from "./aws.js";
import { getPullRequest } from "./canons.js";
import { putJob, updateJob } from "./db.js";
import { updateRow } from "./plans.js";

/** The job a row needs from the Orchestrator's AI now (none while it has one). */
export function rowJobWanted(row: PlanRowRecord, project: ProjectRecord | null, canonMissing: (row: PlanRowRecord) => boolean): PlanRowJobKind | null {
  if (row.rowJob) return null;
  if (row.state === "question") return project?.status === "WAITING_USER_INPUT" && !!project.pendingQuestion ? "answer" : null;
  if (row.state === "attention") return "resolve";
  // a decision because the plan's Canon is gone is the owner's: the plan pauses for it
  if (row.state === "decision") return canonMissing(row) ? null : "resolve";
  return null;
}

/** The end of the project's decision log (what the agent decided so far); empty when it has none yet. */
async function decisionLog(p: ProjectRecord): Promise<string> {
  try {
    return (await getObjectText(p.userId, p.projectId, "workspace/decision_log.md")) ?? "";
  } catch {
    return "";
  }
}

/** The input of a row job: the plan, its Canon, the row, its project and (resolve) the situation with its options. */
export async function rowJobInput(
  plan: PlanRecord,
  row: PlanRowRecord,
  rows: PlanRowRecord[],
  kind: PlanRowJobKind,
  jobId: string,
  project: ProjectRecord | null,
  canon: CanonRecord | null,
): Promise<PlanRowJobInput> {
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  const completed = !!project && project.status === "COMPLETED" && !!project.hasArtifacts && !project.deletedAt;
  let situation: PlanRowJobInput["situation"] = null;
  if (kind === "resolve" && (row.state === "attention" || row.state === "decision")) {
    const pr = row.prNo && plan.canonId ? await getPullRequest(plan.canonId, row.prNo, true).catch(() => null) : null;
    situation = {
      state: row.state,
      reason: row.state === "attention" ? (row.attentionReason ?? null) : (row.decisionReason ?? null),
      error: row.lastError ?? project?.errorMessage ?? null,
      attempts: row.attempts ?? 0,
      followups: row.conformAttempts ?? 0,
      pr: pr ? { prNo: pr.prNo, state: pr.state, note: pr.reason ?? pr.reviewNote ?? null } : null,
      options: planRowOptions(row.state, completed),
    };
  }
  return buildPlanRowJobInput({
    kind,
    planId: plan.planId,
    jobId,
    rowId: row.rowId,
    createdAt: nowIso(),
    locale: plan.settings.locale ?? null,
    plan: { name: plan.name, goal: plan.goal, policy: plan.policy ?? "" },
    canon: canon ? { name: canon.name, policy: canon.policy ?? "" } : null,
    row: {
      roi: row.roi,
      tlf: row.tlf,
      rationale: row.rationale,
      wave: row.wave,
      seed: !!row.seed,
      anchors: row.anchors ?? [],
      dependsOn: (row.dependsOn ?? []).map((id) => byId.get(id)).filter((r): r is PlanRowRecord => !!r).map((r) => ({ roi: r.roi, tlf: r.tlf, state: r.state })),
    },
    project: project
      ? {
          projectId: project.projectId,
          status: project.status,
          question: kind === "answer" ? (project.pendingQuestion ?? null) : null,
          error: project.errorMessage ?? null,
          decisionLog: await decisionLog(project),
        }
      : null,
    situation,
  });
}

/**
 * Queues the row job: the input is stored, the row records the job (only while it is still in the state the job is
 * for and has none), then the job is stored and queued. False when the row moved on meanwhile (nothing is queued).
 */
export async function queueRowJob(
  plan: PlanRecord,
  row: PlanRowRecord,
  input: PlanRowJobInput,
  owner: UserRecord,
  gate: { policy: ModelPolicy & { source: KeySource }; orchestratorModel: string },
): Promise<boolean> {
  await putPlanJson(planJobKey(plan.planId, input.jobId, "input.json"), input);
  const rowJob = { kind: input.kind, jobId: input.jobId, status: "queued" as const, requestedAt: nowIso() };
  if (!(await updateRow(plan.planId, row.rowId, { rowJob }, { state: row.state }))) return false;
  row.rowJob = rowJob;
  const at = nowIso();
  const job: JobRecord = {
    projectId: plan.planId,
    jobId: input.jobId,
    userId: owner.userId,
    type: "plan",
    planJobKind: input.kind,
    planRowId: row.rowId,
    planId: plan.planId,
    status: "QUEUED",
    keySource: gate.policy.source,
    instruction: null,
    pendingAnswer: null,
    locale: input.locale,
    model: gate.orchestratorModel,
    reasoningEffort: PLAN_JOB_REASONING_EFFORT,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    createdAt: at,
    updatedAt: at,
  };
  await putJob(job);
  try {
    await enqueueRun({ version: 1, userId: owner.userId, projectId: plan.planId, jobId: input.jobId, mode: "plan" });
  } catch (e) {
    // a job that was never queued must not hold a slot; the row asks again at a later step
    await updateJob(plan.planId, input.jobId, { status: "FAILED", errorMessage: "The job could not be queued.", endedAt: nowIso() });
    throw e;
  }
  return true;
}

export const newRowJobId = () => newId("job_");

/**
 * The decision of a finished row job, checked again against its input (result.json is written from the model's reply,
 * so nothing in it is trusted as it is). null when either file is missing or unusable.
 */
export async function readRowJobResult(planId: string, jobId: string, kind: PlanRowJobKind, rowId: string): Promise<{ decision: PlanRowJobDecision; input: PlanRowJobInput } | null> {
  const [result, input] = await Promise.all([getPlanJson<PlanRowJobResult>(planJobKey(planId, jobId, "result.json")), getPlanJson<PlanRowJobInput>(planJobKey(planId, jobId, "input.json"))]);
  if (!result || !input || result.schema !== PLAN_ROW_JOB_RESULT_SCHEMA || result.kind !== kind || result.jobId !== jobId || result.rowId !== rowId || input.kind !== kind || input.rowId !== rowId) return null;
  const d = result.decision as Partial<Record<"answer" | "action" | "reason", unknown>> | undefined;
  if (!d || typeof d !== "object") return null;
  const decision = parsePlanRowResult(JSON.stringify(kind === "answer" ? { answer: d.answer, reason: d.reason } : { action: d.action, reason: d.reason }), input);
  return decision ? { decision, input } : null;
}
