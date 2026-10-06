/**
 * CoBRAC harness: JSON Schemas of the agent's HCD / FRG data files, deterministic checks, and conversion to the
 * five BRA CSVs. Pure functions (no fs) so the worker and tests share them.
 */
import {
  BRA_LITERATURE_TYPES,
  BRA_MEASUREMENT_METHODS,
  BRA_MODULATION_TYPES,
  BRA_TAXA,
  CIRCUIT_RELATIONS,
  BRA_TRANSMITTERS,
  DEFAULT_BRA_RULES,
  OUT_OF_ROI_CAPABILITY,
  formatOutputSemantics,
  isRoiCircuitId,
  normalizeFigurePointer,
  parseOutputSemantics,
  pointerProblems,
  relationProblems,
  roiCircuitId,
  sourceOfIdProblem,
  type BraRules,
  type OutputSemanticsItem,
} from "./bra.js";
import { parseCsv, toCsv } from "./csv.js";
import {
  HYPOTHESES_FILE,
  gnDependencyNote,
  gnHypothesisDependencies,
  hasHypothesisKey,
  hypothesisKeySchema,
  hypothesisProblems,
  hypothesisRecords,
  isHypothesisMode,
  parseHypothesis,
  strictHypothesisProblems,
  withHypothesisLine,
  type EvidenceOptions,
  type Hypothesis,
} from "./hypothesis.js";
import { validateJsonSchema, type JsonSchema } from "./jsonSchema.js";
import { isConnectedSet, MAX_MOTIF_UCS } from "./motifs.js";
import { normalizeProjectName } from "./projectId.js";
import { RESEARCH_FILES, RESEARCH_SCHEMA } from "./research.js";
import {
  CIRCUIT_ID_RE,
  checkUcNaming,
  modernCircuitId,
  namesStartWithOfficial,
  normalizeUcDescriptor,
  bnaArea,
  parseUcDescriptor,
  sabraOfficialName,
  splitTopLevel,
  ucFacetValues,
  type SabraBoundary,
  type SabraLookup,
  type UcAnchor,
  type UcDescriptor,
} from "./ucNaming.js";

/**
 * Files at the project root (`<ProjectID>/`). The two markdown files are the only free-text outputs.
 * Everything checked here is a core artifact and must be English. Explanatory articles (`article/<locale>.md`,
 * see article.ts) are not: they are written outside the workspace in the user's language and never reach these checks.
 */
export const PROJECT_FILES = {
  meta: "meta.json",
  decisionLog: "decision_log.md",
  report: "report.md",
  rcsLog: "rcs_mcp_calls.jsonl",
  referenceCheck: "reference_check.json",
  quoteCheck: "quote_check.json",
  crossCheck: "cross_check.json",
  /** Bottom-up candidates for the FRG (motifs.ts), rewritten from the HCD at every check */
  frgCandidates: "frg_candidates.json",
  phaseBaseline: "phase_baseline.json",
  /** Hypothesis mode only: the hypotheses with their IDs, the share and the GNs that depend on them (hypothesis.ts) */
  hypotheses: HYPOTHESES_FILE,
} as const;

/** Data files in `<ProjectID>/<ProjectID>_HCD/` and `_FRG/`; each has a JSON Schema in `HARNESS_SCHEMAS`. */
export const HCD_FILES = { references: "references.json", uc: "uc.json", connections: "connections.json" } as const;
export const FRG_FILES = { frg: "frg.json" } as const;

/** Directory (relative to the agent's working directory) where the worker writes `HARNESS_SCHEMAS`. */
export const SCHEMA_DIR = "schemas";
export const schemaFileName = (file: string) => file.replace(/\.json$/, ".schema.json");

/** `report.md` sections required after each phase. */
export const REPORT_SECTIONS = { HCD: "## HCD", FRG: "## FRG" } as const;

/**
 * Harness rule set of a project, stored on the project when it is created (`ProjectRecord.harnessRules`); absent = 0,
 * the projects created before these rules, which are checked as before. From 1: every element of the ROI has a
 * ROI-internal UC of its own (`roiElements`), the ROI's side is declared and a side the user did not give means both
 * sides (`roiSide`), and a quote that supports several connections is warned about. From 2: the UCs of a GN are
 * connected among themselves by ROI-internal connections, and a GN may hold 3-4 UCs that form a motif when its
 * `motifNote` says why (below 2 a GN holds at most 2 UCs and `motifNote` is not read).
 */
export const HARNESS_RULES = 2;

export const ROI_SIDES = ["both", "left", "right"] as const;
export type RoiSide = (typeof ROI_SIDES)[number];
/** `user`: the user's ROI or instructions name the side; `assumed`: they do not, so the ROI covers both sides. */
export const ROI_SIDE_SOURCES = ["user", "assumed"] as const;
export type RoiSideSource = (typeof ROI_SIDE_SOURCES)[number];

/** One element (region) of the ROI and the Circuit IDs of the ROI-internal UCs or Collections that represent it. */
export interface RoiElement {
  name: string;
  ucs: string[];
}

export interface ProjectMeta {
  roi: string;
  tlf: string;
  description: string;
  /** Project name proposed by the agent ("<TLF> in <ROI>") */
  name?: string;
  /** Harness rules 1: the ROI's elements */
  roiElements?: RoiElement[];
  /** Harness rules 1: the ROI's side and where it comes from */
  roiSide?: RoiSide;
  roiSideSource?: RoiSideSource;
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
  /** One value: DHBA / MBA / UBERON / collection / makeshift / a Reference ID */
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
  /** Why a UC that spans several SABRA units is uniform in this HCD (empty for most UCs) */
  uniformityNote: string;
  /** Hypothesis mode: the UC (or a property of it) is a hypothesis; never set in other projects */
  hypothesis?: Hypothesis;
}

/**
 * Collection Circuit (Uniform = FALSE) of one HCD: a circuit the HCD decomposes into Sub-Circuits. Uniformity is
 * relative to the HCD, so the same UC Descriptor may be a UC in one project and a Collection in another. A Collection
 * is neither Sender nor Receiver of a connection, has no Interface and is not an FRG leaf.
 */
export interface CollectionRow {
  id: string;
  /** UC Descriptor when the Collection is one SABRA unit or a faceted population; empty for other groupings */
  descriptor: string;
  names: string;
  sourceOfId: string;
  /** Circuit IDs of the UCs and Collections it contains */
  subCircuits: string[];
  comments: string;
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
  /** One Reference ID per connection; files written before 0.10 may hold several (the CSV gets one row each) */
  referenceIds: string[];
  taxon: string;
  method: string;
  pointersOnLiterature: string;
  pointersOnFigure: string;
  /** How the UC relates to the circuit the paper names (`<` `=` `>`), and that name; "=" / "" in files written before 0.10 */
  senderRelation: string;
  senderInLiterature: string;
  receiverRelation: string;
  receiverInLiterature: string;
  /** Hypothesis mode: the connection (or its direction / sign) is a hypothesis; never set in other projects */
  hypothesis?: Hypothesis;
}

export interface RefRow {
  id: string;
  doi: string;
  /** Optional in references.json so files with only id and doi stay valid; empty when absent */
  pmid?: string;
  title?: string;
  journal?: string;
  /** BRA Literature type (empty when absent, e.g. files written before 0.10) */
  literatureType?: string;
  /** URL of the document when it has no DOI */
  alternativeUrl?: string;
}

export interface HcdModel {
  meta: ProjectMeta | null;
  refs: RefRow[];
  ucs: UcRow[];
  /** Empty when uc.json has no `collections` */
  collections: CollectionRow[];
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
  /** Why a GN holds 3-4 UCs (a motif that pairs of UCs cannot express); empty otherwise */
  motifNote: string;
}

export interface FrgModel {
  gns: GnRow[];
}

export interface CheckResult<T> {
  model: T | null;
  /** Problems the agent should fix */
  errors: string[];
  /** Findings shown to the user but not sent back to the agent */
  warnings?: string[];
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
const SOURCE_OF_ID: JsonSchema = {
  type: "string",
  pattern: "^(DHBA|BNA|MBA|UBERON|collection|makeshift|\\[[^\\[\\]]+\\])$",
  description:
    "One value: DHBA for a UC that is a whole DHBA term (anchor only); BNA for a whole BNA area or group (anchor only); for a UC finer than its SABRA unit, the one Reference ID that defines the population, or makeshift",
};

/** Object with exactly these keys, all required except those in `optional`. */
function record(properties: Record<string, JsonSchema>, optional: Record<string, JsonSchema> = {}): JsonSchema {
  return { type: "object", required: Object.keys(properties), additionalProperties: false, properties: { ...properties, ...optional } };
}

/** An `optional` array may be omitted or empty; the others need at least one item. */
function fileSchema(file: string, title: string, arrays: Record<string, { description: string; item: JsonSchema; optional?: boolean }>): JsonSchema {
  const properties: Record<string, JsonSchema> = { $schema: str() };
  for (const [k, a] of Object.entries(arrays)) properties[k] = { type: "array", ...(a.optional ? {} : { minItems: 1 }), description: a.description, items: a.item };
  const required = Object.entries(arrays)
    .filter(([, a]) => !a.optional)
    .map(([k]) => k);
  return { $schema: SCHEMA_URI, $id: schemaFileName(file), title, type: "object", required, additionalProperties: false, properties };
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
    ...record(
      {
        $schema: str(),
        roi: nonEmpty("ROI in English"),
        tlf: nonEmpty("TLF in English"),
        description: nonEmpty("One English sentence describing the project"),
        name: nonEmpty("Display name `<TLF> in <ROI>` (English, sentence case, about 60 characters, max 200)"),
      },
      {
        roiElements: {
          type: "array",
          minItems: 1,
          description: "Required when the HCD spec has the ROI rules: one entry per element (region) the ROI consists of, in the order of `roi`",
          items: record({
            name: nonEmpty("The element's name in English, as in `roi` (e.g. `visual word form area`)"),
            ucs: {
              type: "array",
              minItems: 1,
              items: { type: "string", pattern: "^\\S+$" },
              description: "Circuit IDs from uc.json of the ROI-internal UCs (or Collections of them) that represent this element; at least one UC represents this element only",
            },
          }),
        },
        roiSide: { enum: ROI_SIDES, description: "Required when the HCD spec has the ROI rules: the hemisphere(s) the ROI covers; both when the user gave no side" },
        roiSideSource: { enum: ROI_SIDE_SOURCES, description: "Required with roiSide: user when the user's ROI or instructions name the side, assumed when they do not (then roiSide is both)" },
      },
    ),
    required: ["roi", "tlf", "description", "name"],
  },
  [HCD_FILES.references]: fileSchema(HCD_FILES.references, "Literature cited by the HCD / FRG", {
    references: {
      description: "Every reference cited anywhere in the project, each once",
      item: {
        ...record({
          id: REF_ID,
          doi: nonEmpty("DOI without the https://doi.org/ prefix, or N/A when unknown (never invented)"),
          literatureType: { enum: BRA_LITERATURE_TYPES, description: "BRA Literature type of the document" },
          alternativeUrl: {
            type: "string",
            pattern: "^(https?://\\S+)?$",
            description: "URL of the document (publisher, PubMed or book page) when it has no DOI; empty otherwise",
          },
          pmid: { type: "string", pattern: "^(\\d{1,9})?$", description: "PubMed ID (digits only), or empty when unknown" },
          title: str("Title of the paper exactly as published (the worker compares it with Crossref / PubMed)"),
          journal: str("Journal or book title"),
        }),
        required: ["id", "doi", "literatureType"],
      },
    },
  }),
  [HCD_FILES.uc]: fileSchema(HCD_FILES.uc, "Uniform Circuits (UCs) and Collection Circuits of the HCD", {
    ucs: {
      description: "One entry per UC, ROI-internal and external",
      item: record({
        circuitId: { type: "string", pattern: "^\\S+$", description: "Circuit ID by the UC naming rules (no `U.` prefix, no backticks)" },
        descriptor: nonEmpty("UC Descriptor by the UC naming rules"),
        names: nonEmpty("SABRA official name first (BNA area name or DHBA name from RCS; for a faceted UC followed by the finer population), then synonyms separated by `;`"),
        roi: { enum: UC_ROI_VALUES, description: "internal, or the noROI tag of an external UC" },
        sourceOfId: SOURCE_OF_ID,
        transmitter: { enum: [...BRA_TRANSMITTERS, ""], description: "Main transmitter from the BRA list; empty when unknown or not in the list (write it in comments)" },
        modulationType: { enum: [...BRA_MODULATION_TYPES, ""], description: "Empty when unknown" },
        comments: str("Role and corresponding tissue (the noROI tag is added from `roi`)"),
        interface: str("`([Out1], [Out2]) = <Circuit ID>([In1], [In2])` for ROI-internal UCs; empty for external UCs"),
        outputSemantics: str("Exactly one item `[<own Circuit ID>] content;` (empty only for external sinks)"),
        ...Object.fromEntries(Object.entries(FUNCTION_ITEM_DESCRIPTIONS).map(([k, d]) => [k, str(d)])),
        implementation: str("Equations only, e.g. `[U.A] = P([U.B]|[U.C])` (empty for external UCs)"),
      }, {
        uniformityNote: str(
          "Optional. Only for a UC that spans several SABRA units (a BNAG gyrus or several anchors) and sends connections: why this HCD treats it as one uniform population instead of splitting it into the units and making it a Collection",
        ),
        hypothesis: hypothesisKeySchema("UC"),
      }),
    },
    collections: {
      optional: true,
      description:
        "Collection Circuits (Uniform = FALSE): circuits this HCD decomposes into Sub-Circuits, e.g. the SABRA unit whose facet UCs are listed in ucs. Never a sender or receiver of a connection, never an FRG leaf. Omit when the HCD decomposes nothing",
      item: record({
        circuitId: { type: "string", pattern: "^\\S+$", description: "Circuit ID: for a SABRA unit its anchor-only Circuit ID by the UC naming rules (e.g. `A44d`); for another grouping a short name" },
        descriptor: str("UC Descriptor when the Collection is one SABRA unit (anchor only, e.g. `BNA:29`) or a faceted population; empty for another grouping"),
        names: nonEmpty("SABRA official name first when it is a SABRA unit, then synonyms separated by `;`"),
        sourceOfId: { enum: ["collection"], description: "Always collection: a Collection is defined by its Sub-Circuits" },
        subCircuits: {
          type: "array",
          minItems: 1,
          items: { type: "string", pattern: "^\\S+$" },
          description: "Circuit IDs of its members: UCs of ucs or other Collections (no cycles), at least one not makeshift",
        },
        comments: nonEmpty("Why the circuit is heterogeneous at this HCD's granularity: what distinguishes its sub-circuits (areas, projection sources, cell types), with [Author, Year] citations"),
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
        senderRelation: { enum: CIRCUIT_RELATIONS, description: "`<` the sender UC is part of the circuit the paper reports (paper coarser), `>` it contains it (paper finer), `=` the same" },
        senderInLiterature: nonEmpty("The paper's own name for the sending circuit (not the Circuit ID)"),
        receiver: nonEmpty("Receiver Circuit ID (rCID) from uc.json"),
        receiverRelation: { enum: CIRCUIT_RELATIONS, description: "`<` the receiver UC is part of the circuit the paper reports, `>` it contains it, `=` the same" },
        receiverInLiterature: nonEmpty("The paper's own name for the receiving circuit (not the Circuit ID)"),
        comment: str("Property and information carried"),
        referenceIds: { ...refIds("The one Reference ID of this record; repeat the connection for each further paper"), maxItems: 1 },
        taxon: { enum: BRA_TAXA, description: "Species of the evidence in that paper; (Mixed) for several, details in comment" },
        measurementMethod: { enum: BRA_MEASUREMENT_METHODS, description: "Method of the evidence in that paper; details in comment" },
        pointersOnLiterature: str(
          `Sentence(s) of that paper stating this projection, quoted verbatim (at least ${DEFAULT_BRA_RULES.minQuoteWords} words); not a page or section. This or pointersOnFigure is required`,
        ),
        pointersOnFigure: str("Figure of that paper showing the projection, like `Fig. 3B`; empty when none"),
      }, {
        hypothesis: hypothesisKeySchema("connection"),
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
      }, {
        motifNote: str(
          "Only for a GN with 3-4 UC subnodes: why the motif cannot be split into GNs of 2 UCs (a loop, a feedforward triangle, a convergence the literature describes as one computation), with [Author, Year] citations. Omit or leave empty otherwise",
        ),
      }),
    },
  }),
  /** Research mode only; checked by checkResearch(), not by the HCD / FRG validators */
  [RESEARCH_FILES.plan]: RESEARCH_SCHEMA,
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
  const elements = items(j, "roiElements");
  if (elements) meta.roiElements = elements.map((e) => ({ name: s(e.name), ucs: [...new Set(strings(e.ucs).map(stripUc))] })).filter((e) => e.name);
  if ((ROI_SIDES as readonly string[]).includes(s(j.roiSide))) meta.roiSide = s(j.roiSide) as RoiSide;
  if ((ROI_SIDE_SOURCES as readonly string[]).includes(s(j.roiSideSource))) meta.roiSideSource = s(j.roiSideSource) as RoiSideSource;
  return meta;
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

// --- HCD -----------------------------------------------------------------------------------------------------------

export interface CheckHcdOptions {
  /** RCS facts for HOMBA anchors; without an entry the anchor-abbreviation and official-name checks of that UC are skipped. */
  sabra?: SabraLookup;
  /** Overrides of the provisional BRA value rules (`DEFAULT_BRA_RULES`) */
  bra?: Partial<BraRules>;
  /** BNA/DHBA boundary to enforce (`neocortex` for projects created from 2026-10-04; absent for older projects) */
  sabraBoundary?: SabraBoundary;
  /** Normalized UC Descriptors exempt from the boundary (the pinned Canon's circuits) */
  boundaryExempt?: ReadonlySet<string>;
  /** The project's harness rule set (`HARNESS_RULES` for new projects; absent for older ones, which skip the ROI rules and quote warnings) */
  harnessRules?: number;
  /**
   * The project's evidence mode with its hypothesis scopes and share limit. Absent or `strict`: a `hypothesis` key is
   * rejected and nothing else changes; `hypothesis`: hypotheses inside the scopes are read and checked.
   */
  evidence?: EvidenceOptions;
}

/** `[U.<id>]` references in free text (bare Circuit IDs). */
const ucRefs = (text: string) => [...text.matchAll(/\[U\.([^[\]\s]+)\]/g)].map((m) => m[1]);
/** Source of ID: one value; a list written before 0.10 keeps its first entry (the schema reports the list). */
const firstValue = (v: unknown) => (Array.isArray(v) ? strings(v)[0] ?? "" : s(v));

export function checkHcd(files: HcdInputs, opts: CheckHcdOptions = {}): CheckResult<HcdModel> {
  const errors: string[] = [];
  const rules: BraRules = { ...DEFAULT_BRA_RULES, ...opts.bra };
  const hypothesisMode = isHypothesisMode(opts.evidence);
  /** The hypothesis of an item: read only in hypothesis mode, so other projects' models and CSVs never carry one */
  const hypothesisOf = (item: Record<string, unknown>) => {
    const h = hypothesisMode ? parseHypothesis(item.hypothesis) : null;
    return h ? { hypothesis: h } : {};
  };
  const meta = parseMeta(files.meta, errors);
  checkMarkdown(PROJECT_FILES.decisionLog, files.decisionLog, errors);
  checkMarkdown(PROJECT_FILES.report, files.report, errors, REPORT_SECTIONS.HCD);

  const refs: RefRow[] = [];
  const refIds = new Set<string>();
  for (const r of items(readJson(HCD_FILES.references, files.references, errors), "references") ?? []) {
    const id = s(r.id);
    if (!id) continue;
    if (refIds.has(id)) errors.push(`references.json: ${id} is listed more than once.`);
    else {
      const ref = { id, doi: s(r.doi) || "N/A", pmid: s(r.pmid), title: s(r.title), journal: s(r.journal), literatureType: s(r.literatureType), alternativeUrl: s(r.alternativeUrl) };
      refs.push(ref);
      if (/^n\/?a$/i.test(ref.doi) && !ref.pmid && !ref.alternativeUrl) {
        errors.push(`references.json: ${id} has no DOI; give alternativeUrl (publisher, PubMed or book page) or the PMID.`);
      }
    }
    refIds.add(id);
  }
  const checkRefs = (where: string, ids: string[]) => {
    if (!refs.length) return;
    for (const id of ids) if (!refIds.has(id)) errors.push(`${where}: Reference ID ${id} is not in references.json.`);
  };

  const ucJson = readJson(HCD_FILES.uc, files.uc, errors);
  const ucItems = items(ucJson, "ucs");
  const ucs: UcRow[] = (ucItems ?? [])
    .map((u) => ({
      id: stripUc(s(u.circuitId)),
      descriptor: s(u.descriptor).replace(/\s+/g, ""),
      names: s(u.names),
      roi: ROI_OF[s(u.roi) as keyof typeof ROI_OF] ?? "roi",
      sourceOfId: firstValue(u.sourceOfId),
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
      uniformityNote: s(u.uniformityNote),
      ...hypothesisOf(u),
    }))
    .filter((u) => u.id);
  const seen = new Set<string>();
  for (const u of ucs) {
    if (seen.has(u.id)) errors.push(`uc.json: Circuit ID \`${u.id}\` is used by more than one UC.`);
    seen.add(u.id);
    if (/^\[/.test(u.sourceOfId)) checkRefs(`uc.json: sourceOfId of \`${u.id}\``, [u.sourceOfId]);
    const src = sourceOfIdProblem(u);
    if (src) errors.push(src);
    const official = sabraOfficialName(u.descriptor, opts.sabra);
    if (official && u.names && !namesStartWithOfficial(u.names, official)) {
      errors.push(`uc.json: names of \`${u.id}\` must start with its SABRA official name "${official}", then synonyms separated by ";" (e.g. "${official}; <common name>").`);
    }
  }
  const collections: CollectionRow[] = (items(ucJson, "collections") ?? [])
    .map((c) => ({
      id: stripUc(s(c.circuitId)),
      descriptor: s(c.descriptor).replace(/\s+/g, ""),
      names: s(c.names),
      sourceOfId: s(c.sourceOfId),
      subCircuits: [...new Set(strings(c.subCircuits).map(stripUc))],
      comments: s(c.comments),
    }))
    .filter((c) => c.id);
  const collectionIds = new Set<string>();
  for (const c of collections) {
    if (seen.has(c.id) || collectionIds.has(c.id)) errors.push(`uc.json: Circuit ID \`${c.id}\` is used by more than one circuit (UCs and Collections share one ID space).`);
    collectionIds.add(c.id);
    if (isRoiCircuitId(c.id)) errors.push(`uc.json: Collection \`${c.id}\`: Circuit IDs starting with ROI_ are reserved for the ROI row, which the worker writes.`);
    else if (!c.descriptor && !CIRCUIT_ID_RE.test(c.id)) {
      errors.push(`uc.json: Collection \`${c.id}\`: a Circuit ID uses only A-Z a-z 0-9 . _ ~ - / + (and parentheses for items)${modernCircuitId(c.id) !== c.id ? `; write \`${modernCircuitId(c.id)}\`` : ""}.`);
    }
    const official = sabraOfficialName(c.descriptor, opts.sabra);
    if (official && c.names && !namesStartWithOfficial(c.names, official)) {
      errors.push(`uc.json: names of Collection \`${c.id}\` must start with its SABRA official name "${official}", then synonyms separated by ";".`);
    }
  }
  errors.push(...collectionProblems(collections, ucs));
  if (ucItems && ucs.length) {
    errors.push(...checkUcNaming([...ucs, ...collections.filter((c) => c.descriptor)], opts.sabra, { boundary: opts.sabraBoundary, boundaryExempt: opts.boundaryExempt }));
    errors.push(...decomposedUcProblems(ucs));
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
      senderRelation: s(c.senderRelation),
      senderInLiterature: s(c.senderInLiterature),
      receiverRelation: s(c.receiverRelation),
      receiverInLiterature: s(c.receiverInLiterature),
      ...hypothesisOf(c),
    }))
    .filter((c) => c.sender || c.receiver);

  const fatal = !connItems || ucs.length === 0;
  if (!fatal) {
    const ids = new Set(ucs.map((u) => u.id));
    const senders = new Map<string, string[]>();
    const receivers = new Map<string, string[]>();
    const records = new Set<string>();
    for (const c of connections) {
      const where = `connections.json: \`${c.sender}\` -> \`${c.receiver}\``;
      if (c.referenceIds.length > 1) {
        errors.push(`${where} cites ${c.referenceIds.length} references; write one connection per reference (repeat the sender and receiver, each with the taxon, method and pointers of its paper).`);
      }
      for (const r of c.referenceIds) {
        const key = `${c.sender}\u0000${c.receiver}\u0000${r}`;
        if (records.has(key)) errors.push(`${where} is listed more than once for ${r}; keep one record per reference.`);
        records.add(key);
      }
      errors.push(...pointerProblems(`${where} (${c.referenceIds.join("; ")})`, c.pointersOnLiterature, c.pointersOnFigure, rules));
      if (c.senderRelation || c.senderInLiterature || c.receiverRelation || c.receiverInLiterature) {
        errors.push(...relationProblems(where, "sender", c.sender, c.senderRelation, c.senderInLiterature));
        errors.push(...relationProblems(where, "receiver", c.receiver, c.receiverRelation, c.receiverInLiterature));
      }
      for (const [end, id] of [
        ["sender", c.sender],
        ["receiver", c.receiver],
      ] as const) {
        if (collectionIds.has(id)) {
          const members = collectionLeaves(collections, id).join(", ");
          errors.push(
            `connections.json: ${end} \`${id}\` (\`${c.sender}\` -> \`${c.receiver}\`) is a Collection; a Collection is neither sender nor receiver in this HCD. Connect its UC(s) instead (${members || "its Sub-Circuits"}), or make it a UC if the HCD does not need to decompose it.`,
          );
        } else if (!ids.has(id)) errors.push(`connections.json: ${end} \`${id}\` (\`${c.sender}\` -> \`${c.receiver}\`) is not a Circuit ID in uc.json.`);
      }
      checkRefs(`connections.json: \`${c.sender}\` -> \`${c.receiver}\``, c.referenceIds);
      (senders.get(c.receiver) ?? senders.set(c.receiver, []).get(c.receiver)!).push(c.sender);
      (receivers.get(c.sender) ?? receivers.set(c.sender, []).get(c.sender)!).push(c.receiver);
    }
    errors.push(...multiUnitSenderProblems(ucs.filter((u) => receivers.has(u.id))));
    for (const u of ucs) {
      if (!senders.has(u.id) && !receivers.has(u.id)) errors.push(`\`${u.id}\` has no connection in connections.json.`);
      const isSink = u.roi !== "roi" && !receivers.has(u.id);
      if (!u.outputSemantics && !isSink) errors.push(`uc.json: \`${u.id}\` has no outputSemantics.`);
      if (u.outputSemantics) {
        const os = parseOutputSemantics(u.outputSemantics);
        if (!os || os.length !== 1 || os[0].id !== u.id) {
          errors.push(
            `uc.json: outputSemantics of \`${u.id}\` must be exactly one item \`[${u.id}] content;\` (its own Circuit ID in brackets, content without [ ] or ; except [Author, Year] citations, ending with ;).`,
          );
        }
      }
      for (const [key, text] of [
        ["comments", u.comments],
        ["requirement", u.requirement],
        ["requirementRealization", u.reqRealization],
        ["capability", u.capability],
        ["mechanism", u.mechanism],
        ["implementation", u.implementation],
      ] as const) {
        for (const ref of new Set(ucRefs(text))) {
          if (collectionIds.has(ref) && key !== "comments") {
            errors.push(`uc.json: ${key} of \`${u.id}\` refers to [U.${ref}], which is a Collection; refer to its UCs (a Collection may only be mentioned in comments).`);
          } else if (!ids.has(ref) && !collectionIds.has(ref)) {
            errors.push(`uc.json: ${key} of \`${u.id}\` refers to [U.${ref}], which is not a Circuit ID in uc.json; refer to tissue as [U.<Circuit ID>] with an existing Circuit ID.`);
          }
        }
      }
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

  if (!hypothesisMode) errors.push(...strictHypothesisProblems({ ucs: ucItems, connections: connItems }));
  else if (!fatal) errors.push(...hypothesisProblems({ ucs, connections, collections, refs, report: files.report }, opts.evidence!));

  const warnings: string[] = [];
  if ((opts.harnessRules ?? 0) >= 1 && !fatal) {
    if (meta) errors.push(...roiProblems(meta, ucs, collections, files.decisionLog ?? ""));
    warnings.push(...reusedQuoteWarnings(connections));
  }

  return { model: fatal ? null : { meta, refs, ucs, collections, bif, connections }, errors: [...new Set(errors)], warnings, fatal };
}

const SIDE_WORD_RE = /^(?:the\s+)?(?:left|right|bilateral|both(?:\s+sides|\s+hemispheres)?)$/i;

/**
 * The regions an ROI text names: split at commas, semicolons, `and`, `&` and `+` outside parentheses; a bare side
 * word (`left and right IFG`) is not a region. `visual word form area and posterior fusiform gyrus` → 2.
 */
export function roiParts(roi: string): string[] {
  return splitTopLevel(roi.replace(/\s+(?:and|&|\+|plus)\s+/gi, ","), ",;")
    .map((x) => x.trim())
    .filter((x) => x && !SIDE_WORD_RE.test(x));
}

/** What decision_log.md says when the ROI's side was not given. */
const BILATERAL_NOTE_RE = /\b(?:bilateral|both\s+(?:hemispheres|sides))\b/i;

/**
 * Harness rules 1 on the ROI: every element of the ROI has a ROI-internal UC that represents only it (so one UC does
 * not stand for, e.g., the VWFA and the posterior fusiform gyrus together), every ROI-internal UC belongs to an
 * element, and the ROI's side is declared: a side the user did not give means both sides, written in the decision log.
 */
function roiProblems(meta: ProjectMeta, ucs: UcRow[], collections: CollectionRow[], decisionLog: string): string[] {
  const errors: string[] = [];
  const M = PROJECT_FILES.meta;
  const internal = new Set(ucs.filter((u) => u.roi === "roi").map((u) => u.id));
  const ucIds = new Set(ucs.map((u) => u.id));
  const collectionIds = new Set(collections.map((c) => c.id));
  const elements = meta.roiElements ?? [];
  if (!elements.length) {
    errors.push(`${M}: add \`roiElements\`: one entry per element (region) of the ROI, each with the ROI-internal UC(s) that represent it (see the ROI rules of the HCD spec).`);
  } else {
    const parts = roiParts(meta.roi);
    if (parts.length > elements.length) {
      errors.push(`${M}: roi names ${parts.length} regions (${parts.map((p) => `"${p}"`).join(", ")}) but roiElements lists ${elements.length}; give each region of the ROI its own element, with a UC of its own.`);
    }
    const leavesOf = new Map<string, Set<string>>();
    for (const e of elements) {
      const where = `${M}: roiElements "${e.name}"`;
      if (leavesOf.has(e.name)) errors.push(`${where} is listed more than once.`);
      const leaves = new Set<string>();
      for (const id of e.ucs) {
        if (collectionIds.has(id)) for (const l of collectionLeaves(collections, id)) if (internal.has(l)) leaves.add(l);
        if (collectionIds.has(id)) continue;
        if (!ucIds.has(id)) errors.push(`${where}: \`${id}\` is not a Circuit ID in uc.json.`);
        else if (!internal.has(id)) errors.push(`${where}: \`${id}\` is an external UC (noROI); list the ROI-internal UCs of this element.`);
        else leaves.add(id);
      }
      if (!leaves.size) errors.push(`${where} has no ROI-internal UC; list the UC(s) that represent this element of the ROI.`);
      leavesOf.set(e.name, leaves);
    }
    for (const [name, leaves] of leavesOf) {
      if (!leaves.size) continue;
      const sharing = [...leavesOf].filter(([n, other]) => n !== name && [...leaves].some((l) => other.has(l))).map(([n]) => n);
      const others = new Set([...leavesOf].filter(([n]) => n !== name).flatMap(([, other]) => [...other]));
      if ([...leaves].every((l) => others.has(l))) {
        errors.push(
          `${M}: roiElements "${name}" has no ROI-internal UC of its own (${[...leaves].map((l) => `\`${l}\``).join(", ")} also stand for ${sharing.map((n) => `"${n}"`).join(", ")}); every element of the ROI needs at least one UC that represents only that element: split the shared UC by the UC naming rules (one UC per element; a Collection may group them).`,
        );
      }
    }
    const covered = new Set([...leavesOf.values()].flatMap((l) => [...l]));
    for (const id of internal) if (!covered.has(id)) errors.push(`uc.json: ROI-internal \`${id}\` is in no roiElements entry of ${M}; add it to the element of the ROI it belongs to.`);
  }

  if (!meta.roiSide || !meta.roiSideSource) {
    errors.push(`${M}: add \`roiSide\` (both, left or right) and \`roiSideSource\` (user when the user's ROI or instructions name the side, else assumed); an ROI whose side the user did not give covers both sides.`);
    return errors;
  }
  if (meta.roiSideSource === "assumed") {
    if (meta.roiSide !== "both") {
      errors.push(`${M}: roiSide is ${meta.roiSide}, but the user gave no side (roiSideSource assumed); an ROI whose side is not given covers both sides: set roiSide to both and model the UCs of both sides.`);
    }
    if (!BILATERAL_NOTE_RE.test(decisionLog)) {
      errors.push(`${PROJECT_FILES.decisionLog}: record that the user gave no side for the ROI and that it is treated as both sides (e.g. "ROI side: not given by the user; treated as bilateral (both hemispheres)").`);
    }
  }
  const sided = new Map<string, Set<string>>();
  const sideOf = (u: UcRow) => /^(.*)\/side:(left|right)$/.exec(normalizeUcDescriptor(u.descriptor));
  for (const u of ucs) {
    const m = u.roi === "roi" ? sideOf(u) : null;
    if (m) (sided.get(m[1]) ?? sided.set(m[1], new Set()).get(m[1])!).add(m[2]);
  }
  for (const u of ucs) {
    const m = u.roi === "roi" ? sideOf(u) : null;
    if (!m) continue;
    const other = m[2] === "left" ? "right" : "left";
    if (meta.roiSide === "both" && !sided.get(m[1])!.has(other)) {
      errors.push(`uc.json: ROI-internal \`${u.id}\` is ${m[2]} only, but the ROI covers both sides (roiSide both); drop its side facet (one UC for both sides) or add its ${other} counterpart.`);
    } else if (meta.roiSide !== "both" && m[2] !== meta.roiSide) {
      errors.push(`uc.json: ROI-internal \`${u.id}\` is on the ${m[2]} side, outside the ROI (roiSide ${meta.roiSide}); make it an external UC (noROI) or remove it.`);
    }
  }
  return errors;
}

/**
 * Harness rules 1, warning only: one quote (with the same figure, or none) that supports connections between different
 * circuits. Each connection should point to the sentence or figure of its paper that states that projection.
 */
export function reusedQuoteWarnings(connections: ConnRow[]): string[] {
  const groups = new Map<string, { quote: string; figure: string; pairs: string[]; refs: Set<string> }>();
  for (const c of connections) {
    const quote = c.pointersOnLiterature.replace(/\s+/g, " ").trim();
    if (!quote) continue;
    const figure = c.pointersOnFigure ? (normalizeFigurePointer(c.pointersOnFigure) ?? c.pointersOnFigure.trim()) : "";
    const key = `${quote.toLowerCase()}\u0000${figure.toLowerCase()}`;
    const g = groups.get(key) ?? groups.set(key, { quote, figure, pairs: [], refs: new Set() }).get(key)!;
    const pair = `\`${c.sender}\` -> \`${c.receiver}\``;
    if (!g.pairs.includes(pair)) g.pairs.push(pair);
    for (const r of c.referenceIds) g.refs.add(r);
  }
  return [...groups.values()]
    .filter((g) => g.pairs.length > 1)
    .map(
      (g) =>
        `connections.json: one pointersOnLiterature${g.figure ? ` (with ${g.figure})` : ""} of ${[...g.refs].join("; ")} supports ${g.pairs.length} connections (${g.pairs.join(", ")}); give each connection the sentence or figure that states its own projection ("${g.quote.length > 80 ? `${g.quote.slice(0, 80)}…` : g.quote}").`,
    );
}

/** UC IDs under a Collection, expanding nested Collections (cycle-safe); [] for an unknown ID. */
export function collectionLeaves(collections: CollectionRow[], id: string): string[] {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const visit = (x: string) => {
    const c = byId.get(x);
    if (!c) return void out.add(x);
    if (seen.has(x)) return;
    seen.add(x);
    for (const k of c.subCircuits) visit(k);
  };
  if (byId.has(id)) visit(id);
  return [...out];
}

/**
 * Sub-Circuits of each Collection: at least one (BRA 120), each defined in uc.json (BRA 121); not itself, no cycle, at
 * least one not makeshift (cobrac:collection-members, no BRA code).
 */
function collectionProblems(collections: CollectionRow[], ucs: UcRow[]): string[] {
  const errors: string[] = [];
  const ucById = new Map(ucs.map((u) => [u.id, u]));
  const byId = new Map(collections.map((c) => [c.id, c]));
  for (const c of collections) {
    const where = `uc.json: Collection \`${c.id}\``;
    if (!c.subCircuits.length) errors.push(`${where} has no subCircuits; list at least one member (a Collection is defined by its Sub-Circuits).`);
    for (const k of c.subCircuits) {
      if (k === c.id) errors.push(`${where} lists itself in subCircuits.`);
      else if (!ucById.has(k) && !byId.has(k)) errors.push(`${where}: subCircuit \`${k}\` is not a UC or Collection in uc.json.`);
    }
    const known = c.subCircuits.filter((k) => k !== c.id && (ucById.has(k) || byId.has(k)));
    if (known.length && known.every((k) => ucById.get(k)?.sourceOfId === "makeshift")) {
      errors.push(`${where}: every subCircuit is makeshift; at least one member must be a circuit that is not makeshift.`);
    }
  }
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const k of byId.get(id)?.subCircuits ?? []) {
      if (k === id || !byId.has(k)) continue;
      const cyc = visit(k);
      if (cyc) return cyc;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const c of collections) {
    const cyc = visit(c.id);
    if (cyc) {
      errors.push(`uc.json: Collections form a cycle through subCircuits: ${cyc.join(" -> ")}.`);
      break;
    }
  }
  return errors;
}

/**
 * A UC whose population this HCD also splits into finer UCs (same anchors, a subset of the facet values) is not
 * uniform in this HCD: it must be a Collection of those UCs.
 */
function decomposedUcProblems(ucs: UcRow[]): string[] {
  const parsed = ucs
    .map((u) => {
      const r = u.descriptor ? parseUcDescriptor(u.descriptor) : null;
      if (!r || "errors" in r) return null;
      const [head] = normalizeUcDescriptor(u.descriptor).split("/");
      return { id: u.id, head, values: ucFacetValues(r.descriptor), d: r.descriptor };
    })
    .filter((x): x is { id: string; head: string; values: Set<string>; d: UcDescriptor } => !!x);
  const errors: string[] = [];
  for (const a of parsed) {
    const finer = parsed.filter(
      (b) =>
        b !== a &&
        ((b.head === a.head && b.values.size > a.values.size && [...a.values].every((v) => b.values.has(v))) ||
          (b.head !== a.head && a.d.facets.length === 0 && coversAnchors(a.d, b.d))),
    );
    if (finer.length) {
      errors.push(
        `uc.json: \`${a.id}\` is also split into finer UCs (${finer.map((b) => `\`${b.id}\``).join(", ")}), so it is not uniform in this HCD. Move it to collections with those UCs as subCircuits (add UCs for the rest of its population if the HCD needs them) and connect the UCs instead.`,
      );
    }
  }
  return errors;
}

/** Whether anchor `b` lies inside anchor `a`: the same anchor, or a BNA area of a BNAG group. */
function anchorInside(a: UcAnchor, b: UcAnchor): boolean {
  if (a.kind === "bnag" && b.kind === "bna") return bnaArea(b.left)?.l2 === a.l2;
  if (a.kind === "bna" && b.kind === "bna") return a.left === b.left;
  if (a.kind === "bnag" && b.kind === "bnag") return a.l2 === b.l2;
  return a.kind === "homba" && b.kind === "homba" && a.id === b.id;
}

/** Anchor-only `a` (a side allowed) covers every anchor of `b` on the same side or both, and `b` is strictly finer. */
function coversAnchors(a: UcDescriptor, b: UcDescriptor): boolean {
  if (a.facets.length || (a.side && a.side !== b.side)) return false;
  return b.anchors.every((y) => a.anchors.some((x) => anchorInside(x, y)));
}

/**
 * Senders must be uniform in this HCD (BRA 203). A sender that spans several SABRA units — a BNAG gyrus or several anchors
 * — is usually heterogeneous: split it into the units and make it a Collection, or say why it is uniform here.
 */
function multiUnitSenderProblems(senders: UcRow[]): string[] {
  const errors: string[] = [];
  for (const u of senders) {
    if (u.uniformityNote) continue;
    const r = u.descriptor ? parseUcDescriptor(u.descriptor) : null;
    if (!r || "errors" in r || r.descriptor.facets.length) continue;
    const d = r.descriptor;
    const spans = d.anchors.length > 1 ? `${d.anchors.length} SABRA units` : d.anchors[0].kind === "bnag" ? `the BNA group ${d.anchors[0].l2} (several BNA areas)` : null;
    if (!spans) continue;
    errors.push(
      `uc.json: \`${u.id}\` spans ${spans} and sends connections, but a sender must be uniform in this HCD (BRA 203). If its parts differ anatomically or functionally (distinct areas, different projection sources or targets), split it into UCs for the parts the HCD distinguishes (named with search_bna_candidates / RCS; a paper that reports only the whole region supports each part with relation \`<\`) and, if it helps the reader, list it in collections with those UCs. Layer or cell-type evidence is not needed for this. If this HCD really treats it as one population, write why in its uniformityNote.`,
    );
  }
  return errors;
}

// --- FRG -----------------------------------------------------------------------------------------------------------

export interface CheckFrgOptions {
  /** The project's harness rule set (`HARNESS_RULES` for new projects); below 2 the GN rules of 0.27.0 and earlier apply */
  harnessRules?: number;
}

export function checkFrg(files: FrgInputs, hcd: HcdModel, opts: CheckFrgOptions = {}): CheckResult<FrgModel> {
  const errors: string[] = [];
  const gnRules2 = (opts.harnessRules ?? 0) >= 2;
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
      motifNote: gnRules2 ? s(n.motifNote) : "",
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
    const collectionIds = new Set((hcd.collections ?? []).map((c) => c.id));
    const ucParents = new Map<string, string[]>();
    const childSet = new Set<string>();
    const roiConnections = hcd.connections.map((c) => ({ source: c.sender, target: c.receiver })).filter((c) => roiUcs.has(c.source) && roiUcs.has(c.target));
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
        if (collectionIds.has(id)) {
          errors.push(`\`${g.id}\`: \`${x}\` is a Collection; FRG leaves are UCs, so attach its UCs (${collectionLeaves(hcd.collections, id).join(", ")}) instead.`);
          continue;
        }
        if (!allUcs.has(id)) errors.push(`\`${g.id}\`: \`${x}\` is not a Circuit ID in uc.json.`);
        else if (!roiUcs.has(id)) errors.push(`\`${g.id}\`: \`${x}\` is outside the ROI; only ROI-internal UCs may be attached.`);
        (ucParents.get(id) ?? ucParents.set(id, []).get(id)!).push(g.id);
      }
      const n = ucKids.length;
      if (!gnRules2) {
        if (n > 2) errors.push(`\`${g.id}\` has ${n} UC subnodes (max 2): decompose it further.`);
        if (gnKids.length === 0 && n === 1) errors.push(`\`${g.id}\` is realized by a single UC (${ucKids[0]}); a GN needs 2 UCs or should be merged/decomposed.`);
      } else {
        if (n > MAX_MOTIF_UCS) errors.push(`\`${g.id}\` has ${n} UC subnodes (max ${MAX_MOTIF_UCS}): decompose it further.`);
        else if (n > 2 && !g.motifNote)
          errors.push(
            `\`${g.id}\` has ${n} UC subnodes: a GN holds 2 UCs unless its UCs form a motif that pairs cannot express (a loop, a feedforward triangle). Split it into GNs of 2 UCs, or write in its motifNote why the motif is one computation, with citations.`,
          );
        if (n <= 2 && g.motifNote) errors.push(`frg.json: \`${g.id}\` has ${n} UC subnode(s); motifNote is only for a GN with 3-${MAX_MOTIF_UCS} UCs, so leave it empty.`);
        if (gnKids.length === 0 && n === 1) errors.push(`\`${g.id}\` is realized by a single UC (${ucKids[0]}); a GN needs 2 UCs or should be merged/decomposed.`);
        const roiKids = ucKids.map(stripUc).filter((id) => roiUcs.has(id));
        if (roiKids.length >= 2 && !isConnectedSet(roiKids, roiConnections))
          errors.push(
            `\`${g.id}\`: its UCs (${roiKids.map((x) => `U.${x}`).join(", ")}) are not connected by ROI-internal connections among themselves. A GN is realized by its UCs and the connections between them: attach UCs that connect (a UC on the way between them belongs in the GN too), or add the missing connection to connections.json if the literature reports it.`,
          );
      }
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
    for (const g of gns) {
      for (const [key, text] of [
        ["comment", g.comment],
        ["requirement", g.requirement],
        ["requirementRealization", g.reqRealization],
        ["capability", g.capability],
        ["mechanism", g.mechanism],
      ] as const) {
        for (const ref of new Set(ucRefs(text))) {
          if (collectionIds.has(ref)) errors.push(`frg.json: ${key} of \`${g.id}\` refers to [U.${ref}], which is a Collection; refer to its UCs.`);
          else if (!allUcs.has(ref)) errors.push(`frg.json: ${key} of \`${g.id}\` refers to [U.${ref}], which is not a Circuit ID in uc.json.`);
        }
        for (const m of new Set([...text.matchAll(/\[(R\.[^[\]\s]+)\]/g)].map((x) => x[1]))) {
          if (!gnIds.has(m)) errors.push(`frg.json: ${key} of \`${g.id}\` refers to [${m}], which is not a node in frg.json.`);
        }
      }
    }
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

/**
 * GN Comments of FRG.csv: the comment, then why the GN holds a motif of 3-4 UCs (like uniformityNote on Circuits), then
 * (hypothesis mode) the hypotheses the GN depends on.
 */
const gnComment = (g: GnRow, hypotheses: string[] = []) =>
  [g.comment, g.motifNote ? `Motif of ${g.subnodes.filter((x) => x.startsWith("U.")).length} UCs: ${g.motifNote}` : "", gnDependencyNote(hypotheses)].filter(Boolean).join("; ");

/**
 * BRA version written to Project.csv (the CoBRAC data format, not the harness version). v1-1 (0.10): References gains
 * Literature type and Alternative URL, Circuits gains the ROI row and Sub-Circuits / Uniform, Connections has one
 * row per reference, Source of ID holds one value, and Project fills the Review End Lines. Columns were only appended,
 * so the positions of the v1-0 columns are unchanged.
 */
export const BRA_VERSION = "CoBRAC-v1-1";

/** Sheets listed under "Review End Line" in Project.csv. */
export const REVIEW_SHEETS = ["References", "Circuits", "Connections", "FRG"] as const;
export type ReviewEndLines = Partial<Record<(typeof REVIEW_SHEETS)[number], number>>;

/**
 * Project.csv from the fixed template (row 2 = project metadata). `dataRows` gives the number of data rows of each
 * sheet; its Review End Line is the sheet row of the last record (the header is row 1, so 1 when there is no data).
 */
export function buildProjectCsv(o: BuildCsvOptions, meta: ProjectMeta | null, dataRows: ReviewEndLines = {}): string {
  const rows = parseCsv(o.projectTemplate);
  const roi = meta?.roi || o.roi || "";
  const tlf = meta?.tlf || o.tlf || "";
  const base = meta?.description || (tlf && roi ? `${tlf} in the ${roi}.` : tlf || roi);
  const name = o.name?.trim();
  const description =
    name && !CJK_RE.test(name) && !base.toLowerCase().startsWith(name.toLowerCase()) ? (base ? `${name}: ${base}` : name) : base;
  const data = rows[1] ?? [];
  rows[1] = [o.contributor, o.projectId, o.contributor, description, data[4] || BRA_VERSION];
  for (const row of rows.slice(2)) {
    const n = dataRows[row[0] as (typeof REVIEW_SHEETS)[number]];
    if (n !== undefined) row[1] = String(n + 1);
  }
  return toCsv(rows) + "\n";
}

/** Circuits.csv Comments carry the noROI tag the BRA format (and the graph builder) read; a hypothesis UC starts with its hypothesis line. */
const circuitComments = (u: UcRow) => {
  const base = [u.comments, u.uniformityNote ? `Uniform in this project: ${u.uniformityNote}` : ""].filter(Boolean).join("; ");
  return withHypothesisLine(u.roi === "roi" || /noroi/i.test(u.comments) ? base : [base, ROI_TAG[u.roi]].filter(Boolean).join("; "), u.hypothesis);
};

/** Relation and notation of one end; files written before 0.10 keep the old `=` + Circuit ID. */
const literatureEnd = (relation: string, notation: string, circuitId: string) =>
  relation || notation ? [relation || "=", notation] : ["=", circuitId];

const isNoDoi = (doi: string) => !doi || /^n\/?a$/i.test(doi);

/**
 * Output Semantics of each GN: the items of its UCs that project outside the GN (the manual gives a non-Uniform
 * node one item per output circuit).
 */
function gnOutputSemantics(hcd: HcdModel, frg: FrgModel): Map<string, string> {
  const kids = new Map(frg.gns.map((g) => [g.id, g.subnodes]));
  const osItems = new Map<string, OutputSemanticsItem[]>();
  for (const u of hcd.ucs) {
    const items = u.outputSemantics ? parseOutputSemantics(u.outputSemantics) : null;
    osItems.set(u.id, items ?? (u.outputSemantics ? [{ id: u.id, text: u.outputSemantics.replace(/;\s*$/, "") }] : []));
  }
  const receivers = new Map<string, Set<string>>();
  for (const c of hcd.connections) (receivers.get(c.sender) ?? receivers.set(c.sender, new Set()).get(c.sender)!).add(c.receiver);
  const ucsUnder = (id: string, seen = new Set<string>()): Set<string> => {
    const out = new Set<string>();
    if (seen.has(id)) return out;
    seen.add(id);
    for (const k of kids.get(id) ?? []) {
      if (k.startsWith("U.")) out.add(k.slice(2));
      else for (const u of ucsUnder(k, seen)) out.add(u);
    }
    return out;
  };
  const out = new Map<string, string>();
  for (const g of frg.gns) {
    const members = ucsUnder(g.id);
    const items = [...members]
      .filter((u) => [...(receivers.get(u) ?? [])].some((r) => !members.has(r)))
      .flatMap((u) => osItems.get(u) ?? []);
    out.set(g.id, formatOutputSemantics(items));
  }
  return out;
}

/** Convert validated HCD/FRG models to the five CSVs. Fails (errors) when the content is not English. */
export function buildCsvs(hcd: HcdModel, frg: FrgModel, o: BuildCsvOptions): { files: Record<CsvFileName, string> | null; errors: string[] } {
  const refs = new Map<string, RefRow>();
  for (const r of hcd.refs) if (!refs.has(r.id)) refs.set(r.id, r);
  const collections = hcd.collections ?? [];
  const cited = [
    ...hcd.connections.flatMap((c) => c.referenceIds),
    ...hcd.ucs.map((u) => u.sourceOfId).filter((x) => x.startsWith("[")),
  ];
  for (const id of cited) if (!refs.has(id)) refs.set(id, { id, doi: "N/A" });
  const alternativeUrl = (r: RefRow) => r.alternativeUrl || (isNoDoi(r.doi) && r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : "");

  const receivers = new Map<string, string[]>();
  for (const c of hcd.connections) {
    const list = receivers.get(c.sender) ?? receivers.set(c.sender, []).get(c.sender)!;
    if (!list.includes(c.receiver)) list.push(c.receiver);
  }
  const roiUcSet = new Set(hcd.ucs.filter((u) => u.roi === "roi").map((u) => u.id));
  // The ROI row lists every circuit in the ROI: its UCs and the Collections made only of them
  const roiCircuits = [
    ...collections.filter((c) => {
      const leaves = collectionLeaves(collections, c.id);
      return leaves.length > 0 && leaves.every((id) => roiUcSet.has(id));
    }).map((c) => c.id),
    ...roiUcSet,
  ];
  const gnOs = gnOutputSemantics(hcd, frg);
  const records = hypothesisRecords(hcd);
  const gnHypotheses = new Map(records.length ? gnHypothesisDependencies(hcd, frg, records).map((d) => [d.id, d.hypotheses]) : []);

  const tables: Record<Exclude<CsvFileName, "Project.csv">, string[][]> = {
    "References.csv": [
      ["Reference ID", "DOI", "Literature type", "Alternative URL"],
      ...[...refs.values()].map((r) => [r.id, r.doi || "N/A", r.literatureType ?? "", alternativeUrl(r)]),
    ],
    // Columns after Comments are appended so the BRA columns keep their positions; the ROI row and the Collections
    // (Uniform = FALSE) come first. Collections are not FRG nodes: FRG leaves are UCs
    "Circuits.csv": [
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", "UC Descriptor", "Sub-Circuits", "Uniform"],
      [roiCircuitId(o.projectId), "collection", hcd.meta?.roi || o.roi || "", "", "", "Region of interest of the project", "", roiCircuits.join(";"), "FALSE"],
      ...collections.map((c) => [c.id, "collection", c.names, "", "", c.comments, c.descriptor, c.subCircuits.join(";"), "FALSE"]),
      ...hcd.ucs.map((u) => [u.id, u.sourceOfId, u.names, u.transmitter, u.modulationType, circuitComments(u), u.descriptor, "", "TRUE"]),
    ],
    "Connections.csv": [
      [
        "Sender Circuit ID (sCID)",
        "Receiver Circuit ID (rCID)",
        "Comments",
        "Reference ID",
        "Taxon",
        "Measurement method",
        "Pointers on literature",
        "Pointers on figure",
        "sCID relation",
        "Notation of sCID in Literature",
        "rCID relation",
        "Notation of rCID in Literature",
      ],
      ...hcd.connections.flatMap((c) =>
        (c.referenceIds.length ? c.referenceIds : [""]).map((ref) => [
          c.sender,
          c.receiver,
          withHypothesisLine(c.comment, c.hypothesis),
          ref,
          c.taxon,
          c.method,
          c.pointersOnLiterature,
          c.pointersOnFigure ? (normalizeFigurePointer(c.pointersOnFigure) ?? c.pointersOnFigure) : "",
          ...literatureEnd(c.senderRelation, c.senderInLiterature, c.sender),
          ...literatureEnd(c.receiverRelation, c.receiverInLiterature, c.receiver),
        ]),
      ),
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
      ...frg.gns.map((g) => [g.id, g.subnodes.join(";"), "", "", g.capability, g.mechanism, "", g.reqRealization, g.requirement, gnOs.get(g.id) ?? "", gnComment(g, gnHypotheses.get(g.id))]),
      ...hcd.ucs.map((u) => [
        `U.${u.id}`,
        "",
        u.id,
        (receivers.get(u.id) ?? []).join(";"),
        u.roi === "roi" ? u.capability : OUT_OF_ROI_CAPABILITY,
        u.mechanism,
        u.implementation,
        u.reqRealization,
        u.requirement,
        u.outputSemantics,
        circuitComments(u),
      ]),
    ],
  };

  const dataRows = (name: Exclude<CsvFileName, "Project.csv">) => tables[name].length - 1;
  const project = buildProjectCsv(o, hcd.meta, {
    References: dataRows("References.csv"),
    Circuits: dataRows("Circuits.csv"),
    Connections: dataRows("Connections.csv"),
    FRG: dataRows("FRG.csv"),
  });
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
