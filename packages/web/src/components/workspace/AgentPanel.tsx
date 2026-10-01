import { ArrowDown, ArrowUp, HelpCircle, Loader2, MessageSquarePlus, RotateCcw, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MessageRecord, ProjectRecord } from "@cobrac/shared";
import { useI18n, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { isActive } from "../../lib/format";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { ChatTimeline } from "../ChatTimeline";
import { HelpTip } from "../HelpTip";

/** What the composer at the bottom does in the project's current state. */
export type ComposerMode = "answer" | "followup" | "busy" | "idle";

export function composerMode(project: Pick<ProjectRecord, "status" | "pendingQuestion">): ComposerMode {
  if (project.status === "WAITING_USER_INPUT" && project.pendingQuestion) return "answer";
  if (project.status === "COMPLETED") return "followup";
  return isActive(project.status) ? "busy" : "idle";
}

const NEAR_BOTTOM = 80;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The agent's side of a project: its run log (progress, thoughts and tool calls, answers, questions) and a composer
 * that answers the agent's question or sends a follow-up instruction once the run is done.
 */
export function AgentPanel({
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
  const mode = composerMode(project);
  const [draft, setDraft] = useState("");
  const [stick, setStick] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const coarse = useMediaQuery("(pointer: coarse)");
  const reduced = useMediaQuery(REDUCED_MOTION);
  const seen = useRef(messages.length);

  const toBottom = (smooth: boolean) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? "smooth" : "auto" });
  };

  // follow the log while the reader is at the bottom; otherwise count what arrived below
  useEffect(() => {
    const added = messages.length - seen.current;
    seen.current = messages.length;
    if (stick) toBottom(true);
    else if (added > 0) setUnseen((n) => n + added);
  }, [messages.length, project.status]);

  useLayoutEffect(() => toBottom(false), []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    setStick(near);
    if (near) setUnseen(0);
  };

  // grow with the text up to a cap, then scroll inside
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [draft, mode]);

  const canSend = (mode === "answer" || mode === "followup") && !busy && !!draft.trim();
  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    setStick(true);
    void act(() => (mode === "answer" ? api.answer(projectId, text, locale) : api.followup(projectId, text, locale)));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // touch keyboards keep Enter for new lines; IME conversion must never send
    if (e.key !== "Enter" || e.shiftKey || coarse || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send();
  };
  const pick = (text: string) => {
    setDraft(text);
    inputRef.current?.focus();
  };

  const LABEL: Record<ComposerMode, MessageKey> = { answer: "agent.modeAnswer", followup: "agent.modeFollowup", busy: "status.RUNNING", idle: `status.${project.status}` as MessageKey };
  const PLACEHOLDER: Record<ComposerMode, MessageKey> = { answer: "question.ph", followup: "agent.followupPh", busy: "agent.busyPh", idle: "agent.idlePh" };
  const HELP: Record<ComposerMode, MessageKey> = { answer: "agent.answerHelp", followup: "agent.followupHelp", busy: "agent.busyHelp", idle: "agent.idleHelp" };
  const enabled = mode === "answer" || mode === "followup";
  const round = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed coarse:h-11 coarse:w-11";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} data-testid="agent-log" className="h-full space-y-4 overflow-y-auto px-4 pb-6 pt-4">
          <ChatTimeline
            messages={messages}
            working={isActive(project.status) && project.status !== "WAITING_USER_INPUT"}
            pendingQuestion={mode === "answer" ? project.pendingQuestion : null}
            onPickOption={pick}
          />
        </div>
        {!stick && (
          <button
            type="button"
            onClick={() => {
              setStick(true);
              setUnseen(0);
              toBottom(true);
            }}
            data-testid="agent-jump"
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-md hover:bg-slate-50 coarse:min-h-11"
          >
            <ArrowDown size={13} aria-hidden /> {unseen > 0 ? t("agent.newItems", { n: unseen }) : t("agent.latest")}
          </button>
        )}
      </div>

      <footer className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        {err && <div className="mb-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{err}</div>}
        <form
          data-testid="agent-composer"
          data-mode={mode}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className={`rounded-xl border bg-white shadow-sm transition-[border-color,box-shadow] focus-within:shadow-md ${
            mode === "answer" ? "border-amber-300 ring-1 ring-amber-200 focus-within:border-amber-400" : enabled ? "border-slate-200 focus-within:border-slate-300" : "border-slate-200 bg-slate-50"
          }`}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={!enabled || busy}
            placeholder={t(PLACEHOLDER[mode])}
            aria-label={t(LABEL[mode])}
            data-testid="agent-input"
            className="block max-h-44 w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className={`flex min-w-0 items-center gap-1.5 pl-1 text-[11px] font-medium ${mode === "answer" ? "text-amber-700" : "text-slate-500"}`}>
              {mode === "answer" ? (
                <HelpCircle size={13} aria-hidden />
              ) : mode === "busy" ? (
                <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden />
              ) : mode === "followup" ? (
                <MessageSquarePlus size={13} aria-hidden />
              ) : null}
              <span className="truncate">{t(LABEL[mode])}</span>
              <HelpTip text={t(HELP[mode])} />
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {mode === "busy" && (
                <button type="button" onClick={() => void act(() => api.cancel(projectId))} disabled={busy} aria-label={t("chat.stop")} title={t("chat.stop")} data-testid="agent-stop" className={`${round} bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50`}>
                  <Square size={11} fill="currentColor" aria-hidden />
                </button>
              )}
              {mode === "idle" && (
                <button type="button" onClick={() => void act(() => api.retry(projectId, locale))} disabled={busy} className="flex h-8 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 coarse:h-11">
                  <RotateCcw size={12} aria-hidden /> {t("chat.retry")}
                </button>
              )}
              {enabled && (
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={mode === "answer" ? t("question.submit") : t("send")}
                  title={mode === "answer" ? t("question.submit") : t("send")}
                  data-testid="agent-send"
                  className={`${round} ${mode === "answer" ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"} text-white disabled:bg-slate-200 disabled:text-slate-400`}
                >
                  {busy ? <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden /> : <ArrowUp size={16} aria-hidden />}
                </button>
              )}
            </div>
          </div>
        </form>
      </footer>
    </div>
  );
}
