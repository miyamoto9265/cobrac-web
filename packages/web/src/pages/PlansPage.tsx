import { AlertTriangle, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, ClipboardPaste, CircleDollarSign, Clock, FileText, FileUp, GitPullRequest, Globe, Layers, ListChecks, Loader2, Lock, MessageCircleQuestion, Pause, PauseCircle, Play, Plus, Scale, Sparkles, Wand2, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CanonRecord, PlanPulseRow, PlanRowState, PlanSummary } from "@cobrac/shared";
import { ATTACHMENT_LIMITS, AUTONOMOUS_DEFAULT_MAX_COST_USD, AUTONOMOUS_MAX_COST_RANGE, MAX_CONFORM_FOLLOWUPS, PLAN_JOB_SHORT_ROWS, formatUsd, isAutonomous } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { MenuHeading, Popover } from "../components/create/Popover";
import { LiveDot, PlanBar } from "../components/PlanBar";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtBytes, fmtDate } from "../lib/format";
import { PLAN_FILE_ACCEPT, PLAN_STATUS_COLOR, ROW_STATE_COLOR, ROW_STATE_ORDER, NEW_PLAN_PATH, activeStageName, fmtAgo, fmtDuration, fmtElapsed, planEventText, planPath, useNow, wavesText } from "../lib/plan";
import { checkPlanFiles, uploadPlanFiles } from "../lib/planFiles";
import { CreateCanonForm, canonPath, inputCls, primaryBtn } from "./CanonsPage";

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

// --- the live view of the plans ----------------------------------------------------------------------------------------

const LIVE: ReadonlySet<PlanSummary["status"]> = new Set(["RUNNING", "PAUSED", "DRAFTING"]);
const rowText = (r: { roi: string; tlf: string }) => [r.tlf.trim(), r.roi.trim()].filter(Boolean).join(" · ") || "—";

type TurnKind = "attention" | "decision" | "question" | "draftAsk" | "review" | "paused" | "proposals" | "draftFailed" | "draftReady";
interface TurnItem {
  key: string;
  kind: TurnKind;
  plan: PlanSummary;
  row?: PlanPulseRow;
  n?: number;
}
const TURN_ORDER: TurnKind[] = ["attention", "decision", "question", "draftAsk", "review", "paused", "proposals", "draftFailed", "draftReady"];
const TURN: Record<TurnKind, { icon: ReactNode; tone: string }> = {
  attention: { icon: <AlertTriangle size={15} aria-hidden />, tone: "bg-rose-50 text-rose-700" },
  decision: { icon: <Scale size={15} aria-hidden />, tone: "bg-amber-100 text-amber-800" },
  question: { icon: <MessageCircleQuestion size={15} aria-hidden />, tone: "bg-amber-100 text-amber-800" },
  draftAsk: { icon: <MessageCircleQuestion size={15} aria-hidden />, tone: "bg-violet-50 text-violet-700" },
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
    // the Orchestrator asks before drafting, autonomous or not: only the owner can answer
    if (p.status === "DRAFTING" && p.draft?.status === "asking") out.push({ key: `${p.planId}/ask`, kind: "draftAsk", plan: p, n: p.draft.qa?.at(-1)?.questions.length ?? 0 });
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
                {it.kind === "draftAsk" && it.plan.draft?.qa?.at(-1)?.questions[0] && <span className="block line-clamp-1 break-words text-xs text-slate-600">{it.plan.draft.qa.at(-1)!.questions[0].text}</span>}
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

/**
 * Pause / resume of one plan from the list: a running plan starts no new row or Orchestrator job until resumed (rows
 * already running go on). A plan paused at its cost limit is resumed on its page, with a higher limit.
 */
function LaneToggle({ p, onDone, onError }: { p: PlanSummary; onDone: () => unknown; onError: (e: unknown) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const pause = p.status === "RUNNING";
  if (!pause && !(p.status === "PAUSED" && p.pausedReason !== "cost_limit")) return null;
  const label = t(pause ? "plan.pause" : "plan.resume");
  const run = () => {
    setBusy(true);
    api
      .planAction(p.planId, pause ? "pause" : "resume")
      .then(onDone)
      .catch(onError)
      .finally(() => setBusy(false));
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={run}
      title={label}
      aria-label={`${label}: ${p.name}`}
      data-testid="plan-lane-toggle"
      className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 coarse:h-11 coarse:w-11 ${pause ? "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700" : "border-blue-200 bg-blue-600 text-white hover:bg-blue-700"}`}
    >
      {busy ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> : pause ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
    </button>
  );
}

/** A running, paused or drafting plan: what it is doing now, how far it got, what happened last. */
function PlanLane({ p, now, onChanged, onError }: { p: PlanSummary; now: number; onChanged: () => unknown; onError: (e: unknown) => void }) {
  const t = useT();
  const pulse = p.pulse;
  const running = p.status === "RUNNING" || p.status === "DRAFTING";
  const waves = pulse?.waves ?? [{ wave: p.activeWave ?? 1, counts: p.rowCounts }];
  return (
    <li className={`relative motion-safe:animate-step-in ${dimArchived(p)}`} data-testid="plan-lane" data-status={p.status}>
      <Link
        to={planPath(p.planId)}
        className={`block rounded-2xl border bg-white p-4 transition-colors hover:border-blue-300 ${running ? "border-blue-200" : "border-amber-200"}`}
      >
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${p.status === "DRAFTING" ? "" : "pr-10 coarse:pr-12"}`}>
          <LiveDot tone={running ? "running" : "waiting"} />
          <span className="min-w-0 break-words text-base font-semibold text-slate-900">{p.name}</span>
          <span className="font-mono text-[11px] text-slate-500">{p.planId}</span>
          <ArchivedChip p={p} />
          <span className="ml-auto">
            <PlanStatusBadge status={p.status} />
            <AutonomousBadge plan={p} />
          </span>
        </div>

        {p.status === "DRAFTING" ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Sparkles size={15} aria-hidden className="plan-beat" />
              {t("plan.drafting", { state: t(`plan.job.${p.draft?.status ?? "waiting"}` as MessageKey) })}
            </div>
            <div className="plan-sweep mt-2 h-1.5 rounded-full bg-blue-100" aria-hidden />
            {p.goal && <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{p.goal}</p>}
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
              <Meta icon={<ListChecks size={13} />}>{pulse?.lanes?.length ? `${t("flow.lanes")} ${pulse.lanes.length}` : wavesText(waves.map((w) => w.wave), p.activeWave, t)}</Meta>
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
            <PlanBar waves={waves} lanes={pulse?.lanes} activeWave={p.activeWave} live={p.status === "RUNNING"} className="mt-3" />
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
      <LaneToggle p={p} onDone={onChanged} onError={onError} />
    </li>
  );
}

/** A draft: its rows and where its draft job got to. */
/** Archived missions stay on the Canon page, dimmed and after the others in their section. */
const archivedLast = (list: PlanSummary[]) => [...list].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
const dimArchived = (p: PlanSummary) => (p.archivedAt ? "opacity-60" : "");

function ArchivedChip({ p }: { p: PlanSummary }) {
  const t = useT();
  if (!p.archivedAt) return null;
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500" data-testid="plan-archived">
      {t("cm.archived")}
    </span>
  );
}

function DraftCard({ p, now }: { p: PlanSummary; now: number }) {
  const t = useT();
  const j = p.draft?.status;
  return (
    <li className={`motion-safe:animate-fade-in ${dimArchived(p)}`}>
      <Link to={planPath(p.planId)} className="flex h-full flex-col rounded-xl border border-dashed border-slate-300 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
        <div className="flex items-center gap-2">
          <FileText size={14} className="shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1 break-words font-medium text-slate-800">{p.name}</span>
        </div>
        {p.goal && <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{p.goal}</div>}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[11px] text-slate-500">
          <span>{t("plan.card.rows", { n: p.rowCount })}</span>
          <ArchivedChip p={p} />
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

function FinishedList({ items, now, open, label }: { items: PlanSummary[]; now: number; open: boolean; label: string }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={open} data-testid="plan-finished">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 coarse:py-3">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
        {label}
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((p) => {
          const end = p.completedAt ?? p.cancelledAt ?? p.updatedAt;
          return (
            <li key={p.planId} className={dimArchived(p)}>
              <Link to={planPath(p.planId)} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-slate-50 coarse:py-3">
                {p.status === "COMPLETED" ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden /> : <XCircle size={15} className="shrink-0 text-slate-400" aria-hidden />}
                <span className="min-w-0 flex-1 break-words text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-500">{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
                <ArchivedChip p={p} />
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

/** The new-mission page: the same composer as the new-project page (centred title, one rounded card, a toolbar of chips). */
export function NewPlanPage() {
  return <CreatePlanComposer />;
}

function CreatePlanComposer() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{ i: number; n: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const autonomous = !manual;
  const [maxCost, setMaxCost] = useState(String(AUTONOMOUS_DEFAULT_MAX_COST_USD));
  const [focused, setFocused] = useState<"name" | "goal" | "list" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const needId = useId();
  const goalRef = useRef<HTMLTextAreaElement>(null);

  const addFiles = (list: FileList) => {
    const { files: picked, problems } = checkPlanFiles(files, Array.from(list), t);
    setFiles([...files, ...picked]);
    setFileMsg(problems.length ? problems.join("\n") : null);
  };
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
  const hasInput = !!goal.trim() || files.length > 0 || !!pasted.trim();
  const canDraft = !!name.trim() && hasInput;
  const costOk = Number(maxCost) >= AUTONOMOUS_MAX_COST_RANGE.min && Number(maxCost) <= AUTONOMOUS_MAX_COST_RANGE.max;
  const canStart = !busy && canDraft && (!autonomous || costOk);
  const nAttached = files.length + (pasted.trim() ? 1 : 0);

  const tool = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 aria-expanded:bg-slate-100 coarse:h-11 coarse:w-11";
  const field = "w-full resize-none bg-transparent p-0 text-base leading-7 text-slate-900 caret-blue-600 outline-none placeholder:text-slate-400";
  const row = (k: typeof focused) => `flex items-start gap-3 px-3 py-3 transition-colors sm:gap-4 sm:px-4 sm:py-3.5 ${focused === k ? "bg-blue-50/50" : ""}`;
  const tag = (k: typeof focused, label: string, sub: string) => (
    <div className="w-10 shrink-0 select-none pt-1 text-center sm:w-11" aria-hidden>
      <span className={`block text-[13px] font-semibold tracking-wider ${focused === k ? "text-blue-600" : "text-slate-500"}`}>{label}</span>
      {sub && <span className="block text-[11px] leading-tight text-slate-400">{sub}</span>}
    </div>
  );
  const divider = <div className="ml-[4rem] mr-4 border-t border-dashed border-slate-200 sm:ml-[4.75rem]" aria-hidden />;

  return (
    <div className="flex h-full flex-col overflow-y-auto" data-testid="plan-new-page">
      <div className="flex flex-1 flex-col items-center justify-center px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight sm:mb-7">{t("plan.new")}</h1>
        <div role="group" aria-label={t("plan.new")} data-testid="plan-composer" className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-sm transition-[border-color,box-shadow] focus-within:border-slate-300 focus-within:shadow-md">
          <div className="pt-1.5">
            <div className={`${row("name")} -mt-1.5 rounded-t-3xl pt-[1.125rem] sm:pt-5`}>
              {tag("name", t("mc.nameTag"), t("mc.nameSub"))}
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.preventDefault(), goalRef.current?.focus());
                }}
                onFocus={() => setFocused("name")} onBlur={() => setFocused(null)} placeholder={t("mc.namePlaceholder")} aria-label={t("plan.name")} maxLength={200} autoFocus className={`${field} min-w-0 flex-1 font-medium`} />
              <span className="w-4 shrink-0" />
            </div>
            {divider}
            <div className={row("goal")}>
              {tag("goal", t("mc.goalTag"), t("mc.goalSub"))}
              <textarea ref={goalRef} value={goal} onChange={(e) => setGoal(e.target.value)} onFocus={() => setFocused("goal")} onBlur={() => setFocused(null)} rows={2} placeholder={t("plan.goalHint")} aria-label={t("plan.goal")} maxLength={4000} className={`${field} min-w-0 flex-1`} />
              <span className="w-4 shrink-0 pt-1.5">
                <HelpTip text={t("plan.intro")} />
              </span>
            </div>
            {pasteOpen && (
              <>
                {divider}
                <div className={row("list")}>
                  {tag("list", t("mc.listTag"), t("mc.listSub"))}
                  <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} onFocus={() => setFocused("list")} onBlur={() => setFocused(null)} rows={3} placeholder={t("plan.pasteHint")} aria-label={t("mc.paste")} className={`${field} min-w-0 flex-1 font-mono text-xs leading-5`} autoFocus />
                  <button type="button" onClick={() => (setPasteOpen(false), setPasted(""))} aria-label={t("mc.pasteRemove")} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-3 pb-1 sm:px-4" data-testid="plan-file-list" aria-label={t("plan.files")}>
              {files.map((f, i) => (
                <li key={`${f.name}-${f.size}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2 pr-0.5 text-xs text-slate-700" title={`${f.name} · ${fmtBytes(f.size)}`}>
                  <FileText size={13} className="shrink-0 text-slate-500" aria-hidden />
                  <span className="max-w-[12rem] truncate">{f.name}</span>
                  <button type="button" disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`${t("attach.remove")}: ${f.name}`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileMsg && <div className="mx-3 mb-1 whitespace-pre-line rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 [overflow-wrap:anywhere] sm:mx-4">{fileMsg}</div>}
          <input ref={fileRef} type="file" multiple accept={PLAN_FILE_ACCEPT} className="hidden" data-testid="plan-files" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          <div className="flex items-center gap-1 px-2 pb-2 pt-1 sm:gap-1.5 sm:px-3">
            <Popover
              testId="plan-plus"
              title={t("plan.files")}
              disabled={busy}
              width="w-64"
              trigger={{
                label: t("plan.files"),
                className: tool,
                content: (
                  <span className="relative">
                    <Plus size={18} aria-hidden />
                    {nAttached > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">{nAttached}</span>}
                  </span>
                ),
              }}
            >
              {(close) => (
                <div className="p-1.5">
                  <MenuHeading>
                    {t("plan.files")} <HelpTip text={`${t("plan.filesHelp", { n: ATTACHMENT_LIMITS.maxFiles, size: ATTACHMENT_LIMITS.maxFileBytes / MB })} ${t("plan.csvHelp")}`} />
                  </MenuHeading>
                  <button type="button" onClick={() => (close(), fileRef.current?.click())} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                    <FileUp size={15} className="text-slate-500" aria-hidden /> {t("plan.addFiles")}
                  </button>
                  <button type="button" onClick={() => (close(), setPasteOpen(true))} data-testid="plan-paste-open" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                    <ClipboardPaste size={15} className="text-slate-500" aria-hidden /> {t("mc.paste")}
                  </button>
                </div>
              )}
            </Popover>
            <Popover
              testId="plan-auto-chip"
              title={t("auto.label")}
              disabled={busy}
              width="w-80"
              trigger={{
                label: t("auto.label"),
                className: `flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 coarse:min-h-11 ${
                  autonomous ? "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100" : "border-slate-200 text-slate-500 hover:bg-slate-100"
                }`,
                content: (
                  <>
                    <Wand2 size={14} className="shrink-0" aria-hidden />
                    <span>{autonomous ? t("auto.label") : t("mc.self")}</span>
                    {autonomous && <span className="font-mono text-[11px] text-violet-500">≤ ${maxCost || "—"}</span>}
                    <ChevronDown size={13} className="shrink-0 opacity-60" aria-hidden />
                  </>
                ),
              }}
            >
              {() => (
                <div className="grid gap-2 px-3 pb-3" data-testid="plan-autonomous">
                  <div className="-mx-3">
                    <MenuHeading>
                      {t("auto.label")} <HelpTip text={t("auto.help")} />
                    </MenuHeading>
                  </div>
                  <label className={`flex items-center justify-between gap-2 px-0 text-sm ${autonomous ? "text-slate-700" : "text-slate-400"}`}>
                    <span className="flex items-center gap-1">
                      {t("auto.cost")} <HelpTip text={`${t("auto.costHint", { min: AUTONOMOUS_MAX_COST_RANGE.min, max: AUTONOMOUS_MAX_COST_RANGE.max })} ${t("auto.note")}`} />
                    </span>
                    <input type="number" min={AUTONOMOUS_MAX_COST_RANGE.min} max={AUTONOMOUS_MAX_COST_RANGE.max} step="1" value={maxCost} disabled={!autonomous} onChange={(e) => setMaxCost(e.target.value)} className={inputCls.replace("w-full", "w-24")} aria-invalid={!costOk} data-autofocus />
                  </label>
                  <label className="flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-700 coarse:min-h-11">
                    <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} data-testid="plan-manual" />
                    {t("auto.manual.label")}
                    <HelpTip text={t("auto.manual.help")} />
                  </label>
                </div>
              )}
            </Popover>
            <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
              {/* handling the mission yourself: “Create draft” beside the main “Create mission”, as before */}
              {!autonomous && (
                <button type="button" disabled={!canDraft || busy} onClick={() => void submit(true)} aria-describedby={hasInput ? undefined : needId} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 coarse:h-11">
                  <Sparkles size={14} aria-hidden /> <span className="max-sm:sr-only">{t("plan.createDraft")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void submit(autonomous)}
                disabled={!canStart}
                data-testid="plan-start"
                aria-describedby={hasInput ? undefined : needId}
                className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-blue-600 text-sm font-medium max-sm:w-11 sm:pl-3 sm:pr-3.5 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none coarse:h-11"
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : autonomous ? <Sparkles size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}{" "}
                <span className="max-sm:sr-only">{autonomous ? t("mc.start") : t("plan.create")}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2 flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 text-xs text-slate-400" data-testid="plan-meta">
          {hasInput ? (
            <span />
          ) : (
            <span id={needId} className="text-amber-700" data-testid="plan-need-input">
              {t("mc.needInput")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <HelpLink section="planner" />
            <HelpTip text={`${t("plan.createDraftNote", { n: PLAN_JOB_SHORT_ROWS })}${autonomous ? "" : `\n${t("plan.draftNote")}`}`} />
          </span>
        </div>
        {uploading && <div className="mt-2 text-xs text-slate-500">{t("plan.uploading", uploading)}</div>}
        {err && <div className="mt-3 w-full max-w-2xl rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 [overflow-wrap:anywhere]">{err}</div>}
      </div>
    </div>
  );
}

/** A group of the Canon page: one of the owner's Canons, a Canon a draft will create, or the missions without a Canon. */
interface CanonGroup {
  key: string;
  canon?: CanonRecord;
  /** the name of the Canon a mission creates when it starts (自律実行, or 「新しい Canon」 chosen in its draft) */
  pendingName?: string;
  plans: PlanSummary[];
}

/**
 * Missions by the Canon they build: a group per Canon of the owner (those without a mission too), a group per Canon still to
 * be created, then the missions without a Canon (or whose Canon is gone). Groups with a live mission come first, then the
 * most recently active.
 */
export function canonGroups(plans: PlanSummary[], canons: CanonRecord[]): CanonGroup[] {
  const own = new Map(canons.map((c) => [c.canonId, c]));
  const groups = new Map<string, CanonGroup>(canons.map((c) => [c.canonId, { key: c.canonId, canon: c, plans: [] }]));
  const none: CanonGroup = { key: "none", plans: [] };
  for (const p of plans) {
    if (p.canonId && own.has(p.canonId)) groups.get(p.canonId)!.plans.push(p);
    else if (!p.canonId && p.canonNew) groups.set(`new:${p.planId}`, { key: `new:${p.planId}`, pendingName: p.canonNew.name, plans: [p] });
    else none.plans.push(p);
  }
  const live = (g: CanonGroup) => g.plans.some((p) => LIVE.has(p.status));
  const last = (g: CanonGroup) => [g.canon?.updatedAt ?? "", ...g.plans.map((p) => p.updatedAt)].sort().at(-1)!;
  const out = [...groups.values()].sort((a, b) => Number(live(b)) - Number(live(a)) || (last(a) < last(b) ? 1 : last(a) > last(b) ? -1 : 0));
  return none.plans.length ? [...out, none] : out;
}

function GroupHeader({ g }: { g: CanonGroup }) {
  const t = useT();
  const { locale } = useI18n();
  const c = g.canon;
  if (!c)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Layers size={15} className={g.pendingName ? "text-blue-500" : "text-slate-400"} aria-hidden />
        <span className="min-w-0 break-words font-semibold text-slate-800">{g.pendingName ?? t("cm.noCanon")}</span>
        {g.pendingName && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{t("cm.pendingCanon")}</span>}
      </div>
    );
  return (
    <Link to={canonPath(c.canonId)} className="group/canon block min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Layers size={15} className="text-blue-600" aria-hidden />
        <span className="min-w-0 break-words font-semibold text-blue-700 group-hover/canon:underline">{c.name}</span>
        <span className="font-mono text-[11px] text-slate-400">{c.canonId}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{t("canon.revision", { n: c.headRevision })}</span>
          <span>{t("canon.memberCount", { n: c.memberCount })}</span>
          <span className="flex items-center gap-0.5" title={c.visibility === "public" ? t("vis.public") : t("vis.private")}>
            {c.visibility === "public" ? <Globe size={11} className="text-emerald-600" /> : <Lock size={11} />}
          </span>
          <span title={fmtDate(c.updatedAt, locale)}>{fmtDate(c.updatedAt, locale)}</span>
        </span>
      </div>
      {c.policy && <div className="mt-1 line-clamp-1 whitespace-pre-line pl-6 text-xs text-slate-600">{c.policy}</div>}
    </Link>
  );
}

/** One Canon with the missions that build it: live missions as lanes, drafts as cards, finished ones folded. */
function CanonGroupCard({ g, now, onChanged, onError }: { g: CanonGroup; now: number; onChanged: () => unknown; onError: (e: unknown) => void }) {
  const t = useT();
  const live = archivedLast(g.plans.filter((p) => LIVE.has(p.status)));
  const drafts = archivedLast(g.plans.filter((p) => p.status === "DRAFT"));
  const finished = archivedLast(g.plans.filter((p) => p.status === "COMPLETED" || p.status === "CANCELLED"));
  return (
    <section className={`rounded-2xl border bg-white p-3 sm:p-4 ${g.canon || g.pendingName ? "border-slate-200" : "border-dashed border-slate-300"}`} data-testid="canon-group" data-canon={g.canon?.canonId ?? g.key}>
      <GroupHeader g={g} />
      {live.length > 0 && (
        <ul className="mt-3 grid gap-3" data-testid="plan-live-list">
          {live.map((p) => (
            <PlanLane key={p.planId} p={p} now={now} onChanged={onChanged} onError={onError} />
          ))}
        </ul>
      )}
      {drafts.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="plan-drafts">
          {drafts.map((p) => (
            <DraftCard key={p.planId} p={p} now={now} />
          ))}
        </ul>
      )}
      {finished.length > 0 && (
        <div className="mt-3">
          <FinishedList items={finished} now={now} open={false} label={t("cm.finished", { n: finished.length })} />
        </div>
      )}
    </section>
  );
}

/**
 * The Canon page: the owner's Canons with the missions (Orchestrator plans) that build them, what waits on the owner across
 * every mission first, then the Canons shared with the owner. A live view while a mission runs or drafts.
 */
export function CanonBoard() {
  const t = useT();
  const navigate = useNavigate();
  const [items, setItems] = useState<PlanSummary[] | null>(null);
  const [canons, setCanons] = useState<CanonRecord[] | null>(null);
  const [shared, setShared] = useState<(CanonRecord & { ownerName: string })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([
        api.listPlans().then((r) => setItems(r.items)),
        api.listCanons().then((r) => {
          setCanons(r.items);
          setShared(r.shared ?? []);
        }),
      ])
        .then(() => setErr(null))
        .catch((e) => setErr(String(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const live = useMemo(() => (items ?? []).filter((p) => LIVE.has(p.status)), [items]);
  const turn = useMemo(() => turnItems(items ?? []), [items]);
  const groups = useMemo(() => canonGroups(items ?? [], canons ?? []), [items, canons]);

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
  const loading = items === null || canons === null;

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Layers size={20} /> {t("canon.title")} <HelpTip text={`${t("canon.intro")} ${t("plan.intro")}`} />
          </h1>
          <HelpLink section="canon" />
          {pollMs > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700" data-testid="plan-live" title={t("plan.liveHelp", { s: pollMs / 1000 })}>
              <LiveDot tone="running" className="scale-75" />
              {t("plan.live")}
            </span>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreating((v) => !v)} aria-expanded={creating} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 coarse:min-h-11" data-testid="canon-new-toggle">
              <Plus size={14} aria-hidden /> {t("cm.newCanon")}
            </button>
            <button type="button" onClick={() => navigate(NEW_PLAN_PATH)} className={primaryBtn}>
              <Plus size={14} aria-hidden /> {t("plan.new")}
            </button>
          </span>
        </div>
        {creating && (
          <div className="mb-5 max-w-xl motion-safe:animate-fade-in">
            <CreateCanonForm onCreated={(c) => navigate(canonPath(c.canonId))} />
          </div>
        )}
        {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

        <div data-testid="plan-list">
          {loading && <p className="text-sm text-slate-400">{t("loading")}</p>}
          {!loading && !groups.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center" data-testid="canon-empty">
              <Layers size={28} className="mx-auto mb-2 text-slate-300" aria-hidden />
              <p className="mx-auto max-w-sm text-sm text-slate-600">{t("cm.empty")}</p>
              <button type="button" onClick={() => navigate(NEW_PLAN_PATH)} className={`${primaryBtn} mx-auto mt-4`}>
                <Plus size={14} aria-hidden /> {t("plan.new")}
              </button>
            </div>
          )}
          {!loading && groups.length > 0 && (
            <>
              <YourTurn items={turn} anyLive={live.length > 0} />
              <div className="grid gap-3" data-testid="canon-list">
                {groups.map((g) => (
                  <CanonGroupCard key={g.key} g={g} now={now} onChanged={load} onError={(e) => setErr(String(e))} />
                ))}
              </div>
            </>
          )}
          {shared.length > 0 && (
            <section className="mt-6" data-testid="canon-shared">
              <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                {t("ed.sharedTitle")} <HelpTip text={t("ed.sharedHelp")} />
              </h2>
              <ul className="grid gap-2">
                {shared.map((c) => (
                  <li key={c.canonId}>
                    <Link to={canonPath(c.canonId)} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 break-words font-medium text-blue-700">{c.name}</span>
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">{t("ed.roleEditor")}</span>
                        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{t("canon.revision", { n: c.headRevision })}</span>
                          <span>{t("ed.ownerIs", { name: c.ownerName })}</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
