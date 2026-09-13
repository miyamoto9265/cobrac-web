import { describe, expect, it } from "vitest";
import { EMPTY_USAGE, addUsage, estimateCostUsd, formatTokens, formatUsd, resolvePricing } from "../src/pricing.js";

describe("pricing", () => {
  it("resolves exact and dated model ids", () => {
    expect(resolvePricing("gpt-5.3-codex")).toBeTruthy();
    expect(resolvePricing("gpt-5.4-2026-03-05")).toEqual(resolvePricing("gpt-5.4"));
    expect(resolvePricing("totally-unknown")).toBeNull();
    expect(resolvePricing(null)).toBeNull();
  });

  it("estimates cost with cached-input discount", () => {
    // gpt-5: $1.25 in, $0.125 cached, $10 out per 1M
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000, reasoningOutputTokens: 50_000 };
    // 600k * 1.25 + 400k * 0.125 + 100k * 10 = 0.75 + 0.05 + 1.0
    expect(estimateCostUsd("gpt-5", usage)).toBeCloseTo(1.8, 6);
    expect(estimateCostUsd("nope", usage)).toBeNull();
    expect(estimateCostUsd("gpt-5", EMPTY_USAGE)).toBe(0);
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
