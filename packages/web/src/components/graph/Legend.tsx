import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { EdgeSign } from "@cobrac/shared";
import { useT } from "../../i18n";
import { edgeColor, nodeFill } from "../../lib/graphTheme";
import { useDark } from "../../lib/theme";

export interface LegendItem {
  color: string;
  /** node stripe colour */
  accent?: string;
  label: string;
  kind?: "node" | "edge" | "group";
  sign?: EdgeSign;
  shape?: "rect" | "pill";
}

export function EdgeGlyph({ color: raw, sign }: { color: string; sign?: EdgeSign }) {
  const color = edgeColor(raw, useDark());
  return (
    <svg width={26} height={12} className="shrink-0" aria-hidden>
      <path d="M0,6 L16,6" stroke={color} strokeWidth={1.8} strokeDasharray={sign === "modulatory" ? "3 2" : undefined} />
      {sign === "inhibitory" ? <rect x={16} y={1.5} width={9} height={9} fill={color} /> : sign === "modulatory" ? <circle cx={21} cy={6} r={4.5} fill={color} /> : <path d="M16,1 L26,6 L16,11 Z" fill={color} />}
    </svg>
  );
}

export function NodeGlyph({ color: raw, accent, shape }: { color: string; accent?: string; shape?: "rect" | "pill" }) {
  const color = nodeFill(raw, useDark());
  return (
    <span aria-hidden className={`relative inline-block h-3.5 w-6 shrink-0 overflow-hidden border border-black/15 dark:border-white/20 ${shape === "pill" ? "rounded-full" : "rounded-sm"}`} style={{ background: color }}>
      {accent && shape !== "pill" && <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} />}
    </span>
  );
}

export function Legend({ items, defaultOpen }: { items: LegendItem[]; defaultOpen: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  return (
    <div className="max-w-[16rem] rounded-lg border border-slate-200 bg-white/95 text-[11px] shadow-sm backdrop-blur">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 font-semibold text-slate-600 coarse:min-h-11">
        {t("graph.legend")}
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>
      {open && (
        <ul className="space-y-1 px-2.5 pb-2">
          {items.map((l) => (
            <li key={l.label} className="flex items-center gap-2 text-slate-700">
              {l.kind === "edge" ? (
                <EdgeGlyph color={l.color} sign={l.sign} />
              ) : l.kind === "group" ? (
                <span aria-hidden className="inline-block h-3.5 w-6 shrink-0 rounded border border-dashed border-slate-400 bg-slate-400/10" />
              ) : (
                <NodeGlyph color={l.color} accent={l.accent} shape={l.shape} />
              )}
              <span>{l.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
