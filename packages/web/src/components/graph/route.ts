import { Position } from "@xyflow/react";

export interface XY {
  x: number;
  y: number;
}

/** A segment of a line already routed; `owner` is its source node (lines from the same node may share their start) */
export interface TakenSegment {
  a: XY;
  b: XY;
  owner: string;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gap kept between a routed line and the boxes it passes */
const CLEAR = 8;
/** Straight run out of the source and into the target before the first / after the last corner */
const STUB = 16;
/** Distance of a detour channel from the box it runs along */
const CHANNEL = 16;
/** Length a corner is worth when routes are compared (fewer corners first, then shorter) */
const BEND_COST = 60;
/** Lines closer than this on the same axis are drawn on top of each other */
const OVERLAP = 4;
/** Cost of each px a line runs on top of another node's line (two lines merged read as one) */
const OVERLAP_COST = 6;

const NORMAL: Record<Position, XY> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
};

/** True when the axis-aligned segment a–b passes through the rectangle grown by CLEAR (touching the edge is fine). */
function hits(a: XY, b: XY, r: Obstacle): boolean {
  const left = r.x - CLEAR;
  const right = r.x + r.width + CLEAR;
  const top = r.y - CLEAR;
  const bottom = r.y + r.height + CLEAR;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxX > left && minX < right && maxY > top && minY < bottom;
}

function clear(pts: XY[], obstacles: Obstacle[]): boolean {
  for (let i = 1; i < pts.length; i++) for (const r of obstacles) if (hits(pts[i - 1], pts[i], r)) return false;
  return true;
}

/** Length (px) of the route that runs on top of lines from other sources. */
function overlap(pts: XY[], taken: TakenSegment[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vertical = Math.abs(a.x - b.x) < 0.5;
    for (const t of taken) {
      const tv = Math.abs(t.a.x - t.b.x) < 0.5;
      if (tv !== vertical) continue;
      if (vertical ? Math.abs(t.a.x - a.x) >= OVERLAP : Math.abs(t.a.y - a.y) >= OVERLAP) continue;
      const [lo, hi] = vertical ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const [tlo, thi] = vertical ? [Math.min(t.a.y, t.b.y), Math.max(t.a.y, t.b.y)] : [Math.min(t.a.x, t.b.x), Math.max(t.a.x, t.b.x)];
      total += Math.max(0, Math.min(hi, thi) - Math.max(lo, tlo));
    }
  }
  return total;
}

function cost(pts: XY[]): number {
  let len = 0;
  let bends = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    if (i >= 2) {
      const h1 = Math.abs(pts[i - 1].y - pts[i - 2].y) < 0.5;
      const h2 = Math.abs(pts[i].y - pts[i - 1].y) < 0.5;
      if (h1 !== h2) bends++;
    }
  }
  return len + bends * BEND_COST;
}

/** Drops repeated points and the middle of three points on one line. */
function simplify(pts: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of pts) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.5 && Math.abs(out[out.length - 1].y - p.y) < 0.5) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5)) out.pop();
    }
    out.push(p);
  }
  return out;
}

const byDistance = (vals: number[], to: number) => [...new Set(vals.map((v) => Math.round(v)))].sort((a, b) => Math.abs(a - to) - Math.abs(b - to));

/**
 * Right-angle route from a source handle to a target handle that goes around the other boxes instead of under them.
 * The line leaves and enters perpendicular to the node sides; among the routes that touch no box, the one with the
 * fewest corners wins, then the shortest. Returns null when no such route is found (the caller draws its usual line).
 * `obstacles` may include the source and target boxes: only the short runs out of and into them may cross them.
 * `taken` are the lines routed before this one: running on top of a line from another source costs extra, so two
 * connections do not merge into one line.
 */
export function routeAround(s: XY, sourcePos: Position, t: XY, targetPos: Position, obstacles: Obstacle[], taken: TakenSegment[] = [], owner = ""): XY[] | null {
  const ns = NORMAL[sourcePos];
  const nt = NORMAL[targetPos];
  const s1 = { x: s.x + ns.x * STUB, y: s.y + ns.y * STUB };
  const t1 = { x: t.x + nt.x * STUB, y: t.y + nt.y * STUB };
  // boxes near the route only (a detour never needs to go far past the two ends)
  const pad = 400;
  const box = { minX: Math.min(s.x, t.x) - pad, maxX: Math.max(s.x, t.x) + pad, minY: Math.min(s.y, t.y) - pad, maxY: Math.max(s.y, t.y) + pad };
  const near = obstacles.filter((r) => r.x + r.width >= box.minX && r.x <= box.maxX && r.y + r.height >= box.minY && r.y <= box.maxY);

  const others = taken.filter((t) => t.owner !== owner);
  const full = (mid: XY[]) => simplify([s, s1, ...mid, t1, t]);
  const ok = (mid: XY[]) => clear(simplify([s1, ...mid, t1]), near);
  let best: XY[] | null = null;
  let bestCost = Infinity;
  const consider = (mid: XY[]) => {
    if (!ok(mid)) return;
    const pts = full(mid);
    const c = cost(pts) + OVERLAP_COST * overlap(pts, others);
    if (c < bestCost) {
      best = pts;
      bestCost = c;
    }
  };

  // beside other lines too, so a route can run next to one instead of on it
  const lineXs = others.filter((g) => Math.abs(g.a.x - g.b.x) < 0.5).flatMap((g) => [g.a.x - 3 * OVERLAP, g.a.x + 3 * OVERLAP]);
  const lineYs = others.filter((g) => Math.abs(g.a.y - g.b.y) < 0.5).flatMap((g) => [g.a.y - 3 * OVERLAP, g.a.y + 3 * OVERLAP]);
  const xs = byDistance([s1.x, t1.x, (s1.x + t1.x) / 2, ...near.flatMap((r) => [r.x - CHANNEL, r.x + r.width + CHANNEL]), ...lineXs], (s1.x + t1.x) / 2);
  const ys = byDistance([s1.y, t1.y, (s1.y + t1.y) / 2, ...near.flatMap((r) => [r.y - CHANNEL, r.y + r.height + CHANNEL]), ...lineYs], (s1.y + t1.y) / 2);

  // one or two corners
  consider([{ x: s1.x, y: t1.y }]);
  consider([{ x: t1.x, y: s1.y }]);
  for (const y of ys) consider([{ x: s1.x, y }, { x: t1.x, y }]);
  for (const x of xs) consider([{ x, y: s1.y }, { x, y: t1.y }]);
  if (best && overlap(best, others) === 0) return best;

  // a detour along a channel beside the boxes in the way: out, across, along the channel, across, in
  const ys1 = byDistance(ys, s1.y).slice(0, 4);
  const ys2 = byDistance(ys, t1.y).slice(0, 4);
  const xs1 = byDistance(xs, s1.x).slice(0, 4);
  const xs2 = byDistance(xs, t1.x).slice(0, 4);
  for (const x of xs) for (const y1 of ys1) for (const y2 of ys2) consider([{ x: s1.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: t1.x, y: y2 }]);
  for (const y of ys) for (const x1 of xs1) for (const x2 of xs2) consider([{ x: x1, y: s1.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: t1.y }]);
  return best;
}

/** Segments of a route, for the `taken` list of the next ones. */
export function segmentsOf(pts: XY[], owner: string): TakenSegment[] {
  return pts.slice(1).map((b, i) => ({ a: pts[i], b, owner }));
}
