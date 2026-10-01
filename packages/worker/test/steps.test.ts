import { describe, expect, it } from "vitest";
import { liveStageOf } from "../src/steps.js";

const states = (hcd: string, frg: string, csv: string, xlsx: string) => ({ HCD: hcd, FRG: frg, CSV: csv, XLSX: xlsx }) as Parameters<typeof liveStageOf>[0];

describe("liveStageOf", () => {
  it("is the first running step", () => {
    expect(liveStageOf(states("done", "running", "pending", "pending"), null)).toBe("FRG");
    expect(liveStageOf(states("done", "done", "done", "running"), null)).toBe("XLSX");
    expect(liveStageOf(states("done", "done", "done", "done"), null)).toBeNull();
  });

  it("is the research step or the adjustment turn while one runs, whatever the step states say", () => {
    expect(liveStageOf(states("running", "pending", "pending", "pending"), "RESEARCH")).toBe("RESEARCH");
    expect(liveStageOf(states("done", "running", "pending", "pending"), "ADJUST")).toBe("ADJUST");
  });
});
