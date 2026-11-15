import { ArrowUp, Bot, Check, Loader2, MessageCircleQuestion, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlanChatMessage, PlanChatOutcome, PlanDetailResponse, PlanEventRecord, PlanEventType } from "@cobrac/shared";
import { PLAN_CHAT_LIMITS, isOpenPlanChat, planChatPhase } from "@cobrac/shared";
import { useI18n, useT, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { planEventText } from "../../lib/plan";
import { HelpTip } from "../HelpTip";

/** What the mission did on its own that the chat shows between the messages (the rest stays in the history). */
const CHAT_EVENTS: readonly PlanEventType[] = ["draft_applied", "confirmed", "paused", "resumed", "cancelled", "completed", "replanned", "proposal_accepted", "cost_limit_reached", "cost_limit_raised"];

type Item =
  | { kind: "message"; at: string; key: string; m: PlanChatMessage }
  | { kind: "ask"; at: string; key: string; questions: string[]; open: boolean }
  | { kind: "answers"; at: string; key: string; lines: string[]; skipped: boolean }
  | { kind: "event"; at: string; key: string; e: PlanEventRecord };

/** The conversation as one timeline, oldest first: messages, the questions asked before the draft, and what the mission did. */
function timeline(d: PlanDetailResponse, t: ReturnType<typeof useT>): Item[] {
  const out: Item[] = (d.chat ?? []).map((m) => ({ kind: "message", at: m.createdAt, key: m.sk, m }));
  const qa = d.plan.draft?.qa ?? [];
  const asking = d.plan.status === "DRAFTING" && d.plan.draft?.status === "asking";
  qa.forEach((r, i) => {
    out.push({ kind: "ask", at: r.askedAt, key: `ask-${r.askedAt}`, questions: r.questions.map((q) => q.text), open: asking && i === qa.length - 1 });
    // answers written in the chat are messages of their own; answers from the form (or 「おまかせ」) are shown here
    const lines = (r.answers ?? []).flatMap((a, j) => (a.trim() ? [`${j + 1}. ${a.trim()}`] : []));
    if (r.answeredAt && (lines.length || r.skipped)) out.push({ kind: "answers", at: r.answeredAt, key: `ans-${r.askedAt}`, lines: lines.length ? lines : [t("chat.skipped")], skipped: !lines.length });
  });
  for (const e of d.events ?? []) if (CHAT_EVENTS.includes(e.type)) out.push({ kind: "event", at: e.at, key: `evt-${e.at}-${e.type}`, e });
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function Outcome({ o }: { o: PlanChatOutcome }) {
  const t = useT();
  return (
    <li className={`flex min-w-0 items-start gap-1.5 ${o.ok ? "text-slate-700" : "text-rose-700"}`} data-testid="chat-outcome">
      {o.ok ? <Check size={13} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden /> : <X size={13} className="mt-0.5 shrink-0" aria-label={t("chat.notDone")} />}
      <span className="min-w-0 break-words">
        <span className="font-medium">{t(`chat.act.${o.kind}` as MessageKey)}</span>
        {o.label && <span>: {o.label}</span>}
        {!o.ok && o.error && <span className="block text-[11px]">{o.error}</span>}
      </span>
    </li>
  );
}

function Bubble({ m, canUndo, busy, onUndo }: { m: PlanChatMessage; canUndo: boolean; busy: boolean; onUndo: () => void }) {
  const t = useT();
  if (m.role === "user")
    return (
      <div className="flex justify-end" data-testid="chat-user">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-sm text-white">{m.text}</p>
      </div>
    );
  return (
    <div className="flex min-w-0 gap-2" data-testid="chat-orchestrator">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700" aria-hidden>
        <Bot size={14} />
      </span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className={`whitespace-pre-wrap break-words text-sm ${m.failed ? "text-rose-700" : "text-slate-800"}`}>{m.failed ? t("chat.failed", { error: m.text }) : m.text}</p>
        {!!m.outcomes?.length && (
          <ul className={`grid gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs ${m.undoneAt ? "opacity-60 line-through" : ""}`}>
            {m.outcomes.map((o, i) => (
              <Outcome key={i} o={o} />
            ))}
          </ul>
        )}
        {m.undoneAt ? (
          <span className="text-[11px] text-slate-500">{t("chat.undone")}</span>
        ) : (
          canUndo && (
            <button type="button" disabled={busy} onClick={onUndo} className="flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 coarse:min-h-11" data-testid="chat-undo">
              <RotateCcw size={12} aria-hidden /> {t("chat.undo")}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * The chat with the mission's Orchestrator (the right-hand panel): the conversation with what the Orchestrator did under
 * each reply, and a field to write in. The reply comes from a job a minute or two later (the page reads it with the
 * plan). `top` holds what waits for the owner (the running mission's 「対応が必要」), above the conversation.
 */
export function PlanChat({ d, readOnly, onChanged, onError, top }: { d: PlanDetailResponse; readOnly: boolean; onChanged: () => Promise<unknown>; onError: (e: unknown) => void; top?: ReactNode }) {
  const t = useT();
  const { locale } = useI18n();
  const { plan } = d;
  const phase = planChatPhase(plan.status);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => timeline(d, t), [d, t]);
  const scroller = useRef<HTMLDivElement>(null);
  const last = items.at(-1)?.key;
  const open = !!plan.chat && isOpenPlanChat(plan.chat);
  const draftWaits = open && plan.status === "DRAFTING";
  // while the mission is a draft, the changes are undone newest first: only the newest reply still in effect offers it
  const undoable = plan.status === "DRAFT" ? [...(d.chat ?? [])].reverse().find((m) => m.undoable && !m.undoneAt)?.messageId : undefined;
  const asking = plan.status === "DRAFTING" && plan.draft?.status === "asking";

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last, open]);

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .then(() => onChanged())
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const send = () => {
    const v = text.trim();
    if (!v || busy || readOnly) return;
    run(async () => {
      await api.postPlanChat(plan.planId, v, locale);
      setText("");
    });
  };
  const undo = (messageId: string) => window.confirm(t("chat.undoQ")) && run(() => api.undoPlanChat(plan.planId, messageId));

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="plan-chat">
      <div ref={scroller} className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3">
        {top}
        {items.length === 0 && !open && (
          <p className="text-sm text-slate-500" data-testid="chat-empty">
            {t(`chat.empty.${phase}` as MessageKey)}
          </p>
        )}
        {items.map((it) => {
          switch (it.kind) {
            case "message":
              return <Bubble key={it.key} m={it.m} canUndo={it.m.messageId === undoable} busy={busy || readOnly} onUndo={() => undo(it.m.messageId)} />;
            case "ask":
              return (
                <div key={it.key} className="flex min-w-0 gap-2" data-testid="chat-ask">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700" aria-hidden>
                    <MessageCircleQuestion size={14} />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1 text-sm text-slate-800">
                    <span className="font-medium text-violet-800">{t("chat.asked")}</span>
                    <ol className="grid list-decimal gap-0.5 pl-5">
                      {it.questions.map((q, i) => (
                        <li key={i} className="break-words">
                          {q}
                        </li>
                      ))}
                    </ol>
                    {it.open && <span className="text-xs text-violet-700">{t("chat.askHint")}</span>}
                  </div>
                </div>
              );
            case "answers":
              return (
                <div key={it.key} className="flex justify-end">
                  <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3 py-2 text-sm ${it.skipped ? "bg-slate-100 text-slate-600" : "bg-blue-600 text-white"}`}>{it.lines.join("\n")}</p>
                </div>
              );
            case "event":
              return (
                <p key={it.key} className="text-center text-[11px] text-slate-500" data-testid="chat-event">
                  {planEventText(it.e, t)}
                </p>
              );
          }
        })}
        {open && (
          <div className="flex items-center gap-2 text-xs text-slate-500" role="status" data-testid="chat-thinking">
            <Loader2 size={13} className="shrink-0 text-violet-500 motion-safe:animate-spin" aria-hidden />
            {draftWaits && !asking ? t("chat.waitDraft") : t("chat.thinking")}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-slate-200 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {readOnly ? (
          <p className="px-1 py-1.5 text-xs text-slate-500">{t("chat.readOnly")}</p>
        ) : (
          <form
            className="flex items-end gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 focus-within:border-blue-400"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter breaks the line; an IME composition is never sent
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={Math.min(6, Math.max(1, text.split("\n").length))}
              maxLength={PLAN_CHAT_LIMITS.message}
              placeholder={t(`chat.placeholder.${phase}` as MessageKey)}
              aria-label={t(`chat.placeholder.${phase}` as MessageKey)}
              className="max-h-40 min-h-[2rem] flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
              data-testid="chat-input"
            />
            <HelpTip text={t("chat.help")} />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              aria-label={t("chat.send")}
              title={t("chat.send")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 coarse:h-11 coarse:w-11"
              data-testid="chat-send"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
