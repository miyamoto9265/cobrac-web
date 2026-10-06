/**
 * Hypothesis mode ("Allow hypotheses"): a project may include connections and UCs (and properties of them) that the
 * literature does not directly support, each marked with a `hypothesis` key that gives the hypothesized claims, the
 * kind of reasoning (basis), a rationale and at least one verifiable premise paper. Only "a sentence of a paper states
 * this claim" is relaxed; references, quotes, naming, schemas, interfaces and the FRG structure are checked as always.
 *
 * Pure functions (no fs): the claim / basis lists, the project settings, scope membership, the hypothesis share, the
 * checks `checkHcd` runs in hypothesis mode, the records the worker writes to `hypotheses.json`, and which GNs of the
 * FRG depend on hypotheses. Nothing here proposes further investigation: the records disclose what was included.
 *
 * This module imports only types from harness.ts (which imports it at run time).
 */
import { sourceOfIdProblem } from "./bra.js";
import type { CollectionRow, ConnRow, FrgModel, HcdModel, RefRow, UcRow } from "./harness.js";
import type { JsonSchema } from "./jsonSchema.js";

// --- lists ---------------------------------------------------------------------------------------------------------

/** `strict`: literature-supported evidence only (default, also for projects without the field); `hypothesis`: marked hypotheses allowed. */
export const EVIDENCE_MODES = ["strict", "hypothesis"] as const;
export type EvidenceMode = (typeof EVIDENCE_MODES)[number];

/** Claims a hypothesis on a connection may make. */
export const CONNECTION_CLAIMS = ["existence", "direction", "sign"] as const;
/** Claims a hypothesis on a UC may make (`role` only marks the UC). */
export const UC_CLAIMS = ["population", "transmitter", "modulation", "role"] as const;
export const HYPOTHESIS_CLAIMS = [...CONNECTION_CLAIMS, ...UC_CLAIMS] as const;
export type ConnectionClaim = (typeof CONNECTION_CLAIMS)[number];
export type UcClaim = (typeof UC_CLAIMS)[number];
export type HypothesisClaim = (typeof HYPOTHESIS_CLAIMS)[number];

/**
 * Kind of reasoning behind a hypothesis, from the most to the least direct: a paper states it (`published`), a
 * homologous region in another species whose homology is uncertain (`homology`; direct evidence in another species is
 * ordinary evidence with its Taxon), an analogous circuit (`analogy`), indirect measures such as functional
 * connectivity, co-activation, lesions or undirected DW-MRI (`indirect`), a computational model that requires it
 * (`model`), or only that the FRG needs it to realize the TLF (`functional-need`, the weakest).
 */
export const HYPOTHESIS_BASES = ["published", "homology", "analogy", "indirect", "model", "functional-need"] as const;
export type HypothesisBasis = (typeof HYPOTHESIS_BASES)[number];

/** Allowed values of `ProjectRecord.hypothesisMaxShare`; absent = `DEFAULT_HYPOTHESIS_MAX_SHARE`. */
export const HYPOTHESIS_MAX_SHARES = [0.1, 0.2, 0.3, 0.5] as const;
export const DEFAULT_HYPOTHESIS_MAX_SHARE = 0.2;

/** Worker-written record of the hypotheses of a hypothesis-mode project (`<ProjectID>/hypotheses.json`). */
export const HYPOTHESES_FILE = "hypotheses.json";

/** Research candidate statuses a hypothesis may point to (the agent searched and found no or only weak evidence). */
export const HYPOTHESIS_CANDIDATE_STATUSES = ["not_found", "weak"] as const;

/** The `hypothesis` key of a connection or UC as read from the agent's JSON (values are checked, not trusted). */
export interface Hypothesis {
  claims: string[];
  basis: string;
  /** What was searched and not found; never a prediction or a test design */
  rationale: string;
  /** Reference IDs; for a connection the first is the paper of its referenceIds, pointers and taxon */
  premises: string[];
  /** ID of the scope (`S1`, `S2`, …) the hypothesis falls under */
  scope: string;
  /** Research mode: the research.json candidate (status not_found or weak) that records the search */
  researchCandidate?: string;
}

export type HypothesisScopeTarget = { kind: "all" } | { kind: "items"; circuitIds: string[]; gnIds: string[] };

/**
 * Where a project allows hypotheses: the claims and the target (the whole HCD, or circuits and FRG GNs). Created when
 * the project is created (S1) or by a follow-up that allows hypotheses (S2, …); never inferred from free text.
 */
export interface HypothesisScope {
  id: string;
  claims: HypothesisClaim[];
  target: HypothesisScopeTarget;
  /** One line from the user (optional) */
  note?: string;
  jobId: string;
  createdAt: string;
}

/** Evidence settings of a project as the checks use them. */
export interface EvidenceSettings {
  mode: EvidenceMode;
  scopes: HypothesisScope[];
  /** One of `HYPOTHESIS_MAX_SHARES` */
  maxShare: number;
}

/** Options of the hypothesis checks (`CheckHcdOptions.evidence`). */
export interface EvidenceOptions extends EvidenceSettings {
  /** Research mode: `researchCandidate` is required and must name a candidate of research.json */
  researchMode?: boolean;
  /** research.json candidate ID → status (research mode; null / absent when the file is missing or unreadable) */
  researchCandidates?: ReadonlyMap<string, string> | null;
  /** UCs under each FRG GN (all levels), for scopes that target GNs; from frg.json */
  gnUcs?: ReadonlyMap<string, readonly string[]> | null;
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strings = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const stripUc = (x: string) => x.replace(/`/g, "").trim().replace(/^U\./, "");
const SCOPE_ID_RE = /^S[1-9]\d*$/;

/** `hypothesisMaxShare` as stored → one of the allowed values (absent or unknown: the default). */
export function normalizeMaxShare(v: unknown): number {
  return typeof v === "number" && (HYPOTHESIS_MAX_SHARES as readonly number[]).includes(v) ? v : DEFAULT_HYPOTHESIS_MAX_SHARE;
}

/** Scopes as stored → well-formed scopes (unknown claims dropped, scopes without a valid ID or claim left out). */
export function normalizeScopes(v: unknown): HypothesisScope[] {
  if (!Array.isArray(v)) return [];
  const out: HypothesisScope[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = s(o.id);
    const claims = [...new Set(strings(o.claims).filter((c): c is HypothesisClaim => isOneOf(HYPOTHESIS_CLAIMS, c)))];
    if (!SCOPE_ID_RE.test(id) || !claims.length || out.some((y) => y.id === id)) continue;
    const t = (o.target && typeof o.target === "object" ? o.target : {}) as Record<string, unknown>;
    const target: HypothesisScopeTarget =
      t.kind === "items" ? { kind: "items", circuitIds: [...new Set(strings(t.circuitIds).map(stripUc))], gnIds: [...new Set(strings(t.gnIds))] } : { kind: "all" };
    const note = s(o.note);
    out.push({ id, claims, target, ...(note ? { note } : {}), jobId: s(o.jobId), createdAt: s(o.createdAt) });
  }
  return out;
}

/** The evidence settings of a project record (`evidenceMode`, `hypothesisScopes`, `hypothesisMaxShare`); absent = strict. */
export function evidenceSettingsOf(p: { evidenceMode?: unknown; hypothesisScopes?: unknown; hypothesisMaxShare?: unknown } | null | undefined): EvidenceSettings {
  return {
    mode: p?.evidenceMode === "hypothesis" ? "hypothesis" : "strict",
    scopes: normalizeScopes(p?.hypothesisScopes),
    maxShare: normalizeMaxShare(p?.hypothesisMaxShare),
  };
}

export const isHypothesisMode = (e: { mode: EvidenceMode } | null | undefined): boolean => e?.mode === "hypothesis";

/** `hypothesis` of a JSON item → the parsed key (unchecked), or null when absent or not an object. */
export function parseHypothesis(v: unknown): Hypothesis | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const candidate = s(o.researchCandidate);
  return {
    claims: strings(o.claims),
    basis: s(o.basis),
    rationale: s(o.rationale),
    premises: strings(o.premises),
    scope: s(o.scope),
    ...(candidate ? { researchCandidate: candidate } : {}),
  };
}

/** Whether a JSON item carries a `hypothesis` key at all (the strict-mode check rejects any value). */
export const hasHypothesisKey = (item: Record<string, unknown>): boolean => Object.prototype.hasOwnProperty.call(item, "hypothesis") && item.hypothesis !== undefined;

const pct = (x: number) => `${Math.round(x * 100)}%`;

// --- schema of the key ---------------------------------------------------------------------------------------------

const REF_ID: JsonSchema = { type: "string", pattern: "^\\[[^\\[\\]]+\\]$", description: "Reference ID `[Author, Year]` from references.json" };

const BASIS_DESCRIPTION =
  "published (a paper states this hypothesis: Literature type Hypothesis, Modeling, Opinion, …), homology (a homologous region in another species when the homology itself is uncertain; direct evidence in another species is ordinary evidence with its taxon), analogy (an analogous circuit), indirect (functional connectivity, co-activation, lesion, undirected DW-MRI, …), model (a computational model requires it), functional-need (only the FRG needs it to realize the TLF; the weakest)";

/**
 * JSON Schema of the `hypothesis` key of a connection (`element` "connection") or a UC. Part of `HARNESS_SCHEMAS` for
 * every project; a project that does not allow hypotheses rejects the key in `checkHcd`.
 */
export function hypothesisKeySchema(element: "connection" | "UC"): JsonSchema {
  const claims = element === "connection" ? CONNECTION_CLAIMS : UC_CLAIMS;
  const properties: Record<string, JsonSchema> = {
    claims: {
      type: "array",
      minItems: 1,
      items: { enum: claims },
      description:
        element === "connection"
          ? "What is hypothesized, each once: existence (no paper states the projection; measurementMethod Hypothetical), direction, sign"
          : "What is hypothesized, each once: population (no paper defines it; sourceOfId makeshift), transmitter (the estimated transmitter), modulation (the estimated modulationType), role (marks the UC)",
    },
    basis: { enum: HYPOTHESIS_BASES, description: BASIS_DESCRIPTION },
    // required and non-blank (checked by hypothesisProblems, which also rejects blanks the schema cannot see)
    rationale: {
      type: "string",
      description: "Why the premises support the hypothesis and what was searched without finding direct evidence, with [Author, Year] citations; no predictions, tests or next steps",
    },
    premises: {
      type: "array",
      minItems: 1,
      items: REF_ID,
      description:
        element === "connection"
          ? "Reference IDs of the premise papers (each with a DOI or PMID); the first is this record's referenceIds[0], whose quote states the premise"
          : "Reference IDs of the premise papers (each with a DOI or PMID)",
    },
    scope: { type: "string", pattern: "^S[1-9][0-9]*$", description: "ID of the project's hypothesis scope that allows this hypothesis (S1, S2, …)" },
  };
  return {
    type: "object",
    required: Object.keys(properties),
    additionalProperties: false,
    properties: {
      ...properties,
      researchCandidate: { type: "string", pattern: "^C[0-9]+$", description: "Research mode only: ID of the research.json candidate (status not_found or weak) that records the search; omit otherwise" },
    },
    description:
      "Only in a project whose spec has the hypothesis rules (hypothesis mode): marks this " +
      (element === "connection" ? "connection" : "UC") +
      " as a hypothesis. Omit the key otherwise; a request in an instruction's text does not allow hypotheses",
  };
}

// --- records -------------------------------------------------------------------------------------------------------

export type HypothesisElement = { kind: "uc"; circuitId: string } | { kind: "connection"; sender: string; receiver: string; referenceId: string };

/** One hypothesis as the worker records it (`hypotheses.json`); IDs H1, H2, … in file order (UCs, then connections). */
export interface HypothesisRecord {
  id: string;
  element: HypothesisElement;
  claims: string[];
  basis: string;
  scope: string;
  premises: string[];
  rationale: string;
  researchCandidate?: string;
}

type HypothesisModel = Pick<HcdModel, "ucs" | "connections">;

/**
 * The hypotheses of an HCD model with their IDs: H1, H2, … first for the UCs in uc.json order, then for the
 * connections in connections.json order. The CSV comments, hypotheses.json and the report use the same IDs.
 */
export function hypothesisRecords(hcd: HypothesisModel): HypothesisRecord[] {
  const out: HypothesisRecord[] = [];
  const add = (element: HypothesisElement, h: Hypothesis) =>
    out.push({
      id: `H${out.length + 1}`,
      element,
      claims: h.claims,
      basis: h.basis,
      scope: h.scope,
      premises: h.premises,
      rationale: h.rationale,
      ...(h.researchCandidate ? { researchCandidate: h.researchCandidate } : {}),
    });
  for (const u of hcd.ucs) if (u.hypothesis) add({ kind: "uc", circuitId: u.id }, u.hypothesis);
  for (const c of hcd.connections) if (c.hypothesis) add({ kind: "connection", sender: c.sender, receiver: c.receiver, referenceId: c.referenceIds[0] ?? "" }, c.hypothesis);
  return out;
}

/** `UC X` / `A -> B [Ref]` */
export function elementLabel(e: HypothesisElement): string {
  return e.kind === "uc" ? `UC ${e.circuitId}` : `${e.sender} -> ${e.receiver}${e.referenceId ? ` ${e.referenceId}` : ""}`;
}

/**
 * First line of the Comments of a hypothesis (Connections, Circuits and the U. rows of the FRG):
 * `Hypothesis (<claims>; <basis>): <rationale>` with the rationale on one line.
 */
export function hypothesisCommentLine(h: Hypothesis): string {
  return `Hypothesis (${h.claims.join(", ")}; ${h.basis}): ${h.rationale.replace(/\s+/g, " ").trim()}`;
}

/** Comments with the hypothesis line first (unchanged without a hypothesis). */
export function withHypothesisLine(comments: string, h: Hypothesis | undefined): string {
  if (!h) return comments;
  return comments ? `${hypothesisCommentLine(h)}\n${comments}` : hypothesisCommentLine(h);
}

const CLAIM_ALT = HYPOTHESIS_CLAIMS.join("|");
/** The hypothesis line exactly as `hypothesisCommentLine` writes it (known claims and bases), at the start of Comments. */
const HYPOTHESIS_LINE_RE = new RegExp(`^Hypothesis \\((?:${CLAIM_ALT})(?:, (?:${CLAIM_ALT}))*; (?:${HYPOTHESIS_BASES.join("|")})\\): [^\\n]*(?:\\n|$)`);

/**
 * CSV Comments without the hypothesis line, for readers that classify a circuit or connection from its comment (edge
 * sign, ROI tags): the rationale describes the premises, not this element. Comments without the line are returned as they are.
 */
export const stripHypothesisLine = (comments: string): string => comments.replace(HYPOTHESIS_LINE_RE, "");

// --- share ---------------------------------------------------------------------------------------------------------

export interface ShareFigure {
  /** Elements with a hypothesis (each counts once, whatever its claims) */
  count: number;
  /** All elements: connections[] records, or ucs[] (Collections not counted) */
  total: number;
  /** count / total (0 when total is 0) */
  ratio: number;
  limit: number;
}

export interface HypothesisShare {
  connections: ShareFigure;
  ucs: ShareFigure;
}

const figure = (count: number, total: number, limit: number): ShareFigure => ({ count, total, ratio: total ? count / total : 0, limit });

/** The two hypothesis shares of a project version, over all scopes together. */
export function hypothesisShare(hcd: HypothesisModel, limit: number): HypothesisShare {
  return {
    connections: figure(hcd.connections.filter((c) => c.hypothesis).length, hcd.connections.length, limit),
    ucs: figure(hcd.ucs.filter((u) => u.hypothesis).length, hcd.ucs.length, limit),
  };
}

/** Most hypotheses allowed among `total` elements (exact: the limit is a whole percentage). */
export const maxHypotheses = (total: number, limit: number) => Math.floor((Math.round(limit * 100) * total) / 100);
/** Above the limit (exactly at the limit is allowed). */
export const shareExceeded = (f: ShareFigure) => f.count > maxHypotheses(f.total, f.limit);

// --- scopes --------------------------------------------------------------------------------------------------------

/** UC IDs under a Collection, expanding nested Collections (cycle-safe); the ID itself when it is not a Collection. */
function leavesOf(collections: CollectionRow[], id: string): string[] {
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
  visit(id);
  return [...out];
}

/** The circuits a scope targets: listed UCs, the UCs of listed Collections (nested too) and of listed GNs. */
function targetCircuits(scope: HypothesisScope, hcd: { collections: CollectionRow[] }, gnUcs: ReadonlyMap<string, readonly string[]> | null | undefined): Set<string> | "all" {
  if (scope.target.kind === "all") return "all";
  const out = new Set<string>();
  for (const id of scope.target.circuitIds) for (const l of leavesOf(hcd.collections, id)) out.add(l);
  for (const gn of scope.target.gnIds) for (const u of gnUcs?.get(gn) ?? []) out.add(stripUc(u));
  return out;
}

export type ScopedElement = { kind: "uc"; id: string } | { kind: "connection"; sender: string; receiver: string };

/**
 * Whether a scope's target covers an element: a connection whose sender or receiver is a target; a UC that is a
 * target or has a connection whose other end is one. Claims are not looked at here.
 */
export function scopeTargetCovers(
  scope: HypothesisScope,
  el: ScopedElement,
  hcd: { collections: CollectionRow[]; connections: Pick<ConnRow, "sender" | "receiver">[] },
  gnUcs?: ReadonlyMap<string, readonly string[]> | null,
): boolean {
  const t = targetCircuits(scope, hcd, gnUcs);
  if (t === "all") return true;
  if (el.kind === "connection") return t.has(el.sender) || t.has(el.receiver);
  if (t.has(el.id)) return true;
  return hcd.connections.some((c) => (c.sender === el.id && t.has(c.receiver)) || (c.receiver === el.id && t.has(c.sender)));
}

/** One line per scope for prompts and messages: `S1: existence, direction on the whole HCD`. */
export function describeScope(scope: HypothesisScope): string {
  const t = scope.target;
  const where =
    t.kind === "all"
      ? "the whole HCD"
      : [t.circuitIds.length ? `circuits ${t.circuitIds.map((x) => `\`${x}\``).join(", ")}` : "", t.gnIds.length ? `FRG GNs ${t.gnIds.map((x) => `\`${x}\``).join(", ")} (their UCs)` : ""]
          .filter(Boolean)
          .join(" and ") || "nothing";
  return `${scope.id}: ${scope.claims.join(", ")} on ${where}`;
}

// --- evidence-only path and GN dependence ---------------------------------------------------------------------------

type PathModel = Pick<HcdModel, "ucs" | "connections">;

/** Whether a directed path of `edges` leads from a ROI input through the ROI to a ROI output (external chains allowed). */
function inputOutputPath(hcd: PathModel, keep: (c: ConnRow) => boolean): boolean {
  const roi = new Set(hcd.ucs.filter((u) => u.roi === "roi").map((u) => u.id));
  const inputs = hcd.ucs.filter((u) => u.roi === "input" || u.roi === "both").map((u) => u.id);
  const outputs = new Set(hcd.ucs.filter((u) => u.roi === "output" || u.roi === "both").map((u) => u.id));
  const next = new Map<string, Set<string>>();
  for (const c of hcd.connections) if (keep(c)) (next.get(c.sender) ?? next.set(c.sender, new Set()).get(c.sender)!).add(c.receiver);
  // state: node and whether the path has entered the ROI yet
  const seen = new Set<string>();
  const queue: [string, boolean][] = inputs.map((id) => [id, false]);
  for (const [id] of queue) seen.add(`${id}\u00000`);
  while (queue.length) {
    const [x, entered] = queue.shift()!;
    for (const y of next.get(x) ?? []) {
      const e = entered || roi.has(y);
      if (e && outputs.has(y) && !roi.has(y)) return true;
      const key = `${y}\u0000${e ? 1 : 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([y, e]);
    }
  }
  return false;
}

export interface EvidencePaths {
  /** A path from a ROI input through the ROI to a ROI output uses no hypothesis connection */
  evidenceOnly: boolean;
  /** Such a path exists when hypothesis connections are counted too */
  withHypotheses: boolean;
  /** Connections with a hypothesis */
  hypothesisConnections: number;
}

/** Whether the ROI inputs reach the ROI outputs without hypothesis connections (recorded in cross_check.json). */
export function evidencePaths(hcd: PathModel): EvidencePaths {
  return {
    evidenceOnly: inputOutputPath(hcd, (c) => !c.hypothesis),
    withHypotheses: inputOutputPath(hcd, () => true),
    hypothesisConnections: hcd.connections.filter((c) => c.hypothesis).length,
  };
}

export interface GnHypotheses {
  /** FRG node ID */
  id: string;
  /** Hypothesis IDs (H1, …) the GN depends on, in order */
  hypotheses: string[];
}

const hNumber = (id: string) => Number(id.slice(1));

/** UCs under each FRG node, all levels (cycle-safe). */
export function frgNodeUcs(frg: { gns: { id: string; subnodes: string[] }[] }): Map<string, string[]> {
  const kids = new Map(frg.gns.map((g) => [g.id, g.subnodes]));
  const memo = new Map<string, Set<string>>();
  const under = (id: string, path: Set<string>): Set<string> => {
    const m = memo.get(id);
    if (m) return m;
    const out = new Set<string>();
    if (path.has(id)) return out;
    path.add(id);
    for (const k of kids.get(id) ?? []) {
      if (k.startsWith("U.")) out.add(k.slice(2));
      else for (const u of under(k, path)) out.add(u);
    }
    path.delete(id);
    memo.set(id, out);
    return out;
  };
  return new Map(frg.gns.map((g) => [g.id, [...under(g.id, new Set())]]));
}

/**
 * GNs that depend on hypotheses: a GN whose UCs (all levels below it) include a hypothesis UC, or whose UCs are
 * connected among themselves only through hypothesis connections (direction ignored; then every hypothesis connection
 * between its UCs counts). Only GNs with at least one dependency are listed, in frg.json order.
 */
export function gnHypothesisDependencies(hcd: PathModel, frg: Pick<FrgModel, "gns">, records = hypothesisRecords(hcd)): GnHypotheses[] {
  if (!records.length) return [];
  const ucH = new Map<string, string>();
  const connH = new Map<ConnRow, string>();
  let i = 0;
  for (const u of hcd.ucs) if (u.hypothesis) ucH.set(u.id, records[i++].id);
  for (const c of hcd.connections) if (c.hypothesis) connH.set(c, records[i++].id);
  const under = frgNodeUcs(frg);
  const out: GnHypotheses[] = [];
  for (const g of frg.gns) {
    const members = new Set(under.get(g.id) ?? []);
    const deps = new Set<string>();
    for (const u of members) if (ucH.has(u)) deps.add(ucH.get(u)!);
    if (members.size >= 2) {
      const inside = hcd.connections.filter((c) => members.has(c.sender) && members.has(c.receiver) && c.sender !== c.receiver);
      if (!undirectedConnected(members, inside.filter((c) => !c.hypothesis))) for (const c of inside) if (connH.has(c)) deps.add(connH.get(c)!);
    }
    if (deps.size) out.push({ id: g.id, hypotheses: [...deps].sort((a, b) => hNumber(a) - hNumber(b)) });
  }
  return out;
}

function undirectedConnected(nodes: Set<string>, edges: Pick<ConnRow, "sender" | "receiver">[]): boolean {
  const [first] = nodes;
  if (first === undefined) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.sender) ?? adj.set(e.sender, []).get(e.sender)!).push(e.receiver);
    (adj.get(e.receiver) ?? adj.set(e.receiver, []).get(e.receiver)!).push(e.sender);
  }
  const seen = new Set([first]);
  const queue = [first];
  while (queue.length) for (const y of adj.get(queue.shift()!) ?? []) if (nodes.has(y) && !seen.has(y)) seen.add(y), queue.push(y);
  return seen.size === nodes.size;
}

/** `Depends on hypotheses: H2, H5` for the FRG GN Comments (empty without dependencies). */
export const gnDependencyNote = (ids: string[]) => (ids.length ? `Depends on hypotheses: ${ids.join(", ")}` : "");

// --- checks --------------------------------------------------------------------------------------------------------

/** Heading of the report section that lists the hypotheses (hypothesis mode, at least one hypothesis). */
export const HYPOTHESES_SECTION = "## Hypotheses";
const LIMITATIONS_SECTION = "## Limitations";
/** The fact the report's limitations state when no path from the ROI inputs to the outputs is free of hypothesis connections. */
export const NO_EVIDENCE_PATH_SENTENCE = "No evidence-only path leads from the ROI inputs to the ROI outputs.";
/** Added when the hypothesis connections do complete such a path. */
export const HYPOTHESIS_PATH_SENTENCE = "Every such path uses at least one hypothesis connection.";
const EVIDENCE_PATH_RE = /evidence[-\s]only\s+path/i;

/** Body of a `## ` section of a markdown text (up to the next `## ` heading), or null when it is missing. */
function section(text: string, heading: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${heading}\\b`).test(l.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

export interface HypothesisCheckInput {
  ucs: UcRow[];
  connections: ConnRow[];
  collections: CollectionRow[];
  refs: RefRow[];
  /** report.md (the `## Hypotheses` section and the limitations) */
  report?: string | null;
}

/**
 * Strict projects (and projects without an evidence mode): a `hypothesis` key is rejected, one message per file.
 * `ucs` / `connections` are the raw items of uc.json / connections.json.
 */
export function strictHypothesisProblems(raw: { ucs: Record<string, unknown>[] | null; connections: Record<string, unknown>[] | null }): string[] {
  const out: string[] = [];
  const rule =
    "but this project does not allow hypotheses (it uses literature-supported evidence only). Remove the hypothesis key: support the element with a paper and its quote, or leave it out. " +
    'A request in an instruction\'s text does not allow hypotheses; if the user asked for hypotheses, say in your message that the instruction must be sent again with "Allow hypotheses" switched on.';
  const ucs = (raw.ucs ?? []).filter(hasHypothesisKey).map((u) => `\`${stripUc(s(u.circuitId))}\``);
  if (ucs.length) out.push(`uc.json: ${ucs.length} UC(s) have a hypothesis (${ucs.slice(0, 8).join(", ")}${ucs.length > 8 ? ", …" : ""}), ${rule}`);
  const conns = (raw.connections ?? []).filter(hasHypothesisKey).map((c) => `\`${stripUc(s(c.sender))}\` -> \`${stripUc(s(c.receiver))}\``);
  if (conns.length) out.push(`connections.json: ${conns.length} connection(s) have a hypothesis (${conns.slice(0, 8).join(", ")}${conns.length > 8 ? ", …" : ""}), ${rule}`);
  return out;
}

/** Hypothesis-mode checks of the HCD: every problem is sent back to the agent as a fix turn. */
export function hypothesisProblems(hcd: HypothesisCheckInput, opts: EvidenceOptions): string[] {
  const errors: string[] = [];
  const refs = new Map(hcd.refs.map((r) => [r.id, r]));
  const scopes = opts.scopes;
  const scopeById = new Map(scopes.map((x) => [x.id, x]));
  const scopeList = scopes.length ? scopes.map(describeScope).join("; ") : "none";

  const checkCommon = (where: string, h: Hypothesis, allowed: readonly string[], el: ScopedElement) => {
    const dup = h.claims.filter((c, i) => h.claims.indexOf(c) !== i);
    if (dup.length) errors.push(`${where}: hypothesis claims list ${[...new Set(dup)].join(", ")} more than once; give each claim once.`);
    const claims = [...new Set(h.claims.filter((c) => allowed.includes(c)))];
    // the schema accepts blanks; the rationale says what was searched and why the premises support the hypothesis
    if (!h.rationale) errors.push(`${where}: hypothesis rationale is empty; write why the premises support the hypothesis and what was searched without finding direct evidence, with [Author, Year] citations.`);

    const dupPremises = h.premises.filter((p, i) => h.premises.indexOf(p) !== i);
    if (dupPremises.length) errors.push(`${where}: hypothesis premises list ${[...new Set(dupPremises)].join(", ")} more than once.`);
    for (const p of new Set(h.premises)) {
      const r = refs.get(p);
      // without references.json the missing file is the problem (as for referenceIds)
      if (!hcd.refs.length) continue;
      if (!r) errors.push(`${where}: hypothesis premise ${p} is not in references.json; a premise is a paper of references.json that the worker verifies.`);
      else if (/^n\/?a$/i.test(r.doi || "N/A") && !r.pmid)
        errors.push(`${where}: hypothesis premise ${p} has no DOI or PMID, so it cannot be verified; a premise must be a paper the worker can look up (give its DOI or PMID, or choose another premise).`);
    }

    if (opts.researchMode) {
      const id = h.researchCandidate;
      const status = id ? opts.researchCandidates?.get(id) : undefined;
      if (!id)
        errors.push(
          `${where}: researchCandidate is required in research mode: search the literature first, record the search in research.json as a candidate (its queries, and status not_found or weak), and give its ID.`,
        );
      else if (status === undefined) errors.push(`${where}: researchCandidate ${id} is not a candidate in research.json; give the ID of the candidate that records the search for this claim.`);
      else if (status === "contradicted")
        errors.push(`${where}: researchCandidate ${id} is contradicted in research.json: the literature contradicts this claim, so it cannot be included as a hypothesis. Remove it.`);
      else if (status === "supported")
        errors.push(`${where}: researchCandidate ${id} is supported in research.json: the survey found direct evidence, so use that paper and its quote as evidence instead of a hypothesis.`);
      else if (!isOneOf(HYPOTHESIS_CANDIDATE_STATUSES, status))
        errors.push(`${where}: researchCandidate ${id} has status "${status}" in research.json; a hypothesis points to a candidate with status not_found or weak.`);
    } else if (h.researchCandidate) {
      errors.push(`${where}: researchCandidate ${h.researchCandidate} is only for research mode, and this project has no research survey; leave researchCandidate out and name what you searched in rationale.`);
    }

    if (!claims.length) return;
    const covering = scopes.filter((x) => claims.every((c) => (x.claims as readonly string[]).includes(c)) && scopeTargetCovers(x, el, hcd, opts.gnUcs));
    const allowedHere = (c: string) => scopes.filter((x) => (x.claims as readonly string[]).includes(c) && scopeTargetCovers(x, el, hcd, opts.gnUcs));
    if (!covering.length && claims.length > 1 && claims.every((c) => allowedHere(c).length)) {
      errors.push(
        `${where}: no single hypothesis scope allows all of its claims (${claims.join(", ")}): ${claims.map((c) => `${c} by ${allowedHere(c).map((x) => x.id).join(" or ")}`).join("; ")}. ` +
          `A hypothesis names one scope, so keep only the claims one scope allows and support the rest with a paper, or leave them out.`,
      );
    } else if (!covering.length) {
      const missingClaims = claims.filter((c) => !scopes.some((x) => (x.claims as readonly string[]).includes(c)));
      errors.push(
        `${where}: hypothesis (${claims.join(", ")}) is outside every hypothesis scope of this project (${scopeList})${missingClaims.length ? `; no scope allows ${missingClaims.join(", ")}` : ""}. ` +
          `Remove the hypothesis: support the element with a paper and its quote, or leave it out. Hypotheses are allowed only inside the scopes the user chose.`,
      );
    } else if (!covering.some((x) => x.id === h.scope)) {
      errors.push(
        `${where}: hypothesis scope ${h.scope || '""'} ${scopeById.has(h.scope) ? "does not cover it" : "is not a scope of this project"}; ${covering.map((x) => x.id).join(" or ")} covers it, so write scope ${covering[0].id}.`,
      );
    }
  };

  // UCs
  for (const u of hcd.ucs) {
    const h = u.hypothesis;
    if (!h) continue;
    const where = `uc.json: \`${u.id}\``;
    checkCommon(where, h, UC_CLAIMS, { kind: "uc", id: u.id });
    if (h.claims.includes("population")) {
      if (sourceOfIdProblem({ id: u.id, descriptor: u.descriptor, sourceOfId: "makeshift" }))
        errors.push(
          `${where}: a population hypothesis is for a population finer than its SABRA unit (a UC with facets); \`${u.id}\` is a whole SABRA unit, which the atlas defines. Add the facets that define the hypothesized population, or use the claims transmitter, modulation or role.`,
        );
      else if (u.sourceOfId !== "makeshift") errors.push(`${where}: a population hypothesis means no paper defines the population: set sourceOfId to makeshift (the premises go into the hypothesis).`);
    }
    if (h.claims.includes("transmitter") && !u.transmitter) errors.push(`${where}: a transmitter hypothesis needs the estimated transmitter in transmitter (one of the BRA list).`);
    if (h.claims.includes("modulation") && !u.modulationType) errors.push(`${where}: a modulation hypothesis needs the estimated modulationType (Excitatory, Inhibitory or Modulatory).`);
  }

  // connections
  const evidenced = new Map<string, string[]>();
  /** The first existence hypothesis of each sender -> receiver; a pair has at most one (further premises go into it) */
  const firstExistence = new Map<string, ConnRow>();
  for (const c of hcd.connections) {
    const k = `${c.sender}\u0000${c.receiver}`;
    if (c.hypothesis?.claims.includes("existence")) {
      if (!firstExistence.has(k)) firstExistence.set(k, c);
      continue;
    }
    (evidenced.get(k) ?? evidenced.set(k, []).get(k)!).push(...c.referenceIds);
  }
  for (const c of hcd.connections) {
    const where = `connections.json: \`${c.sender}\` -> \`${c.receiver}\`${c.referenceIds.length ? ` (${c.referenceIds.join("; ")})` : ""}`;
    const h = c.hypothesis;
    if (!h) {
      if (c.method === "Hypothetical")
        errors.push(
          `${where}: measurementMethod Hypothetical marks an existence hypothesis; add the hypothesis key with the claim existence (and its premises and rationale), or give the method of the paper's evidence.`,
        );
      continue;
    }
    checkCommon(where, h, CONNECTION_CLAIMS, { kind: "connection", sender: c.sender, receiver: c.receiver });
    if (h.premises.length && c.referenceIds.length && c.referenceIds[0] !== h.premises[0])
      errors.push(
        `${where}: the first hypothesis premise (${h.premises[0]}) must be the paper of this record (referenceIds ${c.referenceIds[0]}), whose taxon, pointers and quote state the premise; put the main premise first, or cite it in referenceIds.`,
      );
    const existence = h.claims.includes("existence");
    if (existence && c.method !== "Hypothetical") errors.push(`${where}: an existence hypothesis has measurementMethod Hypothetical (the premise's method goes into comment or rationale).`);
    if (!existence && c.method === "Hypothetical")
      errors.push(`${where}: measurementMethod Hypothetical is only for an existence hypothesis; a ${h.claims.join(" / ") || "direction or sign"} hypothesis keeps the method of the paper's evidence.`);
    if (existence) {
      const k = `${c.sender}\u0000${c.receiver}`;
      const other = evidenced.get(k);
      const first = firstExistence.get(k);
      if (other?.length)
        errors.push(
          `${where}: an existence hypothesis, but the same sender -> receiver already has evidence (${[...new Set(other)].join("; ")}); the projection is supported, so remove this hypothetical record.`,
        );
      else if (first && first !== c)
        errors.push(
          `${where}: a second existence hypothesis for the same sender -> receiver (the first cites ${first.referenceIds.join("; ") || "no reference"}); keep one hypothetical record and list the further papers in its premises and rationale.`,
        );
    }
  }

  // share of the whole project version (all scopes together)
  const share = hypothesisShare(hcd, opts.maxShare);
  const shareProblem = (what: string, f: ShareFigure) =>
    `Hypotheses make up ${f.count} of ${f.total} ${what}, more than the ${maxHypotheses(f.total, f.limit)} this project's limit of ${pct(f.limit)} allows. ` +
    `Reduce the hypotheses: keep those the TLF needs most, turn a hypothesis into evidence only when a paper states the claim, and remove the rest. Do not add ${what} to lower the share (every evidence connection needs a verified quote). ` +
    `If the HCD cannot realize the TLF within the limit, say so in your message, so that the user can review the scopes or the limit.`;
  if (shareExceeded(share.connections)) errors.push(shareProblem("connections", share.connections));
  if (shareExceeded(share.ucs)) errors.push(shareProblem("UCs", share.ucs));

  // report
  const records = hypothesisRecords(hcd);
  if (records.length && hcd.report?.trim()) {
    const body = section(hcd.report, HYPOTHESES_SECTION);
    const list = records.map((r) => `${r.id} = ${elementLabel(r.element)}`).join("; ");
    if (body === null)
      errors.push(
        `report.md: add the \`${HYPOTHESES_SECTION}\` section: a table of every hypothesis (ID, element, claims, basis, premises, rationale) with the IDs the worker gives them (${list}), and the share of hypothesis connections and UCs against the limit of ${pct(opts.maxShare)}.`,
      );
    else {
      const missing = records.filter((r) => !new RegExp(`\\b${r.id}\\b`).test(body));
      if (missing.length) errors.push(`report.md: the \`${HYPOTHESES_SECTION}\` table lacks ${missing.map((r) => `${r.id} (${elementLabel(r.element)})`).join(", ")}; list every hypothesis with the worker's IDs (${list}).`);
    }
    const paths = evidencePaths(hcd);
    if (!paths.evidenceOnly) {
      const lim = section(hcd.report, LIMITATIONS_SECTION);
      if (lim === null || !EVIDENCE_PATH_RE.test(lim))
        errors.push(
          paths.withHypotheses
            ? `report.md: the ROI inputs reach the ROI outputs only through hypothesis connections; state this fact under \`${LIMITATIONS_SECTION}\`: "${NO_EVIDENCE_PATH_SENTENCE} ${HYPOTHESIS_PATH_SENTENCE}"`
            : `report.md: no connections lead from the ROI inputs through the ROI to the ROI outputs, with or without hypotheses; state this fact under \`${LIMITATIONS_SECTION}\`: "${NO_EVIDENCE_PATH_SENTENCE}"`,
        );
    }
  }
  return errors;
}

// --- hypotheses.json -----------------------------------------------------------------------------------------------

/** Contents of `<ProjectID>/hypotheses.json`, rewritten by the worker at every check of a hypothesis-mode project. */
export interface HypothesesFile {
  checkedAt: string;
  mode: "hypothesis";
  scopes: HypothesisScope[];
  share: HypothesisShare;
  hypotheses: HypothesisRecord[];
  /** Whether a path from the ROI inputs through the ROI to its outputs uses no hypothesis connection */
  evidenceOnlyPath: boolean;
  /** GNs that depend on hypotheses; absent until the FRG was checked */
  gns?: GnHypotheses[];
}

/** hypotheses.json from the checked HCD model (and the FRG model once it exists). */
export function buildHypothesesFile(hcd: HypothesisModel, frg: Pick<FrgModel, "gns"> | null, settings: EvidenceSettings, checkedAt: string): HypothesesFile {
  const records = hypothesisRecords(hcd);
  return {
    checkedAt,
    mode: "hypothesis",
    scopes: settings.scopes,
    share: hypothesisShare(hcd, settings.maxShare),
    hypotheses: records,
    evidenceOnlyPath: evidencePaths(hcd).evidenceOnly,
    ...(frg ? { gns: gnHypothesisDependencies(hcd, frg, records) } : {}),
  };
}

const nonEmptyStr: JsonSchema = { type: "string", minLength: 1 };
const strArr = (item: JsonSchema = { type: "string" }, minItems?: number): JsonSchema => ({ type: "array", items: item, ...(minItems ? { minItems } : {}) });
const obj = (properties: Record<string, JsonSchema>, optional: Record<string, JsonSchema> = {}): JsonSchema => ({
  type: "object",
  required: Object.keys(properties),
  additionalProperties: false,
  properties: { ...properties, ...optional },
});
const shareSchema = obj({ count: { type: "integer" }, total: { type: "integer" }, ratio: { type: "number" }, limit: { enum: HYPOTHESIS_MAX_SHARES } });

/** JSON Schema of hypotheses.json (worker-written; the worker validates the file before writing it). */
export const HYPOTHESES_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "hypotheses.schema.json",
  title: "Hypotheses of a hypothesis-mode project (written by the worker)",
  ...obj(
    {
      checkedAt: nonEmptyStr,
      mode: { enum: ["hypothesis"] },
      scopes: strArr(
        obj(
          {
            id: { type: "string", pattern: "^S[1-9][0-9]*$" },
            claims: strArr({ enum: HYPOTHESIS_CLAIMS }, 1),
            target: { type: "object", required: ["kind"], properties: { kind: { enum: ["all", "items"] }, circuitIds: strArr(), gnIds: strArr() }, additionalProperties: false },
            jobId: { type: "string" },
            createdAt: { type: "string" },
          },
          { note: { type: "string" } },
        ),
      ),
      share: obj({ connections: shareSchema, ucs: shareSchema }),
      hypotheses: strArr(
        obj(
          {
            id: { type: "string", pattern: "^H[1-9][0-9]*$" },
            element: {
              type: "object",
              required: ["kind"],
              additionalProperties: false,
              properties: { kind: { enum: ["uc", "connection"] }, circuitId: { type: "string" }, sender: { type: "string" }, receiver: { type: "string" }, referenceId: { type: "string" } },
            },
            claims: strArr({ type: "string" }),
            basis: { type: "string" },
            scope: { type: "string" },
            premises: strArr({ type: "string" }),
            rationale: { type: "string" },
          },
          { researchCandidate: { type: "string" } },
        ),
      ),
      evidenceOnlyPath: { type: "boolean" },
    },
    { gns: strArr(obj({ id: nonEmptyStr, hypotheses: strArr({ type: "string", pattern: "^H[1-9][0-9]*$" }, 1) })) },
  ),
};

/** research.json → candidate ID → status (lenient: unreadable files give an empty map). */
export function researchCandidateStatuses(text: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!text?.trim()) return out;
  try {
    const j = JSON.parse(text) as { candidates?: unknown };
    if (Array.isArray(j.candidates))
      for (const c of j.candidates) if (c && typeof c === "object" && s((c as Record<string, unknown>).id)) out.set(s((c as Record<string, unknown>).id), s((c as Record<string, unknown>).status));
  } catch {
    /* empty */
  }
  return out;
}

/** frg.json → UCs under each GN, all levels (lenient: for scope targets before the FRG is checked). */
export function frgGnUcsFromJson(text: string | null | undefined): Map<string, string[]> {
  if (!text?.trim()) return new Map();
  try {
    const j = JSON.parse(text) as { nodes?: unknown };
    const gns = (Array.isArray(j.nodes) ? j.nodes : [])
      .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
      .map((n) => ({ id: s(n.id), subnodes: strings(n.subnodes).map((x) => x.replace(/`/g, "")) }))
      .filter((g) => g.id);
    return frgNodeUcs({ gns });
  } catch {
    return new Map();
  }
}
