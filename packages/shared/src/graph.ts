import { isRoiCircuitId } from "./bra.js";
import { col, parseCsvObjects } from "./csv.js";
import type {
  EdgeSign,
  FrgEdge,
  FrgGraph,
  FrgNode,
  FrgNodeKind,
  HcdCollection,
  HcdEdge,
  HcdGraph,
  HcdNode,
  RoiClass,
} from "./types.js";

export interface GraphSources {
  circuitsCsv: string;
  connectionsCsv: string;
  frgCsv: string;
  referencesCsv?: string;
}

const stripTicks = (s: string) => s.replace(/`/g, "").trim();
const stripPrefix = (s: string) => stripTicks(s).replace(/^(U\.|R\.)/, "");
const splitList = (s: string) =>
  stripTicks(s)
    .split(/[;；]/)
    .map((x) => x.trim())
    .filter(Boolean);

const INHIB_RE = /\binhibit|\bGABA|glycin|抑制/i;
const EXCIT_RE = /\bexcitat|glutamat|\bAMPA\b|\bNMDA\b|興奮/i;
const MOD_RE = /modulat|dopamin|serotonin|noradren|norepineph|acetylcholin|cholinerg|histamin|neuropeptide|調節/i;

/**
 * Classify the physiological sign of a connection. The Connection comment wins (it describes this
 * projection specifically); otherwise fall back to the sender circuit's Modulation Type / Transmitter.
 * Mixed senders (e.g. "Excitatory / Inhibitory") stay unknown unless the comment disambiguates.
 */
export function classifyEdgeSign(edge: Pick<HcdEdge, "comments">, sender?: Pick<HcdNode, "transmitter" | "modulationType"> | null): EdgeSign {
  const c = edge.comments ?? "";
  const inh = INHIB_RE.test(c);
  const exc = EXCIT_RE.test(c);
  if (inh && !exc) return "inhibitory";
  if (exc && !inh) return "excitatory";
  if (inh && exc) {
    // Both words present: prefer the one that describes the projection itself ("(GABAergic; inhibitory)" pattern)
    const m = c.match(/\(([^)]*)\)/g)?.join(" ") ?? "";
    if (INHIB_RE.test(m) && !EXCIT_RE.test(m)) return "inhibitory";
    if (EXCIT_RE.test(m) && !INHIB_RE.test(m)) return "excitatory";
  }
  if (!inh && !exc && MOD_RE.test(c)) return "modulatory";
  if (sender) {
    const s = `${sender.modulationType ?? ""} ${sender.transmitter ?? ""}`;
    const si = INHIB_RE.test(s);
    const se = EXCIT_RE.test(s);
    if (si && !se) return "inhibitory";
    if (se && !si) return "excitatory";
    if (!si && !se && MOD_RE.test(s)) return "modulatory";
  }
  return "unknown";
}

/**
 * Build both HCD and FRG graph JSON from the three project CSVs.
 * This is deterministic and does not depend on the LLM.
 */
export function buildGraphs(projectId: string, src: GraphSources): { hcd: HcdGraph; frg: FrgGraph } {
  const generatedAt = new Date().toISOString();
  // The ROI row (`ROI_<ProjectID>`) and the Collections (Uniform = FALSE) are not nodes
  const allCircuits = parseCsvObjects(src.circuitsCsv).filter((c) => !isRoiCircuitId(stripPrefix(col(c, "Circuit ID"))));
  const connections = parseCsvObjects(src.connectionsCsv);
  const frgRows = parseCsvObjects(src.frgCsv);
  const references = src.referencesCsv
    ? parseCsvObjects(src.referencesCsv).map((r) => ({
        referenceId: col(r, "Reference ID"),
        doi: col(r, "DOI"),
      }))
    : [];

  // ---- FRG rows indexed -----------------------------------------------------
  interface FrgRow {
    nodeId: string;
    subnodes: string[];
    circuitId: string;
    projected: string[];
    capability: string;
    mechanism: string;
    implementation: string;
    reqRealization: string;
    requirement: string;
    outputSemantics: string;
    comments: string;
  }
  const frg: FrgRow[] = frgRows
    .map((r) => ({
      nodeId: stripTicks(col(r, "Node ID")),
      subnodes: splitList(col(r, "Subnodes")),
      circuitId: stripTicks(col(r, "Circuit ID")),
      projected: splitList(col(r, "Projected Circuits")),
      capability: col(r, "Capability"),
      mechanism: col(r, "Mechanism"),
      implementation: col(r, "Implementation of Uniform Circuit", "Implementation"),
      reqRealization: col(r, "Requirements Realization by Interface", "Requirement realization by interface"),
      requirement: col(r, "Requirements", "Requirement"),
      outputSemantics: col(r, "Output Semantics"),
      comments: col(r, "Comments", "Comment"),
    }))
    .filter((r) => r.nodeId !== "");

  const frgByUcId = new Map<string, FrgRow>(); // key: circuit id without prefix
  const frgGnRows: FrgRow[] = [];
  for (const r of frg) {
    if (r.nodeId.startsWith("U.")) frgByUcId.set(stripPrefix(r.nodeId), r);
    else frgGnRows.push(r);
  }

  // UC ids referenced from any GN's Subnodes → inside ROI by construction (FRG uses ROI-internal UCs only)
  const roiUcIds = new Set<string>();
  for (const gn of frgGnRows) for (const s of gn.subnodes) if (s.startsWith("U.")) roiUcIds.add(stripPrefix(s));

  // ---- HCD edges ------------------------------------------------------------
  // Connections.csv has one row per reference; rows of the same sender -> receiver become one edge
  const edgeByPair = new Map<string, HcdEdge>();
  const hcdEdges: HcdEdge[] = [];
  connections
    .map((c, idx) => {
      const source = stripPrefix(col(c, "Sender Circuit ID (sCID)", "Sender Circuit ID", "sCID", "Sender"));
      const target = stripPrefix(col(c, "Receiver Circuit ID (rCID)", "Receiver Circuit ID", "rCID", "Receiver"));
      return {
        id: `e${idx}_${source}__${target}`,
        source,
        target,
        comments: col(c, "Comments", "Comment"),
        referenceId: col(c, "Reference ID"),
        taxon: col(c, "Taxon"),
        measurementMethod: col(c, "Measurement method"),
        pointersOnLiterature: col(c, "Pointers on literature"),
        pointersOnFigure: col(c, "Pointers on figure"),
        outputSemantics: "",
      };
    })
    .filter((e) => e.source && e.target)
    .forEach((e) => {
      const key = `${e.source}\u0000${e.target}`;
      const prev = edgeByPair.get(key);
      if (!prev) {
        edgeByPair.set(key, e);
        hcdEdges.push(e);
        return;
      }
      prev.comments = joinDistinct(prev.comments, e.comments, " / ");
      prev.referenceId = joinDistinct(prev.referenceId, e.referenceId, "; ");
      prev.taxon = joinDistinct(prev.taxon, e.taxon, "; ");
      prev.measurementMethod = joinDistinct(prev.measurementMethod, e.measurementMethod, "; ");
      prev.pointersOnLiterature = joinDistinct(prev.pointersOnLiterature, e.pointersOnLiterature, "\n");
      prev.pointersOnFigure = joinDistinct(prev.pointersOnFigure, e.pointersOnFigure, "; ");
    });

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const e of hcdEdges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, new Set());
    if (!incoming.has(e.target)) incoming.set(e.target, new Set());
    outgoing.get(e.source)!.add(e.target);
    incoming.get(e.target)!.add(e.source);
  }

  // ---- HCD nodes ------------------------------------------------------------
  // A Collection that is still an edge end (files not checked by the harness) stays a node so no edge is lost
  const isCollectionRow = (c: Record<string, string>) => {
    const id = stripPrefix(col(c, "Circuit ID"));
    return col(c, "Uniform").toUpperCase() === "FALSE" && !outgoing.has(id) && !incoming.has(id);
  };
  const circuits = allCircuits.filter((c) => !isCollectionRow(c));
  const circuitIds = new Set<string>();
  const hcdNodes: HcdNode[] = circuits
    .map((c) => {
      const id = stripPrefix(col(c, "Circuit ID"));
      const comments = col(c, "Comments", "Comment");
      const f = frgByUcId.get(id);
      return {
        id,
        label: id,
        ucDescriptor: col(c, "UC Descriptor") || undefined,
        names: col(c, "Names", "Name"),
        sourceOfId: col(c, "Source of ID"),
        transmitter: col(c, "Transmitter"),
        modulationType: col(c, "Modulation Type"),
        comments,
        roiClass: classifyRoi(id, comments, roiUcIds, outgoing, incoming),
        interfaceText: deriveInterface(id, outgoing.get(id), incoming.get(id)),
        outputSemantics: f?.outputSemantics ?? "",
        requirement: f?.requirement ?? "",
        requirementRealization: f?.reqRealization ?? "",
        capability: f?.capability ?? "",
        mechanism: f?.mechanism ?? "",
        implementation: f?.implementation ?? "",
        projectedCircuits: f?.projected.map(stripPrefix) ?? Array.from(outgoing.get(id) ?? []),
      } satisfies HcdNode;
    })
    .filter((n) => {
      if (!n.id || circuitIds.has(n.id)) return false;
      circuitIds.add(n.id);
      return true;
    });

  // Any circuit referenced by connections/FRG but missing from Circuits.csv → add a stub node
  const referenced = new Set<string>();
  for (const e of hcdEdges) {
    referenced.add(e.source);
    referenced.add(e.target);
  }
  for (const id of frgByUcId.keys()) referenced.add(id);
  for (const id of referenced) {
    if (circuitIds.has(id)) continue;
    const f = frgByUcId.get(id);
    hcdNodes.push({
      id,
      label: id,
      names: "",
      sourceOfId: "",
      transmitter: "",
      modulationType: "",
      comments: f?.comments ?? "(not listed in Circuits.csv)",
      roiClass: classifyRoi(id, f?.comments ?? "", roiUcIds, outgoing, incoming),
      interfaceText: deriveInterface(id, outgoing.get(id), incoming.get(id)),
      outputSemantics: f?.outputSemantics ?? "",
      requirement: f?.requirement ?? "",
      requirementRealization: f?.reqRealization ?? "",
      capability: f?.capability ?? "",
      mechanism: f?.mechanism ?? "",
      implementation: f?.implementation ?? "",
      projectedCircuits: f?.projected.map(stripPrefix) ?? [],
    });
    circuitIds.add(id);
  }

  const osById = new Map(hcdNodes.map((n) => [n.id, n.outputSemantics]));
  const nodeById = new Map(hcdNodes.map((n) => [n.id, n]));
  for (const e of hcdEdges) {
    e.outputSemantics = osById.get(e.source) ?? "";
    e.sign = classifyEdgeSign(e, nodeById.get(e.source));
  }

  const collectionRows = allCircuits.filter(isCollectionRow).map((c) => ({
    id: stripPrefix(col(c, "Circuit ID")),
    names: col(c, "Names", "Name"),
    ucDescriptor: col(c, "UC Descriptor") || undefined,
    sourceOfId: col(c, "Source of ID"),
    comments: col(c, "Comments", "Comment"),
    subCircuits: splitList(col(c, "Sub-Circuits")).map(stripPrefix),
  }));
  const subsById = new Map(collectionRows.map((c) => [c.id, c.subCircuits]));
  const membersOf = (id: string, seen: Set<string>): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    return (subsById.get(id) ?? []).flatMap((k) => (subsById.has(k) ? membersOf(k, seen) : circuitIds.has(k) ? [k] : []));
  };
  const collections: HcdCollection[] = collectionRows.map((c) => ({ ...c, members: [...new Set(membersOf(c.id, new Set()))] }));

  const hcd: HcdGraph = { kind: "hcd", projectId, generatedAt, nodes: hcdNodes, edges: hcdEdges, ...(collections.length ? { collections } : {}), references };

  // ---- FRG graph ------------------------------------------------------------
  const frgNodesById = new Map<string, FrgNode>();
  const frgEdges: FrgEdge[] = [];
  const parentsOf = new Map<string, string[]>();

  for (const gn of frgGnRows) {
    frgNodesById.set(gn.nodeId, {
      id: gn.nodeId,
      label: gn.nodeId,
      kind: "gn",
      level: -1,
      subnodes: gn.subnodes,
      parents: [],
      comments: gn.comments,
      requirement: gn.requirement,
      requirementRealization: gn.reqRealization,
      capability: gn.capability,
      mechanism: gn.mechanism,
      implementation: gn.implementation,
      outputSemantics: gn.outputSemantics,
      circuitId: null,
    });
  }
  // UC nodes referenced from GNs
  for (const gn of frgGnRows) {
    for (const s of gn.subnodes) {
      if (!parentsOf.has(s)) parentsOf.set(s, []);
      parentsOf.get(s)!.push(gn.nodeId);
      frgEdges.push({ id: `${gn.nodeId}__${s}`, source: gn.nodeId, target: s });
      if (!frgNodesById.has(s)) {
        const cid = stripPrefix(s);
        const f = frgByUcId.get(cid);
        const hn = hcdNodes.find((n) => n.id === cid);
        frgNodesById.set(s, {
          id: s,
          label: s,
          kind: s.startsWith("U.") ? "uc" : "gn",
          level: -1,
          subnodes: [],
          parents: [],
          comments: f?.comments ?? hn?.comments ?? "",
          requirement: f?.requirement ?? hn?.requirement ?? "",
          requirementRealization: f?.reqRealization ?? hn?.requirementRealization ?? "",
          capability: f?.capability ?? hn?.capability ?? "",
          mechanism: f?.mechanism ?? hn?.mechanism ?? "",
          implementation: f?.implementation ?? hn?.implementation ?? "",
          outputSemantics: f?.outputSemantics ?? hn?.outputSemantics ?? "",
          circuitId: s.startsWith("U.") ? cid : null,
        });
      }
    }
  }
  for (const [id, ps] of parentsOf) {
    const n = frgNodesById.get(id);
    if (n) n.parents = ps;
  }
  // Roots (no parents) among GN rows → TLF
  const roots = [...frgNodesById.values()].filter((n) => n.kind === "gn" && n.parents.length === 0);
  for (const r of roots) r.kind = "tlf" as FrgNodeKind;
  // Levels via BFS from roots
  const queue: [string, number][] = roots.map((r) => [r.id, 0]);
  while (queue.length) {
    const [id, lvl] = queue.shift()!;
    const n = frgNodesById.get(id)!;
    if (n.level !== -1 && n.level <= lvl) continue;
    n.level = lvl;
    for (const s of n.subnodes) if (frgNodesById.has(s)) queue.push([s, lvl + 1]);
  }
  for (const n of frgNodesById.values()) if (n.level === -1) n.level = 0;

  const frgGraph: FrgGraph = {
    kind: "frg",
    projectId,
    generatedAt,
    nodes: [...frgNodesById.values()],
    edges: frgEdges,
  };

  return { hcd, frg: frgGraph };
}

function joinDistinct(a: string, b: string, sep: string): string {
  if (!b || a.split(sep).includes(b)) return a;
  return a ? `${a}${sep}${b}` : b;
}

function classifyRoi(
  id: string,
  comments: string,
  roiUcIds: Set<string>,
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
): RoiClass {
  const c = comments.toLowerCase();
  const explicitIn = /noroi\s*\(?\s*input/.test(c);
  const explicitOut = /noroi\s*\(?\s*output/.test(c);
  if (explicitIn && explicitOut) return "noROI_both";
  if (explicitIn) return "noROI_input";
  if (explicitOut) return "noROI_output";
  if (/roi[-_ ]?internal|within roi|inside roi|roi内/.test(c)) return "roi";
  if (roiUcIds.has(id)) return "roi";
  if (roiUcIds.size === 0) return "unknown";
  // Infer from connectivity to ROI-internal circuits
  const outsToRoi = [...(outgoing.get(id) ?? [])].some((t) => roiUcIds.has(t));
  const insFromRoi = [...(incoming.get(id) ?? [])].some((s) => roiUcIds.has(s));
  if (outsToRoi && insFromRoi) return "noROI_both";
  if (outsToRoi) return "noROI_input";
  if (insFromRoi) return "noROI_output";
  return "unknown";
}

function deriveInterface(id: string, outs?: Set<string>, ins?: Set<string>): string {
  const o = [...(outs ?? [])].map((x) => `[${x}]`).join(", ");
  const i = [...(ins ?? [])].map((x) => `[${x}]`).join(", ");
  if (!o && !i) return "";
  return `(${o}) = ${id}(${i})`;
}
