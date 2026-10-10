import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardPaste, CircleDollarSign, Clock, FileText, FileUp, GitPullRequest, ListChecks, Loader2, MessageCircleQuestion, PauseCircle, Plus, Scale, Sparkles, Wand2, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PlanPulseRow, PlanRowState, PlanSummary } from "@cobrac/shared";
import { ATTACHMENT_LIMITS, AUTONOMOUS_DEFAULT_MAX_COST_USD, AUTONOMOUS_MAX_COST_RANGE, MAX_CONFORM_FOLLOWUPS, PLAN_JOB_SHORT_ROWS, formatUsd, isAutonomous } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { LiveDot, PlanBar } from "../components/PlanBar";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtBytes, fmtDate } from "../lib/format";
import { PLAN_FILE_ACCEPT, PLAN_STATUS_COLOR, ROW_STATE_COLOR, ROW_STATE_ORDER, activeStageName, fmtAgo, fmtDuration, fmtElapsed, planEventText, planPath, useNow, wavesText } from "../lib/plan";
import { checkPlanFiles, uploadPlanFiles } from "../lib/planFiles";
import { inputCls, primaryBtn } from "./CanonsPage";

const MB = 1024 * 1024;

export function PlanStatusBadge({ status }: { status: PlanSummary["status"] }) {
  const t = useT();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_COLOR[status]}`}>{t(`plan.status.${status}` as MessageKey)}</span>;
}

/** 自律実行: the plan runs to the end without waiting for its owner. */
export function AutonomousBadge({ plan }: { plan: Pick<PlanSummary, "settings"> }) {
  const t = useT();
  if (!isAutonomous(plan)) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700" data-testid="plan-autonomous-badge">
      <Wand2 size={12} aria-hidden /> {t("auto.label")}
    </span>
  );
}

function CreatePlanForm({ bare = false, autoFocus = false }: { bare?: boolean; autoFocus?: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  // rows can be pasted instead of a file: the box opens on demand, so the section reads as one place for the source list
  const [pasteOpen, setPasteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{ i: number; n: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 自律実行 is the default: the plan runs from its draft to the end on its own, within a cost limit. The owner opts in
  // to handling the pull requests, conflicts and questions themselves (manual).
  const [manual, setManual] = useState(false);
  const autonomous = !manual;
  const [maxCost, setMaxCost] = useState(String(AUTONOMOUS_DEFAULT_MAX_COST_USD));
  const fileRef = useRef<HTMLInputElement>(null);
  const needId = useId();

  /** Capability lists of the accepted types, within the attachment limits; the others are named in a message. */
  const addFiles = (list: FileList) => {
    const { files: picked, problems } = checkPlanFiles(files, Array.from(list), t);
    setFiles([...files, ...picked]);
    setFileMsg(problems.length ? problems.join("\n") : null);
  };

  // the files go to S3 only now (straight from the browser), so nothing is uploaded for a form that is never sent
  const submit = async (draft: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const attachments = await uploadPlanFiles(files, setUploading);
      setUploading(null);
      const auto = draft && autonomous ? { autonomous: { maxCostUsd: Number(maxCost) } } : {};
      const r = await api.createPlan({ name, goal, ...(pasted.trim() ? { csv: pasted } : {}), ...(attachments.length ? { attachments } : {}), ...(draft ? { draft: true, locale } : {}), ...auto });
      navigate(planPath(r.plan.planId), { state: { rejected: r.rejected } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
      setBusy(false);
    }
  };
  // a plan needs something to plan from: a goal, a capability list or rows (the API answers 400 otherwise)
  const hasInput = !!goal.trim() || files.length > 0 || !!pasted.trim();
  const canDraft = !!name.trim() && hasInput;
  const costOk = Number(maxCost) >= AUTONOMOUS_MAX_COST_RANGE.min && Number(maxCost) <= AUTONOMOUS_MAX_COST_RANGE.max;

  return (
    <form
      className={`grid min-w-0 content-start gap-3 ${bare ? "" : "rounded-xl border border-slate-200 bg-white p-4 sm:p-5"}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canDraft && !busy && (!autonomous || costOk)) void submit(autonomous);
      }}
    >
      {!bare && <h2 className="text-sm font-semibold">{t("plan.new")}</h2>}
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("plan.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={200} required autoFocus={autoFocus} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("plan.goal")}</span>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={t("plan.goalHint")} className={inputCls} maxLength={4000} />
      </label>
      <div className="min-w-0">
        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          {t("plan.files")} <HelpTip text={`${t("plan.filesHelp", { n: ATTACHMENT_LIMITS.maxFiles, size: ATTACHMENT_LIMITS.maxFileBytes / MB })} ${t("plan.csvHelp")}`} />
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={PLAN_FILE_ACCEPT}
          className="hidden"
          data-testid="plan-files"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || files.length >= ATTACHMENT_LIMITS.maxFiles} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11">
            <FileUp size={14} aria-hidden /> {t("plan.addFiles")}
          </button>
          {!pasteOpen && (
            <button type="button" disabled={busy} onClick={() => setPasteOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11" data-testid="plan-paste-open">
              <ClipboardPaste size={14} aria-hidden /> {t("plan.csv")}
            </button>
          )}
        </div>
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="plan-file-list" aria-label={t("plan.files")}>
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 py-0.5 pl-2 pr-0.5 text-xs text-slate-700" title={`${f.name} · ${fmtBytes(f.size)}`}>
                <FileText size={13} className="shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0 truncate">{f.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`${t("attach.remove")}: ${f.name}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700 coarse:min-h-11 coarse:min-w-11"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* file names are often one long token: break them anywhere rather than scroll sideways at 390 px */}
        {fileMsg && <div className="mt-2 whitespace-pre-line rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 [overflow-wrap:anywhere]">{fileMsg}</div>}
        {pasteOpen && (
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} placeholder={t("plan.pasteHint")} aria-label={t("plan.csv")} className={`${inputCls} mt-2 font-mono text-xs`} autoFocus />
        )}
      </div>
      <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" data-testid="plan-autonomous">
        <label className="flex items-center gap-2 text-sm coarse:min-h-11">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} data-testid="plan-manual" />
          <span className="font-medium">{t("auto.manual.label")}</span>
          <HelpTip text={t("auto.manual.help")} />
        </label>
        {autonomous && (
          <>
            <p className="flex items-center gap-1 text-xs text-slate-600">
              {t("auto.default")} <HelpTip text={t("auto.help")} />
            </p>
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {t("auto.cost")}
              <input
                type="number"
                min={AUTONOMOUS_MAX_COST_RANGE.min}
                max={AUTONOMOUS_MAX_COST_RANGE.max}
                step="1"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                className={`${inputCls} w-28`}
                aria-invalid={!costOk}
              />
            </label>
            <p className="text-xs text-slate-500">{t("auto.note")}</p>
          </>
        )}
      </div>
      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 [overflow-wrap:anywhere]">{err}</div>}
      {!autonomous && <p className="text-xs text-slate-500">{t("plan.draftNote")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {autonomous ? (
          <button type="button" disabled={busy || !canDraft || !costOk} onClick={() => void submit(true)} className={primaryBtn} aria-describedby={hasInput ? undefined : needId}>
            <Sparkles size={14} aria-hidden /> {t("auto.start")}
          </button>
        ) : (
          <>
            <button type="submit" disabled={busy || !canDraft} className={primaryBtn} aria-describedby={hasInput ? undefined : needId}>
              <Plus size={14} /> {t("plan.create")}
            </button>
            <button type="button" disabled={busy || !canDraft} onClick={() => void submit(true)} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11" aria-describedby={hasInput ? undefined : needId}>
              <Sparkles size={14} aria-hidden /> {t("plan.createDraft")}
            </button>
          </>
        )}
        {uploading && (
          <span className="text-xs text-slate-500" role="status">
            {t("plan.uploading", uploading)}
          </span>
        )}
      </div>
      {!hasInput && (
        <p id={needId} className="text-xs font-medium text-amber-800" data-testid="plan-need-input">
          {t("pd.create.needInput")}
        </p>
      )}
      <p className="text-xs text-slate-500">{t("plan.createDraftNote", { n: PLAN_JOB_SHORT_ROWS })}</p>
    </form>
  );
}


// --- the live view of the plans ----------------------------------------------------------------------------------------

const LIVE: ReadonlySet<PlanSummary["status"]> = new Set(["RUNNING", "PAUSED", "DRAFTING"]);
const rowText = (r: { roi: string; tlf: string }) => [r.tlf.trim(), r.roi.trim()].filter(Boolean).join(" · ") || "—";

type TurnKind = "attention" | "decision" | "question" | "review" | "paused" | "proposals" | "draftFailed" | "draftReady";
interface TurnItem {
  key: string;
  kind: TurnKind;
  plan: PlanSummary;
  row?: PlanPulseRow;
  n?: number;
}
const TURN_ORDER: TurnKind[] = ["attention", "decision", "question", "review", "paused", "proposals", "draftFailed", "draftReady"];
const TURN: Record<TurnKind, { icon: ReactNode; tone: string }> = {
  attention: { icon: <AlertTriangle size={15} aria-hidden />, tone: "bg-rose-50 text-rose-700" },
  decision: { icon: <Scale size={15} aria-hidden />, tone: "bg-amber-100 text-amber-800" },
  question: { icon: <MessageCircleQuestion size={15} aria-hidden />, tone: "bg-amber-100 text-amber-800" },
  review: { icon: <GitPullRequest size={15} aria-hidden />, tone: "bg-violet-50 text-violet-700" },
  paused: { icon: <PauseCircle size={15} aria-hidden />, tone: "bg-amber-100 text-amber-800" },
  proposals: { icon: <Wand2 size={15} aria-hidden />, tone: "bg-violet-50 text-violet-700" },
  draftFailed: { icon: <XCircle size={15} aria-hidden />, tone: "bg-rose-50 text-rose-700" },
  draftReady: { icon: <Sparkles size={15} aria-hidden />, tone: "bg-blue-50 text-blue-700" },
};
const TURN_SHOWN = 8;

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
  }
  return out.sort((a, b) => TURN_ORDER.indexOf(a.kind) - TURN_ORDER.indexOf(b.kind));
}

function YourTurn({ items, anyLive }: { items: TurnItem[]; anyLive: boolean }) {
  const t = useT();
  const [all, setAll] = useState(false);
  if (!items.length)
    return anyLive ? (
      <p className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 motion-safe:animate-fade-in" data-testid="plan-turn-none">
        <CheckCircle2 size={15} aria-hidden /> {t("plan.turn.none")}
      </p>
    ) : null;
  const shown = all ? items : items.slice(0, TURN_SHOWN);
  return (
    <section className="mb-6" data-testid="plan-turn" aria-labelledby="plan-turn-h">
      <h2 id="plan-turn-h" className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-70 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        {t("plan.turn.title")}
        <span key={items.length} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 motion-safe:animate-count-in">
          {items.length}
        </span>
        <HelpTip text={t("plan.turn.help")} />
      </h2>
      <ul className="grid gap-1.5">
        {shown.map((it) => (
          <li key={it.key} className="motion-safe:animate-step-in">
            <Link to={planPath(it.plan.planId)} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-blue-300 hover:bg-blue-50/30 coarse:py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TURN[it.kind].tone}`}>{TURN[it.kind].icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{t(`plan.turn.${it.kind}` as MessageKey, { n: it.n ?? 0 })}</span>
                  {it.row && <span className="min-w-0 break-words text-sm text-slate-700">{rowText(it.row)}</span>}
                  {it.row?.prNo ? <span className="font-mono text-xs text-slate-500">#{it.row.prNo}</span> : null}
                </span>
                {it.kind === "question" && it.row?.project?.pendingQuestion && <span className="block line-clamp-1 break-words text-xs text-slate-600">{it.row.project.pendingQuestion}</span>}
                {it.kind === "decision" && it.row?.decisionReason && <span className="block line-clamp-1 text-xs text-slate-600">{t(`plan.decision.${it.row.decisionReason}` as MessageKey, { n: MAX_CONFORM_FOLLOWUPS })}</span>}
                {it.kind === "paused" && it.plan.pausedReason && <span className="block line-clamp-2 text-xs text-slate-600">{t(`plan.paused.${it.plan.pausedReason}` as MessageKey)}</span>}
                {it.kind === "draftReady" && it.plan.autonomousError && <span className="block line-clamp-2 break-words text-xs text-rose-700">{t("auto.confirmError", { error: it.plan.autonomousError })}</span>}
                <span className="block truncate text-[11px] text-slate-500">{it.plan.name}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {items.length > TURN_SHOWN && !all && (
        <button type="button" onClick={() => setAll(true)} className="mt-1.5 text-xs text-blue-700 hover:underline coarse:min-h-11">
          {t("plan.turn.more", { n: items.length - TURN_SHOWN })}
        </button>
      )}
    </section>
  );
}

const EVENT_DOT: Partial<Record<string, string>> = {
  row_done: "bg-emerald-500",
  completed: "bg-emerald-500",
  row_started: "bg-blue-500",
  wave_started: "bg-blue-500",
  row_resumed: "bg-blue-500",
  resumed: "bg-blue-500",
  row_question: "bg-amber-400",
  row_decision: "bg-amber-600",
  paused: "bg-amber-400",
  row_attention: "bg-rose-500",
  row_retry: "bg-rose-400",
  replan_failed: "bg-rose-500",
  row_pushed: "bg-violet-400",
  row_conform: "bg-violet-400",
  row_ai_review: "bg-violet-400",
  row_auto_answered: "bg-violet-400",
  row_ai_resolved: "bg-violet-400",
  replanned: "bg-indigo-400",
  proposals_received: "bg-indigo-400",
};
const LANE_ROWS = 3;

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-slate-400">{icon}</span>
      {children}
    </span>
  );
}

/** The counts of a plan's rows by state; a count that changes drops in. */
function StateCounts({ counts }: { counts: PlanSummary["rowCounts"] }) {
  const t = useT();
  const n = (s: PlanRowState) => (s === "running" ? (counts.running ?? 0) + (counts.starting ?? 0) : (counts[s] ?? 0));
  return (
    <div className="flex flex-wrap gap-1">
      {ROW_STATE_ORDER.filter((s) => n(s) > 0).map((s) => (
        <span key={s} className={`rounded-full px-1.5 py-0.5 text-[11px] ${ROW_STATE_COLOR[s]}`}>
          {t(`plan.row.${s}` as MessageKey)}{" "}
          <span key={n(s)} className="inline-block tabular-nums motion-safe:animate-count-in">
            {n(s)}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A running, paused or drafting plan: what it is doing now, how far it got, what happened last. */
function PlanLane({ p, now }: { p: PlanSummary; now: number }) {
  const t = useT();
  const pulse = p.pulse;
  const running = p.status === "RUNNING" || p.status === "DRAFTING";
  const waves = pulse?.waves ?? [{ wave: p.activeWave ?? 1, counts: p.rowCounts }];
  return (
    <li className="motion-safe:animate-step-in" data-testid="plan-lane" data-status={p.status}>
      <Link
        to={planPath(p.planId)}
        className={`block rounded-2xl border bg-white p-4 transition-colors hover:border-blue-300 ${running ? "border-blue-200" : "border-amber-200"}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LiveDot tone={running ? "running" : "waiting"} />
          <span className="min-w-0 break-words text-base font-semibold text-slate-900">{p.name}</span>
          <span className="font-mono text-[11px] text-slate-500">{p.planId}</span>
          <span className="ml-auto">
            <PlanStatusBadge status={p.status} />
            <AutonomousBadge plan={p} />
          </span>
        </div>

        {p.status === "DRAFTING" ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Sparkles size={15} aria-hidden className="plan-beat" />
              {t("plan.drafting", { state: t(`plan.job.${p.draft?.status ?? "waiting"}` as MessageKey), time: fmtElapsed(p.draft?.requestedAt, now, t) })}
            </div>
            <div className="plan-sweep mt-2 h-1.5 rounded-full bg-blue-100" aria-hidden />
            {p.goal && <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{p.goal}</p>}
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
              <Meta icon={<ListChecks size={13} />}>{wavesText(waves.map((w) => w.wave), p.activeWave, t)}</Meta>
              <Meta icon={<Clock size={13} />}>
                {t("plan.lane.elapsed", { t: fmtElapsed(p.confirmedAt, now, t) })}
                {pulse && <span className="text-slate-400"> / {t("plan.lane.eta", { t: fmtDuration(pulse.estimate.minutes, t) })}</span>}
              </Meta>
              {pulse && (
                <Meta icon={<CircleDollarSign size={13} />}>
                  {formatUsd(pulse.actual.costUsd)}
                  <span className="text-slate-400">
                    {" "}
                    / {formatUsd(pulse.estimate.costUsd.min)}–{formatUsd(pulse.estimate.costUsd.max)}
                  </span>
                </Meta>
              )}
            </div>
            <PlanBar waves={waves} activeWave={p.activeWave} live={p.status === "RUNNING"} className="mt-3" />
            <div className="mt-2">
              <StateCounts counts={p.rowCounts} />
            </div>
            {p.status === "PAUSED" && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{t(`plan.paused.${p.pausedReason ?? "user"}` as MessageKey)}</p>}
            {pulse && (
              <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("plan.lane.now")}</h3>
                  {pulse.running.length === 0 ? (
                    <p className="text-xs text-slate-500">{t("plan.lane.idle")}</p>
                  ) : (
                    <ul className="grid gap-1" data-testid="plan-lane-running">
                      {pulse.running.slice(0, LANE_ROWS).map((r) => {
                        const stage = activeStageName(r.project, t);
                        return (
                          <li key={r.rowId} className="flex min-w-0 items-center gap-2 text-xs motion-safe:animate-step-in">
                            <Loader2 size={13} className="shrink-0 text-blue-500 motion-safe:animate-spin" aria-hidden />
                            <span className="min-w-0 truncate">
                              <span className="font-medium text-slate-800">{r.tlf || "—"}</span>
                              <span className="text-slate-500"> · {r.roi || "—"}</span>
                            </span>
                            {stage && (
                              <span key={stage} className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 motion-safe:animate-count-in" data-testid="plan-lane-stage">
                                {stage}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 tabular-nums text-slate-400">{fmtElapsed(r.startedAt, now, t)}</span>
                          </li>
                        );
                      })}
                      {pulse.running.length > LANE_ROWS && <li className="text-[11px] text-slate-500">{t("plan.lane.more", { n: pulse.running.length - LANE_ROWS })}</li>}
                    </ul>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("plan.lane.recent")}</h3>
                  <ul className="grid gap-1" data-testid="plan-lane-events">
                    {pulse.events.map((e) => (
                      <li key={e.sk} className="flex min-w-0 items-center gap-2 text-xs motion-safe:animate-step-in">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_DOT[e.type] ?? "bg-slate-300"}`} aria-hidden />
                        <span className="shrink-0 text-slate-700">{planEventText(e, t)}</span>
                        {e.row && <span className="min-w-0 truncate text-slate-500">{rowText(e.row)}</span>}
                        <span className="ml-auto shrink-0 whitespace-nowrap text-slate-400">{fmtAgo(e.at, now, t)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </Link>
    </li>
  );
}

/** A draft: its rows and where its draft job got to. */
function DraftCard({ p, now }: { p: PlanSummary; now: number }) {
  const t = useT();
  const j = p.draft?.status;
  return (
    <li className="motion-safe:animate-fade-in">
      <Link to={planPath(p.planId)} className="flex h-full flex-col rounded-xl border border-dashed border-slate-300 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
        <div className="flex items-center gap-2">
          <FileText size={14} className="shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1 break-words font-medium text-slate-800">{p.name}</span>
        </div>
        {p.goal && <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{p.goal}</div>}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[11px] text-slate-500">
          <span>{t("plan.card.rows", { n: p.rowCount })}</span>
          {j === "done" && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700">{t("plan.card.drafted")}</span>}
          {j === "failed" && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700">{t("plan.job.failed")}</span>}
          <span className="ml-auto" title={p.updatedAt}>
            {fmtAgo(p.updatedAt, now, t)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function FinishedList({ items, now, open }: { items: PlanSummary[]; now: number; open: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={open} data-testid="plan-finished">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 coarse:py-3">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
        {t("plan.sec.finished")} <span className="font-normal text-slate-500">{items.length}</span>
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((p) => {
          const end = p.completedAt ?? p.cancelledAt ?? p.updatedAt;
          return (
            <li key={p.planId}>
              <Link to={planPath(p.planId)} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-slate-50 coarse:py-3">
                {p.status === "COMPLETED" ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden /> : <XCircle size={15} className="shrink-0 text-slate-400" aria-hidden />}
                <span className="min-w-0 flex-1 break-words text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-500">{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
                <PlanStatusBadge status={p.status} />
                <AutonomousBadge plan={p} />
                <span className="w-24 text-right text-[11px] text-slate-500" title={fmtDate(end, locale)}>
                  {fmtAgo(end, now, t)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** The new-plan form in a panel from the right (closes with Esc or the backdrop). */
function NewPlanDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-testid="plan-new-drawer">
      <button type="button" aria-label={t("close")} onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/40 motion-safe:animate-fade-in" />
      <div role="dialog" aria-modal="true" aria-labelledby="plan-new-h" className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl motion-safe:animate-drawer-in">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <Plus size={16} className="text-blue-600" aria-hidden />
          <h2 id="plan-new-h" className="text-sm font-semibold">
            {t("plan.new")}
          </h2>
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100 coarse:min-h-11 coarse:min-w-11" aria-label={t("close")}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          <CreatePlanForm bare autoFocus />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
      {children}
      {count !== undefined && <span className="font-normal text-slate-500">{count}</span>}
    </h2>
  );
}

export function PlansPage() {
  const t = useT();
  const [items, setItems] = useState<PlanSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () =>
      api
        .listPlans()
        .then((r) => {
          setItems(r.items);
          setErr(null);
        })
        .catch((e) => setErr(String(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const live = useMemo(() => (items ?? []).filter((p) => LIVE.has(p.status)), [items]);
  const drafts = useMemo(() => (items ?? []).filter((p) => p.status === "DRAFT"), [items]);
  const finished = useMemo(() => (items ?? []).filter((p) => p.status === "COMPLETED" || p.status === "CANCELLED"), [items]);
  const turn = useMemo(() => turnItems(items ?? []), [items]);

  // a draft being written is checked often, running plans every 15 s; nothing is read while the tab is hidden
  const pollMs = live.some((p) => p.status === "DRAFTING") ? 5_000 : live.length ? 15_000 : 0;
  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => document.visibilityState !== "hidden" && void load(), pollMs);
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [pollMs, load]);
  // seconds tick while something is live (elapsed clocks); otherwise only the 「… 前」 of drafts and finished plans move
  const now = useNow(live.length ? 1000 : 30_000, !!items?.length);
  const closeDrawer = useCallback(() => setCreating(false), []);

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ListChecks size={20} /> {t("plan.title")} <HelpTip text={t("plan.intro")} />
          </h1>
          <HelpLink section="planner" />
          {pollMs > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700" data-testid="plan-live" title={t("plan.liveHelp", { s: pollMs / 1000 })}>
              <LiveDot tone="running" className="scale-75" />
              {t("plan.live")}
            </span>
          )}
          {items !== null && items.length > 0 && (
            <button type="button" onClick={() => setCreating(true)} className={`${primaryBtn} ml-auto`}>
              <Plus size={14} aria-hidden /> {t("plan.new")}
            </button>
          )}
        </div>
        {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

        <div data-testid="plan-list">
          {items === null && <p className="text-sm text-slate-400">{t("loading")}</p>}
          {items?.length === 0 && (
            <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                <ListChecks size={28} className="mx-auto mb-2 text-slate-300" aria-hidden />
                <p className="text-sm font-medium text-slate-700">{t("plan.empty")}</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{t("plan.emptyHint")}</p>
              </div>
              <CreatePlanForm />
            </div>
          )}
          {!!items?.length && (
            <>
              <YourTurn items={turn} anyLive={live.length > 0} />
              {live.length > 0 && (
                <section className="mb-6" data-testid="plan-live-list">
                  <SectionHeading count={live.length}>{t("plan.sec.live")}</SectionHeading>
                  <ul className="grid gap-3">
                    {live.map((p) => (
                      <PlanLane key={p.planId} p={p} now={now} />
                    ))}
                  </ul>
                </section>
              )}
              {drafts.length > 0 && (
                <section className="mb-6" data-testid="plan-drafts">
                  <SectionHeading count={drafts.length}>{t("plan.sec.drafts")}</SectionHeading>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {drafts.map((p) => (
                      <DraftCard key={p.planId} p={p} now={now} />
                    ))}
                  </ul>
                </section>
              )}
              {finished.length > 0 && <FinishedList items={finished} now={now} open={!live.length && !drafts.length} />}
            </>
          )}
        </div>
      </div>
      {creating && <NewPlanDrawer onClose={closeDrawer} />}
    </div>
  );
}
