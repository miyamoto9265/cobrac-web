import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { EdgeSign } from "@cobrac/shared";
import { useT } from "../../i18n";
import { edgeColor, nodeFill } from "../../lib/graphTheme";
import { CANVAS } from "../../lib/graphTheme";
import { useDark } from "../../lib/theme";
import { HypothesisMark, hypothesisDash } from "../hypothesis/HypothesisMark";

export interface LegendItem {
  color: string;
  /** node stripe colour */
  accent?: string;
  label: string;
  kind?: "node" | "edge" | "group";
  sign?: EdgeSign;
  shape?: "rect" | "pill";
  /**
   * Hypothesis mode: `edge` a hypothesis connection (dotted, "H"), `direction` one whose direction is the hypothesis
   * (hollow arrowhead), `node` a hypothesis UC (dotted border, "H"), `mark` the "H" of a GN that depends on hypotheses
   */
  hypothesis?: "edge" | "direction" | "node" | "mark";
}

export function EdgeGlyph({ color: raw, sign, dotted, hollow }: { color: string; sign?: EdgeSign; dotted?: boolean; hollow?: boolean }) {
  const dark = useDark();
  const color = edgeColor(raw, dark);
  const fill = hollow ? CANVAS[dark ? "dark" : "light"].bg : color;
  const stroke = hollow ? { stroke: color, strokeWidth: 1.3 } : {};
  if (!dotted && !hollow)
    return (
      <svg width={26} height={12} className="shrink-0" aria-hidden>
        <path d="M0,6 L16,6" stroke={color} strokeWidth={1.8} strokeDasharray={sign === "modulatory" ? "3 2" : undefined} />
        {sign === "inhibitory" ? <rect x={16} y={1.5} width={9} height={9} fill={color} /> : sign === "modulatory" ? <circle cx={21} cy={6} r={4.5} fill={color} /> : <path d="M16,1 L26,6 L16,11 Z" fill={color} />}
      </svg>
    );
  return (
    <svg width={26} height={12} className="shrink-0" aria-hidden>
      <path d="M1,6 L16,6" stroke={color} strokeWidth={1.8} strokeLinecap={dotted ? "round" : undefined} strokeDasharray={dotted ? hypothesisDash(1.2) : sign === "modulatory" ? "3 2" : undefined} />
      {sign === "inhibitory" ? (
        <rect x={16.5} y={2} width={8} height={8} fill={fill} {...stroke} />
      ) : sign === "modulatory" ? (
        <circle cx={21} cy={6} r={4} fill={fill} {...stroke} />
      ) : (
        <path d="M16.5,1.5 L25,6 L16.5,10.5 Z" fill={fill} {...stroke} />
      )}
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
              {l.hypothesis === "edge" || l.hypothesis === "direction" ? (
                <span className="relative inline-flex shrink-0 items-center">
                  <EdgeGlyph color={l.color} sign={l.sign} dotted hollow={l.hypothesis === "direction"} />
                  {l.hypothesis === "edge" && <HypothesisMark size={11} className="absolute left-[3px]" />}
                </span>
              ) : l.hypothesis === "node" ? (
                <span aria-hidden className="relative inline-flex h-3.5 w-6 shrink-0 items-center justify-end rounded-sm border-[1.5px] border-dotted border-amber-700 pr-px">
                  <HypothesisMark size={10} />
                </span>
              ) : l.hypothesis === "mark" ? (
                <span className="inline-flex w-6 shrink-0 justify-center">
                  <HypothesisMark size={13} />
                </span>
              ) : l.kind === "edge" ? (
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
