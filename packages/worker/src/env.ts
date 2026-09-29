import type { RunMode } from "@cobrac/shared";
import { isProjectIdLike } from "@cobrac/shared";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  tables: {
    users: req("TABLE_USERS"),
    projects: req("TABLE_PROJECTS"),
    jobs: req("TABLE_JOBS"),
    messages: req("TABLE_MESSAGES"),
  },
  artifactsBucket: req("ARTIFACTS_BUCKET"),
  job: {
    userId: req("JOB_USER_ID"),
    projectId: projectIdOf(req("JOB_PROJECT_ID")),
    jobId: req("JOB_ID"),
    mode: (process.env.JOB_MODE ?? "initial") as RunMode,
  },
  codexModel: process.env.CODEX_MODEL || undefined,
  codexReasoningEffort: process.env.CODEX_REASONING_EFFORT || undefined,
  /** RCS MCP endpoint; empty = agent runs without RCS */
  rcsMcpUrl: process.env.RCS_MCP_URL || undefined,
  /** Secrets Manager secret with the accepted RCS bearer tokens (comma-separated) */
  rcsMcpSecretId: process.env.RCS_MCP_SECRET_ID || undefined,
  /** Local testing only: token given directly instead of the secret */
  rcsMcpToken: process.env.RCS_MCP_TOKEN || undefined,
  /** `off` skips the DOI / PMID lookups of references.json (citations are still checked) */
  referenceLookup: process.env.REFERENCE_LOOKUP !== "off",
  /** Contact address sent to Crossref (polite pool); optional */
  crossrefMailto: process.env.CROSSREF_MAILTO || undefined,
  /** NCBI E-utilities key (10 instead of 3 requests/s); optional, PubMed works without it */
  ncbiApiKey: process.env.NCBI_API_KEY || undefined,
  workDir: process.env.WORK_DIR ?? "/work",
  promptsDir: process.env.PROMPTS_DIR ?? "/app/prompts",
  codexHome: process.env.CODEX_HOME_DIR ?? "/work/codex-home",
  maxNudges: Number(process.env.MAX_NUDGES ?? "3"),
  workflowTimeoutMs: Number(process.env.WORKFLOW_TIMEOUT_MS ?? String(6 * 60 * 60 * 1000)),
};

/** The ID names the work directory and S3 prefix, so only ID-shaped values are accepted. */
function projectIdOf(v: string): string {
  if (!isProjectIdLike(v)) throw new Error(`Invalid JOB_PROJECT_ID: ${v}`);
  return v;
}
