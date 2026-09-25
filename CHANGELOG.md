# Release notes

Change history for CoBRAC Agents. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
Accumulate changes under `[Unreleased]`, then finalize the version at deploy time with `npm run release <patch|minor|major>` (see `AGENTS.md`).

## [Unreleased]

## [0.4.0] - 2026-09-25

### Changed
- Model picker lists GPT-5.6 and GPT-6 text models only. Older models are no longer offered
- Default model when none is chosen is gpt-5.6-sol
- Cost estimates use OpenAI standard short-context prices for those models (as of 2026-09-25)

## [0.3.2] - 2026-09-13

### Fixed
- System notices in chat (step completed, queued, cancelled, token usage, and similar) now follow the selected UI language, including messages already stored in Japanese

## [0.3.1] - 2026-09-13

### Added
- UI language switcher now includes Simplified Chinese, Traditional Chinese, Korean, German, French, Spanish, Brazilian Portuguese, and Russian (ten locales including English and Japanese). In-app documentation remains English only

## [0.3.0] - 2026-09-13

### Added
- UI language switcher (English default, Japanese). Choice is stored in the browser
- In-app documentation is English only (`docs/`, README, this changelog)

### Changed
- Default UI language is English

## [0.2.1] - 2026-09-13

### Fixed
- Made endpoint handles smaller when an edge is selected (radius 10 → 3.5)

## [0.2.0] - 2026-09-13

### Added
- Click an edge on HCD / FRG graphs to edit style (line type, color, width, dash, corner radius, start/end markers). Line types comparable to draw.io: curve, straight, orthogonal (auto), **orthogonal (add as many waypoints as needed)**, and polyline
- Orthogonal and polyline edges can add waypoints by dragging “+” on the path, move waypoints by dragging, and delete them with a double-click
- Drag both ends of an edge onto handles on the node sides to adjust start and end positions
- Freely resize nodes from corner and edge handles. Fill and border colors are also editable
- Inhibitory projections default to blue with a square end; excitatory to gray with a triangle arrow; modulatory to purple dashed with a circle. The legend shows projection classes
- Apply style in bulk to edges of the same class, Undo/Redo (Ctrl+Z / Ctrl+Y), grid snap, flip direction and re-layout, PNG export
- Position, size, style, and waypoints are auto-saved per project (`graph/{kind}.layout.json`)

### Changed
- Default HCD edge line type is now orthogonal (waypoints editable). Curve remains available from the style panel

## [0.1.3] - 2026-09-13

### Added
- App version in the sidebar footer (`vX.Y.Z · short commit hash`). `GET /health` also returns the version
- Design, security, and infrastructure docs under `docs/`, plus README and these release notes, are readable from the in-site Documentation page (`/docs`)
- HCD / FRG graph nodes can be dragged; positions are saved per project (S3 `graph/{hcd,frg}.layout.json`). “Reset layout” restores the automatic layout
- Automated release steps: `scripts/release.mjs` (bulk version bump, CHANGELOG finalization, git tag); versioning rules documented in `AGENTS.md`

### Changed
- Repository renamed to `cobrac-web` (GitHub: `miyamoto9265/cobrac-web`). App name remains “CoBRAC Agents”
- `npm run deploy` runs a version / CHANGELOG consistency check (`release:check`) before build and deploy

## [0.1.2] - 2026-09-13

### Added
- Record model used, input/output token counts, and estimated cost (USD) per job, and roll them up per project
- Project list: total-cost card and per-model breakdown; model / tokens / cost columns on each row
- Chat header: token / cost badges. Click to open a per-job breakdown table
- Admin project table: model and cost columns
- `GET /users/me/usage` (totals / by model / by project); `GET /users/me/models` now includes models present in the rate table
- OpenAI rate table (USD / 1M tokens) and `estimateCostUsd()` in `packages/shared/src/pricing.ts`

### Changed
- Project create always resolves a concrete model name (specified → user default → `CODEX_MODEL` → `gpt-5.3-codex`). An unknown “Codex default” model is no longer left behind

## [0.1.1] - 2026-09-13

### Added
- Codex model and reasoning effort can be chosen at project create. User defaults are saved on the Settings screen
- On API key registration, fetch and store the available model list from OpenAI `/v1/models`
- Fall back to On-Demand when Fargate Spot fails to start
- Janitor auto-retries jobs whose heartbeat has stopped (up to 2 times)

### Fixed
- “Failed to fetch” on API key registration. Removed `OPTIONS` from the API Gateway `/{proxy+}` route so CORS preflight does not go through the JWT authorizer

### Changed
- Lambda runtime updated to Node.js 22. Resolved the deprecated `logRetention` warning by declaring `logGroup` explicitly
- Codex SDK updated to 0.154.0

## [0.1.0] - 2026-09-13

### Added
- First deploy (ap-northeast-1). CloudFront + S3 React SPA, API Gateway (HTTP / WebSocket) + Lambda (Hono), SQS → ECS Fargate worker, DynamoDB, Cognito, KMS
- Workflow that generates HCD → FRG → CSV → xlsx from ROI / TLF via the Codex SDK
- Question → answer loop via `[QUESTION]`. The worker stops while waiting and resumes with `resumeThread` on answer
- Follow-up instructions after completion (revise artifacts on the same thread)
- Interactive HCD / FRG graphs (click a node for details)
- Project-history sidebar, project list, xlsx download
- User management (Cognito), per-user OpenAI API keys stored with KMS encryption, admin screen
- Worker image built on CodeBuild at deploy time (no local Docker)
