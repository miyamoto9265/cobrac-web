import { describe, expect, it } from "vitest";
import { cypherString, cypherValue, dollarTag } from "../src/lib/bradb/cypher.js";
import { loadBundle, normalizeSourceOfId, readProjectSheet, resolveColumns, sheetsFromPackage, splitCapabilityMechanism, splitEnumerated, validateBundle } from "../src/lib/bradb/sheets.js";

const P = "any id/with spaces@x";

const project = `Contributor,Project ID,List of contributors,Description,BRA version
Alice A.,${P},Alice A.,VOR in the flocculus.,CoBRAC-v1-1
,,,,
Sheet Name,Review End Line,,,
References,2,,,
Circuits,4,,,
Connections,2,,,
FRG,3,,,
`;
const circuits = `Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor,Sub-Circuits,Uniform
ROI_${P},collection,cerebellar flocculus,,,Region of interest of the project,,GC;PC,FALSE
GC,DHBA,granule cells,Glutamate,excitatory,,HOMBA:1,,TRUE
PC,"[Ito, 1984]",Purkinje cells,GABA,Glutamatergic,,HOMBA:2,,TRUE
OUT,BNA,beyond the review end line,,,,,,TRUE
`;
const connections = `Sender Circuit ID (sCID),Receiver Circuit ID (rCID),Comments,Reference ID,Taxon,Measurement method,Pointers on literature,Pointers on figure,sCID relation,Notation of sCID in Literature,rCID relation,Notation of rCID in Literature
GC,PC,parallel fibres; feedforward excitation,"[Ito, 1984]",macaque,,p. 3,,=,granule cells,'=,Purkinje cells
`;
const frg = `Node ID,Subnodes,Circuit ID,Projected Circuits,Capability,Mechanism,Implementation of Uniform Circuit,Requirements Realization by Interface,Requirements,Output Semantics,Comments
R.VOR,U.GC;U.PC,,,adapt the gain,,,,keep the image still,,
U.GC,,GC,PC;,expand,sparse coding,granule layer,realized by mossy fibres,code context,context,
X.extra,,,,,,,,,,
`;
const references = `Reference ID,DOI,Literature type,Alternative URL
"[Ito, 1984]",10.1/ito,Review,
"[Beyond, 2000]",N/A,,
`;
const files = {
  [`${P}_project.csv`]: project,
  [`${P}_circuits.csv`]: circuits,
  [`${P}_connections.csv`]: connections,
  [`${P}_frg.csv`]: frg,
  [`${P}_references.csv`]: references,
};

describe("sheet loader", () => {
  const b = loadBundle(P, sheetsFromPackage(P, files), { roi: "flocculus", tlf: "VOR gain adaptation", contributor: "fallback" });

  it("reads the package by its file names and keeps the project ID as it is", () => {
    expect(b.project).toMatchObject({ projectId: P, roiCircuitId: `ROI_${P}`, roiLabel: "cerebellar flocculus", contributor: "Alice A.", braVersion: "CoBRAC-v1-1", tlfDescription: "VOR gain adaptation", rootNodeId: "R.VOR" });
  });

  it("stops at each sheet's Review End Line", () => {
    expect(b.circuits.map((c) => c.circuitId)).toEqual([`ROI_${P}`, "GC", "PC"]);
    expect(b.literature.map((l) => l.literatureId)).toEqual(["[Ito, 1984]"]);
    expect(b.nodes.map((n) => n.nodeId)).toEqual(["R.VOR", "U.GC"]);
  });

  it("normalizes values the way BRA-DB stores them", () => {
    const [roi, gc, pc] = b.circuits;
    expect(roi).toMatchObject({ isUniform: false, sourceOfId: "collection", subCircuitIds: ["GC", "PC"] });
    expect(gc).toMatchObject({ sourceOfId: "dhba", modulationType: "Excitatory", isUniform: true, extra: { "UC Descriptor": "HOMBA:1" } });
    // a value BRA-DB's CHECK would reject is NULL, kept in extra, with a warning
    expect(pc).toMatchObject({ sourceOfId: "reference", modulationType: null, extra: { "UC Descriptor": "HOMBA:2", "Modulation Type": "Glutamatergic" } });
    expect(b.warnings.some((w) => w.includes("Modulation Type"))).toBe(true);
    expect(b.connections[0]).toMatchObject({ senderRelation: "=", receiverRelation: "=", senderNotation: "granule cells", derivedFlow: "Feedforward", referenceId: "[Ito, 1984]", taxon: "macaque", size: null });
  });

  it("reads CoBRAC's FRG columns (body from Node ID, separate Capability and Mechanism)", () => {
    const u = b.nodes[1];
    expect(u).toMatchObject({ nodeRole: "Uniform", capability: "expand", mechanism: "sparse coding", implementation: "granule layer", requirements: "code context", interface: null, circuitId: "GC" });
    expect(u.extra).toEqual({ "Requirements Realization by Interface": "realized by mossy fibres" });
    expect(b.edges).toEqual([
      { type: "SUBNODE", from: "R.VOR", to: "U.GC", order: 1 },
      { type: "SUBNODE", from: "R.VOR", to: "U.PC", order: 2 },
      { type: "MAPS_TO_BIF", from: "U.GC", to: "GC", order: null },
      { type: "PROJECTS_TO", from: "U.GC", to: "PC", order: null },
    ]);
    expect(validateBundle(b)).toEqual([]);
  });

  it("rejects a Collection as a sender (error 203) and bad relations", () => {
    const bad = loadBundle(P, sheetsFromPackage(P, { ...files, [`${P}_connections.csv`]: connections.replace("\nGC,PC,", `\nROI_${P},PC,`).replace("'=,Purkinje", "~,Purkinje") }), { roi: "", tlf: "t", contributor: "c" });
    const errors = validateBundle(bad);
    expect(errors.some((e) => e.includes("error 203"))).toBe(true);
    expect(errors.some((e) => e.includes('relation "~"'))).toBe(true);
  });
});

describe("column resolution", () => {
  it("prefers exact names for every key before partial ones, and skips [WS] work columns", () => {
    const header = ["Node ID", "[WS] inROI (for Region Category)", "Requirements Realization by Interface Review (LLM)", "Region Category", "Requirements", "Interface"];
    const col = resolveColumns(header, [["region_category", ["region category"]], ["requirements", ["requirements"]], ["interface", ["interface"], true]], {});
    expect(col).toEqual({ region_category: 3, requirements: 4, interface: 5 });
  });

  it("uses the fixed positions only without a header", () => {
    expect(resolveColumns([], [["a", ["a"]]], { a: 7 })).toEqual({ a: 7 });
  });
});

describe("helpers", () => {
  it("splits enumerations and Capability&Mechanism like import v3.10", () => {
    expect(splitEnumerated("U.ITC-ex;\nU.ITC-in;")).toEqual(["U.ITC-ex", "U.ITC-in"]);
    expect(splitCapabilityMechanism("hold <<mechanism to realize the capability>> attractor <<mechanism realized by grainest coding scheme>> spikes")).toEqual(["hold", "attractor"]);
    expect(normalizeSourceOfId("[A, 2000]")).toBe("reference");
    expect(normalizeSourceOfId("whatever")).toBe("makeshift");
  });

  it("finds the Review End Lines and the first table", () => {
    const w: string[] = [];
    expect(readProjectSheet([["Contributor", "Project ID"], ["A", "x"], ["Sheet Name", "Review End Line"], ["FRG", "1"], ["Other", "9"]], w)).toMatchObject({ contributor: "A", reviewEndLines: { frg: 1 } });
  });

  it("writes Cypher literals that cannot break out of the string or the dollar quote", () => {
    expect(cypherString("it's a \\ test\n")).toBe("'it\\'s a \\\\ test\\n'");
    expect(cypherValue([1, true, null, "x"])).toBe("[1, true, null, 'x']");
    expect(dollarTag("CREATE (n {v: 'a $cy$ b'})")).not.toBe("$cy$");
  });
});
