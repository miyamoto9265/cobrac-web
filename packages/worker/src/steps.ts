import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StepState, WorkflowStep } from "@cobrac/shared";

export const CSV_FILES = ["Project.csv", "References.csv", "Circuits.csv", "Connections.csv", "FRG.csv"];

export interface ProjectPaths {
  root: string; // {workDir}/{projectId}
  hcd: string;
  frg: string;
  csv: string;
}

export function projectPaths(workDir: string, projectId: string): ProjectPaths {
  const root = join(workDir, projectId);
  return {
    root,
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

function anyExists(dir: string, names: string[]): boolean {
  return names.some((n) => existsSync(join(dir, n)));
}

export function csvComplete(p: ProjectPaths): boolean {
  return CSV_FILES.every((f) => existsSync(join(p.csv, f)));
}

/**
 * Determine step states from the files on disk. `markers` are `[STEP_COMPLETE]` markers seen so far
 * and `xlsxDone` is set by the finalizer.
 */
export function detectStepStates(
  p: ProjectPaths,
  markers: Set<WorkflowStep>,
  xlsxDone: boolean,
): Record<WorkflowStep, StepState> {
  const hcdDone = markers.has("HCD") || anyExists(p.hcd, ["8_diagram.md", "7_EasyToUnderstand.md"]);
  const frgDone = markers.has("FRG") || anyExists(p.frg, ["5_FRG作成レポート.md"]);
  const csvDone = markers.has("CSV") || csvComplete(p);

  const hcd: StepState = hcdDone ? "done" : hasFiles(p.hcd) || existsSync(p.root) ? "running" : "pending";
  const frg: StepState = frgDone ? "done" : hasFiles(p.frg) || hcdDone ? "running" : "pending";
  const csv: StepState = csvDone ? "done" : hasFiles(p.csv) || frgDone ? "running" : "pending";
  const xlsx: StepState = xlsxDone ? "done" : csvDone ? "running" : "pending";
  return { HCD: hcd, FRG: frg, CSV: csv, XLSX: xlsx };
}

export function currentStepOf(states: Record<WorkflowStep, StepState>): WorkflowStep | null {
  for (const s of ["HCD", "FRG", "CSV", "XLSX"] as WorkflowStep[]) if (states[s] === "running") return s;
  for (const s of ["XLSX", "CSV", "FRG", "HCD"] as WorkflowStep[]) if (states[s] === "done") return s;
  return null;
}

export function listArtifactsSummary(p: ProjectPaths): string[] {
  const out: string[] = [];
  for (const [label, dir] of [
    ["HCD", p.hcd],
    ["FRG", p.frg],
    ["CSV", p.csv],
  ] as const) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) out.push(`${label}/${f}`);
  }
  return out;
}
