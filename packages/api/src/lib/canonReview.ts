import type { CanonAiReviewResult, CanonAiState, CanonPrEvent, CanonPrEventType, CanonPullRequestRecord, JobRecord, UserRecord } from "@cobrac/shared";

/** Name shown in a PR's audit trail (never the e-mail address: the sender of a Canon → Canon PR may be another user). */
export const actorName = (u: Pick<UserRecord, "displayName" | "contributorName"> | null | undefined): string => u?.displayName || u?.contributorName || "";

const CLOSING: Partial<Record<CanonPullRequestRecord["state"], CanonPrEventType>> = { approved: "approved", rejected: "rejected", withdrawn: "withdrawn", superseded: "superseded" };

/**
 * The audit trail of a PR: stored entries, plus entries rebuilt from the PR item for what happened before the trail
 * existed (the push, the closing decision) and from the AI review jobs (their end). Oldest first.
 */
export function prTrail(pr: CanonPullRequestRecord, stored: CanonPrEvent[], jobs: JobRecord[], names: Map<string, string>): CanonPrEvent[] {
  const out: CanonPrEvent[] = stored.map(({ type, at, actor, actorName: n, note, item, itemLabel, revision, byPr, jobId, model, choices }) => ({
    type,
    at,
    actor,
    actorName: n,
    ...(note ? { note } : {}),
    ...(item ? { item, itemLabel: itemLabel ?? null } : {}),
    ...(revision ? { revision } : {}),
    ...(byPr ? { byPr } : {}),
    ...(jobId ? { jobId, model: model ?? null } : {}),
    ...(choices && Object.keys(choices).length ? { choices } : {}),
  }));
  const has = (t: CanonPrEventType) => out.some((e) => e.type === t);
  const name = (id: string | null | undefined) => (id ? (names.get(id) ?? "") : "");
  if (!has("pushed")) out.push({ type: "pushed", at: pr.createdAt, actor: pr.createdBy, actorName: name(pr.createdBy), revision: pr.sourceRevision });
  const closing = CLOSING[pr.state];
  if (closing && !has(closing)) {
    const byPr = closing === "superseded" ? Number(/#(\d+)/.exec(pr.reason ?? "")?.[1] ?? 0) || null : null;
    out.push({
      type: closing,
      at: pr.decidedAt ?? pr.updatedAt,
      actor: pr.decidedBy ?? null,
      actorName: name(pr.decidedBy),
      ...(closing === "rejected" && pr.reason ? { note: pr.reason } : {}),
      ...(pr.mergedRevision ? { revision: pr.mergedRevision } : {}),
      ...(byPr ? { byPr } : {}),
    });
  }
  for (const j of jobs) {
    if (j.status !== "COMPLETED" && j.status !== "FAILED") continue;
    out.push({
      type: j.status === "COMPLETED" ? "ai_completed" : "ai_failed",
      at: j.endedAt ?? j.updatedAt,
      actor: null,
      actorName: "",
      jobId: j.jobId,
      model: j.model ?? null,
      ...(j.status === "FAILED" && j.errorMessage ? { note: j.errorMessage } : {}),
    });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** AI review jobs of one PR, newest first. */
export const reviewJobsOf = (jobs: JobRecord[], prNo: number) =>
  jobs.filter((j) => j.type === "canon-review" && j.reviewPrNo === prNo).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export const isActiveJob = (j: JobRecord) => j.status === "QUEUED" || j.status === "RUNNING";

export function aiState(job: JobRecord | undefined, result: CanonAiReviewResult | null): CanonAiState | null {
  if (!job) return null;
  return {
    jobId: job.jobId,
    status: job.status,
    model: job.model ?? null,
    locale: job.reviewLocale ?? null,
    requestedAt: job.createdAt,
    endedAt: job.endedAt,
    errorMessage: job.errorMessage,
    costUsd: job.costUsd ?? null,
    result: job.status === "COMPLETED" ? result : null,
  };
}
