import type { ReactElement } from "react";
import type { ArrowHead } from "@cobrac/shared";

export interface MarkerSpec {
  type: ArrowHead;
  color: string;
  width: number;
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");

export function markerId(m: MarkerSpec): string {
  return `mk-${m.type}-${safe(m.color)}-${safe(String(m.width))}`;
}

export function markerUrl(m: MarkerSpec | null): string | undefined {
  if (!m || m.type === "none") return undefined;
  return `url(#${markerId(m)})`;
}

export function markerKey(m: MarkerSpec) {
  return markerId(m);
}

/** Size of the marker box in px (scaled with stroke width, userSpaceOnUse). */
export function markerBoxSize(width: number) {
  return Math.max(8, 7 + width * 2.2);
}

function shape(type: ArrowHead, color: string): { el: ReactElement; refX: number } {
  switch (type) {
    case "arrow":
      return { el: <path d="M0,0 L10,5 L0,10 Z" fill={color} />, refX: 10 };
    case "arrowOpen":
      return { el: <path d="M0.5,0.5 L9.5,5 L0.5,9.5" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />, refX: 9.5 };
    case "square":
      return { el: <rect x={1} y={1} width={8} height={8} fill={color} />, refX: 9 };
    case "circle":
      return { el: <circle cx={5} cy={5} r={4} fill={color} />, refX: 9 };
    case "diamond":
      return { el: <path d="M5,0.5 L9.5,5 L5,9.5 L0.5,5 Z" fill={color} />, refX: 9.5 };
    case "bar":
      return { el: <path d="M8,0 L8,10" stroke={color} strokeWidth={2.2} />, refX: 8 };
    default:
      return { el: <g />, refX: 0 };
  }
}

/**
 * SVG <marker> definitions for every (type, color, width) combination currently in use.
 * Rendered once inside the flow; edges reference them with url(#id).
 */
export function MarkerDefs({ markers }: { markers: MarkerSpec[] }) {
  if (markers.length === 0) return null;
  return (
    <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
      <defs>
        {markers.map((m) => {
          if (m.type === "none") return null;
          const s = markerBoxSize(m.width);
          const { el, refX } = shape(m.type, m.color);
          return (
            <marker key={markerId(m)} id={markerId(m)} viewBox="0 0 10 10" markerWidth={s} markerHeight={s} markerUnits="userSpaceOnUse" refX={refX} refY={5} orient="auto-start-reverse">
              {el}
            </marker>
          );
        })}
      </defs>
    </svg>
  );
}
