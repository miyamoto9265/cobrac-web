/**
 * Token usage and the price table (OpenAI and Anthropic models).
 *
 * Prices are USD per 1M tokens. They are a snapshot maintained by hand; when a model is missing
 * the UI shows the tokens but no cost. Update PRICING_AS_OF when editing.
 */

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  /** Input tokens written to the prompt cache (Anthropic models; part of `inputTokens`, billed above the input rate). Absent = 0 */
  cacheWriteTokens?: number;
}

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };

export function addUsage(a: TokenUsage | undefined | null, b: TokenUsage | undefined | null): TokenUsage {
  const x = a ?? EMPTY_USAGE;
  const y = b ?? EMPTY_USAGE;
  const cacheWrite = (x.cacheWriteTokens ?? 0) + (y.cacheWriteTokens ?? 0);
  return {
    inputTokens: x.inputTokens + y.inputTokens,
    cachedInputTokens: x.cachedInputTokens + y.cachedInputTokens,
    outputTokens: x.outputTokens + y.outputTokens,
    reasoningOutputTokens: x.reasoningOutputTokens + y.reasoningOutputTokens,
    ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}),
  };
}

export interface ModelPrice {
  /** USD per 1M non-cached input tokens */
  input: number;
  /** USD per 1M cached input tokens (null = same as input) */
  cachedInput: number | null;
  /** USD per 1M output tokens (reasoning tokens are billed as output) */
  output: number;
  /** USD per 1M input tokens written to the prompt cache (Anthropic: 1.25x input; absent = same as input) */
  cacheWrite?: number;
}

/** Model used when neither the project, the user nor the deployment picks one. */
export const DEFAULT_CODEX_MODEL = "gpt-6-luna";

/**
 * Standard short-context rates (USD / 1M tokens) from https://developers.openai.com/api/docs/pricing and
 * https://platform.claude.com/docs/en/about-claude/pricing (cache writes: the 5-minute rate, 1.25x input). Claude Haiku
 * 5.5 costs 5x above a 100K-token prompt; the worker compacts the conversation before that (CLAUDE_AUTO_COMPACT_WINDOW).
 */
export const PRICING_AS_OF = "2026-10-10";

export const PRICING: Record<string, ModelPrice> = {
  // gpt-5.6 alias routes to Sol
  "gpt-5.6": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
  "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "claude-fable-5-1": { input: 10, cachedInput: 0.25, cacheWrite: 12.5, output: 50 },
  "claude-opus-5-5": { input: 4, cachedInput: 0.2, cacheWrite: 5, output: 20 },
  "claude-sonnet-5-5": { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 10 },
  "claude-haiku-5-5": { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
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
  const written = usage.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens - written);
  const cachedRate = p.cachedInput ?? p.input;
  const cost = (uncached * p.input + usage.cachedInputTokens * cachedRate + written * (p.cacheWrite ?? p.input) + usage.outputTokens * p.output) / 1_000_000;
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
