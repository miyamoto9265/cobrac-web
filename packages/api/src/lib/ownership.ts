/**
 * Owner scoping for tables keyed by projectId alone (Jobs, Messages, WsConnections.project-index).
 * Legacy Project IDs were unique per user only, so two users could share one; every read filters by owner.
 */
import type { JobRecord, MessageRecord } from "@cobrac/shared";

export function ownedJobs<T extends Pick<JobRecord, "userId">>(jobs: T[], userId: string): T[] {
  return jobs.filter((j) => j.userId === userId);
}

/** Messages carry userId since v0.7; older ones belong to the owner of their job. */
export function isOwnedMessage(m: Pick<MessageRecord, "userId" | "jobId">, userId: string, ownerJobIds: ReadonlySet<string>): boolean {
  return m.userId ? m.userId === userId : ownerJobIds.has(m.jobId);
}

export function ownedMessages<T extends Pick<MessageRecord, "userId" | "jobId">>(messages: T[], userId: string, ownerJobIds: ReadonlySet<string>): T[] {
  return messages.filter((m) => isOwnedMessage(m, userId, ownerJobIds));
}

export function subscribersOf<T extends { userId: string }>(subs: T[], ownerUserId: string): T[] {
  return subs.filter((s) => s.userId === ownerUserId);
}
