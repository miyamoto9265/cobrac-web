// ---------------------------------------------------------------------------
// Organization key: approved users without their own OpenAI key run jobs with the key an admin shares.
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";
import { DEFAULT_CODEX_MODEL } from "./pricing.js";

/** Tier 1: the low-cost models only (`ORG_TIER1_MODELS`). Tier 2: every model. */
export type OrgTier = 1 | 2;

export const ORG_TIERS: readonly OrgTier[] = [1, 2];

export const ORG_TIER1_MODELS: readonly string[] = ["gpt-6-luna", "gpt-5.6-luna"];

/** An admin's approval to run jobs with the organization key. */
export interface OrgAccess {
  tier: OrgTier;
  approvedAt: string;
  /** userId of the admin who approved (or last changed the tier) */
  approvedBy: string;
}

/** Whose key pays for a job: the user's own key, or the organization key. */
export type KeySource = "own" | "org";

export const isOrgTier = (v: unknown): v is OrgTier => v === 1 || v === 2;

/** Whether `tier` may run `model` with the organization key (exact model IDs; Tier 2 is unrestricted). */
export function orgTierAllows(tier: OrgTier, model: string): boolean {
  return tier === 2 || ORG_TIER1_MODELS.includes(model);
}

interface KeyHolder {
  apiKeyRegistered: boolean;
  orgAccess?: OrgAccess | null;
}

/**
 * The key a job of this user runs with. The user's own key always wins and is not tier-limited; the organization
 * key needs an approval and a shared organization key. null: the user cannot run jobs.
 */
export function keySourceOf(user: KeyHolder, orgKeyAvailable: boolean): KeySource | null {
  if (user.apiKeyRegistered) return "own";
  if (user.orgAccess && isOrgTier(user.orgAccess.tier) && orgKeyAvailable) return "org";
  return null;
}

interface ProviderCandidate {
  role: string;
  disabled: boolean;
  apiKeyRegistered: boolean;
  encryptedApiKey?: string;
  orgKeyProvider?: boolean;
}

/** The admin whose registered key is shared as the organization key, when it can be used (enabled admin with a key). */
export function orgKeyProviderOf<U extends ProviderCandidate>(users: U[]): U | null {
  return users.find((u) => u.orgKeyProvider && u.role === "admin" && !u.disabled && u.apiKeyRegistered && !!u.encryptedApiKey) ?? null;
}

/** Models a user may choose: null = unrestricted (own key, or Tier 2). */
export interface ModelPolicy {
  source: KeySource | null;
  tier: OrgTier | null;
  allowed: readonly string[] | null;
}

export function modelPolicyOf(user: KeyHolder, orgKeyAvailable: boolean): ModelPolicy {
  const source = keySourceOf(user, orgKeyAvailable);
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

/** Organization-key usage of one user (GET /admin/org-usage). */
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

export interface OrgKeyStatus {
  /** The admin whose registered key is the organization key (absent: none is shared) */
  provider: { userId: string; email: string; last4: string | null } | null;
  /** The provider's key is registered and the provider is an enabled admin */
  available: boolean;
}

export interface OrgUsageResponse {
  items: OrgUsageRow[];
  /** First day of the month counted in `monthCostUsd` (YYYY-MM) */
  month: string;
}
