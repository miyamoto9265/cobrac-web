import { describe, expect, it } from "vitest";
import {
  PLAN_ESTIMATE,
  STRONG_OVERLAP,
  controlSlotCap,
  flowPlan,
  overlapScore,
  perRowCostUsd,
  planEstimateFor,
  planLanes,
  rowsWithinCost,
  simulateFlowMinutes,
  type FlowRow,
  type PlanRowState,
} from "../src/index.js";

const bna = (...lefts: number[]) => lefts.map((l) => `BNA:${l}-${l + 1}`);

// The language example of the specification (6.6), anchors as BNA area pairs:
// STG 71, SMG 135, IFG44 29, PMv 61, Put 219, MTG 81, ATL 79, IFG45 33, FG 107, ITG 89, SPL 125.
const STG = 71, SMG = 135, IFG44 = 29, PMV = 61, PUT = 219, MTG = 81, ATL = 79, IFG45 = 33, FG = 107, ITG = 89, SPL = 125;
const row = (rowId: string, anchors: number[], extra: Partial<FlowRow> = {}): FlowRow => ({ rowId, state: "pending", wave: 1, order: Number(rowId.slice(1)), anchors: bna(...anchors), ...extra });
const example = (): FlowRow[] => [
  row("r1", [STG, SMG, IFG44], { seed: true }),
  row("r2", [IFG44, PMV, PUT], { seed: true }),
  row("r3", [MTG, ATL]),
  row("r4", [MTG, ATL, IFG45]),
  row("r5", [STG, SMG, IFG44, PMV], { dependsOn: ["r1", "r2"] }),
  row("r6", [FG, ITG]),
  row("r7", [FG, SPL]),
];
const set = (rows: FlowRow[], states: Record<string, PlanRowState>) => rows.map((r) => (states[r.rowId] ? { ...r, state: states[r.rowId] } : r));

describe("overlap score", () => {
  it("weighs the ROI double and finished circuits less", () => {
    // r3 and r4 share MTG (the ROI of both) and ATL
    expect(overlapScore({ anchors: bna(MTG, ATL) }, { anchors: bna(MTG, ATL, IFG45) })).toBe(3);
    // r6 and r7 share FG, the ROI of both
    expect(overlapScore({ anchors: bna(FG, ITG) }, { anchors: bna(FG, SPL) })).toBe(2);
    expect(overlapScore({ anchors: bna(MTG, ATL) }, { anchors: bna(FG) })).toBe(0);
    expect(overlapScore({ anchors: bna(MTG, ATL) }, { anchors: bna(MTG, ATL, IFG45) }, new Set(["bna:81-82"]))).toBe(1.6);
    expect(STRONG_OVERLAP).toBe(3);
  });
});

describe("lanes", () => {
  it("links rows by dependencies and by anchors that are not hubs", () => {
    const lanes = planLanes(example());
    // IFG44 is held by 3 rows (a hub): r1, r2 and r5 are one lane through r5's dependencies, not through IFG44
    expect(lanes.get("r1")).toBe(lanes.get("r5"));
    expect(lanes.get("r2")).toBe(lanes.get("r5"));
    expect(lanes.get("r3")).toBe(lanes.get("r4"));
    expect(lanes.get("r6")).toBe(lanes.get("r7"));
    expect(new Set(lanes.values()).size).toBe(3);
    // the largest lane first
    expect(lanes.get("r1")).toBe(1);
  });

  it("keeps a row without links on a lane of its own", () => {
    const lanes = planLanes([row("r1", [MTG]), row("r2", [FG]), row("r3", [])]);
    expect(new Set(lanes.values()).size).toBe(3);
  });
});

describe("flowPlan", () => {
  it("starts the other lanes while the seeds are built", () => {
    const f = flowPlan(example());
    // r1 and r2 share IFG44: the second seed waits for the first; r5 waits for its dependencies; r4 overlaps r3 strongly
    expect(f.ready).toEqual(["r1", "r3", "r6", "r7"]);
    expect(f.waits.get("r2")).toEqual({ kind: "seed", rowIds: ["r1"] });
    expect(f.waits.get("r5")).toEqual({ kind: "dependency", rowIds: ["r1", "r2"] });
    expect(f.waits.get("r4")).toEqual({ kind: "overlap", rowIds: ["r3"] });
  });

  it("starts seeds that share no anchor side by side", () => {
    const f = flowPlan([row("r1", [STG], { seed: true }), row("r2", [FG], { seed: true }), row("r3", [STG, ATL])]);
    expect(f.ready).toEqual(["r1", "r2"]);
    expect(f.waits.get("r3")).toEqual({ kind: "seed", rowIds: ["r1"] });
  });

  it("waits for a dependency until it is done, not while its pull request waits", () => {
    const rows = set(example(), { r1: "done", r2: "review", r3: "done", r6: "done", r7: "done" });
    const f = flowPlan(rows);
    expect(f.waits.get("r5")).toEqual({ kind: "dependency", rowIds: ["r2"] });
    expect(f.ready).toEqual(["r4"]);
    expect(flowPlan(set(rows, { r2: "done" })).ready).toEqual(["r5", "r4"]);
  });

  it("lets a strong overlap go once the other row's work is in", () => {
    expect(flowPlan(set(example(), { r1: "done", r2: "done", r3: "review" })).waits.get("r4")?.kind).toBe("overlap");
    expect(flowPlan(set(example(), { r1: "done", r2: "done", r3: "done" })).ready).toContain("r4");
    // a row needing a human decision holds nothing
    expect(flowPlan(set(example(), { r1: "done", r2: "done", r3: "decision" })).ready).toContain("r4");
  });

  it("resumes retries and follow-ups first, conform follow-ups before retries", () => {
    const rows = [...set(example(), { r1: "running" }), row("r8", [SPL], { projectId: "p8" }), row("r9", [ITG], { projectId: "p9", conform: true })];
    expect(flowPlan(rows).ready.slice(0, 2)).toEqual(["r9", "r8"]);
  });

  it("puts rows with more rows downstream first", () => {
    const rows = [row("r1", [FG]), row("r2", [MTG]), row("r3", [MTG, ATL, IFG45], { dependsOn: ["r2"] }), row("r4", [STG], { dependsOn: ["r3"] })];
    expect(flowPlan(rows).ready[0]).toBe("r2");
    expect(flowPlan(rows).downstream.get("r2")).toBe(2);
  });

  it("breaks a dependency cycle", () => {
    const rows = [row("r1", [FG], { dependsOn: ["r2"] }), row("r2", [MTG], { dependsOn: ["r1"] })];
    expect(flowPlan(rows).ready.length).toBe(2);
  });

  it("leaves skipped rows out", () => {
    const rows = set(example(), { r1: "skipped", r2: "skipped" });
    expect(flowPlan(rows).ready).toContain("r5");
  });
});

describe("estimate", () => {
  it("simulates the flow: 3 rounds of 48 min for the example at 6, 4 as waves", () => {
    const rework = Math.round((7 * PLAN_ESTIMATE.reworkShare * PLAN_ESTIMATE.reworkMinutes) / 6);
    expect(simulateFlowMinutes(example(), 6)).toBe(3 * 48 + rework);
    // one slot: one row after another
    expect(simulateFlowMinutes(example(), 1)).toBe(7 * 48 + 7 * 3);
    expect(simulateFlowMinutes([], 6)).toBe(0);
  });

  it("estimates flow plans by simulation, with lanes, and others by waves", () => {
    const rows = example().map((r) => ({ ...r, seed: r.seed ?? false, existing: null }));
    const flow = planEstimateFor({ scheduling: "flow", ordering: "auto", status: "RUNNING" }, rows, 6);
    expect(flow.lanes).toBe(3);
    expect(flow.minutes).toBe(simulateFlowMinutes(rows, 6));
    const waves = planEstimateFor({ ordering: "manual", status: "RUNNING" }, rows, 6);
    expect(waves.lanes).toBeUndefined();
  });
});

describe("cost and slots", () => {
  it("reserves half a row for each row being built", () => {
    expect(rowsWithinCost({ maxCostUsd: 20, spentUsd: 10, inFlight: 0, perRowUsd: 0.4 })).toBe(25);
    expect(rowsWithinCost({ maxCostUsd: 20, spentUsd: 10, inFlight: 6, perRowUsd: 0.4 })).toBe(22);
    // nothing being built: one row may use up what is left
    expect(rowsWithinCost({ maxCostUsd: 20, spentUsd: 19.9, inFlight: 0, perRowUsd: 0.4 })).toBe(1);
    expect(rowsWithinCost({ maxCostUsd: 20, spentUsd: 19.9, inFlight: 1, perRowUsd: 0.4 })).toBe(0);
    expect(rowsWithinCost({ maxCostUsd: 20, spentUsd: 20, inFlight: 0, perRowUsd: 0.4 })).toBe(0);
  });

  it("prices a row from the plan's finished rows once there are 5", () => {
    expect(perRowCostUsd([0.2, 0.3])).toBe(PLAN_ESTIMATE.costPerRowUsd.max);
    expect(perRowCostUsd([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])).toBe(0.6);
  });

  it("gives the Orchestrator's jobs a third of the slots", () => {
    expect(controlSlotCap(6)).toBe(2);
    expect(controlSlotCap(1)).toBe(1);
    expect(controlSlotCap(10)).toBe(4);
  });
});
