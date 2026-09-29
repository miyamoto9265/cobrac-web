import { describe, expect, it } from "vitest";
import { SIGN_DEFAULTS, resolveEdgeStyle, selfLoopPath } from "../src/components/graph/StyledEdge";

describe("resolveEdgeStyle", () => {
  it("uses the sign defaults when there is no override", () => {
    const s = resolveEdgeStyle("inhibitory", undefined);
    expect(s.lineType).toBe(SIGN_DEFAULTS.inhibitory.lineType);
    expect(s.color).toBe("#2563eb");
    expect(s.markerEnd).toBe("square");
  });
  it("keeps bends saved under the old orthogonal default (no explicit line type)", () => {
    const s = resolveEdgeStyle("excitatory", { waypoints: [{ x: 10, y: 20 }] });
    expect(s.lineType).toBe("orthogonal");
    expect(s.waypoints).toEqual([{ x: 10, y: 20 }]);
  });
  it("an explicit line type always wins", () => {
    expect(resolveEdgeStyle("excitatory", { lineType: "polyline", waypoints: [{ x: 1, y: 2 }] }).lineType).toBe("polyline");
    expect(resolveEdgeStyle(undefined, { lineType: "straight" }).lineType).toBe("straight");
  });
});

describe("selfLoopPath", () => {
  it("bulges out to the right of both anchors", () => {
    const r = selfLoopPath(100, 10, 100, 40);
    expect(r.path.startsWith("M100,10")).toBe(true);
    expect(r.path.endsWith("100,40")).toBe(true);
    expect(r.labelX).toBeGreaterThan(100);
  });
});
