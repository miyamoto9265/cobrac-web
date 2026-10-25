import { Plus } from "lucide-react";
import { useState } from "react";
import type { CanonRecord } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { useT } from "../i18n";
import { api } from "../lib/api";

/** Views of the Canon page (the tabs under its header) */
export const CANON_VIEWS = ["hcd", "tables", "projects", "pulls", "history", "settings"] as const;
export type CanonView = (typeof CANON_VIEWS)[number];

export const canonPath = (canonId: string, view?: CanonView) => `/canons/${encodeURIComponent(canonId)}${view ? `/${view}` : ""}`;
export const canonPullPath = (canonId: string, no: number) => `${canonPath(canonId)}/pulls/${no}`;

export const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
export const primaryBtn =
  "flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11";

/** Label of the granularity policy field, with its explanation behind a "?". */
export function PolicyLabel() {
  const t = useT();
  return (
    <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
      {t("canon.policy")} <HelpTip text={t("canon.policyHelp")} />
    </span>
  );
}

export function CreateCanonForm({ onCreated }: { onCreated: (c: CanonRecord) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [policy, setPolicy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      onCreated(await api.createCanon({ name, description, policy }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-sm font-semibold">{t("canon.new")}</h2>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("canon.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={200} required />
      </label>
      <div>
        <PolicyLabel />
        <textarea value={policy} onChange={(e) => setPolicy(e.target.value)} rows={3} placeholder={t("canon.policyHint")} className={inputCls} maxLength={2000} aria-label={t("canon.policy")} />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("canon.description")}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} maxLength={2000} />
      </label>
      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div>
        <button type="submit" disabled={busy || !name.trim()} className={primaryBtn}>
          <Plus size={14} /> {t("canon.create")}
        </button>
      </div>
    </form>
  );
}
