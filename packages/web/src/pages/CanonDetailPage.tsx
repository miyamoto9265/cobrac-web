import { ArrowLeft, Layers, Lock, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CanonConstraintMode, CanonDetailResponse, ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { StatusBadge } from "../components/StatusBadge";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { notifyProjectsChanged } from "../lib/projectList";
import { ConstraintModeSelect, inputCls, primaryBtn } from "./CanonsPage";
import { workspacePath } from "./ProjectWorkspacePage";

function SettingsCard({ detail, onSaved }: { detail: CanonDetailResponse; onSaved: () => void }) {
  const t = useT();
  const c = detail.canon;
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [policy, setPolicy] = useState(c.policy);
  const [mode, setMode] = useState<CanonConstraintMode>(c.constraintMode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = name !== c.name || description !== c.description || policy !== c.policy || mode !== c.constraintMode;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateCanon(c.canonId, { name, description, policy, constraintMode: mode });
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
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("canon.policy")}</span>
        <textarea value={policy} onChange={(e) => setPolicy(e.target.value)} rows={3} placeholder={t("canon.policyHint")} className={inputCls} maxLength={2000} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("canon.description")}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} maxLength={2000} />
      </label>
      <ConstraintModeSelect value={mode} onChange={setMode} />
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
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} min-w-0 sm:flex-1`} aria-label={t("canon.addProject")}>
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

export function CanonDetailPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { canonId = "" } = useParams();
  const [detail, setDetail] = useState<CanonDetailResponse | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.getCanon(canonId).then(setDetail).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
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
      <Link to="/canons" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:py-2">
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
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Lock size={12} /> {t("canon.private")}
            </span>
            <button
              type="button"
              onClick={() => void remove()}
              className="ml-auto flex items-center gap-1 rounded-md border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 coarse:min-h-11"
            >
              <Trash2 size={12} /> {t("canon.delete")}
            </button>
          </div>
          {c.policy && <p className="mb-4 max-w-3xl whitespace-pre-line text-sm text-slate-700">{c.policy}</p>}
          <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
            <div className="grid content-start gap-5">
              <MembersCard detail={detail} projects={projects} onChanged={reload} />
              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <h2 className="mb-2 text-sm font-semibold">{t("canon.contents")}</h2>
                <p className="text-sm text-slate-500">{t("canon.contentsEmpty")}</p>
                <div className="mt-2 text-[11px] text-slate-400">
                  {t("canon.created")} {fmtDate(c.createdAt, locale)} · {t("canon.updated")} {fmtDate(c.updatedAt, locale)}
                </div>
              </section>
            </div>
            <SettingsCard key={c.updatedAt} detail={detail} onSaved={reload} />
          </div>
        </>
      )}
    </div>
  );
}
