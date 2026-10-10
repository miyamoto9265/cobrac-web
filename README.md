# CoBRAC Agents (repository: cobrac-web)

Web application that runs the BRA (Brain Reference Architecture) data-creation workflow
(HCD → FRG → CSV → xlsx) with the Codex SDK on the server. The specification — system, harness, circuit naming,
Canons, versions and BRA-DB, the orchestrator, AWS, security and operations — is one Japanese PDF,
[`docs/CoBRAC_仕様書.pdf`](docs/CoBRAC_仕様書.pdf), the single source of truth (admins read it on the site's
“Specification” page). Change history is `CHANGELOG.md`; the user manual is `docs/manual/`. Working rules, including
versioning, are in `AGENTS.md`.

## Versioning and release

The only source of the version number is `version` in the root `package.json`. It is shown in the
sidebar footer and in `GET /health`.

Releases go through a pull request; GitHub Actions deploys when it is merged to `main`.

```bash
# 1. Write the changes under [Unreleased] in CHANGELOG.md
# 2. On a work branch, bump the version and finalize CHANGELOG (no commit / tag)
npm run release -- patch --no-git   # or minor / major / 0.2.0
# 3. Commit, push, and open a PR. Merging it deploys vX.Y.Z and pushes the tag.
```

| Workflow | Trigger | What it does |
| -------- | ------- | ------------ |
| `.github/workflows/ci.yml` | Pull requests | `npm ci` → build → typecheck → test → `release:check` → `cdk synth` (no AWS credentials). The job summary says whether merging deploys |
| `.github/workflows/deploy.yml` | Push to `main`, manual run | Deploys only when tag `v<version>` does not exist yet: settings check → build / typecheck / test → OIDC role → `cdk diff` → RETAIN guard → `npm run deploy` → push tag → check `GET /health` reports the new version |
| `.github/workflows/claude.yml` | `@claude` in an issue, issue comment or PR comment by `miyamoto9265` (OWNER) or `cursor[bot]` (user id 206951365) | Runs Claude Code (`anthropics/claude-code-action`) with the owner's subscription token (secret `CLAUDE_CODE_OAUTH_TOKEN`) and the job's `GITHUB_TOKEN` (contents / issues / pull-requests write; no `id-token`, no AWS). Claude works on a `claude/` branch (or the open PR's branch) and opens a draft PR; it never pushes to `main` or merges. Its pushes and PRs do not start `ci` or `deploy` (GitHub does not run workflows for `GITHUB_TOKEN` events), so run `ci` on the branch with "Run workflow" before merging |

- A merge that does not bump the version (docs only, for example) does not deploy; it ships with the next release.
- **RETAIN guard** (`scripts/retain-guard.mjs`): if `cdk diff` would replace, remove, or orphan a DynamoDB table, S3 bucket, KMS key, or Cognito User Pool, the deploy stops before touching the stack. After reviewing the diff in the job log, deploy anyway with `gh workflow run deploy.yml --ref main -f allow_retain_replacement=true` (a plain "Re-run" stops again).
- Deploys run one at a time (`concurrency`). The workflow never prints the admin e-mail secret; it is masked in the log.
- Local `npm run deploy` is for emergencies only (see [Deploy](#deploy)); afterwards bring the same change to `main` through a PR and push the tag.

## Layout

```
package.json                 npm workspaces (build / typecheck / test / deploy)
.github/workflows/           ci.yml (pull requests) / deploy.yml (main → AWS via OIDC) / claude.yml (@claude → Claude Code)
scripts/                     release.mjs (version + CHANGELOG), retain-guard.mjs (stops risky deploys),
                             bra-appendix-d.mjs (checks a BRA xlsx / CSV folder against the BRA error codes of the Error code List (Master); local `cobrac:` codes for checks without one)
prompts/                     agent rules (AGENTS.md), phase specs (phases/), Project.csv template, csv_to_excel.py (CLI args), templates/Template-v2-2.bra.xlsx (official BRA template)
archive/v0/                  legacy desktop instructions, specs, v0 sample artifacts, user guide (reference only)
packages/
  shared/   types, harness (JSON Schemas, validators, CSV generation), graph JSON generation (buildGraphs), utilities (vitest)
  worker/   Fargate worker + Dockerfile (Node 22 + @openai/codex-sdk + Python 3)
            src/index.ts (job control) pipeline.ts (phase loop) codex.ts (SDK) s3sync.ts steps.ts finalize.ts
  api/      Lambda: src/app.ts (Hono) and src/handlers/{http,dispatcher,ws,broadcaster,janitor,authMessage}.ts
  web/      React SPA (Vite + Tailwind + React Flow)
  infra/    AWS CDK stack `CobracAgents` (Lambdas bundled with NodejsFunction/esbuild)
```

## Requirements

- Node.js 22 or later, npm 10 or later
- Docker is **not** required (the worker image is built on CodeBuild at deploy time: `@cdklabs/deploy-time-build`)
- `cdk bootstrap` already done in the target account. AWS CLI credentials are needed only for an emergency deploy from your machine
- Each user’s OpenAI API key (registered in the in-app Settings screen), or the default API key: an admin registers the organization's key on the admin page and approves collaborators at Tier 1 (gpt-6-luna / gpt-5.6-luna) or Tier 2 (every model)

## Setup and verification

```bash
npm install
npm run build         # shared(tsc) → api(typecheck) / worker(tsc) / web(vite)
npm run typecheck     # typecheck all packages (needs the shared build output)
npm test              # shared unit tests + scripts/*.test.mjs
npm run cdk -- synth  # generate the CloudFormation template (pre-deploy check)
```

Try `csv_to_excel.py` on its own:

```bash
pip install -r prompts/requirements.txt
python prompts/csv_to_excel.py --contributor "Your Name" --project-id VOR \
  --base-dir /path/containing/VOR --output ./VOR.bra.xlsx
```

## Deploy

Normal deploys run from GitHub Actions (see [Versioning and release](#versioning-and-release)). The source of truth for
deploy settings is the repository's Actions configuration:

| Kind | Names |
| ---- | ----- |
| Variables | `AWS_DEPLOY_ROLE_ARN`, `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION`, `COBRAC_SELF_SIGNUP`, `COBRAC_MAX_CONCURRENT_JOBS`, `COBRAC_MAX_CONCURRENT_JOBS_PER_USER`, `COBRAC_CODEX_REASONING_EFFORT`, optional `COBRAC_CODEX_MODEL` |
| Secret | `COBRAC_ADMIN_EMAILS` |

The deploy workflow fails before any AWS call if a required value is empty or malformed (an empty value would
otherwise reach CDK as `""`, for example turning self sign-up off or setting concurrency to 0). The AWS side is an IAM
role trusted through GitHub OIDC for `main` only, allowed to assume the CDK bootstrap roles; there are no long-lived keys.

For an emergency deploy from your machine, keep a local `.env` at the repo root (copy `.env.example`) with the same
values as GitHub, or pass environment variables. When a value changes, update both.

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
- The worker drives the phases (HCD → FRG). The agent writes its data as JSON files with JSON Schemas (`uc.json`, `connections.json`, `references.json`, `frg.json`); the worker validates each phase with deterministic checks and sends problems back to the agent to fix.
- When the agent ends a turn with a question, the workspace and `CODEX_HOME` are saved to S3 and the task exits (billing stops). Answering resumes via `resumeThread`.
- The worker generates the five CSVs from the JSON files itself (the agent never writes CSVs), then `csv_to_excel.py` and `buildGraphs()` produce xlsx and HCD/FRG graph JSON, and `buildTemplateXlsx()` writes the same data into the official Template-v2-2.bra workbook (`prompts/templates/`; specification 3.13). The free-text `report.md` and `decision_log.md` can be read and downloaded from the chat screen.
- After completion, a “follow-up instruction” on the same thread can revise and regenerate artifacts.
- If the worker heartbeat is missing for 15 minutes, janitor marks FAILED and auto-retries up to 2 times (Spot interruption). While a turn runs, the worker saves the workspace and thread to S3 every 5 minutes; on SIGTERM (Spot interruption, 120 s stop timeout) it saves them at once and marks its heartbeat stale, so the next janitor run (every 5 minutes) resumes the job.
- User OpenAI API keys are KMS-encrypted in DynamoDB and decrypted only inside the worker. The agent shell does not receive AWS credentials.

## Specification sources

The PDF is built from `docs/spec-guide/src/*.html` with `npm run spec:build` (Playwright's Chromium, `pdftotext` and
Python `pypdf` are needed); commit the PDF together with `docs/spec-guide/build.json`. Appendix B quotes every prompt
file in full, so a prompt change also needs a rebuild: `npm test` (`scripts/spec-guide.test.mjs`) fails when the sources,
the embedded figures or the quoted prompts changed after the PDF was built. Figures are generated with
`npm run docs:figures`. Structure and writing rules are in `docs/spec-guide/README.md`; release, deploy and
emergency procedures are in `docs/ops/README.md`. The PDF is bundled with the API Lambda and served to admins by `GET /admin/spec`.

## Operations notes

- Worker logs: CloudFormation output `WorkerLogGroup` (CloudWatch Logs).
- Artifacts: `ArtifactsBucket` at `users/{userId}/{projectId}/{workspace,thread,output,graph}/`.
- Tables, buckets, KMS keys, and the User Pool use `RemovalPolicy.RETAIN`. They remain after stack deletion; delete manually if no longer needed.
- For cost monitoring, set an AWS Budgets monthly alert (example: $30).
