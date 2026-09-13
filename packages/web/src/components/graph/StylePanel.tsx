import { RotateCcw, X } from "lucide-react";
import type { ArrowHead, EdgeLineType, EdgeSign, EdgeStyle, NodeStyle } from "@cobrac/shared";
import { ARROW_HEADS, EDGE_LINE_TYPES } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import type { ResolvedEdgeStyle } from "./StyledEdge";

export const PALETTE = ["#475569", "#94a3b8", "#2563eb", "#0ea5e9", "#059669", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#0f172a"];
const NODE_PALETTE = ["#dbeafe", "#dcfce7", "#fee2e2", "#fef3c7", "#e9d5ff", "#fde68a", "#f1f5f9", "#ffffff", "#bae6fd", "#bbf7d0", "#fecaca", "#fed7aa"];

const sel = "w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-400";
const lbl = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500";

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className={`h-4 w-4 rounded border ${value.toLowerCase() === c ? "ring-2 ring-blue-500 ring-offset-1" : "border-black/10"}`}
          style={{ background: c }}
          title={c}
        />
      ))}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#475569"} onChange={(e) => onPick(e.target.value)} className="h-5 w-6 cursor-pointer rounded border border-slate-300 bg-white p-0" title={t("edge.anyColor")} />
    </div>
  );
}

function ArrowPreview({ type, color }: { type: ArrowHead; color: string }) {
  const shape = (() => {
    switch (type) {
      case "arrow":
        return <path d="M14,3 L24,8 L14,13 Z" fill={color} />;
      case "arrowOpen":
        return <path d="M14,3 L24,8 L14,13" fill="none" stroke={color} strokeWidth={1.6} />;
      case "square":
        return <rect x={15} y={3.5} width={9} height={9} fill={color} />;
      case "circle":
        return <circle cx={19.5} cy={8} r={4.5} fill={color} />;
      case "diamond":
        return <path d="M19,3 L24,8 L19,13 L14,8 Z" fill={color} />;
      case "bar":
        return <path d="M22,3 L22,13" stroke={color} strokeWidth={2.2} />;
      default:
        return null;
    }
  })();
  return (
    <svg width={26} height={16} className="shrink-0">
      <path d={`M0,8 L${type === "none" ? 24 : 15},8`} stroke={color} strokeWidth={1.6} />
      {shape}
    </svg>
  );
}

export interface EdgePanelProps {
  edgeId: string;
  sign?: EdgeSign;
  resolved: ResolvedEdgeStyle;
  override: EdgeStyle | undefined;
  hasLabel: boolean;
  showLabel: boolean;
  sameSignCount: number;
  onChange: (patch: EdgeStyle) => void;
  onApplyToSameSign: (patch: EdgeStyle) => void;
  onReset: () => void;
  onClose: () => void;
}

export function EdgeStylePanel({ edgeId, sign, resolved, override, hasLabel, showLabel, sameSignCount, onChange, onApplyToSameSign, onReset, onClose }: EdgePanelProps) {
  const t = useT();
  const editable = resolved.lineType === "orthogonal" || resolved.lineType === "polyline";
  const visual: EdgeStyle = {
    lineType: resolved.lineType,
    color: resolved.color,
    width: resolved.width,
    dashed: resolved.dashed,
    markerStart: resolved.markerStart,
    markerEnd: resolved.markerEnd,
    rounded: resolved.rounded,
  };
  return (
    <div className="w-64 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("edge.style")}</div>
          <div className="truncate font-mono text-[11px] font-semibold" title={edgeId}>
            {edgeId}
          </div>
          {sign && <div className="text-[10px] text-slate-500">{t("edge.class", { sign: t(`sign.${sign}` as MessageKey) })}</div>}
        </div>
        <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t("close")}>
          <X size={14} />
        </button>
      </div>

      <label className="mb-2 block">
        <span className={lbl}>{t("edge.lineType")}</span>
        <select value={resolved.lineType} onChange={(e) => onChange({ lineType: e.target.value as EdgeLineType })} className={sel}>
          {EDGE_LINE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`edge.line.${type}` as MessageKey)}
            </option>
          ))}
        </select>
        {editable && <span className="mt-0.5 block text-[10px] text-slate-500">{t("edge.bendHelp")}</span>}
      </label>

      <div className="mb-2">
        <span className={lbl}>{t("edge.color")}</span>
        <Swatches colors={PALETTE} value={resolved.color} onPick={(c) => onChange({ color: c })} />
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={lbl}>{t("edge.width")}</span>
          <input type="range" min={0.5} max={8} step={0.5} value={resolved.width} onChange={(e) => onChange({ width: Number(e.target.value) })} className="w-full" />
          <span className="font-mono text-[10px] text-slate-500">{resolved.width}px</span>
        </label>
        <div className="block">
          <span className={lbl}>{t("edge.stroke")}</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={resolved.dashed} onChange={(e) => onChange({ dashed: e.target.checked })} /> {t("edge.dashed")}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={resolved.rounded} onChange={(e) => onChange({ rounded: e.target.checked })} /> {t("edge.rounded")}
          </label>
          {hasLabel && (
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showLabel} onChange={(e) => onChange({ showLabel: e.target.checked })} /> {t("edge.showLabel")}
            </label>
          )}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        {(["markerStart", "markerEnd"] as const).map((k) => (
          <label key={k} className="block">
            <span className={lbl}>{k === "markerStart" ? t("edge.start") : t("edge.end")}</span>
            <div className="flex items-center gap-1">
              <ArrowPreview type={resolved[k]} color={resolved.color} />
              <select value={resolved[k]} onChange={(e) => onChange({ [k]: e.target.value as ArrowHead })} className={sel}>
                {ARROW_HEADS.map((head) => (
                  <option key={head} value={head}>
                    {t(`edge.arrow.${head}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2">
        {(override?.waypoints?.length ?? 0) > 0 && (
          <button onClick={() => onChange({ waypoints: undefined })} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-50">
            {t("edge.clearBends")}
          </button>
        )}
        {(override?.sourceHandle || override?.targetHandle) && (
          <button onClick={() => onChange({ sourceHandle: undefined, targetHandle: undefined })} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-50">
            {t("edge.autoAttach")}
          </button>
        )}
        {sameSignCount > 1 && (
          <button onClick={() => onApplyToSameSign(visual)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-50" title={t("edge.applySameTip")}>
            {t("edge.applySame", { n: sameSignCount })}
          </button>
        )}
        <button onClick={onReset} disabled={!override} className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-40">
          <RotateCcw size={11} /> {t("edge.reset")}
        </button>
      </div>
      <div className="mt-2 text-[10px] text-slate-400">{t("edge.attachHelp")}</div>
    </div>
  );
}

export interface NodePanelProps {
  nodeId: string;
  fill: string;
  border: string;
  override: NodeStyle | undefined;
  onChange: (patch: NodeStyle) => void;
  onReset: () => void;
  onClose: () => void;
}

export function NodeStylePanel({ nodeId, fill, border, override, onChange, onReset, onClose }: NodePanelProps) {
  const t = useT();
  return (
    <div className="w-64 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("node.style")}</div>
          <div className="truncate font-mono text-[11px] font-semibold" title={nodeId}>
            {nodeId}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t("close")}>
          <X size={14} />
        </button>
      </div>
      <div className="mb-2">
        <span className={lbl}>{t("node.fill")}</span>
        <Swatches colors={NODE_PALETTE} value={fill} onPick={(c) => onChange({ color: c })} />
      </div>
      <div className="mb-2">
        <span className={lbl}>{t("node.border")}</span>
        <Swatches colors={PALETTE} value={border} onPick={(c) => onChange({ border: c })} />
      </div>
      <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2">
        {(override?.width || override?.height) && (
          <button onClick={() => onChange({ width: undefined, height: undefined })} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-50">
            {t("node.resetSize")}
          </button>
        )}
        <button onClick={onReset} disabled={!override} className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-40">
          <RotateCcw size={11} /> {t("node.reset")}
        </button>
      </div>
      <div className="mt-2 text-[10px] text-slate-400">{t("node.resizeHelp")}</div>
    </div>
  );
}
