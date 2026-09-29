import type { ArtifactInfo } from "@cobrac/shared";
import { FRG_FILES, HCD_FILES, parseCsv } from "@cobrac/shared";

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

export type TableGroup = "hcd" | "frg" | "csv";
export interface TableSource {
  key: string;
  name: string;
  group: TableGroup;
  lastModified: string;
}

const HCD_ORDER: string[] = [HCD_FILES.uc, HCD_FILES.connections, HCD_FILES.references];
const FRG_ORDER: string[] = [FRG_FILES.frg];
const CSV_ORDER = ["Project.csv", "Circuits.csv", "Connections.csv", "FRG.csv", "References.csv"];
const GROUP_ORDER: TableGroup[] = ["hcd", "frg", "csv"];

const rank = (order: string[], name: string) => {
  const i = order.indexOf(name);
  return i < 0 ? order.length : i;
};

/** Artifacts that the table view can show: the harness JSON in `_HCD/` / `_FRG/` and the BRA CSVs in `_CSV/`. */
export function tabularSources(artifacts: ArtifactInfo[]): TableSource[] {
  const out: TableSource[] = [];
  for (const a of artifacts) {
    if ((a.category === "hcd" || a.category === "frg") && /\.json$/i.test(a.name)) out.push({ key: a.key, name: a.name, group: a.category, lastModified: a.lastModified });
    else if (a.category === "csv" && /\.csv$/i.test(a.name)) out.push({ key: a.key, name: a.name, group: "csv", lastModified: a.lastModified });
  }
  const order = (s: TableSource) => (s.group === "hcd" ? HCD_ORDER : s.group === "frg" ? FRG_ORDER : CSV_ORDER);
  return out.sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || rank(order(a), a.name) - rank(order(b), b.name) || a.name.localeCompare(b.name),
  );
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x !== null ? JSON.stringify(x) : cellText(x))).join("; ");
  return JSON.stringify(v);
}

function sheetFromRecords(name: string, items: unknown[]): Sheet {
  const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!items.every(isRecord)) return { name, columns: ["value"], rows: items.map((x) => [cellText(x)]) };
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const it of items)
    for (const k of Object.keys(it))
      if (k !== "$schema" && !seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
  return { name, columns, rows: items.map((it) => columns.map((c) => cellText(it[c]))) };
}

/**
 * Harness JSON → sheets. Each top-level array becomes one sheet (connections.json has `bif` and `connections`);
 * remaining scalar fields go to a key/value sheet. Throws on invalid JSON.
 */
export function sheetsFromJson(text: string, fallbackName = "rows"): Sheet[] {
  const data: unknown = JSON.parse(text);
  if (Array.isArray(data)) return [sheetFromRecords(fallbackName, data)];
  if (typeof data !== "object" || data === null) return [{ name: fallbackName, columns: ["value"], rows: [[cellText(data)]] }];
  const sheets: Sheet[] = [];
  const fields: string[][] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "$schema") continue;
    if (Array.isArray(v)) sheets.push(sheetFromRecords(k, v));
    else fields.push([k, cellText(v)]);
  }
  if (fields.length) sheets.push({ name: sheets.length ? "fields" : fallbackName, columns: ["key", "value"], rows: fields });
  return sheets;
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

export function sheetsFromText(fileName: string, text: string): Sheet[] {
  const base = fileName.replace(/\.[^.]+$/, "");
  return /\.csv$/i.test(fileName) ? [sheetFromCsv(text, base)] : sheetsFromJson(text, base);
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
