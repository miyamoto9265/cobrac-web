// Plans table: `META` (the plan), `ROW#<rowId>` (one row = one project to build), `EVT#<at>#<nonce>` (history),
// `PROP#<proposalId>` (changes proposed by a re-plan job).
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { HTTPException } from "hono/http-exception";
import type { PlanEventRecord, PlanEventType, PlanProposalRecord, PlanRecord, PlanRowRecord, PlanStatus } from "@cobrac/shared";
import { PLAN_EVENT_PREFIX, PLAN_LEASE_MS, PLAN_META_SK, PLAN_PROPOSAL_PREFIX, PLAN_ROW_PREFIX, nowIso, planEventSk, planProposalSk, planRowSk } from "@cobrac/shared";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { ddb } from "./db.js";
import { notFound } from "./http.js";

const table = () => env.tables.plans;

/**
 * The plan's META. `consistent`: a strongly consistent read, for decisions taken under the plan's lease (a default read
 * may come from a replica that lags behind the last writes).
 */
export async function getPlan(planId: string, consistent = false): Promise<PlanRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: table(), Key: { planId, sk: PLAN_META_SK }, ConsistentRead: consistent }));
  return (r.Item as PlanRecord | undefined) ?? null;
}

export async function putPlan(plan: PlanRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: table(), Item: plan, ConditionExpression: "attribute_not_exists(planId)" }));
}

/** Expected values of a conditional write: a value, or `undefined` for "attribute absent". */
export type Expect = Record<string, string | number | null | undefined>;

/**
 * SET `values` (plus updatedAt) on one item, optionally only when the stored attributes equal `expect`. Returns false
 * when the condition failed (someone else changed the item first).
 */
async function updateWhere(key: Record<string, string>, values: Record<string, unknown>, expect: Expect = {}, touch = true): Promise<boolean> {
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};
  const sets: string[] = [];
  Object.entries(touch ? { ...values, updatedAt: nowIso() } : values)
    .filter(([, v]) => v !== undefined)
    .forEach(([k, v], i) => {
      names[`#k${i}`] = k;
      vals[`:v${i}`] = v;
      sets.push(`#k${i} = :v${i}`);
    });
  const conds = ["attribute_exists(sk)"];
  Object.entries(expect).forEach(([k, v], i) => {
    names[`#c${i}`] = k;
    if (v === undefined) conds.push(`attribute_not_exists(#c${i})`);
    else {
      vals[`:c${i}`] = v;
      conds.push(`#c${i} = :c${i}`);
    }
  });
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table(),
        Key: key,
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: conds.join(" AND "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: vals,
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

export const updatePlan = (planId: string, values: Partial<PlanRecord>, expect?: Expect) => updateWhere({ planId, sk: PLAN_META_SK }, values, expect);

/** Moves the plan from `from` to `to` (with more fields); false when its status was no longer `from`. */
export const setPlanStatus = (planId: string, from: PlanStatus, to: PlanStatus, values: Partial<PlanRecord> = {}) => updatePlan(planId, { ...values, status: to }, { status: from });

export const updateRow = (planId: string, rowId: string, values: Partial<PlanRowRecord>, expect?: Expect) => updateWhere({ planId, sk: planRowSk(rowId) }, values, expect);

export async function putRow(row: PlanRowRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: table(), Item: row }));
}

export async function deleteRow(planId: string, rowId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: table(), Key: { planId, sk: planRowSk(rowId) } }));
}

async function queryPrefix<T>(planId: string, prefix: string, consistent = false): Promise<T[]> {
  const out: T[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table(),
        KeyConditionExpression: "planId = :p AND begins_with(sk, :s)",
        ExpressionAttributeValues: { ":p": planId, ":s": prefix },
        ExclusiveStartKey: start,
        ConsistentRead: consistent,
      }),
    );
    out.push(...((r.Items as T[]) ?? []));
    start = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start);
  return out;
}

/** The plan's rows; `consistent` under the lease (see `getPlan`). */
export const listRows = (planId: string, consistent = false) => queryPrefix<PlanRowRecord>(planId, PLAN_ROW_PREFIX, consistent);
export const listPlanEvents = (planId: string) => queryPrefix<PlanEventRecord>(planId, PLAN_EVENT_PREFIX);
export const listProposals = (planId: string) => queryPrefix<PlanProposalRecord>(planId, PLAN_PROPOSAL_PREFIX);

export async function getProposal(planId: string, proposalId: string, consistent = false): Promise<PlanProposalRecord | null> {
  const r = await ddb.send(new GetCommand({ TableName: table(), Key: { planId, sk: planProposalSk(proposalId) }, ConsistentRead: consistent }));
  return (r.Item as PlanProposalRecord | undefined) ?? null;
}

/** Stores a proposal unless one with its ID exists (a re-plan result stored twice keeps the first, and its decision). */
export async function putProposal(p: PlanProposalRecord): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({ TableName: table(), Item: p, ConditionExpression: "attribute_not_exists(sk)" }));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

/** Proposals carry no updatedAt (`decidedAt` records the decision). */
export const updateProposal = (planId: string, proposalId: string, values: Partial<PlanProposalRecord>, expect?: Expect) =>
  updateWhere({ planId, sk: planProposalSk(proposalId) }, values, expect, false);

async function queryIndex(indexName: string, attr: string, value: string): Promise<PlanRecord[]> {
  const out: PlanRecord[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table(),
        IndexName: indexName,
        KeyConditionExpression: "#a = :v",
        ExpressionAttributeNames: { "#a": attr },
        ExpressionAttributeValues: { ":v": value },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...((r.Items as PlanRecord[]) ?? []));
    start = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start);
  return out.filter((x) => x.sk === PLAN_META_SK);
}

/** The owner's plans (owner-index; only META items carry ownerUserId). */
export const listOwnPlans = (ownerUserId: string) => queryIndex("owner-index", "ownerUserId", ownerUserId);
/** Plans in one status (status-index; only META items carry status). */
export const listPlansByStatus = (status: PlanStatus) => queryIndex("status-index", "status", status);

export async function putPlanEvent(planId: string, type: PlanEventType, by: string, extra: Partial<Pick<PlanEventRecord, "rowId" | "projectId" | "detail">> = {}): Promise<PlanEventRecord> {
  const at = nowIso();
  const event: PlanEventRecord = { planId, sk: planEventSk(at, randomUUID().slice(0, 8)), type, at, by, ...extra };
  await ddb.send(new PutCommand({ TableName: table(), Item: event }));
  return event;
}

/**
 * Takes the plan for `ms` so that two runner invocations (or the runner and an API request) never advance it at the
 * same time. Optimistic: the write only succeeds when the lease is still the one that was read. `plan` may come from a
 * read that lags: a lease taken meanwhile fails the condition, and the holder reads the plan again once it holds it.
 */
export async function acquirePlanLease(plan: PlanRecord, ms: number, now = Date.now()): Promise<string | null> {
  if (plan.leaseUntil && Date.parse(plan.leaseUntil) > now) return null;
  const until = new Date(now + ms).toISOString();
  // the lease is bookkeeping: it leaves updatedAt (shown and sorted on) alone
  const ok = await updateWhere({ planId: plan.planId, sk: PLAN_META_SK }, { leaseUntil: until }, { leaseUntil: plan.leaseUntil ?? undefined }, false);
  if (!ok) return null;
  plan.leaseUntil = until;
  return until;
}

/**
 * Gives the lease back early (only if it is still ours). It writes the release time: already expired for the next
 * step, so the next condition stays a plain comparison, and unlike a constant it differs from what earlier holders
 * released, so a read taken before this holder's turn no longer matches the lease (no ABA). Two releases within one
 * millisecond can still repeat a value; the holder's consistent read of the plan keeps that harmless.
 */
export async function releasePlanLease(planId: string, until: string): Promise<void> {
  await updateWhere({ planId, sk: PLAN_META_SK }, { leaseUntil: nowIso() }, { leaseUntil: until }, false);
}

/**
 * Under the lease: true while the plan still has `status`, is not deleted, and the lease `fresh` was read with is still
 * in place (it is the plan `withPlanLease` passes to its function). A conditional write that changes nothing, done
 * before rows are written, so rows never change on a plan that left `status` or was deleted meanwhile (neither takes
 * the lease), or whose lease another step took after it expired.
 */
export async function holdsPlan(fresh: PlanRecord, status: PlanStatus): Promise<boolean> {
  if (!fresh.leaseUntil) return false;
  return updateWhere({ planId: fresh.planId, sk: PLAN_META_SK }, { leaseUntil: fresh.leaseUntil }, { status, leaseUntil: fresh.leaseUntil, deletedAt: undefined }, false);
}

/** How long an API request waits for a plan another step holds: `attempts` more reads, `delayMs` apart (tests shorten it). */
export const planLeaseWait = { attempts: 6, delayMs: 250 };

export const PLAN_BUSY_MESSAGE = "計画を更新中です。少し待ってからやり直してください";

/**
 * Runs `fn` on a fresh read of the plan while holding its lease, so an edit, a confirmation or a draft request never
 * interleaves with another one or with a runner step. The first read only supplies the lease to take (it may lag); `fn`
 * gets a strongly consistent read taken once the lease is held, and must re-check the plan's status on it (and read
 * rows with `listRows(planId, true)`). 404 when the plan is gone; 409 when the lease stays taken. Never call
 * `advancePlan` inside `fn` (it takes the lease itself): kick the runner after this returns.
 */
export async function withPlanLease<T>(planId: string, fn: (plan: PlanRecord) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const plan = await getPlan(planId);
    if (!plan || plan.deletedAt) throw notFound();
    const lease = await acquirePlanLease(plan, PLAN_LEASE_MS);
    if (lease) {
      try {
        const fresh = await getPlan(planId, true);
        if (!fresh || fresh.deletedAt) throw notFound();
        return await fn(fresh);
      } finally {
        await releasePlanLease(planId, lease).catch((e) => console.warn(`[plan ${planId}] lease release failed`, e));
      }
    }
    if (attempt >= planLeaseWait.attempts) throw new HTTPException(409, { message: PLAN_BUSY_MESSAGE });
    await new Promise((resolve) => setTimeout(resolve, planLeaseWait.delayMs));
  }
}
