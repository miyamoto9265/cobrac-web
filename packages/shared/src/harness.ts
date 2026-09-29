/**
 * CoBRAC harness: JSON Schemas of the agent's HCD / FRG data files, deterministic checks, and conversion to the
 * five BRA CSVs. Pure functions (no fs) so the worker and tests share them.
 */
import { parseCsv, toCsv } from "./csv.js";
import { validateJsonSchema, type JsonSchema } from "./jsonSchema.js";
import { normalizeProjectName } from "./projectId.js";
import { checkUcNaming, splitTopLevel, type SabraLookup } from "./ucNaming.js";

/** Files at the project root (`<ProjectID>/`). The two markdown files are the only free-text outputs. */
export const PROJECT_FILES = {
  meta: "meta.json",
  decisionLog: "decision_log.md",
  report: "report.md",
  rcsLog: "rcs_mcp_calls.jsonl",
  referenceCheck: "reference_check.json",
} as const;

/** Data files in `<ProjectID>/<ProjectID>_HCD/` and `_FRG/`; each has a JSON Schema in `HARNESS_SCHEMAS`. */
export const HCD_FILES = { references: "references.json", uc: "uc.json", connections: "connections.json" } as const;
export const FRG_FILES = { frg: "frg.json" } as const;

/** Directory (relative to the agent's working directory) where the worker writes `HARNESS_SCHEMAS`. */
export const SCHEMA_DIR = "schemas";
export const schemaFileName = (file: string) => file.replace(/\.json$/, ".schema.json");

/** `report.md` sections required after each phase. */
export const REPORT_SECTIONS = { HCD: "## HCD", FRG: "## FRG" } as const;

export interface ProjectMeta {
  roi: string;
  tlf: string;
  description: string;
  /** Project name proposed by the agent ("<TLF> in <ROI>") */
  name?: string;
}

export type UcRoi = "roi" | "input" | "output" | "both";
/** `roi` values in uc.json; the external ones are also the tag written into Circuits.csv Comments. */
export const UC_ROI_VALUES = ["internal", "noROI(input)", "noROI(output)", "noROI(input,output)"] as const;
const ROI_OF: Record<(typeof UC_ROI_VALUES)[number], UcRoi> = {
  internal: "roi",
  "noROI(input)": "input",
  "noROI(output)": "output",
  "noROI(input,output)": "both",
};
const ROI_TAG: Record<UcRoi, string> = { roi: "", input: "noROI(input)", output: "noROI(output)", both: "noROI(input,output)" };

export interface UcRow {
  id: string;
  descriptor: string;
  names: string;
  roi: UcRoi;
  sourceOfId: string[];
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
}

/** Tissue-level projection found in the literature (BIF). */
export interface BifRow {
  sender: string;
  receiver: string;
  comment: string;
  referenceIds: string[];
}

export interface ConnRow {
  sender: string;
  receiver: string;
  comment: string;
  referenceIds: string[];
  taxon: string;
  method: string;
  pointersOnLiterature: string;
  pointersOnFigure: string;
}

export interface RefRow {
  id: string;
  doi: string;
  /** Optional in references.json so files with only id and doi stay valid; empty when absent */
  pmid?: string;
  title?: string;
  journal?: string;
}

export interface HcdModel {
  meta: ProjectMeta | null;
  refs: RefRow[];
  ucs: UcRow[];
  bif: BifRow[];
  connections: ConnRow[];
}

export interface GnRow {
  id: string;
  subnodes: string[];
  comment: string;
  interfaceText: string;
  requirement: string;
  reqRealization: string;
  capability: string;
  mechanism: string;
}

export interface FrgModel {
  gns: GnRow[];
}

export interface CheckResult<T> {
  model: T | null;
  /** Problems the agent should fix */
  errors: string[];
  /** True when the output cannot be used at all (missing core file) */
  fatal: boolean;
}

/** File contents as read by the worker (null / undefined = missing). */
export interface HcdInputs {
  meta?: string | null;
  decisionLog?: string | null;
  report?: string | null;
  references?: string | null;
  uc?: string | null;
  connections?: string | null;
}

export interface FrgInputs {
  report?: string | null;
  frg?: string | null;
}

// --- schemas -------------------------------------------------------------------------------------------------------

const SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema";
const str = (description?: string): JsonSchema => ({ type: "string", ...(description ? { description } : {}) });
const nonEmpty = (description?: string): JsonSchema => ({ ...str(description), minLength: 1 });
const REF_ID: JsonSchema = { type: "string", pattern: "^\\[[^\\[\\]]+\\]$", description: "Reference ID `[Author, Year]` from references.json" };
const refIds = (description: string): JsonSchema => ({ type: "array", minItems: 1, items: REF_ID, description });

function record(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: "object", required: Object.keys(properties), additionalProperties: false, properties };
}

function fileSchema(file: string, title: string, arrays: Record<string, { description: string; item: JsonSchema }>): JsonSchema {
  const properties: Record<string, JsonSchema> = { $schema: str() };
  for (const [k, a] of Object.entries(arrays)) properties[k] = { type: "array", minItems: 1, description: a.description, items: a.item };
  return { $schema: SCHEMA_URI, $id: schemaFileName(file), title, type: "object", required: Object.keys(arrays), additionalProperties: false, properties };
}

const FUNCTION_ITEM_DESCRIPTIONS = {
  requirement: "Requirement (empty for external UCs)",
  requirementRealization: "Requirement realization by interface (empty for external UCs)",
  capability: "Capability (empty for external UCs)",
  mechanism: "Mechanism (empty for external UCs)",
} as const;

/** JSON Schemas of every JSON file the agent writes, keyed by file name. */
export const HARNESS_SCHEMAS: Record<string, JsonSchema> = {
  [PROJECT_FILES.meta]: {
    $schema: SCHEMA_URI,
    $id: schemaFileName(PROJECT_FILES.meta),
    title: "Project metadata",
    ...record({
      $schema: str(),
      roi: nonEmpty("ROI in English"),
      tlf: nonEmpty("TLF in English"),
      description: nonEmpty("One English sentence describing the project"),
      name: nonEmpty("Display name `<TLF> in <ROI>` (English, sentence case, about 60 characters, max 200)"),
    }),
    required: ["roi", "tlf", "description", "name"],
  },
  [HCD_FILES.references]: fileSchema(HCD_FILES.references, "Literature cited by the HCD / FRG", {
    references: {
      description: "Every reference cited anywhere in the project, each once",
      item: {
        ...record({
          id: REF_ID,
          doi: nonEmpty("DOI without the https://doi.org/ prefix, or N/A when unknown (never invented)"),
          pmid: { type: "string", pattern: "^(\\d{1,9})?$", description: "PubMed ID (digits only), or empty when unknown" },
          title: str("Title of the paper exactly as published (the worker compares it with Crossref / PubMed)"),
          journal: str("Journal or book title"),
        }),
        required: ["id", "doi"],
      },
    },
  }),
  [HCD_FILES.uc]: fileSchema(HCD_FILES.uc, "Uniform Circuits (UCs) of the HCD", {
    ucs: {
      description: "One entry per UC, ROI-internal and external",
      item: record({
        circuitId: { type: "string", pattern: "^\\S+$", description: "Circuit ID by the UC naming rules (no `U.` prefix, no backticks)" },
        descriptor: nonEmpty("UC Descriptor by the UC naming rules"),
        names: nonEmpty("Formal name"),
        roi: { enum: UC_ROI_VALUES, description: "internal, or the noROI tag of an external UC" },
        sourceOfId: refIds("Main supporting Reference IDs"),
        transmitter: str("Transmitter; empty when unknown"),
        modulationType: { enum: ["Excitatory", "Inhibitory", "Modulatory", ""], description: "Empty when unknown" },
        comments: str("Role and corresponding tissue (the noROI tag is added from `roi`)"),
        interface: str("`([Out1], [Out2]) = <Circuit ID>([In1], [In2])` for ROI-internal UCs; empty for external UCs"),
        outputSemantics: str("`[<Circuit ID>]content;` (empty only for external sinks)"),
        ...Object.fromEntries(Object.entries(FUNCTION_ITEM_DESCRIPTIONS).map(([k, d]) => [k, str(d)])),
        implementation: str("Equations only, e.g. `[U.A] = P([U.B]|[U.C])` (empty for external UCs)"),
      }),
    },
  }),
  [HCD_FILES.connections]: fileSchema(HCD_FILES.connections, "Brain information flow (BIF) and UC connections", {
    bif: {
      description: "Tissue-level projections surveyed in HCD step 2 (evidence for the UC connections)",
      item: record({
        sender: nonEmpty("Sending tissue"),
        receiver: nonEmpty("Receiving tissue"),
        comment: str("Outside-ROI note, strength, excitatory/inhibitory nature"),
        referenceIds: refIds("Supporting Reference IDs"),
      }),
    },
    connections: {
      description: "Directed UC-to-UC connections (HCD step 4)",
      item: record({
        sender: nonEmpty("Sender Circuit ID (sCID) from uc.json"),
        receiver: nonEmpty("Receiver Circuit ID (rCID) from uc.json"),
        comment: str("Property and information carried"),
        referenceIds: refIds("Supporting Reference IDs"),
        taxon: str(),
        measurementMethod: str(),
        pointersOnLiterature: str("Short location in the paper"),
        pointersOnFigure: str("Short location in the paper's figures"),
      }),
    },
  }),
  [FRG_FILES.frg]: fileSchema(FRG_FILES.frg, "Function Realization Graph (TLF and group nodes)", {
    nodes: {
      description: "One entry per TLF / GN (UCs are leaves in `subnodes`, not entries)",
      item: record({
        id: { type: "string", pattern: "^R\\.\\S+$", description: "`R.` + kebab-case name" },
        subnodes: { type: "array", minItems: 1, items: { type: "string", pattern: "^[RU]\\.\\S+$" }, description: "`R.<GN>` or `U.<Circuit ID>`" },
        comment: nonEmpty("Description of the node"),
        interface: str("`([U.X]) = R.Node([U.Y], [U.Z])`"),
        requirement: str("Requirement"),
        requirementRealization: str("Requirement realization by interface"),
        capability: str("Capability"),
        mechanism: str("Mechanism"),
      }),
    },
  }),
};

// --- helpers -------------------------------------------------------------------------------------------------------

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const MAX_SCHEMA_ERRORS = 20;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strings = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const items = (v: unknown, key: string): Record<string, unknown>[] | null => {
  const arr = v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
  return Array.isArray(arr) ? arr.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : null;
};
const stripUc = (x: string) => x.replace(/`/g, "").trim().replace(/^U\./, "");
const hasSpace = (x: string) => /\s/.test(x);

/** `[A, 2000]; [B, 2001]` → each bracketed ID; a bare value is one ID. */
export const splitRefIds = (x: string): string[] => x.match(/\[[^\]]+\]/g) ?? (x.trim() ? [x.trim()] : []);

/** Parse a data file and check it against its schema; problems are pushed to `errors`, null when unusable. */
function readJson(file: string, text: string | null | undefined, errors: string[]): unknown {
  if (!text?.trim()) {
    errors.push(`${file} is missing or empty.`);
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    errors.push(`${file} is not valid JSON (${e instanceof Error ? e.message : String(e)}).`);
    return null;
  }
  const problems = validateJsonSchema(HARNESS_SCHEMAS[file], value);
  for (const p of problems.slice(0, MAX_SCHEMA_ERRORS)) errors.push(`${file}: ${p} (see ${SCHEMA_DIR}/${schemaFileName(file)}).`);
  if (problems.length > MAX_SCHEMA_ERRORS) errors.push(`${file}: …and ${problems.length - MAX_SCHEMA_ERRORS} more schema problems.`);
  const cjk: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (CJK_RE.test(v)) cjk.push(`${path} ("${v.slice(0, 40)}")`);
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}/${k}`);
  };
  walk(value, "");
  if (cjk.length) errors.push(`${file}: write every value in English; non-English text at ${cjk.slice(0, 5).join(", ")}${cjk.length > 5 ? ", …" : ""}.`);
  return value;
}

function checkMarkdown(file: string, text: string | null | undefined, errors: string[], section?: string) {
  if (!text?.trim()) {
    errors.push(`${file} is missing or empty.`);
    return;
  }
  if (section && !new RegExp(`^${section}\\b`, "m").test(text)) errors.push(`${file}: add the \`${section}\` section.`);
}

/** Index of the `(` matching the `)` at `close`, or -1. */
function matchingOpen(x: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (x[i] === ")") depth++;
    else if (x[i] === "(" && --depth === 0) return i;
  }
  return -1;
}

/** Index of the first `=` outside brackets, or -1. */
function topLevelEquals(x: string): number {
  let depth = 0;
  for (let i = 0; i < x.length; i++) {
    const c = x[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (c === "=" && depth === 0) return i;
  }
  return -1;
}

const interfaceIds = (x: string) =>
  splitTopLevel(x, ",").map((y) => {
    const t = y.trim();
    return stripUc(t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1) : t);
  });

/**
 * `([A], [B]) = X([C])` → outputs/inputs as bare circuit IDs; null when the text does not have that shape.
 * Circuit IDs may themselves contain brackets (`[U.NAC(shell,DRD1+)]`), so the input list is the last balanced
 * `(…)` and every list is split on top-level commas only.
 */
export function parseInterface(text: string): { name: string; outputs: string[]; inputs: string[] } | null {
  const x = text.replace(/`/g, "").replace(/\n/g, " ").trim();
  const eq = topLevelEquals(x);
  if (eq < 0) return null;
  let lhs = x.slice(0, eq).trim();
  const rhs = x.slice(eq + 1).trim();
  if (!rhs.endsWith(")")) return null;
  const open = matchingOpen(rhs, rhs.length - 1);
  if (open <= 0) return null;
  const name = stripUc(rhs.slice(0, open));
  if (!name || /[\s=]/.test(name)) return null;
  if (lhs.startsWith("(") && matchingOpen(lhs, lhs.length - 1) === 0) lhs = lhs.slice(1, -1);
  return { name, outputs: interfaceIds(lhs), inputs: interfaceIds(rhs.slice(open + 1, -1)) };
}

function parseMeta(text: string | null | undefined, errors: string[]): ProjectMeta | null {
  const j = readJson(PROJECT_FILES.meta, text, errors) as Partial<Record<keyof ProjectMeta, unknown>> | null;
  if (!j || typeof j !== "object") return null;
  const meta: ProjectMeta = { roi: s(j.roi), tlf: s(j.tlf), description: s(j.description) };
  if (typeof j.name === "string" && j.name.trim()) {
    const n = normalizeProjectName(j.name);
    if ("error" in n) errors.push(`meta.json: "name" is invalid (${n.error}).`);
    else meta.name = n.name;
  }
  return meta;
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

// --- HCD -----------------------------------------------------------------------------------------------------------

export interface CheckHcdOptions {
  /** RCS facts for HOMBA anchors; without an entry the anchor-abbreviation check of that UC is skipped. */
  sabra?: SabraLookup;
}

export function checkHcd(files: HcdInputs, opts: CheckHcdOptions = {}): CheckResult<HcdModel> {
  const errors: string[] = [];
  const meta = parseMeta(files.meta, errors);
  checkMarkdown(PROJECT_FILES.decisionLog, files.decisionLog, errors);
  checkMarkdown(PROJECT_FILES.report, files.report, errors, REPORT_SECTIONS.HCD);

  const refs: RefRow[] = [];
  const refIds = new Set<string>();
  for (const r of items(readJson(HCD_FILES.references, files.references, errors), "references") ?? []) {
    const id = s(r.id);
    if (!id) continue;
    if (refIds.has(id)) errors.push(`references.json: ${id} is listed more than once.`);
    else refs.push({ id, doi: s(r.doi) || "N/A", pmid: s(r.pmid), title: s(r.title), journal: s(r.journal) });
    refIds.add(id);
  }
  const checkRefs = (where: string, ids: string[]) => {
    if (!refs.length) return;
    for (const id of ids) if (!refIds.has(id)) errors.push(`${where}: Reference ID ${id} is not in references.json.`);
  };

  const ucItems = items(readJson(HCD_FILES.uc, files.uc, errors), "ucs");
  const ucs: UcRow[] = (ucItems ?? [])
    .map((u) => ({
      id: stripUc(s(u.circuitId)),
      descriptor: s(u.descriptor).replace(/\s+/g, ""),
      names: s(u.names),
      roi: ROI_OF[s(u.roi) as keyof typeof ROI_OF] ?? "roi",
      sourceOfId: strings(u.sourceOfId),
      transmitter: s(u.transmitter),
      modulationType: s(u.modulationType),
      comments: s(u.comments),
      interfaceText: s(u.interface),
      outputSemantics: s(u.outputSemantics),
      requirement: s(u.requirement),
      reqRealization: s(u.requirementRealization),
      capability: s(u.capability),
      mechanism: s(u.mechanism),
      implementation: s(u.implementation),
    }))
    .filter((u) => u.id);
  const seen = new Set<string>();
  for (const u of ucs) {
    if (seen.has(u.id)) errors.push(`uc.json: Circuit ID \`${u.id}\` is used by more than one UC.`);
    seen.add(u.id);
    checkRefs(`uc.json: sourceOfId of \`${u.id}\``, u.sourceOfId);
  }
  if (ucItems && ucs.length) {
    errors.push(...checkUcNaming(ucs, opts.sabra));
    if (!ucs.some((u) => u.roi === "roi")) errors.push("uc.json: no ROI-internal UC (every UC has a noROI `roi`).");
  }

  const connJson = readJson(HCD_FILES.connections, files.connections, errors);
  const bif: BifRow[] = (items(connJson, "bif") ?? []).map((b) => ({
    sender: s(b.sender),
    receiver: s(b.receiver),
    comment: s(b.comment),
    referenceIds: strings(b.referenceIds),
  }));
  for (const b of bif) checkRefs(`connections.json: bif ${b.sender} -> ${b.receiver}`, b.referenceIds);
  const connItems = items(connJson, "connections");
  const connections: ConnRow[] = (connItems ?? [])
    .map((c) => ({
      sender: stripUc(s(c.sender)),
      receiver: stripUc(s(c.receiver)),
      comment: s(c.comment),
      referenceIds: strings(c.referenceIds),
      taxon: s(c.taxon),
      method: s(c.measurementMethod),
      pointersOnLiterature: s(c.pointersOnLiterature),
      pointersOnFigure: s(c.pointersOnFigure),
    }))
    .filter((c) => c.sender || c.receiver);

  const fatal = !connItems || ucs.length === 0;
  if (!fatal) {
    const ids = new Set(ucs.map((u) => u.id));
    const senders = new Map<string, string[]>();
    const receivers = new Map<string, string[]>();
    for (const c of connections) {
      for (const [end, id] of [
        ["sender", c.sender],
        ["receiver", c.receiver],
      ] as const) {
        if (!ids.has(id)) errors.push(`connections.json: ${end} \`${id}\` (\`${c.sender}\` -> \`${c.receiver}\`) is not a Circuit ID in uc.json.`);
      }
      checkRefs(`connections.json: \`${c.sender}\` -> \`${c.receiver}\``, c.referenceIds);
      (senders.get(c.receiver) ?? senders.set(c.receiver, []).get(c.receiver)!).push(c.sender);
      (receivers.get(c.sender) ?? receivers.set(c.sender, []).get(c.sender)!).push(c.receiver);
    }
    for (const u of ucs) {
      if (!senders.has(u.id) && !receivers.has(u.id)) errors.push(`\`${u.id}\` has no connection in connections.json.`);
      const isSink = u.roi !== "roi" && !receivers.has(u.id);
      if (!u.outputSemantics && !isSink) errors.push(`uc.json: \`${u.id}\` has no outputSemantics.`);
      if (u.roi !== "roi") continue;
      const empty = (
        [
          ["interface", u.interfaceText],
          ["requirement", u.requirement],
          ["requirementRealization", u.reqRealization],
          ["capability", u.capability],
          ["mechanism", u.mechanism],
          ["implementation", u.implementation],
        ] as const
      )
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (empty.length) errors.push(`uc.json: ROI-internal \`${u.id}\` has empty ${empty.join(", ")}.`);
      if (!u.interfaceText) continue;
      const itf = parseInterface(u.interfaceText);
      if (!itf) {
        errors.push(`uc.json: interface of \`${u.id}\` is not in the form ([Out1], [Out2]) = ${u.id}([In1], [In2]).`);
        continue;
      }
      if (itf.name !== u.id) errors.push(`uc.json: interface of \`${u.id}\` names \`${itf.name}\`; write it as (…) = ${u.id}(…).`);
      const ins = senders.get(u.id) ?? [];
      const outs = receivers.get(u.id) ?? [];
      if (!sameSet(itf.inputs, ins)) {
        errors.push(`\`${u.id}\`: interface inputs [${itf.inputs.join(", ")}] differ from its senders in connections.json [${[...new Set(ins)].join(", ")}].`);
      }
      if (!sameSet(itf.outputs, outs)) {
        errors.push(`\`${u.id}\`: interface outputs [${itf.outputs.join(", ")}] differ from its receivers in connections.json [${[...new Set(outs)].join(", ")}].`);
      }
    }
  }

  return { model: fatal ? null : { meta, refs, ucs, bif, connections }, errors: [...new Set(errors)], fatal };
}

// --- FRG -----------------------------------------------------------------------------------------------------------

export function checkFrg(files: FrgInputs, hcd: HcdModel): CheckResult<FrgModel> {
  const errors: string[] = [];
  checkMarkdown(PROJECT_FILES.report, files.report, errors, REPORT_SECTIONS.FRG);

  const nodeItems = items(readJson(FRG_FILES.frg, files.frg, errors), "nodes");
  const gns: GnRow[] = (nodeItems ?? [])
    .map((n) => ({
      id: s(n.id),
      subnodes: strings(n.subnodes).map((x) => x.replace(/`/g, "")),
      comment: s(n.comment),
      interfaceText: s(n.interface),
      requirement: s(n.requirement),
      reqRealization: s(n.requirementRealization),
      capability: s(n.capability),
      mechanism: s(n.mechanism),
    }))
    .filter((g) => g.id);

  const fatal = gns.length === 0;
  if (!fatal) {
    const gnIds = new Set<string>();
    for (const g of gns) {
      if (!g.id.startsWith("R.")) errors.push(`frg.json: node id \`${g.id}\` must start with "R." (UCs are subnodes, not nodes).`);
      if (hasSpace(g.id)) errors.push(`frg.json: node id \`${g.id}\` contains spaces.`);
      if (gnIds.has(g.id)) errors.push(`frg.json: duplicate node id \`${g.id}\`.`);
      gnIds.add(g.id);
    }
    const roiUcs = new Set(hcd.ucs.filter((u) => u.roi === "roi").map((u) => u.id));
    const allUcs = new Set(hcd.ucs.map((u) => u.id));
    const ucParents = new Map<string, string[]>();
    const childSet = new Set<string>();
    for (const g of gns) {
      const ucKids = g.subnodes.filter((x) => x.startsWith("U."));
      const gnKids = g.subnodes.filter((x) => !x.startsWith("U."));
      if (!g.subnodes.length) errors.push(`\`${g.id}\` has no subnodes (leaves must be UCs).`);
      for (const x of gnKids) {
        if (!x.startsWith("R.")) errors.push(`\`${g.id}\`: subnode \`${x}\` must be prefixed with R. or U.`);
        else if (!gnIds.has(x)) errors.push(`\`${g.id}\`: subnode \`${x}\` is not a node in frg.json.`);
        childSet.add(x);
      }
      for (const x of ucKids) {
        const id = stripUc(x);
        if (!allUcs.has(id)) errors.push(`\`${g.id}\`: \`${x}\` is not a Circuit ID in uc.json.`);
        else if (!roiUcs.has(id)) errors.push(`\`${g.id}\`: \`${x}\` is outside the ROI; only ROI-internal UCs may be attached.`);
        (ucParents.get(id) ?? ucParents.set(id, []).get(id)!).push(g.id);
      }
      if (ucKids.length > 2) errors.push(`\`${g.id}\` has ${ucKids.length} UC subnodes (max 2): decompose it further.`);
      if (gnKids.length === 0 && ucKids.length === 1) errors.push(`\`${g.id}\` is realized by a single UC (${ucKids[0]}); a GN needs 2 UCs or should be merged/decomposed.`);
      const empty = (
        [
          ["interface", g.interfaceText],
          ["requirement", g.requirement],
          ["requirementRealization", g.reqRealization],
          ["capability", g.capability],
          ["mechanism", g.mechanism],
        ] as const
      )
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (empty.length) errors.push(`frg.json: \`${g.id}\` has empty ${empty.join(", ")}.`);
    }
    for (const [uc, parents] of ucParents) {
      if (parents.length > 2) errors.push(`\`U.${uc}\` belongs to ${parents.length} GNs (${parents.join(", ")}; max 2).`);
    }
    for (const uc of roiUcs) if (!ucParents.has(uc)) errors.push(`ROI-internal \`U.${uc}\` is not attached to any GN.`);
    const roots = gns.filter((g) => !childSet.has(g.id));
    if (roots.length !== 1) errors.push(`The FRG must have exactly one root (the TLF); found ${roots.length}: ${roots.map((r) => r.id).join(", ") || "none (cycle)"}.`);
    const cycle = findCycle(gns);
    if (cycle) errors.push(`The FRG has a cycle: ${cycle.join(" -> ")}.`);
  }

  return { model: fatal ? null : { gns }, errors: [...new Set(errors)], fatal };
}

function findCycle(gns: GnRow[]): string[] | null {
  const kids = new Map(gns.map((g) => [g.id, g.subnodes.filter((x) => x.startsWith("R."))]));
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

// --- turn output ---------------------------------------------------------------------------------------------------

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
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  try {
    const j = JSON.parse(t) as Partial<TurnOutput>;
    if (j.status !== "done" && j.status !== "question") return null;
    return { status: j.status, message: typeof j.message === "string" ? j.message : "", question: typeof j.question === "string" && j.question.trim() ? j.question : null };
  } catch {
    return null;
  }
}

// --- CSV -----------------------------------------------------------------------------------------------------------

export const CSV_FILE_NAMES = ["Project.csv", "References.csv", "Circuits.csv", "Connections.csv", "FRG.csv"] as const;
export type CsvFileName = (typeof CSV_FILE_NAMES)[number];

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

const joinRefs = (ids: string[]) => ids.join("; ");
/** Circuits.csv Comments carry the noROI tag the BRA format (and the graph builder) read. */
const circuitComments = (u: UcRow) =>
  u.roi === "roi" || /noroi/i.test(u.comments) ? u.comments : [u.comments, ROI_TAG[u.roi]].filter(Boolean).join("; ");

/** Convert validated HCD/FRG models to the five CSVs. Fails (errors) when the content is not English. */
export function buildCsvs(hcd: HcdModel, frg: FrgModel, o: BuildCsvOptions): { files: Record<CsvFileName, string> | null; errors: string[] } {
  const refs = new Map<string, string>();
  for (const r of hcd.refs) if (!refs.has(r.id)) refs.set(r.id, r.doi || "N/A");
  for (const id of [...hcd.connections.flatMap((c) => c.referenceIds), ...hcd.ucs.flatMap((u) => u.sourceOfId)]) {
    if (!refs.has(id)) refs.set(id, "N/A");
  }

  const receivers = new Map<string, string[]>();
  for (const c of hcd.connections) {
    const list = receivers.get(c.sender) ?? receivers.set(c.sender, []).get(c.sender)!;
    if (!list.includes(c.receiver)) list.push(c.receiver);
  }

  const tables: Record<Exclude<CsvFileName, "Project.csv">, string[][]> = {
    "References.csv": [["Reference ID", "DOI"], ...[...refs].map(([id, doi]) => [id, doi])],
    // UC Descriptor is appended last so the BRA columns keep their positions
    "Circuits.csv": [
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", "UC Descriptor"],
      ...hcd.ucs.map((u) => [u.id, joinRefs(u.sourceOfId), u.names, u.transmitter, u.modulationType, circuitComments(u), u.descriptor]),
    ],
    "Connections.csv": [
      ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)", "Comments", "Reference ID", "Taxon", "Measurement method", "Pointers on literature", "Pointers on figure"],
      ...hcd.connections.map((c) => [c.sender, c.receiver, c.comment, joinRefs(c.referenceIds), c.taxon, c.method, c.pointersOnLiterature, c.pointersOnFigure]),
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
      ...frg.gns.map((g) => [g.id, g.subnodes.join(";"), "", "", g.capability, g.mechanism, "", g.reqRealization, g.requirement, "", g.comment]),
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
        circuitComments(u),
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
