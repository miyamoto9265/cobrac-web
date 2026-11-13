import { Activity, AlertTriangle, CheckCheck, EyeOff, FolderOpen, GitPullRequest, History, Layers, LogOut, Network, Plus, Save, Settings, Table2, Trash2, UserPlus, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CanonDetailResponse, CanonPullRequestRecord, CanonRevisionSummary, CanonRole, CanonSnapshot, PlanSummary, ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { projectDisplayName, toCsv } from "@cobrac/shared";
import { CanonActivity, ISSUES_EMPHASIS, LIVE_PLAN, NO_FOCUS, type CanonFocus } from "../components/canon/CanonActivity";
import { CanonSwitcher } from "../components/canon/CanonSwitcher";
import { CanonIssuesView, issueTargetParam } from "../components/CanonIssues";
import { Section } from "../components/DetailPanel";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { PlanChip } from "../components/PlanChip";
import { SendCanonPr } from "../components/SendCanonPr";
import { StatusBadge } from "../components/StatusBadge";
import { VisibilityToggle } from "../components/VisibilityToggle";
import { ChatDock, ChatToggleButton, useChatDock, type DockLabels } from "../components/workspace/ChatDock";
import { SheetTable } from "../components/workspace/TablesView";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CANON_TABLES, canonHcdGraph, canonSheet, circuitsOfProject, hideProjects } from "../lib/canonGraph";
import { fmtDate } from "../lib/format";
import { bulkApprovable, newPlanPath } from "../lib/plan";
import { notifyProjectsChanged } from "../lib/projectList";
import { useGraphLayout } from "../lib/useGraphLayout";
import { CANON_VIEWS, PolicyLabel, canonPath, canonPullPath, inputCls, primaryBtn, type CanonView } from "./CanonsPage";
import { publicCanonPath } from "./ExplorePage";
import { HcdGraphView } from "./HcdGraphPage";
import { workspacePath } from "./ProjectWorkspacePage";

const VIEW_TABS: { view: CanonView; label: MessageKey; Icon: LucideIcon }[] = [
  { view: "hcd", label: "chat.hcd", Icon: Network },
  { view: "tables", label: "ws.tables", Icon: Table2 },
  { view: "issues", label: "iss.tab", Icon: AlertTriangle },
  { view: "history", label: "canon.history", Icon: History },
];
/** Views opened from the activity panel or the header (projects, pull requests, settings): a tab only while open. */
const EXTRA_TABS: { view: CanonView; label: MessageKey; Icon: LucideIcon }[] = [
  { view: "projects", label: "canon.members", Icon: FolderOpen },
  { view: "pulls", label: "pr.list", Icon: GitPullRequest },
  { view: "settings", label: "canon.settings", Icon: Settings },
];

function SettingsCard({ detail, onSaved }: { detail: CanonDetailResponse; onSaved: () => void }) {
  const t = useT();
  const c = detail.canon;
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [policy, setPolicy] = useState(c.policy);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = name !== c.name || description !== c.description || policy !== c.policy;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateCanon(c.canonId, { name, description, policy });
      setMsg({ ok: true, text: t("canon.saved") });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid content-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{t("canon.settings")}</h2>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("canon.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={200} />
      </label>
      <div>
        <PolicyLabel />
        <textarea value={policy} onChange={(e) => setPolicy(e.target.value)} rows={3} placeholder={t("canon.policyHint")} className={inputCls} maxLength={2000} aria-label={t("canon.policy")} />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("canon.description")}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} maxLength={2000} />
      </label>
      {msg && <div className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      <div>
        <button type="button" disabled={busy || !dirty || !name.trim()} onClick={() => void save()} className={primaryBtn}>
          <Save size={14} /> {t("save")}
        </button>
      </div>
      {c.visibility === "public" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600" data-testid="canon-public">
          <Link to={publicCanonPath(c.canonId)} className="text-emerald-700 hover:underline coarse:py-1.5">
            {t("vis.publicPage")}
          </Link>
          <label className="flex items-center gap-1.5 coarse:min-h-11">
            <input type="checkbox" checked={c.acceptPullRequests !== false} onChange={(e) => void api.setCanonVisibility(c.canonId, { acceptPullRequests: e.target.checked }).then(onSaved)} />
            {t("canon.acceptPrLabel")}
          </label>
        </div>
      )}
    </section>
  );
}

function MembersCard({ detail, projects, pushed, onChanged }: { detail: CanonDetailResponse; projects: ProjectRecord[]; pushed: Map<string, number>; onChanged: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const canonId = detail.canon.canonId;
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const candidates = useMemo(() => projects.filter((p) => !p.canonId), [projects]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      notifyProjectsChanged();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold">
        {t("canon.members")} <span className="font-normal text-slate-400">({detail.members.length})</span>
      </h2>
      <ul className="divide-y divide-slate-100" data-testid="canon-members">
        {detail.members.length === 0 && <li className="py-3 text-sm text-slate-400">{t("canon.noMembers")}</li>}
        {detail.members.map((m) => (
          <li key={m.projectId} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1">
              <Link to={workspacePath(m.projectId)} className="break-words text-sm font-medium text-blue-700 hover:underline">
                {m.name}
              </Link>
              <div className="font-mono text-[11px] text-slate-400">{m.projectId}</div>
              <div className="break-words text-xs text-slate-500">{[m.roi, m.tlf].filter((s) => s?.trim()).join(" · ")}</div>
              <div className="text-[11px] text-slate-400">
                {fmtDate(m.joinedAt, locale)}
                {pushed.get(m.projectId) ? ` · ${t("cv.pushedCircuits", { n: pushed.get(m.projectId)! })}` : ""}
              </div>
            </div>
            <StatusBadge status={m.status as ProjectStatus} compact />
            <button
              type="button"
              disabled={busy}
              title={t("canon.remove")}
              aria-label={`${t("canon.remove")}: ${m.name}`}
              onClick={() => window.confirm(t("canon.removeConfirm")) && void run(() => api.removeCanonMember(canonId, m.projectId))}
              className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 coarse:h-11 coarse:w-11"
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="mb-1 text-xs text-slate-500">{t("canon.addProject")}</div>
        {candidates.length === 0 ? (
          <div className="text-xs text-slate-400">{t("canon.noCandidates")}</div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} min-w-0 bg-white pr-8 sm:flex-1`} aria-label={t("canon.addProject")}>
              <option value="">{t("canon.selectProject")}</option>
              {candidates.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {projectDisplayName(p)} ({p.projectId})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !pick}
              onClick={() =>
                void run(async () => {
                  await api.addCanonMember(canonId, pick);
                  setPick("");
                })
              }
              className={primaryBtn}
            >
              <Plus size={14} /> {t("canon.add")}
            </button>
          </div>
        )}
        {err && <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      </div>
    </section>
  );
}

/** Co-editors review pull requests. The owner adds them by the e-mail address they signed up with. */
function EditorsCard({ detail, onChanged, onLeft }: { detail: CanonDetailResponse; onChanged: () => void; onLeft: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const canonId = detail.canon.canonId;
  const owner = detail.role === "owner";
  const { me } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string, after = onChanged) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      after();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="canon-editors">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
        {t("ed.title")} <span className="font-normal text-slate-400">({detail.editors.length})</span> <HelpTip text={t("ed.help")} />
      </h2>
      <ul className="divide-y divide-slate-100">
        <li className="flex items-center gap-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 break-words">{detail.ownerName || "—"}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t("ed.roleOwner")}</span>
        </li>
        {detail.editors.map((e) => (
          <li key={e.userId} className="flex items-center gap-2 py-1.5 text-sm" data-editor={e.userId}>
            <div className="min-w-0 flex-1">
              <div className="break-words">{e.name || "—"}</div>
              <div className="text-[11px] text-slate-400 [overflow-wrap:anywhere]">
                {e.email ? `${e.email} · ` : ""}
                {t("ed.added", { date: fmtDate(e.addedAt, locale) })}
              </div>
            </div>
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">{t("ed.roleEditor")}</span>
            {owner && (
              <button
                type="button"
                disabled={busy}
                aria-label={`${t("ed.remove")}: ${e.name}`}
                title={t("ed.remove")}
                onClick={() => window.confirm(t("ed.removeConfirm", { name: e.name })) && void run(() => api.removeCanonEditor(canonId, e.userId), t("ed.removed"))}
                className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 coarse:h-11 coarse:w-11"
              >
                <X size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {owner ? (
        <form
          className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row"
          onSubmit={(ev) => {
            ev.preventDefault();
            void run(async () => {
              await api.addCanonEditor(canonId, email.trim());
              setEmail("");
            }, t("ed.addedMsg"));
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder={t("ed.emailPh")}
            aria-label={t("ed.email")}
            className={`${inputCls} min-w-0 sm:flex-1`}
            data-testid="editor-email"
          />
          <button type="submit" disabled={busy || !email.trim()} className={primaryBtn} data-testid="editor-add">
            <UserPlus size={14} /> {t("ed.add")}
          </button>
        </form>
      ) : (
        detail.role === "editor" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(t("ed.leaveConfirm")) && void run(() => api.removeCanonEditor(canonId, me?.userId ?? ""), t("ed.left"), onLeft)}
            className="mt-3 flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 coarse:min-h-11"
          >
            <LogOut size={12} /> {t("ed.leave")}
          </button>
        )
      )}
      {msg && <div className={`mt-2 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
    </section>
  );
}

/** Member projects as a co-editor sees them (they belong to the owner, so no links or changes). */
function MembersList({ detail, pushed }: { detail: CanonDetailResponse; pushed: Map<string, number> }) {
  const t = useT();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold">
        {t("canon.members")} <span className="font-normal text-slate-400">({detail.members.length})</span>
      </h2>
      <ul className="divide-y divide-slate-100" data-testid="canon-members">
        {detail.members.length === 0 && <li className="py-3 text-sm text-slate-400">{t("canon.noMembers")}</li>}
        {detail.members.map((m) => (
          <li key={m.projectId} className="py-2">
            <div className="break-words text-sm font-medium">{m.name}</div>
            <div className="font-mono text-[11px] text-slate-400">{m.projectId}</div>
            <div className="break-words text-xs text-slate-500">{[m.roi, m.tlf].filter((s) => s?.trim()).join(" · ")}</div>
            {!!pushed.get(m.projectId) && <div className="text-[11px] text-slate-400">{t("cv.pushedCircuits", { n: pushed.get(m.projectId)! })}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PullsCard({ canonId, pulls, role, onChanged }: { canonId: string; pulls: CanonPullRequestRecord[]; role: CanonRole; onChanged: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const shown = pulls.filter((p) => p.state !== "superseded");
  // reviewers (owner, co-editors) approve; 「まとめて承認」 offers only conflict-free open pull requests
  const reviewer = role === "owner" || role === "editor";
  const approvable = reviewer ? shown.filter(bulkApprovable).map((p) => p.prNo) : [];
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // selected pull requests that can still be approved together, oldest first
  const selected = approvable.filter((n) => picked.includes(n)).sort((x, y) => x - y);
  const toggle = (n: number, on: boolean) => setPicked((s) => (on ? [...s.filter((x) => x !== n), n] : s.filter((x) => x !== n)));
  const approve = async () => {
    if (!selected.length || !window.confirm(t("pr.bulkApproveQ", { n: selected.length }))) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.approveManyPulls(canonId, selected);
      const parts = [t("pr.bulkApproved", { n: r.approved.length })];
      if (r.stopped) parts.push(t(`pr.bulkStopped.${r.stopped.reason}` as MessageKey, { no: r.stopped.prNo }));
      setMsg({ ok: !r.stopped, text: parts.join(" ") });
      setPicked([]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold">
        {t("pr.list")} <span className="font-normal text-slate-400">({pulls.filter((p) => p.state === "open").length})</span>
      </h2>
      {approvable.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2" data-testid="bulk-approve">
          <label className="flex items-center gap-2 text-xs text-slate-600 coarse:min-h-11">
            <input type="checkbox" checked={selected.length === approvable.length} onChange={(e) => setPicked(e.target.checked ? approvable : [])} data-testid="bulk-select-all" />
            {t("pr.selectAll")}
          </label>
          <button type="button" disabled={busy || !selected.length} onClick={() => void approve()} className={`${primaryBtn} ml-auto`} data-testid="bulk-approve-button">
            <CheckCheck size={14} aria-hidden /> {selected.length ? t("pr.bulkApproveCount", { n: selected.length }) : t("pr.bulkApprove")}
          </button>
          <HelpTip text={t("pr.bulkHelp")} />
        </div>
      )}
      {msg && (
        <div className={`mb-2 break-words rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`} role="status" data-testid="bulk-result">
          {msg.text}
        </div>
      )}
      {shown.length === 0 && <div className="text-sm text-slate-400">{t("pr.none")}</div>}
      <ul className="divide-y divide-slate-100" data-testid="canon-pulls">
        {shown.map((p) => (
          <li key={p.prNo} className="flex items-start gap-2 py-2" data-pr={p.prNo}>
            {approvable.includes(p.prNo) && (
              <label className="-ml-1 flex shrink-0 items-center justify-center p-1 coarse:min-h-11 coarse:min-w-11">
                <input type="checkbox" checked={picked.includes(p.prNo)} onChange={(e) => toggle(p.prNo, e.target.checked)} aria-label={t("pr.select", { n: p.prNo })} data-testid="bulk-pick" />
              </label>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link to={canonPullPath(canonId, p.prNo)} className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm hover:underline">
                  <span className="font-mono text-slate-500">#{p.prNo}</span>
                  <span className="min-w-0 break-words font-medium text-blue-700">{p.sourceName}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${p.state === "open" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>{t(`pr.state.${p.state}` as MessageKey)}</span>
                  {p.state === "open" && p.reviewState === "changes_requested" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{t("rv.changesRequested")}</span>}
                </Link>
                {p.planId && <PlanChip planId={p.planId} link={role === "owner"} />}
              </div>
              <div className="text-[11px] text-slate-500">
                {t("pr.added", { n: p.summary.added })} · {t("pr.changed", { n: p.summary.changed })} · {t("pr.errors", { n: p.summary.errors })} · {t("pr.warnings", { n: p.summary.warnings })} · {fmtDate(p.createdAt, locale)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}


/** Approved revisions, newest first, with the pull request that made each and who approved it. */
function HistoryView({ canonId, revisions }: { canonId: string; revisions: CanonRevisionSummary[] }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold">{t("canon.history")}</h2>
      {revisions.length === 0 && <div className="text-sm text-slate-400">{t("cv.historyEmpty")}</div>}
      <ol className="divide-y divide-slate-100" data-testid="canon-history">
        {revisions.map((r) => (
          <li key={r.revision} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{t("canon.revision", { n: r.revision })}</span>
            {r.issueId && r.issueAction ? (
              <Link to={canonPath(canonId, "issues")} className="min-w-0 break-words text-amber-800 hover:underline">
                {t(`iss.history.${r.issueAction}` as MessageKey, { id: r.issueId })}
                {r.actorName && <span className="text-slate-500"> · {r.actorName}</span>}
              </Link>
            ) : r.prNo ? (
              <Link to={canonPullPath(canonId, r.prNo)} className="min-w-0 break-words text-blue-700 hover:underline">
                <span className="font-mono text-slate-500">#{r.prNo}</span> {r.source}
              </Link>
            ) : (
              r.source && <span className="min-w-0 break-words text-slate-600">{r.source}</span>
            )}
            {r.circuitCount !== undefined && <span className="text-xs text-slate-500">{t("cv.revCounts", { c: r.circuitCount, x: r.connectionCount ?? 0 })}</span>}
            <span className="ml-auto text-[11px] text-slate-400">
              {fmtDate(r.createdAt, locale)}
              {r.approvedByName && <span className="text-emerald-700"> · {t("ed.approvedBy", { name: r.approvedByName })}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Circuits, connections and references of the head revision as sortable tables (CSV download in the browser). */
function CanonTablesView({ snapshot }: { snapshot: CanonSnapshot }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const table = CANON_TABLES.find((x) => x === params.get("table")) ?? "circuits";
  const sheet = useMemo(() => canonSheet(snapshot, table), [snapshot, table]);
  const download = () => {
    const url = URL.createObjectURL(new Blob(["﻿", toCsv([sheet.columns, ...sheet.rows])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${snapshot.canonId}_rev${snapshot.revision}_${sheet.name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 sm:flex-wrap sm:px-4" aria-label={t("table.source")}>
        {CANON_TABLES.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setParams((p) => new URLSearchParams({ ...Object.fromEntries(p), table: x }), { replace: true })}
            aria-pressed={x === table}
            data-testid={`canon-table-${x}`}
            className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-1 font-mono text-xs coarse:min-h-11 ${
              x === table ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {canonSheet(snapshot, x).name} <span className="text-slate-400">({x === "circuits" ? snapshot.circuits.length + snapshot.groups.length : x === "connections" ? snapshot.connections.length : snapshot.references.length})</span>
          </button>
        ))}
      </div>
      <SheetTable key={table} sheet={sheet} onDownload={download} />
    </div>
  );
}

/** Value of the highlight menu while several projects are highlighted from the activity panel. */
const MULTIPLE = "__multiple";

/**
 * The Canon's graph: its shared layer drawn like a project's HCD. Member projects' circuits (or those with problems) can be
 * highlighted, several at once, and what only some projects brought can be hidden.
 */
function CanonGraphView({ detail, snapshot, focus, onFocus }: { detail: CanonDetailResponse; snapshot: CanonSnapshot; focus: CanonFocus; onFocus: (focus: CanonFocus) => void }) {
  const t = useT();
  const canonId = detail.canon.canonId;
  const full = useMemo(() => canonHcdGraph(snapshot), [snapshot]);
  const hiddenKey = focus.hidden.join("|");
  const graph = useMemo(() => hideProjects(full, snapshot, new Set(hiddenKey ? hiddenKey.split("|") : [])), [full, snapshot, hiddenKey]);
  const layout = useGraphLayout(canonId, "hcd", { canon: true });
  // "problems": the circuits an open problem reaches; otherwise one member project's circuits
  const flaggedIds = useMemo(() => new Set(snapshot.circuits.filter((c) => c.issueIds?.length).map((c) => c.circuitId)), [snapshot]);
  const highlightKey = focus.highlight.join("|");
  const emphasised = useMemo(() => {
    const on = highlightKey ? highlightKey.split("|") : [];
    if (!on.length) return null;
    return new Set(on.flatMap((id) => [...(id === ISSUES_EMPHASIS ? flaggedIds : circuitsOfProject(snapshot, id))]));
  }, [snapshot, highlightKey, flaggedIds]);
  const emphasis = focus.highlight.length > 1 ? MULTIPLE : (focus.highlight[0] ?? "");
  const sourcesOf = useMemo(() => new Map(snapshot.circuits.map((c) => [c.circuitId, c] as const)), [snapshot]);
  const names = useMemo(() => new Map(detail.members.map((m) => [m.projectId, m.name] as const)), [detail.members]);
  // projects that pushed something, members first (a project that left the Canon keeps its entries)
  const pushers = useMemo(() => {
    const ids = new Set(snapshot.circuits.flatMap((c) => c.sources));
    return [...detail.members.filter((m) => ids.has(m.projectId)).map((m) => m.projectId), ...[...ids].filter((id) => !names.has(id)).sort()];
  }, [snapshot, detail.members, names]);
  const owner = detail.role === "owner";
  const reviewer = owner || detail.role === "editor";
  const issueOf = useMemo(() => new Map((snapshot.issues ?? []).map((i) => [i.id, i] as const)), [snapshot]);
  return (
    <HcdGraphView
      graph={graph}
      frg={null}
      layout={layout}
      exportName={`${canonId}_rev${snapshot.revision}_HCD`}
      frgBase={null}
      emphasis={emphasised}
      headerExtra={
        <>
          {focus.hidden.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" data-testid="canon-hidden">
              <EyeOff size={12} aria-hidden /> {t("cv.hiddenCount", { n: focus.hidden.length })}
              <button type="button" onClick={() => onFocus({ ...focus, hidden: [] })} className="text-blue-700 hover:underline coarse:min-h-11">
                {t("cv.reset")}
              </button>
            </span>
          )}
          {(pushers.length > 1 || flaggedIds.size > 0) && (
            <select
              value={emphasis}
              onChange={(e) => onFocus({ highlight: e.target.value ? [e.target.value] : [], hidden: focus.hidden.filter((x) => x !== e.target.value) })}
              aria-label={t("cv.emphasis")}
              title={t("cv.emphasis")}
              data-testid="canon-emphasis"
              className={`${focus.hidden.length ? "" : "ml-auto"} w-32 shrink-0 truncate rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs sm:w-auto sm:max-w-xs coarse:min-h-11`}
            >
              <option value="">{t("cv.emphasisAll")}</option>
              {emphasis === MULTIPLE && (
                <option value={MULTIPLE} disabled>
                  {t("cv.multiple", { n: focus.highlight.length })}
                </option>
              )}
              {flaggedIds.size > 0 && <option value={ISSUES_EMPHASIS}>{`${t("iss.tab")} (${flaggedIds.size})`}</option>}
              {(pushers.length > 1 ? pushers : []).map((id) => (
                <option key={id} value={id}>
                  {names.get(id) ?? id}
                </option>
              ))}
            </select>
          )}
        </>
      }
      nodeExtra={(node) => {
        const c = sourcesOf.get(node.id);
        if (!c) return null;
        return (
          <>
            {c.state === "flagged" && (
              <div className="mb-3 grid gap-1 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800" data-testid="node-issues">
                {c.issueIds?.length ? (
                  c.issueIds.map((id) => (
                    <Link key={id} to={canonPath(canonId, "issues")} className="whitespace-pre-line break-words hover:underline">
                      {t("iss.node", { id, reason: issueOf.get(id)?.reason ?? "" })}
                    </Link>
                  ))
                ) : (
                  <span>{t("cv.flagged")}</span>
                )}
              </div>
            )}
            {reviewer && c.state !== "invalidated" && (
              <Link to={`${canonPath(canonId, "issues")}?${issueTargetParam("circuit", c.key)}`} className="mb-3 inline-flex items-center gap-1 text-xs text-amber-800 hover:underline coarse:min-h-11" data-testid="node-report">
                <AlertTriangle size={12} /> {t("iss.report")}
              </Link>
            )}
            <Section title={t("canon.sources")} />
            <ul className="mb-3 flex flex-col gap-1">
              {c.sources.map((id) => (
                <li key={id} className="min-w-0 text-xs">
                  {owner && names.has(id) ? (
                    <Link to={workspacePath(id, "hcd")} className="break-words text-blue-700 hover:underline">
                      {names.get(id)}
                    </Link>
                  ) : (
                    <span className="break-words">{names.get(id) ?? id}</span>
                  )}{" "}
                  <span className="font-mono text-[11px] text-slate-400">{id}</span>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    />
  );
}

function CanonEmpty({ canonId, owner, onAddProjects }: { canonId: string; owner: boolean; onAddProjects: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center" data-testid="canon-empty">
      <Layers size={36} className="text-slate-300" />
      <h2 className="text-base font-semibold text-slate-700">{t("cv.emptyTitle")}</h2>
      <p className="max-w-md text-sm text-slate-500">{t("cv.emptyHelp")}</p>
      {owner && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => navigate(newPlanPath(canonId))} className={primaryBtn}>
            <Plus size={14} aria-hidden /> {t("plan.new")}
          </button>
          <button type="button" onClick={onAddProjects} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 coarse:min-h-11">
            <FolderOpen size={15} aria-hidden /> {t("cv.toProjects")}
          </button>
        </div>
      )}
    </div>
  );
}

/** A tab whose content is cards (projects, pull requests, history, settings). */
function CardPane({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
      <div className="mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">{children}</div>
    </div>
  );
}

/** Canon page, laid out like the project workspace: a header, view tabs and the view below. `/canons/:canonId/:view?` */
export function CanonDetailPage() {
  const { canonId = "" } = useParams();
  return <CanonWorkspace key={canonId} canonId={canonId} />;
}

/** The activity panel's words in the shared side-panel frame (the project's agent panel). */
function useActivityLabels(): DockLabels {
  const t = useT();
  return { title: t("cv.activity"), open: t("cv.openActivity"), close: t("cv.closeActivity"), resize: t("cv.resizeActivity"), Icon: Activity, attention: t("cv.openPulls"), prefix: "cobrac-canon-activity" };
}

function CanonWorkspace({ canonId }: { canonId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { view: rawView } = useParams();
  const { search } = useLocation();
  const [detail, setDetail] = useState<CanonDetailResponse | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pulls, setPulls] = useState<CanonPullRequestRecord[]>([]);
  const [snapshot, setSnapshot] = useState<CanonSnapshot | null>(null);
  const [revisions, setRevisions] = useState<CanonRevisionSummary[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [focus, setFocus] = useState<CanonFocus>(NO_FOCUS);
  const dock = useChatDock("cobrac-canon-activity");
  const labels = useActivityLabels();

  const reload = useCallback(() => {
    api
      .getCanon(canonId)
      .then((d) => {
        setDetail(d);
        if (d.canon.headRevision > 0)
          api
            .canonRevision(canonId, d.canon.headRevision)
            .then((s) => setSnapshot((prev) => (prev?.revision === s.revision ? prev : s)))
            .catch(() => undefined);
        else setSnapshot(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api.canonPulls(canonId).then((r) => setPulls(r.items)).catch(() => undefined);
    api.canonRevisions(canonId).then((r) => setRevisions(r.items)).catch(() => undefined);
    api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined);
    api
      .listPlans()
      .then((r) => setPlans(r.items.filter((p) => p.canonId === canonId)))
      .catch(() => undefined);
  }, [canonId]);
  useEffect(reload, [reload]);

  // while a mission builds this Canon, its progress, pull requests and new revisions are read again every 15 s
  const live = plans.some((p) => LIVE_PLAN.has(p.status));
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => document.visibilityState !== "hidden" && reload(), 15_000);
    return () => clearInterval(id);
  }, [live, reload]);

  // circuits each project has in the head revision
  const pushed = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of snapshot?.circuits ?? []) if (x.state !== "invalidated") for (const id of x.sources) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [snapshot]);
  const c = detail?.canon;
  const hasContent = !!c && c.headRevision > 0;
  const view = CANON_VIEWS.find((v) => v === rawView) ?? null;
  useEffect(() => {
    if (!rawView && c) navigate(`${canonPath(canonId, "hcd")}${search}`, { replace: true });
  }, [rawView, c, canonId, search, navigate]);

  // On narrow screens the tab strip scrolls; keep the open tab in sight.
  const tabsRef = useRef<HTMLElement>(null);
  const loaded = detail !== null;
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [view, loaded]);

  if (rawView && !view) return <Navigate to={canonPath(canonId)} replace />;
  if (err && !detail) return <div className="p-6 text-sm text-rose-600">{err}</div>;
  if (!c || !detail) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;

  const owner = detail.role === "owner";
  const openPulls = pulls.filter((p) => p.state === "open").length;
  const remove = async () => {
    if (!window.confirm(t("canon.deleteConfirm"))) return;
    try {
      await api.deleteCanon(c.canonId);
      notifyProjectsChanged();
      navigate("/canons");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const ready = (v: CanonView) => (v === "hcd" || v === "tables" || v === "issues" ? hasContent : true);
  const openIssues = (snapshot?.issues ?? []).filter((i) => !i.resolution).length;
  // choosing a project or the problems in the activity panel shows them on the graph
  const changeFocus = (f: CanonFocus) => {
    setFocus(f);
    if (view !== "hcd") navigate(canonPath(canonId, "hcd"));
  };
  const about = [
    `ID: ${c.canonId}`,
    c.policy && `${t("canon.policy")}: ${c.policy}`,
    c.description,
    snapshot ? t("canon.counts", { c: snapshot.circuits.length, x: snapshot.connections.length, r: snapshot.references.length, p: detail.members.length }) : t("canon.memberCount", { n: detail.members.length }),
    `${t("canon.created")} ${fmtDate(c.createdAt, locale)} · ${t("canon.updated")} ${fmtDate(c.updatedAt, locale)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const tabs = [...VIEW_TABS, ...EXTRA_TABS.filter((x) => x.view === view)];

  const center = (() => {
    switch (view) {
      case null:
        return null;
      case "issues":
        if (!hasContent) return <CanonEmpty canonId={canonId} owner={owner} onAddProjects={() => navigate(canonPath(canonId, "projects"))} />;
        if (!snapshot) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;
        return (
          <CardPane>
            <CanonIssuesView detail={detail} snapshot={snapshot} onChanged={reload} />
          </CardPane>
        );
      case "hcd":
      case "tables":
        if (!hasContent) return <CanonEmpty canonId={canonId} owner={owner} onAddProjects={() => navigate(canonPath(canonId, "projects"))} />;
        if (!snapshot) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;
        return view === "hcd" ? <CanonGraphView detail={detail} snapshot={snapshot} focus={focus} onFocus={setFocus} /> : <CanonTablesView snapshot={snapshot} />;
      case "projects":
        return <CardPane>{owner ? <MembersCard detail={detail} projects={projects} pushed={pushed} onChanged={reload} /> : <MembersList detail={detail} pushed={pushed} />}</CardPane>;
      case "pulls":
        return (
          <CardPane>
            <PullsCard canonId={c.canonId} pulls={pulls} role={detail.role} onChanged={reload} />
            {owner && <SendCanonPr canon={c} />}
          </CardPane>
        );
      case "history":
        return (
          <CardPane>
            <HistoryView canonId={c.canonId} revisions={revisions} />
          </CardPane>
        );
      case "settings":
        return (
          <CardPane>
            {owner && <SettingsCard key={c.updatedAt} detail={detail} onSaved={reload} />}
            <EditorsCard detail={detail} onChanged={reload} onLeft={() => navigate("/canons")} />
          </CardPane>
        );
    }
  })();

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <h1 className="flex min-w-0 items-center">
              <CanonSwitcher canon={c} />
            </h1>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600" data-testid="canon-head">
              {t("canon.revision", { n: c.headRevision })}
            </span>
            <HelpTip text={about} label={t("cv.about")} />
            {!owner && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700" data-testid="canon-role">
                {detail.role === "editor" ? t("ed.youAreEditor", { name: detail.ownerName }) : t("ed.roleAdmin")}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              <HelpLink section="canon" />
              {owner && (
                <VisibilityToggle
                  visibility={c.visibility}
                  confirmText={t("vis.confirmCanon")}
                  onChange={async (v) => {
                    await api.setCanonVisibility(c.canonId, { visibility: v });
                    reload();
                  }}
                />
              )}
              <Link
                to={canonPath(canonId, "settings")}
                title={t("canon.settings")}
                aria-label={t("canon.settings")}
                aria-current={view === "settings" ? "page" : undefined}
                data-testid="canon-settings"
                className={`flex items-center justify-center rounded p-1.5 hover:bg-slate-100 hover:text-slate-700 coarse:h-11 coarse:w-11 ${view === "settings" ? "bg-slate-100 text-slate-700" : "text-slate-400"}`}
              >
                <Settings size={15} />
              </Link>
              {owner && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  title={t("canon.delete")}
                  aria-label={t("canon.delete")}
                  className="flex items-center justify-center rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 coarse:h-11 coarse:w-11"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          {err && <div className="mt-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{err}</div>}
        </header>

        <div className="flex shrink-0 items-end gap-2 border-b border-slate-200 bg-slate-50 pr-2 sm:pr-3">
          <nav ref={tabsRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 pt-1.5 sm:px-3" aria-label={t("cv.views")}>
            {tabs.map(({ view: v, label, Icon }) => {
              const on = v === view;
              const count = v === "pulls" ? openPulls : v === "projects" ? detail.members.length : v === "issues" ? openIssues : 0;
              return (
                <Link
                  key={v}
                  to={canonPath(canonId, v)}
                  data-testid={`canon-tab-${v}`}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border px-3 py-1.5 text-xs font-medium coarse:min-h-11 ${
                    on ? "border-slate-200 border-b-white bg-white text-slate-900" : `border-transparent hover:bg-white/70 ${ready(v) ? "text-slate-600" : "text-slate-400"}`
                  }`}
                >
                  <Icon size={14} className={on ? "text-blue-600" : undefined} /> {t(label)}
                  {count > 0 && <span className={`rounded-full px-1.5 text-[10px] ${v === "pulls" ? "bg-violet-100 text-violet-800" : v === "issues" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"}`}>{count}</span>}
                </Link>
              );
            })}
          </nav>
          <ChatToggleButton state={dock} attention={openPulls > 0} labels={labels} count={openPulls + openIssues} />
        </div>

        <section className="relative min-h-0 flex-1 overflow-hidden bg-slate-50">{center}</section>
      </div>

      <ChatDock state={dock} attention={openPulls > 0} working={live} labels={labels}>
        <CanonActivity detail={detail} snapshot={snapshot} pulls={pulls} plans={plans} focus={focus} onFocus={changeFocus} onChanged={reload} />
      </ChatDock>
    </div>
  );
}
