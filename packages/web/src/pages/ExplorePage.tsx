import { Copy, Globe, Layers, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PublicCanonSummary, PublicProjectSummary } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

export const publicProjectPath = (id: string) => `/explore/projects/${encodeURIComponent(id)}`;
export const publicCanonPath = (id: string) => `/explore/canons/${encodeURIComponent(id)}`;

/** Public library: projects and Canons that their owners made public. */
export function ExplorePage() {
  const t = useT();
  const { locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "canons" ? "canons" : "projects";
  const [q, setQ] = useState("");
  const [projects, setProjects] = useState<PublicProjectSummary[] | null>(null);
  const [canons, setCanons] = useState<PublicCanonSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.publicProjects().then((r) => setProjects(r.items)).catch((e) => setErr(String(e)));
    api.publicCanons().then((r) => setCanons(r.items)).catch((e) => setErr(String(e)));
  }, []);

  const s = q.toLowerCase();
  const shownProjects = useMemo(
    () => (projects ?? []).filter((p) => !s || [p.name, p.projectId, p.roi, p.tlf, p.contributor].some((x) => (x ?? "").toLowerCase().includes(s))),
    [projects, s],
  );
  const shownCanons = useMemo(() => (canons ?? []).filter((c) => !s || [c.name, c.canonId, c.policy].some((x) => (x ?? "").toLowerCase().includes(s))), [canons, s]);
  const tabCls = (on: boolean) => `rounded-md px-3 py-1.5 text-sm coarse:min-h-11 ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Globe size={20} /> {t("explore.title")} <HelpTip text={t("explore.intro")} />
        </h1>
        <HelpLink section="public" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={tabCls(tab === "projects")} onClick={() => setParams({})}>
          {t("explore.projects")} {projects ? `(${projects.length})` : ""}
        </button>
        <button type="button" className={tabCls(tab === "canons")} onClick={() => setParams({ tab: "canons" })}>
          {t("explore.canons")} {canons ? `(${canons.length})` : ""}
        </button>
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("explore.search")} className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {tab === "projects" ? (
        <ul className="grid max-w-5xl gap-2 md:grid-cols-2" data-testid="public-projects">
          {projects === null && <li className="text-sm text-slate-400">{t("loading")}</li>}
          {projects !== null && shownProjects.length === 0 && <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 md:col-span-2">{t("explore.empty")}</li>}
          {shownProjects.map((p) => (
            <li key={p.projectId}>
              <Link to={publicProjectPath(p.projectId)} className="block h-full rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 coarse:p-4">
                <div className="break-words font-medium text-blue-700">{p.name}</div>
                <div className="font-mono text-[11px] text-slate-400">{p.projectId}</div>
                <div className="mt-1 break-words text-xs text-slate-600">{[p.roi, p.tlf].filter((x) => x?.trim()).join(" · ")}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                  <span>{p.contributor}</span>
                  <span className="flex items-center gap-0.5">
                    <Copy size={10} /> {t("explore.clones", { n: p.cloneCount })}
                  </span>
                  <span>{fmtDate(p.publishedAt, locale)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid max-w-5xl gap-2 md:grid-cols-2" data-testid="public-canons">
          {canons === null && <li className="text-sm text-slate-400">{t("loading")}</li>}
          {canons !== null && shownCanons.length === 0 && <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 md:col-span-2">{t("explore.empty")}</li>}
          {shownCanons.map((c) => (
            <li key={c.canonId}>
              <Link to={publicCanonPath(c.canonId)} className="block h-full rounded-xl border border-slate-200 bg-white p-3 hover:border-violet-300 coarse:p-4">
                <div className="flex items-center gap-1.5 break-words font-medium text-violet-700">
                  <Layers size={14} className="shrink-0" /> {c.name}
                </div>
                <div className="font-mono text-[11px] text-slate-400">{c.canonId}</div>
                {c.policy && <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{c.policy}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  <span className="font-mono">{t("canon.revision", { n: c.headRevision })}</span>
                  <span>{t("canon.memberCount", { n: c.memberCount })}</span>
                  <span>{fmtDate(c.publishedAt, locale)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
