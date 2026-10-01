/**
 * Read-time correction of the token usage recorded by workers before 0.17.1. Codex reports the conversation's running
 * total at the end of every turn, and those workers added that total each turn, so a job's usage (and the usage rows of
 * its chat) came out about 2–3 times too high. The stored records are not rewritten: the API recomputes the usage of
 * such jobs from their per-turn usage rows when it returns them.
 */
import { EMPTY_USAGE, addUsage, estimateCostUsd, type TokenUsage } from "./pricing.js";
import type { JobRecord } from "./types.js";

/** Workers started from this time on record each turn's own usage (0.17.1, task definition registered 18:32:51 UTC). */
export const USAGE_FIX_AT = "2026-10-01T18:33:00.000Z";

/** Whether the job's usage was recorded by a worker that added Codex's running total every turn. */
export function isLegacyUsageJob(job: Pick<JobRecord, "startedAt" | "createdAt" | "usage">): boolean {
  return !!job.usage && (job.startedAt ?? job.createdAt) < USAGE_FIX_AT;
}

/** A usage row of a job's chat: the job's recorded usage after one turn (`meta.usage` of a `kind: "usage"` status message). */
export interface UsagePoint {
  sk: string;
  usage: TokenUsage;
}

export interface LegacyJobCorrection {
  /** The job's corrected usage */
  usage: TokenUsage;
  /** Corrected running usage of the job after each turn, by message `sk` */
  points: Map<string, TokenUsage>;
  /** The conversation's running total after the job's last turn (where the next job on that conversation starts) */
  threadTotal: TokenUsage;
}

const minus = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: Math.max(0, a.inputTokens - b.inputTokens),
  cachedInputTokens: Math.max(0, a.cachedInputTokens - b.cachedInputTokens),
  outputTokens: Math.max(0, a.outputTokens - b.outputTokens),
  reasoningOutputTokens: Math.max(0, a.reasoningOutputTokens - b.reasoningOutputTokens),
});

/**
 * Corrects one legacy job from its usage rows. Each row's increase is the conversation's running total after that turn;
 * a turn's own usage is the increase of that total. A total that drops means a new conversation (it starts from 0).
 * `threadBefore` is the running total the job's conversation had before the job (null: none known).
 */
export function correctLegacyJob(points: UsagePoint[], threadBefore: TokenUsage | null): LegacyJobCorrection | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => (a.sk < b.sk ? -1 : 1));
  let recorded = EMPTY_USAGE;
  let total: TokenUsage | null = null;
  let usage = EMPTY_USAGE;
  const corrected = new Map<string, TokenUsage>();
  for (const [i, p] of sorted.entries()) {
    const reported = minus(p.usage, recorded);
    recorded = p.usage;
    // the job's first turn continues the earlier conversation only if its total did not drop below that conversation's
    const prev = i === 0 ? threadBefore : total;
    const own = prev && reported.inputTokens >= prev.inputTokens ? minus(reported, prev) : reported;
    usage = addUsage(usage, own);
    total = reported;
    corrected.set(p.sk, usage);
  }
  return { usage, points: corrected, threadTotal: total! };
}

/**
 * Corrections of a project's legacy jobs, by job ID. Jobs are taken in creation order; a job on the project conversation
 * starts where the previous one left it. Article jobs run on a conversation of their own.
 */
export function correctLegacyProject(
  jobs: Pick<JobRecord, "jobId" | "type" | "createdAt" | "startedAt" | "usage">[],
  pointsByJob: Map<string, UsagePoint[]>,
): Map<string, LegacyJobCorrection> {
  const out = new Map<string, LegacyJobCorrection>();
  let thread: TokenUsage | null = null;
  for (const j of [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
    if (!isLegacyUsageJob(j)) continue;
    const article = j.type === "article";
    const c = correctLegacyJob(pointsByJob.get(j.jobId) ?? [], article ? null : thread);
    if (!c) continue;
    out.set(j.jobId, c);
    if (!article) thread = c.threadTotal;
  }
  return out;
}

/** The job with its corrected usage and cost, when it has a correction. */
export function correctedJob<J extends Pick<JobRecord, "jobId" | "usage" | "costUsd" | "model">>(job: J, corrections: Map<string, LegacyJobCorrection>): J {
  const c = corrections.get(job.jobId);
  if (!c) return job;
  return { ...job, usage: c.usage, costUsd: job.costUsd === null ? null : estimateCostUsd(job.model, c.usage) };
}

/** A project's usage and cost summed over its jobs, as the worker stores them (`refreshProjectUsage`). */
export function sumJobUsage(jobs: Pick<JobRecord, "usage" | "costUsd">[]): { usage: TokenUsage; costUsd: number | null } {
  let usage = EMPTY_USAGE;
  let cost = 0;
  let unpriced = false;
  for (const j of jobs) {
    if (!j.usage) continue;
    usage = addUsage(usage, j.usage);
    if (j.costUsd === null || j.costUsd === undefined) unpriced = true;
    else cost += j.costUsd;
  }
  return { usage, costUsd: unpriced && cost === 0 ? null : Math.round(cost * 1_000_000) / 1_000_000 };
}
