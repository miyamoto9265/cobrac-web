import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  braesFormText,
  buildBraImages,
  buildBraesBundle,
  buildGraphs,
  isBraesProjectId,
  suggestBraesProjectId,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");
const graphs = () =>
  buildGraphs("VOR", {
    circuitsCsv: fx("Circuits.csv"),
    connectionsCsv: fx("Connections.csv"),
    frgCsv: fx("FRG.csv"),
  });

/** mxCell elements of a draw.io file as attribute maps */
const cells = (xml: string) =>
  [...xml.matchAll(/<mxCell ([^>]*?)\/?>/g)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
    ),
  );

describe("BRAES Project ID", () => {
  it("follows initial + year + RunningTitle", () => {
    expect(isBraesProjectId("YT20Oculomotor")).toBe(true);
    expect(isBraesProjectId("AT20HippocampalFormation")).toBe(true);
    expect(isBraesProjectId("p7m2q9xa")).toBe(false);
    expect(isBraesProjectId("YT2020Oculomotor")).toBe(false);
    expect(isBraesProjectId("YT20 Oculomotor")).toBe(false);
    expect(isBraesProjectId("ABCDEF20Oculomotor")).toBe(false);
    expect(isBraesProjectId(`YT20${"A".repeat(31)}`)).toBe(false);
  });
  it("is proposed from the contributor, the year and the name", () => {
    expect(
      suggestBraesProjectId({
        contributor: "Tatsuya Miyamoto",
        createdAt: "2026-11-21T00:00:00Z",
        name: "visual saccade circuit",
      }),
    ).toBe("TM26VisualSaccadeCircuit");
    // a Japanese name falls back to ROI and TLF
    expect(
      suggestBraesProjectId({
        contributor: "Tatsuya Miyamoto",
        createdAt: "2025-01-01T00:00:00Z",
        name: "前庭動眼反射",
        roi: "cerebellum",
        tlf: "VOR gain adaptation",
      }),
    ).toBe("TM25CerebellumVORGainAdaptation");
    expect(
      isBraesProjectId(
        suggestBraesProjectId({
          contributor: "A B",
          createdAt: "2026-01-01T00:00:00Z",
          name: "x".repeat(80),
        }),
      ),
    ).toBe(true);
    // long titles stop at a word boundary
    expect(
      suggestBraesProjectId({
        contributor: "Tatsuya Miyamoto",
        createdAt: "2026-11-21T00:00:00Z",
        name: "サッカード",
        roi: "Superior colliculus",
        tlf: "Visual saccade generation",
      }),
    ).toBe("TM26SuperiorColliculusVisual");
    // no Latin letters in the contributor: the proposal needs editing
    expect(
      isBraesProjectId(
        suggestBraesProjectId({
          contributor: "宮本",
          createdAt: "2026-01-01T00:00:00Z",
          name: "Saccade",
        }),
      ),
    ).toBe(false);
  });
});

describe("BRA images (draw.io XML)", () => {
  const { hcd, frg } = graphs();
  const img = buildBraImages(hcd, frg);

  it("draws every circuit and connection on the BIF layer, coloured by sign", () => {
    const c = cells(img.bif);
    const vertices = c.filter((x) => x.vertex === "1");
    for (const n of hcd.nodes)
      expect(vertices.some((v) => v.value === n.id)).toBe(true);
    const edges = c.filter((x) => x.edge === "1");
    expect(edges.length).toBeGreaterThan(0);
    const byId = new Map(vertices.map((v) => [v.id, v.value]));
    const pc = edges.find(
      (e) => byId.get(e.source) === "PC" && byId.get(e.target) === "MVN",
    )!;
    expect(pc.style).toContain("strokeColor=#0000FF");
    expect(pc.style).toContain("endArrow=box");
    const gc = edges.find(
      (e) => byId.get(e.source) === "GC" && byId.get(e.target) === "PC",
    )!;
    expect(gc.style).toContain("strokeColor=#000000");
    // every edge end is a cell of the file
    for (const e of edges)
      expect(byId.has(e.source) && byId.has(e.target)).toBe(true);
  });

  it("puts one ellipse per ROI UC on the HCD layer with white arrows", () => {
    const c = cells(img.hcd);
    const ellipses = c.filter((x) => x.vertex === "1");
    expect(ellipses.length).toBe(
      hcd.nodes.filter((n) => n.roiClass === "roi").length,
    );
    for (const e of ellipses) expect(e.style).toMatch(/^ellipse;/);
    for (const e of c.filter((x) => x.edge === "1"))
      expect(e.style).toContain("shape=flexArrow");
  });

  it("draws the FRG as rounded rectangles with 2 pt arrows to the subnodes", () => {
    const c = cells(img.frg);
    expect(c.filter((x) => x.vertex === "1").length).toBe(frg.nodes.length);
    const edges = c.filter((x) => x.edge === "1");
    expect(edges.length).toBe(frg.edges.length);
    for (const e of edges) expect(e.style).toContain("strokeWidth=2");
  });

  it("keeps BIF, Semi-Transparent and HCD as layers of one diagram", () => {
    const layers = cells(img.drawio).filter((x) => x.parent === "0");
    expect(layers.map((l) => l.value)).toEqual([
      "BIF",
      "Semi-Transparent",
      "HCD",
    ]);
    expect(img.drawio).toContain("opacity=60");
  });

  it("uses the arrangement saved on the graph screen", () => {
    const id = hcd.nodes[0].id;
    const moved = buildBraImages(hcd, frg, {
      hcd: { positions: { [id]: { x: -500, y: -500 } }, updatedAt: null },
    });
    const v = cells(moved.bif).find((x) => x.value === id)!;
    const geo = moved.bif.match(
      new RegExp(
        `value="${id}"[^>]*><mxGeometry x="([-0-9.]+)" y="([-0-9.]+)"`,
      ),
    )!;
    expect(v).toBeTruthy();
    // the moved node is the top-left one, shifted to the margin
    expect([Number(geo[1]), Number(geo[2])]).toEqual([80, 80]);
  });

  it("escapes labels", () => {
    const g = graphs();
    g.hcd.nodes[0].id = 'A<&">';
    expect(buildBraImages(g.hcd, g.frg).bif).toContain(
      'value="A&lt;&amp;&quot;&gt;"',
    );
  });
});

describe("BRAES submission bundle", () => {
  it("holds the BRA data, the three images, the draw.io file and the form memo", () => {
    const { hcd, frg } = graphs();
    const zip = buildBraesBundle({
      braesProjectId: "TM26Vor",
      csvs: { "TM26Vor_project.csv": "p", "TM26Vor_frg.csv": "f" },
      notes: [
        "Connections has 120 records, but the converter copies only the first 79.",
      ],
      hcd,
      frg,
      form: {
        contributor: "Tatsuya Miyamoto",
        description: "VOR circuit",
        cobrac: { projectId: "p7m2q9xa", name: "VOR", version: 3 },
      },
      locale: "en",
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(
      [
        "TM26Vor_csv/TM26Vor_frg.csv",
        "TM26Vor_csv/TM26Vor_project.csv",
        "TM26Vor.drawio",
        "TM26VorBIF.xml",
        "TM26VorFRG.xml",
        "TM26VorHCD.xml",
        "submission-form.txt",
      ]
        .map((f) => `TM26Vor_BRAES/${f}`)
        .sort(),
    );
    const form = strFromU8(files["TM26Vor_BRAES/submission-form.txt"]);
    expect(form).toContain("Q2  Project ID: TM26Vor");
    expect(form).toContain("Q5  Does your BRA data include FRG data?: Yes");
    expect(form).toContain("Q7  HCD Image1: TM26VorHCD.xml");
    expect(form).toContain("p7m2q9xa, BRA data version 3");
    expect(form).toContain(
      "Q3  BRA Data: TM26Vor.bra (the spreadsheet the BRA Data Converter makes from TM26Vor_csv)",
    );
    expect(form).toContain("- Connections has 120 records");
  });

  it("warns about non-English text in the memo", () => {
    const base = {
      braesProjectId: "TM26Vor",
      contributor: "Tatsuya Miyamoto",
      hasFrg: false,
      files: { bra: "a", csvDir: "a_csv", bif: "b", hcd: "c", frg: "d" },
      cobrac: { projectId: "p", name: "n" },
    };
    expect(
      braesFormText({ ...base, description: "前庭動眼反射" }, "ja"),
    ).toContain("英語以外の文字");
    expect(braesFormText({ ...base, description: "VOR" }, "ja")).not.toContain(
      "英語以外の文字",
    );
    expect(braesFormText({ ...base, description: "VOR" }, "en")).not.toContain(
      "Q6",
    );
  });
});
