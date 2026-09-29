import { GitPullRequest, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CanonDiff } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { canonPullPath } from "../pages/CanonsPage";
import { ConflictList, DiffSummary } from "./CanonDiffView";

/** "Push to Canon": previews the diff, then opens a pull request for the Canon's owner to review. */
export function CanonPushButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<CanonDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDiff(null);
    setErr(null);
    api
      .previewCanonPush(projectId)
      .then((r) => setDiff(r.diff))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, projectId]);

  const push = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.pushToCanon(projectId);
      navigate(canonPullPath(r.pr.canonId, r.pr.prNo));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="canon-push"
        className="flex items-center gap-1 rounded-md border border-violet-300 px-2.5 py-1.5 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50 coarse:min-h-11"
      >
        <GitPullRequest size={12} /> {t("pr.push")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6" onClick={() => !busy && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <GitPullRequest size={18} /> {t("pr.pushTitle")}
            </h2>
            <p className="mb-3 text-xs text-slate-500">{t("pr.pushNote")}</p>
            {!diff && !err && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> {t("loading")}
              </div>
            )}
            {diff && (
              <div className="grid gap-3">
                <DiffSummary diff={diff} />
                <ConflictList conflicts={diff.conflicts} sourceLabel={t("pr.thisProject")} />
              </div>
            )}
            {err && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11">
                {t("del.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void push()}
                disabled={busy || !diff}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 coarse:min-h-11"
              >
                {busy && <Loader2 size={14} className="animate-spin" />} {t("pr.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
