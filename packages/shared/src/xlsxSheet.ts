/**
 * Low-level editing of SpreadsheetML worksheets (the XML inside an .xlsx) without a spreadsheet library, so that a
 * workbook exported from Google Sheets keeps everything a library would drop or rewrite (custom sheet views, the
 * `__xludf.DUMMYFUNCTION` wrappers Google uses to round-trip its own functions, validation, conditional formats).
 *
 * Only what the BRA template export needs: read rows and cells, write values, expand shared formulas, and insert
 * rows the way a spreadsheet does (references to the rows below move down, also from other sheets). Pure functions.
 */

// --- cell references ----------------------------------------------------------------------------------------------

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function colLetters(index: number): string {
  let s = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const CELL_RE_SRC = String.raw`(\$?)([A-Z]{1,3})(\$?)(\d+)`;

// --- XML text ------------------------------------------------------------------------------------------------------

export function unescapeXml(s: string): string {
  return s.replace(/&(quot|amp|lt|gt|apos|#x[0-9a-fA-F]+|#\d+);/g, (_, e: string) => {
    if (e === "quot") return '"';
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "apos") return "'";
    return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

/** Escapes text for element content and attribute values; drops characters XML 1.0 does not allow. */
export function escapeXml(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- formulas ------------------------------------------------------------------------------------------------------

type FormulaPart = { kind: "code"; text: string } | { kind: "string"; text: string } | { kind: "dummy"; text: string };

/**
 * Split a formula into code and string literals. The literal argument of `__xludf.DUMMYFUNCTION(...)` (Google's
 * original formula, possibly split into `"a"&"b"` pieces) is joined into one `dummy` part holding the inner formula.
 */
function splitFormula(f: string): FormulaPart[] {
  const parts: FormulaPart[] = [];
  let code = "";
  let i = 0;
  const readString = (): string => {
    let s = "";
    i++;
    while (i < f.length) {
      if (f[i] === '"') {
        if (f[i + 1] === '"') {
          s += '"';
          i += 2;
          continue;
        }
        i++;
        return s;
      }
      s += f[i++];
    }
    return s;
  };
  while (i < f.length) {
    if (f[i] !== '"') {
      code += f[i++];
      continue;
    }
    if (/__xludf\.DUMMYFUNCTION\($/.test(code)) {
      parts.push({ kind: "code", text: code });
      code = "";
      let inner = readString();
      while (f[i] === "&" && f[i + 1] === '"') {
        i++;
        inner += readString();
      }
      parts.push({ kind: "dummy", text: inner });
      continue;
    }
    parts.push({ kind: "code", text: code });
    code = "";
    parts.push({ kind: "string", text: readString() });
  }
  if (code) parts.push({ kind: "code", text: code });
  return parts;
}

/** A string literal; Excel limits each literal to 255 characters, so longer text becomes `"a"&"b"`. */
export function formulaString(s: string): string {
  const pieces: string[] = [];
  const chars = [...s];
  for (let i = 0; i < chars.length || i === 0; i += 250) pieces.push(chars.slice(i, i + 250).join(""));
  return pieces.map((p) => `"${p.replace(/"/g, '""')}"`).join("&");
}

function joinFormula(parts: FormulaPart[]): string {
  return parts.map((p) => (p.kind === "code" ? p.text : formulaString(p.text))).join("");
}

type RefMapper = (ref: { sheet: string | null; colAbs: boolean; col: number; rowAbs: boolean; row: number }) => { col: number; row: number };

const REF_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9_.$!'\]])((?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!)?${CELL_RE_SRC}(?::${CELL_RE_SRC})?(?![0-9A-Za-z_(!])`,
  "g",
);

function mapCode(code: string, map: RefMapper): string {
  return code.replace(REF_RE, (m, prefix: string | undefined, ca1, c1, ra1, r1, ca2, c2, ra2, r2) => {
    const sheet = prefix ? prefix.slice(0, -1).replace(/^'|'$/g, "").replace(/''/g, "'") : null;
    const one = (ca: string, c: string, ra: string, r: string) => {
      const out = map({ sheet, colAbs: !!ca, col: colIndex(c), rowAbs: !!ra, row: Number(r) });
      return `${ca}${colLetters(out.col)}${ra}${out.row}`;
    };
    return (prefix ?? "") + one(ca1, c1, ra1, r1) + (c2 ? ":" + one(ca2, c2, ra2, r2) : "");
  });
}

/** Rewrites every cell reference of a formula (also inside Google's DUMMYFUNCTION text); other literals are kept. */
export function mapFormulaRefs(formula: string, map: RefMapper): string {
  const parts = splitFormula(formula);
  let changed = false;
  for (const p of parts) {
    if (p.kind === "string") continue;
    const next = p.kind === "code" ? mapCode(p.text, map) : mapFormulaRefs(p.text, map);
    if (next !== p.text) {
      p.text = next;
      changed = true;
    }
  }
  return changed ? joinFormula(parts) : formula;
}

/** Formula as copied `dr` rows down and `dc` columns right: relative references move, `$` ones stay. */
export function translateFormula(formula: string, dr: number, dc = 0): string {
  if (!dr && !dc) return formula;
  return mapFormulaRefs(formula, (r) => ({ col: r.colAbs ? r.col : r.col + dc, row: r.rowAbs ? r.row : r.row + dr }));
}

/**
 * Formula after inserting `count` rows before row `at` of `target`: references to that sheet at or below `at` move
 * down (absolute or not). `formulaSheet` is the sheet the formula lives on (null for defined names).
 */
export function shiftFormulaForInsert(formula: string, formulaSheet: string | null, target: string, at: number, count: number): string {
  return mapFormulaRefs(formula, (r) => {
    const sheet = r.sheet ?? formulaSheet;
    return { col: r.col, row: sheet === target && r.row >= at ? r.row + count : r.row };
  });
}

/** `A2:B30 C5` style ranges (no sheet names) after inserting rows. */
export function shiftSqref(sqref: string, at: number, count: number): string {
  return sqref.replace(new RegExp(CELL_RE_SRC, "g"), (_, ca: string, c: string, ra: string, r: string) => `${ca}${c}${ra}${Number(r) >= at ? Number(r) + count : r}`);
}

/**
 * Replaces the fallback of `IFERROR(<google formula>, <fallback>)` (the value Excel shows for a Google-only
 * function). Returns null when the formula does not have that shape.
 */
export function setIferrorFallback(formula: string, fallback: string): string | null {
  if (!formula.startsWith("IFERROR(")) return null;
  let depth = 0;
  let inStr = false;
  let comma = -1;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (inStr) {
      if (ch === '"') {
        if (formula[i + 1] === '"') i++;
        else inStr = false;
      }
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 1) comma = i;
  }
  if (comma < 0 || !formula.endsWith(")")) return null;
  return `${formula.slice(0, comma + 1)}${formulaString(fallback)})`;
}

// --- worksheet -----------------------------------------------------------------------------------------------------

export interface Cell {
  col: number;
  /** Attributes other than `r` (style, type), as written */
  attrs: string;
  /** Inner XML (`<f>`, `<v>`, `<is>`), empty for an empty cell */
  inner: string;
}

export interface Row {
  r: number;
  /** Attributes other than `r` */
  attrs: string;
  /** Raw XML while untouched; parsed cells once edited */
  xml: string | null;
  cells: Cell[] | null;
}

export interface Worksheet {
  name: string;
  head: string;
  rows: Row[];
  tail: string;
}

const ROW_RE = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
const withoutAttr = (attrs: string, name: string) => attrs.replace(new RegExp(`\\s*\\b${name}="[^"]*"`), "");

export function parseWorksheet(name: string, xml: string): Worksheet {
  const open = xml.indexOf("<sheetData>");
  const close = xml.lastIndexOf("</sheetData>");
  if (open < 0 || close < 0) throw new Error(`${name}: no <sheetData>`);
  const body = xml.slice(open + "<sheetData>".length, close);
  const rows: Row[] = [];
  for (const m of body.matchAll(ROW_RE)) {
    const r = Number(attr(m[1], "r"));
    rows.push({ r, attrs: withoutAttr(m[1], "r"), xml: m[3] ?? "", cells: null });
  }
  return { name, head: xml.slice(0, open), rows, tail: xml.slice(close + "</sheetData>".length) };
}

export function rowCells(row: Row): Cell[] {
  if (row.cells) return row.cells;
  const cells: Cell[] = [];
  for (const m of (row.xml ?? "").matchAll(CELL_RE)) {
    const ref = attr(m[1], "r") ?? "";
    cells.push({ col: colIndex(ref.replace(/\d+$/, "")), attrs: withoutAttr(m[1], "r"), inner: m[2] ?? "" });
  }
  row.cells = cells;
  row.xml = null;
  return cells;
}

function rowXml(row: Row): string {
  const inner =
    row.xml ??
    row.cells!.map((c) => `<c r="${colLetters(c.col)}${row.r}"${c.attrs}${c.inner ? `>${c.inner}</c>` : "/>"}`).join("");
  return `<row r="${row.r}"${row.attrs}${inner ? `>${inner}</row>` : "/>"}`;
}

export function serializeWorksheet(ws: Worksheet): string {
  return `${ws.head}<sheetData>${ws.rows.map(rowXml).join("")}</sheetData>${ws.tail}`;
}

export function getRow(ws: Worksheet, r: number): Row | undefined {
  return ws.rows.find((x) => x.r === r);
}

export function getCell(ws: Worksheet, r: number, col: number): Cell | undefined {
  const row = getRow(ws, r);
  return row ? rowCells(row).find((c) => c.col === col) : undefined;
}

/** Formula text (unescaped) of a cell, "" for a cell that uses a shared formula, or null. */
export function cellFormula(c: Cell | undefined): string | null {
  if (!c) return null;
  const m = /<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/.exec(c.inner);
  return m ? unescapeXml(m[1] ?? "") : null;
}

/** Displayed value of a cell: the cached `<v>` of a formula, a shared or inline string, or the number. */
export function cellText(c: Cell | undefined, sharedStrings: string[] = []): string {
  if (!c) return "";
  const t = attr(c.attrs, "t");
  if (t === "inlineStr") return unescapeXml([...c.inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
  const v = /<v>([\s\S]*?)<\/v>/.exec(c.inner)?.[1];
  if (v === undefined) return "";
  if (t === "s") return sharedStrings[Number(v)] ?? "";
  if (t === "b") return v === "1" ? "TRUE" : "FALSE";
  return unescapeXml(v);
}

export function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
}

export type CellValue = string | number | boolean | null;

function putCell(row: Row, col: number, attrs: string, inner: string) {
  const cells = rowCells(row);
  const i = cells.findIndex((c) => c.col >= col);
  if (i >= 0 && cells[i].col === col) cells[i] = { col, attrs, inner };
  else if (i >= 0) cells.splice(i, 0, { col, attrs, inner });
  else cells.push({ col, attrs, inner });
}

/** Writes a constant into a cell, keeping its style. `null` / "" empties it. */
export function setCellValue(ws: Worksheet, r: number, col: number, value: CellValue) {
  const row = getRow(ws, r);
  if (!row) throw new Error(`${ws.name}: row ${r} does not exist`);
  const old = rowCells(row).find((c) => c.col === col);
  const style = old ? attr(old.attrs, "s") : undefined;
  const s = style !== undefined ? ` s="${style}"` : "";
  if (value === null || value === "") putCell(row, col, s, "");
  else if (typeof value === "boolean") putCell(row, col, `${s} t="b"`, `<v>${value ? 1 : 0}</v>`);
  else if (typeof value === "number") putCell(row, col, s, `<v>${value}</v>`);
  else putCell(row, col, `${s} t="inlineStr"`, `<is><t xml:space="preserve">${escapeXml(value)}</t></is>`);
}

/** Sets the value Excel shows for a Google-only formula (its IFERROR fallback and cached value). */
export function setFormulaFallback(ws: Worksheet, r: number, col: number, text: string): boolean {
  const c = getCell(ws, r, col);
  const f = cellFormula(c);
  const next = f !== null ? setIferrorFallback(f, text) : null;
  if (!c || next === null) return false;
  const fAttrs = /<f\b([^>]*)>/.exec(c.inner)?.[1] ?? "";
  c.attrs = withoutAttr(c.attrs, "t") + ' t="str"';
  c.inner = `<f${fAttrs}>${escapeXml(next)}</f><v>${escapeXml(text)}</v>`;
  return true;
}

/** Replaces every shared formula of the sheet by its own formula (so rows can be copied and moved freely). */
export function expandSharedFormulas(ws: Worksheet) {
  const masters = new Map<string, { r: number; col: number; formula: string }>();
  const hasShared = (row: Row) => (row.xml ?? "").includes('t="shared"') || (row.cells ?? []).some((c) => c.inner.includes('t="shared"'));
  const rows = ws.rows.filter(hasShared);
  for (const row of rows) {
    for (const c of rowCells(row)) {
      const m = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(c.inner);
      if (m && /t="shared"/.test(m[1])) masters.set(attr(m[1], "si")!, { r: row.r, col: c.col, formula: unescapeXml(m[2]) });
    }
  }
  for (const row of rows) {
    for (const c of rowCells(row)) {
      const m = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(c.inner);
      if (!m || !/t="shared"/.test(m[1])) continue;
      const master = masters.get(attr(m[1], "si")!);
      if (!master) continue;
      const f = translateFormula(master.formula, row.r - master.r, c.col - master.col);
      c.inner = c.inner.replace(m[0], `<f>${escapeXml(f)}</f>`);
    }
  }
}

/** Row `from` copied to row `to`: styles and formulas (translated), no constants. */
function copyRow(ws: Worksheet, from: Row, to: number): Row {
  const dr = to - from.r;
  const cells = rowCells(from).map((c) => {
    const m = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(c.inner);
    if (!m) return { col: c.col, attrs: withoutAttr(withoutAttr(c.attrs, "t"), "cm"), inner: "" };
    const f = translateFormula(unescapeXml(m[2]), dr);
    const fAttrs = m[1].replace(/\bref="([^"]*)"/, (_, ref: string) => `ref="${ref.replace(/\d+/g, (n) => String(Number(n) + dr))}"`);
    const v = /<v>[\s\S]*?<\/v>/.exec(c.inner)?.[0] ?? "";
    return { col: c.col, attrs: c.attrs, inner: `<f${fAttrs}>${escapeXml(f)}</f>${v}` };
  });
  return { r: to, attrs: from.attrs, xml: null, cells };
}

function shiftCellFormulas(c: Cell, formulaSheet: string, target: string, at: number, count: number) {
  if (!c.inner.includes("<f")) return;
  c.inner = c.inner.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/, (all, fAttrs: string, text: string) => {
    const f = unescapeXml(text);
    const next = shiftFormulaForInsert(f, formulaSheet, target, at, count);
    const a = formulaSheet === target ? fAttrs.replace(/\bref="([^"]*)"/, (_, ref: string) => `ref="${shiftSqref(ref, at, count)}"`) : fAttrs;
    return next === f && a === fAttrs ? all : `<f${a}>${escapeXml(next)}</f>`;
  });
}

function shiftRowXml(xml: string, formulaSheet: string, target: string, at: number, count: number): string {
  return xml.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/g, (all, fAttrs: string, text: string) => {
    const f = unescapeXml(text);
    const next = shiftFormulaForInsert(f, formulaSheet, target, at, count);
    const a = formulaSheet === target ? fAttrs.replace(/\bref="([^"]*)"/, (_, ref: string) => `ref="${shiftSqref(ref, at, count)}"`) : fAttrs;
    return next === f && a === fAttrs ? all : `<f${a}>${escapeXml(next)}</f>`;
  });
}

/** Formula references to `target` (for a quick skip of sheets that cannot be affected). */
const mentions = (text: string, target: string) => text.includes(`${target}!`) || text.includes(`'${target}'!`);

/**
 * Inserts `count` rows before row `at` of `ws`, each a copy of row `at - 1` (styles and formulas, no constants),
 * and moves every reference to the rows below in all given sheets, the sheet's ranges (validation, conditional
 * formats, filters, hyperlinks) and the workbook's defined names. Shared formulas must be expanded first.
 */
export function insertRows(ws: Worksheet, at: number, count: number, others: Worksheet[], workbookXml: string): string {
  if (count <= 0) return workbookXml;
  const template = getRow(ws, at - 1);
  if (!template) throw new Error(`${ws.name}: row ${at - 1} does not exist`);
  rowCells(template);
  const target = ws.name;

  for (const sheet of [ws, ...others]) {
    for (const row of sheet.rows) {
      if (row.cells) for (const c of row.cells) shiftCellFormulas(c, sheet.name, target, at, count);
      else if (row.xml && row.xml.includes("<f") && (sheet === ws || mentions(row.xml, target))) row.xml = shiftRowXml(row.xml, sheet.name, target, at, count);
    }
    if (sheet !== ws && mentions(sheet.tail, target)) {
      sheet.tail = sheet.tail.replace(/<formula([12])>([\s\S]*?)<\/formula\1>/g, (_, n, f: string) => `<formula${n}>${escapeXml(shiftFormulaForInsert(unescapeXml(f), sheet.name, target, at, count))}</formula${n}>`);
    }
  }

  const added: Row[] = [];
  for (let i = 0; i < count; i++) added.push(copyRow(ws, template, at + i));
  for (const row of ws.rows) {
    if (row.r < at) continue;
    row.r += count;
    if (row.xml) row.xml = row.xml.replace(/(<c r="[A-Z]+)(\d+)"/g, (_, p: string, n: string) => `${p}${Number(n) + count}"`);
  }
  const idx = ws.rows.findIndex((r) => r.r >= at + count);
  ws.rows.splice(idx < 0 ? ws.rows.length : idx, 0, ...added);

  // ranges of the sheet itself: sqref / ref attributes and validation formulas
  ws.tail = ws.tail
    .replace(/\b(sqref|ref)="([^"]*)"/g, (_, a: string, v: string) => `${a}="${shiftSqref(v, at, count)}"`)
    .replace(/<formula([12])>([\s\S]*?)<\/formula\1>/g, (_, n, f: string) => `<formula${n}>${escapeXml(shiftFormulaForInsert(unescapeXml(f), target, target, at, count))}</formula${n}>`);
  ws.head = ws.head.replace(/<dimension ref="([^"]*)"/, (_, v: string) => `<dimension ref="${shiftSqref(v, at, count)}"`);

  return workbookXml.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g, (all, a: string, f: string) => {
    const next = shiftFormulaForInsert(unescapeXml(f), null, target, at, count);
    return next === unescapeXml(f) ? all : `<definedName${a}>${escapeXml(next)}</definedName>`;
  });
}
