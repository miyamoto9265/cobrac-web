import { Loader2, PackageOpen } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { isBraesProjectId, projectDisplayName, suggestBraesProjectId, type ProjectRecord } from "@cobrac/shared";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { HelpTip } from "./HelpTip";

/**
 * "BRAES set": asks for the BRAES Project ID (the saved one, else a proposal from the contributor, year and name) and
 * downloads the zip the BRAES submission form needs (braes.ts in shared).
 */
export function BraesDownloadButton({ project, onSaved }: { project: ProjectRecord; onSaved?: (braesProjectId: string) => void }) {
  const { t, locale } = useI18n();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setId(
      project.braesProjectId ??
        suggestBraesProjectId({ contributor: project.contributor, createdAt: project.createdAt, name: projectDisplayName(project), roi: project.roi, tlf: project.tlf }),
    );
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, project]);

  const valid = isBraesProjectId(id.trim());
  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.braesBundle(project.projectId, id.trim(), locale);
      onSaved?.(r.braesProjectId);
      window.location.href = r.url;
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="braes-download"
        onClick={() => setOpen(true)}
        title={t("braes.tip")}
        className="flex items-center gap-1 rounded-md border border-emerald-600 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 coarse:min-h-11"
      >
        <PackageOpen size={14} /> {t("braes.button")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6" onClick={() => !busy && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("braes.title")}
            className="w-full max-w-md rounded-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <PackageOpen size={18} /> {t("braes.title")}
            </h2>
            <p className="mb-3 text-xs text-slate-500">{t("braes.contents")}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (valid && !busy) void download();
              }}
            >
              <label htmlFor={inputId} className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
                {t("braes.idLabel")} <HelpTip text={t("braes.idHelp")} />
              </label>
              <input
                id={inputId}
                data-testid="braes-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                aria-invalid={!valid}
                className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 coarse:min-h-11 ${valid ? "border-slate-300 focus:ring-emerald-200" : "border-rose-400 focus:ring-rose-200"}`}
              />
              {!valid && id.trim() !== "" && <p className="mt-1 text-xs text-rose-600">{t("braes.idInvalid")}</p>}
              {err && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11">
                  {t("del.cancel")}
                </button>
                <button
                  type="submit"
                  data-testid="braes-submit"
                  disabled={busy || !valid}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 coarse:min-h-11"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />} {t("braes.download")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
