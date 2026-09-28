import { describe, expect, it } from "vitest";
import {
  HARNESS_SCHEMAS,
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
    { id: "[Ito, 1982]", doi: "10.1146/annurev.ne.05.030182.001423" },
    { id: "[Lisberger, 1994]", doi: "N/A" },
  ],
};

const fn = (id: string) => ({
  requirement: `req of [U.${id}]`,
  requirementRealization: `real of [U.${id}]`,
  capability: "cap",
  mechanism: "mech",
  implementation: `[U.${id}] = f([U.x])`,
});
const noFn = { interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "" };
const uc = (circuitId: string, descriptor: string, extra: Record<string, unknown>) => ({
  circuitId,
  descriptor,
  names: circuitId,
  roi: "internal",
  sourceOfId: ["[Ito, 1982]"],
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
    uc("GC(granule)", "HOMBA:12852/cell:granule", { comments: "parallel fibres", interface: "([U.PC(purkinje)]) = GC(granule)([U.VN])", ...fn("GC") }),
    uc("PC(purkinje)", "HOMBA:12852/cell:purkinje", { transmitter: "GABA", modulationType: "Inhibitory", interface: "([U.FTN]) = PC(purkinje)([U.GC(granule)], [U.IO])", ...fn("PC") }),
    uc("IO", "HOMBA:12500", { sourceOfId: ["[Lisberger, 1994]"], interface: "([U.PC(purkinje)]) = IO([U.VN])", ...fn("IO") }),
    uc("FTN", "HOMBA:12951", { roi: "noROI(output)", transmitter: "GABA", modulationType: "Inhibitory", outputSemantics: "" }),
  ],
};

const conn = (sender: string, receiver: string, comment: string, ref = "[Ito, 1982]") => ({
  sender,
  receiver,
  comment,
  referenceIds: [ref],
  taxon: "rabbit",
  measurementMethod: "tracing",
  pointersOnLiterature: "p.3",
  pointersOnFigure: "Fig. 1",
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

const TEMPLATE = "Contributor,Project ID,List of contributors,Description,BRA version\n,,,,CoBRAC-v1-0\n,,,,\nSheet Name,Review End Line,,,\n";

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
});

describe("buildCsvs", () => {
  const hcd = checkHcd(HCD).model!;
  const frg = checkFrg(FRG, hcd).model!;
  const opts = { projectId: "VOR", contributor: "Tester", projectTemplate: TEMPLATE };

  it("produces CSVs that the graph builder understands", () => {
    const { files, errors } = buildCsvs(hcd, frg, opts);
    expect(errors).toEqual([]);
    const project = parseCsvObjects(files!["Project.csv"])[0];
    expect(project).toMatchObject({ Contributor: "Tester", "Project ID": "VOR", "BRA version": "CoBRAC-v1-0" });
    expect(project.Description).toContain("VOR adaptation");
    expect(files!["Circuits.csv"].split("\n")[0]).toBe("Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor");
    const circuits = parseCsvObjects(files!["Circuits.csv"]);
    expect(circuits.find((c) => c["Circuit ID"] === "VN")?.Comments).toBe("head velocity; noROI(input)");
    expect(circuits.find((c) => c["Circuit ID"] === "FTN")?.Comments).toBe("noROI(output)");
    const frgRows = parseCsvObjects(files!["FRG.csv"]);
    expect(frgRows.find((r) => r["Node ID"] === "U.VN")?.["Projected Circuits"]).toBe("GC(granule);IO");
    expect(frgRows.find((r) => r["Node ID"] === "R.Context")).toMatchObject({ Subnodes: "U.GC(granule);U.PC(purkinje)", Capability: "c", Requirements: "r" });
    expect(parseCsvObjects(files!["Connections.csv"])[2].Comments).toBe("parallel fibres, P(a|b)");
    expect(parseCsvObjects(files!["References.csv"]).map((r) => r["Reference ID"])).toEqual(["[Ito, 1982]", "[Lisberger, 1994]"]);
    const g = buildGraphs("VOR", {
      circuitsCsv: files!["Circuits.csv"],
      connectionsCsv: files!["Connections.csv"],
      frgCsv: files!["FRG.csv"],
      referencesCsv: files!["References.csv"],
    });
    expect(g.hcd.nodes).toHaveLength(5);
    expect(g.hcd.edges).toHaveLength(5);
    expect(g.frg.nodes.find((n) => n.id === "R.VOR-Adaptation")?.kind).toBe("tlf");
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
