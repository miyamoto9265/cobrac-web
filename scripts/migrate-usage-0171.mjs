#!/usr/bin/env node
/**
 * One-off migration: write the corrected token usage of jobs recorded before 0.17.1 into DynamoDB, so the API no longer
 * has to correct them when it reads them (`packages/shared/src/usageCorrection.ts`, spec C.7).
 *
 *   npm run build -w @cobrac/shared
 *   node scripts/migrate-usage-0171.mjs --json plan.json          # dry run (default): reads only, saves the plan
 *   node scripts/migrate-usage-0171.mjs --apply --from plan.json  # writes the saved plan
 *
 * Options:
 *   --apply          perform the writes (without it nothing is written)
 *   --json <path>    write the plan as JSON (before/after of every item: also the backup)
 *   --from <path>    apply a plan saved with --json instead of computing it again. Use it to re-run after a partial
 *                    apply: computing again from half-corrected usage rows would correct them twice.
 *   --revert         with --from: write the plan's "before" values back
 *
 * The plan uses the same correction the API applies on read (correctLegacyProject):
 *   - Jobs: usage and costUsd corrected, usageCorrected = true (the API then skips the job)
 *   - Messages (`kind: "usage"` rows of those jobs): meta.usage / meta.costUsd corrected, meta.usageCorrected = true
 *   - Projects created before USAGE_FIX_AT: usage and costUsd summed over the corrected jobs
 * Every write is conditional on the item still holding its "before" value, so items changed meanwhile, or already
 * written, are skipped and reported. Projects with a queued / running / waiting legacy job are skipped.
 *
 * Table names are discovered by the CobracAgents prefixes; override with TABLE_PROJECTS / TABLE_JOBS / TABLE_MESSAGES.
 * Only IDs, counts and costs are printed; never message contents or keys.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { USAGE_FIX_AT, correctLegacyProject, correctedJob, estimateCostUsd, isLegacyUsageJob, sumJobUsage } from "../packages/shared/dist/index.js";

export const FINISHED = ["COMPLETED", "FAILED", "CANCELLED"];

/**
 * Pure planning step.
 * @param {{ projects: any[], jobs: Map<string, any[]>, messages: Map<string, any[]> }} data
 *   jobs: all jobs per projectId; messages: the `kind: "usage"` status messages per projectId
 */
export function planUsageMigration({ projects, jobs, messages }) {
  const plan = { jobs: [], messages: [], projects: [], skipped: [] };
  const byId = new Map(projects.map((p) => [p.projectId, p]));
  for (const [projectId, all] of jobs) {
    const legacy = all.filter(isLegacyUsageJob);
    if (!legacy.length) continue;
    const active = legacy.filter((j) => !FINISHED.includes(j.status));
    if (active.length) {
      plan.skipped.push({ projectId, jobs: active.map((j) => `${j.jobId}:${j.status}`) });
      continue;
    }
    const points = new Map();
    for (const m of messages.get(projectId) ?? []) {
      if (!m.meta?.usage) continue;
      const list = points.get(m.jobId) ?? [];
      list.push({ sk: m.sk, usage: m.meta.usage });
      points.set(m.jobId, list);
    }
    const corrections = correctLegacyProject(all, points);
    for (const j of legacy) {
      const c = correctedJob(j, corrections);
      plan.jobs.push({ projectId, jobId: j.jobId, before: { usage: j.usage, costUsd: j.costUsd ?? null }, after: { usage: c.usage, costUsd: c.costUsd ?? null } });
    }
    for (const m of messages.get(projectId) ?? []) {
      const u = corrections.get(m.jobId)?.points.get(m.sk);
      if (!u) continue;
      const costUsd = m.meta.costUsd === null ? null : estimateCostUsd(m.meta.model ?? null, u);
      plan.messages.push({ projectId, sk: m.sk, jobId: m.jobId, before: { usage: m.meta.usage, costUsd: m.meta.costUsd ?? null }, after: { usage: u, costUsd } });
    }
    const p = byId.get(projectId);
    if (p?.usage && p.createdAt < USAGE_FIX_AT && corrections.size) {
      const sum = sumJobUsage(all.map((j) => correctedJob(j, corrections)));
      plan.projects.push({ userId: p.userId, projectId, before: { usage: p.usage, costUsd: p.costUsd ?? null }, after: sum });
    }
  }
  return plan;
}

export function summarize(plan) {
  const cost = (xs, k) => Math.round(xs.reduce((a, x) => a + (x[k].costUsd ?? 0), 0) * 100) / 100;
  return {
    projects: plan.projects.length,
    jobs: plan.jobs.length,
    messages: plan.messages.length,
    skippedProjects: plan.skipped.length,
    jobCostUsd: { before: cost(plan.jobs, "before"), after: cost(plan.jobs, "after") },
  };
}

/** The UpdateCommand inputs of a plan, in a safe order: jobs first, so the API stops correcting
 * them on read before their usage rows change (never correcting a row twice), then messages, then projects. */
export function planWrites(plan, T, { revert = false } = {}) {
  const [from, to] = revert ? ["after", "before"] : ["before", "after"];
  const writes = [];
  for (const j of plan.jobs) {
    writes.push({
      kind: "job",
      id: `${j.projectId} ${j.jobId}`,
      input: {
        TableName: T.jobs,
        Key: { projectId: j.projectId, jobId: j.jobId },
        UpdateExpression: revert ? "SET #u = :u, #c = :c REMOVE #f" : "SET #u = :u, #c = :c, #f = :t",
        ConditionExpression: revert ? "#u = :from AND #f = :t" : "#u = :from AND attribute_not_exists(#f)",
        ExpressionAttributeNames: { "#u": "usage", "#c": "costUsd", "#f": "usageCorrected" },
        ExpressionAttributeValues: { ":u": j[to].usage, ":c": j[to].costUsd, ":from": j[from].usage, ":t": true },
      },
    });
  }
  for (const m of plan.messages) {
    writes.push({
      kind: "message",
      id: `${m.projectId} ${m.sk}`,
      input: {
        TableName: T.messages,
        Key: { projectId: m.projectId, sk: m.sk },
        UpdateExpression: revert ? "SET #m.#u = :u, #m.#c = :c REMOVE #m.#f" : "SET #m.#u = :u, #m.#c = :c, #m.#f = :t",
        ConditionExpression: "#m.#u = :from",
        ExpressionAttributeNames: { "#m": "meta", "#u": "usage", "#c": "costUsd", "#f": "usageCorrected" },
        ExpressionAttributeValues: { ":u": m[to].usage, ":c": m[to].costUsd, ":from": m[from].usage, ...(revert ? {} : { ":t": true }) },
      },
    });
  }
  for (const p of plan.projects) {
    writes.push({
      kind: "project",
      id: p.projectId,
      input: {
        TableName: T.projects,
        Key: { userId: p.userId, projectId: p.projectId },
        UpdateExpression: "SET #u = :u, #c = :c",
        ConditionExpression: "#u = :from",
        ExpressionAttributeNames: { "#u": "usage", "#c": "costUsd" },
        ExpressionAttributeValues: { ":u": p[to].usage, ":c": p[to].costUsd, ":from": p[from].usage },
      },
    });
  }
  return writes;
}

async function main(argv) {
  const { DynamoDBClient, ListTablesCommand } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const args = { apply: argv.includes("--apply"), revert: argv.includes("--revert"), json: opt("--json"), from: opt("--from") };
  if (args.revert && !args.from) throw new Error("--revert needs --from <plan.json>");
  const region = process.env.AWS_REGION ?? "ap-northeast-1";
  const ddbRaw = new DynamoDBClient({ region });
  const ddb = DynamoDBDocumentClient.from(ddbRaw, { marshallOptions: { removeUndefinedValues: true } });

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
  const T = { projects: pick("TABLE_PROJECTS", "CobracAgents-Projects"), jobs: pick("TABLE_JOBS", "CobracAgents-Jobs"), messages: pick("TABLE_MESSAGES", "CobracAgents-Messages") };

  let plan;
  if (args.from) {
    plan = JSON.parse(readFileSync(args.from, "utf8")).plan;
  } else {
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
    const usageRows = async (projectId) => {
      const out = [];
      let key;
      do {
        const r = await ddb.send(
          new QueryCommand({
            TableName: T.messages,
            KeyConditionExpression: "projectId = :p",
            FilterExpression: "#t = :status AND #m.#k = :usage",
            ExpressionAttributeNames: { "#t": "type", "#m": "meta", "#k": "kind" },
            ExpressionAttributeValues: { ":p": projectId, ":status": "status", ":usage": "usage" },
            ProjectionExpression: "jobId, sk, #m",
            ExclusiveStartKey: key,
          }),
        );
        out.push(...(r.Items ?? []));
        key = r.LastEvaluatedKey;
      } while (key);
      return out;
    };
    const projects = await scan(T.projects);
    const jobs = new Map();
    for (const j of await scan(T.jobs)) jobs.set(j.projectId, [...(jobs.get(j.projectId) ?? []), j]);
    const messages = new Map();
    for (const [projectId, all] of jobs) if (all.some(isLegacyUsageJob)) messages.set(projectId, await usageRows(projectId));
    plan = planUsageMigration({ projects, jobs, messages });
  }

  const summary = { mode: args.apply ? (args.revert ? "revert" : "apply") : "dry-run", tables: T, ...summarize(plan) };
  console.log(JSON.stringify(summary, null, 2));
  if (plan.skipped.length) console.table(plan.skipped);
  if (args.json) writeFileSync(args.json, JSON.stringify({ summary, plan }, null, 2));
  if (!args.apply) {
    console.log("dry run: nothing was written (use --apply --from <plan.json> to write)");
    return;
  }

  const counts = { written: 0, skipped: 0 };
  for (const w of planWrites(plan, T, args)) {
    try {
      await ddb.send(new UpdateCommand(w.input));
      counts.written++;
    } catch (e) {
      if (e?.name !== "ConditionalCheckFailedException") throw e;
      counts.skipped++;
      console.log(`skipped ${w.kind} ${w.id} (changed or already written)`);
    }
  }
  console.log(`done: ${counts.written} written, ${counts.skipped} skipped`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
