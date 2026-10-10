// ---------------------------------------------------------------------------
// 方針 (plan policy): how the Orchestrator runs one plan, in five items (scope, granularity, evidence, priority,
// decisions). The draft job writes it from the goal, the attached lists and the owner's answers to the questions before
// the draft; re-plans may replace it; the owner never edits it. It is read by the plan's jobs (draft, re-plan, the
// Orchestrator's answers and decisions), by the rows' agents (scope, granularity, evidence) and, for its granularity
// only, by a new Canon made at confirmation. Plans made before it had five items hold one string: their granularity.
// ---------------------------------------------------------------------------

import { cleanPlanNote } from "./plan.js";

export const PLAN_POLICY_ITEMS = ["scope", "granularity", "evidence", "priority", "decisions"] as const;
export type PlanPolicyItem = (typeof PLAN_POLICY_ITEMS)[number];

export type PlanPolicy = Record<PlanPolicyItem, string> & {
  /** Items taken from the owner's answers to the questions before the draft */
  fromAnswers?: PlanPolicyItem[];
};

/** Characters of one item */
export const PLAN_POLICY_ITEM_MAX = 600;

/** Items the plan's rows' agents follow (the others are the Orchestrator's own business). */
export const PLAN_POLICY_AGENT_ITEMS: readonly PlanPolicyItem[] = ["scope", "granularity", "evidence"];

const LABELS: Record<PlanPolicyItem, string> = {
  scope: "Scope",
  granularity: "Granularity",
  evidence: "Evidence",
  priority: "Priority",
  decisions: "Decisions",
};

const isItem = (v: unknown): v is PlanPolicyItem => typeof v === "string" && (PLAN_POLICY_ITEMS as readonly string[]).includes(v);

/**
 * The policy as stored or as a job wrote it, cleaned: each item one bounded text, `fromAnswers` only real items with
 * text. A string (plans from before the five items) is the granularity. Anything else is an empty policy.
 */
export function planPolicyOf(v: unknown): PlanPolicy {
  if (typeof v === "string") return { ...emptyPlanPolicy(), granularity: cleanPlanNote(v).slice(0, PLAN_POLICY_ITEM_MAX) };
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const p = emptyPlanPolicy();
  for (const k of PLAN_POLICY_ITEMS) p[k] = cleanPlanNote(o[k]).slice(0, PLAN_POLICY_ITEM_MAX);
  const from = Array.isArray(o.fromAnswers) ? [...new Set(o.fromAnswers.filter(isItem))].filter((k) => p[k]) : [];
  return from.length ? { ...p, fromAnswers: from } : p;
}

export const emptyPlanPolicy = (): PlanPolicy => ({ scope: "", granularity: "", evidence: "", priority: "", decisions: "" });

export const isEmptyPlanPolicy = (p: PlanPolicy): boolean => PLAN_POLICY_ITEMS.every((k) => !p[k]);

export const samePlanPolicy = (a: PlanPolicy, b: PlanPolicy): boolean => PLAN_POLICY_ITEMS.every((k) => a[k] === b[k]);

/** The policy as labelled lines for an agent or a Canon (`items`: which ones; empty items are left out). */
export function planPolicyText(p: PlanPolicy, items: readonly PlanPolicyItem[] = PLAN_POLICY_ITEMS): string {
  return items
    .filter((k) => p[k])
    .map((k) => `- ${LABELS[k]}: ${p[k]}`)
    .join("\n");
}

/** Note appended to the research and HCD specs of a plan's row: the parts of the plan's policy its agent follows. */
export function planPolicyNote(p: PlanPolicy): string {
  const text = planPolicyText(p, PLAN_POLICY_AGENT_ITEMS);
  if (!text) return "";
  return (
    "\n\n## Policy of the plan\n\n" +
    "This project is a row of a plan. The plan's Orchestrator set this policy for all of its rows; follow it unless it contradicts the ROI and TLF you were given (then follow the ROI and TLF and say so in `decision_log.md`). " +
    "A Canon's definitions, when the project has one, come first.\n\n" +
    `${text}\n`
  );
}
