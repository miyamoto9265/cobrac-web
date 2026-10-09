import { AlertTriangle, Loader2, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { PlanAutoSkipReason, PlanDecisionReason, PlanJobState, PlanRecord, PlanRowRejected, PlanRowView } from "@cobrac/shared";
import { MAX_ROW_AUTO_RETRIES, OVERLAP_LIMIT, PLAN_LIMITS, maxFollowups } from "@cobrac/shared";
import { useI18n, useT, type MessageKey, type TFn } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { rowActionText, shownAnchors } from "../../lib/plan";

// Pieces of the plan page shared by a draft (components/plan/PlanDraft.tsx) and a confirmed plan (pages/PlanDetailPage.tsx).

export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
export const secondaryBtn = "flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11";
export const dangerBtn = "flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 coarse:min-h-11";
export const iconBtn = "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 coarse:h-11 coarse:w-11";
export const seedChip = "rounded-full bg-indigo-100 px-1.5 py-0.5 font-medium normal-case tracking-normal text-indigo-700";

export const DECISION_REASONS: PlanDecisionReason[] = ["conflicts", "conform_limit", "pr_rejected", "pr_withdrawn", "other_canon", "push_failed"];
/** v0.40.0 left a row out after this many automatic answers or decision jobs (question_limit / decide_failed, kept on its records). */
const V040_AUTO_LIMIT = 3;

/** Why the autonomous run left a row out, as text (the reasons of 「人の判断」 / 「要対応」 keep their texts). */
export function autoSkipText(t: TFn, plan: Pick<PlanRecord, "settings">, reason: PlanAutoSkipReason): string {
  const n = { n: maxFollowups(plan) };
  if ((DECISION_REASONS as string[]).includes(reason)) return t(`plan.decision.${reason}` as MessageKey, n);
  if (reason === "ai_rejected") return t("auto.reason.ai_rejected");
  if (reason === "ai_skipped") return t("auto.reason.ai_skipped");
  if (reason === "question_limit") return t("auto.reason.question_limit", { n: V040_AUTO_LIMIT });
  if (reason === "decide_failed") return t("auto.reason.decide_failed", { n: V040_AUTO_LIMIT });
  return t(`plan.reason.${reason}` as MessageKey, { n: MAX_ROW_AUTO_RETRIES });
}

/** The line of a row the autonomous run left out: the Orchestrator's AI's own reason when it chose 「スキップ」. */
export function autoSkipLine(t: TFn, plan: Pick<PlanRecord, "settings">, skip: NonNullable<PlanRowView["autoSkip"]>): string {
  if (skip.reason === "ai_skipped") return t("auto.aiSkipped", { reason: skip.error?.trim() || "—" });
  return t("auto.skipped", { reason: autoSkipText(t, plan, skip.reason) });
}

export const rowLabel = (r: { roi: string; tlf: string }) => [r.tlf, r.roi].filter((s) => s.trim()).join(" in ");
/** Short name of a row for the lists of other rows (overlaps, dependencies). */
export const rowName = (r: { roi: string; tlf: string }) => r.tlf.trim() || r.roi.trim() || "—";
/** Why a plan job failed: the reason in the screen's language when the owner could not run it, else the job's own error. */
export const jobError = (j: PlanJobState, t: TFn) => (j.errorCode ? t(`plan.jobError.${j.errorCode}` as MessageKey) : (j.error ?? ""));

export function Rejected({ items, onClose }: { items: PlanRowRejected[]; onClose: () => void }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="plan-rejected">
      <div className="mb-1 flex items-center gap-2 font-medium">
        {t("plan.rejected", { n: items.length })}
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 hover:bg-amber-100 coarse:min-h-11 coarse:min-w-11" aria-label={t("close")}>
          <X size={14} />
        </button>
      </div>
      <ul className="grid gap-0.5 text-xs">
        {items.map((r, i) => {
          const reason = t(`plan.reject.${r.reason}` as MessageKey, { max: PLAN_LIMITS.maxRows });
          return (
            <li key={`${r.file ?? ""}#${r.row}-${r.reason}-${i}`} className="break-words">
              {r.file ? t("plan.fileRowLine", { file: r.file, row: r.row, reason }) : t("plan.rowLine", { row: r.row, reason })}
              {r.text && <span className="ml-1 break-all text-amber-700">— {r.text}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type RowFactsOf = Pick<Partial<PlanRowView>, "seed" | "anchors" | "hub" | "overlaps" | "existing" | "duplicateOf" | "dependsOn" | "rebuild">;

/**
 * What the plan knows about a row besides ROI × TLF: seed, finished project that covers it or 「作り直す」 (a checkbox
 * in the editor, a note elsewhere), unfinished project with the same ROI × TLF, anchors, hub score, overlapping rows
 * and dependencies.
 */
export function RowFacts({ row, names, rebuild }: { row: RowFactsOf; names: ReadonlyMap<string, string>; rebuild?: { checked: boolean; onChange: (v: boolean) => void } }) {
  const t = useT();
  const anchors = row.anchors ?? [];
  const { shown, more } = shownAnchors(anchors);
  const others = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(t("plan.sep"));
  const overlaps = row.overlaps ?? [];
  const deps = row.dependsOn ?? [];
  if (!row.seed && !row.existing && !row.rebuild && !row.duplicateOf && !anchors.length && !overlaps.length && !deps.length) return null;
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" data-testid="row-facts">
      {row.seed && (
        <span className={seedChip} title={t("plan.seedHelp")}>
          {t("plan.seed")}
        </span>
      )}
      {row.existing && (
        <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700" title={t("plan.existingHelp")}>
          <span className="shrink-0 font-medium">{t("plan.existing")}</span>
          <Link to={projectPath(row.existing.projectId)} className="min-w-0 truncate underline">
            {row.existing.name || row.existing.projectId}
          </Link>
        </span>
      )}
      {(row.existing || row.rebuild) && rebuild && (
        <label className="inline-flex items-center gap-1 text-slate-600 coarse:min-h-11" title={t("plan.rebuildHelp")}>
          <input type="checkbox" checked={rebuild.checked} onChange={(e) => rebuild.onChange(e.target.checked)} />
          {t("plan.rebuild")}
        </label>
      )}
      {row.rebuild && !rebuild && (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700" title={t("plan.rebuildHelp")} data-testid="row-rebuild">
          {t("plan.rebuild")}
        </span>
      )}
      {row.duplicateOf && (
        <Link to={projectPath(row.duplicateOf)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800 hover:underline" title={t("plan.duplicateHelp")}>
          <AlertTriangle size={11} aria-hidden /> {t("plan.duplicate")}
        </Link>
      )}
      {anchors.length > 0 && (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1" title={`${t("plan.anchors")}: ${anchors.join(", ")}`} data-testid="row-anchors">
          {shown.map((a) => (
            <span key={a} className="break-all rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-700">
              {a}
            </span>
          ))}
          {more > 0 && <span className="text-slate-500">+{more}</span>}
        </span>
      )}
      {typeof row.hub === "number" && anchors.length > 0 && (
        <span className="text-slate-500" title={t("plan.hubHelp")}>
          {t("plan.hub", { n: row.hub })}
        </span>
      )}
      {overlaps.length > 0 && (
        <span className="min-w-0 break-words text-slate-600" title={t("plan.overlapsHelp", { k: OVERLAP_LIMIT })}>
          {t("plan.overlaps", { rows: others(overlaps) })}
        </span>
      )}
      {deps.length > 0 && <span className="min-w-0 break-words text-slate-600">{t("plan.dependsOn", { rows: others(deps) })}</span>}
    </div>
  );
}

/**
 * 自律実行: what the Orchestrator's AI does for a row now (its row job: an answer being written or waiting to be given, a
 * decision being made) and what it last decided, with its reason. The owner's own buttons stay next to it.
 */
export function RowAiNotes({ row }: { row: Pick<PlanRowView, "rowJob" | "aiResolution" | "autoSkip" | "orchestratorRetry"> }) {
  const t = useT();
  const { locale } = useI18n();
  const j = row.rowJob;
  const job: MessageKey | null = !j ? null : j.kind === "answer" ? (j.status === "ready" ? "auto.rowJob.answerReady" : "auto.rowJob.answerQueued") : "auto.rowJob.resolveQueued";
  // a row the AI skipped already says so (with the reason) in its 「見送り」 line
  const r = row.aiResolution && !(row.aiResolution.action === "skip" && row.autoSkip?.reason === "ai_skipped") ? row.aiResolution : null;
  const retry = row.orchestratorRetry;
  if (!job && !r && !retry) return null;
  return (
    <div className="grid gap-0.5 text-xs">
      {job && (
        <div className="flex items-center gap-1 text-violet-700" data-testid="row-ai-job">
          {j!.status === "queued" && <Loader2 size={12} className="shrink-0 motion-safe:animate-spin" aria-hidden />}
          {t(job)}
        </div>
      )}
      {retry && !job && (
        <div className="break-words text-amber-800" data-testid="row-ai-retry">
          {t("auto.retry", { n: retry.n, at: fmtDate(retry.at, locale) })}
          {retry.error && <span className="text-slate-600"> — {retry.error}</span>}
        </div>
      )}
      {r && (
        <div className="break-words text-violet-700" data-testid="row-ai-resolution">
          <span className="font-medium">{t("auto.aiResolution", { action: rowActionText(r.action, t) || r.action })}</span>
          {r.reason && <span className="text-slate-600"> — {r.reason}</span>}
        </div>
      )}
    </div>
  );
}
