import { Handle, NodeResizer, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import { memo, type CSSProperties } from "react";
import type { NodeStyle } from "@cobrac/shared";

export interface GNode {
  id: string;
  label: string;
  sublabel?: string;
  color: string; // fill (hex)
  border?: string;
  shape?: "rect" | "pill";
  width?: number;
  height?: number;
}

export type NodeData = {
  g: GNode;
  selected: boolean;
  dim: boolean;
  /** user overrides (colour / border); size is applied through node.width/height */
  style?: NodeStyle;
  onResizeEnd?: (id: string, size: { width: number; height: number; x: number; y: number }) => void;
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

function BoxNodeImpl({ id, data, selected, width, height }: NodeProps<BoxNodeType>) {
  const { g, dim, style } = data;
  const connecting = useConnection((c) => c.inProgress);
  const fill = style?.color ?? g.color;
  const border = selected ? "#1d4ed8" : style?.border ?? g.border ?? "rgba(0,0,0,0.15)";
  return (
    <div
      className={`group relative flex h-full w-full flex-col items-center justify-center border px-2 py-1 text-center shadow-sm transition-opacity ${g.shape === "pill" ? "rounded-full" : "rounded-md"} ${connecting ? "connecting" : ""}`}
      style={{
        background: fill,
        borderColor: border,
        borderWidth: selected ? 2.5 : 1,
        width: width ?? g.width ?? DEFAULT_NODE_W,
        height: height ?? g.height ?? DEFAULT_NODE_H,
        opacity: dim ? 0.3 : 1,
        boxSizing: "border-box",
      }}
    >
      <NodeResizer
        isVisible={!!selected}
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
      <div className="w-full break-words font-mono text-xs font-semibold leading-tight text-slate-900" style={{ overflow: "hidden", maxHeight: "100%" }}>
        {g.label}
      </div>
      {g.sublabel && <div className="w-full truncate text-[10px] leading-tight text-slate-600">{g.sublabel}</div>}
    </div>
  );
}

export const BoxNode = memo(BoxNodeImpl);
