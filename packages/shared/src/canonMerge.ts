// ---------------------------------------------------------------------------
// Canon snapshots, push diffs, conflict rules and merging (Canon MVP stage 2).
// A snapshot has a shared layer (one value per Canon: circuits, groupings, connections, BIF, references) and a role
// layer (per project: ROI side, Interface, function items, FRG). Conflicts are judged on the shared layer only.
// Rule codes follow the design document: C1 status, C2 decomposition, C3 hierarchy, C4 ID ↔ descriptor, C5 connection
// ends, C6 official name, C7 properties, C8 references, C9 connections, C12 groupings, C13 Output Semantics.
// ---------------------------------------------------------------------------

import { checkHcd, type HcdModel } from "./harness.js";
import { normalizeUcDescriptor, parseUcDescriptor } from "./ucNaming.js";

export type CanonCircuitStatus = "uniform" | "collection";
export type CanonEntryState = "valid" | "flagged" | "invalidated";

export interface CanonOrigin {
  projectId: string;
  projectRevision: number;
  /** PR that brought the entry in (0 = not yet merged) */
  pr: number;
  /** Set when the entry came through another Canon: `<canonId>@<revision>` (the Canon → Canon edge of uc_adoption) */
  via?: string;
}

export interface CanonCircuit {
  descriptor: string;
  /** Key: normalized UC Descriptor */
  key: string;
  circuitId: string;
  names: string;
  status: CanonCircuitStatus;
  /** Keys of the members (circuit keys, or `group:<id>` for groupings) */
  subCircuits: string[];
  transmitter: string;
  modulationType: string;
  sourceOfId: string;
  outputSemantics: string;
  origin: CanonOrigin;
  /** Every project that pushed this entry */
  sources: string[];
  state: CanonEntryState;
}

/** A Collection that groups several units and has no descriptor (e.g. a named loop). Key `group:<Circuit ID>`. */
export interface CanonGroup {
  key: string;
  circuitId: string;
  names: string;
  members: string[];
  origin: CanonOrigin;
  sources: string[];
  state: CanonEntryState;
}

export interface CanonConnection {
  /** `<sender key>|<receiver key>|<Reference ID>` */
  key: string;
  sender: string;
  receiver: string;
  senderCircuitId: string;
  receiverCircuitId: string;
  referenceId: string;
  taxon: string;
  method: string;
  pointersOnLiterature: string;
  pointersOnFigure: string;
  senderRelation: string;
  senderInLiterature: string;
  receiverRelation: string;
  receiverInLiterature: string;
  comment: string;
  /** Status from quote_check.json ("" when the quote was not checked) */
  quoteCheck: string;
  origin: CanonOrigin;
  sources: string[];
  state: CanonEntryState;
}

export interface CanonBif {
  key: string;
  sender: string;
  receiver: string;
  referenceId: string;
  comment: string;
  sources: string[];
}

export interface CanonReference {
  /** Reference ID */
  key: string;
  doi: string;
  pmid: string;
  title: string;
  journal: string;
  literatureType: string;
  alternativeUrl: string;
  /** Status from reference_check.json ("" when not checked) */
  check: string;
  origin: CanonOrigin;
  sources: string[];
  state: CanonEntryState;
}

export interface CanonUcRole {
  key: string;
  circuitId: string;
  roi: string;
  interface: string;
  outputSemantics: string;
  requirement: string;
  reqRealization: string;
  capability: string;
  mechanism: string;
  implementation: string;
  comments: string;
}

export interface CanonProjectRoles {
  projectId: string;
  projectRevision: number;
  roi: string;
  tlf: string;
  ucRoles: CanonUcRole[];
  /** frg.json as the project wrote it (null when absent) */
  frg: unknown;
}

export interface CanonContent {
  circuits: CanonCircuit[];
  groups: CanonGroup[];
  connections: CanonConnection[];
  bif: CanonBif[];
  references: CanonReference[];
  roles: CanonProjectRoles[];
}

export interface CanonSnapshot extends CanonContent {
  canonId: string;
  revision: number;
  createdAt: string;
}

/** What a project (or another Canon) brings to a Canon (same shape; origins carry pr = 0 until merged). */
export interface CanonIncoming extends CanonContent {
  /** The pushing project, or the sending Canon's ID for a Canon → Canon pull request */
  projectId: string;
  projectRevision: number;
  /** Circuits the converter had to leave out (no UC Descriptor, unknown members) */
  skipped: string[];
}

export function emptyCanonSnapshot(canonId: string, createdAt: string): CanonSnapshot {
  return { canonId, revision: 0, createdAt, circuits: [], groups: [], connections: [], bif: [], references: [], roles: [] };
}

// --- project → Canon ----------------------------------------------------------

export interface ProjectCanonFiles {
  uc: string | null;
  connections: string | null;
  references: string | null;
  frg?: string | null;
  meta?: string | null;
  referenceCheck?: string | null;
  quoteCheck?: string | null;
}

const officialName = (names: string) => names.split(";")[0].trim();
const connKey = (s: string, r: string, ref: string) => `${s}|${r}|${ref}`;
/** Reference IDs are usually written `[Author, Year]` already; bracket only the others in labels. */
const refLabel = (ref: string) => (ref.startsWith("[") ? ref : `[${ref}]`);
const bifKey = (s: string, r: string, ref: string) => `${s.trim().toLowerCase()}|${r.trim().toLowerCase()}|${ref}`;

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Converts a project's HCD / FRG files into Canon form: circuits keyed by their UC Descriptor, connections by
 * (sender, receiver, paper). UCs without a descriptor cannot be matched across projects and are skipped (listed).
 */
export function canonFromProject(projectId: string, projectRevision: number, files: ProjectCanonFiles): CanonIncoming {
  const r = checkHcd({ uc: files.uc, connections: files.connections, references: files.references, meta: files.meta });
  const model: HcdModel = r.model ?? { meta: null, refs: [], ucs: [], collections: [], bif: [], connections: [] };
  const origin: CanonOrigin = { projectId, projectRevision, pr: 0 };
  const skipped: string[] = [];

  const idToKey = new Map<string, string>();
  for (const u of model.ucs) if (u.descriptor) idToKey.set(u.id, normalizeUcDescriptor(u.descriptor));
  for (const c of model.collections) idToKey.set(c.id, c.descriptor ? normalizeUcDescriptor(c.descriptor) : `group:${c.id}`);

  const circuits: CanonCircuit[] = [];
  for (const u of model.ucs) {
    if (!u.descriptor) {
      skipped.push(u.id);
      continue;
    }
    circuits.push({
      descriptor: u.descriptor,
      key: normalizeUcDescriptor(u.descriptor),
      circuitId: u.id,
      names: u.names,
      status: "uniform",
      subCircuits: [],
      transmitter: u.transmitter,
      modulationType: u.modulationType,
      sourceOfId: u.sourceOfId,
      outputSemantics: u.outputSemantics,
      origin,
      sources: [projectId],
      state: "valid",
    });
  }
  const groups: CanonGroup[] = [];
  for (const c of model.collections) {
    const members = c.subCircuits.map((m) => idToKey.get(m)).filter((k): k is string => !!k);
    if (members.length < c.subCircuits.length) skipped.push(...c.subCircuits.filter((m) => !idToKey.has(m)));
    if (c.descriptor) {
      circuits.push({
        descriptor: c.descriptor,
        key: normalizeUcDescriptor(c.descriptor),
        circuitId: c.id,
        names: c.names,
        status: "collection",
        subCircuits: [...new Set(members)].sort(),
        transmitter: "",
        modulationType: "",
        sourceOfId: c.sourceOfId,
        outputSemantics: "",
        origin,
        sources: [projectId],
        state: "valid",
      });
    } else {
      groups.push({ key: `group:${c.id}`, circuitId: c.id, names: c.names, members: [...new Set(members)].sort(), origin, sources: [projectId], state: "valid" });
    }
  }

  const quotes = (parseJson(files.quoteCheck) as { quotes?: { sender: string; receiver: string; referenceIds: string[]; status: string }[] } | null)?.quotes ?? [];
  const quoteOf = (s: string, rcv: string, ref: string) => quotes.find((q) => q.sender === s && q.receiver === rcv && q.referenceIds.includes(ref))?.status ?? "";
  const connections: CanonConnection[] = [];
  for (const c of model.connections) {
    const s = idToKey.get(c.sender);
    const rcv = idToKey.get(c.receiver);
    if (!s || !rcv) continue;
    for (const ref of c.referenceIds.length ? c.referenceIds : [""]) {
      connections.push({
        key: connKey(s, rcv, ref),
        sender: s,
        receiver: rcv,
        senderCircuitId: c.sender,
        receiverCircuitId: c.receiver,
        referenceId: ref,
        taxon: c.taxon,
        method: c.method,
        pointersOnLiterature: c.pointersOnLiterature,
        pointersOnFigure: c.pointersOnFigure,
        senderRelation: c.senderRelation,
        senderInLiterature: c.senderInLiterature,
        receiverRelation: c.receiverRelation,
        receiverInLiterature: c.receiverInLiterature,
        comment: c.comment,
        quoteCheck: quoteOf(c.sender, c.receiver, ref),
        origin,
        sources: [projectId],
        state: "valid",
      });
    }
  }
  const bif: CanonBif[] = model.bif.flatMap((b) =>
    (b.referenceIds.length ? b.referenceIds : [""]).map((ref) => ({ key: bifKey(b.sender, b.receiver, ref), sender: b.sender, receiver: b.receiver, referenceId: ref, comment: b.comment, sources: [projectId] })),
  );

  const checks = (parseJson(files.referenceCheck) as { references?: { id: string; status: string }[] } | null)?.references ?? [];
  const references: CanonReference[] = model.refs.map((x) => ({
    key: x.id,
    doi: x.doi ?? "",
    pmid: x.pmid ?? "",
    title: x.title ?? "",
    journal: x.journal ?? "",
    literatureType: x.literatureType ?? "",
    alternativeUrl: x.alternativeUrl ?? "",
    check: checks.find((k) => k.id === x.id)?.status ?? "",
    origin,
    sources: [projectId],
    state: "valid",
  }));

  const ucRoles: CanonUcRole[] = model.ucs
    .filter((u) => u.descriptor)
    .map((u) => ({
      key: normalizeUcDescriptor(u.descriptor),
      circuitId: u.id,
      roi: u.roi,
      interface: u.interfaceText,
      outputSemantics: u.outputSemantics,
      requirement: u.requirement,
      reqRealization: u.reqRealization,
      capability: u.capability,
      mechanism: u.mechanism,
      implementation: u.implementation,
      comments: u.comments,
    }));
  const meta = model.meta;
  const roles: CanonProjectRoles[] = [{ projectId, projectRevision, roi: meta?.roi ?? "", tlf: meta?.tlf ?? "", ucRoles, frg: parseJson(files.frg) }];

  return { projectId, projectRevision, circuits, groups, connections, bif, references, roles, skipped: [...new Set(skipped)] };
}

/**
 * What a Canon brings to another Canon: its head revision as it is. Entries keep their original project origin and
 * record the sending Canon in `via`; the role layer carries every member project of the sender.
 */
export function canonFromCanon(snapshot: CanonSnapshot): CanonIncoming {
  const via = `${snapshot.canonId}@${snapshot.revision}`;
  const tag = <T extends { origin: CanonOrigin; sources: string[] }>(x: T): T => ({ ...clone(x), origin: { ...x.origin, pr: 0, via }, sources: [snapshot.canonId] });
  return {
    projectId: snapshot.canonId,
    projectRevision: snapshot.revision,
    circuits: snapshot.circuits.map(tag),
    groups: snapshot.groups.map(tag),
    connections: snapshot.connections.map(tag),
    bif: snapshot.bif.map((b) => ({ ...clone(b), sources: [snapshot.canonId] })),
    references: snapshot.references.map(tag),
    roles: clone(snapshot.roles),
    skipped: [],
  };
}

// --- diff and conflicts ---------------------------------------------------------

export type CanonConflictSeverity = "error" | "warning" | "info";
export type CanonConflictCode = "C1" | "C2b" | "C2c" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C8b" | "C8c" | "C9b" | "C9c" | "C12" | "C13";

export interface CanonConflict {
  /** Stable within one diff: `<code>:<kind>:<key>[:<field>]`; approvals refer to it */
  id: string;
  code: CanonConflictCode;
  severity: CanonConflictSeverity;
  kind: "circuit" | "group" | "connection" | "reference";
  key: string;
  field?: string;
  canon?: string;
  incoming?: string;
  /** A warning the reviewer settles by picking a value (otherwise acknowledging it is enough) */
  choosable: boolean;
  /**
   * An error the reviewer may resolve by adopting the incoming value (C1 status, C2c decomposition): the Canon changes
   * and other projects that use the circuit become "needs update" (design Q10). Other errors cannot be overridden.
   */
  resolvable?: boolean;
}

export type CanonChange = "added" | "changed" | "unchanged" | "dropped";

export interface CanonDiffItem {
  kind: "circuit" | "group" | "connection" | "reference" | "bif";
  key: string;
  label: string;
  change: CanonChange;
  fields?: { field: string; from: string; to: string }[];
}

export interface CanonImpact {
  projectId: string;
  keys: string[];
}

export interface CanonDiff {
  baseRevision: number;
  items: CanonDiffItem[];
  conflicts: CanonConflict[];
  impacts: CanonImpact[];
  skipped: string[];
  summary: { added: number; changed: number; unchanged: number; dropped: number; errors: number; warnings: number; infos: number };
}

export type CanonChoice = "canon" | "incoming";

interface Facets {
  head: string;
  values: Set<string>;
}

function facetsOf(descriptor: string): Facets | null {
  const r = parseUcDescriptor(descriptor);
  if ("errors" in r) return null;
  const [head] = normalizeUcDescriptor(descriptor).split("/");
  return { head, values: new Set(r.descriptor.facets.flatMap((f) => f.values.map((v) => `${f.axis}:${v}`.toLowerCase()))) };
}

/** b is finer than a: same anchors (and side) and a strict superset of a's facet values. */
function isFiner(b: Facets, a: Facets): boolean {
  return b.head === a.head && b.values.size > a.values.size && [...a.values].every((v) => b.values.has(v));
}

const CIRCUIT_PROPS = ["transmitter", "modulationType", "sourceOfId"] as const;
const CONNECTION_PROPS = ["taxon", "method", "senderRelation", "senderInLiterature", "receiverRelation", "receiverInLiterature", "pointersOnLiterature"] as const;
const QUOTE_FAILED = new Set(["not_found"]);
const REF_FAILED = new Set(["mismatch", "not_found", "invalid"]);

const conflict = (c: Omit<CanonConflict, "id" | "choosable"> & { choosable?: boolean }): CanonConflict => ({
  ...c,
  id: [c.code, c.kind, c.key, c.field].filter(Boolean).join(":"),
  choosable: c.choosable ?? false,
});

/** Compares what a project brings with the Canon at `base`, and lists the conflicts (design §4.3). */
export function diffCanon(base: CanonSnapshot, incoming: CanonIncoming): CanonDiff {
  const items: CanonDiffItem[] = [];
  const conflicts: CanonConflict[] = [];
  const src = incoming.projectId;
  const baseCircuits = new Map(base.circuits.map((c) => [c.key, c]));
  const inCircuits = new Map(incoming.circuits.map((c) => [c.key, c]));

  for (const c of incoming.circuits) {
    const b = baseCircuits.get(c.key);
    if (!b) {
      items.push({ kind: "circuit", key: c.key, label: c.circuitId, change: "added" });
      const clash = base.circuits.find((x) => x.circuitId === c.circuitId && x.key !== c.key);
      if (clash) conflicts.push(conflict({ code: "C4", severity: "error", kind: "circuit", key: c.key, field: "circuitId", canon: clash.descriptor, incoming: c.descriptor }));
      continue;
    }
    const fields: { field: string; from: string; to: string }[] = [];
    if (b.status !== c.status) {
      fields.push({ field: "status", from: b.status, to: c.status });
      conflicts.push(conflict({ code: "C1", severity: "error", kind: "circuit", key: c.key, field: "status", canon: b.status, incoming: c.status, resolvable: true }));
    } else if (c.status === "collection") {
      const have = new Set(b.subCircuits);
      const want = new Set(c.subCircuits);
      const subset = [...want].every((k) => have.has(k));
      const superset = [...have].every((k) => want.has(k));
      if (!subset && superset) {
        fields.push({ field: "subCircuits", from: b.subCircuits.join(", "), to: c.subCircuits.join(", ") });
        conflicts.push(conflict({ code: "C2b", severity: "warning", kind: "circuit", key: c.key, field: "subCircuits", canon: b.subCircuits.join(", "), incoming: c.subCircuits.join(", ") }));
      } else if (!subset && !superset) {
        fields.push({ field: "subCircuits", from: b.subCircuits.join(", "), to: c.subCircuits.join(", ") });
        conflicts.push(conflict({ code: "C2c", severity: "error", kind: "circuit", key: c.key, field: "subCircuits", canon: b.subCircuits.join(", "), incoming: c.subCircuits.join(", "), resolvable: true }));
      }
    }
    if (b.circuitId !== c.circuitId) {
      fields.push({ field: "circuitId", from: b.circuitId, to: c.circuitId });
      conflicts.push(conflict({ code: "C4", severity: "error", kind: "circuit", key: c.key, field: "circuitId", canon: b.circuitId, incoming: c.circuitId }));
    }
    if (officialName(b.names) && officialName(c.names) && officialName(b.names) !== officialName(c.names)) {
      fields.push({ field: "names", from: b.names, to: c.names });
      conflicts.push(conflict({ code: "C6", severity: "error", kind: "circuit", key: c.key, field: "names", canon: officialName(b.names), incoming: officialName(c.names) }));
    }
    // with a status conflict the properties follow the status (Source of ID `collection`, no transmitter)
    for (const f of b.status === c.status ? CIRCUIT_PROPS : []) {
      if (b[f] !== c[f] && c[f]) {
        fields.push({ field: f, from: b[f], to: c[f] });
        conflicts.push(conflict({ code: "C7", severity: "warning", kind: "circuit", key: c.key, field: f, canon: b[f], incoming: c[f], choosable: true }));
      }
    }
    if (c.outputSemantics && b.outputSemantics && b.outputSemantics !== c.outputSemantics) {
      conflicts.push(conflict({ code: "C13", severity: "info", kind: "circuit", key: c.key, field: "outputSemantics", canon: b.outputSemantics, incoming: c.outputSemantics, choosable: true }));
    }
    items.push({ kind: "circuit", key: c.key, label: c.circuitId, change: fields.length ? "changed" : "unchanged", ...(fields.length ? { fields } : {}) });
  }
  for (const b of base.circuits) {
    if (b.sources.includes(src) && !inCircuits.has(b.key)) items.push({ kind: "circuit", key: b.key, label: b.circuitId, change: "dropped" });
  }

  // C3: in the merged Canon no uniform circuit may have a finer circuit (finer ones belong under a Collection)
  const merged = new Map(baseCircuits);
  // incoming values stand in for the resolvable C1 / C2c: adopting them is the only way those can be approved
  for (const c of incoming.circuits) merged.set(c.key, c);
  const parsed = [...merged.values()].map((c) => ({ c, f: facetsOf(c.descriptor) })).filter((x): x is { c: CanonCircuit; f: Facets } => !!x.f);
  for (const u of parsed) {
    if (u.c.status !== "uniform") continue;
    for (const v of parsed) {
      if (v === u || !isFiner(v.f, u.f)) continue;
      const fromIncoming = inCircuits.has(u.c.key) || inCircuits.has(v.c.key);
      if (!fromIncoming) continue;
      conflicts.push(conflict({ code: "C3", severity: "error", kind: "circuit", key: u.c.key, field: v.c.key, canon: `${u.c.circuitId} uniform`, incoming: v.c.circuitId }));
    }
  }

  // C5: connection ends must be uniform in the merged Canon
  const statusOf = (k: string) => (inCircuits.get(k) ?? baseCircuits.get(k))?.status;
  const baseConns = new Map(base.connections.map((c) => [c.key, c]));
  const inConns = new Map(incoming.connections.map((c) => [c.key, c]));
  for (const c of incoming.connections) {
    for (const [end, k] of [
      ["sender", c.sender],
      ["receiver", c.receiver],
    ] as const) {
      if (statusOf(k) === "collection") conflicts.push(conflict({ code: "C5", severity: "error", kind: "connection", key: c.key, field: end, canon: "collection", incoming: end === "sender" ? c.senderCircuitId : c.receiverCircuitId }));
    }
    if (QUOTE_FAILED.has(c.quoteCheck)) conflicts.push(conflict({ code: "C9c", severity: "error", kind: "connection", key: c.key, field: "pointersOnLiterature", incoming: c.pointersOnLiterature }));
    const b = baseConns.get(c.key);
    const label = `${c.senderCircuitId} → ${c.receiverCircuitId} ${refLabel(c.referenceId)}`;
    if (!b) {
      items.push({ kind: "connection", key: c.key, label, change: "added" });
      continue;
    }
    const fields = CONNECTION_PROPS.filter((f) => b[f] !== c[f]).map((f) => ({ field: f, from: b[f], to: c[f] }));
    for (const f of fields) conflicts.push(conflict({ code: "C9b", severity: "warning", kind: "connection", key: c.key, field: f.field, canon: f.from, incoming: f.to, choosable: true }));
    items.push({ kind: "connection", key: c.key, label, change: fields.length ? "changed" : "unchanged", ...(fields.length ? { fields } : {}) });
  }
  for (const b of base.connections) {
    if (b.sources.includes(src) && !inConns.has(b.key)) items.push({ kind: "connection", key: b.key, label: `${b.senderCircuitId} → ${b.receiverCircuitId} ${refLabel(b.referenceId)}`, change: "dropped" });
  }
  // references
  const baseRefs = new Map(base.references.map((r) => [r.key, r]));
  for (const r of incoming.references) {
    if (REF_FAILED.has(r.check)) conflicts.push(conflict({ code: "C8c", severity: "error", kind: "reference", key: r.key, field: "check", incoming: r.check }));
    const b = baseRefs.get(r.key);
    if (!b) {
      const alias = base.references.find((x) => (r.doi && x.doi.toLowerCase() === r.doi.toLowerCase()) || (r.pmid && x.pmid === r.pmid));
      if (alias) conflicts.push(conflict({ code: "C8b", severity: "warning", kind: "reference", key: r.key, field: "id", canon: alias.key, incoming: r.key }));
      items.push({ kind: "reference", key: r.key, label: r.key, change: "added" });
      continue;
    }
    const idMismatch = (r.doi && b.doi && r.doi.toLowerCase() !== b.doi.toLowerCase()) || (r.pmid && b.pmid && r.pmid !== b.pmid);
    if (idMismatch) conflicts.push(conflict({ code: "C8", severity: "error", kind: "reference", key: r.key, field: "doi", canon: b.doi || b.pmid, incoming: r.doi || r.pmid }));
    items.push({ kind: "reference", key: r.key, label: r.key, change: idMismatch ? "changed" : "unchanged" });
  }

  // groupings
  const baseGroups = new Map(base.groups.map((g) => [g.key, g]));
  for (const g of incoming.groups) {
    const b = baseGroups.get(g.key);
    if (!b) {
      items.push({ kind: "group", key: g.key, label: g.circuitId, change: "added" });
      continue;
    }
    const same = b.members.length === g.members.length && b.members.every((m) => g.members.includes(m));
    if (!same) conflicts.push(conflict({ code: "C12", severity: "warning", kind: "group", key: g.key, field: "members", canon: b.members.join(", "), incoming: g.members.join(", "), choosable: true }));
    items.push({ kind: "group", key: g.key, label: g.circuitId, change: same ? "unchanged" : "changed" });
  }

  const baseBif = new Set(base.bif.map((b) => b.key));
  for (const b of incoming.bif) if (!baseBif.has(b.key)) items.push({ kind: "bif", key: b.key, label: `${b.sender} → ${b.receiver} ${refLabel(b.referenceId)}`, change: "added" });

  // impact: other projects that use circuits whose status, decomposition or ID this push changes, or whose
  // connections would end on a circuit that becomes a Collection
  const changedKeys = new Set(items.filter((i) => i.kind === "circuit" && i.change === "changed").map((i) => i.key));
  const nowCollection = new Set(incoming.circuits.filter((c) => c.status === "collection" && baseCircuits.get(c.key)?.status === "uniform").map((c) => c.key));
  const affected = new Map<string, Set<string>>();
  const add = (p: string, k: string) => p !== src && (affected.get(p) ?? affected.set(p, new Set()).get(p)!).add(k);
  const incomingProjects = new Set(incoming.roles.map((r) => r.projectId));
  for (const r of base.roles) if (!incomingProjects.has(r.projectId)) for (const u of r.ucRoles) if (changedKeys.has(u.key)) add(r.projectId, u.key);
  for (const c of base.connections) if (nowCollection.has(c.sender) || nowCollection.has(c.receiver)) for (const p of c.sources) add(p, c.key);
  const impacts: CanonImpact[] = [...affected].map(([projectId, keys]) => ({ projectId, keys: [...keys].sort() })).sort((a, b) => a.projectId.localeCompare(b.projectId));

  const unique = [...new Map(conflicts.map((c) => [c.id, c])).values()];
  const count = (ch: CanonChange) => items.filter((i) => i.change === ch).length;
  return {
    baseRevision: base.revision,
    items,
    conflicts: unique,
    impacts,
    skipped: incoming.skipped,
    summary: {
      added: count("added"),
      changed: count("changed"),
      unchanged: count("unchanged"),
      dropped: count("dropped"),
      errors: unique.filter((c) => c.severity === "error").length,
      warnings: unique.filter((c) => c.severity === "warning").length,
      infos: unique.filter((c) => c.severity === "info").length,
    },
  };
}

/**
 * What still blocks approval: errors that cannot be overridden, resolvable errors without the choice "incoming", and
 * warnings without a choice (choosable ones pick "canon" or "incoming"; the others are acknowledged with either).
 */
export function blockingConflicts(diff: CanonDiff, choices: Record<string, CanonChoice>): CanonConflict[] {
  return diff.conflicts.filter((c) => {
    if (c.severity === "error") return !(c.resolvable && choices[c.id] === "incoming");
    if (c.severity === "warning") return !choices[c.id];
    return false;
  });
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
/** Snapshots are plain JSON. */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function mergeNames(canon: string, incoming: string): string {
  const parts = (s: string) => s.split(";").map((x) => x.trim()).filter(Boolean);
  const a = parts(canon);
  const seen = new Set(a.map((x) => x.toLowerCase()));
  for (const x of parts(incoming)) if (!seen.has(x.toLowerCase())) a.push(x), seen.add(x.toLowerCase());
  return a.join("; ");
}

/**
 * The next revision: the Canon plus what the project brings. Callers must have checked that `diff` (computed against
 * `base`) has no errors and that every warning is settled. Existing values win unless the reviewer chose "incoming".
 */
export function mergeCanon(base: CanonSnapshot, incoming: CanonIncoming, diff: CanonDiff, choices: Record<string, CanonChoice>, pr: number, createdAt: string): CanonSnapshot {
  const pick = (id: string) => choices[id] === "incoming";
  const origin = (o: CanonOrigin): CanonOrigin => ({ ...o, pr });
  const src = incoming.projectId;

  const circuits = new Map(base.circuits.map((c) => [c.key, clone(c)]));
  for (const c of incoming.circuits) {
    const b = circuits.get(c.key);
    if (!b) {
      circuits.set(c.key, { ...clone(c), origin: origin(c.origin) });
      continue;
    }
    b.names = mergeNames(b.names, c.names);
    b.sources = union(b.sources, [src]);
    if (pick(`C1:circuit:${c.key}:status`)) {
      b.status = c.status;
      b.subCircuits = c.subCircuits;
      for (const f of CIRCUIT_PROPS) b[f] = c[f];
    } else if (pick(`C2c:circuit:${c.key}:subCircuits`)) b.subCircuits = c.subCircuits;
    else if (b.status === "collection" && c.status === "collection" && diff.conflicts.some((x) => x.id === `C2b:circuit:${c.key}:subCircuits`)) b.subCircuits = union(b.subCircuits, c.subCircuits).sort();
    for (const f of CIRCUIT_PROPS) if (pick(`C7:circuit:${c.key}:${f}`) || (!b[f] && c[f])) b[f] = c[f];
    if (pick(`C13:circuit:${c.key}:outputSemantics`) || (!b.outputSemantics && c.outputSemantics)) b.outputSemantics = c.outputSemantics;
  }

  const groups = new Map(base.groups.map((g) => [g.key, clone(g)]));
  for (const g of incoming.groups) {
    const b = groups.get(g.key);
    if (!b) groups.set(g.key, { ...clone(g), origin: origin(g.origin) });
    else {
      b.sources = union(b.sources, [src]);
      if (pick(`C12:group:${g.key}:members`)) b.members = g.members;
    }
  }

  const connections = new Map(base.connections.map((c) => [c.key, clone(c)]));
  for (const c of incoming.connections) {
    const b = connections.get(c.key);
    if (!b) connections.set(c.key, { ...clone(c), origin: origin(c.origin) });
    else {
      b.sources = union(b.sources, [src]);
      for (const f of CONNECTION_PROPS) {
        if (pick(`C9b:connection:${c.key}:${f}`)) {
          b[f] = c[f];
          if (f === "pointersOnLiterature") b.quoteCheck = c.quoteCheck;
        }
      }
    }
  }

  // connections now ending on a Collection need their projects' attention (BRA 203 / cobrac:collection-end); they stay, flagged
  for (const c of connections.values()) {
    if (circuits.get(c.sender)?.status === "collection" || circuits.get(c.receiver)?.status === "collection") c.state = "flagged";
  }

  const bif = new Map(base.bif.map((b) => [b.key, clone(b)]));
  for (const b of incoming.bif) {
    const x = bif.get(b.key);
    if (!x) bif.set(b.key, clone(b));
    else x.sources = union(x.sources, [src]);
  }

  const references = new Map(base.references.map((r) => [r.key, clone(r)]));
  for (const r of incoming.references) {
    const b = references.get(r.key);
    if (!b) references.set(r.key, { ...clone(r), origin: origin(r.origin) });
    else {
      b.sources = union(b.sources, [src]);
      for (const f of ["pmid", "title", "journal", "literatureType", "alternativeUrl", "check"] as const) if (!b[f] && r[f]) b[f] = r[f];
    }
  }

  const replaced = new Set(incoming.roles.map((r) => r.projectId));
  const roles = [...base.roles.filter((r) => !replaced.has(r.projectId)), ...incoming.roles].sort((a, b) => a.projectId.localeCompare(b.projectId));
  const byKey = <T extends { key: string }>(m: Map<string, T>) => [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  return {
    canonId: base.canonId,
    revision: base.revision + 1,
    createdAt,
    circuits: byKey(circuits),
    groups: byKey(groups),
    connections: byKey(connections),
    bif: byKey(bif),
    references: byKey(references),
    roles,
  };
}

// --- seeding a new Canon from several projects (stage 3′) -----------------------------

/** What to do with a seed whose conflicts are not all settled: keep it for a pull request, or leave it out. */
export type CanonSeedAction = "pending" | "exclude";

export interface CanonSeedStep {
  projectId: string;
  diff: CanonDiff;
  /** Conflicts that stop this seed from going into revision 1 */
  blocking: CanonConflict[];
  outcome: "merged" | "pending" | "excluded";
}

/**
 * While seeding, keeping the earlier seed's definition ("canon") is a valid way to settle C1 / C2c: the later seed
 * joins but is marked as needing an update. A C3 that only exists because the later seed's status was assumed is
 * then moot as well.
 */
export function seedBlockingConflicts(diff: CanonDiff, choices: Record<string, CanonChoice>): CanonConflict[] {
  const keptStatus = new Set(diff.conflicts.filter((c) => (c.code === "C1" || c.code === "C2c") && choices[c.id] === "canon").map((c) => c.key));
  return diff.conflicts.filter((c) => {
    if (c.code === "C3" && (keptStatus.has(c.key) || keptStatus.has(c.field ?? ""))) return false;
    if (c.severity === "error") return !(c.resolvable && choices[c.id]);
    if (c.severity === "warning") return !choices[c.id];
    return false;
  });
}

/**
 * Revision 1 of a new Canon from seeds in priority order: the first seed forms the base, each later one is merged
 * with the given choices, and a seed with unsettled conflicts is kept as a pull request or left out.
 */
export function composeSeeds(
  canonId: string,
  createdAt: string,
  seeds: CanonIncoming[],
  choices: Record<string, CanonChoice>,
  actions: Record<string, CanonSeedAction>,
): { snapshot: CanonSnapshot; steps: CanonSeedStep[] } {
  let snapshot = emptyCanonSnapshot(canonId, createdAt);
  const steps: CanonSeedStep[] = [];
  for (const inc of seeds) {
    const diff = diffCanon(snapshot, inc);
    const blocking = seedBlockingConflicts(diff, choices);
    if (blocking.length) {
      steps.push({ projectId: inc.projectId, diff, blocking, outcome: actions[inc.projectId] === "exclude" ? "excluded" : "pending" });
      continue;
    }
    snapshot = { ...mergeCanon(snapshot, inc, diff, choices, 0, createdAt), revision: 0 };
    steps.push({ projectId: inc.projectId, diff, blocking, outcome: "merged" });
  }
  return { snapshot: { ...snapshot, revision: steps.some((s) => s.outcome === "merged") ? 1 : 0 }, steps };
}
