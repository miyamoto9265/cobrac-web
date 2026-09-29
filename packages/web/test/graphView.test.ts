import { describe, expect, it } from "vitest";
import type { FrgGraph, FrgNode } from "@cobrac/shared";
import { circuitsUnderGroup, frgIdForCircuit, groupBoxes, groupLevels, groupParents, lineage, neighborhood, parentGroupsOfCircuit, pathFromRoot, searchNodes } from "../src/lib/graphView";

const nodes = [
  { id: "LC4", label: "LC4", sublabel: "Lobula columnar neuron LC4" },
  { id: "L2", label: "L2", sublabel: "Lamina monopolar cell L2" },
  { id: "T4", label: "T4", sublabel: "T4 direction-selective cells", search: "UC_T4_motion" },
  { id: "LC10", label: "LC10", sublabel: "Lobula columnar neuron LC10" },
  { id: "U.Mi1", label: "U.Mi1" },
];

describe("searchNodes", () => {
  it("ranks exact, prefix, substring, then other text", () => {
    expect(searchNodes(nodes, "l2").map((n) => n.id)).toEqual(["L2"]);
    expect(searchNodes(nodes, "lc").map((n) => n.id)).toEqual(["LC4", "LC10"]);
    expect(searchNodes(nodes, "lobula").map((n) => n.id)).toEqual(["LC4", "LC10"]);
    expect(searchNodes(nodes, "motion").map((n) => n.id)).toEqual(["T4"]);
  });
  it("matches FRG ids without their U./R. prefix", () => {
    expect(searchNodes(nodes, "mi1").map((n) => n.id)).toEqual(["U.Mi1"]);
  });
  it("returns nothing for a blank query and respects the limit", () => {
    expect(searchNodes(nodes, "  ")).toEqual([]);
    expect(searchNodes(nodes, "l", 2)).toHaveLength(2);
  });
});

const edges = [
  { id: "a", source: "A", target: "B" },
  { id: "b", source: "B", target: "C" },
  { id: "c", source: "C", target: "D" },
  { id: "d", source: "X", target: "B" },
  { id: "loop", source: "B", target: "B" },
];

describe("neighborhood / lineage", () => {
  it("neighborhood keeps direct neighbours and their edges only", () => {
    const r = neighborhood(edges, "B");
    expect([...r.nodes].sort()).toEqual(["A", "B", "C", "X"]);
    expect([...r.edges].sort()).toEqual(["a", "b", "d", "loop"]);
  });
  it("lineage follows every ancestor and descendant", () => {
    const r = lineage(edges, "C");
    expect([...r.nodes].sort()).toEqual(["A", "B", "C", "D", "X"]);
    expect(r.edges.has("c")).toBe(true);
  });
});

const fn = (id: string, kind: FrgNode["kind"], subnodes: string[], parents: string[], circuitId: string | null = null): FrgNode => ({
  id,
  label: id,
  kind,
  level: 0,
  subnodes,
  parents,
  comments: "",
  requirement: "",
  requirementRealization: "",
  capability: "",
  mechanism: "",
  implementation: "",
  outputSemantics: "",
  circuitId,
});
const frg: Pick<FrgGraph, "nodes"> = {
  nodes: [
    fn("R.Top", "tlf", ["R.Motion", "R.Feature"], []),
    fn("R.Motion", "gn", ["U.T4", "U.T5"], ["R.Top"]),
    fn("R.Feature", "gn", ["U.T4", "U.LC4"], ["R.Top"]),
    fn("U.T4", "uc", [], ["R.Motion", "R.Feature"], "T4"),
    fn("U.T5", "uc", [], ["R.Motion"], "T5"),
    fn("U.LC4", "uc", [], ["R.Feature"], "LC4"),
  ],
};

describe("HCD ↔ FRG links", () => {
  it("maps a circuit to its FRG UC, and reports circuits outside the FRG", () => {
    expect(frgIdForCircuit(frg, "T4")).toBe("U.T4");
    expect(frgIdForCircuit(frg, "R1-R6")).toBeNull();
    expect(frgIdForCircuit(null, "T4")).toBeNull();
  });
  it("lists the groups that contain a UC", () => {
    expect(parentGroupsOfCircuit(frg, "T4")).toEqual(["R.Motion", "R.Feature"]);
  });
  it("collects every circuit under a group", () => {
    expect(circuitsUnderGroup(frg, "R.Top").sort()).toEqual(["LC4", "T4", "T5"]);
    expect(circuitsUnderGroup(frg, "R.Motion").sort()).toEqual(["T4", "T5"]);
  });
  it("builds the breadcrumb from the root", () => {
    expect(pathFromRoot(frg, "U.T4")).toEqual(["R.Top", "R.Motion", "U.T4"]);
  });
});

describe("Collection boxes", () => {
  const groups = [
    { id: "Loop", members: ["GC", "PC", "IO"] },
    { id: "Cb", members: ["GC", "PC"] },
    { id: "Empty", members: ["Missing"] },
  ];
  const rects = { GC: { x: 0, y: 100, width: 100, height: 50 }, PC: { x: 200, y: 100, width: 100, height: 50 }, IO: { x: 0, y: 300, width: 100, height: 50 } };

  it("nests levels by member sets", () => {
    expect(Object.fromEntries(groupLevels(groups))).toEqual({ Loop: 1, Cb: 0, Empty: 0 });
  });

  it("boxes the placed members with padding and label room, outer boxes first", () => {
    expect(groupBoxes(groups, rects, 10, 10, 20)).toEqual([
      { id: "Loop", level: 1, x: -20, y: 56, width: 340, height: 314 },
      { id: "Cb", level: 0, x: -10, y: 70, width: 320, height: 90 },
    ]);
  });

  it("gives each node and nested group its smallest enclosing group", () => {
    expect(Object.fromEntries(groupParents(groups))).toEqual({ GC: "Cb", PC: "Cb", IO: "Loop", Cb: "Loop", Missing: "Empty" });
  });
});
