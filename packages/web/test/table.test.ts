import { describe, expect, it } from "vitest";
import type { ArtifactInfo } from "@cobrac/shared";
import { filterRows, nextSort, sheetFromCsv, sortRows, tabularSources } from "../src/lib/table";

const art = (key: string, category: ArtifactInfo["category"]): ArtifactInfo => ({ key, name: key.split("/").pop()!, size: 1, lastModified: "", category });

describe("tabularSources", () => {
  it("keeps only the BRA CSVs, in workflow order, and leaves out the harness JSON", () => {
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
    expect(tabularSources(items).map((s) => s.name)).toEqual(["Project.csv", "Circuits.csv", "References.csv"]);
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
});

describe("filterRows / sortRows", () => {
  const rows = [
    ["VTA", "Dopamine", "10"],
    ["NAC", "GABA", "9"],
    ["LHb", "", "100"],
    ["A9/46d(left)", "Glutamate", ""],
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
    expect(sortRows(rows, { col: 1, dir: "asc" }).map((r) => r[0])).toEqual(["VTA", "NAC", "A9/46d(left)", "LHb"]);
    expect(sortRows(rows, null)).toBe(rows);
  });

  it("cycles header clicks through asc, desc and unsorted", () => {
    expect(nextSort(null, 1)).toEqual({ col: 1, dir: "asc" });
    expect(nextSort({ col: 1, dir: "asc" }, 1)).toEqual({ col: 1, dir: "desc" });
    expect(nextSort({ col: 1, dir: "desc" }, 1)).toBeNull();
    expect(nextSort({ col: 1, dir: "desc" }, 2)).toEqual({ col: 2, dir: "asc" });
  });
});
