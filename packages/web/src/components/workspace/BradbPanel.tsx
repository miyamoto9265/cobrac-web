import { Database, Loader2 } from "lucide-react";
import { useState } from "react";
import type { BradbBlockReason, BradbRegisterResponse, BradbRegistration, BraVersionListItem, ProjectBradbResponse } from "@cobrac/shared";
import { useI18n, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/format";

const STATUS_TONE: Record<BradbRegistration["status"], string> = {
  registered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unchanged: "bg-slate-100 text-slate-600 border-slate-200",
  rejected: "bg-amber-50 text-amber-800 border-amber-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

/** Registration of one version in BRA-DB: what BRA-DB holds, the register button and this version's attempts. */
export function BradbPanel({
  projectId,
  item,
  status,
  onChanged,
  blocked = null,
}: {
  projectId: string;
  item: BraVersionListItem;
  status: ProjectBradbResponse | null;
  onChanged: () => void;
  /** Why this version cannot be registered (hypothesis mode: it contains hypotheses) */
  blocked?: BradbBlockReason | null;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BradbRegisterResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!status?.enabled) return null;

  const holdsThis = status.current?.versionId === item.versionId;
  const canRegister = item.frozen && item.hasBradbPackage && !holdsThis && !blocked;
  const attempts = status.registrations.filter((r) => r.versionId === item.versionId);

  const register = async (allowShrink: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.registerBradb(projectId, item.version, allowShrink);
      setResult(r);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const message = (() => {
    if (!result) return null;
    const r = result.registration;
    if (r.status === "registered") return <p className="text-emerald-700">{t("bradb.registered", { versionId: r.versionId })}</p>;
    if (r.status === "unchanged") return <p className="text-slate-600">{t("bradb.unchanged")}</p>;
    if (result.code === "shrink" && result.shrink)
      return (
        <div className="space-y-1.5 text-amber-800">
          <p>{t("bradb.shrink", { cb: result.shrink.before.circuits, ca: result.shrink.after.circuits, nb: result.shrink.before.connections, na: result.shrink.after.connections })}</p>
          <button type="button" disabled={busy} onClick={() => void register(true)} className="rounded-md border border-amber-500 px-2.5 py-1 font-medium hover:bg-amber-100 coarse:min-h-11 disabled:opacity-50" data-testid="bradb-shrink">
            {t("bradb.shrinkConfirm")}
          </button>
        </div>
      );
    if (result.code === "review_comments") return <p className="text-amber-800">{t("bradb.reviewComments")}</p>;
    return <p className="break-words text-rose-700">{t("bradb.failed", { reason: r.reason ?? r.status })}</p>;
  })();

  return (
    <section className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs" data-testid="bradb-panel">
      <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-700">
        <Database size={13} className="text-indigo-600" /> {t("bradb.title")}
      </h4>
      <p className="text-slate-600" data-testid="bradb-current">
        {status.current
          ? t("bradb.current", { versionId: status.current.versionId, date: fmtDate(status.current.registeredAt, locale), hash: status.current.contentSha256.slice(0, 12) })
          : t("bradb.none")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {holdsThis ? (
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{t("bradb.isCurrent")}</span>
        ) : (
          <button
            type="button"
            disabled={!canRegister || busy}
            onClick={() => void register(false)}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 font-medium text-white hover:bg-indigo-700 coarse:min-h-11 disabled:opacity-50"
            data-testid="bradb-register"
          >
            {busy && <Loader2 size={12} className="animate-spin" />} {t(busy ? "bradb.registering" : "bradb.register", { n: item.version })}
          </button>
        )}
        {!item.hasBradbPackage && <span className="text-slate-500">{t("bradb.needsPackage")}</span>}
        {blocked === "hypotheses" && !holdsThis && (
          <span className="text-amber-800" data-testid="bradb-blocked">
            {t("bradb.hypothesisBlocked")}
          </span>
        )}
      </div>
      {(message || err) && <div className="mt-2">{err ? <p className="text-rose-700">{err}</p> : message}</div>}
      {attempts.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 text-[11px] font-medium text-slate-500">{t("bradb.history")}</div>
          <ul className="space-y-1">
            {attempts.slice(0, 5).map((r) => (
              <li key={r.registrationId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className={`rounded border px-1.5 py-px ${STATUS_TONE[r.status]}`}>{t(`bradb.status.${r.status}` as MessageKey)}</span>
                <span className="text-slate-500">{fmtDate(r.registeredAt, locale)}</span>
                {r.requestedBy && <span className="text-slate-500">· {r.requestedBy}</span>}
                {r.warnings.length > 0 && <span className="text-amber-700">· {t("bradb.warnings", { n: r.warnings.length })}</span>}
                {r.skippedCircuits.length > 0 && <span className="text-slate-500">· {t("bradb.skipped", { ids: r.skippedCircuits.slice(0, 5).join(", ") })}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
