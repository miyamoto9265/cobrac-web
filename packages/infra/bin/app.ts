import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { App } from "aws-cdk-lib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CobracAgentsStack } from "../lib/cobrac-stack.js";

// Also load the repo-root .env (packages/infra/../../.env)
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

const app = new App();
new CobracAgentsStack(app, "CobracAgents", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
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
});
