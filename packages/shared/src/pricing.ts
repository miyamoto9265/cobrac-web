/**
 * Token usage and OpenAI price table.
 *
 * Prices are USD per 1M tokens. They are a snapshot maintained by hand; when a model is missing
 * the UI shows the tokens but no cost. Update PRICING_AS_OF when editing.
 */

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };

export function addUsage(a: TokenUsage | undefined | null, b: TokenUsage | undefined | null): TokenUsage {
  const x = a ?? EMPTY_USAGE;
  const y = b ?? EMPTY_USAGE;
  return {
    inputTokens: x.inputTokens + y.inputTokens,
    cachedInputTokens: x.cachedInputTokens + y.cachedInputTokens,
    outputTokens: x.outputTokens + y.outputTokens,
    reasoningOutputTokens: x.reasoningOutputTokens + y.reasoningOutputTokens,
  };
}

export interface ModelPrice {
  /** USD per 1M non-cached input tokens */
  input: number;
  /** USD per 1M cached input tokens (null = same as input) */
  cachedInput: number | null;
  /** USD per 1M output tokens (reasoning tokens are billed as output) */
  output: number;
}

/** Model used when neither the project, the user nor the deployment picks one. */
export const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";

export const PRICING_AS_OF = "2026-09-13";

export const PRICING: Record<string, ModelPrice> = {
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-pro": { input: 15, cachedInput: null, output: 120 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex-max": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.2-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.2-pro": { input: 21, cachedInput: null, output: 168 },
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.4-pro": { input: 30, cachedInput: null, output: 180 },
};

/** Strip a dated snapshot suffix and look up the price; returns null when unknown. */
export function resolvePricing(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  if (PRICING[model]) return PRICING[model];
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return PRICING[base] ?? null;
}

/** Estimated cost in USD, or null when the model has no price entry. */
export function estimateCostUsd(model: string | null | undefined, usage: TokenUsage | null | undefined): number | null {
  const p = resolvePricing(model);
  if (!p || !usage) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const cachedRate = p.cachedInput ?? p.input;
  const cost = (uncached * p.input + usage.cachedInputTokens * cachedRate + usage.outputTokens * p.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function formatUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
