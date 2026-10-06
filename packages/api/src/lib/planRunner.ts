// One step of a plan: keep its rows in step with their projects, then start rows of the active wave while there is
// a free slot. Every write is conditional on the row's state (and a lease on the plan), so running the step twice,
// or from the scheduled runner and an API request at the same time, starts nothing twice. Rows are never queued
// ahead of a free slot: the janitor fails jobs that stay QUEUED for 24 hours.
import type { KeySource, ModelPolicy, PlanAttentionReason, PlanEventType, PlanPauseReason, PlanRecord, PlanRowRecord, PlanRowState, ProjectRecord, UserRecord } from "@cobrac/shared";
import {
  ACTIVE_PROJECT_STATUSES,
  HARNESS_RULES,
  MAX_ROW_AUTO_RETRIES,
  PLAN_LEASE_MS,
  PLAN_LIMITS,
  PLAN_ROW_STATES,
  ROW_START_STALE_MS,
  SLOT_JOB_STATUSES,
  TRACKED_ROW_STATES,
  countRows,
  freeSlots,
  isProjectDeleted,
  newId,
  nextActiveWave,
  nowIso,
  planFinished,
  policyAllows,
  proposeProjectName,
  rowsToStart,
  syncRow,
} from "@cobrac/shared";
import { reserveNewId } from "./catalog.js";
import { currentLimits } from "./concurrency.js";
import { getProject, getUser, listJobsByStatus, listUserProjects } from "./db.js";
import { acquirePlanLease, getPlan, listRows, putPlanEvent, releasePlanLease, setPlanStatus, updatePlan, updateRow } from "./plans.js";
import { createProject, deploymentDefaultModel, implicitModel, moveToAllowedModel, queueRetry, runPolicy, stopProject } from "./runs.js";

export const RUNNER = "runner";

export interface AdvanceResult {
  planId: string;
  /** inactive: not running or paused (or gone); busy: another step holds the plan */
  skipped?: "inactive" | "busy";
  status?: PlanRecord["status"];
  started: string[];
  changed: number;
  pausedReason?: PlanPauseReason;
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

/** One step of a plan (see the file comment). */
export async function advancePlan(planId: string, now = Date.now()): Promise<AdvanceResult> {
  const result: AdvanceResult = { planId, started: [], changed: 0 };
  const plan = await getPlan(planId);
  if (!plan || plan.deletedAt || (plan.status !== "RUNNING" && plan.status !== "PAUSED")) return { ...result, skipped: "inactive", status: plan?.status };
  const lease = await acquirePlanLease(plan, PLAN_LEASE_MS, now);
  if (!lease) return { ...result, skipped: "busy", status: plan.status };
  try {
    const rows = await listRows(planId);
    const owner = await getUser(plan.ownerUserId);
    const projects = new Map((await listUserProjects(plan.ownerUserId)).map((p) => [p.projectId, p]));

    for (const row of rows.filter((r) => TRACKED_ROW_STATES.includes(r.state))) {
      if (await syncTracked(plan, row, row.projectId ? (projects.get(row.projectId) ?? null) : null, now)) result.changed++;
    }

    if (plan.status === "RUNNING") {
      const wave = nextActiveWave(rows, plan.activeWave ?? null);
      if (wave !== (plan.activeWave ?? null)) {
        await updatePlan(planId, { activeWave: wave });
        plan.activeWave = wave;
        if (wave !== null) await putPlanEvent(planId, "wave_started", RUNNER, { detail: { wave } });
      }
      const candidates = rowsToStart(rows, wave, PLAN_LIMITS.maxRows);
      if (candidates.length) {
        const limits = await currentLimits(now);
        const active = (await Promise.all(SLOT_JOB_STATUSES.map((s) => listJobsByStatus(s)))).flat();
        let slots = freeSlots(limits, active, plan.ownerUserId);
        if (slots > 0) {
          const gate = await runGate(plan, owner);
          if (!gate.ok) {
            await pauseFor(plan, gate.reason);
            result.pausedReason = gate.reason;
          } else {
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
    }
    const counts = countRows(rows);
    if (PLAN_ROW_STATES.some((st) => counts[st] !== plan.rowCounts?.[st]) || plan.rowCount !== rows.length) await updatePlan(planId, { rowCounts: counts, rowCount: rows.length });
    return { ...result, status: plan.status };
  } finally {
    await releasePlanLease(planId, lease).catch((e) => console.warn(`[plan ${planId}] lease release failed`, e));
  }
}
