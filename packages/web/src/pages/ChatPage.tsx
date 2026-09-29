import { BookOpenCheck, Loader2, Play, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MessageRecord, ProjectRecord, ReasoningEffort } from "@cobrac/shared";
import { DEFAULT_CODEX_MODEL, formatUsd, projectDisplayName, projectNameKey, researchModeEstimate } from "@cobrac/shared";
import { ChatTimeline } from "../components/ChatTimeline";
import { ModelSelect } from "../components/ModelSelect";
import { QuestionCard } from "../components/QuestionCard";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isActive } from "../lib/format";

export function ChatPage() {
  return <NewProject />;
}

// ---------------------------------------------------------------------------
// New project: two inputs (ROI / TLF)
// ---------------------------------------------------------------------------

function NewProject() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [roi, setRoi] = useState("");
  const [tlf, setTlf] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [contributor, setContributor] = useState(me?.contributorName ?? "");
  const [model, setModel] = useState<string | null>(me?.defaultModel ?? null);
  const [effort, setEffort] = useState<ReasoningEffort | null>(me?.defaultReasoningEffort ?? null);
  const [research, setResearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (nameTouched) return;
    const id = setTimeout(() => {
      if (!roi && !tlf) return setName("");
      api.proposeName(roi, tlf).then((r) => setName(r.name)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(id);
  }, [roi, tlf, nameTouched]);

  useEffect(() => {
    api
      .listProjects()
      .then((r) => setExistingNames(new Set(r.items.map((p) => projectNameKey(projectDisplayName(p))))))
      .catch(() => undefined);
  }, []);
  const duplicateName = name.trim() && existingNames.has(projectNameKey(name)) ? name.trim() : null;

  useEffect(() => {
    if (me && !contributor) setContributor(me.contributorName);
  }, [me, contributor]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await api.createProject({ roi, tlf, name: (nameTouched && name.trim()) || undefined, contributor: contributor || undefined, model, reasoningEffort: effort, researchMode: research, locale });
      navigate(`/projects/${encodeURIComponent(p.projectId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [needKeyBefore, needKeyAfter] = t("chat.needKey").split("{settings}");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t("chat.newTitle")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("chat.newHelp")}</p>
        </div>
        {!me?.apiKeyRegistered && (
          <div className="mb-4 w-full max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {needKeyBefore}
            <Link to="/settings" className="underline">
              {t("chat.settingsLink")}
            </Link>
            {needKeyAfter}
          </div>
        )}
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.roi")}</span>
              <textarea
                value={roi}
                onChange={(e) => setRoi(e.target.value)}
                rows={3}
                placeholder={t("chat.roiPh")}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.tlf")}</span>
              <textarea
                value={tlf}
                onChange={(e) => setTlf(e.target.value)}
                rows={3}
                placeholder={t("chat.tlfPh")}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.name")}</span>
              <input
                value={name}
                maxLength={400}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                placeholder="VOR learning in cerebellar flocculus"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="mt-1 block text-xs text-slate-400">{t("chat.nameHelp")}</span>
              {duplicateName && <span className="mt-1 block text-xs text-amber-700">{t("chat.nameDup", { name: duplicateName })}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.contributor")}</span>
              <input value={contributor} onChange={(e) => setContributor(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
          </div>
          <div className="mt-4">
            <ModelSelect
              model={model}
              effort={effort}
              onChange={(v) => {
                setModel(v.model);
                setEffort(v.effort);
              }}
              defaultLabel={t("model.default")}
            />
          </div>
          <ResearchToggle on={research} onChange={setResearch} model={model || me?.defaultModel || DEFAULT_CODEX_MODEL} />
          {err && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={busy || (!roi.trim() && !tlf.trim()) || !me?.apiKeyRegistered}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto coarse:py-3"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {t("chat.run")}
            </button>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-center text-xs text-slate-400">{t("chat.runHelp")}</p>
      </div>
    </div>
  );
}

function ResearchToggle({ on, onChange, model }: { on: boolean; onChange: (v: boolean) => void; model: string }) {
  const { t } = useI18n();
  const est = researchModeEstimate(model);
  const vars = { min: est.minutes[0], max: est.minutes[1], model };
  return (
    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5" data-testid="research-toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
      <span className="min-w-0 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-800">
          <BookOpenCheck size={15} className="text-blue-600" aria-hidden /> {t("chat.research")}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{on ? t("chat.researchHelp") : t("chat.researchOff")}</span>
        {on && (
          <span className="mt-1 block text-xs text-amber-700" data-testid="research-estimate">
            {est.costUsd
              ? t("chat.researchEstimate", { ...vars, cost: `${formatUsd(est.costUsd[0])}–${formatUsd(est.costUsd[1])}` })
              : t("chat.researchEstimateNoPrice", vars)}
          </span>
        )}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Existing project: chat panel (the workspace page owns project state and actions)
// ---------------------------------------------------------------------------

export function ProjectChatPanel({
  projectId,
  project,
  messages,
  busy,
  err,
  act,
}: {
  projectId: string;
  project: ProjectRecord;
  messages: MessageRecord[];
  busy: boolean;
  err: string | null;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [followup, setFollowup] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (autoScroll && el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, project.status, autoScroll]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const active = isActive(project.status);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* messages */}
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        <ChatTimeline messages={messages} working={active && project.status !== "WAITING_USER_INPUT"} />
      </div>

      {/* footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {err && <div className="mb-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{err}</div>}
        {project.status === "WAITING_USER_INPUT" && project.pendingQuestion ? (
          <QuestionCard question={project.pendingQuestion} busy={busy} onAnswer={(a) => act(() => api.answer(projectId, a, locale))} />
        ) : project.status === "COMPLETED" ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!followup.trim()) return;
              const text = followup.trim();
              setFollowup("");
              void act(() => api.followup(projectId, text, locale));
            }}
          >
            <textarea
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              rows={2}
              placeholder={t("chat.followupPh")}
              className="flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button type="submit" disabled={busy || !followup.trim()} className="flex items-center gap-1 self-end rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11">
              <Send size={14} /> {t("send")}
            </button>
          </form>
        ) : (
          <div className="text-center text-xs text-slate-400">{active ? t("chat.noFollowupActive") : t("chat.noFollowupIdle")}</div>
        )}
      </footer>
    </div>
  );
}
