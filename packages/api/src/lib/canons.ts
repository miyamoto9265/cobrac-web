import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CanonMemberRecord, CanonPullRequestRecord, CanonRecord, CanonRevisionRecord, CanonRevisionSummary } from "@cobrac/shared";
import { CANON_MEMBER_PREFIX, CANON_META_SK, CANON_PR_PREFIX, CANON_REVISION_PREFIX, canonMemberSk, canonPrSk, nowIso } from "@cobrac/shared";
import { env } from "../env.js";
import { ddb, updateItem } from "./db.js";

const isConditionFailure = (e: unknown) => (e as { name?: string }).name === "ConditionalCheckFailedException";

/** Atomic per-user counter for Canon IDs. Numbers lost to failed creations are never reused. */
export async function nextCanonSeq(userId: string): Promise<number> {
  const r = await ddb.send(
    new UpdateCommand({
      TableName: env.tables.users,
      Key: { userId },
      UpdateExpression: "ADD canonSeq :one",
      ConditionExpression: "attribute_exists(userId)",
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  return Number(r.Attributes?.canonSeq);
}

export async function putCanon(c: CanonRecord) {
  await ddb.send(new PutCommand({ TableName: env.tables.canons, Item: c, ConditionExpression: "attribute_not_exists(canonId)" }));
}

export async function getCanon(canonId: string): Promise<CanonRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.canons, Key: { canonId, sk: CANON_META_SK } }));
  return (r.Item as CanonRecord) ?? null;
}

export function updateCanon(canonId: string, values: Partial<CanonRecord>) {
  return updateItem(env.tables.canons, { canonId, sk: CANON_META_SK }, values);
}

/** The owner's Canons (deleted ones included; callers filter), oldest first. */
export async function listOwnCanons(userId: string): Promise<CanonRecord[]> {
  const out: CanonRecord[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: env.tables.canons,
        IndexName: "owner-index",
        KeyConditionExpression: "ownerUserId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...((r.Items as CanonRecord[]) ?? []));
    start = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start);
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

async function queryPrefix<T>(canonId: string, prefix: string): Promise<T[]> {
  const out: T[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: env.tables.canons,
        KeyConditionExpression: "canonId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": canonId, ":p": prefix },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...((r.Items as T[]) ?? []));
    start = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start);
  return out;
}

export const listCanonMembers = (canonId: string) => queryPrefix<CanonMemberRecord>(canonId, CANON_MEMBER_PREFIX);

export async function listCanonRevisions(canonId: string): Promise<CanonRevisionSummary[]> {
  const items = await queryPrefix<CanonRevisionRecord>(canonId, CANON_REVISION_PREFIX);
  return items
    .map((r) => ({ revision: r.revision, createdAt: r.createdAt, prNo: r.prNo, source: r.source, circuitCount: r.circuitCount, connectionCount: r.connectionCount }))
    .sort((a, b) => b.revision - a.revision);
}

export async function putCanonRevision(r: CanonRevisionRecord) {
  await ddb.send(new PutCommand({ TableName: env.tables.canons, Item: r, ConditionExpression: "attribute_not_exists(sk)" }));
}

// --- pull requests --------------------------------------------------------------

export async function nextPrNumber(canonId: string): Promise<number> {
  const r = await ddb.send(
    new UpdateCommand({
      TableName: env.tables.canons,
      Key: { canonId, sk: CANON_META_SK },
      UpdateExpression: "ADD prSeq :one",
      ConditionExpression: "attribute_exists(canonId)",
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  return Number(r.Attributes?.prSeq);
}

export async function putPullRequest(pr: CanonPullRequestRecord) {
  await ddb.send(new PutCommand({ TableName: env.tables.canons, Item: pr }));
}

export async function getPullRequest(canonId: string, no: number): Promise<CanonPullRequestRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.canons, Key: { canonId, sk: canonPrSk(no) } }));
  return (r.Item as CanonPullRequestRecord) ?? null;
}

export async function listPullRequests(canonId: string): Promise<CanonPullRequestRecord[]> {
  return (await queryPrefix<CanonPullRequestRecord>(canonId, CANON_PR_PREFIX)).sort((a, b) => b.prNo - a.prNo);
}

/** Moves an open PR to another state; returns false when it was no longer open. */
export async function closePullRequest(canonId: string, no: number, values: Partial<CanonPullRequestRecord>): Promise<boolean> {
  const entries = Object.entries({ ...values, updatedAt: nowIso() });
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.canons,
        Key: { canonId, sk: canonPrSk(no) },
        UpdateExpression: `SET ${entries.map((_, i) => `#k${i} = :v${i}`).join(", ")}`,
        ConditionExpression: "#st = :open",
        ExpressionAttributeNames: { ...Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])), "#st": "state" },
        ExpressionAttributeValues: { ...Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])), ":open": "open" },
      }),
    );
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

export function updatePullRequest(canonId: string, no: number, values: Partial<CanonPullRequestRecord>) {
  return updateItem(env.tables.canons, { canonId, sk: canonPrSk(no) }, values);
}

/** Moves the head from `expected` to `expected + 1`; false when someone else moved it first. */
export async function advanceCanonHead(canonId: string, expected: number): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.canons,
        Key: { canonId, sk: CANON_META_SK },
        UpdateExpression: "SET headRevision = :next, updatedAt = :t",
        ConditionExpression: "headRevision = :cur",
        ExpressionAttributeValues: { ":cur": expected, ":next": expected + 1, ":t": nowIso() },
      }),
    );
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

async function bumpMemberCount(canonId: string, delta: 1 | -1) {
  await ddb.send(
    new UpdateCommand({
      TableName: env.tables.canons,
      Key: { canonId, sk: CANON_META_SK },
      UpdateExpression: "SET updatedAt = :t ADD memberCount :d",
      ExpressionAttributeValues: { ":t": nowIso(), ":d": delta },
    }),
  );
}

export type AddMemberResult = { ok: true; member: CanonMemberRecord } | { ok: false; reason: "project-unavailable" };

/**
 * Claims the project for this Canon first (conditional on it being in no Canon and not deleted), so a
 * project can never end up in two Canons; the MEMBER item is written only after the claim succeeds.
 */
export async function addCanonMember(canonId: string, ownerUserId: string, projectId: string): Promise<AddMemberResult> {
  const joinedAt = nowIso();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.projects,
        Key: { userId: ownerUserId, projectId },
        UpdateExpression: "SET canonId = :c, updatedAt = :t",
        ConditionExpression: "attribute_exists(projectId) AND attribute_not_exists(canonId) AND attribute_not_exists(deletedAt)",
        ExpressionAttributeValues: { ":c": canonId, ":t": joinedAt },
      }),
    );
  } catch (e) {
    if (isConditionFailure(e)) return { ok: false, reason: "project-unavailable" };
    throw e;
  }
  const member: CanonMemberRecord = { canonId, sk: canonMemberSk(projectId), projectId, joinedAt };
  try {
    await ddb.send(new PutCommand({ TableName: env.tables.canons, Item: member }));
  } catch (e) {
    await releaseProject(ownerUserId, projectId, canonId).catch(() => undefined);
    throw e;
  }
  await bumpMemberCount(canonId, 1);
  return { ok: true, member };
}

/** Clears the project's canonId only while it still points at this Canon. */
async function releaseProject(ownerUserId: string, projectId: string, canonId: string) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tables.projects,
        Key: { userId: ownerUserId, projectId },
        UpdateExpression: "REMOVE canonId SET updatedAt = :t",
        ConditionExpression: "canonId = :c",
        ExpressionAttributeValues: { ":c": canonId, ":t": nowIso() },
      }),
    );
  } catch (e) {
    if (!isConditionFailure(e)) throw e;
  }
}

/** Removes the membership; returns false when the project was not a member. Approved Canon content is kept. */
export async function removeCanonMember(canonId: string, ownerUserId: string, projectId: string): Promise<boolean> {
  try {
    await ddb.send(
      new DeleteCommand({ TableName: env.tables.canons, Key: { canonId, sk: canonMemberSk(projectId) }, ConditionExpression: "attribute_exists(sk)" }),
    );
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
  await releaseProject(ownerUserId, projectId, canonId);
  await bumpMemberCount(canonId, -1);
  return true;
}

/**
 * Soft delete: META gets deletedAt and every member project is released (its canonId cleared); the MEMBER items
 * stay as the record of who was in the Canon. Fails with ConditionalCheckFailedException if already deleted.
 */
export async function markCanonDeleted(canonId: string, ownerUserId: string): Promise<string> {
  const now = nowIso();
  await ddb.send(
    new UpdateCommand({
      TableName: env.tables.canons,
      Key: { canonId, sk: CANON_META_SK },
      UpdateExpression: "SET deletedAt = :t, updatedAt = :t",
      ConditionExpression: "attribute_exists(canonId) AND attribute_not_exists(deletedAt)",
      ExpressionAttributeValues: { ":t": now },
    }),
  );
  for (const m of await listCanonMembers(canonId)) await releaseProject(ownerUserId, m.projectId, canonId);
  return now;
}
