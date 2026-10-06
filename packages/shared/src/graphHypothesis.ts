/**
 * Hypothesis mode, stage 3: the hypotheses on the graph JSON (`graph/hcd.json`, `graph/frg.json`). The worker marks
 * them when it builds the graphs (from hypotheses.json, falling back to the hypothesis lines of the CSV Comments), so
 * the screens never guess from free text. Graphs of projects without hypotheses carry no marks.
 */
import { col, parseCsvObjects } from "./csv.js";
import { parseHypothesisLine, type HypothesesFile, type HypothesisBasis, type HypothesisClaim, type HypothesisRecord } from "./hypothesis.js";
import type { FrgGraph, HcdEdge, HcdGraph, HcdNode } from "./types.js";

/** One hypothesis on a node or an edge. */
export interface GraphHypothesisItem {
  /** `H1`, … (absent when hypotheses.json could not be read) */
  id?: string;
  claims: HypothesisClaim[];
  basis: HypothesisBasis;
  rationale: string;
  /** Reference IDs */
  premises: string[];
  /** Scope ID (`S1`, …) */
  scope?: string;
}

/** The hypotheses of a UC, or of a connection (all its records with a hypothesis). */
export interface GraphHypothesis {
  items: GraphHypothesisItem[];
  /** Connections: every record of the sender -> receiver pair is a hypothesis (no record is evidence for it) */
  only?: boolean;
}

/** Sources of the marks: the CSVs the graphs were built from and hypotheses.json (null when unreadable). */
export interface GraphHypothesisSources {
  connectionsCsv: string;
  hypotheses?: Pick<HypothesesFile, "hypotheses" | "gns"> | null;
}

const stripId = (s: string) => s.replace(/`/g, "").trim().replace(/^(U\.|R\.)/, "");

const itemOf = (r: HypothesisRecord): GraphHypothesisItem => ({
  id: r.id,
  claims: r.claims as HypothesisClaim[],
  basis: r.basis as HypothesisBasis,
  rationale: r.rationale,
  premises: r.premises,
  scope: r.scope,
});

const DEPENDS_RE = /Depends on hypotheses: (H\d+(?:, H\d+)*)\s*$/;

/** IDs of the hypotheses a GN depends on, from the end of its FRG Comments (`Depends on hypotheses: H2, H5`). */
export function gnDependenciesFromComments(comments: string): string[] {
  const m = DEPENDS_RE.exec(comments);
  return m ? m[1].split(", ") : [];
}

/**
 * Marks the hypotheses on graphs built from a hypothesis-mode project's CSVs (in place): `hypothesis` on UCs and
 * connections, `hypotheses` (IDs) on the FRG GNs that depend on them.
 */
export function markGraphHypotheses(hcd: HcdGraph, frg: FrgGraph, src: GraphHypothesisSources): void {
  const records = src.hypotheses?.hypotheses ?? null;
  // UCs ------------------------------------------------------------------------------------------------------------
  const ucRecords = new Map<string, HypothesisRecord>();
  for (const r of records ?? []) if (r.element.kind === "uc") ucRecords.set(stripId(r.element.circuitId), r);
  for (const n of hcd.nodes) {
    const r = ucRecords.get(n.id);
    const line = records ? null : parseHypothesisLine(n.comments);
    const item = r ? itemOf(r) : line ? { ...line, premises: [] } : null;
    if (item) n.hypothesis = { items: [item] };
  }
  // Connections: one CSV row per record; rows of a pair are one edge ------------------------------------------------
  const pending = (records ?? []).filter((r) => r.element.kind === "connection");
  const byPair = new Map<string, { rows: number; items: GraphHypothesisItem[] }>();
  for (const row of parseCsvObjects(src.connectionsCsv)) {
    const sender = stripId(col(row, "Sender Circuit ID (sCID)", "Sender Circuit ID", "sCID", "Sender"));
    const receiver = stripId(col(row, "Receiver Circuit ID (rCID)", "Receiver Circuit ID", "rCID", "Receiver"));
    if (!sender || !receiver) continue;
    const key = `${sender}\u0000${receiver}`;
    const pair = byPair.get(key) ?? byPair.set(key, { rows: 0, items: [] }).get(key)!;
    pair.rows++;
    const line = parseHypothesisLine(col(row, "Comments", "Comment"));
    if (!line) continue;
    const ref = col(row, "Reference ID");
    // the record of this row: same sender, receiver and first premise, in file order
    const i = pending.findIndex((r) => r.element.kind === "connection" && stripId(r.element.sender) === sender && stripId(r.element.receiver) === receiver && (!ref || r.element.referenceId === ref));
    const r = i >= 0 ? pending.splice(i, 1)[0] : null;
    pair.items.push(r ? itemOf(r) : { ...line, premises: ref ? [ref] : [] });
  }
  for (const e of hcd.edges) {
    const pair = byPair.get(`${e.source}\u0000${e.target}`);
    if (pair?.items.length) e.hypothesis = { items: pair.items, only: pair.items.length >= pair.rows };
  }
  // FRG GNs --------------------------------------------------------------------------------------------------------
  const gnDeps = new Map((src.hypotheses?.gns ?? []).map((g) => [g.id, g.hypotheses]));
  for (const n of frg.nodes) {
    if (n.kind === "uc") continue;
    const ids = gnDeps.get(n.id) ?? gnDependenciesFromComments(n.comments);
    if (ids.length) n.hypotheses = ids;
  }
}

// --- reading the marks (screens) ----------------------------------------------------------------------------------

/** Claims of a node's or an edge's hypotheses, each once. */
export const hypothesisClaimsOf = (h: GraphHypothesis | undefined): HypothesisClaim[] => [...new Set(h?.items.flatMap((i) => i.claims) ?? [])];

/** A connection whose only hypothesis is its direction (drawn with a hollow arrowhead). */
export const isDirectionOnly = (h: GraphHypothesis | undefined): boolean => {
  const c = hypothesisClaimsOf(h);
  return c.length === 1 && c[0] === "direction";
};

/** A UC that is itself a hypothesis (no paper defines the population); other UC hypotheses are about its properties. */
export const isHypotheticalUc = (n: Pick<HcdNode, "hypothesis">): boolean => hypothesisClaimsOf(n.hypothesis).includes("population");

/** Hypothesis IDs on an HCD graph (UCs and connections), and how many hypotheses it marks. */
export function graphHypothesisCount(hcd: Pick<HcdGraph, "nodes" | "edges"> | null | undefined): number {
  if (!hcd) return 0;
  return [...hcd.nodes, ...hcd.edges].reduce((n, x) => n + (x.hypothesis?.items.length ?? 0), 0);
}

/**
 * The evidence-only HCD ("Hide hypotheses"): without the connections that are only hypotheses and without the UCs
 * that are themselves hypotheses (with their connections). Connections with an evidence record stay, and so do UCs whose
 * hypotheses are about a property; their marks are dropped, so the graph shows the evidence only.
 */
export function evidenceOnlyHcd<G extends Pick<HcdGraph, "nodes" | "edges">>(hcd: G): G {
  const drop = new Set(hcd.nodes.filter(isHypotheticalUc).map((n) => n.id));
  const nodes = hcd.nodes.filter((n) => !drop.has(n.id)).map(({ hypothesis: _h, ...n }) => n as HcdNode);
  const edges = hcd.edges.filter((e) => !e.hypothesis?.only && !drop.has(e.source) && !drop.has(e.target)).map(({ hypothesis: _h, ...e }) => e as HcdEdge);
  return { ...hcd, nodes, edges };
}
