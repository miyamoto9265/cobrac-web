import type { CanonPullRequestRecord, PlanRowState, PlanRowView, PlanStatus } from "@cobrac/shared";
import { PLAN_ATTACHMENT_EXTS, PLAN_MAX_WAITING_PRS, waitingPrs } from "@cobrac/shared";
import type { TFn } from "../i18n";

export const planPath = (planId: string) => `/plans/${encodeURIComponent(planId)}`;

/** Colours from the text / surface pairs checked in test/theme.test.tsx. */
export const PLAN_STATUS_COLOR: Record<PlanStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  DRAFTING: "bg-blue-50 text-blue-700",
  RUNNING: "bg-blue-50 text-blue-700",
  PAUSED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-700",
};

export const ROW_STATE_COLOR: Record<PlanRowState, string> = {
  pending: "bg-slate-100 text-slate-700",
  starting: "bg-blue-50 text-blue-700",
  running: "bg-blue-50 text-blue-700",
  question: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-700",
  attention: "bg-rose-50 text-rose-700",
  skipped: "bg-slate-50 text-slate-500",
  cancelled: "bg-slate-100 text-slate-700",
  review: "bg-violet-50 text-violet-700",
  decision: "bg-amber-50 text-amber-700",
};

/** States shown in the progress bar and counts, in workflow order (starting is counted as running). */
export const ROW_STATE_ORDER: PlanRowState[] = ["pending", "running", "question", "review", "decision", "attention", "done", "skipped", "cancelled"];

/**
 * Seed rows whose pull request waits for approval while they hold the next wave (the runner's seed gate): seeds of the
 * active wave or an earlier one in 「承認待ち」.
 */
export function seedGateRows<T extends Pick<PlanRowView, "seed" | "state" | "wave">>(rows: T[], activeWave: number | null | undefined): T[] {
  if (!activeWave) return [];
  return rows.filter((r) => r.seed && r.state === "review" && r.wave <= activeWave);
}

/** Back-pressure: no new wave starts while this many pull requests of the plan wait for approval. */
export const backPressure = (rows: Pick<PlanRowView, "state">[]) => waitingPrs(rows) >= PLAN_MAX_WAITING_PRS;

/** Open pull requests 「まとめて承認」 may offer: no conflicts or needs-review items, and no request for changes. */
export const bulkApprovable = (p: Pick<CanonPullRequestRecord, "state" | "summary" | "reviewState">) =>
  p.state === "open" && p.summary.errors === 0 && p.summary.warnings === 0 && p.reviewState !== "changes_requested";

/** `48 min` below two hours, else `~12.5 h` / `~32 h`. */
export function fmtDuration(minutes: number | null | undefined, t: TFn): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 120) return t("plan.minutes", { m: Math.round(minutes) });
  const h = minutes / 60;
  return t("plan.hours", { h: h < 10 ? Math.round(h * 10) / 10 : Math.round(h) });
}

/** Rows split into waves of `size` in their current order (the owner's quick way to set waves). */
export function splitIntoWaves<T extends { wave: number }>(rows: T[], size: number): T[] {
  const n = Math.max(1, Math.floor(size));
  return rows.map((r, i) => ({ ...r, wave: Math.floor(i / n) + 1 }));
}

/** `accept` of the capability list picker (the types a plan accepts). */
export const PLAN_FILE_ACCEPT = PLAN_ATTACHMENT_EXTS.map((e) => `.${e}`).join(",");

/** Stored wave numbers of the rows, ascending (headings show these, not their position). */
export const planWaves = (rows: { wave: number }[]) => [...new Set(rows.map((r) => r.wave))].sort((a, b) => a - b);

type SeedFacts = { seed?: boolean; existing?: unknown; state?: string };
/** Rows done by an existing project and skipped rows are not built. */
const isBuilt = (r: SeedFacts) => !r.existing && r.state !== "skipped";

/**
 * A seed wave (「種」): its only built row is a seed row (a seed put next to other rows by hand runs with them). Rows
 * done by an existing project (listed in the last wave) and skipped rows are not built, so they do not count.
 */
export function isSeedWave(rows: SeedFacts[]): boolean {
  const built = rows.filter(isBuilt);
  return built.length === 1 && !!built[0].seed;
}

/** Indexes of the rows built one at a time as seeds: seed rows that are the only built row of their wave (as `isSeedWave`). */
export function seedIndexes(rows: (SeedFacts & { wave: number })[]): Set<number> {
  const byWave = new Map<number, number[]>();
  rows.forEach((r, i) => isBuilt(r) && byWave.set(r.wave, [...(byWave.get(r.wave) ?? []), i]));
  return new Set([...byWave.values()].filter((ix) => ix.length === 1 && rows[ix[0]].seed).map((ix) => ix[0]));
}

/**
 * The waves line of the summary. Before confirmation: how many waves. Running: the stored number of the active wave
 * (as its heading) out of the total, or its position among the waves when the stored numbers have gaps (1, 3, 5).
 */
export function wavesText(waves: number[], activeWave: number | null | undefined, t: TFn): string {
  if (!activeWave) return t("plan.waveCount", { n: waves.length });
  if (!waves.length || waves.at(-1) === waves.length) return t("plan.waveOf", { n: activeWave, total: Math.max(waves.length, activeWave) });
  return t("plan.waveOfGapped", { n: activeWave, i: waves.filter((w) => w <= activeWave).length, count: waves.length });
}

/** Runs of consecutive rows with the same wave, in list order, with each row's index (the draft editor's headings). */
export function waveRuns<T extends { wave: number }>(rows: T[]): { wave: number; items: { row: T; index: number }[] }[] {
  const out: { wave: number; items: { row: T; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    const last = out.at(-1);
    if (last && last.wave === row.wave) last.items.push({ row, index });
    else out.push({ wave: row.wave, items: [{ row, index }] });
  });
  return out;
}

/** Time since `fromIso`: `12 s` under a minute, else as `fmtDuration`. */
export function fmtElapsed(fromIso: string | null | undefined, now: number, t: TFn): string {
  const from = fromIso ? Date.parse(fromIso) : NaN;
  if (!Number.isFinite(from)) return "—";
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return s < 60 ? t("plan.seconds", { s }) : fmtDuration(Math.floor(s / 60), t);
}

/** The anchors shown on a row (the first `max`) and how many more there are. */
export function shownAnchors(anchors: readonly string[] | null | undefined, max = 4): { shown: string[]; more: number } {
  const all = anchors ?? [];
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) };
}
