import { describe, expect, it } from "vitest";
import {
  BNA_AREAS,
  CIRCUIT_ID_RE,
  UC_DESCRIPTOR_RE,
  buildCsvs,
  buildGraphs,
  checkFrg,
  checkHcd,
  canonicalUcDescriptor,
  checkUcNaming,
  modernCircuitId,
  hombaAnchorIds,
  normalizeUcDescriptor,
  parseCsvObjects,
  parseCircuitId,
  parseUcDescriptor,
  BNA_DHBA_COUNTERPARTS,
  bnaLabelIsNeocortex,
  canonDescriptorKeys,
  emptyCanonSnapshot,
  type CanonSnapshot,
  type HombaSabraInfo,
  type SabraLookup,
} from "../src/index.js";

const dhba = (acr: string, id: string, name = ""): HombaSabraInfo => ({ atlas: "DHBA", dhbaAcronym: acr, dhbaExact: true, dhbaHombaId: id, dhbaAncestorAcronym: acr, dhbaName: name });
/** RCS get_homba_term facts for the examples of the convention (docs/uc-naming-convention.md §4.1). */
const SABRA: SabraLookup = new Map<string, HombaSabraInfo | null>([
  ["HOMBA:12261", dhba("VTA", "HOMBA:12261", "ventral tegmental area")],
  ["HOMBA:12499", dhba("NC", "HOMBA:12499")],
  ["HOMBA:10492", dhba("Arc", "HOMBA:10492", "arcuate nucleus")],
  ["HOMBA:12852", dhba("FNCb", "HOMBA:12852")],
  ["HOMBA:AA30423", { atlas: "DHBA", dhbaAcronym: "", dhbaExact: false, dhbaHombaId: "HOMBA:12852", dhbaAncestorAcronym: "FNCb" }],
  ["HOMBA:10339", { atlas: "BNA", dhbaAcronym: "", dhbaExact: false, dhbaHombaId: "", dhbaAncestorAcronym: "" }],
  ["HOMBA:99999", null],
]);

/** The 13 examples of the convention: [Circuit ID, UC Descriptor]. */
const EXAMPLES: [string, string][] = [
  ["VTA", "HOMBA:12261"],
  ["NAC", "BNA:223-224"],
  ["A4ul(left)", "BNA:57-58/side:left"],
  ["NC(NE)", "HOMBA:12499/nt:NE"],
  ["NAC(shell)", "BNA:223-224/part:HOMBA:10341"],
  ["Arc(AGRP+)", "HOMBA:10492/mol:AGRP+"],
  ["NAC(shell.DRD1+)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+"],
  ["FNCb(floc.purkinje)", "HOMBA:12852/part:HOMBA:AA30423/cell:purkinje"],
  ["rHipp(CA1.pyr.place)", "BNA:215-216/part:HOMBA:10297/cell:pyr/resp:place"],
  ["VTA(DA.out-NAC.rpe)", "HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe"],
  ["A4ul(L5.pt.out-Sp.left)", "BNA:57-58/lay:L5/cell:pt/out:HOMBA:AA30565/side:left"],
  ["Hipp(CA1.pyr)", "BNAG:Hipp/part:HOMBA:10297/cell:pyr"],
  ["A9/46d(L3.left)", "BNA:15-16/lay:L3/side:left"],
];

const errorsFor = (id: string, descriptor: string, sabra: SabraLookup = SABRA) => checkUcNaming([{ id, descriptor }], sabra).join("\n");

describe("UC naming convention", () => {
  it("has the 123 BNA areas with unique left labels", () => {
    expect(BNA_AREAS).toHaveLength(123);
    expect(new Set(BNA_AREAS.map((a) => a[0])).size).toBe(123);
    expect(BNA_AREAS.every((a) => a[0] % 2 === 1)).toBe(true);
  });

  it("accepts every example of the convention", () => {
    for (const [id, d] of EXAMPLES) {
      expect(CIRCUIT_ID_RE.test(id), id).toBe(true);
      expect(UC_DESCRIPTOR_RE.test(d), d).toBe(true);
    }
    expect(checkUcNaming(EXAMPLES.map(([id, descriptor]) => ({ id, descriptor })), SABRA)).toEqual([]);
  });

  it("treats anchor-only UCs (no facets) as the normal case", () => {
    const anchorOnly: [string, string][] = [
      ["VTA", "HOMBA:12261"],
      ["NC", "HOMBA:12499"],
      ["Arc", "HOMBA:10492"],
      ["NAC", "BNA:223-224"],
      ["Hipp", "BNAG:Hipp"],
    ];
    expect(checkUcNaming(anchorOnly.map(([id, descriptor]) => ({ id, descriptor })), SABRA)).toEqual([]);
    expect(parseUcDescriptor("HOMBA:12261")).toEqual({ descriptor: { anchors: [{ kind: "homba", id: "HOMBA:12261" }], facets: [], side: null } });
    expect(parseCircuitId("VTA")).toEqual({ head: "VTA", items: [], old: false, side: null });
  });

  it("keeps Circuit ID items and descriptor facets in step", () => {
    expect(errorsFor("VTA(DA)", "HOMBA:12261")).toMatch(/no facets.*anchor abbreviation alone/);
    expect(errorsFor("VTA", "HOMBA:12261/nt:DA")).toMatch(/0 parenthesized item\(s\) but its UC Descriptor has 1/);
    expect(errorsFor("Arc(AGRP+)", "HOMBA:10492/mol:AGRP+,NPY+")).toMatch(/1 parenthesized item\(s\).*2 facet value/);
    expect(errorsFor("Arc(AGRP+.NPY+)", "HOMBA:10492/mol:AGRP+,NPY+")).toBe("");
    expect(errorsFor("Arc(AGRP+.SST-.NPY~hi)", "HOMBA:10492/mol:AGRP+,SST-,NPY~hi")).toBe("");
  });

  it("parses Circuit IDs and descriptors", () => {
    expect(parseCircuitId("A4ul(L5.pt.out-Sp.left)")).toEqual({ head: "A4ul", items: ["L5", "pt", "out-Sp", "left"], old: false, side: null });
    expect(parseCircuitId("A9/46d")).toEqual({ head: "A9/46d", items: [], old: false, side: null });
    expect(parseUcDescriptor("BNA:223-224/mol:DRD1+,ADORA2A-/side:right")).toEqual({
      descriptor: { anchors: [{ kind: "bna", left: 223, right: 224 }], facets: [{ axis: "mol", values: ["DRD1+", "ADORA2A-"] }], side: "right" },
    });
    expect(hombaAnchorIds(EXAMPLES.map((e) => e[1]))).toEqual(["HOMBA:12261", "HOMBA:12499", "HOMBA:10492", "HOMBA:12852"]);
  });

  it("normalizes descriptors case-insensitively with sorted mol values", () => {
    expect(normalizeUcDescriptor("BNA:223-224/mol:Drd1+,Adora2a-")).toBe(normalizeUcDescriptor("BNA:223-224/mol:ADORA2A-,DRD1+"));
    expect(checkUcNaming([
      { id: "NAC(DRD1+)", descriptor: "BNA:223-224/mol:DRD1+" },
      { id: "NAC(Drd1+)", descriptor: "BNA:223-224/mol:Drd1+" },
    ]).join("\n")).toMatch(/same UC Descriptor/);
  });

  it("requires the Circuit ID to start with the anchor's official abbreviation (exact case, ID characters only)", () => {
    expect(errorsFor("NAc(shell)", "BNA:223-224/part:HOMBA:10341")).toMatch(/must start with `NAC`/);
    expect(errorsFor("NACs", "BNA:223-224/part:HOMBA:10341")).toMatch(/must start with `NAC`/);
    expect(errorsFor("ArH(AGRP+)", "HOMBA:10492/mol:AGRP+")).toMatch(/must start with `Arc`/);
    expect(errorsFor("TE1.0_and_TE1.2(left)", "BNA:73-74/side:left")).toBe("");
    expect(errorsFor("TE1.0(left)", "BNA:73-74/side:left")).toMatch(/must start with `TE1.0_and_TE1.2`/);
    // official abbreviations keep `/` and `+`; only spaces become `_`
    expect(errorsFor("A9/46d", "BNA:15-16")).toBe("");
    expect(errorsFor("V5/MT+", "BNA:201-202")).toBe("");
    expect(errorsFor("A1/2/3ll(left)", "BNA:65-66/side:left")).toBe("");
    expect(errorsFor("A9_46d", "BNA:15-16")).toMatch(/must start with `A9\/46d`/);
    expect(errorsFor("V5_MT", "BNA:201-202")).toMatch(/must start with `V5\/MT\+`/);
  });

  it("puts the side in the last facet and the last item", () => {
    expect(errorsFor("A4ul(left)", "BNA:57-58/side:left")).toBe("");
    expect(errorsFor("A8m(L3.left)", "BNA:1-2/lay:L3/side:left")).toBe("");
    expect(errorsFor("NAC(shell.right)", "BNA:223-224/part:HOMBA:10341/side:right")).toBe("");
    expect(errorsFor("A4ul(right)", "BNA:57-58/side:left")).toMatch(/must end with the item `left`/);
    expect(errorsFor("A4ul(L5)", "BNA:57-58/lay:L5/side:left")).toMatch(/1 parenthesized item\(s\) but its UC Descriptor has 2/);
    expect(errorsFor("A4ul(left)", "BNA:57-58/lay:L5")).toMatch(/names a side but its UC Descriptor has no side facet/);
    expect(errorsFor("A4ul(left)", "BNA:57-58/side:up")).toMatch(/side is one value, left or right/);
    expect(errorsFor("A4ul(left)", "BNA:57-58/side:left/lay:L5")).toMatch(/order/);
  });

  it("lets both sides of one population be separate circuits, with distinct IDs", () => {
    const ucs = [
      { id: "A4ul(left)", descriptor: "BNA:57-58/side:left" },
      { id: "A4ul(right)", descriptor: "BNA:57-58/side:right" },
    ];
    expect(checkUcNaming(ucs, SABRA)).toEqual([]);
    expect(checkUcNaming([...ucs, { id: "A4ul(left)", descriptor: "BNA:57-58/side:left" }], SABRA).join("\n")).toMatch(/same UC Descriptor/);
  });

  it("asks for the current form of older descriptors and Circuit IDs", () => {
    expect(errorsFor("A4ul(left)", "BNA:57")).toBe(
      "uc.json: write the UC Descriptor of `A4ul(left)` as `BNA:57-58/side:left` (anchors are left-right pairs; the side is the last facet side:left / side:right, omitted for both sides).",
    );
    expect(errorsFor("NAC(left)", "BNA:223-224@L")).toMatch(/as `BNA:223-224\/side:left`/);
    expect(errorsFor("A4ul(left)", "BNA:58@L")).toMatch(/mixes left and right/);
    expect(errorsFor("A4ul@L", "BNA:57-58/side:left")).toMatch(/`A4ul@L` uses the old syntax; write `A4ul\(left\)`/);
    expect(errorsFor("NAC(shell,DRD1+)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+")).toMatch(/write `NAC\(shell\.DRD1\+\)`/);
    expect(errorsFor("A9/46d@L(L3)", "BNA:15-16/lay:L3/side:left")).toMatch(/write `A9\/46d\(L3\.left\)`/);
  });

  it("reads older forms and converts them to the current one", () => {
    expect(canonicalUcDescriptor("BNA:57")).toEqual({ text: "BNA:57-58/side:left" });
    expect(canonicalUcDescriptor("BNA:58/lay:L5")).toEqual({ text: "BNA:57-58/lay:L5/side:right" });
    expect(canonicalUcDescriptor("BNAG:FuG@L")).toEqual({ text: "BNAG:FuG/side:left" });
    expect(canonicalUcDescriptor("HOMBA:12261@R/nt:DA")).toEqual({ text: "HOMBA:12261/nt:DA/side:right" });
    expect(canonicalUcDescriptor("BNA:57-58/side:left")).toEqual({ text: "BNA:57-58/side:left" });
    expect(normalizeUcDescriptor("bna:29/lay:l3")).toBe("bna:29-30/lay:l3/side:left");
    expect(normalizeUcDescriptor("BNA:29/lay:L3")).toBe(normalizeUcDescriptor("BNA:29-30/lay:L3/side:left"));
    expect(normalizeUcDescriptor("BNA:29")).not.toBe(normalizeUcDescriptor("BNA:29-30"));
    expect(parseUcDescriptor("BNA:57/lay:L5")).toEqual({ descriptor: { anchors: [{ kind: "bna", left: 57, right: 58 }], facets: [{ axis: "lay", values: ["L5"] }], side: "left" } });

    expect(parseCircuitId("A4ul@L(L5,pt,out:Sp)")).toEqual({ head: "A4ul", items: ["L5", "pt", "out:Sp"], old: true, side: "left" });
    expect(modernCircuitId("A4ul@L(L5,pt,out:Sp)")).toBe("A4ul(L5.pt.out-Sp.left)");
    expect(modernCircuitId("Amyg(BL,out:CEN)")).toBe("Amyg(BL.out-CEN)");
    expect(modernCircuitId("MVOcC(V1,L4Ca)")).toBe("MVOcC(V1.L4Ca)");
    expect(modernCircuitId("VTA(DA,in:NAC)")).toBe("VTA(DA.in-NAC)");
    expect(modernCircuitId("NAC(shell,DRD1+)")).toBe("NAC(shell.DRD1+)");
    expect(modernCircuitId("A9/46d@L(L3)")).toBe("A9/46d(L3.left)");
    expect(modernCircuitId("V5/MT+")).toBe("V5/MT+");
    expect(modernCircuitId("A22c@R")).toBe("A22c(right)");
    expect(modernCircuitId("NC(NE)")).toBe("NC(NE)");
    expect(modernCircuitId("Mesolimbic-loop")).toBe("Mesolimbic-loop");
  });

  it("uses the common BNA L2 abbreviation for multi-unit anchors, else the first anchor", () => {
    expect(errorsFor("Hipp(CA1)", "BNA:215-216&BNA:217-218/part:HOMBA:10297")).toBe("");
    expect(errorsFor("VTA(DA)", "HOMBA:12261&BNA:223-224/nt:DA")).toBe("");
    expect(errorsFor("rHipp(CA1)", "BNA:215-216&BNA:217-218/part:HOMBA:10297")).toMatch(/must start with `Hipp`/);
  });

  it("rejects HOMBA anchors that are not SABRA units, with the fix", () => {
    expect(errorsFor("CH10(purkinje)", "HOMBA:AA30423/cell:purkinje")).toMatch(/no DHBA name.*HOMBA:12852 \(FNCb\); add part:HOMBA:AA30423 only if/);
    expect(errorsFor("NAC", "HOMBA:10339")).toMatch(/BNA territory/);
    expect(errorsFor("X", "HOMBA:99999")).toMatch(/not a HOMBA term known to RCS/);
  });

  it("skips only the abbreviation check when RCS could not be asked", () => {
    expect(errorsFor("Anything(DA)", "HOMBA:12261/nt:DA", new Map())).toBe("");
    expect(errorsFor("bad id", "HOMBA:12261", new Map())).toMatch(/does not match/);
  });

  it("reports syntax and facet problems", () => {
    expect(errorsFor("NAC", "")).toMatch(/has no UC Descriptor/);
    expect(errorsFor("NAC", "NAC/shell")).toMatch(/not a valid UC Descriptor/);
    expect(errorsFor("NAC(DRD1+)", "BNA:223-224/mol:DRD1")).toMatch(/needs a polarity/);
    expect(errorsFor("NAC(DRD1.shell)", "BNA:223-224/mol:DRD1+/part:HOMBA:10341")).toMatch(/order/);
    expect(errorsFor("NAC", "BNA:224-225")).toMatch(/pair is \(odd, odd\+1\)/);
    expect(errorsFor("NAC", "BNA:299-300")).toMatch(/1-246/);
    expect(errorsFor("Xyz", "BNAG:Xyz")).toMatch(/not a BNA L2/);
    expect(errorsFor("NAC{shell}", "BNA:223-224/part:HOMBA:10341")).toMatch(/does not match/);
    expect(errorsFor("NAC(shell;DRD1)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+")).toMatch(/does not match/);
    expect(errorsFor("NAC(shell.DRD1*)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+")).toMatch(/only A-Z a-z 0-9 \. _ ~ - \/ \+/);
  });
});

// --- a whole project with convention names -------------------------------------------------------------------

const j = (v: unknown) => JSON.stringify(v);
const META = j({ roi: "Mesolimbic system", tlf: "Reward learning", description: "HCD/FRG of reward learning.", name: "Reward learning in mesolimbic system" });
const REFS = j({ references: [{ id: "[Schultz, 1997]", doi: "10.1126/science.275.5306.1593", literatureType: "Experimental results" }] });
const fn = (id: string) => ({ requirement: `req of [U.${id}]`, requirementRealization: "real", capability: "cap", mechanism: "mech", implementation: `[U.${id}] = f([U.${id}])` });
const empty = { interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "" };
const base = { sourceOfId: "[Schultz, 1997]", transmitter: "", modulationType: "", comments: "" };
const UCS = [
  { ...base, ...empty, circuitId: "A9/46d(L3.left)", descriptor: "BNA:15-16/lay:L3/side:left", names: "left dorsal 9/46 layer III", roi: "noROI(input)", outputSemantics: "[A9/46d(L3.left)]context;" },
  {
    ...base,
    ...fn("VTA(DA.out-NAC.rpe)"),
    circuitId: "VTA(DA.out-NAC.rpe)",
    descriptor: "HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe",
    names: "VTA DA neurons",
    roi: "internal",
    interface: "([U.NAC(shell.DRD1+)]) = VTA(DA.out-NAC.rpe)([U.NAC(shell.DRD1+)])",
    outputSemantics: "[VTA(DA.out-NAC.rpe)] RPE;",
  },
  {
    ...base,
    ...fn("NAC(shell.DRD1+)"),
    circuitId: "NAC(shell.DRD1+)",
    descriptor: "BNA:223-224/part:HOMBA:10341/mol:DRD1+",
    names: "NAc shell D1",
    roi: "internal",
    interface: "([U.VTA(DA.out-NAC.rpe)], [U.Arc(AGRP+)]) = NAC(shell.DRD1+)([U.A9/46d(L3.left)], [U.VTA(DA.out-NAC.rpe)])",
    outputSemantics: "[NAC(shell.DRD1+)] value;",
  },
  { ...base, ...empty, circuitId: "Arc(AGRP+)", descriptor: "HOMBA:10492/mol:AGRP+", names: "arcuate AgRP", roi: "noROI(output)", outputSemantics: "" },
];
const conn = (sender: string, receiver: string) => ({
  sender,
  senderRelation: "=",
  senderInLiterature: "s",
  receiver,
  receiverRelation: "=",
  receiverInLiterature: "r",
  comment: "c",
  referenceIds: ["[Schultz, 1997]"],
  taxon: "Rat",
  measurementMethod: "Anterograde tracing",
  pointersOnLiterature: "",
  pointersOnFigure: "Fig. 1",
});
const CONNS = [
  conn("A9/46d(L3.left)", "NAC(shell.DRD1+)"),
  conn("VTA(DA.out-NAC.rpe)", "NAC(shell.DRD1+)"),
  conn("NAC(shell.DRD1+)", "VTA(DA.out-NAC.rpe)"),
  conn("NAC(shell.DRD1+)", "Arc(AGRP+)"),
];
const BIF = [{ sender: "VTA", receiver: "NAc", comment: "", referenceIds: ["[Schultz, 1997]"] }];
const REPORT = "# Reward\n\n## HCD\n\nx\n\n## FRG\n\nx\n";
const hcdFiles = (ucs: unknown[], conns: unknown[]) => ({
  meta: META,
  decisionLog: "log",
  report: REPORT,
  references: REFS,
  uc: j({ ucs }),
  connections: j({ bif: BIF, connections: conns }),
});
const HCD = hcdFiles(UCS, CONNS);
const frgFiles = (subnodes: string[]) => ({
  report: REPORT,
  frg: j({ nodes: [{ id: "R.Reward", subnodes, comment: "TLF", interface: "([U.Arc(AGRP+)]) = R.Reward([U.A9/46d(L3.left)])", requirement: "r", requirementRealization: "rr", capability: "c", mechanism: "m" }] }),
});
const FRG = frgFiles(["U.VTA(DA.out-NAC.rpe)", "U.NAC(shell.DRD1+)"]);
const TEMPLATE = "Contributor,Project ID,List of contributors,Description,BRA version\n,,,,CoBRAC-v1-1\n";

describe("a project named by the convention", () => {
  it("validates, converts to CSV and renders", () => {
    const hcd = checkHcd(HCD, { sabra: SABRA });
    expect(hcd.errors).toEqual([]);
    expect(hcd.model!.ucs.map((u) => u.descriptor)).toContain("BNA:223-224/part:HOMBA:10341/mol:DRD1+");
    const frg = checkFrg(FRG, hcd.model!);
    expect(frg.errors).toEqual([]);
    expect(frg.model!.gns[0].subnodes).toEqual(["U.VTA(DA.out-NAC.rpe)", "U.NAC(shell.DRD1+)"]);

    const { files, errors } = buildCsvs(hcd.model!, frg.model!, { projectId: "RW", contributor: "T", projectTemplate: TEMPLATE });
    expect(errors).toEqual([]);
    expect(files!["Circuits.csv"].split("\n")[0]).toBe("Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor,Sub-Circuits,Uniform");
    const circuits = parseCsvObjects(files!["Circuits.csv"]);
    expect(circuits.find((c) => c["Circuit ID"] === "NAC(shell.DRD1+)")?.["UC Descriptor"]).toBe("BNA:223-224/part:HOMBA:10341/mol:DRD1+");
    const frgRows = parseCsvObjects(files!["FRG.csv"]);
    expect(frgRows.find((r) => r["Node ID"] === "R.Reward")?.Subnodes).toBe("U.VTA(DA.out-NAC.rpe);U.NAC(shell.DRD1+)");
    expect(frgRows.find((r) => r["Node ID"] === "U.NAC(shell.DRD1+)")?.["Projected Circuits"]).toBe("VTA(DA.out-NAC.rpe);Arc(AGRP+)");

    const g = buildGraphs("RW", { circuitsCsv: files!["Circuits.csv"], connectionsCsv: files!["Connections.csv"], frgCsv: files!["FRG.csv"] });
    expect(g.hcd.nodes.map((n) => n.id).sort()).toEqual(["A9/46d(L3.left)", "Arc(AGRP+)", "NAC(shell.DRD1+)", "VTA(DA.out-NAC.rpe)"]);
    expect(g.hcd.nodes.find((n) => n.id === "VTA(DA.out-NAC.rpe)")?.ucDescriptor).toBe("HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe");
    expect(g.hcd.edges).toHaveLength(4);
    expect(g.frg.nodes.find((n) => n.id === "R.Reward")?.kind).toBe("tlf");
  });

  it("accepts a project whose UCs are all whole SABRA units (anchor only)", () => {
    const rename = (x: string) =>
      x.replaceAll("A9/46d(L3.left)", "A9/46d(left)").replaceAll("VTA(DA.out-NAC.rpe)", "VTA").replaceAll("NAC(shell.DRD1+)", "NAC").replaceAll("Arc(AGRP+)", "Arc");
    const ucs = (JSON.parse(rename(j(UCS))) as { descriptor: string }[]).map((u, i) => ({
      ...u,
      descriptor: ["BNA:15-16/side:left", "HOMBA:12261", "BNA:223-224", "HOMBA:10492"][i],
      names: ["left dorsal area 9/46", "ventral tegmental area; VTA", "nucleus accumbens", "arcuate nucleus"][i],
      sourceOfId: ["BNA", "DHBA", "BNA", "DHBA"][i],
    }));
    const hcd = checkHcd(hcdFiles(ucs, JSON.parse(rename(j(CONNS)))), { sabra: SABRA });
    expect(hcd.errors).toEqual([]);
    expect(hcd.model!.ucs.map((u) => [u.id, u.descriptor])).toEqual([
      ["A9/46d(left)", "BNA:15-16/side:left"],
      ["VTA", "HOMBA:12261"],
      ["NAC", "BNA:223-224"],
      ["Arc", "HOMBA:10492"],
    ]);
    const frg = checkFrg(frgFiles(["U.VTA", "U.NAC"]), hcd.model!);
    expect(frg.errors).toEqual([]);
    const { files } = buildCsvs(hcd.model!, frg.model!, { projectId: "RW", contributor: "T", projectTemplate: TEMPLATE });
    expect(parseCsvObjects(files!["Circuits.csv"]).map((c) => [c["UC Descriptor"], c["Source of ID"]])).toEqual([
      ["", "collection"],
      ["BNA:15-16/side:left", "BNA"],
      ["HOMBA:12261", "DHBA"],
      ["BNA:223-224", "BNA"],
      ["HOMBA:10492", "DHBA"],
    ]);
    const bad = ucs.map((u, i) => (i === 1 ? { ...u, names: "VTA" } : u));
    expect(checkHcd(hcdFiles(bad, JSON.parse(rename(j(CONNS)))), { sabra: SABRA }).errors).toEqual([
      expect.stringMatching(/names of `VTA` must start with its SABRA official name "ventral tegmental area"/),
    ]);
  });

  it("reports naming problems and an interface that names another UC", () => {
    const ucs = structuredClone(UCS);
    ucs[3].descriptor = "HOMBA:10492/mol:AGRP";
    ucs[1].interface = "([U.NAC(shell.DRD1+)]) = VTA([U.NAC(shell.DRD1+)])";
    const msg = checkHcd(hcdFiles(ucs, CONNS), { sabra: SABRA }).errors.join("\n");
    expect(msg).toMatch(/mol value `AGRP` needs a polarity/);
    expect(msg).toMatch(/interface of `VTA\(DA\.out-NAC\.rpe\)` names `VTA`/);
  });

  it("always enforces the convention", () => {
    const ucs = structuredClone(UCS);
    ucs[3].descriptor = "";
    const msg = checkHcd(hcdFiles(ucs, CONNS), { sabra: SABRA }).errors.join("\n");
    expect(msg).toMatch(/uc\.json: \/ucs\/3\/descriptor must not be empty/);
    expect(msg).toMatch(/`Arc\(AGRP\+\)` has no UC Descriptor/);
  });
});

describe("SABRA boundary of 2026-10-04 (BNA for the neocortex only)", () => {
  /** The convention's examples under the new boundary: subcortical and hippocampal UCs anchored on DHBA. */
  const NEW_SABRA: SabraLookup = new Map<string, HombaSabraInfo | null>([
    ...SABRA,
    ["HOMBA:10339", dhba("NAC", "HOMBA:10339", "nucleus accumbens")],
    ["HOMBA:10341", dhba("NACs", "HOMBA:10341", "shell of nucleus accumbens")],
    ["HOMBA:10297", dhba("CA1", "HOMBA:10297", "CA1 region of Hipp")],
  ]);
  const NEW_EXAMPLES: [string, string][] = [
    ["VTA", "HOMBA:12261"],
    ["NAC", "HOMBA:10339"],
    ["A4ul(left)", "BNA:57-58/side:left"],
    ["NACs(DRD1+)", "HOMBA:10341/mol:DRD1+"],
    ["CA1(pyr.place)", "HOMBA:10297/cell:pyr/resp:place"],
    ["VTA(DA.out-NAC.rpe)", "HOMBA:12261/nt:DA/out:HOMBA:10339/resp:rpe"],
    ["A4ul(L5.pt.out-Sp.left)", "BNA:57-58/lay:L5/cell:pt/out:HOMBA:AA30565/side:left"],
    ["MFG", "BNAG:MFG"],
  ];
  const neo = (ucs: [string, string][], exempt?: Set<string>) =>
    checkUcNaming(ucs.map(([id, descriptor]) => ({ id, descriptor })), NEW_SABRA, { boundary: "neocortex", boundaryExempt: exempt });

  it("classifies BNA labels: 206 neocortical labels; subcortical 211–246, A28/34 and TI are not SABRA units", () => {
    const neocortical = BNA_AREAS.filter((a) => bnaLabelIsNeocortex(a[0]));
    expect(neocortical).toHaveLength(103);
    expect(BNA_AREAS.filter((a) => !bnaLabelIsNeocortex(a[0])).map((a) => a[1])).toEqual([
      "A28/34", "TI", "mAmyg", "lAmyg", "rHipp", "cHipp", "vCa", "GP", "NAC", "vmPu", "dCa", "dlPu",
      "mPFtha", "mPMtha", "Stha", "rTtha", "PPtha", "Otha", "cTtha", "lPFtha",
    ]);
    expect([bnaLabelIsNeocortex(57), bnaLabelIsNeocortex(58), bnaLabelIsNeocortex(116), bnaLabelIsNeocortex(224)]).toEqual([true, true, false, false]);
    expect(BNA_DHBA_COUNTERPARTS.get(223)).toEqual(["HOMBA:10339", "NAC"]);
    expect(BNA_DHBA_COUNTERPARTS.get(245)).toEqual(["HOMBA:10391", "DTH"]);
  });

  it("accepts the new-boundary examples", () => {
    expect(neo(NEW_EXAMPLES)).toEqual([]);
  });

  it("rejects BNA anchors and region values that are not neocortex", () => {
    const errs = neo([
      ["NAC", "BNA:223-224"],
      ["rHipp(CA1.pyr)", "BNA:215-216/part:HOMBA:10297/cell:pyr"],
      ["Hipp(CA1.pyr)", "BNAG:Hipp/part:HOMBA:10297/cell:pyr"],
      ["A28/34", "BNA:115-116"],
      ["VTA(DA.out-NAC.rpe)", "HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe"],
      ["Tha(left)", "BNAG:Tha/side:left"],
    ]).join("\n");
    expect(errs).toContain("`BNA:223-224` (NAC) is not neocortex, so it is not a SABRA unit");
    expect(errs).toContain("it lies in HOMBA:10339 NAC");
    expect(errs).toContain("`BNA:215-216` (rHipp) is not neocortex");
    expect(errs).toContain("`BNAG:Hipp` (BNA group Hipp) is not neocortex");
    expect(errs).toContain("`BNA:115-116` (A28/34) is not neocortex");
    expect(errs).toContain("it lies in HOMBA:10317 EC");
    expect(errs).toContain("`out:BNA:223-224` (NAC) is not neocortex");
    expect(errs).toContain("`BNAG:Tha` (BNA group Tha) is not neocortex");
  });

  it("keeps older projects valid: without the boundary option, subcortical BNA anchors pass as before", () => {
    const legacy: [string, string][] = [
      ["NAC", "BNA:223-224"],
      ["NAC(shell.DRD1+)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+"],
      ["rHipp(CA1.pyr.place)", "BNA:215-216/part:HOMBA:10297/cell:pyr/resp:place"],
      ["Hipp(CA1.pyr)", "BNAG:Hipp/part:HOMBA:10297/cell:pyr"],
    ];
    expect(checkUcNaming(legacy.map(([id, descriptor]) => ({ id, descriptor })), SABRA)).toEqual([]);
  });

  it("exempts the pinned Canon's descriptors", () => {
    const snapshot = emptyCanonSnapshot("u7m2q9xa-c1", "t0");
    snapshot.circuits.push({ descriptor: "BNA:223-224", key: "bna:223-224", circuitId: "NAC", subCircuits: [] } as unknown as CanonSnapshot["circuits"][number]);
    const keys = canonDescriptorKeys(snapshot);
    expect([...keys]).toEqual(["bna:223-224"]);
    expect(neo([["NAC", "BNA:223-224"]], keys)).toEqual([]);
    expect(neo([["GP", "BNA:221-222"]], keys).join("\n")).toContain("`BNA:221-222` (GP) is not neocortex");
  });
});
