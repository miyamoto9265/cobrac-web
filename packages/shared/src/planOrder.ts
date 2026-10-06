// ---------------------------------------------------------------------------
// Build order of a BRA Planner plan (stage 2). The `plan` job (an LLM with RCS) supplies the data — rows, their SABRA
// anchors, dependencies, priorities — and this code computes the order, so runs are reproducible and re-planning after
// each wave is cheap:
//
//   1. hub score of a row = how many other rows share at least one anchor with it;
//   2. seed wave (種の波): the top 1–3 rows by (hub score, priority), built one at a time, each in its own wave;
//   3. body waves: the other rows in topological order of `dependsOn`, ties by (hub score desc, priority desc, row ID),
//      each placed in the earliest wave that is after its dependencies, has fewer than `concurrency` rows, and holds no
//      row sharing `OVERLAP_LIMIT` or more anchors with it.
//
// Anchors are SABRA units as UC Descriptor anchors: `HOMBA:<id>` (the DHBA side of SABRA), `BNA:<l>-<r>` (a BNA area
// pair) or `BNAG:<L2>` (a BNA gyrus group). For comparing rows a BNA group stands for each BNA area pair in it, so a row
// anchored on `BNAG:IFG` shares anchors with one anchored on an IFG area. HOMBA terms are compared as they are.
// ---------------------------------------------------------------------------

import { BNA_AREAS } from "./bnaLabels.js";
import type { PlanRowRecord } from "./plan.js";
import { planRowKey } from "./plan.js";
import type { ProjectRecord } from "./types.js";
import { bnaArea, isBnaL2, parseUcDescriptor } from "./ucNaming.js";

/** Two rows sharing at least this many anchors are never in the same wave. */
export const OVERLAP_LIMIT = 2;
/** At most this many rows are in the seed wave. */
export const MAX_SEED_ROWS = 3;
/** A row joins the seed wave when its hub score is at least this share of the highest one. */
export const SEED_HUB_SHARE = 0.6;
/** Anchors kept per row. */
export const MAX_ROW_ANCHORS = 40;

// --- anchors -------------------------------------------------------------------------------------------------------

/**
 * The canonical anchors in `text` (`BNA:29` → `BNA:29-30`; facets such as `/side:left` are dropped; `&` joins several),
 * or null when it is not a UC Descriptor anchor of a known BNA area / group or a HOMBA term ID.
 */
export function normalizePlanAnchor(text: unknown): string[] | null {
  if (typeof text !== "string") return null;
  const head = text.trim().split("/")[0];
  if (!head) return null;
  const r = parseUcDescriptor(head);
  if ("errors" in r) return null;
  const out: string[] = [];
  for (const a of r.descriptor.anchors) {
    if (a.kind === "homba") out.push(a.id);
    else if (a.kind === "bnag") {
      if (!isBnaL2(a.l2)) return null;
      out.push(`BNAG:${a.l2}`);
    } else {
      const area = bnaArea(a.left);
      if (!area) return null;
      out.push(`BNA:${area.left}-${area.left + 1}`);
    }
  }
  return out.length ? out : null;
}

/** Valid anchors of a list (deduplicated, at most `MAX_ROW_ANCHORS`) and how many entries were not anchors. */
export function planAnchors(list: unknown): { anchors: string[]; dropped: number } {
  const items = Array.isArray(list) ? list : [];
  const out = new Set<string>();
  let dropped = 0;
  for (const x of items) {
    const a = normalizePlanAnchor(x);
    if (!a) dropped++;
    else for (const y of a) out.add(y);
  }
  return { anchors: [...out].slice(0, MAX_ROW_ANCHORS), dropped };
}

/** The anchors a finished project actually used: those of every UC and Collection descriptor in its uc.json. */
export function anchorsOfUcJson(ucJson: unknown): string[] {
  const doc = (ucJson ?? {}) as { ucs?: { descriptor?: unknown }[]; collections?: { descriptor?: unknown }[] };
  const descriptors = [...(Array.isArray(doc.ucs) ? doc.ucs : []), ...(Array.isArray(doc.collections) ? doc.collections : [])].map((u) => u?.descriptor);
  return planAnchors(descriptors.filter((d) => typeof d === "string" && d.trim())).anchors;
}

const BNA_PAIRS_BY_L2: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [left, , l2] of BNA_AREAS) m.set(l2, [...(m.get(l2) ?? []), `bna:${left}-${left + 1}`]);
  return m;
})();

/** Comparison keys of an anchor: a BNA group stands for its area pairs. */
export function anchorKeys(anchor: string): string[] {
  const a = anchor.trim();
  const g = /^BNAG:(.+)$/.exec(a);
  if (g) return [...(BNA_PAIRS_BY_L2.get(g[1]) ?? [`bnag:${g[1].toLowerCase()}`])];
  return [a.toLowerCase()];
}

const keySet = (anchors: readonly string[] | undefined) => new Set((anchors ?? []).flatMap(anchorKeys));

/** How many anchors two rows share (after expanding BNA groups). */
export function sharedAnchors(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  const ka = keySet(a);
  let n = 0;
  for (const k of keySet(b)) if (ka.has(k)) n++;
  return n;
}

export interface AnchoredRow {
  rowId: string;
  anchors?: readonly string[];
}

/** Hub score of every row: the number of other rows sharing at least one anchor with it. */
export function hubScores(rows: readonly AnchoredRow[]): Map<string, number> {
  const keys = rows.map((r) => keySet(r.anchors));
  const out = new Map<string, number>();
  rows.forEach((r, i) => {
    let n = 0;
    keys.forEach((k, j) => {
      if (i !== j && [...k].some((x) => keys[i].has(x))) n++;
    });
    out.set(r.rowId, n);
  });
  return out;
}

/** For every row, the other rows sharing at least `limit` anchors with it. */
export function overlapsOf(rows: readonly AnchoredRow[], limit = OVERLAP_LIMIT): Map<string, string[]> {
  const out = new Map<string, string[]>(rows.map((r) => [r.rowId, []]));
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (sharedAnchors(rows[i].anchors, rows[j].anchors) >= limit) {
        out.get(rows[i].rowId)!.push(rows[j].rowId);
        out.get(rows[j].rowId)!.push(rows[i].rowId);
      }
    }
  }
  return out;
}

// --- order ---------------------------------------------------------------------------------------------------------

export interface OrderRow extends AnchoredRow {
  dependsOn?: readonly string[];
  priority?: number | null;
  seed?: boolean;
}

export interface OrderOptions {
  /** Rows per body wave: the effective concurrency */
  concurrency: number;
  /** Wave number of the first wave to fill (the seed wave, or the first body wave) */
  firstWave?: number;
  /**
   * auto: choose the seed rows. keep: the rows flagged `seed` stay seeds (re-planning keeps the seed set of the rows
   * that have not started). none: no seed wave.
   */
  seeds?: "auto" | "keep" | "none";
  /** Rows that are not placed (already started, done or existing) but count for the hub scores */
  context?: readonly AnchoredRow[];
}

export interface OrderResult {
  /** Wave of every placed row */
  wave: Map<string, number>;
  /** Seed rows, in their order */
  seeds: string[];
  /** All placed rows in build order */
  order: string[];
  hub: Map<string, number>;
  /** True when a dependency cycle had to be broken (the rest of the order still follows the dependencies) */
  cycle: boolean;
}

const prio = (r: OrderRow) => (typeof r.priority === "number" ? r.priority : 0);

/**
 * Seeds: rows without dependencies on other rows being placed, sorted by (hub desc, priority desc, row ID); the best one
 * and those with at least `SEED_HUB_SHARE` of its hub score, at most `MAX_SEED_ROWS`. No seed wave when no row shares an
 * anchor with another one, or when there is a single row.
 */
function chooseSeeds(rows: OrderRow[], hub: Map<string, number>, ids: Set<string>): OrderRow[] {
  if (rows.length < 2) return [];
  const free = rows.filter((r) => !(r.dependsOn ?? []).some((d) => ids.has(d) && d !== r.rowId));
  const best = free.sort(byRank(hub));
  const top = best[0] ? (hub.get(best[0].rowId) ?? 0) : 0;
  if (top <= 0) return [];
  const threshold = Math.max(1, Math.ceil(top * SEED_HUB_SHARE));
  return best.filter((r) => (hub.get(r.rowId) ?? 0) >= threshold).slice(0, MAX_SEED_ROWS);
}

const byRank = (hub: Map<string, number>) => (a: OrderRow, b: OrderRow) =>
  (hub.get(b.rowId) ?? 0) - (hub.get(a.rowId) ?? 0) || prio(b) - prio(a) || (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0);

/** Computes the waves of `rows` (see the file comment). Deterministic for the same input. */
export function orderPlanRows(rows: readonly OrderRow[], opts: OrderOptions): OrderResult {
  const c = Math.max(1, Math.floor(opts.concurrency));
  const first = Math.max(1, Math.floor(opts.firstWave ?? 1));
  const all: AnchoredRow[] = [...rows, ...(opts.context ?? []).filter((x) => !rows.some((r) => r.rowId === x.rowId))];
  const hub = hubScores(all);
  const ids = new Set(rows.map((r) => r.rowId));
  const deps = new Map(rows.map((r) => [r.rowId, [...new Set((r.dependsOn ?? []).filter((d) => ids.has(d) && d !== r.rowId))]]));
  const rank = byRank(hub);

  const seedMode = opts.seeds ?? "auto";
  const seeds = seedMode === "none" ? [] : seedMode === "keep" ? rows.filter((r) => r.seed).sort(rank) : chooseSeeds([...rows], hub, ids);
  const seedIds = new Set(seeds.map((r) => r.rowId));
  const wave = new Map<string, number>();
  const order: string[] = [];
  seeds.forEach((r, i) => {
    wave.set(r.rowId, first + i);
    order.push(r.rowId);
  });

  // body: Kahn's algorithm over the dependencies among body rows (dependencies on seeds are met by construction)
  const body = rows.filter((r) => !seedIds.has(r.rowId));
  const placed = new Set(seedIds);
  const remaining = new Set(body.map((r) => r.rowId));
  const bodyStart = first + seeds.length;
  const members = new Map<number, OrderRow[]>();
  let cycle = false;
  while (remaining.size) {
    const pending = body.filter((r) => remaining.has(r.rowId));
    const ready = pending.filter((r) => deps.get(r.rowId)!.every((d) => placed.has(d)));
    let next: OrderRow;
    if (ready.length) next = ready.sort(rank)[0];
    else {
      // a cycle: take the best row of it and keep going
      cycle = true;
      next = pending.sort(rank)[0];
    }
    const after = Math.max(bodyStart - 1, ...deps.get(next.rowId)!.filter((d) => wave.has(d)).map((d) => wave.get(d)!));
    let w = after + 1;
    while ((members.get(w)?.length ?? 0) >= c || (members.get(w) ?? []).some((m) => sharedAnchors(m.anchors, next.anchors) >= OVERLAP_LIMIT)) w++;
    members.set(w, [...(members.get(w) ?? []), next]);
    wave.set(next.rowId, w);
    order.push(next.rowId);
    placed.add(next.rowId);
    remaining.delete(next.rowId);
  }
  return { wave, seeds: seeds.map((r) => r.rowId), order, hub, cycle };
}

// --- plan rows -----------------------------------------------------------------------------------------------------

type PlanRowLike = Pick<PlanRowRecord, "rowId" | "state" | "projectId" | "existing" | "anchors" | "dependsOn" | "priority" | "seed" | "wave">;

/** Rows the order may still move: waiting, never started, not done by an existing project. */
export const isMovableRow = (r: Pick<PlanRowRecord, "state" | "projectId" | "existing">) => r.state === "pending" && !r.projectId && !r.existing;

/**
 * The order of a whole draft: every row that will be built is placed from wave 1, seeds chosen automatically; rows done
 * by an existing project only count for the hub scores. Returns wave and seed flag per row ID.
 */
export function orderDraft(rows: readonly PlanRowLike[], concurrency: number): { wave: Map<string, number>; seed: Map<string, boolean>; cycle: boolean } {
  const place = rows.filter((r) => r.state !== "skipped" && !r.existing);
  const r = orderPlanRows(
    place.map((x) => ({ rowId: x.rowId, anchors: x.anchors, dependsOn: x.dependsOn, priority: x.priority })),
    { concurrency, firstWave: 1, seeds: "auto", context: rows.filter((x) => x.existing) },
  );
  return { wave: r.wave, seed: new Map(place.map((x) => [x.rowId, r.seeds.includes(x.rowId)])), cycle: r.cycle };
}

/**
 * Re-plan after wave `finishedWave`: the rows that have not started are ordered again from the next wave, with the
 * current anchors (the finished rows' actual ones) and hub scores; seed rows that have not started stay seeds. Rows
 * that started, finished or need attention keep their waves. Returns the new wave of each movable row whose wave changes.
 */
export function replanRows(rows: readonly PlanRowLike[], finishedWave: number, concurrency: number): Map<string, number> {
  const movable = rows.filter(isMovableRow);
  if (!movable.length) return new Map();
  const r = orderPlanRows(
    movable.map((x) => ({ rowId: x.rowId, anchors: x.anchors, dependsOn: x.dependsOn, priority: x.priority, seed: x.seed })),
    { concurrency, firstWave: finishedWave + 1, seeds: "keep", context: rows.filter((x) => !isMovableRow(x) && x.state !== "skipped") },
  );
  const out = new Map<string, number>();
  for (const x of movable) {
    const w = r.wave.get(x.rowId);
    if (w !== undefined && w !== x.wave) out.set(x.rowId, w);
  }
  return out;
}

/** About this many re-plan jobs (proposals) at most per plan; re-ordering itself happens after every wave. */
export const MAX_REPLAN_JOBS = 10;

/**
 * Whether a re-plan job should be asked for after wave `finishedWave`. The first one comes right after the first wave
 * that finishes (the first seed, the main hub). Later ones wait until a tenth of the rows the plan builds (at least
 * one) have finished since the wave of the last one (`lastJobWave`): at concurrency 1 every body wave is one row, and
 * a job after every wave would be one paid job, and one held slot, per row.
 */
export function replanJobDue(rows: readonly Pick<PlanRowRecord, "state" | "existing" | "wave">[], finishedWave: number, lastJobWave: number | null): boolean {
  if (lastJobWave === null) return true;
  const built = rows.filter((r) => r.state !== "skipped" && r.state !== "cancelled" && !r.existing);
  const every = Math.max(1, Math.ceil(built.length / MAX_REPLAN_JOBS));
  const since = built.filter((r) => r.state === "done" && r.wave > lastJobWave && r.wave <= finishedWave).length;
  return since >= every;
}

// --- duplicates of the owner's projects ----------------------------------------------------------------------------

export type ProjectLike = Pick<ProjectRecord, "projectId" | "roi" | "tlf" | "status" | "hasArtifacts" | "deletedAt"> & { name?: string };

/**
 * The owner's project with the same ROI × TLF (case and spacing ignored): `existing` when it is COMPLETED with
 * artifacts (the row is not rebuilt), `duplicateOf` when it is not finished (a warning). Deleted projects do not count;
 * projects of `exclude` (the plan's own) neither.
 */
export function matchExistingProject(row: { roi: string; tlf: string }, projects: readonly ProjectLike[], exclude: ReadonlySet<string> = new Set()): { existing: { projectId: string; name: string } | null; duplicateOf: string | null } {
  const key = planRowKey(row.roi, row.tlf);
  const same = projects.filter((p) => !p.deletedAt && !exclude.has(p.projectId) && planRowKey(p.roi, p.tlf) === key);
  const done = same.find((p) => p.status === "COMPLETED" && p.hasArtifacts);
  if (done) return { existing: { projectId: done.projectId, name: done.name ?? done.projectId }, duplicateOf: null };
  return { existing: null, duplicateOf: same[0]?.projectId ?? null };
}
