import { ChevronDown, ChevronRight, History, Loader2, Table2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { BraChangeSummary, BraTableDiff, BraVersionDetailResponse, BraVersionDiffResponse, BraVersionListItem, ListBraVersionsResponse, ProjectBradbResponse, ProjectRecord } from "@cobrac/shared";
import { BRA_TABLES, parseBraVersionId, versionFileKey } from "@cobrac/shared";
import { useI18n, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { fmtBytes, fmtDate } from "../../lib/format";
import type { TableSource } from "../../lib/table";
import { BradbPanel } from "./BradbPanel";
import { TablesView } from "./TablesView";

const ORIGIN_LABEL: Record<BraVersionListItem["origin"], MessageKey> = { job: "ver.origin.job", baseline: "ver.origin.baseline", live: "ver.origin.live" };
const ORIGIN_TONE: Record<BraVersionListItem["origin"], string> = {
  job: "bg-emerald-50 text-emerald-700 border-emerald-200",
  baseline: "bg-slate-100 text-slate-600 border-slate-200",
  live: "bg-amber-50 text-amber-800 border-amber-200",
};

const short = (s: string | null | undefined, n = 12) => (s ? s.slice(0, n) : "—");

function totals(s: BraChangeSummary | null) {
  if (!s) return null;
  return BRA_TABLES.reduce((acc, t) => ({ added: acc.added + s[t].added, removed: acc.removed + s[t].removed, changed: acc.changed + s[t].changed }), { added: 0, removed: 0, changed: 0 });
}

function ChangeChips({ summary }: { summary: BraChangeSummary | null }) {
  const t = totals(summary);
  if (!t) return null;
  if (t.added + t.removed + t.changed === 0) return <span className="text-[11px] text-slate-400">±0</span>;
  return (
    <span className="flex gap-1.5 font-mono text-[11px]">
      {t.added > 0 && <span className="text-emerald-700">+{t.added}</span>}
      {t.removed > 0 && <span className="text-rose-700">−{t.removed}</span>}
      {t.changed > 0 && <span className="text-blue-700">~{t.changed}</span>}
    </span>
  );
}

/** Versions of the project's BRA data: list, details, tables and the row-level changes. `?v=` selects one. */
export function VersionsView({ projectId, project }: { projectId: string; project: ProjectRecord }) {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<ListBraVersionsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bradb, setBradb] = useState<ProjectBradbResponse | null>(null);
  const [bradbTick, setBradbTick] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .bradb(projectId)
      .then((r) => live && setBradb(r))
      .catch(() => live && setBradb(null));
    return () => {
      live = false;
    };
  }, [projectId, bradbTick]);

  useEffect(() => {
    let live = true;
    api
      .versions(projectId)
      .then((r) => live && setList(r))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, project.revision, project.latestVersion?.versionId]);

  const selected = useMemo(() => {
    if (!list) return null;
    const n = Number(params.get("v"));
    return list.items.find((i) => i.version === n) ?? list.items[0] ?? null;
  }, [list, params]);

  const select = (n: number) => {
    const next = new URLSearchParams(params);
    next.set("v", String(n));
    next.delete("file");
    next.delete("sheet");
    setParams(next, { replace: true });
  };

  if (err) return <div className="p-6 text-sm text-rose-600">{err}</div>;
  if (!list) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden" data-testid="versions-view">
      <aside className="shrink-0 border-b border-slate-200 bg-white lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <History size={15} className="text-blue-600" /> {t("ver.title")}
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{t("ver.help")}</p>
        </div>
        {list.items.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-slate-500">{list.clonedFrom ? t("ver.noneClone", { parent: list.clonedFrom }) : t("ver.none")}</p>
        ) : (
          <ol className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible" aria-label={t("ver.title")}>
            {list.items.map((i) => {
              const on = i.version === selected?.version;
              return (
                <li key={i.version} className="min-w-[13rem] lg:min-w-0">
                  <button
                    type="button"
                    onClick={() => select(i.version)}
                    aria-current={on ? "true" : undefined}
                    data-testid={`version-${i.version}`}
                    className={`w-full rounded-md border px-2.5 py-2 text-left text-xs coarse:min-h-11 ${on ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-300" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-800">v{i.version}</span>
                      {i.version === list.current && <span className="rounded bg-blue-600 px-1.5 py-px text-[10px] font-medium text-white">{t("ver.current")}</span>}
                      <span className={`rounded border px-1.5 py-px text-[10px] ${ORIGIN_TONE[i.origin]}`}>{t(ORIGIN_LABEL[i.origin])}</span>
                      <span className="ml-auto">
                        <ChangeChips summary={i.changes} />
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {fmtDate(i.createdAt, locale)}
                      {i.jobType && ` · ${t(i.jobType === "followup" ? "ver.job.followup" : "ver.job.initial")}`}
                      {i.model && ` · ${i.model}`}
                    </span>
                    {i.instruction && <span className="mt-0.5 line-clamp-2 block text-[11px] text-slate-600">“{i.instruction}”</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
      <div className="min-w-0 flex-1 lg:overflow-y-auto">{selected && (
          <VersionDetail
            key={`${selected.version}|${selected.frozen}`}
            projectId={projectId}
            project={project}
            item={selected}
            items={list.items}
            onSelect={select}
            bradb={bradb}
            onBradbChanged={() => setBradbTick((n) => n + 1)}
          />
        )}</div>
    </div>
  );
}

function VersionDetail({
  projectId,
  project,
  item,
  items,
  onSelect,
  bradb,
  onBradbChanged,
}: {
  projectId: string;
  project: ProjectRecord;
  item: BraVersionListItem;
  items: BraVersionListItem[];
  onSelect: (n: number) => void;
  bradb: ProjectBradbResponse | null;
  onBradbChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<BraVersionDetailResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showTables, setShowTables] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const n = item.version;

  useEffect(() => {
    let live = true;
    api
      .version(projectId, n)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, n]);

  const P = project.projectId;
  const files = detail?.files ?? [];
  const tableSources: TableSource[] = files
    .filter((f) => /_(HCD|FRG)\/[^/]+\.json$/.test(f.path) || /_CSV\/[^/]+\.csv$/.test(f.path))
    .map((f) => ({
      key: item.frozen ? versionFileKey(n, f.path) : f.path,
      name: f.path.split("/").pop()!,
      group: f.path.includes("_HCD/") ? "hcd" : f.path.includes("_FRG/") ? "frg" : "csv",
      lastModified: item.createdAt,
    }));
  const parent = item.parentVersionId ? parseBraVersionId(item.parentVersionId) : null;
  const parentHere = parent?.projectId === P && items.some((i) => i.version === parent.version);
  const g = detail?.manifest?.generator;
  const unknown = <span className="text-slate-400">{t("ver.unknown")}</span>;

  const rows: [MessageKey, ReactNode][] = [
    ["ver.created", fmtDate(item.createdAt, locale)],
    [
      "ver.parent",
      item.parentVersionId ? (
        parentHere ? (
          <button type="button" className="font-mono text-blue-700 hover:underline" onClick={() => onSelect(parent!.version)}>
            {item.parentVersionId}
          </button>
        ) : (
          <span className="font-mono">{item.parentVersionId}</span>
        )
      ) : (
        "—"
      ),
    ],
    ["ver.hash", item.contentSha256 ? <span className="font-mono" title={item.contentSha256}>{short(item.contentSha256, 16)}</span> : unknown],
    ["ver.app", g?.appVersion ? <span className="font-mono">v{g.appVersion}{g.gitSha ? ` · ${g.gitSha}` : ""}</span> : unknown],
    ["ver.model", item.model ? <span className="font-mono">{item.model}{item.reasoningEffort ? ` / ${item.reasoningEffort}` : ""}</span> : unknown],
    ["ver.research", g?.researchMode === undefined || g?.researchMode === null ? unknown : t(g.researchMode ? "sys.researchOn" : "sys.researchOff")],
    ["ver.canon", g?.canon ? <span className="font-mono">{g.canon.canonId} · rev {g.canon.revision}</span> : "—"],
    ["ver.sabra", g?.sabraBoundary ? <span className="font-mono">{g.sabraBoundary}{g.rcsBoundaryVersion ? ` · RCS ${g.rcsBoundaryVersion}` : ""}</span> : unknown],
    ["ver.format", g?.braFormat ? <span className="font-mono">{g.braFormat}</span> : unknown],
  ];

  const btn = "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium coarse:min-h-11 disabled:opacity-50";

  return (
    <div className="space-y-4 p-3 sm:p-4" data-testid="version-detail">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono text-base font-semibold text-slate-800">v{n}</h3>
        <span className="break-all font-mono text-xs text-slate-500">{item.versionId}</span>
        <span className={`rounded border px-1.5 py-px text-[10px] ${ORIGIN_TONE[item.origin]}`}>{t(ORIGIN_LABEL[item.origin])}</span>
      </div>
      {item.origin === "live" && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ver.liveNote", { n })}</p>}
      {item.origin === "baseline" && <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">{t("ver.baselineNote")}</p>}
      {err && <p className="text-xs text-rose-600">{err}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{t(k)}</dt>
            <dd className="min-w-0 break-words text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>

      <BradbPanel projectId={projectId} item={item} status={bradb} onChanged={onBradbChanged} />

      <div>
        <button type="button" disabled={tableSources.length === 0} onClick={() => setShowTables((v) => !v)} aria-expanded={showTables} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`} data-testid="version-tables">
          <Table2 size={14} /> {t(showTables ? "ver.hideTables" : "ver.showTables")}
        </button>
      </div>

      {showTables && tableSources.length > 0 && (
        <div className="h-[28rem] overflow-hidden rounded-md border border-slate-200 bg-white">
          <TablesView projectId={projectId} sources={tableSources} />
        </div>
      )}

      <ChangesSection projectId={projectId} item={item} items={items} />

      <section>
        <button type="button" onClick={() => setShowFiles((v) => !v)} aria-expanded={showFiles} className="flex items-center gap-1 text-xs font-semibold text-slate-700 coarse:min-h-11">
          {showFiles ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {t("ver.files", { n: files.length })}
        </button>
        {showFiles && (
          <ul className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-xs">
            {files.map((f) => (
              <li key={f.path} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-slate-700">{f.path}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{fmtBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChangesSection({ projectId, item, items }: { projectId: string; item: BraVersionListItem; items: BraVersionListItem[] }) {
  const t = useI18n().t;
  const others = items.filter((i) => i.version !== item.version);
  const defaultBase = others.find((i) => i.version === item.version - 1)?.version ?? null;
  const [base, setBase] = useState<number | null>(defaultBase);
  const [res, setRes] = useState<BraVersionDiffResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (base === null) return;
    let live = true;
    setRes(null);
    api
      .versionDiff(projectId, item.version, base)
      .then((r) => live && setRes(r))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, item.version, base]);

  return (
    <section data-testid="version-changes">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-700">{t("ver.changes")}</h4>
        {others.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            {t("ver.compareWith")}
            <select value={base ?? ""} onChange={(e) => setBase(e.target.value ? Number(e.target.value) : null)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 coarse:py-2">
              <option value="">—</option>
              {others.map((o) => (
                <option key={o.version} value={o.version}>
                  v{o.version}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {base === null ? (
        <p className="text-xs text-slate-500">{t("ver.noBase")}</p>
      ) : !res ? (
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <Loader2 size={12} className="animate-spin" /> {t("loading")}
        </p>
      ) : res.diff && totals(res.diff.summary)!.added + totals(res.diff.summary)!.removed + totals(res.diff.summary)!.changed === 0 ? (
        <p className="text-xs text-slate-500">{t("ver.noChanges")}</p>
      ) : (
        res.diff && <DiffTables tables={res.diff.tables} />
      )}
    </section>
  );
}

function DiffTables({ tables }: { tables: BraTableDiff[] }) {
  const t = useI18n().t;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white text-xs">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-[11px] text-slate-500">
          <tr>
            <th className="px-2.5 py-1 font-medium">{t("ver.table")}</th>
            <th className="px-2 py-1 text-right font-medium text-emerald-700">{t("ver.added")}</th>
            <th className="px-2 py-1 text-right font-medium text-rose-700">{t("ver.removed")}</th>
            <th className="px-2 py-1 text-right font-medium text-blue-700">{t("ver.changed")}</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((d) => {
            const count = d.added.length + d.removed.length + d.changed.length;
            const isOpen = open === d.table;
            return (
              <Fragment key={d.table}>
                <tr className={`border-t border-slate-100 ${count ? "cursor-pointer hover:bg-slate-50" : "text-slate-400"}`} onClick={() => count && setOpen(isOpen ? null : d.table)}>
                  <td className="px-2.5 py-1.5">
                    <span className="flex items-center gap-1">
                      {count ? isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="w-3" />}
                      {d.table}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{d.added.length || ""}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{d.removed.length || ""}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{d.changed.length || ""}</td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td colSpan={4} className="px-2.5 py-2">
                      <ul className="space-y-1 text-[11px]">
                        {d.added.map((k) => (
                          <li key={`a${k}`} className="break-all font-mono text-emerald-700">
                            + {k}
                          </li>
                        ))}
                        {d.removed.map((k) => (
                          <li key={`r${k}`} className="break-all font-mono text-rose-700">
                            − {k}
                          </li>
                        ))}
                        {d.changed.map((c) => (
                          <li key={`c${c.key}`}>
                            <span className="break-all font-mono text-blue-700">~ {c.key}</span>
                            <ul className="ml-4 mt-0.5 space-y-0.5">
                              {c.fields.map((f) => (
                                <li key={f.field} className="break-words">
                                  <span className="text-slate-500">{f.field}:</span> <del className="text-rose-700/80">{f.before || "∅"}</del> → <ins className="text-emerald-700 no-underline">{f.after || "∅"}</ins>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
