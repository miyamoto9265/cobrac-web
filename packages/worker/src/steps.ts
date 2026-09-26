import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FrgFileKey, HcdFileKey, StepState, WorkflowStep } from "@cobrac/shared";
import { CSV_FILE_NAMES, FRG_FILES, HCD_FILES } from "@cobrac/shared";

export const CSV_FILES: readonly string[] = CSV_FILE_NAMES;

export interface ProjectPaths {
  root: string; // {workDir}/{projectId}
  meta: string;
  hcd: string;
  frg: string;
  csv: string;
}

export function projectPaths(workDir: string, projectId: string): ProjectPaths {
  const root = join(workDir, projectId);
  return {
    root,
    meta: join(root, "meta.json"),
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

function readIfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

function readFirst(dir: string, names: readonly string[]): string | null {
  for (const n of names) {
    const t = readIfExists(join(dir, n));
    if (t !== null) return t;
  }
  return null;
}

export function loadHcdFiles(p: ProjectPaths): { files: Partial<Record<HcdFileKey, string | null>>; meta: string | null } {
  const files: Partial<Record<HcdFileKey, string | null>> = {};
  for (const k of Object.keys(HCD_FILES) as HcdFileKey[]) files[k] = readFirst(p.hcd, HCD_FILES[k]);
  return { files, meta: readIfExists(p.meta) };
}

export function loadFrgFiles(p: ProjectPaths): Partial<Record<FrgFileKey, string | null>> {
  const files: Partial<Record<FrgFileKey, string | null>> = {};
  for (const k of Object.keys(FRG_FILES) as FrgFileKey[]) files[k] = readFirst(p.frg, FRG_FILES[k]);
  return files;
}

/** True when every CSV except Project.csv was written after `since` (epoch ms). */
export function csvWrittenSince(p: ProjectPaths, since: number): boolean {
  return CSV_FILES.filter((f) => f !== "Project.csv").every((f) => {
    try {
      return statSync(join(p.csv, f)).mtimeMs > since;
    } catch {
      return false;
    }
  });
}
