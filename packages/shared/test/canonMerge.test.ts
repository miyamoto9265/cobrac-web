import { describe, expect, it } from "vitest";
import { blockingConflicts, canonFromCanon, composeSeeds, canonFromProject, diffCanon, emptyCanonSnapshot, mergeCanon, type CanonIncoming, type CanonSnapshot } from "../src/index.js";

interface Uc {
  id: string;
  d: string;
  names?: string;
  tx?: string;
  os?: string;
}
interface Col {
  id: string;
  d: string;
  subs: string[];
}
interface Conn {
  s: string;
  r: string;
  ref: string;
  rel?: string;
  quote?: string;
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
  outputSemantics: u.os ?? "",
});

function files(ucs: Uc[], conns: Conn[], cols: Col[] = [], refs: [string, string][] = [["[Catani, 2005]", "10.1002/ana.20319"]]) {
  return {
    uc: JSON.stringify({
      ucs: ucs.map(uc),
      collections: cols.map((c) => ({ circuitId: c.id, descriptor: c.d, names: c.id, sourceOfId: "collection", subCircuits: c.subs, comments: "" })),
    }),
    connections: JSON.stringify({
      bif: [{ sender: "Broca area", receiver: "Wernicke area", comment: "", referenceIds: ["[Catani, 2005]"] }],
      connections: conns.map((c) => ({
        sender: c.s,
        senderRelation: c.rel ?? "<",
        senderInLiterature: "Broca's territory",
        receiver: c.r,
        receiverRelation: "=",
        receiverInLiterature: "Wernicke's territory",
        comment: "",
        referenceIds: [c.ref],
        taxon: "Human",
        measurementMethod: "DW-MRI",
        pointersOnLiterature: c.quote ?? "The arcuate fasciculus connects Broca's territory with Wernicke's territory in the human brain.",
        pointersOnFigure: "Fig. 2",
      })),
    }),
    references: JSON.stringify({ references: refs.map(([id, doi]) => ({ id, doi, literatureType: "Experimental results" })) }),
    frg: JSON.stringify({ nodes: [] }),
  };
}

const A44 = { id: "A44d@L", d: "BNA:29" };
const A44IT = { id: "A44d@L(L3,IT)", d: "BNA:29/lay:L3/cell:IT" };
const A44PT = { id: "A44d@L(L5,PT)", d: "BNA:29/lay:L5/cell:PT" };
const A44L6 = { id: "A44d@L(L6,CT)", d: "BNA:29/lay:L6/cell:CT" };
const A22 = { id: "A22c@L", d: "BNA:75" };

/** Canon at rev 1 holding one project's content. */
function canonWith(inc: CanonIncoming): CanonSnapshot {
  const base = emptyCanonSnapshot("u7m2q9xa-c1", "t0");
  const d = diffCanon(base, inc);
  expect(blockingConflicts(d, {})).toEqual([]);
  return mergeCanon(base, inc, d, {}, 1, "t1");
}

const fine = () => canonFromProject("u7m2q9xa-3", 2, files([A44IT, A44PT, A22], [{ s: A44IT.id, r: A22.id, ref: "[Catani, 2005]" }], [{ id: A44.id, d: A44.d, subs: [A44IT.id, A44PT.id] }]));
const coarse = () => canonFromProject("u7m2q9xa-1", 4, files([A44, A22], [{ s: A44.id, r: A22.id, ref: "[Catani, 2005]" }]));

describe("canonFromProject", () => {
  it("keys circuits by descriptor, resolves Sub-Circuits and splits roles off", () => {
    const inc = fine();
    expect(inc.circuits.map((c) => [c.circuitId, c.status])).toEqual([
      [A44IT.id, "uniform"],
      [A44PT.id, "uniform"],
      [A22.id, "uniform"],
      [A44.id, "collection"],
    ]);
    const col = inc.circuits.find((c) => c.circuitId === A44.id)!;
    expect(col.subCircuits).toEqual(["bna:29/lay:l3/cell:it", "bna:29/lay:l5/cell:pt"]);
    expect(inc.connections[0]).toMatchObject({ key: "bna:29/lay:l3/cell:it|bna:75|[Catani, 2005]", taxon: "Human", method: "DW-MRI", senderRelation: "<" });
    expect(inc.references[0]).toMatchObject({ key: "[Catani, 2005]", doi: "10.1002/ana.20319" });
    expect(inc.bif).toHaveLength(1);
    expect(inc.roles[0].ucRoles.map((r) => r.circuitId)).toEqual([A44IT.id, A44PT.id, A22.id]);
  });

  it("skips UCs without a descriptor", () => {
    const inc = canonFromProject("u7m2q9xa-9", 1, files([{ id: "PC", d: "" }, A22], []));
    expect(inc.skipped).toEqual(["PC"]);
    expect(inc.circuits.map((c) => c.circuitId)).toEqual([A22.id]);
  });
});

describe("diffCanon: conflict rules", () => {
  it("adds everything to an empty Canon without conflicts", () => {
    const d = diffCanon(emptyCanonSnapshot("c", "t"), fine());
    expect(d.summary).toMatchObject({ added: 7, errors: 0, warnings: 0 });
    // Reference IDs written as `[Author, Year]` are not bracketed twice
    expect(d.items.find((i) => i.kind === "connection")!.label).toBe("A44d@L(L3,IT) → A22c@L [Catani, 2005]");
    expect(d.items.find((i) => i.kind === "bif")!.label).toBe("Broca area → Wernicke area [Catani, 2005]");
  });

  it("C1: the same descriptor as Uniform in one project and Collection in another (resolvable, with impact)", () => {
    const canon = canonWith(coarse());
    const d = diffCanon(canon, fine());
    const c1 = d.conflicts.find((c) => c.code === "C1")!;
    expect(c1).toMatchObject({ severity: "error", key: "bna:29", canon: "uniform", incoming: "collection", resolvable: true });
    // the coarse project's A44d@L → A22c@L would end on a Collection
    expect(d.impacts).toEqual([{ projectId: "u7m2q9xa-1", keys: expect.arrayContaining(["bna:29"]) }]);
    expect(blockingConflicts(d, {}).map((c) => c.code)).toContain("C1");

    // adopting the Collection is the only resolution, so the fine UCs are not reported as C3
    expect(d.conflicts.some((c) => c.code === "C3")).toBe(false);
    // the other direction: the coarse project would make A44d@L uniform over the Canon's finer UCs
    expect(diffCanon(canonWith(fine()), coarse()).conflicts.map((c) => c.code)).toEqual(expect.arrayContaining(["C1", "C3"]));
    const next = mergeCanon(canon, fine(), d, { [c1.id]: "incoming" }, 2, "t2");
    expect(next.circuits.find((c) => c.key === "bna:29")!.status).toBe("collection");
    expect(next.connections.find((c) => c.sender === "bna:29")!.state).toBe("flagged");
  });

  it("C2: a subset of the decomposition is fine, a superset is a warning, a different split is an error", () => {
    const canon = canonWith(fine());
    const subset = canonFromProject("u7m2q9xa-4", 1, files([A44IT, A22], [], [{ id: A44.id, d: A44.d, subs: [A44IT.id] }]));
    expect(diffCanon(canon, subset).conflicts.filter((c) => c.code.startsWith("C2"))).toEqual([]);

    const superset = canonFromProject("u7m2q9xa-5", 1, files([A44IT, A44PT, A44L6, A22], [], [{ id: A44.id, d: A44.d, subs: [A44IT.id, A44PT.id, A44L6.id] }]));
    const ds = diffCanon(canon, superset);
    const c2b = ds.conflicts.find((c) => c.code === "C2b")!;
    expect(c2b.severity).toBe("warning");
    const next = mergeCanon(canon, superset, ds, { [c2b.id]: "incoming" }, 2, "t2");
    expect(next.circuits.find((c) => c.key === "bna:29")!.subCircuits).toHaveLength(3);

    const byLayer = canonFromProject("u7m2q9xa-6", 1, files([{ id: "A44d@L(L3)", d: "BNA:29/lay:L3" }, { id: "A44d@L(L5)", d: "BNA:29/lay:L5" }], [], [{ id: A44.id, d: A44.d, subs: ["A44d@L(L3)", "A44d@L(L5)"] }]));
    expect(diffCanon(canon, byLayer).conflicts.find((c) => c.code === "C2c")).toMatchObject({ severity: "error", resolvable: true });
  });

  it("C3: a finer circuit next to a uniform one in the merged Canon", () => {
    const canon = canonWith(canonFromProject("u7m2q9xa-1", 1, files([{ id: "NAC", d: "BNA:223-224" }], [])));
    const inc = canonFromProject("u7m2q9xa-2", 1, files([{ id: "NAC(shell,DRD1+)", d: "BNA:223-224/part:HOMBA:10341/mol:DRD1+" }], []));
    const c3 = diffCanon(canon, inc).conflicts.find((c) => c.code === "C3")!;
    expect(c3).toMatchObject({ severity: "error", key: "bna:223-224" });
    expect(c3.resolvable).toBeFalsy();
  });

  it("C4 / C6: Circuit ID and official name must match the descriptor", () => {
    const canon = canonWith(canonFromProject("u7m2q9xa-1", 1, files([{ id: "NAC(shell)", d: "BNA:223-224/part:HOMBA:10341", names: "nucleus accumbens shell" }], [])));
    const renamed = canonFromProject("u7m2q9xa-2", 1, files([{ id: "NAC(sh)", d: "BNA:223-224/part:HOMBA:10341", names: "accumbens shell" }], []));
    const codes = diffCanon(canon, renamed).conflicts.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["C4", "C6"]));
    const reused = canonFromProject("u7m2q9xa-3", 1, files([{ id: "NAC(shell)", d: "BNA:223-224/part:HOMBA:10342" }], []));
    expect(diffCanon(canon, reused).conflicts.map((c) => c.code)).toContain("C4");
  });

  it("C5: a connection end that is a Collection in the Canon", () => {
    const canon = canonWith(fine());
    const inc = canonFromProject("u7m2q9xa-7", 1, files([A44IT, A22], [{ s: A44.id, r: A22.id, ref: "[Catani, 2005]" }], [{ id: A44.id, d: A44.d, subs: [A44IT.id] }]));
    expect(diffCanon(canon, inc).conflicts.find((c) => c.code === "C5")).toMatchObject({ severity: "error", field: "sender", canon: "collection" });
    const asUc = canonFromProject("u7m2q9xa-8", 1, files([A44, A22], [{ s: A44.id, r: A22.id, ref: "[Catani, 2005]" }]));
    // written as a UC end instead, it is a status conflict with the Canon (and cannot become uniform over finer UCs)
    expect(diffCanon(canon, asUc).conflicts.map((c) => c.code)).toEqual(expect.arrayContaining(["C1", "C3"]));
  });

  it("C7 / C13: properties to choose, Output Semantics as information", () => {
    const canon = canonWith(canonFromProject("u7m2q9xa-1", 1, files([{ id: "VTA", d: "HOMBA:12261", tx: "Dopamine", os: "reward prediction error" }], [])));
    const inc = canonFromProject("u7m2q9xa-2", 1, files([{ id: "VTA", d: "HOMBA:12261", tx: "Dopamine; GABA", os: "salience" }], []));
    const d = diffCanon(canon, inc);
    const c7 = d.conflicts.find((c) => c.code === "C7")!;
    expect(c7).toMatchObject({ severity: "warning", field: "transmitter", choosable: true });
    expect(d.conflicts.find((c) => c.code === "C13")!.severity).toBe("info");
    expect(blockingConflicts(d, {})).toEqual([c7]);
    expect(mergeCanon(canon, inc, d, { [c7.id]: "canon" }, 2, "t").circuits[0].transmitter).toBe("Dopamine");
    expect(mergeCanon(canon, inc, d, { [c7.id]: "incoming" }, 2, "t").circuits[0].transmitter).toBe("Dopamine; GABA");
  });

  it("C8: the same Reference ID with another DOI is an error, the same DOI under another ID a warning", () => {
    const canon = canonWith(fine());
    const otherDoi = canonFromProject("u7m2q9xa-2", 1, files([A22], [], [], [["[Catani, 2005]", "10.1000/other"]]));
    expect(diffCanon(canon, otherDoi).conflicts.find((c) => c.code === "C8")!.severity).toBe("error");
    const alias = canonFromProject("u7m2q9xa-3", 1, files([A22], [], [], [["[Catani et al., 2005]", "10.1002/ANA.20319"]]));
    expect(diffCanon(canon, alias).conflicts.find((c) => c.code === "C8b")!.severity).toBe("warning");
  });

  it("C8c / C9c: references and quotes that failed their checks", () => {
    const f = files([A44, A22], [{ s: A44.id, r: A22.id, ref: "[Catani, 2005]" }]);
    const inc = canonFromProject("u7m2q9xa-2", 1, {
      ...f,
      referenceCheck: JSON.stringify({ references: [{ id: "[Catani, 2005]", status: "mismatch" }] }),
      quoteCheck: JSON.stringify({ quotes: [{ sender: A44.id, receiver: A22.id, referenceIds: ["[Catani, 2005]"], status: "not_found" }] }),
    });
    const codes = diffCanon(emptyCanonSnapshot("c", "t"), inc).conflicts.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["C8c", "C9c"]));
  });

  it("C9b: the same connection written differently; merging unions the sources", () => {
    const canon = canonWith(coarse());
    const inc = canonFromProject("u7m2q9xa-2", 1, files([A44, A22], [{ s: A44.id, r: A22.id, ref: "[Catani, 2005]", rel: "=" }]));
    const d = diffCanon(canon, inc);
    const c9 = d.conflicts.find((c) => c.code === "C9b")!;
    expect(c9).toMatchObject({ field: "senderRelation", canon: "<", incoming: "=" });
    const next = mergeCanon(canon, inc, d, { [c9.id]: "canon" }, 2, "t");
    expect(next.connections[0].senderRelation).toBe("<");
    expect(next.connections[0].sources).toEqual(["u7m2q9xa-1", "u7m2q9xa-2"]);
    expect(next.roles.map((r) => r.projectId)).toEqual(["u7m2q9xa-1", "u7m2q9xa-2"]);
  });

  it("lists what the project no longer has without removing it from the Canon", () => {
    const canon = canonWith(coarse());
    const again = canonFromProject("u7m2q9xa-1", 5, files([A22], []));
    const d = diffCanon(canon, again);
    expect(d.items.filter((i) => i.change === "dropped").map((i) => i.label)).toEqual(expect.arrayContaining([A44.id]));
    expect(mergeCanon(canon, again, d, {}, 2, "t").circuits.map((c) => c.circuitId)).toContain(A44.id);
  });
});

describe("canonFromCanon", () => {
  it("brings a Canon's head with its origins marked as coming through that Canon", () => {
    const canon = canonWith(fine());
    const inc = canonFromCanon(canon);
    expect(inc.projectId).toBe("u7m2q9xa-c1");
    expect(inc.circuits.every((c) => c.origin.via === "u7m2q9xa-c1@1" && c.origin.projectId === "u7m2q9xa-3")).toBe(true);
    const target = canonWith(coarse());
    const d = diffCanon(target, inc);
    expect(d.conflicts.find((c) => c.code === "C1")).toBeTruthy();
    // the sender's projects are not reported as affected; the target's own project is
    expect(d.impacts.map((i) => i.projectId)).toEqual(["u7m2q9xa-1"]);
    const next = mergeCanon(target, inc, d, { [d.conflicts.find((c) => c.code === "C1")!.id]: "incoming" }, 2, "t");
    expect(next.roles.map((r) => r.projectId)).toEqual(["u7m2q9xa-1", "u7m2q9xa-3"]);
  });
});

describe("composeSeeds", () => {
  it("merges seeds in priority order and keeps a conflicting one as pending unless it is settled", () => {
    const pending = composeSeeds("c", "t", [fine(), coarse()], {}, {});
    expect(pending.steps.map((s) => [s.projectId, s.outcome])).toEqual([
      ["u7m2q9xa-3", "merged"],
      ["u7m2q9xa-1", "pending"],
    ]);
    expect(pending.snapshot.revision).toBe(1);
    expect(pending.steps[1].blocking.map((c) => c.code)).toContain("C1");

    const excluded = composeSeeds("c", "t", [fine(), coarse()], {}, { "u7m2q9xa-1": "exclude" });
    expect(excluded.steps[1].outcome).toBe("excluded");

    // the earlier (fine) seed wins: the coarse one joins, its connection to the Collection is flagged
    const c1 = pending.steps[1].blocking.find((c) => c.code === "C1")!;
    const won = composeSeeds("c", "t", [fine(), coarse()], { [c1.id]: "canon" }, {});
    expect(won.steps[1].outcome).toBe("merged");
    expect(won.snapshot.circuits.find((c) => c.key === "bna:29")!.status).toBe("collection");
    expect(won.snapshot.connections.find((c) => c.sender === "bna:29")!.state).toBe("flagged");
    expect(won.snapshot.roles.map((r) => r.projectId)).toEqual(["u7m2q9xa-1", "u7m2q9xa-3"]);
  });
});
