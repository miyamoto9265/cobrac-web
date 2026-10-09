import { useMemo } from "react";
import type { PlanAutoSkipReason, PlanDecisionReason, PlanEventRecord, PlanRecord, PlanRowView } from "@cobrac/shared";
import { maxFollowups } from "@cobrac/shared";
import { useI18n, useT, type MessageKey } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { planEventText } from "../../lib/plan";
import { DECISION_REASONS, autoSkipText, rowLabel } from "./common";

/** The start of a long text in the history (an answer, a reason); the whole text is its title. */
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** What the plan did, newest first (collapsed). */
export function PlanHistory({ events, rows, plan, className = "mb-5" }: { events: PlanEventRecord[]; rows: PlanRowView[]; plan: PlanRecord; className?: string }) {
  const t = useT();
  const { locale } = useI18n();
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);
  if (!events.length) return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return (
    <details className={`rounded-xl border border-slate-200 bg-white p-3 ${className}`} data-testid="plan-history">
      <summary className="cursor-pointer text-sm font-semibold coarse:py-2">{t("plan.history")}</summary>
      <ul className="mt-2 grid gap-1 text-xs">
        {events.map((e) => {
          const row = e.rowId ? byId.get(e.rowId) : undefined;
          const d = e.detail ?? {};
          // what the Orchestrator's AI wrote: the answer it gave, or the reason of its decision
          const said = e.type === "row_auto_answered" ? text(d.answer) : e.type === "row_ai_resolved" ? text(d.reason) : "";
          return (
            <li key={e.sk} className="flex min-w-0 flex-wrap gap-x-2" data-type={e.type}>
              <span className="text-slate-500">{fmtDate(e.at, locale)}</span>
              <span>{planEventText(e, t)}</span>
              {e.type === "row_ai_decided" && typeof d.verdict === "string" && <span className="text-violet-700">{t(`auto.verdict.${d.verdict}` as MessageKey)}</span>}
              {e.type === "row_auto_skipped" && typeof d.reason === "string" && (
                <span className="text-amber-800">{d.reason === "ai_skipped" && text(d.error) ? text(d.error) : autoSkipText(t, plan, d.reason as PlanAutoSkipReason)}</span>
              )}
              {e.type === "proposal_accepted" && e.by === "runner" && <span className="text-violet-700">{t("plan.proposal.applied")}</span>}
              {e.type === "row_pushed" && typeof d.prNo === "number" && <span className="font-mono text-slate-500">#{d.prNo}</span>}
              {e.type === "row_decision" && DECISION_REASONS.includes(d.reason as PlanDecisionReason) && <span className="text-amber-800">{t(`plan.decision.${d.reason}` as MessageKey, { n: maxFollowups(plan) })}</span>}
              {row && <span className="text-slate-600">{rowLabel(row)}</span>}
              {said && (
                <span className="min-w-0 basis-full break-words text-slate-600" title={said} data-testid="plan-event-said">
                  {clip(said)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
