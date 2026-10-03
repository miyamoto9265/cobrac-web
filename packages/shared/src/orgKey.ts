// ---------------------------------------------------------------------------
// Default API key: approved users without their own OpenAI key run jobs with the organization's key, which an
// admin registers on the admin page. It belongs to no user ("org" in the code: keySource, orgAccess, orgTier).
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";
import { DEFAULT_CODEX_MODEL } from "./pricing.js";

/** Tier 1: the low-cost models only (`ORG_TIER1_MODELS`). Tier 2: every model. */
export type OrgTier = 1 | 2;

export const ORG_TIERS: readonly OrgTier[] = [1, 2];

export const ORG_TIER1_MODELS: readonly string[] = ["gpt-6-luna", "gpt-5.6-luna"];

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

/** Models a user may choose: null = unrestricted (own key, or Tier 2). */
export interface ModelPolicy {
  source: KeySource | null;
  tier: OrgTier | null;
  allowed: readonly string[] | null;
}

export function modelPolicyOf(user: KeyHolder, defaultKeyAvailable: boolean): ModelPolicy {
  const source = keySourceOf(user, defaultKeyAvailable);
  if (source !== "org") return { source, tier: null, allowed: null };
  const tier = user.orgAccess!.tier;
  return { source, tier, allowed: tier === 1 ? ORG_TIER1_MODELS : null };
}

export const policyAllows = (p: ModelPolicy, model: string): boolean => p.allowed === null || p.allowed.includes(model);

/** A model the policy allows for an implicit choice (user default, deployment default): `preferred` if allowed, else the first allowed. */
export function allowedDefaultModel(p: ModelPolicy, preferred: string): string {
  if (policyAllows(p, preferred)) return preferred;
  return p.allowed!.includes(DEFAULT_CODEX_MODEL) ? DEFAULT_CODEX_MODEL : p.allowed![0];
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
  id: "default-api-key";
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
