/**
 * Teams (Catalog kind "team") and their invite links (kind "team-invite"). A team's key pays for the jobs of the
 * missions, projects and Canons in its workspace; membership is checked on every request that names a team.
 */
import { randomBytes } from "node:crypto";
import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { HTTPException } from "hono/http-exception";
import type { JobRecord, TeamProjectCost, TeamDetail, TeamInviteRecord, TeamInviteView, TeamMemberView, TeamRecord, TeamRole, TeamSummary, UserRecord } from "@cobrac/shared";
import {
  CLAUDE_MODELS,
  DEEPSEEK_MODELS,
  EMPTY_USAGE,
  MODEL_PROVIDERS,
  filterCodexModels,
  TEAM_CATALOG_KIND,
  TEAM_INVITE_CATALOG_KIND,
  addUsage,
  budgetState,
  hasTeamKey,
  inviteState,
  invitePath,
  isProjectlessMode,
  projectDisplayName,
  isTeamAdmin,
  isTeamId,
  nowIso,
  teamKeysAvailable,
  teamRoleOf,
} from "@cobrac/shared";
import { env } from "../env.js";
import { ddb, getProject, getUser, updateUser } from "./db.js";
import { bad } from "./http.js";
import { getDefaultKey } from "./orgKey.js";

const notFound = () => new HTTPException(404, { message: "チームが見つかりません" });

export async function getTeam(teamId: string): Promise<TeamRecord | null> {
  if (!isTeamId(teamId)) return null;
  const r = await ddb.send(new GetCommand({ TableName: env.tables.catalog, Key: { kind: TEAM_CATALOG_KIND, id: teamId } }));
  return (r.Item as TeamRecord) ?? null;
}

/**
 * Writes the team only if nobody changed it since `prev` was read (`updatedAt`), so two admins editing the member
 * list at once cannot drop each other's change; `prev` null = a new team.
 */
export async function saveTeam(team: TeamRecord, prev: Pick<TeamRecord, "updatedAt"> | null): Promise<void> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: env.tables.catalog,
        Item: team,
        ...(prev
          ? { ConditionExpression: "updatedAt = :u", ExpressionAttributeValues: { ":u": prev.updatedAt } }
          : { ConditionExpression: "attribute_not_exists(id)" }),
      }),
    );
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw new HTTPException(409, { message: "チームがほかの操作で更新されました。もう一度お試しください" });
    throw e;
  }
}

/** Reads the team, applies `change` and saves it (retried when another request changed it in between). */
export async function updateTeam(teamId: string, change: (t: TeamRecord) => void | Promise<void>): Promise<TeamRecord> {
  for (let i = 0; ; i++) {
    const prev = await getTeam(teamId);
    if (!prev) throw notFound();
    const next: TeamRecord = structuredClone(prev);
    await change(next);
    next.updatedAt = nowIso();
    if (next.updatedAt === prev.updatedAt) next.updatedAt = new Date(Date.parse(prev.updatedAt) + 1).toISOString();
    try {
      await saveTeam(next, prev);
      return next;
    } catch (e) {
      if (i < 2 && e instanceof HTTPException && e.status === 409) continue;
      throw e;
    }
  }
}

/** Every team (site admins; Catalog partition "team"). */
export async function listAllTeams(): Promise<TeamRecord[]> {
  const out: TeamRecord[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({ TableName: env.tables.catalog, KeyConditionExpression: "#k = :k", ExpressionAttributeNames: { "#k": "kind" }, ExpressionAttributeValues: { ":k": TEAM_CATALOG_KIND }, ExclusiveStartKey: start }),
    );
    out.push(...((r.Items as TeamRecord[]) ?? []));
    start = r.LastEvaluatedKey;
  } while (start);
  return out;
}

/** The teams of `teamIds` that exist (one BatchGet per 100). */
export async function getTeams(teamIds: string[]): Promise<TeamRecord[]> {
  const ids = [...new Set(teamIds.filter(isTeamId))];
  const out: TeamRecord[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const keys = ids.slice(i, i + 100).map((id) => ({ kind: TEAM_CATALOG_KIND, id }));
    const r = await ddb.send(new BatchGetCommand({ RequestItems: { [env.tables.catalog]: { Keys: keys } } }));
    out.push(...((r.Responses?.[env.tables.catalog] as TeamRecord[]) ?? []));
  }
  return out;
}

/** The team `teamId` when `u` belongs to it; 404 otherwise (a team the caller is not in is not shown to exist). */
export async function requireTeamMember(u: UserRecord, teamId: unknown): Promise<TeamRecord> {
  if (!isTeamId(teamId)) throw notFound();
  const team = await getTeam(teamId);
  if (!team || !teamRoleOf(team, u.userId)) throw notFound();
  return team;
}

export async function requireTeamAdmin(u: UserRecord, teamId: unknown): Promise<TeamRecord> {
  const team = await requireTeamMember(u, teamId);
  if (!isTeamAdmin(team, u.userId)) throw new HTTPException(403, { message: "チーム管理者だけができる操作です" });
  return team;
}

/**
 * The team workspace a create request names (`teamId`): null for the personal workspace; the team when the caller
 * belongs to it (400 when the value is not a team ID, 404 when the caller is not a member).
 */
export async function requestedTeam(u: UserRecord, teamId: unknown): Promise<TeamRecord | null> {
  if (teamId === undefined || teamId === null || teamId === "") return null;
  if (!isTeamId(teamId)) throw bad("teamId が不正です");
  return requireTeamMember(u, teamId);
}

/**
 * The team of an existing item (`teamId` on a project, plan or Canon) for its owner's next job: the team while the
 * owner still belongs to it; null (personal keys) when the item is personal or the owner has left the team.
 */
export async function itemTeam(ownerUserId: string, teamId: string | null | undefined): Promise<TeamRecord | null> {
  if (!teamId) return null;
  const team = await getTeam(teamId);
  return team && teamRoleOf(team, ownerUserId) ? team : null;
}

/** Workspace filter of a list request: `?team=<teamId>` lists that team's items, absent lists personal ones. */
export async function listSpace(u: UserRecord, team: string | undefined): Promise<string | null> {
  if (!team) return null;
  return (await requireTeamMember(u, team)).teamId;
}

/** How `u` may act on an item of `ownerUserId` (null: not at all): owner, the team's admin, or a member who reads. */
export type TeamAccess = "owner" | "admin" | "member";

export async function teamItemAccess(u: Pick<UserRecord, "userId">, ownerUserId: string, teamId: string | null | undefined): Promise<TeamAccess | null> {
  if (ownerUserId === u.userId) return "owner";
  if (!teamId) return null;
  const team = await getTeam(teamId);
  const role = team ? teamRoleOf(team, u.userId) : null;
  return role === "admin" ? "admin" : role ? "member" : null;
}

export const inSpace = (item: { teamId?: string | null }, space: string | null): boolean => (item.teamId ?? null) === space;

// --- membership ---------------------------------------------------------------

/** Adds `teamId` to the user's list (kept in step with the team's member list). */
export async function addUserTeam(userId: string, teamId: string) {
  const u = await getUser(userId);
  if (!u) return;
  const ids = u.teamIds ?? [];
  if (!ids.includes(teamId)) await updateUser(userId, { teamIds: [...ids, teamId] });
}

export async function removeUserTeam(userId: string, teamId: string) {
  const u = await getUser(userId);
  if (!u?.teamIds?.includes(teamId)) return;
  await updateUser(userId, { teamIds: u.teamIds.filter((id) => id !== teamId) });
}

/** 400 when the change would leave the team without an admin. */
export function keepAnAdmin(team: TeamRecord) {
  if (!team.members.some((m) => m.role === "admin")) throw bad("チーム管理者が 1 人以上必要です");
}

export function addMember(team: TeamRecord, userId: string, role: TeamRole): boolean {
  if (teamRoleOf(team, userId)) return false;
  team.members.push({ userId, role, joinedAt: nowIso() });
  return true;
}

// --- invite links -------------------------------------------------------------

export const newInviteToken = () => randomBytes(18).toString("base64url");

export async function getInvite(token: string): Promise<TeamInviteRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.catalog, Key: { kind: TEAM_INVITE_CATALOG_KIND, id: token } }));
  return (r.Item as TeamInviteRecord) ?? null;
}

export async function putInvite(inv: TeamInviteRecord) {
  await ddb.send(new PutCommand({ TableName: env.tables.catalog, Item: inv }));
}

export async function revokeInvite(token: string) {
  await ddb.send(
    new UpdateCommand({
      TableName: env.tables.catalog,
      Key: { kind: TEAM_INVITE_CATALOG_KIND, id: token },
      UpdateExpression: "SET revokedAt = :t",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: { ":t": nowIso() },
    }),
  ).catch((e) => {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
  });
}

/** Counts one use of a valid invite (false when it became invalid or full meanwhile). */
export async function useInvite(inv: TeamInviteRecord): Promise<boolean> {
  const now = nowIso();
  const conds = ["attribute_exists(id)", "attribute_not_exists(revokedAt) OR revokedAt = :null"];
  const values: Record<string, unknown> = { ":one": 1, ":null": null };
  if (inv.expiresAt) {
    conds.push("expiresAt > :now");
    values[":now"] = now;
  }
  if (inv.maxUses !== null) {
    conds.push("uses < maxUses");
  }
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.catalog,
        Key: { kind: TEAM_INVITE_CATALOG_KIND, id: inv.id },
        UpdateExpression: "SET uses = uses + :one",
        ConditionExpression: conds.map((c) => `(${c})`).join(" AND "),
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

export const inviteUrl = (token: string) => `${env.siteUrl.replace(/\/$/, "")}${invitePath(token)}`;

export function inviteView(inv: TeamInviteRecord | null): TeamInviteView | null {
  if (!inv) return null;
  return { token: inv.id, url: inviteUrl(inv.id), expiresAt: inv.expiresAt, maxUses: inv.maxUses, uses: inv.uses, state: inviteState(inv, nowIso()) };
}

/** Optional ISO time in the future (null: none). */
export function readExpiry(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw bad("期限が不正です");
  const iso = new Date(v).toISOString();
  if (iso <= nowIso()) throw bad("期限は未来の日時にしてください");
  return iso;
}

export function readMaxUses(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 10_000) throw bad("人数の上限は 1〜10000 の整数にしてください");
  return n;
}

// --- usage ----------------------------------------------------------------------

/**
 * Items of a team's workspace through the `team-index` GSI (PK teamId, SK createdAt) of the Projects, Jobs, Plans and
 * Canons tables; `since` limits it to items created at or after that time. Only items in a team's workspace carry
 * `teamId`, so the index holds nothing else.
 */
export async function queryTeamIndex<T>(table: string, teamId: string, since?: string): Promise<T[]> {
  const out: T[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table,
        IndexName: "team-index",
        KeyConditionExpression: since ? "teamId = :t AND createdAt >= :s" : "teamId = :t",
        ExpressionAttributeValues: { ":t": teamId, ...(since ? { ":s": since } : {}) },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...((r.Items as T[]) ?? []));
    start = r.LastEvaluatedKey;
  } while (start);
  return out.filter((x) => (x as { teamId?: string }).teamId === teamId);
}

/** Every job that ran with the team's key (`since`: created at or after it). */
export async function listTeamJobs(teamId: string, since?: string): Promise<JobRecord[]> {
  return (await queryTeamIndex<JobRecord>(env.tables.jobs, teamId, since)).filter((j) => j.keySource === "team");
}

/** First instant of the current UTC month (the limits count from it). */
export const monthStart = (now = nowIso()) => `${now.slice(0, 7)}-01T00:00:00.000Z`;

/** Team-key cost this month: the whole team's and `userId`'s. */
export async function monthCosts(teamId: string, userId: string): Promise<{ team: number; own: number }> {
  let team = 0;
  let own = 0;
  for (const j of await listTeamJobs(teamId, monthStart())) {
    team += j.costUsd ?? 0;
    if (j.userId === userId) own += j.costUsd ?? 0;
  }
  return { team: round(team), own: round(own) };
}

/**
 * 403 when a new team-key job of `userId` would go over the team's monthly limit or the per-member one (running jobs
 * finish; only new ones are refused).
 */
export async function requireUnderLimits(team: TeamRecord, userId: string): Promise<void> {
  const { monthUsd, memberMonthUsd } = team.limits ?? { monthUsd: null, memberMonthUsd: null };
  if (monthUsd == null && memberMonthUsd == null) return;
  const cost = await monthCosts(team.teamId, userId);
  if (monthUsd != null && cost.team >= monthUsd) throw new HTTPException(403, { message: "チームの今月の利用上限に達しました。チーム管理者にご相談ください" });
  if (memberMonthUsd != null && cost.own >= memberMonthUsd) throw new HTTPException(403, { message: "このチームでのあなたの今月の利用上限に達しました。チーム管理者にご相談ください" });
}

/** GET /teams row of one team. */
export const teamSummary = (t: TeamRecord, userId: string): TeamSummary => ({
  teamId: t.teamId,
  name: t.name,
  role: teamRoleOf(t, userId) ?? "member",
  memberCount: t.members.length,
  keys: teamKeysAvailable(t),
  budgetState: budgetState(t),
  budgetEndsAt: t.budget?.endsAt ?? null,
});

export const keyStatus = (team: TeamRecord): TeamDetail["keys"] =>
  Object.fromEntries(
    MODEL_PROVIDERS.map((p) => {
      const k = team.keys?.[p];
      return [p, { registered: hasTeamKey(team, p), last4: k?.last4 ?? null, updatedAt: k?.updatedAt ?? null, ...(k?.useDefault ? { useDefault: true } : {}) }];
    }),
  ) as TeamDetail["keys"];

export const budgetView = (team: TeamRecord) => ({ startsAt: null, endsAt: null, ...(team.budget ?? {}), state: budgetState(team) });

interface CostRow {
  costUsd: number;
  monthCostUsd: number;
  jobs: number;
  usage: JobRecord["usage"] & object;
  lastJobAt: string | null;
}

const round = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

/** Team-key cost per user; `month` (YYYY-MM, UTC) is counted in `monthCostUsd`. */
export function teamCosts(jobs: JobRecord[], month: string): Map<string, CostRow> {
  const rows = new Map<string, CostRow>();
  for (const j of jobs) {
    const r = rows.get(j.userId) ?? { costUsd: 0, monthCostUsd: 0, jobs: 0, usage: EMPTY_USAGE, lastJobAt: null };
    r.jobs++;
    if (j.usage) r.usage = addUsage(r.usage, j.usage);
    if (j.costUsd) {
      r.costUsd += j.costUsd;
      if (j.createdAt.startsWith(month)) r.monthCostUsd += j.costUsd;
    }
    if (!r.lastJobAt || j.createdAt > r.lastJobAt) r.lastJobAt = j.createdAt;
    rows.set(j.userId, r);
  }
  for (const r of rows.values()) {
    r.costUsd = round(r.costUsd);
    r.monthCostUsd = round(r.monthCostUsd);
  }
  return rows;
}

/** The models the team's keys can run (OpenAI: the key's snapshot, or the default key's when assigned). */
async function teamKeyModels(team: TeamRecord): Promise<string[]> {
  const out: string[] = [];
  if (hasTeamKey(team, "openai")) {
    const k = team.keys!.openai!;
    out.push(...filterCodexModels(k.useDefault ? ((await getDefaultKey("openai"))?.availableModels ?? []) : (k.models ?? [])));
  }
  if (hasTeamKey(team, "anthropic")) out.push(...CLAUDE_MODELS);
  if (hasTeamKey(team, "deepseek")) out.push(...DEEPSEEK_MODELS);
  return [...new Set(out)];
}

/** Team-key cost per project (projectless jobs, such as Canon reviews and mission drafts, are left out). */
async function projectCosts(jobs: JobRecord[], month: string, users: Map<string, UserRecord>): Promise<TeamProjectCost[]> {
  const rows = new Map<string, TeamProjectCost & { userId: string }>();
  for (const j of jobs) {
    if (isProjectlessMode(j.type)) continue;
    const r = rows.get(j.projectId) ?? { projectId: j.projectId, userId: j.userId, name: j.projectId, ownerName: "", costUsd: 0, monthCostUsd: 0 };
    r.costUsd += j.costUsd ?? 0;
    if (j.createdAt.startsWith(month)) r.monthCostUsd += j.costUsd ?? 0;
    rows.set(j.projectId, r);
  }
  const out: TeamProjectCost[] = [];
  for (const r of rows.values()) {
    const p = await getProject(r.userId, r.projectId);
    const u = users.get(r.userId) ?? (await getUser(r.userId));
    out.push({ projectId: r.projectId, name: p ? projectDisplayName(p) : r.projectId, ownerName: u?.contributorName?.trim() || u?.displayName || "—", costUsd: round(r.costUsd), monthCostUsd: round(r.monthCostUsd) });
  }
  return out.sort((a, b) => b.costUsd - a.costUsd);
}

/** GET /teams/:id as `viewer` sees it: admins get e-mail addresses, everyone's cost and the invite link. */
export async function teamDetail(team: TeamRecord, viewer: UserRecord, invite: TeamInviteRecord | null, jobs: JobRecord[]): Promise<TeamDetail> {
  const admin = isTeamAdmin(team, viewer.userId);
  const month = nowIso().slice(0, 7);
  const costs = teamCosts(jobs, month);
  const users = new Map((await Promise.all(team.members.map((m) => getUser(m.userId)))).filter((x): x is UserRecord => !!x).map((x) => [x.userId, x]));
  const members: TeamMemberView[] = team.members.map((m) => {
    const u = users.get(m.userId);
    const c = costs.get(m.userId);
    const showCost = admin || m.userId === viewer.userId;
    return {
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      displayName: u?.contributorName?.trim() || u?.displayName || "—",
      ...(admin ? { email: u?.email ?? "" } : {}),
      ...(showCost ? { costUsd: c?.costUsd ?? 0, monthCostUsd: c?.monthCostUsd ?? 0, lastJobAt: c?.lastJobAt ?? null } : {}),
    };
  });
  const counted = admin ? [...costs.values()] : [costs.get(viewer.userId)].filter((x): x is CostRow => !!x);
  const usage = counted.reduce(
    (a, r) => ({ costUsd: a.costUsd + r.costUsd, monthCostUsd: a.monthCostUsd + r.monthCostUsd, jobs: a.jobs + r.jobs, usage: addUsage(a.usage, r.usage) }),
    { costUsd: 0, monthCostUsd: 0, jobs: 0, usage: EMPTY_USAGE },
  );
  const memberEmails = new Set([...users.values()].map((x) => (x.email ?? "").toLowerCase()));
  const keys = keyStatus(team);
  let teamMonth = 0;
  for (const r of costs.values()) teamMonth += r.monthCostUsd;
  return {
    teamId: team.teamId,
    name: team.name,
    ...(admin ? { projects: await projectCosts(jobs, month, users), keyModels: await teamKeyModels(team) } : {}),
    role: admin ? "admin" : "member",
    members,
    keys,
    usage: { costUsd: round(usage.costUsd), monthCostUsd: round(usage.monthCostUsd), month, jobs: usage.jobs, usage: usage.usage },
    ownMonthCostUsd: costs.get(viewer.userId)?.monthCostUsd ?? 0,
    teamMonthCostUsd: round(teamMonth),
    budget: budgetView(team),
    limits: team.limits ?? { monthUsd: null, memberMonthUsd: null },
    allowedModels: team.allowedModels ?? null,
    ...(admin
      ? {
          invite: inviteView(invite),
          sentInvites: (team.sentInvites ?? []).map((s) => ({ ...s, joined: memberEmails.has(s.email.toLowerCase()) })).reverse(),
        }
      : {}),
    createdAt: team.createdAt,
  };
}

// --- budget and limits ------------------------------------------------------------

const optIso = (v: unknown, what: string): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw bad(`${what}が不正です`);
  return new Date(v).toISOString();
};

/** The budget's period from a settings request (start and end optional; the end after the start). */
export function readBudget(v: unknown): { startsAt: string | null; endsAt: string | null } {
  if (!v || typeof v !== "object") throw bad("予算の期間が不正です");
  const b = v as { startsAt?: unknown; endsAt?: unknown };
  const startsAt = optIso(b.startsAt, "開始日時");
  const endsAt = optIso(b.endsAt, "終了日時");
  if (startsAt && endsAt && endsAt <= startsAt) throw bad("終了日時は開始日時より後にしてください");
  return { startsAt, endsAt };
}

const optUsd = (v: unknown, what: string): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw bad(`${what}は 0〜1000000 の数にしてください`);
  return Math.round(n * 100) / 100;
};

/** Limits from a settings request; a field left out keeps its current value. */
export function readLimits(v: unknown, prev: TeamRecord["limits"]): NonNullable<TeamRecord["limits"]> {
  if (!v || typeof v !== "object") throw bad("上限の指定が不正です");
  const l = v as Record<string, unknown>;
  return {
    monthUsd: "monthUsd" in l ? optUsd(l.monthUsd, "チームの月の上限") : (prev?.monthUsd ?? null),
    memberMonthUsd: "memberMonthUsd" in l ? optUsd(l.memberMonthUsd, "メンバーごとの月の上限") : (prev?.memberMonthUsd ?? null),
  };
}
