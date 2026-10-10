import { describe, expect, it } from "vitest";
import { EMPTY_USAGE, addUsage, estimateCostUsd, formatTokens, formatUsd, resolvePricing } from "../src/pricing.js";

describe("pricing", () => {
  it("resolves exact and dated model ids", () => {
    expect(resolvePricing("gpt-5.6-sol")).toBeTruthy();
    expect(resolvePricing("gpt-5.6-sol-2026-09-01")).toEqual(resolvePricing("gpt-5.6-sol"));
    expect(resolvePricing("totally-unknown")).toBeNull();
    expect(resolvePricing(null)).toBeNull();
  });

  it("estimates cost with cached-input discount", () => {
    // gpt-5.6-sol: $4 in, $0.40 cached, $20 out per 1M
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000, reasoningOutputTokens: 50_000 };
    // 600k * 4 + 400k * 0.40 + 100k * 20 = 2.4 + 0.16 + 2.0
    expect(estimateCostUsd("gpt-5.6-sol", usage)).toBeCloseTo(4.56, 6);
    expect(estimateCostUsd("nope", usage)).toBeNull();
    expect(estimateCostUsd("gpt-5.4", usage)).toBeNull();
    expect(estimateCostUsd("gpt-5.6-sol", EMPTY_USAGE)).toBe(0);
  });

  it("prices the Claude models with cache reads and cache writes", () => {
    // claude-opus-5-5: $4 in, $0.20 cache read, $5 cache write, $20 out per 1M; input includes the cache reads and writes
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 500_000, cacheWriteTokens: 200_000, outputTokens: 100_000, reasoningOutputTokens: 0 };
    // 300k * 4 + 500k * 0.20 + 200k * 5 + 100k * 20 = 1.2 + 0.1 + 1.0 + 2.0
    expect(estimateCostUsd("claude-opus-5-5", usage)).toBeCloseTo(4.3, 6);
    for (const m of ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) expect(resolvePricing(m)?.cacheWrite).toBeCloseTo(resolvePricing(m)!.input * 1.25, 6);
    // OpenAI usage without cache writes is priced as before
    expect(addUsage(usage, usage).cacheWriteTokens).toBe(400_000);
    expect("cacheWriteTokens" in addUsage(EMPTY_USAGE, EMPTY_USAGE)).toBe(false);
  });

  it("adds usage and formats", () => {
    const a = addUsage(null, { inputTokens: 1, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 4 });
    const b = addUsage(a, a);
    expect(b).toEqual({ inputTokens: 2, cachedInputTokens: 4, outputTokens: 6, reasoningOutputTokens: 8 });
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(12.345)).toBe("$12.35");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(2_500_000)).toBe("2.50M");
  });
});
