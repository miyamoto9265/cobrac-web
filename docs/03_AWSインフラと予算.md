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
  │    └─ custom message ── Lambda authMessage   account e-mails
  │
  ├─ HTTP API  ── JWT ── Lambda http
  └─ WebSocket ── JWT ── Lambda ws
                      │
                      ├─ DynamoDB × 8
                      ├─ SQS (+ DLQ) ── Lambda dispatcher ── ECS RunTask
                      ├─ DynamoDB Streams ── Lambda broadcaster ── WS
                      ├─ EventBridge 5min ── Lambda janitor
                      ├─ EventBridge 1min ── Lambda planRunner (CoBRAC Orchestrator)
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
| Lambda × 10 | Node 22 ARM64, 512 MB (http 1024 MB: it builds the Template-v2-2 workbook of older projects on demand; authMessage 256 MB, 5 s). http/ws 30s, dispatcher/broadcaster 60s, planRunner 50 s, janitor 2 min | Request / SQS / Streams / every 5 minutes (janitor) / every minute (planRunner, CoBRAC Orchestrator) / Cognito custom message trigger |
| ECS Cluster | Fargate + Fargate Spot, Container Insights off | Always (the cluster itself is nearly free) |
| Fargate Task | 1 vCPU / 2 GB / ephemeral 21 GB, x86_64 | One task per job |
| CodeBuild | Image build at deploy. The base image `node:22-bookworm-slim` is pulled from the ECR Public mirror (`public.ecr.aws/docker/library/`), not Docker Hub, whose rate limit on anonymous pulls from CodeBuild's shared IPs failed deploys | During `cdk deploy` |
| ECR | One worker image (~0.5 GB compressed) | Always |

### 3.2 Data

| Resource | Settings |
| -------- | -------- |
| DynamoDB Users / Projects / Jobs / Messages | On-Demand. Streams on Projects/Messages. PITR off. RETAIN |
| DynamoDB WsConnections | On-Demand, TTL, DESTROY |
| DynamoDB Canons | On-Demand, GSI `owner-index`. PITR off. RETAIN (added with the Canon MVP; a new table, existing tables are unchanged). Canon revision snapshots and pull-request payloads are JSON under `canons/` in the artifacts bucket. The worker task role can read it (the pinned revision) |
| DynamoDB Catalog | On-Demand. Public listing and clone counters, ID reservations (Project / Canon / plan), settings (`config`: the default API key, the concurrency limits). PITR off. RETAIN (new table) |
| DynamoDB Plans | On-Demand, GSIs `owner-index` and `status-index` (both sparse: only the `META` item of a plan carries their keys). PITR off. RETAIN. Added with the CoBRAC Orchestrator (stage 1; a new table, existing tables are unchanged). Items: `META` (the plan), `ROW#<rowId>` (one row = one project to build), `EVT#<at>#<nonce>` (history), and since stage 2 `PROP#<proposalId>` (proposals of re-plan jobs; new items in the same table, no table or index change) |
| S3 Artifacts | Private, SSE-S3, incomplete MPU aborted after 3 days, `staging/` (reference uploads not yet attached to a project) expires after 1 day, the bucket policy denies deleting BRA data versions (`users/*/*/revisions/*`, design spec 6.20) to every principal, CORS `POST` from the CloudFront domain and `https://cobrac.site` for browser uploads, RETAIN. `plans/{planId}/` (CoBRAC Orchestrator stage 2) holds a plan's capability lists (`attachments/`) and the `input.json` / `result.json` of its plan jobs (`jobs/{jobId}/`); no API key or other secret is ever written there |
| S3 Web | Private, OAC, DESTROY + auto-empty |
| SQS JobQueue | Visibility 120s, retention 4 days, DLQ 14 days (after 5 failures) |

**CoBRAC Orchestrator access** (`packages/infra/lib/cobrac-stack.ts`). Stage 1: the API reads and writes the Plans table; the plan runner reads and writes Plans / Users / Projects / Jobs / Messages, may `GetItem` only the `config` partition and `PutItem` only the `id` partition of the Catalog, sends to the job queue and may stop tasks of the cluster. Added in stage 2 (drafting and re-planning, design spec 6.22.1):

| Who | Grant | Why |
| --- | ----- | --- |
| API (http) | S3 `PutObject` on `plans/*` (reads were already allowed on the bucket) | moves the capability lists attached at creation from `staging/` to `plans/{planId}/attachments/files/` |
| planRunner | Canons: Query on `owner-index` only | lists the owner's Canons for the plan job's input |
| planRunner | S3 get / put on `plans/*` | writes a plan job's `input.json`, reads its `result.json` |
| planRunner | S3 get on `users/*_HCD/uc.json` | reads the finished rows' `uc.json` for the anchors they actually used (at most 20 reads per step) |
| Worker task role | unchanged | already reads and writes the artifacts bucket and the Jobs table, and is the only role with KMS `Decrypt` |

Stage 3 (the plan's Canon, design spec 6.22.2) changes the plan runner's grants as follows; the API, the dispatcher and the worker are unchanged:

| Who | Grant | Why |
| --- | ----- | --- |
| planRunner | Canons: read / write (`grantReadWriteData`; replaces the stage-2 Query on `owner-index`) | lists the owner's Canons for the plan job's input; reads the plan's Canon each step; adds rows' projects to it (`MEMBER#`); creates pull requests (`PR#`, `PEV#`, superseding the project's older open one) and follows their state (the AI review job itself goes to the Jobs table, already granted) |
| planRunner | S3 get / put on `canons/*` | reads the Canon's revisions (`canons/{id}/rev/`) to diff a push and to describe a conform follow-up; writes a pull request's `incoming.json` / `diff.json` (`canons/{id}/pr/{no}/`) and an AI review's `input.json` (`…/ai/{jobId}/`) |
| planRunner | S3 get on `users/*/workspace/*` (replaces the stage-2 `users/*_HCD/uc.json`) | reads a finished project's workspace files (`uc.json`, connections, references, FRG, meta and the reference checks) to push it, and the finished rows' `uc.json` for the anchors they used |

The runner gets no KMS grant and never approves, rejects or answers anything; approving stays a human action through the API (「まとめて承認」 included).

Neither the API nor the plan runner can decrypt an API key (the API only encrypts a key when it is registered; the runner has no KMS grant at all), and the input of a plan job holds none. The worker resolves and decrypts the key of a plan job as it does for any job.

### 3.3 Network, delivery, auth

| Resource | Settings |
| -------- | -------- |
| VPC | ~ /16, public /24 × 2 AZs, IGW, NAT 0 |
| CloudFront | Price Class 200 (North America, Europe, Asia), SPA 403/404 → index.html |
| HTTP API | CORS enabled. Anonymous only on `/health` |
| WebSocket API | stage `prod`. Connection limit 2 hours |
| Cognito | Email, SRP, ID/Access 2h, Refresh 30d, group `admin`. Account e-mails (sign-up code, resend, password reset, e-mail change, admin invite) are written by the custom message trigger `authMessage` (Japanese or English by the UI language, both otherwise); they are sent through SES from `CoBRAC Agents <no-reply@cobrac.site>` (SES domain identity `cobrac.site` in ap-northeast-1, Easy DKIM; the DKIM CNAMEs and `_dmarc` TXT are in the personal account's Route 53 zone). Cognito sends through its service-linked role `AWSServiceRoleForAmazonCognitoIdpEmailService` |
| SES alarms | CloudWatch alarms on the account-level `AWS/SES` metrics `Reputation.BounceRate` ≥ 5% and `Reputation.ComplaintRate` ≥ 0.1% (maximum over 1 hour; no data counts as OK). Alarm and OK go to the SNS topic `SesAlarmTopic`, which has one e-mail subscriber: the address in the SSM String parameter `/cobrac-web/alarm-email`, resolved by CloudFormation at deploy time so that the address is in neither the repository nor the template. The subscriber must confirm the SNS mail once after the first deploy |
| KMS CMK | Rotation enabled, RETAIN |

### 3.4 Logs

CloudWatch Logs **14 days** for both Lambda and the worker. Insights is not used.

### 3.5 BRA-DB (stack `BraDb`, since 0.26.0)

BRA-DB (PostgreSQL 17 + Apache AGE 1.7, schema v4.6; design spec 6.21) runs in its own stack and VPC. Nothing in it accepts traffic from the internet. `COBRAC_BRADB=false` at synth leaves the stack out (and the API then reports that this deployment has no BRA-DB).

| Resource | Settings |
| -------- | -------- |
| VPC | `10.42.0.0/24`, one AZ: a private subnet (instance, registration Lambda) and a public subnet that only holds the NAT instance. S3 gateway endpoint (free) |
| NAT instance | t4g.micro, Amazon Linux 2023 (`NatProvider.instanceV2` with its own setup script: swap, `iptables-services`, IP forwarding, masquerade; CDK's default script is killed for memory on a t4g.nano), outbound only: package updates, Secrets Manager, SSM. Accepts traffic from the VPC only. A NAT instance runs its user data once, so the stack gives it a new logical ID when its setup changes (it holds no data; the RETAIN guard does not cover it). A NAT Gateway would cost about $40/month more |
| EC2 `Db` | t4g.small, Ubuntu 24.04 arm64 (AMI pinned in `packages/infra/lib/bradb-stack.ts`), root gp3 16 GB encrypted, IMDSv2, termination protection, no SSH (SSM Session Manager). Security group: 5432 from the registration Lambda only |
| Data volume | gp3 20 GB encrypted, **RETAIN**, attached as `/dev/sdf` and mounted at `/srv/bradb` (the cluster's data directory) |
| Snapshots | Data Lifecycle Manager: daily at 18:00 UTC, 7 kept (tag `bradb-backup=daily`) |
| Secrets Manager | `cobrac/bradb/bra` (owner), `cobrac/bradb/cobrac_import` (registration Lambda), `cobrac/bradb/cobrac_read` (read-only). `bootstrap.sh` sets the role passwords from them at every boot, so rotating a secret takes effect on the next reboot |
| Lambda `cobrac-bradb-import` | Node 22 arm64, in the private subnet, 25 s. Called only by the CobracAgents API (`lambda:InvokeFunction` on this name) |

**Boot and schema.** The user data runs `packages/infra/bradb/bootstrap.sh` at every boot (`cloud_final_modules: scripts-user always`): installs `postgresql-17` and `postgresql-17-age` from PGDG, formats and mounts the data volume the first time, creates or re-registers the cluster on it, sets `shared_preload_libraries = 'age'` and scram-sha-256 from the VPC only, sets the role passwords, creates `bra_db_v4_6` and applies the files in `packages/infra/bradb/sql/` that `cobrac.schema_migrations` does not list yet (`*_grants.sql` is re-applied when it changes; other applied files must not change: add a new numbered file). A change to those files changes the user data, so CloudFormation stops and starts the instance (about a minute of downtime) and the new files are applied at boot. The log is `/var/log/bradb-bootstrap.log`.

**Operations.**

- Shell: `aws ssm start-session --target <InstanceId>`; then `sudo -u postgres psql -d bra_db_v4_6`.
- From a laptop (for example for BRA-DB maintainers): `aws ssm start-session --target <InstanceId> --document-name AWS-StartPortForwardingSession --parameters portNumber=5432,localPortNumber=15432`, then connect to `127.0.0.1:15432` as `bra` or `cobrac_read` with the password from Secrets Manager.
- Restore: create a volume from a snapshot in the same AZ, stop the instance, detach the data volume, attach the restored one as `/dev/sdf`, start. Then bring the stack back in line (`DataVolume` in the template) in a PR.
- Replacing the instance (a new AMI, another instance type family): the RETAIN guard stops the deploy because `AWS::EC2::Instance` / `AWS::EC2::VolumeAttachment` would be replaced. Detach the data volume first (stop the instance, detach), then re-run with `allow_retain_replacement=true`; the new instance re-registers the cluster on the volume at boot.

### 3.6 Deployed (reference, 2026-09-13)

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
| CoBRAC Orchestrator draft or re-plan | One Fargate task for a short Codex run (one turn, a second when the reply does not parse; at most 7 minutes, 25 for a draft of long lists, so about a cent at most on Spot), a few small S3 objects, DynamoDB writes |
| CoBRAC Orchestrator with a Canon (stage 3) | No new kind of job: each body row's pull request gets one ordinary AI review job (`canon-review`), and a row whose pull request has conflicts because the Canon moved on gets at most 2 ordinary follow-up jobs (conform). Pushes are a few small S3 objects and DynamoDB writes in the runner |
| `cdk deploy` | CodeBuild (when the image is rebuilt), ECR push, CloudFront invalidation, Lambda update |

Concurrency: overall `COBRAC_MAX_CONCURRENT_JOBS` (default 2), 1 per user (`COBRAC_MAX_CONCURRENT_JOBS_PER_USER`). An admin can override both on the admin page (1–16 each, Catalog `config` / `concurrency`); the dispatcher and the plan runner re-read the setting every 30 seconds, so a change needs no deploy. Excess messages are re-queued after 60 seconds (wait time is SQS only). The CoBRAC Orchestrator never queues a row, or one of its own plan jobs (a draft or a re-plan), ahead of a free slot, so they wait in DynamoDB rather than in SQS. A plan job counts toward both limits like any job while it is queued or running.

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
| Lambda | ARM, short runs; planRunner runs every minute (about 43,800 invocations a month, a Query or two when no plan runs, well inside the free tier) | $0–1 |
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

### 5.5 BRA-DB (stack `BraDb`, always on)

Tokyo on-demand prices, October 2026; the data is a few MB, so storage and transfer are small.

| Item | Monthly (USD) |
| ---- | ------------- |
| EC2 t4g.small (730 h × $0.0216) | 15.8 |
| NAT instance t4g.micro (730 h × $0.0108) | 7.9 |
| Public IPv4 of the NAT instance (730 h × $0.005) | 3.7 |
| EBS gp3: root 16 GB + data 20 GB + NAT 8 GB ($0.096/GB) | 4.2 |
| Snapshots (7 daily, incremental, a few GB) | 0.3 |
| Secrets Manager (3 secrets × $0.40) | 1.2 |
| Lambda, CloudWatch Logs, data transfer | < 0.5 |
| **Total** | **about 34 (about ¥5,100)** |

A 1-year Compute Savings Plan lowers the two instances by about 30 %. Stopping the instance at night is possible but saves only about $8 and makes registration unavailable.

### 5.6 OpenAI (outside AWS, paid by each user or by the default API key)

A long HCD→FRG→CSV agent on gpt-5-class models with high reasoning can be **several to tens of dollars per job**. That dwarfs ~$10 of infrastructure. Lowering model and effort on the create screen helps. Research mode (on by default, [01 §6.11](./01_設計仕様.md)) adds a literature survey before the HCD: roughly +10–60 minutes of Fargate time (about $0.01–0.05 at 1 vCPU / 2 GB Spot) and, on the OpenAI side, the cost of 1.5–6M mostly cached input tokens and 40–150k output tokens at reasoning effort `high` or more; the create screen shows the estimate for the selected model. Turn it off there for quick drafts. A CoBRAC Orchestrator draft or re-plan is one short Codex turn (one retry when the reply does not parse) at reasoning effort `medium` with RCS lookups and a budget of 7 minutes (25 for a draft that reads xlsx / PDF lists or has more than 20 rows; [01 §6.22.1](./01_設計仕様.md)): a small cost next to one BRA run. It is billed like any job (the owner's key or the default API key), recorded on the job, and shown on the plan page as the cost of the plan's own jobs.

The app also tracks this. Each job records the model used, input/output tokens, and estimated cost. Totals and per-model breakdown appear on the project list, job breakdown in the chat header, and the admin screen. Estimates use the table in `packages/shared/src/pricing.ts` and may not match the OpenAI invoice (especially models missing from the table, shown as `$—`).

Jobs of approved users without their own key run on the default API key, the organization's key an admin registers on the admin page ([01 §4.1](./01_設計仕様.md)), so their cost lands on that key's OpenAI bill. Tier 1 users can run only `gpt-6-luna` and `gpt-5.6-luna` (the cheapest rows of the rate table); Tier 2 users can run every model. The admin page shows each user's default-key cost, in total and for the current month. The app has no spending cap of its own; set a monthly budget on the OpenAI project of the default key.

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
| BRA-DB stack (always on) | +about $34 | §5.5; `COBRAC_BRADB=false` leaves it out |

---

## 7. Cost-control implementation

- Prefer Fargate Spot; On-Demand only when capacity is missing.
- Exit the task on `[QUESTION]`. Zero compute charge until the answer.
- No NAT / custom domain / Container Insights / PITR.
- CloudFront Price Class 200.
- Logs 14 days. Incomplete multipart uploads deleted after 3 days.
- Concurrency caps prevent unnoticed piles of Spot tasks. The admin setting accepts 1–16 per limit; 17 or more is refused.
- CoBRAC Orchestrator (every minute): a plan starts a row only when a slot is free under both limits (queued jobs count), so a large plan never leaves jobs queued long enough for the 24-hour queue timeout. A failing row is retried at most 2 times, then waits for a person (「要対応」). A plan whose owner can no longer run jobs (no key, account disabled, chosen model no longer allowed) pauses itself instead of failing row after row.
- CoBRAC Orchestrator plan jobs (stage 2): a draft or re-plan job is queued only when a slot is free, the same gate as rows (it is never queued ahead of one), and counts toward both limits; a re-plan job runs at most once per wave and about 10 times per plan (`MAX_REPLAN_JOBS`; the first after the first finished wave, later ones once a tenth of the rows have finished since the last), only for automatically ordered plans and never while the plan is paused. The worker aborts a plan job after 7 minutes (25 for a draft of long lists); the janitor fails one whose heartbeat stops or that waits 24 hours in the queue and never retries it. The runner reads at most 20 `uc.json` files per step.
- CoBRAC Orchestrator with a Canon (stage 3): the AI reviews of body rows' pull requests and the conform follow-ups (at most 2 per row, `MAX_CONFORM_FOLLOWUPS`) are ordinary jobs on the owner's key or the default API key: they go through the same free-slot gate as rows (never queued ahead of a slot), count toward both limits and are billed like any job; the plan page counts the AI reviews of the plan's pull requests in the plan's cost so far. Seed rows get no AI review. A conform follow-up is sent only while its pull request is still open (the runner reads it again first), so no paid follow-up is spent on a pull request a person already approved or rejected. No new wave starts while 20 of the plan's pull requests wait for approval (`PLAN_MAX_WAITING_PRS`), so an unattended plan stops building instead of piling up work for its reviewers. Nothing is approved automatically.
- Janitor (every 5 minutes): auto-retry up to 2 times if heartbeat is missing for 15 minutes; FAILED after 7 days waiting for a question or 24 hours in queue. On a Spot interruption the worker gets SIGTERM and up to 120 s (the task's stop timeout): it saves the workspace and thread to S3 and marks its heartbeat stale, so the job resumes at the next janitor run instead of after 15–30 minutes. During a turn the worker also saves every 5 minutes, so at most that much work is lost when the task dies without SIGTERM.

---

## 8. Monitoring and budget operations

Recommended:

1. Create **AWS Budgets** on the account (example: email on $20 AWS forecast, $30 actual).
2. Review Cost Explorer by service. First suspect for a spike is **Fargate**, then **CloudWatch Logs** and **CodeBuild**.
3. Worker logs: stack output `WorkerLogGroup` (current example: `CobracAgents-WorkerLogsC1193B08-pBa5gactuB1r`).
4. Job token usage and estimated cost are Jobs.usage / Jobs.costUsd; project totals are Projects.usage / Projects.costUsd (for reconciling OpenAI invoices). Separate from AWS charges.
5. SES reputation: the stack's alarms mail the address in `/cobrac-web/alarm-email` when the bounce rate reaches 5% or the complaint rate 0.1% (SES may review the account from these rates and pause sending from 10% / 0.5%). Bounced and complaining addresses are already kept off by the account-level suppression list; the alarm is for finding the cause (for example, sign-ups with mistyped addresses). CloudFormation does not notice a new value in an unchanged parameter, so to change the address put it in a new parameter, point `COBRAC_ALARM_EMAIL_PARAMETER` (or the default in `packages/infra/bin/app.ts`) at it and deploy; the subscription is replaced and the new address gets a confirmation mail.

The app runs without these. Without Budgets, Spot fallback or a log spike is easy to miss.

---

## 9. Environment variables (cost and scale)

The source of truth is the GitHub repository's Actions **Variables** (and the **Secret** `COBRAC_ADMIN_EMAILS`). A local `.env` (not in the repo; `.env.example` is the template) is a copy for emergency deploys and must be kept in sync. The defaults below apply only when a variable is absent locally; the deploy workflow requires every value except `COBRAC_CODEX_MODEL` and fails if one is empty.

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `COBRAC_ADMIN_EMAILS` | (required) | Admin on first login |
| `COBRAC_SELF_SIGNUP` | true | false for invite-only |
| `COBRAC_MAX_CONCURRENT_JOBS` | 2 | Overall concurrent Fargate tasks (deployment value; the admin page setting, 1–16, overrides it without a deploy) |
| `COBRAC_MAX_CONCURRENT_JOBS_PER_USER` | 1 | Per user (same) |
| `COBRAC_CODEX_MODEL` | empty | Model when unspecified |
| `COBRAC_CODEX_REASONING_EFFORT` | high | Effort when unspecified |
| `COBRAC_RCS_MCP_URL` | production `rcs-mcp` endpoint | RCS MCP server for SABRA lookups; empty disables RCS. Optional, not in Actions Variables |
| `COBRAC_SITE_URL` | `https://cobrac.site` | Site URL written in the account e-mails. Optional, not in Actions Variables |
| `COBRAC_EMAIL_FROM` | `no-reply@cobrac.site` | Sender of the account e-mails through SES; its domain must be a verified SES identity in the stack's region. Empty falls back to Cognito's default sender. Optional, not in Actions Variables |
| `COBRAC_EMAIL_FROM_NAME` | `CoBRAC Agents` | Display name of that sender |
| `COBRAC_ALARM_EMAIL_PARAMETER` | `/cobrac-web/alarm-email` | SSM String parameter (same account and region) holding the address subscribed to the SES reputation alarms; it must exist before the deploy. Empty keeps the alarms and topic without a subscriber. Optional, not in Actions Variables |
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
| RETAIN guard | `scripts/retain-guard.mjs` reads `cdk diff` of `CobracAgents` and `BraDb`. Replace / may be replaced / destroy / orphan / removal of `AWS::DynamoDB::Table`, `AWS::DynamoDB::GlobalTable`, `AWS::S3::Bucket`, `AWS::KMS::Key`, `AWS::Cognito::UserPool`, and of the BRA-DB instance, data volume and their attachment (`AWS::EC2::Instance` `Db`, `AWS::EC2::Volume` `DataVolume`, `AWS::EC2::VolumeAttachment`; matched by construct path, so the NAT instance can be replaced) stops the job before deploy. To proceed after review: `gh workflow run deploy.yml --ref main -f allow_retain_replacement=true` |
| Serialisation | `concurrency: deploy-cobrac-agents`, runs never cancelled mid-deploy |
| Actions | Pinned by commit SHA |

The CDK deploy itself runs as `cdk-hnb659fds-cfn-exec-role`, which has `AdministratorAccess` by default. Anyone who can merge to `main` can therefore deploy any change to this account; narrowing that requires re-bootstrapping with `--cloudformation-execution-policies` and is not done yet.

Emergency path: when Actions is unavailable, deploy locally with `npm run deploy` (profile `rcs-org`, `.env` in sync with GitHub), then bring the same change to `main` through a PR and push the tag so the workflow does not deploy it again.

To stop CI deploys immediately: disable the `deploy` workflow in GitHub, or change the role's trust policy `sub` (local IAM work).
