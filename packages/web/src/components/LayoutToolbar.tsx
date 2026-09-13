import { Check, Loader2, LayoutGrid, TriangleAlert } from "lucide-react";
import type { useGraphLayout } from "../lib/useGraphLayout";

type L = ReturnType<typeof useGraphLayout>;

/** Save-state indicator + "reset to automatic layout" button for the graph pages. */
export function LayoutToolbar({ layout }: { layout: L }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-600 shadow-sm">
      {layout.saving === "saving" && (
        <span className="flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" /> 配置を保存中…
        </span>
      )}
      {layout.saving === "saved" && (
        <span className="flex items-center gap-1 text-emerald-700">
          <Check size={11} /> 配置を保存しました
        </span>
      )}
      {layout.saving === "error" && (
        <span className="flex items-center gap-1 text-rose-700">
          <TriangleAlert size={11} /> 保存に失敗
        </span>
      )}
      {layout.saving === "idle" && <span className="text-slate-400">{layout.hasCustom ? "ノードをドラッグで移動（自動保存）" : "ノードをドラッグで移動できます"}</span>}
      <button
        type="button"
        onClick={() => {
          if (!layout.hasCustom || window.confirm("保存した配置を破棄して自動レイアウトに戻しますか？")) void layout.reset();
        }}
        disabled={!layout.hasCustom || layout.saving === "saving"}
        className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
        title="自動レイアウトに戻す"
      >
        <LayoutGrid size={11} /> 配置をリセット
      </button>
    </div>
  );
}
