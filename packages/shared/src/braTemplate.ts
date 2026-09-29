/**
 * The BRA data in the official Template-v2-2.bra workbook (the Google Sheets template of the BRA Data Preparation
 * Manual, exported as xlsx), next to CoBRAC's own xlsx.
 *
 * The template is the base: its sheets, header rows, formulas, AdminOnly lists, validation and the WholeBIF rows it
 * imports stay as they are. Only the contributor-input cells are written; the automatic and admin columns keep their
 * formulas (the value Excel shows for a Google-only formula is set to what Google Sheets would compute, where CoBRAC
 * knows it). When a sheet needs more rows than the template's input area, rows are inserted above the WholeBIF
 * import, as a contributor would do.
 *
 * Input: the five CSVs of the project (any CoBRAC-v1-x layout), optionally references.json, reference_check.json and
 * the worker's bibliography.json. Pure (no fs); the caller reads the template file.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { buildBibtex, bibKeyOfDoi, bibKeyOfPmid, templateReferenceIds, type BibRecord, type BibliographyFile } from "./bibtex.js";
import { OUT_OF_ROI_CAPABILITY, roiCircuitId } from "./bra.js";
import { parseCsv } from "./csv.js";
import type { RefRow } from "./harness.js";
import { normalizeDoi, normalizePmid, parseRefId, type RefCheck } from "./references.js";
import { parseCircuitId, parseUcDescriptor } from "./ucNaming.js";
import {
  cellFormula,
  cellText,
  colIndex,
  colLetters,
  expandSharedFormulas,
  getCell,
  getRow,
  insertRows,
  parseSharedStrings,
  parseWorksheet,
  rowCells,
  serializeWorksheet,
  setCellValue,
  setFormulaFallback,
  type CellValue,
  type Worksheet,
} from "./xlsxSheet.js";

/** File name of the template under `prompts/templates/`. */
export const BRA_TEMPLATE_FILE = "Template-v2-2.bra.xlsx";
/** BRA version the template itself declares (Project!E2). */
export const BRA_TEMPLATE_VERSION = "Template-v2-2.bra";
/** Suffix of the exported workbook: `output/{P}.template-v2-2.bra.xlsx`. */
export const TEMPLATE_XLSX_SUFFIX = ".template-v2-2.bra.xlsx";
export const templateXlsxKey = (projectId: string) => `output/${projectId}${TEMPLATE_XLSX_SUFFIX}`;

export const TEMPLATE_DATA_SHEETS = ["Project", "References", "Circuits", "Connections", "FRG"] as const;
export type TemplateSheet = (typeof TEMPLATE_DATA_SHEETS)[number];

/**
 * Input area of each data sheet in Template-v2-2: rows 2..`last`; more rows are inserted before `insertAt` (copies of
 * row `insertAt - 1`). `importRow` is the first WholeBIF row (IMPORTRANGE), checked so a changed template fails loudly.
 */
const LAYOUT: Record<Exclude<TemplateSheet, "Project">, { last: number; insertAt: number; importRow: number | null }> = {
  References: { last: 29, insertAt: 30, importRow: 31 },
  Circuits: { last: 31, insertAt: 32, importRow: 33 },
  Connections: { last: 80, insertAt: 81, importRow: 82 },
  FRG: { last: 198, insertAt: 198, importRow: null },
};

const C = colIndex;
const MECHANISM_TAG = "<<mechanism to realize the capability>>";

export interface TemplateExportInput {
  projectId: string;
  contributor: string;
  /** Project ROI (name of the ROI row when Circuits.csv has none) */
  roi?: string;
  csv: { project: string; references: string; circuits: string; connections: string; frg: string };
  /** references.json entries (title, journal, PMID) */
  references?: RefRow[];
  /** reference_check.json `checks` (record found for each DOI / PMID) */
  referenceChecks?: RefCheck[];
  /** bibliography.json from the worker */
  bibliography?: BibliographyFile | null;
}

export interface TemplateExportResult {
  bytes: Uint8Array;
  /** Rows written per sheet (the ROI row counts in Circuits) */
  rows: Record<Exclude<TemplateSheet, "Project">, number>;
  /** What could not be carried over (for the log) */
  notes: string[];
}

// --- CSV input -----------------------------------------------------------------------------------------------------

type Table = { get: (row: string[], ...names: string[]) => string; rows: string[][] };

function table(text: string): Table {
  const [header = [], ...rows] = parseCsv(text);
  const idx = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  return {
    rows: rows.filter((r) => r.some((c) => c.trim())),
    get: (row, ...names) => {
      for (const n of names) {
        const i = idx.get(n.toLowerCase());
        if (i !== undefined) return (row[i] ?? "").trim();
      }
      return "";
    },
  };
}

const splitList = (s: string) =>
  s
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const refIdsIn = (s: string) => s.match(/\[[^\]]+\]/g) ?? (s.trim() ? [s.trim()] : []);
const isNoDoi = (doi: string) => !doi || /^n\/?a$/i.test(doi.trim());

// --- DHBA hierarchy (from the template's WholeBIF rows) ------------------------------------------------------------

export interface DhbaTerm {
  graphOrder: number;
  name: string;
  /** DHBA: Lv.2 … Lv.14 */
  levels: string[];
}

/** DHBA terms by acronym: the WholeBIF Circuits rows with Source of ID `DHBA` (graph_order, name, Lv.2–14). */
export function dhbaTermsFromTemplate(circuits: Worksheet, sharedStrings: string[] = []): Map<string, DhbaTerm> {
  const out = new Map<string, DhbaTerm>();
  const from = LAYOUT.Circuits.importRow!;
  for (const row of circuits.rows) {
    if (row.r < from) continue;
    const xml = row.xml ?? "";
    if (row.cells === null && !xml.includes(">DHBA<")) continue;
    const cells = rowCells(row);
    const v = (col: number) => cellText(cells.find((c) => c.col === col), sharedStrings);
    if (v(C("B")) !== "DHBA") continue;
    const acronym = v(C("A"));
    const go = Number(v(C("D")));
    if (!acronym || !Number.isFinite(go) || out.has(acronym)) continue;
    out.set(acronym, { graphOrder: go, name: v(C("E")), levels: Array.from({ length: 13 }, (_, i) => v(C("F") + i)) });
  }
  return out;
}

type DhbaCells = { graphOrder: number | null; name: string; levels: string[]; note?: string };

/**
 * DHBA columns of a circuit. A whole DHBA term gets its row; a UC finer than one DHBA term gets that term's
 * graph_order plus a decimal (the manual's rule for non-DHBA circuits); BNA anchors have no DHBA hierarchy.
 */
function dhbaCells(id: string, sourceOfId: string, descriptor: string, terms: Map<string, DhbaTerm>, seq: Map<string, number>): DhbaCells {
  const empty = (note?: string): DhbaCells => ({ graphOrder: null, name: "", levels: [], note });
  const head = parseCircuitId(id).head;
  let anchorOnly = sourceOfId === "DHBA";
  if (descriptor) {
    const d = parseUcDescriptor(descriptor);
    if ("errors" in d) return empty();
    const anchors = d.descriptor.anchors;
    if (anchors.some((a) => a.kind !== "homba")) return empty("BNA");
    if (anchors.length !== 1) return empty("several anchors");
    anchorOnly = d.descriptor.facets.length === 0;
  } else if (sourceOfId !== "DHBA") return empty();
  const term = terms.get(head);
  if (!term) return empty(`DHBA acronym ${head} not in the template`);
  if (anchorOnly) return { graphOrder: term.graphOrder, name: term.name, levels: term.levels };
  const n = (seq.get(head) ?? 0) + 1;
  seq.set(head, n);
  return { graphOrder: Number(`${term.graphOrder}.${n}`), name: "", levels: [] };
}

// --- workbook ------------------------------------------------------------------------------------------------------

const SHEET_REL_RE = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g;

/** Worksheet part (`xl/worksheets/sheetN.xml`) of every sheet, by sheet name. */
function sheetPaths(files: Record<string, Uint8Array>): Map<string, string> {
  const wb = strFromU8(files["xl/workbook.xml"]);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(SHEET_REL_RE)) targets.set(m[1], m[2]);
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g)) {
    const t = targets.get(m[2]);
    if (t) out.set(m[1], `xl/${t.replace(/^\/?xl\//, "")}`);
  }
  return out;
}

/** Header row values of the data sheets (as displayed), for checking a file against the template. */
export function templateHeaders(bytes: Uint8Array): Record<TemplateSheet, string[]> {
  const files = unzipSync(bytes);
  const paths = sheetPaths(files);
  const ss = parseSharedStrings(files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : undefined);
  const out = {} as Record<TemplateSheet, string[]>;
  for (const name of TEMPLATE_DATA_SHEETS) {
    const ws = parseWorksheet(name, strFromU8(files[paths.get(name)!]));
    const row = getRow(ws, 1);
    const cells = row ? rowCells(row) : [];
    const last = Math.max(0, ...cells.map((c) => c.col));
    out[name] = Array.from({ length: last }, (_, i) => cellText(cells.find((c) => c.col === i + 1), ss));
  }
  return out;
}

/** Cell texts of one sheet by `A1` address (cached values; for tests and checks). */
export function readTemplateSheet(bytes: Uint8Array, sheet: string): Map<string, { text: string; formula: string | null }> {
  const files = unzipSync(bytes);
  const ws = parseWorksheet(sheet, strFromU8(files[sheetPaths(files).get(sheet)!]));
  const ss = parseSharedStrings(files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : undefined);
  const out = new Map<string, { text: string; formula: string | null }>();
  for (const row of ws.rows) {
    for (const c of rowCells(row)) {
      out.set(`${colLetters(c.col)}${row.r}`, { text: cellText(c, ss), formula: cellFormula(c) });
    }
  }
  return out;
}

// --- export --------------------------------------------------------------------------------------------------------

export function buildTemplateXlsx(template: Uint8Array, input: TemplateExportInput): TemplateExportResult {
  const files = unzipSync(template);
  const paths = sheetPaths(files);
  const ss = parseSharedStrings(files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : undefined);
  const sheets = new Map<string, Worksheet>();
  for (const name of TEMPLATE_DATA_SHEETS) {
    const p = paths.get(name);
    if (!p || !files[p]) throw new Error(`template has no ${name} sheet`);
    sheets.set(name, parseWorksheet(name, strFromU8(files[p])));
  }
  const ws = (n: TemplateSheet) => sheets.get(n)!;
  for (const [name, l] of Object.entries(LAYOUT)) {
    if (l.importRow && !/IMPORTRANGE/.test(cellFormula(getCell(ws(name as TemplateSheet), l.importRow, 1)) ?? "")) {
      throw new Error(`template layout changed: ${name}!A${l.importRow} is not the WholeBIF import`);
    }
  }
  const notes: string[] = [];
  const dhba = dhbaTermsFromTemplate(ws("Circuits"), ss);

  // --- data rows from the CSVs --------------------------------------------------------------------------------------
  const refT = table(input.csv.references);
  const cirT = table(input.csv.circuits);
  const conT = table(input.csv.connections);
  const frgT = table(input.csv.frg);

  const csvRefIds = refT.rows.map((r) => refT.get(r, "Reference ID")).filter(Boolean);
  const cited = [
    ...conT.rows.flatMap((r) => refIdsIn(conT.get(r, "Reference ID"))),
    ...cirT.rows.flatMap((r) => refIdsIn(cirT.get(r, "Source of ID")).filter((x) => x.startsWith("["))),
  ];
  const refIds = [...new Set([...csvRefIds, ...cited])];
  const tid = templateReferenceIds(refIds);
  const tRef = (id: string) => tid.get(id)?.id ?? id.replace(/^\[|\]$/g, "");

  const jsonRefs = new Map((input.references ?? []).map((r) => [r.id, r]));
  const checks = new Map((input.referenceChecks ?? []).map((c) => [c.id, c]));
  const bib = input.bibliography?.records ?? {};

  const references = refIds.map((id) => {
    const row = refT.rows.find((r) => refT.get(r, "Reference ID") === id);
    const j = jsonRefs.get(id);
    const doiRaw = (row ? refT.get(row, "DOI") : "") || j?.doi || "";
    const doi = isNoDoi(doiRaw) ? "" : (normalizeDoi(doiRaw).doi ?? doiRaw.trim());
    const pmid = normalizePmid(j?.pmid).pmid ?? "";
    const record: BibRecord | null = (doi && bib[bibKeyOfDoi(doi)]) || (pmid && bib[bibKeyOfPmid(pmid)]) || null;
    const check = checks.get(id)?.record;
    const alt = (row ? refT.get(row, "Alternative URL") : "") || j?.alternativeUrl || (!doi && pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "");
    const first = check?.firstAuthor || parseRefId(id).author || "";
    const second = /^\[[^,\]]+?\s+(?:and|&)\s+([^,\]]+),/.exec(id)?.[1]?.trim();
    const b = buildBibtex({
      key: tid.get(id)!.key,
      record,
      fallback: {
        authors: first ? [first, ...(second ? [second] : /et al/i.test(id) ? ["others"] : [])] : [],
        title: j?.title || check?.title,
        container: j?.journal || check?.journal,
        year: check?.year ?? parseRefId(id).year,
        doi,
        pmid,
        url: doi ? undefined : alt || undefined,
      },
    });
    return {
      id: tRef(id),
      doi,
      bibtex: b,
      literatureType: (row ? refT.get(row, "Literature type") : "") || j?.literatureType || "",
      alternativeUrl: doi ? "" : alt,
      fromRecord: !!record,
    };
  });
  const withoutRecord = references.filter((r) => !r.fromRecord).length;
  if (withoutRecord) notes.push(`${withoutRecord} reference(s) have no Crossref / PubMed record; their BibTeX is built from references.json and reference_check.json only.`);

  // Circuits: the ROI row first (added for CSVs written before it existed)
  const roiId = roiCircuitId(input.projectId);
  const circuitRows = cirT.rows.map((r) => ({
    id: cirT.get(r, "Circuit ID"),
    source: cirT.get(r, "Source of ID"),
    names: cirT.get(r, "Names"),
    transmitter: cirT.get(r, "Transmitter"),
    modulation: cirT.get(r, "Modulation Type"),
    comments: cirT.get(r, "Comments"),
    descriptor: cirT.get(r, "UC Descriptor"),
    subCircuits: splitList(cirT.get(r, "Sub-Circuits")),
    uniform: cirT.get(r, "Uniform").toUpperCase() !== "FALSE",
  }));
  if (!circuitRows.some((c) => c.id === roiId)) {
    const roiUcs = frgT.rows.filter((r) => frgT.get(r, "Circuit ID") && !/noROI/i.test(frgT.get(r, "Comments"))).map((r) => frgT.get(r, "Circuit ID"));
    circuitRows.unshift({ id: roiId, source: "collection", names: input.roi ?? "", transmitter: "", modulation: "", comments: "Region of interest of the project", descriptor: "", subCircuits: roiUcs, uniform: false });
  }

  const connections = conT.rows.flatMap((r) => {
    const s = conT.get(r, "Sender Circuit ID (sCID)", "Sender Circuit ID");
    const d = conT.get(r, "Receiver Circuit ID (rCID)", "Receiver Circuit ID");
    const sRel = conT.get(r, "sCID relation");
    const rRel = conT.get(r, "rCID relation");
    const ids = refIdsIn(conT.get(r, "Reference ID"));
    return (ids.length ? ids : [""]).map((ref) => ({
      sender: s,
      sRel: sRel || "=",
      sNotation: sRel || conT.get(r, "Notation of sCID in Literature") ? conT.get(r, "Notation of sCID in Literature") : s,
      receiver: d,
      rRel: rRel || "=",
      rNotation: rRel || conT.get(r, "Notation of rCID in Literature") ? conT.get(r, "Notation of rCID in Literature") : d,
      comments: conT.get(r, "Comments"),
      ref: ref ? tRef(ref) : "",
      taxon: conT.get(r, "Taxon"),
      method: conT.get(r, "Measurement method"),
      literature: conT.get(r, "Pointers on literature"),
      figure: conT.get(r, "Pointers on figure"),
    }));
  });

  const frgRows = frgT.rows.map((r) => {
    const capability = frgT.get(r, "Capability");
    const mechanism = frgT.get(r, "Mechanism");
    return {
      node: frgT.get(r, "Node ID"),
      subnodes: splitList(frgT.get(r, "Subnodes")),
      circuit: frgT.get(r, "Circuit ID"),
      projected: splitList(frgT.get(r, "Projected Circuits")),
      cm: capability === OUT_OF_ROI_CAPABILITY && !mechanism ? `${capability}\n${MECHANISM_TAG}\n` : `${capability}\n${MECHANISM_TAG}\n${mechanism}`,
      implementation: frgT.get(r, "Implementation of Uniform Circuit"),
      reqRealization: frgT.get(r, "Requirements Realization by Interface"),
      requirements: frgT.get(r, "Requirements"),
      outputSemantics: frgT.get(r, "Output Semantics"),
      comments: frgT.get(r, "Comments"),
    };
  });

  const counts = { References: references.length, Circuits: circuitRows.length, Connections: connections.length, FRG: frgRows.length };

  // --- room for the rows ----------------------------------------------------------------------------------------------
  let workbook = strFromU8(files["xl/workbook.xml"]);
  const all = [...sheets.values()];
  for (const [name, l] of Object.entries(LAYOUT) as [keyof typeof LAYOUT, (typeof LAYOUT)[keyof typeof LAYOUT]][]) {
    const extra = counts[name] - (l.last - 1);
    if (extra <= 0) continue;
    expandSharedFormulas(ws(name));
    workbook = insertRows(ws(name), l.insertAt, extra, all.filter((x) => x.name !== name), workbook);
  }
  workbook = workbook.replace(/<calcPr\b[^>]*\/>/, '<calcPr fullCalcOnLoad="1"/>');

  const put = (sheet: TemplateSheet, r: number, values: Record<string, CellValue | undefined>) => {
    for (const [col, v] of Object.entries(values)) if (v !== undefined) setCellValue(ws(sheet), r, C(col), clip(v, notes, `${sheet}!${col}${r}`));
  };

  // --- Project ------------------------------------------------------------------------------------------------------
  const projectRows = parseCsv(input.csv.project);
  const description = projectRows[1]?.[3] ?? "";
  put("Project", 2, { A: input.contributor, B: input.projectId, C: input.contributor, D: description });
  const endLine = (n: number) => (n > 0 ? n + 1 : 1);
  const project = ws("Project");
  for (const row of project.rows) {
    const label = cellText(rowCells(row).find((c) => c.col === 1), ss) as TemplateSheet;
    if (label in counts) setCellValue(project, row.r, 2, endLine(counts[label as keyof typeof counts]));
  }

  // --- References ---------------------------------------------------------------------------------------------------
  references.forEach((ref, i) => {
    const r = 2 + i;
    put("References", r, { D: ref.doi, E: ref.bibtex.bibtex, F: ref.literatureType, K: ref.alternativeUrl, L: input.contributor, M: input.projectId });
    const sheet = ws("References");
    setFormulaFallback(sheet, r, C("A"), ref.id);
    setFormulaFallback(sheet, r, C("G"), ref.bibtex.type);
    setFormulaFallback(sheet, r, C("H"), ref.bibtex.authors || "(no BibTex)");
    setFormulaFallback(sheet, r, C("I"), ref.bibtex.title || "(no BibTex)");
    setFormulaFallback(sheet, r, C("J"), ref.bibtex.container || "-");
  });

  // --- Circuits -----------------------------------------------------------------------------------------------------
  const seq = new Map<string, number>();
  const byId = new Map(circuitRows.map((c) => [c.id, c]));
  const roiList = (id: string, seen = new Set<string>()): string => {
    if (seen.has(id)) return "";
    seen.add(id);
    const c = byId.get(id);
    return [`${id};`, ...(c?.subCircuits ?? []).map((s) => roiList(s, seen)).filter(Boolean)].join("\n");
  };
  let bnaRows = 0;
  circuitRows.forEach((c, i) => {
    const r = 2 + i;
    const source = refIdsIn(c.source)[0] ?? "";
    const sourceOfId = source.startsWith("[") ? `[${tRef(source)}]` : source;
    const d = c.id === roiId ? { graphOrder: null, name: "", levels: [] as string[] } : dhbaCells(c.id, source, c.descriptor, dhba, seq);
    if (d.note === "BNA") bnaRows++;
    else if (d.note) notes.push(`Circuits ${c.id}: no DHBA graph_order (${d.note}).`);
    const levels: Record<string, string> = {};
    for (let k = 0; k < 13; k++) levels[String.fromCharCode(70 + k)] = d.levels[k] ?? "";
    put("Circuits", r, {
      A: c.id,
      B: sourceOfId,
      C: c.names,
      D: d.graphOrder,
      E: d.name,
      ...levels,
      S: c.subCircuits.join(";"),
      U: c.uniform,
      V: c.uniform ? c.transmitter : "",
      W: c.uniform ? c.modulation : "",
      AA: [c.comments, c.descriptor ? `UC Descriptor: ${c.descriptor}` : ""].filter(Boolean).join("\n"),
      AB: input.contributor,
      AC: input.projectId,
    });
    setFormulaFallback(ws("Circuits"), r, C("AO"), roiList(c.id));
  });
  if (bnaRows) notes.push(`${bnaRows} circuit(s) anchored on BNA have no DHBA graph_order / name / levels (BNA is not in DHBA).`);

  // --- Connections --------------------------------------------------------------------------------------------------
  connections.forEach((c, i) => {
    put("Connections", 2 + i, {
      A: c.sender,
      B: c.sRel,
      C: c.sNotation,
      D: c.receiver,
      E: c.rRel,
      F: c.rNotation,
      H: c.comments,
      I: c.ref,
      J: c.taxon,
      K: c.method,
      L: c.literature,
      M: c.figure,
      AE: input.contributor,
      AF: input.projectId,
    });
  });

  // --- FRG ----------------------------------------------------------------------------------------------------------
  frgRows.forEach((f, i) => {
    put("FRG", 2 + i, {
      AC: f.node,
      AD: f.subnodes.join(";"),
      AE: f.circuit,
      AF: f.projected.join(";"),
      BA: f.cm,
      BC: f.subnodes.length ? "" : f.implementation,
      BG: f.reqRealization,
      BI: f.requirements,
      BK: f.outputSemantics,
      BM: f.comments,
    });
  });

  // --- write --------------------------------------------------------------------------------------------------------
  const out: Zippable = {};
  for (const [path, data] of Object.entries(files)) out[path] = data;
  for (const [name, sheet] of sheets) out[paths.get(name)!] = strToU8(serializeWorksheet(sheet));
  out["xl/workbook.xml"] = strToU8(workbook);
  return { bytes: zipSync(out, { level: 6 }), rows: counts, notes };
}

const CELL_MAX = 32_767;
function clip(v: CellValue | undefined, notes: string[], where: string): CellValue {
  if (typeof v !== "string" || v.length <= CELL_MAX) return v ?? null;
  notes.push(`${where} was cut to ${CELL_MAX} characters (the xlsx cell limit).`);
  return v.slice(0, CELL_MAX);
}
