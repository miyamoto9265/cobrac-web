import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildGraphs, parseCsv, parseCsvObjects, proposeProjectId } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

describe("parseCsv", () => {
  it("handles quotes, embedded commas and newlines", () => {
    const rows = parseCsv('a,b\n"x, y","line1\nline2"\n"he said ""hi""",z\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", "line1\nline2"],
      ['he said "hi"', "z"],
    ]);
  });
  it("parses objects with headers", () => {
    const objs = parseCsvObjects("A,B\n1,2\n3,4");
    expect(objs).toEqual([
      { A: "1", B: "2" },
      { A: "3", B: "4" },
    ]);
  });
});

describe("buildGraphs (VOR sample)", () => {
  const { hcd, frg } = buildGraphs("VOR", {
    circuitsCsv: fx("Circuits.csv"),
    connectionsCsv: fx("Connections.csv"),
    frgCsv: fx("FRG.csv"),
    referencesCsv: fx("References.csv"),
  });

  it("builds HCD nodes and edges", () => {
    expect(hcd.nodes.map((n) => n.id).sort()).toEqual(["BC", "GC", "GoC", "IO-DC", "MVN", "OMN", "PC", "SC"]);
    expect(hcd.edges.length).toBe(13);
    expect(hcd.references.length).toBe(8);
  });

  it("classifies ROI membership", () => {
    const cls = Object.fromEntries(hcd.nodes.map((n) => [n.id, n.roiClass]));
    expect(cls.GC).toBe("roi");
    expect(cls.PC).toBe("roi");
    expect(cls["IO-DC"]).toBe("noROI_input");
    expect(cls.OMN).toBe("noROI_output");
    expect(cls.MVN).toBe("noROI_both");
  });

  it("attaches function fields from FRG.csv to UC nodes", () => {
    const gc = hcd.nodes.find((n) => n.id === "GC")!;
    expect(gc.outputSemantics).toContain("[GC]");
    expect(gc.implementation).toContain("sigma");
    expect(gc.projectedCircuits).toEqual(["PC", "GoC", "BC", "SC"]);
    const e = hcd.edges.find((e) => e.source === "GC" && e.target === "PC")!;
    expect(e.outputSemantics).toBe(gc.outputSemantics);
  });

  it("builds FRG hierarchy with TLF root and levels", () => {
    const root = frg.nodes.find((n) => n.kind === "tlf")!;
    expect(root.id).toBe("R.VOR-Learning");
    expect(root.level).toBe(0);
    const scc = frg.nodes.find((n) => n.id === "R.Sensory-Context-Coding")!;
    expect(scc.kind).toBe("gn");
    expect(scc.level).toBe(1);
    expect(scc.parents).toEqual(["R.VOR-Learning"]);
    const ugc = frg.nodes.find((n) => n.id === "U.GC")!;
    expect(ugc.kind).toBe("uc");
    expect(ugc.circuitId).toBe("GC");
    expect(ugc.level).toBe(2);
    // U.PC is shared by two GNs
    const upc = frg.nodes.find((n) => n.id === "U.PC")!;
    expect(upc.parents.sort()).toEqual(["R.CF-PF-Plasticity", "R.Output-Timing-Control"]);
    expect(frg.edges.length).toBe(10);
  });
});

describe("proposeProjectId", () => {
  it("creates ASCII ids", () => {
    expect(proposeProjectId("Cerebellum flocculus", "VOR learning")).toBe("VORLearning_CerebellumFlocculus");
    expect(proposeProjectId("小脳", "VOR学習")).toMatch(/^(VOR|Project_)/);
  });
});
