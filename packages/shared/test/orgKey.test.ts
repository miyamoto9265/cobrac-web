import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT, DEFAULT_KEY_ENCRYPTION_CONTEXT, ORG_TIER1_MODELS, allowedDefaultModel, canRunJobs, keySourceOf, modelPolicyOf, orgTierAllows, policyAllows, sourceForModel } from "../src/orgKey.js";
import { CLAUDE_MODELS } from "../src/provider.js";

const access = (tier: 1 | 2) => ({ tier, approvedAt: "2026-09-01T00:00:00.000Z", approvedBy: "admin" });

describe("default API key policy", () => {
  it("defines Tier 1 as the low-cost models (two luna models and Claude Haiku) and Tier 2 as every model", () => {
    expect([...ORG_TIER1_MODELS].sort()).toEqual(["claude-haiku-5-5", "gpt-5.6-luna", "gpt-6-luna"]);
    expect(orgTierAllows(1, "claude-haiku-5-5")).toBe(true);
    expect(orgTierAllows(1, "claude-opus-5-5")).toBe(false);
    expect(orgTierAllows(1, "gpt-6-luna")).toBe(true);
    expect(orgTierAllows(1, "gpt-5.6-luna")).toBe(true);
    for (const m of ["gpt-6-sol", "gpt-6-astra", "gpt-5.6", "gpt-5.6-terra", "gpt-6-luna-2026-09-01"]) expect(orgTierAllows(1, m)).toBe(false);
    expect(orgTierAllows(2, "gpt-6-astra")).toBe(true);
  });

  it("prefers the user's own key and needs approval plus a registered default key", () => {
    expect(keySourceOf({ apiKeyRegistered: true, orgAccess: access(1) }, true)).toBe("own");
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: access(1) }, true)).toBe("org");
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: access(1) }, false)).toBeNull();
    expect(keySourceOf({ apiKeyRegistered: false, orgAccess: null }, true)).toBeNull();
    expect(keySourceOf({ apiKeyRegistered: false }, true)).toBeNull();
  });

  it("restricts models only for Tier 1 on the default key", () => {
    const noClaude = { source: null, allowed: [] };
    expect(modelPolicyOf({ apiKeyRegistered: true, orgAccess: access(1) }, true)).toEqual({ source: "own", tier: null, allowed: null, claude: noClaude });
    expect(modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(2) }, true)).toEqual({ source: "org", tier: 2, allowed: null, claude: noClaude });
    const t1 = modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(1) }, true);
    expect(t1).toMatchObject({ source: "org", tier: 1 });
    expect(policyAllows(t1, "gpt-6-sol")).toBe(false);
    expect(allowedDefaultModel(t1, "gpt-6-sol")).toBe("gpt-6-luna");
    expect(allowedDefaultModel(t1, "gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });

  it("encrypts the default key under a context no user's key shares", () => {
    expect(DEFAULT_KEY_ENCRYPTION_CONTEXT).toEqual({ purpose: "openai-api-key", scope: "default" });
    expect("userId" in DEFAULT_KEY_ENCRYPTION_CONTEXT).toBe(false);
    expect(DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT).toEqual({ purpose: "anthropic-api-key", scope: "default" });
  });

  it("allows the Claude models only with an Anthropic key (own, or the default one within the tier)", () => {
    const openAiOnly = modelPolicyOf({ apiKeyRegistered: true, orgAccess: null }, false, true);
    expect(policyAllows(openAiOnly, "claude-haiku-5-5")).toBe(false);
    expect(policyAllows(openAiOnly, "gpt-6-sol")).toBe(true);

    const own = modelPolicyOf({ apiKeyRegistered: true, anthropicKeyRegistered: true, orgAccess: null }, false);
    expect(own.claude).toEqual({ source: "own", allowed: CLAUDE_MODELS });
    for (const m of CLAUDE_MODELS) expect(policyAllows(own, m)).toBe(true);
    expect(policyAllows(own, "claude-opus-4-8")).toBe(false);
    expect(sourceForModel(own, "claude-opus-5-5")).toBe("own");

    // one approval covers both default keys; Tier 1 gets Claude Haiku only
    const t1 = modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(1) }, true, true);
    expect(t1.allowed).toEqual(["gpt-6-luna", "gpt-5.6-luna"]);
    expect(t1.claude).toEqual({ source: "org", allowed: ["claude-haiku-5-5"] });
    expect(policyAllows(t1, "claude-sonnet-5-5")).toBe(false);
    expect(allowedDefaultModel(t1, "claude-sonnet-5-5")).toBe("gpt-6-luna");
    const t2 = modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(2) }, true, true);
    expect(t2.claude.allowed).toEqual(CLAUDE_MODELS);
    // no default Anthropic key: no Claude model
    expect(modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(2) }, true, false).claude.source).toBeNull();
  });

  it("runs a user with only an Anthropic key on the Claude models", () => {
    const p = modelPolicyOf({ apiKeyRegistered: false, anthropicKeyRegistered: true, orgAccess: null }, false);
    expect(canRunJobs(p)).toBe(true);
    expect(policyAllows(p, "gpt-6-luna")).toBe(false);
    expect(allowedDefaultModel(p, "gpt-6-luna")).toBe("claude-haiku-5-5");
    expect(sourceForModel(p, "claude-haiku-5-5")).toBe("own");
    // no key at all: nothing runs, every OpenAI model is still listed as before
    const none = modelPolicyOf({ apiKeyRegistered: false, orgAccess: null }, false);
    expect(canRunJobs(none)).toBe(false);
    expect(policyAllows(none, "gpt-6-sol")).toBe(true);
  });
});
