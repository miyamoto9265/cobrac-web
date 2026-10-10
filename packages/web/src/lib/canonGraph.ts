import type { CanonCircuit, CanonSnapshot, HcdCollection, HcdEdge, HcdGraph, HcdNode, RoiClass, UcRoi } from "@cobrac/shared";
import { currentCanonSnapshot } from "@cobrac/shared";
import type { Sheet } from "./table";

/** How the member projects place a circuit relative to their ROI; one project's ROI is enough to call it ROI. */
function roiClassOf(values: UcRoi[]): RoiClass {
  if (!values.length) return "unknown";
  if (values.includes("roi")) return "roi";
  const set = new Set(values);
  if (set.has("both") || (set.has("input") && set.has("output"))) return "noROI_both";
  return set.has("input") ? "noROI_input" : "noROI_output";
}

/**
 * The shared layer of a Canon snapshot as an HCD graph, so the Canon page can use the project's graph view: Uniform
 * circuits (and Collections that still end a connection) are nodes, the other Collections and the groupings are boxes,
 * every connection is an edge. Invalidated entries are left out. The ROI colour comes from the member projects' roles.
 */
export function canonHcdGraph(stored: CanonSnapshot): HcdGraph {
  const snap = currentCanonSnapshot(stored);
  const circuits = snap.circuits.filter((c) => c.state !== "invalidated");
  const groups = snap.groups.filter((g) => g.state !== "invalidated");
  const connections = snap.connections.filter((c) => c.state !== "invalidated");
  const idOf = new Map<string, string>([...circuits.map((c) => [c.key, c.circuitId] as const), ...groups.map((g) => [g.key, g.circuitId] as const)]);
  const circuitByKey = new Map(circuits.map((c) => [c.key, c]));

  const ends = new Set(connections.flatMap((c) => [c.sender, c.receiver]));
  const isNode = (c: CanonCircuit) => c.status === "uniform" || ends.has(c.key);
  const roles = new Map<string, UcRoi[]>();
  for (const r of snap.roles) for (const u of r.ucRoles) roles.set(u.key, [...(roles.get(u.key) ?? []), u.roi as UcRoi]);

  const nodes: HcdNode[] = circuits.filter(isNode).map((c) => ({
    id: c.circuitId,
    label: c.circuitId,
    ucDescriptor: c.descriptor,
    names: c.names,
    sourceOfId: c.sourceOfId,
    transmitter: c.transmitter,
    modulationType: c.modulationType,
    comments: "",
    roiClass: roiClassOf(roles.get(c.key) ?? []),
    interfaceText: "",
    outputSemantics: c.outputSemantics,
    requirement: "",
    requirementRealization: "",
    capability: "",
    mechanism: "",
    implementation: "",
    projectedCircuits: [],
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));

  // members of a box: its direct members as written, and the nodes under it with nested boxes expanded
  const direct = new Map<string, string[]>([
    ...circuits.filter((c) => !isNode(c)).map((c) => [c.key, c.subCircuits] as const),
    ...groups.map((g) => [g.key, g.members] as const),
  ]);
  const expand = (key: string, seen = new Set<string>()): string[] => {
    if (seen.has(key)) return [];
    seen.add(key);
    return (direct.get(key) ?? []).flatMap((m) => (direct.has(m) ? expand(m, seen) : [idOf.get(m) ?? m]));
  };
  const collections: HcdCollection[] = [...direct.keys()].map((key) => {
    const c = circuitByKey.get(key);
    const g = c ? null : groups.find((x) => x.key === key);
    return {
      id: idOf.get(key) ?? key,
      names: c?.names ?? g?.names ?? "",
      ucDescriptor: c?.descriptor,
      sourceOfId: c?.sourceOfId ?? "",
      comments: "",
      subCircuits: (direct.get(key) ?? []).map((m) => idOf.get(m) ?? m),
      members: [...new Set(expand(key))].filter((id) => nodeIds.has(id)),
    };
  });

  const edges: HcdEdge[] = connections.map((c) => ({
    id: c.key,
    source: idOf.get(c.sender) ?? c.senderCircuitId,
    target: idOf.get(c.receiver) ?? c.receiverCircuitId,
    comments: c.comment,
    referenceId: c.referenceId,
    taxon: c.taxon,
    measurementMethod: c.method,
    pointersOnLiterature: c.pointersOnLiterature,
    pointersOnFigure: c.pointersOnFigure,
    outputSemantics: circuitByKey.get(c.sender)?.outputSemantics ?? "",
  }));

  return {
    kind: "hcd",
    projectId: snap.canonId,
    generatedAt: snap.createdAt,
    nodes,
    edges: edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
    collections,
    references: snap.references.map((r) => ({ referenceId: r.key, doi: r.doi })),
  };
}

/** Circuit IDs a member project pushed (to emphasise them on the graph). */
export function circuitsOfProject(snap: CanonSnapshot, projectId: string): Set<string> {
  return new Set(snap.circuits.filter((c) => c.state !== "invalidated" && c.sources.includes(projectId)).map((c) => c.circuitId));
}

export type CanonTable = "circuits" | "connections" | "references";
export const CANON_TABLES: CanonTable[] = ["circuits", "connections", "references"];

/** The shared layer as tables with the BRA column names, plus where each entry came from and its state. */
export function canonSheet(snap: CanonSnapshot, table: CanonTable): Sheet {
  const idOf = new Map<string, string>([...snap.circuits.map((c) => [c.key, c.circuitId] as const), ...snap.groups.map((g) => [g.key, g.circuitId] as const)]);
  const sources = (s: string[]) => s.join(", ");
  if (table === "circuits") {
    const groupRows = snap.groups.map((g) => [g.circuitId, "", g.names, "FALSE", g.members.map((m) => idOf.get(m) ?? m).join(", "), "", "", "", "", sources(g.sources), g.state]);
    return {
      name: "Circuits",
      columns: ["Circuit ID", "UC Descriptor", "Names", "Uniform", "Sub-Circuits", "Transmitter", "Modulation Type", "Source of ID", "Output Semantics", "Sources", "State"],
      rows: [
        ...[...snap.circuits]
          .sort((a, b) => a.circuitId.localeCompare(b.circuitId))
          .map((c) => [
            c.circuitId,
            c.descriptor,
            c.names,
            c.status === "uniform" ? "TRUE" : "FALSE",
            c.subCircuits.map((k) => idOf.get(k) ?? k).join(", "),
            c.transmitter,
            c.modulationType,
            c.sourceOfId,
            c.outputSemantics,
            sources(c.sources),
            c.state,
          ]),
        ...groupRows,
      ],
    };
  }
  if (table === "connections") {
    return {
      name: "Connections",
      columns: ["Sender Circuit ID", "Receiver Circuit ID", "Reference ID", "Taxon", "Measurement Method", "Pointers on Literature", "Pointers on Figure", "Comment", "Quote check", "Sources", "State"],
      rows: snap.connections.map((c) => [
        c.senderCircuitId,
        c.receiverCircuitId,
        c.referenceId,
        c.taxon,
        c.method,
        c.pointersOnLiterature,
        c.pointersOnFigure,
        c.comment,
        c.quoteCheck,
        sources(c.sources),
        c.state,
      ]),
    };
  }
  return {
    name: "References",
    columns: ["Reference ID", "DOI", "PMID", "Title", "Journal", "Literature Type", "Alternative URL", "Check", "Sources", "State"],
    rows: snap.references.map((r) => [r.key, r.doi, r.pmid, r.title, r.journal, r.literatureType, r.alternativeUrl, r.check, sources(r.sources), r.state]),
  };
}
