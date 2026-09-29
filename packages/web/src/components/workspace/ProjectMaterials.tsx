import { Download, ExternalLink } from "lucide-react";
import type { ProjectAttachment } from "@cobrac/shared";
import { attachmentTypeOf } from "@cobrac/shared";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { fmtBytes } from "../../lib/format";
import { AttachmentIcon } from "../AttachmentPicker";
import { HelpTip } from "../HelpTip";

/** Reference materials the user attached at creation: files download through a presigned URL, URLs open in a new tab. */
export function ProjectMaterials({ projectId, attachments }: { projectId: string; attachments: ProjectAttachment[] }) {
  const t = useT();
  const download = async (key: string) => {
    const { url } = await api.downloadUrl(projectId, key);
    window.location.href = url;
  };
  const row = "flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs coarse:min-h-11";
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-2" data-testid="project-materials">
      <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1 sm:grid-cols-2">
        {attachments.map((a) =>
          a.kind === "file" ? (
            <li key={a.id} className="min-w-0">
              <button type="button" onClick={() => void download(a.key)} className={`${row} w-full text-left hover:bg-slate-100`} title={`${t("chat.download")}: ${a.name}`}>
                <AttachmentIcon kind={attachmentTypeOf(a.key)?.kind ?? null} size={14} />
                <span className="min-w-0 flex-1 truncate text-slate-700">{a.name}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{fmtBytes(a.size)}</span>
                <Download size={13} className="shrink-0 text-slate-400" />
              </button>
            </li>
          ) : (
            <li key={a.id} className="min-w-0">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className={`${row} hover:bg-slate-100`} title={a.url}>
                <AttachmentIcon kind="url" size={14} />
                <span className="min-w-0 flex-1 truncate text-blue-700">{a.url}</span>
                <ExternalLink size={13} className="shrink-0 text-slate-400" />
              </a>
            </li>
          ),
        )}
      </ul>
      <HelpTip text={t("ws.materialsNote")} className="mt-1" />
    </div>
  );
}
