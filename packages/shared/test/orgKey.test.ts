import { describe, expect, it } from "vitest";
import { DEFAULT_KEY_ENCRYPTION_CONTEXT, ORG_TIER1_MODELS, allowedDefaultModel, keySourceOf, modelPolicyOf, orgTierAllows, policyAllows } from "../src/orgKey.js";

const access = (tier: 1 | 2) => ({ tier, approvedAt: "2026-09-01T00:00:00.000Z", approvedBy: "admin" });

describe("default API key policy", () => {
  it("defines Tier 1 as the two luna models and Tier 2 as every model", () => {
    expect([...ORG_TIER1_MODELS].sort()).toEqual(["gpt-5.6-luna", "gpt-6-luna"]);
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
    expect(modelPolicyOf({ apiKeyRegistered: true, orgAccess: access(1) }, true)).toEqual({ source: "own", tier: null, allowed: null });
    expect(modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(2) }, true)).toEqual({ source: "org", tier: 2, allowed: null });
    const t1 = modelPolicyOf({ apiKeyRegistered: false, orgAccess: access(1) }, true);
    expect(t1).toMatchObject({ source: "org", tier: 1 });
    expect(policyAllows(t1, "gpt-6-sol")).toBe(false);
    expect(allowedDefaultModel(t1, "gpt-6-sol")).toBe("gpt-6-luna");
    expect(allowedDefaultModel(t1, "gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });

  it("encrypts the default key under a context no user's key shares", () => {
    expect(DEFAULT_KEY_ENCRYPTION_CONTEXT).toEqual({ purpose: "openai-api-key", scope: "default" });
    expect("userId" in DEFAULT_KEY_ENCRYPTION_CONTEXT).toBe(false);
  });
});
