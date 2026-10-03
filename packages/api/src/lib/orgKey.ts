import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { DefaultApiKeyRecord, DefaultKeyStatus, JobRecord, ModelPolicy, OrgUsageResponse, OrgUsageRow, UserRecord } from "@cobrac/shared";
import { DEFAULT_KEY_CATALOG_KEY, EMPTY_USAGE, addUsage, modelPolicyOf } from "@cobrac/shared";
import { env } from "../env.js";
import { ddb } from "./db.js";

export async function getDefaultKey(): Promise<DefaultApiKeyRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.catalog, Key: { ...DEFAULT_KEY_CATALOG_KEY } }));
  const item = (r.Item as DefaultApiKeyRecord | undefined) ?? null;
  return item?.encryptedApiKey ? item : null;
}

export async function putDefaultKey(item: DefaultApiKeyRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.tables.catalog, Item: item }));
}

export async function deleteDefaultKey(): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: env.tables.catalog, Key: { ...DEFAULT_KEY_CATALOG_KEY } }));
}

export const defaultKeyStatus = (k: DefaultApiKeyRecord | null): DefaultKeyStatus => ({ registered: !!k, last4: k?.last4 ?? null, updatedAt: k?.updatedAt ?? null });

/** The caller's key and model policy (the default key is read only when it could apply). */
export async function modelPolicy(u: UserRecord): Promise<{ policy: ModelPolicy; defaultKey: DefaultApiKeyRecord | null }> {
  const defaultKey = !u.apiKeyRegistered && u.orgAccess ? await getDefaultKey() : null;
  return { policy: modelPolicyOf(u, !!defaultKey), defaultKey };
}

/** Default-API-key usage per user; `month` is the UTC month (YYYY-MM) counted in monthCostUsd. */
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
