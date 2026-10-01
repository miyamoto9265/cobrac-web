import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRA_VERSION,
  HARNESS_SCHEMAS,
  OUT_OF_ROI_CAPABILITY,
  buildCsvs,
  buildGraphs,
  checkFrg,
  checkHcd,
  parseCsvObjects,
  parseInterface,
  parseTurnOutput,
  validateJsonSchema,
  type HcdInputs,
} from "../src/index.js";

const META = { roi: "Cerebellar flocculus", tlf: "VOR adaptation", description: "HCD/FRG of VOR adaptation in the cerebellar flocculus.", name: "VOR adaptation in cerebellar flocculus" };

const REFS = {
  references: [
    { id: "[Ito, 1982]", doi: "10.1146/annurev.ne.05.030182.001423", literatureType: "Review" },
    { id: "[Lisberger, 1994]", doi: "N/A", literatureType: "Experimental results", alternativeUrl: "https://example.org/lisberger-1994" },
  ],
};

const fn = (id: string) => ({
  requirement: `req of [U.${id}]`,
  requirementRealization: `real of [U.${id}]`,
  capability: "cap",
  mechanism: "mech",
  implementation: `[U.${id}] = f([U.VN])`,
});
const noFn = { interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "" };
const uc = (circuitId: string, descriptor: string, extra: Record<string, unknown>) => ({
  circuitId,
  descriptor,
  names: circuitId,
  roi: "internal",
  sourceOfId: descriptor.includes("/") ? "[Ito, 1982]" : "DHBA",
  transmitter: "Glutamate",
  modulationType: "Excitatory",
  comments: "",
  outputSemantics: `[${circuitId}]content;`,
  ...noFn,
  ...extra,
});

const UC = {
  ucs: [
    uc("VN", "HOMBA:12950", { roi: "noROI(input)", comments: "head velocity" }),
    uc("GC(granule)", "HOMBA:12852/cell:granule", { comments: "parallel fibres", interface: "([U.PC(purkinje)]) = GC(granule)([U.VN])", ...fn("GC(granule)") }),
    uc("PC(purkinje)", "HOMBA:12852/cell:purkinje", { transmitter: "GABA", modulationType: "Inhibitory", interface: "([U.FTN]) = PC(purkinje)([U.GC(granule)], [U.IO])", ...fn("PC(purkinje)") }),
    uc("IO", "HOMBA:12500", { interface: "([U.PC(purkinje)]) = IO([U.VN])", ...fn("IO") }),
    uc("FTN", "HOMBA:12951", { roi: "noROI(output)", transmitter: "GABA", modulationType: "Inhibitory", outputSemantics: "" }),
  ],
};

const conn = (sender: string, receiver: string, comment: string, ref = "[Ito, 1982]") => ({
  sender,
  senderRelation: "=",
  senderInLiterature: `${sender} of the paper`,
  receiver,
  receiverRelation: "<",
  receiverInLiterature: "cerebellar cortex",
  comment,
  referenceIds: [ref],
  taxon: "Rabbit",
  measurementMethod: "Axonal tracing",
  pointersOnLiterature: `The ${comment} projection from ${sender} terminates on ${receiver} in the flocculus of the rabbit.`,
  pointersOnFigure: "Figure 1b",
});
const CONN = {
  bif: [{ sender: "vestibular nerve", receiver: "granule cell layer", comment: "mossy fibres", referenceIds: ["[Ito, 1982]"] }],
  connections: [
    conn("VN", "GC(granule)", "mossy fibres"),
    conn("VN", "IO", "slip", "[Lisberger, 1994]"),
    conn("GC(granule)", "PC(purkinje)", "parallel fibres, P(a|b)"),
    conn("IO", "PC(purkinje)", "climbing fibres", "[Lisberger, 1994]"),
    conn("PC(purkinje)", "FTN", "inhibition", "[Lisberger, 1994]"),
  ],
};

const REPORT_HCD = "# VOR adaptation\n\n## HCD\n\ntext\n";
const REPORT = REPORT_HCD + "\n## FRG\n\ntext\n";
const j = (v: unknown) => JSON.stringify(v, null, 2);
const HCD: HcdInputs = { meta: j(META), decisionLog: "# Decision log\n", report: REPORT_HCD, references: j(REFS), uc: j(UC), connections: j(CONN) };

const node = (id: string, subnodes: string[], itf: string) => ({
  id,
  subnodes,
  comment: `${id} comment`,
  interface: itf,
  requirement: "r",
  requirementRealization: "rr",
  capability: "c",
  mechanism: "m",
});
const FRG_JSON = {
  nodes: [
    node("R.VOR-Adaptation", ["R.Context", "R.Learning"], "([U.FTN]) = R.VOR-Adaptation([U.VN])"),
    node("R.Context", ["U.GC(granule)", "U.PC(purkinje)"], "([U.FTN]) = R.Context([U.VN], [U.IO])"),
    node("R.Learning", ["U.IO", "U.PC(purkinje)"], "([U.FTN]) = R.Learning([U.VN], [U.GC(granule)])"),
  ],
};
const FRG = { report: REPORT, frg: j(FRG_JSON) };

const TEMPLATE = readFileSync(new URL("../../../prompts/Project.csv", import.meta.url), "utf8");

describe("JSON schema validator", () => {
  it("reports types, required keys, enums, patterns and extra keys", () => {
    const bad = { ucs: [{ ...UC.ucs[1], roi: "inside", circuitId: "has space", extra: 1 }], more: true };
    delete (bad.ucs[0] as Record<string, unknown>).names;
    const msg = validateJsonSchema(HARNESS_SCHEMAS["uc.json"], bad).join("\n");
    expect(msg).toMatch(/\/ucs\/0\/names is required/);
    expect(msg).toMatch(/\/ucs\/0\/roi must be one of "internal"/);
    expect(msg).toMatch(/\/ucs\/0\/circuitId .* must match/);
    expect(msg).toMatch(/\/ucs\/0\/extra is not allowed/);
    expect(msg).toMatch(/\/more is not allowed/);
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], { ucs: "x" })).toEqual(["/ucs must be array (got string)"]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["connections.json"], { bif: [], connections: [] }).join("\n")).toMatch(/\/bif needs at least 1 item/);
  });

  it("accepts the fixtures", () => {
    expect(validateJsonSchema(HARNESS_SCHEMAS["meta.json"], META)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["references.json"], REFS)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], UC)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["connections.json"], CONN)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["frg.json"], FRG_JSON)).toEqual([]);
  });
});

describe("parseInterface", () => {
  it("parses interfaces", () => {
    expect(parseInterface("([PC], [FTN]) = GC([VN])")).toEqual({ name: "GC", outputs: ["PC", "FTN"], inputs: ["VN"] });
    expect(parseInterface("no interface")).toBeNull();
  });

  it("parses interfaces whose Circuit IDs contain brackets and commas", () => {
    expect(parseInterface("([U.VTA(DA,out:NAC,rpe)], [U.Arc(AGRP+)]) = NAC(shell,DRD1+)([U.A9/46d@L(L3)], [U.VTA(DA,out:NAC,rpe)])")).toEqual({
      name: "NAC(shell,DRD1+)",
      outputs: ["VTA(DA,out:NAC,rpe)", "Arc(AGRP+)"],
      inputs: ["A9/46d@L(L3)", "VTA(DA,out:NAC,rpe)"],
    });
    expect(parseInterface("[U.NAC(shell)] = `U.VTA(DA)`([U.NAC(shell)])")).toEqual({ name: "VTA(DA)", outputs: ["NAC(shell)"], inputs: ["NAC(shell)"] });
    expect(parseInterface("([A]) = B()")).toEqual({ name: "B", outputs: ["A"], inputs: [] });
    expect(parseInterface("([A]) = f(x) = B([C])")).toBeNull();
    expect(parseInterface("([A]) = B([C]")).toBeNull();
  });
});

describe("checkHcd", () => {
  it("accepts a consistent HCD", () => {
    const r = checkHcd(HCD);
    expect(r.errors).toEqual([]);
    expect(r.model?.ucs.map((u) => u.roi)).toEqual(["input", "roi", "roi", "roi", "output"]);
    expect(r.model?.bif).toHaveLength(1);
    expect(r.model?.meta?.name).toBe("VOR adaptation in cerebellar flocculus");
  });

  it("reports interface mismatches, unknown circuits, unknown references and missing files", () => {
    const ucs = structuredClone(UC);
    ucs.ucs[2].interface = "([U.FTN]) = PC(purkinje)([U.GC(granule)])";
    const c = structuredClone(CONN);
    c.connections.push(conn("XX", "PC(purkinje)", "ghost", "[Nobody, 2000]"));
    const r = checkHcd({ ...HCD, uc: j(ucs), connections: j(c), report: null, decisionLog: "", meta: null });
    expect(r.fatal).toBe(false);
    const msg = r.errors.join("\n");
    expect(msg).toMatch(/report\.md is missing/);
    expect(msg).toMatch(/decision_log\.md is missing/);
    expect(msg).toMatch(/meta\.json is missing/);
    expect(msg).toMatch(/sender `XX`.*not a Circuit ID in uc\.json/);
    expect(msg).toMatch(/Reference ID \[Nobody, 2000\] is not in references\.json/);
    expect(msg).toMatch(/`PC\(purkinje\)`: interface inputs/);
  });

  it("requires the HCD section of the report and English values", () => {
    const ucs = structuredClone(UC);
    ucs.ucs[1].comments = "平行線維";
    const msg = checkHcd({ ...HCD, report: "# Report\n", uc: j(ucs) }).errors.join("\n");
    expect(msg).toMatch(/report\.md: add the `## HCD` section/);
    expect(msg).toMatch(/uc\.json: write every value in English; non-English text at \/ucs\/1\/comments/);
  });

  it("reports schema problems with a pointer and still checks the rest", () => {
    const ucs = structuredClone(UC) as { ucs: Record<string, unknown>[] };
    delete ucs.ucs[3].implementation;
    const msg = checkHcd({ ...HCD, uc: j(ucs) }).errors.join("\n");
    expect(msg).toMatch(/uc\.json: \/ucs\/3\/implementation is required \(see schemas\/uc\.schema\.json\)/);
    expect(msg).toMatch(/ROI-internal `IO` has empty implementation/);
  });

  it("is fatal without usable UC or connection data", () => {
    expect(checkHcd({ ...HCD, uc: "not json" }).fatal).toBe(true);
    expect(checkHcd({ ...HCD, uc: "not json" }).errors.join("\n")).toMatch(/uc\.json is not valid JSON/);
    expect(checkHcd({ ...HCD, connections: j({ bif: [] }) }).fatal).toBe(true);
  });
});

describe("BRA value rules in checkHcd", () => {
  it("asks for one reference per connection and one record per reference", () => {
    const c = structuredClone(CONN);
    c.connections[0].referenceIds = ["[Ito, 1982]", "[Lisberger, 1994]"];
    c.connections.push(conn("VN", "IO", "slip", "[Lisberger, 1994]"));
    const msg = checkHcd({ ...HCD, connections: j(c) }).errors.join("\n");
    expect(msg).toMatch(/\/connections\/0\/referenceIds must have at most 1 item/);
    expect(msg).toMatch(/`VN` -> `GC\(granule\)` cites 2 references; write one connection per reference/);
    expect(msg).toMatch(/`VN` -> `IO` is listed more than once for \[Lisberger, 1994\]/);
  });

  it("checks the relation and literature notation of both ends", () => {
    const c = structuredClone(CONN);
    Object.assign(c.connections[0], { receiverRelation: "<", receiverInLiterature: "GC(granule)" });
    Object.assign(c.connections[1], { senderRelation: "~" });
    const msg = checkHcd({ ...HCD, connections: j(c) }).errors.join("\n");
    expect(msg).toMatch(/receiverInLiterature is the Circuit ID `GC\(granule\)`, but receiverRelation is "<"/);
    expect(msg).toMatch(/\/connections\/1\/senderRelation must be one of "<", "=", ">"/);
  });

  it("checks the pointers of every connection", () => {
    const c = structuredClone(CONN);
    Object.assign(c.connections[1], { pointersOnLiterature: "p.1594", pointersOnFigure: "" });
    Object.assign(c.connections[2], { pointersOnLiterature: "", pointersOnFigure: "" });
    const msg = checkHcd({ ...HCD, connections: j(c) }).errors.join("\n");
    expect(msg).toMatch(/`VN` -> `IO` \(\[Lisberger, 1994\]\): pointersOnLiterature starts with a page or section locator/);
    expect(msg).toMatch(/`GC\(granule\)` -> `PC\(purkinje\)` \(\[Ito, 1982\]\): fill pointersOnLiterature or pointersOnFigure/);
    expect(checkHcd({ ...HCD, connections: j(c) }, { bra: { minQuoteWords: 1 } }).errors.join("\n")).toMatch(/locator/);
  });

  it("validates Taxon, Measurement method, Transmitter and Literature type against the BRA lists", () => {
    const c = structuredClone(CONN);
    Object.assign(c.connections[0], { taxon: "Macaca mulatta", measurementMethod: "single-unit recording" });
    const u = structuredClone(UC);
    u.ucs[1].transmitter = "GABA/Glycine";
    const refs = structuredClone(REFS) as { references: Record<string, unknown>[] };
    delete refs.references[0].literatureType;
    refs.references[1].literatureType = "Paper";
    const msg = checkHcd({ ...HCD, connections: j(c), uc: j(u), references: j(refs) }).errors.join("\n");
    expect(msg).toMatch(/\/connections\/0\/taxon must be one of "Mouse", "Rat"/);
    expect(msg).toMatch(/\/connections\/0\/measurementMethod must be one of/);
    expect(msg).toMatch(/\/ucs\/1\/transmitter must be one of "Acetylcholine"/);
    expect(msg).toMatch(/\/references\/0\/literatureType is required/);
    expect(msg).toMatch(/\/references\/1\/literatureType must be one of "Experimental results"/);
  });

  it("asks for an alternative URL (or PMID) when a reference has no DOI", () => {
    const refs = structuredClone(REFS);
    refs.references[1].alternativeUrl = "";
    expect(checkHcd({ ...HCD, references: j(refs) }).errors.join("\n")).toMatch(/\[Lisberger, 1994\] has no DOI; give alternativeUrl/);
    (refs.references[1] as Record<string, unknown>).pmid = "8083711";
    expect(checkHcd({ ...HCD, references: j(refs) }).errors).toEqual([]);
  });

  it("reads a Source of ID list written before 0.10 as its first value and asks for one value", () => {
    const u = structuredClone(UC) as { ucs: Record<string, unknown>[] };
    u.ucs[1].sourceOfId = ["[Ito, 1982]", "[Lisberger, 1994]"];
    u.ucs[3].sourceOfId = "[Ito, 1982]";
    const r = checkHcd({ ...HCD, uc: j(u) });
    const msg = r.errors.join("\n");
    expect(msg).toMatch(/\/ucs\/1\/sourceOfId must be string \(got array\)/);
    expect(msg).toMatch(/sourceOfId of `IO` is "\[Ito, 1982\]"; the UC is a whole DHBA term/);
    expect(r.model?.ucs[1].sourceOfId).toBe("[Ito, 1982]");
  });

  it("checks the Output Semantics notation of each UC", () => {
    const u = structuredClone(UC);
    u.ucs[1].outputSemantics = "parallel fibre signal";
    u.ucs[2].outputSemantics = "[GC(granule)] wrong circuit;";
    const msg = checkHcd({ ...HCD, uc: j(u) }).errors.join("\n");
    expect(msg).toMatch(/outputSemantics of `GC\(granule\)` must be exactly one item `\[GC\(granule\)\] content;`/);
    expect(msg).toMatch(/outputSemantics of `PC\(purkinje\)` must be exactly one item/);
  });

  it("requires [U.<Circuit ID>] references to name existing UCs", () => {
    const u = structuredClone(UC);
    u.ucs[1].requirement = "Relay mossy fibre input from [U.Broca] to [U.PC(purkinje)].";
    expect(checkHcd({ ...HCD, uc: j(u) }).errors.join("\n")).toMatch(/requirement of `GC\(granule\)` refers to \[U\.Broca\], which is not a Circuit ID/);
  });

  it("requires the names of an anchor-only UC to start with the SABRA official name", () => {
    const u = structuredClone(UC);
    u.ucs[0] = { ...u.ucs[0], circuitId: "A44d@L", descriptor: "BNA:29", names: "Broca's area" };
    const c = structuredClone(CONN);
    for (const x of c.connections) if (x.sender === "VN") x.sender = "A44d@L";
    for (const x of u.ucs) x.interface = x.interface.replaceAll("[U.VN]", "[U.A44d@L]");
    for (const x of u.ucs) x.implementation = x.implementation.replaceAll("[U.VN]", "[U.A44d@L]");
    u.ucs[0].outputSemantics = "[A44d@L] content;";
    u.ucs[0].sourceOfId = "BNA";
    const msg = checkHcd({ ...HCD, uc: j(u), connections: j(c) }).errors;
    expect(msg).toEqual([expect.stringMatching(/names of `A44d@L` must start with its SABRA official name "dorsal area 44"/)]);
    u.ucs[0].names = "left dorsal area 44; Broca's area pars opercularis";
    expect(checkHcd({ ...HCD, uc: j(u), connections: j(c) }).errors).toEqual([]);
  });
});

describe("checkFrg", () => {
  const hcd = checkHcd(HCD).model!;

  it("accepts a valid FRG", () => {
    expect(checkFrg(FRG, hcd).errors).toEqual([]);
  });

  it("enforces the GN-UC constraints, a single root and filled function items", () => {
    const bad = structuredClone(FRG_JSON);
    bad.nodes[1].subnodes = ["U.GC(granule)", "U.PC(purkinje)", "U.IO", "U.VN"];
    bad.nodes.push({ ...node("R.Orphan", ["U.PC(purkinje)"], "([U.FTN]) = R.Orphan([U.GC(granule)])"), mechanism: "" });
    const msg = checkFrg({ report: REPORT_HCD, frg: j(bad) }, hcd).errors.join("\n");
    expect(msg).toMatch(/R\.Context` has 4 UC subnodes/);
    expect(msg).toMatch(/U\.VN` is outside the ROI/);
    expect(msg).toMatch(/U\.PC\(purkinje\)` belongs to 3 GNs/);
    expect(msg).toMatch(/single UC/);
    expect(msg).toMatch(/exactly one root/);
    expect(msg).toMatch(/`R\.Orphan` has empty mechanism/);
    expect(msg).toMatch(/report\.md: add the `## FRG` section/);
  });

  it("requires [U.] / [R.] references in the function details to name existing nodes", () => {
    const bad = structuredClone(FRG_JSON);
    bad.nodes[1].requirement = "Combine [U.GC(granule)] and [U.IFG] for [R.Timing].";
    const msg = checkFrg({ ...FRG, frg: j(bad) }, hcd).errors.join("\n");
    expect(msg).toMatch(/requirement of `R\.Context` refers to \[U\.IFG\]/);
    expect(msg).toMatch(/requirement of `R\.Context` refers to \[R\.Timing\], which is not a node/);
  });
});

describe("buildCsvs", () => {
  const hcd = checkHcd(HCD).model!;
  const frg = checkFrg(FRG, hcd).model!;
  const opts = { projectId: "VOR", contributor: "Tester", projectTemplate: TEMPLATE };

  it("produces CSVs that the graph builder understands", () => {
    const { files, errors } = buildCsvs(hcd, frg, opts);
    expect(errors).toEqual([]);
    const project = parseCsvObjects(files!["Project.csv"])[0];
    expect(project).toMatchObject({ Contributor: "Tester", "Project ID": "VOR", "BRA version": BRA_VERSION });
    expect(project.Description).toContain("VOR adaptation");
    expect(files!["Circuits.csv"].split("\n")[0]).toBe("Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor,Sub-Circuits,Uniform");
    const circuits = parseCsvObjects(files!["Circuits.csv"]);
    expect(circuits[0]).toMatchObject({
      "Circuit ID": "ROI_VOR",
      "Source of ID": "collection",
      Names: "Cerebellar flocculus",
      "Sub-Circuits": "GC(granule);PC(purkinje);IO",
      Uniform: "FALSE",
    });
    expect(circuits.slice(1).every((c) => c.Uniform === "TRUE")).toBe(true);
    expect(circuits.find((c) => c["Circuit ID"] === "IO")?.["Source of ID"]).toBe("DHBA");
    expect(circuits.find((c) => c["Circuit ID"] === "VN")?.Comments).toBe("head velocity; noROI(input)");
    expect(circuits.find((c) => c["Circuit ID"] === "FTN")?.Comments).toBe("noROI(output)");
    const frgRows = parseCsvObjects(files!["FRG.csv"]);
    expect(frgRows.find((r) => r["Node ID"] === "U.VN")?.["Projected Circuits"]).toBe("GC(granule);IO");
    expect(frgRows.find((r) => r["Node ID"] === "R.Context")).toMatchObject({ Subnodes: "U.GC(granule);U.PC(purkinje)", Capability: "c", Requirements: "r" });
    expect(parseCsvObjects(files!["Connections.csv"])[2].Comments).toBe("parallel fibres, P(a|b)");
    expect(parseCsvObjects(files!["References.csv"])).toEqual([
      { "Reference ID": "[Ito, 1982]", DOI: "10.1146/annurev.ne.05.030182.001423", "Literature type": "Review", "Alternative URL": "" },
      { "Reference ID": "[Lisberger, 1994]", DOI: "N/A", "Literature type": "Experimental results", "Alternative URL": "https://example.org/lisberger-1994" },
    ]);
    expect(parseCsvObjects(files!["Connections.csv"])[0]["Pointers on figure"]).toBe("Fig. 1B");
    expect(parseCsvObjects(files!["Connections.csv"])[0]).toMatchObject({
      "sCID relation": "=",
      "Notation of sCID in Literature": "VN of the paper",
      "rCID relation": "<",
      "Notation of rCID in Literature": "cerebellar cortex",
    });
    const g = buildGraphs("VOR", {
      circuitsCsv: files!["Circuits.csv"],
      connectionsCsv: files!["Connections.csv"],
      frgCsv: files!["FRG.csv"],
      referencesCsv: files!["References.csv"],
    });
    expect(g.hcd.nodes).toHaveLength(5);
    expect(g.hcd.nodes.some((n) => n.id.startsWith("ROI_"))).toBe(false);
    expect(g.hcd.edges).toHaveLength(5);
    expect(g.frg.nodes.find((n) => n.id === "R.VOR-Adaptation")?.kind).toBe("tlf");
  });

  it("fills the Review End Lines, GN Output Semantics and the fixed text of UCs outside the ROI", () => {
    const { files } = buildCsvs(hcd, frg, opts);
    const rows = parseCsvObjects(files!["Project.csv"]);
    const endLine = (sheet: string) => rows.find((r) => r.Contributor === sheet)?.["Project ID"];
    // header row + data rows: 2 references, ROI row + 5 UCs, 5 connections, 3 GNs + 5 UCs
    expect([endLine("References"), endLine("Circuits"), endLine("Connections"), endLine("FRG")]).toEqual(["3", "7", "6", "9"]);
    const frgRows = parseCsvObjects(files!["FRG.csv"]);
    const os = (id: string) => frgRows.find((r) => r["Node ID"] === id)?.["Output Semantics"];
    expect(os("R.Context")).toBe("[PC(purkinje)] content;");
    expect(os("R.VOR-Adaptation")).toBe("[PC(purkinje)] content;");
    expect(frgRows.find((r) => r["Node ID"] === "U.VN")?.Capability).toBe(OUT_OF_ROI_CAPABILITY);
    expect(frgRows.find((r) => r["Node ID"] === "U.IO")?.Capability).toBe("cap");
  });

  it("writes one Connections row per reference for files written before one-reference records", () => {
    const old = structuredClone(hcd);
    old.connections[0].referenceIds = ["[Ito, 1982]", "[Lisberger, 1994]"];
    const { files } = buildCsvs(old, frg, opts);
    const rows = parseCsvObjects(files!["Connections.csv"]).filter((r) => r["Sender Circuit ID (sCID)"] === "VN" && r["Receiver Circuit ID (rCID)"] === "GC(granule)");
    expect(rows.map((r) => r["Reference ID"])).toEqual(["[Ito, 1982]", "[Lisberger, 1994]"]);
    const g = buildGraphs("VOR", { circuitsCsv: files!["Circuits.csv"], connectionsCsv: files!["Connections.csv"], frgCsv: files!["FRG.csv"] });
    const edge = g.hcd.edges.filter((e) => e.source === "VN" && e.target === "GC(granule)");
    expect(edge).toHaveLength(1);
    expect(edge[0].referenceId).toBe("[Ito, 1982]; [Lisberger, 1994]");
  });

  it("is deterministic", () => {
    expect(buildCsvs(hcd, frg, opts)).toEqual(buildCsvs(checkHcd(HCD).model!, checkFrg(FRG, hcd).model!, opts));
  });

  it("refuses non-English content", () => {
    const jp = structuredClone(hcd);
    jp.ucs[1].comments = "平行線維";
    const r = buildCsvs(jp, frg, opts);
    expect(r.files).toBeNull();
    expect(r.errors[0]).toMatch(/Circuits\.csv would contain non-English text/);
  });
});

describe("Collection Circuits", () => {
  const collection = (circuitId: string, descriptor: string, subCircuits: string[], extra: Record<string, unknown> = {}) => ({
    circuitId,
    descriptor,
    names: circuitId,
    sourceOfId: "collection",
    subCircuits,
    comments: "Members differ in cell type and projection target",
    ...extra,
  });
  const WITH_COLLECTIONS = {
    ...UC,
    collections: [
      collection("Cb", "HOMBA:12852", ["GC(granule)", "PC(purkinje)"], { comments: "Cerebellar cortex split into cell types" }),
      collection("Flocculus-loop", "", ["Cb", "IO"]),
    ],
  };
  const hcdWith = (uc: unknown, extra: Partial<HcdInputs> = {}) => checkHcd({ ...HCD, uc: j(uc), ...extra });
  const opts = { projectId: "VOR", contributor: "Tester", projectTemplate: TEMPLATE };

  it("accepts Collections and keeps uc.json without them valid", () => {
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], WITH_COLLECTIONS)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], { ...UC, collections: [] })).toEqual([]);
    const r = hcdWith(WITH_COLLECTIONS);
    expect(r.errors).toEqual([]);
    expect(r.model?.collections.map((c) => [c.id, c.subCircuits])).toEqual([
      ["Cb", ["GC(granule)", "PC(purkinje)"]],
      ["Flocculus-loop", ["Cb", "IO"]],
    ]);
    expect(checkHcd(HCD).model?.collections).toEqual([]);
  });

  it("writes Collections as Uniform = FALSE rows with Sub-Circuits and keeps them out of the FRG and the graph nodes", () => {
    const hcd = hcdWith(WITH_COLLECTIONS).model!;
    const frg = checkFrg(FRG, hcd);
    expect(frg.errors).toEqual([]);
    const { files, errors } = buildCsvs(hcd, frg.model!, opts);
    expect(errors).toEqual([]);
    const circuits = parseCsvObjects(files!["Circuits.csv"]);
    expect(circuits.slice(0, 3).map((c) => [c["Circuit ID"], c["Source of ID"], c["Sub-Circuits"], c.Uniform, c["UC Descriptor"]])).toEqual([
      ["ROI_VOR", "collection", "Cb;Flocculus-loop;GC(granule);PC(purkinje);IO", "FALSE", ""],
      ["Cb", "collection", "GC(granule);PC(purkinje)", "FALSE", "HOMBA:12852"],
      ["Flocculus-loop", "collection", "Cb;IO", "FALSE", ""],
    ]);
    expect(circuits.filter((c) => c.Uniform === "TRUE").every((c) => c["Sub-Circuits"] === "")).toBe(true);
    expect(parseCsvObjects(files!["FRG.csv"]).some((r) => ["U.Cb", "U.Flocculus-loop"].includes(r["Node ID"]))).toBe(false);
    const g = buildGraphs("VOR", { circuitsCsv: files!["Circuits.csv"], connectionsCsv: files!["Connections.csv"], frgCsv: files!["FRG.csv"] });
    expect(g.hcd.nodes.map((n) => n.id)).toEqual(["VN", "GC(granule)", "PC(purkinje)", "IO", "FTN"]);
    expect(g.hcd.collections?.map((c) => [c.id, c.subCircuits, c.members])).toEqual([
      ["Cb", ["GC(granule)", "PC(purkinje)"], ["GC(granule)", "PC(purkinje)"]],
      ["Flocculus-loop", ["Cb", "IO"], ["GC(granule)", "PC(purkinje)", "IO"]],
    ]);
    expect(buildGraphs("VOR", { circuitsCsv: files!["Circuits.csv"].replace(/,FALSE/g, ",TRUE"), connectionsCsv: "", frgCsv: "" }).hcd.collections).toBeUndefined();
  });

  it("does not let a Collection send or receive, and names its UCs in the feedback", () => {
    const c = structuredClone(CONN);
    c.connections.push(conn("Cb", "FTN", "output"), conn("VN", "Flocculus-loop", "input"));
    const msg = hcdWith(WITH_COLLECTIONS, { connections: j(c) }).errors.join("\n");
    expect(msg).toMatch(/sender `Cb` \(`Cb` -> `FTN`\) is a Collection; a Collection is neither sender nor receiver in this HCD\. Connect its UC\(s\) instead \(GC\(granule\), PC\(purkinje\)\)/);
    expect(msg).toMatch(/receiver `Flocculus-loop` .* is a Collection/);
    expect(msg).not.toMatch(/not a Circuit ID in uc\.json/);
  });

  it("checks Sub-Circuits: defined, not itself, no cycle, not all makeshift", () => {
    const bad = structuredClone(WITH_COLLECTIONS) as { ucs: Record<string, unknown>[]; collections: Record<string, unknown>[] };
    bad.collections[0].subCircuits = ["GC(granule)", "Cb", "Nowhere"];
    bad.collections[1].subCircuits = ["Cb", "IO", "Flocculus-loop"];
    bad.collections.push(collection("Loop-a", "", ["Loop-b"]), collection("Loop-b", "", ["Loop-a"]), collection("Invented", "", ["GC(granule)"]));
    bad.ucs[1].sourceOfId = "makeshift";
    const msg = hcdWith(bad).errors.join("\n");
    expect(msg).toMatch(/Collection `Cb` lists itself in subCircuits/);
    expect(msg).toMatch(/Collection `Cb`: subCircuit `Nowhere` is not a UC or Collection in uc\.json/);
    expect(msg).toMatch(/Collections form a cycle through subCircuits: Loop-a -> Loop-b -> Loop-a/);
    expect(msg).toMatch(/Collection `Invented`: every subCircuit is makeshift/);
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], { ...UC, collections: [collection("Empty", "", [])] }).join("\n")).toMatch(/\/collections\/0\/subCircuits needs at least 1 item/);
  });

  it("rejects duplicate IDs, the ROI_ prefix, a Source of ID other than collection and Collections in UC texts", () => {
    const bad = structuredClone(WITH_COLLECTIONS) as { ucs: Record<string, unknown>[]; collections: Record<string, unknown>[] };
    bad.collections.push(collection("IO", "", ["GC(granule)"]), collection("ROI_X", "", ["IO"]), collection("Cb-cells", "HOMBA:12852/cell:granule,purkinje", ["Cb"], { sourceOfId: "DHBA" }));
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], bad).join("\n")).toMatch(/\/collections\/4\/sourceOfId must be one of "collection"/);
    bad.ucs[1].capability = "Integrates [U.Cb] input";
    bad.ucs[1].comments = "Part of [U.Cb]";
    const msg = hcdWith(bad).errors.join("\n");
    expect(msg).toMatch(/Circuit ID `IO` is used by more than one circuit/);
    expect(msg).toMatch(/Collection `ROI_X`: Circuit IDs starting with ROI_ are reserved/);
    expect(msg).toMatch(/capability of `GC\(granule\)` refers to \[U\.Cb\], which is a Collection/);
    expect(msg).not.toMatch(/comments of `GC\(granule\)`/);
  });

  it("asks to turn a UC into a Collection when the HCD also splits it into finer UCs", () => {
    const bad = structuredClone(UC) as { ucs: Record<string, unknown>[] };
    bad.ucs.push(uc("Cb", "HOMBA:12852", { roi: "noROI(input)" }));
    const msg = hcdWith(bad).errors.join("\n");
    expect(msg).toMatch(/`Cb` is also split into finer UCs \(`GC\(granule\)`, `PC\(purkinje\)`\), so it is not uniform in this HCD\. Move it to collections/);
    expect(hcdWith(WITH_COLLECTIONS).errors.join("\n")).not.toMatch(/not uniform/);
  });

  it("requires a Collection to say why it is heterogeneous", () => {
    const bad = structuredClone(WITH_COLLECTIONS) as { collections: Record<string, unknown>[] };
    bad.collections[1].comments = "";
    expect(hcdWith(bad).errors.join("\n")).toMatch(/\/collections\/1\/comments must not be empty/);
  });

  it("keeps Collections out of the FRG leaves", () => {
    const hcd = hcdWith(WITH_COLLECTIONS).model!;
    const bad = structuredClone(FRG_JSON);
    bad.nodes[1].subnodes = ["U.Cb", "U.GC(granule)"];
    bad.nodes[2].requirement = "Uses [U.Flocculus-loop]";
    const msg = checkFrg({ ...FRG, frg: j(bad) }, hcd).errors.join("\n");
    expect(msg).toMatch(/`R\.Context`: `U\.Cb` is a Collection; FRG leaves are UCs, so attach its UCs \(GC\(granule\), PC\(purkinje\)\) instead/);
    expect(msg).toMatch(/requirement of `R\.Learning` refers to \[U\.Flocculus-loop\], which is a Collection/);
  });
});

describe("Senders that span several SABRA units (BRA 203)", () => {
  // Left fusiform gyrus (BNAG:FuG@L) sends to the ROI; BNA:105 / BNA:106 are the left / right medioventral area 37 in it
  const gyrus = (extra: Record<string, unknown> = {}) => ({ ...UC, ucs: [...UC.ucs.map((u) => (u.circuitId === "VN" ? { ...u, circuitId: "FuG@L", descriptor: "BNAG:FuG@L", ...extra } : u))] });
  const conns = () => {
    const c = structuredClone(CONN);
    for (const x of c.connections) {
      if (x.sender === "VN") x.sender = "FuG@L";
      if (x.receiver === "VN") x.receiver = "FuG@L";
    }
    return c;
  };
  const hcdOf = (uc: unknown) => checkHcd({ ...HCD, uc: j(uc), connections: j(conns()) });
  const fix = (u: ReturnType<typeof gyrus>) => {
    for (const x of u.ucs) for (const k of ["interface", "requirement", "requirementRealization", "capability", "mechanism", "implementation"] as const) if (typeof x[k] === "string") x[k] = (x[k] as string).replace(/U\.VN\b/g, "U.FuG@L");
    return u;
  };

  it("asks a gyrus-level sender to be split into its areas or to say why it is uniform, without asking for layers", () => {
    const msg = hcdOf(fix(gyrus())).errors.join("\n");
    expect(msg).toMatch(/`FuG@L` spans the BNA group FuG \(several BNA areas\) and sends connections, but a sender must be uniform in this HCD \(BRA 203\)/);
    expect(msg).toMatch(/Layer or cell-type evidence is not needed/);
    expect(msg).toMatch(/uniformityNote/);
  });

  it("accepts the sender with a uniformityNote and writes the note into the Circuits comments", () => {
    const r = hcdOf(fix(gyrus({ uniformityNote: "The cited papers report only the whole gyrus and its areas play one role for the TLF" })));
    expect(r.errors.join("\n")).not.toMatch(/BRA 203/);
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], fix(gyrus({ uniformityNote: "x" })))).toEqual([]);
    const frg = checkFrg(FRG, r.model!).model!;
    const circuits = parseCsvObjects(buildCsvs(r.model!, frg, { projectId: "VOR", contributor: "T", projectTemplate: TEMPLATE }).files!["Circuits.csv"]);
    expect(circuits.find((c) => c["Circuit ID"] === "FuG@L")?.Comments).toBe("head velocity; Uniform in this project: The cited papers report only the whole gyrus and its areas play one role for the TLF; noROI(input)");
  });

  it("does not flag a single area, a bilateral pair or a gyrus that only receives", () => {
    const one = hcdOf(fix(gyrus({ circuitId: "A37mv@L", descriptor: "BNA:105" })));
    expect(one.errors.join("\n")).not.toMatch(/BRA 203/);
    const pair = hcdOf(fix(gyrus({ circuitId: "A37mv", descriptor: "BNA:105-106" })));
    expect(pair.errors.join("\n")).not.toMatch(/BRA 203/);
    const sink = structuredClone(UC);
    sink.ucs[4] = { ...sink.ucs[4], circuitId: "FTN", descriptor: "BNAG:FuG@L" };
    expect(checkHcd({ ...HCD, uc: j(sink) }).errors.join("\n")).not.toMatch(/BRA 203/);
  });

  it("asks to turn a gyrus into a Collection when its areas are UCs too", () => {
    const u = structuredClone(UC) as { ucs: Record<string, unknown>[] };
    u.ucs.push(uc("FuG@L", "BNAG:FuG@L", { roi: "noROI(input)" }), uc("A37mv@L", "BNA:105", { roi: "noROI(input)" }), uc("A37mv@R", "BNA:106", { roi: "noROI(input)" }));
    const msg = checkHcd({ ...HCD, uc: j(u) }).errors.join("\n");
    expect(msg).toMatch(/`FuG@L` is also split into finer UCs \(`A37mv@L`\), so it is not uniform in this HCD/);
    const pair = structuredClone(UC) as { ucs: Record<string, unknown>[] };
    pair.ucs.push(uc("A37mv", "BNA:105-106", { roi: "noROI(input)" }), uc("A37mv@R", "BNA:106", { roi: "noROI(input)" }));
    expect(checkHcd({ ...HCD, uc: j(pair) }).errors.join("\n")).toMatch(/`A37mv` is also split into finer UCs \(`A37mv@R`\)/);
  });
});

describe("parseTurnOutput", () => {
  it("parses structured final messages", () => {
    expect(parseTurnOutput('{"status":"question","message":"","question":"Which ROI?"}')).toEqual({ status: "question", message: "", question: "Which ROI?" });
    expect(parseTurnOutput('{"status":"done","message":"HCD ready","question":null}')).toEqual({ status: "done", message: "HCD ready", question: null });
    expect(parseTurnOutput("plain text")).toBeNull();
  });
});

describe("meta.json", () => {
  it("normalises the name", () => {
    const r = checkHcd({ ...HCD, meta: j({ ...META, name: "  VOR adaptation   in cerebellar flocculus " }) });
    expect(r.errors).toEqual([]);
    expect(r.model?.meta?.name).toBe("VOR adaptation in cerebellar flocculus");
  });

  it("requires every field and reports a name with a line break", () => {
    const { name: _name, ...noName } = META;
    expect(checkHcd({ ...HCD, meta: j(noName) }).errors.join("\n")).toMatch(/meta\.json: \/name is required/);
    expect(checkHcd({ ...HCD, meta: j({ ...META, name: "a\nb" }) }).errors.join("\n")).toMatch(/meta\.json: "name" is invalid/);
  });
});
