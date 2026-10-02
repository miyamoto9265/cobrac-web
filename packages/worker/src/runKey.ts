import type { KeySource, UserRecord } from "@cobrac/shared";
import { isOrgTier, orgTierAllows } from "@cobrac/shared";

export type RunKeyPlan =
  | { source: KeySource; /** whose encrypted key to decrypt (KMS encryption context) */ keyUserId: string; encryptedApiKey: string }
  | { error: string; meta: Record<string, unknown> };

/**
 * The key a worker start runs with, checked again on every start (new job, answer, retry, restart after an
 * interruption) so a revoked approval or a lowered tier stops the next run. The user's own key always wins.
 * `provider` is the organization-key provider (orgKeyProviderOf), looked up only when the user has no key.
 */
export function planRunKey(user: UserRecord, provider: UserRecord | null, model: string): RunKeyPlan {
  if (user.encryptedApiKey) return { source: "own", keyUserId: user.userId, encryptedApiKey: user.encryptedApiKey };
  const access = user.orgAccess;
  if (!access || !isOrgTier(access.tier)) {
    return { error: "No OpenAI API key is registered for this user, and the user is not approved for the organization key.", meta: { i18n: "sys.noApiKey" } };
  }
  if (!provider?.encryptedApiKey) return { error: "The organization API key is not available. Ask an admin.", meta: { i18n: "sys.orgKeyUnavailable" } };
  if (!orgTierAllows(access.tier, model)) {
    return { error: `Model ${model} is not available on Tier ${access.tier} of the organization key.`, meta: { i18n: "sys.orgKeyModel", model, tier: access.tier } };
  }
  return { source: "org", keyUserId: provider.userId, encryptedApiKey: provider.encryptedApiKey };
}
