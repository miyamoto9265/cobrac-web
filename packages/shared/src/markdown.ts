import { normalizeHeader } from "./csv.js";

export interface MdTable {
  /** Nearest markdown heading above the table (without #), or null */
  heading: string | null;
  headers: string[];
  rows: string[][];
}

const SEP_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Split one GFM table row into trimmed cells; `\|` is a literal pipe. */
export function splitMdRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** All GFM tables in a markdown document (tables inside fenced code blocks are ignored). */
export function parseMdTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const tables: MdTable[] = [];
  let heading: string | null = null;
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      heading = h[1].trim();
      continue;
    }
    if (!line.startsWith("|") || !SEP_RE.test(lines[i + 1]?.trim() ?? "")) continue;
    const headers = splitMdRow(line);
    const rows: string[][] = [];
    let j = i + 2;
    // a row followed by a separator starts the next table
    for (; j < lines.length && lines[j].trim().startsWith("|") && !SEP_RE.test(lines[j + 1]?.trim() ?? ""); j++) rows.push(splitMdRow(lines[j]));
    tables.push({ heading, headers, rows });
    i = j - 1;
  }
  return tables;
}

/** Remove markdown decoration from a cell: backticks, bold markers and `<br>` (→ newline). */
export function cleanCell(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function tableObjects(t: MdTable): Record<string, string>[] {
  return t.rows
    .filter((r) => r.some((c) => cleanCell(c) !== ""))
    .map((cells) => {
      const obj: Record<string, string> = {};
      t.headers.forEach((h, idx) => {
        const key = cleanCell(h);
        if (key) obj[key] = cleanCell(cells[idx] ?? "");
      });
      return obj;
    });
}

export function hasHeader(t: MdTable, name: string): boolean {
  const n = normalizeHeader(name);
  return t.headers.some((h) => normalizeHeader(cleanCell(h)) === n);
}

/** First table (optionally under a heading matching `heading`) that has every required header. */
export function findTable(md: string, required: string[], heading?: RegExp): MdTable | null {
  const tables = parseMdTables(md);
  const ok = (t: MdTable) => required.every((r) => hasHeader(t, r));
  if (heading) {
    const t = tables.find((x) => x.heading && heading.test(x.heading) && ok(x));
    if (t) return t;
  }
  return tables.find(ok) ?? null;
}

const idFromHeading = (h: string | null) => (h ? (/^`?([A-Za-z][\w.\-]*)`?/.exec(h.trim())?.[1] ?? "") : "");

export interface MergedRecords {
  /** Records keyed by the key column, in first-seen order */
  records: Record<string, string>[];
  /** Every column / field name seen for these records */
  columns: Set<string>;
  /** Number of tables that contributed */
  tables: number;
}

/**
 * Collect records identified by `keys` (e.g. "Circuit ID") from every table of a document and merge them by ID.
 * Handles one wide table, the same entity split over several tables (later non-empty cells win), and vertical
 * two-column "field | value" tables (one per entity, ID from a key row or from the heading above).
 */
export function collectRecords(md: string, keys: string[], expectedFields: string[] = []): MergedRecords {
  const norm = new Set(keys.map(normalizeHeader));
  const expected = new Set(expectedFields.map(normalizeHeader));
  const byId = new Map<string, Record<string, string>>();
  const columns = new Set<string>();
  let tables = 0;
  const add = (rec: Record<string, string>, id: string) => {
    if (!id) return;
    const cur = byId.get(id) ?? {};
    for (const [k, v] of Object.entries(rec)) {
      columns.add(k);
      if (v || !(k in cur)) cur[k] = v;
    }
    byId.set(id, cur);
  };
  for (const t of parseMdTables(md)) {
    const keyHeader = t.headers.map(cleanCell).find((h) => norm.has(normalizeHeader(h)));
    if (keyHeader) {
      tables++;
      for (const r of tableObjects(t)) add(r, r[keyHeader] ?? "");
      continue;
    }
    if (t.headers.length !== 2) continue;
    const rec: Record<string, string> = {};
    for (const [k, v] of t.rows) if (cleanCell(k ?? "")) rec[cleanCell(k)] = cleanCell(v ?? "");
    const keyField = Object.keys(rec).find((k) => norm.has(normalizeHeader(k)));
    const id = keyField ? rec[keyField] : idFromHeading(t.heading);
    const known = Object.keys(rec).filter((k) => expected.has(normalizeHeader(k))).length;
    if (!id || known < 2) continue;
    tables++;
    rec[keyField ?? keys[0]] = id;
    add(rec, id);
  }
  return { records: [...byId.values()], columns, tables };
}

/** Rows of every table that has all `required` headers, concatenated. */
export function collectRows(md: string, required: string[]): { rows: Record<string, string>[]; tables: MdTable[] } {
  const tables = parseMdTables(md).filter((t) => required.every((r) => hasHeader(t, r)));
  return { rows: tables.flatMap(tableObjects), tables };
}

/** Column lookup that only accepts exact (normalized) header matches. */
export function cell(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const target = normalizeHeader(n);
    for (const [k, v] of Object.entries(row)) if (normalizeHeader(k) === target) return v;
  }
  return "";
}
