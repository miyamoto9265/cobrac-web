import { AlertCircle, File, FileImage, FileText, Link2, Loader2, Paperclip, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMITS, attachmentTypeOf, normalizeAttachmentUrl, type AttachmentKind } from "@cobrac/shared";
import { useT } from "../i18n";
import { HelpTip } from "./HelpTip";
import { api, uploadFile } from "../lib/api";
import { fmtBytes } from "../lib/format";

export interface PickedFile {
  localId: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  progress: number;
  uploadId?: string;
  error?: string;
}

export interface AttachmentState {
  files: PickedFile[];
  urls: string[];
  /** Typed in the URL field but not added yet; still sent when valid */
  draftUrl: string;
}

export const EMPTY_ATTACHMENTS: AttachmentState = { files: [], urls: [], draftUrl: "" };

/** `example.org/x` → `https://example.org/x`; null when not an acceptable URL. */
export function parseUrlInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const r = normalizeAttachmentUrl(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  return "error" in r ? null : r.url;
}

export const attachmentsBusy = (s: AttachmentState) => s.files.some((f) => f.status === "uploading");

/** Request fields for POST /projects (only finished uploads). */
export const attachmentRequest = (s: AttachmentState) => {
  const draft = parseUrlInput(s.draftUrl);
  return {
    attachments: s.files.filter((f) => f.status === "done" && f.uploadId).map((f) => ({ uploadId: f.uploadId!, name: f.name })),
    urls: draft && !s.urls.includes(draft) && s.urls.length < ATTACHMENT_LIMITS.maxUrls ? [...s.urls, draft] : s.urls,
  };
};

const MB = 1024 * 1024;
let seq = 0;

export function AttachmentIcon({ kind, size = 15 }: { kind: AttachmentKind | "url" | null; size?: number }) {
  if (kind === "url") return <Link2 size={size} className="shrink-0 text-blue-600" />;
  if (kind === "image") return <FileImage size={size} className="shrink-0 text-violet-600" />;
  if (kind === "pdf") return <FileText size={size} className="shrink-0 text-rose-600" />;
  if (kind === "text" || kind === "office") return <FileText size={size} className="shrink-0 text-slate-500" />;
  return <File size={size} className="shrink-0 text-slate-400" />;
}

type SetAttachments = (next: (prev: AttachmentState) => AttachmentState) => void;

/**
 * Reference files (uploaded right away, straight to S3) and URLs for a new project. Owns the hidden file input, so
 * the "+" menu can close while the file dialog is open, and the drop handlers for the whole composer.
 */
export function useAttachments(value: AttachmentState, onChange: SetAttachments, disabled?: boolean) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const aborts = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const map = aborts.current;
    return () => map.forEach((a) => a.abort());
  }, []);

  const patch = (localId: string, p: Partial<PickedFile>) => onChange((s) => ({ ...s, files: s.files.map((f) => (f.localId === localId ? { ...f, ...p } : f)) }));

  const start = async (file: globalThis.File, localId: string) => {
    const abort = new AbortController();
    aborts.current.set(localId, abort);
    try {
      const target = await api.createUpload(file.name, file.size);
      await uploadFile(target, file, (fr) => patch(localId, { progress: fr }), abort.signal);
      patch(localId, { status: "done", progress: 1, uploadId: target.uploadId });
    } catch (e) {
      if (abort.signal.aborted) return;
      patch(localId, { status: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      aborts.current.delete(localId);
    }
  };

  const addFiles = (list: FileList | globalThis.File[]) => {
    const problems: string[] = [];
    const accepted: { file: globalThis.File; localId: string }[] = [];
    let count = value.files.length;
    let total = value.files.reduce((n, f) => n + (f.status === "error" ? 0 : f.size), 0);
    for (const file of Array.from(list)) {
      if (!attachmentTypeOf(file.name)) problems.push(t("attach.typeErr", { name: file.name }));
      else if (file.size <= 0) problems.push(t("attach.emptyErr", { name: file.name }));
      else if (file.size > ATTACHMENT_LIMITS.maxFileBytes) problems.push(t("attach.sizeErr", { name: file.name, size: ATTACHMENT_LIMITS.maxFileBytes / MB }));
      else if (count >= ATTACHMENT_LIMITS.maxFiles) problems.push(t("attach.countErr", { n: ATTACHMENT_LIMITS.maxFiles }));
      else if (total + file.size > ATTACHMENT_LIMITS.maxTotalBytes) problems.push(t("attach.totalErr", { size: ATTACHMENT_LIMITS.maxTotalBytes / MB }));
      else {
        count++;
        total += file.size;
        accepted.push({ file, localId: `local-${++seq}` });
      }
    }
    setMsg(problems.length ? [...new Set(problems)].join("\n") : null);
    if (!accepted.length) return;
    onChange((s) => ({ ...s, files: [...s.files, ...accepted.map(({ file, localId }) => ({ localId, name: file.name, size: file.size, status: "uploading" as const, progress: 0 }))] }));
    for (const a of accepted) void start(a.file, a.localId);
  };

  const removeFile = (localId: string) => {
    aborts.current.get(localId)?.abort();
    onChange((s) => ({ ...s, files: s.files.filter((f) => f.localId !== localId) }));
  };

  /** Adds the URL typed in the menu; false (with a message) when it cannot be added. */
  const addUrl = (): boolean => {
    const url = value.draftUrl;
    if (!url.trim()) return false;
    const parsed = parseUrlInput(url);
    if (!parsed) {
      setMsg(t("attach.urlErr"));
      return false;
    }
    if (value.urls.includes(parsed)) {
      onChange((s) => ({ ...s, draftUrl: "" }));
      return true;
    }
    if (value.urls.length >= ATTACHMENT_LIMITS.maxUrls) {
      setMsg(t("attach.urlCountErr", { n: ATTACHMENT_LIMITS.maxUrls }));
      return false;
    }
    onChange((s) => ({ ...s, urls: [...s.urls, parsed], draftUrl: "" }));
    setMsg(null);
    return true;
  };

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      if (!disabled) setDrag(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setDrag(false);
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setDrag(false);
      if (!disabled) addFiles(e.dataTransfer.files);
    },
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ATTACHMENT_ACCEPT}
      className="hidden"
      data-testid="attachment-input"
      onChange={(e) => {
        if (e.target.files?.length) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return {
    value,
    msg,
    clearMsg: () => setMsg(null),
    drag,
    dropProps,
    fileInput,
    pickFiles: () => inputRef.current?.click(),
    removeFile,
    addUrl,
    setDraftUrl: (draftUrl: string) => onChange((s) => ({ ...s, draftUrl })),
    removeUrl: (u: string) => onChange((s) => ({ ...s, urls: s.urls.filter((x) => x !== u) })),
  };
}

export type Attachments = ReturnType<typeof useAttachments>;

export const attachmentCount = (s: AttachmentState) => s.files.length + s.urls.length;

/** Contents of the composer's "+" menu: add files, add a URL. */
export function AttachMenu({ a, close, disabled }: { a: Attachments; close: () => void; disabled?: boolean }) {
  const t = useT();
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none disabled:opacity-50 coarse:min-h-11";
  return (
    <div className="p-1.5" data-testid="attach-menu">
      <div className="flex items-center gap-1 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Paperclip size={11} aria-hidden /> {t("attach.title")}
        <HelpTip text={t("attach.help", { files: ATTACHMENT_LIMITS.maxFiles, size: ATTACHMENT_LIMITS.maxFileBytes / MB, total: ATTACHMENT_LIMITS.maxTotalBytes / MB, urls: ATTACHMENT_LIMITS.maxUrls })} />
      </div>
      <button
        type="button"
        className={item}
        disabled={disabled}
        data-autofocus
        onClick={() => {
          a.pickFiles();
          close();
        }}
      >
        <Plus size={16} className="text-slate-500" aria-hidden />
        <span className="flex-1">{t("attach.addFiles")}</span>
        <span className="hidden text-[11px] text-slate-400 sm:inline">{t("attach.dropShort")}</span>
      </button>
      <form
        className="mt-1 flex items-center gap-1.5 px-1.5 pb-1"
        onSubmit={(e) => {
          e.preventDefault();
          a.addUrl();
        }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500" aria-hidden>
          <Link2 size={16} />
        </span>
        <input
          value={a.value.draftUrl}
          onChange={(e) => a.setDraftUrl(e.target.value)}
          disabled={disabled}
          inputMode="url"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("attach.urlPh")}
          aria-label={t("attach.urlPh")}
          data-testid="attach-url-input"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={disabled || !a.value.draftUrl.trim()}
          aria-label={t("attach.addUrl")}
          title={t("attach.addUrl")}
          className="flex shrink-0 items-center justify-center rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40 coarse:min-h-11 coarse:min-w-11"
        >
          <Plus size={15} />
        </button>
      </form>
      {a.msg && <div className="mx-1.5 mb-1 whitespace-pre-line rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{a.msg}</div>}
    </div>
  );
}

/** Attached files and URLs as small removable chips inside the composer. */
export function AttachmentChips({ a }: { a: Attachments }) {
  const t = useT();
  const { files, urls } = a.value;
  if (!files.length && !urls.length && !a.msg) return null;
  const chip = "group inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-0.5 text-xs";
  const remove = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 coarse:h-9 coarse:w-9";
  return (
    <div className="px-3 pb-1 sm:px-4">
      <ul className="flex flex-wrap gap-1.5" data-testid="attachment-list" aria-label={t("attach.title")}>
        {files.map((f) => (
          <li
            key={f.localId}
            className={`${chip} ${f.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}
            title={f.status === "error" ? t("attach.failed", { error: f.error ?? "" }) : `${f.name} · ${fmtBytes(f.size)}`}
          >
            {f.status === "uploading" ? (
              <Loader2 size={13} className="shrink-0 animate-spin text-blue-500" aria-hidden />
            ) : f.status === "error" ? (
              <AlertCircle size={13} className="shrink-0" aria-hidden />
            ) : (
              <AttachmentIcon kind={attachmentTypeOf(f.name)?.kind ?? null} size={13} />
            )}
            <span className="max-w-[12rem] truncate">{f.name}</span>
            {f.status === "uploading" && <span className="font-mono text-[10px] text-slate-400">{Math.round(f.progress * 100)}%</span>}
            {f.status === "error" && <span className="sr-only">{t("attach.failed", { error: f.error ?? "" })}</span>}
            <button type="button" onClick={() => a.removeFile(f.localId)} aria-label={`${t("attach.remove")}: ${f.name}`} className={remove}>
              <X size={12} />
            </button>
          </li>
        ))}
        {urls.map((u) => (
          <li key={u} className={`${chip} border-blue-100 bg-blue-50/60 text-blue-800`} title={u}>
            <AttachmentIcon kind="url" size={13} />
            <a href={u} target="_blank" rel="noopener noreferrer" className="max-w-[14rem] truncate hover:underline">
              {u.replace(/^https?:\/\//, "")}
            </a>
            <button type="button" onClick={() => a.removeUrl(u)} aria-label={`${t("attach.remove")}: ${u}`} className={remove}>
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      {a.msg && (
        <div className="mt-1.5 flex items-start gap-2 whitespace-pre-line rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800" role="status">
          <span className="flex-1">{a.msg}</span>
          <button type="button" onClick={a.clearMsg} aria-label={t("close")} className="text-amber-600 hover:text-amber-900">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
