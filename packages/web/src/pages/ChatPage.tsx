import { ArrowUp, Loader2, Paperclip, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_CODEX_MODEL } from "@cobrac/shared";
import { AttachMenu, AttachmentChips, EMPTY_ATTACHMENTS, attachmentCount, attachmentRequest, attachmentsBusy, useAttachments, type AttachmentState } from "../components/AttachmentPicker";
import { CanonChip, CanonNewPanel, canonChoiceReady, canonRequest, initialCanonChoice, useCanonSources, type CanonChoiceState } from "../components/CanonChoice";
import { ModelMenu, type RunSettings } from "../components/create/ModelMenu";
import { HypothesisModeChip, HypothesisSettingsPanel, createRequestOf } from "../components/hypothesis/HypothesisControls";
import { PairFields } from "../components/create/PairFields";
import { Popover } from "../components/create/Popover";
import { HelpTip } from "../components/HelpTip";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usableDefaultModel } from "../lib/models";

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
  const defaultModel = usableDefaultModel(me);
  const [run, setRun] = useState<RunSettings>({ model: defaultModel, effort: me?.defaultReasoningEffort ?? null, research: true });
  const [canon, setCanon] = useState<CanonChoiceState>(() => initialCanonChoice(me?.defaultCanonId));
  const canonSources = useCanonSources();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const files = useAttachments(attachments, setAttachments, busy);
  const uploading = attachmentsBusy(attachments);
  const canSubmit = !busy && !uploading && !!(roi.trim() || tlf.trim()) && !!me?.keySource && canonChoiceReady(canon);
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const p = await api.createProject({
        roi,
        tlf,
        ...attachmentRequest(attachments),
        model: run.model,
        reasoningEffort: run.effort,
        researchMode: run.research,
        locale,
        canon: canonRequest(canon),
        ...(run.hypothesis ? { hypothesis: createRequestOf(run.hypothesis) } : {}),
      });
      navigate(`/projects/${encodeURIComponent(p.projectId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [needKeyBefore, needKeyAfter] = t("chat.needKey").split("{settings}");
  const [contribBefore, contribAfter] = t("chat.contributorLine", { name: me?.contributorName || me?.displayName || "—" }).split("{settings}");
  const nAttached = attachmentCount(attachments);
  const tool = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 aria-expanded:bg-slate-100 coarse:h-11 coarse:w-11";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col items-center justify-center px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight sm:mb-7">{t("chat.newTitle")}</h1>
        {!me?.keySource && (
          <div className="mb-4 w-full max-w-2xl rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {needKeyBefore}
            <Link to="/settings" className="underline">
              {t("chat.settingsLink")}
            </Link>
            {needKeyAfter}
          </div>
        )}
        {/* not a <form>: Enter in the menus' own fields (URL, search, custom model) must never start a run */}
        <div
          role="group"
          aria-label={t("chat.newTitle")}
          {...files.dropProps}
          data-testid="composer"
          className={`relative w-full max-w-2xl rounded-3xl border bg-white shadow-sm transition-[border-color,box-shadow] focus-within:border-slate-300 focus-within:shadow-md ${files.drag ? "border-blue-400 ring-4 ring-blue-100" : "border-slate-200"}`}
        >
          <div className="pt-1.5">
            <PairFields roi={roi} tlf={tlf} onRoi={setRoi} onTlf={setTlf} onSubmit={() => void submit()} canSubmit={canSubmit} disabled={busy} />
          </div>
          <AttachmentChips a={files} />
          <div className="flex items-center gap-1 px-2 pb-2 pt-1 sm:gap-1.5 sm:px-3">
            <Popover
              testId="composer-plus"
              title={t("attach.title")}
              side="bottom"
              disabled={busy}
              trigger={{
                label: nAttached ? `${t("chat.plus")} (${nAttached})` : t("chat.plus"),
                className: tool,
                content: (
                  <span className="relative">
                    <Plus size={18} aria-hidden />
                    {nAttached > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">{nAttached}</span>}
                  </span>
                ),
              }}
            >
              {(close) => <AttachMenu a={files} close={close} disabled={busy} />}
            </Popover>
            <CanonChip value={canon} onChange={setCanon} sources={canonSources} defaultCanonId={me?.defaultCanonId} disabled={busy} />
            <HypothesisModeChip value={run.hypothesis ?? null} onChange={(hypothesis) => setRun({ ...run, hypothesis })} disabled={busy} />
            <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
              <ModelMenu value={run} onChange={setRun} fallbackModel={defaultModel || DEFAULT_CODEX_MODEL} disabled={busy} />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                data-testid="create-run"
                aria-label={t("chat.run")}
                className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-blue-600 text-sm font-medium max-sm:w-11 sm:pl-3 sm:pr-3.5 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none coarse:h-11"
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ArrowUp size={16} aria-hidden />} <span className="max-sm:sr-only">{t("chat.run")}</span>
              </button>
            </div>
          </div>
          {files.fileInput}
          {files.drag && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-blue-50/80 text-sm font-medium text-blue-700">
              <Paperclip size={16} className="mr-1.5" aria-hidden /> {t("attach.dropHere")}
            </div>
          )}
        </div>
        <div className="mt-2 flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 text-xs text-slate-400" data-testid="create-meta">
          <span className="hidden items-center gap-1.5 sm:inline-flex coarse:hidden">
            <Kbd>Enter</Kbd> {t("chat.keyNext")}
            <span aria-hidden>·</span>
            <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> {t("chat.keyNewline")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span>
              {contribBefore}
              <Link to="/settings" className="underline hover:text-slate-700">
                {t("chat.settingsLink")}
              </Link>
              {contribAfter}
            </span>
            <HelpTip text={`${t("chat.runHelp")}\n${t("chat.autoName")}`} />
          </span>
        </div>
        {uploading && <div className="mt-2 text-xs text-slate-500">{t("attach.wait")}</div>}
        {err && <div className="mt-3 w-full max-w-2xl rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        {run.hypothesis && (
          <div className="mt-4 w-full max-w-2xl">
            <HypothesisSettingsPanel value={run.hypothesis} onChange={(hypothesis) => setRun({ ...run, hypothesis })} disabled={busy} />
          </div>
        )}
        {canon.mode === "new" && (
          <div className="mt-4 w-full max-w-2xl">
            <CanonNewPanel value={canon} onChange={setCanon} sources={canonSources} disabled={busy} />
          </div>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px] text-slate-500">{children}</kbd>;
}
