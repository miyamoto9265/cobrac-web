import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ArtifactInfo } from "@cobrac/shared";
import { cellText, filterRows, nextSort, sheetFromCsv, sheetsFromJson, sheetsFromText, sortRows, tabularSources } from "../src/lib/table";

const FIX = new URL("../../worker/test/fixtures/reward/", import.meta.url);
const fixture = (p: string) => readFileSync(new URL(p, FIX), "utf8");

const art = (key: string, category: ArtifactInfo["category"]): ArtifactInfo => ({ key, name: key.split("/").pop()!, size: 1, lastModified: "", category });

describe("tabularSources", () => {
  it("keeps harness JSON and BRA CSVs, grouped HCD → FRG → CSV in workflow order", () => {
    const P = "uk3m9x2q-1";
    const items = [
      art(`output/${P}.bra.xlsx`, "output"),
      art("graph/hcd.json", "graph"),
      art("workspace/report.md", "doc"),
      art("workspace/meta.json", "other"),
      art(`workspace/${P}_CSV/References.csv`, "csv"),
      art(`workspace/${P}_CSV/Circuits.csv`, "csv"),
      art(`workspace/${P}_CSV/Project.csv`, "csv"),
      art(`workspace/${P}_FRG/frg.json`, "frg"),
      art(`workspace/${P}_HCD/references.json`, "hcd"),
      art(`workspace/${P}_HCD/uc.json`, "hcd"),
      art(`workspace/${P}_HCD/connections.json`, "hcd"),
      art(`workspace/${P}_HCD/notes.md`, "hcd"),
    ];
    expect(tabularSources(items).map((s) => `${s.group}:${s.name}`)).toEqual([
      "hcd:uc.json",
      "hcd:connections.json",
      "hcd:references.json",
      "frg:frg.json",
      "csv:Project.csv",
      "csv:Circuits.csv",
      "csv:References.csv",
    ]);
  });
});

describe("sheetsFromJson", () => {
  it("turns uc.json into one row per UC with array cells joined", () => {
    const [s] = sheetsFromJson(fixture("HCD/uc.json"));
    expect(s.name).toBe("ucs");
    expect(s.columns.slice(0, 4)).toEqual(["circuitId", "descriptor", "names", "roi"]);
    expect(s.rows.length).toBeGreaterThan(1);
    const src = s.columns.indexOf("sourceOfId");
    expect(s.rows[0][src]).toBe("[Haber, 2010]");
  });

  it("splits connections.json into its bif and connections arrays", () => {
    const sheets = sheetsFromJson(fixture("HCD/connections.json"));
    expect(sheets.map((s) => [s.name, s.rows.length])).toEqual([
      ["bif", 4],
      ["connections", 4],
    ]);
    const bif = sheets[0];
    expect(bif.rows[1][bif.columns.indexOf("referenceIds")]).toBe("[Schultz, 1997]; [Haber, 2010]");
  });

  it("unions columns across records and leaves missing cells empty", () => {
    const [s] = sheetsFromJson(JSON.stringify({ $schema: "x", items: [{ a: 1 }, { b: { c: true } }] }));
    expect(s.columns).toEqual(["a", "b"]);
    expect(s.rows).toEqual([
      ["1", ""],
      ["", '{"c":true}'],
    ]);
  });

  it("puts scalar top-level fields into a key/value sheet", () => {
    const sheets = sheetsFromJson(fixture("meta.json"), "meta");
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("meta");
    expect(sheets[0].columns).toEqual(["key", "value"]);
    expect(sheets[0].rows[0]).toEqual(["roi", "Mesolimbic dopamine system"]);
  });

  it("throws on invalid JSON", () => {
    expect(() => sheetsFromJson("{")).toThrow();
  });
});

describe("sheetFromCsv", () => {
  it("uses the first row as header, keeps quoted commas and newlines, pads short rows", () => {
    const s = sheetFromCsv('\uFEFFReference ID,DOI,Note\n"[Haber, 2010]",10.1038/npp.2009.129,"two\nlines"\n"[Luo, 2011]",N/A\n\n', "References");
    expect(s.columns).toEqual(["Reference ID", "DOI", "Note"]);
    expect(s.rows).toEqual([
      ["[Haber, 2010]", "10.1038/npp.2009.129", "two\nlines"],
      ["[Luo, 2011]", "N/A", ""],
    ]);
  });

  it("names blank header cells by position", () => {
    expect(sheetFromCsv("a,,c\n1,2,3,4\n", "x").columns).toEqual(["a", "#2", "c", "#4"]);
  });

  it("is chosen by file extension", () => {
    expect(sheetsFromText("Circuits.csv", "Circuit ID\nVTA\n")[0]).toEqual({ name: "Circuits", columns: ["Circuit ID"], rows: [["VTA"]] });
    expect(sheetsFromText("frg.json", fixture("FRG/frg.json"))[0].name).toBe("nodes");
  });
});

describe("filterRows / sortRows", () => {
  const rows = [
    ["VTA", "Dopamine", "10"],
    ["NAC", "GABA", "9"],
    ["LHb", "", "100"],
    ["A9/46d@L", "Glutamate", ""],
  ];

  it("matches every term case-insensitively across cells", () => {
    expect(filterRows(rows, "  ")).toBe(rows);
    expect(filterRows(rows, "gaba").map((r) => r[0])).toEqual(["NAC"]);
    expect(filterRows(rows, "vta dopa").map((r) => r[0])).toEqual(["VTA"]);
    expect(filterRows(rows, "vta gaba")).toEqual([]);
  });

  it("sorts numerically and keeps empty cells last in both directions", () => {
    expect(sortRows(rows, { col: 2, dir: "asc" }).map((r) => r[2])).toEqual(["9", "10", "100", ""]);
    expect(sortRows(rows, { col: 2, dir: "desc" }).map((r) => r[2])).toEqual(["100", "10", "9", ""]);
    expect(sortRows(rows, { col: 1, dir: "asc" }).map((r) => r[0])).toEqual(["VTA", "NAC", "A9/46d@L", "LHb"]);
    expect(sortRows(rows, null)).toBe(rows);
  });

  it("cycles header clicks through asc, desc and unsorted", () => {
    expect(nextSort(null, 1)).toEqual({ col: 1, dir: "asc" });
    expect(nextSort({ col: 1, dir: "asc" }, 1)).toEqual({ col: 1, dir: "desc" });
    expect(nextSort({ col: 1, dir: "desc" }, 1)).toBeNull();
    expect(nextSort({ col: 1, dir: "desc" }, 2)).toEqual({ col: 2, dir: "asc" });
  });
});

describe("cellText", () => {
  it("renders scalars, arrays and objects", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(3)).toBe("3");
    expect(cellText(false)).toBe("false");
    expect(cellText(["a", 1, { x: 1 }])).toBe('a; 1; {"x":1}');
  });
});
