#!/usr/bin/env node
/**
 * One-off migration of legacy Project IDs (per-user slugs) to `<userKey>-<seq>` (v0.7.0).
 *
 *   npm run build -w @cobrac/shared
 *   node scripts/migrate-project-ids.mjs                 # dry run (default): reads only, prints the plan
 *   node scripts/migrate-project-ids.mjs --apply         # writes
 *
 * Options:
 *   --apply            perform the writes (without it nothing is written)
 *   --keep-old         keep the old Jobs / Messages items as a backup (default: delete them after copying).
 *                      The old Projects item is always deleted, after saving it to
 *                      users/{userId}/{legacyId}/migration-backup/project-item.json
 *   --user <userId>    limit to one user
 *   --json <path>      also write the plan as JSON
 *
 * Per legacy project (sorted by createdAt within each user):
 *   - issue the user's userKey if missing; take seq = projectSeq + 1, …; set projectSeq to the last one
 *   - Projects: new item with projectId = new ID, legacyId = old ID, name = old name or old ID, nameSource = "user"
 *   - Jobs / Messages under the old projectId are re-keyed; items of other users sharing the old ID stay
 *     with their owner (message owner = message.userId, else the owner of its job)
 *   - the old Projects item is saved to S3 and deleted (so the list shows the project once and old URLs redirect)
 *   - S3 users/{userId}/{old}/ is copied to users/{userId}/{new}/ with `{old}_HCD|_FRG|_CSV` folders and
 *     `{old}.bra.xlsx` renamed, and graph/*.json projectId rewritten. Old S3 objects are left in place.
 * Projects with a queued / running / waiting job are skipped (finish, answer or cancel them first).
 * Re-running is safe: projects already migrated (legacyId found) keep their new ID and are skipped; an old Projects
 * item still present next to its migrated copy is saved to S3 and removed.
 *
 * Table names and the bucket are discovered by the CobracAgents prefixes; override with
 * TABLE_USERS / TABLE_PROJECTS / TABLE_JOBS / TABLE_MESSAGES / ARTIFACTS_BUCKET.
 * Only IDs, counts and names are printed; never message contents or keys.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { formatProjectId, generateUserKey, isLegacyProjectId, PROJECT_ID_REGEX } from "../packages/shared/dist/index.js";

export const ACTIVE_STATUSES = ["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING"];

/** S3 key (relative to the project prefix) under the new ID. */
export function renameRel(rel, oldId, newId) {
  return rel
    .split("/")
    .map((seg) => {
      for (const s of ["_HCD", "_FRG", "_CSV"]) if (seg === `${oldId}${s}`) return `${newId}${s}`;
      if (seg === `${oldId}.bra.xlsx`) return `${newId}.bra.xlsx`;
      if (seg === oldId) return newId;
      return seg;
    })
    .join("/");
}

/**
 * Pure planning step.
 * @param {{ users: any[], projects: any[], jobs: Map<string, any[]>, messages: Map<string, any[]>, random?: () => number }} data
 *   jobs / messages: items per old projectId (all owners)
 */
export function planMigration({ users, projects, jobs, messages, random = Math.random }) {
  const takenKeys = new Set(users.map((u) => u.userKey).filter(Boolean));
  const byUser = new Map();
  for (const p of projects) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId).push(p);
  }
  const ownersOfId = new Map();
  for (const p of projects) {
    if (!isLegacyProjectId(p.projectId)) continue;
    ownersOfId.set(p.projectId, [...(ownersOfId.get(p.projectId) ?? []), p.userId]);
  }

  const plan = { users: [], projects: [], leftovers: [], skipped: [], collisions: [], orphanMessages: [], unknownProjects: [] };
  for (const [id, owners] of ownersOfId) if (owners.length > 1) plan.collisions.push({ legacyId: id, users: owners.length });

  for (const u of users) {
    const own = (byUser.get(u.userId) ?? []).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    const migrated = new Map(own.filter((p) => p.legacyId).map((p) => [p.legacyId, p.projectId]));
    const legacy = own.filter((p) => isLegacyProjectId(p.projectId) && !migrated.has(p.projectId));
    for (const p of own) if (migrated.has(p.projectId)) plan.leftovers.push({ userId: u.userId, legacyId: p.projectId, newId: migrated.get(p.projectId) });
    let userKey = u.userKey;
    let newKey = false;
    if (!userKey && legacy.length) {
      do userKey = generateUserKey(random);
      while (takenKeys.has(userKey));
      takenKeys.add(userKey);
      newKey = true;
    }
    let seq = Number(u.projectSeq ?? 0);
    const startSeq = seq;
    for (const p of legacy) {
      if (ACTIVE_STATUSES.includes(p.status)) {
        plan.skipped.push({ userId: u.userId, legacyId: p.projectId, status: p.status });
        continue;
      }
      seq += 1;
      const newId = formatProjectId(userKey, seq);
      const allJobs = jobs.get(p.projectId) ?? [];
      const ownJobs = allJobs.filter((j) => j.userId === u.userId);
      const jobOwner = new Map(allJobs.map((j) => [j.jobId, j.userId]));
      const allMsgs = messages.get(p.projectId) ?? [];
      const ownMsgs = allMsgs.filter((m) => (m.userId ?? jobOwner.get(m.jobId)) === u.userId);
      plan.projects.push({
        userId: u.userId,
        legacyId: p.projectId,
        newId,
        name: p.name ?? p.projectId,
        revision: p.revision ?? ownJobs.filter((j) => j.status === "COMPLETED").length,
        createdAt: p.createdAt,
        status: p.status,
        jobs: ownJobs.length,
        messages: ownMsgs.length,
        sharedIdJobs: allJobs.length - ownJobs.length,
        sharedIdMessages: allMsgs.length - ownMsgs.length,
      });
    }
    if (legacy.length || newKey) plan.users.push({ userId: u.userId, userKey, newKey, projectSeqBefore: startSeq, projectSeqAfter: seq });
  }

  const knownUsers = new Set(users.map((u) => u.userId));
  for (const p of projects) if (!knownUsers.has(p.userId) && isLegacyProjectId(p.projectId)) plan.unknownProjects.push({ userId: p.userId, legacyId: p.projectId });

  for (const [id, msgs] of messages) {
    const jobOwner = new Map((jobs.get(id) ?? []).map((j) => [j.jobId, j.userId]));
    const n = msgs.filter((m) => !(m.userId ?? jobOwner.get(m.jobId))).length;
    if (n) plan.orphanMessages.push({ legacyId: id, messages: n });
  }
  return plan;
}

export function summarize(plan) {
  const sum = (k) => plan.projects.reduce((a, p) => a + p[k], 0);
  return {
    usersAffected: plan.users.length,
    userKeysToIssue: plan.users.filter((u) => u.newKey).length,
    projectsToMigrate: plan.projects.length,
    oldProjectItemsToRemove: plan.leftovers.length,
    jobsToRekey: sum("jobs"),
    messagesToRekey: sum("messages"),
    legacyIdsSharedByUsers: plan.collisions.length,
    messagesSeparatedFromOtherUsers: sum("sharedIdMessages"),
    skippedActive: plan.skipped.length,
    orphanMessages: plan.orphanMessages.reduce((a, o) => a + o.messages, 0),
    projectsWithoutUser: plan.unknownProjects.length,
  };
}

export function backupKey(userId, legacyId) {
  return `users/${userId}/${legacyId}/migration-backup/project-item.json`;
}

/**
 * Write one planned project under its new ID.
 * The old Projects item is always removed (after a copy is saved to S3 at backupKey), so the list shows the project
 * once and old URLs resolve through legacyId. `keepOld` keeps the old Jobs / Messages items; old S3 objects always stay.
 * @param io { ddb, s3, T, bucket, listKeys(prefix), cmd: { CopyObjectCommand, DeleteCommand, GetObjectCommand, PutCommand, PutObjectCommand } }
 * @param m planned project (planMigration().projects[i])
 * @param data { project: old Projects item, jobs / messages: all items under the old projectId }
 */
export async function migrateProject(io, m, data, { keepOld = false } = {}) {
  const { ddb, s3, T, bucket, listKeys, cmd } = io;
  const { userId, legacyId: oldId, newId } = m;
  if (!PROJECT_ID_REGEX.test(newId)) throw new Error(`bad new id ${newId}`);
  if (!data.project) throw new Error(`old project ${oldId} not found`);
  const oldPrefix = `users/${userId}/${oldId}/`;
  const newPrefix = `users/${userId}/${newId}/`;
  for (const key of await listKeys(oldPrefix)) {
    const rel = key.slice(oldPrefix.length);
    if (rel.startsWith("migration-backup/")) continue;
    const dest = newPrefix + renameRel(rel, oldId, newId);
    if (/^graph\/(hcd|frg)\.json$/.test(rel)) {
      const body = await (await s3.send(new cmd.GetObjectCommand({ Bucket: bucket, Key: key }))).Body.transformToString("utf8");
      const g = JSON.parse(body);
      g.projectId = newId;
      await s3.send(new cmd.PutObjectCommand({ Bucket: bucket, Key: dest, Body: JSON.stringify(g), ContentType: "application/json" }));
    } else {
      await s3.send(new cmd.CopyObjectCommand({ Bucket: bucket, Key: dest, CopySource: encodeURIComponent(`${bucket}/${key}`).replace(/%2F/g, "/") }));
    }
  }

  const jobOwner = new Map(data.jobs.map((j) => [j.jobId, j.userId]));
  const ownJobs = data.jobs.filter((j) => j.userId === userId);
  const ownMsgs = data.messages.filter((x) => (x.userId ?? jobOwner.get(x.jobId)) === userId);
  for (const j of ownJobs) await ddb.send(new cmd.PutCommand({ TableName: T.jobs, Item: { ...j, projectId: newId } }));
  for (const x of ownMsgs) await ddb.send(new cmd.PutCommand({ TableName: T.messages, Item: { ...x, projectId: newId, userId } }));

  await ddb.send(
    new cmd.PutCommand({
      TableName: T.projects,
      Item: { ...data.project, projectId: newId, legacyId: oldId, name: m.name, nameSource: "user", revision: m.revision },
      ConditionExpression: "attribute_not_exists(projectId)",
    }),
  );

  if (!keepOld) {
    for (const x of ownMsgs) await ddb.send(new cmd.DeleteCommand({ TableName: T.messages, Key: { projectId: oldId, sk: x.sk } }));
    for (const j of ownJobs) await ddb.send(new cmd.DeleteCommand({ TableName: T.jobs, Key: { projectId: oldId, jobId: j.jobId } }));
  }
  await removeOldProject(io, data.project);
  return { jobs: ownJobs.length, messages: ownMsgs.length };
}

/** Save the old Projects item to S3, then delete it. */
export async function removeOldProject(io, oldProject) {
  const { ddb, s3, T, bucket, cmd } = io;
  const { userId, projectId } = oldProject;
  await s3.send(new cmd.PutObjectCommand({ Bucket: bucket, Key: backupKey(userId, projectId), Body: JSON.stringify(oldProject), ContentType: "application/json" }));
  await ddb.send(new cmd.DeleteCommand({ TableName: T.projects, Key: { userId, projectId } }));
}

// ---------------------------------------------------------------------------
// AWS side
// ---------------------------------------------------------------------------

async function main(argv) {
  const { DynamoDBClient, ListTablesCommand } = await import("@aws-sdk/client-dynamodb");
  const { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  const { CopyObjectCommand, GetObjectCommand, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");

  const args = { apply: argv.includes("--apply"), keepOld: argv.includes("--keep-old") };
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const onlyUser = opt("--user");
  const jsonPath = opt("--json");
  const region = process.env.AWS_REGION ?? "ap-northeast-1";
  const ddbRaw = new DynamoDBClient({ region });
  const ddb = DynamoDBDocumentClient.from(ddbRaw, { marshallOptions: { removeUndefinedValues: true } });
  const s3 = new S3Client({ region });

  const tableNames = [];
  let start;
  do {
    const r = await ddbRaw.send(new ListTablesCommand({ ExclusiveStartTableName: start }));
    tableNames.push(...(r.TableNames ?? []));
    start = r.LastEvaluatedTableName;
  } while (start);
  const pick = (env, prefix) => {
    if (process.env[env]) return process.env[env];
    const hits = tableNames.filter((n) => n.startsWith(prefix));
    if (hits.length !== 1) throw new Error(`${env}: expected one table starting with ${prefix}, found ${hits.length}`);
    return hits[0];
  };
  const T = {
    users: pick("TABLE_USERS", "CobracAgents-Users"),
    projects: pick("TABLE_PROJECTS", "CobracAgents-Projects"),
    jobs: pick("TABLE_JOBS", "CobracAgents-Jobs"),
    messages: pick("TABLE_MESSAGES", "CobracAgents-Messages"),
  };
  let bucket = process.env.ARTIFACTS_BUCKET;
  if (!bucket) {
    const hits = ((await s3.send(new ListBucketsCommand({}))).Buckets ?? []).map((b) => b.Name).filter((n) => n?.startsWith("cobracagents-artifacts"));
    if (hits.length !== 1) throw new Error(`ARTIFACTS_BUCKET: expected one bucket starting with cobracagents-artifacts, found ${hits.length}`);
    bucket = hits[0];
  }

  const scan = async (TableName) => {
    const out = [];
    let key;
    do {
      const r = await ddb.send(new ScanCommand({ TableName, ExclusiveStartKey: key }));
      out.push(...(r.Items ?? []));
      key = r.LastEvaluatedKey;
    } while (key);
    return out;
  };
  const query = async (TableName, projectId) => {
    const out = [];
    let key;
    do {
      const r = await ddb.send(
        new QueryCommand({ TableName, KeyConditionExpression: "projectId = :p", ExpressionAttributeValues: { ":p": projectId }, ExclusiveStartKey: key }),
      );
      out.push(...(r.Items ?? []));
      key = r.LastEvaluatedKey;
    } while (key);
    return out;
  };
  const listKeys = async (Prefix) => {
    const out = [];
    let token;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) out.push(o.Key);
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  };

  let users = await scan(T.users);
  let projects = await scan(T.projects);
  if (onlyUser) {
    users = users.filter((u) => u.userId === onlyUser);
    projects = projects.filter((p) => p.userId === onlyUser);
  }
  const legacyIds = [...new Set(projects.filter((p) => isLegacyProjectId(p.projectId)).map((p) => p.projectId))];
  const jobs = new Map();
  const messages = new Map();
  for (const id of legacyIds) {
    jobs.set(id, await query(T.jobs, id));
    messages.set(id, await query(T.messages, id));
  }
  const plan = planMigration({ users, projects, jobs, messages });
  for (const p of plan.projects) p.s3Objects = (await listKeys(`users/${p.userId}/${p.legacyId}/`)).length;

  const summary = { mode: args.apply ? "apply" : "dry-run", tables: T, bucket, ...summarize(plan), s3ObjectsToCopy: plan.projects.reduce((a, p) => a + p.s3Objects, 0) };
  console.log(JSON.stringify(summary, null, 2));
  console.table(plan.projects.map((p) => ({ user: p.userId.slice(0, 8), legacyId: p.legacyId, newId: p.newId, status: p.status, jobs: p.jobs, messages: p.messages, s3: p.s3Objects, sharedMsgs: p.sharedIdMessages })));
  if (plan.leftovers.length) console.table(plan.leftovers.map((l) => ({ user: l.userId.slice(0, 8), oldItem: l.legacyId, migratedTo: l.newId })));
  if (plan.skipped.length) console.table(plan.skipped.map((s) => ({ user: s.userId.slice(0, 8), legacyId: s.legacyId, status: s.status })));
  if (plan.collisions.length) console.table(plan.collisions);
  if (plan.orphanMessages.length) console.table(plan.orphanMessages);
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ summary, plan }, null, 2));
  if (!args.apply) {
    console.log("dry run: nothing was written (use --apply to migrate)");
    return;
  }

  // --- apply --------------------------------------------------------------
  for (const u of plan.users) {
    if (u.newKey) {
      await ddb.send(
        new UpdateCommand({
          TableName: T.users,
          Key: { userId: u.userId },
          UpdateExpression: "SET userKey = :k",
          ConditionExpression: "attribute_exists(userId) AND attribute_not_exists(userKey)",
          ExpressionAttributeValues: { ":k": u.userKey },
        }),
      );
    }
    if (u.projectSeqAfter !== u.projectSeqBefore) {
      // fails if a project was created meanwhile; re-run the script then
      await ddb.send(
        new UpdateCommand({
          TableName: T.users,
          Key: { userId: u.userId },
          UpdateExpression: "SET projectSeq = :n",
          ConditionExpression: u.projectSeqBefore === 0 ? "attribute_not_exists(projectSeq) OR projectSeq = :z" : "projectSeq = :b",
          ExpressionAttributeValues: u.projectSeqBefore === 0 ? { ":n": u.projectSeqAfter, ":z": 0 } : { ":n": u.projectSeqAfter, ":b": u.projectSeqBefore },
        }),
      );
    }
  }

  const byKey = new Map(projects.map((p) => [`${p.userId}\u0000${p.projectId}`, p]));
  const io = {
    ddb,
    s3,
    T,
    bucket,
    listKeys,
    cmd: { CopyObjectCommand, DeleteCommand, GetObjectCommand, PutCommand, PutObjectCommand },
  };
  for (const m of plan.projects) {
    const r = await migrateProject(io, m, { project: byKey.get(`${m.userId}\u0000${m.legacyId}`), jobs: jobs.get(m.legacyId) ?? [], messages: messages.get(m.legacyId) ?? [] }, args);
    console.log(`migrated ${m.legacyId} -> ${m.newId} (jobs ${r.jobs}, messages ${r.messages}${args.keepOld ? ", old jobs/messages kept" : ""})`);
  }
  for (const l of plan.leftovers) {
    await removeOldProject(io, byKey.get(`${l.userId}\u0000${l.legacyId}`));
    console.log(`removed old project item ${l.legacyId} (migrated to ${l.newId})`);
  }
  console.log("done");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
