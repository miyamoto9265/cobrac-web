import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { App } from "aws-cdk-lib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRADB_IMPORT_FUNCTION_NAME } from "@cobrac/shared";
import { BraDbStack } from "../lib/bradb-stack.js";
import { CobracAgentsStack } from "../lib/cobrac-stack.js";

// Also load the repo-root .env (packages/infra/../../.env)
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

const app = new App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
};
// BRA-DB (EC2 + PostgreSQL/AGE) in its own stack; COBRAC_BRADB=false leaves it out
const braDb = (process.env.COBRAC_BRADB ?? "true") !== "false";
if (braDb) new BraDbStack(app, "BraDb", { env, description: "BRA-DB (PostgreSQL 17 + Apache AGE) for CoBRAC Agents" });
new CobracAgentsStack(app, "CobracAgents", {
  braDbImportFunction: braDb ? BRADB_IMPORT_FUNCTION_NAME : "",
  env,
  adminEmails: process.env.COBRAC_ADMIN_EMAILS ?? "",
  selfSignUp: (process.env.COBRAC_SELF_SIGNUP ?? "true") === "true",
  maxConcurrentJobs: Number(process.env.COBRAC_MAX_CONCURRENT_JOBS ?? "2"),
  maxConcurrentJobsPerUser: Number(process.env.COBRAC_MAX_CONCURRENT_JOBS_PER_USER ?? "1"),
  codexModel: process.env.COBRAC_CODEX_MODEL ?? "",
  codexReasoningEffort: process.env.COBRAC_CODEX_REASONING_EFFORT ?? "",
  // rosetta-candidate-search rcs-mcp (docs/aws_operations_guide.md 4-1b); set COBRAC_RCS_MCP_URL="" to disable
  rcsMcpUrl: process.env.COBRAC_RCS_MCP_URL ?? "https://hg2se72l61.execute-api.ap-northeast-1.amazonaws.com/mcp",
  rcsMcpSecretName: process.env.COBRAC_RCS_MCP_SECRET_NAME || "rcs/mcp-bearer-token",
  // cobrac.site is the CloudFront alias (DNS in the personal account)
  siteUrl: process.env.COBRAC_SITE_URL || "https://cobrac.site",
  // SES domain identity cobrac.site (ap-northeast-1, DKIM in the personal account's Route 53); set COBRAC_EMAIL_FROM="" to fall back to Cognito's sender
  emailFrom: process.env.COBRAC_EMAIL_FROM ?? "no-reply@cobrac.site",
  emailFromName: process.env.COBRAC_EMAIL_FROM_NAME || "CoBRAC Agents",
});
