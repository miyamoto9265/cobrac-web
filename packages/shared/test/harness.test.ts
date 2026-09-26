import { describe, expect, it } from "vitest";
import { buildCsvs, buildGraphs, checkFrg, checkHcd, parseCsvObjects, parseInterface, parseMdTables, parseTurnOutput } from "../src/index.js";

const META = JSON.stringify({ roi: "Cerebellar flocculus", tlf: "VOR adaptation", description: "HCD/FRG of VOR adaptation in the cerebellar flocculus." });

const BIF = `# BIF
## References
| Reference ID | DOI |
|---|---|
| [Ito, 1982] | 10.1146/annurev.ne.05.030182.001423 |
| [Lisberger, 1994] | N/A |

## Connections
| Sender | Receiver | Comment | Reference ID |
|---|---|---|---|
| vestibular nerve | granule cells | mossy fibres | [Ito, 1982] |
`;

const UC_HEADER =
  "| Circuit ID | Names | Source of ID | Transmitter | Modulation Type | Comments | Interface | Output Semantics | Requirement | Requirement realization by interface | Capability | Mechanism | Implementation |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
const fn = (id: string) => `req of [U.${id}] | real of [U.${id}] | cap | mech | [U.${id}] = f([U.x])`;
const UC =
  "# UC\n" +
  UC_HEADER +
  "| `VN` | Vestibular nucleus input | [Ito, 1982] | Glutamate | Excitatory | head velocity; noROI(input) |  | [VN]head velocity; |  |  |  |  |  |\n" +
  `| \`GC\` | Granule cells | [Ito, 1982] | Glutamate | Excitatory | parallel fibres | ([PC]) = GC([VN]) | [GC]expanded context; | ${fn("GC")} |\n` +
  `| \`PC\` | Purkinje cells | [Ito, 1982] | GABA | Inhibitory | output | ([FTN]) = PC([GC], [IO]) | [PC]gain signal; | ${fn("PC")} |\n` +
  `| \`IO\` | Inferior olive | [Lisberger, 1994] | Glutamate | Excitatory | retinal slip | ([PC]) = IO([VN]) | [IO]error; | ${fn("IO")} |\n` +
  "| `FTN` | Flocculus target neurons | [Lisberger, 1994] | GABA | Inhibitory | eye motor; noROI(output) |  |  |  |  |  |  |  |\n";

const CONN =
  "| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference ID | Taxon | Measurement method | Pointers on literature | Pointers on figure |\n|---|---|---|---|---|---|---|---|\n" +
  "| `VN` | `GC` | mossy fibres | [Ito, 1982] | rabbit | tracing | p.3 | Fig. 1 |\n" +
  "| `VN` | `IO` | slip | [Lisberger, 1994] | monkey | recording | p.5 | Fig. 2 |\n" +
  "| `GC` | `PC` | parallel fibres, P(a\\|b) | [Ito, 1982] | rabbit | recording | p.4 | Fig. 3 |\n" +
  "| `IO` | `PC` | climbing fibres | [Lisberger, 1994] | monkey | recording | p.6 | Fig. 4 |\n" +
  "| `PC` | `FTN` | inhibition | [Lisberger, 1994] | monkey | recording | p.7 | Fig. 5 |\n";

const HCD = { thinking: "log", bif: BIF, uc: UC, connection: CONN, verification: "ok", report: "report" };

const FINAL =
  "| Node ID | Subnodes | Comment | Interface |\n|---|---|---|---|\n" +
  "| `R.VOR-Adaptation` | `R.Context`;`R.Learning` | TLF | ([U.FTN]) = R.VOR-Adaptation([U.VN]) |\n" +
  "| `R.Context` | `U.GC`;`U.PC` | context | ([U.FTN]) = R.Context([U.VN], [U.IO]) |\n" +
  "| `R.Learning` | `U.IO`;`U.PC` | error learning | ([U.FTN]) = R.Learning([U.VN], [U.GC]) |\n";
const DETAILS =
  "| Node ID | Requirement | Requirement realization by interface | Capability | Mechanism |\n|---|---|---|---|---|\n" +
  ["R.VOR-Adaptation", "R.Context", "R.Learning"].map((id) => `| \`${id}\` | r | rr | c | m |`).join("\n") +
  "\n";
const FRG = { init: "x", optimized: "x", final: FINAL, details: DETAILS, report: "x" };

const TEMPLATE = 'Contributor,Project ID,List of contributors,Description,BRA version\n,,,,CoBRAC-v1-0\n,,,,\nSheet Name,Review End Line,,,\n';

describe("markdown tables", () => {
  it("parses escaped pipes and ignores fenced code", () => {
    const t = parseMdTables("```\n| a | b |\n|---|---|\n```\n| x | y |\n|---|---|\n| 1\\|2 | 3 |\n");
    expect(t).toHaveLength(1);
    expect(t[0].rows[0]).toEqual(["1|2", "3"]);
  });

  it("parses interfaces", () => {
    expect(parseInterface("([PC], [FTN]) = GC([VN])")).toEqual({ outputs: ["PC", "FTN"], inputs: ["VN"] });
    expect(parseInterface("no interface")).toBeNull();
  });
});

describe("checkHcd", () => {
  it("accepts a consistent HCD", () => {
    const r = checkHcd(HCD, META);
    expect(r.errors).toEqual([]);
    expect(r.model?.ucs.map((u) => u.roi)).toEqual(["input", "roi", "roi", "roi", "output"]);
  });

  it("reports interface mismatches, unknown circuits and missing files", () => {
    const uc = UC.replace("([FTN]) = PC([GC], [IO])", "([FTN]) = PC([GC])");
    const conn = CONN + "| `XX` | `PC` | ghost | [Ito, 1982] | rat | x | x | x |\n";
    const r = checkHcd({ ...HCD, uc, connection: conn, report: null }, null);
    expect(r.fatal).toBe(false);
    expect(r.errors.join("\n")).toMatch(/6_FinalReport\.md is missing/);
    expect(r.errors.join("\n")).toMatch(/meta\.json is missing/);
    expect(r.errors.join("\n")).toMatch(/`XX`.*not a Circuit ID/);
    expect(r.errors.join("\n")).toMatch(/`PC`: Interface inputs/);
  });

  it("merges legacy layouts: split tables and vertical per-UC tables", () => {
    const legacy =
      "| Circuit ID | Names | Source of ID | Transmitter | Modulation Type | Comments |\n|---|---|---|---|---|---|\n" +
      "| `GC` | Granule cells | [Ito, 1982] | Glutamate | Excitatory | parallel fibres |\n" +
      "| `VN` | Vestibular nucleus | [Ito, 1982] | Glutamate | Excitatory | noROI(input) |\n" +
      "| Circuit ID | Comment | Interface | Output Semantics |\n|---|---|---|---|\n" +
      "| `GC` | x | ([PC]) = GC([VN]) | [GC]context; |\n\n" +
      "### `GC` - Granule Cell\n\n| Field | Value |\n|---|---|\n| **Requirement** | req |\n| **Capability** | cap |\n| **Mechanism** | mech |\n";
    const ucs = checkHcd({ ...HCD, uc: legacy }, META).model!.ucs;
    const gc = ucs.find((u) => u.id === "GC")!;
    expect(ucs).toHaveLength(2);
    expect(gc).toMatchObject({ names: "Granule cells", interfaceText: "([PC]) = GC([VN])", requirement: "req", capability: "cap", comments: "parallel fibres" });
  });

  it("is fatal without a UC table", () => {
    expect(checkHcd({ ...HCD, uc: "nothing" }, META).fatal).toBe(true);
  });
});

describe("checkFrg", () => {
  const hcd = checkHcd(HCD, META).model!;

  it("accepts a valid FRG", () => {
    expect(checkFrg(FRG, hcd).errors).toEqual([]);
  });

  it("enforces the GN-UC constraints and a single root", () => {
    const bad =
      FINAL.replace("`U.GC`;`U.PC`", "`U.GC`;`U.PC`;`U.IO`;`U.VN`") + "| `R.Orphan` | `U.PC` | lone | ([U.FTN]) = R.Orphan([U.GC]) |\n";
    const msg = checkFrg({ ...FRG, final: bad }, hcd).errors.join("\n");
    expect(msg).toMatch(/R\.Context` has 4 UC subnodes/);
    expect(msg).toMatch(/U\.VN` is outside the ROI/);
    expect(msg).toMatch(/U\.PC` belongs to 3 GNs/);
    expect(msg).toMatch(/single UC/);
    expect(msg).toMatch(/exactly one root/);
    expect(msg).toMatch(/no row for `R\.Orphan`/);
  });
});

describe("buildCsvs", () => {
  const hcd = checkHcd(HCD, META).model!;
  const frg = checkFrg(FRG, hcd).model!;
  const opts = { projectId: "VOR", contributor: "Tester", projectTemplate: TEMPLATE };

  it("produces CSVs that the graph builder understands", () => {
    const { files, errors } = buildCsvs(hcd, frg, opts);
    expect(errors).toEqual([]);
    const project = parseCsvObjects(files!["Project.csv"])[0];
    expect(project).toMatchObject({ Contributor: "Tester", "Project ID": "VOR", "BRA version": "CoBRAC-v1-0" });
    expect(project.Description).toContain("VOR adaptation");
    const frgRows = parseCsvObjects(files!["FRG.csv"]);
    expect(frgRows.find((r) => r["Node ID"] === "U.VN")?.["Projected Circuits"]).toBe("GC;IO");
    expect(parseCsvObjects(files!["Connections.csv"])[2].Comments).toBe("parallel fibres, P(a|b)");
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

  it("refuses non-English content", () => {
    const jp = checkHcd({ ...HCD, uc: UC.replace("parallel fibres", "平行線維") }, META).model!;
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
