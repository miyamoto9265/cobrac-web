import { describe, expect, it } from "vitest";
import {
  OVERLAP_LIMIT,
  anchorsOfUcJson,
  hubScores,
  matchExistingProject,
  normalizePlanAnchor,
  orderDraft,
  orderPlanRows,
  overlapsOf,
  planAnchors,
  planEstimate,
  replanRows,
  sharedAnchors,
  type OrderRow,
  type PlanRowRecord,
} from "../src/index.js";

const bna = (...lefts: number[]) => lefts.map((l) => `BNA:${l}-${l + 1}`);

/**
 * 「言語の BRA を一通りそろえたい」: 12 rows of one language Canon (policy "neocortex = area × projection class,
 * subcortex = nucleus"), anchored on BNA area pairs of the left-hemisphere language network.
 */
export const LANGUAGE_ROWS: (OrderRow & { tlf: string; roi: string })[] = [
  { rowId: "r01", tlf: "speech production", roi: "left IFG (areas 44/45)", anchors: bna(29, 33, 35, 37, 39, 61, 63, 75, 167) },
  { rowId: "r02", tlf: "phonological processing", roi: "STG", anchors: bna(71, 73, 75, 79, 121, 123, 145, 29, 39) },
  { rowId: "r03", tlf: "repetition", roi: "arcuate fasciculus", anchors: bna(75, 145, 29, 37), dependsOn: ["r01", "r02"] },
  { rowId: "r04", tlf: "reading", roi: "angular gyrus / VWFA", anchors: bna(135, 107, 91, 33) },
  { rowId: "r05", tlf: "writing", roi: "Exner's area", anchors: bna(25, 139, 57) },
  { rowId: "r06", tlf: "semantic comprehension", roi: "MTG", anchors: bna(81, 83, 87, 35) },
  { rowId: "r07", tlf: "naming", roi: "MTG / ITG", anchors: bna(83, 89, 33) },
  { rowId: "r08", tlf: "auditory word recognition", roi: "STG / pSTS", anchors: bna(73, 79, 121, 81) },
  { rowId: "r09", tlf: "verbal working memory", roi: "IPL / IFG", anchors: bna(145, 29, 17) },
  { rowId: "r10", tlf: "syntactic processing", roi: "IFG pars opercularis / pSTS", anchors: bna(37, 39, 123) },
  { rowId: "r11", tlf: "articulatory planning", roi: "ventral precentral gyrus / insula", anchors: bna(61, 63, 167) },
  { rowId: "r12", tlf: "prosody", roi: "anterior STG", anchors: bna(79, 77) },
];

describe("anchors", () => {
  it("normalizes UC Descriptor anchors and drops what is not one", () => {
    expect(normalizePlanAnchor("BNA:29")).toEqual(["BNA:29-30"]);
    expect(normalizePlanAnchor("BNA:29-30/side:left")).toEqual(["BNA:29-30"]);
    expect(normalizePlanAnchor("HOMBA:12261")).toEqual(["HOMBA:12261"]);
    expect(normalizePlanAnchor("BNAG:IFG")).toEqual(["BNAG:IFG"]);
    expect(normalizePlanAnchor("BNA:29-30&BNA:33-34")).toEqual(["BNA:29-30", "BNA:33-34"]);
    for (const bad of ["BNA:999", "BNAG:Nope", "Broca", "", 42, null]) expect(normalizePlanAnchor(bad)).toBeNull();
    expect(planAnchors(["BNA:29", "BNA:29-30", "Broca", "HOMBA:1"])).toEqual({ anchors: ["BNA:29-30", "HOMBA:1"], dropped: 1 });
  });

  it("reads the anchors a project used from its uc.json", () => {
    const uc = { ucs: [{ descriptor: "BNA:29-30/lay:L3/side:left" }, { descriptor: "HOMBA:12261" }, { descriptor: "" }], collections: [{ descriptor: "BNAG:IFG" }, { descriptor: "" }] };
    expect(anchorsOfUcJson(uc)).toEqual(["BNA:29-30", "HOMBA:12261", "BNAG:IFG"]);
    expect(anchorsOfUcJson(null)).toEqual([]);
  });

  it("compares a BNA group with the areas in it", () => {
    expect(sharedAnchors(["BNAG:IFG"], bna(29, 33))).toBe(2);
    expect(sharedAnchors(["BNAG:IFG"], ["BNAG:IFG"])).toBe(6);
    expect(sharedAnchors(["HOMBA:1"], ["homba:1"])).toBe(1);
    expect(sharedAnchors(bna(29), bna(31))).toBe(0);
  });
});

describe("language plan (fixture)", () => {
  const hub = hubScores(LANGUAGE_ROWS);

  it("gives the hub regions the highest scores", () => {
    expect(hub.get("r01")).toBe(8);
    expect(hub.get("r02")).toBe(6);
    expect(Math.max(...[...hub].filter(([id]) => id !== "r01" && id !== "r02").map(([, n]) => n))).toBeLessThan(5);
  });

  it("seeds speech production and phonological processing, one per wave, then repetition after both", () => {
    const r = orderPlanRows(LANGUAGE_ROWS, { concurrency: 4 });
    expect(r.seeds).toEqual(["r01", "r02"]);
    expect([r.wave.get("r01"), r.wave.get("r02")]).toEqual([1, 2]);
    expect(r.wave.get("r03")).toBeGreaterThan(2);
    expect(r.cycle).toBe(false);
    // the seeds are the rows with the most anchors shared with other rows
    const seedHub = Math.min(...r.seeds.map((id) => hub.get(id)!));
    for (const [id, n] of hub) if (!r.seeds.includes(id)) expect(n).toBeLessThan(seedHub);
  });

  it("never puts two rows sharing OVERLAP_LIMIT or more anchors in one wave, and keeps waves within the concurrency", () => {
    for (let c = 1; c <= 16; c++) {
      const r = orderPlanRows(LANGUAGE_ROWS, { concurrency: c });
      const byWave = new Map<number, OrderRow[]>();
      for (const row of LANGUAGE_ROWS) byWave.set(r.wave.get(row.rowId)!, [...(byWave.get(r.wave.get(row.rowId)!) ?? []), row]);
      for (const [w, rows] of byWave) {
        expect(rows.length, `wave ${w} at ${c}`).toBeLessThanOrEqual(r.seeds.length >= w ? 1 : c);
        for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) expect(sharedAnchors(rows[i].anchors, rows[j].anchors)).toBeLessThan(OVERLAP_LIMIT);
      }
      // dependencies come first
      for (const row of LANGUAGE_ROWS) for (const d of row.dependsOn ?? []) expect(r.wave.get(row.rowId)!).toBeGreaterThan(r.wave.get(d)!);
    }
  });

  it("lets reading and writing share a wave (they overlap little)", () => {
    expect(sharedAnchors(LANGUAGE_ROWS[3].anchors, LANGUAGE_ROWS[4].anchors)).toBeLessThan(OVERLAP_LIMIT);
    const r = orderPlanRows(LANGUAGE_ROWS, { concurrency: 16 });
    expect(r.wave.get("r04")).toBe(r.wave.get("r05"));
    // repetition and verbal working memory share two anchors: never together
    expect(r.wave.get("r03")).not.toBe(r.wave.get("r09"));
  });

  it("is deterministic and lists the overlaps of every row", () => {
    const a = orderPlanRows(LANGUAGE_ROWS, { concurrency: 4 });
    const b = orderPlanRows([...LANGUAGE_ROWS].reverse(), { concurrency: 4 });
    expect([...b.wave].sort()).toEqual([...a.wave].sort());
    expect(overlapsOf(LANGUAGE_ROWS).get("r03")).toEqual(["r01", "r02", "r09"]);
  });
});

describe("orderPlanRows", () => {
  it("has no seed wave when no row shares an anchor, or for a single row", () => {
    expect(orderPlanRows([{ rowId: "a", anchors: bna(1) }, { rowId: "b", anchors: bna(3) }], { concurrency: 2 }).seeds).toEqual([]);
    expect(orderPlanRows([{ rowId: "a", anchors: bna(1) }], { concurrency: 2 }).seeds).toEqual([]);
  });

  it("takes at most 3 seeds and ranks ties by priority, then row ID", () => {
    const rows: OrderRow[] = ["a", "b", "c", "d"].map((id) => ({ rowId: id, anchors: bna(29), priority: id === "c" ? 5 : 0 }));
    const r = orderPlanRows(rows, { concurrency: 4 });
    expect(r.seeds).toEqual(["c", "a", "b"]);
    expect(r.wave.get("d")).toBe(4);
  });

  it("breaks a dependency cycle instead of failing, and ignores unknown dependencies", () => {
    const r = orderPlanRows(
      [
        { rowId: "a", dependsOn: ["b"] },
        { rowId: "b", dependsOn: ["a", "zz"] },
      ],
      { concurrency: 1, seeds: "none" },
    );
    expect(r.cycle).toBe(true);
    expect(new Set([r.wave.get("a"), r.wave.get("b")])).toEqual(new Set([1, 2]));
  });

  it("counts context rows for the hub scores without placing them", () => {
    const r = orderPlanRows([{ rowId: "a", anchors: bna(29) }, { rowId: "b", anchors: bna(31) }], { concurrency: 2, context: [{ rowId: "x", anchors: bna(29) }] });
    expect(r.hub.get("a")).toBe(1);
    expect(r.wave.has("x")).toBe(false);
    expect(r.seeds).toEqual(["a"]);
  });
});

const planRow = (rowId: string, wave: number, state: PlanRowRecord["state"], extra: Partial<PlanRowRecord> = {}): PlanRowRecord => ({
  planId: "n4h8w2rk",
  sk: `ROW#${rowId}`,
  rowId,
  order: 0,
  wave,
  roi: rowId,
  tlf: rowId,
  rationale: "",
  source: "llm",
  state,
  attempts: 0,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

describe("orderDraft and replanRows", () => {
  it("orders a draft and leaves rows done by an existing project out of the waves", () => {
    const rows = [planRow("a", 1, "pending", { anchors: bna(29) }), planRow("b", 1, "pending", { anchors: bna(29) }), planRow("x", 1, "pending", { anchors: bna(29), existing: { projectId: "p1", name: "x" } })];
    const r = orderDraft(rows, 4);
    expect(r.wave.has("x")).toBe(false);
    expect(r.seed.get("a")).toBe(true);
    expect(r.wave.get("b")).toBe(2);
  });

  it("re-orders only the rows that have not started, from the next wave, with the anchors the finished rows used", () => {
    const rows = [
      planRow("s1", 1, "done", { seed: true, anchors: bna(29, 33), anchorsSource: "used", projectId: "p1" }),
      planRow("s2", 2, "running", { seed: true, anchors: bna(75), projectId: "p2" }),
      planRow("a", 3, "pending", { anchors: bna(29, 33) }),
      planRow("b", 3, "pending", { anchors: bna(29, 33) }),
      planRow("c", 4, "pending", { anchors: bna(101) }),
      planRow("retry", 2, "pending", { projectId: "p3", anchors: bna(29) }),
      planRow("q", 2, "question", { projectId: "p4" }),
    ];
    const moved = replanRows(rows, 2, 2);
    // a and b share two anchors: different waves; c fills the first wave with a
    expect(moved.get("b")).toBe(4);
    expect(moved.has("a")).toBe(false);
    expect(moved.get("c")).toBe(3);
    for (const id of ["s1", "s2", "retry", "q"]) expect(moved.has(id)).toBe(false);
  });

  it("keeps seed rows that have not started as seeds, one per wave", () => {
    const rows = [planRow("s1", 1, "done", { seed: true, projectId: "p1" }), planRow("s2", 2, "pending", { seed: true }), planRow("s3", 3, "pending", { seed: true }), planRow("a", 4, "pending")];
    const moved = replanRows(rows, 1, 4);
    expect([...moved]).toEqual([]);
  });

  it("estimates seeds one at a time and leaves existing rows out", () => {
    const rows = [planRow("s1", 1, "pending", { seed: true }), planRow("s2", 2, "pending", { seed: true }), planRow("a", 3, "pending"), planRow("b", 3, "pending"), planRow("x", 1, "done", { existing: { projectId: "p", name: "x" } })];
    // the seed wave counts once (its rows are built one after another), then one body wave of 2
    expect(planEstimate(rows, 2)).toMatchObject({ rows: 4, seedRows: 2, waves: 2, minutes: 2 * 48 + 48 + Math.round((4 * 0.2 * 15) / 2) });
  });
});

describe("matchExistingProject", () => {
  const p = (projectId: string, roi: string, tlf: string, status: string, extra: Record<string, unknown> = {}) => ({ projectId, roi, tlf, status, hasArtifacts: true, deletedAt: null, name: projectId, ...extra }) as never;
  it("reuses a finished project with the same ROI × TLF and warns about an unfinished one", () => {
    const projects = [p("p1", "Left IFG", "Speech production", "COMPLETED"), p("p2", "STG", "hearing", "RUNNING"), p("p3", "MTG", "naming", "COMPLETED", { deletedAt: "x" })];
    expect(matchExistingProject({ roi: " left  ifg", tlf: "speech production" }, projects)).toEqual({ existing: { projectId: "p1", name: "p1" }, duplicateOf: null });
    expect(matchExistingProject({ roi: "STG", tlf: "Hearing" }, projects)).toEqual({ existing: null, duplicateOf: "p2" });
    expect(matchExistingProject({ roi: "MTG", tlf: "naming" }, projects)).toEqual({ existing: null, duplicateOf: null });
    expect(matchExistingProject({ roi: "Left IFG", tlf: "Speech production" }, projects, new Set(["p1"]))).toEqual({ existing: null, duplicateOf: null });
  });
});
