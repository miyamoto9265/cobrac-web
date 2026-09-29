import { AlertCircle, CheckCircle2, File, FileImage, FileText, Link2, Loader2, Paperclip, Plus, X } from "lucide-react";
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

/** Reference files (uploaded right away, straight to S3) and URLs for a new project. */
export function AttachmentPicker({ value, onChange, disabled }: { value: AttachmentState; onChange: (next: (prev: AttachmentState) => AttachmentState) => void; disabled?: boolean }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const url = value.draftUrl;
  const setUrl = (draftUrl: string) => onChange((s) => ({ ...s, draftUrl }));
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

  const addUrl = () => {
    if (!url.trim()) return;
    const parsed = parseUrlInput(url);
    if (!parsed) return setMsg(t("attach.urlErr"));
    if (value.urls.includes(parsed)) return setUrl("");
    if (value.urls.length >= ATTACHMENT_LIMITS.maxUrls) return setMsg(t("attach.urlCountErr", { n: ATTACHMENT_LIMITS.maxUrls }));
    onChange((s) => ({ ...s, urls: [...s.urls, parsed], draftUrl: "" }));
    setMsg(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!disabled && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const rowCls = "flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";
  const removeCls = "ml-auto flex shrink-0 items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 coarse:h-11 coarse:w-11";

  return (
    <div data-testid="attachment-picker">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Paperclip size={13} /> {t("attach.title")}{" "}
        <HelpTip text={t("attach.help", { files: ATTACHMENT_LIMITS.maxFiles, size: ATTACHMENT_LIMITS.maxFileBytes / MB, total: ATTACHMENT_LIMITS.maxTotalBytes / MB, urls: ATTACHMENT_LIMITS.maxUrls })} />
      </span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed p-3 ${drag ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50"}`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 coarse:min-h-11"
          >
            <Plus size={15} /> {t("attach.addFiles")}
          </button>
          <span className="hidden text-xs text-slate-500 sm:inline">{t("attach.drop")}</span>
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
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addUrl();
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            inputMode="url"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("attach.urlPh")}
            aria-label={t("attach.urlPh")}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            title={t("attach.addUrl")}
            aria-label={t("attach.addUrl")}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 coarse:min-h-11"
          >
            <Plus size={14} className="sm:hidden" />
            <Link2 size={14} /> <span className="hidden sm:inline">{t("attach.addUrl")}</span>
          </button>
        </form>
      </div>
      {msg && <div className="mt-2 whitespace-pre-line rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{msg}</div>}
      {(value.files.length > 0 || value.urls.length > 0) && (
        <ul className="mt-2 grid grid-cols-1 gap-1.5" data-testid="attachment-list">
          {value.files.map((f) => (
            <li key={f.localId} className={rowCls}>
              <AttachmentIcon kind={attachmentTypeOf(f.name)?.kind ?? null} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={f.name}>
                  {f.name}
                </span>
                <span className={`block text-[11px] ${f.status === "error" ? "text-rose-600" : "text-slate-400"}`}>
                  {fmtBytes(f.size)}
                  {f.status === "uploading" && ` · ${t("attach.uploading", { pct: Math.round(f.progress * 100) })}`}
                  {f.status === "error" && ` · ${t("attach.failed", { error: f.error ?? "" })}`}
                </span>
                {f.status === "uploading" && (
                  <span className="mt-1 block h-1 overflow-hidden rounded bg-slate-100">
                    <span className="block h-full bg-blue-500 transition-all" style={{ width: `${Math.round(f.progress * 100)}%` }} />
                  </span>
                )}
              </span>
              {f.status === "uploading" ? (
                <Loader2 size={15} className="shrink-0 animate-spin text-blue-500" />
              ) : f.status === "done" ? (
                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
              )}
              <button type="button" onClick={() => removeFile(f.localId)} title={t("attach.remove")} aria-label={`${t("attach.remove")}: ${f.name}`} className={removeCls}>
                <X size={15} />
              </button>
            </li>
          ))}
          {value.urls.map((u) => (
            <li key={u} className={rowCls}>
              <AttachmentIcon kind="url" />
              <a href={u} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-blue-700 hover:underline" title={u}>
                {u}
              </a>
              <button type="button" onClick={() => onChange((s) => ({ ...s, urls: s.urls.filter((x) => x !== u) }))} title={t("attach.remove")} aria-label={`${t("attach.remove")}: ${u}`} className={removeCls}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
