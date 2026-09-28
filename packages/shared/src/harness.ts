/**
 * CoBRAC harness: deterministic checks of the agent's HCD / FRG markdown and conversion to the five BRA CSVs.
 * Pure functions (no fs) so the worker and tests share them.
 */
import { normalizeHeader, parseCsv, toCsv } from "./csv.js";
import { cell, collectRecords, collectRows } from "./markdown.js";
import { normalizeProjectName } from "./projectId.js";
import { checkUcNaming, splitTopLevel, type SabraLookup } from "./ucNaming.js";

/** Artifact file names per phase; later entries are accepted for workspaces created by the legacy prompts. */
export const HCD_FILES = {
  thinking: ["1_Thinking.md"],
  bif: ["2_BIF.md"],
  uc: ["3_UC.md"],
  connection: ["4_Connection.md"],
  verification: ["5_Verification.md"],
  report: ["6_FinalReport.md", "6_FinalPaper.md"],
} as const;

export const FRG_FILES = {
  init: ["1_InitialDecomposition.md", "1_初期分解結果.md"],
  optimized: ["2_OptimizedFRG.md", "2_最適化FRG.md"],
  final: ["3_FinalFRG.md", "3_最終FRG.md"],
  details: ["4_FunctionDetails.md", "4_機能詳細.md"],
  report: ["5_Report.md", "5_FRG作成レポート.md"],
} as const;

export type HcdFileKey = keyof typeof HCD_FILES;
export type FrgFileKey = keyof typeof FRG_FILES;

export interface ProjectMeta {
  roi: string;
  tlf: string;
  description: string;
  /** Project name proposed by the agent ("<TLF> in <ROI>"); optional for workspaces written before v0.7 */
  name?: string;
}

export type UcRoi = "roi" | "input" | "output" | "both";

export interface UcRow {
  id: string;
  /** UC Descriptor (empty for workspaces made before the naming convention) */
  descriptor: string;
  names: string;
  sourceOfId: string;
  transmitter: string;
  modulationType: string;
  comments: string;
  interfaceText: string;
  outputSemantics: string;
  requirement: string;
  reqRealization: string;
  capability: string;
  mechanism: string;
  implementation: string;
  roi: UcRoi;
}

export interface ConnRow {
  sender: string;
  receiver: string;
  comment: string;
  referenceId: string;
  taxon: string;
  method: string;
  pointersOnLiterature: string;
  pointersOnFigure: string;
}

export interface RefRow {
  id: string;
  doi: string;
}

export interface HcdModel {
  meta: ProjectMeta | null;
  refs: RefRow[];
  ucs: UcRow[];
  connections: ConnRow[];
}

export interface GnRow {
  id: string;
  subnodes: string[];
  comment: string;
  interfaceText: string;
}

export interface DetailRow {
  id: string;
  requirement: string;
  reqRealization: string;
  capability: string;
  mechanism: string;
}

export interface FrgModel {
  gns: GnRow[];
  details: DetailRow[];
}

export interface CheckResult<T> {
  model: T | null;
  /** Problems the agent should fix */
  errors: string[];
  /** True when the output cannot be used at all (missing core file / table) */
  fatal: boolean;
}

type Files<K extends string> = Partial<Record<K, string | null>>;

/** Required UC columns; each entry lists accepted header spellings (first = canonical). */
const UC_COLUMNS = [
  ["Circuit ID"],
  ["Names", "Name"],
  ["Source of ID"],
  ["Transmitter"],
  ["Modulation Type"],
  ["Comments", "Comment"],
  ["Interface"],
  ["Output Semantics"],
  ["Requirement", "Requirements"],
  ["Requirement realization by interface", "Requirements Realization by Interface"],
  ["Capability"],
  ["Mechanism"],
  ["Implementation", "Implementation of Uniform Circuit"],
];
const UC_DESCRIPTOR = "UC Descriptor";
const FRG_COLUMNS = [["Node ID"], ["Subnodes"], ["Comment", "Comments"], ["Interface"]];
const DETAIL_COLUMNS = [
  ["Node ID", "Node Name"],
  ["Requirement", "Requirements"],
  ["Requirement realization by interface", "Requirements Realization by Interface"],
  ["Capability"],
  ["Mechanism"],
];
const missingColumns = (columns: Set<string>, spec: string[][]) => {
  const have = new Set([...columns].map(normalizeHeader));
  return spec.filter((aliases) => !aliases.some((a) => have.has(normalizeHeader(a)))).map((a) => a[0]);
};
/** `[A, 2000]; [B, 2001]` → each bracketed ID; a bare value is one ID. */
export const splitRefIds = (s: string): string[] => s.match(/\[[^\]]+\]/g) ?? (s.trim() ? [s.trim()] : []);
const CONN_COLUMNS = [
  "Sender Circuit ID (sCID)",
  "Receiver Circuit ID (rCID)",
  "Comment",
  "Reference ID",
  "Taxon",
  "Measurement method",
  "Pointers on literature",
  "Pointers on figure",
];
const FUNCTION_ITEMS = ["Requirement", "Requirement realization by interface", "Capability", "Mechanism"] as const;

const stripUc = (s: string) => s.replace(/`/g, "").trim().replace(/^U\./, "");
/** Circuit IDs may contain `(a,b)`, so `,` only separates outside brackets. */
const splitIds = (s: string) => splitTopLevel(s.replace(/`/g, ""), ";；,、");
const hasSpace = (s: string) => /\s/.test(s);

function roiOf(comments: string): UcRoi {
  const i = /noroi\s*\(\s*input/i.test(comments);
  const o = /noroi\s*\(\s*output/i.test(comments);
  return i && o ? "both" : i ? "input" : o ? "output" : "roi";
}

/** Index of the `(` matching the `)` at `close`, or -1. */
function matchingOpen(s: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(" && --depth === 0) return i;
  }
  return -1;
}

/** Index of the first `=` outside brackets, or -1. */
function topLevelEquals(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (c === "=" && depth === 0) return i;
  }
  return -1;
}

const interfaceIds = (s: string) =>
  splitTopLevel(s, ",").map((x) => {
    const t = x.trim();
    return stripUc(t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1) : t);
  });

/**
 * `([A], [B]) = X([C])` → outputs/inputs as bare circuit IDs; null when the text does not have that shape.
 * Circuit IDs may themselves contain brackets (`[U.NAC(shell,DRD1+)]`), so the input list is the last balanced
 * `(…)` and every list is split on top-level commas only.
 */
export function parseInterface(text: string): { name: string; outputs: string[]; inputs: string[] } | null {
  const s = text.replace(/`/g, "").replace(/\n/g, " ").trim();
  const eq = topLevelEquals(s);
  if (eq < 0) return null;
  let lhs = s.slice(0, eq).trim();
  const rhs = s.slice(eq + 1).trim();
  if (!rhs.endsWith(")")) return null;
  const open = matchingOpen(rhs, rhs.length - 1);
  if (open <= 0) return null;
  const name = stripUc(rhs.slice(0, open));
  if (!name || /[\s=]/.test(name)) return null;
  if (lhs.startsWith("(") && matchingOpen(lhs, lhs.length - 1) === 0) lhs = lhs.slice(1, -1);
  return { name, outputs: interfaceIds(lhs), inputs: interfaceIds(rhs.slice(open + 1, -1)) };
}

function parseMeta(text: string | null | undefined, errors: string[]): ProjectMeta | null {
  if (!text) {
    errors.push("meta.json is missing: write meta.json in the project folder with roi, tlf and description (English).");
    return null;
  }
  try {
    const j = JSON.parse(text) as Partial<ProjectMeta>;
    const meta = { roi: String(j.roi ?? "").trim(), tlf: String(j.tlf ?? "").trim(), description: String(j.description ?? "").trim() };
    for (const k of ["roi", "tlf", "description"] as const) if (!meta[k]) errors.push(`meta.json: "${k}" is empty.`);
    if (j.name !== undefined && j.name !== null && j.name !== "") {
      const n = normalizeProjectName(j.name);
      if ("error" in n) errors.push(`meta.json: "name" is invalid (${n.error}).`);
      else return { ...meta, name: n.name };
    }
    return meta;
  } catch {
    errors.push("meta.json is not valid JSON.");
    return null;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

export interface CheckHcdOptions {
  /**
   * Enforce the UC naming convention (UC Descriptor column, Circuit ID syntax and anchor abbreviation).
   * Default: only when 3_UC.md already has a `UC Descriptor` column, so workspaces made before the convention still load.
   */
  ucNaming?: boolean;
  /** RCS facts for HOMBA anchors; without an entry the anchor-abbreviation check of that UC is skipped. */
  sabra?: SabraLookup;
}

export function checkHcd(files: Files<HcdFileKey>, metaText: string | null | undefined, opts: CheckHcdOptions = {}): CheckResult<HcdModel> {
  const errors: string[] = [];
  for (const k of Object.keys(HCD_FILES) as HcdFileKey[]) {
    if (!files[k]?.trim()) errors.push(`${HCD_FILES[k][0]} is missing or empty.`);
  }
  const meta = parseMeta(metaText, errors);

  // references
  const refs: RefRow[] = [];
  const refSeen = new Set<string>();
  for (const src of [files.bif, files.connection]) {
    if (!src) continue;
    for (const r of collectRows(src, ["Reference ID", "DOI"]).rows) {
      const id = cell(r, "Reference ID");
      if (id && !refSeen.has(id)) {
        refSeen.add(id);
        refs.push({ id, doi: cell(r, "DOI") || "N/A" });
      }
    }
  }
  if (files.bif && !refs.length) errors.push("2_BIF.md: no `| Reference ID | DOI |` table under `## References`.");

  // UCs
  const ucs: UcRow[] = [];
  const ucRecs = files.uc ? collectRecords(files.uc, ["Circuit ID"], [...UC_COLUMNS.flat(), UC_DESCRIPTOR]) : null;
  if (files.uc && !ucRecs?.records.length) errors.push("3_UC.md: no UC table with a `Circuit ID` column.");
  const ucNaming = opts.ucNaming ?? (ucRecs ? missingColumns(ucRecs.columns, [[UC_DESCRIPTOR]]).length === 0 : false);
  if (ucRecs?.records.length) {
    const missing = missingColumns(ucRecs.columns, ucNaming ? [UC_COLUMNS[0], [UC_DESCRIPTOR], ...UC_COLUMNS.slice(1)] : UC_COLUMNS);
    if (missing.length) errors.push(`3_UC.md: the UC table lacks columns: ${missing.join(", ")}.`);
    for (const r of ucRecs.records) {
      const id = stripUc(cell(r, "Circuit ID"));
      if (!id) continue;
      if (hasSpace(id)) errors.push(`3_UC.md: Circuit ID \`${id}\` contains spaces${ucNaming ? "" : " (use kebab-case)"}.`);
      const comments = cell(r, "Comments", "Comment");
      ucs.push({
        id,
        descriptor: cell(r, UC_DESCRIPTOR).replace(/\s+/g, ""),
        names: cell(r, "Names", "Name"),
        sourceOfId: cell(r, "Source of ID"),
        transmitter: cell(r, "Transmitter"),
        modulationType: cell(r, "Modulation Type"),
        comments,
        interfaceText: cell(r, "Interface"),
        outputSemantics: cell(r, "Output Semantics"),
        requirement: cell(r, "Requirement", "Requirements"),
        reqRealization: cell(r, "Requirement realization by interface", "Requirements Realization by Interface"),
        capability: cell(r, "Capability"),
        mechanism: cell(r, "Mechanism"),
        implementation: cell(r, "Implementation", "Implementation of Uniform Circuit"),
        roi: roiOf(comments),
      });
    }
    if (!ucs.length) errors.push("3_UC.md: the UC table has no rows.");
    if (ucNaming) errors.push(...checkUcNaming(ucs, opts.sabra));
    else if (!ucs.some((u) => u.roi === "roi")) errors.push("3_UC.md: no ROI-internal UC (every row is tagged noROI).");
  }

  // connections
  const connections: ConnRow[] = [];
  const conn = files.connection ? collectRows(files.connection, ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)"]) : null;
  const connTable = conn?.tables.length ? conn : null;
  if (files.connection && !connTable) errors.push("4_Connection.md: no table with `Sender Circuit ID (sCID)` and `Receiver Circuit ID (rCID)` columns.");
  if (connTable) {
    const headers = new Set(connTable.tables.flatMap((t) => t.headers.map((h) => h.replace(/`/g, "").trim())));
    const missing = missingColumns(headers, CONN_COLUMNS.map((c) => (c === "Comment" ? ["Comment", "Comments"] : [c])));
    if (missing.length) errors.push(`4_Connection.md: the connection table lacks columns: ${missing.join(", ")}.`);
    for (const r of connTable.rows) {
      const c: ConnRow = {
        sender: stripUc(cell(r, "Sender Circuit ID (sCID)")),
        receiver: stripUc(cell(r, "Receiver Circuit ID (rCID)")),
        comment: cell(r, "Comment", "Comments"),
        referenceId: cell(r, "Reference ID"),
        taxon: cell(r, "Taxon"),
        method: cell(r, "Measurement method"),
        pointersOnLiterature: cell(r, "Pointers on literature"),
        pointersOnFigure: cell(r, "Pointers on figure"),
      };
      if (c.sender || c.receiver) connections.push(c);
    }
  }

  const fatal = !connTable || ucs.length === 0;
  if (!fatal) {
    const ids = new Set(ucs.map((u) => u.id));
    const refIds = new Set(refs.map((r) => r.id));
    const senders = new Map<string, string[]>();
    const receivers = new Map<string, string[]>();
    for (const c of connections) {
      for (const [end, id] of [
        ["Sender", c.sender],
        ["Receiver", c.receiver],
      ] as const) {
        if (!ids.has(id)) errors.push(`4_Connection.md: ${end} \`${id}\` (\`${c.sender}\` -> \`${c.receiver}\`) is not a Circuit ID in 3_UC.md.`);
      }
      if (!c.referenceId) errors.push(`4_Connection.md: \`${c.sender}\` -> \`${c.receiver}\` has no Reference ID.`);
      else if (refs.length) {
        for (const id of splitRefIds(c.referenceId)) if (!refIds.has(id)) errors.push(`4_Connection.md: Reference ID ${id} is not in 2_BIF.md's reference table.`);
      }
      (senders.get(c.receiver) ?? senders.set(c.receiver, []).get(c.receiver)!).push(c.sender);
      (receivers.get(c.sender) ?? receivers.set(c.sender, []).get(c.sender)!).push(c.receiver);
    }
    for (const u of ucs) {
      if (!senders.has(u.id) && !receivers.has(u.id)) errors.push(`\`${u.id}\` has no connection in 4_Connection.md.`);
      const isSink = u.roi !== "roi" && !receivers.has(u.id);
      if (!u.outputSemantics && !isSink) errors.push(`3_UC.md: \`${u.id}\` has no Output Semantics.`);
      if (u.roi !== "roi") continue;
      const empty = [
        ["Interface", u.interfaceText],
        ["Requirement", u.requirement],
        ["Requirement realization by interface", u.reqRealization],
        ["Capability", u.capability],
        ["Mechanism", u.mechanism],
        ["Implementation", u.implementation],
      ]
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (empty.length) errors.push(`3_UC.md: ROI-internal \`${u.id}\` has empty ${empty.join(", ")}.`);
      if (!u.interfaceText) continue;
      const itf = parseInterface(u.interfaceText);
      if (!itf) {
        errors.push(`3_UC.md: Interface of \`${u.id}\` is not in the form ([Out1], [Out2]) = ${u.id}([In1], [In2]).`);
        continue;
      }
      if (ucNaming && itf.name !== u.id) errors.push(`3_UC.md: Interface of \`${u.id}\` names \`${itf.name}\`; write it as (…) = ${u.id}(…).`);
      const ins = senders.get(u.id) ?? [];
      const outs = receivers.get(u.id) ?? [];
      if (!sameSet(itf.inputs, ins)) {
        errors.push(`\`${u.id}\`: Interface inputs [${itf.inputs.join(", ")}] differ from the senders in 4_Connection.md [${[...new Set(ins)].join(", ")}].`);
      }
      if (!sameSet(itf.outputs, outs)) {
        errors.push(`\`${u.id}\`: Interface outputs [${itf.outputs.join(", ")}] differ from the receivers in 4_Connection.md [${[...new Set(outs)].join(", ")}].`);
      }
    }
  }

  return { model: fatal ? null : { meta, refs, ucs, connections }, errors: [...new Set(errors)], fatal };
}

export function checkFrg(files: Files<FrgFileKey>, hcd: HcdModel): CheckResult<FrgModel> {
  const errors: string[] = [];
  for (const k of Object.keys(FRG_FILES) as FrgFileKey[]) {
    if (!files[k]?.trim()) errors.push(`${FRG_FILES[k][0]} is missing or empty.`);
  }

  const gns: GnRow[] = [];
  const finalRecs = files.final ? collectRecords(files.final, ["Node ID"], FRG_COLUMNS.flat()) : null;
  const finalTable = finalRecs?.records.length ? finalRecs : null;
  if (files.final && !finalTable) errors.push("3_FinalFRG.md: no `| Node ID | Subnodes | Comment | Interface |` table.");
  if (finalTable) {
    for (const c of missingColumns(finalTable.columns, FRG_COLUMNS)) errors.push(`3_FinalFRG.md: the FRG table lacks the ${c} column.`);
    for (const r of finalTable.records) {
      const id = cell(r, "Node ID");
      if (!id) continue;
      gns.push({ id, subnodes: splitIds(cell(r, "Subnodes")), comment: cell(r, "Comment", "Comments"), interfaceText: cell(r, "Interface") });
    }
  }

  const details: DetailRow[] = [];
  const detailRecs = files.details ? collectRecords(files.details, ["Node ID", "Node Name"], DETAIL_COLUMNS.flat()) : null;
  const detailTable = detailRecs?.records.length && missingColumns(detailRecs.columns, DETAIL_COLUMNS.slice(1)).length < 4 ? detailRecs : null;
  if (files.details && !detailTable) {
    errors.push("4_FunctionDetails.md: no `| Node ID | Requirement | Requirement realization by interface | Capability | Mechanism |` table.");
  }
  if (detailTable) {
    for (const r of detailTable.records) {
      const raw = cell(r, "Node ID", "Node Name");
      const id = /^[A-Za-z][\w.\-]*/.exec(raw)?.[0] ?? raw;
      if (!id) continue;
      details.push({
        id,
        requirement: cell(r, "Requirement", "Requirements"),
        reqRealization: cell(r, "Requirement realization by interface", "Requirements Realization by Interface"),
        capability: cell(r, "Capability"),
        mechanism: cell(r, "Mechanism"),
      });
    }
  }

  const fatal = !finalTable || gns.length === 0;
  if (!fatal) {
    const gnIds = new Set<string>();
    for (const g of gns) {
      if (!g.id.startsWith("R.")) errors.push(`3_FinalFRG.md: Node ID \`${g.id}\` must start with "R." (UCs are not rows).`);
      if (hasSpace(g.id)) errors.push(`3_FinalFRG.md: Node ID \`${g.id}\` contains spaces.`);
      if (gnIds.has(g.id)) errors.push(`3_FinalFRG.md: duplicate Node ID \`${g.id}\`.`);
      gnIds.add(g.id);
    }
    const roiUcs = new Set(hcd.ucs.filter((u) => u.roi === "roi").map((u) => u.id));
    const allUcs = new Set(hcd.ucs.map((u) => u.id));
    const ucParents = new Map<string, string[]>();
    const childSet = new Set<string>();
    for (const g of gns) {
      const ucKids = g.subnodes.filter((s) => s.startsWith("U."));
      const gnKids = g.subnodes.filter((s) => !s.startsWith("U."));
      if (!g.subnodes.length) errors.push(`\`${g.id}\` has no Subnodes (leaves must be UCs).`);
      for (const s of gnKids) {
        if (!s.startsWith("R.")) errors.push(`\`${g.id}\`: subnode \`${s}\` must be prefixed with R. or U.`);
        else if (!gnIds.has(s)) errors.push(`\`${g.id}\`: subnode \`${s}\` has no row in the FRG table.`);
        childSet.add(s);
      }
      for (const s of ucKids) {
        const id = stripUc(s);
        if (!allUcs.has(id)) errors.push(`\`${g.id}\`: \`${s}\` is not a Circuit ID in 3_UC.md.`);
        else if (!roiUcs.has(id)) errors.push(`\`${g.id}\`: \`${s}\` is outside the ROI; only ROI-internal UCs may be attached.`);
        (ucParents.get(id) ?? ucParents.set(id, []).get(id)!).push(g.id);
      }
      if (ucKids.length > 2) errors.push(`\`${g.id}\` has ${ucKids.length} UC subnodes (max 2): decompose it further.`);
      if (gnKids.length === 0 && ucKids.length === 1) errors.push(`\`${g.id}\` is realized by a single UC (${ucKids[0]}); a GN needs 2 UCs or should be merged/decomposed.`);
      if (!g.interfaceText) errors.push(`3_FinalFRG.md: \`${g.id}\` has no Interface.`);
    }
    for (const [uc, parents] of ucParents) {
      if (parents.length > 2) errors.push(`\`U.${uc}\` belongs to ${parents.length} GNs (${parents.join(", ")}; max 2).`);
    }
    for (const uc of roiUcs) if (!ucParents.has(uc)) errors.push(`ROI-internal \`U.${uc}\` is not attached to any GN.`);
    const roots = gns.filter((g) => !childSet.has(g.id));
    if (roots.length !== 1) errors.push(`The FRG must have exactly one root (the TLF); found ${roots.length}: ${roots.map((r) => r.id).join(", ") || "none (cycle)"}.`);
    const cycle = findCycle(gns);
    if (cycle) errors.push(`The FRG has a cycle: ${cycle.join(" -> ")}.`);

    if (detailTable) {
      const byId = new Map(details.map((d) => [d.id, d]));
      for (const g of gns) {
        const d = byId.get(g.id);
        if (!d) {
          errors.push(`4_FunctionDetails.md: no row for \`${g.id}\`.`);
          continue;
        }
        const empty = FUNCTION_ITEMS.filter((_, i) => ![d.requirement, d.reqRealization, d.capability, d.mechanism][i]);
        if (empty.length) errors.push(`4_FunctionDetails.md: \`${g.id}\` has empty ${empty.join(", ")}.`);
      }
    }
  }

  return { model: fatal ? null : { gns, details }, errors: [...new Set(errors)], fatal };
}

function findCycle(gns: GnRow[]): string[] | null {
  const kids = new Map(gns.map((g) => [g.id, g.subnodes.filter((s) => s.startsWith("R."))]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const k of kids.get(id) ?? []) {
      const c = visit(k);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const g of gns) {
    const c = visit(g.id);
    if (c) return c;
  }
  return null;
}

/** JSON schema of the agent's final message for every turn (Codex `outputSchema`). */
export const TURN_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["done", "question"] },
    message: { type: "string" },
    question: { type: ["string", "null"] },
  },
  required: ["status", "message", "question"],
  additionalProperties: false,
} as const;

export interface TurnOutput {
  status: "done" | "question";
  message: string;
  question: string | null;
}

export function parseTurnOutput(text: string): TurnOutput | null {
  const s = text.trim();
  if (!s.startsWith("{")) return null;
  try {
    const j = JSON.parse(s) as Partial<TurnOutput>;
    if (j.status !== "done" && j.status !== "question") return null;
    return { status: j.status, message: typeof j.message === "string" ? j.message : "", question: typeof j.question === "string" && j.question.trim() ? j.question : null };
  } catch {
    return null;
  }
}

export const CSV_FILE_NAMES = ["Project.csv", "References.csv", "Circuits.csv", "Connections.csv", "FRG.csv"] as const;
export type CsvFileName = (typeof CSV_FILE_NAMES)[number];

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

export interface BuildCsvOptions {
  projectId: string;
  contributor: string;
  /** Contents of prompts/Project.csv */
  projectTemplate: string;
  /** Used when meta.json has no description */
  roi?: string;
  tlf?: string;
  /** Project name, prepended to the Description (skipped when it is not English) */
  name?: string;
}

/** Project.csv from the fixed template (row 2 = project metadata). */
export function buildProjectCsv(o: BuildCsvOptions, meta: ProjectMeta | null): string {
  const rows = parseCsv(o.projectTemplate);
  const roi = meta?.roi || o.roi || "";
  const tlf = meta?.tlf || o.tlf || "";
  const base = meta?.description || (tlf && roi ? `${tlf} in the ${roi}.` : tlf || roi);
  const name = o.name?.trim();
  const description =
    name && !CJK_RE.test(name) && !base.toLowerCase().startsWith(name.toLowerCase()) ? (base ? `${name}: ${base}` : name) : base;
  const data = rows[1] ?? [];
  rows[1] = [o.contributor, o.projectId, o.contributor, description, data[4] || "CoBRAC-v1-0"];
  return toCsv(rows) + "\n";
}

/** Convert validated HCD/FRG models to the five CSVs. Fails (errors) when the content is not English. */
export function buildCsvs(hcd: HcdModel, frg: FrgModel, o: BuildCsvOptions): { files: Record<CsvFileName, string> | null; errors: string[] } {
  const refs = new Map<string, string>();
  for (const r of hcd.refs) if (!refs.has(r.id)) refs.set(r.id, r.doi || "N/A");
  for (const id of [...hcd.connections.map((c) => c.referenceId), ...hcd.ucs.map((u) => u.sourceOfId)]) {
    for (const part of splitRefIds(id)) if (!refs.has(part)) refs.set(part, "N/A");
  }

  const receivers = new Map<string, string[]>();
  for (const c of hcd.connections) {
    const list = receivers.get(c.sender) ?? receivers.set(c.sender, []).get(c.sender)!;
    if (!list.includes(c.receiver)) list.push(c.receiver);
  }
  const details = new Map(frg.details.map((d) => [d.id, d]));
  // appended last so the BRA columns keep their positions; omitted for projects made before the naming convention
  const withDescriptor = hcd.ucs.some((u) => u.descriptor);

  const tables: Record<Exclude<CsvFileName, "Project.csv">, string[][]> = {
    "References.csv": [["Reference ID", "DOI"], ...[...refs].map(([id, doi]) => [id, doi])],
    "Circuits.csv": [
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", ...(withDescriptor ? [UC_DESCRIPTOR] : [])],
      ...hcd.ucs.map((u) => [u.id, u.sourceOfId, u.names, u.transmitter, u.modulationType, u.comments, ...(withDescriptor ? [u.descriptor] : [])]),
    ],
    "Connections.csv": [
      CONN_COLUMNS.map((c) => (c === "Comment" ? "Comments" : c)),
      ...hcd.connections.map((c) => [c.sender, c.receiver, c.comment, c.referenceId, c.taxon, c.method, c.pointersOnLiterature, c.pointersOnFigure]),
    ],
    "FRG.csv": [
      [
        "Node ID",
        "Subnodes",
        "Circuit ID",
        "Projected Circuits",
        "Capability",
        "Mechanism",
        "Implementation of Uniform Circuit",
        "Requirements Realization by Interface",
        "Requirements",
        "Output Semantics",
        "Comments",
      ],
      ...frg.gns.map((g) => {
        const d = details.get(g.id);
        return [g.id, g.subnodes.join(";"), "", "", d?.capability ?? "", d?.mechanism ?? "", "", d?.reqRealization ?? "", d?.requirement ?? "", "", g.comment];
      }),
      ...hcd.ucs.map((u) => [
        `U.${u.id}`,
        "",
        u.id,
        (receivers.get(u.id) ?? []).join(";"),
        u.capability,
        u.mechanism,
        u.implementation,
        u.reqRealization,
        u.requirement,
        u.outputSemantics,
        u.comments,
      ]),
    ],
  };

  const project = buildProjectCsv(o, hcd.meta);
  const errors: string[] = [];
  for (const [name, rows] of [["Project.csv", parseCsv(project)] as const, ...Object.entries(tables)]) {
    const hit = rows.flat().find((c) => CJK_RE.test(c));
    if (hit) errors.push(`${name} would contain non-English text (e.g. "${hit.slice(0, 40)}"); all CSV content must be English.`);
  }
  if (errors.length) return { files: null, errors };

  const files = { "Project.csv": project } as Record<CsvFileName, string>;
  for (const [name, rows] of Object.entries(tables)) files[name as CsvFileName] = toCsv(rows) + "\n";
  return { files, errors };
}
