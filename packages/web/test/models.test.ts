import { describe, expect, it } from "vitest";
import { usableDefaultModel } from "../src/lib/models";

describe("usableDefaultModel", () => {
  it("keeps a saved default the user can run and hides one the default API key does not allow", () => {
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: null })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: 2 })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "gpt-5.6-luna", orgTier: 1 })).toBe("gpt-5.6-luna");
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: 1 })).toBeNull();
    expect(usableDefaultModel({ defaultModel: null, orgTier: 1 })).toBeNull();
    expect(usableDefaultModel(null)).toBeNull();
  });

  it("checks the tier only against the model's own key", () => {
    // own OpenAI key, Claude through the default key
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: 1, keySource: "own", claudeKeySource: "org" })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "claude-opus-5-5", orgTier: 1, keySource: "own", claudeKeySource: "org" })).toBeNull();
    expect(usableDefaultModel({ defaultModel: "claude-haiku-5-5", orgTier: 1, keySource: "own", claudeKeySource: "org" })).toBe("claude-haiku-5-5");
    // no key for the model's provider
    expect(usableDefaultModel({ defaultModel: "claude-opus-5-5", orgTier: null, keySource: "own", claudeKeySource: null })).toBeNull();
    expect(usableDefaultModel({ defaultModel: "claude-opus-5-5", orgTier: null, keySource: null, claudeKeySource: "own" })).toBe("claude-opus-5-5");
  });
});
