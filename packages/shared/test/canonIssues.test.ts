import { describe, expect, it } from "vitest";
import {
  applyCanonIssues,
  canonAgentFiles,
  canonAlignInstruction,
  canonFollowStatus,
  canonFromCanon,
  canonFromProject,
  canonGenerationProblems,
  canonIssueScope,
  diffCanon,
  emptyCanonSnapshot,
  issuesTouchedByDiff,
  mergeCanon,
  raiseCanonIssue,
  readCanonIssueInput,
  settleCanonIssues,
  upstreamCanonIds,
  upstreamIssues,
  type CanonIssueInput,
  type CanonRunInfo,
  type CanonSnapshot,
} from "../src/index.js";

const uc = (id: string, d: string, names = id) => ({
  circuitId: id,
  descriptor: d,
  names,
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
  };
}

const P1 = "u7m2q9xa-2";
const P2 = "u7m2q9xa-3";
const CANON = "c4h8w2rk";
// P1: a Collection A44d(left) split into two layers, one of them connected to A22c(left)
const p1Files = files(
  [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left"), uc("A22c(left)", "BNA:75-76/side:left")],
  [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"], comments: "" }],
  [conn("A44d(L3.IT.left)", "A22c(left)")],
);
// P2: reuses A22c(left) and the same paper for another connection
const p2Files = files([uc("A45c(left)", "BNA:31-32/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [], [conn("A45c(left)", "A22c(left)")]);

/** rev 1 from P1, rev 2 with P2 */
function canonRev2(): CanonSnapshot {
  let s = emptyCanonSnapshot(CANON, "t0");
  for (const [p, f, pr] of [[P1, p1Files, 1], [P2, p2Files, 2]] as const) {
    const inc = canonFromProject(p, 1, f);
    s = applyCanonIssues(mergeCanon(s, inc, diffCanon(s, inc), {}, pr, `t${pr}`));
  }
  return s;
}
const actor = { userId: "u_owner", name: "Owner" };
const key = (s: CanonSnapshot, id: string) => s.circuits.find((c) => c.circuitId === id)!.key;
function raise(s: CanonSnapshot, input: Omit<CanonIssueInput, "kind" | "reason"> & Partial<CanonIssueInput>) {
  const r = raiseCanonIssue(s, { kind: "other", reason: "wrong", ...input }, actor, "t9");
  if ("error" in r) throw new Error(r.error);
  return r;
}
const info = (revision: number): CanonRunInfo => ({ canonId: CANON, name: "Language", policy: "", revision });

describe("reach of a problem", () => {
  it("goes down a Collection's Sub-Circuits to the connections that end on them, and to the projects that use them", () => {
    const s = canonRev2();
    const scope = canonIssueScope(s, { targetKind: "circuit", targetKey: key(s, "A44d(left)") });
    expect(scope.circuits.map((k) => s.circuits.find((c) => c.key === k)!.circuitId).sort()).toEqual(["A44d(L3.IT.left)", "A44d(L5.PT.left)", "A44d(left)"]);
    expect(scope.connections).toHaveLength(1);
    expect(scope.projects).toEqual([P1]);
    expect(scope.references).toEqual([]);
  });

  it("from a reference reaches every connection that cites it and every project that pushed one", () => {
    const s = canonRev2();
    const scope = canonIssueScope(s, { targetKind: "reference", targetKey: "[Catani, 2005]" });
    expect(scope.connections).toHaveLength(2);
    expect(scope.projects).toEqual([P1, P2]);
  });

  it("from a shared UC reaches the projects that use it in their role layer", () => {
    const s = canonRev2();
    expect(canonIssueScope(s, { targetKind: "circuit", targetKey: key(s, "A22c(left)") }).projects).toEqual([P1, P2]);
  });
});

describe("reporting and settling", () => {
  it("writes the next revision with the problem and flags what it reaches", () => {
    const s = canonRev2();
    const { snapshot, issue } = raise(s, { targetKind: "circuit", targetKey: key(s, "A44d(left)") });
    expect(snapshot.revision).toBe(3);
    expect(issue).toMatchObject({ id: "I1", label: "A44d(left)", raisedRevision: 3, raisedByName: "Owner" });
    const flagged = snapshot.circuits.filter((c) => c.state === "flagged").map((c) => c.circuitId).sort();
    expect(flagged).toEqual(["A44d(L3.IT.left)", "A44d(L5.PT.left)", "A44d(left)"]);
    expect(snapshot.circuits.find((c) => c.circuitId === "A44d(L3.IT.left)")!.issueIds).toEqual(["I1"]);
    expect(snapshot.circuits.find((c) => c.circuitId === "A22c(left)")).toMatchObject({ state: "valid" });
    expect(snapshot.circuits.find((c) => c.circuitId === "A22c(left)")!.issueIds).toBeUndefined();
    // the next one is I2
    expect(raise(snapshot, { targetKind: "reference", targetKey: "[Catani, 2005]" }).issue.id).toBe("I2");
  });

  it("refuses an entry the revision does not have and checks the input", () => {
    expect(raiseCanonIssue(canonRev2(), { targetKind: "circuit", targetKey: "bna:1-2", kind: "other", reason: "x" }, actor, "t9")).toEqual({ error: expect.any(String) });
    expect(readCanonIssueInput({ targetKind: "circuit", targetKey: "k", kind: "anchor", reason: "  " })).toEqual({ error: expect.any(String) });
    expect(readCanonIssueInput({ targetKind: "x", targetKey: "k", kind: "anchor", reason: "r" })).toEqual({ error: expect.any(String) });
    expect(readCanonIssueInput({ targetKind: "reference", targetKey: "[A, 1]", kind: "reference", reason: " retracted \r\n" })).toEqual({ targetKind: "reference", targetKey: "[A, 1]", kind: "reference", reason: "retracted" });
  });

  it("dismissing removes the flags; withdrawing a reference withdraws the connections that cite it", () => {
    const s = canonRev2();
    const r = raise(s, { targetKind: "reference", targetKey: "[Catani, 2005]" }).snapshot;
    expect(r.connections.every((c) => c.state === "flagged")).toBe(true);
    const dismissed = settleCanonIssues({ ...r, revision: 4 }, ["I1"], "dismissed", actor, "t10").snapshot;
    expect(dismissed.connections.every((c) => c.state === "valid" && !c.issueIds)).toBe(true);
    expect(dismissed.issues![0]).toMatchObject({ resolution: "dismissed", resolvedRevision: 4 });
    const gone = settleCanonIssues({ ...r, revision: 4 }, ["I1"], "invalidated", actor, "t10");
    expect(gone.settled).toEqual(["I1"]);
    expect(gone.snapshot.references[0].state).toBe("invalidated");
    expect(gone.snapshot.connections.every((c) => c.state === "invalidated")).toBe(true);
    // settling again changes nothing
    expect(settleCanonIssues(gone.snapshot, ["I1"], "fixed", actor, "t11").settled).toEqual([]);
  });

  it("keeps the problems through a merge and flags a connection pushed onto a flagged circuit", () => {
    const s = canonRev2();
    const r = raise(s, { targetKind: "circuit", targetKey: key(s, "A45c(left)") }).snapshot;
    const p3 = files([uc("A45c(left)", "BNA:31-32/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left")], [], [conn("A45c(left)", "A44d(L5.PT.left)")]);
    const inc = canonFromProject("u7m2q9xa-4", 1, p3);
    const merged = applyCanonIssues(mergeCanon(r, inc, diffCanon(r, inc), {}, 3, "t11"));
    expect(merged.issues).toHaveLength(1);
    const added = merged.connections.find((c) => c.receiverCircuitId === "A44d(L5.PT.left)")!;
    expect(added).toMatchObject({ state: "flagged", issueIds: ["I1"] });
  });
});

describe("following the Canon", () => {
  it("a project that uses a reached entry is affected by a problem reported after its pin, and again when it is fixed", () => {
    const s2 = canonRev2();
    const s3 = raise(s2, { targetKind: "reference", targetKey: "[Catani, 2005]", reason: "retracted in 2024" }).snapshot;
    const st = canonFollowStatus(s2, s3, P2);
    expect(st.state).toBe("affected");
    expect(st.affected).toEqual([expect.objectContaining({ issue: "I1", label: "[Catani, 2005]", reason: expect.stringContaining("retracted in 2024") })]);
    expect(canonAlignInstruction(info(3), st)).toContain("check this project's copy");

    // pinned at the report: nothing new until it is fixed
    const s4 = settleCanonIssues({ ...s3, revision: 4 }, ["I1"], "fixed", actor, "t10").snapshot;
    expect(canonFollowStatus(s3, s4, P2).affected).toEqual([expect.objectContaining({ issue: "I1", reason: expect.stringContaining("fixed") })]);
    // a dismissed problem asks nothing of the projects
    const d4 = settleCanonIssues({ ...s3, revision: 4 }, ["I1"], "dismissed", actor, "t10").snapshot;
    expect(canonFollowStatus(s3, d4, P2).state).toBe("behind");
  });

  it("a project the problem does not reach is only behind", () => {
    const s2 = canonRev2();
    const s3 = raise(s2, { targetKind: "circuit", targetKey: key(s2, "A44d(left)") }).snapshot;
    expect(canonFollowStatus(s2, s3, P2).state).toBe("behind");
    expect(canonFollowStatus(s2, s3, P1).state).toBe("affected");
  });
});

describe("generation with a problem in the Canon", () => {
  it("tells the agent the reasons and does not send back a project that differs from a flagged entry", () => {
    const s2 = canonRev2();
    const s3 = raise(s2, { targetKind: "circuit", targetKey: key(s2, "A22c(left)"), reason: "anchor should be A22r" }).snapshot;
    const out = canonAgentFiles(s3, info(3), P2);
    const a22 = JSON.parse(out["circuits.json"]).circuits.find((c: { circuitId: string }) => c.circuitId === "A22c(left)");
    expect(a22).toMatchObject({ state: "flagged", problems: ["A22c(left): anchor should be A22r"] });
    expect(out["README.md"]).toContain("problems");

    const renamed = files([uc("A45c(left)", "BNA:31-32/side:left"), uc("A22c(left)", "BNA:75-76/side:left", "Another name")], [], [conn("A45c(left)", "A22c(left)")]);
    expect(canonGenerationProblems(s2, info(2), P2, renamed).errors.join("\n")).toContain("official name");
    expect(canonGenerationProblems(s3, info(3), P2, renamed).errors).toEqual([]);
  });
});

describe("pull requests and other Canons", () => {
  it("names the open problems whose entry a diff changes", () => {
    const s2 = canonRev2();
    const s3 = raise(s2, { targetKind: "circuit", targetKey: key(s2, "A22c(left)") }).snapshot;
    const renamed = files([uc("A22c(left)", "BNA:75-76/side:left", "Another name")], [], []);
    const diff = diffCanon(s3, canonFromProject(P2, 2, renamed));
    expect(issuesTouchedByDiff(s3, diff).map((i) => i.id)).toEqual(["I1"]);
  });

  it("shows a Canon the open problems of the Canon its entries came from", () => {
    const source = raise(canonRev2(), { targetKind: "circuit", targetKey: key(canonRev2(), "A22c(left)") }).snapshot;
    const target0 = emptyCanonSnapshot("c9x8w7v6", "t0");
    const inc = canonFromCanon(source);
    const target = applyCanonIssues(mergeCanon(target0, inc, diffCanon(target0, inc), {}, 1, "t1"));
    expect(upstreamCanonIds(target)).toEqual([CANON]);
    expect(upstreamIssues(target, source).map((i) => i.id)).toEqual(["I1"]);
    // the problem itself does not travel with the entries
    expect(target.issues).toBeUndefined();
  });
});
