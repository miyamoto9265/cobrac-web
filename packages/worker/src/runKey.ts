import type { DefaultApiKeyRecord, KeySource, ModelProvider, UserRecord } from "@cobrac/shared";
import { API_KEY_PURPOSE, DEFAULT_KEY_ENCRYPTION_CONTEXTS, isOrgTier, orgTierAllows, providerOf } from "@cobrac/shared";

export type RunKeyPlan =
  | { source: KeySource; encryptedApiKey: string; /** KMS encryption context of the ciphertext */ context: Record<string, string> }
  | { error: string; meta: Record<string, unknown> };

/** The user's own key for the provider of `model` (Anthropic for the Claude models, DeepSeek, else OpenAI); "" when none. */
export function ownKeyOf(user: UserRecord, model: string): string {
  const provider = providerOf(model);
  return (provider === "anthropic" ? user.encryptedAnthropicKey : provider === "deepseek" ? user.encryptedDeepseekKey : user.encryptedApiKey) ?? "";
}

const NO_KEY: Record<ModelProvider, { error: string; i18n: string }> = {
  openai: { error: "No OpenAI API key is registered, and an admin has not approved you.", i18n: "sys.noApiKey" },
  anthropic: { error: "No Anthropic API key is registered, and an admin has not approved you.", i18n: "sys.noAnthropicKey" },
  deepseek: { error: "No DeepSeek API key is registered, and an admin has not approved you.", i18n: "sys.noDeepseekKey" },
};

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
    return { error: NO_KEY[provider].error, meta: { i18n: NO_KEY[provider].i18n } };
  }
  if (!defaultKey?.encryptedApiKey) return { error: "Jobs cannot run right now. Ask an admin.", meta: { i18n: "sys.orgKeyUnavailable" } };
  if (!orgTierAllows(access.tier, model)) {
    return { error: `Model ${model} is not available.`, meta: { i18n: "sys.orgKeyModel", model } };
  }
  return { source: "org", encryptedApiKey: defaultKey.encryptedApiKey, context: { ...DEFAULT_KEY_ENCRYPTION_CONTEXTS[provider] } };
}
