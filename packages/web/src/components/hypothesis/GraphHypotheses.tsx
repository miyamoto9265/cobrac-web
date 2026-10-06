/**
 * Hypothesis mode, stage 3: the graph viewer's pieces for hypotheses: the legend entries, the toolbar switch "Hide
 * hypotheses" (the evidence-only graph) and the banner shown while they are hidden.
 */
import { EyeOff, X } from "lucide-react";
import type { FrgGraph, HcdGraph } from "@cobrac/shared";
import { isDirectionOnly } from "@cobrac/shared";
import { useT } from "../../i18n";
import { toolBtn } from "../graph/GraphToolbar";
import type { LegendItem } from "../graph/Legend";
import { SIGN_DEFAULTS } from "../graph/StyledEdge";

type T = ReturnType<typeof useT>;

/** Legend entries for the kinds of hypothesis marks the HCD graph shows (none without hypotheses). */
export function hypothesisLegend(t: T, g: Pick<HcdGraph, "nodes" | "edges"> | null): LegendItem[] {
  if (!g) return [];
  const edges = g.edges.filter((e) => e.hypothesis);
  const out: LegendItem[] = [];
  if (edges.some((e) => !isDirectionOnly(e.hypothesis))) out.push({ color: SIGN_DEFAULTS.excitatory.color, label: t("hyp.legendEdge"), kind: "edge", sign: "excitatory", hypothesis: "edge" });
  if (edges.some((e) => isDirectionOnly(e.hypothesis))) out.push({ color: SIGN_DEFAULTS.excitatory.color, label: t("hyp.legendDirection"), kind: "edge", sign: "excitatory", hypothesis: "direction" });
  if (g.nodes.some((n) => n.hypothesis)) out.push({ color: "transparent", label: t("hyp.legendNode"), hypothesis: "node" });
  return out;
}

/** Legend entry of the FRG graph: GNs that depend on hypotheses. */
export function frgHypothesisLegend(t: T, g: Pick<FrgGraph, "nodes"> | null): LegendItem[] {
  return g?.nodes.some((n) => n.hypotheses?.length) ? [{ color: "transparent", label: t("hyp.legendGn"), hypothesis: "mark" }] : [];
}

export function HideHypothesesButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={t("hyp.hide")}
      data-testid="hide-hypotheses"
      className={`${toolBtn} ${active ? "!bg-amber-600 !text-white hover:!bg-amber-700" : ""}`}
    >
      <EyeOff size={15} aria-hidden />
      <span className="hidden whitespace-nowrap sm:inline">{t("hyp.hide")}</span>
      <span className="sr-only sm:hidden">{t("hyp.hide")}</span>
    </button>
  );
}

export function HypothesesHiddenBanner({ onShow }: { onShow: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/95 px-2.5 py-1 text-[11px] text-amber-900 shadow-sm" data-testid="hypotheses-hidden">
      <span className="min-w-0 truncate">{t("hyp.hiddenBanner")}</span>
      <button type="button" onClick={onShow} aria-label={t("close")} title={t("close")} className="rounded p-0.5 hover:bg-amber-100 coarse:p-2">
        <X size={12} />
      </button>
    </div>
  );
}
