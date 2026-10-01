import { ChevronDown, ChevronRight, CornerDownLeft, HelpCircle, Loader2, Workflow } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { MessageRecord } from "@cobrac/shared";
import { resolveSystemMessage } from "@cobrac/shared";
import { useT } from "../i18n";
import { buildTimeline, fmtDuration, groupDurationSec, liveGroupId, stepPreview, todoProgress, type ActivityGroup } from "../lib/activity";
import { Markdown } from "./Markdown";
import { MessageItem, StepRow, questionText, stepIcon, stepLabel } from "./MessageItem";

/**
 * The agent's run as one flowing log: answers as text, thoughts and tool calls folded into one-line activity rows
 * (live while the agent works), notices as compact rows. The question the agent is waiting on is shown as a callout.
 */
export function ChatTimeline({
  messages,
  working,
  pendingQuestion = null,
  onPickOption,
}: {
  messages: MessageRecord[];
  working: boolean;
  /** set while the project waits for an answer */
  pendingQuestion?: string | null;
  onPickOption?: (text: string) => void;
}) {
  const t = useT();
  const all = useMemo(() => buildTimeline(messages), [messages]);
  // the callout already says the run waits for an answer
  const items = useMemo(
    () => (pendingQuestion ? all.filter((it) => !(it.kind === "message" && it.message.role === "system" && resolveSystemMessage(it.message.content, it.message.meta)?.key === "sys.waitingAnswer")) : all),
    [all, pendingQuestion],
  );
  const live = liveGroupId(items, working);
  // the last question message is the one being waited on; older ones are history
  const pendingIdx = useMemo(() => {
    if (!pendingQuestion) return -1;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "message" && it.message.type === "question") return i;
    }
    return -1;
  }, [items, pendingQuestion]);

  return (
    <>
      {items.map((it, i) =>
        i === pendingIdx && it.kind === "message" ? (
          <PendingQuestion key={it.message.messageId} text={questionText(it.message.content)} onPick={onPickOption} />
        ) : it.kind === "message" ? (
          <MessageItem key={it.message.messageId} m={it.message} />
        ) : (
          <AgentActivity key={it.id} group={it} live={it.id === live} />
        ),
      )}
      {pendingQuestion && pendingIdx < 0 && <PendingQuestion text={pendingQuestion} onPick={onPickOption} />}
      {working && !live && (
        <div role="status" className="flex items-center gap-2 text-xs">
          <Loader2 size={13} className="shrink-0 text-blue-500 motion-safe:animate-spin" aria-hidden />
          <span className="agent-shimmer font-medium">{t("chat.working")}</span>
        </div>
      )}
    </>
  );
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

/** Thoughts and tool calls between two messages: one row ("Worked · 12 steps · 3m 05s") that opens the step list. */
function AgentActivity({ group, live }: { group: ActivityGroup; live: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const now = useNow(live);
  const sec = groupDurationSec(group, live ? Math.max(now, Date.parse(group.endedAt)) : undefined);
  const n = group.steps.length;
  const todo = todoProgress(group);
  const latest = group.steps[n - 1];
  const summary = [n === 1 ? t("activity.oneStep") : t("activity.steps", { n }), fmtDuration(sec), todo ? t("activity.todo", todo) : null].filter(Boolean).join(" · ");

  return (
    <div data-kind="activity" data-live={live || undefined} className="text-xs motion-safe:animate-step-in">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:min-h-11"
      >
        {live ? <Loader2 size={13} className="shrink-0 text-blue-500 motion-safe:animate-spin" aria-hidden /> : <Workflow size={13} className="shrink-0 text-slate-400" aria-hidden />}
        <span className={`shrink-0 font-medium ${live ? "agent-shimmer" : "text-slate-600"}`}>{live ? t("activity.working") : t("activity.log")}</span>
        <span className="min-w-0 flex-1 truncate tabular-nums text-slate-500">{summary}</span>
        {open ? <ChevronDown size={13} className="shrink-0 text-slate-400" /> : <ChevronRight size={13} className="shrink-0 text-slate-400" />}
      </button>

      {live && !open && latest && (
        <div role="status" aria-live="polite" className="ml-[0.3rem] border-l border-slate-200 pl-3">
          <div key={latest.messageId} className="flex min-w-0 items-center gap-1.5 py-0.5 text-slate-500 motion-safe:animate-step-in">
            <span className="shrink-0 text-slate-400">{stepIcon(latest.type)}</span>
            <span className="shrink-0 font-medium">{stepLabel(latest.type, t)}</span>
            <span className={`min-w-0 truncate ${latest.type === "reasoning" ? "italic" : "font-mono text-[11.5px]"}`}>{stepPreview(latest)}</span>
          </div>
        </div>
      )}

      <div id={panelId} hidden={!open} className="ml-[0.3rem] mt-0.5 border-l border-slate-200 pl-1.5">
        {open && group.steps.map((s) => <StepRow key={s.messageId} m={s} />)}
      </div>
    </div>
  );
}

/** Numbered choices in a question ("1. **A** — note"), offered as one-tap answers. */
export function questionOptions(text: string): { n: string; label: string }[] {
  const out: { n: string; label: string }[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (!m) continue;
    const label = m[2].replace(/\*\*|__|`/g, "").split(/\s+[—–]\s+|:\s|：/)[0].trim();
    if (label) out.push({ n: m[1], label: label.length > 60 ? `${label.slice(0, 59)}…` : label });
  }
  return out.length >= 2 && out.length <= 6 ? out : [];
}

function PendingQuestion({ text, onPick }: { text: string; onPick?: (text: string) => void }) {
  const t = useT();
  const options = questionOptions(text);
  return (
    <div data-kind="pending-question" data-testid="pending-question" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 motion-safe:animate-step-in">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <HelpCircle size={12} aria-hidden /> {t("status.WAITING_USER_INPUT")}
      </div>
      <Markdown text={text} className="agent-prose text-[13.5px] text-slate-800" />
      {onPick && options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="question-options">
          {options.map((o) => (
            <button
              key={o.n}
              type="button"
              onClick={() => onPick(`${o.n}. ${o.label}`)}
              title={t("agent.useOption")}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:border-amber-400 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 coarse:min-h-11"
            >
              <span className="font-mono text-[11px] font-semibold text-amber-700">{o.n}</span>
              <span className="min-w-0 truncate">{o.label}</span>
              <CornerDownLeft size={11} className="shrink-0 text-slate-400" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
