// ---------------------------------------------------------------------------
// Default API key: approved users without their own key run jobs with the organization's key, which an admin registers
// on the admin page. It belongs to no user ("org" in the code: keySource, orgAccess). Each provider (OpenAI, Anthropic,
// DeepSeek) has its own default key and its own user key; one approval covers all of them and every model.
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";
import type { MessagesProvider, ModelProvider } from "./provider.js";
import { DEFAULT_OPENAI_MODEL, PROVIDER_DEFAULT_MODEL, PROVIDER_MODELS, isDeprecatedModel, providerOf } from "./provider.js";

/** An admin's approval to run jobs with the default API key (every model). */
export interface OrgAccess {
  approvedAt: string;
  /** userId of the admin who approved */
  approvedBy: string;
  /** Legacy: the tier of approvals made while tiers existed (1 or 2); ignored, every approval allows every model */
  tier?: number;
}

/** Whose key pays for a job: the user's own key, the default API key ("org"), or the key of the team whose workspace holds the job ("team"). */
export type KeySource = "own" | "org" | "team";

/** Whether an admin has approved the user for the default API key (any stored approval counts, a legacy tier too). */
export const isOrgApproved = (access: OrgAccess | null | undefined): boolean => !!access && typeof access === "object";

interface KeyHolder {
  apiKeyRegistered: boolean;
  /** The user's own Anthropic key */
  anthropicKeyRegistered?: boolean;
  /** The user's own DeepSeek key */
  deepseekKeyRegistered?: boolean;
  orgAccess?: OrgAccess | null;
}

/**
 * The key a job of this user runs with. The user's own key always wins; the default API key needs an approval and a
 * registered default key. null: the user cannot run jobs.
 */
export function keySourceOf(user: KeyHolder, defaultKeyAvailable: boolean): KeySource | null {
  if (user.apiKeyRegistered) return "own";
  if (isOrgApproved(user.orgAccess) && defaultKeyAvailable) return "org";
  return null;
}

/** Whether the user has registered their own key of `provider`. */
export const ownKeyRegistered = (user: KeyHolder, provider: ModelProvider): boolean =>
  !!(provider === "anthropic" ? user.anthropicKeyRegistered : provider === "deepseek" ? user.deepseekKeyRegistered : user.apiKeyRegistered);

/** The key a job on a model of a fixed-list provider runs with: the user's own key, else that provider's default key. */
export function providerKeySourceOf(user: KeyHolder, provider: MessagesProvider, defaultKeyAvailable: boolean): KeySource | null {
  if (ownKeyRegistered(user, provider)) return "own";
  if (isOrgApproved(user.orgAccess) && defaultKeyAvailable) return "org";
  return null;
}

/** The Anthropic key a job on a Claude model runs with: the user's own key, else the default Anthropic key. */
export const claudeKeySourceOf = (user: KeyHolder, defaultKeyAvailable: boolean): KeySource | null => providerKeySourceOf(user, "anthropic", defaultKeyAvailable);

/** The models of a fixed-list provider (Claude, DeepSeek) a key source allows: every offered one once there is a key. */
export interface ProviderPolicy {
  source: KeySource | null;
  allowed: readonly string[];
}

/** Models a user may choose: every OpenAI model (with an OpenAI key, or with no key at all); Claude / DeepSeek models per `claude` / `deepseek`. */
export interface ModelPolicy {
  /** Key of the OpenAI models */
  source: KeySource | null;
  claude: ProviderPolicy;
  deepseek: ProviderPolicy;
}

/** Which default keys (one per provider) are registered. */
export interface DefaultKeysAvailable {
  openai: boolean;
  anthropic?: boolean;
  deepseek?: boolean;
}

/**
 * `teamKeys`: in a team's workspace, the providers the team has a key of. A team key wins over the user's own and the
 * default key (the team pays for its workspace); a provider without a team key falls back to the user's keys.
 */
export function modelPolicyOf(user: KeyHolder, defaults: DefaultKeysAvailable, teamKeys?: Partial<Record<ModelProvider, boolean>>): ModelPolicy {
  const source = teamKeys?.openai ? "team" : keySourceOf(user, defaults.openai);
  const sources = {
    anthropic: teamKeys?.anthropic ? ("team" as const) : providerKeySourceOf(user, "anthropic", !!defaults.anthropic),
    deepseek: teamKeys?.deepseek ? ("team" as const) : providerKeySourceOf(user, "deepseek", !!defaults.deepseek),
  };
  const of = (provider: MessagesProvider): ProviderPolicy => ({ source: sources[provider], allowed: sources[provider] === null ? [] : PROVIDER_MODELS[provider] });
  return { source, claude: of("anthropic"), deepseek: of("deepseek") };
}

/** The policy of a fixed-list provider's models. */
export const providerPolicy = (p: ModelPolicy, provider: MessagesProvider): ProviderPolicy => (provider === "anthropic" ? p.claude : p.deepseek);

/** The key source a job on `model` runs with. */
export function sourceForModel(p: ModelPolicy, model: string): KeySource | null {
  const provider = providerOf(model);
  return provider === "openai" ? p.source : providerPolicy(p, provider).source;
}

/** Whether some key can run jobs (an OpenAI, an Anthropic or a DeepSeek one). */
export const canRunJobs = (p: ModelPolicy): boolean => p.source !== null || p.claude.source !== null || p.deepseek.source !== null;

/** Whether the user has a key of a fixed-list provider (Anthropic, DeepSeek) but none of OpenAI: they choose among those models only. */
export const messagesOnly = (p: ModelPolicy): boolean => p.source === null && (p.claude.source !== null || p.deepseek.source !== null);

/**
 * Whether the user may run `model`. A Claude / DeepSeek model needs a key of its provider; an OpenAI model needs an
 * OpenAI key once the user has another provider's key (a user without any key keeps seeing every OpenAI model, as before).
 */
export function policyAllows(p: ModelPolicy, model: string): boolean {
  const provider = providerOf(model);
  if (provider !== "openai") return providerPolicy(p, provider).allowed.includes(model);
  return !messagesOnly(p);
}

/**
 * A model the policy allows for an implicit choice (user default, deployment default): `preferred` if allowed, else
 * a model that is not deprecated: gpt-6-sol with an OpenAI key, Sonnet 5.5 with a Claude key only. A user with a
 * DeepSeek key only gets DeepSeek V4.1 Flash (deprecated, but the only model they can run).
 */
export function allowedDefaultModel(p: ModelPolicy, preferred: string): string {
  if (policyAllows(p, preferred)) return preferred;
  if (messagesOnly(p)) {
    for (const provider of ["anthropic", "deepseek"] as const) {
      const { allowed } = providerPolicy(p, provider);
      if (!allowed.length) continue;
      if (allowed.includes(PROVIDER_DEFAULT_MODEL[provider])) return PROVIDER_DEFAULT_MODEL[provider];
      return allowed.find((m) => !isDeprecatedModel(m)) ?? allowed[0];
    }
  }
  return DEFAULT_OPENAI_MODEL;
}

/** Default-API-key usage of one user (GET /admin/org-usage). */
export interface OrgUsageRow {
  userId: string;
  jobs: number;
  usage: TokenUsage;
  /** USD; jobs on unpriced models are counted in `unpricedJobs` instead */
  costUsd: number;
  /** Cost of jobs created in the current UTC month */
  monthCostUsd: number;
  unpricedJobs: number;
  lastJobAt: string | null;
}

/**
 * The default API key as stored (Catalog table, kind "config", id "default-api-key"). The ciphertext is never sent to
 * clients; the admin page sees `DefaultKeyStatus` only.
 */
export interface DefaultApiKeyRecord {
  kind: "config";
  id: "default-api-key" | "default-anthropic-key" | "default-deepseek-key";
  /** KMS ciphertext (base64) under `DEFAULT_KEY_ENCRYPTION_CONTEXT` */
  encryptedApiKey: string;
  last4: string;
  /** Models of the key (snapshot taken at registration), offered to approved users without a key of their own */
  availableModels: string[];
  updatedAt: string;
  /** userId of the admin who registered it */
  updatedBy: string;
}

export const DEFAULT_KEY_CATALOG_KEY = { kind: "config", id: "default-api-key" } as const;

/** KMS encryption context of the default API key; it has no userId, so no user's context can decrypt it. */
export const DEFAULT_KEY_ENCRYPTION_CONTEXT: Readonly<Record<string, string>> = { purpose: "openai-api-key", scope: "default" };

/** The default Anthropic key: the same record shape under its own Catalog id and encryption context. */
export const DEFAULT_ANTHROPIC_KEY_CATALOG_KEY = { kind: "config", id: "default-anthropic-key" } as const;

export const DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT: Readonly<Record<string, string>> = { purpose: "anthropic-api-key", scope: "default" };

/** The default DeepSeek key: the same record shape under its own Catalog id and encryption context. */
export const DEFAULT_DEEPSEEK_KEY_CATALOG_KEY = { kind: "config", id: "default-deepseek-key" } as const;

export const DEFAULT_DEEPSEEK_KEY_ENCRYPTION_CONTEXT: Readonly<Record<string, string>> = { purpose: "deepseek-api-key", scope: "default" };

/** Catalog key of each provider's default key. */
export const DEFAULT_KEY_CATALOG_KEYS = { openai: DEFAULT_KEY_CATALOG_KEY, anthropic: DEFAULT_ANTHROPIC_KEY_CATALOG_KEY, deepseek: DEFAULT_DEEPSEEK_KEY_CATALOG_KEY } as const;

/** KMS encryption context of each provider's default key. */
export const DEFAULT_KEY_ENCRYPTION_CONTEXTS: Readonly<Record<ModelProvider, Readonly<Record<string, string>>>> = {
  openai: DEFAULT_KEY_ENCRYPTION_CONTEXT,
  anthropic: DEFAULT_ANTHROPIC_KEY_ENCRYPTION_CONTEXT,
  deepseek: DEFAULT_DEEPSEEK_KEY_ENCRYPTION_CONTEXT,
};

/** KMS `purpose` of a user's own key of each provider (with `userId` in the encryption context). */
export const API_KEY_PURPOSE: Readonly<Record<ModelProvider, string>> = { openai: "openai-api-key", anthropic: "anthropic-api-key", deepseek: "deepseek-api-key" };

/** GET/PUT/DELETE /admin/default-api-key */
export interface DefaultKeyStatus {
  registered: boolean;
  last4: string | null;
  updatedAt: string | null;
}

export interface OrgUsageResponse {
  items: OrgUsageRow[];
  /** First day of the month counted in `monthCostUsd` (YYYY-MM) */
  month: string;
}
