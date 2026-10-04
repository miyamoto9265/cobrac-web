import { ArrowLeft, Layers, LogOut, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CanonDetailResponse, CanonPullRequestRecord, CanonRevisionSummary, CanonSnapshot, ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { SendCanonPr } from "../components/SendCanonPr";
import { StatusBadge } from "../components/StatusBadge";
import { VisibilityToggle } from "../components/VisibilityToggle";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate } from "../lib/format";
import { notifyProjectsChanged } from "../lib/projectList";
import { PolicyLabel, canonPullPath, inputCls, primaryBtn } from "./CanonsPage";
import { publicCanonPath } from "./ExplorePage";
import { workspacePath } from "./ProjectWorkspacePage";

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
    </section>
  );
}

function MembersCard({ detail, projects, onChanged }: { detail: CanonDetailResponse; projects: ProjectRecord[]; onChanged: () => void }) {
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
              <div className="text-[11px] text-slate-400">{fmtDate(m.joinedAt, locale)}</div>
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
function MembersList({ detail }: { detail: CanonDetailResponse }) {
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
          </li>
        ))}
      </ul>
    </section>
  );
}

function PullsCard({ canonId, pulls }: { canonId: string; pulls: CanonPullRequestRecord[] }) {
  const t = useT();
  const { locale } = useI18n();
  const shown = pulls.filter((p) => p.state !== "superseded");
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold">
        {t("pr.list")} <span className="font-normal text-slate-400">({pulls.filter((p) => p.state === "open").length})</span>
      </h2>
      {shown.length === 0 && <div className="text-sm text-slate-400">{t("pr.none")}</div>}
      <ul className="divide-y divide-slate-100" data-testid="canon-pulls">
        {shown.map((p) => (
          <li key={p.prNo} className="py-2">
            <Link to={canonPullPath(canonId, p.prNo)} className="flex flex-wrap items-center gap-x-2 text-sm hover:underline">
              <span className="font-mono text-slate-500">#{p.prNo}</span>
              <span className="min-w-0 break-words font-medium text-blue-700">{p.sourceName}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${p.state === "open" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>{t(`pr.state.${p.state}` as MessageKey)}</span>
              {p.state === "open" && p.reviewState === "changes_requested" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{t("rv.changesRequested")}</span>}
            </Link>
            <div className="text-[11px] text-slate-500">
              {t("pr.added", { n: p.summary.added })} · {t("pr.changed", { n: p.summary.changed })} · {t("pr.errors", { n: p.summary.errors })} · {t("pr.warnings", { n: p.summary.warnings })} · {fmtDate(p.createdAt, locale)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContentsCard({ snapshot, revisions }: { snapshot: CanonSnapshot | null; revisions: CanonRevisionSummary[] }) {
  const t = useT();
  const { locale } = useI18n();
  if (!snapshot || snapshot.revision === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-2 text-sm font-semibold">{t("canon.contents")}</h2>
        <p className="flex items-center gap-1 text-sm text-slate-500">
          {t("canon.contentsEmpty")} <HelpTip text={t("canon.contentsEmptyHelp")} />
        </p>
      </section>
    );
  }
  const circuits = [...snapshot.circuits].sort((a, b) => a.key.localeCompare(b.key));
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-1 text-sm font-semibold">
        {t("canon.contents")} <span className="font-mono font-normal text-slate-400">{t("canon.revision", { n: snapshot.revision })}</span>
      </h2>
      <div className="mb-2 text-xs text-slate-500">{t("canon.counts", { c: snapshot.circuits.length, x: snapshot.connections.length, r: snapshot.references.length, p: snapshot.roles.length })}</div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs" data-testid="canon-circuits">
          <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1">Circuit ID</th>
              <th className="px-2 py-1">Uniform</th>
              <th className="px-2 py-1">Sub-Circuits</th>
              <th className="px-2 py-1">{t("canon.sources")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {circuits.map((c) => (
              <tr key={c.key} className={c.state !== "valid" ? "bg-amber-50" : ""}>
                <td className="whitespace-nowrap px-2 py-1 font-mono" title={c.descriptor}>
                  {c.circuitId}
                </td>
                <td className="px-2 py-1">{c.status === "uniform" ? "TRUE" : "FALSE"}</td>
                <td className="px-2 py-1 font-mono text-[11px] text-slate-500">{c.subCircuits.map((k) => snapshot.circuits.find((x) => x.key === k)?.circuitId ?? k).join(", ")}</td>
                <td className="px-2 py-1 font-mono text-[11px] text-slate-500">{c.sources.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshot.connections.some((c) => c.state === "flagged") && <div className="mt-2 text-xs text-amber-700">{t("canon.flaggedConnections", { n: snapshot.connections.filter((c) => c.state === "flagged").length })}</div>}
      <h3 className="mb-1 mt-3 text-xs font-semibold text-slate-600">{t("canon.history")}</h3>
      <ul className="text-[11px] text-slate-500">
        {revisions.map((r) => (
          <li key={r.revision}>
            <span className="font-mono">{t("canon.revision", { n: r.revision })}</span> · #{r.prNo} {r.source} · {fmtDate(r.createdAt, locale)}
            {r.approvedByName && <span className="text-emerald-700"> · {t("ed.approvedBy", { name: r.approvedByName })}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CanonDetailPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { canonId = "" } = useParams();
  const [detail, setDetail] = useState<CanonDetailResponse | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pulls, setPulls] = useState<CanonPullRequestRecord[]>([]);
  const [snapshot, setSnapshot] = useState<CanonSnapshot | null>(null);
  const [revisions, setRevisions] = useState<CanonRevisionSummary[]>([]);

  const reload = useCallback(() => {
    api
      .getCanon(canonId)
      .then((d) => {
        setDetail(d);
        if (d.canon.headRevision > 0) api.canonRevision(canonId, d.canon.headRevision).then(setSnapshot).catch(() => undefined);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api.canonPulls(canonId).then((r) => setPulls(r.items)).catch(() => undefined);
    api.canonRevisions(canonId).then((r) => setRevisions(r.items)).catch(() => undefined);
    api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined);
  }, [canonId]);
  useEffect(reload, [reload]);

  const remove = async () => {
    if (!detail || !window.confirm(t("canon.deleteConfirm"))) return;
    try {
      await api.deleteCanon(detail.canon.canonId);
      notifyProjectsChanged();
      navigate("/canons");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const c = detail?.canon;
  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Link to="/canons" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:min-h-11">
        <ArrowLeft size={12} /> {t("canon.back")}
      </Link>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {!c && !err && <div className="text-sm text-slate-400">{t("loading")}</div>}
      {c && detail && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="flex min-w-0 items-center gap-2 break-words text-xl font-semibold">
              <Layers size={20} className="shrink-0" /> {c.name}
            </h1>
            <span className="font-mono text-xs text-slate-400">{c.canonId}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{t("canon.revision", { n: c.headRevision })}</span>
            <HelpLink section="canon" />
            {detail.role !== "owner" && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700" data-testid="canon-role">
                {detail.role === "editor" ? t("ed.youAreEditor", { name: detail.ownerName }) : t("ed.roleAdmin")}
              </span>
            )}
            {detail.role === "owner" && (
            <VisibilityToggle
              visibility={c.visibility}
              confirmText={t("vis.confirmCanon")}
              onChange={async (v) => {
                await api.setCanonVisibility(c.canonId, { visibility: v });
                reload();
              }}
            />
            )}
            {detail.role === "owner" && c.visibility === "public" && (
              <>
                <Link to={publicCanonPath(c.canonId)} className="inline-flex items-center text-xs text-emerald-700 hover:underline coarse:min-h-11">
                  {t("vis.publicPage")}
                </Link>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 coarse:min-h-11">
                  <input
                    type="checkbox"
                    checked={c.acceptPullRequests !== false}
                    onChange={(e) => void api.setCanonVisibility(c.canonId, { acceptPullRequests: e.target.checked }).then(reload)}
                  />
                  {t("canon.acceptPrLabel")}
                </label>
              </>
            )}
            {detail.role === "owner" && (
            <button
              type="button"
              onClick={() => void remove()}
              className="ml-auto flex items-center gap-1 rounded-md border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 coarse:min-h-11"
            >
              <Trash2 size={12} /> {t("canon.delete")}
            </button>
            )}
          </div>
          {c.policy && <p className="mb-4 max-w-3xl whitespace-pre-line text-sm text-slate-700">{c.policy}</p>}
          <div className="grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
              {detail.role === "owner" ? <MembersCard detail={detail} projects={projects} onChanged={reload} /> : <MembersList detail={detail} />}
              <PullsCard canonId={c.canonId} pulls={pulls} />
              <ContentsCard snapshot={snapshot} revisions={revisions} />
              {detail.role === "owner" && <SendCanonPr canon={c} />}
              <div className="text-[11px] text-slate-400">
                {t("canon.created")} {fmtDate(c.createdAt, locale)} · {t("canon.updated")} {fmtDate(c.updatedAt, locale)}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
              <EditorsCard detail={detail} onChanged={reload} onLeft={() => navigate("/canons")} />
              {detail.role === "owner" && <SettingsCard key={c.updatedAt} detail={detail} onSaved={reload} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
