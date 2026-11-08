import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT, DEFAULT_DEEPSEEK_KEY_ENCRYPTION_CONTEXT, DEFAULT_KEY_ENCRYPTION_CONTEXT, allowedDefaultModel, canRunJobs, isOrgApproved, keySourceOf, modelPolicyOf, policyAllows, sourceForModel } from "../src/orgKey.js";
import { CLAUDE_MODELS, SMALL_FAST_MODEL, deprecatedLast, isDeprecatedModel } from "../src/provider.js";

const access = { approvedAt: "2026-09-01T00:00:00.000Z", approvedBy: "admin" };
/** An approval stored while tiers existed */
const legacy = (tier: 1 | 2) => ({ ...access, tier });

describe("default API key policy", () => {
  it("marks the luna models, Claude Haiku and every DeepSeek model as deprecated, and lists them last", () => {
    for (const m of ["gpt-6-luna", "gpt-5.6-luna", "gpt-6-luna-2026-09-01", "claude-haiku-5-5", "deepseek-flash", "deepseek-v4-pro"]) expect(isDeprecatedModel(m)).toBe(true);
    for (const m of ["gpt-6-sol", "gpt-6-astra", "gpt-5.6", "gpt-5.6-terra", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", null]) expect(isDeprecatedModel(m)).toBe(false);
    expect(deprecatedLast(["gpt-6-luna", "gpt-6-sol", "claude-haiku-5-5", "claude-opus-5-5", "deepseek-flash"])).toEqual(["gpt-6-sol", "claude-opus-5-5", "gpt-6-luna", "claude-haiku-5-5", "deepseek-flash"]);
    // Claude Code's small background calls keep the low-cost model of each provider
    expect(SMALL_FAST_MODEL).toEqual({ anthropic: "claude-haiku-5-5", deepseek: "deepseek-flash" });
  });

  it("treats every approval as one, legacy tiers included", () => {
    expect(isOrgApproved(access)).toBe(true);
    expect(isOrgApproved(legacy(1))).toBe(true);
    expect(isOrgApproved(null)).toBe(false);
    expect(isOrgApproved(undefined)).toBe(false);
  });

  it("prefers the user's own key and needs approval plus a registered default key", () => {
    expect(keySourceOf({ apiKeyRegistered: true, orgAccess: access }, true)).toBe("own");
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: access }, true)).toBe("org");
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: legacy(1) }, true)).toBe("org");
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: access }, false)).toBeNull();
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: null }, true)).toBeNull();
    expect(keySourceOf({ apiKeyRegistered: false }, true)).toBeNull();
  });

  it("allows every model on the default key (a legacy Tier 1 approval too)", () => {
    const noClaude = { source: null, allowed: [] };
    expect(modelPolicyOf({ apiKeyRegistered: true, orgAccess: access }, { openai: true })).toEqual({ source: "own", claude: noClaude, deepseek: noClaude });
    expect(modelPolicyOf({ apiKeyRegistered: false, orgAccess: access }, { openai: true })).toEqual({ source: "org", claude: noClaude, deepseek: noClaude });
    const t1 = modelPolicyOf({ apiKeyRegistered: false, orgAccess: legacy(1) }, { openai: true });
    expect(t1).toMatchObject({ source: "org" });
    expect(policyAllows(t1, "gpt-6-sol")).toBe(true);
    expect(policyAllows(t1, "gpt-6-astra")).toBe(true);
    // an app default the user cannot run falls back to gpt-6-sol, never to a deprecated model
    expect(allowedDefaultModel(t1, "claude-sonnet-5-5")).toBe("gpt-6-sol");
  });

  it("encrypts the default key under a context no user's key shares", () => {
    expect(DEFAULT_KEY_ENCRYPTION_CONTEXT).toEqual({ purpose: "openai-api-key", scope: "default" });
    expect("userId" in DEFAULT_KEY_ENCRYPTION_CONTEXT).toBe(false);
    expect(DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT).toEqual({ purpose: "anthropic-api-key", scope: "default" });
    expect(DEFAULT_DEEPSEEK_KEY_ENCRYPTION_CONTEXT).toEqual({ purpose: "deepseek-api-key", scope: "default" });
  });

  it("allows the Claude models only with an Anthropic key (own, or the default one)", () => {
    const openAiOnly = modelPolicyOf({ apiKeyRegistered: true, orgAccess: null }, { openai: false, anthropic: true });
    expect(policyAllows(openAiOnly, "claude-haiku-5-5")).toBe(false);
    expect(policyAllows(openAiOnly, "gpt-6-sol")).toBe(true);

    const own = modelPolicyOf({ apiKeyRegistered: true, anthropicKeyRegistered: true, orgAccess: null }, { openai: false });
    expect(own.claude).toEqual({ source: "own", allowed: CLAUDE_MODELS });
    for (const m of CLAUDE_MODELS) expect(policyAllows(own, m)).toBe(true);
    expect(policyAllows(own, "claude-opus-4-8")).toBe(false);
    expect(sourceForModel(own, "claude-opus-5-5")).toBe("own");

    // one approval covers both default keys and every model
    const org = modelPolicyOf({ apiKeyRegistered: false, orgAccess: legacy(1) }, { openai: true, anthropic: true });
    expect(org.claude).toEqual({ source: "org", allowed: CLAUDE_MODELS });
    expect(policyAllows(org, "claude-sonnet-5-5")).toBe(true);
    expect(allowedDefaultModel(org, "claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    // no default Anthropic key: no Claude model
    expect(modelPolicyOf({ apiKeyRegistered: false, orgAccess: access }, { openai: true, anthropic: false }).claude.source).toBeNull();
  });

  it("runs a user with only an Anthropic key on the Claude models", () => {
    const p = modelPolicyOf({ apiKeyRegistered: false, anthropicKeyRegistered: true, orgAccess: null }, { openai: false });
    expect(canRunJobs(p)).toBe(true);
    expect(policyAllows(p, "gpt-6-luna")).toBe(false);
    expect(allowedDefaultModel(p, "gpt-6-sol")).toBe("claude-sonnet-5-5");
    expect(sourceForModel(p, "claude-haiku-5-5")).toBe("own");
    // no key at all: nothing runs, every OpenAI model is still listed as before
    const none = modelPolicyOf({ apiKeyRegistered: false, orgAccess: null }, { openai: false });
    expect(canRunJobs(none)).toBe(false);
    expect(policyAllows(none, "gpt-6-sol")).toBe(true);
  });

  it("allows DeepSeek V4.1 Flash only with a DeepSeek key (own, or the default one)", () => {
    const openAiOnly = modelPolicyOf({ apiKeyRegistered: true, orgAccess: null }, { openai: false, deepseek: true });
    expect(policyAllows(openAiOnly, "deepseek-flash")).toBe(false);

    const own = modelPolicyOf({ apiKeyRegistered: false, deepseekKeyRegistered: true, orgAccess: null }, { openai: false });
    expect(own.deepseek).toEqual({ source: "own", allowed: ["deepseek-flash"] });
    expect(sourceForModel(own, "deepseek-flash")).toBe("own");
    expect(canRunJobs(own)).toBe(true);
    // a user with only a DeepSeek key runs on it (deprecated, but the only model they can run)
    expect(policyAllows(own, "gpt-6-luna")).toBe(false);
    expect(allowedDefaultModel(own, "gpt-6-luna")).toBe("deepseek-flash");

    const org = modelPolicyOf({ apiKeyRegistered: false, orgAccess: access }, { openai: true, anthropic: true, deepseek: true });
    expect(org.deepseek).toEqual({ source: "org", allowed: ["deepseek-flash"] });
    expect(sourceForModel(org, "deepseek-flash")).toBe("org");
    expect(modelPolicyOf({ apiKeyRegistered: false, orgAccess: access }, { openai: true }).deepseek.source).toBeNull();
    // with a Claude and a DeepSeek key but no OpenAI key, the fallback is Claude Sonnet, not DeepSeek
    const both = modelPolicyOf({ apiKeyRegistered: false, anthropicKeyRegistered: true, deepseekKeyRegistered: true, orgAccess: null }, { openai: false });
    expect(allowedDefaultModel(both, "gpt-6-sol")).toBe("claude-sonnet-5-5");
  });
});
