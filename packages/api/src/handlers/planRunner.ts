/**
 * BRA Planner runner (EventBridge, every minute): advances every drafting, running or paused plan by one step
 * (lib/planRunner.ts). Drafting plans queue and follow their draft job; paused plans only follow their rows' projects
 * (and a re-plan job); running plans also start rows when a slot is free.
 */
import { RUNNER_PLAN_STATUSES } from "@cobrac/shared";
import { advancePlan } from "../lib/planRunner.js";
import { listPlansByStatus } from "../lib/plans.js";

export async function handler() {
  const plans = (await Promise.all(RUNNER_PLAN_STATUSES.map((s) => listPlansByStatus(s)))).flat().filter((p) => !p.deletedAt);
  for (const plan of plans) {
    try {
      const r = await advancePlan(plan.planId);
      if (r.started.length || r.changed || r.pausedReason || r.planJob) console.log(`[plan ${plan.planId}]`, JSON.stringify(r));
    } catch (e) {
      // one plan's failure never holds up the others; the next minute tries again
      console.error(`[plan ${plan.planId}] step failed`, e);
    }
  }
}
