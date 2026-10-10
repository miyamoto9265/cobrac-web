// One step of a plan: keep its rows in step with their projects, then start rows of the active wave while there is
// a free slot. Every write is conditional on the row's state (and a lease on the plan), so running the step twice,
// or from the scheduled runner and an API request at the same time, starts nothing twice. Rows are never queued
// ahead of a free slot: the janitor fails jobs that stay QUEUED for 24 hours.
//
// Stage 2: a DRAFTING plan waits for its draft job (queued here when a slot is free, then applied); a plan ordered
// automatically (`ordering: "auto"`) learns the anchors its finished rows actually used (their uc.json), re-orders the
// rows that have not started after each wave, and asks a re-plan job for proposals. Plans ordered by hand (all stage-1
// plans) skip all of this: no S3 reads, no plan jobs.
//
// Stage 3: a plan with a Canon (`canonId`) pins each row's project to the Canon head when it starts, pushes the
// finished project instead of finishing the row (「承認待ち」 until a human approves its pull request), asks an AI review
// of body rows' pull requests when a slot is free, sends conform follow-ups for conflicts caused by the Canon moving on,
// and hands everything else to a human (「人の判断」). A seed row holds the later waves until its pull request is approved,
// and no new wave starts while `PLAN_MAX_WAITING_PRS` pull requests wait. The runner never approves, rejects or answers
// for an ordinary plan. Plans without a Canon read no Canon.
//
// 自律実行 (autonomous run, `settings.autonomous`): the Orchestrator acts for the owner, so the plan runs to the end
// without waiting for a person. The runner confirms its draft (through the Lambda handler, after the step); the
// Orchestrator's AI answers every question of the rows' agents (an `answer` row job), decides on every pull request of
// the plan (seeds included; the runner applies approve, request changes as a follow-up, or reject), and resolves rows
// that need attention (retry / skip) or a decision (done / push / skip) with a `resolve` row job; re-plan proposals are
// applied at once. No new row, follow-up, resolution or re-plan starts once the plan spent its cost limit.
import type {
  CanonAiReviewResult,
  CanonIncoming,
  CanonRecord,
  EffectiveLimits,
  JobRecord,
  KeySource,
  ModelPolicy,
  PlanAttentionReason,
  PlanAutoSkipReason,
  PlanRowAction,
  PlanRowJobKind,
  PlanDecisionReason,
  PlanEventType,
  PlanJobState,
  PlanPauseReason,
  PlanRecord,
  PlanRowRecord,
  PlanRowState,
  ProjectRecord,
  UserRecord,
} from "@cobrac/shared";
import {
  ACTIVE_PROJECT_STATUSES,
  HARNESS_RULES,
  PLAN_MAX_WAITING_PRS,
  HCD_FILES,
  IN_FLIGHT_ROW_STATES,
  MAX_ROW_AUTO_RETRIES,
  PLAN_LEASE_MS,
  PLAN_LIMITS,
  PLAN_ROW_STATES,
  ROW_START_STALE_MS,
  RUNNER_PLAN_STATUSES,
  SLOT_JOB_STATUSES,
  TRACKED_ROW_STATES,
  anchorsOfUcJson,
  canonAiReviewKey,
  canonAlignInstruction,
  canonFixInstruction,
  canonFollowStatus,
  canonPrKey,
  conformTitle,
  countRows,
  decisionAction,
  diffCanon,
  controlSlotCap,
  flowActiveWave,
  flowPlan,
  flowReplanDue,
  freeSlots,
  isAutonomous,
  isFlowPlan,
  perRowCostUsd,
  rowsWithinCost,
  isMovableRow,
  isProjectDeleted,
  maxFollowups,
  newId,
  nextActiveWave,
  nowIso,
  orchestratorAnswerText,
  orchestratorRetryDelayMs,
  orchestratorModelOf,
  planFinished,
  canRunJobs,
  policyAllows,
  prOutcome,
  pushOutcome,
  proposeProjectName,
  replanJobDue,
  replanRows,
  rowsToStart,
  syncRow,
  waitingPrs,
} from "@cobrac/shared";
import { getCanonJson, getObjectText } from "./aws.js";
import { approvePullRequest, loadCanonHead, loadCanonRevision, ownedCanon, pinProject, pushProject, rejectPullRequest, requestAiReview, requestPrChanges } from "./canonOps.js";
import { addCanonMember, getPullRequest } from "./canons.js";
import { reserveNewId } from "./catalog.js";
import { currentLimits } from "./concurrency.js";
import { getJob, getProject, getUser, listJobsByStatus, listUserProjects } from "./db.js";
import { GATE_ERRORS, draftRows, isOpenPlanJob, planJobProgress, queuePlanJob, readPlanJob, readPlanResult, stopPlanJob, storeProposals } from "./planJobs.js";
import { planSpendUsd } from "./planCost.js";
import { applyProposal } from "./planProposals.js";
import { newRowJobId, queueRowJob, readRowJobResult, retryDue, rowJobInput, rowJobWanted } from "./planRowJobs.js";
import { acquirePlanLease, getPlan, listProposals, listRows, putPlanEvent, putRow, releasePlanLease, setPlanStatus, updatePlan, updateProposal, updateRow } from "./plans.js";
import { answerQuestion, createProject, deploymentDefaultModel, implicitModel, jobKeySource, moveToAllowedModel, queueFollowup, queueRetry, runPolicy, stopProject } from "./runs.js";

export const RUNNER = "runner";

export interface AdvanceResult {
  planId: string;
  /** inactive: not drafting, running or paused (or gone); busy: another step holds the plan */
  skipped?: "inactive" | "busy";
  status?: PlanRecord["status"];
  started: string[];
  changed: number;
  pausedReason?: PlanPauseReason;
  /** A `plan` job (draft or re-plan) queued by this step */
  planJob?: string;
  /** 自律実行: the draft was applied in this step; the caller confirms the plan once the step released its lease */
  autoConfirm?: boolean;
}

/** The models a plan's jobs run on: the rows' (`model`) and the Orchestrator's own jobs' (`orchestratorModel`). */
export type PlanGate = { policy: ModelPolicy; model: string; orchestratorModel: string };

/**
 * Whether the owner may start a job now, and on which models (each the plan's, or the tier default for one the owner did
 * not pick). A picked model the owner may no longer use stops both kinds of job.
 */
export async function runGate(plan: PlanRecord, owner: UserRecord | null): Promise<({ ok: true } & PlanGate) | { ok: false; reason: PlanPauseReason }> {
  if (!owner || owner.disabled) return { ok: false, reason: "owner_disabled" };
  const policy = await runPolicy(owner);
  if (!canRunJobs(policy)) return { ok: false, reason: "no_key" };
  const resolve = (chosen: string | null, picked: boolean): string | null => {
    const model = chosen || deploymentDefaultModel();
    if (policyAllows(policy, model)) return model;
    return picked ? null : implicitModel(policy, model);
  };
  const o = orchestratorModelOf(plan.settings);
  const model = resolve(plan.settings.model, plan.settings.modelChosen);
  const orchestratorModel = resolve(o.model, o.chosen);
  if (!model || !orchestratorModel) return { ok: false, reason: "model_not_allowed" };
  return { ok: true, policy, model, orchestratorModel };
}

async function setRow(plan: PlanRecord, row: PlanRowRecord, to: PlanRowState, values: Partial<PlanRowRecord>, event: PlanEventType | null, detail?: Record<string, string | number | null>): Promise<boolean> {
  const ok = await updateRow(plan.planId, row.rowId, { ...values, state: to }, { state: row.state });
  if (!ok) return false;
  Object.assign(row, values, { state: to });
  if (event) await putPlanEvent(plan.planId, event, RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), ...(detail ? { detail } : {}) });
  return true;
}

/**
 * 自律実行: the row is left out by the Orchestrator (its pull request, if any, stays as it is): the AI reviewer rejected
 * its pull request, or the Orchestrator's AI chose to skip it. The project's job is never running here.
 */
const autoSkip = (plan: PlanRecord, row: PlanRowRecord, reason: PlanAutoSkipReason, error: string | null, extra: Partial<PlanRowRecord> = {}) =>
  setRow(
    plan,
    row,
    "skipped",
    { ...extra, autoSkip: { reason, at: nowIso(), prNo: extra.prNo ?? row.prNo ?? null, error }, lastError: error, claimedAt: null, conform: false, followup: null, aiReview: null },
    "row_auto_skipped",
    { reason, error: error ? error.slice(0, 300) : null, ...((extra.prNo ?? row.prNo) ? { prNo: extra.prNo ?? row.prNo ?? null } : {}) },
  );

/** A row that needs attention (「要対応」); in an autonomous plan the Orchestrator's AI resolves it (a `resolve` row job). */
const attention = (plan: PlanRecord, row: PlanRowRecord, reason: PlanAttentionReason, error: string | null, extra: Partial<PlanRowRecord> = {}) =>
  setRow(plan, row, "attention", { ...extra, attentionReason: reason, lastError: error }, "row_attention", { reason, error });

/**
 * The plan's Canon as this step sees it (read once per step). `canon` is null for a plan without one, and for a plan
 * whose Canon was deleted or is no longer its owner's (rows that would push then need a human).
 */
interface CanonStep {
  canon: CanonRecord | null;
  owner: UserRecord | null;
}

const CANON_MISSING = "The plan's Canon was not found.";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/**
 * A row a human must decide on (「人の判断」). In an autonomous plan the Orchestrator's AI decides it (a `resolve` row
 * job), except when the plan's Canon is gone: then the plan pauses (`canon_missing`) and the owner resolves it.
 */
const decide = (plan: PlanRecord, row: PlanRowRecord, reason: PlanDecisionReason, error: string | null, extra: Partial<PlanRowRecord> = {}) =>
  setRow(plan, row, "decision", { ...extra, decisionReason: reason, lastError: error, claimedAt: null }, "row_decision", { reason, error, ...(extra.prNo ? { prNo: extra.prNo } : {}) });

/** A 「人の判断」 row whose Canon is gone: the owner's to resolve, never the Orchestrator's AI. */
const canonMissing = (row: PlanRowRecord) => row.state === "decision" && row.lastError === CANON_MISSING;

/** Whether the row's pull request gets an AI review (body rows) or, in an autonomous plan, the AI's decision (every row). */
const reviewWanted = (plan: PlanRecord, row: PlanRowRecord): "wanted" | null => (isAutonomous(plan) || !row.seed ? "wanted" : null);

/**
 * A finished row of a plan with a Canon: its project is pushed to the plan's Canon (joining it, pinned to the head, when
 * it is in no Canon yet). The pull request then waits for a human (「承認待ち」; body rows also get an AI review), or its
 * error conflicts caused by the Canon moving on since the row's pin get a conform follow-up, or a human decides.
 */
async function pushRow(plan: PlanRecord, row: PlanRowRecord, p: ProjectRecord, cs: CanonStep): Promise<boolean> {
  const { canon, owner } = cs;
  if (!canon) return decide(plan, row, "push_failed", CANON_MISSING);
  if (!owner) return decide(plan, row, "push_failed", "The plan's owner was not found.");
  if (p.canonId && p.canonId !== canon.canonId) return decide(plan, row, "other_canon", null);
  if (!p.canonId) {
    const added = await addCanonMember(canon.canonId, owner.userId, p.projectId, canon.headRevision);
    if (!added.ok) return decide(plan, row, "push_failed", "The project could not join the plan's Canon.");
    Object.assign(p, { canonId: canon.canonId, canonRevision: canon.headRevision });
  }
  let pushed: Awaited<ReturnType<typeof pushProject>>;
  try {
    pushed = await pushProject(owner, canon, p);
  } catch (e) {
    console.error(`[plan ${plan.planId}] row ${row.rowId} could not be pushed`, errorText(e));
    return decide(plan, row, "push_failed", errorText(e));
  }
  const prNo = pushed.pr.prNo;
  const headMoved = canon.headRevision > (row.canonRevision ?? p.canonRevision ?? 0);
  const o = pushOutcome(pushed.diff.summary, headMoved, row.conformAttempts ?? 0, { autonomous: isAutonomous(plan) });
  if (o.to === "review") {
    return setRow(plan, row, "review", { prNo, aiReview: reviewWanted(plan, row), aiReviewJobId: null, decideAttempts: 0, decisionReason: null, lastError: null, claimedAt: null }, "row_pushed", { prNo });
  }
  if (o.to === "conform") {
    // 自律実行: error conflicts the Canon moving on did not cause get a follow-up that makes the project agree with the Canon
    const followup = o.fix ? { kind: "fix" as const, note: canonFixInstruction(pushed.diff.conflicts.filter((c) => c.severity === "error")) } : null;
    return setRow(plan, row, "pending", { prNo, conform: true, followup, lastError: null, claimedAt: null }, "row_pushed", { prNo, conform: 1 });
  }
  return decide(plan, row, o.reason, null, { prNo });
}

type PrOutcome = NonNullable<ReturnType<typeof prOutcome>>;

/**
 * Rows that follow their pull request each step: 「承認待ち」 rows, 「人の判断」 rows that have one (a human may settle it
 * in the Canon), and pending rows waiting for a slot for their conform follow-up (a human may settle its PR meanwhile).
 */
const followsPr = (r: PlanRowRecord) => r.state === "review" || (!!r.prNo && (r.state === "decision" || (r.state === "pending" && !!r.conform)));

/**
 * The row's pull request as it is now (a strongly consistent read: the runner may have written it in this same step).
 * Null while it is open.
 */
const readPrOutcome = async (canonId: string, row: PlanRowRecord): Promise<PrOutcome | null> => prOutcome(row.prNo ? await getPullRequest(canonId, row.prNo, true) : null);

/**
 * Applies what happened to the row's pull request: approved → done; rejected / withdrawn / missing → a human (a row
 * already in 「人の判断」 stays as it is); superseded → the row waits for approval of the PR that replaced it, with a new
 * AI review for a body row. A pending conform is dropped in every case: only a PR that is still open gets the follow-up.
 */
async function settlePr(plan: PlanRecord, row: PlanRowRecord, o: PrOutcome): Promise<boolean> {
  const unconform: Partial<PlanRowRecord> = row.conform ? { conform: false, followup: null } : {};
  if (o.to === "done") return setRow(plan, row, "done", { completedAt: nowIso(), attentionReason: null, claimedAt: null, ...unconform }, "row_done", { prNo: row.prNo ?? null });
  if (o.to === "decision") return row.state === "decision" ? false : decide(plan, row, o.reason, null, unconform);
  const values: Partial<PlanRowRecord> = { prNo: o.prNo, aiReview: reviewWanted(plan, row), aiReviewJobId: null, decideAttempts: 0, decisionReason: null, lastError: null, claimedAt: null, followup: null, ...unconform };
  if (!(await updateRow(plan.planId, row.rowId, { ...values, state: "review" }, { state: row.state, prNo: row.prNo ?? undefined }))) return false;
  Object.assign(row, values, { state: "review" });
  return true;
}

/** Job states after which an AI review no longer runs. */
const ENDED_JOB_STATUSES: readonly JobRecord["status"][] = ["COMPLETED", "FAILED", "CANCELLED"];

/**
 * A row follows its pull request (`followsPr`); a 「承認待ち」 row whose PR is still open also follows its AI review: once
 * the review job has ended, `aiReview` is cleared (`aiReviewJobId` stays, so the page can link the result).
 */
async function followPr(plan: PlanRecord, row: PlanRowRecord, cs: CanonStep): Promise<boolean> {
  if (!cs.canon) return row.state === "review" ? decide(plan, row, "push_failed", CANON_MISSING) : false;
  const o = await readPrOutcome(cs.canon.canonId, row);
  if (o) return settlePr(plan, row, o);
  if (row.state !== "review") return false;
  // 自律実行: every open pull request of the plan waits for the AI's decision (also one pushed before, or followed)
  if (isAutonomous(plan) && !row.aiReview) {
    if (!(await updateRow(plan.planId, row.rowId, { aiReview: "wanted" }, { state: "review" }))) return false;
    row.aiReview = "wanted";
    return true;
  }
  if (row.aiReview !== "queued") return false;
  const job = row.aiReviewJobId ? await getJob(cs.canon.canonId, row.aiReviewJobId, true) : null;
  if (job && !ENDED_JOB_STATUSES.includes(job.status)) return false;
  if (isAutonomous(plan) && cs.owner) {
    if (job?.reviewKind === "decide" && job.status === "COMPLETED") return applyDecision(plan, row, cs.canon, cs.owner, job);
    // a decision job that failed is asked again after a back-off (no limit); a review asked by hand is followed by a decision
    const failed = job?.reviewKind === "decide" ? { orchestratorRetry: nextRetry(row, job.errorMessage ?? "The decision job did not complete.") } : {};
    if (!(await updateRow(plan.planId, row.rowId, { aiReview: "wanted", ...failed }, { state: "review", aiReview: "queued" }))) return false;
    Object.assign(row, { aiReview: "wanted", ...failed });
    return true;
  }
  if (!(await updateRow(plan.planId, row.rowId, { aiReview: null }, { state: "review", aiReview: "queued" }))) return false;
  row.aiReview = null;
  return true;
}

/**
 * 自律実行: applies the AI reviewer's decision on the row's pull request. Code has the last word (`decisionAction`):
 * approve → merged into the Canon (as the AI, for the owner) and the row is done; an approval that error conflicts would
 * block, or requested changes → the PR records the request and the row gets a follow-up (at most `maxFollowups`, then it
 * is left out with its PR open); reject → the PR is closed and the row is left out. A race with another approval is
 * applied again at the next step.
 */
async function applyDecision(plan: PlanRecord, row: PlanRowRecord, canon: CanonRecord, owner: UserRecord, job: JobRecord): Promise<boolean> {
  const pr = row.prNo ? await getPullRequest(canon.canonId, row.prNo, true) : null;
  if (!pr || pr.state !== "open") return false; // settled outside: followed at the next step
  const result = await getCanonJson<CanonAiReviewResult>(canonAiReviewKey(canon.canonId, pr.prNo, job.jobId, "result.json"));
  const incoming = await getCanonJson<CanonIncoming>(canonPrKey(canon.canonId, pr.prNo, "incoming.json"));
  // unreadable: the decision is asked again after a back-off
  if (!result?.decision || !incoming) return setRow(plan, row, "review", { aiReview: "wanted", orchestratorRetry: nextRetry(row, "The decision could not be read.") }, null);
  const d = result.decision;
  const act = decisionAction(d, diffCanon(await loadCanonHead(canon), incoming));
  const via = { kind: "ai" as const, jobId: job.jobId, model: job.model ?? result.model };
  const detail = { prNo: pr.prNo, verdict: d.verdict, action: act.action, jobId: job.jobId };
  if (act.action === "approve") {
    const r = await approvePullRequest(owner, canon, pr, { choices: act.choices, note: d.reason || null, via });
    if (!r.ok) {
      // another approval moved the Canon meanwhile: applied again (judged against the new head) at the next step
      if (r.reason === "race") return false;
      return setRow(plan, row, "review", { aiReview: "wanted" }, null);
    }
    canon.headRevision = r.revision;
    await putPlanEvent(plan.planId, "row_ai_decided", RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), detail: { ...detail, revision: r.revision } });
    return setRow(plan, row, "done", { completedAt: nowIso(), aiReview: null, claimedAt: null, orchestratorRetry: null }, "row_done", { prNo: pr.prNo });
  }
  if (act.action === "reject") {
    if (!(await rejectPullRequest(owner, canon, pr, act.note.slice(0, 2000), via))) return false;
    await putPlanEvent(plan.planId, "row_ai_decided", RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), detail });
    return autoSkip(plan, row, "ai_rejected", d.reason || null);
  }
  // fix / changes: the project changes and pushes again (its new PR supersedes this one and is decided again); past the
  // follow-up limit the row needs a decision, which the Orchestrator's AI then takes (done / push / skip)
  if ((row.conformAttempts ?? 0) >= maxFollowups(plan)) return decide(plan, row, "conform_limit", null, { aiReview: null, orchestratorRetry: null });
  await requestPrChanges(owner, canon, pr, act.note.slice(0, 2000), via);
  await putPlanEvent(plan.planId, "row_ai_decided", RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), detail });
  return setRow(plan, row, "pending", { conform: true, followup: { kind: act.action === "fix" ? "fix" : "changes", note: act.note.slice(0, 6000) }, aiReview: null, claimedAt: null, orchestratorRetry: null }, null);
}

/** Seed row states that no longer hold another seed (as the seed gate of `nextActiveWave`), plus `pending`. */
const SEED_IDLE: readonly PlanRowState[] = ["pending", "done", "skipped", "cancelled"];

/**
 * Seed rows of a plan with a Canon are built one at a time, even when several share a wave: no seed starts while another
 * seed is in flight, waits for approval or needs a human, and at most one seed starts per step.
 */
function oneSeedAtATime(rows: PlanRowRecord[], candidates: PlanRowRecord[]): PlanRowRecord[] {
  let taken = rows.some((r) => r.seed && !SEED_IDLE.includes(r.state));
  return candidates.filter((r) => {
    if (!r.seed) return true;
    if (taken) return false;
    taken = true;
    return true;
  });
}

/** Keeps a tracked row in step with its project. */
async function syncTracked(plan: PlanRecord, row: PlanRowRecord, project: ProjectRecord | null, now: number, cs: CanonStep | null): Promise<boolean> {
  if (row.state === "starting" && !project) {
    // a start that did not finish (the step stopped in between): start again later with the same project ID
    if (now - Date.parse(row.claimedAt ?? row.updatedAt) < ROW_START_STALE_MS) return false;
    return setRow(plan, row, "pending", { claimedAt: null }, null);
  }
  const s = syncRow(row, project, plan.status);
  if (!s) return false;
  const now_ = nowIso();
  if (s.state === "attention") return attention(plan, row, s.reason, s.error);
  if (s.state === "pending") return setRow(plan, row, "pending", { attempts: row.attempts + 1, lastError: s.error, claimedAt: null }, "row_retry", { attempt: row.attempts + 1, max: MAX_ROW_AUTO_RETRIES, error: s.error });
  // a plan with a Canon: a row is done only once its pull request is approved
  if (s.state === "done" && cs && project) return pushRow(plan, row, project, cs);
  if (s.state === "done") return setRow(plan, row, "done", { completedAt: now_, attentionReason: null }, s.event);
  return setRow(plan, row, s.state, {}, s.event);
}

/** Starts one pending row: its project (new, or the one a start did not finish), or a retry of its failed project. */
async function startRow(plan: PlanRecord, row: PlanRowRecord, owner: UserRecord, gate: PlanGate, cs: CanonStep | null): Promise<boolean> {
  const at = nowIso();
  const canon = cs?.canon ?? null;
  const existing = row.projectId ? await getProject(owner.userId, row.projectId) : null;
  if (existing && isProjectDeleted(existing)) {
    await attention(plan, row, "project_deleted", null);
    return false;
  }
  if (existing && row.conform && cs && existing.status === "COMPLETED") return startConform(plan, row, existing, owner, gate, canon);
  const unconform: Partial<PlanRowRecord> = row.conform ? { conform: false } : {};
  if (existing && cs && existing.status === "COMPLETED") {
    // finished already (an existing project of the owner taken in at confirmation, or one finished by hand): pushed
    // now, joining the Canon pinned to its head when it is in none. No job is queued and no attempt is counted.
    if (!(await setRow(plan, row, "running", { claimedAt: null, startedAt: row.startedAt ?? at, ...unconform }, null))) return false;
    await pushRow(plan, row, existing, cs);
    return false;
  }
  if (existing) {
    if (existing.status !== "FAILED" && existing.status !== "CANCELLED") {
      // already running again or finished (for example retried by hand): follow it from the next step
      await setRow(plan, row, "running", { claimedAt: null, ...unconform }, null);
      return false;
    }
    if (!(await setRow(plan, row, "starting", { claimedAt: at, ...unconform }, null))) return false;
    let pin: Partial<PlanRowRecord> = {};
    try {
      // a retry follows the Canon head as it is now
      if (canon && (await joinCanon(owner, existing, canon))) pin = { canonRevision: canon.headRevision };
      const moved = await moveToAllowedModel(owner, existing, gate.policy);
      await queueRetry(owner, existing, gate.policy, { locale: plan.settings.locale, moved });
    } catch (e) {
      await startFailed(plan, row, e);
      return false;
    }
    await setRow(plan, row, "running", { startedAt: at, ...pin }, "row_started", { retry: 1 });
    return true;
  }
  const projectId = row.projectId ?? (await reserveNewId("project", owner.userId));
  const jobId = newId("job_");
  const recover = !!row.projectId;
  if (!(await setRow(plan, row, "starting", { projectId, startJobId: jobId, claimedAt: at }, null))) return false;
  try {
    await createProject(owner, {
      roi: row.roi,
      tlf: row.tlf,
      name: proposeProjectName(row.roi, row.tlf),
      contributor: owner.contributorName?.trim() || owner.displayName,
      model: gate.model,
      reasoningEffort: plan.settings.reasoningEffort,
      researchMode: plan.settings.researchMode,
      locale: plan.settings.locale,
      keySource: jobKeySource(gate.policy, gate.model),
      harnessRules: plan.harnessRules ?? HARNESS_RULES,
      plan: { planId: plan.planId, name: plan.name },
      projectId,
      jobId,
      recover,
      // the new project follows the Canon head from its first job on
      beforeQueue: canon
        ? async (project) => {
            if (!(await joinCanon(owner, project, canon))) throw new Error("The new project could not join the plan's Canon.");
          }
        : undefined,
    });
    // a recovered start whose job an earlier step already stored (beforeQueue did not run again): join the Canon now
    if (canon && recover) {
      const p = await getProject(owner.userId, projectId);
      if (p && !p.canonId) await joinCanon(owner, p, canon);
    }
  } catch (e) {
    await startFailed(plan, row, e);
    return false;
  }
  await setRow(plan, row, "running", { startedAt: at, ...(canon ? { canonRevision: canon.headRevision } : {}) }, "row_started");
  return true;
}

/**
 * Pins the project to the Canon head: a member is re-pinned, a project in no Canon joins pinned to the head. False for a
 * project in another Canon (left as it is) or one that could not join.
 */
async function joinCanon(owner: UserRecord, p: ProjectRecord, canon: CanonRecord): Promise<boolean> {
  if (p.canonId === canon.canonId) {
    await pinProject(owner, p, canon, canon.headRevision);
    return true;
  }
  if (p.canonId) return false;
  const added = await addCanonMember(canon.canonId, owner.userId, p.projectId, canon.headRevision);
  if (added.ok) Object.assign(p, { canonId: canon.canonId, canonRevision: canon.headRevision });
  return added.ok;
}

/**
 * A conform follow-up: the row's finished project is re-pinned to the Canon head and gets the fixed instruction
 * 「Canon rev N に合わせて更新」 with what changed for it since its pin; it is pushed again when it completes.
 */
async function startConform(plan: PlanRecord, row: PlanRowRecord, p: ProjectRecord, owner: UserRecord, gate: PlanGate, canon: CanonRecord | null): Promise<boolean> {
  if (!canon) {
    await decide(plan, row, "push_failed", CANON_MISSING, { conform: false });
    return false;
  }
  if (p.canonId !== canon.canonId) {
    await decide(plan, row, p.canonId ? "other_canon" : "push_failed", p.canonId ? null : "The project is no longer in the plan's Canon.", { conform: false });
    return false;
  }
  // a human may have settled the PR while the row waited for a slot: only a PR that is still open gets the follow-up
  const o = await readPrOutcome(canon.canonId, row);
  if (o) {
    await settlePr(plan, row, o);
    return false;
  }
  const at = nowIso();
  const head = canon.headRevision;
  const attempt = (row.conformAttempts ?? 0) + 1;
  // the attempt and the new pin are written with the claim, so a step that stops after queueing the follow-up cannot
  // let another one through (a stop before queueing sends the row to a human at its next push instead: the pin is at
  // the head then). A start that fails keeps the attempt counted (the limit holds) and waits for the next slot.
  const followup = row.followup ?? null;
  const before: Partial<PlanRowRecord> = { conform: true, followup, canonRevision: row.canonRevision ?? null };
  if (!(await setRow(plan, row, "starting", { claimedAt: at, conform: false, followup: null, conformAttempts: attempt, canonRevision: head }, null))) return false;
  try {
    let instruction: string;
    if (followup?.kind === "changes") instruction = `Canon PR #${row.prNo} の AI レビューの指摘に対応\n\nThe AI reviewer of the plan's Canon asked for these changes before the project's pull request can go into the Canon. Make them (with evidence), then finish as usual:\n${followup.note}`;
    else if (followup?.kind === "fix") instruction = `${conformTitle(head)}\n\n${followup.note}`;
    else {
      const status = canonFollowStatus(await loadCanonRevision(canon, Math.min(p.canonRevision ?? 0, head)), await loadCanonHead(canon), p.projectId);
      instruction = `${conformTitle(head)}\n\n${canonAlignInstruction({ canonId: canon.canonId, name: canon.name, policy: canon.policy, revision: head }, status)}`;
    }
    await pinProject(owner, p, canon, head);
    const moved = await moveToAllowedModel(owner, p, gate.policy);
    await queueFollowup(owner, p, gate.policy, { instruction, locale: plan.settings.locale, moved });
  } catch (e) {
    await startFailed(plan, row, e, before);
    return false;
  }
  await setRow(plan, row, "running", { startedAt: at }, "row_conform", { revision: head, attempt, ...(followup ? { kind: followup.kind } : {}) });
  return true;
}

/**
 * Asks the AI review of a 「承認待ち」 body row's pull request (on a slot the caller counted). False when no job was
 * queued: the pull request is no longer open (nothing to review), or a review of it is already queued or running.
 */
async function requestRowReview(plan: PlanRecord, row: PlanRowRecord, canon: CanonRecord, owner: UserRecord, gate: PlanGate): Promise<boolean> {
  const set = async (values: Partial<PlanRowRecord>) => {
    if (await updateRow(plan.planId, row.rowId, values, { state: "review" })) Object.assign(row, values);
  };
  const pr = row.prNo ? await getPullRequest(canon.canonId, row.prNo, true) : null;
  if (!pr || pr.state !== "open") {
    await set({ aiReview: null });
    return false;
  }
  const decideJob = isAutonomous(plan);
  let r: Awaited<ReturnType<typeof requestAiReview>>;
  try {
    r = await requestAiReview(owner, canon, pr, gate.policy, { model: gate.orchestratorModel, locale: plan.settings.locale ?? "ja", kind: decideJob ? "decide" : "assist", planId: plan.planId });
  } catch (e) {
    console.error(`[plan ${plan.planId}] AI review of #${pr.prNo} could not be queued`, errorText(e));
    return false;
  }
  if (!r.ok) {
    // a review of this PR already queued or running (asked by hand): followed as the row's own
    await set(r.reason === "active" ? { aiReview: "queued", aiReviewJobId: r.jobId ?? null } : { aiReview: null, ...(r.reason === "material" ? { lastError: r.message } : {}) });
    return false;
  }
  await set({ aiReview: "queued", aiReviewJobId: r.job.jobId, ...(decideJob ? { decideAttempts: (row.decideAttempts ?? 0) + 1 } : {}) });
  await putPlanEvent(plan.planId, "row_ai_review", RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), detail: { prNo: pr.prNo, jobId: r.job.jobId } });
  return true;
}

/** A start that threw: counts as an attempt; after the last one the row needs attention. `restore`: values the claim changed. */
async function startFailed(plan: PlanRecord, row: PlanRowRecord, e: unknown, restore: Partial<PlanRowRecord> = {}) {
  const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  console.error(`[plan ${plan.planId}] row ${row.rowId} could not start`, error);
  if (row.attempts >= MAX_ROW_AUTO_RETRIES) await attention(plan, row, "start_failed", error, restore);
  else await setRow(plan, row, "pending", { ...restore, attempts: row.attempts + 1, lastError: error, claimedAt: null }, "row_retry", { attempt: row.attempts + 1, max: MAX_ROW_AUTO_RETRIES, error });
}

/** Pauses a running plan for a reason found by the runner (the owner resumes it once it is fixed). */
async function pauseFor(plan: PlanRecord, reason: PlanPauseReason) {
  if (await setPlanStatus(plan.planId, "RUNNING", "PAUSED", { pausedReason: reason })) {
    plan.status = "PAUSED";
    plan.pausedReason = reason;
    await putPlanEvent(plan.planId, "paused", RUNNER, { detail: { reason } });
  }
}

/** Jobs that hold a slot now (queued ones included: they will run). */
const slotJobs = async (): Promise<JobRecord[]> => (await Promise.all(SLOT_JOB_STATUSES.map((st) => listJobsByStatus(st)))).flat();

const openJob = (s: PlanJobState | null | undefined) => !!s && (s.status === "queued" || s.status === "running");

// --- draft -----------------------------------------------------------------------------------------------------------

/** Why a plan job could not be started for the owner, for the page (`PlanJobState.errorCode`). */
type GateCode = NonNullable<PlanJobState["errorCode"]>;
const gateCode = (reason: PlanPauseReason): GateCode | null => (reason === "user" || reason === "canon_missing" || reason === "cost_limit" ? null : reason);
const gateError = (reason: PlanPauseReason) => GATE_ERRORS[reason as GateCode] ?? reason;

/** The draft ended without a result: the plan is an editable draft again, with the reason (and its code when the owner could not run it). */
async function endDraft(plan: PlanRecord, d: PlanJobState, status: "failed" | "cancelled", error: string, errorCode: GateCode | null = null) {
  if (isAutonomous(plan) && status === "failed" && !errorCode && (d.attempt ?? 1) < 2) {
    // 自律実行: a draft job that failed is asked once more (not when the owner cannot run jobs)
    const again: PlanJobState = { ...d, jobId: null, status: "waiting", error, attempt: (d.attempt ?? 1) + 1 };
    if (await updatePlan(plan.planId, { draft: again }, { status: "DRAFTING" })) {
      plan.draft = again;
      await putPlanEvent(plan.planId, "draft_failed", RUNNER, { detail: { error: error.slice(0, 300), status, retry: 1 } });
    }
    return;
  }
  const draft: PlanJobState = { ...d, status, error, errorCode, endedAt: nowIso() };
  if (!(await setPlanStatus(plan.planId, "DRAFTING", "DRAFT", { draft }))) return;
  plan.status = "DRAFT";
  plan.draft = draft;
  await putPlanEvent(plan.planId, "draft_failed", RUNNER, { detail: { error: error.slice(0, 300), status } });
}

/** A DRAFTING plan: queue its draft job when a slot is free, follow it, and apply its result. */
async function stepDraft(plan: PlanRecord, owner: UserRecord | null, now: number, result: AdvanceResult) {
  const d = plan.draft;
  if (!isOpenPlanJob(d)) {
    // drafting without a draft in progress (should not happen): back to an editable draft
    if (await setPlanStatus(plan.planId, "DRAFTING", "DRAFT")) plan.status = "DRAFT";
    return;
  }
  if (d.status === "waiting") {
    const limits = await currentLimits(now);
    if (freeSlots(limits, await slotJobs(), plan.ownerUserId) <= 0) return;
    const gate = await runGate(plan, owner);
    if (!gate.ok) return endDraft(plan, d, "failed", gateError(gate.reason), gateCode(gate.reason));
    try {
      const state = await queuePlanJob(plan, "draft", d, await listRows(plan.planId, true), owner!, gate, limits.effective);
      if (state) {
        result.planJob = state.jobId ?? undefined;
        result.changed++;
      }
    } catch (e) {
      console.error(`[plan ${plan.planId}] draft job could not be queued`, e);
      const fresh = await getPlan(plan.planId, true);
      if (fresh?.draft?.status === "waiting") await endDraft(plan, fresh.draft, "failed", "The draft job could not be queued.");
    }
    return;
  }
  const p = planJobProgress(await readPlanJob(plan.planId, d.jobId));
  if (p.to === "queued") return;
  if (p.to === "running") {
    if (d.status !== "running") {
      plan.draft = { ...d, status: "running" };
      await updatePlan(plan.planId, { draft: plan.draft }, { status: "DRAFTING" });
      result.changed++;
    }
    return;
  }
  if (p.to !== "completed") return endDraft(plan, d, p.to, p.error);
  const parsed = await readPlanResult(plan.planId, "draft", d.jobId!);
  if (!parsed) return endDraft(plan, d, "failed", "The result of the draft job could not be read.");
  const limits = await currentLimits(now);
  const projects = (await listUserProjects(plan.ownerUserId)).filter((x) => !x.deletedAt);
  const applied = draftRows(plan.planId, await listRows(plan.planId, true), parsed, projects, limits.effective, nowIso());
  for (const r of applied.rows) await putRow(r);
  const dropped = parsed.dropped + applied.dropped;
  const draft: PlanJobState = { ...d, status: "done", error: null, unread: parsed.unread, dropped, endedAt: nowIso(), ...(isAutonomous(plan) ? { autoConfirm: true } : {}) };
  const values: Partial<PlanRecord> = { draft, ordering: "auto", rowCount: applied.rows.length, rowCounts: countRows(applied.rows), ...(parsed.policy ? { policy: parsed.policy } : {}) };
  if (!(await setPlanStatus(plan.planId, "DRAFTING", "DRAFT", values))) return;
  Object.assign(plan, values, { status: "DRAFT" });
  result.changed++;
  await putPlanEvent(plan.planId, "draft_applied", RUNNER, { detail: { rows: applied.rows.length, added: applied.added, seeds: applied.seeds, unread: parsed.unread.length, dropped } });
  // 自律実行: confirmed right after this step (the confirmation takes the plan's lease, which this step holds)
  if (isAutonomous(plan)) result.autoConfirm = true;
}

// --- re-plan (plans ordered automatically) ---------------------------------------------------------------------------

/** At most this many uc.json files are read per step (more than a wave can hold, so a whole wave is read at once). */
const USED_ANCHOR_READS = 20;

/**
 * Finished rows learn the anchors their project actually used (the descriptors in its uc.json). Newest first, so a row
 * whose uc.json gives none (it is read again later) never holds up the rows of the wave that has just finished.
 */
async function readUsedAnchors(plan: PlanRecord, rows: PlanRowRecord[]) {
  const due = rows
    .filter((r) => r.state === "done" && r.projectId && !r.existing && r.anchorsSource !== "used")
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1))
    .slice(0, USED_ANCHOR_READS);
  for (const row of due) {
    const P = row.projectId!;
    let text: string | null;
    try {
      text = await getObjectText(plan.ownerUserId, P, `workspace/${P}_HCD/${HCD_FILES.uc}`);
    } catch (e) {
      console.warn(`[plan ${plan.planId}] uc.json of ${P} not readable`, e instanceof Error ? e.message : e);
      continue;
    }
    let anchors: string[] = [];
    try {
      anchors = text ? anchorsOfUcJson(JSON.parse(text)) : [];
    } catch {
      anchors = [];
    }
    if (!anchors.length) continue;
    if (await updateRow(plan.planId, row.rowId, { anchors, anchorsSource: "used" }, { state: "done" })) Object.assign(row, { anchors, anchorsSource: "used" });
  }
}

/**
 * Once the active wave is finished (nothing of it or before waits or runs) and rows that have not started wait in later
 * waves, those rows are ordered again from the next wave with the anchors known now (once per wave), and a re-plan job
 * is asked for proposals when enough rows have finished since the last one (`replanJobDue`).
 */
async function replanAfterWave(plan: PlanRecord, rows: PlanRowRecord[], limits: () => Promise<EffectiveLimits>) {
  const active = plan.activeWave;
  if (active === null || active === undefined || plan.lastReplanWave === active) return;
  // with a Canon a row is finished once its PR is approved (done): until then its uc.json is not read as used anchors
  const unfinished = (r: PlanRowRecord) => r.state === "pending" || IN_FLIGHT_ROW_STATES.includes(r.state) || (!!plan.canonId && (r.state === "review" || r.state === "decision"));
  if (rows.some((r) => r.wave <= active && unfinished(r))) return;
  if (!rows.some((r) => isMovableRow(r) && r.wave > active)) return;
  let moved = 0;
  for (const [rowId, wave] of replanRows(rows, active, (await limits()).effective)) {
    const row = rows.find((r) => r.rowId === rowId)!;
    if (await updateRow(plan.planId, rowId, { wave }, { state: "pending" })) {
      row.wave = wave;
      moved++;
    }
  }
  const values: Partial<PlanRecord> = { lastReplanWave: active };
  const lastJobWave = plan.replan?.wave ?? null;
  // proposals are asked for once enough rows have finished since the last re-plan job (not after every wave)
  if (!isOpenPlanJob(plan.replan) && replanJobDue(rows, active, lastJobWave)) {
    values.replan = { kind: "replan", jobId: null, status: "waiting", requestedAt: nowIso(), requestedBy: RUNNER, wave: active, locale: plan.settings.locale };
  }
  await updatePlan(plan.planId, values);
  Object.assign(plan, values);
  await putPlanEvent(plan.planId, "replanned", RUNNER, { detail: { wave: active, moved } });
}

/** The re-plan job ended without proposals; the plan goes on. */
async function endReplan(plan: PlanRecord, r: PlanJobState, status: "failed" | "cancelled", error: string | null, event = true, errorCode: GateCode | null = null) {
  plan.replan = { ...r, status, error, errorCode, endedAt: nowIso() };
  await updatePlan(plan.planId, { replan: plan.replan });
  if (event) await putPlanEvent(plan.planId, "replan_failed", RUNNER, { detail: { error: (error ?? "").slice(0, 300), status } });
}

/**
 * Follows a queued or running re-plan job; its proposals are stored when it completes (also while paused). True when
 * an autonomous plan applied proposals (its rows changed).
 */
async function followReplan(plan: PlanRecord, result: AdvanceResult): Promise<boolean> {
  const r = plan.replan!;
  const p = planJobProgress(await readPlanJob(plan.planId, r.jobId));
  if (p.to === "queued") return false;
  if (p.to === "running") {
    if (r.status !== "running") {
      plan.replan = { ...r, status: "running" };
      await updatePlan(plan.planId, { replan: plan.replan });
    }
    return false;
  }
  result.changed++;
  if (p.to !== "completed") {
    await endReplan(plan, r, p.to, p.error);
    return false;
  }
  const parsed = await readPlanResult(plan.planId, "replan", r.jobId!);
  if (!parsed) {
    await endReplan(plan, r, "failed", "The result of the re-plan job could not be read.");
    return false;
  }
  const n = await storeProposals(plan.planId, r.jobId!, r.wave ?? null, parsed, RUNNER);
  // 自律実行: the Orchestrator applies its own proposals (rows added or left out) at once, before the job is marked
  // done, so a step that stops in between stores (the same IDs) and applies them again at the next step
  const applied = n && isAutonomous(plan) ? await applyProposals(plan, r.jobId!) : 0;
  plan.replan = { ...r, status: "done", error: null, dropped: parsed.dropped, endedAt: nowIso() };
  await updatePlan(plan.planId, { replan: plan.replan });
  await putPlanEvent(plan.planId, "proposals_received", RUNNER, { detail: { n, wave: r.wave ?? null } });
  return applied > 0;
}

/** A re-plan that has not ended is of no use once the plan is over: its job is stopped. */
export async function dropReplan(plan: PlanRecord, reason: string) {
  const r = plan.replan;
  if (!isOpenPlanJob(r)) return;
  if (openJob(r)) await stopPlanJob(plan.planId, r.jobId, reason);
  await endReplan(plan, r, "cancelled", null, false);
}

// --- 自律実行 (autonomous run) ------------------------------------------------------------------------------------

/** Whether the autonomous plan has spent its cost limit (recorded once, with an event, when it is first reached). */
async function costLimitReached(plan: PlanRecord, rows: PlanRowRecord[], projects: Map<string, ProjectRecord>): Promise<boolean> {
  const max = plan.settings.autonomous?.maxCostUsd;
  if (typeof max !== "number") return false;
  const spent = await planSpendUsd(plan, rows, projects);
  if (spent < max) return false;
  if (!plan.costLimitAt) {
    const at = nowIso();
    if (await updatePlan(plan.planId, { costLimitAt: at })) {
      plan.costLimitAt = at;
      await putPlanEvent(plan.planId, "cost_limit_reached", RUNNER, { detail: { spentUsd: spent, maxCostUsd: max } });
    }
  }
  return true;
}

/**
 * The row job of a row is dropped: its row moved on (`failed` null), or the job failed (its error): then the next one
 * is asked after a back-off (`orchestratorRetry`), so a job that keeps failing at once (a key out of quota) is not
 * queued again every minute.
 */
async function clearRowJob(plan: PlanRecord, row: PlanRowRecord, failed: string | null): Promise<boolean> {
  const values: Partial<PlanRowRecord> = { rowJob: null, ...(failed ? { orchestratorRetry: nextRetry(row, failed) } : {}) };
  if (failed) console.warn(`[plan ${plan.planId}] row ${row.rowId}: the Orchestrator's ${row.rowJob?.kind} job failed: ${failed.slice(0, 300)}`);
  if (!(await updateRow(plan.planId, row.rowId, values, { state: row.state }))) return false;
  Object.assign(row, values);
  return true;
}

/** One more failed Orchestrator job for the row: counted, with the time from which the next one is asked. */
const nextRetry = (row: PlanRowRecord, error: string | null): NonNullable<PlanRowRecord["orchestratorRetry"]> => {
  const n = (row.orchestratorRetry?.n ?? 0) + 1;
  return { n, at: new Date(Date.now() + orchestratorRetryDelayMs(n)).toISOString(), error: error ? error.slice(0, 500) : null };
};

/**
 * 自律実行: follows the Orchestrator's AI job of a row (also while the plan is paused). A job that failed or was stopped
 * is dropped (the row asks again at a later step, within the cost limit); a resolution is applied at once; an answer
 * waits for a free slot (`giveAnswer`), since the resumed project job takes one. A job whose row has left the state it
 * was for (the owner answered or decided meanwhile) is dropped.
 */
async function followRowJob(plan: PlanRecord, row: PlanRowRecord, p: ProjectRecord | null): Promise<boolean> {
  const rj = row.rowJob!;
  if (rj.status !== "queued") return false;
  const progress = planJobProgress(await readPlanJob(plan.planId, rj.jobId));
  if (progress.to === "queued" || progress.to === "running") return false;
  if (progress.to !== "completed") return clearRowJob(plan, row, progress.error);
  const forState = rj.kind === "answer" ? row.state === "question" : row.state === "attention" || row.state === "decision";
  if (!forState) return clearRowJob(plan, row, null);
  const r = await readRowJobResult(plan.planId, rj.jobId, rj.kind, row.rowId);
  if (!r) return clearRowJob(plan, row, "The result of the job could not be read.");
  if (r.decision.kind === "resolve") return applyResolution(plan, row, p, r.decision, rj.jobId);
  const ready = { rowJob: { ...rj, status: "ready" as const }, orchestratorRetry: null };
  if (!(await updateRow(plan.planId, row.rowId, ready, { state: row.state }))) return false;
  Object.assign(row, ready);
  return true;
}

/**
 * 自律実行: gives the answer of the Orchestrator's AI to the row's agent (the project job resumes and takes a slot).
 * The answer is for the question it was asked about; a project that no longer waits on it gets none (the row asks again
 * if it waits on another question). True when a job was resumed.
 */
async function giveAnswer(plan: PlanRecord, row: PlanRowRecord, p: ProjectRecord | null, owner: UserRecord, gate: PlanGate): Promise<boolean> {
  const rj = row.rowJob!;
  const r = await readRowJobResult(plan.planId, rj.jobId, "answer", row.rowId);
  const sameQuestion = !!p?.pendingQuestion && (r?.input.project?.question ?? "").slice(0, 200) === p.pendingQuestion.trim().slice(0, 200);
  if (!r || r.decision.kind !== "answer" || !p || p.status !== "WAITING_USER_INPUT" || row.state !== "question" || !sameQuestion) {
    await clearRowJob(plan, row, r ? null : "The result of the job could not be read.");
    return false;
  }
  const d = r.decision;
  let answered = false;
  try {
    answered = await answerQuestion(owner, p, gate.policy, orchestratorAnswerText(d), { source: "auto", locale: plan.settings.locale });
  } catch (e) {
    console.error(`[plan ${plan.planId}] row ${row.rowId}: the question could not be answered`, errorText(e));
  }
  if (!answered) {
    await clearRowJob(plan, row, null);
    return false;
  }
  const n = (row.autoAnswers ?? 0) + 1;
  await setRow(plan, row, "running", { autoAnswers: n, rowJob: null }, "row_auto_answered", { n, jobId: rj.jobId, answer: d.answer.slice(0, 300), reason: d.reason.slice(0, 300) });
  return true;
}

/**
 * 自律実行: applies the resolution of the Orchestrator's AI to a row that needs attention (retry / skip) or a decision
 * (done / push / skip), as the owner's buttons would. A choice that no longer applies (the project is no longer
 * finished for a push) is dropped and asked again.
 */
async function applyResolution(plan: PlanRecord, row: PlanRowRecord, p: ProjectRecord | null, d: { action: PlanRowAction; reason: string }, jobId: string): Promise<boolean> {
  const from = row.state as "attention" | "decision";
  const cause = from === "attention" ? (row.attentionReason ?? null) : (row.decisionReason ?? null);
  const at = nowIso();
  const base: Partial<PlanRowRecord> = { rowJob: null, orchestratorRetry: null, aiResolution: { action: d.action, reason: d.reason.slice(0, 600), at, jobId } };
  let ok: boolean;
  if (d.action === "skip") {
    ok = await setRow(plan, row, "skipped", { ...base, autoSkip: { reason: "ai_skipped", at, prNo: row.prNo ?? null, error: d.reason.slice(0, 600) }, claimedAt: null, conform: false, followup: null, aiReview: null }, null);
  } else if (d.action === "retry" && from === "attention") {
    ok = await setRow(plan, row, "pending", { ...base, attentionReason: null, claimedAt: null, aiRetries: (row.aiRetries ?? 0) + 1 }, null);
  } else if (d.action === "done" && from === "decision") {
    ok = await setRow(plan, row, "done", { ...base, completedAt: at, lastError: null }, null);
  } else if (d.action === "push" && from === "decision" && p && !isProjectDeleted(p) && p.status === "COMPLETED") {
    // pushed again on the next step, as the owner's 「もう一度 push」
    ok = await setRow(plan, row, "running", { ...base, decisionReason: null, lastError: null, claimedAt: null }, null);
  } else return clearRowJob(plan, row, null);
  if (ok) await putPlanEvent(plan.planId, "row_ai_resolved", RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), detail: { action: d.action, from, cause, reason: d.reason.slice(0, 300), jobId } });
  return ok;
}

/** 自律実行: the re-plan proposals of a job are applied at once (the Orchestrator decides for the owner). */
async function applyProposals(plan: PlanRecord, jobId: string): Promise<number> {
  let applied = 0;
  // read strongly consistent: the proposals were stored a moment ago
  for (const p of (await listProposals(plan.planId, true)).filter((x) => x.status === "open" && x.jobId === jobId)) {
    const o = await applyProposal(plan, p, RUNNER);
    if (o.ok) applied++;
    else if ("full" in o) await updateProposal(plan.planId, p.proposalId, { status: "stale" }, { status: "open" });
  }
  return applied;
}

// --- flow scheduling (plans ordered automatically) --------------------------------------------------------------------

/** A job of the plan's own Orchestrator (a draft, re-plan or row job, or a review / decision of one of its pull requests). */
const isControlJob = (j: JobRecord, planId: string) => (j.type === "plan" && j.projectId === planId) || (j.type === "canon-review" && j.planId === planId);

/**
 * The rows of a flow plan that may start now, in start order (`flowPlan`): with a Canon, only rows that resume (retries
 * and follow-ups) while `PLAN_MAX_WAITING_PRS` pull requests wait; in an autonomous plan, no more rows than its cost
 * limit leaves room for (`rowsWithinCost`, half a row kept for each row being built).
 */
async function flowCandidates(plan: PlanRecord, rows: PlanRowRecord[], projects: Map<string, ProjectRecord>, withCanon: boolean): Promise<PlanRowRecord[]> {
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  let out = flowPlan(rows).ready.map((id) => byId.get(id)!);
  if (withCanon && waitingPrs(rows) >= PLAN_MAX_WAITING_PRS) out = out.filter((r) => !!r.projectId);
  const max = plan.settings.autonomous?.maxCostUsd;
  if (typeof max === "number" && out.length) {
    const finished = rows.filter((r) => r.state === "done" && r.projectId && !r.existing).map((r) => projects.get(r.projectId!)?.costUsd ?? 0);
    const inFlight = rows.filter((r) => IN_FLIGHT_ROW_STATES.includes(r.state) || r.state === "question").length;
    out = out.slice(0, rowsWithinCost({ maxCostUsd: max, spentUsd: await planSpendUsd(plan, rows, projects), inFlight, perRowUsd: perRowCostUsd(finished) }));
  }
  return out;
}

/**
 * A flow plan asks a re-plan job for proposals once its first row is done, then each time a tenth of the rows it builds
 * (at least one) have finished since the last one; the rows are not re-ordered (they start by `flowPlan`'s order, which
 * already uses the anchors the finished rows actually used).
 */
async function replanAfterProgress(plan: PlanRecord, rows: PlanRowRecord[]) {
  if (isOpenPlanJob(plan.replan)) return;
  const done = rows.filter((r) => r.state === "done" && !r.existing).length;
  if (!flowReplanDue(rows, plan.replanDone ?? null)) return;
  const values: Partial<PlanRecord> = {
    replanDone: done,
    lastReplanWave: plan.activeWave ?? null,
    replan: { kind: "replan", jobId: null, status: "waiting", requestedAt: nowIso(), requestedBy: RUNNER, wave: plan.activeWave ?? null, locale: plan.settings.locale },
  };
  await updatePlan(plan.planId, values);
  Object.assign(plan, values);
}

// --- step ------------------------------------------------------------------------------------------------------------

/**
 * One step of a plan (see the file comment). The first read only supplies the lease to take (it may lag behind another
 * step); the step then works on strongly consistent reads of the plan, its rows and its plan jobs.
 */
export async function advancePlan(planId: string, now = Date.now()): Promise<AdvanceResult> {
  const result: AdvanceResult = { planId, started: [], changed: 0 };
  // consistent, so a kick right after a request (e.g. a draft asked for) is never skipped as inactive on a lagging read
  const seen = await getPlan(planId, true);
  if (!seen || seen.deletedAt || !RUNNER_PLAN_STATUSES.includes(seen.status)) return { ...result, skipped: "inactive", status: seen?.status };
  const lease = await acquirePlanLease(seen, PLAN_LEASE_MS);
  if (!lease) return { ...result, skipped: "busy", status: seen.status };
  try {
    const plan = await getPlan(planId, true);
    if (!plan || plan.deletedAt || !RUNNER_PLAN_STATUSES.includes(plan.status)) return { ...result, skipped: "inactive", status: plan?.status };
    const owner = await getUser(plan.ownerUserId);
    if (plan.status === "DRAFTING") {
      await stepDraft(plan, owner, now, result);
      return { ...result, status: plan.status };
    }
    const rows = await listRows(planId, true);
    const projects = new Map((await listUserProjects(plan.ownerUserId)).map((p) => [p.projectId, p]));
    let limitsRead: Promise<EffectiveLimits> | null = null;
    const limits = () => (limitsRead ??= currentLimits(now));

    // a plan with a Canon reads it once per step; plans without one read none
    const cs: CanonStep | null = plan.canonId ? { canon: await ownedCanon(plan.canonId, plan.ownerUserId), owner } : null;
    for (const row of rows.filter((r) => TRACKED_ROW_STATES.includes(r.state))) {
      if (await syncTracked(plan, row, row.projectId ? (projects.get(row.projectId) ?? null) : null, now, cs)) result.changed++;
    }
    if (cs) {
      for (const row of rows.filter(followsPr)) if (await followPr(plan, row, cs)) result.changed++;
    }
    for (const row of rows.filter((r) => r.rowJob?.status === "queued")) {
      if (await followRowJob(plan, row, row.projectId ? (projects.get(row.projectId) ?? null) : null)) result.changed++;
    }
    // proposals the Orchestrator applied change the rows: the step goes on with them
    if (openJob(plan.replan) && (await followReplan(plan, result))) rows.splice(0, rows.length, ...(await listRows(planId, true)));

    if (plan.status === "RUNNING") {
      const flow = isFlowPlan(plan);
      if (plan.ordering === "auto") {
        await readUsedAnchors(plan, rows);
        if (flow) await replanAfterProgress(plan, rows);
        else await replanAfterWave(plan, rows, limits);
      }
      // with a Canon: each seed holds the later waves until its pull request is approved, and too many waiting pull
      // requests hold back a new wave. A flow plan has no wave barrier: its active wave is only the earliest unfinished one
      const wave = flow
        ? flowActiveWave(rows, plan.activeWave ?? null)
        : cs
          ? nextActiveWave(rows, plan.activeWave ?? null, { seedGate: true, holdNewWave: waitingPrs(rows) >= PLAN_MAX_WAITING_PRS })
          : nextActiveWave(rows, plan.activeWave ?? null);
      if (wave !== (plan.activeWave ?? null)) {
        await updatePlan(planId, { activeWave: wave });
        plan.activeWave = wave;
        if (wave !== null) await putPlanEvent(planId, "wave_started", RUNNER, { detail: { wave } });
      }
      // 自律実行: no new row, follow-up, resolution or re-plan starts once the plan spent its cost limit; running rows,
      // the answers to their questions and the decisions on their pull requests go on, and the plan pauses once nothing
      // is left in flight
      const auto = isAutonomous(plan);
      const capped = auto && (await costLimitReached(plan, rows, projects));
      const candidates = capped
        ? []
        : flow
          ? await flowCandidates(plan, rows, projects, !!cs)
          : cs
            ? oneSeedAtATime(rows, rowsToStart(rows, wave, PLAN_LIMITS.maxRows))
            : rowsToStart(rows, wave, PLAN_LIMITS.maxRows);
      const replanWaits = !capped && plan.replan?.status === "waiting";
      // a decision job that failed waits for its back-off before it is asked again
      const reviewsWanted = cs?.canon ? rows.filter((r) => r.state === "review" && r.aiReview === "wanted" && retryDue(r, now)) : [];
      const projectOf = (r: PlanRowRecord) => (r.projectId ? (projects.get(r.projectId) ?? null) : null);
      // 自律実行: answers ready to be given, then the row jobs to ask for (answers first)
      const answers = auto ? rows.filter((r) => r.rowJob?.kind === "answer" && r.rowJob.status === "ready") : [];
      const rowJobs = auto
        ? rows
            .map((r) => ({ row: r, kind: rowJobWanted(r, projectOf(r), canonMissing, now) }))
            .filter((x): x is { row: PlanRowRecord; kind: PlanRowJobKind } => !!x.kind && !(capped && x.kind === "resolve"))
            .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "answer" ? -1 : 1))
        : [];
      const inFlight = rows.some((r) => IN_FLIGHT_ROW_STATES.includes(r.state) || r.state === "question" || (r.state === "review" && !!r.aiReview) || !!r.rowJob);
      if (capped && !inFlight) {
        await pauseFor(plan, "cost_limit");
        result.pausedReason = "cost_limit";
      } else if (cs && !cs.canon && candidates.length) {
        // the Canon was deleted: a new row could not join it, so nothing starts until the owner resolves it
        await pauseFor(plan, "canon_missing");
        result.pausedReason = "canon_missing";
      } else if (candidates.length || replanWaits || reviewsWanted.length || answers.length || rowJobs.length) {
        const active = await slotJobs();
        let slots = freeSlots(await limits(), active, plan.ownerUserId);
        // a flow plan's own AI jobs hold at most a third of the slots while rows wait to start (no cap otherwise)
        let control = flow && candidates.length ? controlSlotCap((await limits()).effective) - active.filter((j) => isControlJob(j, planId)).length : Infinity;
        if (slots > 0) {
          const gate = await runGate(plan, owner);
          if (!gate.ok) {
            if (replanWaits) await endReplan(plan, plan.replan!, "failed", gateError(gate.reason), true, gateCode(gate.reason));
            await pauseFor(plan, gate.reason);
            result.pausedReason = gate.reason;
          } else {
            // 自律実行: the answers of the Orchestrator's AI are given first (each resumed job takes a slot), then its
            // jobs for the rows that wait on it (questions first), each on a slot of its own
            for (const row of answers) {
              if (slots <= 0) break;
              if ((await getPlan(planId, true))?.status !== "RUNNING") break;
              if (await giveAnswer(plan, row, projectOf(row), owner!, gate)) {
                slots--;
                result.changed++;
              }
            }
            for (const { row, kind } of rowJobs) {
              if (slots <= 0 || control <= 0) break;
              if ((await getPlan(planId, true))?.status !== "RUNNING") break;
              try {
                const input = await rowJobInput(plan, row, rows, kind, newRowJobId(), projectOf(row), cs?.canon ?? null);
                if (!(await queueRowJob(plan, row, input, owner!, gate))) continue;
                slots--;
                control--;
                result.changed++;
                // cancelled while the job was being stored (the cancel found no job to stop yet): stop it now
                if ((await getPlan(planId, true))?.status === "CANCELLED") await stopPlanJob(planId, input.jobId, "plan cancelled");
              } catch (e) {
                console.error(`[plan ${planId}] row ${row.rowId}: the Orchestrator's ${kind} job could not be queued`, errorText(e));
                await clearRowJob(plan, row, null);
              }
            }
            // the re-plan job takes its slot before more rows start
            if (replanWaits && slots > 0 && control > 0 && (await getPlan(planId, true))?.status === "RUNNING") {
              try {
                const state = await queuePlanJob(plan, "replan", plan.replan!, rows, owner!, gate, (await limits()).effective);
                if (state) {
                  result.planJob = state.jobId ?? undefined;
                  slots--;
                  control--;
                  // cancelled while the job was being stored (the cancel found no job to stop yet): stop it now
                  if ((await getPlan(planId, true))?.status === "CANCELLED") await stopPlanJob(planId, state.jobId, "plan cancelled");
                }
              } catch (e) {
                console.error(`[plan ${planId}] re-plan job could not be queued`, e);
                const fresh = await getPlan(planId, true);
                if (fresh?.replan?.status === "waiting") await endReplan(plan, fresh.replan, "failed", "The re-plan job could not be queued.");
              }
            }
            // then the AI reviews of body rows' pull requests, each on a slot of its own
            for (const row of reviewsWanted) {
              if (slots <= 0 || control <= 0) break;
              if ((await getPlan(planId, true))?.status !== "RUNNING") break;
              if (!(await requestRowReview(plan, row, cs!.canon!, owner!, gate))) continue;
              slots--;
              control--;
              result.changed++;
            }
            for (const row of candidates) {
              if (slots <= 0) break;
              // stop as soon as the owner pauses or cancels the plan
              if ((await getPlan(planId, true))?.status !== "RUNNING") break;
              if (!(await startRow(plan, row, owner!, gate, cs))) continue;
              slots--;
              result.started.push(row.rowId);
              result.changed++;
              if ((await getPlan(planId, true))?.status === "CANCELLED") {
                // cancelled while this row was starting: stop what was just queued
                const p = row.projectId ? await getProject(plan.ownerUserId, row.projectId) : null;
                if (p && ACTIVE_PROJECT_STATUSES.includes(p.status)) await stopProject(p, "plan");
                await updateRow(planId, row.rowId, { state: "cancelled" }, { state: row.state });
                break;
              }
            }
          }
        }
      }
    }
    if ((plan.status === "RUNNING" || plan.status === "PAUSED") && planFinished(rows) && (await setPlanStatus(planId, plan.status, "COMPLETED", { completedAt: nowIso(), pausedReason: null }))) {
      plan.status = "COMPLETED";
      await putPlanEvent(planId, "completed", RUNNER);
      await dropReplan(plan, "plan completed");
    }
    const counts = countRows(rows);
    if (PLAN_ROW_STATES.some((st) => counts[st] !== plan.rowCounts?.[st]) || plan.rowCount !== rows.length) await updatePlan(planId, { rowCounts: counts, rowCount: rows.length });
    return { ...result, status: plan.status };
  } finally {
    await releasePlanLease(planId, lease).catch((e) => console.warn(`[plan ${planId}] lease release failed`, e));
  }
}
