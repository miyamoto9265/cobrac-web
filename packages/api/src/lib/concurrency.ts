// Concurrency limits: an admin setting in the Catalog table (`config` / `concurrency`, 1–16 each) over the deployment
// values (GitHub Variables → CDK → Lambda environment). The dispatcher and the plan runner read it on every use
// through a short cache, so a change applies without a deploy.
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ConcurrencySettingRecord, ConcurrencyStatus, EffectiveLimits } from "@cobrac/shared";
import { CONCURRENCY_CACHE_MS, CONCURRENCY_CATALOG_KEY, CONCURRENCY_MAX, CONCURRENCY_MIN, effectiveLimits } from "@cobrac/shared";
import { env } from "../env.js";
import { ddb } from "./db.js";

const deployment = () => ({ maxConcurrentJobs: env.maxConcurrentJobs, maxConcurrentJobsPerUser: env.maxConcurrentJobsPerUser });

export async function getConcurrencySetting(): Promise<ConcurrencySettingRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.catalog, Key: { ...CONCURRENCY_CATALOG_KEY } }));
  return (r.Item as ConcurrencySettingRecord | undefined) ?? null;
}

export async function putConcurrencySetting(item: ConcurrencySettingRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.tables.catalog, Item: item }));
  cache = null;
}

let cache: { at: number; limits: EffectiveLimits } | null = null;

/** Limits in force (cached for `CONCURRENCY_CACHE_MS`). If the setting cannot be read, the deployment values apply. */
export async function currentLimits(now = Date.now()): Promise<EffectiveLimits> {
  if (cache && now - cache.at < CONCURRENCY_CACHE_MS) return cache.limits;
  let setting: ConcurrencySettingRecord | null = null;
  try {
    setting = await getConcurrencySetting();
  } catch (e) {
    console.warn("[concurrency] setting not readable; using the deployment values", e instanceof Error ? e.message : e);
  }
  const limits = effectiveLimits(setting, deployment());
  cache = { at: now, limits };
  return limits;
}

/** Forgets the cached limits (tests). */
export function resetLimitsCache() {
  cache = null;
}

export async function concurrencyStatus(): Promise<ConcurrencyStatus> {
  const setting = await getConcurrencySetting();
  return {
    ...effectiveLimits(setting, deployment()),
    setting: { maxConcurrentJobs: setting?.maxConcurrentJobs ?? null, maxConcurrentJobsPerUser: setting?.maxConcurrentJobsPerUser ?? null, updatedAt: setting?.updatedAt ?? null },
    deployment: deployment(),
    min: CONCURRENCY_MIN,
    max: CONCURRENCY_MAX,
  };
}
