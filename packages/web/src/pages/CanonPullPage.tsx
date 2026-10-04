import { ArrowLeft, Check, GitPullRequest, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CanonChoice, CanonPullDetailResponse, UiLocale } from "@cobrac/shared";
import { blockingConflicts, parseReviewItemId } from "@cobrac/shared";
import { AiPanel, type RefLink } from "../components/canonReview/AiPanel";
import { ChecksPanel } from "../components/canonReview/ChecksPanel";
import { DiffTable } from "../components/canonReview/DiffTable";
import { ReviewGraph } from "../components/canonReview/ReviewGraph";
import { Trail } from "../components/canonReview/Trail";
import { DiffSummary } from "../components/CanonDiffView";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api, ApiError } from "../lib/api";
import { fmtDate } from "../lib/format";
import { canonPath, primaryBtn } from "./CanonsPage";
import { workspacePath } from "./ProjectWorkspacePage";

const sourceLink = (source: string) => {
  const [kind, id] = source.split(":");
  return kind === "project" ? workspacePath(id) : canonPath(id);
};

type Tab = "changes" | "checks" | "ai" | "trail";

/** Who decided the pull request (or asked for changes), when, and with what note. */
function DecisionBanner({ data }: { data: CanonPullDetailResponse }) {
  const t = useT();
  const { locale } = useI18n();
  const pr = data.pr;
  const last = (type: string) => [...data.events].reverse().find((e) => e.type === type);
  const show = (kind: "approved" | "rejected" | "withdrawn" | "changes_requested", name: string | null | undefined, at: string | null | undefined, note: string | null | undefined) => {
    const cls = { approved: "border-emerald-200 bg-emerald-50 text-emerald-800", rejected: "border-rose-200 bg-rose-50 text-rose-800", withdrawn: "border-slate-200 bg-slate-50 text-slate-700", changes_requested: "border-amber-200 bg-amber-50 text-amber-900" }[kind];
    const Icon = { approved: Check, rejected: X, withdrawn: Undo2, changes_requested: Undo2 }[kind];
    return (
      <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`} data-testid="decision-banner">
        <Icon size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div>
            <span className="font-medium">{t(`ed.decided.${kind}` as MessageKey, { name: name || "—", rev: pr.mergedRevision ?? "" })}</span>
            {at && <span className="ml-2 text-xs opacity-80">{fmtDate(at, locale)}</span>}
          </div>
          {note && <div className="mt-0.5 whitespace-pre-wrap break-words text-xs">{note}</div>}
        </div>
      </div>
    );
  };
  if (pr.state === "approved") return show("approved", pr.decidedByName ?? last("approved")?.actorName, pr.decidedAt, pr.reason);
  if (pr.state === "rejected") return show("rejected", pr.decidedByName ?? last("rejected")?.actorName, pr.decidedAt, pr.reason);
  if (pr.state === "withdrawn") return show("withdrawn", pr.decidedByName ?? last("withdrawn")?.actorName, pr.decidedAt, null);
  if (pr.state === "open" && pr.reviewState === "changes_requested") {
    const e = last("changes_requested");
    return show("changes_requested", pr.reviewedByName ?? e?.actorName, pr.reviewedAt ?? e?.at, pr.reviewNote);
  }
  return null;
}
const AI_POLL_MS = 5000;

/**
 * Review screen of one pull request. The system checks and the AI review assist; only the Canon's owner approves,
 * requests changes or rejects (with a note), and every step is kept in the PR's audit trail.
 */
export function CanonPullPage() {
  const t = useT();
  const { locale } = useI18n();
  const { canonId = "", no = "" } = useParams();
  const prNo = Number(no);
  const [data, setData] = useState<CanonPullDetailResponse | null>(null);
  const [choices, setChoices] = useState<Record<string, CanonChoice>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("changes");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ item: string; text: string } | null>(null);
  const [prDraft, setPrDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      api
        .canonPull(canonId, prNo)
        .then(setData)
        .catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })),
    [canonId, prNo],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const aiActive = data?.ai?.status === "QUEUED" || data?.ai?.status === "RUNNING";
  useEffect(() => {
    if (!aiActive) return;
    const id = setTimeout(() => void load(), AI_POLL_MS);
    return () => clearTimeout(id);
  }, [aiActive, data, load]);

  const pr = data?.pr ?? null;
  const diff = data?.diff ?? null;
  const blocking = useMemo(() => (diff ? blockingConflicts(diff, choices) : []), [diff, choices]);
  const open = pr?.state === "open";
  const review = open && !!data?.canReview;
  const labels = useMemo(() => new Map((diff?.items ?? []).map((i) => [`${i.kind}:${i.key}`, i.label])), [diff]);
  const labelOf = useCallback((id: string) => labels.get(id) ?? parseReviewItemId(id)?.key ?? id, [labels]);
  const checkCodes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.checks?.checks ?? []) m.set(c.id, c.code);
    for (const c of diff?.conflicts ?? []) m.set(c.id, c.code);
    return m;
  }, [data, diff]);
  const refs = useMemo(() => {
    const m = new Map<string, RefLink>();
    for (const [id, e] of Object.entries(data?.entries ?? {})) {
      const f = e.incoming ?? e.canon;
      if (id.startsWith("reference:") && f) m.set(id.slice("reference:".length), { doi: f.doi ?? "", pmid: f.pmid ?? "" });
    }
    return m;
  }, [data]);
  const comments = useMemo(() => (data?.events ?? []).filter((e) => e.type === "comment"), [data]);
  const findings = (data?.checks?.checks ?? []).filter((c) => c.severity !== "info").length;

  const select = (id: string | null) => {
    setSelected(id);
    if (id) setTab("changes");
  };
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      setNote("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await load();
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const comment = async (text: string, item: string | null) => {
    await api.commentPull(canonId, prNo, text, item);
    if (item) setDraft(null);
    else setPrDraft("");
    await load();
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "changes", label: t("rv.tab.changes"), count: diff ? diff.summary.added + diff.summary.changed + diff.summary.dropped : undefined },
    { id: "checks", label: t("rv.tab.checks"), count: findings },
    ...(data?.canReview ? [{ id: "ai" as const, label: t("rv.tab.ai") }] : []),
    { id: "trail", label: t("rv.tab.trail"), count: data?.events.length },
  ];
  const btn = "flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 coarse:min-h-11 lg:flex-none";

  const decision = review && (
    <div className="grid gap-2" data-testid="review-decision">
      <label className="hidden items-center gap-1 text-xs font-semibold text-slate-600 lg:flex">
        {t("rv.note")} <HelpTip text={t("rv.decisionHelp")} />
      </label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("rv.notePh")} className="h-10 w-full resize-y rounded-lg lg:h-auto border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" data-testid="review-note" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !note.trim()} onClick={() => void run(async () => (await api.requestChanges(canonId, prNo, note.trim()), t("rv.changesRequested")))} className={`${btn} border-amber-300 text-amber-800 hover:bg-amber-50`} data-testid="request-changes">
          <Undo2 size={14} /> {t("rv.requestChanges")}
        </button>
        <button type="button" disabled={busy || !note.trim()} onClick={() => void run(async () => (await api.rejectPull(canonId, prNo, note.trim()), t("pr.rejected")))} className={`${btn} border-rose-300 text-rose-700 hover:bg-rose-50`} data-testid="reject-pr">
          <X size={14} /> {t("pr.reject")}
        </button>
        <button
          type="button"
          disabled={busy || blocking.length > 0}
          title={blocking.length ? t("pr.blocking", { n: blocking.length }) : undefined}
          onClick={() => void run(async () => t("pr.approved", { n: (await api.approvePull(canonId, prNo, choices, note.trim() || undefined)).revision }))}
          className={`${primaryBtn} flex-1 lg:flex-none`}
          data-testid="approve-pr"
        >
          <Check size={14} /> {t("pr.approve")}
        </button>
      </div>
      {blocking.length > 0 && (
        <button type="button" onClick={() => setTab("checks")} className="text-left text-xs text-amber-700 hover:underline coarse:-my-1 coarse:py-2">
          {t("pr.blocking", { n: blocking.length })}
        </button>
      )}
      <p className="hidden text-[11px] text-slate-500 lg:block">{t("rv.youDecide")}</p>
    </div>
  );

  return (
    <div ref={scroller} className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Link to={canonPath(canonId)} className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:min-h-11">
        <ArrowLeft size={12} /> {t("pr.backToCanon")}
      </Link>
      {msg && <div className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      {!pr && !msg && <div className="text-sm text-slate-400">{t("loading")}</div>}
      {pr && data && (
        <div className={`max-w-7xl ${review ? "pb-44 lg:pb-0" : ""}`}>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <GitPullRequest size={20} className="shrink-0" /> {data.targetName} #{pr.prNo}
            {(pr.source.startsWith("project:") && data.viewerRole === "owner") || data.canWithdraw ? (
              <Link to={sourceLink(pr.source)} className="min-w-0 break-words text-blue-700 hover:underline">
                ← {pr.sourceName}
              </Link>
            ) : (
              <span className="min-w-0 break-words text-slate-700">← {pr.sourceName}</span>
            )}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600" data-testid="pr-state">
              {t(`pr.state.${pr.state}` as MessageKey)}
            </span>
            {open && pr.reviewState === "changes_requested" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">{t("rv.changesRequested")}</span>}
          </h1>
          <div className="mb-3 mt-1 text-xs text-slate-500">
            {t("pr.meta", { base: pr.baseRevision, rev: pr.sourceRevision, date: fmtDate(pr.createdAt, locale) })}
            {data.headRevision > pr.baseRevision && open && <> · {t("rv.headNow", { n: data.headRevision })}</>}
            {pr.mergedRevision ? <> · {t("pr.merged", { n: pr.mergedRevision })}</> : null}{" "}
            <HelpLink section="push" className="align-middle" />
          </div>
          <DecisionBanner data={data} />
          {diff && <DiffSummary diff={diff} />}
          {diff && diff.skipped.length > 0 && <div className="mt-2 text-xs text-amber-700">{t("pr.skipped", { ids: diff.skipped.join(", ") })}</div>}

          <div className={`mt-4 ${review ? "lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-4" : ""}`}>
            <div className="min-w-0">
              <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">
                {tabs.map((x) => (
                  <button
                    key={x.id}
                    role="tab"
                    type="button"
                    aria-selected={tab === x.id}
                    onClick={() => setTab(x.id)}
                    className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm coarse:min-h-11 ${tab === x.id ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                    data-testid={`tab-${x.id}`}
                  >
                    {x.label}
                    {x.count !== undefined && x.count > 0 && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{x.count}</span>}
                  </button>
                ))}
              </div>
              {tab === "changes" && diff && (
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                  {data.graph && <ReviewGraph graph={data.graph} baseRevision={diff.baseRevision} selected={selected} onSelect={select} />}
                  <DiffTable
                    diff={diff}
                    entries={data.entries}
                    checks={data.checks?.checks ?? []}
                    comments={comments}
                    selected={selected}
                    onSelect={setSelected}
                    labelOf={labelOf}
                    onComment={data.canComment ? (text, item) => comment(text, item) : null}
                    draft={draft}
                  />
                </div>
              )}
              {tab === "checks" && diff && data.checks && (
                <ChecksPanel report={data.checks} conflicts={diff.conflicts} choices={choices} onChoose={review ? (id, c) => setChoices((p) => ({ ...p, [id]: c })) : undefined} labelOf={labelOf} onSelect={select} />
              )}
              {tab === "ai" && data.canReview && (
                <AiPanel
                  ai={data.ai}
                  canRun={review}
                  onRun={async (model: string | null, lang: UiLocale) => {
                    await api.aiReviewPull(canonId, prNo, model, lang);
                    await load();
                  }}
                  labelOf={labelOf}
                  checkCodeOf={(id) => checkCodes.get(id) ?? null}
                  refs={refs}
                  onSelect={select}
                  onUseComment={(item, text) => {
                    if (item) {
                      setDraft({ item, text });
                      select(item);
                    } else {
                      setPrDraft(text);
                      setTab("trail");
                    }
                  }}
                />
              )}
              {tab === "trail" && <Trail events={data.events} onSelect={select} onComment={data.canComment ? (text) => comment(text, null) : null} draft={prDraft} />}
              {open && !data.canReview && data.canWithdraw && (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(async () => (await api.withdrawPull(canonId, prNo), t("pr.withdrawn")))}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11"
                  >
                    <Undo2 size={14} /> {t("pr.withdraw")}
                  </button>
                  <p className="mt-1 text-xs text-slate-500">{t("c2c.waiting")}</p>
                </div>
              )}
            </div>
            {decision && (
              <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:sticky lg:top-0 lg:z-auto lg:self-start lg:rounded-xl lg:border lg:p-4 lg:shadow-none">
                <h2 className="mb-2 hidden text-sm font-semibold lg:block">{t("rv.decision")}</h2>
                {decision}
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
