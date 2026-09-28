import { Download, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { Markdown } from "./Markdown";

/** Modal that renders one markdown artifact (report.md / decision_log.md) with a download button. */
export function DocViewer({ projectId, artifactKey, title, onClose }: { projectId: string; artifactKey: string; title: string; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .artifactText(projectId, artifactKey)
      .then((s) => live && setText(s))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, artifactKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = async () => {
    const { url } = await api.downloadUrl(projectId, artifactKey);
    window.location.href = url;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-full w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title} <span className="font-mono text-xs font-normal text-slate-400">{artifactKey.split("/").pop()}</span>
          </h2>
          <button onClick={() => void download()} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 coarse:min-h-11">
            <Download size={14} /> {t("chat.download")}
          </button>
          <button onClick={onClose} aria-label={t("close")} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 coarse:min-h-11">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {err ? (
            <div className="text-sm text-rose-600">{err}</div>
          ) : text === null ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> {t("loading")}
            </div>
          ) : (
            <Markdown text={text} className="docs" />
          )}
        </div>
      </div>
    </div>
  );
}
