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
  encryptedApiKey: string;
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

/** Which providers have a team key (the team's budget). */
export const teamKeysAvailable = (team: Pick<TeamRecord, "keys"> | null | undefined): Partial<Record<ModelProvider, boolean>> => ({
  openai: !!team?.keys?.openai?.encryptedApiKey,
  anthropic: !!team?.keys?.anthropic?.encryptedApiKey,
  deepseek: !!team?.keys?.deepseek?.encryptedApiKey,
});

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
}

/** GET /teams: the teams the caller belongs to */
export interface TeamSummary {
  teamId: string;
  name: string;
  role: TeamRole;
  memberCount: number;
  /** Providers with a team key */
  keys: Partial<Record<ModelProvider, boolean>>;
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
  /** Team admins only */
  invite?: TeamInviteView | null;
  sentInvites?: (TeamSentInvite & { joined: boolean })[];
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
