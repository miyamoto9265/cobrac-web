# CoBRAC Agents AWS Infrastructure and Budget

| Item | Description |
| ---- | ----------- |
| Document | Architecture, resources, how billing works, budget ballpark, and cost controls |
| Audience | Account administrators and operators |
| Implementation | CDK stack `CobracAgents` (ap-northeast-1) |
| Related | [01_設計仕様.md](./01_設計仕様.md) / [02_個人情報とセキュリティ.md](./02_個人情報とセキュリティ.md) |

Amounts are **Tokyo-region ballparks as of 2026**, not official estimates. Cost Explorer is the source of truth for actual charges. **OpenAI API fees are not on the AWS bill.**

---

## 1. Design principles

1. **Keep idle fixed cost small** (no always-on EC2 / NAT Gateway).
2. **Pay the expensive part only while jobs run** (Fargate Spot).
3. Stop the task while waiting for a question (persist state to S3 and exit).
4. Serve from the default CloudFront domain. No custom domain or certificate.

There is one stack (`packages/infra/lib/cobrac-stack.ts`). Deploys run from GitHub Actions when a version-bumped PR is merged to `main` (§12); `npm run deploy` from a local machine is the emergency path (requires `cdk bootstrap`). The worker image does not need local Docker; CodeBuild builds it at deploy time and pushes to ECR (`@cdklabs/deploy-time-build`).

---

## 2. Architecture

```
Internet
  │
  ├─ CloudFront ── S3 (SPA + config.json)     OAC, no public bucket
  ├─ Cognito User Pool                         email login
  │
  ├─ HTTP API  ── JWT ── Lambda http
  └─ WebSocket ── JWT ── Lambda ws
                      │
                      ├─ DynamoDB × 7
                      ├─ SQS (+ DLQ) ── Lambda dispatcher ── ECS RunTask
                      ├─ DynamoDB Streams ── Lambda broadcaster ── WS
                      ├─ EventBridge 15min ── Lambda janitor
                      ├─ KMS (API keys)
                      └─ S3 Artifacts

VPC (public subnet × 2, no NAT, with IGW)
  └─ ECS Fargate Spot
       reaches OpenAI / AWS APIs via public IP
       security group has no inbound rules
```

Why there is no NAT Gateway: in Tokyo it adds roughly **$32/month per AZ plus data processing** as a fixed cost. Workers are short-lived, so a public IP is enough.

---

## 3. Resource inventory

### 3.1 Compute

| Resource | Spec | When it runs |
| -------- | ---- | ------------ |
| Lambda × 8 | Node 22 ARM64, 512 MB (http 1024 MB: it builds the Template-v2-2 workbook of older projects on demand). http/ws 30s, dispatcher/broadcaster 60s, janitor 2 min | Request / SQS / Streams / every 15 minutes |
| ECS Cluster | Fargate + Fargate Spot, Container Insights off | Always (the cluster itself is nearly free) |
| Fargate Task | 1 vCPU / 2 GB / ephemeral 21 GB, x86_64 | One task per job |
| CodeBuild | Image build at deploy | During `cdk deploy` |
| ECR | One worker image (~0.5 GB compressed) | Always |

### 3.2 Data

| Resource | Settings |
| -------- | -------- |
| DynamoDB Users / Projects / Jobs / Messages | On-Demand. Streams on Projects/Messages. PITR off. RETAIN |
| DynamoDB WsConnections | On-Demand, TTL, DESTROY |
| DynamoDB Canons | On-Demand, GSI `owner-index`. PITR off. RETAIN (added with the Canon MVP; a new table, existing tables are unchanged). Canon revision snapshots and pull-request payloads are JSON under `canons/` in the artifacts bucket. The worker task role can read it (the pinned revision) |
| DynamoDB Catalog | On-Demand. Public listing and clone counters. PITR off. RETAIN (new table) |
| S3 Artifacts | Private, SSE-S3, incomplete MPU aborted after 3 days, `staging/` (reference uploads not yet attached to a project) expires after 1 day, CORS `POST` from the CloudFront domain and `https://cobrac.site` for browser uploads, RETAIN |
| S3 Web | Private, OAC, DESTROY + auto-empty |
| SQS JobQueue | Visibility 120s, retention 4 days, DLQ 14 days (after 5 failures) |

### 3.3 Network, delivery, auth

| Resource | Settings |
| -------- | -------- |
| VPC | ~ /16, public /24 × 2 AZs, IGW, NAT 0 |
| CloudFront | Price Class 200 (North America, Europe, Asia), SPA 403/404 → index.html |
| HTTP API | CORS enabled. Anonymous only on `/health` |
| WebSocket API | stage `prod`. Connection limit 2 hours |
| Cognito | Email, SRP, ID/Access 2h, Refresh 30d, group `admin` |
| KMS CMK | Rotation enabled, RETAIN |

### 3.4 Logs

CloudWatch Logs **14 days** for both Lambda and the worker. Insights is not used.

### 3.5 Deployed (reference, 2026-09-13)

| Output | Value |
| ------ | ----- |
| Account | `765959262011` |
| Region | ap-northeast-1 |
| WebUrl | `https://d2l8xn9p9omh33.cloudfront.net` |
| HTTP API | `https://uemi23ymn8.execute-api.ap-northeast-1.amazonaws.com` |
| Stack name | `CobracAgents` |

---

## 4. When charges move

| Action | What mainly increases |
| ------ | --------------------- |
| Nobody using it | Tiny CloudFront, KMS $1, ECR, DynamoDB storage; VPC itself is nearly free |
| Browsing the UI | CloudFront, HTTP API, Lambda, DynamoDB RCU equivalent (On-Demand) |
| Chat subscription | WebSocket connection time + messages, Streams Lambda |
| Job execution | **Fargate CPU/memory time**, ENI/public IP, worker CloudWatch, S3 PUT, DynamoDB writes |
| Waiting for a question | Fargate above stops. Only S3 storage and DynamoDB |
| `cdk deploy` | CodeBuild (when the image is rebuilt), ECR push, CloudFront invalidation, Lambda update |

Concurrency: overall `COBRAC_MAX_CONCURRENT_JOBS` (default 2), 1 per user. Excess messages are re-queued after 60 seconds (wait time is SQS only).

---

## 5. Budget ballpark

### 5.1 Idle (a few users, 0 jobs)

| Item | Monthly ballpark |
| ---- | ---------------- |
| 1 KMS CMK | $1.00 |
| ECR (0.5–1 GB) | around $0.10 |
| DynamoDB / S3 storage (a few MB to hundreds of MB) | $0.10–0.50 |
| CloudFront / Cognito (within free tier) | $0–0.50 |
| **Subtotal** | **about $1.5–3** |

Adding NAT alone adds $32+ here.

### 5.2 Assumed use (50 jobs/month, 2–4 hours each, stopped while waiting)

Total run time 100–200 hours.

| Service | Assumption | Monthly ballpark |
| ------- | ---------- | ---------------- |
| Fargate Spot 1 vCPU / 2 GB | about $0.013–0.020/hour | $2–4 |
| Same, On-Demand fallback | roughly 2.5–3× Spot | +$1–3 if mixed |
| CloudFront + frontend S3 | Low traffic | $1 |
| API Gateway HTTP + WS | Under a few hundred thousand requests | $1–2 |
| Lambda | ARM, short runs | $0–1 |
| DynamoDB On-Demand | Mostly message writes | $1–2 |
| S3 artifacts (a few GB, many PUTs) | With workspace sync | $0.5–1.5 |
| CloudWatch Logs | 14 days, worker output | $0.5–2 |
| KMS | Key + Encrypt/Decrypt | $1–2 |
| **AWS total** | | **about $8–18** |

The spec target is **under $20/month of infrastructure for 50 jobs/month**. The table above has headroom. If Spot is never available and everything is On-Demand, Fargate alone can be $8–15 and the total can stretch to **$15–25**.

### 5.3 AWS ballpark per job

| Runtime | Spot | On-Demand ballpark |
| ------- | ---- | ------------------ |
| 30 min | around $0.01 | around $0.03 |
| 2 hours | $0.03–0.04 | around $0.10 |
| 4 hours | $0.06–0.08 | around $0.20 |
| 6 hours (cap) | around $0.10 | around $0.30 |

Even with S3 sync and logs, **AWS cost per job is usually well under a few tens of cents**. The dominant term is OpenAI.

### 5.4 One deploy

CodeBuild builds a Node + Python image (about 2 minutes in practice). Tokyo general1.small equivalent is about **$0.1–0.4 per run**. ECR overwrite and CloudFront invalidation add a little. Frequent redeploys can stand out more than everyday UI use.

The GitHub Actions runs themselves (PR checks and the deploy workflow) use the private repository's Actions minutes, not AWS. Merges that do not bump the version skip the deploy job.

### 5.5 OpenAI (outside AWS, paid by each user)

A long HCD→FRG→CSV agent on gpt-5-class models with high reasoning can be **several to tens of dollars per job**. That dwarfs ~$10 of infrastructure. Lowering model and effort on the create screen helps. Research mode (on by default, [01 §6.11](./01_設計仕様.md)) adds a literature survey before the HCD: roughly +10–60 minutes of Fargate time (about $0.01–0.05 at 1 vCPU / 2 GB Spot) and, on the OpenAI side, the cost of 1.5–6M mostly cached input tokens and 40–150k output tokens at reasoning effort `high` or more; the create screen shows the estimate for the selected model. Turn it off there for quick drafts.

The app also tracks this. Each job records the model used, input/output tokens, and estimated cost. Totals and per-model breakdown appear on the project list, job breakdown in the chat header, and the admin screen. Estimates use the table in `packages/shared/src/pricing.ts` and may not match the OpenAI invoice (especially models missing from the table, shown as `$—`).

---

## 6. Scenario comparison

| Scenario | AWS monthly feel | Comment |
| -------- | ---------------- | ------- |
| Dev only (deployed, almost no jobs) | $2–4 | KMS stands out |
| Individual, 10 jobs/month | $4–8 | |
| A few people, 50 jobs/month | $8–18 | Design target |
| 50 jobs/month and Spot is unhealthy | $15–25 | A $30 Budget can detect this |
| Change to include NAT | above +$32~ | Not recommended |
| Always-on t3.medium | around $30 | Still billed while waiting. This architecture is cheaper |

---

## 7. Cost-control implementation

- Prefer Fargate Spot; On-Demand only when capacity is missing.
- Exit the task on `[QUESTION]`. Zero compute charge until the answer.
- No NAT / custom domain / Container Insights / PITR.
- CloudFront Price Class 200.
- Logs 14 days. Incomplete multipart uploads deleted after 3 days.
- Concurrency caps prevent unnoticed piles of Spot tasks.
- Janitor: auto-retry up to 2 times if heartbeat is missing for 15 minutes; FAILED after 7 days waiting for a question or 24 hours in queue.

---

## 8. Monitoring and budget operations

Recommended:

1. Create **AWS Budgets** on the account (example: email on $20 AWS forecast, $30 actual).
2. Review Cost Explorer by service. First suspect for a spike is **Fargate**, then **CloudWatch Logs** and **CodeBuild**.
3. Worker logs: stack output `WorkerLogGroup` (current example: `CobracAgents-WorkerLogsC1193B08-pBa5gactuB1r`).
4. Job token usage and estimated cost are Jobs.usage / Jobs.costUsd; project totals are Projects.usage / Projects.costUsd (for reconciling OpenAI invoices). Separate from AWS charges.

The app runs without these. Without Budgets, Spot fallback or a log spike is easy to miss.

---

## 9. Environment variables (cost and scale)

The source of truth is the GitHub repository's Actions **Variables** (and the **Secret** `COBRAC_ADMIN_EMAILS`). A local `.env` (not in the repo; `.env.example` is the template) is a copy for emergency deploys and must be kept in sync. The defaults below apply only when a variable is absent locally; the deploy workflow requires every value except `COBRAC_CODEX_MODEL` and fails if one is empty.

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `COBRAC_ADMIN_EMAILS` | (required) | Admin on first login |
| `COBRAC_SELF_SIGNUP` | true | false for invite-only |
| `COBRAC_MAX_CONCURRENT_JOBS` | 2 | Overall concurrent Fargate tasks |
| `COBRAC_MAX_CONCURRENT_JOBS_PER_USER` | 1 | Per user |
| `COBRAC_CODEX_MODEL` | empty | Model when unspecified |
| `COBRAC_CODEX_REASONING_EFFORT` | high | Effort when unspecified |
| `COBRAC_RCS_MCP_URL` | production `rcs-mcp` endpoint | RCS MCP server for SABRA lookups; empty disables RCS. Optional, not in Actions Variables |
| `COBRAC_RCS_MCP_SECRET_NAME` | `rcs/mcp-bearer-token` | Secret with the accepted RCS tokens (owned by rosetta-candidate-search). The worker task role gets `GetSecretValue` on it |

Raising concurrency grows Fargate linearly. Pinning a larger model grows only the OpenAI side.

---

## 10. Deletion and leftover cost

These remain after `cdk destroy` (tiny storage charges continue):

- KMS CMK (cannot be deleted until after disable + waiting period)
- Cognito User Pool
- DynamoDB Users / Projects / Jobs / Messages
- S3 Artifacts (bucket cannot be deleted while objects remain)

Rough teardown: empty the artifacts bucket → delete tables → delete User Pool → schedule KMS deletion. Also check ECR images and CloudWatch log groups.

---

## 11. Changes that would raise cost later

| Change | Impact |
| ------ | ------ |
| NAT + private subnets | Fixed +$32~ |
| PITR / versioning | Storage roughly doubles |
| Unlimited logs / Insights | CloudWatch can become the main cost |
| Concurrency to 10 | Peak Fargate ×5 |
| Custom domain + ACM | Small dollars. More operations |

The current cheapness depends on **stopping workers when unused** and **not placing a NAT**.

---

## 12. Deploy pipeline (GitHub Actions)

```
work branch ── PR ── ci.yml (no AWS credentials) ── merge ──▶ main
                                                               │ push
                                  deploy.yml: is tag v<version> missing?  ── no ──▶ done (nothing to deploy)
                                                               │ yes
          settings check → build / typecheck / test / release:check
          → OIDC: sts:AssumeRoleWithWebIdentity → gha-cobrac-web-deploy (1 hour)
          → cdk diff → RETAIN guard → npm run deploy (via CDK bootstrap roles)
          → push tag vX.Y.Z → GET /health reports X.Y.Z, WebUrl returns 200
```

| Item | Setting |
| ---- | ------- |
| IAM role | `gha-cobrac-web-deploy`. Trust: GitHub OIDC, `sub` = `repo:miyamoto9265/cobrac-web:ref:refs/heads/main` only (PR branches, forks, tags cannot assume it). Permissions: assume the `cdk-hnb659fds-*` bootstrap roles and `cloudformation:DescribeStacks` on `CobracAgents`, plus a deny guardrail on IAM / billing / secrets / personal-data reads |
| Long-lived keys | None |
| Workflow permissions | Default `read`. `id-token: write` only on the deploy job, `contents: write` only on the tag job, none on the health job |
| Settings | Actions Variables and Secret `COBRAC_ADMIN_EMAILS` (§9). Validated before any AWS call; admin addresses are masked in the log |
| Approval | Merging a PR that bumps the version (`npm run release -- <patch/minor/major> --no-git`) |
| RETAIN guard | `scripts/retain-guard.mjs` reads `cdk diff`. Replace / may be replaced / destroy / orphan / removal of `AWS::DynamoDB::Table`, `AWS::DynamoDB::GlobalTable`, `AWS::S3::Bucket`, `AWS::KMS::Key`, `AWS::Cognito::UserPool` stops the job before deploy. To proceed after review: `gh workflow run deploy.yml --ref main -f allow_retain_replacement=true` |
| Serialisation | `concurrency: deploy-cobrac-agents`, runs never cancelled mid-deploy |
| Actions | Pinned by commit SHA |

The CDK deploy itself runs as `cdk-hnb659fds-cfn-exec-role`, which has `AdministratorAccess` by default. Anyone who can merge to `main` can therefore deploy any change to this account; narrowing that requires re-bootstrapping with `--cloudformation-execution-policies` and is not done yet.

Emergency path: when Actions is unavailable, deploy locally with `npm run deploy` (profile `rcs-org`, `.env` in sync with GitHub), then bring the same change to `main` through a PR and push the tag so the workflow does not deploy it again.

To stop CI deploys immediately: disable the `deploy` workflow in GitHub, or change the role's trust policy `sub` (local IAM work).
