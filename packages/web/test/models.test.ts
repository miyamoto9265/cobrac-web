import { describe, expect, it } from "vitest";
import { usableDefaultModel } from "../src/lib/models";

describe("usableDefaultModel", () => {
  it("keeps a saved default the user can run, deprecated ones too", () => {
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol" })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "gpt-6-astra", keySource: "org" })).toBe("gpt-6-astra");
    expect(usableDefaultModel({ defaultModel: "gpt-5.6-luna", keySource: "org" })).toBe("gpt-5.6-luna");
    expect(usableDefaultModel({ defaultModel: null })).toBeNull();
    expect(usableDefaultModel(null)).toBeNull();
  });

  it("checks the key of the model's own provider", () => {
    // own OpenAI key, Claude through the default key: every Claude model
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", keySource: "own", claudeKeySource: "org" })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "claude-opus-5-5", keySource: "own", claudeKeySource: "org" })).toBe("claude-opus-5-5");
    // no key for the model's provider
    expect(usableDefaultModel({ defaultModel: "claude-opus-5-5", keySource: "own", claudeKeySource: null })).toBeNull();
    expect(usableDefaultModel({ defaultModel: "claude-opus-5-5", keySource: null, claudeKeySource: "own" })).toBe("claude-opus-5-5");
    // DeepSeek V4.1 Flash runs on the DeepSeek key
    expect(usableDefaultModel({ defaultModel: "deepseek-flash", keySource: "org", claudeKeySource: null, deepseekKeySource: "org" })).toBe("deepseek-flash");
    expect(usableDefaultModel({ defaultModel: "deepseek-flash", keySource: "own", claudeKeySource: "own", deepseekKeySource: null })).toBeNull();
  });
});
