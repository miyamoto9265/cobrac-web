// ---------------------------------------------------------------------------
// Flow scheduling of an automatically ordered plan (`scheduling: "flow"`). Waves are no longer barriers: every minute
// the runner starts, in priority order, each waiting row that may start now, as long as slots are free. Rows relate in
// two ways, and each is kept by its own rule:
//
//   - dependency (`dependsOn`, B combines the function of A): B starts only once A is done (in a plan with a Canon: its
//     pull request was taken into the Canon), so B is pinned to a head that holds A's circuits;
//   - overlap (shared anchors, both rows build the same circuits): rows whose overlap score reaches `STRONG_OVERLAP`
//     never run at the same time; rows that overlap less run side by side and conflicts are fixed by follow-ups.
//
// Rows linked by dependencies or overlap form a lane (「レーン」); anchors most rows share (hubs) do not link rows, since
// the seed rows (「基準プロジェクト」) build those circuits first. A seed holds only the rows that share an anchor with it,
// not the whole plan, and seeds that share no anchor are built side by side.
//
// Everything here is pure, so the runner, the API (why a row waits) and the estimate use the same rules.
// ---------------------------------------------------------------------------

import type { PlanEstimate, PlanRecord, PlanRowRecord, PlanRowState, PlanRowWait } from "./plan.js";
import { PLAN_ESTIMATE, isFlowPlan, planEstimate } from "./plan.js";
import { MAX_REPLAN_JOBS, anchorKeySet, hubScores, type AnchoredRow } from "./planOrder.js";

/** Rows whose overlap score with a row being built reaches this wait until that row's work is in (see `overlapScore`). */
export const STRONG_OVERLAP = 3;
/** An anchor held by at least this share of the rows (and at least `HUB_MIN_ROWS` rows) is a hub: it links no lane. */
export const HUB_ANCHOR_SHARE = 0.25;
export const HUB_MIN_ROWS = 3;
/** Shared anchors whose circuits are already finished (a done row has them) weigh this much. */
export const COVERED_WEIGHT = 0.3;

/**
 * How strongly two rows build the same circuits: 1 per shared anchor, 2 when it is the ROI (first anchor) of either
 * row, times `COVERED_WEIGHT` when a finished row already built it (later rows reuse its definition).
 */
export function overlapScore(a: Pick<AnchoredRow, "anchors">, b: Pick<AnchoredRow, "anchors">, covered: ReadonlySet<string> = new Set()): number {
  const ka = anchorKeySet(a.anchors);
  const roi = new Set([...anchorKeySet(a.anchors?.slice(0, 1)), ...anchorKeySet(b.anchors?.slice(0, 1))]);
  let score = 0;
  for (const k of anchorKeySet(b.anchors)) {
    if (!ka.has(k)) continue;
    score += (roi.has(k) ? 2 : 1) * (covered.has(k) ? COVERED_WEIGHT : 1);
  }
  return Math.round(score * 100) / 100;
}

type LaneRow = AnchoredRow & { dependsOn?: readonly string[] };

/**
 * Lane of every row (1 = the largest lane; ties by the first row in input order): rows linked by a dependency or by a
 * shared anchor that is not a hub. A row with no link is a lane of its own.
 */
export function planLanes(rows: readonly LaneRow[]): Map<string, number> {
  const keys = rows.map((r) => anchorKeySet(r.anchors));
  const held = new Map<string, number>();
  for (const k of keys) for (const x of k) held.set(x, (held.get(x) ?? 0) + 1);
  const hubAt = Math.max(HUB_MIN_ROWS, Math.ceil(rows.length * HUB_ANCHOR_SHARE));
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (i: number, j: number) => {
    const a = find(i), b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const index = new Map(rows.map((r, i) => [r.rowId, i]));
  const firstHolder = new Map<string, number>();
  rows.forEach((r, i) => {
    for (const x of keys[i]) {
      if ((held.get(x) ?? 0) >= hubAt) continue;
      const f = firstHolder.get(x);
      if (f === undefined) firstHolder.set(x, i);
      else join(f, i);
    }
    for (const d of r.dependsOn ?? []) {
      const j = index.get(d);
      if (j !== undefined && j !== i) join(i, j);
    }
  });
  const groups = new Map<number, number[]>();
  rows.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
  const out = new Map<string, number>();
  sorted.forEach((g, n) => g.forEach((i) => out.set(rows[i].rowId, n + 1)));
  return out;
}

/** Why a waiting row does not start now (dependency, seed or overlap); `rowIds` are the rows it waits for. */
export type FlowWait = PlanRowWait & { kind: "dependency" | "seed" | "overlap" };

export type FlowRow = Pick<PlanRowRecord, "rowId" | "state" | "wave" | "order"> &
  Partial<Pick<PlanRowRecord, "anchors" | "dependsOn" | "seed" | "projectId" | "existing" | "priority" | "conform">>;

/** Rows whose work is not yet in: they hold the rows that overlap them strongly. */
const HOLDING: readonly PlanRowState[] = ["starting", "running", "question", "review"];
/** A seed in one of these no longer holds anything. */
const SEED_PASSED: readonly PlanRowState[] = ["done", "skipped", "cancelled"];

export interface FlowPlan {
  /** Waiting rows that may start now, in start order */
  ready: string[];
  /** Waiting rows that may not, with the reason */
  waits: Map<string, FlowWait>;
  /** Rows downstream of each row through dependencies (its weight on the critical path) */
  downstream: Map<string, number>;
}

/**
 * Which waiting (`pending`) rows may start now and in which order: rows that resume (a retry or a follow-up: they have a
 * project) first, conform follow-ups before retries, then seeds, then by the rows waiting downstream of them (the
 * critical path), hub score, priority, wave and order. A row is taken when its dependencies are done, no unfinished
 * seed shares an anchor with it (a seed: no other seed sharing an anchor is being built), and no row being built (or
 * taken before it in this call) overlaps it strongly. A dependency cycle is broken: a dependency that itself depends
 * (through others) on the row is not waited for.
 */
export function flowPlan(rows: readonly FlowRow[]): FlowPlan {
  const live = rows.filter((r) => r.state !== "skipped");
  const byId = new Map(live.map((r) => [r.rowId, r]));
  const keys = new Map(live.map((r) => [r.rowId, anchorKeySet(r.anchors)]));
  const covered = new Set<string>();
  for (const r of live) if (r.state === "done") for (const k of keys.get(r.rowId)!) covered.add(k);
  const deps = new Map(live.map((r) => [r.rowId, [...new Set((r.dependsOn ?? []).filter((d) => d !== r.rowId && byId.has(d)))]]));
  // transitive dependencies (to break cycles) and transitive dependents (the critical path)
  const reach = new Map<string, Set<string>>();
  for (const r of live) {
    const seen = new Set<string>();
    const stack = [r.rowId];
    while (stack.length) for (const d of deps.get(stack.pop()!) ?? []) if (!seen.has(d)) seen.add(d), stack.push(d);
    reach.set(r.rowId, seen);
  }
  const downstream = new Map(live.map((r) => [r.rowId, 0]));
  for (const r of live) if (r.state !== "done") for (const d of reach.get(r.rowId)!) downstream.set(d, (downstream.get(d) ?? 0) + 1);
  const hub = hubScores(live);
  const shares = (a: string, b: string) => {
    const kb = keys.get(b)!;
    for (const k of keys.get(a)!) if (kb.has(k)) return true;
    return false;
  };
  const score = (a: FlowRow, b: FlowRow) => overlapScore(a, b, covered);
  const prio = (r: FlowRow) => (typeof r.priority === "number" ? r.priority : 0);
  const rank = (r: FlowRow) => (r.projectId ? (r.conform ? 0 : 1) : r.seed ? 2 : 3);
  const waiting = live
    .filter((r) => r.state === "pending")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        downstream.get(b.rowId)! - downstream.get(a.rowId)! ||
        (hub.get(b.rowId) ?? 0) - (hub.get(a.rowId) ?? 0) ||
        prio(b) - prio(a) ||
        a.wave - b.wave ||
        a.order - b.order ||
        (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0),
    );
  const holders: FlowRow[] = live.filter((r) => HOLDING.includes(r.state) || (r.state === "pending" && !!r.projectId));
  const busySeeds = live.filter((r) => r.seed && !SEED_PASSED.includes(r.state) && r.state !== "pending");
  const ready: string[] = [];
  const waits = new Map<string, FlowWait>();
  for (const r of waiting) {
    if (r.projectId) {
      // a retry or a follow-up of a row already started: it already holds what it builds
      ready.push(r.rowId);
      continue;
    }
    const unmet = deps.get(r.rowId)!.filter((d) => byId.get(d)!.state !== "done" && !reach.get(d)!.has(r.rowId));
    if (unmet.length) {
      waits.set(r.rowId, { kind: "dependency", rowIds: unmet });
      continue;
    }
    if (r.seed) {
      const other = busySeeds.filter((s) => s.rowId !== r.rowId && shares(s.rowId, r.rowId));
      if (other.length) {
        waits.set(r.rowId, { kind: "seed", rowIds: other.map((s) => s.rowId) });
        continue;
      }
    } else {
      const seeds = live.filter((s) => s.seed && !SEED_PASSED.includes(s.state) && s.rowId !== r.rowId && shares(s.rowId, r.rowId));
      if (seeds.length) {
        waits.set(r.rowId, { kind: "seed", rowIds: seeds.map((s) => s.rowId) });
        continue;
      }
    }
    const blocking = holders.filter((h) => h.rowId !== r.rowId && score(h, r) >= STRONG_OVERLAP);
    if (blocking.length) {
      waits.set(r.rowId, { kind: "overlap", rowIds: blocking.map((h) => h.rowId) });
      continue;
    }
    ready.push(r.rowId);
    holders.push(r);
    if (r.seed) busySeeds.push(r);
  }
  return { ready, waits, downstream };
}

/**
 * Minutes a plan's rows take under flow scheduling at `concurrency`: each built row takes `PLAN_ESTIMATE.minutesPerRun`
 * and its work is in when it ends (time waiting for answers or approvals is not counted); plus the rework of
 * `estimatePlan`. Rows already done by an existing project and skipped rows are left out.
 */
export function simulateFlowMinutes(rows: readonly FlowRow[], concurrency: number): number {
  const c = Math.max(1, Math.floor(concurrency));
  const per = PLAN_ESTIMATE.minutesPerRun;
  const sim: FlowRow[] = rows
    .filter((r) => r.state !== "skipped")
    .map((r) => ({ ...r, state: r.existing ? ("done" as const) : ("pending" as const), projectId: null, conform: false }));
  const built = sim.filter((r) => r.state === "pending").length;
  if (!built) return 0;
  const endsAt = new Map<string, number>();
  let now = 0;
  for (let guard = 0; guard < built * 2 + 2; guard++) {
    const running = sim.filter((r) => r.state === "running");
    let free = c - running.length;
    if (free > 0) {
      for (const id of flowPlan(sim).ready) {
        if (free <= 0) break;
        const r = sim.find((x) => x.rowId === id)!;
        r.state = "running";
        endsAt.set(id, now + per);
        free--;
      }
    }
    const next = sim.filter((r) => r.state === "running");
    if (!next.length) break;
    now = Math.min(...next.map((r) => endsAt.get(r.rowId)!));
    for (const r of next) if (endsAt.get(r.rowId) === now) r.state = "done";
  }
  return Math.round(now + (built * PLAN_ESTIMATE.reworkShare * PLAN_ESTIMATE.reworkMinutes) / c);
}

/**
 * How many new rows an autonomous plan may start within its cost limit: what is left after the spend so far and half a
 * row's cost for each row being built (`reserve`), in rows of `perRowUsd`. With nothing being built one row may start
 * while anything is left, so the plan uses up its limit instead of idling short of it.
 */
export function rowsWithinCost(input: { maxCostUsd: number; spentUsd: number; inFlight: number; perRowUsd: number }): number {
  const left = input.maxCostUsd - input.spentUsd;
  if (left <= 0) return 0;
  const per = Math.max(0.01, input.perRowUsd);
  const n = Math.floor((left - input.inFlight * per * 0.5) / per);
  return Math.max(input.inFlight === 0 ? 1 : 0, n);
}

/** Cost of one more row: the 75th percentile of the plan's finished rows once 5 have finished, else the estimate's high end. */
export function perRowCostUsd(finishedCosts: readonly number[]): number {
  const xs = finishedCosts.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (xs.length < 5) return PLAN_ESTIMATE.costPerRowUsd.max;
  return xs[Math.min(xs.length - 1, Math.ceil(xs.length * 0.75) - 1)];
}

/** Slots the Orchestrator's own jobs (answers, resolutions, pull request decisions, re-plans) may hold at once: a third. */
export const controlSlotCap = (effective: number) => Math.max(1, Math.ceil(Math.max(1, effective) / 3));

/**
 * The estimate of a plan's rows as they are: flow plans by simulating the flow (`simulateFlowMinutes`), with their lanes;
 * other plans as `planEstimate` (waves one after another).
 */
export function planEstimateFor(plan: Pick<PlanRecord, "scheduling" | "ordering" | "status">, rows: readonly (FlowRow & Pick<PlanRowRecord, "existing" | "seed">)[], concurrency: number): PlanEstimate {
  const base = planEstimate(rows as PlanRowRecord[], concurrency);
  // a draft ordered automatically will run as a flow once confirmed
  const flow = isFlowPlan(plan) || (plan.ordering === "auto" && (plan.status === "DRAFT" || plan.status === "DRAFTING"));
  if (!flow) return base;
  const built = rows.filter((r) => r.state !== "skipped" && !r.existing);
  return { ...base, minutes: simulateFlowMinutes(rows, concurrency), lanes: new Set(planLanes(built).values()).size };
}

/** States of a row whose work is not finished (the earliest wave holding one is a flow plan's current wave). */
const UNFINISHED: readonly PlanRowState[] = ["pending", "starting", "running", "question", "review", "decision", "attention"];

/** A flow plan's current wave: the earliest wave with an unfinished row (only shown; it holds nothing back). */
export function flowActiveWave(rows: readonly Pick<PlanRowRecord, "wave" | "state">[], current: number | null): number | null {
  const waves = rows.filter((r) => UNFINISHED.includes(r.state)).map((r) => r.wave);
  return waves.length ? Math.min(...waves) : current;
}

/**
 * Whether a flow plan asks a re-plan job for proposals now: once its first row is done, then each time a tenth of the
 * rows it builds (at least one) have finished since the last one (`replanDone`: rows done then).
 */
export function flowReplanDue(rows: readonly Pick<PlanRowRecord, "state" | "existing">[], replanDone: number | null): boolean {
  const built = rows.filter((r) => r.state !== "skipped" && r.state !== "cancelled" && !r.existing);
  const done = built.filter((r) => r.state === "done").length;
  if (replanDone === null) return done >= 1;
  return done - replanDone >= Math.max(1, Math.ceil(built.length / MAX_REPLAN_JOBS));
}
