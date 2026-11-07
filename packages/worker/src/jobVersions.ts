
import type {
  BraVersionRef,
  BraVersionSummary,
  JobRecord,
  ProjectRecord,
} from "@cobrac/shared";
import {
  braVersionId,
  agentHarnessSchemas,
  nowIso,
  summarizeManifest,
  versionManifestKey,
} from "@cobrac/shared";
import {
  getProject,
  ensureProjectRevision,
  listProjectJobs,
  updateJob,
  updateProject,
} from "./db.js";
import { env } from "./env.js";
import { versionHypotheses } from "./hypothesisRules.js";
import { getObjectBuffer, putObject, putObjectIfAbsent } from "./s3sync.js";
import { freezeVersion, promptsSha256, schemasSha256, type FreezeInput, type VersionStore } from "./versions.js";
import { csvComplete } from "./steps.js";
import { jobId, log, paths, prefix, projectId, runState, userId } from "./jobContext.js";

// --- BRA data versions ----------------------------------------------------------

const versionStore: VersionStore = { get: getObjectBuffer, put: putObject, putIfAbsent: putObjectIfAbsent };
const versionRef = (pid: string, version: number): BraVersionRef => ({ versionId: braVersionId(pid, version), projectId: pid, version });

/** The version before `n`: the previous one, or for a clone's first version the public project version it copied. */
function parentOf(project: ProjectRecord, n: number): BraVersionRef | null {
  if (n > 1) return versionRef(projectId, n - 1);
  const src = project.clonedFrom;
  return src && src.revision >= 1 ? versionRef(src.projectId, src.revision) : null;
}

async function writeVersion(input: Omit<FreezeInput, "prefix" | "projectId" | "workspaceDir">): Promise<BraVersionSummary | null> {
  const r = await freezeVersion({ ...input, prefix, projectId, workspaceDir: paths.root }, versionStore);
  if (r.status === "conflict") {
    console.warn(`[version] v${input.version} already exists for job ${r.manifest.job?.jobId ?? "(none)"}; not replaced`);
    await log(`Version ${input.version} already exists from another run, so this result was not saved as a version.`, { i18n: "sys.versionConflict", version: input.version });
    return null;
  }
  return summarizeManifest(r.manifest);
}

/** Freezes this job's result as version revision + 1 (the job is COMPLETED right after). A failure only costs the snapshot. */
export async function freezeJobVersion(project: ProjectRecord, job: JobRecord): Promise<BraVersionSummary | null> {
  try {
    const fresh = await getProject(userId, projectId);
    const n = (fresh?.revision ?? project.revision ?? 0) + 1;
    const summary = await writeVersion({
      version: n,
      parent: parentOf(fresh ?? project, n),
      origin: "job",
      createdAt: nowIso(),
      contributor: project.contributor,
      job: { jobId, type: job.type, instruction: job.instruction },
      generator: {
        appVersion: env.appVersion,
        gitSha: env.gitSha,
        promptsSha256: await promptsSha256(env.promptsDir),
        schemasSha256: schemasSha256(agentHarnessSchemas(runState.evidence.mode)),
        model: runState.resolvedModel,
        reasoningEffort: (runState.resolvedEffort as JobRecord["reasoningEffort"]) ?? null,
        researchMode: runState.research,
        canon: runState.canonRun ? { canonId: runState.canonRun.info.canonId, revision: runState.canonRun.info.revision } : null,
        sabraBoundary: project.sabraBoundary ?? "legacy",
        rcsBoundaryVersion: runState.rcs ? await runState.rcs.sabraBoundaryVersion() : null,
        harnessRules: project.harnessRules ?? 0,
        // provenance of a project a BRA Planner plan created (absent otherwise, so other manifests are unchanged)
        ...(project.planId ? { planId: project.planId } : {}),
        // hypothesis mode: evidence mode, scopes, share limit and hypothesis counts (the BRA-DB guard reads them)
        ...versionHypotheses(paths, { ...project, evidenceMode: runState.evidence.mode }),
      },
    });
    if (summary) await log(`Saved the result as version ${n} (${summary.versionId}).`, { i18n: "sys.versionSaved", version: n, versionId: summary.versionId });
    return summary;
  } catch (e) {
    console.error("[version] freeze failed", e);
    await log(`The result could not be saved as a version: ${e instanceof Error ? e.message : String(e)}`, { i18n: "sys.versionFailed" });
    return null;
  }
}

/**
 * A follow-up on a project whose current data has no version yet (finished before versioning) first freezes that data
 * as version `revision`, so the follow-up's result has a parent to compare with. The project is COMPLETED when a
 * follow-up is queued, so the restored workspace and `output/` belong to the same run.
 */
export async function freezeBaseline(project: ProjectRecord) {
  if (!project.hasArtifacts || !csvComplete(paths)) return;
  const n = project.revision || 1;
  try {
    if (await versionStore.get(prefix + versionManifestKey(n))) return;
    const last =
      (await listProjectJobs(userId, projectId))
        .filter((j) => j.jobId !== jobId && j.status === "COMPLETED" && (j.type === "initial" || j.type === "followup"))
        .sort((a, b) => ((a.endedAt ?? a.createdAt) < (b.endedAt ?? b.createdAt) ? -1 : 1))
        .at(-1) ?? null;
    const summary = await writeVersion({
      version: n,
      parent: parentOf(project, n),
      origin: "baseline",
      createdAt: project.completedAt ?? nowIso(),
      contributor: project.contributor,
      job: last ? { jobId: last.jobId, type: last.type, instruction: last.instruction } : null,
      generator: {
        appVersion: null,
        gitSha: null,
        promptsSha256: null,
        schemasSha256: null,
        model: last?.model ?? null,
        reasoningEffort: last?.reasoningEffort ?? null,
        researchMode: last?.researchMode ?? null,
        canon: null,
        sabraBoundary: project.sabraBoundary ?? "legacy",
        rcsBoundaryVersion: null,
        harnessRules: project.harnessRules ?? 0,
        ...(project.planId ? { planId: project.planId } : {}),
      },
    });
    if (!summary) return;
    if (!project.revision) await ensureProjectRevision(userId, projectId, n);
    if (last && !last.braVersion) await updateJob(projectId, last.jobId, { braVersion: summary });
    await updateProject(userId, projectId, { latestVersion: summary });
    await log(`Saved the current BRA data as version ${n} before applying the follow-up.`, { i18n: "sys.versionBaseline", version: n });
  } catch (e) {
    console.error("[version] baseline failed", e);
    await log(`The current BRA data could not be saved as a version before the follow-up: ${e instanceof Error ? e.message : String(e)}`, { i18n: "sys.versionFailed" });
  }
}
