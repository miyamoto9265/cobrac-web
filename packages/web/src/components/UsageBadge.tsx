import { Coins } from "lucide-react";
import type { TokenUsage } from "@cobrac/shared";
import { formatTokens, formatUsd } from "@cobrac/shared";

/** Compact "in / out tokens · $cost" badge used in headers and tables. */
export function UsageBadge({ usage, costUsd, model, title }: { usage?: TokenUsage | null; costUsd?: number | null; model?: string | null; title?: string }) {
  if (!usage || usage.inputTokens + usage.outputTokens === 0) return <span className="text-xs text-slate-400">—</span>;
  const unpriced = costUsd === null || costUsd === undefined;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700"
      title={
        title ??
        `入力 ${usage.inputTokens.toLocaleString()}（キャッシュ ${usage.cachedInputTokens.toLocaleString()}）\n出力 ${usage.outputTokens.toLocaleString()}（推論 ${usage.reasoningOutputTokens.toLocaleString()}）${model ? `\nモデル ${model}` : ""}${unpriced ? "\n単価未登録のため料金は推定できません" : ""}`
      }
    >
      <Coins size={11} className="text-amber-600" />
      <span>
        in {formatTokens(usage.inputTokens)} / out {formatTokens(usage.outputTokens)}
      </span>
      <span className={unpriced ? "text-slate-400" : "font-semibold text-emerald-700"}>{unpriced ? "$—" : formatUsd(costUsd)}</span>
    </span>
  );
}
