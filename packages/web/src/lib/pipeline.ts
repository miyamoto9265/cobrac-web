import type { JobRecord, ProjectRecord, StepState } from "@cobrac/shared";

export type StageId = "research" | "hcd" | "frg" | "cross" | "csv" | "xlsx";
/** `stopped`: was in progress when the job failed or was cancelled */
export type StageStatus = "pending" | "active" | "done" | "stopped";
/** `running`: the active stage animates; `waiting`: paused on the user's answer */
export type RunState = "running" | "waiting" | "idle";

export interface PipelineView {
  run: RunState;
  /** Research step (null: research mode off for this project) */
  research: StageStatus | null;
  hcd: StageStatus;
  frg: StageStatus;
  /** HCD ↔ FRG consistency check and its adjustment turn */
  cross: StageStatus;
  csv: StageStatus;
  xlsx: StageStatus;
  /** The adjustment turn is running: HCD and FRG are revised together */
  loop: boolean;
}

type ProjectProgress = Pick<ProjectRecord, "status" | "stepStates" | "activeStage" | "researchMode">;

/**
 * Stage display of the harness from the project's live status: research (research mode) → HCD ⇄ FRG with the
 * consistency check and adjustment turn → CSV → xlsx. `activeStage` (written by the worker) tells the research step
 * and the adjustment turn apart from the step states; without it the step states alone are used.
 */
export function pipelineView(p: ProjectProgress, jobs: Pick<JobRecord, "researchStep">[]): PipelineView {
  const run: RunState = p.status === "RUNNING" || p.status === "FINALIZING" ? "running" : p.status === "WAITING_USER_INPUT" ? "waiting" : "idle";
  const live = run !== "idle";
  const stage = live ? (p.activeStage ?? null) : null;
  const s = p.stepStates;
  const of = (st: StepState): StageStatus => (st === "done" ? "done" : st !== "running" ? "pending" : live ? "active" : p.status === "QUEUED" ? "pending" : "stopped");

  const researched = jobs.some((j) => j.researchStep) || s.HCD === "done";
  const research: StageStatus | null =
    p.researchMode || jobs.some((j) => j.researchStep) ? (stage === "RESEARCH" ? "active" : researched ? "done" : "pending") : null;

  const loop = stage === "ADJUST";
  const hcd: StageStatus = stage === "RESEARCH" ? (s.HCD === "done" ? "done" : "pending") : loop ? "active" : of(s.HCD);
  const frg: StageStatus = loop ? "active" : of(s.FRG);
  const cross: StageStatus = loop ? "active" : s.FRG === "done" ? "done" : "pending";
  return { run, research, hcd, frg, cross, csv: of(s.CSV), xlsx: of(s.XLSX), loop };
}
