// The five BRA sheets (CSV) → the rows BRA-DB stores. Follows BRA-DB import_bra_project v3.10 (column resolution by
// header name, Review End Lines, value normalization) with these differences, decided on the CoBRAC side:
// - Columns are resolved exact-match first for every key, then by partial match, so a partial match cannot take the
//   column another key matches exactly; a column missing from a header is empty (no fixed-index fallback, which
//   reads unrelated columns of CoBRAC's narrower CSVs). The fixed indices are used only when there is no header.
// - The FRG body starts at the "Node ID" column (index 28 in the official template, 0 in CoBRAC's FRG.csv).
// - Separate "Capability" / "Mechanism" columns (CoBRAC) are read when there is no "Capability&Mechanism" column.
// - Values that BRA-DB's constraints would reject (unknown Modulation Type or Region Category, text longer than the
//   column) are stored as NULL with a warning and kept in `extra`, instead of failing the whole import.
import { parseCsv } from "@cobrac/shared";

export interface ProjectRow {
  projectId: string;
  roiCircuitId: string;
  roiLabel: string | null;
  tlfDescription: string;
  contributor: string;
  contributors: string | null;
  description: string | null;
  braVersion: string | null;
  publicComment: string | null;
  rootNodeId: string | null;
}

export interface CircuitRow {
  circuitId: string;
  rawSourceOfId: string;
  sourceOfId: string;
  names: string | null;
  graphOrder: number | null;
  isUniform: boolean;
  transmitter: string | null;
  modulationType: string | null;
  subCircuitIds: string[] | null;
  size: string | null;
  outputSemantics0: string | null;
  physiologicalData: string | null;
  comments: string | null;
  contributor: string | null;
  extra: Record<string, string> | null;
  sourceRowNo: number;
  circuitKind: "local" | "bif";
}

export interface ConnectionRow {
  senderCircuitId: string;
  receiverCircuitId: string;
  senderRelation: string | null;
  receiverRelation: string | null;
  senderNotation: string | null;
  receiverNotation: string | null;
  referenceId: string | null;
  taxon: string | null;
  measurementMethod: string | null;
  pointersOnLiterature: string | null;
  pointersOnFigure: string | null;
  inDepthLiterature: string | null;
  size: string | null;
  comments: string | null;
  derivedFlow: "Feedforward" | "Feedback" | null;
  contributor: string | null;
  extra: Record<string, string> | null;
  sourceRowNo: number;
}

export interface LiteratureRow {
  literatureId: string;
  doi: string | null;
  url: string | null;
  literatureType: string | null;
  bibtex: string | null;
  title: string | null;
  authors: string | null;
  journalName: string | null;
  extra: Record<string, string> | null;
  sourceRowNo: number;
}

export type NodeRole = "Requirement" | "Capability" | "Uniform" | "Assembly";

export interface NodeRow {
  nodeId: string;
  nodeRole: NodeRole;
  capability: string | null;
  mechanism: string | null;
  requirements: string | null;
  outputSemantics: string | null;
  interface: string | null;
  implementation: string | null;
  regionCategory: string | null;
  circuitId: string | null;
  comments: string | null;
  extra: Record<string, string> | null;
  sourceRowNo: number;
}

export type EdgeType = "SUBNODE" | "PROJECTS_TO" | "MAPS_TO_BIF" | "MAPS_TO_LOCAL";

export interface EdgeRow {
  type: EdgeType;
  from: string;
  to: string;
  order: number | null;
}

export interface Bundle {
  project: ProjectRow;
  circuits: CircuitRow[];
  connections: ConnectionRow[];
  literature: LiteratureRow[];
  nodes: NodeRow[];
  edges: EdgeRow[];
  /** Circuits FRG U. nodes refer to (MAPS_TO_* targets) */
  referencedCircuitIds: string[];
  sheetHeaders: Record<string, { columns: string[]; mapped: Record<string, string> }>;
  sheetMeta: string[][];
  warnings: string[];
}

export const SOURCE_OF_ID_VALUES = ["makeshift", "collection", "reference", "dhba", "mba", "uberon", "bna"];
const ONTOLOGY_SOURCES = new Set(["dhba", "mba", "uberon", "bna"]);
const MODULATION_TYPES = ["Excitatory", "Inhibitory", "Modulatory"];
const REGION_CATEGORIES = ["ROI", "inROI", "Input", "Output", "Input/Output", "outROI"];
const RELATIONS = new Set(["=", "<", ">"]);
const PLACEHOLDERS = new Set(["(no description)", "n/a", "na", "-", "#error: reference id"]);
const NODE_ROLES: [string, NodeRole][] = [
  ["R.", "Requirement"],
  ["C.", "Capability"],
  ["U.", "Uniform"],
  ["A.", "Assembly"],
];
const CAPABILITY_MECHANISM = "<<mechanism to realize the capability>>";
const CODING_SCHEME = "<<mechanism realized by grainest coding scheme>>";

type Matcher = [key: string, needles: string[], exactOnly?: boolean];

const CONNECTION_COLUMNS: Matcher[] = [
  ["sender", ["sender circuit"]],
  ["s_relation", ["scid relation", "sender relation"]],
  ["s_notation", ["notation of scid", "notation of sender"]],
  ["receiver", ["receiver circuit"]],
  ["r_relation", ["rcid relation", "receiver relation"]],
  ["r_notation", ["notation of rcid", "notation of receiver"]],
  ["size", ["size"]],
  ["comments", ["comment"]],
  ["reference_id", ["reference id"]],
  ["taxon", ["taxon"]],
  ["measurement", ["measurement method"]],
  ["pointers_lit", ["pointers on literature"]],
  ["pointers_fig", ["pointers on figure"]],
  ["in_depth", ["in-depth literature", "in depth literature"]],
  ["contributor", ["contributor"]],
];
const CONNECTION_FALLBACK: Record<string, number> = { sender: 0, s_relation: 1, s_notation: 2, receiver: 3, r_relation: 4, r_notation: 5, size: 6, comments: 7, reference_id: 8, taxon: 9, measurement: 10, pointers_lit: 11, pointers_fig: 12, in_depth: 13, contributor: 30 };

const CIRCUIT_COLUMNS: Matcher[] = [
  ["circuit_id", ["circuit id"]],
  ["source_of_id", ["source of id"]],
  ["names", ["names"]],
  ["graph_order", ["graph_order", "graph order"]],
  ["sub_circuits", ["sub-circuits", "sub circuits"]],
  ["super_class", ["super class"]],
  ["uniform", ["uniform"]],
  ["transmitter", ["transmitter"]],
  ["modulation_type", ["modulation type", "functional form type"]],
  ["size", ["size"]],
  ["output_semantics_0", ["output semantics"]],
  ["physiological_data", ["physiological data"]],
  ["comments", ["comments"]],
  ["contributor", ["contributor"]],
  ["project_id", ["project id"]],
];
const CIRCUIT_FALLBACK: Record<string, number> = { circuit_id: 0, source_of_id: 1, names: 2, graph_order: 3, sub_circuits: 18, super_class: 19, uniform: 20, transmitter: 21, modulation_type: 22, size: 23, output_semantics_0: 24, physiological_data: 25, comments: 26, contributor: 27, project_id: 28 };

const REFERENCE_COLUMNS: Matcher[] = [
  ["literature_id", ["reference id"]],
  ["doc_link", ["doc. link", "doc link"]],
  ["bibtex_link", ["bibtex link"]],
  ["doi", ["doi"]],
  ["bibtex", ["bibtex"]],
  ["literature_type", ["litterature type", "literature type"]],
  ["type", ["type"], true],
  ["authors", ["authors"]],
  ["title", ["title"]],
  ["journal_name", ["journal names", "journal name"]],
  ["alt_url", ["alternative url"]],
  ["contributor", ["contributor"]],
  ["project_id", ["project id"]],
];
const REFERENCE_FALLBACK: Record<string, number> = { literature_id: 0, doc_link: 1, bibtex_link: 2, doi: 3, bibtex: 4, literature_type: 5, type: 6, authors: 7, title: 8, journal_name: 9, alt_url: 10, contributor: 11, project_id: 12 };

const FRG_COLUMNS: Matcher[] = [
  ["node_id", ["node id"]],
  ["subnodes", ["subnodes"]],
  ["circuit_id", ["circuit id"]],
  ["projected", ["projected circuits"]],
  ["region_category", ["region category"]],
  ["interface", ["interface"], true],
  ["implementation", ["implementation", "implementation of uniform circuit"]],
  ["capability_mechanism", ["capability&mechanism", "capability & mechanism"]],
  ["capability", ["capability"], true],
  ["mechanism", ["mechanism"], true],
  ["requirements", ["requirements"]],
  ["output_semantics", ["output semantics"]],
  ["comments", ["comments"]],
];
const FRG_BODY_START = 28;
const FRG_FALLBACK: Record<string, number> = { node_id: 28, subnodes: 29, circuit_id: 30, projected: 31, region_category: 49, interface: 50, implementation: 51, capability_mechanism: 52, requirements: 60, output_semantics: 62, comments: 64 };

export type Columns = Record<string, number | undefined>;

/** Column of each key: exact matches for every key first, then partial matches; `[WS]` work columns never match. */
export function resolveColumns(header: string[], matchers: Matcher[], fallback: Record<string, number>, startAt = 0): Columns {
  if (header.length === 0) return { ...fallback };
  const norm = header.map((h) => (h ?? "").trim().toLowerCase());
  const used = new Set<number>();
  const out: Columns = {};
  const pick = (needles: string[], exact: boolean) => {
    for (let i = startAt; i < norm.length; i++) {
      if (used.has(i) || norm[i].startsWith("[ws]") || !norm[i]) continue;
      if (exact ? needles.includes(norm[i]) : needles.some((n) => norm[i].includes(n))) return i;
    }
    return undefined;
  };
  for (const [key, needles] of matchers) {
    const i = pick(needles, true);
    if (i !== undefined) {
      out[key] = i;
      used.add(i);
    }
  }
  for (const [key, needles, exactOnly] of matchers) {
    if (out[key] !== undefined || exactOnly) continue;
    const i = pick(needles, false);
    if (i !== undefined) {
      out[key] = i;
      used.add(i);
    }
  }
  return out;
}

const cell = (row: string[], i: number | undefined) => (i === undefined ? "" : (row[i] ?? "").trim());
const orNull = (s: string) => (s ? s : null);
export const blankIfPlaceholder = (s: string) => (!s || PLACEHOLDERS.has(s.toLowerCase()) ? null : s);

/** Enumerated cell → items (`;`-terminated items, also newlines and commas as in v3.7). */
export function splitEnumerated(raw: string): string[] {
  return raw
    .split(/[;\n\r,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeSourceOfId(raw: string): string {
  const s = (raw ?? "").trim();
  if (/^\[.*\]$/.test(s)) return "reference";
  const low = s.toLowerCase();
  return SOURCE_OF_ID_VALUES.includes(low) ? low : "makeshift";
}

export function nodeRoleOf(nodeId: string, warnings: string[]): NodeRole {
  for (const [prefix, role] of NODE_ROLES) if (nodeId.startsWith(prefix)) return role;
  warnings.push(`Node ${nodeId} has an unknown prefix; stored as Capability`);
  return "Capability";
}

export function splitCapabilityMechanism(raw: string): [string | null, string | null] {
  if (!raw.trim()) return [null, null];
  const at = raw.indexOf(CAPABILITY_MECHANISM);
  if (at < 0) return [orNull(raw.trim()), null];
  const head = raw.slice(0, at);
  const rest = raw.slice(at + CAPABILITY_MECHANISM.length);
  const mech = rest.split(CODING_SCHEME)[0];
  return [orNull(head.trim()), orNull(mech.trim())];
}

export function deriveFlow(comments: string | null): "Feedforward" | "Feedback" | null {
  const s = (comments ?? "").toLowerCase();
  if (s.includes("feedforward")) return "Feedforward";
  if (s.includes("feedback")) return "Feedback";
  return null;
}

function extraOf(row: string[], header: string[], mapped: Columns): Record<string, string> | null {
  const taken = new Set(Object.values(mapped).filter((i): i is number => i !== undefined));
  const out: Record<string, string> = {};
  row.forEach((v, i) => {
    if (taken.has(i) || !(v ?? "").trim()) return;
    out[(header[i] ?? "").trim() || `__col${i + 1}`] = v;
  });
  return Object.keys(out).length ? out : null;
}

/** NULL (with a warning, the value kept in `extra`) when the value does not fit the column or its allowed values. */
function fit(value: string | null, o: { max?: number; allowed?: string[]; field: string; where: string; warnings: string[]; extra: Record<string, string> | null }): { value: string | null; extra: Record<string, string> | null } {
  if (value === null) return { value, extra: o.extra };
  let v: string | null = value;
  if (o.allowed) v = o.allowed.find((a) => a.toLowerCase() === value.toLowerCase()) ?? null;
  if (v !== null && o.max !== undefined && v.length > o.max) v = null;
  if (v !== null) return { value: v, extra: o.extra };
  o.warnings.push(`${o.where}: ${o.field} "${value.slice(0, 60)}" is not accepted by BRA-DB; kept in extra`);
  return { value: null, extra: { ...(o.extra ?? {}), [o.field]: value } };
}

/** Data rows of a sheet within its Review End Line (absolute sheet row incl. the header; 1 = no data). */
function dataRows(rows: string[][], reviewEndLine: number | null): string[][] {
  const data = rows.slice(1);
  return reviewEndLine ? data.slice(0, Math.max(0, reviewEndLine - 1)) : data;
}

interface ProjectSheet {
  contributor: string | null;
  contributors: string | null;
  description: string | null;
  braVersion: string | null;
  publicComment: string | null;
  reviewEndLines: Record<string, number | null>;
}

export function readProjectSheet(rows: string[][], warnings: string[]): ProjectSheet {
  const out: ProjectSheet = { contributor: null, contributors: null, description: null, braVersion: null, publicComment: null, reviewEndLines: {} };
  const fields: Record<string, keyof ProjectSheet> = {
    contributor: "contributor",
    "list of contributors": "contributors",
    description: "description",
    "bra version": "braVersion",
    "public comment": "publicComment",
  };
  const first = rows.findIndex((r) => {
    const low = r.map((c) => c.trim().toLowerCase());
    return low.includes("contributor") && low.includes("project id");
  });
  if (first >= 0 && rows[first + 1]) {
    rows[first].forEach((h, j) => {
      const f = fields[h.trim().toLowerCase()];
      const v = (rows[first + 1][j] ?? "").trim();
      if (f && v) (out as unknown as Record<string, string>)[f] = v;
    });
  }
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "sheet name") && r.some((c) => c.trim().toLowerCase() === "review end line"));
  if (headerIdx < 0) {
    warnings.push("Project sheet has no Sheet Name / Review End Line table; every row is read");
    return out;
  }
  const nameCol = rows[headerIdx].findIndex((c) => c.trim().toLowerCase() === "sheet name");
  const valueCol = rows[headerIdx].findIndex((c) => c.trim().toLowerCase() === "review end line");
  const targets = ["references", "circuits", "connections", "frg"];
  for (const r of rows.slice(headerIdx + 1)) {
    const name = (r[nameCol] ?? "").trim().toLowerCase();
    if (!name) continue;
    if (!targets.includes(name)) break;
    const raw = (r[valueCol] ?? "").trim();
    const n = Number(raw);
    out.reviewEndLines[name] = raw && Number.isInteger(n) && n >= 1 ? n : null;
    if (raw && out.reviewEndLines[name] === null) warnings.push(`Review End Line of ${name} is not valid ("${raw}"); every row is read`);
  }
  return out;
}

export interface SheetFiles {
  project: string | null;
  references: string | null;
  circuits: string | null;
  connections: string | null;
  frg: string | null;
}

/** Package files of a project (`{P}_project.csv` …) as sheets; the project ID is used only as the file-name prefix. */
export function sheetsFromPackage(projectId: string, files: Record<string, string>): SheetFiles {
  const get = (suffix: string) => files[`${projectId}_${suffix}.csv`] ?? null;
  return { project: get("project"), references: get("references"), circuits: get("circuits"), connections: get("connections"), frg: get("frg") };
}

export function loadBundle(projectId: string, sheets: SheetFiles, o: { roi: string; tlf: string; contributor: string }): Bundle {
  const warnings: string[] = [];
  const sheetHeaders: Bundle["sheetHeaders"] = {};
  const metaRows = sheets.project ? parseCsv(sheets.project) : [];
  const meta = readProjectSheet(metaRows, warnings);
  const contributor = meta.contributor || o.contributor;

  const table = (name: string, text: string | null, matchers: Matcher[], fallback: Record<string, number>, startAt?: (header: string[]) => number) => {
    if (!text) return { header: [] as string[], col: {} as Columns, rows: [] as string[][] };
    const rows = parseCsv(text);
    const header = rows[0] ?? [];
    const col = resolveColumns(header, matchers, fallback, startAt ? startAt(header) : 0);
    sheetHeaders[name] = { columns: header, mapped: Object.fromEntries(Object.entries(col).filter(([, i]) => i !== undefined).map(([k, i]) => [String(i), k])) };
    return { header, col, rows: dataRows(rows, meta.reviewEndLines[name] ?? null) };
  };

  // References
  const literature: LiteratureRow[] = [];
  const ref = table("references", sheets.references, REFERENCE_COLUMNS, REFERENCE_FALLBACK);
  ref.rows.forEach((row, i) => {
    const id = cell(row, ref.col.literature_id);
    if (!id) return;
    const where = `References ${id}`;
    let extra = extraOf(row, ref.header, ref.col);
    const f = (v: string | null, field: string, max: number) => {
      const r = fit(v, { max, field, where, warnings, extra });
      extra = r.extra;
      return r.value;
    };
    literature.push({
      literatureId: f(id, "Reference ID", 100) ?? id.slice(0, 100),
      doi: f(blankIfPlaceholder(cell(row, ref.col.doi)), "DOI", 200),
      url: f(blankIfPlaceholder(cell(row, ref.col.alt_url)), "Alternative URL", 500),
      literatureType: f(blankIfPlaceholder(cell(row, ref.col.literature_type)), "Literature type", 100),
      bibtex: orNull(cell(row, ref.col.bibtex)),
      title: blankIfPlaceholder(cell(row, ref.col.title)),
      authors: blankIfPlaceholder(cell(row, ref.col.authors)),
      journalName: blankIfPlaceholder(cell(row, ref.col.journal_name)),
      extra,
      sourceRowNo: i + 1,
    });
  });

  // Circuits
  const circuits: CircuitRow[] = [];
  const cir = table("circuits", sheets.circuits, CIRCUIT_COLUMNS, CIRCUIT_FALLBACK);
  cir.rows.forEach((row, i) => {
    const id = cell(row, cir.col.circuit_id);
    if (!id) return;
    const where = `Circuit ${id}`;
    let extra = extraOf(row, cir.header, cir.col);
    const go = cell(row, cir.col.graph_order);
    const graphOrder = go && Number.isFinite(Number(go)) ? Number(go) : null;
    const transmitter = fit(blankIfPlaceholder(cell(row, cir.col.transmitter)), { max: 50, field: "Transmitter", where, warnings, extra });
    extra = transmitter.extra;
    const modulation = fit(blankIfPlaceholder(cell(row, cir.col.modulation_type)), { allowed: MODULATION_TYPES, field: "Modulation Type", where, warnings, extra });
    extra = modulation.extra;
    const raw = cell(row, cir.col.source_of_id);
    circuits.push({
      circuitId: id,
      rawSourceOfId: raw,
      sourceOfId: normalizeSourceOfId(raw),
      names: orNull(cell(row, cir.col.names)),
      graphOrder,
      isUniform: ["1", "1.0", "true", "yes"].includes(cell(row, cir.col.uniform).toLowerCase()),
      transmitter: transmitter.value,
      modulationType: modulation.value,
      subCircuitIds: splitEnumerated(cell(row, cir.col.sub_circuits)).length ? splitEnumerated(cell(row, cir.col.sub_circuits)) : null,
      size: blankIfPlaceholder(cell(row, cir.col.size)),
      outputSemantics0: blankIfPlaceholder(cell(row, cir.col.output_semantics_0)),
      physiologicalData: blankIfPlaceholder(cell(row, cir.col.physiological_data)),
      comments: blankIfPlaceholder(cell(row, cir.col.comments)),
      contributor: orNull(cell(row, cir.col.contributor)),
      extra,
      sourceRowNo: i + 1,
      circuitKind: "local",
    });
    if (id.length > 100) warnings.push(`${where}: Circuit ID is longer than 100 characters`);
  });

  // Connections
  const connections: ConnectionRow[] = [];
  const con = table("connections", sheets.connections, CONNECTION_COLUMNS, CONNECTION_FALLBACK);
  con.rows.forEach((row, i) => {
    const sender = cell(row, con.col.sender);
    const receiver = cell(row, con.col.receiver);
    if (!sender || !receiver) return;
    const where = `Connection ${sender} → ${receiver}`;
    let extra = extraOf(row, con.header, con.col);
    const f = (v: string | null, field: string, max: number) => {
      const r = fit(v, { max, field, where, warnings, extra });
      extra = r.extra;
      return r.value;
    };
    const comments = orNull(cell(row, con.col.comments));
    const relation = (s: string) => orNull(s.replace(/^'+/, "").trim());
    connections.push({
      senderCircuitId: sender,
      receiverCircuitId: receiver,
      senderRelation: relation(cell(row, con.col.s_relation)),
      receiverRelation: relation(cell(row, con.col.r_relation)),
      senderNotation: blankIfPlaceholder(cell(row, con.col.s_notation)),
      receiverNotation: blankIfPlaceholder(cell(row, con.col.r_notation)),
      referenceId: f(blankIfPlaceholder(cell(row, con.col.reference_id)), "Reference ID", 100),
      taxon: f(blankIfPlaceholder(cell(row, con.col.taxon)), "Taxon", 100),
      measurementMethod: orNull(cell(row, con.col.measurement)),
      pointersOnLiterature: orNull(cell(row, con.col.pointers_lit)),
      pointersOnFigure: orNull(cell(row, con.col.pointers_fig)),
      inDepthLiterature: blankIfPlaceholder(cell(row, con.col.in_depth)),
      size: blankIfPlaceholder(cell(row, con.col.size)),
      comments,
      derivedFlow: deriveFlow(comments),
      contributor: orNull(cell(row, con.col.contributor)) ?? contributor,
      extra,
      sourceRowNo: i + 1,
    });
  });

  // FRG
  const nodes: NodeRow[] = [];
  const edges: EdgeRow[] = [];
  const referenced = new Set<string>();
  const frgStart = (header: string[]) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === "node id");
    return i >= 0 ? i : Math.min(FRG_BODY_START, Math.max(0, header.length - 1));
  };
  const frg = table("frg", sheets.frg, FRG_COLUMNS, FRG_FALLBACK, frgStart);
  frg.rows.forEach((row, i) => {
    const nodeId = cell(row, frg.col.node_id);
    if (!nodeId) return;
    const where = `Node ${nodeId}`;
    const role = nodeRoleOf(nodeId, warnings);
    let extra = extraOf(row, frg.header, frg.col);
    const [capability, mechanism] =
      frg.col.capability_mechanism !== undefined ? splitCapabilityMechanism(cell(row, frg.col.capability_mechanism)) : [orNull(cell(row, frg.col.capability)), orNull(cell(row, frg.col.mechanism))];
    const region = fit(blankIfPlaceholder(cell(row, frg.col.region_category)), { allowed: REGION_CATEGORIES, field: "Region Category", where, warnings, extra });
    extra = region.extra;
    const circuitId = orNull(cell(row, frg.col.circuit_id));
    nodes.push({
      nodeId,
      nodeRole: role,
      capability,
      mechanism,
      requirements: orNull(cell(row, frg.col.requirements)),
      outputSemantics: orNull(cell(row, frg.col.output_semantics)),
      interface: orNull(cell(row, frg.col.interface)),
      implementation: orNull(cell(row, frg.col.implementation)),
      regionCategory: region.value,
      circuitId,
      comments: orNull(cell(row, frg.col.comments)),
      extra,
      sourceRowNo: i + 1,
    });
    splitEnumerated(cell(row, frg.col.subnodes)).forEach((sub, k) => edges.push({ type: "SUBNODE", from: nodeId, to: sub, order: k + 1 }));
    if (circuitId && role === "Uniform") {
      referenced.add(circuitId);
      edges.push({ type: "MAPS_TO_BIF", from: nodeId, to: circuitId, order: null });
    } else if (circuitId) {
      warnings.push(`${where} (${role}) names a Circuit ID; only U. nodes refer to circuits, so it is ignored`);
    }
    for (const target of splitEnumerated(cell(row, frg.col.projected))) edges.push({ type: "PROJECTS_TO", from: nodeId, to: target, order: null });
  });

  const roiRow = circuits.find((c) => c.circuitId === `ROI_${projectId}`);
  return {
    project: {
      projectId,
      roiCircuitId: roiRow?.circuitId ?? (o.roi || projectId),
      roiLabel: roiRow?.names ?? (o.roi || null),
      tlfDescription: o.tlf,
      contributor,
      contributors: meta.contributors,
      description: meta.description,
      braVersion: meta.braVersion,
      publicComment: meta.publicComment,
      rootNodeId: nodes[0]?.nodeId ?? null,
    },
    circuits,
    connections,
    literature,
    nodes,
    edges,
    referencedCircuitIds: [...referenced],
    sheetHeaders,
    sheetMeta: metaRows,
    warnings,
  };
}

/** BRA-DB's checks (v3.10 `validate`): errors stop the registration, the rest are warnings. */
export function validateBundle(b: Bundle): string[] {
  const errors: string[] = [];
  const w = b.warnings;
  if (!b.project.projectId) errors.push("Project ID is empty");
  if (!b.project.roiCircuitId) errors.push("ROI circuit is empty");
  if (!b.project.tlfDescription) errors.push("TLF is empty");
  if (!b.project.contributor) errors.push("Contributor is empty");
  const ids = new Set<string>();
  for (const n of b.nodes) {
    if (ids.has(n.nodeId)) errors.push(`Node ID ${n.nodeId} appears twice`);
    ids.add(n.nodeId);
    if (n.nodeId.length > 200) errors.push(`Node ID ${n.nodeId.slice(0, 40)}… is longer than 200 characters`);
  }
  for (const e of b.edges) if ((e.type === "SUBNODE" || e.type === "PROJECTS_TO") && !ids.has(e.from)) errors.push(`${e.type} from undefined node ${e.from}`);
  const seen = new Set<string>();
  for (const c of b.circuits) {
    if (seen.has(c.circuitId)) errors.push(`Circuit ID ${c.circuitId} appears twice`);
    seen.add(c.circuitId);
    if (c.circuitId.length > 100) errors.push(`Circuit ID ${c.circuitId.slice(0, 40)}… is longer than 100 characters`);
    if (!c.isUniform && !c.subCircuitIds) w.push(`Circuit ${c.circuitId}: not Uniform but has no Sub-Circuits (error 120)`);
    if (ONTOLOGY_SOURCES.has(c.rawSourceOfId.trim().toLowerCase()) && c.circuitKind === "local") w.push(`Circuit ${c.circuitId}: ontology source ${c.rawSourceOfId} but not an approved BIF circuit; stored as LocalCircuit`);
  }
  const uniform = new Map(b.circuits.map((c) => [c.circuitId, c.isUniform]));
  b.connections.forEach((c, i) => {
    if (uniform.get(c.senderCircuitId) === false) errors.push(`Connection ${i + 1}: sender ${c.senderCircuitId} is not a Uniform Circuit (error 203)`);
    for (const [label, rel] of [
      ["Sender", c.senderRelation],
      ["Receiver", c.receiverRelation],
    ] as const) {
      if (rel === null) w.push(`Connection ${i + 1}: ${label} relation is missing`);
      else if (!RELATIONS.has(rel)) errors.push(`Connection ${i + 1}: ${label} relation "${rel}" is not =, < or >`);
    }
    if (!c.referenceId) w.push(`Connection ${i + 1}: Reference ID is missing (error 252)`);
  });
  return errors;
}
