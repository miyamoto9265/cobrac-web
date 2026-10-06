import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FrgInputs, HcdInputs, PipelineStage, StepState, WorkflowStep } from "@cobrac/shared";
import { CSV_FILE_NAMES, FRG_FILES, HCD_FILES, PROJECT_FILES, RESEARCH_FILES } from "@cobrac/shared";

export const CSV_FILES: readonly string[] = CSV_FILE_NAMES;

export interface ProjectPaths {
  root: string; // {workDir}/{projectId}
  meta: string;
  decisionLog: string;
  report: string;
  rcsLog: string;
  referenceCheck: string;
  quoteCheck: string;
  /** HCD ↔ FRG consistency record (record-only) */
  crossCheck: string;
  /** Bottom-up candidates for the FRG, computed from the HCD */
  frgCandidates: string;
  /** Hash and remaining problems of the HCD / FRG files as their phase last checked them */
  phaseBaseline: string;
  /** Hypothesis mode: the hypotheses, their share and the GNs that depend on them */
  hypotheses: string;
  /** Research mode: the agent's survey, the worker's search log and coverage check */
  research: string;
  researchLog: string;
  researchCheck: string;
  hcd: string;
  frg: string;
  csv: string;
}

export function projectPaths(workDir: string, projectId: string): ProjectPaths {
  const root = join(workDir, projectId);
  return {
    root,
    meta: join(root, PROJECT_FILES.meta),
    decisionLog: join(root, PROJECT_FILES.decisionLog),
    report: join(root, PROJECT_FILES.report),
    rcsLog: join(root, PROJECT_FILES.rcsLog),
    referenceCheck: join(root, PROJECT_FILES.referenceCheck),
    quoteCheck: join(root, PROJECT_FILES.quoteCheck),
    crossCheck: join(root, PROJECT_FILES.crossCheck),
    frgCandidates: join(root, PROJECT_FILES.frgCandidates),
    phaseBaseline: join(root, PROJECT_FILES.phaseBaseline),
    hypotheses: join(root, PROJECT_FILES.hypotheses),
    research: join(root, RESEARCH_FILES.plan),
    researchLog: join(root, RESEARCH_FILES.log),
    researchCheck: join(root, RESEARCH_FILES.check),
    hcd: join(root, `${projectId}_HCD`),
    frg: join(root, `${projectId}_FRG`),
    csv: join(root, `${projectId}_CSV`),
  };
}

function hasFiles(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export function csvComplete(p: ProjectPaths): boolean {
  return CSV_FILES.every((f) => existsSync(join(p.csv, f)));
}

/**
 * Step states: a phase is "done" only once the worker has accepted it (`done`); file presence only marks it running.
 * `xlsxDone` is set by the finalizer.
 */
export function detectStepStates(p: ProjectPaths, done: Set<WorkflowStep>, xlsxDone: boolean): Record<WorkflowStep, StepState> {
  const hcdDone = done.has("HCD");
  const frgDone = done.has("FRG");
  const csvDone = done.has("CSV");
  const hcd: StepState = hcdDone ? "done" : hasFiles(p.hcd) || existsSync(p.root) ? "running" : "pending";
  const frg: StepState = frgDone ? "done" : hasFiles(p.frg) || hcdDone ? "running" : "pending";
  const csv: StepState = csvDone ? "done" : frgDone ? "running" : "pending";
  const xlsx: StepState = xlsxDone ? "done" : csvDone ? "running" : "pending";
  return { HCD: hcd, FRG: frg, CSV: csv, XLSX: xlsx };
}

export function currentStepOf(states: Record<WorkflowStep, StepState>): WorkflowStep | null {
  for (const s of ["HCD", "FRG", "CSV", "XLSX"] as WorkflowStep[]) if (states[s] === "running") return s;
  for (const s of ["XLSX", "CSV", "FRG", "HCD"] as WorkflowStep[]) if (states[s] === "done") return s;
  return null;
}

/** The stage shown as in progress: the research step or adjustment turn when one runs, else the first running step. */
export function liveStageOf(states: Record<WorkflowStep, StepState>, override: "RESEARCH" | "ADJUST" | null): PipelineStage | null {
  if (override) return override;
  return (["HCD", "FRG", "CSV", "XLSX"] as WorkflowStep[]).find((s) => states[s] === "running") ?? null;
}

function readIfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

export function loadHcdFiles(p: ProjectPaths): HcdInputs {
  return {
    meta: readIfExists(p.meta),
    decisionLog: readIfExists(p.decisionLog),
    report: readIfExists(p.report),
    references: readIfExists(join(p.hcd, HCD_FILES.references)),
    uc: readIfExists(join(p.hcd, HCD_FILES.uc)),
    connections: readIfExists(join(p.hcd, HCD_FILES.connections)),
  };
}

export function loadFrgFiles(p: ProjectPaths): FrgInputs {
  return { report: readIfExists(p.report), frg: readIfExists(join(p.frg, FRG_FILES.frg)) };
}

/**
 * A workspace made before v0.8 (markdown tables such as `3_UC.md`, no `uc.json`). The harness no longer reads it,
 * so follow-ups and retries stop instead of spending tokens on a project that cannot be validated.
 */
export function isLegacyWorkspace(p: ProjectPaths): boolean {
  if (existsSync(join(p.hcd, HCD_FILES.uc))) return false;
  try {
    return [p.hcd, p.frg].some((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith(".md")));
  } catch {
    return false;
  }
}
