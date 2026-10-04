/**
 * HCD ↔ FRG consistency: whether the information flow the FRG claims is realized by the HCD's connections, and
 * whether every ROI-internal UC serves an FRG function. Deterministic and free of I/O; the worker records the result
 * in `{P}/cross_check.json` without sending it back to the agent yet (record-only).
 */
import { parseInterface, type FrgModel, type GnRow, type HcdModel } from "./harness.js";
import { frgCandidatesFromHcd } from "./motifs.js";
import { parseUcDescriptor } from "./ucNaming.js";

export const CROSS_CODES = ["X1", "X2", "X3", "X5", "X6", "X8", "X9"] as const;
export type CrossCode = (typeof CROSS_CODES)[number];

/** Which side a finding points at: FRG->HCD = the FRG asks for something the HCD lacks, HCD->FRG the reverse */
export type CrossDirection = "FRG->HCD" | "HCD->FRG" | "both";

export interface CrossRule {
  /** Severity once the check is enforced (record-only for now) */
  severity: "error" | "warning";
  direction: CrossDirection;
  description: string;
}

export const CROSS_RULES: Record<CrossCode, CrossRule> = {
  X1: { severity: "error", direction: "both", description: "A GN interface leaves out a flow that the HCD connections of its UCs have (inputs from / outputs to circuits outside the GN)" },
  X2: { severity: "error", direction: "both", description: "The ROI inputs / outputs derived from the HCD connections differ from the noROI(input) / noROI(output) tags of uc.json (a tagged UC with no path to or from the ROI, or an untagged UC that connects to it)" },
  X3: { severity: "error", direction: "FRG->HCD", description: "A GN interface claims an input or output that no HCD connection of its UCs provides" },
  X5: { severity: "warning", direction: "HCD->FRG", description: "A ROI-internal UC is not mentioned in the function text of any GN it is attached to" },
  X6: { severity: "warning", direction: "both", description: "A GN's Requirement realization does not mention every UC of its interface" },
  X8: { severity: "warning", direction: "FRG->HCD", description: "The FRG is collapsed (TLF directly on UCs, a single GN, or fewer than 3 ROI-internal UCs): the UCs may be too coarse" },
  X9: { severity: "warning", direction: "FRG->HCD", description: "A ROI-internal UC is a whole gyrus-level BNA group (BNAG anchor without facets) or spans several SABRA units: finer areas may carry different inputs, outputs or Output Semantics" },
};

/** Findings that trigger the one HCD ↔ FRG adjustment turn after the FRG phase */
export const ADJUSTMENT_CODES: readonly CrossCode[] = ["X1", "X2", "X3", "X8"];

/** Heading of decision_log.md under which the agent records HCD ↔ FRG changes */
export const REVISIONS_HEADING = "## HCD-FRG revisions";

export interface RevisionCounts {
  /** The section exists */
  section: boolean;
  "FRG->HCD": number;
  "HCD->FRG": number;
  kept: number;
  /** Changes made because a user instruction (follow-up) asked for them */
  instruction: number;
}

/** Tagged lines (`- [FRG->HCD] …`, `- [HCD->FRG] …`, `- [instruction] …`, `- [kept] …`) under the revisions heading of decision_log.md. */
export function countRevisions(decisionLog: string | null | undefined): RevisionCounts {
  const out: RevisionCounts = { section: false, "FRG->HCD": 0, "HCD->FRG": 0, instruction: 0, kept: 0 };
  let inSection = false;
  for (const line of (decisionLog ?? "").split(/\r?\n/)) {
    if (/^#{1,2}\s/.test(line)) {
      inSection = line.trim().startsWith(REVISIONS_HEADING);
      if (inSection) out.section = true;
      continue;
    }
    if (!inSection) continue;
    const tag = line.match(/^\s*[-*]\s*\[(FRG\s*->\s*HCD|HCD\s*->\s*FRG|instruction|kept)\]/i)?.[1].replace(/\s/g, "").toUpperCase();
    if (tag === "FRG->HCD") out["FRG->HCD"]++;
    else if (tag === "HCD->FRG") out["HCD->FRG"]++;
    else if (tag === "INSTRUCTION") out.instruction++;
    else if (tag === "KEPT") out.kept++;
  }
  return out;
}

export interface CrossFinding {
  code: CrossCode;
  /** FRG node or Circuit ID the finding is about */
  node: string;
  message: string;
}

export interface CrossStats {
  roiUcs: number;
  gns: number;
  /** GNs whose interface could be parsed (X1, X3 and X6 look only at these) */
  interfacesParsed: number;
  /** Levels of GNs below and including the TLF (1 = the TLF only) */
  depth: number;
  /** GNs with 3-4 UC subnodes, and how many of them are a loop / feedforward motif of the bottom-up candidates */
  largeGns: number;
  largeGnsOnMotif: number;
}

export interface CrossCheck {
  findings: CrossFinding[];
  summary: Record<CrossCode, number>;
  stats: CrossStats;
}

const ucRefs = (text: string) => new Set([...text.matchAll(/\[U\.([^[\]\s]+)\]/g)].map((m) => m[1]));
const fmt = (ids: Iterable<string>) => [...ids].map((x) => `[U.${x}]`).join(", ");

export function checkCross(hcd: HcdModel, frg: FrgModel): CrossCheck {
  const findings: CrossFinding[] = [];
  const add = (code: CrossCode, node: string, message: string) => findings.push({ code, node, message });

  const roiUcs = new Set(hcd.ucs.filter((u) => u.roi === "roi").map((u) => u.id));
  const ucIds = new Set(hcd.ucs.map((u) => u.id));
  const edges = new Map<string, [string, string]>();
  for (const c of hcd.connections) if (ucIds.has(c.sender) && ucIds.has(c.receiver)) edges.set(`${c.sender}\u0000${c.receiver}`, [c.sender, c.receiver]);

  const gnById = new Map(frg.gns.map((g) => [g.id, g]));
  const ucKids = (g: GnRow) => g.subnodes.filter((x) => x.startsWith("U.")).map((x) => x.slice(2));
  const gnKids = (g: GnRow) => g.subnodes.filter((x) => gnById.has(x));
  const leafMemo = new Map<string, Set<string>>();
  const leaves = (id: string, seen = new Set<string>()): Set<string> => {
    const memo = leafMemo.get(id);
    if (memo) return memo;
    const out = new Set<string>();
    const g = gnById.get(id);
    if (!g || seen.has(id)) return out;
    seen.add(id);
    for (const u of ucKids(g)) if (roiUcs.has(u)) out.add(u);
    for (const k of gnKids(g)) for (const u of leaves(k, seen)) out.add(u);
    leafMemo.set(id, out);
    return out;
  };
  const derived = (members: Set<string>) => {
    const inputs = new Set<string>();
    const outputs = new Set<string>();
    for (const [s, r] of edges.values()) {
      if (members.has(r) && !members.has(s)) inputs.add(s);
      if (members.has(s) && !members.has(r)) outputs.add(r);
    }
    return { inputs, outputs };
  };

  /** Whether a directed path of connections leads from `start` to a circuit that satisfies `goal` (`back`: against the edges) */
  const reaches = (start: string, goal: (id: string) => boolean, back: boolean) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const x = queue.shift()!;
      for (const [s, r] of edges.values()) {
        const [from, to] = back ? [r, s] : [s, r];
        if (from !== x || seen.has(to)) continue;
        if (goal(to)) return true;
        seen.add(to);
        queue.push(to);
      }
    }
    return false;
  };

  let interfacesParsed = 0;
  for (const g of frg.gns) {
    const members = leaves(g.id);
    if (!members.size) continue;
    const itf = g.interfaceText ? parseInterface(g.interfaceText) : null;
    if (!itf) continue;
    interfacesParsed++;
    const want = derived(members);
    const statedIn = new Set(itf.inputs.filter(Boolean));
    const statedOut = new Set(itf.outputs.filter(Boolean));
    const missIn = [...want.inputs].filter((x) => !statedIn.has(x));
    const missOut = [...want.outputs].filter((x) => !statedOut.has(x));
    if (missIn.length) add("X1", g.id, `interface of \`${g.id}\` leaves out input(s) ${fmt(missIn)}, which connect to its UCs in connections.json`);
    if (missOut.length) add("X1", g.id, `interface of \`${g.id}\` leaves out output(s) ${fmt(missOut)}, which its UCs connect to in connections.json`);
    const extraIn = [...statedIn].filter((x) => !want.inputs.has(x));
    const extraOut = [...statedOut].filter((x) => !want.outputs.has(x));
    for (const x of extraIn)
      add("X3", g.id, members.has(x) ? `interface of \`${g.id}\` lists its own UC [U.${x}] as an input (internal edges are removed)` : `interface of \`${g.id}\` claims input [U.${x}], but no connection from \`${x}\` reaches its UCs (${fmt(members)})`);
    for (const x of extraOut)
      add("X3", g.id, members.has(x) ? `interface of \`${g.id}\` lists its own UC [U.${x}] as an output (internal edges are removed)` : `interface of \`${g.id}\` claims output [U.${x}], but none of its UCs (${fmt(members)}) connects to \`${x}\``);

    const mentioned = ucRefs(g.reqRealization);
    const unmentioned = [...new Set([...statedIn, ...statedOut])].filter((x) => ucIds.has(x) && !mentioned.has(x));
    if (unmentioned.length) add("X6", g.id, `requirementRealization of \`${g.id}\` does not mention ${fmt(unmentioned)} of its interface`);
  }

  const children = new Set(frg.gns.flatMap((g) => gnKids(g)));
  const roots = frg.gns.filter((g) => !children.has(g.id));
  const root = roots.length === 1 ? roots[0] : null;
  if (root) {
    const want = derived(roiUcs);
    const tagged = (roles: string[]) => new Set(hcd.ucs.filter((u) => roles.includes(u.roi)).map((u) => u.id));
    const tagIn = tagged(["input", "both"]);
    const tagOut = tagged(["output", "both"]);
    const untaggedIn = [...want.inputs].filter((x) => !tagIn.has(x));
    const untaggedOut = [...want.outputs].filter((x) => !tagOut.has(x));
    // an external UC may reach the ROI through another external UC (retina -> LGN -> V1)
    const idleIn = [...tagIn].filter((x) => !reaches(x, (y) => roiUcs.has(y), false));
    const idleOut = [...tagOut].filter((x) => !reaches(x, (y) => roiUcs.has(y), true));
    if (untaggedIn.length) add("X2", root.id, `${fmt(untaggedIn)} send(s) into the ROI but ${untaggedIn.length > 1 ? "are" : "is"} not tagged noROI(input)`);
    if (untaggedOut.length) add("X2", root.id, `${fmt(untaggedOut)} receive(s) from the ROI but ${untaggedOut.length > 1 ? "are" : "is"} not tagged noROI(output)`);
    if (idleIn.length) add("X2", root.id, `${fmt(idleIn)} ${idleIn.length > 1 ? "are" : "is"} tagged noROI(input) but no connection from ${idleIn.length > 1 ? "them" : "it"} reaches the ROI`);
    if (idleOut.length) add("X2", root.id, `${fmt(idleOut)} ${idleOut.length > 1 ? "are" : "is"} tagged noROI(output) but the ROI does not connect to ${idleOut.length > 1 ? "them" : "it"}`);
  }

  // motifs: which GNs of 3-4 UCs are a loop / feedforward triangle the worker listed (the 2-UC GNs are connected
  // pairs by the FRG check, so they always are one); record only
  const motifSets = new Set(
    frgCandidatesFromHcd(hcd)
      .motifs.filter((m) => m.ucs.length > 2)
      .map((m) => [...m.ucs].sort().join("\u0000")),
  );
  const largeGns = frg.gns.filter((g) => ucKids(g).length > 2);
  const motifGns = largeGns.filter((g) => motifSets.has([...new Set(ucKids(g))].sort().join("\u0000"))).length;

  const parents = new Map<string, GnRow[]>();
  for (const g of frg.gns) for (const u of ucKids(g)) (parents.get(u) ?? parents.set(u, []).get(u)!).push(g);
  for (const u of roiUcs) {
    const ps = parents.get(u) ?? [];
    if (!ps.length) continue;
    const text = (g: GnRow) => [g.comment, g.requirement, g.reqRealization, g.capability, g.mechanism].join("\n");
    if (!ps.some((g) => ucRefs(text(g)).has(u))) add("X5", u, `[U.${u}] is not mentioned in the function text of ${ps.map((g) => `\`${g.id}\``).join(", ")}`);
  }

  const depthOf = (id: string, seen = new Set<string>()): number => {
    const g = gnById.get(id);
    if (!g || seen.has(id)) return 0;
    seen.add(id);
    return 1 + Math.max(0, ...gnKids(g).map((k) => depthOf(k, new Set(seen))));
  };
  const depth = root ? depthOf(root.id) : 0;
  if (root) {
    if (!gnKids(root).length) add("X8", root.id, `the TLF \`${root.id}\` has only UCs as subnodes; decompose it or split its UCs`);
    else if (frg.gns.length === 2) add("X8", root.id, "the FRG has a single GN under the TLF");
    if (roiUcs.size < 3) add("X8", root.id, `the HCD has only ${roiUcs.size} ROI-internal UC(s)`);
  }

  for (const u of hcd.ucs) {
    if (u.roi !== "roi" || !u.descriptor) continue;
    const anchor = u.descriptor.split("/")[0];
    const parsed = parseUcDescriptor(u.descriptor);
    const faceted = "errors" in parsed ? u.descriptor.includes("/") : parsed.descriptor.facets.length > 0;
    if (anchor.includes("&")) add("X9", u.id, `[U.${u.id}] spans several SABRA units (${u.descriptor}); check whether the literature separates them into UCs`);
    else if (anchor.startsWith("BNAG:") && !faceted)
      add("X9", u.id, `[U.${u.id}] is a whole gyrus-level BNA group (${u.descriptor}); check whether its BNA areas (or parts) have different inputs, outputs or Output Semantics`);
  }

  const summary = Object.fromEntries(CROSS_CODES.map((c) => [c, findings.filter((f) => f.code === c).length])) as Record<CrossCode, number>;
  return { findings, summary, stats: { roiUcs: roiUcs.size, gns: frg.gns.length, interfacesParsed, depth, largeGns: largeGns.length, largeGnsOnMotif: motifGns } };
}
