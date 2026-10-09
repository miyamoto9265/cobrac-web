// What a plan has spent so far (estimated USD): the jobs of the projects it built (rows done by an existing project
// spent nothing for it), its own plan jobs (drafts, re-plans), and the AI review / decision jobs it asked for the rows'
// pull requests. The runner of an autonomous plan (自律実行) checks it against the plan's cost limit every step.
import type { PlanRecord, PlanRowRecord, ProjectRecord } from "@cobrac/shared";
import { listJobsForCanon } from "./db.js";

const round6 = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

export async function planSpendUsd(plan: PlanRecord, rows: PlanRowRecord[], projects: Map<string, ProjectRecord>): Promise<number> {
  let cost = 0;
  for (const r of rows) {
    const p = r.projectId && !r.existing ? projects.get(r.projectId) : undefined;
    if (p && typeof p.costUsd === "number") cost += p.costUsd;
  }
  // plan jobs are stored under the plan ID; review and decision jobs under the Canon ID, with the plan's ID
  for (const j of await listJobsForCanon(plan.planId)) if (j.type === "plan" && typeof j.costUsd === "number") cost += j.costUsd;
  if (plan.canonId) for (const j of await listJobsForCanon(plan.canonId)) if (j.type === "canon-review" && j.planId === plan.planId && typeof j.costUsd === "number") cost += j.costUsd;
  return round6(cost);
}
