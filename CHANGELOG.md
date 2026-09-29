# Release notes

Change history for CoBRAC Agents. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
Accumulate changes under `[Unreleased]`, then finalize the version in a release PR with `npm run release -- <patch|minor|major> --no-git`; merging it deploys (see `AGENTS.md`).

## [Unreleased]

### Added
- The harness checks that every reference is a real paper: each DOI is looked up in Crossref (other DOIs through doi.org) and each PMID in PubMed, and the record must have the Reference ID's first author, its year (±1) and, when given, a similar title. A DOI or PMID that does not exist or belongs to another paper goes back to the agent as a problem to fix, like the other checks
- The checks also report `[Author, Year]` citations in the data files and the report that are not in `references.json`, references that are cited nowhere (or only in the report's bibliography), and two references with the same DOI or PMID
- The result of each reference (verified, mismatch, not found, invalid, no identifier, unverified) is kept in `reference_check.json` in the project workspace, and the chat shows a summary when the HCD or FRG phase is accepted
- `references.json` may give `pmid`, `title` and `journal` for each reference; the agent is asked to fill them. Files with only `id` and `doi` stay valid
- When Crossref, doi.org or PubMed cannot be reached (timeout, rate limit, outage), the references stay "unverified" and the phase continues

### Changed
- The agent's chat replies (turn summaries and questions) are written in the language selected in the web app (English, Japanese, Chinese, Korean, German, French, Spanish, Portuguese or Russian), whatever language the ROI/TLF or instructions are typed in. The language of the screen at the time of creating, answering, sending a follow-up or retrying is used; files such as the report, the decision log and the xlsx stay in English
- The chat no longer fills up with the agent's thoughts and commands: while the agent works, a single live line shows the latest step with the step count, elapsed time and to-do progress; once it moves on, those steps fold into one "Thinking & actions (N steps, time)" row that expands to the full list. Answers, questions, errors and notices stay visible
- Reasoning previews in the step list no longer show Markdown `**` markers, and a to-do list previews its next open item

### Fixed
- A project shows a provisional name made from the ROI and TLF as typed, such as "VOR in 小脳", from the moment it is created until the agent names it; before, Japanese input was dropped and a project with TLF "VOR" / ROI "小脳" was called "VOR" while it ran. Projects already created that way show the provisional name too, including in the xlsx download name. A name the user typed or edited is still never replaced
- The project history in the sidebar shows both ROI and TLF under the name instead of only the TLF
- The chat no longer looks as if the user sent a second message at the start of each run: the instruction the worker gives the agent (Project ID, ROI, TLF, Contributor, "Run phase HCD." and the retry / answer / follow-up variants) is shown as a small notice such as "Started phase HCD." that expands to the full text. Existing conversations are shown the same way

## [0.8.1] - 2026-09-28

### Added
- Documentation article "CoBRAC Harness v1 → v1.1" (English and Japanese): the JSON data files, UC names based on SABRA and RCS, the report and decision log in the app, and the instruction size, with figures for the data flow, the file mapping and how a UC Descriptor and Circuit ID are built

### Changed
- The harness of app 0.8.0 and later is called CoBRAC harness v1.1 in the documentation; the v0 → v1 article and the design spec point to the new article
- Tables with a `v1.1` column header show it as a badge, like `v0` and `v1`

## [0.8.0] - 2026-09-28

### Added
- The chat screen has Report and Decision log buttons once a project has them: they open `report.md` / `decision_log.md` in a viewer with a download button
- Each data file the agent writes has a JSON Schema; the agent can read it in `schemas/`, and validation problems point at the exact field (for example `uc.json: /ucs/3/implementation is required`)

### Changed
- The agent writes its HCD / FRG data as JSON instead of markdown tables: `references.json`, `uc.json` and `connections.json` (tissue-level BIF and UC connections together) in `{ID}_HCD/`, and `frg.json` (TLF and GNs with their function details) in `{ID}_FRG/`. The five CSVs, the xlsx and the graphs are generated from these files by code
- External UCs are marked by a `roi` value (`noROI(input)` etc.) instead of a tag typed into Comments; the tag is still written to Circuits.csv
- The HCD and FRG reports are one `report.md` (`## HCD` and `## FRG` sections) at the project root, and `1_Thinking.md` is now `decision_log.md`: the decisions the agent took and why, without copies of RCS queries (every RCS call is kept in `rcs_mcp_calls.jsonl`)
- Values that are not in English are reported by the checks of the phase that wrote them

### Removed
- `1_InitialDecomposition.md`, `2_OptimizedFRG.md` (their rationale goes into the report) and `5_Verification.md` (the checks cover the structure; open points go into the report's Limitations)
- The fallback in which the agent typed the CSVs by hand; problems now go back as fixes to the JSON files
- Reading of the markdown formats used before this version. Existing projects keep their xlsx and graphs, but follow-ups and retries on them stop with a message to start a new project

## [0.7.1] - 2026-09-28

### Changed
- The "CoBRAC Harness v0 → v1" article draws its architecture as figures instead of text art: a v0/v1 overview, the v0 and v1 flows, instruction tokens per phase, and the artifact output breakdown. A new table maps each v0 weak point to the change that fixes it. Phones get one-column versions of the figures
- Documentation pages show a table of contents under the open document (a collapsible list on phones) that follows the scroll position, and headings have link anchors. Links between documents and to headings stay on the site
- Documents that exist in English and Japanese appear once in the list, in your display language, with a switch between the two versions
- Tables, figures, and body text in the documentation are easier to read

## [0.7.0] - 2026-09-28

### Added
- The agent looks up brain regions in ROSETTA Candidate Search (RCS) and names each UC after a SABRA unit: a UC Descriptor (e.g. `HOMBA:12261`, `BNA:223-224/part:HOMBA:10341/mol:DRD1+`) and a Circuit ID starting with the unit's official abbreviation (e.g. `VTA`, `NAC(shell,DRD1+)`). Most UCs are a whole SABRA unit and use the abbreviation alone
- `3_UC.md` has a `UC Descriptor` column after `Circuit ID`; `Circuits.csv` and the xlsx Circuits sheet add it as their last column, and the HCD graph shows it in the node details
- The checks verify the Circuit ID format, that it starts with the anchor's abbreviation (looked up in RCS / the BNA table), that its items match the descriptor, and that descriptors are unique. Every RCS call of the agent is kept in `rcs_mcp_calls.jsonl` in the project workspace
- Links with an old Project ID open the project under its new ID after the one-off migration (`scripts/migrate-project-ids.mjs`, dry run by default)

### Changed
- Projects created before this version (no `UC Descriptor` column) keep their Circuit IDs and are validated as before
- Project IDs are now assigned by the system as `<user key>-<number>` (for example `u7m2q9xa-12`). They are unique across all users and never change, so URLs, storage paths, and the `Project ID` column of the xlsx stay stable
- Projects have a separate name that can be written in any language and changed at any time from the chat header. Lists, the sidebar, chat, and graph screens show the name first and the ID below it; search also matches the name. Names may repeat; a warning appears when another of your projects has the same name
- When a project starts, the agent gives it an English name such as `VOR learning in cerebellar flocculus` unless you typed your own name
- The xlsx downloads as `{name}_{ID}.bra.xlsx` (unsafe characters replaced; non-ASCII names kept), and its Description starts with the English name

### Fixed
- Interfaces and FRG Subnodes whose Circuit IDs contain brackets or commas (e.g. `[U.NAC(shell,DRD1+)]`) are parsed correctly
- When two users had used the same Project ID, one user's chat history, live updates, and token usage could include the other user's. Each user now sees only their own

## [0.6.0] - 2026-09-28

### Changed
- The site now works on phones and tablets. Below 1024px the sidebar opens from a menu button in a top bar, and every screen fits the width without horizontal scrolling
- On phones the project list shows cards, the docs page picks a document from a dropdown, and graph node/edge details slide up from the bottom. Tablets show two cards per row and details in a floating card
- On touch screens buttons and links are larger (about 44px), and form fields no longer make iOS zoom in when focused. Content stays clear of the notch and the home indicator

### Fixed
- Long project IDs, paths, and table headers in chat and the usage table no longer overflow or wrap one character per line
- In graphs the legend no longer covers the zoom buttons on small screens

## [0.5.2] - 2026-09-27

### Changed
- Releases are deployed by GitHub Actions when a version-bumped pull request is merged, instead of from a local machine. Each pull request is checked (build, typecheck, tests, CDK synth), and a deploy stops before touching AWS if deploy settings are missing or if it would replace or remove a data table, bucket, encryption key, or the user pool. After a deploy, the new version must show up in `/health`

### Added
- `archive/v0/` keeps the legacy desktop instructions, original specs, v0 sample artifacts, and the desktop user guide, which used to live in the separate CoBRAC repository

## [0.5.1] - 2026-09-27

### Added
- Documentation article explaining how the agent harness changed from the legacy instruction files (v0) to the CoBRAC harness (v1), with architecture diagrams and a cost comparison, in English and Japanese

## [0.5.0] - 2026-09-26

### Changed
- The agent now runs as a dedicated CoBRAC harness. The worker drives HCD and FRG one phase at a time with compact English phase specs, instead of having the agent read the old instruction files in order
- Each phase is checked automatically: missing files and columns, unknown circuits, interface and connection mismatches, references, and the FRG rules (one root, no cycles, at most 2 UCs per GN and 2 GNs per UC, every ROI UC attached). Problems go back to the agent, which gets up to 3 fix attempts per phase
- The worker generates the five CSVs from the HCD/FRG tables. The agent writes them only when that conversion fails (for example, older Japanese projects)
- New artifacts are written in English, so they no longer need translating for the CSVs. Questions and summaries follow the language of your input
- The agent's questions and completion now come back as structured output, so they are no longer missed or misread
- An ROI or TLF left empty at creation is filled in on the project once the agent decides it

### Added
- Check results in chat can be expanded to show each issue

### Removed
- The HCD beginner explainer (`7_EasyToUnderstand.md`) and the Mermaid diagram files; the web graphs replace them. Ask for an explainer in a follow-up if you need one

## [0.4.2] - 2026-09-26

### Changed
- Default model when none is chosen is gpt-6-luna

## [0.4.1] - 2026-09-25

### Changed
- gpt-5.6-cyber is no longer offered in the model picker and has no cost estimate

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
