/**
 * BRA Planner runner (EventBridge, every minute): advances every drafting, running or paused plan by one step
 * (lib/planRunner.ts). Drafting plans queue and follow their draft job; paused plans only follow their rows' projects
 * (and a re-plan job); running plans also start rows when a slot is free.
 *
 * 自律実行 (autonomous run): a plan whose draft was applied is confirmed here, once its step released the plan's lease
 * (the confirmation takes it); a draft left unconfirmed (the confirmation failed) is tried again every minute until it
 * succeeds or the reason is recorded on the plan for the owner.
 */
import type { PlanRecord } from "@cobrac/shared";
import { RUNNER_PLAN_STATUSES, isAutonomous } from "@cobrac/shared";
import { getUser } from "../lib/db.js";
import { confirmPlan } from "../lib/planOps.js";
import { RUNNER, advancePlan } from "../lib/planRunner.js";
import { PLAN_BUSY_MESSAGE, getPlan, listPlansByStatus, putPlanEvent, updatePlan } from "../lib/plans.js";

/** Confirms an autonomous plan's applied draft as the runner; a failure is recorded on the plan (shown to the owner). */
export async function autoConfirm(planId: string): Promise<void> {
  const plan = await getPlan(planId, true);
  if (!plan || plan.deletedAt || plan.status !== "DRAFT" || !isAutonomous(plan) || plan.draft?.status !== "done" || !plan.draft.autoConfirm || plan.autonomousError) return;
  const owner = await getUser(plan.ownerUserId);
  try {
    if (!owner || owner.disabled) throw new Error("The plan's owner cannot run jobs.");
    await confirmPlan(owner, plan, plan.draft.locale ?? plan.settings.locale ?? null, RUNNER);
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    // another request holds the plan for a moment: tried again at the next minute
    if (message === PLAN_BUSY_MESSAGE) return;
    console.error(`[plan ${planId}] autonomous confirmation failed`, message);
    if (await updatePlan(planId, { autonomousError: message }, { status: "DRAFT" })) await putPlanEvent(planId, "draft_failed", RUNNER, { detail: { error: message.slice(0, 300), confirm: 1 } });
  }
}

const unconfirmed = (p: PlanRecord) => !p.deletedAt && isAutonomous(p) && p.draft?.status === "done" && !!p.draft.autoConfirm && !p.autonomousError;

export async function handler() {
  const plans = (await Promise.all(RUNNER_PLAN_STATUSES.map((s) => listPlansByStatus(s)))).flat().filter((p) => !p.deletedAt);
  for (const plan of plans) {
    try {
      const r = await advancePlan(plan.planId);
      if (r.started.length || r.changed || r.pausedReason || r.planJob || r.autoConfirm) console.log(`[plan ${plan.planId}]`, JSON.stringify(r));
      if (r.autoConfirm) await autoConfirm(plan.planId);
    } catch (e) {
      // one plan's failure never holds up the others; the next minute tries again
      console.error(`[plan ${plan.planId}] step failed`, e);
    }
  }
  // drafts of autonomous plans that are still to be confirmed (a confirmation that could not run in its step)
  for (const plan of (await listPlansByStatus("DRAFT")).filter(unconfirmed)) {
    try {
      await autoConfirm(plan.planId);
    } catch (e) {
      console.error(`[plan ${plan.planId}] autonomous confirmation failed`, e);
    }
  }
}
