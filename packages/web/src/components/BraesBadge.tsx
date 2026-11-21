import { BadgeCheck, Plus, X } from "lucide-react";
import { useState } from "react";
import type { BraesAcceptance } from "@cobrac/shared";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { HelpTip } from "./HelpTip";

/**
 * The 「BRAES採録済み」 mark: a small green pill whose tooltip says when it was set and for which version. With
 * `admin` (site admins), it also offers setting the mark on an unmarked project and removing it from a marked one.
 */
export function BraesBadge({
  accepted,
  revision,
  admin,
  compact = false,
  plain = false,
}: {
  accepted: Pick<BraesAcceptance, "acceptedAt"> & Partial<Pick<BraesAcceptance, "revision">> | null | undefined;
  /** The project's current version, to note a revision made after the mark */
  revision?: number;
  /** Site admins: the project's owner and ID plus a callback with the new mark */
  admin?: { userId: string; projectId: string; canMark: boolean; onChange: (v: BraesAcceptance | null) => void };
  compact?: boolean;
  /** A plain pill with a native tooltip, for use inside a link (no button inside the link) */
  plain?: boolean;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = async (v: boolean) => {
    if (!admin) return;
    if (!v && !window.confirm(t("braes.confirmUnmark"))) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.setBraesAccepted(admin.userId, admin.projectId, v);
      admin.onChange(r.braesAccepted ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!accepted) {
    if (!admin?.canMark) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void set(true)}
          title={t("braes.markTip")}
          data-testid="braes-mark"
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50 coarse:min-h-11"
        >
          <Plus size={11} /> {compact ? t("braes.markShort") : t("braes.mark")}
        </button>
        {err && <span className="text-[11px] text-rose-600">{err}</span>}
      </span>
    );
  }

  const n = accepted.revision ?? 0;
  const tip = [
    n > 0 ? t("braes.tip", { date: fmtDate(accepted.acceptedAt, locale), n }) : t("braes.tipNoVersion", { date: fmtDate(accepted.acceptedAt, locale) }),
    revision !== undefined && n > 0 && revision > n ? t("braes.tipLater", { n: revision }) : "",
  ]
    .filter(Boolean)
    .join(/^(ja|zh)/.test(locale) ? "" : " ");
  const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-medium text-white";
  if (plain)
    return (
      <span className={pill} title={tip} data-testid="braes-badge">
        <BadgeCheck size={12} />
        {t("braes.badge")}
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" data-testid="braes-badge">
      <HelpTip
        text={tip}
        label={t("braes.badge")}
        triggerClassName={`${pill} hover:bg-emerald-800`}
      >
        <BadgeCheck size={12} />
        {t("braes.badge")}
      </HelpTip>
      {admin && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void set(false)}
          title={t("braes.unmark")}
          aria-label={t("braes.unmark")}
          data-testid="braes-unmark"
          className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50 coarse:min-h-11 coarse:px-2"
        >
          <X size={11} />
        </button>
      )}
      {err && <span className="text-[11px] text-rose-600">{err}</span>}
    </span>
  );
}
