// ---------------------------------------------------------------------------
// Teams: a team admin registers the team's own API keys (the team's budget) and invites members, who then run
// missions and projects in the team's workspace with those keys. Personal workspaces stay as they are; one user may
// belong to several teams. A team is stored in the Catalog table (kind "team"), its invite link under kind
// "team-invite" (the link's token is the id).
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";
import type { ModelProvider } from "./provider.js";
import { API_KEY_PURPOSE } from "./orgKey.js";
import { randomCrockfordId } from "./projectId.js";

export type TeamRole = "admin" | "member";
export const TEAM_ROLES: readonly TeamRole[] = ["admin", "member"];

export const TEAM_CATALOG_KIND = "team";
export const TEAM_INVITE_CATALOG_KIND = "team-invite";

export const TEAM_NAME_MAX = 80;
/** Members of one team (the team is one Catalog item, so the list must stay small) */
export const TEAM_MAX_MEMBERS = 500;
/** Addresses one "send by e-mail" request may name */
export const TEAM_INVITE_EMAILS_MAX = 50;
/** Sent invitations kept on the team (the oldest drop off) */
export const TEAM_SENT_INVITES_MAX = 200;

export interface TeamMember {
  userId: string;
  role: TeamRole;
  joinedAt: string;
}

/** One provider's team key: KMS ciphertext under `teamKeyEncryptionContext(teamId, provider)`; never sent to clients. */
export interface TeamKey {
  /** Absent when `useDefault` */
  encryptedApiKey?: string;
  /**
   * A site admin assigned the deployment's default (WBAI) key of this provider as the team's budget: jobs decrypt
   * that key under its own context; no ciphertext is copied onto the team
   */
  useDefault?: boolean;
  last4: string;
  /** Models of the key (OpenAI: snapshot taken at registration) */
  models?: string[];
  updatedAt: string;
  /** userId of the team admin who registered it */
  updatedBy: string;
}

/** An invitation the team sent by e-mail (the link itself is the team's current invite link). */
export interface TeamSentInvite {
  email: string;
  sentAt: string;
  sentBy: string;
}

/**
 * When the team's keys may be used (the budget's period). Outside it, and while stopped, jobs in the team's workspace
 * run on the runner's own keys, and jobs that ran on the team's keys are stopped.
 */
export interface TeamBudget {
  /** ISO; null: from now */
  startsAt: string | null;
  /** ISO; null: no end */
  endsAt: string | null;
  /** Stopped by a team admin (or a site admin) until started again */
  stoppedAt?: string | null;
  stoppedBy?: string | null;
  /** The stop was a site admin's: only a site admin can lift it */
  stoppedBySiteAdmin?: boolean;
  /**
   * When the janitor stopped the team-key jobs and paused the missions after the budget ended or was stopped (once per
   * end; cleared when the budget is changed or started again)
   */
  haltedAt?: string | null;
}

/** Spending limits on the team's keys (USD, per UTC month; null: none). Estimates, like every cost in the app. */
export interface TeamLimits {
  monthUsd: number | null;
  memberMonthUsd: number | null;
}

/** Per-member limit set when an admin makes an invite link without a headcount limit and none is set yet (decision 6). */
export const TEAM_DEFAULT_MEMBER_LIMIT_USD = 5;
/** Members are told this many days before the budget ends */
export const TEAM_BUDGET_NOTICE_DAYS = 3;

export interface TeamRecord {
  kind: typeof TEAM_CATALOG_KIND;
  /** = teamId */
  id: string;
  teamId: string;
  name: string;
  members: TeamMember[];
  keys?: Partial<Record<ModelProvider, TeamKey>>;
  /** Token of the current invite link (absent / null: none) */
  inviteToken?: string | null;
  sentInvites?: TeamSentInvite[];
  budget?: TeamBudget;
  limits?: TeamLimits;
  /** Models the team's keys may run (null / absent: all) */
  allowedModels?: string[] | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/** The invite link: anyone who opens it and signs in joins the team as a member while it is valid. */
export interface TeamInviteRecord {
  kind: typeof TEAM_INVITE_CATALOG_KIND;
  /** = token */
  id: string;
  teamId: string;
  createdAt: string;
  createdBy: string;
  /** null: no expiry */
  expiresAt: string | null;
  /** null: no limit */
  maxUses: number | null;
  uses: number;
  revokedAt?: string | null;
}

/** A new random team ID (`t7m2q9xa`). */
export const generateTeamId = (random?: () => number): string => randomCrockfordId("t", random);
export const TEAM_ID_REGEX = /^t[0-9a-z]{7}$/;
export const isTeamId = (v: unknown): v is string => typeof v === "string" && TEAM_ID_REGEX.test(v);

/** Invite tokens are long enough not to be guessed. */
export const INVITE_TOKEN_REGEX = /^[A-Za-z0-9_-]{22,64}$/;

/** KMS encryption context of a team key: tied to the team, so no user's or default-key context can decrypt it. */
export const teamKeyEncryptionContext = (teamId: string, provider: ModelProvider): Record<string, string> => ({ purpose: API_KEY_PURPOSE[provider], teamId });

export const teamRoleOf = (team: Pick<TeamRecord, "members">, userId: string): TeamRole | null => team.members.find((m) => m.userId === userId)?.role ?? null;
export const isTeamAdmin = (team: Pick<TeamRecord, "members">, userId: string): boolean => teamRoleOf(team, userId) === "admin";

/** Whether the team has a key of `provider` (its own, or the default key a site admin assigned). */
export const hasTeamKey = (team: Pick<TeamRecord, "keys"> | null | undefined, provider: ModelProvider): boolean => {
  const k = team?.keys?.[provider];
  return !!(k && (k.encryptedApiKey || k.useDefault));
};

export type BudgetState = "none" | "scheduled" | "active" | "ended" | "stopped";

/** The budget's state now: none (no key), scheduled (before its start), active, ended, stopped. */
export function budgetState(team: Pick<TeamRecord, "keys" | "budget">, now: string = new Date().toISOString()): BudgetState {
  if (!(["openai", "anthropic", "deepseek"] as const).some((p) => hasTeamKey(team, p))) return "none";
  const b = team.budget;
  if (b?.stoppedAt) return "stopped";
  if (b?.startsAt && now < b.startsAt) return "scheduled";
  if (b?.endsAt && b.endsAt <= now) return "ended";
  return "active";
}

/** Which providers the team's budget covers now (a key, and the budget active). */
export const teamKeysAvailable = (team: Pick<TeamRecord, "keys" | "budget"> | null | undefined, now?: string): Partial<Record<ModelProvider, boolean>> => {
  const active = !!team && budgetState(team, now) === "active";
  return {
    openai: active && hasTeamKey(team, "openai"),
    anthropic: active && hasTeamKey(team, "anthropic"),
    deepseek: active && hasTeamKey(team, "deepseek"),
  };
};

/** Whether the team's keys may run `model` (the team admin's model restriction). */
export const teamAllowsModel = (team: Pick<TeamRecord, "allowedModels"> | null | undefined, model: string): boolean =>
  !team?.allowedModels?.length || team.allowedModels.includes(model);

export type InviteState = "valid" | "expired" | "full" | "revoked";

export function inviteState(inv: Pick<TeamInviteRecord, "expiresAt" | "maxUses" | "uses" | "revokedAt">, now: string): InviteState {
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt && inv.expiresAt <= now) return "expired";
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return "full";
  return "valid";
}

// --- API shapes ---------------------------------------------------------------

export interface TeamKeyStatus {
  registered: boolean;
  last4: string | null;
  updatedAt: string | null;
  /** The deployment's default (WBAI) key, assigned by a site admin */
  useDefault?: boolean;
}

/** GET /teams: the teams the caller belongs to */
export interface TeamSummary {
  teamId: string;
  name: string;
  role: TeamRole;
  memberCount: number;
  /** Providers the team's budget covers now */
  keys: Partial<Record<ModelProvider, boolean>>;
  budgetState: BudgetState;
  /** ISO end of the budget (null: none) */
  budgetEndsAt: string | null;
}

export interface ListTeamsResponse {
  items: TeamSummary[];
}

export interface TeamMemberView {
  userId: string;
  role: TeamRole;
  joinedAt: string;
  displayName: string;
  /** Team admins only */
  email?: string;
  /** Team-key cost of the member's jobs (USD): all time and the current UTC month; team admins see every member, members themselves */
  costUsd?: number;
  monthCostUsd?: number;
  lastJobAt?: string | null;
}

export interface TeamInviteView {
  token: string;
  url: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  state: InviteState;
}

/** GET /teams/:id */
export interface TeamDetail {
  teamId: string;
  name: string;
  role: TeamRole;
  members: TeamMemberView[];
  keys: Record<ModelProvider, TeamKeyStatus>;
  /** Team-key cost of the whole team (team admins) or the caller's own (members) */
  usage: { costUsd: number; monthCostUsd: number; month: string; jobs: number; usage: TokenUsage };
  /** The caller's own team-key cost this month (for the per-member limit) */
  ownMonthCostUsd: number;
  /** The team's whole cost this month (for the team's limit) */
  teamMonthCostUsd: number;
  budget: TeamBudget & { state: BudgetState };
  limits: TeamLimits;
  allowedModels: string[] | null;
  /** Team admins only: the models the team's keys can run (for the allowed-models setting) */
  keyModels?: string[];
  /** Team admins only: team-key cost per project (most expensive first) */
  projects?: TeamProjectCost[];
  /** Team admins only */
  invite?: TeamInviteView | null;
  sentInvites?: (TeamSentInvite & { joined: boolean })[];
  createdAt: string;
}

/** How the viewer may act on an item (GET /projects/:id, /plans/:id): its creator, the team's admin, or a member who reads. */
export type TeamAccess = "owner" | "admin" | "member";

/** Team-key cost of one project (team admins). */
export interface TeamProjectCost {
  projectId: string;
  name: string;
  ownerName: string;
  costUsd: number;
  monthCostUsd: number;
}

/** PUT /teams/:id/settings (team admins; each field optional) */
export interface UpdateTeamSettingsRequest {
  budget?: { startsAt: string | null; endsAt: string | null };
  limits?: Partial<TeamLimits>;
  allowedModels?: string[] | null;
}

/** GET /admin/teams (site admins) */
export interface AdminTeamSummary {
  teamId: string;
  name: string;
  memberCount: number;
  admins: { userId: string; email: string }[];
  keys: Record<ModelProvider, TeamKeyStatus>;
  budget: TeamBudget & { state: BudgetState };
  monthCostUsd: number;
  costUsd: number;
  createdAt: string;
}

export interface CreateTeamRequest {
  name: string;
}

export interface CreateInviteRequest {
  /** ISO time; null / absent = no expiry */
  expiresAt?: string | null;
  /** null / absent = no limit */
  maxUses?: number | null;
}

/** GET /invites/:token (no sign-in needed) */
export interface InviteInfo {
  teamName: string;
  state: InviteState;
  expiresAt: string | null;
}

export interface JoinTeamResponse {
  teamId: string;
  name: string;
  alreadyMember: boolean;
}

/** The invite link's path on the site. */
export const invitePath = (token: string) => `/join/${token}`;
