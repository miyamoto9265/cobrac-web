import { describe, expect, it } from "vitest";
import { MAX_CONFORM_FOLLOWUPS, PLAN_MAX_WAITING_PRS, PLAN_ROW_STATES, conformTitle, countRows, nextActiveWave, planFinished, prOutcome, pushOutcome, waitingPrs, type PlanRowState } from "../src/index.js";

const r = (wave: number, state: PlanRowState, seed = false) => ({ wave, state, seed });

describe("stage 3: seed gate and back-pressure", () => {
  it("holds every later wave while a seed row's pull request waits, and lets it go once approved", () => {
    const rows = [r(1, "review", true), r(2, "pending", true), r(3, "pending")];
    expect(nextActiveWave(rows, 1, { seedGate: true })).toBe(1);
    // without the gate (plans without a Canon) the review row would not hold the wave
    expect(nextActiveWave(rows, 1)).toBe(2);
    for (const s of ["decision", "attention", "question", "running"] as const) expect(nextActiveWave([r(1, s, true), r(2, "pending")], 1, { seedGate: true })).toBe(1);
    for (const s of ["done", "skipped"] as const) expect(nextActiveWave([r(1, s, true), r(2, "pending")], 1, { seedGate: true })).toBe(2);
  });

  it("does not hold the next wave for body rows that wait for approval, unless the back-pressure limit is reached", () => {
    const rows = [r(1, "done", true), r(2, "review"), r(2, "decision"), r(3, "pending")];
    expect(nextActiveWave(rows, 2, { seedGate: true })).toBe(3);
    expect(nextActiveWave(rows, 2, { seedGate: true, holdNewWave: true })).toBe(2);
    // the first wave still starts
    expect(nextActiveWave([r(1, "pending")], null, { holdNewWave: true })).toBe(1);
    expect(waitingPrs(rows)).toBe(1);
    expect(PLAN_MAX_WAITING_PRS).toBe(20);
  });

  it("counts the new states and finishes a plan only when every row is done or skipped", () => {
    expect(PLAN_ROW_STATES).toContain("review");
    expect(countRows([r(1, "review"), r(1, "decision")])).toMatchObject({ review: 1, decision: 1 });
    expect(planFinished([r(1, "done"), r(1, "review")])).toBe(false);
    expect(planFinished([r(1, "done"), r(1, "decision")])).toBe(false);
    expect(planFinished([r(1, "done"), r(1, "skipped")])).toBe(true);
  });
});

describe("stage 3: after a push", () => {
  it("waits for approval without error conflicts, conforms when the head moved, at most twice, else asks a human", () => {
    expect(pushOutcome({ errors: 0 }, true, 0)).toEqual({ to: "review" });
    expect(pushOutcome({ errors: 2 }, true, 0)).toEqual({ to: "conform" });
    expect(pushOutcome({ errors: 2 }, true, 1)).toEqual({ to: "conform" });
    expect(pushOutcome({ errors: 2 }, true, MAX_CONFORM_FOLLOWUPS)).toEqual({ to: "decision", reason: "conform_limit" });
    expect(pushOutcome({ errors: 1 }, false, 0)).toEqual({ to: "decision", reason: "conflicts" });
    expect(conformTitle(7)).toBe("Canon rev 7 に合わせて更新");
  });

  it("follows the pull request to its end", () => {
    expect(prOutcome({ state: "open" })).toBeNull();
    expect(prOutcome({ state: "approved" })).toEqual({ to: "done" });
    expect(prOutcome({ state: "rejected" })).toEqual({ to: "decision", reason: "pr_rejected" });
    expect(prOutcome({ state: "withdrawn" })).toEqual({ to: "decision", reason: "pr_withdrawn" });
    expect(prOutcome({ state: "superseded", reason: "#12" })).toEqual({ to: "follow", prNo: 12 });
    expect(prOutcome({ state: "superseded", reason: "?" })).toEqual({ to: "decision", reason: "pr_withdrawn" });
    expect(prOutcome(null)).toEqual({ to: "decision", reason: "push_failed" });
  });
});
