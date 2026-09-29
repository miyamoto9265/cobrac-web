import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  BRA_TEMPLATE_FILE,
  OUT_OF_ROI_CAPABILITY,
  bibKeyOfDoi,
  buildBibtex,
  buildTemplateXlsx,
  colLetters,
  readTemplateSheet,
  shiftFormulaForInsert,
  templateHeaders,
  templateReferenceIds,
  toCsv,
  translateFormula,
  type TemplateExportInput,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(here, "../../../prompts/templates", BRA_TEMPLATE_FILE));
const fixture = (f: string) => readFileSync(join(here, "fixtures", f), "utf8");
const P = "TestProject";

/** Row 1 XML of every data sheet, exactly as stored. */
function headerRowXml(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes);
  return ["sheet1", "sheet2", "sheet3", "sheet4", "sheet5"].map((s) => /<row r="1"[\s\S]*?<\/row>/.exec(strFromU8(files[`xl/worksheets/${s}.xml`]))![0]);
}

const project = toCsv([
  ["Contributor", "Project ID", "List of contributors", "Description", "BRA version"],
  ["Tester", P, "Tester", "Reward learning in the ventral striatum.", "CoBRAC-v1-1"],
]);

function modernInput(n: { refs: number; ucs: number; conns: number }): TemplateExportInput {
  const refIds = ["[Schultz et al., 1997]", "[Schultz, 1997]", "[Haber and Knutson, 2010]", ...Array.from({ length: n.refs - 3 }, (_, i) => `[Author${colLetters(i + 1)}, ${2000 + (i % 20)}]`)];
  const ucs = [
    ["VTA", "DHBA", "ventral tegmental area", "Dopamine", "Modulatory", "Dopamine neurons", "HOMBA:12261", "", "TRUE"],
    ["VTA(DRD2+)", "makeshift", "ventral tegmental area; DRD2 neurons", "Dopamine", "Modulatory", "", "HOMBA:12261/mol:DRD2+", "", "TRUE"],
    ["A9/46d@L", "BNA", "left dorsal area 9/46", "Glutamate", "Excitatory", "context", "BNA:23", "", "TRUE"],
    ...Array.from({ length: n.ucs - 3 }, (_, i) => [`X${i}`, "[Schultz, 1997]", `x ${i}`, "", "", "noROI(input)", "", "", "TRUE"]),
  ];
  const ids = ucs.map((u) => u[0]);
  return {
    projectId: P,
    contributor: "Tester",
    csv: {
      project,
      references: toCsv([
        ["Reference ID", "DOI", "Literature type", "Alternative URL"],
        ...refIds.map((id, i) => [id, i === 2 ? "N/A" : `10.1000/test.${i}`, "Experimental results", i === 2 ? "https://example.org/haber" : ""]),
      ]),
      circuits: toCsv([
        ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", "UC Descriptor", "Sub-Circuits", "Uniform"],
        [`ROI_${P}`, "collection", "Ventral striatum", "", "", "Region of interest of the project", "", ids.slice(0, 3).join(";"), "FALSE"],
        ...ucs,
      ]),
      connections: toCsv([
        ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)", "Comments", "Reference ID", "Taxon", "Measurement method", "Pointers on literature", "Pointers on figure", "sCID relation", "Notation of sCID in Literature", "rCID relation", "Notation of rCID in Literature"],
        ...Array.from({ length: n.conns }, (_, i) => [ids[i % ids.length], ids[(i + 1) % ids.length], `c${i}`, refIds[i % refIds.length], "Macaque", "Anterograde tracing", "The projection is stated in the paper in one sentence here.", "Fig. 1", "<", "dorsal PFC", "=", "VTA"]),
      ]),
      frg: toCsv([
        ["Node ID", "Subnodes", "Circuit ID", "Projected Circuits", "Capability", "Mechanism", "Implementation of Uniform Circuit", "Requirements Realization by Interface", "Requirements", "Output Semantics", "Comments"],
        ["R.Top", ids.map((x) => `U.${x}`).join(";"), "", "", "cap", "mech", "", "real", "req", "[VTA] RPE;", "TLF"],
        ["U.VTA", "", "VTA", "A9/46d@L;X0", "cap VTA", "mech VTA", "[U.VTA] = f([U.X0])", "real VTA", "req VTA", "[VTA] RPE;", "c"],
        ["U.X0", "", "X0", "", OUT_OF_ROI_CAPABILITY, "", "", "", "", "", "noROI(input)"],
      ]),
    },
    bibliography: {
      version: 1,
      records: {
        [bibKeyOfDoi("10.1000/test.0")]: {
          source: "crossref",
          type: "journal-article",
          authors: [
            { family: "Schultz", given: "Wolfram" },
            { family: "Dayan", given: "Peter" },
          ],
          title: "A Neural Substrate of Prediction and Reward",
          container: "Science",
          year: 1997,
          volume: "275",
          issue: "5306",
          pages: "1593-1599",
          doi: "10.1000/test.0",
        },
      },
    },
  };
}

describe("formula references", () => {
  it("moves relative references when copied, inside Google's DUMMYFUNCTION text too, and keeps other literals", () => {
    const f = 'IFERROR(__xludf.DUMMYFUNCTION("IF(ISBLANK(E29), ""x"", $E29&Circuits!$A$2)"),"A40/39")';
    expect(translateFormula(f, 3)).toBe('IFERROR(__xludf.DUMMYFUNCTION("IF(ISBLANK(E32), ""x"", $E32&Circuits!$A$2)"),"A40/39")');
  });

  it("moves references to rows at or below the insertion, on the same sheet or by sheet name", () => {
    expect(shiftFormulaForInsert("FILTER(References!$B$2:$B$2126,T$2:T$1861=A81)", "Connections", "References", 30, 5)).toBe("FILTER(References!$B$2:$B$2131,T$2:T$1861=A81)");
    expect(shiftFormulaForInsert("FILTER(References!$B$2:$B$2126,T$2:T$1861=A81)", "Connections", "Connections", 81, 5)).toBe("FILTER(References!$B$2:$B$2126,T$2:T$1866=A86)");
    expect(shiftFormulaForInsert('IMPORTRANGE(Settings!$A$2,"wbCircuits!A2:AM4000")', "Circuits", "Circuits", 32, 9)).toBe('IMPORTRANGE(Settings!$A$2,"wbCircuits!A2:AM4000")');
  });
});

describe("Reference IDs and BibTeX", () => {
  it("uses the first author and year, and keeps coinciding IDs apart", () => {
    const m = templateReferenceIds(["[Schultz et al., 1997]", "[Schultz, 1997]", "[Haber and Knutson, 2010]", "[van der Meer, 2010a]"]);
    expect([...m.values()].map((x) => x.id)).toEqual(["Schultz, 1997", "Schultz, 1997b", "Haber, 2010", "vanderMeer, 2010a"]);
    expect(m.get("[Schultz, 1997]")!.key).toBe("Schultz_1997b");
  });

  it("writes BibTeX the template's regular expressions can read", () => {
    const b = buildBibtex({
      key: "Schultz_1997",
      record: { source: "crossref", type: "journal-article", authors: [{ family: "Schultz", given: "W." }, { family: "Dayan", given: "P." }], title: "A {neural} substrate", container: "Science", year: 1997, pages: "1593–1599", doi: "10.1126/x" },
      fallback: {},
    });
    const e = b.bibtex;
    // the formulas of References!A, G, H, I, J (RE2 without the s flag)
    const id = `${/@.+{(.+)\d{4}/.exec(e.replace(/_/g, ""))![1]}, ${/@.+{.+(\d{4}.*),/.exec(e)![1]}`;
    expect(id).toBe("Schultz, 1997");
    expect(/@(.+){/.exec(e)![1]).toBe("article");
    expect(/author += +{(.+)}/.exec(e)![1].replace(/ and/g, ",")).toBe("W. Schultz, P. Dayan");
    expect(/title *= *{(.+)}/.exec(e)![1]).toBe("A neural substrate");
    expect(/journal *= *{(.+)}/.exec(e)![1]).toBe("Science");
    expect(e).toContain("pages = {1593--1599}");
    expect(b).toMatchObject({ type: "Article", authors: "W. Schultz, P. Dayan", title: "A neural substrate", container: "Science" });
  });
});

describe("Template-v2-2 export", () => {
  const small = buildTemplateXlsx(TEMPLATE, modernInput({ refs: 4, ucs: 4, conns: 5 }));
  const big = buildTemplateXlsx(TEMPLATE, modernInput({ refs: 40, ucs: 45, conns: 120 }));

  it("keeps every header row of the template exactly", () => {
    for (const r of [small, big]) {
      expect(templateHeaders(r.bytes)).toEqual(templateHeaders(TEMPLATE));
      expect(headerRowXml(r.bytes)).toEqual(headerRowXml(TEMPLATE));
    }
  });

  it("keeps the sheets and parts of the template", () => {
    const a = Object.keys(unzipSync(TEMPLATE)).sort();
    expect(Object.keys(unzipSync(small.bytes)).sort()).toEqual(a);
    const admin = (b: Uint8Array) => strFromU8(unzipSync(b)["xl/worksheets/sheet8.xml"]);
    expect(admin(big.bytes)).toBe(admin(TEMPLATE));
  });

  it("fills the Project sheet and the Review End Lines", () => {
    const s = readTemplateSheet(small.bytes, "Project");
    const v = (a: string) => s.get(a)?.text;
    expect([v("A2"), v("B2"), v("C2"), v("D2"), v("E2")]).toEqual(["Tester", P, "Tester", "Reward learning in the ventral striatum.", "Template-v2-2.bra"]);
    expect([v("B5"), v("B6"), v("B7"), v("B8")]).toEqual(["5", "6", "6", "4"]);
  });

  it("writes References with DOI, BibTeX, Literature type, Alternative URL and the values of the automatic columns", () => {
    const s = readTemplateSheet(small.bytes, "References");
    expect(s.get("A2")).toMatchObject({ text: "Schultz, 1997" });
    expect(s.get("A2")!.formula).toContain("REGEXEXTRACT");
    expect(s.get("A3")!.text).toBe("Schultz, 1997b");
    expect(s.get("D2")!.text).toBe("10.1000/test.0");
    expect(s.get("E2")!.text).toMatch(/^@article\{Schultz_1997,\n\tdoi = \{10\.1000\/test\.0\},/);
    expect([s.get("F2")!.text, s.get("G2")!.text, s.get("H2")!.text, s.get("I2")!.text, s.get("J2")!.text]).toEqual([
      "Experimental results",
      "Article",
      "Wolfram Schultz, Peter Dayan",
      "A Neural Substrate of Prediction and Reward",
      "Science",
    ]);
    expect(s.get("D4")?.text ?? "").toBe("");
    expect(s.get("K4")!.text).toBe("https://example.org/haber");
    expect(s.get("E4")!.text).toContain("author = {Haber and Knutson}");
    expect([s.get("L2")!.text, s.get("M2")!.text]).toEqual(["Tester", P]);
    expect(s.get("B2")!.formula).toContain("HYPERLINK");
  });

  it("writes Circuits with the ROI row, one Source of ID and the DHBA columns where the anchor is a DHBA term", () => {
    const s = readTemplateSheet(small.bytes, "Circuits");
    const row = (r: number, cols: string[]) => cols.map((c) => s.get(`${c}${r}`)?.text ?? "");
    expect(row(2, ["A", "B", "C", "S", "U", "AO"])).toEqual([`ROI_${P}`, "collection", "Ventral striatum", "VTA;VTA(DRD2+);A9/46d@L", "FALSE", `ROI_${P};\nVTA;\nVTA(DRD2+);\nA9/46d@L;`]);
    expect(row(3, ["A", "B", "D", "E", "F", "G", "K", "L", "U", "V", "W"])).toEqual(["VTA", "DHBA", "2540", "ventral tegmental area", "Br", "M", "VTA", "", "TRUE", "Dopamine", "Modulatory"]);
    expect(s.get("AA3")!.text).toBe("Dopamine neurons\nUC Descriptor: HOMBA:12261");
    expect(row(4, ["D", "E", "F"])).toEqual(["2540.1", "", ""]);
    expect(row(5, ["A", "B", "D", "E"])).toEqual(["A9/46d@L", "BNA", "", ""]);
    expect(s.get("B6")!.text).toBe("[Schultz, 1997b]");
    expect(small.notes.join("\n")).toContain("anchored on BNA");
  });

  it("writes Connections A–N and the contributor columns; one reference per row in the template's ID form", () => {
    const s = readTemplateSheet(small.bytes, "Connections");
    const cols = ["A", "B", "C", "D", "E", "F", "H", "I", "J", "K", "L", "M", "AE", "AF"];
    expect(cols.map((c) => s.get(`${c}2`)?.text ?? "")).toEqual(["VTA", "<", "dorsal PFC", "VTA(DRD2+)", "=", "VTA", "c0", "Schultz, 1997", "Macaque", "Anterograde tracing", "The projection is stated in the paper in one sentence here.", "Fig. 1", "Tester", P]);
    expect(s.get("I4")!.text).toBe("Haber, 2010");
    expect(s.get("T2")!.formula).toBe('CONCATENATE("[",I2,"]")');
  });

  it("writes the FRG input columns and leaves the automatic ones as formulas", () => {
    const s = readTemplateSheet(small.bytes, "FRG");
    expect(["AC", "AD", "AE", "AF", "BI", "BK", "BM"].map((c) => s.get(`${c}2`)?.text ?? "")).toEqual(["R.Top", "U.VTA;U.VTA(DRD2+);U.A9/46d@L;U.X0", "", "", "req", "[VTA] RPE;", "TLF"]);
    expect(s.get("BA3")!.text).toBe("cap VTA\n<<mechanism to realize the capability>>\nmech VTA");
    expect(s.get("BC3")!.text).toBe("[U.VTA] = f([U.X0])");
    expect(s.get("AF3")!.text).toBe("A9/46d@L;X0");
    expect(s.get("BA4")!.text).toBe(`${OUT_OF_ROI_CAPABILITY}\n<<mechanism to realize the capability>>\n`);
    for (const c of ["AX", "AY", "AZ", "BD"]) expect(s.get(`${c}3`)!.formula, c).not.toBeNull();
  });

  it("inserts rows above the WholeBIF import when the input area is too small, moving references and ranges", () => {
    expect(big.rows).toEqual({ References: 40, Circuits: 46, Connections: 120, FRG: 3 });
    const refs = readTemplateSheet(big.bytes, "References");
    // 28 input rows (2–29) + 12 inserted; the separator and the import move down by 12
    expect(refs.get("A41")!.text).toBe("AuthorAK, 2016");
    expect(refs.get("A41")!.formula).toContain("ISBLANK(E41)");
    expect(refs.get("B41")!.formula).toContain("ISBLANK(D41)");
    expect(refs.get("A43")!.formula).toContain("IMPORTRANGE");
    expect(refs.get("A43")!.text).toBe(readTemplateSheet(TEMPLATE, "References").get("A31")!.text);

    const cir = readTemplateSheet(big.bytes, "Circuits");
    expect(cir.get("A47")!.text).toBe("X41");
    expect(cir.get("AO47")!.formula).toContain("ISBLANK(A47)");
    expect(cir.get("A49")!.formula).toContain("IMPORTRANGE");
    const tpl = readTemplateSheet(TEMPLATE, "Circuits");
    expect(cir.get("A3000")!.text).toBe(tpl.get("A2984")!.text);
    expect(cir.get("AO3000")!.formula).toBe(tpl.get("AO2984")!.formula!.replace(/2984/g, "3000"));

    const con = readTemplateSheet(big.bytes, "Connections");
    expect(con.get("A121")!.text).toBe("X26");
    expect(con.get("S121")!.formula).toBe("A121&D121");
    expect(con.get("A123")!.formula).toContain("IMPORTRANGE");
    // row 81 (the separator) moved to 122 and follows the References rows that were inserted
    expect(con.get("O122")!.formula).toContain("References!$B$2:$B$2138");

    const sheet4 = strFromU8(unzipSync(big.bytes)["xl/worksheets/sheet4.xml"]);
    expect(sheet4).toContain('sqref="A2:A122"');
    expect(sheet4).toContain('<autoFilter ref="$A$1:$AJ$1090"/>');
    const wb = strFromU8(unzipSync(big.bytes)["xl/workbook.xml"]);
    expect(wb).toContain("References!$A$1:$I$4118");
    expect(wb).toContain('<calcPr fullCalcOnLoad="1"/>');
  });

  it("writes Collection rows (Uniform = FALSE, Sub-Circuits) as Circuits of the template", () => {
    const input = modernInput({ refs: 4, ucs: 4, conns: 2 });
    const circuits = toCsv([
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", "UC Descriptor", "Sub-Circuits", "Uniform"],
      [`ROI_${P}`, "collection", "Ventral striatum", "", "", "Region of interest of the project", "", "VTA;A9/46d", "FALSE"],
      ["VTA", "collection", "ventral tegmental area", "", "", "", "HOMBA:12261", "VTA(DRD2+);VTA(DRD1+)", "FALSE"],
      ["A9/46d", "collection", "dorsal area 9/46", "", "", "", "BNA:23-24", "A9/46d@L", "FALSE"],
      ["VTA(DRD2+)", "makeshift", "VTA DRD2 neurons", "Dopamine", "Modulatory", "", "HOMBA:12261/mol:DRD2+", "", "TRUE"],
      ["VTA(DRD1+)", "makeshift", "VTA DRD1 neurons", "Dopamine", "Modulatory", "", "HOMBA:12261/mol:DRD1+", "", "TRUE"],
      ["A9/46d@L", "BNA", "left dorsal area 9/46", "Glutamate", "Excitatory", "", "BNA:23", "", "TRUE"],
    ]);
    const r = buildTemplateXlsx(TEMPLATE, { ...input, csv: { ...input.csv, circuits } });
    const s = readTemplateSheet(r.bytes, "Circuits");
    const row = (n: number, cols: string[]) => cols.map((c) => s.get(`${c}${n}`)?.text ?? "");
    expect(row(3, ["A", "B", "D", "E", "S", "U", "V"])).toEqual(["VTA", "collection", "2540", "ventral tegmental area", "VTA(DRD2+);VTA(DRD1+)", "FALSE", ""]);
    expect(row(4, ["A", "D", "S", "U"])).toEqual(["A9/46d", "", "A9/46d@L", "FALSE"]);
    expect(row(5, ["A", "D", "U", "V"])).toEqual(["VTA(DRD2+)", "2540.1", "TRUE", "Dopamine"]);
    expect(row(6, ["A", "D"])).toEqual(["VTA(DRD1+)", "2540.2"]);
    expect(s.get("AO2")!.text).toBe(`ROI_${P};\nVTA;\nVTA(DRD2+);\nVTA(DRD1+);\nA9/46d;\nA9/46d@L;`);
  });

  it("keeps the ROI row of the CSV even when it was written under an earlier Project ID", () => {
    const input = modernInput({ refs: 4, ucs: 4, conns: 2 });
    const r = buildTemplateXlsx(TEMPLATE, { ...input, projectId: "u7m2q9xa-9" });
    const s = readTemplateSheet(r.bytes, "Circuits");
    expect([s.get("A2")!.text, s.get("A3")!.text]).toEqual([`ROI_${P}`, "VTA"]);
  });

  it("reads CoBRAC-v1-0 CSVs (several references in one cell, no ROI row, no relations)", () => {
    const r = buildTemplateXlsx(TEMPLATE, {
      projectId: "VOR",
      contributor: "Tester",
      roi: "Cerebellar flocculus",
      csv: { project, references: fixture("References.csv"), circuits: fixture("Circuits.csv"), connections: fixture("Connections.csv"), frg: fixture("FRG.csv") },
    });
    const cir = readTemplateSheet(r.bytes, "Circuits");
    expect(cir.get("A2")!.text).toBe("ROI_VOR");
    expect(cir.get("B3")!.text).toBe("[Eccles, 1967]");
    const con = readTemplateSheet(r.bytes, "Connections");
    expect([con.get("A2")!.text, con.get("B2")!.text, con.get("C2")!.text, con.get("I2")!.text, con.get("I3")!.text]).toEqual(["MVN", "=", "MVN", "Ito, 1982", "Lisberger, 2021"]);
    expect(templateHeaders(r.bytes)).toEqual(templateHeaders(TEMPLATE));
  });

  const python = spawnSync("python3", ["-c", "import openpyxl"]).status === 0;
  it.runIf(python || process.env.COBRAC_TEST_XLSX === "1")("opens with openpyxl and has the template's headers", () => {
    const dir = mkdtempSync(join(tmpdir(), "bra-template-"));
    try {
      writeFileSync(join(dir, "out.xlsx"), big.bytes);
      writeFileSync(join(dir, "tpl.xlsx"), TEMPLATE);
      const script = [
        "import openpyxl, sys, json",
        "a = openpyxl.load_workbook(sys.argv[1]); b = openpyxl.load_workbook(sys.argv[2])",
        "print(json.dumps({'sheets': a.sheetnames == b.sheetnames, 'headers': all([c.value for c in a[n][1]] == [c.value for c in b[n][1]] for n in ['Project','References','Circuits','Connections','FRG']), 'a2': a['Circuits']['A2'].value, 'u2': a['Circuits']['U2'].value}))",
      ].join("\n");
      const out = JSON.parse(execFileSync("python3", ["-c", script, join(dir, "out.xlsx"), join(dir, "tpl.xlsx")], { encoding: "utf8" }));
      expect(out).toEqual({ sheets: true, headers: true, a2: `ROI_${P}`, u2: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
