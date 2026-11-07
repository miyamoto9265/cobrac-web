/**
 * What every part of one worker run shares: the job's IDs and paths (from the task's environment), the settings and
 * counters the run fills in as it goes (`runState`), the job log, and the task's KMS / metadata helpers.
 */
/**
 * CoBRAC Agents worker (ECS Fargate task) — the "CoBRAC harness".
 *
 * The worker drives the workflow phase by phase instead of letting the agent read instruction files:
 *   HCD (agent turn → validator → fix turns) → FRG (same) → CSV (generated from the JSON data files; problems go
 *   back to the agent as fixes to those files) → xlsx + graphs (deterministic). The loop itself is in pipeline.ts.
 * Shared rules live in prompts/AGENTS.md (auto-loaded by Codex); each phase prompt inlines prompts/phases/<PHASE>.md,
 * and the JSON Schemas of the data files are written to schemas/ next to AGENTS.md.
 *
 * Run modes:
 *   - initial : fresh workspace, start at HCD
 *   - resume  : restore workspace + thread, deliver the user's answer, continue the current phase
 *   - followup: restore, apply the instruction, re-validate every phase, regenerate CSV/xlsx
 *   - retry   : restore, continue from the first phase not accepted yet
 *   - article : restore the workspace read-only and write an explanatory article in the requested language on a
 *               fresh thread (article.ts); the BRA data, step states, revision and project thread stay untouched
 *   - canon-review: AI review of a Canon pull request (canonReview.ts). JOB_PROJECT_ID is the Canon ID; the worker
 *               reads the packet the API wrote, runs one turn without tools and writes the result; no project is touched
 *   - plan    : a BRA Planner draft or re-plan (planJob.ts). JOB_PROJECT_ID is the plan ID; the worker reads the input
 *               the plan runner wrote, runs one turn with the RCS tools (and the attached capability lists) within the
 *               job's time budget and writes the result; no project is touched
 *
 * The `lit` MCP tools (PubMed / Europe PMC, litMcp.ts) are available in every BRA run. Research mode (on by default for
 * new projects) adds a research step before the HCD: a literature survey into research.json at a raised reasoning
 * effort within a time budget, and a coverage check that sends gaps back as fix turns (pipeline.ts runResearch).
 * The HCD / FRG validators are unchanged.
 *
 * Whenever the agent asks a question we persist state to S3 and exit so no compute is billed while waiting.
 */
import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import type {
  EvidenceSettings,
  StepState,
  TokenUsage,
  WorkflowStep,
} from "@cobrac/shared";
import {
  EMPTY_USAGE,
  type CanonRunInfo,
  type CanonSnapshot,
  evidenceSettingsOf,
} from "@cobrac/shared";
import { putMessage } from "./db.js";
import { env } from "./env.js";
import { type PreparedMaterials } from "./materials.js";
import { RcsClient } from "./rcs.js";
import { projectPrefix } from "./s3sync.js";
import { currentStepOf, projectPaths } from "./steps.js";

export const MAX_REPORTED_ERRORS = 30;

export const { userId, projectId, jobId, mode } = env.job;
export const prefix = projectPrefix(userId, projectId);
export const paths = projectPaths(env.workDir, projectId);
const kms = new KMSClient({ region: env.region });

export const startedAt = Date.now();

/** The worker's job failure handler (`fail` in index.ts), passed to the job kinds that live in their own modules */
export type FailJob = (message: string, meta?: Record<string, unknown>) => Promise<void>;

/** Settings and counters of this run, set by `main` and read by the phases, prompts and versions */
export const runState: {
  lastStepStates: Record<WorkflowStep, StepState> | null;
  /** SIGTERM received: the task is being stopped and the job goes back to the janitor */
  stopping: boolean;
  rcs: RcsClient | null;
  materials: PreparedMaterials | null;
  /** Pinned Canon revision of this project (null: not in a Canon, or the Canon is still empty) */
  canonRun: { snapshot: CanonSnapshot; info: CanonRunInfo } | null;
  /** The plan's policy for its row's agent (research and HCD specs); empty for a project made outside a plan */
  planNote: string;
  /** Research mode of this run (the project's setting; article jobs never research) */
  research: boolean;
  /** The project's harness rule set (0: created before the ROI rules) */
  harnessRules: number;
  /** The project's evidence mode, hypothesis scopes and share limit (strict unless the project allows hypotheses) */
  evidence: EvidenceSettings;
  resolvedModel: string | null;
  resolvedEffort: string | null;
  /** This job's usage and estimated cost so far (null cost: unpriced model) */
  jobUsage: TokenUsage;
  jobCostUsd: number | null;
} = {
  lastStepStates: null,
  stopping: false,
  rcs: null,
  materials: null,
  canonRun: null,
  planNote: "",
  research: false,
  harnessRules: 0,
  evidence: evidenceSettingsOf(null),
  resolvedModel: null,
  resolvedEffort: null,
  jobUsage: EMPTY_USAGE,
  jobCostUsd: 0,
};

export const log = async (content: string, meta?: Record<string, unknown>): Promise<void> => {
  await putMessage(projectId, jobId, "system", "status", content, { meta, step: runState.lastStepStates ? currentStepOf(runState.lastStepStates) : null });
};

export async function decryptApiKey(ciphertextB64: string, context: Record<string, string>): Promise<string> {
  const r = await kms.send(new DecryptCommand({ CiphertextBlob: Buffer.from(ciphertextB64, "base64"), EncryptionContext: context }));
  if (!r.Plaintext) throw new Error("KMS decrypt returned empty plaintext");
  return Buffer.from(r.Plaintext).toString("utf8");
}

export async function taskArn(): Promise<string | null> {
  const uri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!uri) return null;
  try {
    const r = await fetch(`${uri}/task`);
    const j = (await r.json()) as { TaskARN?: string };
    return j.TaskARN ?? null;
  } catch {
    return null;
  }
}
