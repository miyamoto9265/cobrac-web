import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  CanonRecord,
  JobRecord,
  MessageRecord,
  MessageRole,
  MessageType,
  ProjectRecord,
  TokenUsage,
  UserRecord,
  WorkflowStep,
} from "@cobrac/shared";
import { CANON_META_SK, EMPTY_USAGE, addUsage, newId, nowIso } from "@cobrac/shared";
import { env } from "./env.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env.region }), {
  marshallOptions: { removeUndefinedValues: true },
});

export async function getUser(userId: string): Promise<UserRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.users, Key: { userId } }));
  return (r.Item as UserRecord) ?? null;
}

/** Every user (paginated Scan); used to find the organization-key provider. */
export async function listUsers(): Promise<UserRecord[]> {
  const out: UserRecord[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: env.tables.users, ExclusiveStartKey: start }));
    out.push(...((r.Items as UserRecord[]) ?? []));
    start = r.LastEvaluatedKey;
  } while (start);
  return out;
}

export async function getProject(userId: string, projectId: string): Promise<ProjectRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.projects, Key: { userId, projectId } }));
  return (r.Item as ProjectRecord) ?? null;
}

export async function getCanonMeta(canonId: string): Promise<CanonRecord | null> {
  if (!env.tables.canons) return null;
  const r = await ddb.send(new GetCommand({ TableName: env.tables.canons, Key: { canonId, sk: CANON_META_SK } }));
  return (r.Item as CanonRecord) ?? null;
}

export async function getJob(projectId: string, jobId: string): Promise<JobRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.jobs, Key: { projectId, jobId } }));
  return (r.Item as JobRecord) ?? null;
}

type Updatable<T> = Partial<Omit<T, "userId" | "projectId" | "jobId">>;

async function update(table: string, key: Record<string, string>, values: Record<string, unknown>) {
  const entries = Object.entries({ ...values, updatedAt: nowIso() }).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
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

export function updateProject(userId: string, projectId: string, values: Updatable<ProjectRecord>) {
  return update(env.tables.projects, { userId, projectId }, values as Record<string, unknown>);
}

export function updateJob(projectId: string, jobId: string, values: Updatable<JobRecord>) {
  return update(env.tables.jobs, { projectId, jobId }, values as Record<string, unknown>);
}

/**
 * Recompute a project's aggregate usage / cost / models from all of its jobs.
 * Called after every turn; jobs are few per project so a Query is cheap.
 */
export async function refreshProjectUsage(userId: string, projectId: string): Promise<void> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.tables.jobs,
      KeyConditionExpression: "projectId = :p",
      ExpressionAttributeValues: { ":p": projectId },
      ProjectionExpression: "#u, #m, costUsd, userId",
      ExpressionAttributeNames: { "#u": "usage", "#m": "model" },
    }),
  );
  // legacy Project IDs were unique per user only
  const jobs = ((r.Items ?? []) as Pick<JobRecord, "usage" | "model" | "costUsd" | "userId">[]).filter((j) => j.userId === userId);
  let usage: TokenUsage = EMPTY_USAGE;
  let cost = 0;
  let unpriced = false;
  const models = new Set<string>();
  for (const j of jobs) {
    if (!j.usage) continue;
    usage = addUsage(usage, j.usage);
    if (j.model) models.add(j.model);
    if (j.costUsd === null || j.costUsd === undefined) unpriced = true;
    else cost += j.costUsd;
  }
  await updateProject(userId, projectId, {
    usage,
    costUsd: unpriced && cost === 0 ? null : Math.round(cost * 1_000_000) / 1_000_000,
    usedModels: [...models],
  });
}

/** Store the agent's name (nameSource → "auto") unless the user has named the project (nameSource "user" or a legacy project). */
export async function updateAutoProjectName(userId: string, projectId: string, name: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.projects,
        Key: { userId, projectId },
        UpdateExpression: "SET #n = :n, nameSource = :auto, updatedAt = :t",
        ConditionExpression: "nameSource IN (:auto, :provisional)",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":n": name, ":t": nowIso(), ":auto": "auto", ":provisional": "provisional" },
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

export async function incrementProjectRevision(userId: string, projectId: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: env.tables.projects,
      Key: { userId, projectId },
      UpdateExpression: "ADD revision :one",
      ExpressionAttributeValues: { ":one": 1 },
    }),
  );
}

let seq = 0;

export async function putMessage(
  projectId: string,
  jobId: string,
  role: MessageRole,
  type: MessageType,
  content: string,
  opts: { step?: WorkflowStep | null; meta?: Record<string, unknown> } = {},
): Promise<MessageRecord> {
  const createdAt = nowIso();
  seq = (seq + 1) % 100000;
  const msg: MessageRecord = {
    projectId,
    userId: env.job.userId,
    sk: `${createdAt}#${String(seq).padStart(5, "0")}`,
    messageId: newId("m_"),
    jobId,
    role,
    type,
    content: content.length > 60_000 ? content.slice(0, 60_000) + "\n…(truncated)" : content,
    step: opts.step ?? null,
    meta: opts.meta,
    createdAt,
  };
  await ddb.send(new PutCommand({ TableName: env.tables.messages, Item: msg }));
  return msg;
}
