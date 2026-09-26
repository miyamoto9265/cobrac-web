# CoBRAC Agents (repository: cobrac-web)

Web application that runs the BRA (Brain Reference Architecture) data-creation workflow
(HCD → FRG → CSV → xlsx) with the Codex SDK on the server. Design, security, and infrastructure
docs live in `docs/` (also available from the site “Documentation” page). Change history is
`CHANGELOG.md`. Working rules, including versioning, are in `AGENTS.md`.

## Versioning and release

The only source of the version number is `version` in the root `package.json`. It is shown in the
sidebar footer and in `GET /health`.

```bash
# 1. Write the changes under [Unreleased] in CHANGELOG.md
# 2. Bump the version, finalize CHANGELOG, commit, and tag
npm run release patch      # or minor / major / 0.2.0
# 3. Deploy (includes version / CHANGELOG consistency checks)
npm run deploy
git push && git push --tags
```

## Layout

```
package.json                 npm workspaces (build / typecheck / test / deploy)
prompts/                     agent rules (AGENTS.md), phase specs (phases/), Project.csv template, csv_to_excel.py (CLI args)
packages/
  shared/   types, CSV parser, graph JSON generation (buildGraphs), utilities (vitest)
  worker/   Fargate worker + Dockerfile (Node 22 + @openai/codex-sdk + Python 3)
            src/index.ts (control loop) codex.ts (SDK) s3sync.ts steps.ts finalize.ts
  api/      Lambda: src/app.ts (Hono) and src/handlers/{http,dispatcher,ws,broadcaster,janitor}.ts
  web/      React SPA (Vite + Tailwind + React Flow)
  infra/    AWS CDK stack `CobracAgents` (Lambdas bundled with NodejsFunction/esbuild)
```

## Requirements

- Node.js 22 or later, npm 10 or later
- Docker is **not** required (the worker image is built on CodeBuild at deploy time: `@cdklabs/deploy-time-build`)
- AWS CLI credentials for the target account, with `cdk bootstrap` already done
- Each user’s OpenAI API key (registered in the in-app Settings screen)

## Setup and verification

```bash
npm install
npm run typecheck     # typecheck all packages
npm test              # shared unit tests
npm run build         # shared(tsc) → api(typecheck) / worker(tsc) / web(vite)
npm run cdk -- synth  # generate the CloudFormation template (pre-deploy check)
```

Try `csv_to_excel.py` on its own:

```bash
pip install -r prompts/requirements.txt
python prompts/csv_to_excel.py --contributor "Your Name" --project-id VOR \
  --base-dir /path/containing/VOR --output ./VOR.bra.xlsx
```

## Deploy

Pass settings via `.env` at the repo root (copy `.env.example`) or environment variables.

```bash
# Admin email addresses (comma-separated). admin role is granted on first login
export COBRAC_ADMIN_EMAILS=you@example.com
# Optional: disable self sign-up / concurrency / Codex model and reasoning effort
export COBRAC_SELF_SIGNUP=true
export COBRAC_MAX_CONCURRENT_JOBS=2
export COBRAC_MAX_CONCURRENT_JOBS_PER_USER=1
export COBRAC_CODEX_MODEL=            # empty = Codex CLI default
export COBRAC_CODEX_REASONING_EFFORT=high

npm run deploy        # build → cdk deploy --all --require-approval never
```

Open the `WebUrl` output (CloudFront) → sign up → register an API key in Settings → enter ROI/TLF on the chat screen and run.
Frontend endpoints (API/WS/Cognito) are written by CDK to S3 as `config.json`, so you do not rebuild per environment.

In PowerShell, set variables like `$env:COBRAC_ADMIN_EMAILS="you@example.com"`.

## Local development (frontend only)

```bash
cp .env.example packages/web/.env.local   # point VITE_API_URL and related vars at a deployed environment
npm run dev:web
```

## Design highlights

- Jobs go SQS → dispatcher Lambda → ECS Fargate **Spot** (On-Demand fallback if Spot is unavailable), one task per job.
- The worker drives the phases (HCD → FRG), validates each phase's markdown tables with deterministic checks, and sends problems back to the agent to fix.
- When the agent ends a turn with a question, the workspace and `CODEX_HOME` are saved to S3 and the task exits (billing stops). Answering resumes via `resumeThread`.
- The worker converts the HCD/FRG tables into the five CSVs itself, then `csv_to_excel.py` and `buildGraphs()` produce xlsx and HCD/FRG graph JSON.
- After completion, a “follow-up instruction” on the same thread can revise and regenerate artifacts.
- If the worker heartbeat is missing for 15 minutes, janitor marks FAILED and auto-retries up to 2 times (Spot interruption).
- User OpenAI API keys are KMS-encrypted in DynamoDB and decrypted only inside the worker. The agent shell does not receive AWS credentials.

## Operations notes

- Worker logs: CloudFormation output `WorkerLogGroup` (CloudWatch Logs).
- Artifacts: `ArtifactsBucket` at `users/{userId}/{projectId}/{workspace,thread,output,graph}/`.
- Tables, buckets, KMS keys, and the User Pool use `RemovalPolicy.RETAIN`. They remain after stack deletion; delete manually if no longer needed.
- For cost monitoring, set an AWS Budgets monthly alert (example: $30).
