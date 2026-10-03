import type { RunMode } from "@cobrac/shared";
import { RESEARCH_BUDGET, isCanonId, isProjectIdLike } from "@cobrac/shared";

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
    /** Optional: without it the worker ignores Canons */
    canons: process.env.TABLE_CANONS ?? "",
    /** Holds the default API key (kind "config"); without it approved users without a key cannot run */
    catalog: process.env.TABLE_CATALOG ?? "",
  },
  artifactsBucket: req("ARTIFACTS_BUCKET"),
  job: {
    userId: req("JOB_USER_ID"),
    projectId: projectIdOf(req("JOB_PROJECT_ID"), process.env.JOB_MODE),
    jobId: req("JOB_ID"),
    mode: (process.env.JOB_MODE ?? "initial") as RunMode,
  },
  codexModel: process.env.CODEX_MODEL || undefined,
  codexReasoningEffort: process.env.CODEX_REASONING_EFFORT || undefined,
  /**
   * Conversation size (tokens) at which Codex compacts it. Well below the OpenAI tokens-per-minute limit (200k for
   * gpt-6-luna): requests above ~80k context wait 15–40 s longer before the first token.
   */
  codexAutoCompactTokens: Number(process.env.CODEX_AUTO_COMPACT_TOKENS ?? "75000"),
  /** RCS MCP endpoint; empty = agent runs without RCS */
  rcsMcpUrl: process.env.RCS_MCP_URL || undefined,
  /** Secrets Manager secret with the accepted RCS bearer tokens (comma-separated) */
  rcsMcpSecretId: process.env.RCS_MCP_SECRET_ID || undefined,
  /** Local testing only: token given directly instead of the secret */
  rcsMcpToken: process.env.RCS_MCP_TOKEN || undefined,
  /** `off` skips the DOI / PMID lookups of references.json (citations are still checked) */
  referenceLookup: process.env.REFERENCE_LOOKUP !== "off",
  /** `off` skips comparing Pointers on literature with the cited papers' full text / abstract */
  quoteCheck: process.env.QUOTE_CHECK !== "off",
  /** Minimum similarity (0–1) of a quote with the paper's text; invalid values fall back to the default (0.9) */
  quoteMatchThreshold: process.env.QUOTE_MATCH_THRESHOLD ? Number(process.env.QUOTE_MATCH_THRESHOLD) : undefined,
  /** Contact address sent to Crossref (polite pool); optional */
  crossrefMailto: process.env.CROSSREF_MAILTO || undefined,
  /** NCBI E-utilities key (10 instead of 3 requests/s); optional, PubMed works without it */
  ncbiApiKey: process.env.NCBI_API_KEY || undefined,
  workDir: process.env.WORK_DIR ?? "/work",
  promptsDir: process.env.PROMPTS_DIR ?? "/app/prompts",
  codexHome: process.env.CODEX_HOME_DIR ?? "/work/codex-home",
  maxNudges: Number(process.env.MAX_NUDGES ?? "3"),
  /** Wall-clock budget of the research step (research mode), minutes */
  researchTimeBudgetMin: Number(process.env.RESEARCH_TIME_BUDGET_MIN ?? String(RESEARCH_BUDGET.timeBudgetMinutes)),
  workflowTimeoutMs: Number(process.env.WORKFLOW_TIMEOUT_MS ?? String(6 * 60 * 60 * 1000)),
};

/** The ID names the work directory and S3 prefix, so only ID-shaped values are accepted (a Canon ID for an AI review). */
function projectIdOf(v: string, mode: string | undefined): string {
  if (!(mode === "canon-review" ? isCanonId(v) : isProjectIdLike(v))) throw new Error(`Invalid JOB_PROJECT_ID: ${v}`);
  return v;
}
