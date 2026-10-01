/**
 * Read-time correction of jobs recorded before 0.17.1 (see `usageCorrection.ts` in shared). Nothing is written back:
 * projects, jobs and usage rows are corrected in the responses only.
 */
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { JobRecord, MessageRecord, ProjectRecord, TokenUsage } from "@cobrac/shared";
import {
  USAGE_FIX_AT,
  correctLegacyProject,
  correctedJob,
  estimateCostUsd,
  isLegacyUsageJob,
  sumJobUsage,
  type LegacyJobCorrection,
  type UsagePoint,
} from "@cobrac/shared";
import { env } from "../env.js";
import { ddb, listJobsForProject } from "./db.js";

const FINISHED: readonly JobRecord["status"][] = ["COMPLETED", "FAILED", "CANCELLED"];

/** Corrections of finished legacy jobs never change; kept per Lambda container */
const cache = new Map<string, Map<string, LegacyJobCorrection>>();

/** Usage rows (`kind: "usage"` status messages) of a project, by job ID. */
async function usagePoints(projectId: string): Promise<Map<string, UsagePoint[]>> {
  const out = new Map<string, UsagePoint[]>();
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: env.tables.messages,
        KeyConditionExpression: "projectId = :p",
        FilterExpression: "#t = :status AND #m.#k = :usage",
        ExpressionAttributeNames: { "#t": "type", "#m": "meta", "#k": "kind" },
        ExpressionAttributeValues: { ":p": projectId, ":status": "status", ":usage": "usage" },
        ProjectionExpression: "jobId, sk, #m",
        ExclusiveStartKey: start,
      }),
    );
    for (const m of (r.Items ?? []) as Pick<MessageRecord, "jobId" | "sk" | "meta">[]) {
      const usage = (m.meta as { usage?: TokenUsage } | undefined)?.usage;
      if (!usage) continue;
      const list = out.get(m.jobId) ?? [];
      list.push({ sk: m.sk, usage });
      out.set(m.jobId, list);
    }
    start = r.LastEvaluatedKey;
  } while (start);
  return out;
}

/** Corrections of the project's legacy jobs (empty when it has none). */
export async function legacyCorrections(projectId: string, jobs: JobRecord[]): Promise<Map<string, LegacyJobCorrection>> {
  const legacy = jobs.filter(isLegacyUsageJob);
  if (!legacy.length) return new Map();
  const cached = cache.get(projectId);
  if (cached) return cached;
  const corrections = correctLegacyProject(jobs, await usagePoints(projectId));
  if (legacy.every((j) => FINISHED.includes(j.status))) cache.set(projectId, corrections);
  return corrections;
}

/** Jobs with corrected usage and cost. */
export async function correctJobs(projectId: string, jobs: JobRecord[]): Promise<JobRecord[]> {
  const c = await legacyCorrections(projectId, jobs);
  return c.size ? jobs.map((j) => correctedJob(j, c)) : jobs;
}

/** The project with its usage and cost summed over corrected jobs (only projects created before the fix can need it). */
export async function correctProject<P extends ProjectRecord>(p: P, jobs?: JobRecord[]): Promise<P> {
  if (!p.usage || p.createdAt >= USAGE_FIX_AT) return p;
  const all = jobs ?? (await listJobsForProject(p.projectId, p.userId));
  const c = await legacyCorrections(p.projectId, all);
  if (!c.size) return p;
  return { ...p, ...sumJobUsage(all.map((j) => correctedJob(j, c))) };
}

export async function correctProjects<P extends ProjectRecord>(items: P[]): Promise<P[]> {
  return Promise.all(items.map((p) => correctProject(p)));
}

/** Usage rows of legacy jobs with the corrected running usage of the job and its cost. */
export function correctUsageMessages<M extends Pick<MessageRecord, "jobId" | "sk" | "meta">>(messages: M[], corrections: Map<string, LegacyJobCorrection>): M[] {
  if (!corrections.size) return messages;
  return messages.map((m) => {
    const u = corrections.get(m.jobId)?.points.get(m.sk);
    if (!u) return m;
    const meta = m.meta as { model?: string | null; costUsd?: number | null } | undefined;
    return { ...m, meta: { ...meta, usage: u, costUsd: meta?.costUsd === null ? null : estimateCostUsd(meta?.model ?? null, u), usageCorrected: true } };
  });
}
