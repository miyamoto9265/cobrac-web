import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectRecord } from "@cobrac/shared";
import { canDeleteProject, projectDisplayName } from "@cobrac/shared";
import { useT } from "../i18n";

type Project = Pick<ProjectRecord, "projectId" | "name" | "status" | "deletedAt">;

/** Confirmation for the soft delete. Stacks its buttons full-width on narrow screens. */
export function DeleteProjectDialog({
  project,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: {
  project: Project;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-body"
        className="w-full max-w-md rounded-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-project-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Trash2 size={18} className="shrink-0 text-rose-600" /> {t("del.title")}
        </h2>
        <p className="mt-2 break-words text-sm font-medium text-slate-800">
          {projectDisplayName(project)} <span className="font-mono text-xs font-normal text-slate-400">{project.projectId}</span>
        </p>
        <p id="delete-project-body" className="mt-2 text-sm text-slate-600">
          {t("del.body")}
        </p>
        {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" autoFocus onClick={onCancel} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11">
            {t("del.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50 coarse:min-h-11"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t("del.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Delete button + confirmation. `onConfirm` may resolve immediately (optimistic callers) or after the request;
 * a rejection keeps the dialog open with the error.
 */
export function DeleteProjectButton({ project, variant, onConfirm }: { project: Project; variant: "icon" | "button"; onConfirm: () => Promise<void> | void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = canDeleteProject(project);
  const label = allowed ? t("delete") : t("del.blocked");

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(t("del.failed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const cls =
    variant === "icon"
      ? "flex items-center justify-center rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 coarse:h-11 coarse:w-11"
      : "flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-600 coarse:min-h-11";

  return (
    <>
      <button
        type="button"
        data-testid="delete-project"
        title={label}
        aria-label={label}
        disabled={!allowed}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={cls}
      >
        <Trash2 size={variant === "icon" ? 15 : 12} />
        {variant === "button" && <span>{t("delete")}</span>}
      </button>
      {open && <DeleteProjectDialog project={project} busy={busy} error={error} onCancel={() => setOpen(false)} onConfirm={() => void confirm()} />}
    </>
  );
}
