import type { DefaultApiKeyRecord, KeySource, UserRecord } from "@cobrac/shared";
import { DEFAULT_KEY_ENCRYPTION_CONTEXT, isOrgTier, orgTierAllows } from "@cobrac/shared";

export type RunKeyPlan =
  | { source: KeySource; encryptedApiKey: string; /** KMS encryption context of the ciphertext */ context: Record<string, string> }
  | { error: string; meta: Record<string, unknown> };

/**
 * The key a worker start runs with, checked again on every start (new job, answer, retry, restart after an
 * interruption) so a revoked approval, a lowered tier or a deleted default key stops the next run. The user's own
 * key always wins. `defaultKey` is looked up only when the user has no key.
 */
export function planRunKey(user: UserRecord, defaultKey: DefaultApiKeyRecord | null, model: string): RunKeyPlan {
  if (user.encryptedApiKey) return { source: "own", encryptedApiKey: user.encryptedApiKey, context: { userId: user.userId, purpose: "openai-api-key" } };
  const access = user.orgAccess;
  if (!access || !isOrgTier(access.tier)) {
    return { error: "No OpenAI API key is registered for this user, and the user is not approved for the default API key.", meta: { i18n: "sys.noApiKey" } };
  }
  if (!defaultKey?.encryptedApiKey) return { error: "No default API key is registered. Ask an admin.", meta: { i18n: "sys.orgKeyUnavailable" } };
  if (!orgTierAllows(access.tier, model)) {
    return { error: `Model ${model} is not available on Tier ${access.tier} of the default API key.`, meta: { i18n: "sys.orgKeyModel", model, tier: access.tier } };
  }
  return { source: "org", encryptedApiKey: defaultKey.encryptedApiKey, context: { ...DEFAULT_KEY_ENCRYPTION_CONTEXT } };
}
