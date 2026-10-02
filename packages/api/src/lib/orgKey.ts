import type { JobRecord, ModelPolicy, OrgKeyStatus, OrgUsageResponse, OrgUsageRow, UserRecord } from "@cobrac/shared";
import { EMPTY_USAGE, addUsage, modelPolicyOf, orgKeyProviderOf } from "@cobrac/shared";
import { listUsers } from "./db.js";

export async function findOrgKeyProvider(): Promise<UserRecord | null> {
  return orgKeyProviderOf(await listUsers());
}

/** The caller's key and model policy (the users table is read only when the organization key could apply). */
export async function modelPolicy(u: UserRecord): Promise<{ policy: ModelPolicy; provider: UserRecord | null }> {
  const provider = !u.apiKeyRegistered && u.orgAccess ? await findOrgKeyProvider() : null;
  return { policy: modelPolicyOf(u, !!provider), provider };
}

export function orgKeyStatus(users: UserRecord[]): OrgKeyStatus {
  const flagged = users.find((u) => u.orgKeyProvider) ?? null;
  return {
    provider: flagged ? { userId: flagged.userId, email: flagged.email, last4: flagged.apiKeyRegistered ? (flagged.apiKeyLast4 ?? null) : null } : null,
    available: !!orgKeyProviderOf(users),
  };
}

/** Organization-key usage per user; `month` is the UTC month (YYYY-MM) counted in monthCostUsd. */
export function orgUsage(jobs: JobRecord[], month: string): OrgUsageResponse {
  const rows = new Map<string, OrgUsageRow>();
  for (const j of jobs) {
    if (j.keySource !== "org") continue;
    const r = rows.get(j.userId) ?? { userId: j.userId, jobs: 0, usage: EMPTY_USAGE, costUsd: 0, monthCostUsd: 0, unpricedJobs: 0, lastJobAt: null };
    r.jobs++;
    if (j.usage) r.usage = addUsage(r.usage, j.usage);
    if (j.costUsd === null || (j.costUsd === undefined && j.usage)) r.unpricedJobs++;
    else if (j.costUsd) {
      r.costUsd += j.costUsd;
      if (j.createdAt.startsWith(month)) r.monthCostUsd += j.costUsd;
    }
    if (!r.lastJobAt || j.createdAt > r.lastJobAt) r.lastJobAt = j.createdAt;
    rows.set(j.userId, r);
  }
  const round = (v: number) => Math.round(v * 1_000_000) / 1_000_000;
  const items = [...rows.values()].map((r) => ({ ...r, costUsd: round(r.costUsd), monthCostUsd: round(r.monthCostUsd) })).sort((a, b) => b.costUsd - a.costUsd);
  return { items, month };
}
