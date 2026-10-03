// ---------------------------------------------------------------------------
// Review aids for a Canon pull request: deterministic checks beyond the conflict rules, both sides of every diff item
// for a side-by-side view, and the graph of the circuits the PR touches. None of these decide anything: the conflicts
// of `diffCanon` stay the only thing that blocks approval, and the owner approves.
// Items are referred to as `<kind>:<key>` (kind: circuit / group / connection / reference / bif).
// ---------------------------------------------------------------------------

import type { EdgeSign } from "./types.js";
import { classifyEdgeSign } from "./graph.js";
import {
  currentCanonSnapshot,
  type CanonChange,
  type CanonCircuit,
  type CanonConflict,
  type CanonConnection,
  type CanonDiff,
  type CanonDiffItem,
  type CanonIncoming,
  type CanonSnapshot,
} from "./canonMerge.js";
import { CIRCUIT_ID_RE, checkUcNaming, parseUcDescriptor } from "./ucNaming.js";

export type ReviewItemKind = CanonDiffItem["kind"];
export const reviewItemId = (kind: ReviewItemKind, key: string) => `${kind}:${key}`;
export function parseReviewItemId(id: string): { kind: ReviewItemKind; key: string } | null {
  const i = id.indexOf(":");
  const kind = id.slice(0, i) as ReviewItemKind;
  return i > 0 && ["circuit", "group", "connection", "reference", "bif"].includes(kind) ? { kind, key: id.slice(i + 1) } : null;
}

export type ReviewGroup = "ids" | "duplicates" | "edges" | "evidence" | "provenance";
export const REVIEW_GROUPS: readonly ReviewGroup[] = ["ids", "duplicates", "edges", "evidence", "provenance"];
export type ReviewSeverity = "error" | "warning" | "info";

export type ReviewCode =
  | "desc-syntax"
  | "cid-chars"
  | "cid-form"
  | "skipped"
  | "same-name"
  | "same-anchor"
  | "end-undefined"
  | "reverse"
  | "sign"
  | "ref-missing"
  | "ref-undefined"
  | "pointer-missing"
  | "quote-unchecked"
  | "ref-unchecked"
  | "base-behind"
  | "source-newer"
  | "source-gone"
  | "impact"
  | "dropped"
  | CanonConflict["code"];

export interface ReviewCheck {
  /** `<code>:<item>[:<extra>]`, stable for one PR and diff */
  id: string;
  group: ReviewGroup;
  code: ReviewCode;
  severity: ReviewSeverity;
  /** Code of WBAI's BRA Error code List (Master), or a local `cobrac:` code; null when neither applies */
  master: string | null;
  /** The diff item it is about (`<kind>:<key>`); null for checks about the PR as a whole */
  item: string | null;
  /** Other items worth opening with it (the existing entry it clashes with, a reverse connection, …) */
  related: string[];
  canon?: string;
  incoming?: string;
  /** Technical detail as the validator states it (English) */
  detail?: string;
  /** The conflict of `diffCanon` it shows (choices are made on that conflict) */
  conflictId?: string;
}

/** Where the PR comes from, as the API finds it now. */
export interface ReviewProvenance {
  sourceKind: "project" | "canon";
  sourceId: string;
  sourceRevision: number;
  /** The source's revision now (project revision / sending Canon's head); null when unknown */
  sourceCurrentRevision: number | null;
  /** false: the project was deleted or left this Canon, or the sending Canon was deleted */
  sourceAvailable: boolean;
  headRevision: number;
}

export interface ReviewReport {
  checks: ReviewCheck[];
  counts: Record<ReviewGroup, Record<ReviewSeverity, number>>;
}

const CONFLICT_MAP: Record<CanonConflict["code"], { group: ReviewGroup; master: string | null }> = {
  C1: { group: "duplicates", master: "cobrac:canon-status" },
  C2b: { group: "duplicates", master: "cobrac:canon-decomposition" },
  C2c: { group: "duplicates", master: "cobrac:canon-decomposition" },
  C3: { group: "duplicates", master: "cobrac:canon-hierarchy" },
  C4: { group: "ids", master: "103" },
  C5: { group: "edges", master: "203" },
  C6: { group: "duplicates", master: "cobrac:canon-name" },
  C7: { group: "duplicates", master: "cobrac:canon-props" },
  C8: { group: "evidence", master: "cobrac:ref-id-unique" },
  C8b: { group: "evidence", master: "3" },
  C8c: { group: "evidence", master: "cobrac:ref-check" },
  C9b: { group: "edges", master: "cobrac:canon-connection" },
  C9c: { group: "evidence", master: "273" },
  C12: { group: "duplicates", master: "cobrac:canon-group" },
  C13: { group: "duplicates", master: null },
};

const officialName = (names: string) => names.split(";")[0].trim().toLowerCase();
const headOf = (key: string) => key.split("/")[0];
const connId = (key: string) => reviewItemId("connection", key);
const circId = (key: string) => reviewItemId("circuit", key);
const QUOTE_OK = new Set(["verified_fulltext", "verified_abstract"]);
const REF_OK = new Set(["verified"]);
const SIGNED = new Set<EdgeSign>(["excitatory", "inhibitory"]);
const MAX_RELATED = 8;

/**
 * Deterministic checks of a PR (design note "Canon の PR 審査画面" §3). `stored` is the Canon at the diff's base
 * revision. Conflicts of the diff are included as checks (with their conflict ID); the rest never block approval.
 */
export function canonReviewChecks(stored: CanonSnapshot, incoming: CanonIncoming, diff: CanonDiff, provenance?: ReviewProvenance): ReviewReport {
  const base = currentCanonSnapshot(stored);
  const checks: ReviewCheck[] = [];
  const add = (c: Omit<ReviewCheck, "id" | "related"> & { related?: string[]; extra?: string }) => {
    const { extra, ...rest } = c;
    checks.push({ ...rest, related: c.related ?? [], id: [c.code, c.item ?? "pr", extra].filter((x) => x !== undefined && x !== "").join(":") });
  };
  const baseCircuits = new Map(base.circuits.map((c) => [c.key, c]));
  const inCircuits = new Map(incoming.circuits.map((c) => [c.key, c]));
  const changeOf = new Map(diff.items.map((i) => [reviewItemId(i.kind, i.key), i.change]));

  // conflicts of the diff
  for (const c of diff.conflicts) {
    const m = CONFLICT_MAP[c.code];
    const item = reviewItemId(c.kind, c.key);
    const related = c.code === "C3" && c.field ? [circId(c.field)] : [];
    const master = c.code === "C5" && c.field === "receiver" ? "cobrac:collection-end" : m.master;
    add({ group: m.group, code: c.code, severity: c.severity, master, item, related, canon: c.canon, incoming: c.incoming, conflictId: c.id, extra: c.field });
  }

  // IDs: descriptor syntax, Circuit ID characters and form
  for (const c of incoming.circuits) {
    const item = circId(c.key);
    const parsed = parseUcDescriptor(c.descriptor);
    if ("errors" in parsed) {
      add({ group: "ids", code: "desc-syntax", severity: "error", master: "cobrac:uc-descriptor", item, incoming: c.descriptor, detail: parsed.errors.join("; ") });
      continue;
    }
    if (!CIRCUIT_ID_RE.test(c.circuitId)) {
      add({ group: "ids", code: "cid-chars", severity: "error", master: "cobrac:circuit-id-chars", item, incoming: c.circuitId });
      continue;
    }
    const form = checkUcNaming([{ id: c.circuitId, descriptor: c.descriptor }]);
    if (form.length) add({ group: "ids", code: "cid-form", severity: "warning", master: "cobrac:circuit-id-form", item, incoming: `${c.circuitId} = ${c.descriptor}`, detail: form.map((e) => e.replace(/^uc\.json: /, "")).join(" ") });
  }
  for (const id of incoming.skipped) add({ group: "ids", code: "skipped", severity: "warning", master: "cobrac:uc-descriptor", item: null, incoming: id, extra: id });

  // possible duplicates under another descriptor, and existing entries on the same anchor
  const conflictKeys = new Set(diff.conflicts.flatMap((c) => [c.key, c.field ?? ""]));
  for (const i of diff.items) {
    if (i.kind !== "circuit" || i.change !== "added") continue;
    const c = inCircuits.get(i.key);
    if (!c) continue;
    const name = officialName(c.names);
    const twin = name ? base.circuits.find((b) => b.key !== c.key && officialName(b.names) === name) : undefined;
    if (twin) add({ group: "duplicates", code: "same-name", severity: "warning", master: "cobrac:canon-name", item: circId(c.key), related: [circId(twin.key)], canon: `${twin.circuitId} = ${twin.descriptor}`, incoming: `${c.circuitId} = ${c.descriptor}` });
    if (conflictKeys.has(c.key)) continue;
    const near = base.circuits.filter((b) => b.key !== c.key && b.key !== twin?.key && headOf(b.key) === headOf(c.key));
    if (near.length) {
      add({ group: "duplicates", code: "same-anchor", severity: "info", master: null, item: circId(c.key), related: near.slice(0, MAX_RELATED).map((b) => circId(b.key)), canon: near.map((b) => b.circuitId).join(", ") });
    }
  }

  // connections: undefined ends, reversed direction, sign
  const baseConns = new Map(base.connections.map((c) => [c.key, c]));
  const inConnKeys = new Set(incoming.connections.map((c) => c.key));
  const known = (k: string) => inCircuits.has(k) || baseCircuits.has(k) || k.startsWith("group:");
  const circuitOf = (k: string) => inCircuits.get(k) ?? baseCircuits.get(k) ?? null;
  const signChecked = new Set<string>();
  for (const c of incoming.connections) {
    const item = connId(c.key);
    if (!known(c.sender)) add({ group: "edges", code: "end-undefined", severity: "error", master: "202", item, incoming: c.senderCircuitId, extra: "sender" });
    if (!known(c.receiver)) add({ group: "edges", code: "end-undefined", severity: "error", master: "224", item, incoming: c.receiverCircuitId, extra: "receiver" });
    const reverseKey = `${c.receiver}|${c.sender}|${c.referenceId}`;
    const reverse = baseConns.get(reverseKey);
    if (reverse && c.sender !== c.receiver && !baseConns.has(c.key) && !inConnKeys.has(reverseKey)) {
      add({ group: "edges", code: "reverse", severity: "warning", master: null, item, related: [connId(reverse.key)], canon: `${reverse.senderCircuitId} → ${reverse.receiverCircuitId}`, incoming: `${c.senderCircuitId} → ${c.receiverCircuitId}` });
    }
    const pair = `${c.sender}|${c.receiver}`;
    if (!signChecked.has(pair)) {
      const others = base.connections.filter((b) => b.sender === c.sender && b.receiver === c.receiver);
      const mine = classifyEdgeSign({ comments: c.comment }, circuitOf(c.sender));
      const clash = SIGNED.has(mine) ? others.find((b) => {
        const s = classifyEdgeSign({ comments: b.comment }, baseCircuits.get(b.sender) ?? null);
        return SIGNED.has(s) && s !== mine;
      }) : undefined;
      if (clash) {
        signChecked.add(pair);
        add({ group: "edges", code: "sign", severity: "warning", master: null, item, related: [connId(clash.key)], canon: classifyEdgeSign({ comments: clash.comment }, baseCircuits.get(clash.sender) ?? null), incoming: mine });
      }
    }
  }

  // evidence of the connections and references the PR brings or changes
  const refKeys = new Set([...incoming.references.map((r) => r.key), ...base.references.map((r) => r.key)]);
  for (const c of incoming.connections) {
    const item = connId(c.key);
    if (!c.referenceId) add({ group: "evidence", code: "ref-missing", severity: "error", master: "252", item });
    else if (!refKeys.has(c.referenceId)) add({ group: "evidence", code: "ref-undefined", severity: "error", master: "253", item, incoming: c.referenceId });
    if (!c.pointersOnLiterature.trim() && !c.pointersOnFigure.trim()) add({ group: "evidence", code: "pointer-missing", severity: "error", master: "271", item });
    const change = changeOf.get(item);
    if (change !== "unchanged" && c.pointersOnLiterature.trim() && !QUOTE_OK.has(c.quoteCheck) && c.quoteCheck !== "not_found") {
      add({ group: "evidence", code: "quote-unchecked", severity: "info", master: null, item, incoming: c.quoteCheck || "—" });
    }
  }
  for (const r of incoming.references) {
    const item = reviewItemId("reference", r.key);
    if (changeOf.get(item) === "added" && !REF_OK.has(r.check) && !["mismatch", "not_found", "invalid"].includes(r.check)) {
      add({ group: "evidence", code: "ref-unchecked", severity: "info", master: null, item, incoming: r.check || "—" });
    }
  }

  // provenance
  if (provenance) {
    if (diff.baseRevision < provenance.headRevision) add({ group: "provenance", code: "base-behind", severity: "info", master: null, item: null, canon: `rev ${provenance.headRevision}`, incoming: `rev ${diff.baseRevision}` });
    if (!provenance.sourceAvailable) add({ group: "provenance", code: "source-gone", severity: "warning", master: null, item: null, incoming: provenance.sourceId });
    else if (provenance.sourceCurrentRevision !== null && provenance.sourceCurrentRevision > provenance.sourceRevision) {
      add({ group: "provenance", code: "source-newer", severity: "warning", master: null, item: null, canon: String(provenance.sourceRevision), incoming: String(provenance.sourceCurrentRevision) });
    }
  }
  for (const imp of diff.impacts) {
    add({ group: "provenance", code: "impact", severity: "warning", master: null, item: null, related: imp.keys.slice(0, MAX_RELATED).map((k) => (k.includes("|") ? connId(k) : circId(k))), incoming: imp.projectId, extra: imp.projectId });
  }
  for (const i of diff.items) if (i.change === "dropped") add({ group: "provenance", code: "dropped", severity: "info", master: null, item: reviewItemId(i.kind, i.key) });

  const unique = [...new Map(checks.map((c) => [c.id, c])).values()];
  const counts = Object.fromEntries(REVIEW_GROUPS.map((g) => [g, { error: 0, warning: 0, info: 0 }])) as ReviewReport["counts"];
  for (const c of unique) counts[c.group][c.severity]++;
  return { checks: unique, counts };
}

// --- both sides of each item ------------------------------------------------------

export interface ReviewEntry {
  canon: Record<string, string> | null;
  incoming: Record<string, string> | null;
}

const origin = (o: { projectId: string; projectRevision: number; pr: number; via?: string }) =>
  `${o.projectId} r${o.projectRevision}${o.pr ? ` · PR #${o.pr}` : ""}${o.via ? ` · via ${o.via}` : ""}`;

function circuitFields(c: CanonCircuit, label: (k: string) => string): Record<string, string> {
  return {
    circuitId: c.circuitId,
    descriptor: c.descriptor,
    names: c.names,
    status: c.status,
    subCircuits: c.subCircuits.map(label).join(", "),
    transmitter: c.transmitter,
    modulationType: c.modulationType,
    sourceOfId: c.sourceOfId,
    outputSemantics: c.outputSemantics,
    origin: origin(c.origin),
    sources: c.sources.join(", "),
    state: c.state,
  };
}

function connectionFields(c: CanonConnection): Record<string, string> {
  return {
    sender: c.senderCircuitId,
    receiver: c.receiverCircuitId,
    referenceId: c.referenceId,
    taxon: c.taxon,
    method: c.method,
    senderRelation: c.senderRelation,
    senderInLiterature: c.senderInLiterature,
    receiverRelation: c.receiverRelation,
    receiverInLiterature: c.receiverInLiterature,
    pointersOnLiterature: c.pointersOnLiterature,
    pointersOnFigure: c.pointersOnFigure,
    comment: c.comment,
    quoteCheck: c.quoteCheck,
    origin: origin(c.origin),
    sources: c.sources.join(", "),
    state: c.state,
  };
}

/** The Canon's and the incoming value of every diff item, field by field (strings, for display and the AI packet). */
export function reviewEntries(stored: CanonSnapshot, incoming: CanonIncoming, diff: CanonDiff): Record<string, ReviewEntry> {
  const base = currentCanonSnapshot(stored);
  const labels = new Map<string, string>();
  for (const c of [...base.circuits, ...incoming.circuits]) labels.set(c.key, c.circuitId);
  for (const g of [...base.groups, ...incoming.groups]) labels.set(g.key, g.circuitId);
  const label = (k: string) => labels.get(k) ?? k;
  const index = <T extends { key: string }>(xs: T[]) => new Map(xs.map((x) => [x.key, x]));
  const b = { circuit: index(base.circuits), group: index(base.groups), connection: index(base.connections), reference: index(base.references), bif: index(base.bif) };
  const n = { circuit: index(incoming.circuits), group: index(incoming.groups), connection: index(incoming.connections), reference: index(incoming.references), bif: index(incoming.bif) };
  const fields = (kind: ReviewItemKind, x: unknown): Record<string, string> | null => {
    if (!x) return null;
    switch (kind) {
      case "circuit":
        return circuitFields(x as CanonCircuit, label);
      case "connection":
        return connectionFields(x as CanonConnection);
      case "group": {
        const g = x as CanonSnapshot["groups"][number];
        return { circuitId: g.circuitId, names: g.names, members: g.members.map(label).join(", "), origin: origin(g.origin), sources: g.sources.join(", "), state: g.state };
      }
      case "reference": {
        const r = x as CanonSnapshot["references"][number];
        return { doi: r.doi, pmid: r.pmid, title: r.title, journal: r.journal, literatureType: r.literatureType, alternativeUrl: r.alternativeUrl, check: r.check, origin: origin(r.origin), sources: r.sources.join(", "), state: r.state };
      }
      case "bif": {
        const f = x as CanonSnapshot["bif"][number];
        return { sender: f.sender, receiver: f.receiver, referenceId: f.referenceId, comment: f.comment, sources: f.sources.join(", ") };
      }
    }
  };
  const out: Record<string, ReviewEntry> = {};
  for (const i of diff.items) {
    out[reviewItemId(i.kind, i.key)] = { canon: fields(i.kind, b[i.kind].get(i.key)), incoming: i.change === "dropped" ? null : fields(i.kind, n[i.kind].get(i.key)) };
  }
  return out;
}

// --- graph of what the PR touches ---------------------------------------------------

export interface ReviewGraphNode {
  /** `circuit:<key>` */
  id: string;
  label: string;
  /** Status in the Canon now / after approval with the incoming definition (they differ on a C1 conflict) */
  canonStatus: "uniform" | "collection" | null;
  incomingStatus: "uniform" | "collection" | null;
  /** Diff change; "context" for Canon circuits the PR does not bring but connects to */
  change: CanonChange | "context";
  conflict: boolean;
}

export interface ReviewGraphEdge {
  /** `<sender key>|<receiver key>` */
  id: string;
  source: string;
  target: string;
  change: CanonChange | "context";
  inCanon: boolean;
  /** Connection items on this pair (one per paper) */
  items: string[];
  sign: EdgeSign;
  conflict: boolean;
}

export interface ReviewGraph {
  nodes: ReviewGraphNode[];
  edges: ReviewGraphEdge[];
  /** Nodes left out to keep the graph readable */
  omitted: number;
}

const CHANGE_RANK: Record<CanonChange, number> = { added: 3, changed: 2, dropped: 1, unchanged: 0 };
const MAX_GRAPH_NODES = 60;

/**
 * The circuits the PR brings, the Canon circuits its connections end on, and the Canon connections among them.
 * "After approval" is the Canon plus the PR: nothing is removed from a Canon, dropped items only leave the project.
 */
export function reviewGraph(stored: CanonSnapshot, incoming: CanonIncoming, diff: CanonDiff): ReviewGraph {
  const base = currentCanonSnapshot(stored);
  const baseCircuits = new Map(base.circuits.map((c) => [c.key, c]));
  const inCircuits = new Map(incoming.circuits.map((c) => [c.key, c]));
  const change = new Map(diff.items.map((i) => [reviewItemId(i.kind, i.key), i.change]));
  const conflicted = new Set(diff.conflicts.flatMap((c) => [reviewItemId(c.kind, c.key), ...(c.code === "C3" && c.field ? [circId(c.field)] : [])]));
  const droppedConns = base.connections.filter((c) => change.get(connId(c.key)) === "dropped");

  const keys = new Set<string>(incoming.circuits.map((c) => c.key));
  for (const c of [...incoming.connections, ...droppedConns]) keys.add(c.sender).add(c.receiver);
  for (const i of diff.items) if (i.kind === "circuit" && i.change === "dropped") keys.add(i.key);
  // Canon neighbours of what changes, so the reviewer sees what a changed definition is wired to
  const touched = new Set(incoming.circuits.filter((c) => conflicted.has(circId(c.key)) || ["added", "changed"].includes(change.get(circId(c.key)) ?? "")).map((c) => c.key));
  for (const c of base.connections) {
    if (touched.has(c.sender)) keys.add(c.receiver);
    if (touched.has(c.receiver)) keys.add(c.sender);
  }
  const nodeOf = (k: string): ReviewGraphNode | null => {
    const b = baseCircuits.get(k);
    const n = inCircuits.get(k);
    if (!b && !n) return null;
    return {
      id: circId(k),
      label: (n ?? b)!.circuitId,
      canonStatus: b?.status ?? null,
      incomingStatus: n?.status ?? b?.status ?? null,
      change: change.get(circId(k)) ?? "context",
      conflict: conflicted.has(circId(k)),
    };
  };
  let nodes = [...keys].map(nodeOf).filter((x): x is ReviewGraphNode => !!x);
  let omitted = 0;
  if (nodes.length > MAX_GRAPH_NODES) {
    const keep = nodes.filter((x) => x.conflict || x.change === "added" || x.change === "changed" || x.change === "dropped").slice(0, MAX_GRAPH_NODES);
    omitted = nodes.length - keep.length;
    nodes = keep;
  }
  const shown = new Set(nodes.map((x) => x.id.slice("circuit:".length)));

  const pairs = new Map<string, ReviewGraphEdge & { rank: number }>();
  const touch = (c: CanonConnection, ch: CanonChange | "context", fromCanon: boolean) => {
    if (!shown.has(c.sender) || !shown.has(c.receiver)) return;
    const id = `${c.sender}|${c.receiver}`;
    const rank = ch === "context" ? -1 : CHANGE_RANK[ch];
    const e = pairs.get(id) ?? {
      id,
      source: circId(c.sender),
      target: circId(c.receiver),
      change: ch,
      inCanon: false,
      items: [],
      sign: classifyEdgeSign({ comments: c.comment }, (inCircuits.get(c.sender) ?? baseCircuits.get(c.sender)) ?? null),
      conflict: false,
      rank,
    };
    if (fromCanon) e.inCanon = true;
    if (!e.items.includes(connId(c.key))) e.items.push(connId(c.key));
    if (conflicted.has(connId(c.key))) e.conflict = true;
    if (rank > e.rank) {
      e.rank = rank;
      e.change = ch;
    }
    pairs.set(id, e);
  };
  for (const c of incoming.connections) touch(c, change.get(connId(c.key)) ?? "unchanged", false);
  for (const c of base.connections) touch(c, change.get(connId(c.key)) ?? "context", true);
  // a pair is "added" only when the Canon has no connection on it at all
  const edges = [...pairs.values()].map(({ rank: _rank, ...e }) => (e.change === "added" && e.inCanon ? { ...e, change: "changed" as const } : e));
  return { nodes, edges, omitted };
}
