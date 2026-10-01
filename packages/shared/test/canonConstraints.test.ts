import { describe, expect, it } from "vitest";
import {
  canonAgentFiles,
  canonAlignInstruction,
  canonCheckedQuotes,
  canonCheckedReferences,
  canonFollowStatus,
  canonFromProject,
  canonGenerationProblems,
  canonSpecNote,
  diffCanon,
  emptyCanonSnapshot,
  mergeCanon,
  type CanonRunInfo,
  type CanonSnapshot,
} from "../src/index.js";

const uc = (id: string, d: string) => ({
  circuitId: id,
  descriptor: d,
  names: id,
  roi: "internal",
  sourceOfId: "BNA",
  transmitter: "Glutamate",
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
const conn = (s: string, r: string) => ({
  sender: s,
  senderRelation: "<",
  senderInLiterature: "area 44",
  receiver: r,
  receiverRelation: "=",
  receiverInLiterature: "area 22",
  comment: "",
  referenceIds: ["[Catani, 2005]"],
  taxon: "Human",
  measurementMethod: "DW-MRI",
  pointersOnLiterature: "The arcuate fasciculus connects Broca's territory with Wernicke's territory in humans.",
  pointersOnFigure: "Fig. 2",
});
function files(ucs: ReturnType<typeof uc>[], collections: unknown[], conns: ReturnType<typeof conn>[]) {
  return {
    uc: JSON.stringify({ ucs, collections }),
    connections: JSON.stringify({ bif: [], connections: conns }),
    references: JSON.stringify({ references: [{ id: "[Catani, 2005]", doi: "10.1002/ana.20319", literatureType: "Experimental results" }] }),
    referenceCheck: JSON.stringify({ references: [{ id: "[Catani, 2005]", status: "verified" }] }),
    quoteCheck: JSON.stringify({ quotes: [{ sender: "A44d(L3.IT.left)", receiver: "A22c(left)", referenceIds: ["[Catani, 2005]"], status: "verified_fulltext" }] }),
  };
}
const fineFiles = files(
  [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left"), uc("A22c(left)", "BNA:75-76/side:left")],
  [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"], comments: "" }],
  [conn("A44d(L3.IT.left)", "A22c(left)")],
);

function canonRev1(): CanonSnapshot {
  const base = emptyCanonSnapshot("u7m2q9xa-c1", "t0");
  const inc = canonFromProject("u7m2q9xa-2", 3, fineFiles);
  return mergeCanon(base, inc, diffCanon(base, inc), {}, 1, "t1");
}
const info = (): CanonRunInfo => ({ canonId: "u7m2q9xa-c1", name: "Language", policy: "area × projection class", revision: 1 });

describe("files and spec note for the agent", () => {
  it("writes circuits with Circuit IDs, connections, references and what the project already uses", () => {
    const out = canonAgentFiles(canonRev1(), info(), "u7m2q9xa-2");
    expect(Object.keys(out).sort()).toEqual(["README.md", "circuits.json", "connections.json", "references.json", "relevant.json"]);
    const circuits = JSON.parse(out["circuits.json"]).circuits;
    expect(circuits.find((c: { circuitId: string }) => c.circuitId === "A44d(left)")).toMatchObject({ uniform: false, subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"] });
    expect(JSON.parse(out["connections.json"]).connections[0]).toMatchObject({ sender: "A44d(L3.IT.left)", receiver: "A22c(left)", quoteCheck: "verified_fulltext" });
    expect(out["README.md"]).toContain("area × projection class");
    // a new project has no role yet: no relevant.json
    expect(canonAgentFiles(canonRev1(), info(), "u7m2q9xa-9")["relevant.json"]).toBeUndefined();
  });

  it("tells the agent that conflicts come back as problems to fix", () => {
    expect(canonSpecNote(info())).toContain("The validator enforces these rules");
    expect(canonSpecNote(info())).not.toContain("advisory");
    expect(canonAgentFiles(canonRev1(), info(), "u7m2q9xa-2")["README.md"]).not.toContain("Constraint strength");
  });
});

describe("canonGenerationProblems", () => {
  const coarse = files([uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [], [conn("A44d(left)", "A22c(left)")]);

  it("turns rule violations into errors", () => {
    const r = canonGenerationProblems(canonRev1(), info(), "u7m2q9xa-5", coarse);
    expect(r.errors.join("\n")).toContain("`bna:29-30/side:left` is a Collection in the Canon but a UC here");
    expect(r.errors.every((e) => e.startsWith('Canon "Language" rev 1: '))).toBe(true);
  });

  it("ignores the constraint mode stored by 0.12.0 (an advisory Canon is checked like any other)", () => {
    const legacy = { ...info(), constraintMode: "advisory" } as CanonRunInfo;
    expect(canonGenerationProblems(canonRev1(), legacy, "u7m2q9xa-5", coarse)).toEqual(canonGenerationProblems(canonRev1(), info(), "u7m2q9xa-5", coarse));
    expect(canonGenerationProblems(canonRev1(), legacy, "u7m2q9xa-5", coarse).errors.length).toBeGreaterThan(0);
  });

  it("accepts a project that follows the Canon, including a subset of a decomposition", () => {
    const subset = files(
      [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A22c(left)", "BNA:75-76/side:left")],
      [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)"], comments: "" }],
      [conn("A44d(L3.IT.left)", "A22c(left)")],
    );
    expect(canonGenerationProblems(canonRev1(), info(), "u7m2q9xa-6", subset)).toEqual({ errors: [], notes: [] });
  });
});

describe("checked records and follow status", () => {
  it("lists references and quotes the Canon already checked", () => {
    const s = canonRev1();
    expect(canonCheckedReferences(s).get("[Catani, 2005]")).toEqual({ doi: "10.1002/ana.20319", pmid: "" });
    expect(canonCheckedQuotes(s).get("A44d(L3.IT.left)|A22c(left)|[Catani, 2005]")?.status).toBe("verified_fulltext");
  });

  it("gives the agent current Circuit IDs and keys from a Canon written in the older forms", () => {
    const s = canonRev1();
    const old = (id: string) => id.replace(/^(\w+)\((.*?)\.?left\)$/, (_, h: string, items: string) => `${h}@L${items ? `(${items.replaceAll(".", ",")})` : ""}`);
    const oldKey = (k: string) => k.replace(/^bna:(\d+)-\d+(.*)\/side:left$/, "bna:$1$2");
    for (const c of s.circuits) (c.circuitId = old(c.circuitId)), (c.key = oldKey(c.key)), (c.subCircuits = c.subCircuits.map(oldKey));
    for (const c of s.connections) {
      (c.senderCircuitId = old(c.senderCircuitId)), (c.receiverCircuitId = old(c.receiverCircuitId));
      (c.sender = oldKey(c.sender)), (c.receiver = oldKey(c.receiver)), (c.key = `${c.sender}|${c.receiver}|${c.referenceId}`);
    }
    for (const r of s.roles) for (const u of r.ucRoles) u.key = oldKey(u.key);
    expect(s.circuits.map((c) => c.circuitId).sort()).toEqual(["A22c@L", "A44d@L", "A44d@L(L3,IT)", "A44d@L(L5,PT)"]);
    expect(s.circuits.map((c) => c.key)).toContain("bna:29/lay:l3/cell:it");

    const out = canonAgentFiles(s, info(), "u7m2q9xa-2");
    const circuits = JSON.parse(out["circuits.json"]).circuits;
    expect(circuits.map((c: { circuitId: string }) => c.circuitId).sort()).toEqual(["A22c(left)", "A44d(L3.IT.left)", "A44d(L5.PT.left)", "A44d(left)"]);
    expect(circuits.find((c: { circuitId: string }) => c.circuitId === "A44d(left)").subCircuits).toEqual(["A44d(L3.IT.left)", "A44d(L5.PT.left)"]);
    expect(JSON.parse(out["connections.json"]).connections[0]).toMatchObject({ sender: "A44d(L3.IT.left)", receiver: "A22c(left)" });
    expect(JSON.parse(out["relevant.json"]).circuitIds.sort()).toEqual(["A22c(left)", "A44d(L3.IT.left)", "A44d(L5.PT.left)", "A44d(left)"]);
    expect(canonCheckedQuotes(s).get("A44d(L3.IT.left)|A22c(left)|[Catani, 2005]")?.status).toBe("verified_fulltext");
    expect(canonGenerationProblems(s, info(), "u7m2q9xa-6", fineFiles).errors).toEqual([]);
  });

  it("is current, behind, or affected by what changed for the project", () => {
    const rev1 = canonRev1();
    expect(canonFollowStatus(rev1, rev1, "u7m2q9xa-2").state).toBe("current");
    const other = canonFromProject("u7m2q9xa-7", 1, files([uc("VTA", "HOMBA:12261")], [], []));
    const rev2 = mergeCanon(rev1, other, diffCanon(rev1, other), {}, 2, "t2");
    expect(canonFollowStatus(rev1, rev2, "u7m2q9xa-2")).toMatchObject({ pinned: 1, head: 2, state: "behind", affected: [] });

    // a coarse Canon (A44d(left) uniform) that the fine project turns into a Collection affects the coarse project
    const coarseBase = emptyCanonSnapshot("c", "t");
    const coarse = canonFromProject("u7m2q9xa-1", 1, files([uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [], [conn("A44d(left)", "A22c(left)")]));
    const c1 = mergeCanon(coarseBase, coarse, diffCanon(coarseBase, coarse), {}, 1, "t");
    const fine = canonFromProject("u7m2q9xa-2", 1, fineFiles);
    const d = diffCanon(c1, fine);
    const c2 = mergeCanon(c1, fine, d, { [d.conflicts.find((x) => x.code === "C1")!.id]: "incoming" }, 2, "t");
    const st = canonFollowStatus(c1, c2, "u7m2q9xa-1");
    expect(st.state).toBe("affected");
    expect(st.affected.map((a) => a.reason)).toEqual(expect.arrayContaining(["now a Collection", "ends on a Collection"]));
    expect(canonAlignInstruction(info(), st)).toContain("A44d(left): now a Collection");
  });
});
