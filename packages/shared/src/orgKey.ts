// ---------------------------------------------------------------------------
// Default API key: approved users without their own key run jobs with the organization's key, which an admin registers
// on the admin page. It belongs to no user ("org" in the code: keySource, orgAccess, orgTier). Each provider (OpenAI,
// Anthropic) has its own default key and its own user key; one approval and tier cover both.
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";
import { DEFAULT_CODEX_MODEL } from "./pricing.js";
import type { ModelProvider } from "./provider.js";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL, isClaudeModel } from "./provider.js";

/** Tier 1: the low-cost models only (`ORG_TIER1_MODELS`). Tier 2: every model. */
export type OrgTier = 1 | 2;

export const ORG_TIERS: readonly OrgTier[] = [1, 2];

export const ORG_TIER1_MODELS: readonly string[] = ["gpt-6-luna", "gpt-5.6-luna", "claude-haiku-5-5"];

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

/** The Anthropic key a job on a Claude model runs with: the user's own key, else the default Anthropic key. */
export function claudeKeySourceOf(user: KeyHolder, defaultKeyAvailable: boolean): KeySource | null {
  if (user.anthropicKeyRegistered) return "own";
  if (user.orgAccess && isOrgTier(user.orgAccess.tier) && defaultKeyAvailable) return "org";
  return null;
}

/** The Claude models a key source allows: every offered one with the user's own key or Tier 2, the low-cost one with Tier 1. */
export interface ClaudePolicy {
  source: KeySource | null;
  allowed: readonly string[];
}

/** Models a user may choose: `allowed` null = every OpenAI model (own key, or Tier 2); Claude models per `claude`. */
export interface ModelPolicy {
  /** Key of the OpenAI models */
  source: KeySource | null;
  tier: OrgTier | null;
  allowed: readonly string[] | null;
  claude: ClaudePolicy;
}

export function modelPolicyOf(user: KeyHolder, defaultKeyAvailable: boolean, claudeDefaultKeyAvailable = false): ModelPolicy {
  const source = keySourceOf(user, defaultKeyAvailable);
  const claudeSource = claudeKeySourceOf(user, claudeDefaultKeyAvailable);
  const tier = source === "org" || claudeSource === "org" ? user.orgAccess!.tier : null;
  const claude: ClaudePolicy = {
    source: claudeSource,
    allowed: claudeSource === null ? [] : claudeSource === "org" && tier === 1 ? CLAUDE_MODELS.filter((m) => ORG_TIER1_MODELS.includes(m)) : CLAUDE_MODELS,
  };
  if (source !== "org") return { source, tier, allowed: null, claude };
  return { source, tier, allowed: tier === 1 ? ORG_TIER1_MODELS.filter((m) => !isClaudeModel(m)) : null, claude };
}

/** The key source a job on `model` runs with. */
export const sourceForModel = (p: ModelPolicy, model: string): KeySource | null => (isClaudeModel(model) ? p.claude.source : p.source);

/** Whether some key can run jobs (an OpenAI or an Anthropic one). */
export const canRunJobs = (p: ModelPolicy): boolean => p.source !== null || p.claude.source !== null;

/**
 * Whether the user may run `model`. A Claude model needs an Anthropic key; an OpenAI model needs an OpenAI key once the
 * user has an Anthropic key (a user without any key keeps seeing every OpenAI model, as before).
 */
export function policyAllows(p: ModelPolicy, model: string): boolean {
  if (isClaudeModel(model)) return p.claude.allowed.includes(model);
  if (p.source === null && p.claude.source !== null) return false;
  return p.allowed === null || p.allowed.includes(model);
}

/** A model the policy allows for an implicit choice (user default, deployment default): `preferred` if allowed, else the first allowed. */
export function allowedDefaultModel(p: ModelPolicy, preferred: string): string {
  if (policyAllows(p, preferred)) return preferred;
  if (p.source === null && p.claude.allowed.length) return p.claude.allowed.includes(DEFAULT_CLAUDE_MODEL) ? DEFAULT_CLAUDE_MODEL : p.claude.allowed[0];
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
  id: "default-api-key" | "default-anthropic-key";
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

/** KMS `purpose` of a user's own key of each provider (with `userId` in the encryption context). */
export const API_KEY_PURPOSE: Readonly<Record<ModelProvider, string>> = { openai: "openai-api-key", anthropic: "anthropic-api-key" };

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
