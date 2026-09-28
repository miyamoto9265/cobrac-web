import { describe, expect, it } from "vitest";
import {
  BNA_AREAS,
  CIRCUIT_ID_RE,
  UC_DESCRIPTOR_RE,
  buildCsvs,
  buildGraphs,
  checkFrg,
  checkHcd,
  checkUcNaming,
  hombaAnchorIds,
  normalizeUcDescriptor,
  parseCsvObjects,
  parseCircuitId,
  parseUcDescriptor,
  type HombaSabraInfo,
  type SabraLookup,
} from "../src/index.js";

const dhba = (acr: string, id: string): HombaSabraInfo => ({ atlas: "DHBA", dhbaAcronym: acr, dhbaExact: true, dhbaHombaId: id, dhbaAncestorAcronym: acr });
/** RCS get_homba_term facts for the examples of the convention (docs/uc-naming-convention.md §4.1). */
const SABRA: SabraLookup = new Map<string, HombaSabraInfo | null>([
  ["HOMBA:12261", dhba("VTA", "HOMBA:12261")],
  ["HOMBA:12499", dhba("NC", "HOMBA:12499")],
  ["HOMBA:10492", dhba("Arc", "HOMBA:10492")],
  ["HOMBA:12852", dhba("FNCb", "HOMBA:12852")],
  ["HOMBA:AA30423", { atlas: "DHBA", dhbaAcronym: "", dhbaExact: false, dhbaHombaId: "HOMBA:12852", dhbaAncestorAcronym: "FNCb" }],
  ["HOMBA:10339", { atlas: "BNA", dhbaAcronym: "", dhbaExact: false, dhbaHombaId: "", dhbaAncestorAcronym: "" }],
  ["HOMBA:99999", null],
]);

/** The 13 examples of the convention: [Circuit ID, UC Descriptor]. */
const EXAMPLES: [string, string][] = [
  ["VTA", "HOMBA:12261"],
  ["NAC", "BNA:223-224"],
  ["A4ul@L", "BNA:57"],
  ["NC(NE)", "HOMBA:12499/nt:NE"],
  ["NAC(shell)", "BNA:223-224/part:HOMBA:10341"],
  ["Arc(AGRP+)", "HOMBA:10492/mol:AGRP+"],
  ["NAC(shell,DRD1+)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+"],
  ["FNCb(floc,purkinje)", "HOMBA:12852/part:HOMBA:AA30423/cell:purkinje"],
  ["rHipp(CA1,pyr,place)", "BNA:215-216/part:HOMBA:10297/cell:pyr/resp:place"],
  ["VTA(DA,out:NAC,rpe)", "HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe"],
  ["A4ul@L(L5,pt,out:Sp)", "BNA:57/lay:L5/cell:pt/out:HOMBA:AA30565"],
  ["Hipp(CA1,pyr)", "BNAG:Hipp/part:HOMBA:10297/cell:pyr"],
  ["A9/46d@L(L3)", "BNA:15/lay:L3"],
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
      ["NAC@L", "BNA:223-224@L"],
      ["A4ul@L", "BNA:57"],
      ["A9/46d@R", "BNA:16"],
      ["Hipp", "BNAG:Hipp"],
    ];
    expect(checkUcNaming(anchorOnly.map(([id, descriptor]) => ({ id, descriptor })), SABRA)).toEqual([]);
    expect(parseUcDescriptor("HOMBA:12261")).toEqual({ descriptor: { anchors: [{ kind: "homba", id: "HOMBA:12261" }], laterality: null, facets: [] } });
    expect(parseCircuitId("VTA")).toEqual({ head: "VTA", laterality: null, items: [] });
  });

  it("keeps Circuit ID items and descriptor facets in step", () => {
    expect(errorsFor("VTA(DA)", "HOMBA:12261")).toMatch(/no facets.*anchor abbreviation alone/);
    expect(errorsFor("VTA", "HOMBA:12261/nt:DA")).toMatch(/0 parenthesized item\(s\) but its UC Descriptor has 1/);
    expect(errorsFor("Arc(AGRP+)", "HOMBA:10492/mol:AGRP+,NPY+")).toMatch(/1 parenthesized item\(s\).*2 facet value/);
    expect(errorsFor("Arc(AGRP+,NPY+)", "HOMBA:10492/mol:AGRP+,NPY+")).toBe("");
  });

  it("parses Circuit IDs and descriptors", () => {
    expect(parseCircuitId("A4ul@L(L5,pt,out:Sp)")).toEqual({ head: "A4ul", laterality: "L", items: ["L5", "pt", "out:Sp"] });
    expect(parseCircuitId("A9/46d")).toEqual({ head: "A9/46d", laterality: null, items: [] });
    expect(parseUcDescriptor("BNA:223-224@R/mol:DRD1+,ADORA2A-")).toEqual({
      descriptor: { anchors: [{ kind: "bna", left: 223, right: 224 }], laterality: "R", facets: [{ axis: "mol", values: ["DRD1+", "ADORA2A-"] }] },
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

  it("requires the Circuit ID to start with the anchor's official abbreviation (exact case)", () => {
    expect(errorsFor("NAc(shell)", "BNA:223-224/part:HOMBA:10341")).toMatch(/must start with `NAC`/);
    expect(errorsFor("NACs", "BNA:223-224/part:HOMBA:10341")).toMatch(/must start with `NAC`/);
    expect(errorsFor("ArH(AGRP+)", "HOMBA:10492/mol:AGRP+")).toMatch(/must start with `Arc`/);
    expect(errorsFor("TE1.0_and_TE1.2@L", "BNA:73")).toBe("");
    expect(errorsFor("TE1.0@L", "BNA:73")).toMatch(/must start with `TE1.0_and_TE1.2@L`/);
  });

  it("checks laterality", () => {
    expect(errorsFor("A4ul(L5)", "BNA:57/lay:L5")).toMatch(/must start with `A4ul@L`/);
    expect(errorsFor("A4ul@R", "BNA:58")).toBe("");
    expect(errorsFor("A4ul@L", "BNA:58@L")).toMatch(/BNA:58 is the right label/);
    expect(errorsFor("NAC@R(shell)", "BNA:223-224@R/part:HOMBA:10341")).toBe("");
    expect(errorsFor("NAC(shell)", "BNA:223-224@R/part:HOMBA:10341")).toMatch(/must start with `NAC@R`/);
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
    expect(errorsFor("NAC(DRD1)", "BNA:223-224/mol:DRD1")).toMatch(/needs a polarity/);
    expect(errorsFor("NAC(DRD1+,shell)", "BNA:223-224/mol:DRD1+/part:HOMBA:10341")).toMatch(/order/);
    expect(errorsFor("NAC", "BNA:224-225")).toMatch(/pair is \(odd, odd\+1\)/);
    expect(errorsFor("NAC", "BNA:300")).toMatch(/1-246/);
    expect(errorsFor("Xyz", "BNAG:Xyz")).toMatch(/not a BNA L2/);
    expect(errorsFor("NAC{shell}", "BNA:223-224/part:HOMBA:10341")).toMatch(/does not match/);
    expect(errorsFor("NAC(shell;DRD1+)", "BNA:223-224/part:HOMBA:10341/mol:DRD1+")).toMatch(/does not match/);
  });
});

// --- a whole project with convention names -------------------------------------------------------------------

const j = (v: unknown) => JSON.stringify(v);
const META = j({ roi: "Mesolimbic system", tlf: "Reward learning", description: "HCD/FRG of reward learning.", name: "Reward learning in mesolimbic system" });
const REFS = j({ references: [{ id: "[Schultz, 1997]", doi: "10.1126/science.275.5306.1593" }] });
const fn = (id: string) => ({ requirement: `req of [U.${id}]`, requirementRealization: "real", capability: "cap", mechanism: "mech", implementation: `[U.${id}] = f([U.x])` });
const empty = { interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "" };
const base = { sourceOfId: ["[Schultz, 1997]"], transmitter: "", modulationType: "", comments: "" };
const UCS = [
  { ...base, ...empty, circuitId: "A9/46d@L(L3)", descriptor: "BNA:15/lay:L3", names: "left dorsal 9/46 layer III", roi: "noROI(input)", outputSemantics: "[A9/46d@L(L3)]context;" },
  {
    ...base,
    ...fn("VTA(DA,out:NAC,rpe)"),
    circuitId: "VTA(DA,out:NAC,rpe)",
    descriptor: "HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe",
    names: "VTA DA neurons",
    roi: "internal",
    interface: "([U.NAC(shell,DRD1+)]) = VTA(DA,out:NAC,rpe)([U.NAC(shell,DRD1+)])",
    outputSemantics: "[VTA]RPE;",
  },
  {
    ...base,
    ...fn("NAC(shell,DRD1+)"),
    circuitId: "NAC(shell,DRD1+)",
    descriptor: "BNA:223-224/part:HOMBA:10341/mol:DRD1+",
    names: "NAc shell D1",
    roi: "internal",
    interface: "([U.VTA(DA,out:NAC,rpe)], [U.Arc(AGRP+)]) = NAC(shell,DRD1+)([U.A9/46d@L(L3)], [U.VTA(DA,out:NAC,rpe)])",
    outputSemantics: "[NAC]value;",
  },
  { ...base, ...empty, circuitId: "Arc(AGRP+)", descriptor: "HOMBA:10492/mol:AGRP+", names: "arcuate AgRP", roi: "noROI(output)", outputSemantics: "" },
];
const conn = (sender: string, receiver: string) => ({
  sender,
  receiver,
  comment: "c",
  referenceIds: ["[Schultz, 1997]"],
  taxon: "rat",
  measurementMethod: "tracing",
  pointersOnLiterature: "p.1",
  pointersOnFigure: "Fig. 1",
});
const CONNS = [
  conn("A9/46d@L(L3)", "NAC(shell,DRD1+)"),
  conn("VTA(DA,out:NAC,rpe)", "NAC(shell,DRD1+)"),
  conn("NAC(shell,DRD1+)", "VTA(DA,out:NAC,rpe)"),
  conn("NAC(shell,DRD1+)", "Arc(AGRP+)"),
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
  frg: j({ nodes: [{ id: "R.Reward", subnodes, comment: "TLF", interface: "([U.Arc(AGRP+)]) = R.Reward([U.A9/46d@L(L3)])", requirement: "r", requirementRealization: "rr", capability: "c", mechanism: "m" }] }),
});
const FRG = frgFiles(["U.VTA(DA,out:NAC,rpe)", "U.NAC(shell,DRD1+)"]);
const TEMPLATE = "Contributor,Project ID,List of contributors,Description,BRA version\n,,,,CoBRAC-v1-0\n";

describe("a project named by the convention", () => {
  it("validates, converts to CSV and renders", () => {
    const hcd = checkHcd(HCD, { sabra: SABRA });
    expect(hcd.errors).toEqual([]);
    expect(hcd.model!.ucs.map((u) => u.descriptor)).toContain("BNA:223-224/part:HOMBA:10341/mol:DRD1+");
    const frg = checkFrg(FRG, hcd.model!);
    expect(frg.errors).toEqual([]);
    expect(frg.model!.gns[0].subnodes).toEqual(["U.VTA(DA,out:NAC,rpe)", "U.NAC(shell,DRD1+)"]);

    const { files, errors } = buildCsvs(hcd.model!, frg.model!, { projectId: "RW", contributor: "T", projectTemplate: TEMPLATE });
    expect(errors).toEqual([]);
    expect(files!["Circuits.csv"].split("\n")[0]).toBe("Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor");
    const circuits = parseCsvObjects(files!["Circuits.csv"]);
    expect(circuits.find((c) => c["Circuit ID"] === "NAC(shell,DRD1+)")?.["UC Descriptor"]).toBe("BNA:223-224/part:HOMBA:10341/mol:DRD1+");
    const frgRows = parseCsvObjects(files!["FRG.csv"]);
    expect(frgRows.find((r) => r["Node ID"] === "R.Reward")?.Subnodes).toBe("U.VTA(DA,out:NAC,rpe);U.NAC(shell,DRD1+)");
    expect(frgRows.find((r) => r["Node ID"] === "U.NAC(shell,DRD1+)")?.["Projected Circuits"]).toBe("VTA(DA,out:NAC,rpe);Arc(AGRP+)");

    const g = buildGraphs("RW", { circuitsCsv: files!["Circuits.csv"], connectionsCsv: files!["Connections.csv"], frgCsv: files!["FRG.csv"] });
    expect(g.hcd.nodes.map((n) => n.id).sort()).toEqual(["A9/46d@L(L3)", "Arc(AGRP+)", "NAC(shell,DRD1+)", "VTA(DA,out:NAC,rpe)"]);
    expect(g.hcd.nodes.find((n) => n.id === "VTA(DA,out:NAC,rpe)")?.ucDescriptor).toBe("HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe");
    expect(g.hcd.edges).toHaveLength(4);
    expect(g.frg.nodes.find((n) => n.id === "R.Reward")?.kind).toBe("tlf");
  });

  it("accepts a project whose UCs are all whole SABRA units (anchor only)", () => {
    const rename = (x: string) =>
      x.replaceAll("A9/46d@L(L3)", "A9/46d@L").replaceAll("VTA(DA,out:NAC,rpe)", "VTA").replaceAll("NAC(shell,DRD1+)", "NAC").replaceAll("Arc(AGRP+)", "Arc");
    const ucs = (JSON.parse(rename(j(UCS))) as { descriptor: string }[]).map((u, i) => ({ ...u, descriptor: ["BNA:15", "HOMBA:12261", "BNA:223-224", "HOMBA:10492"][i] }));
    const hcd = checkHcd(hcdFiles(ucs, JSON.parse(rename(j(CONNS)))), { sabra: SABRA });
    expect(hcd.errors).toEqual([]);
    expect(hcd.model!.ucs.map((u) => [u.id, u.descriptor])).toEqual([
      ["A9/46d@L", "BNA:15"],
      ["VTA", "HOMBA:12261"],
      ["NAC", "BNA:223-224"],
      ["Arc", "HOMBA:10492"],
    ]);
    const frg = checkFrg(frgFiles(["U.VTA", "U.NAC"]), hcd.model!);
    expect(frg.errors).toEqual([]);
    const { files } = buildCsvs(hcd.model!, frg.model!, { projectId: "RW", contributor: "T", projectTemplate: TEMPLATE });
    expect(parseCsvObjects(files!["Circuits.csv"]).map((c) => c["UC Descriptor"])).toEqual(["BNA:15", "HOMBA:12261", "BNA:223-224", "HOMBA:10492"]);
  });

  it("reports naming problems and an interface that names another UC", () => {
    const ucs = structuredClone(UCS);
    ucs[3].descriptor = "HOMBA:10492/mol:AGRP";
    ucs[1].interface = "([U.NAC(shell,DRD1+)]) = VTA([U.NAC(shell,DRD1+)])";
    const msg = checkHcd(hcdFiles(ucs, CONNS), { sabra: SABRA }).errors.join("\n");
    expect(msg).toMatch(/mol value `AGRP` needs a polarity/);
    expect(msg).toMatch(/interface of `VTA\(DA,out:NAC,rpe\)` names `VTA`/);
  });

  it("always enforces the convention", () => {
    const ucs = structuredClone(UCS);
    ucs[3].descriptor = "";
    const msg = checkHcd(hcdFiles(ucs, CONNS), { sabra: SABRA }).errors.join("\n");
    expect(msg).toMatch(/uc\.json: \/ucs\/3\/descriptor must not be empty/);
    expect(msg).toMatch(/`Arc\(AGRP\+\)` has no UC Descriptor/);
  });
});
