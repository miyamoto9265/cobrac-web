import type { DefaultApiKeyRecord, KeySource, UserRecord } from "@cobrac/shared";
import { API_KEY_PURPOSE, DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT, DEFAULT_KEY_ENCRYPTION_CONTEXT, isOrgTier, orgTierAllows, providerOf } from "@cobrac/shared";

export type RunKeyPlan =
  | { source: KeySource; encryptedApiKey: string; /** KMS encryption context of the ciphertext */ context: Record<string, string> }
  | { error: string; meta: Record<string, unknown> };

/** The user's own key for the provider of `model` (Anthropic for the Claude models, else OpenAI); "" when none. */
export const ownKeyOf = (user: UserRecord, model: string): string => (providerOf(model) === "anthropic" ? user.encryptedAnthropicKey : user.encryptedApiKey) ?? "";

/**
 * The key a worker start runs with, checked again on every start (new job, answer, retry, restart after an
 * interruption) so a revoked approval, a lowered tier or a deleted default key stops the next run. The user's own
 * key of the model's provider always wins. `defaultKey` (that provider's default key) is looked up only when the user
 * has no key of their own.
 */
export function planRunKey(user: UserRecord, defaultKey: DefaultApiKeyRecord | null, model: string): RunKeyPlan {
  const provider = providerOf(model);
  const own = ownKeyOf(user, model);
  if (own) return { source: "own", encryptedApiKey: own, context: { userId: user.userId, purpose: API_KEY_PURPOSE[provider] } };
  const access = user.orgAccess;
  if (!access || !isOrgTier(access.tier)) {
    return provider === "anthropic"
      ? { error: "No Anthropic API key is registered, and an admin has not approved you.", meta: { i18n: "sys.noAnthropicKey" } }
      : { error: "No OpenAI API key is registered, and an admin has not approved you.", meta: { i18n: "sys.noApiKey" } };
  }
  if (!defaultKey?.encryptedApiKey) return { error: "Jobs cannot run right now. Ask an admin.", meta: { i18n: "sys.orgKeyUnavailable" } };
  if (!orgTierAllows(access.tier, model)) {
    return { error: `Model ${model} is not available.`, meta: { i18n: "sys.orgKeyModel", model } };
  }
  const context = provider === "anthropic" ? DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT : DEFAULT_KEY_ENCRYPTION_CONTEXT;
  return { source: "org", encryptedApiKey: defaultKey.encryptedApiKey, context: { ...context } };
}
