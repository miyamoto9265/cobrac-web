import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, FileUp, ListChecks, Loader2, Pause, Pencil, Play, Plus, RotateCcw, Save, Send, SkipForward, Sparkles, Square, Trash2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { PlanDetailResponse, PlanEventRecord, PlanJobState, PlanProposalRecord, PlanRecord, PlanRowRejected, PlanRowState, PlanRowView, ReasoningEffort } from "@cobrac/shared";
import { MAX_ROW_AUTO_RETRIES, MAX_SEED_ROWS, ORG_TOKENS_PER_MINUTE, OVERLAP_LIMIT, PLAN_JOB_SHORT_ROWS, PLAN_LIMITS, RUN_TOKENS_PER_MINUTE, formatUsd, isDeterministicPlanAttachment, planEstimate } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { ModelSelect } from "../components/ModelSelect";
import { useI18n, useT, type MessageKey, type TFn } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { ROW_STATE_COLOR, ROW_STATE_ORDER, fmtDuration, fmtElapsed, isSeedWave, planPath, planWaves, seedIndexes, shownAnchors, splitIntoWaves, wavesText, waveRuns } from "../lib/plan";
import { inputCls, primaryBtn } from "./CanonsPage";
import { PlanStatusBadge } from "./PlansPage";

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
const secondaryBtn = "flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11";
const dangerBtn = "flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 coarse:min-h-11";
const iconBtn = "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 coarse:h-11 coarse:w-11";
const seedChip = "rounded-full bg-indigo-100 px-1.5 py-0.5 font-medium normal-case tracking-normal text-indigo-700";

/** A row being edited in a draft (`key` is stable while the row moves). */
interface DraftRow {
  key: string;
  rowId?: string;
  roi: string;
  tlf: string;
  rationale: string;
  wave: number;
  /** Sent back as it is, so a manual save keeps the priorities of a CSV or a draft */
  priority?: number | null;
  /** The row as last read (seed, anchors, existing project…), shown read-only; absent on new rows */
  view?: PlanRowView;
  /** 「作り直す」: build the row although a finished project covers it (stored on the row once saved) */
  rebuild?: boolean;
}

let draftSeq = 0;
const toDraft = (r: PlanRowView): DraftRow => ({ key: r.rowId ?? `new${++draftSeq}`, rowId: r.rowId, roi: r.roi, tlf: r.tlf, rationale: r.rationale, wave: r.wave, priority: r.priority, view: r, rebuild: !!r.rebuild });
/** What decides the seeds of rows being edited (a row ticked 「作り直す」 is built). */
const seedFactsOf = (rows: DraftRow[]) => rows.map((r) => ({ wave: r.wave, seed: !!r.view?.seed, existing: r.rebuild ? null : (r.view?.existing ?? null), state: "pending" as const }));
/** Why a plan job failed: the reason in the screen's language when the owner could not run it, else the job's own error. */
const jobError = (j: PlanJobState, t: TFn) => (j.errorCode ? t(`plan.jobError.${j.errorCode}` as MessageKey) : (j.error ?? ""));

const rowLabel = (r: { roi: string; tlf: string }) => [r.tlf, r.roi].filter((s) => s.trim()).join(" in ");
/** Short name of a row for the lists of other rows (overlaps, dependencies). */
const rowName = (r: { roi: string; tlf: string }) => r.tlf.trim() || r.roi.trim() || "—";

function RowStateChip({ state }: { state: PlanRowState }) {
  const t = useT();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ROW_STATE_COLOR[state]}`}>{t(`plan.row.${state}` as MessageKey)}</span>;
}

function Rejected({ items, onClose }: { items: PlanRowRejected[]; onClose: () => void }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="plan-rejected">
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

/** What the last draft job left: the error of a failed one, or the items a finished one could not read. */
function DraftOutcome({ plan }: { plan: PlanRecord }) {
  const t = useT();
  const [closed, setClosed] = useState<string | null>(null);
  const j = plan.draft;
  if (!j) return null;
  if (j.status === "failed")
    return (
      <div className="mb-3 break-words rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="plan-draft-failed">
        {t("plan.draftFailed", { error: jobError(j, t) || "—" })}
      </div>
    );
  if (j.status === "cancelled") return <p className="mb-3 text-xs text-slate-500">{t("plan.draftCancelled")}</p>;
  if (j.status !== "done") return null;
  const unread = j.unread ?? [];
  const dropped = j.dropped ?? 0;
  const id = `${j.jobId ?? ""}${j.endedAt ?? ""}`;
  if ((!unread.length && !dropped) || closed === id) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="plan-unread">
      <div className="mb-1 flex items-center gap-2 font-medium">
        {unread.length > 0 ? t("plan.unread", { n: unread.length }) : t("plan.dropped", { n: dropped })}
        <button type="button" onClick={() => setClosed(id)} className="ml-auto rounded p-1 hover:bg-amber-100 coarse:min-h-11 coarse:min-w-11" aria-label={t("close")}>
          <X size={14} />
        </button>
      </div>
      {unread.length > 0 && (
        <ul className="grid gap-0.5 text-xs">
          {unread.map((u, i) => (
            <li key={i} className="break-words">
              {/* the job names the goal `goal` (else a file name) */}
              <span className="font-medium">{u.source.trim().toLowerCase() === "goal" ? t("plan.goal") : u.source || "—"}</span>
              {u.location && <span> · {u.location}</span>}
              <span className="text-amber-700"> — {u.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {unread.length > 0 && dropped > 0 && <p className="mt-1 text-xs">{t("plan.dropped", { n: dropped })}</p>}
    </div>
  );
}

/** A draft being written by its job: how far it is, and a way to stop it. */
function DraftJobBanner({ plan, rows, busy, onCancel }: { plan: PlanRecord; rows: number; busy: boolean; onCancel: () => void }) {
  const t = useT();
  const j = plan.draft;
  // the job gets the long budget for xlsx / PDF lists or many rows (as planJobBudgetMs)
  const long = (plan.attachments ?? []).some((a) => !isDeterministicPlanAttachment(a.name)) || rows > PLAN_JOB_SHORT_ROWS;
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 sm:flex-row sm:items-center" data-testid="plan-drafting" role="status">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" aria-hidden />
        <div className="min-w-0">
          <div className="font-medium">{t("plan.drafting", { state: t(`plan.job.${j?.status ?? "waiting"}` as MessageKey), time: fmtElapsed(j?.requestedAt, Date.now(), t) })}</div>
          <div className="text-xs">{long ? t("plan.draftingNoteLong", { n: PLAN_JOB_SHORT_ROWS }) : t("plan.draftingNote")}</div>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={onCancel} className={`${secondaryBtn} shrink-0 text-slate-700`}>
        <Square size={14} aria-hidden /> {t("plan.cancelDraft")}
      </button>
    </div>
  );
}

function Stat({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        {label} {help && <HelpTip text={help} />}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Summary({ d }: { d: PlanDetailResponse }) {
  const t = useT();
  const { plan, rows, limits, estimate, actual } = d;
  const counts = plan.rowCounts!;
  const total = rows.length || 1;
  // wave numbers as stored (the headings of the rows show the same numbers)
  const waves = planWaves(rows);
  const shown = ROW_STATE_ORDER.filter((s) => (s === "running" ? counts.running + counts.starting : counts[s]) > 0);
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="plan-summary">
      <Stat label={t("plan.progress")}>
        <div className="font-medium">{t("plan.doneOf", { done: counts.done, n: rows.length })}</div>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="bg-emerald-500" style={{ width: `${(counts.done / total) * 100}%` }} />
          <div className="bg-blue-500" style={{ width: `${((counts.running + counts.starting) / total) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${(counts.question / total) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(counts.attention / total) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {shown.map((s) => (
            <span key={s} className={`rounded-full px-1.5 py-0.5 text-[11px] ${ROW_STATE_COLOR[s]}`}>
              {t(`plan.row.${s}` as MessageKey)} {s === "running" ? counts.running + counts.starting : counts[s]}
            </span>
          ))}
        </div>
      </Stat>
      <Stat label={t("plan.waves")}>
        <div className="font-medium">{wavesText(waves, plan.activeWave, t)}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
          {t("plan.concurrency", { n: limits.effective })}
          <HelpTip
            text={t("plan.concurrencyHelp", {
              global: limits.maxConcurrentJobs,
              perUser: limits.maxConcurrentJobsPerUser,
              min: RUN_TOKENS_PER_MINUTE.min / 1000,
              max: RUN_TOKENS_PER_MINUTE.max / 1000,
              tpm: ORG_TOKENS_PER_MINUTE / 1000,
            })}
          />
        </div>
      </Stat>
      <Stat label={t("plan.time")} help={t("plan.estimateHelp")}>
        <div>
          <span className="text-slate-500">{t("plan.estimate")}</span> <span className="font-medium">{fmtDuration(estimate.minutes, t)}</span>
        </div>
        <div>
          <span className="text-slate-500">{t("plan.actual")}</span> <span className="font-medium">{fmtDuration(actual.minutes, t)}</span>
        </div>
      </Stat>
      <Stat label={t("plan.cost")}>
        <div>
          <span className="text-slate-500">{t("plan.estimate")}</span>{" "}
          <span className="font-medium">
            {formatUsd(estimate.costUsd.min)}–{formatUsd(estimate.costUsd.max)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">{t("plan.actual")}</span> <span className="font-medium text-emerald-700">{formatUsd(actual.costUsd)}</span>
          {actual.unpricedProjects > 0 && <span className="ml-1 text-xs text-slate-500">({t("plan.unpriced", { n: actual.unpricedProjects })})</span>}
        </div>
        {typeof d.planJobsCostUsd === "number" && (
          <div className="text-xs text-slate-500" data-testid="plan-jobs-cost">
            {t("plan.planJobsCost", { cost: formatUsd(d.planJobsCostUsd) })}
          </div>
        )}
      </Stat>
    </div>
  );
}

function Settings({ d, onChanged, onError }: { d: PlanDetailResponse; onChanged: () => void; onError: (e: unknown) => void }) {
  const t = useT();
  const { plan } = d;
  const s = plan.settings;
  // the settings stay open while a draft is being written (only the rows are locked then)
  const draft = plan.status === "DRAFT" || plan.status === "DRAFTING";
  const save = (b: { model?: string | null; reasoningEffort?: ReasoningEffort | null; researchMode?: boolean }) => void api.updatePlan(plan.planId, { settings: b }).then(onChanged).catch(onError);
  // the model and effort are shown from local state and saved after a pause, so typing a custom model ID is not interrupted
  const [choice, setChoice] = useState({ model: s.modelChosen ? s.model : null, effort: s.reasoningEffort });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const choose = (v: { model: string | null; effort: ReasoningEffort | null }) => {
    setChoice(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ model: v.model, reasoningEffort: v.effort }), 600);
  };
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" data-testid="plan-settings">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
        {t("plan.settings")} <HelpTip text={t("plan.settingsNote")} />
      </h2>
      {draft ? (
        <div className="grid gap-3">
          <ModelSelect model={choice.model} effort={choice.effort} onChange={choose} compact={false} />
          <label className="flex items-center gap-2 text-sm coarse:min-h-11">
            <input type="checkbox" checked={s.researchMode} onChange={(e) => save({ researchMode: e.target.checked })} />
            {t("plan.researchMode")}
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="font-mono">{s.model ?? "—"}</span>
          <span>effort: {s.reasoningEffort ?? "default"}</span>
          <span>
            {t("plan.researchMode")}: {s.researchMode ? "on" : "off"}
          </span>
          {plan.harnessRules !== undefined && plan.harnessRules !== null && <span>{t("plan.harness", { n: plan.harnessRules })}</span>}
        </div>
      )}
    </section>
  );
}

/** The granularity policy: editable in a draft (saved when the field loses focus), read-only afterwards. */
function Policy({ plan, onSaved, onError }: { plan: PlanRecord; onSaved: () => Promise<unknown>; onError: (e: unknown) => void }) {
  const t = useT();
  const editable = plan.status === "DRAFT";
  // null: not edited, the stored text is shown (and follows reloads)
  const [text, setText] = useState<string | null>(null);
  // the text as typed (a save that ends reads it), the text being saved, and a blur while it is saved
  const typed = useRef<string | null>(null);
  const sending = useRef<string | null>(null);
  const blurred = useRef(false);
  const stored = plan.policy ?? "";
  if (!editable && !stored.trim()) return null;
  const edit = (v: string | null) => {
    typed.current = v;
    setText(v);
  };
  const send = (value: string) => {
    sending.current = value;
    api
      .updatePlan(plan.planId, { policy: value })
      .then(() => onSaved())
      // text typed meanwhile stays
      .then(() => typed.current === value && edit(null))
      .catch(onError)
      .finally(() => {
        sending.current = null;
        const again = blurred.current;
        blurred.current = false;
        // the field was left again during the save with other text: save that too
        if (again && typed.current !== null && typed.current !== value) send(typed.current);
      });
  };
  const save = () => {
    const now = typed.current;
    if (now === null) return;
    if (sending.current !== null) {
      blurred.current = true;
      return;
    }
    if (now === stored) edit(null);
    else send(now);
  };
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" data-testid="plan-policy">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
        {t("canon.policy")} <HelpTip text={t("plan.policyHelp")} />
      </h2>
      {editable ? (
        <textarea
          value={text ?? stored}
          onChange={(e) => edit(e.target.value)}
          onBlur={save}
          rows={2}
          maxLength={2000}
          placeholder={t("canon.policyHint")}
          aria-label={t("canon.policy")}
          className={inputCls}
        />
      ) : (
        <p className="whitespace-pre-line break-words text-sm text-slate-700">{stored}</p>
      )}
    </section>
  );
}

function Inbox({ rows, onDone, onError }: { rows: PlanRowView[]; onDone: () => void; onError: (e: unknown) => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows.length) return null;
  const send = (r: PlanRowView) => {
    if (!r.projectId) return;
    setBusy(r.rowId);
    api
      .answer(r.projectId, (text[r.rowId] ?? "").trim(), locale)
      .then(() => {
        setText((m) => ({ ...m, [r.rowId]: "" }));
        onDone();
      })
      .catch(onError)
      .finally(() => setBusy(null));
  };
  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="plan-inbox">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-amber-800">
        {t("plan.inbox", { n: rows.length })} <HelpTip text={t("plan.inboxHelp")} />
      </h2>
      <ul className="grid gap-3">
        {rows.map((r) => (
          <li key={r.rowId} className="rounded-lg border border-amber-200 bg-white p-3">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-medium">{rowLabel(r)}</span>
              {r.projectId && (
                <Link to={projectPath(r.projectId)} className="text-xs text-blue-700 hover:underline">
                  {r.project?.name ?? r.projectId}
                </Link>
              )}
            </div>
            <div className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-amber-50 p-2 text-sm text-amber-800">{r.project?.pendingQuestion ?? ""}</div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                value={text[r.rowId] ?? ""}
                onChange={(e) => setText((m) => ({ ...m, [r.rowId]: e.target.value }))}
                rows={2}
                placeholder={t("plan.answerPlaceholder")}
                aria-label={t("plan.answer")}
                className={inputCls}
              />
              <button type="button" disabled={busy === r.rowId || !(text[r.rowId] ?? "").trim()} onClick={() => send(r)} className={`${primaryBtn} shrink-0 whitespace-nowrap`}>
                <Send size={14} aria-hidden /> {t("plan.answer")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Attention({ rows, act }: { rows: PlanRowView[]; act: (rowId: string, action: "retry" | "skip") => void }) {
  const t = useT();
  if (!rows.length) return null;
  return (
    <section className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4" data-testid="plan-attention">
      <h2 className="mb-2 text-sm font-semibold text-rose-700">{t("plan.attention", { n: rows.length })}</h2>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.rowId} className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-white p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{rowLabel(r)}</div>
              <div className="text-xs text-rose-700">{t(`plan.reason.${r.attentionReason ?? "failed"}` as MessageKey, { n: MAX_ROW_AUTO_RETRIES })}</div>
              {r.lastError && <div className="line-clamp-2 break-words text-xs text-slate-600">{r.lastError}</div>}
              {r.projectId && (
                <Link to={projectPath(r.projectId)} className="text-xs text-blue-700 hover:underline">
                  {r.project?.name ?? r.projectId}
                </Link>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => act(r.rowId, "retry")} className={secondaryBtn}>
                <RotateCcw size={14} aria-hidden /> {t("plan.retry")}
              </button>
              <button type="button" onClick={() => act(r.rowId, "skip")} className={secondaryBtn}>
                <SkipForward size={14} aria-hidden /> {t("plan.skip")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type RowFactsOf = Pick<Partial<PlanRowView>, "seed" | "anchors" | "hub" | "overlaps" | "existing" | "duplicateOf" | "dependsOn" | "rebuild">;

/**
 * What the plan knows about a row besides ROI × TLF: seed, finished project that covers it or 「作り直す」 (a checkbox
 * in the editor, a note elsewhere), unfinished project with the same ROI × TLF, anchors, hub score, overlapping rows
 * and dependencies.
 */
function RowFacts({ row, names, rebuild }: { row: RowFactsOf; names: ReadonlyMap<string, string>; rebuild?: { checked: boolean; onChange: (v: boolean) => void } }) {
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

/** Heading of a wave: its stored number, 「種」 for a seed wave. */
function WaveHeading({ wave, seed, current, className = "mb-1" }: { wave: number; seed: boolean; current?: boolean; className?: string }) {
  const t = useT();
  return (
    <h3 className={`flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`} data-testid="plan-wave">
      {t("plan.wave", { n: wave })}
      {seed && <span className={seedChip}>{t("plan.seed")}</span>}
      {current && <span className="rounded bg-blue-50 px-1.5 py-0.5 normal-case tracking-normal text-blue-700">{t("plan.current")}</span>}
    </h3>
  );
}

function RowsByWave({ d, act }: { d: PlanDetailResponse; act: (rowId: string, action: "retry" | "skip") => void }) {
  const t = useT();
  const waves = planWaves(d.rows);
  const names = useMemo(() => new Map(d.rows.map((r) => [r.rowId, rowName(r)])), [d.rows]);
  // 「種」 on a row only while it is the seed of its wave (as the headings)
  const seeds = useMemo(() => new Set([...seedIndexes(d.rows)].map((i) => d.rows[i].rowId)), [d.rows]);
  const canSkip = d.plan.status === "RUNNING" || d.plan.status === "PAUSED" || d.plan.status === "CANCELLED";
  return (
    <section className="mb-5" data-testid="plan-rows">
      <h2 className="mb-2 text-sm font-semibold">{t("plan.rows", { n: d.rows.length })}</h2>
      {waves.map((w) => {
        const rows = d.rows.filter((r) => r.wave === w);
        return (
          <div key={w} className="mb-3">
            <WaveHeading wave={w} seed={isSeedWave(rows)} current={d.plan.activeWave === w && d.plan.status === "RUNNING"} />
            <ul className="grid gap-1.5">
              {rows.map((r) => (
                // min-w-0: a grid item is as wide as its widest unbreakable content otherwise (the truncated project name of 「既存」)
                <li key={r.rowId} className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm">
                      <span className="font-medium">{r.tlf || "—"}</span>
                      <span className="text-slate-500"> · {r.roi || "—"}</span>
                    </div>
                    {r.rationale && <div className="line-clamp-1 break-words text-xs text-slate-500">{r.rationale}</div>}
                    <RowFacts row={{ ...r, seed: seeds.has(r.rowId) }} names={names} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {r.projectId && (
                      <Link to={projectPath(r.projectId)} className="max-w-[16rem] truncate text-blue-700 hover:underline">
                        {r.project?.name ?? r.projectId}
                      </Link>
                    )}
                    {/* a row done by an existing project spent nothing for this plan (the summary leaves it out too) */}
                    {typeof r.project?.costUsd === "number" && !r.existing && <span className="text-emerald-700">{formatUsd(r.project.costUsd)}</span>}
                    {r.attempts > 0 && <span className="text-slate-500">{t("plan.attempts", { n: r.attempts, max: MAX_ROW_AUTO_RETRIES })}</span>}
                    <RowStateChip state={r.state} />
                    {canSkip && r.state === "pending" && (
                      <button type="button" onClick={() => act(r.rowId, "skip")} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 coarse:min-h-11" title={t("plan.skip")}>
                        <SkipForward size={13} aria-label={t("plan.skip")} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function DraftEditor({
  d,
  onSaved,
  onError,
  onRejected,
  saveRef,
}: {
  d: PlanDetailResponse;
  onSaved: () => void;
  onError: (e: unknown) => void;
  onRejected: (r: PlanRowRejected[]) => void;
  /** Set while there are unsaved rows, so that "Confirm" saves them first and estimates what will be saved */
  saveRef: React.MutableRefObject<{ save: () => Promise<void>; rows: DraftRow[] } | null>;
}) {
  const t = useT();
  const [rows, setRows] = useState<DraftRow[]>(() => d.rows.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { planId } = d.plan;
  // names of other rows for overlaps and dependencies: as edited, else as last read
  const names = useMemo(() => new Map([...d.rows.map((r) => [r.rowId, rowName(r)] as const), ...rows.filter((r) => r.rowId).map((r) => [r.rowId!, rowName(r)] as const)]), [d.rows, rows]);
  // seeds of the rows as edited (a seed moved next to other rows is no longer one), for the headings and the chips
  const seeds = useMemo(() => seedIndexes(seedFactsOf(rows)), [rows]);

  useEffect(() => {
    if (!dirty) setRows(d.rows.map(toDraft));
  }, [d]);

  const edit = (next: DraftRow[]) => {
    setRows(next);
    setDirty(true);
  };
  const patch = (i: number, p: Partial<DraftRow>) => edit(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + by, 0, r);
    edit(next);
  };
  const save = async () => {
    await api.savePlanRows(
      planId,
      rows.map((r) => ({
        rowId: r.rowId,
        roi: r.roi,
        tlf: r.tlf,
        rationale: r.rationale,
        wave: r.wave,
        ...(typeof r.priority === "number" ? { priority: r.priority } : {}),
        // unticking a saved 「作り直す」 sends false; rows never ticked send nothing (the stored value is kept)
        ...(r.rebuild ? { rebuild: true } : r.view?.rebuild ? { rebuild: false } : {}),
      })),
    );
    setDirty(false);
  };
  saveRef.current = dirty ? { save, rows } : null;
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    fn()
      .then(onSaved)
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const importFile = (file: File) =>
    run(async () => {
      if (dirty) await save();
      const r = await api.importPlanRows(planId, await file.text());
      onRejected(r.rejected);
      setDirty(false);
    });
  const autoOrder = () =>
    run(async () => {
      if (dirty) await save();
      await api.orderPlan(planId);
      setDirty(false);
    });

  return (
    <section className="mb-5" data-testid="plan-editor">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{t("plan.rows", { n: rows.length })}</h2>
        {dirty && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{t("plan.unsaved")}</span>}
      </div>
      {d.plan.ordering === "auto" && !dirty && <p className="mb-2 text-xs text-slate-500">{t("plan.orderingAuto")}</p>}
      {rows.length > 0 && (
        <div className="mb-1 hidden gap-2 px-2 text-xs text-slate-500 sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem]" aria-hidden>
          <span>{t("plan.waveLabel")}</span>
          <span>{t("plan.roi")}</span>
          <span>{t("plan.tlf")}</span>
          <span>{t("plan.rationale")}</span>
        </div>
      )}
      {/* one flat list with a heading item at each change of wave, so a row keeps its inputs (and focus) when its wave changes */}
      <ul className="grid gap-2">
        {waveRuns(rows).flatMap((runOf) => [
          <li key={`wave-${runOf.items[0].row.key}`} className="pt-1">
            <WaveHeading wave={runOf.wave} seed={runOf.items.some((x) => seeds.has(x.index))} className="" />
          </li>,
          ...runOf.items.map(({ row: r, index: i }) => (
            <li key={r.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem]">
              <span className="text-xs text-slate-500 sm:hidden">{t("plan.waveLabel")}</span>
              <input type="number" min={1} max={PLAN_LIMITS.maxWave} value={r.wave} onChange={(e) => patch(i, { wave: Math.max(1, Math.min(PLAN_LIMITS.maxWave, Number(e.target.value) || 1)) })} className={`${inputCls} w-20 sm:w-full`} aria-label={t("plan.waveLabel")} />
              <span className="text-xs text-slate-500 sm:hidden">{t("plan.roi")}</span>
              <input value={r.roi} onChange={(e) => patch(i, { roi: e.target.value })} placeholder={t("plan.roi")} aria-label={t("plan.roi")} className={inputCls} maxLength={PLAN_LIMITS.maxRoi} />
              <span className="text-xs text-slate-500 sm:hidden">{t("plan.tlf")}</span>
              <input value={r.tlf} onChange={(e) => patch(i, { tlf: e.target.value })} placeholder={t("plan.tlf")} aria-label={t("plan.tlf")} className={inputCls} maxLength={PLAN_LIMITS.maxTlf} />
              <span className="text-xs text-slate-500 sm:hidden">{t("plan.rationale")}</span>
              <input value={r.rationale} onChange={(e) => patch(i, { rationale: e.target.value })} placeholder={t("plan.rationale")} aria-label={t("plan.rationale")} className={inputCls} maxLength={PLAN_LIMITS.maxRationale} />
              <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn} aria-label={t("plan.moveUp")} title={t("plan.moveUp")}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={iconBtn} aria-label={t("plan.moveDown")} title={t("plan.moveDown")}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => edit(rows.filter((_, j) => j !== i))} className={iconBtn} aria-label={t("plan.removeRow")} title={t("plan.removeRow")}>
                  <Trash2 size={14} />
                </button>
              </div>
              {r.view && (
                <div className="col-span-2 min-w-0 empty:hidden sm:col-span-5">
                  <RowFacts row={{ ...r.view, seed: seeds.has(i) }} names={names} rebuild={{ checked: !!r.rebuild, onChange: (v) => patch(i, { rebuild: v }) }} />
                </div>
              )}
            </li>
          )),
        ])}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={rows.length >= PLAN_LIMITS.maxRows} onClick={() => edit([...rows, { key: `new${++draftSeq}`, roi: "", tlf: "", rationale: "", wave: rows.at(-1)?.wave ?? 1 }])} className={secondaryBtn}>
          <Plus size={14} aria-hidden /> {t("plan.addRow")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importFile(f);
          }}
        />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={secondaryBtn}>
          <FileUp size={14} aria-hidden /> {t("plan.importCsv")}
        </button>
        <button type="button" disabled={!rows.length} onClick={() => edit(splitIntoWaves(rows, d.limits.effective))} className={secondaryBtn}>
          <ListChecks size={14} aria-hidden /> {t("plan.splitWaves", { n: d.limits.effective })}
        </button>
        <span className="flex items-center gap-1">
          <button type="button" disabled={busy || !rows.length} onClick={autoOrder} className={secondaryBtn}>
            <Wand2 size={14} aria-hidden /> {t("plan.autoOrder")}
          </button>
          <HelpTip text={t("plan.autoOrderHelp", { seeds: MAX_SEED_ROWS, k: OVERLAP_LIMIT })} />
        </span>
        <button type="button" disabled={busy || !dirty} onClick={() => run(save)} className={primaryBtn}>
          <Save size={14} aria-hidden /> {t("plan.saveRows")}
        </button>
      </div>
    </section>
  );
}

const PROPOSAL_STATUS_COLOR: Record<PlanProposalRecord["status"], string> = {
  open: "bg-violet-50 text-violet-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-slate-100 text-slate-700",
  stale: "bg-amber-100 text-amber-800",
};

/** What a proposal changes: the new row, the row to leave out, or the new policy. */
function ProposalBody({ p, rows, names, compact }: { p: PlanProposalRecord; rows: PlanRowView[]; names: ReadonlyMap<string, string>; compact?: boolean }) {
  if (p.kind === "add" && p.row)
    return (
      <div className="min-w-0">
        <div className="break-words text-sm">
          <span className="font-medium">{p.row.tlf || "—"}</span>
          <span className="text-slate-500"> · {p.row.roi || "—"}</span>
        </div>
        {!compact && p.row.rationale && <div className="break-words text-xs text-slate-600">{p.row.rationale}</div>}
        {!compact && <RowFacts row={{ anchors: p.row.anchors, dependsOn: p.row.dependsOn }} names={names} />}
      </div>
    );
  if (p.kind === "remove") {
    const r = rows.find((x) => x.rowId === p.rowId);
    return (
      <div className="min-w-0 break-words text-sm">
        {r ? (
          <>
            <span className="font-medium">{r.tlf || "—"}</span>
            <span className="text-slate-500"> · {r.roi || "—"}</span>
          </>
        ) : (
          <span className="font-mono text-xs">{p.rowId}</span>
        )}
      </div>
    );
  }
  if (p.kind === "policy") return <div className={`min-w-0 whitespace-pre-line break-words rounded bg-slate-100 p-2 text-sm text-slate-700 ${compact ? "line-clamp-2" : ""}`}>{p.policy ?? ""}</div>;
  return null;
}

/** Open proposals of the re-plan jobs (running / paused plans), and the state of the latest re-plan job. */
function Proposals({ d, busy, decide }: { d: PlanDetailResponse; busy: boolean; decide: (p: PlanProposalRecord, action: "accept" | "reject") => void }) {
  const t = useT();
  const names = useMemo(() => new Map(d.rows.map((r) => [r.rowId, rowName(r)])), [d.rows]);
  const open = (d.proposals ?? []).filter((p) => p.status === "open");
  const replan = d.plan.replan;
  const line = replan ? (
    <p className="break-words text-xs text-slate-500" data-testid="plan-replan">
      {t("plan.replanLine", { wave: replan.wave ?? "—", state: t(`plan.job.${replan.status}` as MessageKey) })}
      {replan.status === "failed" && jobError(replan, t) ? ` (${jobError(replan, t)})` : ""}
    </p>
  ) : null;
  if (!open.length) return line ? <div className="mb-5">{line}</div> : null;
  return (
    <section className="mb-5 rounded-xl border border-violet-200 bg-white p-4" data-testid="plan-proposals">
      <h2 className="mb-1 flex items-center gap-1 text-sm font-semibold">
        {t("plan.proposals", { n: open.length })} <HelpTip text={t("plan.proposalsHelp")} />
      </h2>
      {line && <div className="mb-2">{line}</div>}
      <ul className="grid gap-2">
        {open.map((p) => (
          <li key={p.proposalId} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-start" data-testid="plan-proposal">
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${PROPOSAL_STATUS_COLOR.open}`}>{t(`plan.proposal.${p.kind}` as MessageKey)}</span>
                {typeof p.wave === "number" && <span className="text-slate-500">{t("plan.proposal.afterWave", { wave: p.wave })}</span>}
              </div>
              <ProposalBody p={p} rows={d.rows} names={names} />
              {p.reason && <div className="break-words text-xs text-slate-600">{t("plan.proposal.reason", { reason: p.reason })}</div>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={busy} onClick={() => decide(p, "accept")} className={primaryBtn}>
                <Check size={14} aria-hidden /> {t("plan.accept")}
              </button>
              <button type="button" disabled={busy} onClick={() => decide(p, "reject")} className={secondaryBtn}>
                <X size={14} aria-hidden /> {t("plan.rejectProposal")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DecidedProposals({ d }: { d: PlanDetailResponse }) {
  const t = useT();
  const { locale } = useI18n();
  const names = useMemo(() => new Map(d.rows.map((r) => [r.rowId, rowName(r)])), [d.rows]);
  const decided = (d.proposals ?? []).filter((p) => p.status !== "open");
  if (!decided.length) return null;
  return (
    <details className="mb-5 rounded-xl border border-slate-200 bg-white p-3" data-testid="plan-decided">
      <summary className="cursor-pointer text-sm font-semibold coarse:py-2">{t("plan.decidedProposals", { n: decided.length })}</summary>
      <ul className="mt-2 grid gap-2">
        {decided.map((p) => (
          <li key={p.proposalId} className="grid gap-1 border-t border-slate-200 pt-2 text-xs first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t(`plan.proposal.${p.kind}` as MessageKey)}</span>
              <span className={`rounded-full px-1.5 py-0.5 ${PROPOSAL_STATUS_COLOR[p.status]}`}>{t(`plan.proposal.${p.status}` as MessageKey)}</span>
              {p.decidedAt && <span className="text-slate-500">{fmtDate(p.decidedAt, locale)}</span>}
            </div>
            <ProposalBody p={p} rows={d.rows} names={names} compact />
          </li>
        ))}
      </ul>
    </details>
  );
}

function History({ events, rows, t }: { events: PlanEventRecord[]; rows: PlanRowView[]; t: TFn }) {
  const { locale } = useI18n();
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);
  if (!events.length) return null;
  return (
    <details className="mb-5 rounded-xl border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold coarse:py-2">{t("plan.history")}</summary>
      <ul className="mt-2 grid gap-1 text-xs">
        {events.map((e) => {
          const row = e.rowId ? byId.get(e.rowId) : undefined;
          return (
            <li key={e.sk} className="flex flex-wrap gap-x-2">
              <span className="text-slate-500">{fmtDate(e.at, locale)}</span>
              <span>{t(`plan.evt.${e.type}` as MessageKey, { wave: e.detail?.wave ?? "" })}</span>
              {row && <span className="text-slate-600">{rowLabel(row)}</span>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function PlanDetailPage() {
  const t = useT();
  const { locale } = useI18n();
  const { planId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [d, setD] = useState<PlanDetailResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<PlanRowRejected[]>(() => ((location.state as { rejected?: PlanRowRejected[] } | null)?.rejected ?? []));
  const [renaming, setRenaming] = useState<string | null>(null);
  const saveRef = useRef<{ save: () => Promise<void>; rows: DraftRow[] } | null>(null);

  const onError = useCallback((e: unknown) => setErr(e instanceof Error ? e.message : String(e)), []);
  const load = useCallback(
    () =>
      api
        .getPlan(planId)
        .then((r) => {
          setD(r);
          setErr(null);
        })
        .catch(onError),
    [planId, onError],
  );

  useEffect(() => {
    void load();
  }, [load]);
  // a draft being written is checked often (it takes minutes), a running plan every 15 s
  const status = d?.plan.status;
  const pollMs = status === "DRAFTING" ? 5_000 : status === "RUNNING" || status === "PAUSED" ? 15_000 : 0;
  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [pollMs, load]);

  if (!d) {
    return <div className="p-6 text-sm text-slate-500">{err ? <span className="text-rose-700">{err}</span> : t("loading")}</div>;
  }
  const { plan, rows } = d;
  const act = (fn: () => Promise<unknown>, after: () => void = () => void load()) => {
    setBusy(true);
    setErr(null);
    fn()
      .then(after)
      .catch((e) => {
        onError(e);
        // a proposal or a draft may have changed meanwhile (409): show the plan as it is now
        void load().then(() => onError(e));
      })
      .finally(() => setBusy(false));
  };
  const rowAct = (rowId: string, action: "retry" | "skip") => act(() => api.planRowAction(planId, rowId, action));
  const confirm = () => {
    const unsaved = saveRef.current;
    // unsaved rows: a seed counts only while it is the only built row of its wave (as the 「種」 headings)
    const facts = unsaved ? seedFactsOf(unsaved.rows) : [];
    const seeds = seedIndexes(facts);
    const e = unsaved ? planEstimate(facts.map((f, i) => ({ ...f, seed: seeds.has(i) })), d.limits.effective) : d.estimate;
    const existing = unsaved ? unsaved.rows.filter((r) => r.view?.existing && !r.rebuild).length : rows.filter((r) => r.existing).length;
    const text = [
      t("plan.confirmQ", { n: e.rows, waves: e.waves, c: e.concurrency, time: fmtDuration(e.minutes, t), cost: `${formatUsd(e.costUsd.min)}–${formatUsd(e.costUsd.max)}` }),
      ...(existing ? [t("plan.confirmExisting", { n: existing })] : []),
    ].join("\n\n");
    if (!window.confirm(text)) return;
    act(async () => {
      if (unsaved) await unsaved.save();
      await api.confirmPlan(planId, locale);
    });
  };
  const canDraft = !!plan.goal.trim() || !!plan.attachments?.length || rows.length > 0;
  const redraft = () => {
    if (!window.confirm(t("plan.redraftQ"))) return;
    const unsaved = saveRef.current;
    act(async () => {
      if (unsaved) await unsaved.save();
      await api.requestDraft(planId, locale);
    });
  };
  const cancelDraft = () => window.confirm(t("plan.cancelDraftQ")) && act(() => api.cancelDraft(planId));
  // busy until the plan is read again, so a decided proposal cannot be decided twice
  const decide = (p: PlanProposalRecord, action: "accept" | "reject") =>
    act(
      async () => {
        await api.proposalAction(planId, p.proposalId, action);
        await load();
      },
      () => {},
    );
  const banner =
    plan.status === "DRAFT"
      ? { cls: "bg-blue-50 text-blue-700", text: t("plan.draftNote") }
      : plan.status === "PAUSED"
        ? { cls: "bg-amber-50 text-amber-800", text: t(`plan.paused.${plan.pausedReason ?? "user"}` as MessageKey) }
        : plan.status === "CANCELLED"
          ? { cls: "bg-slate-100 text-slate-700", text: t("plan.cancelledNote") }
          : plan.status === "COMPLETED"
            ? { cls: "bg-emerald-100 text-emerald-700", text: t("plan.completedNote") }
            : null;

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="max-w-5xl">
        <Link to="/plans" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 coarse:min-h-11">
          <ArrowLeft size={12} /> {t("plan.title")}
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {renaming === null ? (
            <h1 className="flex min-w-0 items-center gap-2 break-words text-xl font-semibold">
              {plan.name}
              <button type="button" onClick={() => setRenaming(plan.name)} className={iconBtn} aria-label={t("plan.rename")} title={t("plan.rename")}>
                <Pencil size={14} />
              </button>
            </h1>
          ) : (
            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api.updatePlan(planId, { name: renaming }), () => {
                  setRenaming(null);
                  void load();
                });
              }}
            >
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} className={inputCls} maxLength={200} aria-label={t("plan.name")} autoFocus />
              <button type="submit" disabled={busy || !renaming.trim()} className={iconBtn} aria-label={t("save")}>
                <Check size={16} />
              </button>
              <button type="button" onClick={() => setRenaming(null)} className={iconBtn} aria-label={t("close")}>
                <X size={16} />
              </button>
            </form>
          )}
          <PlanStatusBadge status={plan.status} />
          <span className="font-mono text-[11px] text-slate-500" title={t("plan.planId")}>
            {plan.planId}
          </span>
          <HelpLink section="planner" />
        </div>
        {plan.goal && <p className="mb-3 whitespace-pre-line break-words text-sm text-slate-600">{plan.goal}</p>}
        {!!plan.attachments?.length && <p className="mb-3 break-words text-xs text-slate-500">{t("plan.attachments", { names: plan.attachments.map((a) => a.name).join(t("plan.sep")) })}</p>}
        {plan.status === "DRAFTING" && <DraftJobBanner plan={plan} rows={rows.length} busy={busy} onCancel={cancelDraft} />}
        {banner && <div className={`mb-3 rounded-md px-3 py-2 text-sm ${banner.cls}`}>{banner.text}</div>}
        {err && <div className="mb-3 break-words rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        {plan.status === "DRAFT" && <DraftOutcome plan={plan} />}
        <Rejected items={rejected} onClose={() => setRejected([])} />

        <div className="mb-4 flex flex-wrap gap-2" data-testid="plan-actions">
          {plan.status === "DRAFT" && (
            <button type="button" disabled={busy || !rows.length} onClick={confirm} className={primaryBtn}>
              <Play size={14} aria-hidden /> {t("plan.confirm")}
            </button>
          )}
          {plan.status === "DRAFT" && (
            <button type="button" disabled={busy || !canDraft} onClick={redraft} className={secondaryBtn}>
              <Sparkles size={14} aria-hidden /> {t("plan.createDraft")}
            </button>
          )}
          {plan.status === "RUNNING" && (
            <button type="button" disabled={busy} onClick={() => act(() => api.planAction(planId, "pause"))} className={secondaryBtn}>
              <Pause size={14} aria-hidden /> {t("plan.pause")}
            </button>
          )}
          {(plan.status === "PAUSED" || plan.status === "CANCELLED") && (
            <button type="button" disabled={busy} onClick={() => act(() => api.planAction(planId, "resume"))} className={primaryBtn}>
              <Play size={14} aria-hidden /> {t("plan.resume")}
            </button>
          )}
          {(plan.status === "RUNNING" || plan.status === "PAUSED") && (
            <button type="button" disabled={busy} onClick={() => window.confirm(t("plan.cancelQ")) && act(() => api.planAction(planId, "cancel"))} className={dangerBtn}>
              <Square size={14} aria-hidden /> {t("plan.cancel")}
            </button>
          )}
          {(plan.status === "DRAFT" || plan.status === "COMPLETED" || plan.status === "CANCELLED") && (
            <button type="button" disabled={busy} onClick={() => window.confirm(t("plan.deleteQ")) && act(() => api.deletePlan(planId), () => navigate("/plans"))} className={dangerBtn}>
              <Trash2 size={14} aria-hidden /> {t("plan.delete")}
            </button>
          )}
        </div>

        <Summary d={d} />
        <Inbox rows={rows.filter((r) => r.state === "question")} onDone={() => void load()} onError={onError} />
        <Attention rows={rows.filter((r) => r.state === "attention")} act={rowAct} />
        {(plan.status === "RUNNING" || plan.status === "PAUSED") && <Proposals d={d} busy={busy} decide={decide} />}
        <Settings d={d} onChanged={() => void load()} onError={onError} />
        <Policy plan={plan} onSaved={load} onError={onError} />
        {plan.status === "DRAFT" ? <DraftEditor d={d} onSaved={() => void load()} onError={onError} onRejected={setRejected} saveRef={saveRef} /> : <RowsByWave d={d} act={rowAct} />}
        <History events={d.events} rows={rows} t={t} />
        <DecidedProposals d={d} />
      </div>
    </div>
  );
}
