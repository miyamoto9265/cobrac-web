import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { MessageRecord } from "@cobrac/shared";
import { useT } from "../i18n";
import { buildTimeline, fmtDuration, groupDurationSec, liveGroupId, stepPreview, todoProgress, type ActivityGroup } from "../lib/activity";
import { MessageItem, StepRow, stepIcon, stepLabel } from "./MessageItem";

/**
 * Chat messages with the agent's thoughts and tool calls folded away: a live status line while the
 * agent works, a single disclosure per run of steps once it has moved on.
 */
export function ChatTimeline({ messages, working }: { messages: MessageRecord[]; working: boolean }) {
  const t = useT();
  const items = useMemo(() => buildTimeline(messages), [messages]);
  const live = liveGroupId(items, working);

  return (
    <>
      {items.map((it) =>
        it.kind === "message" ? <MessageItem key={it.message.messageId} m={it.message} /> : <AgentActivity key={it.id} group={it} live={it.id === live} />,
      )}
      {working && !live && (
        <div role="status" className="flex items-center gap-2 pl-9 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" /> {t("chat.working")}
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

function AgentActivity({ group, live }: { group: ActivityGroup; live: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const now = useNow(live);
  const sec = groupDurationSec(group, live ? Math.max(now, Date.parse(group.endedAt)) : undefined);
  const n = group.steps.length;
  const todo = todoProgress(group);
  const latest = group.steps[n - 1];
  const summary = [n === 1 ? t("activity.oneStep") : t("activity.steps", { n }), fmtDuration(sec), todo ? t("activity.todo", todo) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex gap-2">
      <div className="w-7 shrink-0" />
      <div className="min-w-0 max-w-[85%] flex-1 text-xs sm:flex-none">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:min-h-11"
        >
          {live ? <Loader2 size={13} className="shrink-0 animate-spin text-blue-500" /> : <Sparkles size={13} className="shrink-0 text-slate-400" />}
          <span className={`shrink-0 font-medium ${live ? "text-slate-700" : ""}`}>{live ? t("activity.working") : t("activity.log")}</span>
          <span className="min-w-0 truncate text-slate-400">{summary}</span>
          {open ? <ChevronDown size={13} className="shrink-0 text-slate-400" /> : <ChevronRight size={13} className="shrink-0 text-slate-400" />}
        </button>

        {live && !open && latest && (
          <div role="status" aria-live="polite" className="ml-3 border-l-2 border-slate-200 pl-3">
            <div key={latest.messageId} className="flex min-w-0 items-center gap-1.5 py-0.5 text-slate-500 motion-safe:animate-step-in">
              <span className="shrink-0 text-slate-400">{stepIcon(latest.type)}</span>
              <span className="shrink-0 font-medium">{stepLabel(latest.type, t)}</span>
              <span className={`min-w-0 truncate ${latest.type === "reasoning" ? "italic" : "font-mono"}`}>{stepPreview(latest)}</span>
            </div>
          </div>
        )}

        <div id={panelId} hidden={!open} className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-slate-200 pl-1">
          {open && group.steps.map((s) => <StepRow key={s.messageId} m={s} />)}
        </div>
      </div>
    </div>
  );
}
