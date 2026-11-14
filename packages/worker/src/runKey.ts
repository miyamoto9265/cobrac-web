import type { DefaultApiKeyRecord, KeySource, ModelProvider, TeamRecord, UserRecord } from "@cobrac/shared";
import { API_KEY_PURPOSE, DEFAULT_KEY_ENCRYPTION_CONTEXTS, budgetState, hasTeamKey, isOrgApproved, providerOf, teamAllowsModel, teamKeyEncryptionContext, teamRoleOf } from "@cobrac/shared";

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
 * Whether the job runs on the team's key (then the user's own key is not read): the user is a member, the team has a
 * key of the model's provider, its budget is active now and its admins allow the model.
 */
export const usesTeamKey = (user: UserRecord, team: TeamRecord | null | undefined, model: string): boolean =>
  !!(team && teamRoleOf(team, user.userId) && hasTeamKey(team, providerOf(model)) && budgetState(team) === "active" && teamAllowsModel(team, model));

/** The team's key is the deployment's default key (a site admin assigned it): the default key must be looked up. */
export const teamUsesDefault = (user: UserRecord, team: TeamRecord | null | undefined, model: string): boolean =>
  usesTeamKey(user, team, model) && !!team?.keys?.[providerOf(model)]?.useDefault;

/** Whether `defaultKey` must be read for this start (the user has no key of their own, or the team's key is the default one). */
export const needsDefaultKey = (user: UserRecord, team: TeamRecord | null | undefined, model: string): boolean =>
  usesTeamKey(user, team, model) ? teamUsesDefault(user, team, model) : !ownKeyOf(user, model);

/**
 * The key a worker start runs with, checked again on every start (new job, answer, retry, restart after an
 * interruption) so a revoked approval or a deleted default key stops the next run. In a team's workspace the team's
 * key wins while its budget is active; otherwise the user's own key of the model's provider wins. `defaultKey` (that
 * provider's default key) is looked up only when needed (`needsDefaultKey`). `expectTeam`: the job was queued to run
 * on the team's key; when that key can no longer be used (the budget ended or was stopped) the start fails rather
 * than silently charging the user's own key (the creator resumes it with a retry, on their own key).
 */
export function planRunKey(user: UserRecord, defaultKey: DefaultApiKeyRecord | null, model: string, team?: TeamRecord | null, expectTeam = false): RunKeyPlan {
  const provider = providerOf(model);
  if (team && usesTeamKey(user, team, model)) {
    const teamKey = team.keys![provider]!;
    if (teamKey.useDefault) {
      if (!defaultKey?.encryptedApiKey) return { error: "The team's budget (the default key) cannot be used right now. Ask an admin.", meta: { i18n: "sys.orgKeyUnavailable" } };
      return { source: "team", encryptedApiKey: defaultKey.encryptedApiKey, context: { ...DEFAULT_KEY_ENCRYPTION_CONTEXTS[provider] } };
    }
    return { source: "team", encryptedApiKey: teamKey.encryptedApiKey!, context: teamKeyEncryptionContext(team.teamId, provider) };
  }
  if (expectTeam) return { error: "The team's budget ended or was stopped, so this job was stopped. The creator can resume it on their own key.", meta: { i18n: "sys.teamBudgetEnded" } };
  const own = ownKeyOf(user, model);
  if (own) return { source: "own", encryptedApiKey: own, context: { userId: user.userId, purpose: API_KEY_PURPOSE[provider] } };
  if (!isOrgApproved(user.orgAccess)) {
    return { error: NO_KEY[provider].error, meta: { i18n: NO_KEY[provider].i18n } };
  }
  if (!defaultKey?.encryptedApiKey) return { error: "Jobs cannot run right now. Ask an admin.", meta: { i18n: "sys.orgKeyUnavailable" } };
  return { source: "org", encryptedApiKey: defaultKey.encryptedApiKey, context: { ...DEFAULT_KEY_ENCRYPTION_CONTEXTS[provider] } };
}
