import type { Node, NodeProps } from "@xyflow/react";
import { memo } from "react";

/** Group drawn behind its member nodes (HCD Collections). Only the label takes pointer events. */
export interface GGroup {
  id: string;
  label: string;
  sublabel?: string;
  /** node ids inside the group (nested groups already expanded) */
  members: string[];
}

export type GroupData = {
  g: GGroup;
  selected: boolean;
  dim: boolean;
  onSelect?: (id: string) => void;
};

export type GroupBoxType = Node<GroupData, "group-box">;

export const GroupBox = memo(function GroupBox({ data }: NodeProps<GroupBoxType>) {
  const { g, selected, dim, onSelect } = data;
  return (
    <div
      className={`pointer-events-none h-full w-full rounded-xl border transition-opacity ${selected ? "border-solid border-indigo-500 bg-indigo-400/[0.07]" : "border-dashed border-slate-400/80 bg-slate-400/[0.05]"} ${dim ? "opacity-30" : ""}`}
    >
      <button
        type="button"
        data-testid="collection-label"
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(g.id);
        }}
        title={g.sublabel ? `${g.label} — ${g.sublabel}` : g.label}
        className={`nodrag nopan pointer-events-auto ml-2 mt-0.5 flex max-w-[calc(100%-1rem)] items-baseline gap-1 truncate rounded px-1 text-left text-[10px] leading-4 hover:bg-white/80 ${selected ? "text-indigo-700" : "text-slate-500"}`}
      >
        <span className="font-mono font-semibold">{g.label}</span>
        {g.sublabel && <span className="truncate">{g.sublabel}</span>}
      </button>
    </div>
  );
});
