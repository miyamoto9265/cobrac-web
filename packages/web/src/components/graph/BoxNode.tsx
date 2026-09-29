import { Handle, NodeResizer, Position, useConnection, useStore, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, type CSSProperties } from "react";
import type { NodeStyle } from "@cobrac/shared";

export interface GNode {
  id: string;
  label: string;
  sublabel?: string;
  color: string; // fill (hex)
  /** stripe on the left edge that carries the node class, so it stays readable when zoomed out */
  accent?: string;
  border?: string;
  shape?: "rect" | "pill";
  width?: number;
  height?: number;
  /** extra text matched by the search box (not shown on the node) */
  search?: string;
  /** collapsible group (FRG): number of direct children and whether they are hidden */
  collapse?: { collapsed: boolean; count: number };
}

export type NodeData = {
  g: GNode;
  selected: boolean;
  dim: boolean;
  /** a search hit or a node on the selected node's paths */
  emphasis: boolean;
  /** user overrides (colour / border); size is applied through node.width/height */
  style?: NodeStyle;
  onResizeEnd?: (id: string, size: { width: number; height: number; x: number; y: number }) => void;
  onToggleCollapse?: (id: string) => void;
  resizable: boolean;
  collapseLabel?: string;
};

export type BoxNodeType = Node<NodeData, "box">;

export const HANDLE_SIDES = ["top", "right", "bottom", "left"] as const;
export type HandleSide = (typeof HANDLE_SIDES)[number];
export const HANDLE_FRACTIONS = [0.12, 0.28, 0.42, 0.5, 0.58, 0.72, 0.88] as const;

export const handleId = (side: HandleSide, f: number) => `${side}-${f}`;

export function parseHandleId(id: string | null | undefined): { side: HandleSide; f: number } | null {
  if (!id) return null;
  const m = id.match(/^(top|right|bottom|left)-([\d.]+)$/);
  if (!m) return null;
  return { side: m[1] as HandleSide, f: Number(m[2]) };
}

const POS: Record<HandleSide, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };

function handleStyle(side: HandleSide, f: number): CSSProperties {
  const pct = `${f * 100}%`;
  switch (side) {
    case "top":
      return { left: pct, top: 0 };
    case "bottom":
      return { left: pct, bottom: 0 };
    case "left":
      return { top: pct, left: 0 };
    case "right":
      return { top: pct, right: 0 };
  }
}

export const DEFAULT_NODE_W = 160;
export const DEFAULT_NODE_H = 44;

/** Zoom bucket: labels grow as the view zooms out so the overview stays legible. */
const zoomBucket = (z: number) => (z < 0.38 ? 2 : z < 0.62 ? 1 : 0);

function BoxNodeImpl({ id, data, selected, width, height }: NodeProps<BoxNodeType>) {
  const { g, dim, emphasis, style } = data;
  const connecting = useConnection((c) => c.inProgress);
  const far = useStore((s) => zoomBucket(s.transform[2]));
  const fill = style?.color ?? g.color;
  const border = selected ? "#1d4ed8" : style?.border ?? g.border ?? "rgba(15,23,42,0.18)";
  const pill = g.shape === "pill";
  return (
    <div
      className={`group relative flex h-full w-full flex-col items-center justify-center overflow-hidden border text-center transition-[opacity,box-shadow] duration-150 ${pill ? "rounded-full px-3" : "rounded-lg pl-3 pr-2"} ${
        selected ? "shadow-[0_0_0_4px_rgba(59,130,246,0.25)]" : emphasis ? "shadow-[0_0_0_3px_rgba(250,204,21,0.55)]" : "shadow-sm"
      } ${connecting ? "connecting" : ""}`}
      style={{
        background: fill,
        borderColor: border,
        borderWidth: selected ? 2 : 1,
        width: width ?? g.width ?? DEFAULT_NODE_W,
        height: height ?? g.height ?? DEFAULT_NODE_H,
        opacity: dim ? 0.22 : 1,
        boxSizing: "border-box",
      }}
    >
      {g.accent && !pill && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: g.accent }} />}
      <NodeResizer
        isVisible={!!selected && data.resizable}
        minWidth={60}
        minHeight={28}
        lineClassName="!border-blue-500"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-blue-600 !bg-white"
        onResizeEnd={(_, p) => data.onResizeEnd?.(id, { width: p.width, height: p.height, x: p.x, y: p.y })}
      />
      {HANDLE_SIDES.map((side) =>
        HANDLE_FRACTIONS.map((f) => (
          <Handle
            key={handleId(side, f)}
            id={handleId(side, f)}
            type="source"
            position={POS[side]}
            isConnectableStart={false}
            isConnectableEnd
            className="handle-dot !h-2 !w-2 !min-h-0 !min-w-0 !border !border-white !bg-slate-400"
            style={handleStyle(side, f)}
          />
        )),
      )}
      <div
        className={`w-full break-words font-semibold leading-tight text-slate-900 ${far ? "line-clamp-2 font-sans" : "font-mono"}`}
        style={{ fontSize: far === 2 ? 22 : far === 1 ? 16 : 12.5, hyphens: "auto" }}
      >
        {g.label}
      </div>
      {g.sublabel && !far && <div className="mt-0.5 w-full truncate text-[10.5px] leading-tight text-slate-600">{g.sublabel}</div>}
      {g.collapse && g.collapse.count > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleCollapse?.(id);
          }}
          className="nodrag absolute bottom-0.5 right-1 flex items-center rounded px-0.5 text-[10px] font-medium text-slate-600 hover:bg-black/5 hover:text-slate-900"
          title={data.collapseLabel}
          aria-label={data.collapseLabel}
          aria-expanded={!g.collapse.collapsed}
        >
          {g.collapse.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {g.collapse.count}
        </button>
      )}
    </div>
  );
}

export const BoxNode = memo(BoxNodeImpl);
