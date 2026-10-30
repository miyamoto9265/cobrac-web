import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { routeAround, type Obstacle } from "../src/components/graph/route";

const box = (id: string, x: number, y: number): Obstacle => ({ id, x, y, width: 160, height: 36 });
const crosses = (pts: { x: number; y: number }[], r: Obstacle) =>
  pts.slice(1).some((b, i) => {
    const a = pts[i];
    return Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height;
  });

describe("routeAround", () => {
  // A21r above A40c above A44op, all in one column
  const a = box("A21r", 0, 0);
  const c = box("A40c", 0, 150);
  const b = box("A44op", 0, 300);

  it("draws a straight line when nothing is in the way", () => {
    expect(routeAround({ x: 80, y: 36 }, Position.Bottom, { x: 80, y: 150 }, Position.Top, [a, c])).toEqual([
      { x: 80, y: 36 },
      { x: 80, y: 150 },
    ]);
  });

  it("goes around a box between the two ends instead of under it", () => {
    const pts = routeAround({ x: 80, y: 36 }, Position.Bottom, { x: 80, y: 300 }, Position.Top, [a, c, b])!;
    expect(pts[0]).toEqual({ x: 80, y: 36 });
    expect(pts[pts.length - 1]).toEqual({ x: 80, y: 300 });
    expect(crosses(pts, c)).toBe(false);
    // right angles only
    for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true);
  });

  it("uses a single Z when the boxes are side by side", () => {
    const d = box("D", 300, 150);
    const pts = routeAround({ x: 80, y: 36 }, Position.Bottom, { x: 380, y: 150 }, Position.Top, [a, d])!;
    expect(pts).toHaveLength(4);
  });
});
