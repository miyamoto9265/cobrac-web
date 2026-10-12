// ---------------------------------------------------------------------------
// Default API key: approved users without their own key run jobs with the organization's key, which an admin registers
// on the admin page. It belongs to no user ("org" in the code: keySource, orgAccess, orgTier). Each provider (OpenAI,
// Anthropic, DeepSeek) has its own default key and its own user key; one approval and tier cover all of them.
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";
import { DEFAULT_CODEX_MODEL } from "./pricing.js";
import type { MessagesProvider, ModelProvider } from "./provider.js";
import { PROVIDER_DEFAULT_MODEL, PROVIDER_MODELS, providerOf } from "./provider.js";

/** Tier 1: the low-cost models only (`ORG_TIER1_MODELS`). Tier 2: every model. */
export type OrgTier = 1 | 2;

export const ORG_TIERS: readonly OrgTier[] = [1, 2];

export const ORG_TIER1_MODELS: readonly string[] = ["gpt-6-luna", "gpt-5.6-luna", "claude-haiku-5-5", "deepseek-flash"];

/** An admin's approval to run jobs with the default API key. */
export interface OrgAccess {
  tier: OrgTier;
  approvedAt: string;
  /** userId of the admin who approved (or last changed the tier) */
  approvedBy: string;
}

/** Whose key pays for a job: the user's own key, or the default API key ("org"). */
export type KeySource = "own" | "org";

export const isOrgTier = (v: unknown): v is OrgTier => v === 1 || v === 2;

/** Whether `tier` may run `model` with the default API key (exact model IDs; Tier 2 is unrestricted). */
export function orgTierAllows(tier: OrgTier, model: string): boolean {
  return tier === 2 || ORG_TIER1_MODELS.includes(model);
}

interface KeyHolder {
  apiKeyRegistered: boolean;
  /** The user's own Anthropic key */
  anthropicKeyRegistered?: boolean;
  /** The user's own DeepSeek key */
  deepseekKeyRegistered?: boolean;
  orgAccess?: OrgAccess | null;
}

/**
 * The key a job of this user runs with. The user's own key always wins and is not tier-limited; the default API key
 * needs an approval and a registered default key. null: the user cannot run jobs.
 */
export function keySourceOf(user: KeyHolder, defaultKeyAvailable: boolean): KeySource | null {
  if (user.apiKeyRegistered) return "own";
  if (user.orgAccess && isOrgTier(user.orgAccess.tier) && defaultKeyAvailable) return "org";
  return null;
}

/** Whether the user has registered their own key of `provider`. */
export const ownKeyRegistered = (user: KeyHolder, provider: ModelProvider): boolean =>
  !!(provider === "anthropic" ? user.anthropicKeyRegistered : provider === "deepseek" ? user.deepseekKeyRegistered : user.apiKeyRegistered);

/** The key a job on a model of a fixed-list provider runs with: the user's own key, else that provider's default key. */
export function providerKeySourceOf(user: KeyHolder, provider: MessagesProvider, defaultKeyAvailable: boolean): KeySource | null {
  if (ownKeyRegistered(user, provider)) return "own";
  if (user.orgAccess && isOrgTier(user.orgAccess.tier) && defaultKeyAvailable) return "org";
  return null;
}

/** The Anthropic key a job on a Claude model runs with: the user's own key, else the default Anthropic key. */
export const claudeKeySourceOf = (user: KeyHolder, defaultKeyAvailable: boolean): KeySource | null => providerKeySourceOf(user, "anthropic", defaultKeyAvailable);

/**
 * The models of a fixed-list provider (Claude, DeepSeek) a key source allows: every offered one with the user's own key
 * or Tier 2, the low-cost ones with Tier 1.
 */
export interface ProviderPolicy {
  source: KeySource | null;
  allowed: readonly string[];
}

/** Models a user may choose: `allowed` null = every OpenAI model (own key, or Tier 2); Claude / DeepSeek models per `claude` / `deepseek`. */
export interface ModelPolicy {
  /** Key of the OpenAI models */
  source: KeySource | null;
  tier: OrgTier | null;
  allowed: readonly string[] | null;
  claude: ProviderPolicy;
  deepseek: ProviderPolicy;
}

/** Which default keys (one per provider) are registered. */
export interface DefaultKeysAvailable {
  openai: boolean;
  anthropic?: boolean;
  deepseek?: boolean;
}

export function modelPolicyOf(user: KeyHolder, defaults: DefaultKeysAvailable): ModelPolicy {
  const source = keySourceOf(user, defaults.openai);
  const sources = { anthropic: providerKeySourceOf(user, "anthropic", !!defaults.anthropic), deepseek: providerKeySourceOf(user, "deepseek", !!defaults.deepseek) };
  const tier = source === "org" || sources.anthropic === "org" || sources.deepseek === "org" ? user.orgAccess!.tier : null;
  const of = (provider: MessagesProvider): ProviderPolicy => {
    const s = sources[provider];
    const models = PROVIDER_MODELS[provider];
    return { source: s, allowed: s === null ? [] : s === "org" && tier === 1 ? models.filter((m) => ORG_TIER1_MODELS.includes(m)) : models };
  };
  const rest = { claude: of("anthropic"), deepseek: of("deepseek") };
  if (source !== "org") return { source, tier, allowed: null, ...rest };
  return { source, tier, allowed: tier === 1 ? ORG_TIER1_MODELS.filter((m) => providerOf(m) === "openai") : null, ...rest };
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
  if (messagesOnly(p)) return false;
  return p.allowed === null || p.allowed.includes(model);
}

/** A model the policy allows for an implicit choice (user default, deployment default): `preferred` if allowed, else the first allowed. */
export function allowedDefaultModel(p: ModelPolicy, preferred: string): string {
  if (policyAllows(p, preferred)) return preferred;
  if (messagesOnly(p)) {
    for (const provider of ["anthropic", "deepseek"] as const) {
      const { allowed } = providerPolicy(p, provider);
      if (allowed.length) return allowed.includes(PROVIDER_DEFAULT_MODEL[provider]) ? PROVIDER_DEFAULT_MODEL[provider] : allowed[0];
    }
  }
  if (p.allowed === null) return DEFAULT_CODEX_MODEL;
  return p.allowed.includes(DEFAULT_CODEX_MODEL) ? DEFAULT_CODEX_MODEL : p.allowed[0];
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
  /** Models of the key (snapshot taken at registration), offered to Tier 2 */
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
