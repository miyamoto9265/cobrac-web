import { ArrowLeft, Check, CheckCheck, GitPullRequest, Pause, Pencil, Play, RotateCcw, Send, SkipForward, Square, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { PlanDetailResponse, PlanProposalRecord, PlanRecord, PlanRowRejected, PlanRowState, PlanRowView } from "@cobrac/shared";
import { ACTIVE_PROJECT_STATUSES, AUTONOMOUS_DEFAULT_MAX_COST_USD, AUTONOMOUS_MAX_COST_RANGE, MAX_CONFORM_FOLLOWUPS, maxFollowups, MAX_ROW_AUTO_RETRIES, formatUsd, orchestratorModelOf } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { PipelineProgress } from "../components/PipelineProgress";
import { LiveDot, PlanBar } from "../components/PlanBar";
import { CanonSection, type CanonFlush } from "../components/plan/CanonSection";
import { RowAiNotes, RowFacts, autoSkipLine, dangerBtn, iconBtn, jobError, projectPath, rowLabel, rowName, secondaryBtn, seedChip } from "../components/plan/common";
import { PlanDraft } from "../components/plan/PlanDraft";
import { PlanHistory } from "../components/plan/PlanHistory";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { ROW_STATE_COLOR, ROW_STATE_ORDER, backPressure, fmtDuration, isSeedWave, planWaves, seedIndexes, seedsHolding, waveCounts, wavesText } from "../lib/plan";
import { canonPullPath, inputCls, primaryBtn } from "./CanonsPage";
import { AutonomousBadge, PlanStatusBadge } from "./PlansPage";

// The plan page. A draft (DRAFT / DRAFTING) is laid out by components/plan/PlanDraft.tsx; this file lays out a plan once it
// is confirmed (RUNNING, PAUSED, COMPLETED, CANCELLED) and holds the header both share.

/** Element ID of a row's entry in 「人の判断」. */
const decisionAnchor = (rowId: string) => `plan-decision-${rowId}`;

function RowStateChip({ state }: { state: PlanRowState }) {
  const t = useT();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ROW_STATE_COLOR[state]}`}>{t(`plan.row.${state}` as MessageKey)}</span>;
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
  // wave numbers as stored (the headings of the rows show the same numbers)
  const waves = planWaves(rows);
  // plans counted before stage 3 have no review / decision counts
  const n = (s: PlanRowState) => (s === "running" ? counts.running + counts.starting : (counts[s] ?? 0));
  const shown = ROW_STATE_ORDER.filter((s) => n(s) > 0);
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="plan-summary">
      <Stat label={t("plan.progress")}>
        <div className="font-medium">{t("plan.doneOf", { done: counts.done, n: rows.length })}</div>
        <PlanBar waves={waveCounts(rows)} activeWave={plan.activeWave} live={plan.status === "RUNNING"} className="mt-1.5" />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {shown.map((s) => (
            <span key={s} className={`rounded-full px-1.5 py-0.5 text-[11px] ${ROW_STATE_COLOR[s]}`}>
              {t(`plan.row.${s}` as MessageKey)}{" "}
              <span key={n(s)} className="inline-block tabular-nums motion-safe:animate-count-in">
                {n(s)}
              </span>
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
          {plan.settings.autonomous && (
            <span className="ml-1.5 text-xs text-violet-700" data-testid="plan-cost-limit">
              {t("auto.limit", { cost: formatUsd(plan.settings.autonomous.maxCostUsd) })}
            </span>
          )}
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

/** The settings of a confirmed plan, read-only (a draft chooses them in 「3. 進め方」). */
function Settings({ d }: { d: PlanDetailResponse }) {
  const t = useT();
  const { plan } = d;
  const s = plan.settings;
  const o = orchestratorModelOf(s);
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" data-testid="plan-settings">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
        {t("plan.settings")} <HelpTip text={t("plan.settingsNote")} />
      </h2>
      <div className="grid gap-1 text-xs text-slate-600">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{t("plan.orchestratorModel")}:</span>
          <span className="font-mono">{o.model ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{t("plan.agentsModel")}:</span>
          <span className="font-mono">{s.model ?? "—"}</span>
          <span>effort: {s.reasoningEffort ?? "default"}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {t("plan.researchMode")}: {s.researchMode ? "on" : "off"}
          </span>
          {plan.harnessRules !== undefined && plan.harnessRules !== null && <span>{t("plan.harness", { n: plan.harnessRules })}</span>}
        </div>
        {s.autonomous && <div className="text-violet-700">{t("auto.settingsRead", { cost: formatUsd(s.autonomous.maxCostUsd) })}</div>}
      </div>
    </section>
  );
}

/** A plan paused at its cost limit: resumed with a higher limit. */
function RaiseLimit({ plan, busy, onResume }: { plan: PlanRecord; busy: boolean; onResume: (maxCostUsd: number) => void }) {
  const t = useT();
  const [cost, setCost] = useState(String(Math.round((plan.settings.autonomous?.maxCostUsd ?? AUTONOMOUS_DEFAULT_MAX_COST_USD) * 2)));
  const n = Number(cost);
  return (
    <form
      className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
      data-testid="plan-raise-limit"
      onSubmit={(e) => {
        e.preventDefault();
        onResume(n);
      }}
    >
      <label className="grid gap-1 text-xs text-amber-900">
        {t("auto.newLimit")}
        <input type="number" min={AUTONOMOUS_MAX_COST_RANGE.min} max={AUTONOMOUS_MAX_COST_RANGE.max} value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} w-32`} />
      </label>
      <button type="submit" disabled={busy || !(n >= AUTONOMOUS_MAX_COST_RANGE.min && n <= AUTONOMOUS_MAX_COST_RANGE.max)} className={primaryBtn}>
        <Play size={14} aria-hidden /> {t("auto.raise")}
      </button>
    </form>
  );
}

/** The granularity policy: written by the Orchestrator (the draft, then re-plans) and only shown here. */
function Policy({ plan }: { plan: PlanRecord }) {
  const t = useT();
  const stored = plan.policy ?? "";
  if (!stored.trim()) return null;
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" data-testid="plan-policy">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
        {t("canon.policy")} <HelpTip text={t("plan.policyHelp")} />
      </h2>
      <p className="whitespace-pre-line break-words text-sm text-slate-700">{stored}</p>
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
            <div className="mb-2 empty:hidden">
              <RowAiNotes row={r} />
            </div>
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
              <RowAiNotes row={r} />
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

/** Link to a row's pull request in the plan's Canon. */
function PrLink({ canonId, prNo }: { canonId: string; prNo: number }) {
  const t = useT();
  return (
    <Link to={canonPullPath(canonId, prNo)} className="inline-flex items-center gap-1 text-blue-700 hover:underline coarse:min-h-11" data-testid="row-pr">
      <GitPullRequest size={12} aria-hidden /> {t("plan.pr", { n: prNo })}
    </Link>
  );
}

/**
 * What a row of a Canon plan adds: its pull request (also while it waits for its update to match the Canon), the AI review
 * of it (待ち / 実行中, then 「AI レビュー済み」 linking to the pull request, where the review is shown), and the conform
 * follow-ups it got.
 */
function RowCanonFacts({ row, canonId, maxConform = MAX_CONFORM_FOLLOWUPS }: { row: PlanRowView; canonId: string | null; maxConform?: number }) {
  const t = useT();
  const conformWaits = row.state === "pending" && !!row.conform;
  const pr = canonId && row.prNo && (row.state === "review" || row.state === "decision" || row.state === "done" || conformWaits) ? row.prNo : null;
  const prOpen = row.state === "review" || row.state === "decision";
  const chip = "rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700";
  // 待ち / 実行中 while the row waits for approval (the runner clears 実行中 when the review job ends); afterwards a link to
  // the pull request, where the review is shown
  const aiState = row.state === "review" && row.aiReview ? row.aiReview : !row.aiReview && row.aiReviewJobId && prOpen && pr ? "done" : null;
  return (
    <>
      {pr && <PrLink canonId={canonId!} prNo={pr} />}
      {conformWaits && (
        <span className="text-slate-500" data-testid="row-conform-waiting">
          {t("plan.conformWaiting")}
        </span>
      )}
      {aiState === "done" ? (
        <Link to={canonPullPath(canonId!, pr!)} className={`${chip} inline-flex items-center hover:underline coarse:min-h-11`} data-testid="row-ai-review">
          {t("plan.aiReview.done")}
        </Link>
      ) : aiState ? (
        <span className={chip} data-testid="row-ai-review">
          {t(`plan.aiReview.${aiState}` as MessageKey)}
        </span>
      ) : null}
      {(row.conformAttempts ?? 0) > 0 && (
        <span className="text-slate-500" data-testid="row-conform">
          {t("plan.conformAttempts", { n: row.conformAttempts ?? 0, max: maxConform })}
        </span>
      )}
    </>
  );
}

/** Rows whose pull request needs a human decision (「人の判断」): mark done or push again (running / paused plans), or skip. */
function Decisions({ rows, canonId, busy, canResolve, canSkip, resolve, skip }: { rows: PlanRowView[]; canonId: string | null; busy: boolean; canResolve: boolean; canSkip: boolean; resolve: (rowId: string, action: "done" | "push") => void; skip: (rowId: string) => void }) {
  const t = useT();
  if (!rows.length) return null;
  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="plan-decisions">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-amber-800">
        {t("plan.decisions", { n: rows.length })} <HelpTip text={t("plan.decisionsHelp")} />
      </h2>
      <ul className="grid gap-2">
        {rows.map((r) => {
          // only an existing, completed project can be pushed (the API answers 409 otherwise)
          const canPush = !!r.project && !r.project.deleted && r.project.status === "COMPLETED";
          return (
            <li key={r.rowId} id={decisionAnchor(r.rowId)} className="flex min-w-0 scroll-mt-4 flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 lg:flex-row lg:items-center" data-testid="plan-decision">
              <div className="min-w-0 flex-1 text-sm">
                <div className="break-words font-medium">{rowLabel(r)}</div>
                <div className="text-xs text-amber-800">{t(`plan.decision.${r.decisionReason ?? "conflicts"}` as MessageKey, { n: MAX_CONFORM_FOLLOWUPS })}</div>
                {r.lastError && <div className="line-clamp-2 break-words text-xs text-slate-600">{r.lastError}</div>}
                <RowAiNotes row={r} />
                <div className="flex flex-wrap items-center gap-x-3 text-xs">
                  {r.projectId && (
                    <Link to={projectPath(r.projectId)} className="inline-flex min-w-0 max-w-full items-center text-blue-700 hover:underline coarse:min-h-11">
                      {r.project?.name ?? r.projectId}
                    </Link>
                  )}
                  {canonId && r.prNo ? <PrLink canonId={canonId} prNo={r.prNo} /> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !canResolve} onClick={() => window.confirm(t("plan.resolveDoneQ")) && resolve(r.rowId, "done")} className={secondaryBtn}>
                  <CheckCheck size={14} aria-hidden /> {t("plan.resolveDone")}
                </button>
                <button
                  type="button"
                  disabled={busy || !canResolve || !canPush}
                  title={canPush ? undefined : t("plan.resolvePushNeedsCompleted")}
                  onClick={() => window.confirm(t("plan.resolvePushQ")) && resolve(r.rowId, "push")}
                  className={secondaryBtn}
                >
                  <Upload size={14} aria-hidden /> {t("plan.resolvePush")}
                </button>
                <button type="button" disabled={busy || !canSkip} onClick={() => window.confirm(t("plan.skipDecisionQ")) && skip(r.rowId)} className={secondaryBtn}>
                  <SkipForward size={14} aria-hidden /> {t("plan.skip")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Link that scrolls to a row's entry in 「人の判断」 on this page. */
function DecisionLink({ row }: { row: PlanRowView }) {
  const id = decisionAnchor(row.rowId);
  return (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }}
      className="inline-flex min-w-0 max-w-full items-center gap-1 break-words text-amber-900 underline coarse:min-h-11"
      data-testid="seed-decision-link"
    >
      {rowLabel(row) || row.rowId}
    </a>
  );
}

/**
 * Why a running Canon plan does not start rows: a seed pull request waits for approval or a seed needs a human decision
 * (both hold every later wave and every other seed), or too many pull requests wait (back-pressure, later waves only).
 */
function CanonGates({ d }: { d: PlanDetailResponse }) {
  const t = useT();
  const { plan, rows } = d;
  const canonId = plan.canonId ?? d.canon?.canonId ?? null;
  if (!canonId || (plan.status !== "RUNNING" && plan.status !== "PAUSED")) return null;
  const seeds = seedsHolding(rows, plan.activeWave);
  const inReview = seeds.filter((r) => r.state === "review");
  const toDecide = seeds.filter((r) => r.state === "decision");
  // back-pressure only holds rows of later waves; nothing to explain once none is waiting
  const held = backPressure(rows) && rows.some((r) => r.state === "pending" && r.wave > (plan.activeWave ?? 0));
  if (!seeds.length && !held) return null;
  return (
    <div className="mb-3 grid gap-2">
      {inReview.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-700" role="status" data-testid="plan-seed-gate">
          <span className="min-w-0 break-words">{t("plan.seedGate")}</span>
          {inReview.map((r) => (r.prNo ? <PrLink key={r.rowId} canonId={canonId} prNo={r.prNo} /> : null))}
        </div>
      )}
      {toDecide.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status" data-testid="plan-seed-decision">
          <span className="min-w-0 break-words">{t("plan.seedGateDecision")}</span>
          {toDecide.map((r) => (
            <DecisionLink key={r.rowId} row={r} />
          ))}
        </div>
      )}
      {held && (
        <div className="break-words rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status" data-testid="plan-back-pressure">
          {t("plan.backPressure", { n: rows.filter((r) => r.state === "review").length })}
        </div>
      )}
    </div>
  );
}

/** Heading of a wave: its stored number, 「基準プロジェクト」 for a seed wave. */
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

/** A row whose project is being built now (the stage strip and the accent of the row). */
const building = (r: PlanRowView) => (r.state === "starting" || r.state === "running" || r.state === "question") && !!r.project && ACTIVE_PROJECT_STATUSES.includes(r.project.status);

function RowsByWave({ d, act }: { d: PlanDetailResponse; act: (rowId: string, action: "retry" | "skip") => void }) {
  const t = useT();
  const waves = planWaves(d.rows);
  const names = useMemo(() => new Map(d.rows.map((r) => [r.rowId, rowName(r)])), [d.rows]);
  // 「基準プロジェクト」 on a row only while it is the seed of its wave (as the headings)
  const seeds = useMemo(() => new Set([...seedIndexes(d.rows)].map((i) => d.rows[i].rowId)), [d.rows]);
  const canSkip = d.plan.status === "RUNNING" || d.plan.status === "PAUSED" || d.plan.status === "CANCELLED";
  const canonId = d.plan.canonId ?? d.canon?.canonId ?? null;
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
                <li
                  key={r.rowId}
                  data-state={r.state}
                  className={`flex min-w-0 flex-col gap-1 rounded-lg border bg-white px-3 py-2 transition-colors sm:flex-row sm:items-center sm:gap-3 ${building(r) ? "border-blue-300 shadow-[inset_3px_0_0_theme(backgroundColor.blue.500)]" : "border-slate-200"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm">
                      <span className="font-medium">{r.tlf || "—"}</span>
                      <span className="text-slate-500"> · {r.roi || "—"}</span>
                    </div>
                    {r.rationale && <div className="line-clamp-1 break-words text-xs text-slate-500">{r.rationale}</div>}
                    {r.state === "skipped" && r.autoSkip && (
                      <div className="break-words text-xs text-amber-800" data-testid="row-auto-skip">
                        {autoSkipLine(t, d.plan, r.autoSkip)}
                      </div>
                    )}
                    <RowAiNotes row={r} />
                    <RowFacts row={{ ...r, seed: seeds.has(r.rowId) }} names={names} />
                    {building(r) && r.project?.stepStates && (
                      <PipelineProgress project={{ status: r.project.status, stepStates: r.project.stepStates, activeStage: r.project.activeStage ?? null, researchMode: r.project.researchMode }} jobs={[]} help={false} className="mt-1.5" />
                    )}
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
                    {!!r.autoAnswers && (
                      <span className="text-violet-700" data-testid="row-ai-answers">
                        {t("auto.aiAnswers", { n: r.autoAnswers })}
                      </span>
                    )}
                    <RowCanonFacts row={r} canonId={canonId} maxConform={maxFollowups(d.plan)} />
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
              <span className={`rounded-full px-1.5 py-0.5 ${PROPOSAL_STATUS_COLOR[p.status]}`}>{t(p.status === "accepted" && p.decidedBy === "runner" ? "plan.proposal.applied" : (`plan.proposal.${p.status}` as MessageKey))}</span>
              {p.decidedAt && <span className="text-slate-500">{fmtDate(p.decidedAt, locale)}</span>}
            </div>
            <ProposalBody p={p} rows={d.rows} names={names} compact />
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PlanDetailPage() {
  const t = useT();
  const { planId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [d, setD] = useState<PlanDetailResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<PlanRowRejected[]>(() => ((location.state as { rejected?: PlanRowRejected[] } | null)?.rejected ?? []));
  const [renaming, setRenaming] = useState<string | null>(null);
  const canonFlushRef = useRef<CanonFlush | null>(null);

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
  const resolveRow = (rowId: string, action: "done" | "push") => act(() => api.resolvePlanRow(planId, rowId, action));
  // busy until the plan is read again, so a decided proposal cannot be decided twice
  const decide = (p: PlanProposalRecord, action: "accept" | "reject") =>
    act(
      async () => {
        await api.proposalAction(planId, p.proposalId, action);
        await load();
      },
      () => {},
    );
  const draftLike = plan.status === "DRAFT" || plan.status === "DRAFTING";
  const banner =
    plan.status === "PAUSED"
      ? { cls: "bg-amber-50 text-amber-800", text: t(`plan.paused.${plan.pausedReason ?? "user"}` as MessageKey) }
      : plan.status === "CANCELLED"
        ? { cls: "bg-slate-100 text-slate-700", text: t("plan.cancelledNote") }
        : plan.status === "COMPLETED"
          ? { cls: "bg-emerald-100 text-emerald-700", text: t("plan.completedNote") }
          : null;
  const alert = err && (
    <div className="break-words rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {err}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="max-w-5xl">
        <Link to="/plans" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 coarse:min-h-11">
          <ArrowLeft size={12} /> {t("plan.shortName")}
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
          <span className="flex items-center gap-1.5">
            {(plan.status === "RUNNING" || plan.status === "DRAFTING" || plan.status === "PAUSED") && <LiveDot tone={plan.status === "PAUSED" ? "waiting" : "running"} />}
            <PlanStatusBadge status={plan.status} />
            <AutonomousBadge plan={plan} />
          </span>
          <span className="font-mono text-[11px] text-slate-500" title={t("plan.planId")}>
            {plan.planId}
          </span>
          <HelpLink section="planner" />
        </div>

        {draftLike ? (
          <PlanDraft d={d} busy={busy} act={act} load={load} onError={onError} rejected={rejected} onRejected={setRejected} alert={alert} />
        ) : (
          <>
            {plan.goal && <p className="mb-3 whitespace-pre-line break-words text-sm text-slate-600">{plan.goal}</p>}
            {!!plan.attachments?.length && <p className="mb-3 break-words text-xs text-slate-500">{t("plan.attachments", { names: plan.attachments.map((a) => a.name).join(t("plan.sep")) })}</p>}
            {banner && <div className={`mb-3 rounded-md px-3 py-2 text-sm ${banner.cls}`}>{banner.text}</div>}
            {alert && <div className="mb-3">{alert}</div>}
            {plan.status === "PAUSED" && plan.pausedReason === "cost_limit" && <RaiseLimit plan={plan} busy={busy} onResume={(maxCostUsd) => act(() => api.resumePlan(planId, { maxCostUsd }))} />}
            <CanonGates d={d} />

            <div className="mb-4 flex flex-wrap gap-2" data-testid="plan-actions">
              {plan.status === "RUNNING" && (
                <button type="button" disabled={busy} onClick={() => act(() => api.planAction(planId, "pause"))} className={secondaryBtn}>
                  <Pause size={14} aria-hidden /> {t("plan.pause")}
                </button>
              )}
              {(plan.status === "CANCELLED" || (plan.status === "PAUSED" && plan.pausedReason !== "cost_limit")) && (
                <button type="button" disabled={busy} onClick={() => act(() => api.planAction(planId, "resume"))} className={primaryBtn}>
                  <Play size={14} aria-hidden /> {t("plan.resume")}
                </button>
              )}
              {(plan.status === "RUNNING" || plan.status === "PAUSED") && (
                <button type="button" disabled={busy} onClick={() => window.confirm(t("plan.cancelQ")) && act(() => api.planAction(planId, "cancel"))} className={dangerBtn}>
                  <Square size={14} aria-hidden /> {t("plan.cancel")}
                </button>
              )}
              {(plan.status === "COMPLETED" || plan.status === "CANCELLED") && (
                <button type="button" disabled={busy} onClick={() => window.confirm(t("plan.deleteQ")) && act(() => api.deletePlan(planId), () => navigate("/plans"))} className={dangerBtn}>
                  <Trash2 size={14} aria-hidden /> {t("plan.delete")}
                </button>
              )}
            </div>

            <Summary d={d} />
            <Inbox rows={rows.filter((r) => r.state === "question")} onDone={() => void load()} onError={onError} />
            <Decisions rows={rows.filter((r) => r.state === "decision")} canonId={plan.canonId ?? d.canon?.canonId ?? null} busy={busy} canResolve={plan.status === "RUNNING" || plan.status === "PAUSED"} canSkip={plan.status === "RUNNING" || plan.status === "PAUSED" || plan.status === "CANCELLED"} resolve={resolveRow} skip={(rowId) => rowAct(rowId, "skip")} />
            <Attention rows={rows.filter((r) => r.state === "attention")} act={rowAct} />
            {(plan.status === "RUNNING" || plan.status === "PAUSED") && <Proposals d={d} busy={busy} decide={decide} />}
            <Settings d={d} />
            <Policy plan={plan} />
            <CanonSection d={d} onSaved={load} onError={onError} flushRef={canonFlushRef} />
            <RowsByWave d={d} act={rowAct} />
            <PlanHistory events={d.events} rows={rows} plan={plan} />
            <DecidedProposals d={d} />
          </>
        )}
      </div>
    </div>
  );
}
