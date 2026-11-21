/**
 * BRA Planner runner (EventBridge, every minute): advances every drafting, running or paused plan by one step
 * (lib/planRunner.ts). Drafting plans queue and follow their draft job; paused plans only follow their rows' projects
 * (and a re-plan job); running plans also start rows when a slot is free. A draft never starts on its own: the owner
 * starts it with 「開始」.
 *
 * The chat with the Orchestrator (lib/planChat.ts): a plan whose chat job waits or runs is stepped in any status (a
 * draft, a finished mission), and a reply the step found ready is stored and carried out once the step released the
 * plan's lease.
 */
import type { PlanStatus } from "@cobrac/shared";
import { RUNNER_PLAN_STATUSES, isOpenPlanChat } from "@cobrac/shared";
import { applyChat } from "../lib/planChat.js";
import { advancePlan } from "../lib/planRunner.js";
import { listPlansByStatus } from "../lib/plans.js";

/** Statuses the runner does not advance, whose plans are stepped only while their chat job is open. */
const CHAT_ONLY_STATUSES: readonly PlanStatus[] = ["DRAFT", "COMPLETED", "CANCELLED"];

export async function handler() {
  const active = (await Promise.all(RUNNER_PLAN_STATUSES.map((s) => listPlansByStatus(s)))).flat();
  const chatting = (await Promise.all(CHAT_ONLY_STATUSES.map((s) => listPlansByStatus(s)))).flat().filter((p) => isOpenPlanChat(p.chat));
  for (const plan of [...active, ...chatting].filter((p) => !p.deletedAt)) {
    try {
      const r = await advancePlan(plan.planId);
      if (r.started.length || r.changed || r.pausedReason || r.planJob || r.chatReady) console.log(`[plan ${plan.planId}]`, JSON.stringify(r));
      if (r.chatReady) await applyChat(plan.planId);
    } catch (e) {
      // one plan's failure never holds up the others; the next minute tries again
      console.error(`[plan ${plan.planId}] step failed`, e);
    }
  }
}
