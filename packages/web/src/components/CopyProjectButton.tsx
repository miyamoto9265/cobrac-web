import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectRecord } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { notifyProjectsChanged } from "../lib/projectList";
import { useWorkspace } from "../lib/workspace";

/**
 * 「コピー」: a copy of a finished project into the personal workspace or a team's (a teammate's work kept for oneself,
 * or a personal project put into a team). The original stays as it is.
 */
export function CopyProjectButton({ project, own }: { project: ProjectRecord; own: boolean }) {
  const t = useT();
  const { teams } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  // where a copy can go: the personal workspace (unless it is the caller's own personal project) and the caller's other teams
  const targets: { teamId: string | null; label: string }[] = [
    ...(own && !project.teamId ? [] : [{ teamId: null, label: t("team.copyTo.personal") }]),
    ...(teams ?? []).filter((x) => x.teamId !== project.teamId || !own).map((x) => ({ teamId: x.teamId, label: t("team.copyTo.team", { name: x.name }) })),
  ];
  if (!project.hasArtifacts || targets.length === 0) return null;
  const copy = async (teamId: string | null) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.copyProject(project.projectId, teamId);
      setDone(r.projectId);
      setOpen(false);
      notifyProjectsChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        title={t("team.copyHelp")}
        data-testid="project-copy"
        className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11"
      >
        <Copy size={12} /> {t("team.copy")}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="menu">
          {targets.map((x) => (
            <button key={x.teamId ?? "personal"} type="button" role="menuitem" onClick={() => void copy(x.teamId)} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50">
              {x.label}
            </button>
          ))}
        </div>
      )}
      {(done || err) && (
        <div className={`absolute right-0 z-20 mt-1 w-56 rounded-md px-3 py-2 text-xs shadow ${err ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`} role="status">
          {err ?? (
            <>
              {t("team.copied")}{" "}
              <Link to={`/projects/${encodeURIComponent(done!)}`} className="font-medium underline" onClick={() => setDone(null)}>
                {t("team.copyOpen")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
