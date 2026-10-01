/**
 * Edges that share the same pair of nodes (A→B and B→A of a feedback loop, or several A→B) would be drawn on one
 * line. Each one gets a lane: the lanes are spread around the straight connection, and every edge sits on the
 * right-hand side of its own direction of travel, so a reciprocal pair always separates the same way.
 * Lanes are computed when drawing and never stored.
 */

export type XY = { x: number; y: number };
export type Side = "top" | "right" | "bottom" | "left";

/** `offset` counts lane gaps along the right-hand normal of the pair's canonical direction (lower node id → higher). */
export interface Lane {
  offset: number;
  /** the edge runs against the canonical direction */
  reversed: boolean;
}

/** Distance between neighbouring lanes in flow units; scales with the zoom like the arrow heads, and stays wider than the 18-unit hover band of an edge. */
export const LANE_GAP = 20;

/** Extra reach per additional self loop on the same node. */
export const SELF_LOOP_STEP = 22;

interface EdgeLike {
  id: string;
  source: string;
  target: string;
}

/**
 * Lanes for edges that share their (unordered) node pair. Edges alone on their pair get no entry and are drawn as
 * before; so do edges excluded by `skip` (e.g. edges with a user-drawn route).
 */
export function parallelLanes(edges: EdgeLike[], skip?: (id: string) => boolean): Map<string, Lane> {
  const groups = new Map<string, { e: EdgeLike; reversed: boolean }[]>();
  for (const e of edges) {
    if (e.source === e.target || skip?.(e.id)) continue;
    const reversed = e.source > e.target;
    const key = reversed ? `${e.target}\u0000${e.source}` : `${e.source}\u0000${e.target}`;
    const g = groups.get(key);
    if (g) g.push({ e, reversed });
    else groups.set(key, [{ e, reversed }]);
  }
  const out = new Map<string, Lane>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    // reversed edges take the negative lanes (their own right side), forward edges the positive ones
    g.sort((a, b) => Number(b.reversed) - Number(a.reversed) || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0));
    g.forEach(({ e, reversed }, i) => out.set(e.id, { offset: i - (g.length - 1) / 2, reversed }));
  }
  return out;
}

/** 0, 1, 2 … for the self loops of each node, so repeated loops nest instead of overlapping. */
export function selfLoopIndex(edges: EdgeLike[]): Map<string, number> {
  const count = new Map<string, number>();
  const out = new Map<string, number>();
  for (const e of edges) {
    if (e.source !== e.target) continue;
    const i = count.get(e.source) ?? 0;
    count.set(e.source, i + 1);
    out.set(e.id, i);
  }
  return out;
}

const sgn = (v: number) => (v < 0 ? -1 : 1);
const horizontalSide = (s: Side) => s === "left" || s === "right";

export interface LaneGeometry {
  source: XY;
  target: XY;
  /** shift for the middle segment of orthogonal / step routes */
  center: XY;
  /** right-hand unit normal of the pair's canonical direction */
  normal: XY;
  /** signed distance of this lane from the pair's centre line, along `normal` */
  shift: number;
  /** unit vector pointing from the straight connection towards this edge's lane (0,0 for the middle lane) */
  outward: XY;
}

/** Room (flow units) each end may slide along its node side before it would leave the node. */
export interface LaneRoom {
  source: number;
  target: number;
}

/**
 * Move both ends along their node side (so they stay on the border) and report how far the middle of the route
 * should move. Both edges of a pair compute the same canonical normal, so their shifts are exact opposites.
 */
export function laneGeometry(lane: Lane, s: XY, t: XY, sourceSide: Side, targetSide: Side, room?: LaneRoom, gap = LANE_GAP): LaneGeometry {
  const p = lane.reversed ? t : s;
  const q = lane.reversed ? s : t;
  let dx = q.x - p.x;
  let dy = q.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  // right-hand normal in screen coordinates (y grows downwards)
  const n = { x: -dy, y: dx };
  const k = lane.offset * gap;
  // slide far enough that straight lines end up `gap` apart perpendicular to the connection, not just along the side
  const along = (side: Side, max: number | undefined): XY => {
    const c = horizontalSide(side) ? n.y : n.x;
    let d = k / Math.max(Math.abs(c), 0.4);
    if (max !== undefined) d = Math.sign(d) * Math.min(Math.abs(d), Math.max(0, max));
    d *= sgn(c);
    return horizontalSide(side) ? { x: 0, y: d } : { x: d, y: 0 };
  };
  const a = along(sourceSide, room?.source);
  const b = along(targetSide, room?.target);
  const dir = Math.sign(lane.offset);
  return {
    source: { x: s.x + a.x, y: s.y + a.y },
    target: { x: t.x + b.x, y: t.y + b.y },
    center: { x: k * sgn(n.x), y: k * sgn(n.y) },
    normal: n,
    shift: k,
    outward: { x: n.x * dir || 0, y: n.y * dir || 0 },
  };
}

/**
 * Placement of a lane's label: on the lane's outer side so labels of parallel edges do not cover each other.
 * A label that runs along a short, mostly horizontal connection is narrowed so it cannot hide the end markers.
 * `ends` is the horizontal distance between the two ends, `marker` the arrow-head size (flow units).
 */
export function laneLabelPlacement(outward: XY, x: number, y: number, ends: number, marker: number, pad = 6): { transform: string; maxWidth?: number } {
  if (outward.x === 0 && outward.y === 0) return { transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` };
  if (Math.abs(outward.x) >= Math.abs(outward.y)) {
    return { transform: outward.x > 0 ? `translate(0, -50%) translate(${x + pad}px, ${y}px)` : `translate(-100%, -50%) translate(${x - pad}px, ${y}px)` };
  }
  return {
    transform: outward.y > 0 ? `translate(-50%, 0) translate(${x}px, ${y + pad}px)` : `translate(-50%, -100%) translate(${x}px, ${y - pad}px)`,
    maxWidth: Math.max(48, Math.min(200, ends - 2 * (marker + 4))),
  };
}
