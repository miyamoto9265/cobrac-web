// One step of a plan: keep its rows in step with their projects, then start rows of the active wave while there is
// a free slot. Every write is conditional on the row's state (and a lease on the plan), so running the step twice,
// or from the scheduled runner and an API request at the same time, starts nothing twice. Rows are never queued
// ahead of a free slot: the janitor fails jobs that stay QUEUED for 24 hours.
//
// Stage 2: a DRAFTING plan waits for its draft job (queued here when a slot is free, then applied); a plan ordered
// automatically (`ordering: "auto"`) learns the anchors its finished rows actually used (their uc.json), re-orders the
// rows that have not started after each wave, and asks a re-plan job for proposals. Plans ordered by hand (all stage-1
// plans) skip all of this: no S3 reads, no plan jobs.
import type { EffectiveLimits, JobRecord, KeySource, ModelPolicy, PlanAttentionReason, PlanEventType, PlanJobState, PlanPauseReason, PlanRecord, PlanRowRecord, PlanRowState, ProjectRecord, UserRecord } from "@cobrac/shared";
import {
  ACTIVE_PROJECT_STATUSES,
  HARNESS_RULES,
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
  countRows,
  freeSlots,
  isMovableRow,
  isProjectDeleted,
  newId,
  nextActiveWave,
  nowIso,
  planFinished,
  policyAllows,
  proposeProjectName,
  replanJobDue,
  replanRows,
  rowsToStart,
  syncRow,
} from "@cobrac/shared";
import { getObjectText } from "./aws.js";
import { reserveNewId } from "./catalog.js";
import { currentLimits } from "./concurrency.js";
import { getProject, getUser, listJobsByStatus, listUserProjects } from "./db.js";
import { GATE_ERRORS, draftRows, isOpenPlanJob, planJobProgress, queuePlanJob, readPlanJob, readPlanResult, stopPlanJob, storeProposals } from "./planJobs.js";
import { acquirePlanLease, getPlan, listRows, putPlanEvent, putRow, releasePlanLease, setPlanStatus, updatePlan, updateRow } from "./plans.js";
import { createProject, deploymentDefaultModel, implicitModel, moveToAllowedModel, queueRetry, runPolicy, stopProject } from "./runs.js";

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
}

/** Whether the owner may start a job now, and on which model (the plan's model, or the tier default for one the owner did not pick). */
export async function runGate(plan: PlanRecord, owner: UserRecord | null): Promise<{ ok: true; policy: ModelPolicy & { source: KeySource }; model: string } | { ok: false; reason: PlanPauseReason }> {
  if (!owner || owner.disabled) return { ok: false, reason: "owner_disabled" };
  const policy = await runPolicy(owner);
  if (!policy.source) return { ok: false, reason: "no_key" };
  let model = plan.settings.model || deploymentDefaultModel();
  if (!policyAllows(policy, model)) {
    if (plan.settings.modelChosen) return { ok: false, reason: "model_not_allowed" };
    model = implicitModel(policy, model);
  }
  return { ok: true, policy: { ...policy, source: policy.source }, model };
}

async function setRow(plan: PlanRecord, row: PlanRowRecord, to: PlanRowState, values: Partial<PlanRowRecord>, event: PlanEventType | null, detail?: Record<string, string | number | null>): Promise<boolean> {
  const ok = await updateRow(plan.planId, row.rowId, { ...values, state: to }, { state: row.state });
  if (!ok) return false;
  Object.assign(row, values, { state: to });
  if (event) await putPlanEvent(plan.planId, event, RUNNER, { rowId: row.rowId, ...(row.projectId ? { projectId: row.projectId } : {}), ...(detail ? { detail } : {}) });
  return true;
}

const attention = (plan: PlanRecord, row: PlanRowRecord, reason: PlanAttentionReason, error: string | null) =>
  setRow(plan, row, "attention", { attentionReason: reason, lastError: error }, "row_attention", { reason, error });

/** Keeps a tracked row in step with its project. */
async function syncTracked(plan: PlanRecord, row: PlanRowRecord, project: ProjectRecord | null, now: number): Promise<boolean> {
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
  if (s.state === "done") return setRow(plan, row, "done", { completedAt: now_, attentionReason: null }, s.event);
  return setRow(plan, row, s.state, {}, s.event);
}

/** Starts one pending row: its project (new, or the one a start did not finish), or a retry of its failed project. */
async function startRow(plan: PlanRecord, row: PlanRowRecord, owner: UserRecord, gate: { policy: ModelPolicy & { source: KeySource }; model: string }): Promise<boolean> {
  const at = nowIso();
  const existing = row.projectId ? await getProject(owner.userId, row.projectId) : null;
  if (existing && isProjectDeleted(existing)) {
    await attention(plan, row, "project_deleted", null);
    return false;
  }
  if (existing) {
    if (existing.status !== "FAILED" && existing.status !== "CANCELLED") {
      // already running again or finished (for example retried by hand): follow it from the next step
      await setRow(plan, row, "running", { claimedAt: null }, null);
      return false;
    }
    if (!(await setRow(plan, row, "starting", { claimedAt: at }, null))) return false;
    try {
      const moved = await moveToAllowedModel(owner, existing, gate.policy);
      await queueRetry(owner, existing, gate.policy, { locale: plan.settings.locale, moved });
    } catch (e) {
      await startFailed(plan, row, e);
      return false;
    }
    await setRow(plan, row, "running", { startedAt: at }, "row_started", { retry: 1 });
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
      keySource: gate.policy.source,
      harnessRules: plan.harnessRules ?? HARNESS_RULES,
      plan: { planId: plan.planId, name: plan.name },
      projectId,
      jobId,
      recover,
    });
  } catch (e) {
    await startFailed(plan, row, e);
    return false;
  }
  await setRow(plan, row, "running", { startedAt: at }, "row_started");
  return true;
}

/** A start that threw: counts as an attempt; after the last one the row needs attention. */
async function startFailed(plan: PlanRecord, row: PlanRowRecord, e: unknown) {
  const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  console.error(`[plan ${plan.planId}] row ${row.rowId} could not start`, error);
  if (row.attempts >= MAX_ROW_AUTO_RETRIES) await attention(plan, row, "start_failed", error);
  else await setRow(plan, row, "pending", { attempts: row.attempts + 1, lastError: error, claimedAt: null }, "row_retry", { attempt: row.attempts + 1, max: MAX_ROW_AUTO_RETRIES, error });
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

/** The draft ended without a result: the plan is an editable draft again, with the reason. */
async function endDraft(plan: PlanRecord, d: PlanJobState, status: "failed" | "cancelled", error: string) {
  const draft: PlanJobState = { ...d, status, error, endedAt: nowIso() };
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
    if (!gate.ok) return endDraft(plan, d, "failed", GATE_ERRORS[gate.reason as keyof typeof GATE_ERRORS] ?? gate.reason);
    try {
      const state = await queuePlanJob(plan, "draft", d, await listRows(plan.planId), owner!, gate, limits.effective);
      if (state) {
        result.planJob = state.jobId ?? undefined;
        result.changed++;
      }
    } catch (e) {
      console.error(`[plan ${plan.planId}] draft job could not be queued`, e);
      const fresh = await getPlan(plan.planId);
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
  const applied = draftRows(plan.planId, await listRows(plan.planId), parsed, projects, limits.effective, nowIso());
  for (const r of applied.rows) await putRow(r);
  const dropped = parsed.dropped + applied.dropped;
  const draft: PlanJobState = { ...d, status: "done", error: null, unread: parsed.unread, dropped, endedAt: nowIso() };
  const values: Partial<PlanRecord> = { draft, ordering: "auto", rowCount: applied.rows.length, rowCounts: countRows(applied.rows), ...(parsed.policy ? { policy: parsed.policy } : {}) };
  if (!(await setPlanStatus(plan.planId, "DRAFTING", "DRAFT", values))) return;
  Object.assign(plan, values, { status: "DRAFT" });
  result.changed++;
  await putPlanEvent(plan.planId, "draft_applied", RUNNER, { detail: { rows: applied.rows.length, added: applied.added, seeds: applied.seeds, unread: parsed.unread.length, dropped } });
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
  if (rows.some((r) => r.wave <= active && (r.state === "pending" || IN_FLIGHT_ROW_STATES.includes(r.state)))) return;
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
async function endReplan(plan: PlanRecord, r: PlanJobState, status: "failed" | "cancelled", error: string | null, event = true) {
  plan.replan = { ...r, status, error, endedAt: nowIso() };
  await updatePlan(plan.planId, { replan: plan.replan });
  if (event) await putPlanEvent(plan.planId, "replan_failed", RUNNER, { detail: { error: (error ?? "").slice(0, 300), status } });
}

/** Follows a queued or running re-plan job; its proposals are stored when it completes (also while paused). */
async function followReplan(plan: PlanRecord, result: AdvanceResult) {
  const r = plan.replan!;
  const p = planJobProgress(await readPlanJob(plan.planId, r.jobId));
  if (p.to === "queued") return;
  if (p.to === "running") {
    if (r.status !== "running") {
      plan.replan = { ...r, status: "running" };
      await updatePlan(plan.planId, { replan: plan.replan });
    }
    return;
  }
  result.changed++;
  if (p.to !== "completed") return endReplan(plan, r, p.to, p.error);
  const parsed = await readPlanResult(plan.planId, "replan", r.jobId!);
  if (!parsed) return endReplan(plan, r, "failed", "The result of the re-plan job could not be read.");
  const n = await storeProposals(plan.planId, r.jobId!, r.wave ?? null, parsed);
  plan.replan = { ...r, status: "done", error: null, dropped: parsed.dropped, endedAt: nowIso() };
  await updatePlan(plan.planId, { replan: plan.replan });
  await putPlanEvent(plan.planId, "proposals_received", RUNNER, { detail: { n, wave: r.wave ?? null } });
}

/** A re-plan that has not ended is of no use once the plan is over: its job is stopped. */
export async function dropReplan(plan: PlanRecord, reason: string) {
  const r = plan.replan;
  if (!isOpenPlanJob(r)) return;
  if (openJob(r)) await stopPlanJob(plan.planId, r.jobId, reason);
  await endReplan(plan, r, "cancelled", null, false);
}

// --- step ------------------------------------------------------------------------------------------------------------

/** One step of a plan (see the file comment). */
export async function advancePlan(planId: string, now = Date.now()): Promise<AdvanceResult> {
  const result: AdvanceResult = { planId, started: [], changed: 0 };
  const plan = await getPlan(planId);
  if (!plan || plan.deletedAt || !RUNNER_PLAN_STATUSES.includes(plan.status)) return { ...result, skipped: "inactive", status: plan?.status };
  const lease = await acquirePlanLease(plan, PLAN_LEASE_MS, now);
  if (!lease) return { ...result, skipped: "busy", status: plan.status };
  try {
    const owner = await getUser(plan.ownerUserId);
    if (plan.status === "DRAFTING") {
      await stepDraft(plan, owner, now, result);
      return { ...result, status: plan.status };
    }
    const rows = await listRows(planId);
    const projects = new Map((await listUserProjects(plan.ownerUserId)).map((p) => [p.projectId, p]));
    let limitsRead: Promise<EffectiveLimits> | null = null;
    const limits = () => (limitsRead ??= currentLimits(now));

    for (const row of rows.filter((r) => TRACKED_ROW_STATES.includes(r.state))) {
      if (await syncTracked(plan, row, row.projectId ? (projects.get(row.projectId) ?? null) : null, now)) result.changed++;
    }
    if (openJob(plan.replan)) await followReplan(plan, result);

    if (plan.status === "RUNNING") {
      if (plan.ordering === "auto") {
        await readUsedAnchors(plan, rows);
        await replanAfterWave(plan, rows, limits);
      }
      const wave = nextActiveWave(rows, plan.activeWave ?? null);
      if (wave !== (plan.activeWave ?? null)) {
        await updatePlan(planId, { activeWave: wave });
        plan.activeWave = wave;
        if (wave !== null) await putPlanEvent(planId, "wave_started", RUNNER, { detail: { wave } });
      }
      const candidates = rowsToStart(rows, wave, PLAN_LIMITS.maxRows);
      const replanWaits = plan.replan?.status === "waiting";
      if (candidates.length || replanWaits) {
        const active = await slotJobs();
        let slots = freeSlots(await limits(), active, plan.ownerUserId);
        if (slots > 0) {
          const gate = await runGate(plan, owner);
          if (!gate.ok) {
            if (replanWaits) await endReplan(plan, plan.replan!, "failed", GATE_ERRORS[gate.reason as keyof typeof GATE_ERRORS] ?? gate.reason);
            await pauseFor(plan, gate.reason);
            result.pausedReason = gate.reason;
          } else {
            // the re-plan job takes its slot before more rows start
            if (replanWaits && (await getPlan(planId))?.status === "RUNNING") {
              try {
                const state = await queuePlanJob(plan, "replan", plan.replan!, rows, owner!, gate, (await limits()).effective);
                if (state) {
                  result.planJob = state.jobId ?? undefined;
                  slots--;
                  // cancelled while the job was being stored (the cancel found no job to stop yet): stop it now
                  if ((await getPlan(planId))?.status === "CANCELLED") await stopPlanJob(planId, state.jobId, "plan cancelled");
                }
              } catch (e) {
                console.error(`[plan ${planId}] re-plan job could not be queued`, e);
                const fresh = await getPlan(planId);
                if (fresh?.replan?.status === "waiting") await endReplan(plan, fresh.replan, "failed", "The re-plan job could not be queued.");
              }
            }
            for (const row of candidates) {
              if (slots <= 0) break;
              // stop as soon as the owner pauses or cancels the plan
              if ((await getPlan(planId))?.status !== "RUNNING") break;
              if (!(await startRow(plan, row, owner!, gate))) continue;
              slots--;
              result.started.push(row.rowId);
              result.changed++;
              if ((await getPlan(planId))?.status === "CANCELLED") {
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
