import { Globe, Layers, ListChecks, Lock, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CanonRecord, PlanSummary } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { planPath } from "../lib/plan";

/** Views of the Canon page (the tabs under its header) */
export const CANON_VIEWS = ["hcd", "tables", "issues", "projects", "pulls", "history", "settings"] as const;
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


const RUNNING: ReadonlySet<PlanSummary["status"]> = new Set(["RUNNING", "PAUSED", "DRAFTING"]);

/** What a Canon's card says about its missions: how many deliver to it, and how many of them are under way. */
export function canonMissionCounts(plans: Pick<PlanSummary, "canonId" | "status">[]): Record<string, { all: number; live: number }> {
  const out: Record<string, { all: number; live: number }> = {};
  for (const p of plans) {
    if (!p.canonId) continue;
    const c = (out[p.canonId] ??= { all: 0, live: 0 });
    c.all += 1;
    if (RUNNING.has(p.status)) c.live += 1;
  }
  return out;
}

/**
 * The Canon page (`/canons`): the owner's Canons as cards (rev, projects, missions under way), the Canons a draft mission
 * will create, then the Canons shared with the owner. A card opens the Canon's graph. The missions are on `/missions`.
 */
export function CanonList() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [canons, setCanons] = useState<CanonRecord[] | null>(null);
  const [shared, setShared] = useState<(CanonRecord & { ownerName: string })[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .listCanons()
      .then((r) => {
        setCanons(r.items);
        setShared(r.shared ?? []);
        setErr(null);
      })
      .catch((e) => setErr(String(e)));
    // the missions only add counts to the cards: the Canons show without them
    api
      .listPlans()
      .then((r) => setPlans(r.items))
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => canonMissionCounts(plans), [plans]);
  // a Canon a mission creates when it starts: not a Canon yet, so its card opens the mission
  const pending = useMemo(() => plans.filter((p) => !p.canonId && p.canonNew && (p.status === "DRAFT" || p.status === "DRAFTING")), [plans]);
  const card = "flex h-full min-w-0 flex-col rounded-2xl border bg-white p-3 transition-colors hover:border-violet-300 hover:bg-violet-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:p-4";

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Layers size={20} className="text-violet-600" aria-hidden /> {t("canon.title")} <HelpTip text={t("canon.intro")} />
          </h1>
          <HelpLink section="canon" />
          <span className="ml-auto">
            <button type="button" onClick={() => setCreating((v) => !v)} aria-expanded={creating} className={primaryBtn} data-testid="canon-new-toggle">
              <Plus size={14} aria-hidden /> {t("cm.newCanon")}
            </button>
          </span>
        </div>
        {creating && (
          <div className="mb-5 max-w-xl motion-safe:animate-fade-in">
            <CreateCanonForm onCreated={(c) => navigate(canonPath(c.canonId))} />
          </div>
        )}
        {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        {canons === null && !err && <p className="text-sm text-slate-400">{t("loading")}</p>}
        {canons !== null && !canons.length && !pending.length && !shared.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center" data-testid="canon-empty">
            <Layers size={28} className="mx-auto mb-2 text-slate-300" aria-hidden />
            <p className="mx-auto max-w-sm text-sm text-slate-600">{t("cm.noCanons")}</p>
          </div>
        )}
        {canons !== null && (canons.length > 0 || pending.length > 0) && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="canon-list">
            {canons.map((c) => {
              const n = counts[c.canonId];
              return (
                <li key={c.canonId} className="min-w-0 motion-safe:animate-fade-in">
                  <Link to={canonPath(c.canonId)} className={`${card} border-slate-200`} data-testid="canon-card" data-canon={c.canonId}>
                    <span className="flex min-w-0 items-start gap-2">
                      <Layers size={15} className="mt-0.5 shrink-0 text-violet-600" aria-hidden />
                      <span className="min-w-0 flex-1 break-words font-semibold text-slate-900">{c.name}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{t("canon.revision", { n: c.headRevision })}</span>
                    </span>
                    {c.policy && <span className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{c.policy}</span>}
                    <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-slate-500">
                      <span>{t("canon.memberCount", { n: c.memberCount })}</span>
                      {n && (
                        <span className="flex items-center gap-1" data-testid="canon-card-missions">
                          <ListChecks size={12} className="text-blue-600" aria-hidden />
                          {n.live > 0 ? <span className="font-medium text-blue-700">{t("cm.canonLive", { n: n.live })}</span> : t("cm.canonMissions", { n: n.all })}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5">
                        <span title={c.visibility === "public" ? t("vis.public") : t("vis.private")}>{c.visibility === "public" ? <Globe size={12} className="text-emerald-600" aria-hidden /> : <Lock size={12} aria-hidden />}</span>
                        <span>{fmtDate(c.updatedAt, locale)}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {pending.map((p) => (
              <li key={p.planId} className="min-w-0 motion-safe:animate-fade-in">
                <Link to={planPath(p.planId)} className={`${card} border-dashed border-slate-300`} data-testid="canon-card-pending">
                  <span className="flex min-w-0 items-start gap-2">
                    <Layers size={15} className="mt-0.5 shrink-0 text-violet-400" aria-hidden />
                    <span className="min-w-0 flex-1 break-words font-semibold text-slate-700">{p.canonNew!.name}</span>
                  </span>
                  <span className="mt-1 text-xs text-slate-500">{t("cm.pendingCanon")}</span>
                  <span className="mt-auto flex min-w-0 items-center gap-1 pt-3 text-xs text-slate-500">
                    <ListChecks size={12} className="shrink-0 text-blue-600" aria-hidden />
                    <span className="truncate">{p.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {shared.length > 0 && (
          <section className="mt-6" data-testid="canon-shared">
            <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
              {t("ed.sharedTitle")} <HelpTip text={t("ed.sharedHelp")} />
            </h2>
            <ul className="grid gap-2">
              {shared.map((c) => (
                <li key={c.canonId}>
                  <Link to={canonPath(c.canonId)} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-violet-300 hover:bg-violet-50/30 coarse:p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 break-words font-medium text-violet-700">{c.name}</span>
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
          </section>
        )}
      </div>
    </div>
  );
}
