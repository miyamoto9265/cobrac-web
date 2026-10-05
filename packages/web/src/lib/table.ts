import type { ArtifactInfo } from "@cobrac/shared";
import { parseCsv } from "@cobrac/shared";

/** One rectangular table: every row has `columns.length` cells. */
export interface Sheet {
  name: string;
  columns: string[];
  rows: string[][];
}

export type SortDir = "asc" | "desc";
export interface SortState {
  col: number;
  dir: SortDir;
}

export interface TableSource {
  key: string;
  name: string;
  lastModified: string;
}

const CSV_ORDER = ["Project.csv", "Circuits.csv", "Connections.csv", "FRG.csv", "References.csv"];

const rank = (name: string) => {
  const i = CSV_ORDER.indexOf(name);
  return i < 0 ? CSV_ORDER.length : i;
};

/** Artifacts that the table view can show: the BRA CSVs in `_CSV/`, in workflow order. */
export function tabularSources(artifacts: ArtifactInfo[]): TableSource[] {
  return artifacts
    .filter((a) => a.category === "csv" && /\.csv$/i.test(a.name))
    .map((a) => ({ key: a.key, name: a.name, lastModified: a.lastModified }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** CSV → one sheet; the first row is the header. Blank lines are dropped and short rows padded. */
export function sheetFromCsv(text: string, name: string): Sheet {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const header = all[0] ?? [];
  const body = all.slice(1);
  const width = Math.max(header.length, ...body.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => header[i]?.trim() || `#${i + 1}`);
  return { name, columns, rows: body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) };
}

/** Case-insensitive; whitespace-separated terms must all appear somewhere in the row. */
export function filterRows(rows: string[][], query: string): string[][] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  return rows.filter((r) => {
    const hay = r.join("\u0000").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Stable sort by one column; numbers compare numerically and empty cells always go last. */
export function sortRows(rows: string[][], sort: SortState | null): string[][] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => [r, i] as const)
    .sort(([a, ia], [b, ib]) => {
      const x = a[sort.col] ?? "";
      const y = b[sort.col] ?? "";
      if (!x !== !y) return x ? -1 : 1;
      return sign * collator.compare(x, y) || ia - ib;
    })
    .map(([r]) => r);
}

/** Header click cycle: unsorted → ascending → descending → unsorted. */
export function nextSort(cur: SortState | null, col: number): SortState | null {
  if (!cur || cur.col !== col) return { col, dir: "asc" };
  return cur.dir === "asc" ? { col, dir: "desc" } : null;
}
