import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { LANE_GAP, laneGeometry, laneLabelPlacement, parallelLanes, selfLoopIndex } from "../src/lib/parallelEdges";
import { buildEdgePath, resolveEdgeStyle, selfLoopPath } from "../src/components/graph/StyledEdge";

function sampleCubic(d: string, from: number, to: number) {
  const n = d.match(/-?[\d.]+(?:e-?\d+)?/g)!.map(Number);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = from + ((to - from) * i) / 60;
    const u = 1 - t;
    out.push({ x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3 });
  }
  return out;
}

const fwd = { id: "e1", source: "A", target: "B" };
const back = { id: "e2", source: "B", target: "A" };

describe("parallelLanes", () => {
  it("leaves edges alone when they are the only one on their pair", () => {
    expect(parallelLanes([fwd, { id: "e3", source: "B", target: "C" }]).size).toBe(0);
  });

  it("puts the two edges of a feedback loop on opposite lanes", () => {
    const m = parallelLanes([fwd, back]);
    expect(m.get("e1")).toEqual({ offset: 0.5, reversed: false });
    expect(m.get("e2")).toEqual({ offset: -0.5, reversed: true });
  });

  it("does not depend on the order of the edge list", () => {
    expect(parallelLanes([back, fwd])).toEqual(parallelLanes([fwd, back]));
  });

  it("spreads several edges of one pair over distinct, centred lanes", () => {
    const m = parallelLanes([fwd, back, { id: "e3", source: "A", target: "B" }]);
    const offsets = [...m.values()].map((l) => l.offset).sort();
    expect(offsets).toEqual([-1, 0, 1]);
    expect(m.get("e2")!.offset).toBe(-1);
  });

  it("skips self loops and edges excluded by the caller (user-drawn routes)", () => {
    expect(parallelLanes([fwd, back], (id) => id === "e2").size).toBe(0);
    expect(parallelLanes([{ id: "s", source: "A", target: "A" }, { id: "t", source: "A", target: "A" }]).size).toBe(0);
  });
});

describe("selfLoopIndex", () => {
  it("numbers the loops of each node separately", () => {
    const m = selfLoopIndex([
      { id: "a1", source: "A", target: "A" },
      fwd,
      { id: "b1", source: "B", target: "B" },
      { id: "a2", source: "A", target: "A" },
    ]);
    expect([m.get("a1"), m.get("a2"), m.get("b1"), m.get("e1")]).toEqual([0, 1, 0, undefined]);
  });

  it("nests further loops outside the first", () => {
    const a = selfLoopPath(100, 10, 100, 40, 0);
    const b = selfLoopPath(100, 10, 100, 40, 1);
    expect(b.labelX).toBeGreaterThan(a.labelX);
  });
});

describe("laneGeometry", () => {
  // A above B; both edges attach to A's bottom and B's top handle, i.e. the same two points
  const aBottom = { x: 100, y: 50 };
  const bTop = { x: 100, y: 200 };
  const [m1, m2] = [parallelLanes([fwd, back]).get("e1")!, parallelLanes([fwd, back]).get("e2")!];
  const g1 = laneGeometry(m1, aBottom, bTop, "bottom", "top");
  const g2 = laneGeometry(m2, bTop, aBottom, "top", "bottom");

  it("moves the ends of a reciprocal pair apart along the node sides", () => {
    expect(g1.source.y).toBe(aBottom.y);
    expect(g1.target.y).toBe(bTop.y);
    expect(Math.abs(g1.source.x - g2.target.x)).toBe(LANE_GAP);
    expect(Math.abs(g1.target.x - g2.source.x)).toBe(LANE_GAP);
  });

  it("keeps each edge on the right-hand side of its own direction", () => {
    // going down, the right-hand side is -x; going up it is +x
    expect(g1.source.x).toBeLessThan(aBottom.x);
    expect(g2.source.x).toBeGreaterThan(bTop.x);
    expect(g1.outward.x).toBeLessThan(0);
    expect(g2.outward.x).toBeGreaterThan(0);
  });

  it("separates horizontal pairs vertically", () => {
    const aRight = { x: 200, y: 80 };
    const bLeft = { x: 400, y: 80 };
    const h1 = laneGeometry(m1, aRight, bLeft, "right", "left");
    const h2 = laneGeometry(m2, bLeft, aRight, "left", "right");
    expect(h1.source.x).toBe(aRight.x);
    expect(Math.abs(h1.source.y - h2.target.y)).toBe(LANE_GAP);
    // going right, the right-hand side is +y (screen coordinates)
    expect(h1.source.y).toBeGreaterThan(aRight.y);
  });

  it("separates the middle segment of orthogonal routes", () => {
    const style = { ...resolveEdgeStyle("excitatory", undefined), lineType: "orthogonal" as const };
    const a = { x: 0, y: 50 };
    const b = { x: 300, y: 200 };
    const r1 = laneGeometry(m1, a, b, "bottom", "top");
    const r2 = laneGeometry(m2, b, a, "top", "bottom");
    const p1 = buildEdgePath(style, [], r1.source.x, r1.source.y, r1.target.x, r1.target.y, Position.Bottom, Position.Top, { ...r1, base: { source: a, target: b } });
    const p2 = buildEdgePath(style, [], r2.source.x, r2.source.y, r2.target.x, r2.target.y, Position.Top, Position.Bottom, { ...r2, base: { source: b, target: a } });
    const midY = (pts: { y: number }[]) => pts[1].y;
    expect(Math.abs(midY(p1.renderPts) - midY(p2.renderPts))).toBe(LANE_GAP);
    expect(p1.path).not.toBe(p2.path);
  });

  it("bows the bezier curves of a pair apart in the middle, even when the S-curve runs flat", () => {
    const style = resolveEdgeStyle("excitatory", undefined);
    // STN bottom → GPe top, offset sideways: the middle of the default S-curve is nearly horizontal
    const a = { x: 108, y: 183 };
    const b = { x: 206, y: 261 };
    const r1 = laneGeometry(m1, a, b, "bottom", "top");
    const r2 = laneGeometry(m2, b, a, "top", "bottom");
    const p1 = buildEdgePath(style, [], r1.source.x, r1.source.y, r1.target.x, r1.target.y, Position.Bottom, Position.Top, { ...r1, base: { source: a, target: b } });
    const p2 = buildEdgePath(style, [], r2.source.x, r2.source.y, r2.target.x, r2.target.y, Position.Top, Position.Bottom, { ...r2, base: { source: b, target: a } });
    expect(p1.path).not.toBe(p2.path);
    // away from the node sides the two curves never come closer than (almost) one lane gap
    const c1 = sampleCubic(p1.path, 0.2, 0.8);
    const c2 = sampleCubic(p2.path, 0, 1);
    const closest = Math.min(...c1.map((p) => Math.min(...c2.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))));
    expect(closest).toBeGreaterThan(LANE_GAP * 0.85);
    expect(Math.hypot(p1.labelX - p2.labelX, p1.labelY - p2.labelY)).toBeGreaterThanOrEqual(LANE_GAP - 1e-9);
  });

  it("keeps straight diagonal pairs one lane gap apart", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 120 };
    const r1 = laneGeometry(m1, a, b, "bottom", "top");
    const r2 = laneGeometry(m2, b, a, "top", "bottom");
    const len = Math.hypot(b.x, b.y);
    const n = { x: -b.y / len, y: b.x / len };
    const perp = (r1.source.x - r2.target.x) * n.x + (r1.source.y - r2.target.y) * n.y;
    expect(Math.abs(perp)).toBeCloseTo(LANE_GAP, 5);
  });

  it("never slides an end past the room left on its node side", () => {
    const g = laneGeometry({ offset: 1, reversed: false }, { x: 0, y: 10 }, { x: 300, y: 10 }, "right", "left", { source: 5, target: 7 });
    expect(Math.abs(g.source.y - 10)).toBe(5);
    expect(Math.abs(g.target.y - 10)).toBe(7);
  });

  it("degenerates safely when both ends coincide", () => {
    const g = laneGeometry({ offset: 0.5, reversed: false }, { x: 5, y: 5 }, { x: 5, y: 5 }, "bottom", "top");
    expect(Number.isFinite(g.source.x) && Number.isFinite(g.target.y)).toBe(true);
  });
});

describe("laneLabelPlacement", () => {
  it("centres labels of the middle lane and pushes the others outwards", () => {
    expect(laneLabelPlacement({ x: 0, y: 0 }, 10, 20, 100, 10).transform).toContain("translate(-50%, -50%)");
    expect(laneLabelPlacement({ x: 1, y: 0 }, 10, 20, 100, 10).transform).toContain("translate(0, -50%)");
    expect(laneLabelPlacement({ x: -1, y: 0 }, 10, 20, 100, 10).transform).toContain("translate(-100%, -50%)");
    expect(laneLabelPlacement({ x: 0, y: 1 }, 10, 20, 100, 10).transform).toContain("translate(-50%, 0)");
    expect(laneLabelPlacement({ x: 0, y: -1 }, 10, 20, 100, 10).transform).toContain("translate(-50%, -100%)");
  });

  it("narrows labels that run along a short connection so the end markers stay clear", () => {
    expect(laneLabelPlacement({ x: 0, y: 1 }, 0, 0, 120, 11).maxWidth).toBe(120 - 2 * 15);
    expect(laneLabelPlacement({ x: 0, y: 1 }, 0, 0, 900, 11).maxWidth).toBe(200);
    expect(laneLabelPlacement({ x: 0, y: 1 }, 0, 0, 20, 11).maxWidth).toBe(48);
    expect(laneLabelPlacement({ x: 1, y: 0 }, 0, 0, 20, 11).maxWidth).toBeUndefined();
  });
});
