import type { PlanRowState, PlanStatus } from "@cobrac/shared";
import type { TFn } from "../i18n";

export const planPath = (planId: string) => `/plans/${encodeURIComponent(planId)}`;

/** Colours from the text / surface pairs checked in test/theme.test.tsx. */
export const PLAN_STATUS_COLOR: Record<PlanStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
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
