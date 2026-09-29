import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { JobRecord, MessageRecord, MessageRole, MessageType, ProjectRecord, UserRecord, WorkflowStep } from "@cobrac/shared";
import { ACTIVE_PROJECT_STATUSES, generateUserKey, isProjectDeleted, newId, nowIso } from "@cobrac/shared";
import { env } from "../env.js";
import { ownedJobs } from "./ownership.js";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env.region }), {
  marshallOptions: { removeUndefinedValues: true },
});

// --- generic ----------------------------------------------------------------

export async function updateItem(table: string, key: Record<string, string>, values: Record<string, unknown>) {
  const entries = Object.entries({ ...values, updatedAt: nowIso() }).filter(([, v]) => v !== undefined);
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};
  const sets: string[] = [];
  entries.forEach(([k, v], i) => {
    names[`#k${i}`] = k;
    vals[`:v${i}`] = v;
    sets.push(`#k${i} = :v${i}`);
  });
  await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    }),
  );
}

export function encodeCursor(key: Record<string, unknown> | undefined): string | null {
  return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null;
}
export function decodeCursor(cursor: string | undefined | null): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

// --- users ------------------------------------------------------------------

export async function getUser(userId: string): Promise<UserRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.users, Key: { userId } }));
  return (r.Item as UserRecord) ?? null;
}
export async function putUser(u: UserRecord, ifNotExists = false) {
  await ddb.send(
    new PutCommand({ TableName: env.tables.users, Item: u, ...(ifNotExists ? { ConditionExpression: "attribute_not_exists(userId)" } : {}) }),
  );
}
export function updateUser(userId: string, values: Partial<UserRecord>) {
  return updateItem(env.tables.users, { userId }, values);
}
export async function findUserByKey(userKey: string): Promise<UserRecord | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.users,
      IndexName: "userKey-index",
      KeyConditionExpression: "userKey = :k",
      ExpressionAttributeValues: { ":k": userKey },
      Limit: 1,
    }),
  );
  return ((r.Items as UserRecord[]) ?? [])[0] ?? null;
}

/** A userKey that no other user holds (checked through the GSI; collisions are practically impossible). */
export async function newUniqueUserKey(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const key = generateUserKey();
    if (!(await findUserByKey(key))) return key;
  }
  throw new Error("could not issue a unique userKey");
}

/** Issue the user's key once; returns the key already stored when another request won the race. */
export async function assignUserKey(userId: string): Promise<string> {
  const key = await newUniqueUserKey();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.users,
        Key: { userId },
        UpdateExpression: "SET userKey = :k, updatedAt = :t",
        ConditionExpression: "attribute_exists(userId) AND attribute_not_exists(userKey)",
        ExpressionAttributeValues: { ":k": key, ":t": nowIso() },
      }),
    );
    return key;
  } catch (e) {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
    const u = await getUser(userId);
    if (!u?.userKey) throw e;
    return u.userKey;
  }
}

/** Atomic per-user counter for Project IDs. Numbers lost to failed creations are never reused. */
export async function nextProjectSeq(userId: string): Promise<number> {
  const r = await ddb.send(
    new UpdateCommand({
      TableName: env.tables.users,
      Key: { userId },
      UpdateExpression: "ADD projectSeq :one",
      ConditionExpression: "attribute_exists(userId)",
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  return Number(r.Attributes?.projectSeq);
}

export async function listUsers(): Promise<UserRecord[]> {
  const r = await ddb.send(new ScanCommand({ TableName: env.tables.users }));
  return (r.Items as UserRecord[]) ?? [];
}

// --- projects ---------------------------------------------------------------

export async function getProject(userId: string, projectId: string): Promise<ProjectRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.projects, Key: { userId, projectId } }));
  return (r.Item as ProjectRecord) ?? null;
}
export async function putProject(p: ProjectRecord, ifNotExists = false) {
  await ddb.send(
    new PutCommand({
      TableName: env.tables.projects,
      Item: p,
      ...(ifNotExists ? { ConditionExpression: "attribute_not_exists(projectId)" } : {}),
    }),
  );
}
export function updateProject(userId: string, projectId: string, values: Partial<ProjectRecord>) {
  return updateItem(env.tables.projects, { userId, projectId }, values);
}
export async function listProjects(userId: string, limit = 50, cursor?: string) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.projects,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
      Limit: limit,
      ExclusiveStartKey: decodeCursor(cursor),
    }),
  );
  const items = ((r.Items as ProjectRecord[]) ?? []).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { items, nextCursor: encodeCursor(r.LastEvaluatedKey) };
}
/** Every project of one user (paginated Query). */
export async function listUserProjects(userId: string): Promise<ProjectRecord[]> {
  const out: ProjectRecord[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: env.tables.projects,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...((r.Items as ProjectRecord[]) ?? []));
    start = r.LastEvaluatedKey;
  } while (start);
  return out;
}

export async function findProjectByLegacyId(userId: string, legacyId: string): Promise<ProjectRecord | null> {
  return (await listUserProjects(userId)).find((p) => p.legacyId === legacyId && !isProjectDeleted(p)) ?? null;
}

/**
 * Soft delete: sets deletedAt / deletedBy only. Fails with ConditionalCheckFailedException when the project
 * is already deleted or a job started in the meantime (status is re-checked atomically).
 */
export async function markProjectDeleted(userId: string, projectId: string, deletedBy: string): Promise<string> {
  const now = nowIso();
  const statuses = Object.fromEntries(ACTIVE_PROJECT_STATUSES.map((s, i) => [`:s${i}`, s]));
  await ddb.send(
    new UpdateCommand({
      TableName: env.tables.projects,
      Key: { userId, projectId },
      UpdateExpression: "SET deletedAt = :t, deletedBy = :by, updatedAt = :t",
      ConditionExpression: ["attribute_exists(projectId)", "attribute_not_exists(deletedAt)", ...Object.keys(statuses).map((k) => `#s <> ${k}`)].join(" AND "),
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":t": now, ":by": deletedBy, ...statuses },
    }),
  );
  return now;
}

export async function listAllProjects(): Promise<ProjectRecord[]> {
  const r = await ddb.send(new ScanCommand({ TableName: env.tables.projects }));
  return (r.Items as ProjectRecord[]) ?? [];
}

// --- jobs -------------------------------------------------------------------

export async function getJob(projectId: string, jobId: string): Promise<JobRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.jobs, Key: { projectId, jobId } }));
  return (r.Item as JobRecord) ?? null;
}
export async function putJob(j: JobRecord) {
  await ddb.send(new PutCommand({ TableName: env.tables.jobs, Item: j }));
}
export function updateJob(projectId: string, jobId: string, values: Partial<JobRecord>) {
  return updateItem(env.tables.jobs, { projectId, jobId }, values);
}
export async function listJobsByStatus(status: JobRecord["status"]): Promise<JobRecord[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.jobs,
      IndexName: "status-index",
      KeyConditionExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": status },
    }),
  );
  return (r.Items as JobRecord[]) ?? [];
}
/** Jobs of one project owned by `userId` (legacy Project IDs could be shared by several users). */
export async function listJobsForProject(projectId: string, userId: string): Promise<JobRecord[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.jobs,
      KeyConditionExpression: "projectId = :p",
      ExpressionAttributeValues: { ":p": projectId },
    }),
  );
  return ownedJobs((r.Items as JobRecord[]) ?? [], userId);
}

// --- messages ---------------------------------------------------------------

export async function listMessages(projectId: string, limit = 200, cursor?: string, reverse = false) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.messages,
      KeyConditionExpression: "projectId = :p",
      ExpressionAttributeValues: { ":p": projectId },
      Limit: limit,
      ScanIndexForward: !reverse,
      ExclusiveStartKey: decodeCursor(cursor),
    }),
  );
  return { items: (r.Items as MessageRecord[]) ?? [], nextCursor: encodeCursor(r.LastEvaluatedKey) };
}

export async function putMessage(
  projectId: string,
  jobId: string,
  role: MessageRole,
  type: MessageType,
  content: string,
  opts: { userId?: string; step?: WorkflowStep | null; meta?: Record<string, unknown> } = {},
): Promise<MessageRecord> {
  const createdAt = nowIso();
  const msg: MessageRecord = {
    projectId,
    userId: opts.userId,
    sk: `${createdAt}#${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}`,
    messageId: newId("m_"),
    jobId,
    role,
    type,
    content,
    step: opts.step ?? null,
    meta: opts.meta,
    createdAt,
  };
  await ddb.send(new PutCommand({ TableName: env.tables.messages, Item: msg }));
  return msg;
}

// --- websocket connections --------------------------------------------------

export interface WsConnectionItem {
  connectionId: string;
  projectId: string; // "_" for the base connection record
  userId: string;
  ttl: number;
}

export async function putWsConnection(item: WsConnectionItem) {
  await ddb.send(new PutCommand({ TableName: env.tables.wsConnections, Item: item }));
}
export async function deleteWsConnection(connectionId: string, projectId: string) {
  await ddb.send(new DeleteCommand({ TableName: env.tables.wsConnections, Key: { connectionId, projectId } }));
}
export async function getWsConnection(connectionId: string, projectId = "_"): Promise<WsConnectionItem | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.wsConnections, Key: { connectionId, projectId } }));
  return (r.Item as WsConnectionItem) ?? null;
}
export async function listWsConnectionRows(connectionId: string): Promise<WsConnectionItem[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.wsConnections,
      KeyConditionExpression: "connectionId = :c",
      ExpressionAttributeValues: { ":c": connectionId },
    }),
  );
  return (r.Items as WsConnectionItem[]) ?? [];
}
export async function listSubscribers(projectId: string): Promise<WsConnectionItem[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.wsConnections,
      IndexName: "project-index",
      KeyConditionExpression: "projectId = :p",
      ExpressionAttributeValues: { ":p": projectId },
    }),
  );
  return (r.Items as WsConnectionItem[]) ?? [];
}
