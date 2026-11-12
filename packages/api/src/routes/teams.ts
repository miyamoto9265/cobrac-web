/** Teams: create, members, roles, the team's API keys (its budget), the invite link and invitation e-mails (`/teams…`). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { CreateInviteRequest, CreateTeamRequest, InviteInfo, JoinTeamResponse, ListTeamsResponse, ModelProvider, TeamInviteRecord, TeamRecord, TeamRole } from "@cobrac/shared";
import {
  INVITE_TOKEN_REGEX,
  MODEL_PROVIDERS,
  TEAM_CATALOG_KIND,
  TEAM_INVITE_CATALOG_KIND,
  TEAM_INVITE_EMAILS_MAX,
  TEAM_MAX_MEMBERS,
  TEAM_NAME_MAX,
  TEAM_ROLES,
  TEAM_SENT_INVITES_MAX,
  inviteState,
  nowIso,
  teamKeysAvailable,
  teamRoleOf,
} from "@cobrac/shared";
import { encryptTeamKey } from "../lib/aws.js";
import { bad } from "../lib/http.js";
import { reserveNewId } from "../lib/catalog.js";
import {
  addMember,
  addUserTeam,
  getInvite,
  getTeam,
  getTeams,
  inviteUrl,
  keepAnAdmin,
  listTeamJobs,
  newInviteToken,
  putInvite,
  readExpiry,
  readMaxUses,
  removeUserTeam,
  requireTeamAdmin,
  requireTeamMember,
  revokeInvite,
  saveTeam,
  teamDetail,
  updateTeam,
  useInvite,
} from "../lib/teams.js";
import { sendTeamInviteEmail } from "../lib/teamEmails.js";
import { env } from "../env.js";
import { verifiedKey } from "./users.js";
import type { ApiEnv } from "./env.js";

export const teamsApi = new Hono<ApiEnv>();

function teamName(v: unknown): string {
  const name = (typeof v === "string" ? v : "").trim();
  if (!name) throw bad("チーム名を入力してください");
  if (name.length > TEAM_NAME_MAX) throw bad(`チーム名は ${TEAM_NAME_MAX} 文字までです`);
  return name;
}

function providerParam(v: string | undefined): ModelProvider {
  if (!v || !(MODEL_PROVIDERS as string[]).includes(v)) throw bad("provider が不正です");
  return v as ModelProvider;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

teamsApi.get("/teams", async (c) => {
  const u = c.get("user");
  const teams = (await getTeams(u.teamIds ?? [])).filter((t) => teamRoleOf(t, u.userId));
  const res: ListTeamsResponse = {
    items: teams
      .map((t) => ({ teamId: t.teamId, name: t.name, role: teamRoleOf(t, u.userId)!, memberCount: t.members.length, keys: teamKeysAvailable(t) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return c.json(res);
});

teamsApi.post("/teams", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateTeamRequest>;
  const name = teamName(body.name);
  const teamId = await reserveNewId("team", u.userId);
  const now = nowIso();
  const team: TeamRecord = {
    kind: TEAM_CATALOG_KIND,
    id: teamId,
    teamId,
    name,
    members: [{ userId: u.userId, role: "admin", joinedAt: now }],
    createdAt: now,
    createdBy: u.userId,
    updatedAt: now,
  };
  await saveTeam(team, null);
  await addUserTeam(u.userId, teamId);
  return c.json(await teamDetail(team, u, null, []), 201);
});

teamsApi.get("/teams/:id", async (c) => {
  const u = c.get("user");
  const team = await requireTeamMember(u, c.req.param("id"));
  const invite = team.inviteToken ? await getInvite(team.inviteToken) : null;
  return c.json(await teamDetail(team, u, invite, await listTeamJobs(team.teamId)));
});

teamsApi.put("/teams/:id", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateTeamRequest>;
  const name = teamName(body.name);
  const next = await updateTeam(team.teamId, (t) => {
    t.name = name;
  });
  return c.json({ teamId: next.teamId, name: next.name });
});

// --- members ------------------------------------------------------------------

teamsApi.put("/teams/:id/members/:userId", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const userId = c.req.param("userId");
  const { role } = (await c.req.json().catch(() => ({}))) as { role?: unknown };
  if (!(TEAM_ROLES as unknown[]).includes(role)) throw bad("role が不正です");
  await updateTeam(team.teamId, (t) => {
    const m = t.members.find((x) => x.userId === userId);
    if (!m) throw new HTTPException(404, { message: "メンバーが見つかりません" });
    m.role = role as TeamRole;
    keepAnAdmin(t);
  });
  return c.json({ ok: true });
});

/** A team admin removes a member, or a member leaves (their own userId). Their items stay in the team. */
teamsApi.delete("/teams/:id/members/:userId", async (c) => {
  const u = c.get("user");
  const userId = c.req.param("userId");
  const team = userId === u.userId ? await requireTeamMember(u, c.req.param("id")) : await requireTeamAdmin(u, c.req.param("id"));
  await updateTeam(team.teamId, (t) => {
    if (!teamRoleOf(t, userId)) throw new HTTPException(404, { message: "メンバーが見つかりません" });
    t.members = t.members.filter((m) => m.userId !== userId);
    if (t.members.length) keepAnAdmin(t);
    else throw bad("最後のメンバーは抜けられません");
  });
  await removeUserTeam(userId, team.teamId);
  return c.json({ ok: true });
});

// --- the team's API keys (its budget) -------------------------------------------

teamsApi.put("/teams/:id/keys/:provider", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const provider = providerParam(c.req.param("provider"));
  const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown; workspaceId?: unknown };
  const { key, stored, models } = await verifiedKey(provider, body);
  const encrypted = await encryptTeamKey(stored, team.teamId, provider);
  await updateTeam(team.teamId, (t) => {
    t.keys = { ...(t.keys ?? {}), [provider]: { encryptedApiKey: encrypted, last4: key.slice(-4), models, updatedAt: nowIso(), updatedBy: u.userId } };
  });
  return c.json({ registered: true, last4: key.slice(-4) });
});

teamsApi.delete("/teams/:id/keys/:provider", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const provider = providerParam(c.req.param("provider"));
  await updateTeam(team.teamId, (t) => {
    const keys = { ...(t.keys ?? {}) };
    delete keys[provider];
    t.keys = keys;
  });
  return c.json({ registered: false, last4: null });
});

// --- invite link ----------------------------------------------------------------

/** Creates the team's invite link, replacing (and revoking) the current one. */
teamsApi.post("/teams/:id/invite", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as CreateInviteRequest;
  const inv: TeamInviteRecord = {
    kind: TEAM_INVITE_CATALOG_KIND,
    id: newInviteToken(),
    teamId: team.teamId,
    createdAt: nowIso(),
    createdBy: u.userId,
    expiresAt: readExpiry(body.expiresAt),
    maxUses: readMaxUses(body.maxUses),
    uses: 0,
  };
  await putInvite(inv);
  const prev = team.inviteToken;
  await updateTeam(team.teamId, (t) => {
    t.inviteToken = inv.id;
  });
  if (prev) await revokeInvite(prev);
  return c.json({ token: inv.id, url: inviteUrl(inv.id), expiresAt: inv.expiresAt, maxUses: inv.maxUses, uses: 0, state: "valid" }, 201);
});

teamsApi.delete("/teams/:id/invite", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const prev = team.inviteToken;
  await updateTeam(team.teamId, (t) => {
    t.inviteToken = null;
  });
  if (prev) await revokeInvite(prev);
  return c.json({ ok: true });
});

/** E-mails the current invite link to each address (accounts are not needed). */
teamsApi.post("/teams/:id/invite/emails", async (c) => {
  const u = c.get("user");
  const team = await requireTeamAdmin(u, c.req.param("id"));
  const { emails } = (await c.req.json().catch(() => ({}))) as { emails?: unknown };
  if (!Array.isArray(emails) || !emails.length) throw bad("メールアドレスを入力してください");
  const list = [...new Set(emails.map((e) => (typeof e === "string" ? e.trim().toLowerCase() : "")))];
  if (list.length > TEAM_INVITE_EMAILS_MAX) throw bad(`一度に送れるのは ${TEAM_INVITE_EMAILS_MAX} 件までです`);
  const wrong = list.filter((e) => !EMAIL_RE.test(e) || e.length > 254);
  if (wrong.length) throw bad(`メールアドレスの形式が不正です: ${wrong.join(", ")}`);
  if (!env.emailFrom) throw new HTTPException(503, { message: "このサイトではメールを送れません。招待リンクを直接お知らせください" });
  const inv = team.inviteToken ? await getInvite(team.inviteToken) : null;
  if (!inv || inviteState(inv, nowIso()) !== "valid") throw bad("有効な招待リンクがありません。先に招待リンクを作ってください");
  const inviterName = u.contributorName?.trim() || u.displayName;
  const sent: string[] = [];
  const failed: string[] = [];
  for (const email of list) {
    try {
      await sendTeamInviteEmail(email, { teamName: team.name, inviterName, url: inviteUrl(inv.id), expiresAt: inv.expiresAt, siteUrl: env.siteUrl });
      sent.push(email);
    } catch (e) {
      console.error("team invite e-mail failed", e);
      failed.push(email);
    }
  }
  if (sent.length) {
    const at = nowIso();
    await updateTeam(team.teamId, (t) => {
      const kept = (t.sentInvites ?? []).filter((s) => !sent.includes(s.email));
      t.sentInvites = [...kept, ...sent.map((email) => ({ email, sentAt: at, sentBy: u.userId }))].slice(-TEAM_SENT_INVITES_MAX);
    });
  }
  return c.json({ sent, failed });
});

/** Joins the team of a valid invite link. */
teamsApi.post("/teams/join", async (c) => {
  const u = c.get("user");
  const { token } = (await c.req.json().catch(() => ({}))) as { token?: unknown };
  if (typeof token !== "string" || !INVITE_TOKEN_REGEX.test(token)) throw new HTTPException(404, { message: "招待リンクが見つかりません" });
  const inv = await getInvite(token);
  const team = inv ? await getTeam(inv.teamId) : null;
  if (!inv || !team) throw new HTTPException(404, { message: "招待リンクが見つかりません" });
  const res = (alreadyMember: boolean): JoinTeamResponse => ({ teamId: team.teamId, name: team.name, alreadyMember });
  if (teamRoleOf(team, u.userId)) {
    await addUserTeam(u.userId, team.teamId);
    return c.json(res(true));
  }
  // a link replaced by a newer one (or disabled) no longer lets anyone in
  const state = team.inviteToken === inv.id ? inviteState(inv, nowIso()) : "revoked";
  if (state !== "valid") throw new HTTPException(410, { message: state === "expired" ? "この招待リンクは期限が切れています" : state === "full" ? "この招待リンクは人数の上限に達しています" : "この招待リンクは無効になりました" });
  if (team.members.length >= TEAM_MAX_MEMBERS) throw new HTTPException(409, { message: "このチームは人数の上限に達しています" });
  if (!(await useInvite(inv))) throw new HTTPException(410, { message: "この招待リンクは使えなくなりました" });
  await updateTeam(team.teamId, (t) => {
    addMember(t, u.userId, "member");
  });
  await addUserTeam(u.userId, team.teamId);
  return c.json(res(false));
});

/** What the invite page shows before signing in (no sign-in needed; only the team's name and the link's state). */
export async function inviteInfo(token: string): Promise<InviteInfo> {
  if (!INVITE_TOKEN_REGEX.test(token)) throw new HTTPException(404, { message: "招待リンクが見つかりません" });
  const inv = await getInvite(token);
  const team = inv ? await getTeam(inv.teamId) : null;
  if (!inv || !team) throw new HTTPException(404, { message: "招待リンクが見つかりません" });
  const state = team.inviteToken === inv.id ? inviteState(inv, nowIso()) : "revoked";
  return { teamName: team.name, state, expiresAt: inv.expiresAt };
}
