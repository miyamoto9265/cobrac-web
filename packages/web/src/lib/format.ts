import type { ProjectStatus, WorkflowStep } from "@cobrac/shared";

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  QUEUED: "bg-slate-200 text-slate-700",
  RUNNING: "bg-blue-100 text-blue-700",
  WAITING_USER_INPUT: "bg-amber-100 text-amber-800",
  FINALIZING: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-300 text-slate-700",
};

export const STEP_LABEL: Record<WorkflowStep, string> = { HCD: "HCD", FRG: "FRG", CSV: "CSV", XLSX: "xlsx" };

export function fmtDate(iso: string | null | undefined, locale: string = "en"): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const tag = locale === "ja" ? "ja-JP" : "en-US";
  return d.toLocaleString(tag, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const isActive = (s: ProjectStatus) => ["QUEUED", "RUNNING", "FINALIZING", "WAITING_USER_INPUT"].includes(s);
