import type { PlanRowState, PlanStatus } from "@cobrac/shared";
import { PLAN_ATTACHMENT_EXTS } from "@cobrac/shared";
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
};

/** States shown in the progress bar and counts, in workflow order (starting is counted as running). */
export const ROW_STATE_ORDER: PlanRowState[] = ["pending", "running", "question", "attention", "done", "skipped", "cancelled"];

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

/**
 * A seed wave (「種」): every row of it that is built is a seed row. Rows done by an existing project keep their wave
 * (often 1, next to the first seed) and skipped rows are not built, so neither counts.
 */
export function isSeedWave(rows: { seed?: boolean; existing?: unknown; state?: string }[]): boolean {
  const built = rows.filter((r) => !r.existing && r.state !== "skipped");
  return built.length > 0 && built.every((r) => r.seed);
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
