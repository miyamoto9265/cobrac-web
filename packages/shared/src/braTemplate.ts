/**
 * The BRA data in the official Template-v2-3.bra workbook (the Google Sheets template of the BRA Data Preparation
 * Manual, exported as xlsx), next to CoBRAC's own xlsx.
 *
 * The template is the base: its sheets, header rows, formulas, AdminOnly lists, validation and the WholeBIF import
 * stay as they are (the bundled copy keeps only the first WholeBIF row of References and Connections; Google Sheets
 * fills the rest when the workbook is opened; see scripts/slim-bra-template.mjs). Only the contributor-input cells are written; the automatic and admin columns keep their
 * formulas (the value Excel shows for a Google-only formula is set to what Google Sheets would compute, where CoBRAC
 * knows it). When a sheet needs more rows than the template's input area, rows are inserted above the WholeBIF
 * import, as a contributor would do.
 *
 * Input: the five CSVs of the project (any CoBRAC-v1-x layout), optionally references.json, reference_check.json and
 * the worker's bibliography.json. Pure (no fs); the caller reads the template file.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  buildBibtex,
  bibKeyOfDoi,
  bibKeyOfPmid,
  templateReferenceIds,
  type BibRecord,
  type BibliographyFile,
} from "./bibtex.js";
import { roiCircuitId } from "./bra.js";
import { parseCsv, toCsv } from "./csv.js";
import type { RefRow } from "./harness.js";
import {
  normalizeDoi,
  normalizePmid,
  parseRefId,
  type RefCheck,
} from "./references.js";
import { parseCircuitId, parseUcDescriptor, sabraAbbr } from "./ucNaming.js";
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
export const BRA_TEMPLATE_FILE = "Template-v2-3.bra.xlsx";
/** BRA version the template itself declares (Project!E2). */
export const BRA_TEMPLATE_VERSION = "Template-v2-3.bra";
/** Suffix of the exported workbook: `output/{P}.template-v2-3.bra.xlsx`. */
export const TEMPLATE_XLSX_SUFFIX = ".template-v2-3.bra.xlsx";
export const templateXlsxKey = (projectId: string) =>
  `output/${projectId}${TEMPLATE_XLSX_SUFFIX}`;

export const TEMPLATE_DATA_SHEETS = [
  "Project",
  "References",
  "Circuits",
  "Connections",
  "FRG",
] as const;
export type TemplateSheet = (typeof TEMPLATE_DATA_SHEETS)[number];

/**
 * Input area of each data sheet in Template-v2-3: rows 2..`last`; more rows are inserted before `insertAt` (copies of
 * row `insertAt - 1`). `importRow` is the first WholeBIF row (IMPORTRANGE), checked so a changed template fails loudly.
 */
const LAYOUT: Record<
  Exclude<TemplateSheet, "Project">,
  { last: number; insertAt: number; importRow: number | null }
> = {
  References: { last: 29, insertAt: 30, importRow: 31 },
  Circuits: { last: 31, insertAt: 32, importRow: 33 },
  Connections: { last: 80, insertAt: 81, importRow: 82 },
  FRG: { last: 198, insertAt: 198, importRow: null },
};

const C = colIndex;
const MECHANISM_TAG = "<<mechanism to realize the capability>>";
/** From Template-v2-3, Capability&Mechanism ends with the coding scheme; CoBRAC has none to write, so it stays empty. */
const CODING_SCHEME_TAG = "<<mechanism realized by grainest coding scheme>>";

export interface TemplateExportInput {
  projectId: string;
  contributor: string;
  /** Project ROI (name of the ROI row when Circuits.csv has none) */
  roi?: string;
  csv: {
    project: string;
    references: string;
    circuits: string;
    connections: string;
    frg: string;
  };
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

/** Project files as stored in the workspace (null / undefined = missing); the CSVs are required. */
export interface TemplateSourceFiles {
  csv: Partial<
    Record<
      | "Project.csv"
      | "References.csv"
      | "Circuits.csv"
      | "Connections.csv"
      | "FRG.csv",
      string | null
    >
  >;
  referencesJson?: string | null;
  referenceCheckJson?: string | null;
  bibliographyJson?: string | null;
}

const parseJson = (text: string | null | undefined): unknown => {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const arrayOf = (v: unknown, key: string): Record<string, unknown>[] => {
  const a =
    v && typeof v === "object" ? (v as Record<string, unknown>)[key] : null;
  return Array.isArray(a)
    ? a.filter(
        (x): x is Record<string, unknown> => !!x && typeof x === "object",
      )
    : [];
};
const str = (r: Record<string, unknown>, k: string) =>
  typeof r[k] === "string" ? (r[k] as string).trim() : "";

/** Entries of references.json (lenient: whatever has an `id`); [] when missing or unreadable. */
export function parseReferencesJson(text: string | null | undefined): RefRow[] {
  return arrayOf(parseJson(text), "references")
    .filter((r) => str(r, "id"))
    .map((r) => ({
      id: str(r, "id"),
      doi: str(r, "doi"),
      pmid: str(r, "pmid"),
      title: str(r, "title"),
      journal: str(r, "journal"),
      literatureType: str(r, "literatureType"),
      alternativeUrl: str(r, "alternativeUrl"),
    }));
}

/** Export input from the workspace files; null when a CSV is missing (the project has no BRA data yet). */
export function templateInputFromFiles(
  files: TemplateSourceFiles,
  project: { projectId: string; contributor: string; roi?: string },
): TemplateExportInput | null {
  const c = files.csv;
  if (
    !c["Project.csv"] ||
    !c["References.csv"] ||
    !c["Circuits.csv"] ||
    !c["Connections.csv"] ||
    !c["FRG.csv"]
  )
    return null;
  const references = parseReferencesJson(files.referencesJson);
  const referenceChecks = arrayOf(
    parseJson(files.referenceCheckJson),
    "references",
  ).filter((r) => str(r, "id")) as unknown as RefCheck[];
  const bib = parseJson(files.bibliographyJson) as BibliographyFile | null;
  return {
    ...project,
    csv: {
      project: c["Project.csv"],
      references: c["References.csv"],
      circuits: c["Circuits.csv"],
      connections: c["Connections.csv"],
      frg: c["FRG.csv"],
    },
    references,
    referenceChecks,
    bibliography:
      bib &&
      typeof bib === "object" &&
      bib.records &&
      typeof bib.records === "object"
        ? bib
        : null,
  };
}

// --- CSV input -----------------------------------------------------------------------------------------------------

type Table = {
  get: (row: string[], ...names: string[]) => string;
  rows: string[][];
};

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
const refIdsIn = (s: string) =>
  s.match(/\[[^\]]+\]/g) ?? (s.trim() ? [s.trim()] : []);
const isNoDoi = (doi: string) => !doi || /^n\/?a$/i.test(doi.trim());

// --- DHBA hierarchy (from the template's WholeBIF rows) ------------------------------------------------------------

export interface DhbaTerm {
  graphOrder: number;
  name: string;
  /** DHBA: Lv.2 … Lv.14 */
  levels: string[];
}

/** DHBA terms by acronym: the WholeBIF Circuits rows with Source of ID `DHBA` (graph_order, name, Lv.2–14). */
export function dhbaTermsFromTemplate(
  circuits: Worksheet,
  sharedStrings: string[] = [],
): Map<string, DhbaTerm> {
  const out = new Map<string, DhbaTerm>();
  const from = LAYOUT.Circuits.importRow!;
  for (const row of circuits.rows) {
    if (row.r < from) continue;
    const xml = row.xml ?? "";
    if (row.cells === null && !xml.includes(">DHBA<")) continue;
    const cells = rowCells(row);
    const v = (col: number) =>
      cellText(
        cells.find((c) => c.col === col),
        sharedStrings,
      );
    if (v(C("B")) !== "DHBA") continue;
    const acronym = v(C("A"));
    const go = Number(v(C("D")));
    if (!acronym || !Number.isFinite(go) || out.has(acronym)) continue;
    out.set(acronym, {
      graphOrder: go,
      name: v(C("E")),
      levels: Array.from({ length: 13 }, (_, i) => v(C("F") + i)),
    });
  }
  return out;
}

type DhbaCells = {
  graphOrder: number | null;
  name: string;
  levels: string[];
  note?: string;
};

/**
 * DHBA columns of a circuit. A whole DHBA term gets its row; a UC finer than one DHBA term gets that term's
 * graph_order plus a decimal (the manual's rule for non-DHBA circuits); BNA anchors have no DHBA hierarchy.
 */
function dhbaCells(
  id: string,
  sourceOfId: string,
  descriptor: string,
  terms: Map<string, DhbaTerm>,
  seq: Map<string, number>,
): DhbaCells {
  const empty = (note?: string): DhbaCells => ({
    graphOrder: null,
    name: "",
    levels: [],
    note,
  });
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
  const term =
    terms.get(head) ??
    [...terms].find(([acronym]) => sabraAbbr(acronym) === head)?.[1];
  if (!term) return empty(`DHBA acronym ${head} not in the template`);
  if (anchorOnly)
    return {
      graphOrder: term.graphOrder,
      name: term.name,
      levels: term.levels,
    };
  const n = (seq.get(head) ?? 0) + 1;
  seq.set(head, n);
  return {
    graphOrder: Number(`${term.graphOrder}.${n}`),
    name: "",
    levels: [],
  };
}

// --- workbook ------------------------------------------------------------------------------------------------------

const SHEET_REL_RE =
  /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g;

/** Worksheet part (`xl/worksheets/sheetN.xml`) of every sheet, by sheet name. */
function sheetPaths(files: Record<string, Uint8Array>): Map<string, string> {
  const wb = strFromU8(files["xl/workbook.xml"]);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(SHEET_REL_RE)) targets.set(m[1], m[2]);
  const out = new Map<string, string>();
  for (const m of wb.matchAll(
    /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g,
  )) {
    const t = targets.get(m[2]);
    if (t) out.set(m[1], `xl/${t.replace(/^\/?xl\//, "")}`);
  }
  return out;
}

/** Header row values of the data sheets (as displayed), for checking a file against the template. */
export function templateHeaders(
  bytes: Uint8Array,
): Record<TemplateSheet, string[]> {
  const files = unzipSync(bytes);
  const paths = sheetPaths(files);
  const ss = parseSharedStrings(
    files["xl/sharedStrings.xml"]
      ? strFromU8(files["xl/sharedStrings.xml"])
      : undefined,
  );
  const out = {} as Record<TemplateSheet, string[]>;
  for (const name of TEMPLATE_DATA_SHEETS) {
    const ws = parseWorksheet(name, strFromU8(files[paths.get(name)!]));
    const row = getRow(ws, 1);
    const cells = row ? rowCells(row) : [];
    const last = Math.max(0, ...cells.map((c) => c.col));
    out[name] = Array.from({ length: last }, (_, i) =>
      cellText(
        cells.find((c) => c.col === i + 1),
        ss,
      ),
    );
  }
  return out;
}

/** Cell texts of one sheet by `A1` address (cached values; for tests and checks). */
export function readTemplateSheet(
  bytes: Uint8Array,
  sheet: string,
): Map<string, { text: string; formula: string | null }> {
  const files = unzipSync(bytes);
  const ws = parseWorksheet(
    sheet,
    strFromU8(files[sheetPaths(files).get(sheet)!]),
  );
  const ss = parseSharedStrings(
    files["xl/sharedStrings.xml"]
      ? strFromU8(files["xl/sharedStrings.xml"])
      : undefined,
  );
  const out = new Map<string, { text: string; formula: string | null }>();
  for (const row of ws.rows) {
    for (const c of rowCells(row)) {
      out.set(`${colLetters(c.col)}${row.r}`, {
        text: cellText(c, ss),
        formula: cellFormula(c),
      });
    }
  }
  return out;
}

/** Journal names of the template's journal list (AdminOnly column A below the header, cached values). */
function templateJournals(
  files: Record<string, Uint8Array>,
  paths: Map<string, string>,
  ss: string[],
): string[] {
  const p = paths.get("AdminOnly");
  if (!p || !files[p]) return [];
  const ws = parseWorksheet("AdminOnly", strFromU8(files[p]));
  const out: string[] = [];
  for (const row of ws.rows) {
    if (row.r < 2) continue;
    for (const c of rowCells(row)) {
      if (c.col !== C("A")) continue;
      const t = cellText(c, ss).trim();
      if (t && t !== "-") out.push(t);
    }
  }
  return out;
}

// --- export --------------------------------------------------------------------------------------------------------

type DataSheet = Exclude<TemplateSheet, "Project">;
/** One data row: the input cells by column letter, and the values Excel shows for the template's formula cells. */
type TemplateRecord = {
  values: Record<string, CellValue | undefined>;
  fallbacks: Record<string, string>;
};

interface TemplateData {
  files: Record<string, Uint8Array>;
  paths: Map<string, string>;
  ss: string[];
  sheets: Map<string, Worksheet>;
  project: Record<string, CellValue>;
  records: Record<DataSheet, TemplateRecord[]>;
  counts: Record<DataSheet, number>;
  notes: string[];
}

/** The template's cells for the project's data (shared by the xlsx export and the converter CSVs). */
function templateData(
  template: Uint8Array,
  input: TemplateExportInput,
): TemplateData {
  const files = unzipSync(template);
  const paths = sheetPaths(files);
  const ss = parseSharedStrings(
    files["xl/sharedStrings.xml"]
      ? strFromU8(files["xl/sharedStrings.xml"])
      : undefined,
  );
  const sheets = new Map<string, Worksheet>();
  for (const name of TEMPLATE_DATA_SHEETS) {
    const p = paths.get(name);
    if (!p || !files[p]) throw new Error(`template has no ${name} sheet`);
    sheets.set(name, parseWorksheet(name, strFromU8(files[p])));
  }
  const ws = (n: TemplateSheet) => sheets.get(n)!;
  for (const [name, l] of Object.entries(LAYOUT)) {
    if (
      l.importRow &&
      !/IMPORTRANGE/.test(
        cellFormula(getCell(ws(name as TemplateSheet), l.importRow, 1)) ?? "",
      )
    ) {
      throw new Error(
        `template layout changed: ${name}!A${l.importRow} is not the WholeBIF import`,
      );
    }
  }
  const notes: string[] = [];
  const dhba = dhbaTermsFromTemplate(ws("Circuits"), ss);
  const journals = templateJournals(files, paths, ss);

  // --- data rows from the CSVs --------------------------------------------------------------------------------------
  const refT = table(input.csv.references);
  const cirT = table(input.csv.circuits);
  const conT = table(input.csv.connections);
  const frgT = table(input.csv.frg);

  const csvRefIds = refT.rows
    .map((r) => refT.get(r, "Reference ID"))
    .filter(Boolean);
  const cited = [
    ...conT.rows.flatMap((r) => refIdsIn(conT.get(r, "Reference ID"))),
    ...cirT.rows.flatMap((r) =>
      refIdsIn(cirT.get(r, "Source of ID")).filter((x) => x.startsWith("[")),
    ),
  ];
  const refIds = [...new Set([...csvRefIds, ...cited])];
  const tid = templateReferenceIds(refIds);
  const tRef = (id: string) => tid.get(id)?.id ?? id.replace(/^\[|\]$/g, "");
  /** Citations in free text follow the template's Reference IDs. */
  const cite = (text: string) =>
    text.replace(/\[[^[\]]+\]/g, (m) =>
      tid.has(m) ? `[${tid.get(m)!.id}]` : m,
    );

  const jsonRefs = new Map((input.references ?? []).map((r) => [r.id, r]));
  const checks = new Map((input.referenceChecks ?? []).map((c) => [c.id, c]));
  const bib = input.bibliography?.records ?? {};

  const references = refIds.map((id) => {
    const row = refT.rows.find((r) => refT.get(r, "Reference ID") === id);
    const j = jsonRefs.get(id);
    const doiRaw = (row ? refT.get(row, "DOI") : "") || j?.doi || "";
    const doi = isNoDoi(doiRaw)
      ? ""
      : (normalizeDoi(doiRaw).doi ?? doiRaw.trim());
    const pmid = normalizePmid(j?.pmid).pmid ?? "";
    const record: BibRecord | null =
      (doi && bib[bibKeyOfDoi(doi)]) ||
      (pmid && bib[bibKeyOfPmid(pmid)]) ||
      null;
    const check = checks.get(id)?.record;
    const alt =
      (row ? refT.get(row, "Alternative URL") : "") ||
      j?.alternativeUrl ||
      (!doi && pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "");
    const first = check?.firstAuthor || parseRefId(id).author || "";
    const second = /^\[[^,\]]+?\s+(?:and|&)\s+([^,\]]+),/.exec(id)?.[1]?.trim();
    const b = buildBibtex({
      key: tid.get(id)!.key,
      record,
      fallback: {
        authors: first
          ? [
              first,
              ...(second ? [second] : /et al/i.test(id) ? ["others"] : []),
            ]
          : [],
        title: j?.title || check?.title,
        container: j?.journal || check?.journal,
        year: check?.year ?? parseRefId(id).year,
        doi,
        pmid,
        url: doi ? undefined : alt || undefined,
      },
      journals,
    });
    return {
      id: tRef(id),
      doi,
      bibtex: b,
      literatureType:
        (row ? refT.get(row, "Literature type") : "") ||
        j?.literatureType ||
        "",
      alternativeUrl: doi ? "" : alt,
      fromRecord: !!record,
    };
  });
  const unlisted = [
    ...new Set(
      references
        .filter(
          (r) => r.bibtex.container && !journals.includes(r.bibtex.container),
        )
        .map((r) => r.bibtex.container),
    ),
  ];
  if (journals.length && unlisted.length) {
    notes.push(
      `${unlisted.length} journal(s) are not in the template's journal list, so their Journal score is 0: ${unlisted.join("; ")}.`,
    );
  }
  const withoutRecord = references.filter((r) => !r.fromRecord).length;
  if (withoutRecord)
    notes.push(
      `${withoutRecord} reference(s) have no Crossref / PubMed record; their BibTeX is built from references.json and reference_check.json only.`,
    );

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
  if (!circuitRows.some((c) => c.id.startsWith("ROI_"))) {
    const roiUcs = frgT.rows
      .filter(
        (r) =>
          frgT.get(r, "Circuit ID") && !/noROI/i.test(frgT.get(r, "Comments")),
      )
      .map((r) => frgT.get(r, "Circuit ID"));
    circuitRows.unshift({
      id: roiId,
      source: "collection",
      names: input.roi ?? "",
      transmitter: "",
      modulation: "",
      comments: "Region of interest of the project",
      descriptor: "",
      subCircuits: roiUcs,
      uniform: false,
    });
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
      sNotation:
        sRel || conT.get(r, "Notation of sCID in Literature")
          ? conT.get(r, "Notation of sCID in Literature")
          : s,
      receiver: d,
      rRel: rRel || "=",
      rNotation:
        rRel || conT.get(r, "Notation of rCID in Literature")
          ? conT.get(r, "Notation of rCID in Literature")
          : d,
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
      cm: `${capability}\n${MECHANISM_TAG}\n${mechanism}\n${CODING_SCHEME_TAG}\n`,
      implementation: frgT.get(r, "Implementation of Uniform Circuit"),
      reqRealization: frgT.get(r, "Requirements Realization by Interface"),
      requirements: frgT.get(r, "Requirements"),
      outputSemantics: frgT.get(r, "Output Semantics"),
      comments: frgT.get(r, "Comments"),
    };
  });

  const counts = {
    References: references.length,
    Circuits: circuitRows.length,
    Connections: connections.length,
    FRG: frgRows.length,
  };

  // --- Project ------------------------------------------------------------------------------------------------------
  const projectRows = parseCsv(input.csv.project);
  const description = projectRows[1]?.[3] ?? "";
  const project = {
    A: input.contributor,
    B: input.projectId,
    C: input.contributor,
    D: description,
  };
  const records: Record<DataSheet, TemplateRecord[]> = {
    References: [],
    Circuits: [],
    Connections: [],
    FRG: [],
  };

  // --- References ---------------------------------------------------------------------------------------------------
  for (const ref of references) {
    records.References.push({
      values: {
        D: ref.doi,
        E: ref.bibtex.bibtex,
        F: ref.literatureType,
        K: ref.alternativeUrl,
        L: input.contributor,
        M: input.projectId,
      },
      fallbacks: {
        A: ref.id,
        G: ref.bibtex.type,
        H: ref.bibtex.authors || "(no BibTex)",
        I: ref.bibtex.title || "(no BibTex)",
        J: ref.bibtex.container || "-",
      },
    });
  }

  // --- Circuits -----------------------------------------------------------------------------------------------------
  const seq = new Map<string, number>();
  const byId = new Map(circuitRows.map((c) => [c.id, c]));
  const roiList = (id: string, seen = new Set<string>()): string => {
    if (seen.has(id)) return "";
    seen.add(id);
    const c = byId.get(id);
    return [
      `${id};`,
      ...(c?.subCircuits ?? []).map((s) => roiList(s, seen)).filter(Boolean),
    ].join("\n");
  };
  let bnaRows = 0;
  for (const c of circuitRows) {
    const source = refIdsIn(c.source)[0] ?? "";
    const sourceOfId = source.startsWith("[") ? `[${tRef(source)}]` : source;
    const d = c.id.startsWith("ROI_")
      ? { graphOrder: null, name: "", levels: [] as string[] }
      : dhbaCells(c.id, source, c.descriptor, dhba, seq);
    if (d.note === "BNA") bnaRows++;
    else if (d.note)
      notes.push(`Circuits ${c.id}: no DHBA graph_order (${d.note}).`);
    const levels: Record<string, string> = {};
    for (let k = 0; k < 13; k++)
      levels[String.fromCharCode(70 + k)] = d.levels[k] ?? "";
    records.Circuits.push({
      values: {
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
        AA: [
          cite(c.comments),
          c.descriptor ? `UC Descriptor: ${c.descriptor}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        AB: input.contributor,
        AC: input.projectId,
      },
      fallbacks: { AO: roiList(c.id) },
    });
  }
  if (bnaRows)
    notes.push(
      `${bnaRows} circuit(s) anchored on BNA have no DHBA graph_order / name / levels (BNA is not in DHBA).`,
    );

  // --- Connections --------------------------------------------------------------------------------------------------
  for (const c of connections) {
    records.Connections.push({
      values: {
        A: c.sender,
        B: c.sRel,
        C: c.sNotation,
        D: c.receiver,
        E: c.rRel,
        F: c.rNotation,
        H: cite(c.comments),
        I: c.ref,
        J: c.taxon,
        K: c.method,
        L: c.literature,
        M: c.figure,
        AE: input.contributor,
        AF: input.projectId,
      },
      fallbacks: {},
    });
  }

  // --- FRG ----------------------------------------------------------------------------------------------------------
  for (const f of frgRows) {
    records.FRG.push({
      values: {
        AC: f.node,
        // BRA 410 / 431: every listed ID ends with ";"
        AD: f.subnodes.map((x) => `${x};`).join(""),
        AE: f.circuit,
        AF: f.projected.map((x) => `${x};`).join(""),
        BA: cite(f.cm),
        BC: f.subnodes.length ? "" : cite(f.implementation),
        BG: cite(f.reqRealization),
        BI: cite(f.requirements),
        BK: cite(f.outputSemantics),
        BM: cite(f.comments),
      },
      fallbacks: {},
    });
  }

  return { files, paths, ss, sheets, project, records, counts, notes };
}

export function buildTemplateXlsx(
  template: Uint8Array,
  input: TemplateExportInput,
): TemplateExportResult {
  const { files, paths, ss, sheets, project, records, counts, notes } =
    templateData(template, input);
  const ws = (n: TemplateSheet) => sheets.get(n)!;

  // --- room for the rows ----------------------------------------------------------------------------------------------
  let workbook = strFromU8(files["xl/workbook.xml"]);
  const all = [...sheets.values()];
  for (const [name, l] of Object.entries(LAYOUT) as [
    keyof typeof LAYOUT,
    (typeof LAYOUT)[keyof typeof LAYOUT],
  ][]) {
    const extra = counts[name] - (l.last - 1);
    if (extra <= 0) continue;
    expandSharedFormulas(ws(name));
    workbook = insertRows(
      ws(name),
      l.insertAt,
      extra,
      all.filter((x) => x.name !== name),
      workbook,
    );
  }
  workbook = workbook.replace(
    /<calcPr\b[^>]*\/>/,
    '<calcPr fullCalcOnLoad="1"/>',
  );

  const put = (
    sheet: TemplateSheet,
    r: number,
    values: Record<string, CellValue | undefined>,
  ) => {
    for (const [col, v] of Object.entries(values))
      if (v !== undefined)
        setCellValue(
          ws(sheet),
          r,
          C(col),
          clip(v, notes, `${sheet}!${col}${r}`),
        );
  };

  put("Project", 2, project);
  const endLine = (n: number) => (n > 0 ? n + 1 : 1);
  for (const row of ws("Project").rows) {
    const label = cellText(
      rowCells(row).find((c) => c.col === 1),
      ss,
    );
    if (label in counts)
      setCellValue(
        ws("Project"),
        row.r,
        2,
        endLine(counts[label as DataSheet]),
      );
  }
  for (const [name, rows] of Object.entries(records) as [
    DataSheet,
    TemplateRecord[],
  ][]) {
    rows.forEach((rec, i) => {
      put(name, 2 + i, rec.values);
      for (const [col, v] of Object.entries(rec.fallbacks))
        setFormulaFallback(ws(name), 2 + i, C(col), v);
    });
  }

  // --- write --------------------------------------------------------------------------------------------------------
  const out: Zippable = {};
  for (const [path, data] of Object.entries(files)) out[path] = data;
  for (const [name, sheet] of sheets)
    out[paths.get(name)!] = strToU8(serializeWorksheet(sheet));
  out["xl/workbook.xml"] = strToU8(workbook);
  return { bytes: zipSync(out, { level: 6 }), rows: counts, notes };
}

const CELL_MAX = 32_767;
function clip(
  v: CellValue | undefined,
  notes: string[],
  where: string,
): CellValue {
  if (typeof v !== "string" || v.length <= CELL_MAX) return v ?? null;
  notes.push(
    `${where} was cut to ${CELL_MAX} characters (the xlsx cell limit).`,
  );
  return v.slice(0, CELL_MAX);
}

// --- CSVs for the BRA Data Converter -------------------------------------------------------------------------------

/**
 * Items the BRA Data Converter (小野寺さん's GAS "BRA Data Converter to v2-3") copies for Template-v2-3.bra: its
 * TargetItems sheet, column set A–B (2026-11-21). The converter matches CSV headers to these names (trimmed) and
 * writes each into the column of the same header in a Google copy of Template-v2-3, so the template's formulas,
 * IMPORTRANGE rows and validation stay as they are.
 */
export const CONVERTER_ITEMS: Record<
  Exclude<TemplateSheet, "Project">,
  string[]
> = {
  References: [
    "DOI",
    "BibTex",
    "Litterature type",
    "Alternative URL",
    "Contributor",
    "Project ID",
  ],
  Circuits: [
    "Circuit ID",
    "Source of ID",
    "Names",
    "DHBA: graph_order",
    "Sub-Circuits",
    "Super Class",
    "Uniform",
    "Transmitter",
    "Modulation Type",
    "Size",
    "Output Semantics (0)",
    "Physiological Data",
    "Comments",
    "Contributor",
    "Project ID",
  ],
  Connections: [
    "Sender Circuit ID (sCID)",
    "sCID relation",
    "Notation of sCID in Literature",
    "Receiver Circuit ID (rCID)",
    "rCID relation",
    "Notation of rCID in Literature",
    "Size",
    "Comments",
    "Reference ID",
    "Taxon",
    "Measurement method",
    "Pointers on literature",
    "Pointers on figure",
    "In-depth literature",
    "Contributor",
    "Project ID",
  ],
  FRG: [
    "Node ID",
    "Subnodes",
    "Circuit ID",
    "Projected Circuits",
    "Capability&Mechanism",
    "Implementation of Uniform Circuit",
    "Requirements Realization by Interface",
    "Requirements",
    "Output Semantics",
    "Comments",
  ],
};
/** Written too, although TargetItems does not list them yet (the converter skips them until it does). */
const CONVERTER_EXTRA: Partial<
  Record<Exclude<TemplateSheet, "Project">, string[]>
> = {
  Circuits: [
    "DHBA: name",
    ...Array.from({ length: 13 }, (_, i) => `DHBA: Lv.${i + 2}`),
  ],
};

export const converterCsvNames = (projectId: string) => ({
  project: `${projectId}_project.csv`,
  references: `${projectId}_references.csv`,
  circuits: `${projectId}_circuits.csv`,
  connections: `${projectId}_connections.csv`,
  frg: `${projectId}_frg.csv`,
});

export interface ConverterCsvResult {
  /** CSV text by file name (converterCsvNames) */
  files: Record<string, string>;
  rows: Record<Exclude<TemplateSheet, "Project">, number>;
  notes: string[];
}

const csvCell = (v: CellValue | undefined): string =>
  v === null || v === undefined
    ? ""
    : typeof v === "boolean"
      ? v
        ? "TRUE"
        : "FALSE"
      : String(v);

/**
 * The five CSVs the BRA Data Converter reads in CSV mode (`{ID}_project.csv` … `{ID}_frg.csv`), with the same cell
 * values as the xlsx export. The Project CSV follows the template's Project sheet: values in row 2 (BRA version
 * Template-v2-3.bra), Review End Lines in B5:B8.
 */
export function buildConverterCsvs(
  template: Uint8Array,
  input: TemplateExportInput,
): ConverterCsvResult {
  const { sheets, ss, project, records, counts, notes } = templateData(
    template,
    input,
  );
  const names = converterCsvNames(input.projectId);
  const files: Record<string, string> = {};

  const endLine = (n: number) => String(n > 0 ? n + 1 : 1);
  const blank = ["", "", "", "", ""];
  files[names.project] = toCsv([
    [
      "Contributor",
      "Project ID",
      "List of contributors",
      "Description",
      "BRA version",
    ],
    [
      ...["A", "B", "C", "D"].map((k) => csvCell(project[k])),
      BRA_TEMPLATE_VERSION,
    ],
    // rows the converter reads by position: keep every line non-empty
    blank,
    ["Sheet Name", "Review End Line", "", "", ""],
    ...(["References", "Circuits", "Connections", "FRG"] as const).map((s) => [
      s,
      endLine(counts[s]),
      "",
      "",
      "",
    ]),
  ]);

  for (const sheet of [
    "References",
    "Circuits",
    "Connections",
    "FRG",
  ] as const) {
    // header → column, the last one when a header repeats (FRG has Node ID / Circuit ID twice), as the converter does
    const header = rowCells(getRow(sheets.get(sheet)!, 1)!);
    const colOf = new Map<string, string>();
    for (const c of header)
      colOf.set(cellText(c, ss).trim(), colLetters(c.col));
    const items = [
      ...CONVERTER_ITEMS[sheet],
      ...(CONVERTER_EXTRA[sheet] ?? []),
    ].filter((n) => colOf.has(n));
    files[names[sheet.toLowerCase() as keyof typeof names]] = toCsv([
      items,
      ...records[sheet].map((r) =>
        items.map((n) => csvCell(r.values[colOf.get(n)!])),
      ),
    ]);
    const limit = LAYOUT[sheet].importRow ? LAYOUT[sheet].importRow! - 3 : null;
    if (limit !== null && counts[sheet] > limit) {
      notes.push(
        `${sheet} has ${counts[sheet]} records, but the converter copies only the first ${limit} (the rows above the WholeBIF import). Insert rows in the converted sheet and paste the rest by hand.`,
      );
    }
  }
  return { files, rows: counts, notes };
}
