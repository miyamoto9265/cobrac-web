import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, getSmoothStepPath, getStraightPath, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react";
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ArrowHead, EdgeLineType, EdgeSign, EdgeStyle } from "@cobrac/shared";
import { useT } from "../../i18n";
import { markerUrl } from "./markers";

export type XY = { x: number; y: number };

/** Every visual property resolved (defaults + per-edge overrides). */
export interface ResolvedEdgeStyle {
  lineType: EdgeLineType;
  color: string;
  width: number;
  dashed: boolean;
  markerStart: ArrowHead;
  markerEnd: ArrowHead;
  waypoints: XY[];
  rounded: boolean;
}

export type EdgeData = {
  style: ResolvedEdgeStyle;
  label?: string;
  title?: string;
  related: boolean;
  dim: boolean;
  /** true when this edge is selected → show waypoint editing handles */
  editing: boolean;
  onWaypointsChange?: (id: string, wps: XY[]) => void;
};

export type StyledEdgeType = Edge<EdgeData, "styled">;

/** Default look per physiological sign (HCD) – FRG edges use "unknown". */
export const SIGN_DEFAULTS: Record<EdgeSign, Omit<ResolvedEdgeStyle, "waypoints">> = {
  excitatory: { lineType: "orthogonal", color: "#475569", width: 1.4, dashed: false, markerStart: "none", markerEnd: "arrow", rounded: true },
  inhibitory: { lineType: "orthogonal", color: "#2563eb", width: 1.6, dashed: false, markerStart: "none", markerEnd: "square", rounded: true },
  modulatory: { lineType: "orthogonal", color: "#7c3aed", width: 1.4, dashed: true, markerStart: "none", markerEnd: "circle", rounded: true },
  unknown: { lineType: "orthogonal", color: "#94a3b8", width: 1.3, dashed: false, markerStart: "none", markerEnd: "arrow", rounded: true },
};

export function resolveEdgeStyle(sign: EdgeSign | undefined, override: EdgeStyle | undefined, dashedDefault?: boolean): ResolvedEdgeStyle {
  const d = SIGN_DEFAULTS[sign ?? "unknown"];
  return {
    lineType: override?.lineType ?? d.lineType,
    color: override?.color ?? d.color,
    width: override?.width ?? d.width,
    dashed: override?.dashed ?? dashedDefault ?? d.dashed,
    markerStart: override?.markerStart ?? d.markerStart,
    markerEnd: override?.markerEnd ?? d.markerEnd,
    waypoints: override?.waypoints ?? [],
    rounded: override?.rounded ?? d.rounded,
  };
}

// ---------------------------------------------------------------------------
// Path construction
// ---------------------------------------------------------------------------

const isHorizontal = (p: Position) => p === Position.Left || p === Position.Right;

/** Insert right-angle corners between consecutive anchor points. */
function orthogonalPoints(pts: XY[], sourcePos: Position, targetPos: Position): XY[] {
  const out: XY[] = [pts[0]];
  const last = pts.length - 2;
  let prevHorizontal = isHorizontal(sourcePos);
  for (let i = 0; i <= last; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
      out.push(b);
      prevHorizontal = Math.abs(a.y - b.y) < 0.5;
      continue;
    }
    const srcH = isHorizontal(sourcePos);
    const tgtH = isHorizontal(targetPos);
    if (i === 0 && i === last) {
      // direct connection: leave and enter perpendicular to the node sides
      if (!srcH && !tgtH) {
        const my = (a.y + b.y) / 2;
        out.push({ x: a.x, y: my }, { x: b.x, y: my }, b);
      } else if (srcH && tgtH) {
        const mx = (a.x + b.x) / 2;
        out.push({ x: mx, y: a.y }, { x: mx, y: b.y }, b);
      } else if (srcH) {
        out.push({ x: b.x, y: a.y }, b);
      } else {
        out.push({ x: a.x, y: b.y }, b);
      }
      continue;
    }
    let hFirst: boolean;
    if (i === 0) hFirst = srcH;
    else if (i === last) hFirst = !tgtH; // finish perpendicular to the target side
    else hFirst = prevHorizontal;
    out.push(hFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y }, b);
    prevHorizontal = !hFirst;
  }
  return out;
}

/** Polyline → SVG path, optionally with rounded corners. */
function pointsToPath(pts: XY[], radius: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    if (radius <= 0) {
      d += ` L${c.x},${c.y}`;
      continue;
    }
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    if (r < 0.5 || d1 === 0 || d2 === 0) {
      d += ` L${c.x},${c.y}`;
      continue;
    }
    const a = { x: c.x - ((c.x - p.x) / d1) * r, y: c.y - ((c.y - p.y) / d1) * r };
    const b = { x: c.x + ((n.x - c.x) / d2) * r, y: c.y + ((n.y - c.y) / d2) * r };
    d += ` L${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;
  }
  const e = pts[pts.length - 1];
  d += ` L${e.x},${e.y}`;
  return d;
}

/** Point at half the total length of a polyline (for labels). */
function midpoint(pts: XY[]): XY {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - acc) / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += seg;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}

export function buildEdgePath(
  s: ResolvedEdgeStyle,
  wps: XY[],
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: Position,
  targetPosition: Position,
): { path: string; labelX: number; labelY: number; renderPts: XY[] } {
  const anchors: XY[] = [{ x: sx, y: sy }, ...wps, { x: tx, y: ty }];
  switch (s.lineType) {
    case "straight": {
      const [path, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });
      return { path, labelX, labelY, renderPts: anchors };
    }
    case "smoothstep": {
      const [path, labelX, labelY] = getSmoothStepPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition, borderRadius: s.rounded ? 8 : 0 });
      return { path, labelX, labelY, renderPts: anchors };
    }
    case "polyline": {
      const m = midpoint(anchors);
      return { path: pointsToPath(anchors, s.rounded ? 10 : 0), labelX: m.x, labelY: m.y, renderPts: anchors };
    }
    case "orthogonal": {
      const pts = orthogonalPoints(anchors, sourcePosition, targetPosition);
      const m = midpoint(pts);
      return { path: pointsToPath(pts, s.rounded ? 8 : 0), labelX: m.x, labelY: m.y, renderPts: pts };
    }
    case "bezier":
    default: {
      const [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition });
      return { path, labelX, labelY, renderPts: anchors };
    }
  }
}

const EDITABLE: EdgeLineType[] = ["orthogonal", "polyline"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function StyledEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<StyledEdgeType>) {
  const t = useT();
  const rf = useReactFlow();
  const d = data!;
  const s = d.style;
  const [wps, setWps] = useState<XY[]>(s.waypoints);
  const dragging = useRef<{ index: number } | null>(null);
  useEffect(() => {
    if (!dragging.current) setWps(s.waypoints);
  }, [s.waypoints]);

  const { path, labelX, labelY, renderPts } = buildEdgePath(s, wps, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition);

  const startMarker = markerUrl(s.markerStart === "none" ? null : { type: s.markerStart, color: s.color, width: s.width });
  const endMarker = markerUrl(s.markerEnd === "none" ? null : { type: s.markerEnd, color: s.color, width: s.width });
  const width = s.width + (d.related || selected ? 0.9 : 0);
  const opacity = d.dim ? 0.15 : 1;

  const canEdit = d.editing && EDITABLE.includes(s.lineType) && !!d.onWaypointsChange;

  // --- waypoint dragging ------------------------------------------------------
  const beginDrag = (e: ReactPointerEvent, index: number, insertAt?: number) => {
    e.stopPropagation();
    e.preventDefault();
    let cur = wps;
    if (insertAt !== undefined) {
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      cur = [...wps.slice(0, insertAt), p, ...wps.slice(insertAt)];
      index = insertAt;
      setWps(cur);
    }
    dragging.current = { index };
    const move = (ev: PointerEvent) => {
      const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      cur = cur.map((w, i) => (i === index ? { x: Math.round(p.x), y: Math.round(p.y) } : w));
      setWps(cur);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragging.current = null;
      d.onWaypointsChange?.(id, cur);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const removeWaypoint = (index: number) => {
    const next = wps.filter((_, i) => i !== index);
    setWps(next);
    d.onWaypointsChange?.(id, next);
  };

  // Midpoints of each anchor segment (for the "add bend" handles). Index = insertion index into wps.
  const anchors: XY[] = [{ x: sourceX, y: sourceY }, ...wps, { x: targetX, y: targetY }];
  const mids = canEdit
    ? anchors.slice(0, -1).map((a, i) => {
        const b = anchors[i + 1];
        if (s.lineType === "orthogonal") {
          // place the "+" on the actual rendered path between the two anchors
          const seg = renderPts.filter((p) => between(p, a, b));
          const m = midpoint(seg.length >= 2 ? seg : [a, b]);
          return { x: m.x, y: m.y, insertAt: i };
        }
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, insertAt: i };
      })
    : [];

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={startMarker}
        markerEnd={endMarker}
        interactionWidth={18}
        style={{
          stroke: s.color,
          strokeWidth: width,
          strokeDasharray: s.dashed ? `${4 + s.width * 2} ${3 + s.width}` : undefined,
          opacity,
          filter: selected ? `drop-shadow(0 0 2px ${s.color})` : undefined,
          transition: "stroke-width 120ms",
        }}
      />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute max-w-[180px] truncate rounded bg-white/85 px-1 text-[9px] text-slate-600"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity }}
            title={d.title}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {canEdit && (
        <EdgeLabelRenderer>
          {mids.map((m) => (
            <div
              key={`mid-${m.insertAt}`}
              className="nodrag nopan absolute flex h-3.5 w-3.5 cursor-copy items-center justify-center rounded-full border border-blue-500 bg-white text-[10px] font-bold leading-none text-blue-600 shadow"
              style={{ transform: `translate(-50%, -50%) translate(${m.x}px, ${m.y}px)`, pointerEvents: "all", zIndex: 1000 }}
              onPointerDown={(e) => beginDrag(e, m.insertAt, m.insertAt)}
              title={t("edge.addBend")}
            >
              +
            </div>
          ))}
          {wps.map((w, i) => (
            <div
              key={`wp-${i}`}
              className="nodrag nopan absolute h-3 w-3 cursor-move rounded-sm border-2 border-blue-600 bg-white shadow"
              style={{ transform: `translate(-50%, -50%) translate(${w.x}px, ${w.y}px)`, pointerEvents: "all", zIndex: 1001 }}
              onPointerDown={(e) => beginDrag(e, i)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removeWaypoint(i);
              }}
              title={t("edge.moveBend")}
            />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Is p inside the bounding box spanned by a and b (with tolerance)? */
function between(p: XY, a: XY, b: XY) {
  const t = 0.5;
  return p.x >= Math.min(a.x, b.x) - t && p.x <= Math.max(a.x, b.x) + t && p.y >= Math.min(a.y, b.y) - t && p.y <= Math.max(a.y, b.y) + t;
}

export const StyledEdge = memo(StyledEdgeImpl);
