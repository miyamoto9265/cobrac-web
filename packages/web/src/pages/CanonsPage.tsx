import { Globe, Layers, Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CanonRecord } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

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

function CreateCanonForm({ onCreated }: { onCreated: (c: CanonRecord) => void }) {
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

export function CanonsPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<CanonRecord[] | null>(null);
  const [shared, setShared] = useState<(CanonRecord & { ownerName: string })[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCanons()
      .then((r) => {
        setItems(r.items);
        setShared(r.shared ?? []);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Layers size={20} /> {t("canon.title")} <HelpTip text={t("canon.intro")} />
        </h1>
        <HelpLink section="canon" />
      </div>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_22rem]">
        <ul className="grid content-start gap-2" data-testid="canon-list">
          {items === null && <li className="text-sm text-slate-400">{t("loading")}</li>}
          {items?.length === 0 && <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">{t("canon.empty")}</li>}
          {items?.map((c) => (
            <li key={c.canonId}>
              <Link to={canonPath(c.canonId)} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words font-medium text-blue-700">{c.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">{c.canonId}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{t("canon.revision", { n: c.headRevision })}</span>
                    <span>{t("canon.memberCount", { n: c.memberCount })}</span>
                    <span className="flex items-center gap-0.5" title={c.visibility === "public" ? t("vis.public") : t("vis.private")}>
                      {c.visibility === "public" ? <Globe size={11} className="text-emerald-600" /> : <Lock size={11} />}
                    </span>
                  </span>
                </div>
                {c.policy && <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{c.policy}</div>}
                <div className="mt-1 text-[11px] text-slate-400">
                  {t("canon.updated")} {fmtDate(c.updatedAt, locale)}
                </div>
              </Link>
            </li>
          ))}
          {shared.length > 0 && (
            <li className="mt-3" data-testid="canon-shared">
              <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                {t("ed.sharedTitle")} <HelpTip text={t("ed.sharedHelp")} />
              </h2>
              <ul className="grid gap-2">
                {shared.map((c) => (
                  <li key={c.canonId}>
                    <Link to={canonPath(c.canonId)} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 break-words font-medium text-blue-700">{c.name}</span>
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">{t("ed.roleEditor")}</span>
                        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{t("canon.revision", { n: c.headRevision })}</span>
                          <span>{t("ed.ownerIs", { name: c.ownerName })}</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
        <CreateCanonForm onCreated={(c) => navigate(canonPath(c.canonId))} />
      </div>
    </div>
  );
}
