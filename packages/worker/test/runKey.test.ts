import { describe, expect, it } from "vitest";
import type { DefaultApiKeyRecord, UserRecord } from "@cobrac/shared";
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
const defaultKey: DefaultApiKeyRecord = { kind: "config", id: "default-api-key", encryptedApiKey: "default-cipher", last4: "abcd", availableModels: [], updatedAt: now, updatedBy: "sub-admin" };
const tier = (t: 1 | 2) => ({ orgAccess: { tier: t, approvedAt: now, approvedBy: "sub-admin" } });

describe("planRunKey", () => {
  it("uses the user's own key first, whatever the model or tier", () => {
    expect(planRunKey(user({ apiKeyRegistered: true, encryptedApiKey: "own-cipher", ...tier(1) }), defaultKey, "gpt-6-astra")).toEqual({
      source: "own",
      encryptedApiKey: "own-cipher",
      context: { userId: "sub-alice", purpose: "openai-api-key" },
    });
  });

  it("decrypts the default key under its own context (no userId) for an approved user", () => {
    expect(planRunKey(user(tier(1)), defaultKey, "gpt-5.6-luna")).toEqual({
      source: "org",
      encryptedApiKey: "default-cipher",
      context: { purpose: "openai-api-key", scope: "default" },
    });
    expect(planRunKey(user(tier(2)), defaultKey, "gpt-6-astra")).toMatchObject({ source: "org" });
  });

  it("stops a run whose approval was revoked, whose tier excludes the model, or when no default key is registered", () => {
    expect(planRunKey(user(), defaultKey, "gpt-6-luna")).toMatchObject({ meta: { i18n: "sys.noApiKey" } });
    expect(planRunKey(user({ orgAccess: null }), defaultKey, "gpt-6-luna")).toMatchObject({ meta: { i18n: "sys.noApiKey" } });
    expect(planRunKey(user(tier(1)), defaultKey, "gpt-6-sol")).toMatchObject({ meta: { i18n: "sys.orgKeyModel", model: "gpt-6-sol", tier: 1 } });
    expect(planRunKey(user(tier(2)), null, "gpt-6-luna")).toMatchObject({ meta: { i18n: "sys.orgKeyUnavailable" } });
  });
});
