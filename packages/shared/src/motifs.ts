/**
 * Bottom-up candidates for the FRG: small circuits and pathways read off the HCD's ROI-internal connection graph.
 * The FRG phase matches them against the top-down decomposition of the TLF (meet in the middle): motifs are
 * candidates for the GNs that hold UCs, pathways and components for the upper levels. Deterministic and free of I/O.
 */
import { classifyEdgeSign } from "./edgeSign.js";
import type { HcdModel } from "./harness.js";
import type { EdgeSign } from "./types.js";

/**
 * - `pair`: one ROI-internal connection; `reciprocal`: connections both ways
 * - `feedforward`: three UCs A → B → C with the shortcut A → C (and no loop through all three)
 * - `loop`: three or four UCs with a directed cycle through all of them
 * Feedforward triangles and loops are the motifs a pair of UCs cannot express.
 */
export type MotifKind = "pair" | "reciprocal" | "feedforward" | "loop";

export interface MotifEdge {
  source: string;
  target: string;
  sign: EdgeSign;
}

export interface Motif {
  /** `M1`, `M2`, … in the order of `motifs` (3-4 UC motifs first) */
  id: string;
  kind: MotifKind;
  /** Circuit IDs: the cycle order for a loop, source → middle → sink for a feedforward triangle, sender first for a pair */
  ucs: string[];
  /** Every ROI-internal connection among `ucs` */
  edges: MotifEdge[];
}

export interface Pathway {
  /** `W1`, `W2`, … */
  id: string;
  /** The way from a ROI entry to a ROI exit; a block of several UCs is a loop (a strongly connected set) */
  blocks: string[][];
  /** Circuits outside the ROI that send into the first block */
  inputs: string[];
  /** Circuits outside the ROI that the last block sends to */
  outputs: string[];
}

export interface FrgCandidates {
  roiUcs: string[];
  /** ROI-internal connections (one per sender → receiver) */
  connections: MotifEdge[];
  /** Weakly connected parts of the ROI-internal graph (one entry when the ROI is connected) */
  components: string[][];
  motifs: Motif[];
  pathways: Pathway[];
  /** Pathways cover every loop / UC on a way from an entry to an exit; set when the limit cut the list short */
  truncated: { motifs: boolean; pathways: boolean };
}

export interface CircuitGraph {
  /** Every circuit with whether it is inside the ROI, and what classifyEdgeSign needs to sign its outputs */
  circuits: { id: string; roi: boolean; transmitter?: string; modulationType?: string }[];
  /** Directed connections; several rows of the same sender → receiver are merged */
  connections: { source: string; target: string; comment?: string }[];
}

export const MOTIF_LIMITS = { large: 40, pathways: 12 } as const;
/** Largest number of UCs a GN may hold, and the size of the largest motif listed */
export const MAX_MOTIF_UCS = 4;

const key = (a: string, b: string) => `${a}\u0000${b}`;

/** The ROI-internal graph of an HCD model (UCs with roi = "roi"; Collections are never connection ends). */
export function hcdCircuitGraph(hcd: Pick<HcdModel, "ucs" | "connections">): CircuitGraph {
  return {
    circuits: hcd.ucs.map((u) => ({ id: u.id, roi: u.roi === "roi", transmitter: u.transmitter, modulationType: u.modulationType })),
    connections: hcd.connections.map((c) => ({ source: c.sender, target: c.receiver, comment: c.comment })),
  };
}

/** Whether `ucs` are connected by ROI-internal connections among themselves (direction ignored). */
export function isConnectedSet(ucs: string[], connections: Iterable<{ source: string; target: string }>): boolean {
  const set = new Set(ucs);
  if (set.size <= 1) return true;
  const adj = new Map<string, string[]>();
  for (const e of connections) {
    if (e.source === e.target || !set.has(e.source) || !set.has(e.target)) continue;
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }
  const start = [...set][0];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) for (const y of adj.get(stack.pop()!) ?? []) if (!seen.has(y)) seen.add(y), stack.push(y);
  return seen.size === set.size;
}

export function findFrgCandidates(g: CircuitGraph, limits: { large: number; pathways: number } = MOTIF_LIMITS): FrgCandidates {
  const byId = new Map(g.circuits.map((c) => [c.id, c]));
  const roi = g.circuits.filter((c) => c.roi).map((c) => c.id);
  const inRoi = new Set(roi);

  // one edge per sender → receiver; the comments of all rows decide the sign
  const comments = new Map<string, string[]>();
  for (const c of g.connections) {
    if (!byId.has(c.source) || !byId.has(c.target) || c.source === c.target) continue;
    (comments.get(key(c.source, c.target)) ?? comments.set(key(c.source, c.target), []).get(key(c.source, c.target))!).push(c.comment ?? "");
  }
  const allEdges: MotifEdge[] = [...comments].map(([k, cs]) => {
    const [source, target] = k.split("\u0000");
    const sender = byId.get(source)!;
    const sign = classifyEdgeSign({ comments: cs.filter(Boolean).join(" / ") }, { transmitter: sender.transmitter ?? "", modulationType: sender.modulationType ?? "" });
    return { source, target, sign };
  });
  const edges = allEdges.filter((e) => inRoi.has(e.source) && inRoi.has(e.target));
  const edgeOf = new Map(edges.map((e) => [key(e.source, e.target), e]));
  const has = (a: string, b: string) => edgeOf.has(key(a, b));
  const out = new Map<string, string[]>();
  const und = new Map<string, Set<string>>();
  for (const e of edges) {
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e.target);
    (und.get(e.source) ?? und.set(e.source, new Set()).get(e.source)!).add(e.target);
    (und.get(e.target) ?? und.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const among = (ucs: string[]) => edges.filter((e) => ucs.includes(e.source) && ucs.includes(e.target));

  // ---- motifs ---------------------------------------------------------------------------------------------------
  const large: Omit<Motif, "id">[] = [];
  const pairs: Omit<Motif, "id">[] = [];
  const order = [...roi].sort();
  const rank = new Map(order.map((id, i) => [id, i]));
  for (const e of edges) {
    if (has(e.target, e.source)) {
      if (rank.get(e.source)! < rank.get(e.target)!) pairs.push({ kind: "reciprocal", ucs: [e.source, e.target], edges: among([e.source, e.target]) });
    } else pairs.push({ kind: "pair", ucs: [e.source, e.target], edges: [e] });
  }
  // 3- and 4-sets grown from connected neighbours only, each set once (its smallest member starts it)
  const seenSets = new Set<string>();
  const grow = (set: string[]) => {
    if (set.length >= 3) {
      const id = [...set].sort().join("\u0000");
      if (seenSets.has(id)) return;
      seenSets.add(id);
      const m = classifySet(set, has);
      if (m) large.push({ ...m, edges: among(m.ucs) });
    }
    if (set.length === MAX_MOTIF_UCS) return;
    const first = rank.get(set[0])!;
    for (const x of set)
      for (const y of und.get(x) ?? [])
        if (!set.includes(y) && rank.get(y)! > first) grow([...set, y]);
  };
  if (roi.length <= 80) for (const id of order) grow([id]);
  large.sort((a, b) => a.ucs.length - b.ucs.length || kindRank(a.kind) - kindRank(b.kind) || a.ucs.join().localeCompare(b.ucs.join()));
  pairs.sort((a, b) => a.ucs.join().localeCompare(b.ucs.join()));
  const motifs = [...large.slice(0, limits.large), ...pairs].map((m, i) => ({ id: `M${i + 1}`, ...m }));

  // ---- components -----------------------------------------------------------------------------------------------
  const components: string[][] = [];
  const placed = new Set<string>();
  for (const id of order) {
    if (placed.has(id)) continue;
    const comp = [id];
    placed.add(id);
    for (let i = 0; i < comp.length; i++)
      for (const y of und.get(comp[i]) ?? [])
        if (!placed.has(y)) placed.add(y), comp.push(y);
    components.push(comp.sort());
  }

  // ---- pathways -------------------------------------------------------------------------------------------------
  const blocks = stronglyConnected(order, out);
  const blockOf = new Map<string, number>();
  blocks.forEach((b, i) => b.forEach((u) => blockOf.set(u, i)));
  const next = blocks.map(() => new Set<number>());
  for (const e of edges) if (blockOf.get(e.source) !== blockOf.get(e.target)) next[blockOf.get(e.source)!].add(blockOf.get(e.target)!);
  const prev = blocks.map(() => new Set<number>());
  next.forEach((ns, i) => ns.forEach((j) => prev[j].add(i)));
  const inputsOf = blocks.map(() => new Set<string>());
  const outputsOf = blocks.map(() => new Set<string>());
  for (const e of allEdges) {
    if (!inRoi.has(e.source) && inRoi.has(e.target)) inputsOf[blockOf.get(e.target)!].add(e.source);
    if (inRoi.has(e.source) && !inRoi.has(e.target)) outputsOf[blockOf.get(e.source)!].add(e.target);
  }
  const anyIn = inputsOf.some((s) => s.size);
  const anyOut = outputsOf.some((s) => s.size);
  const isEntry = (i: number) => (anyIn ? inputsOf[i].size > 0 : prev[i].size === 0);
  const isExit = (i: number) => (anyOut ? outputsOf[i].size > 0 : next[i].size === 0);
  // every way from an entry to an exit in the DAG of blocks (bounded), then a greedy cover of the blocks they pass
  const ways: number[][] = [];
  let steps = 0;
  const walk = (path: number[]) => {
    if (ways.length >= 2000 || ++steps > 50_000) return;
    const last = path[path.length - 1];
    if (isExit(last)) ways.push(path);
    for (const j of next[last]) walk([...path, j]);
  };
  blocks.forEach((_, i) => isEntry(i) && walk([i]));
  const covered = new Set<number>();
  const chosen: number[][] = [];
  const onWay = new Set(ways.flat());
  while (chosen.length < limits.pathways) {
    let best: number[] | null = null;
    let gain = 0;
    for (const w of ways) {
      const g2 = new Set(w.filter((b) => !covered.has(b))).size;
      if (g2 > gain || (g2 === gain && g2 > 0 && best && w.length > best.length)) (best = w), (gain = g2);
    }
    if (!best || gain === 0) break;
    chosen.push(best);
    best.forEach((b) => covered.add(b));
  }
  const pathways = chosen.map((w, i) => ({
    id: `W${i + 1}`,
    blocks: w.map((b) => blocks[b]),
    inputs: [...inputsOf[w[0]]].sort(),
    outputs: [...outputsOf[w[w.length - 1]]].sort(),
  }));

  return {
    roiUcs: order,
    connections: edges,
    components,
    motifs,
    pathways,
    truncated: { motifs: large.length > limits.large, pathways: [...onWay].some((b) => !covered.has(b)) },
  };
}

export function frgCandidatesFromHcd(hcd: Pick<HcdModel, "ucs" | "connections">): FrgCandidates {
  return findFrgCandidates(hcdCircuitGraph(hcd));
}

const kindRank = (k: MotifKind) => ["loop", "feedforward", "reciprocal", "pair"].indexOf(k);

/** A loop through all members, or (for three) a feedforward triangle; null for anything a set of pairs expresses. */
function classifySet(set: string[], has: (a: string, b: string) => boolean): { kind: MotifKind; ucs: string[] } | null {
  const [first, ...rest] = [...set].sort();
  for (const p of permutations(rest)) {
    const cyc = [first, ...p];
    if (cyc.every((x, i) => has(x, cyc[(i + 1) % cyc.length]))) return { kind: "loop", ucs: cyc };
  }
  if (set.length !== 3) return null;
  for (const [a, b, c] of permutations(set)) if (has(a, b) && has(b, c) && has(a, c)) return { kind: "feedforward", ucs: [a, b, c] };
  return null;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Tarjan's strongly connected components, in a stable order (by smallest member). */
function stronglyConnected(nodes: string[], out: Map<string, string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comps: string[][] = [];
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of out.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      comps.push(comp.sort());
    }
  };
  for (const v of nodes) if (!index.has(v)) visit(v);
  return comps.sort((a, b) => a[0].localeCompare(b[0]));
}

const SIGN_ARROW: Record<EdgeSign, string> = { excitatory: "→", inhibitory: "⊣", modulatory: "⇢", unknown: "→" };
const arrow = (e: MotifEdge) => `${e.source} ${SIGN_ARROW[e.sign]} ${e.target}`;
const block = (b: string[]) => (b.length > 1 ? `{${b.join(" ")}}` : b[0]);

/** The candidates as the FRG prompt shows them (Circuit IDs without `U.`). */
export function formatFrgCandidates(c: FrgCandidates, file: string): string {
  const large = c.motifs.filter((m) => m.ucs.length > 2);
  const pairs = c.motifs.filter((m) => m.ucs.length === 2);
  const lines = [
    `## Bottom-up candidates from the HCD`,
    ``,
    `Computed by the worker from the ROI-internal connections of connections.json (also in \`${file}\`, rewritten whenever the HCD changes). ` +
      `Arrows: → excitatory or unknown, ⊣ inhibitory, ⇢ modulatory (from the connection comments and the sender's transmitter).`,
    ``,
    `ROI-internal UCs: ${c.roiUcs.length}; connections among them: ${c.connections.length}; components: ${c.components.length}` +
      (c.components.length > 1 ? ` (${c.components.map((x) => `{${x.join(" ")}}`).join(", ")})` : ""),
    ``,
    `Pathways (ROI input → output; {…} is a loop):`,
    ...(c.pathways.length
      ? c.pathways.map((w) => `- ${w.id}: ${w.inputs.length ? `(in: ${w.inputs.join(" ")}) ` : ""}${w.blocks.map(block).join(" → ")}${w.outputs.length ? ` (out: ${w.outputs.join(" ")})` : ""}`)
      : ["- none"]),
    ...(c.truncated.pathways ? [`- …more ways exist; the list covers as many UCs as the limit allows`] : []),
    ``,
    `Motifs of 3-${MAX_MOTIF_UCS} UCs that pairs cannot express:`,
    ...(large.length ? large.map((m) => `- ${m.id} ${m.kind}: ${m.ucs.join(", ")} — ${m.edges.map(arrow).join("; ")}`) : ["- none"]),
    ...(c.truncated.motifs ? [`- …more exist (only the first ${large.length} are listed)`] : []),
    ``,
    `Pairs (one per connected pair of UCs):`,
    ...(pairs.length ? pairs.map((m) => `- ${m.id} ${m.kind}: ${m.edges.map(arrow).join("; ")}`) : ["- none"]),
  ];
  return lines.join("\n");
}
