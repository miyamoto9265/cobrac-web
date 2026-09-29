import type { FrgGraph } from "@cobrac/shared";

export interface SearchableNode {
  id: string;
  label: string;
  sublabel?: string;
  /** extra text that should match (names, descriptor, …) */
  search?: string;
}

/**
 * Rank nodes for the search box: exact label, label prefix, label substring, then any other text.
 * Ties keep the graph order so results are stable while typing.
 */
export function searchNodes<T extends SearchableNode>(nodes: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { n: T; score: number; i: number }[] = [];
  nodes.forEach((n, i) => {
    const label = n.label.toLowerCase();
    let score = -1;
    if (label === q) score = 0;
    else if (label.startsWith(q) || label.replace(/^[ur]\./, "").startsWith(q)) score = 1;
    else if (label.includes(q)) score = 2;
    else if (`${n.sublabel ?? ""} ${n.search ?? ""}`.toLowerCase().includes(q)) score = 3;
    if (score >= 0) scored.push({ n, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.n);
}

export interface EdgeRef {
  id: string;
  source: string;
  target: string;
}

/** The node, its direct predecessors / successors, and the edges between them. */
export function neighborhood(edges: EdgeRef[], id: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set([id]);
  const es = new Set<string>();
  for (const e of edges) {
    if (e.source === id || e.target === id) {
      nodes.add(e.source);
      nodes.add(e.target);
      es.add(e.id);
    }
  }
  return { nodes, edges: es };
}

/** All ancestors and descendants of a node in a directed hierarchy (FRG), with the edges on those paths. */
export function lineage(edges: EdgeRef[], id: string): { nodes: Set<string>; edges: Set<string> } {
  const down = new Map<string, EdgeRef[]>();
  const up = new Map<string, EdgeRef[]>();
  for (const e of edges) {
    if (!down.has(e.source)) down.set(e.source, []);
    if (!up.has(e.target)) up.set(e.target, []);
    down.get(e.source)!.push(e);
    up.get(e.target)!.push(e);
  }
  const nodes = new Set([id]);
  const es = new Set<string>();
  const walk = (start: string, next: Map<string, EdgeRef[]>, pick: (e: EdgeRef) => string) => {
    const stack = [start];
    const seen = new Set([start]);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of next.get(cur) ?? []) {
        es.add(e.id);
        const n = pick(e);
        nodes.add(n);
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
  };
  walk(id, up, (e) => e.source);
  walk(id, down, (e) => e.target);
  return { nodes, edges: es };
}

/** FRG node id of an HCD circuit (only UCs inside the ROI appear in the FRG). */
export function frgIdForCircuit(frg: Pick<FrgGraph, "nodes"> | null | undefined, circuitId: string): string | null {
  if (!frg) return null;
  const n = frg.nodes.find((x) => x.kind === "uc" && (x.circuitId === circuitId || x.id === `U.${circuitId}`));
  return n?.id ?? null;
}

/** GN / TLF nodes that list the circuit's UC as a direct subnode. */
export function parentGroupsOfCircuit(frg: Pick<FrgGraph, "nodes"> | null | undefined, circuitId: string): string[] {
  const id = frgIdForCircuit(frg, circuitId);
  if (!frg || !id) return [];
  return frg.nodes.find((n) => n.id === id)?.parents ?? [];
}

/** Circuit ids of every UC below a GN / TLF (for highlighting a function group on the HCD). */
export function circuitsUnderGroup(frg: Pick<FrgGraph, "nodes"> | null | undefined, groupId: string): string[] {
  if (!frg) return [];
  const byId = new Map(frg.nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = [groupId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (!n) continue;
    if (n.kind === "uc") {
      out.add(n.circuitId ?? n.id.replace(/^U\./, ""));
      continue;
    }
    stack.push(...n.subnodes);
  }
  return [...out];
}

/** First-parent chain from a root (TLF) down to the node, for a breadcrumb. */
export function pathFromRoot(frg: Pick<FrgGraph, "nodes"> | null | undefined, id: string): string[] {
  if (!frg) return [];
  const byId = new Map(frg.nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    path.unshift(cur);
    cur = byId.get(cur)!.parents[0];
  }
  return path;
}
