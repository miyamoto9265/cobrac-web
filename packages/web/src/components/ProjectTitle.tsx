import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import type { ProjectRecord } from "@cobrac/shared";
import { PROJECT_NAME_MAX, normalizeProjectName, projectDisplayName } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";

/** Project name (primary, editable) with the immutable Project ID as secondary text. */
export function ProjectTitle({ project, onRenamed }: { project: ProjectRecord; onRenamed: (p: ProjectRecord) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);

  const start = () => {
    setValue(projectDisplayName(project));
    setErr(null);
    setDup(null);
    setEditing(true);
  };

  const save = async () => {
    const n = normalizeProjectName(value);
    if ("error" in n) return setErr(n.error);
    setBusy(true);
    try {
      const r = await api.renameProject(project.projectId, n.name);
      onRenamed(r.project);
      setDup(r.duplicates.length ? n.name : null);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="min-w-0 flex-1">
        <form
          className="flex min-w-0 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            value={value}
            maxLength={PROJECT_NAME_MAX * 2}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            aria-label={t("chat.rename")}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button type="submit" disabled={busy} title={t("save")} aria-label={t("save")} className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 coarse:min-h-11 coarse:min-w-11">
            <Check size={16} />
          </button>
          <button type="button" onClick={() => setEditing(false)} title={t("chat.renameCancel")} aria-label={t("chat.renameCancel")} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 coarse:min-h-11 coarse:min-w-11">
            <X size={16} />
          </button>
        </form>
        {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="min-w-0 break-words text-base font-semibold">{projectDisplayName(project)}</h1>
        <button type="button" onClick={start} title={t("chat.rename")} aria-label={t("chat.rename")} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 coarse:min-h-11 coarse:min-w-11">
          <Pencil size={14} />
        </button>
      </div>
      <div className="font-mono text-[11px] text-slate-400">{project.projectId}</div>
      {dup && <div className="mt-1 text-xs text-amber-700">{t("chat.nameDup", { name: dup })}</div>}
    </div>
  );
}
