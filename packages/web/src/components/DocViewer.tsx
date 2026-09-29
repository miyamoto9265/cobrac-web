import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { Markdown } from "./Markdown";

/** One markdown artifact (report.md / decision_log.md) rendered in the workspace, with a download button. */
export function DocViewer({ projectId, artifactKey, title, version }: { projectId: string; artifactKey: string; title: string; version?: string }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setText(null);
    setErr(null);
    api
      .artifactText(projectId, artifactKey)
      .then((s) => live && setText(s))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, artifactKey, version]);

  const download = async () => {
    const { url } = await api.downloadUrl(projectId, artifactKey);
    window.location.href = url;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title} <span className="font-mono text-xs font-normal text-slate-400">{artifactKey.split("/").pop()}</span>
        </h2>
        <button onClick={() => void download()} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 coarse:min-h-11">
          <Download size={14} /> {t("chat.download")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-4xl">
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
