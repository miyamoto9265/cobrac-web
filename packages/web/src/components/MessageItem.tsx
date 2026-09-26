import { AlertTriangle, Bot, Brain, FileEdit, Globe, Info, ListTodo, Package, Terminal, User } from "lucide-react";
import { useState } from "react";
import type { MessageRecord } from "@cobrac/shared";
import { resolveSystemMessage } from "@cobrac/shared";
import { useI18n, useT, type MessageKey, type TFn } from "../i18n";
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
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white shadow-sm">
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
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
          <div className="mb-0.5 text-[10px] text-amber-600">
            agent · {t("msg.question")} · {fmtDate(m.createdAt, locale)}
          </div>
          <Markdown text={q} />
        </div>
      </div>
    );
  }

  if (m.role === "system") {
    const isErr = m.type === "error";
    const isArtifact = m.type === "artifact";
    const details = typeof m.meta?.details === "string" && m.meta.details ? m.meta.details : null;
    return (
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => details && setOpen((o) => !o)}
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
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <div className="mb-0.5 text-[10px] text-slate-400">agent · {fmtDate(m.createdAt, locale)}</div>
          <Markdown text={m.content} />
        </div>
      </div>
    );
  }

  const icon =
    m.type === "reasoning" ? <Brain size={12} /> : m.type === "command" ? <Terminal size={12} /> : m.type === "file_change" ? <FileEdit size={12} /> : m.type === "web_search" ? <Globe size={12} /> : m.type === "todo" ? <ListTodo size={12} /> : <AlertTriangle size={12} />;
  const label =
    m.type === "reasoning" ? t("msg.reasoning") : m.type === "command" ? t("msg.command") : m.type === "file_change" ? t("msg.fileChange") : m.type === "web_search" ? t("msg.webSearch") : m.type === "todo" ? t("msg.todo") : t("msg.error");
  const firstLine = m.content.split("\n")[0].slice(0, 120);
  const multi = m.content.includes("\n") || m.content.length > 120;

  return (
    <div className="flex gap-2">
      <div className="w-7" />
      <div className="max-w-[85%] text-xs">
        <button onClick={() => multi && setOpen((o) => !o)} className="flex items-start gap-1.5 rounded-md px-2 py-1 text-left text-slate-500 hover:bg-slate-100">
          <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
          <span className="shrink-0 font-medium text-slate-500">{label}</span>
          <span className={`font-mono ${open ? "" : "truncate"}`}>{open ? "" : firstLine}</span>
          {multi && <span className="shrink-0 text-slate-400">{open ? "▲" : "▼"}</span>}
        </button>
        {open && (
          <pre className="mt-1 max-h-96 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{m.content}</pre>
        )}
      </div>
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
