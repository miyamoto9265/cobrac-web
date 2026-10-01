import { AlertTriangle, Brain, CheckCircle2, ChevronDown, ChevronRight, Coins, FileEdit, Globe, HelpCircle, Info, ListTodo, Loader2, Package, Terminal } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { MessageRecord } from "@cobrac/shared";
import { resolveSystemMessage } from "@cobrac/shared";
import { dateTagFor, localeName, useI18n, useT, type MessageKey, type TFn } from "../i18n";
import { stepPreview } from "../lib/activity";
import { fmtDate } from "../lib/format";
import { Markdown } from "./Markdown";

function localizeStored(content: string, meta: Record<string, unknown> | undefined, t: TFn): string {
  const r = resolveSystemMessage(content, meta);
  if (!r) return content;
  const vars = { ...(r.vars ?? {}) };
  if (r.key === "msg.roiTlf") {
    vars.roi = String(vars.roi || t("unspecified"));
    vars.tlf = String(vars.tlf || t("unspecified"));
  }
  if (typeof vars.lang === "string") vars.lang = localeName(vars.lang, t);
  if (r.key === "sys.model") {
    vars.model = String(vars.model || t("sys.default"));
    vars.effort = String(vars.effort || t("sys.default"));
  }
  return t(r.key as MessageKey, vars);
}

export function fmtTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(dateTagFor(locale), { hour: "2-digit", minute: "2-digit" });
}

function Stamp({ iso }: { iso: string }) {
  const { locale } = useI18n();
  return (
    <time dateTime={iso} title={fmtDate(iso, locale)} className="shrink-0 text-[11px] tabular-nums text-slate-500">
      {fmtTime(iso, locale)}
    </time>
  );
}

const PROMPT_LABEL: Record<string, MessageKey> = { create: "agent.kindCreate", answer: "agent.kindAnswer", followup: "agent.kindFollowup" };

/** Agent questions are stored with `[QUESTION]` markers. */
export const questionText = (content: string) => content.replace(/\[\/?QUESTION\]/g, "").trim();

/** One timeline entry. Agent answers read as plain text, the user's prompts as quiet blocks, notices as one-line rows. */
export function MessageItem({ m }: { m: MessageRecord }) {
  const t = useT();

  if (m.role === "user") {
    const kind = typeof m.meta?.kind === "string" ? PROMPT_LABEL[m.meta.kind] : undefined;
    return (
      <div data-kind="prompt" className="motion-safe:animate-step-in">
        <div className="mb-1 flex items-center gap-2 text-[11px]">
          <span className="font-medium text-slate-500">{t(kind ?? "msg.you")}</span>
          <Stamp iso={m.createdAt} />
        </div>
        <div className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700">
          {m.meta?.kind === "create" ? localizeStored(m.content, m.meta, t) : m.content}
        </div>
      </div>
    );
  }

  if (m.type === "question") {
    return (
      <div data-kind="question" className="border-l-2 border-amber-400 pl-3 motion-safe:animate-step-in">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
          <HelpCircle size={12} aria-hidden /> {t("msg.question")}
          <Stamp iso={m.createdAt} />
        </div>
        <Markdown text={questionText(m.content)} className="agent-prose text-[13.5px] text-slate-800" />
      </div>
    );
  }

  // the worker also stores Codex notices (reconnects, rate-limit pauses, CLI warnings) as agent status messages
  if (m.role === "system" || m.type === "status" || m.type === "error" || m.type === "artifact") return <NoticeRow m={m} />;

  if (m.type === "agent_message") {
    return (
      <div data-kind="answer" className="motion-safe:animate-step-in">
        <Markdown text={m.content} className="agent-prose text-[13.5px] text-slate-800" />
      </div>
    );
  }

  return <StepRow m={m} />;
}

type Tone = "neutral" | "error" | "done";

function NoticeRow({ m }: { m: MessageRecord }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const details = typeof m.meta?.details === "string" && m.meta.details ? m.meta.details : null;
  const key = resolveSystemMessage(m.content, m.meta)?.key;
  const tone: Tone = m.type === "error" ? "error" : m.type === "artifact" || key === "sys.stepDone" || key === "sys.braDone" || key === "sys.followupDone" ? "done" : "neutral";
  const icon: ReactNode =
    tone === "error" ? <AlertTriangle size={13} /> : m.type === "artifact" ? <Package size={13} /> : tone === "done" ? <CheckCircle2 size={13} /> : key === "sys.usage" ? <Coins size={13} /> : <Info size={13} />;
  const color = tone === "error" ? "text-rose-700" : tone === "done" ? "text-emerald-700" : "text-slate-500";
  const text = localizeStored(m.content, m.meta, t);
  const body = (
    <>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-left">{text}</span>
      {details && <span className="mt-0.5 shrink-0 opacity-70">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
      <Stamp iso={m.createdAt} />
    </>
  );
  return (
    <div data-kind="notice" data-tone={tone} className="motion-safe:animate-step-in">
      {details ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-0.5 text-xs hover:bg-slate-100 coarse:py-2 ${color}`}>
          {body}
        </button>
      ) : (
        <div className={`flex items-start gap-2 text-xs ${color}`}>{body}</div>
      )}
      {details && open && (
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap theme-static rounded-md border border-slate-800 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{details}</pre>
      )}
    </div>
  );
}

export function stepIcon(type: MessageRecord["type"], size = 12) {
  return type === "reasoning" ? <Brain size={size} /> : type === "command" ? <Terminal size={size} /> : type === "file_change" ? <FileEdit size={size} /> : type === "web_search" ? <Globe size={size} /> : type === "todo" ? <ListTodo size={size} /> : <AlertTriangle size={size} />;
}

export function stepLabel(type: MessageRecord["type"], t: TFn): string {
  return type === "reasoning" ? t("msg.reasoning") : type === "command" ? t("msg.command") : type === "file_change" ? t("msg.fileChange") : type === "web_search" ? t("msg.webSearch") : type === "todo" ? t("msg.todo") : t("msg.error");
}

/** A command that ended with a non-zero exit code. */
const failed = (m: MessageRecord) => m.type === "command" && typeof m.meta?.exitCode === "number" && m.meta.exitCode !== 0;
const running = (m: MessageRecord) => m.type === "command" && m.meta?.status === "started";

/** One thought / tool call: a single line that expands to the full text. */
export function StepRow({ m }: { m: MessageRecord }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const firstLine = stepPreview(m);
  const multi = m.content.includes("\n") || m.content.length > 120;
  const bad = failed(m);

  return (
    <div className="min-w-0 text-xs">
      <button
        type="button"
        onClick={() => multi && setOpen((o) => !o)}
        aria-expanded={multi ? open : undefined}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left ${multi ? "hover:bg-slate-100" : "cursor-default"} ${bad ? "text-rose-700" : "text-slate-500"} coarse:py-2`}
      >
        <span className={`shrink-0 ${bad ? "" : "text-slate-400"}`}>{running(m) ? <Loader2 size={12} className="motion-safe:animate-spin" /> : stepIcon(m.type)}</span>
        <span className="shrink-0 font-medium">{stepLabel(m.type, t)}</span>
        <span className={`min-w-0 flex-1 truncate ${m.type === "reasoning" ? "italic" : "font-mono text-[11.5px]"}`}>{firstLine}</span>
        {multi && <span className="shrink-0 text-slate-400">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
      </button>
      {open && (
        <pre className="mb-1 ml-1.5 mt-0.5 max-h-96 overflow-auto whitespace-pre-wrap break-words theme-static rounded-md border border-slate-800 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{m.content}</pre>
      )}
    </div>
  );
}
