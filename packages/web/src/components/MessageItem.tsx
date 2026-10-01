import { AlertTriangle, Bot, Brain, FileEdit, Globe, Info, ListTodo, Package, Terminal, User } from "lucide-react";
import { useState } from "react";
import type { MessageRecord } from "@cobrac/shared";
import { resolveSystemMessage } from "@cobrac/shared";
import { localeName, useI18n, useT, type MessageKey, type TFn } from "../i18n";
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

export function MessageItem({ m }: { m: MessageRecord }) {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="min-w-0 max-w-[85%] break-words rounded-2xl rounded-br-sm bg-blue-600 sm:max-w-[80%] px-4 py-2 text-sm text-white shadow-sm">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] text-blue-100">
            <User size={10} /> {t("msg.you")} · {fmtDate(m.createdAt, locale)}
          </div>
          <div className="whitespace-pre-wrap">{m.meta?.kind === "create" ? localizeStored(m.content, m.meta, t) : m.content}</div>
        </div>
      </div>
    );
  }

  if (m.type === "question") {
    const q = m.content.replace(/\[\/?QUESTION\]/g, "").trim();
    return (
      <div className="flex gap-2">
        <Avatar />
        <div className="min-w-0 max-w-[85%] rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
          <div className="mb-0.5 text-[10px] text-amber-600">
            agent · {t("msg.question")} · {fmtDate(m.createdAt, locale)}
          </div>
          <Markdown text={q} />
        </div>
      </div>
    );
  }

  // the worker also stores Codex notices (reconnects, rate-limit pauses, CLI warnings) as agent status messages
  if (m.role === "system" || m.type === "status") {
    const isErr = m.type === "error";
    const isArtifact = m.type === "artifact";
    const details = typeof m.meta?.details === "string" && m.meta.details ? m.meta.details : null;
    return (
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => details && setOpen((o) => !o)}
          aria-expanded={details ? open : undefined}
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${details ? "cursor-pointer" : "cursor-default"} ${
            isErr ? "bg-rose-50 text-rose-700" : isArtifact ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {isErr ? <AlertTriangle size={12} /> : isArtifact ? <Package size={12} /> : <Info size={12} />}
          <span className="whitespace-pre-wrap text-left">{localizeStored(m.content, m.meta, t)}</span>
          {details && <span className="shrink-0 opacity-60">{open ? "▲" : "▼"}</span>}
        </button>
        {details && open && (
          <pre className="mt-1 max-h-72 w-full max-w-3xl overflow-auto whitespace-pre-wrap rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
            {details}
          </pre>
        )}
      </div>
    );
  }

  // agent -------------------------------------------------------------------
  if (m.type === "agent_message") {
    return (
      <div className="flex gap-2">
        <Avatar />
        <div className="min-w-0 max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <div className="mb-0.5 text-[10px] text-slate-400">agent · {fmtDate(m.createdAt, locale)}</div>
          <Markdown text={m.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="w-7" />
      <StepRow m={m} className="max-w-[85%]" />
    </div>
  );
}

export function stepIcon(type: MessageRecord["type"], size = 12) {
  return type === "reasoning" ? <Brain size={size} /> : type === "command" ? <Terminal size={size} /> : type === "file_change" ? <FileEdit size={size} /> : type === "web_search" ? <Globe size={size} /> : type === "todo" ? <ListTodo size={size} /> : <AlertTriangle size={size} />;
}

export function stepLabel(type: MessageRecord["type"], t: TFn): string {
  return type === "reasoning" ? t("msg.reasoning") : type === "command" ? t("msg.command") : type === "file_change" ? t("msg.fileChange") : type === "web_search" ? t("msg.webSearch") : type === "todo" ? t("msg.todo") : t("msg.error");
}

/** One thought / tool call: a single line that expands to the full text. */
export function StepRow({ m, className = "" }: { m: MessageRecord; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const firstLine = stepPreview(m);
  const multi = m.content.includes("\n") || m.content.length > 120;

  return (
    <div className={`min-w-0 text-xs ${className}`}>
      <button
        type="button"
        onClick={() => multi && setOpen((o) => !o)}
        aria-expanded={multi ? open : undefined}
        className="flex max-w-full items-start gap-1.5 rounded-md px-2 py-1 text-left text-slate-500 hover:bg-slate-100 coarse:py-2"
      >
        <span className="mt-0.5 shrink-0 text-slate-400">{stepIcon(m.type)}</span>
        <span className="shrink-0 font-medium text-slate-500">{stepLabel(m.type, t)}</span>
        <span className={`min-w-0 font-mono ${open ? "" : "truncate"}`}>{open ? "" : firstLine}</span>
        {multi && <span className="shrink-0 text-slate-400" aria-hidden>{open ? "▲" : "▼"}</span>}
      </button>
      {open && (
        <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{m.content}</pre>
      )}
    </div>
  );
}

function Avatar() {
  return (
    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">
      <Bot size={14} />
    </div>
  );
}
