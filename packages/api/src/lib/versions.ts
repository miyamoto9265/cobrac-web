import type { ArtifactInfo, BraVersionListItem, BraVersionManifest, BraVersionSummary, JobRecord, ProjectRecord } from "@cobrac/shared";
import { braVersionId, templateXlsxKey } from "@cobrac/shared";

const INSTRUCTION_PREVIEW = 300;
const preview = (s: string | null | undefined) => (s ? (s.length > INSTRUCTION_PREVIEW ? `${s.slice(0, INSTRUCTION_PREVIEW)}…` : s) : null);

export function versionItem(summary: BraVersionSummary, job: JobRecord | null, manifest?: BraVersionManifest | null): BraVersionListItem {
  return {
    ...summary,
    frozen: true,
    jobId: job?.jobId ?? manifest?.job?.jobId ?? null,
    jobType: job?.type ?? manifest?.job?.type ?? null,
    model: job?.model ?? manifest?.generator.model ?? null,
    reasoningEffort: job?.reasoningEffort ?? manifest?.generator.reasoningEffort ?? null,
    instruction: preview(job?.instruction ?? manifest?.job?.instruction),
  };
}

/** Parent version ID of version `n` (the previous version, or the public project version a clone copied). */
export function parentVersionIdOf(p: ProjectRecord, n: number): string | null {
  if (n > 1) return braVersionId(p.projectId, n - 1);
  return p.clonedFrom && p.clonedFrom.revision >= 1 ? braVersionId(p.clonedFrom.projectId, p.clonedFrom.revision) : null;
}

/** Latest COMPLETED BRA job (the one whose result is the project's current data). */
export function lastBraJob(jobs: JobRecord[]): JobRecord | null {
  return (
    jobs
      .filter((j) => j.status === "COMPLETED" && (j.type === "initial" || j.type === "followup"))
      .sort((a, b) => ((a.endedAt ?? a.createdAt) < (b.endedAt ?? b.createdAt) ? -1 : 1))
      .at(-1) ?? null
  );
}

/** The current data of a project that has no snapshot of its current revision (finished before versioning). */
export function liveVersionItem(p: ProjectRecord, jobs: JobRecord[]): BraVersionListItem {
  const n = p.revision ?? 1;
  const job = lastBraJob(jobs);
  return {
    version: n,
    versionId: braVersionId(p.projectId, n),
    parentVersionId: parentVersionIdOf(p, n),
    origin: "live",
    createdAt: p.completedAt ?? p.updatedAt,
    contentSha256: null,
    appVersion: null,
    gitSha: null,
    changes: null,
    hasBradbPackage: false,
    frozen: false,
    jobId: job?.jobId ?? null,
    jobType: job?.type ?? null,
    model: job?.model ?? null,
    reasoningEffort: job?.reasoningEffort ?? null,
    instruction: preview(job?.instruction),
  };
}

/** Files of the current data that a live version offers (what a snapshot would copy). */
export function liveVersionFiles(projectId: string, artifacts: ArtifactInfo[]): { path: string; size: number; sha256: null }[] {
  const keep = (k: string) =>
    (k.startsWith("workspace/") && !/\.(jsonl|xlsx)$/i.test(k)) || k === `output/${projectId}.bra.xlsx` || k === templateXlsxKey(projectId) || /^graph\/(hcd|frg)\.json$/.test(k);
  return artifacts.filter((a) => keep(a.key)).map((a) => ({ path: a.key, size: a.size, sha256: null }));
}
