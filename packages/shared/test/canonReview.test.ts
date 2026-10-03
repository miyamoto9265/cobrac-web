import { describe, expect, it } from "vitest";
import {
  CANON_AI_REVIEW_SCHEMA,
  buildCanonAiPacket,
  canonAiPrompt,
  canonFromProject,
  canonReviewChecks,
  diffCanon,
  emptyCanonSnapshot,
  mergeCanon,
  parseCanonAiReview,
  parseReviewItemId,
  reviewEntries,
  reviewGraph,
  type CanonIncoming,
  type CanonSnapshot,
} from "../src/index.js";

interface Uc {
  id: string;
  d: string;
  names?: string;
  tx?: string;
}
interface Conn {
  s: string;
  r: string;
  ref?: string;
  comment?: string;
  quote?: string;
  figure?: string;
}

const uc = (u: Uc) => ({
  circuitId: u.id,
  descriptor: u.d,
  names: u.names ?? u.id,
  roi: "internal",
  sourceOfId: "BNA",
  transmitter: u.tx ?? "Glutamate",
  modulationType: "Excitatory",
  comments: "",
  interface: "",
  requirement: "",
  requirementRealization: "",
  capability: "",
  mechanism: "",
  implementation: "",
  outputSemantics: "",
});

const QUOTE = "The arcuate fasciculus connects Broca's territory with Wernicke's territory in the human brain.";
function files(ucs: Uc[], conns: Conn[], cols: { id: string; d: string; subs: string[] }[] = []) {
  return {
    uc: JSON.stringify({ ucs: ucs.map(uc), collections: cols.map((c) => ({ circuitId: c.id, descriptor: c.d, names: c.id, sourceOfId: "collection", subCircuits: c.subs, comments: "" })) }),
    connections: JSON.stringify({
      bif: [],
      connections: conns.map((c) => ({
        sender: c.s,
        senderRelation: "<",
        senderInLiterature: "Broca's territory",
        receiver: c.r,
        receiverRelation: "=",
        receiverInLiterature: "Wernicke's territory",
        comment: c.comment ?? "",
        referenceIds: [c.ref ?? "[Catani, 2005]"],
        taxon: "Human",
        measurementMethod: "DW-MRI",
        pointersOnLiterature: c.quote ?? QUOTE,
        pointersOnFigure: c.figure ?? "Fig. 2",
      })),
    }),
    references: JSON.stringify({
      references: [
        { id: "[Catani, 2005]", doi: "10.1002/ana.20319", literatureType: "Experimental results" },
        { id: "[Friederici, 2011]", doi: "10.1152/physrev.00006.2011", literatureType: "Review" },
      ],
    }),
    frg: JSON.stringify({ nodes: [] }),
  };
}

const A44 = { id: "A44d(left)", d: "BNA:29-30/side:left", names: "left dorsal area 44" };
const A44IT = { id: "A44d(L3.IT.left)", d: "BNA:29-30/lay:L3/cell:IT/side:left" };
const A44PT = { id: "A44d(L5.PT.left)", d: "BNA:29-30/lay:L5/cell:PT/side:left" };
const A44L6 = { id: "A44d(L6.CT.left)", d: "BNA:29-30/lay:L6/cell:CT/side:left" };
const A22 = { id: "A22c(left)", d: "BNA:75-76/side:left", names: "left caudal area 22" };
const A45 = { id: "A45c(left)", d: "BNA:33-34/side:left", names: "left caudal area 45" };

function canonWith(...incs: CanonIncoming[]): CanonSnapshot {
  let snap = emptyCanonSnapshot("u7m2q9xa-c1", "t0");
  for (const [i, inc] of incs.entries()) snap = mergeCanon(snap, inc, diffCanon(snap, inc), {}, i + 1, `t${i + 1}`);
  return snap;
}

const review = (base: CanonSnapshot, inc: CanonIncoming, prov?: Parameters<typeof canonReviewChecks>[3]) => {
  const diff = diffCanon(base, inc);
  return { diff, report: canonReviewChecks(base, inc, diff, prov) };
};
const codes = (r: ReturnType<typeof review>) => r.report.checks.map((c) => c.code);

describe("canonReviewChecks", () => {
  it("shows the conflicts of the diff as checks with their conflict ID and Master code", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 2, files([A44, A22], [{ s: A44.id, r: A22.id }])));
    const inc = canonFromProject("u7m2q9xa-3", 1, files([A44IT, A44PT, A22], [{ s: A44IT.id, r: A22.id }], [{ id: A44.id, d: A44.d, subs: [A44IT.id, A44PT.id] }]));
    const r = review(base, inc);
    const c1 = r.report.checks.find((c) => c.code === "C1")!;
    expect(c1).toMatchObject({ group: "duplicates", severity: "error", master: "cobrac:canon-status", item: "circuit:bna:29-30/side:left", conflictId: "C1:circuit:bna:29-30/side:left:status" });
    expect(r.report.counts.duplicates.error).toBeGreaterThan(0);
    // the coarse Canon connection now ends on a Collection: the other project is affected
    expect(r.report.checks.find((c) => c.code === "impact")).toMatchObject({ incoming: "u7m2q9xa-1", severity: "warning" });
  });

  it("flags a connection whose direction is the reverse of the Canon's for the same paper", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44, A22], [{ s: A22.id, r: A44.id }])));
    const r = review(base, canonFromProject("u7m2q9xa-2", 1, files([A44, A22], [{ s: A44.id, r: A22.id }])));
    const rev = r.report.checks.find((c) => c.code === "reverse")!;
    expect(rev).toMatchObject({ group: "edges", severity: "warning", canon: "A22c(left) → A44d(left)", incoming: "A44d(left) → A22c(left)" });
    expect(rev.related).toEqual(["connection:bna:75-76/side:left|bna:29-30/side:left|[Catani, 2005]"]);
  });

  it("flags opposite signs on the same sender and receiver", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44, A22], [{ s: A44.id, r: A22.id, comment: "excitatory glutamatergic projection" }])));
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44, A22], [{ s: A44.id, r: A22.id, ref: "[Friederici, 2011]", comment: "inhibitory (GABAergic) projection" }]));
    const sign = review(base, inc).report.checks.find((c) => c.code === "sign")!;
    expect(sign).toMatchObject({ canon: "excitatory", incoming: "inhibitory" });
  });

  it("checks the evidence of incoming connections (Master 252 / 253 / 271)", () => {
    const base = canonWith();
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44, A22, A45], [{ s: A44.id, r: A22.id }, { s: A45.id, r: A22.id }]));
    inc.connections[0] = { ...inc.connections[0], referenceId: "[Smith, 2010]", key: inc.connections[0].key.replace("[Catani, 2005]", "[Smith, 2010]") };
    inc.connections[1] = { ...inc.connections[1], pointersOnLiterature: "", pointersOnFigure: "" };
    const r = review(base, inc);
    expect(r.report.checks.filter((c) => c.group === "evidence").map((c) => [c.code, c.master])).toEqual(
      expect.arrayContaining([
        ["ref-undefined", "253"],
        ["pointer-missing", "271"],
        ["quote-unchecked", null],
      ]),
    );
  });

  it("checks descriptor syntax and Circuit ID characters", () => {
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44, A22], []));
    inc.circuits[0] = { ...inc.circuits[0], descriptor: "BNA:abc" };
    inc.circuits[1] = { ...inc.circuits[1], circuitId: "A22 c" };
    const r = review(canonWith(), inc);
    expect(codes(r)).toEqual(expect.arrayContaining(["desc-syntax", "cid-chars"]));
    expect(r.report.checks.find((c) => c.code === "desc-syntax")!.master).toBe("cobrac:uc-descriptor");
  });

  it("points at possible duplicates and existing entries on the same anchor", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44IT, A44PT, A22], [], [{ id: A44.id, d: A44.d, subs: [A44IT.id, A44PT.id] }])));
    const twin = { id: "A45c(left)", d: "BNA:33-34/side:left", names: "left caudal area 22" };
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44IT, A44PT, A44L6, twin], [], [{ id: A44.id, d: A44.d, subs: [A44IT.id, A44PT.id, A44L6.id] }]));
    const r = review(base, inc);
    const near = r.report.checks.find((c) => c.code === "same-anchor" && c.item === "circuit:bna:29-30/lay:l6/cell:ct/side:left")!;
    expect(near.related).toEqual(expect.arrayContaining(["circuit:bna:29-30/lay:l3/cell:it/side:left", "circuit:bna:29-30/lay:l5/cell:pt/side:left"]));
    expect(r.report.checks.find((c) => c.code === "same-name")).toMatchObject({ related: ["circuit:bna:75-76/side:left"], severity: "warning" });
  });

  it("reports provenance: base behind the head, newer source revision, dropped items", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44, A22], [{ s: A44.id, r: A22.id }])));
    const inc = canonFromProject("u7m2q9xa-1", 2, files([A44, A22], []));
    const r = review(base, inc, { sourceKind: "project", sourceId: "u7m2q9xa-1", sourceRevision: 2, sourceCurrentRevision: 3, sourceAvailable: true, headRevision: 2 });
    expect(codes(r)).toEqual(expect.arrayContaining(["base-behind", "source-newer", "dropped"]));
    const gone = review(base, inc, { sourceKind: "project", sourceId: "u7m2q9xa-1", sourceRevision: 2, sourceCurrentRevision: null, sourceAvailable: false, headRevision: 1 });
    expect(codes(gone)).toContain("source-gone");
    expect(codes(gone)).not.toContain("base-behind");
  });
});

describe("reviewEntries / reviewGraph", () => {
  it("gives both sides of changed items and the Canon side of dropped ones", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44, A22], [{ s: A44.id, r: A22.id }])));
    const inc = canonFromProject("u7m2q9xa-1", 2, files([{ ...A44, tx: "Glutamate; GABA" }, A22], []));
    const diff = diffCanon(base, inc);
    const e = reviewEntries(base, inc, diff);
    expect(e["circuit:bna:29-30/side:left"].canon!.transmitter).toBe("Glutamate");
    expect(e["circuit:bna:29-30/side:left"].incoming!.transmitter).toBe("Glutamate; GABA");
    const dropped = Object.entries(e).find(([id]) => id.startsWith("connection:"))![1];
    expect(dropped.incoming).toBeNull();
    expect(dropped.canon!.sender).toBe("A44d(left)");
  });

  it("draws the incoming circuits, the Canon circuits they connect to, and the Canon connections among them", () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44, A22, A45], [{ s: A45.id, r: A22.id }])));
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44, { ...A22, tx: "Glutamate; GABA" }], [{ s: A44.id, r: A22.id }]));
    const g = reviewGraph(base, inc, diffCanon(base, inc));
    expect(g.nodes.map((n) => [n.label, n.change]).sort()).toEqual([
      ["A22c(left)", "changed"],
      ["A44d(left)", "unchanged"],
      ["A45c(left)", "context"],
    ]);
    const byPair = Object.fromEntries(g.edges.map((e) => [e.id, [e.change, e.inCanon]]));
    expect(byPair["bna:29-30/side:left|bna:75-76/side:left"]).toEqual(["added", false]);
    expect(byPair["bna:33-34/side:left|bna:75-76/side:left"]).toEqual(["context", true]);
    expect(parseReviewItemId("connection:a|b|[X, 2000]")).toEqual({ kind: "connection", key: "a|b|[X, 2000]" });
    expect(parseReviewItemId("nope:x")).toBeNull();
  });
});

describe("AI review packet and output", () => {
  const setup = () => {
    const base = canonWith(canonFromProject("u7m2q9xa-1", 1, files([A44, A22], [{ s: A22.id, r: A44.id }])));
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44, A22, A45], [{ s: A44.id, r: A22.id }, { s: A45.id, r: A22.id }]));
    const diff = diffCanon(base, inc);
    const { checks } = canonReviewChecks(base, inc, diff);
    const packet = buildCanonAiPacket(
      { id: "u7m2q9xa-c1", name: "Language", policy: "areas", headRevision: 1 },
      { no: 3, source: "project:u7m2q9xa-2", sourceName: "P2", sourceRevision: 1, baseRevision: 1 },
      diff,
      checks,
      reviewEntries(base, inc, diff),
      base,
      inc,
    );
    return { packet, checks };
  };

  it("builds a packet with both sides of changed items and the references", () => {
    const { packet } = setup();
    expect(packet.items.map((i) => i.change)).toContain("added");
    expect(packet.unchanged.length).toBeGreaterThan(0);
    expect(packet.references.map((r) => r.id)).toEqual(expect.arrayContaining(["[Catani, 2005]", "[Friederici, 2011]"]));
    const prompt = canonAiPrompt(packet, "ja");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain("Never recommend approving or rejecting");
    expect(CANON_AI_REVIEW_SCHEMA.required).toEqual(["summary", "flags", "verify", "comments"]);
  });

  it("keeps only the items, checks and references that are in the packet", () => {
    const { packet, checks } = setup();
    const item = packet.items[0].id;
    const check = checks.find((c) => c.code === "reverse")!.id;
    const reply = JSON.stringify({
      summary: "Adds A45c(left).",
      flags: [
        { severity: "high", title: "Direction", reason: "Reversed", items: [item, "circuit:made-up"], checks: [check, "X:y"], references: ["[Catani, 2005]", "[Nobody, 1999]"] },
        { severity: "weird", title: "  ", reason: "", items: [], checks: [], references: [] },
      ],
      verify: ["Read Fig. 2"],
      comments: [
        { item, text: "Please check the direction." },
        { item: "connection:none", text: "dropped" },
        { item: "", text: "General note" },
      ],
    });
    const r = parseCanonAiReview(reply, packet)!;
    expect(r.review.flags).toEqual([{ severity: "high", title: "Direction", reason: "Reversed", items: [item], checks: [check], references: ["[Catani, 2005]"] }]);
    expect(r.review.comments.map((c) => c.item)).toEqual([item, ""]);
    expect(r.dropped).toBe(4);
    expect(parseCanonAiReview("I approve this PR.", packet)).toBeNull();
    expect(parseCanonAiReview("```json\n" + reply + "\n```", packet)).not.toBeNull();
  });
});
