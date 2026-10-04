import { describe, expect, it } from "vitest";
import { buildGraphs, findFrgCandidates, formatFrgCandidates, isConnectedSet, type CircuitGraph } from "../src/index.js";

const graph = (roi: string[], outside: string[], edges: string): CircuitGraph => ({
  circuits: [...roi.map((id) => ({ id, roi: true })), ...outside.map((id) => ({ id, roi: false, transmitter: id === "INH" ? "GABA" : "" }))],
  connections: edges
    .trim()
    .split(/\s+/)
    .map((e) => {
      const [source, target] = e.split(">");
      return { source, target };
    }),
});

describe("findFrgCandidates", () => {
  it("lists loops and feedforward triangles before the pairs, and merges reciprocal pairs", () => {
    // A → B → C → A is a loop; A → B, B → D, A → D a feedforward triangle; D ↔ E reciprocal
    const c = findFrgCandidates(graph(["A", "B", "C", "D", "E"], [], "A>B B>C C>A B>D A>D D>E E>D"));
    expect(c.motifs.filter((m) => m.ucs.length > 2).map((m) => [m.kind, m.ucs.join(" ")])).toEqual([
      ["loop", "A B C"],
      ["feedforward", "A B D"],
    ]);
    const pairs = c.motifs.filter((m) => m.ucs.length === 2);
    expect(pairs.map((m) => `${m.kind}:${m.ucs.join(" ")}`)).toEqual(["pair:A B", "pair:A D", "pair:B C", "pair:B D", "pair:C A", "reciprocal:D E"]);
    expect(c.motifs.map((m) => m.id)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"]);
    expect(c.motifs[0].edges).toHaveLength(3);
  });

  it("finds a loop of four and leaves out a chain or a convergence", () => {
    const c = findFrgCandidates(graph(["A", "B", "C", "D", "X", "Y", "Z"], [], "A>B B>C C>D D>A X>Y Y>Z X>Z2"));
    expect(c.motifs.filter((m) => m.ucs.length > 2).map((m) => `${m.kind}:${m.ucs.join(" ")}`)).toEqual(["loop:A B C D"]);
    expect(c.components).toEqual([["A", "B", "C", "D"], ["X", "Y", "Z"]]);
  });

  it("covers the ways from ROI inputs to ROI outputs, with loops as one block", () => {
    const c = findFrgCandidates(graph(["A", "B", "C", "D"], ["IN", "OUT", "OUT2"], "IN>A A>B B>C C>B C>OUT A>D D>OUT2"));
    expect(c.pathways.map((w) => [w.inputs, w.blocks, w.outputs])).toEqual([
      [["IN"], [["A"], ["B", "C"]], ["OUT"]],
      [["IN"], [["A"], ["D"]], ["OUT2"]],
    ]);
    expect(c.truncated).toEqual({ motifs: false, pathways: false });
  });

  it("signs the connections and writes a compact prompt section", () => {
    const c = findFrgCandidates({
      circuits: [
        { id: "A", roi: true, transmitter: "GABA" },
        { id: "B", roi: true },
        { id: "C", roi: true },
      ],
      connections: [
        { source: "A", target: "B" },
        { source: "B", target: "C", comment: "excitatory" },
        { source: "A", target: "C" },
      ],
    });
    const text = formatFrgCandidates(c, "P/frg_candidates.json");
    expect(text).toContain("- M1 feedforward: A, B, C — A ⊣ B; B → C; A ⊣ C");
    expect(text).toContain("ROI-internal UCs: 3; connections among them: 3; components: 1");
  });
});

describe("isConnectedSet", () => {
  it("needs connections among the members themselves", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "C", target: "B" },
    ];
    expect(isConnectedSet(["A", "B", "C"], edges)).toBe(true);
    expect(isConnectedSet(["A", "C"], edges)).toBe(false);
    expect(isConnectedSet(["A"], edges)).toBe(true);
  });
});

describe("buildGraphs motifs", () => {
  it("marks the loops of the HCD graph and the GNs built on them", () => {
    const circuits = "Circuit ID,Comments\nA,ROI\nB,ROI\nC,ROI\nX,noROI(input)\n";
    const connections = "Sender Circuit ID (sCID),Receiver Circuit ID (rCID),Comments\nX,A,in\nA,B,e\nB,C,e\nC,A,e\n";
    const frg = "Node ID,Subnodes\nR.T,R.L\nR.L,U.A;U.B;U.C\nU.A,\nU.B,\nU.C,\n";
    const { hcd } = buildGraphs("P", { circuitsCsv: circuits, connectionsCsv: connections, frgCsv: frg });
    expect(hcd.motifs).toEqual([{ id: "M1", kind: "loop", ucs: ["A", "B", "C"], gns: ["R.L"] }]);
  });
});
