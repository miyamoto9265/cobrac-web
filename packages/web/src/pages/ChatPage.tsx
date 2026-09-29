import { BookOpenCheck, Loader2, Play, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MessageRecord, ProjectRecord, ReasoningEffort } from "@cobrac/shared";
import { AttachmentPicker, EMPTY_ATTACHMENTS, attachmentRequest, attachmentsBusy, type AttachmentState } from "../components/AttachmentPicker";
import { DEFAULT_CODEX_MODEL, formatUsd, researchModeEstimate } from "@cobrac/shared";
import { CanonChoice, canonChoiceReady, canonRequest, initialCanonChoice, type CanonChoiceState } from "../components/CanonChoice";
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
// New project: ROI / TLF and optional reference materials
// ---------------------------------------------------------------------------

function NewProject() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [roi, setRoi] = useState("");
  const [tlf, setTlf] = useState("");
  const [attachments, setAttachments] = useState<AttachmentState>(EMPTY_ATTACHMENTS);
  const [model, setModel] = useState<string | null>(me?.defaultModel ?? null);
  const [effort, setEffort] = useState<ReasoningEffort | null>(me?.defaultReasoningEffort ?? null);
  const [research, setResearch] = useState(true);
  const [canon, setCanon] = useState<CanonChoiceState>(() => initialCanonChoice(me?.defaultCanonId));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uploading = attachmentsBusy(attachments);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await api.createProject({ roi, tlf, ...attachmentRequest(attachments), model, reasoningEffort: effort, researchMode: research, locale, canon: canonRequest(canon) });
      navigate(`/projects/${encodeURIComponent(p.projectId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [needKeyBefore, needKeyAfter] = t("chat.needKey").split("{settings}");
  const [contribBefore, contribAfter] = t("chat.contributorLine", { name: me?.contributorName || me?.displayName || "—" }).split("{settings}");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
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
          <div className="mt-4">
            <AttachmentPicker value={attachments} onChange={setAttachments} disabled={busy} />
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
          <CanonChoice value={canon} onChange={setCanon} disabled={busy} />
          <ul className="mt-4 space-y-0.5 text-xs text-slate-500" data-testid="create-meta">
            <li>{t("chat.autoName")}</li>
            <li>
              {contribBefore}
              <Link to="/settings" className="underline hover:text-slate-700">
                {t("chat.settingsLink")}
              </Link>
              {contribAfter}
            </li>
          </ul>
          {err && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            {uploading && <span className="text-center text-xs text-slate-500 sm:text-right">{t("attach.wait")}</span>}
            <button
              onClick={() => void submit()}
              disabled={busy || uploading || (!roi.trim() && !tlf.trim()) || !me?.apiKeyRegistered || !canonChoiceReady(canon)}
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
