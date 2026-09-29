import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, Search, Table2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { filterRows, nextSort, sheetsFromText, sortRows, type Sheet, type SortState, type TableGroup, type TableSource } from "../../lib/table";

const GROUP_LABEL: Record<TableGroup, string> = { hcd: "HCD (JSON)", frg: "FRG (JSON)", csv: "BRA (CSV)" };

const textCache = new Map<string, string>();

/** Raw tabular artifacts (harness JSON and BRA CSVs) as sortable, filterable tables. File and sheet are kept in the URL. */
export function TablesView({ projectId, sources }: { projectId: string; sources: TableSource[] }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const source = sources.find((s) => s.key === params.get("file")) ?? sources[0] ?? null;
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    let live = true;
    const cacheKey = `${projectId}\u0000${source.key}\u0000${source.lastModified}`;
    const parse = (text: string) => {
      try {
        setSheets(sheetsFromText(source.name, text));
        setErr(null);
      } catch (e) {
        setSheets(null);
        setErr(t("table.parseFail", { err: e instanceof Error ? e.message : String(e) }));
      }
    };
    const cached = textCache.get(cacheKey);
    if (cached !== undefined) return parse(cached);
    setSheets(null);
    setErr(null);
    api
      .artifactText(projectId, source.key)
      .then((text) => {
        textCache.set(cacheKey, text);
        if (live) parse(text);
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, source?.key, source?.lastModified, source?.name, t]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
    setParams(next, { replace: true });
  };

  if (!source) return <Placeholder text={t("table.none")} />;

  const sheet = sheets?.find((s) => s.name === params.get("sheet")) ?? sheets?.[0] ?? null;
  const groups = (["hcd", "frg", "csv"] as TableGroup[]).map((g) => [g, sources.filter((s) => s.group === g)] as const).filter(([, l]) => l.length > 0);

  const download = async () => {
    const { url } = await api.downloadUrl(projectId, source.key);
    window.location.href = url;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-testid="table-source" className="flex shrink-0 gap-x-4 gap-y-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 sm:flex-wrap sm:px-4" aria-label={t("table.source")}>
        {groups.map(([g, list]) => (
          <div key={g} className="flex shrink-0 items-center gap-1">
            <span className="mr-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-400">{GROUP_LABEL[g]}</span>
            {list.map((s) => (
              <button
                key={s.key}
                onClick={() => setParam({ file: s.key, sheet: null })}
                aria-pressed={s.key === source.key}
                className={`whitespace-nowrap rounded-md border px-2 py-1 font-mono text-xs coarse:min-h-11 ${
                  s.key === source.key ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        ))}
      </div>
      {err ? (
        <div className="p-4 text-sm text-rose-600">{err}</div>
      ) : !sheets || !sheet ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> {t("loading")}
        </div>
      ) : (
        <SheetTable
          key={`${source.key}\u0000${sheet.name}`}
          sheet={sheet}
          sheets={sheets}
          onSheet={(name) => setParam({ sheet: name })}
          onDownload={() => void download()}
        />
      )}
    </div>
  );
}

function SheetTable({ sheet, sheets, onSheet, onDownload }: { sheet: Sheet; sheets: Sheet[]; onSheet: (name: string) => void; onDownload: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const indexed = useMemo(() => sheet.rows.map((r, i) => [String(i + 1), ...r]), [sheet]);
  const shown = useMemo(() => sortRows(filterRows(indexed, query), sort && { col: sort.col + 1, dir: sort.dir }), [indexed, query, sort]);

  const toggleRow = (n: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        {sheets.length > 1 && (
          <div className="flex items-center gap-1" role="group" aria-label={t("table.sheet")}>
            {sheets.map((s) => (
              <button
                key={s.name}
                onClick={() => onSheet(s.name)}
                aria-pressed={s.name === sheet.name}
                className={`rounded-full px-2.5 py-0.5 text-xs coarse:min-h-11 ${s.name === sheet.name ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {s.name} <span className="opacity-60">{s.rows.length}</span>
              </button>
            ))}
          </div>
        )}
        <label className="relative flex min-w-[10rem] flex-1 items-center sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2 text-slate-400" />
          <input
            data-testid="table-filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("table.filter")}
            aria-label={t("table.filter")}
            className="w-full rounded-md border border-slate-300 py-1 pl-7 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2 coarse:text-base"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("close")} className="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-700">
              <X size={14} />
            </button>
          )}
        </label>
        <span className="whitespace-nowrap text-xs text-slate-500">{t("table.rows", { shown: shown.length, total: sheet.rows.length })}</span>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-600 coarse:min-h-11">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> {t("table.wrap")}
        </label>
        <button onClick={onDownload} className="ml-auto flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
          <Download size={13} /> {t("chat.download")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {sheet.rows.length === 0 || shown.length === 0 ? (
          <Placeholder text={sheet.rows.length === 0 ? t("table.empty") : t("table.noMatch")} />
        ) : (
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-r border-slate-200 bg-slate-100 px-2 py-1.5 text-right font-medium text-slate-400">#</th>
                {sheet.columns.map((c, i) => {
                  const active = sort?.col === i;
                  const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={`${i}:${c}`}
                      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                      className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 p-0 font-semibold text-slate-700"
                    >
                      <button onClick={() => setSort((s) => nextSort(s, i))} title={t("table.sortTip")} className="flex w-full items-center gap-1 whitespace-nowrap px-2 py-1.5 text-left hover:bg-slate-200 coarse:min-h-11">
                        {c}
                        <Icon size={12} className={active ? "text-blue-600" : "text-slate-300"} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const n = Number(r[0]);
                const open = wrap || expanded.has(n);
                return (
                  <tr key={n} onClick={() => toggleRow(n)} className="cursor-pointer align-top odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/60">
                    <td className="sticky left-0 border-b border-r border-slate-100 bg-inherit px-2 py-1 text-right font-mono text-slate-400">{n}</td>
                    {r.slice(1).map((v, i) => (
                      <td key={i} title={open ? undefined : v} className="border-b border-slate-100 px-2 py-1 text-slate-800">
                        <div className={open ? "min-w-[8rem] max-w-[32rem] whitespace-pre-wrap break-words" : "max-w-[20rem] truncate"}>{v}</div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
      <Table2 size={28} className="text-slate-300" />
      {text}
    </div>
  );
}
