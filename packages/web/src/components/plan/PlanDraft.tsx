import { Play, Trash2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { PlanDetailResponse, PlanEstimate, PlanRowRejected } from "@cobrac/shared";
import { PLAN_JOB_SHORT_ROWS, formatUsd, isAutonomous, isDeterministicPlanAttachment } from "@cobrac/shared";
import { useI18n, useT, type TFn } from "../../i18n";
import { api } from "../../lib/api";
import { fmtDuration } from "../../lib/plan";
import { primaryBtn } from "../../pages/CanonsPage";
import { HelpTip } from "../HelpTip";
import type { CanonFlush, ConfirmCanon } from "./CanonSection";
import { dangerBtn } from "./common";
import { DraftHow } from "./DraftHow";
import { DraftRows, useDraftRows } from "./DraftRows";
import { DraftWhat } from "./DraftWhat";
import { PlanHistory } from "./PlanHistory";

const costRange = (e: PlanEstimate, t: TFn) => t("pd.costRange", { min: formatUsd(e.costUsd.min), max: formatUsd(e.costUsd.max) });

/**
 * A plan before confirmation (DRAFT, or DRAFTING while its draft job runs), from the top: the banner, 「1. 作るもの」,
 * 「2. 行とバッチ」, 「3. 進め方」, 「4. 確定して開始」, then the history and 「計画を削除」. No project exists yet, so the
 * progress, waves, time and cost of a running plan are not shown.
 */
export function PlanDraft({
  d,
  busy,
  act,
  load,
  onError,
  rejected,
  onRejected,
  alert,
}: {
  d: PlanDetailResponse;
  busy: boolean;
  act: (fn: () => Promise<unknown>, after?: () => void) => void;
  load: () => Promise<unknown>;
  onError: (e: unknown) => void;
  rejected: PlanRowRejected[];
  onRejected: (r: PlanRowRejected[]) => void;
  /** The page's error, shown under the banner */
  alert: ReactNode;
}) {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const id = useId();
  const { plan, rows } = d;
  const { planId } = plan;
  const drafting = plan.status === "DRAFTING";
  const auto = isAutonomous(plan);
  const editor = useDraftRows(d);
  const canonFlushRef = useRef<CanonFlush | null>(null);
  const [flushing, setFlushing] = useState(false);

  // a draft that reads xlsx / PDF lists or many rows gets the long budget (as planJobBudgetMs)
  const long = (plan.attachments ?? []).some((a) => !isDeterministicPlanAttachment(a.name)) || rows.length > PLAN_JOB_SHORT_ROWS;
  const banner = drafting
    ? { cls: "border-blue-200 bg-blue-50 text-blue-700", text: long ? t("plan.draftingNoteLong", { n: PLAN_JOB_SHORT_ROWS }) : t("plan.draftingNote") }
    : auto && plan.autonomousError
      ? { cls: "border-rose-200 bg-rose-50 text-rose-700", text: t("auto.confirmError", { error: plan.autonomousError }) }
      : auto && plan.draft?.status === "done" && plan.draft.autoConfirm
        ? { cls: "border-violet-200 bg-violet-50 text-violet-700", text: t("auto.confirmSoon") }
        : !rows.length
          ? { cls: "border-blue-200 bg-blue-50 text-blue-700", text: t("pd.banner.empty") }
          : plan.draft?.status === "done"
            ? { cls: "border-blue-200 bg-blue-50 text-blue-700", text: t("pd.banner.drafted") }
            : { cls: "border-blue-200 bg-blue-50 text-blue-700", text: t("plan.draftNote") };

  const redraft = (saveGoal: () => Promise<void>) => {
    if (!window.confirm(t("plan.redraftQ"))) return;
    act(async () => {
      await saveGoal();
      if (editor.dirty) await editor.save();
      await api.requestDraft(planId, locale);
    });
  };
  const cancelDraft = () => window.confirm(t("plan.cancelDraftQ")) && act(() => api.cancelDraft(planId));

  // why the plan cannot be confirmed yet, shown next to the button
  const blocked = drafting ? t("pd.confirm.drafting") : !editor.rows.length ? t("pd.confirm.noRows") : editor.dirty ? t("pd.confirm.unsaved") : null;
  const e = editor.estimate;
  const confirm = async () => {
    // a new Canon name typed but not saved yet is stored first, so the dialog names the Canon that is created
    let canon: ConfirmCanon = plan.canonNew ? { isNew: true, name: plan.canonNew.name } : d.canon && !d.canon.missing ? { isNew: false, name: d.canon.name } : null;
    const flush = canonFlushRef.current;
    if (flush) {
      setFlushing(true);
      const stored = await flush().finally(() => setFlushing(false));
      if (stored === false) return;
      canon = stored;
    }
    const existing = rows.filter((r) => r.existing).length;
    const text = [
      t("plan.confirmQ", { n: e.rows, waves: e.waves, c: e.concurrency, time: fmtDuration(e.minutes, t), cost: `${formatUsd(e.costUsd.min)}–${formatUsd(e.costUsd.max)}` }),
      ...(existing ? [t("plan.confirmExisting", { n: existing })] : []),
      ...(canon ? [t(canon.isNew ? "plan.confirmCanonNew" : "plan.confirmCanon", { name: canon.name })] : []),
    ].join("\n\n");
    if (!window.confirm(text)) return;
    act(() => api.confirmPlan(planId, locale));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className={`break-words rounded-xl border px-4 py-3 text-sm ${banner.cls}`} role="status" data-testid="plan-banner">
        {banner.text}
      </div>
      {alert}

      <DraftWhat
        plan={plan}
        rows={editor.rows.length}
        busy={busy}
        act={act}
        onError={onError}
        onSaved={load}
        onDraft={redraft}
        onCancelDraft={cancelDraft}
        beforeServerChange={editor.beforeServerChange}
        onRejected={onRejected}
      />
      <DraftRows d={d} editor={editor} busy={busy} readOnly={drafting} act={act} rejected={rejected} onRejected={onRejected} />
      <DraftHow d={d} onChanged={() => void load()} onSaved={load} onError={onError} flushRef={canonFlushRef} />

      <section aria-labelledby={`${id}-h`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:px-6 sm:py-5" data-testid="plan-confirm">
        <div className="grid min-w-0 gap-0.5">
          <h2 id={`${id}-h`} className="text-base font-semibold sm:text-lg">
            {t("pd.confirm.title")}
          </h2>
          <div className="flex flex-wrap items-center gap-1 text-sm text-slate-700" data-testid="plan-estimate">
            {editor.rows.length ? t("pd.confirm.estimate", { time: fmtDuration(e.minutes, t), cost: costRange(e, t), n: e.rows, c: e.concurrency }) : t("pd.confirm.noEstimate")}
            {editor.rows.length > 0 && !!e.lanes && (
              <span className="text-slate-500" data-testid="plan-estimate-lanes">
                · {t("flow.lanes")} {e.lanes}
              </span>
            )}
            {editor.rows.length > 0 && <HelpTip text={t(e.lanes ? "flow.estimateHelp" : "plan.estimateHelp")} />}
          </div>
          {auto && <p className="text-xs text-violet-700">{t("auto.confirmNote")}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {blocked && (
            <span id={`${id}-blocked`} className="text-sm font-medium text-amber-800" data-testid="plan-confirm-blocked">
              {blocked}
            </span>
          )}
          <button type="button" disabled={busy || flushing || !!blocked} onClick={() => void confirm()} aria-describedby={blocked ? `${id}-blocked` : undefined} className={primaryBtn}>
            <Play size={14} aria-hidden /> {t("plan.confirm")}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-start justify-between gap-3" data-testid="plan-bottom">
        <div className="min-w-0 flex-1 basis-80">
          <PlanHistory events={d.events} rows={rows} plan={plan} className="" />
        </div>
        {plan.status === "DRAFT" && (
          <button type="button" disabled={busy} onClick={() => window.confirm(t("plan.deleteQ")) && act(() => api.deletePlan(planId), () => navigate("/plans"))} className={dangerBtn}>
            <Trash2 size={14} aria-hidden /> {t("plan.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
