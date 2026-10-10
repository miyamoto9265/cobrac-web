// ---------------------------------------------------------------------------
// BRA Planner (UI: 「BRA Planner」, one unit is a 「計画」 / "plan"). A plan is a list of rows (ROI × TLF) that the
// system builds as projects in waves, within the concurrency limits, after its owner confirms it. Rows come from CSV or
// manual input (stage 1) or from a draft written by a `plan` job (stage 2, see planJob.ts); the build order is set by
// hand or computed from the rows' anchors (planOrder.ts), and auto-ordered plans are re-planned after each wave.
//
// The runner (packages/api/src/handlers/planRunner.ts) advances every running plan by small idempotent steps. The
// decisions it takes are the pure functions at the end of this file, so they can be tested without AWS.
// ---------------------------------------------------------------------------

import type { FileAttachment } from "./attachments.js";
import { parseCsv } from "./csv.js";
import type { UiLocale } from "./locale.js";
import { randomCrockfordId } from "./projectId.js";
import type { PipelineStage, ProjectRecord, ProjectStatus, ReasoningEffort, StepState, WorkflowStep } from "./types.js";

/** Random plan IDs: `n` + 7 lower-case Crockford base32 (`n4h8w2rk`). Neither a Project ID nor a Canon ID. */
export const PLAN_ID_REGEX = /^n[0-9a-hjkmnp-tv-z]{7}$/;
export const isPlanId = (id: string): boolean => PLAN_ID_REGEX.test(id);
/** A new random plan ID; uniqueness is checked when it is reserved (Catalog `id` row, like Project and Canon IDs). */
export function generatePlanId(random?: () => number): string {
  return randomCrockfordId("n", random);
}
/** Row IDs are unique within their plan: `r` + 7 base32. */
export const PLAN_ROW_ID_REGEX = /^r[0-9a-hjkmnp-tv-z]{7}$/;
export function generatePlanRowId(random?: () => number): string {
  return randomCrockfordId("r", random);
}

// --- limits ----------------------------------------------------------------------------------------------------------

export const PLAN_LIMITS = {
  maxRows: 200,
  maxRoi: 300,
  maxTlf: 300,
  maxRationale: 1000,
  maxGoal: 4000,
  maxName: 200,
  maxWave: 99,
  minPriority: -1000,
  maxPriority: 1000,
  /** Size of a CSV accepted for import (characters) */
  maxCsvChars: 500_000,
} as const;

/** Automatic retries of a failed row before it needs attention (「要対応」). */
export const MAX_ROW_AUTO_RETRIES = 2;
/** A row whose start was claimed but not finished (the runner stopped in between) is started again after this long. */
export const ROW_START_STALE_MS = 2 * 60 * 1000;
/** How long one runner invocation holds a plan (a second invocation skips the plan meanwhile). */
export const PLAN_LEASE_MS = 90 * 1000;

// --- records ---------------------------------------------------------------------------------------------------------

/** DRAFTING: a draft that waits for (or runs) its `plan` job; its rows cannot be edited meanwhile. */
export type PlanStatus = "DRAFT" | "DRAFTING" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export const PLAN_STATUSES: readonly PlanStatus[] = ["DRAFT", "DRAFTING", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED"];
/** Statuses the runner advances every minute. */
export const RUNNER_PLAN_STATUSES: readonly PlanStatus[] = ["DRAFTING", "RUNNING", "PAUSED"];

/** Why a plan is paused: by its owner, or by the runner because the owner can no longer start jobs. */
/** canon_missing (stage 3): the plan's Canon was deleted; no row starts until it is resolved (rows could not join it). */
/** cost_limit (自律実行): the plan spent its cost limit; the owner raises the limit to resume it. */
export type PlanPauseReason = "user" | "no_key" | "owner_disabled" | "model_not_allowed" | "canon_missing" | "cost_limit";

/**
 * pending: waits for its turn (with `projectId`: a retry of that project). starting: the runner claimed it and is
 * creating its project. running: its project has a job queued or running. question: its agent asked a question
 * (only this row waits). done: its project completed (in a plan with a Canon: its pull request was approved into the
 * Canon, or a human resolved it). attention: needs a human (「要対応」). skipped: left out by the owner. cancelled: stopped
 * when the plan was cancelled. Plans with a Canon (stage 3) add review: its pull request is open and waits for a human
 * (「承認待ち」), and decision: a human must decide what happens to it (「人の判断」), e.g. conflicts the automatic
 * conform follow-ups did not fix.
 */
export type PlanRowState = "pending" | "starting" | "running" | "question" | "done" | "attention" | "skipped" | "cancelled" | "review" | "decision";
export const PLAN_ROW_STATES: readonly PlanRowState[] = ["pending", "starting", "running", "question", "done", "attention", "skipped", "cancelled", "review", "decision"];
/** Rows whose project has a job queued or running: they hold the current wave. */
export const IN_FLIGHT_ROW_STATES: readonly PlanRowState[] = ["starting", "running"];
/** Rows with a project the runner keeps in step with. */
export const TRACKED_ROW_STATES: readonly PlanRowState[] = ["starting", "running", "question"];

export type PlanAttentionReason = "failed" | "question_timeout" | "cancelled_outside" | "project_deleted" | "start_failed";

/**
 * Why a row of a plan with a Canon needs a human decision (「人の判断」): conflicts: its pull request has error
 * conflicts that are not caused by the Canon moving on; conform_limit: still error conflicts after
 * `MAX_CONFORM_FOLLOWUPS` conform follow-ups; pr_rejected / pr_withdrawn: its pull request was closed without approval;
 * other_canon: its (existing) project belongs to another Canon; push_failed: the push could not be made.
 */
export type PlanDecisionReason = "conflicts" | "conform_limit" | "pr_rejected" | "pr_withdrawn" | "other_canon" | "push_failed";

/**
 * Why an autonomous plan (自律実行) left a row out: ai_rejected (the AI reviewer rejected its pull request) or ai_skipped
 * (the Orchestrator's AI chose 「スキップ」 for a row that needed attention or a decision; `error` holds its reason).
 * v0.40.0 also left rows out for the reasons a row needs a human, question_limit and decide_failed: kept for its records.
 */
export type PlanAutoSkipReason = PlanDecisionReason | PlanAttentionReason | "ai_rejected" | "ai_skipped" | "question_limit" | "decide_failed";

/**
 * A job the Orchestrator's AI runs for one row of an autonomous plan (a `plan` job): answer = it answers the question of
 * the row's agent; resolve = it decides a row that needs attention (retry / skip) or a decision (done / push / skip).
 */
export type PlanRowJobKind = "answer" | "resolve";
/** What the Orchestrator's AI may choose for a row (resolve): attention → retry / skip; decision → done / push / skip. */
export type PlanRowAction = "retry" | "skip" | "done" | "push";

/**
 * The row job of a row: queued (its job ID; one job per row at a time) or ready (an answer job finished; the answer is
 * given when a slot is free, since the resumed project job takes one). A job that failed is cleared and asked again.
 */
export interface PlanRowJob {
  kind: PlanRowJobKind;
  jobId: string;
  status: "queued" | "ready";
  requestedAt: string;
}

/** The Canon of a plan, chosen in a draft: none, one of the owner's Canons, or a new one created at confirmation. */
export type PlanCanonChoice = { mode: "none" } | { mode: "existing"; canonId: string } | { mode: "new"; name: string };

/** Settings every row's project (and the Orchestrator's own jobs) is created with; fixed when the plan is confirmed. */
export interface PlanSettings {
  /** Model the rows run on: chosen, or resolved from the defaults at confirmation (null before) */
  model: string | null;
  /** True when the owner picked `model`; a picked model the owner may no longer use pauses the plan instead of being replaced */
  modelChosen: boolean;
  /**
   * Model of the Orchestrator's own jobs (drafts, re-plans, AI reviews of the rows' pull requests): chosen, or resolved
   * from the defaults at confirmation (null before). Absent on plans made before it could be chosen: they use `model`.
   */
  orchestratorModel?: string | null;
  /** True when the owner picked `orchestratorModel` (as `modelChosen`) */
  orchestratorModelChosen?: boolean;
  reasoningEffort: ReasoningEffort | null;
  researchMode: boolean;
  /** Language of the agents' chat replies (the UI language at confirmation) */
  locale: UiLocale | null;
  /**
   * 自律実行 (autonomous run): the Orchestrator acts for the owner, so the plan goes from its draft to the end without
   * waiting for a person. The draft is confirmed on its own, the Orchestrator's AI answers the agents' questions, decides
   * on the plan's pull requests and on rows that need attention or a decision, re-plan proposals are applied at once,
   * and no new row starts once `maxCostUsd` is spent. Absent = off.
   */
  autonomous?: PlanAutonomous | null;
}

export interface PlanAutonomous {
  /** No new row (or follow-up) starts once the plan has spent this much (USD, estimated); running rows finish */
  maxCostUsd: number;
}

/** Default cost limit of an autonomous plan, and the range the owner may set. */
export const AUTONOMOUS_DEFAULT_MAX_COST_USD = 20;
export const AUTONOMOUS_MAX_COST_RANGE = { min: 1, max: 1000 } as const;
/** Follow-ups a row of an autonomous plan gets for its pull request (conform, fix and the AI's requested changes together). */
export const AUTONOMOUS_MAX_FOLLOWUPS = 3;

export const isAutonomous = (p: { settings: Pick<PlanSettings, "autonomous"> }): boolean => !!p.settings.autonomous;

/** A cost limit as the owner sent it: a number within `AUTONOMOUS_MAX_COST_RANGE` (cents kept), else null. */
export function autonomousMaxCost(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < AUTONOMOUS_MAX_COST_RANGE.min || v > AUTONOMOUS_MAX_COST_RANGE.max) return null;
  return Math.round(v * 100) / 100;
}

/** The Orchestrator's model and whether the owner picked it; plans made before it could be chosen use the rows' model. */
export function orchestratorModelOf(s: PlanSettings): { model: string | null; chosen: boolean } {
  return s.orchestratorModel === undefined ? { model: s.model, chosen: s.modelChosen } : { model: s.orchestratorModel, chosen: !!s.orchestratorModelChosen };
}

export const PLAN_META_SK = "META";
export const PLAN_ROW_PREFIX = "ROW#";
export const PLAN_EVENT_PREFIX = "EVT#";
export const PLAN_PROPOSAL_PREFIX = "PROP#";
export const planRowSk = (rowId: string) => `${PLAN_ROW_PREFIX}${rowId}`;
export const planEventSk = (at: string, nonce: string) => `${PLAN_EVENT_PREFIX}${at}#${nonce}`;
export const planProposalSk = (proposalId: string) => `${PLAN_PROPOSAL_PREFIX}${proposalId}`;
/** Proposal IDs are unique within their plan: `q` + 7 base32. */
export const PLAN_PROPOSAL_ID_REGEX = /^q[0-9a-hjkmnp-tv-z]{7}$/;
export function generatePlanProposalId(random?: () => number): string {
  return randomCrockfordId("q", random);
}

/**
 * How the waves were set. `auto`: computed by `orderPlanRows` (an LLM draft or 「自動で並べる」); the runner re-orders
 * the rows that have not started after each wave. `manual` (absent on stage-1 plans): the owner's waves are kept.
 */
export type PlanOrdering = "manual" | "auto";

/**
 * How the runner starts rows. waves: a wave starts once the earlier ones are finished (plans ordered by hand, and plans
 * confirmed before flow scheduling). flow: every row that may start now starts on a free slot, whatever its wave (see
 * planFlow.ts); waves only set the order.
 */
export type PlanScheduling = "waves" | "flow";
export const isFlowPlan = (p: Pick<PlanRecord, "scheduling">) => p.scheduling === "flow";

/** Why a waiting row has not started (computed on read): what it waits for, and the rows it waits on. */
export type PlanRowWaitKind = "dependency" | "seed" | "overlap" | "slot" | "prs" | "cost";
export interface PlanRowWait {
  kind: PlanRowWaitKind;
  rowIds: string[];
}

/** One row the `plan` job could not read from a goal or an attachment, with the reason. */
export interface PlanUnread {
  source: string;
  location: string;
  reason: string;
}

export type PlanJobKind = "draft" | "replan";
/**
 * waiting: requested, not yet queued (the runner queues it when a slot is free, never ahead of one). queued / running:
 * mirrors its job. asking: a draft job asked the owner questions before writing the rows (`qa`); the draft goes on
 * once they answer or skip them. done: its result was applied (draft) or stored as proposals (replan). failed /
 * cancelled: ended without a result (`error`).
 */
export type PlanJobStatus = "waiting" | "queued" | "running" | "asking" | "done" | "failed" | "cancelled";

/** Questions the Orchestrator may ask before it drafts: at most `questions` per round, `rounds` rounds (the first, then follow-ups). */
export const PLAN_ASK_LIMITS = { questions: 3, rounds: 2, choices: 4, question: 300, choice: 120, answer: 1000 } as const;

/** One question of the Orchestrator before a draft, with answers it suggests (the owner may write their own). */
export interface PlanDraftQuestion {
  text: string;
  choices: string[];
}

/** One round of questions before a draft and the owner's answers (null until answered; "" for a question left open). */
export interface PlanDraftRound {
  questions: PlanDraftQuestion[];
  answers: string[] | null;
  askedAt: string;
  answeredAt?: string | null;
  /** The owner chose to go on without answering: no more questions for this draft */
  skipped?: boolean;
}

/** The latest `plan` job of a plan (draft or re-plan), on its `META` item. */
export interface PlanJobState {
  kind: PlanJobKind;
  jobId: string | null;
  status: PlanJobStatus;
  requestedAt: string;
  requestedBy: string;
  queuedAt?: string | null;
  endedAt?: string | null;
  error?: string | null;
  /** Why the job could not be started for the owner (the error text is then English; the page shows this reason) */
  errorCode?: Exclude<PlanPauseReason, "user" | "canon_missing" | "cost_limit"> | null;
  /** 自律実行: draft jobs asked for this draft (a failed one is asked once more) */
  attempt?: number;
  /**
   * 自律実行: the draft was applied while the plan was autonomous, so the runner confirms it. A draft that was not (the
   * run was switched on afterwards) waits for the owner's confirmation as usual.
   */
  autoConfirm?: boolean;
  /** Rows the job could not read (draft) */
  unread?: PlanUnread[];
  /** Items of the result that pointed at rows, anchors or projects not in the input (removed) */
  dropped?: number;
  /** Re-plan: the wave that had just finished */
  wave?: number | null;
  /** Reply language of the job */
  locale?: UiLocale | null;
  /** Draft: the rounds of questions asked before it (the last one is open while `status` is asking) */
  qa?: PlanDraftRound[];
}

export type PlanRowCounts = Record<PlanRowState, number>;

export interface PlanEstimate {
  rows: number;
  seedRows: number;
  waves: number;
  /** Flow plans: lanes of the rows */
  lanes?: number;
  concurrency: number;
  minutes: number;
  costUsd: { min: number; max: number };
}

/** Plans table, `META` item. `ownerUserId` + `createdAt` feed `owner-index`, `status` + `createdAt` feed `status-index` (only META items carry them). */
export interface PlanRecord {
  planId: string;
  sk: typeof PLAN_META_SK;
  ownerUserId: string;
  name: string;
  goal: string;
  status: PlanStatus;
  settings: PlanSettings;
  /** Granularity policy (粒度方針) for the plan's Canon: written by the Orchestrator (the draft, then re-plans), never by the owner */
  policy?: string;
  /** Absent on stage-1 plans = manual */
  ordering?: PlanOrdering;
  /** Set at confirmation: flow for plans ordered automatically; absent = waves */
  scheduling?: PlanScheduling;
  /** Flow plans: rows done when the last re-plan job was asked for (the next one waits for a tenth of the rows more) */
  replanDone?: number | null;
  /** Capability lists (attached at creation or added to the draft), under `plans/{planId}/attachments/files/` (read by the `plan` job) */
  attachments?: FileAttachment[];
  /** Attachments ever added (the next file is `f<n+1>`): a removed file's ID and key are never used again */
  attachmentSeq?: number;
  /** The latest draft job */
  draft?: PlanJobState | null;
  /** The latest re-plan job */
  replan?: PlanJobState | null;
  /** The last wave after which the rows were re-ordered (each wave is re-planned once) */
  lastReplanWave?: number | null;
  /** Stage 3: the plan's Canon (one of the owner's; set when chosen, or when a new one is created at confirmation) */
  canonId?: string | null;
  /** Stage 3: a Canon to create at confirmation (with the plan's policy) */
  canonNew?: { name: string } | null;
  /** Harness rule set of every row's project, fixed at confirmation (`HARNESS_RULES` then) */
  harnessRules?: number | null;
  rowCount: number;
  rowCounts?: PlanRowCounts;
  /** Wave the runner works on: rows of this wave and earlier ones may start (null before confirmation) */
  activeWave?: number | null;
  /** Estimate at confirmation (the screen recomputes it live) */
  estimate?: PlanEstimate | null;
  pausedReason?: PlanPauseReason | null;
  /** 自律実行: when the plan reached its cost limit (no new row starts since then) */
  costLimitAt?: string | null;
  /** 自律実行: why the draft could not be confirmed on its own (the owner confirms it by hand) */
  autonomousError?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  /** A runner invocation works on the plan until then */
  leaseUntil?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRowRecord {
  planId: string;
  sk: string;
  rowId: string;
  /** Position in the plan (ascending); rows of one wave start in this order */
  order: number;
  wave: number;
  roi: string;
  tlf: string;
  rationale: string;
  /** Owner's priority (higher first); breaks ties when rows are ordered automatically */
  priority?: number | null;
  /** csv: a capability list read deterministically; llm: written by the `plan` job; manual: typed in */
  source: "manual" | "csv" | "llm";
  /** Spreadsheet row of the imported CSV (header = 1) */
  sourceRow?: number | null;
  state: PlanRowState;
  projectId?: string | null;
  /** Job created with the project (kept so a start the runner did not finish can be completed without a second project) */
  startJobId?: string | null;
  /** Automatic retries used */
  attempts: number;
  attentionReason?: PlanAttentionReason | null;
  lastError?: string | null;
  claimedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  /** SABRA anchors (`HOMBA:<id>`, `BNA:<l>-<r>`, `BNAG:<L2>`) of the ROI and the expected input / output regions; absent on rows without any */
  anchors?: string[];
  /** predicted: from the draft (RCS); used: the anchors of the descriptors in the finished project's uc.json */
  anchorsSource?: "predicted" | "used";
  /** Rows this one is built from (its function combines theirs); a row with dependencies is never a seed */
  dependsOn?: string[];
  /** In the seed wave (「基準プロジェクト」): built one at a time before the body waves */
  seed?: boolean;
  /** A COMPLETED project of the owner with the same ROI × TLF: the row is not rebuilt (it is done at confirmation) */
  existing?: { projectId: string; name: string } | null;
  /** A project of the owner with the same ROI × TLF that is not finished (warning only) */
  duplicateOf?: string | null;
  /** The owner chose 「作り直す」: the row is built even when a finished project has its ROI × TLF (never matched again) */
  rebuild?: boolean;
  /** Stage 3 (plans with a Canon): the row's open (or last) pull request into the plan's Canon */
  prNo?: number | null;
  /** Canon revision the row's project was pinned to when it started (or re-pinned for a conform follow-up) */
  canonRevision?: number | null;
  /** Conform follow-ups sent (「Canon rev N に合わせて更新」), at most `MAX_CONFORM_FOLLOWUPS` */
  conformAttempts?: number;
  /** A pending row waiting for a slot to send its conform follow-up (its project is re-pinned to the head then) */
  conform?: boolean;
  /** Body rows: the AI review of the row's pull request: wanted (waits for a free slot) or queued (its job ID) */
  aiReview?: "wanted" | "queued" | null;
  aiReviewJobId?: string | null;
  decisionReason?: PlanDecisionReason | null;
  /** 自律実行: the row was left out by the runner (instead of waiting for a human), with the reason */
  autoSkip?: { reason: PlanAutoSkipReason; at: string; prNo?: number | null; error?: string | null } | null;
  /** 自律実行: questions of the row's agent the Orchestrator's AI answered */
  autoAnswers?: number;
  /** 自律実行: decision jobs asked for the row's current pull request */
  decideAttempts?: number;
  /** 自律実行: the Orchestrator's AI job for this row (an answer or a resolution), while it runs or waits for a slot */
  rowJob?: PlanRowJob | null;
  /** 自律実行: the last resolution the Orchestrator's AI made for this row (shown on the row) */
  aiResolution?: { action: PlanRowAction; reason: string; at: string; jobId: string } | null;
  /** 自律実行: how often the Orchestrator's AI chose to retry this row (it sees the count before choosing again) */
  aiRetries?: number;
  /**
   * 自律実行: the Orchestrator's jobs for this row (a row job or a pull request decision) that failed in a row, with the
   * last error; the next one is asked from `at` on (1, 2, 4 … up to 60 minutes later). Cleared when one succeeds.
   */
  orchestratorRetry?: { n: number; at: string; error: string | null } | null;
  /**
   * 自律実行: the instruction of the row's next follow-up (with `conform`): fix = make the project agree with the Canon
   * (error conflicts the Canon moving on did not cause); changes = the changes the AI reviewer asked for. Absent: the
   * usual conform follow-up (the Canon moved on).
   */
  followup?: { kind: "fix" | "changes"; note: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type PlanProposalKind = "add" | "remove" | "policy";
export type PlanProposalStatus = "open" | "accepted" | "rejected" | "stale";

/**
 * A change a re-plan job proposes (`PROP#<proposalId>`). Rows change only when the owner accepts it; a new policy is
 * the Orchestrator's own decision and is stored already accepted, with `decidedBy` "runner".
 */
export interface PlanProposalRecord {
  planId: string;
  sk: string;
  proposalId: string;
  kind: PlanProposalKind;
  /** add: the new row */
  row?: { roi: string; tlf: string; rationale: string; anchors: string[]; dependsOn: string[] } | null;
  /** remove: the row to leave out */
  rowId?: string | null;
  /** policy: the new granularity policy */
  policy?: string | null;
  reason: string;
  status: PlanProposalStatus;
  jobId: string;
  /** The wave after which it was proposed */
  wave: number | null;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export type PlanEventType =
  | "created"
  | "rows_changed"
  | "confirmed"
  | "wave_started"
  | "row_started"
  | "row_question"
  | "row_resumed"
  | "row_done"
  | "row_retry"
  | "row_attention"
  | "row_skipped"
  | "row_cancelled"
  | "paused"
  | "resumed"
  | "cancelled"
  | "completed"
  | "draft_requested"
  | "draft_applied"
  | "draft_failed"
  | "draft_cancelled"
  | "draft_asked"
  | "draft_answered"
  | "ordered"
  | "replanned"
  | "replan_failed"
  | "proposals_received"
  | "proposal_accepted"
  | "proposal_rejected"
  | "canon_created"
  | "row_pushed"
  | "row_conform"
  | "row_decision"
  | "row_resolved"
  | "row_ai_review"
  | "row_auto_skipped"
  | "row_auto_answered"
  | "row_ai_resolved"
  | "row_ai_decided"
  | "cost_limit_reached"
  | "cost_limit_raised";

export interface PlanEventRecord {
  planId: string;
  sk: string;
  type: PlanEventType;
  at: string;
  /** userId of the person, or "runner" */
  by: string;
  rowId?: string;
  projectId?: string;
  detail?: Record<string, string | number | null>;
}

// --- API DTOs --------------------------------------------------------------------------------------------------------

export interface PlanRowInput {
  rowId?: string;
  roi: string;
  tlf: string;
  rationale?: string;
  wave?: number;
  priority?: number | null;
  /** A row that keeps its `rowId` keeps its anchors, dependencies, seed flag and existing project; `rebuild` drops the existing project so the row is built */
  rebuild?: boolean;
}

export interface CreatePlanRequest {
  name: string;
  goal?: string;
  rows?: PlanRowInput[];
  /** CSV / TSV text of a capability list; its rows are appended after `rows` */
  csv?: string;
  /** Capability lists uploaded with POST /uploads (CSV / TSV / text are read at once; xlsx / PDF by the draft job) */
  attachments?: { uploadId: string; name: string }[];
  /** Ask the `plan` job for a draft right away (needs a goal, an attachment or rows) */
  draft?: boolean;
  /** Language of the draft's texts (with `draft`) */
  locale?: UiLocale | null;
  /** 自律実行: run the plan to the end without waiting for a person (needs `draft`); absent = off */
  autonomous?: { maxCostUsd?: number } | null;
  /** The plan's Canon (as PUT /plans/:id); an autonomous plan without one gets a new Canon named after the plan */
  canon?: PlanCanonChoice;
}

/** POST /plans/:id/resume: an autonomous plan paused at its cost limit resumes with a higher limit. */
/** The owner's answers to the questions the Orchestrator asked before drafting (one per question), or `skip` to go on without them. */
export interface AnswerDraftRequest {
  answers?: string[];
  skip?: boolean;
}

export interface ResumePlanRequest {
  maxCostUsd?: number;
}

export interface UpdatePlanRequest {
  name?: string;
  goal?: string;
  /** Draft only: the plan's Canon (stage 3) */
  canon?: PlanCanonChoice;
  settings?: Partial<Pick<PlanSettings, "model" | "orchestratorModel" | "reasoningEffort" | "researchMode" | "autonomous">>;
}

/**
 * POST /plans/:id/attachments (draft only): capability lists uploaded with POST /uploads are added to the plan (up to
 * `ATTACHMENT_LIMITS.maxFiles` in all); CSV / TSV / text are read into rows at once, as on creation.
 */
export interface AddPlanAttachmentsRequest {
  attachments: { uploadId: string; name: string }[];
}
/** POST /plans/:id/attachments and DELETE /plans/:id/attachments/:fileId */
export interface PlanAttachmentsResponse {
  plan: PlanRecord;
  /** The rows read from the added CSV / TSV / text files (already stored) */
  rows: PlanRowRecord[];
  rejected: PlanRowRejected[];
}

/** POST /plans/:id/draft */
export interface DraftPlanRequest {
  locale?: UiLocale | null;
}

export type PlanRowRejectReason = "noRoiTlf" | "tooLong" | "duplicate" | "badWave" | "badPriority" | "tooMany";

export interface PlanRowRejected {
  /** Attached file the row is in (absent for pasted text) */
  file?: string;
  /** Spreadsheet row number (header = 1) */
  row: number;
  reason: PlanRowRejectReason;
  /** Start of the row as read, for the message */
  text: string;
}

export interface CreatePlanResponse {
  plan: PlanRecord;
  rows: PlanRowRecord[];
  rejected: PlanRowRejected[];
}

/** A row with the live state of its project (read on every request; not stored). */
export interface PlanRowView extends PlanRowRecord {
  project?: {
    name: string;
    status: ProjectStatus;
    pendingQuestion: string | null;
    costUsd: number | null;
    revision: number;
    errorMessage: string | null;
    deleted: boolean;
    /** Harness progress of the project (the stage strip of a row) */
    stepStates?: Record<WorkflowStep, StepState>;
    activeStage?: PipelineStage | null;
    researchMode?: boolean;
  } | null;
  /** Other rows sharing at least one anchor with this one (computed on read) */
  hub?: number;
  /** Other rows sharing at least `OVERLAP_LIMIT` anchors with this one: never in the same wave (computed on read) */
  overlaps?: string[];
  /** Flow plans: the row's lane (computed on read) */
  lane?: number;
  /** Flow plans: why a waiting row has not started (computed on read) */
  wait?: PlanRowWait | null;
}

export interface EffectiveLimits {
  maxConcurrentJobs: number;
  maxConcurrentJobsPerUser: number;
  /** min(global, per user): how many rows of one owner can run at once */
  effective: number;
}

export interface PlanDetailResponse {
  plan: PlanRecord;
  /** Flow plans: slots in use now (the owner's jobs; `orchestrator` of them are the plan's own AI jobs) */
  slots?: { used: number; orchestrator: number; limit: number } | null;
  rows: PlanRowView[];
  events: PlanEventRecord[];
  limits: EffectiveLimits;
  /** Estimate for the rows as they are now (all rows, current waves, current limits) */
  estimate: PlanEstimate;
  /** Time since confirmation (to completion, or now) and the cost of the rows' projects and the plan's own jobs so far */
  actual: { minutes: number | null; costUsd: number | null };
  /** Proposals of re-plan jobs, newest first */
  proposals: PlanProposalRecord[];
  /** Cost of the plan's own jobs (drafts and re-plans) */
  planJobsCostUsd: number | null;
  /** Stage 3: the plan's Canon (null: none; `missing` when it was deleted) */
  canon?: { canonId: string; name: string; headRevision: number; missing?: boolean } | null;
}

/** A row of a live plan in the list: one that runs now or waits on the owner. */
export type PlanPulseRow = Pick<PlanRowView, "rowId" | "roi" | "tlf" | "wave" | "state" | "projectId" | "startedAt" | "decisionReason" | "attentionReason" | "prNo" | "project">;

/** A recent event of a live plan, with the row it is about (the list cannot look the row up). */
export interface PlanPulseEvent extends Pick<PlanEventRecord, "sk" | "type" | "at" | "detail"> {
  row?: { roi: string; tlf: string } | null;
}

/** What a running or paused plan is doing now (the list of plans; read on every request, not stored). */
export interface PlanPulse {
  /** Rows of each wave by state, waves ascending */
  waves: { wave: number; counts: Partial<Record<PlanRowState, number>> }[];
  /** Flow plans: rows of each lane by state, lanes ascending */
  lanes?: { lane: number; counts: Partial<Record<PlanRowState, number>> }[];
  /** Rows being built (starting / running) */
  running: PlanPulseRow[];
  /** Rows that wait on the owner (question / review / decision / attention) */
  waiting: PlanPulseRow[];
  /** Newest events first (at most `PLAN_PULSE_EVENTS`) */
  events: PlanPulseEvent[];
  /** Re-plan proposals still to accept or reject */
  openProposals: number;
  estimate: PlanEstimate;
  actual: PlanDetailResponse["actual"];
}

/** Events a pulse carries. */
export const PLAN_PULSE_EVENTS = 4;

export interface PlanSummary extends PlanRecord {
  rowCounts: PlanRowCounts;
  /** Running and paused plans only */
  pulse?: PlanPulse | null;
}

export interface ListPlansResponse {
  items: PlanSummary[];
}

// --- concurrency setting (admin, Catalog `config` / `concurrency`) ------------------------------------------------------

export const CONCURRENCY_MIN = 1;
export const CONCURRENCY_MAX = 16;
export const CONCURRENCY_CATALOG_KEY = { kind: "config", id: "concurrency" } as const;
/** Lambdas re-read the setting after this long (the dispatcher reads it for every job it starts). */
export const CONCURRENCY_CACHE_MS = 30 * 1000;

export interface ConcurrencySettingRecord {
  kind: typeof CONCURRENCY_CATALOG_KEY.kind;
  id: typeof CONCURRENCY_CATALOG_KEY.id;
  /** null / absent: the deployment value (GitHub Variables → CDK → Lambda environment) */
  maxConcurrentJobs?: number | null;
  maxConcurrentJobsPerUser?: number | null;
  updatedAt: string;
  updatedBy: string;
}

export interface ConcurrencyStatus extends EffectiveLimits {
  setting: { maxConcurrentJobs: number | null; maxConcurrentJobsPerUser: number | null; updatedAt: string | null };
  deployment: { maxConcurrentJobs: number; maxConcurrentJobsPerUser: number };
  min: number;
  max: number;
}

export interface UpdateConcurrencyRequest {
  maxConcurrentJobs?: number | null;
  maxConcurrentJobsPerUser?: number | null;
}

export const isConcurrencyLimit = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= CONCURRENCY_MIN && v <= CONCURRENCY_MAX;

/** Limits in force: the admin setting where it is set (and valid), else the deployment value. */
export function effectiveLimits(setting: Pick<ConcurrencySettingRecord, "maxConcurrentJobs" | "maxConcurrentJobsPerUser"> | null, deployment: { maxConcurrentJobs: number; maxConcurrentJobsPerUser: number }): EffectiveLimits {
  const pick = (v: number | null | undefined, fallback: number) => (isConcurrencyLimit(v) ? v : fallback);
  const maxConcurrentJobs = pick(setting?.maxConcurrentJobs, deployment.maxConcurrentJobs);
  const maxConcurrentJobsPerUser = pick(setting?.maxConcurrentJobsPerUser, deployment.maxConcurrentJobsPerUser);
  return { maxConcurrentJobs, maxConcurrentJobsPerUser, effective: Math.max(1, Math.min(maxConcurrentJobs, maxConcurrentJobsPerUser)) };
}

// --- estimate --------------------------------------------------------------------------------------------------------

/** Constants of the plan estimate (median production run 2026-10: ~48 min, $0.18; up to $0.39 with more fix turns). */
export const PLAN_ESTIMATE = {
  minutesPerRun: 48,
  /** Share of rows expected to need a rework run, and how long one takes */
  reworkShare: 0.2,
  reworkMinutes: 15,
  costPerRowUsd: { min: 0.18, max: 0.39 },
} as const;

/**
 * Time ≈ seed rows × 48 min (one at a time) + Σ over body waves ceil(rows of the wave / concurrency) × 48 min
 * + 20 % of rows × 15 min of rework spread over the parallel slots; cost ≈ rows × $0.18–0.39. Time spent waiting for
 * answers or approvals is not included. With 3 seed rows and 138 body rows in one wave: ~120 h at 1, ~32 h at 4,
 * ~18 h at 8, ~13 h at 12, ~10 h at 16.
 */
export function estimatePlan(input: { seedRows: number; bodyWaveSizes: number[]; concurrency: number }): PlanEstimate {
  const c = Math.max(1, Math.floor(input.concurrency));
  const body = input.bodyWaveSizes.filter((n) => n > 0);
  const bodyRows = body.reduce((a, n) => a + n, 0);
  const rows = input.seedRows + bodyRows;
  const e = PLAN_ESTIMATE;
  const minutes = input.seedRows * e.minutesPerRun + body.reduce((a, n) => a + Math.ceil(n / c) * e.minutesPerRun, 0) + (rows * e.reworkShare * e.reworkMinutes) / c;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    rows,
    seedRows: input.seedRows,
    // each seed row is a wave of its own (they are built one at a time)
    waves: body.length + input.seedRows,
    concurrency: c,
    minutes: Math.round(minutes),
    costUsd: { min: round2(rows * e.costPerRowUsd.min), max: round2(rows * e.costPerRowUsd.max) },
  };
}

/** Rows per wave in wave order (rows the owner skipped and rows done by an existing project are left out). */
export function waveSizes(rows: Pick<PlanRowRecord, "wave" | "state" | "existing">[]): number[] {
  const m = new Map<number, number>();
  for (const r of rows) if (r.state !== "skipped" && !r.existing) m.set(r.wave, (m.get(r.wave) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
}

/** The estimate of a plan's rows as they are: seed rows one at a time, the other waves within `concurrency`. */
export function planEstimate(rows: Pick<PlanRowRecord, "wave" | "state" | "existing" | "seed">[], concurrency: number): PlanEstimate {
  const built = rows.filter((r) => r.state !== "skipped" && !r.existing);
  const seeds = built.filter((r) => r.seed).length;
  return estimatePlan({ seedRows: seeds, bodyWaveSizes: waveSizes(built.filter((r) => !r.seed)), concurrency });
}

// --- row input ---------------------------------------------------------------------------------------------------------

/** Trimmed single-line text: NFC, control characters and line breaks become spaces, runs of spaces collapse. */
export function cleanPlanText(s: unknown): string {
  if (typeof s !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return s.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Free text with line breaks kept (rationale, goal). */
export function cleanPlanNote(s: unknown): string {
  if (typeof s !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return s.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, " ").trim();
}

/** Key of a row's ROI × TLF for duplicate checks (case and spacing ignored). */
export const planRowKey = (roi: string, tlf: string) => `${cleanPlanText(roi).toLowerCase()}\u0000${cleanPlanText(tlf).toLowerCase()}`;

export type NormalizedPlanRow = { roi: string; tlf: string; rationale: string; wave: number; priority: number | null };

/** One row from a form or a CSV line; the reason it cannot be used otherwise. */
export function normalizePlanRow(input: { roi?: unknown; tlf?: unknown; rationale?: unknown; wave?: unknown; priority?: unknown }, defaultWave = 1): { row: NormalizedPlanRow } | { reason: Exclude<PlanRowRejectReason, "duplicate" | "tooMany"> } {
  const roi = cleanPlanText(input.roi);
  const tlf = cleanPlanText(input.tlf);
  const rationale = cleanPlanNote(input.rationale);
  if (!roi && !tlf) return { reason: "noRoiTlf" };
  if ([...roi].length > PLAN_LIMITS.maxRoi || [...tlf].length > PLAN_LIMITS.maxTlf || [...rationale].length > PLAN_LIMITS.maxRationale) return { reason: "tooLong" };
  let wave = defaultWave;
  if (input.wave !== undefined && input.wave !== null && input.wave !== "") {
    const n = typeof input.wave === "number" ? input.wave : Number(String(input.wave).trim());
    if (!Number.isInteger(n) || n < 1 || n > PLAN_LIMITS.maxWave) return { reason: "badWave" };
    wave = n;
  }
  let priority: number | null = null;
  if (input.priority !== undefined && input.priority !== null && input.priority !== "") {
    const n = typeof input.priority === "number" ? input.priority : Number(String(input.priority).trim());
    if (!Number.isInteger(n) || n < PLAN_LIMITS.minPriority || n > PLAN_LIMITS.maxPriority) return { reason: "badPriority" };
    priority = n;
  }
  return { row: { roi, tlf, rationale, wave, priority } };
}

const HEADER_ALIASES: Record<"roi" | "tlf" | "rationale" | "wave" | "priority", string[]> = {
  roi: ["roi", "region", "regionofinterest", "brainregion", "area", "脳領域", "領域", "部位", "関心領域", "脳部位"],
  tlf: ["tlf", "toplevelfunction", "function", "capability", "ability", "機能", "能力", "トップレベル機能", "最上位機能"],
  rationale: ["rationale", "reason", "note", "notes", "comment", "comments", "description", "理由", "根拠", "備考", "説明", "メモ"],
  wave: ["wave", "batch", "バッチ", "波"],
  priority: ["priority", "優先度", "優先順位"],
};
const headerKey = (cell: string) => cell.normalize("NFKC").toLowerCase().replace(/[\s_\-.()（）・:：]/gu, "");

function columnsOf(header: string[]): Partial<Record<keyof typeof HEADER_ALIASES, number>> | null {
  const cols: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  header.forEach((cell, i) => {
    const k = headerKey(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof typeof HEADER_ALIASES, string[]][]) {
      if (cols[field] === undefined && aliases.includes(k)) cols[field] = i;
    }
  });
  return cols.roi !== undefined || cols.tlf !== undefined ? cols : null;
}

/** Tab-separated when the first line has a tab and no comma; otherwise CSV. */
function splitTable(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const first = body.split(/\r?\n/, 1)[0] ?? "";
  if (first.includes("\t") && !first.includes(",")) return body.split(/\r?\n/).map((line) => line.split("\t"));
  return parseCsv(body);
}

/**
 * Rows of a capability list (CSV or TSV). With a header row, the columns are found by name (ROI / region / 脳領域,
 * TLF / function / capability / 機能 / 能力, rationale / note / 理由, wave / batch / バッチ / 波, priority / 優先度; other columns are
 * ignored). Without one, a single column is the TLF and otherwise the columns are ROI, TLF, rationale. Blank lines are
 * skipped; every other row is either returned or listed in `rejected` with its spreadsheet row number and the reason.
 */
export function parsePlanRowsCsv(text: string, opts: { existing?: { roi: string; tlf: string }[]; maxRows?: number } = {}): { rows: (NormalizedPlanRow & { sourceRow: number })[]; rejected: PlanRowRejected[]; header: boolean } {
  const table = splitTable(text);
  const cols = table.length ? columnsOf(table[0]) : null;
  const start = cols ? 1 : 0;
  const width = Math.max(0, ...table.map((r) => r.filter((c) => c.trim()).length ? r.length : 0));
  const pick = (r: string[], i: number | undefined) => (i === undefined ? undefined : r[i]);
  const positional: Partial<Record<keyof typeof HEADER_ALIASES, number>> = width <= 1 ? { tlf: 0 } : { roi: 0, tlf: 1, rationale: 2 };
  const map = cols ?? positional;
  const seen = new Set((opts.existing ?? []).map((r) => planRowKey(r.roi, r.tlf)));
  const max = opts.maxRows ?? PLAN_LIMITS.maxRows;
  const rows: (NormalizedPlanRow & { sourceRow: number })[] = [];
  const rejected: PlanRowRejected[] = [];
  for (let i = start; i < table.length; i++) {
    const r = table[i];
    if (!r.some((c) => c.trim())) continue;
    const sourceRow = i + 1;
    const text = cleanPlanText(r.filter((c) => c.trim()).join(" | ")).slice(0, 120);
    const n = normalizePlanRow({ roi: pick(r, map.roi), tlf: pick(r, map.tlf), rationale: pick(r, map.rationale), wave: pick(r, cols?.wave), priority: pick(r, cols?.priority) });
    if ("reason" in n) {
      rejected.push({ row: sourceRow, reason: n.reason, text });
      continue;
    }
    const key = planRowKey(n.row.roi, n.row.tlf);
    if (seen.has(key)) {
      rejected.push({ row: sourceRow, reason: "duplicate", text });
      continue;
    }
    if (rows.length + (opts.existing?.length ?? 0) >= max) {
      rejected.push({ row: sourceRow, reason: "tooMany", text });
      continue;
    }
    seen.add(key);
    rows.push({ ...n.row, sourceRow });
  }
  return { rows, rejected, header: !!cols };
}

// --- runner decisions (pure) ------------------------------------------------------------------------------------------

export function countRows(rows: Pick<PlanRowRecord, "state">[]): PlanRowCounts {
  const out = Object.fromEntries(PLAN_ROW_STATES.map((s) => [s, 0])) as PlanRowCounts;
  for (const r of rows) out[r.state]++;
  return out;
}

export const byWaveAndOrder = (a: Pick<PlanRowRecord, "wave" | "order" | "rowId">, b: Pick<PlanRowRecord, "wave" | "order" | "rowId">) =>
  a.wave - b.wave || a.order - b.order || (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0);

/** A plan is finished when every row is done or was skipped by the owner. */
export const planFinished = (rows: Pick<PlanRowRecord, "state">[]) => rows.length > 0 && rows.every((r) => r.state === "done" || r.state === "skipped");

/**
 * The wave the runner may start rows of. It moves on (to the next wave that still has rows waiting) once no row of the
 * active wave or an earlier one is waiting to start or running. Rows waiting for an answer or needing attention do not
 * hold it up: only those rows wait. Never goes back.
 */
export function nextActiveWave(rows: Pick<PlanRowRecord, "wave" | "state" | "seed">[], active: number | null | undefined, opts: NextWaveOptions = {}): number | null {
  const pendingWaves = rows.filter((r) => r.state === "pending").map((r) => r.wave);
  if (!pendingWaves.length) return active ?? null;
  const first = Math.min(...pendingWaves);
  if (active === null || active === undefined) return first;
  const busy = rows.some(
    (r) => r.wave <= active && (r.state === "pending" || IN_FLIGHT_ROW_STATES.includes(r.state) || (opts.seedGate && r.seed && !SEED_GATE_PASSED.includes(r.state))),
  );
  if (busy || opts.holdNewWave) return active;
  const later = pendingWaves.filter((w) => w > active);
  return later.length ? Math.min(...later) : active;
}

/** Options of `nextActiveWave` for plans with a Canon (stage 3). */
export interface NextWaveOptions {
  /** A seed row holds every later wave until its pull request is approved (or a human resolved or skipped it) */
  seedGate?: boolean;
  /** Back-pressure: no new wave starts (rows of the active wave still do) */
  holdNewWave?: boolean;
}

/** Seed row states that let the next wave start. */
const SEED_GATE_PASSED: readonly PlanRowState[] = ["done", "skipped", "cancelled"];

// --- stage 3: the plan's Canon (pure decisions) ------------------------------------------------------------------------

/** No new wave starts while this many of the plan's pull requests wait for approval (「承認待ち」 rows). */
export const PLAN_MAX_WAITING_PRS = 20;
/** Conform follow-ups a row gets for error conflicts caused by the Canon moving on, before it needs a human. */
export const MAX_CONFORM_FOLLOWUPS = 2;

/** Pull requests of the plan that wait for approval. */
export const waitingPrs = (rows: Pick<PlanRowRecord, "state">[]) => rows.filter((r) => r.state === "review").length;

/** The fixed first line of a conform follow-up (the instruction the project's agent gets). */
export const conformTitle = (revision: number) => `Canon rev ${revision} に合わせて更新`;

/**
 * What happens to a row whose finished project was just pushed: error conflicts caused by the Canon moving on since the
 * row's pin (`headMoved`) get a conform follow-up (at most `MAX_CONFORM_FOLLOWUPS`), other error conflicts need a human;
 * everything else (warnings and infos included: needs-review items always go to a human) waits for approval.
 */
export function pushOutcome(
  summary: { errors: number },
  headMoved: boolean,
  conformAttempts: number,
  opts: { autonomous?: boolean } = {},
): { to: "review" } | { to: "conform"; fix: boolean } | { to: "decision"; reason: PlanDecisionReason } {
  if (summary.errors <= 0) return { to: "review" };
  // 自律実行: error conflicts the Canon moving on did not cause get a follow-up that makes the project agree with the Canon
  if (!headMoved && !opts.autonomous) return { to: "decision", reason: "conflicts" };
  if (conformAttempts < (opts.autonomous ? AUTONOMOUS_MAX_FOLLOWUPS : MAX_CONFORM_FOLLOWUPS)) return { to: "conform", fix: !headMoved };
  return { to: "decision", reason: "conform_limit" };
}

/** Follow-ups a row may get for its pull request (conform, fix and requested changes together). */
export const maxFollowups = (p: { settings: Pick<PlanSettings, "autonomous"> }) => (isAutonomous(p) ? AUTONOMOUS_MAX_FOLLOWUPS : MAX_CONFORM_FOLLOWUPS);

/**
 * What a 「承認待ち」 row becomes given its pull request now: approved → done; rejected / withdrawn → a human decides;
 * superseded → follow the pull request that replaced it (`#<n>` in its reason); open → unchanged (null).
 */
export function prOutcome(pr: { state: string; reason?: string | null } | null): { to: "done" } | { to: "decision"; reason: PlanDecisionReason } | { to: "follow"; prNo: number } | null {
  if (!pr) return { to: "decision", reason: "push_failed" };
  switch (pr.state) {
    case "approved":
      return { to: "done" };
    case "rejected":
      return { to: "decision", reason: "pr_rejected" };
    case "withdrawn":
      return { to: "decision", reason: "pr_withdrawn" };
    case "superseded": {
      const n = Number(/^#(\d+)$/.exec(pr.reason ?? "")?.[1]);
      return Number.isInteger(n) && n > 0 ? { to: "follow", prNo: n } : { to: "decision", reason: "pr_withdrawn" };
    }
    default:
      return null;
  }
}

/** Pending rows of the active wave (and earlier ones, e.g. retries), in start order, at most `slots`. */
export function rowsToStart<T extends Pick<PlanRowRecord, "wave" | "order" | "rowId" | "state">>(rows: T[], activeWave: number | null, slots: number): T[] {
  if (activeWave === null || slots <= 0) return [];
  return rows.filter((r) => r.state === "pending" && r.wave <= activeWave).sort(byWaveAndOrder).slice(0, slots);
}

/** Jobs that occupy a slot: queued (they will run) and running. */
export const SLOT_JOB_STATUSES = ["QUEUED", "RUNNING", "FINALIZING"] as const;

/**
 * How many more jobs the owner may queue now: what is left under the global limit and under the owner's limit,
 * counting queued jobs too, so nothing is queued that could not start (the janitor fails jobs queued for 24 h).
 */
export function freeSlots(limits: Pick<EffectiveLimits, "maxConcurrentJobs" | "maxConcurrentJobsPerUser">, activeJobs: { userId: string }[], ownerUserId: string): number {
  const mine = activeJobs.filter((j) => j.userId === ownerUserId).length;
  return Math.max(0, Math.min(limits.maxConcurrentJobs - activeJobs.length, limits.maxConcurrentJobsPerUser - mine));
}

export type RowSync =
  | { state: "running" | "question" | "done" | "cancelled"; event: PlanEventType | null }
  | { state: "pending"; retry: true; event: "row_retry"; error: string | null }
  | { state: "attention"; reason: PlanAttentionReason; event: "row_attention"; error: string | null };

/**
 * What a tracked row (starting / running / question) becomes given its project now; null when nothing changes. A
 * failed project is retried (the row goes back to pending with its project) up to `MAX_ROW_AUTO_RETRIES` times, then
 * needs attention. A project that failed while waiting for an answer (the 7-day timeout) or was stopped outside the
 * plan is not retried.
 */
export function syncRow(row: Pick<PlanRowRecord, "state" | "attempts">, project: Pick<ProjectRecord, "status" | "errorMessage" | "deletedAt"> | null, planStatus: PlanStatus): RowSync | null {
  if (!project || project.deletedAt) return row.state === "attention" ? null : { state: "attention", reason: "project_deleted", event: "row_attention", error: null };
  switch (project.status) {
    case "QUEUED":
    case "RUNNING":
    case "FINALIZING":
      if (row.state === "running") return null;
      return { state: "running", event: row.state === "question" ? "row_resumed" : null };
    case "WAITING_USER_INPUT":
      return row.state === "question" ? null : { state: "question", event: "row_question" };
    case "COMPLETED":
      return { state: "done", event: "row_done" };
    case "CANCELLED":
      if (planStatus === "CANCELLED") return { state: "cancelled", event: "row_cancelled" };
      return { state: "attention", reason: "cancelled_outside", event: "row_attention", error: project.errorMessage ?? null };
    case "FAILED":
      if (row.state === "question") return { state: "attention", reason: "question_timeout", event: "row_attention", error: project.errorMessage ?? null };
      if (row.attempts < MAX_ROW_AUTO_RETRIES) return { state: "pending", retry: true, event: "row_retry", error: project.errorMessage ?? null };
      return { state: "attention", reason: "failed", event: "row_attention", error: project.errorMessage ?? null };
  }
}
