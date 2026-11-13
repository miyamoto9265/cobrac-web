import type { PlanPulseRow, PlanSummary } from "@cobrac/shared";
import { isAutonomous } from "@cobrac/shared";

// What waits on the owner across the missions: the "Your turn" list of the mission page and its count in the sidebar.

export type TurnKind = "attention" | "decision" | "question" | "draftAsk" | "review" | "paused" | "proposals" | "draftFailed" | "draftReady";
export interface TurnItem {
  key: string;
  kind: TurnKind;
  plan: PlanSummary;
  row?: PlanPulseRow;
  n?: number;
}
const TURN_ORDER: TurnKind[] = ["attention", "decision", "question", "draftAsk", "review", "paused", "proposals", "draftFailed", "draftReady"];

/**
 * What waits on the owner, across every plan: rows to answer, approve, decide or look at, proposals, stopped plans, finished
 * drafts. While an autonomous plan runs, its rows and proposals are the Orchestrator's, and so is a draft it confirms on its
 * own; the plan is the owner's again when it pauses or cannot confirm its draft.
 */
export function turnItems(items: PlanSummary[]): TurnItem[] {
  const out: TurnItem[] = [];
  for (const p of items) {
    const auto = isAutonomous(p);
    const orchestratorActs = auto && p.status === "RUNNING";
    if (!orchestratorActs) {
      for (const r of p.pulse?.waiting ?? []) out.push({ key: `${p.planId}/${r.rowId}`, kind: r.state as TurnKind, plan: p, row: r });
      if (p.pulse?.openProposals) out.push({ key: `${p.planId}/proposals`, kind: "proposals", plan: p, n: p.pulse.openProposals });
    }
    if (p.status === "PAUSED" && p.pausedReason && p.pausedReason !== "user") out.push({ key: `${p.planId}/paused`, kind: "paused", plan: p });
    const confirmsItself = auto && !!p.draft?.autoConfirm && !p.autonomousError;
    if (p.status === "DRAFT" && p.draft?.status === "done" && !confirmsItself) out.push({ key: `${p.planId}/draft`, kind: "draftReady", plan: p });
    if (p.status === "DRAFT" && p.draft?.status === "failed") out.push({ key: `${p.planId}/draft`, kind: "draftFailed", plan: p });
    // the Orchestrator asks before drafting, autonomous or not: only the owner can answer
    if (p.status === "DRAFTING" && p.draft?.status === "asking") out.push({ key: `${p.planId}/ask`, kind: "draftAsk", plan: p, n: p.draft.qa?.at(-1)?.questions.length ?? 0 });
  }
  return out.sort((a, b) => TURN_ORDER.indexOf(a.kind) - TURN_ORDER.indexOf(b.kind));
}

