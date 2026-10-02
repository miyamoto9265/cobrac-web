import { describe, expect, it } from "vitest";
import type { UserRecord } from "@cobrac/shared";
import { planRunKey } from "../src/runKey.js";

const now = "2026-09-01T00:00:00.000Z";
const user = (extra: Partial<UserRecord> = {}): UserRecord => ({
  userId: "sub-alice",
  email: "alice@example.com",
  displayName: "alice",
  contributorName: "alice",
  role: "user",
  disabled: false,
  apiKeyRegistered: false,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const provider = user({ userId: "sub-admin", role: "admin", apiKeyRegistered: true, encryptedApiKey: "org-cipher", orgKeyProvider: true });
const tier = (t: 1 | 2) => ({ orgAccess: { tier: t, approvedAt: now, approvedBy: "sub-admin" } });

describe("planRunKey", () => {
  it("uses the user's own key first, whatever the model or tier", () => {
    expect(planRunKey(user({ apiKeyRegistered: true, encryptedApiKey: "own-cipher", ...tier(1) }), provider, "gpt-6-astra")).toEqual({
      source: "own",
      keyUserId: "sub-alice",
      encryptedApiKey: "own-cipher",
    });
  });

  it("decrypts the provider's key (with the provider's encryption context) for an approved user", () => {
    expect(planRunKey(user(tier(1)), provider, "gpt-5.6-luna")).toEqual({ source: "org", keyUserId: "sub-admin", encryptedApiKey: "org-cipher" });
    expect(planRunKey(user(tier(2)), provider, "gpt-6-astra")).toMatchObject({ source: "org" });
  });

  it("stops a run whose approval was revoked, whose tier excludes the model, or whose key is no longer shared", () => {
    expect(planRunKey(user(), provider, "gpt-6-luna")).toMatchObject({ meta: { i18n: "sys.noApiKey" } });
    expect(planRunKey(user({ orgAccess: null }), provider, "gpt-6-luna")).toMatchObject({ meta: { i18n: "sys.noApiKey" } });
    expect(planRunKey(user(tier(1)), provider, "gpt-6-sol")).toMatchObject({ meta: { i18n: "sys.orgKeyModel", model: "gpt-6-sol", tier: 1 } });
    expect(planRunKey(user(tier(2)), null, "gpt-6-luna")).toMatchObject({ meta: { i18n: "sys.orgKeyUnavailable" } });
  });
});
