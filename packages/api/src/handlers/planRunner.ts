/**
 * BRA Planner runner (EventBridge, every minute): advances every running or paused plan by one step
 * (lib/planRunner.ts). Paused plans only follow their rows' projects; running plans also start rows when a slot is free.
 */
import { advancePlan } from "../lib/planRunner.js";
import { listPlansByStatus } from "../lib/plans.js";

export async function handler() {
  const plans = [...(await listPlansByStatus("RUNNING")), ...(await listPlansByStatus("PAUSED"))].filter((p) => !p.deletedAt);
  for (const plan of plans) {
    try {
      const r = await advancePlan(plan.planId);
      if (r.started.length || r.changed || r.pausedReason) console.log(`[plan ${plan.planId}]`, JSON.stringify(r));
    } catch (e) {
      // one plan's failure never holds up the others; the next minute tries again
      console.error(`[plan ${plan.planId}] step failed`, e);
    }
  }
}
