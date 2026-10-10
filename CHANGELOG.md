# Release notes

Change history for CoBRAC Agents. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
Accumulate changes under `[Unreleased]`, then finalize the version in a release PR with `npm run release -- <patch|minor|major> --no-git`; merging it deploys (see `AGENTS.md`).

## [Unreleased]

### Changed
- BRA-DB: traffic from the BRA-DB network to the internet now leaves from one fixed address (an Elastic IP on its NAT instance, shown as the `BraDb` stack output `NatPublicIp`), so an outside database can allow CoBRAC by IP. The address stays when the NAT instance is replaced or the stack is removed, and the deploy guard stops any change that would replace or drop it

## [0.45.1] - 2026-10-10

### Changed
- The specification PDF (admin「仕様書」page) is rewritten throughout. Its parts now go from concepts to how a BRA is built to how BRAs are brought together and the system underneath: an introduction with a reader's guide and a glossary, then overview, circuit naming, how a BRA is made, projects and versions, Canon, Orchestrator (autonomous runs first), BRA-DB, system, and security and cost, with appendices for the API, the prompts, how old projects are handled, design history and sources. The body states only the current behaviour; history and handling of old projects moved to their own appendices, and figures, numbers and limits were checked against the code. The Japanese is rewritten in a consistent formal style with one term per concept
- Release, deployment and emergency procedures moved from the specification to `docs/ops/README.md`

## [0.45.0] - 2026-10-10

### Added
- Claude models: jobs can run on Claude Fable 5.1, Claude Opus 5.5, Claude Sonnet 5.5 and Claude Haiku 5.5 (`claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`) as well as the OpenAI models, with the same harness, turns and outputs. The worker runs them on the Claude Agent SDK; a project whose model changes provider continues in a new conversation
- Anthropic API keys: Settings has an "Anthropic API key" card (for approved users, "Your own Anthropic API key (optional)"), and the admin page has a "Default Anthropic API key". Keys are checked with Anthropic and encrypted as the OpenAI keys are. A key that is not tied to one workspace can be registered with its workspace ID. Approved Tier 1 users can use Claude Haiku 5.5 through the default Anthropic key, Tier 2 users all four Claude models; a user's own key always wins. Until an admin registers the default Anthropic key, approved users see the card open and asking for their own key to use the Claude models
- Prices of the Claude models, including prompt-cache writes, so their jobs show estimated costs

### Changed
- The rate-limit notice of a turn no longer names OpenAI ("Rate limit: resuming the turn…"), since it also covers Anthropic

## [0.44.0] - 2026-10-10

### Changed
- CoBRAC Orchestrator: plans ordered automatically run as a flow instead of wave by wave. A row starts as soon as the rows it depends on are merged into the Canon, no unfinished baseline project shares a circuit with it, and no row being built overlaps it strongly (shares its ROI and more); a slot freed by any row is filled at once. Baseline projects that share no circuit are built side by side. Waves stay as hints of priority; rows with more rows depending on them start first. Plans ordered by hand, and plans confirmed before this change, keep running wave by wave
- CoBRAC Orchestrator: the Orchestrator's own AI jobs (answers, decisions, re-plans) use at most a third of the plan's slots (2 of 6) while rows wait, so building rows keeps most of them. Re-plans of a flow plan come after the first row is done, then each time a tenth of the rows finishes
- CoBRAC Orchestrator: an autonomous run keeps its cost limit by reserving half a row for each row being built, priced from the plan's own finished rows once 5 are done
- CoBRAC Orchestrator: the page of a flow plan shows its lanes (rows that build related circuits) as a map with a tile per row: done, running (flowing), needs you (beating), next (outlined) and waiting. Clicking a tile scrolls to its row. The summary shows the slots in use (rows in blue, the Orchestrator's AI in violet), the rows are listed by lane, and a waiting row says what it waits for (for example 「syntactic processing の後」 or 「次に開始」). The plan list's progress bar goes by lane, and a draft ordered automatically shows its estimate as a flow with its number of lanes

## [0.43.0] - 2026-10-10

### Changed
- The sidebar history is easier to read: project names wrap to two lines instead of being cut short, and the status shows only when a project is not completed (a small coloured dot with "Running", "Waiting for answer", "Failed" and so on) instead of a "Completed" badge on every row. The sidebar links are slightly tighter, leaving more room for the history
- Projects made by an Orchestrator plan no longer fill the sidebar history one by one: each plan is one row (its name and the number of projects, with the status of any project that is running, waiting or failed) that opens the plan
- "Projects" is no longer a sidebar link: the project list opens from "See all" next to the History heading
- Admins: the specification is no longer a sidebar link; it opens from the "Specification" button at the top of the admin page

### Fixed
- Projects list (desktop): rows are no longer several lines tall. A long project name now shows on at most two lines (the full name appears on hover), the Project ID stays on one line, and the "Status" heading, status badges and the hypothesis-mode badge no longer break into vertical text. Before, the ROI and TLF columns took their full width and squeezed the name column
- The first column of the Projects list and the admin page's project table is headed "Project name" (「プロジェクト名」, all languages) instead of "Project ID": it shows the name, with the ID below it
- CoBRAC Orchestrator: the autonomous-run setting of the new plan form and of a draft's "3. How it runs" now leads with "Autonomous run", what it does and its cost limit; "Handle pull requests and conflicts yourself" is a secondary checkbox below them. Before, that checkbox was the heading, so the autonomous run and its cost limit sat under an unticked box. The cost limit field is a short number field again, and the explanations of the autonomous run and of the cost limit are in their (?) tips instead of paragraphs
- CoBRAC Orchestrator: the model pickers of a draft's "3. How it runs" (the Orchestrator's model, the agents' model and their reasoning effort) are compact: smaller labels and lower pickers in one row of limited width
- CoBRAC Orchestrator: the drafting banner and the plan list show only the state of the draft job (for example 「下書きを作成中: 開始を待っています」), without the elapsed time

## [0.42.0] - 2026-10-10

### Changed
- Approved users no longer see the default API key or "Not registered". In Settings, their key card is "Your own OpenAI API key (optional)" and says "No key needed. You can run jobs as you are."; the form for a key of their own is folded under "Use your own key" until they register one. With their own key, the card says jobs run with it and are billed to their account; if the organisation's key is missing, it says jobs cannot run and to ask an admin. Users who are not approved see the card as before
- The model pickers no longer say "Using the default API key", and messages about a missing key ask the user to get approved by an admin instead of mentioning the default API key (all languages; the manual, its figure and the specification follow)
- The default API key's OpenAI organisation moved up a usage tier (2,000k tokens per minute, was 200k), so about 10 runs at once fit within it; the specification says so
- CoBRAC Orchestrator: a new plan runs as an autonomous run by default. The new plan form shows the cost limit and "Start autonomous run" from the start; handling pull request approvals, conflicts and questions yourself is now an option ("Handle pull requests and conflicts yourself", in the form and at the top of "3. How it runs" of a draft) that brings back "Create plan" and "Create draft". The API is unchanged: only a request with `autonomous` makes an autonomous plan
- The Canon pull request page and the AI review ask politely instead of saying "You decide" (11 languages; for example 「承認の前に、衝突 n 件の扱いを選んでください」)
- New plan form: the source files and the pasted rows are one "Source list" section (「資料」). "Add files" and "Paste rows" sit side by side, the paste box opens on demand, and one help text explains how files and rows are read. They were two sections before (「資料のファイル」 and 「資料（CSV・TSV・テキスト）」) for the same list
- The Canon page is laid out like the project page: a header (name, latest rev, granularity policy, counts, visibility) with tabs below it. "HCD graph" draws the latest rev's circuits, connections and Collections with the project's graph view (select a circuit to see which projects pushed it, or highlight one project's circuits; the arrangement is kept in the browser), "Tables" shows circuits, connections and references with CSV download, and "Projects", "Pull requests", "History" and "Settings" hold what used to be stacked on one page. Projects also show how many of their circuits are in the Canon. An empty Canon opens on "Projects"
- Settings and sign-out are no longer items in the sidebar list: they are icons next to your email address at the bottom of the sidebar (a gear and a sign-out icon), which leaves more room for the list

### Removed
- The note about tokens per run and the organisation's OpenAI rate limit is gone from the admin page's concurrency setting and from the help of a plan's concurrency, which now only says it is the lower of the overall and per-user limits

## [0.41.0] - 2026-10-09

### Added
- Autonomous run (自律実行): the Orchestrator now acts for the owner. The rows' agents may ask questions again (the instruction not to ask, `prompts/autonomous.md`, is gone); the Orchestrator's AI reads each question with the row, the plan's goal and policy, the Canon's policy and the project's decision log, and answers it (an `answer` row job, with no limit on the number of answers). Its answer reaches the agent as "Answer from the CoBRAC Orchestrator" and is shown in the project's chat and the plan's history
- Autonomous run: rows that need attention or a decision are resolved by the Orchestrator's AI (a `resolve` row job) with the owner's choices: retry or skip; mark done, push again (finished projects only) or skip. The row shows the choice and its reason; the owner can still decide first. A decision because the plan's Canon is gone still pauses the plan for the owner
- Autonomous run: re-plan proposals (rows to add or leave out) are applied as soon as they arrive, decided by the Orchestrator
- Row jobs are `plan` jobs (`planJobKind` answer / resolve, `planRowId`) run in one turn without tools on `prompts/orchestrator.md`, on a slot of their own, with the orchestrator model; their cost counts toward the plan and its cost limit
- Plan drafts: the goal can be edited and source files added or removed (`POST /plans/{id}/attachments`, `DELETE /plans/{id}/attachments/{fileId}`; CSV, TSV and text are read into rows at once)

### Changed
- Autonomous run: no row is left out because its agent kept asking or because its decision jobs failed; failed answer, resolution and decision jobs are asked again after a back-off of 1, 2, 4 … up to 60 minutes (the row shows the failures and the last error), so failures that cost nothing do not start a job every minute. The resolution job sees how often it chose to retry the row before, and is not offered "retry" for a deleted project. Cancelling the plan stops its Orchestrator jobs. A row past its follow-up limit needs a decision, which the Orchestrator then takes. Once the cost limit is reached, no resolution starts either
- The plan's draft screen follows the agreed mockup: "1. What to build" (goal, files, draft), "2. Rows and waves" (a table by wave, details on demand, a save bar only with unsaved changes, an empty state), "3. How it runs" (autonomous run, Canon, models in three columns, research mode) and "4. Confirm and start" (estimate and why it cannot be pressed); the progress cards only show once the plan is confirmed
- A plan needs a goal, source files or rows to be created ("Create plan" cannot be pressed otherwise; the API answers 400)
- "Your turn" no longer lists the rows of a running autonomous plan
- The Orchestrator's 「土台」 is now 「基準プロジェクト」 (English "Baseline project"; 基准项目, 基準專案, 기준 프로젝트, Basisprojekt, projet de référence, proyecto de referencia, projeto de referência, базовый проект), so the name says it is a project the later rows take as their baseline: the chip on rows and wave headings, the waits for its pull request, the help texts, the manual and the specification. The code keeps `seed`

## [0.40.1] - 2026-10-09

### Changed
- 「利用マニュアル」 / "User manual" (ja, en): rewritten shorter to match the current screens. Each section now gives the main steps only; the fine detail of CoBRAC Orchestrator (ordering rules, estimates, Canon and autonomous-run edge cases), hypothesis mode, versions and Canon review is left to the screens' "?" and the specification

## [0.40.0] - 2026-10-09

### Added
- CoBRAC Orchestrator: 「自律実行」 / "Autonomous run", a setting of a plan that makes it run to the end without waiting for a person. Switch it on in the new plan form with a cost limit (USD 1–1000, 20 by default) and press 「自律実行で開始」; it can also be switched in a draft's settings. Without a chosen Canon, a new Canon named after the plan is created
- Autonomous run: the draft is confirmed by the plan runner as soon as it is written (a failed draft job is asked once more; a confirmation that fails is shown with its reason). A draft written before the run was switched on still waits for "Confirm and start"
- Autonomous run: the rows' agents do not ask questions: they go on with the option they recommend and record each such decision under `## Autonomous decisions` in decision_log.md (new prompt `prompts/autonomous.md`, added on every turn; the end-of-turn JSON is unchanged). A question asked all the same is answered by the runner with a fixed answer, up to 3 times per row
- Autonomous run: every pull request of the plan (foundation rows included) gets an AI decision job: the AI review returns a verdict (approve / request changes / reject) with its review. The runner applies it for the Canon's owner: approve merges (warnings take the side the AI chose, otherwise the Canon's), request changes sends the listed changes to the project as a follow-up and pushes again, reject closes the PR and leaves the row out. Error conflicts are never merged on the AI's word: they become a follow-up that makes the project agree with the Canon (at most 3 follow-ups per row). Other pull requests to the Canon are still decided by people
- Autonomous run: rows that would need attention or a decision are left out instead of waiting (「自律実行で見送り」 with the reason); an existing project in another Canon is rebuilt for this Canon. The plan still pauses when its Canon is gone
- Autonomous run, cost limit: once the plan's cost (rows' projects, plan jobs, AI review and decision jobs) reaches it, no new row, follow-up or re-plan starts; running rows finish, and the plan then pauses. "Raise the limit and resume" continues it
- Autonomous run: PR records and history name the AI (「AI (model)」) as who approved, rejected or asked for changes; the PR page's AI review shows the AI decision (verdict, reason, requested changes). New plan events: `row_auto_skipped`, `row_auto_answered`, `row_ai_decided`, `cost_limit_reached`, `cost_limit_raised`
- API: `POST /plans` takes `autonomous: { maxCostUsd? }` and `canon`; `PUT /plans/{id}` settings take `autonomous`; `POST /plans/{id}/resume` takes `{ maxCostUsd }`
- Specification PDF: section 6.15 「自律実行」, the decision job in 4.8, and `prompts/autonomous.md` in appendix B

### Changed
- The Orchestrator's 「種」 is now 「土台」 (English "Foundation", and the matching word in the other languages): the chip on rows and wave headings, the waits for a foundation's pull request, the help texts, the manual and the specification. The code keeps `seed`
- Rejecting a Canon pull request and requesting changes on it go through shared functions (`rejectPullRequest`, `requestPrChanges`) used by the routes and the plan runner; answering a question goes through `answerQuestion` (the route and the runner)

## [0.39.0] - 2026-10-08

### Added
- The specification is now one Japanese PDF, 「CoBRAC Agents 仕様書」 (188 pages): system overview, the harness (which actor is the LLM and which is the program, what they hand over, each phase), circuit naming, Canons, versions and BRA-DB, the CoBRAC Orchestrator, AWS infrastructure, security and operations, and appendices with every API route, the full prompt texts, the sources and the revision history. It replaces all earlier documents and is the single source of truth

### Changed
- The admin-only 「ドキュメント」 page is now 「仕様書」 / "Specification" (all 10 languages). It shows the PDF inside the page on computers, with 「新しいタブで開く」 / 「ダウンロード」 buttons; phones and tablets get the buttons only. Old `/docs/<document>` links open the new page

### Removed
- The Markdown documents on the admin page (design specification, harness guide and archived comparisons, circuit naming, research mode and Canons, AWS and budget, security, speed and cost) and README / AGENTS.md. Their content is in the PDF

## [0.38.1] - 2026-10-08

### Removed
- Sidebar: the 「リリースノート」 / "Release notes" item. The version number at the bottom of the sidebar still opens the release notes
- Projects page: the warning that some projects used a model with no listed price and are left out of the total, and the "OpenAI list prices as of …" note under the per-model table. The note under the job table of a project and the unpriced count on a plan's actual cost are removed too. `UsageSummary` no longer carries `unpricedProjects` / `pricingAsOf`, plan `actual` no longer carries `unpricedProjects`, and `/users/me/models` no longer returns `pricingAsOf`

## [0.38.0] - 2026-10-08

### Added
- CoBRAC Orchestrator list: a live view of the plans instead of a list of cards next to a form. "Your turn" comes first and gathers, from every plan, what waits on you (rows with a question, awaiting approval, needing a decision or attention, re-plan proposals, plans stopped for a reason other than you, drafts to confirm). Running, paused and drafting plans are shown wide, with the rows done, the current wave, time so far and estimate, cost, a progress bar by wave (the rows being built flow, the current wave is outlined), the rows being built with their stage and time, and the last 4 events. Drafts are cards and finished plans a folded list. While a plan is live the list updates itself every 15 s (5 s while drafting), and "Live" shows by the title
- `GET /plans` returns a `pulse` for running and paused plans (the newest 12): rows by wave and state, the rows being built and waiting, the newest events with their rows, open proposals, the estimate and what was spent
- Plan page: the rows being built show the stage strip of their project (research → HCD ⇄ FRG → CSV → xlsx), and a running plan shows a beating dot by its status

### Changed
- CoBRAC Orchestrator list: "New plan" opens the form in a panel from the right (Esc or the backdrop closes it); with no plan yet the form stays on the screen
- Plan page: the progress bar is split by wave, the rows being built flow, its widths and the counts animate as rows move on (no motion with "reduce motion")

## [0.37.3] - 2026-10-08

### Changed
- Admin documentation: the CoBRAC harness v2 guide (Japanese and English) now says plainly which actor reasons and which only runs a procedure. The CoBRAC agent is the only LLM in a BRA run; the worker is a program with no LLM that sends requests, checks the files that come back and decides the next step. New opening sections list every actor with its kind (LLM, program, person, external service), what passes between the worker and the agent in one turn (the request, the end-of-turn JSON, and files), which of them writes and reads each file in each phase, and the three other jobs that use an LLM in separate conversations (explanatory articles, Canon AI review, Orchestrator plans). Three new figures show the actors, one turn, and the phases with the LLM's turns and the worker's steps in separate columns

## [0.37.2] - 2026-10-08

### Changed
- Create screen: the 「仮説モード」 / "Hypothesis mode" checkbox now sits on the input box's bottom row next to the Canon chip, as a chip that turns amber when on, instead of a separate strip below the Run button. Its settings (claims, share limit, note) open as a card under the input box, like the new-Canon card, instead of stretching the input box. On phones the chip shows only the "H" mark

## [0.37.1] - 2026-10-07

### Changed
- Create screen: hypothesis mode is now a checkbox at the bottom of the input box (「仮説モード」 / "Hypothesis mode", unchecked by default) instead of the "Evidence" choice deep in the "v" model menu. Hovering over its "?" explains the mode; checking it shows the claims, the share limit and the optional note as before. What is sent when creating a project is unchanged

## [0.37.0] - 2026-10-07

### Added
- CoBRAC Orchestrator: the plan's settings choose the Orchestrator model and the Agents model separately. The Orchestrator model runs the Orchestrator's own jobs (writing the draft, re-planning after the waves, and the AI review of the rows' pull requests); the Agents model and reasoning effort run the agents that build each row's BRA project. Either left at "default" is resolved when the plan is confirmed; both are shown after confirmation. Plans made earlier keep using one model for both

### Changed
- CoBRAC Orchestrator: the granularity policy is decided by the Orchestrator only. The plan page shows it read-only (the edit field is gone and the API refuses a policy from the owner); the draft writes it, and a policy change from a re-plan applies at once without approval and is listed with the decided proposals as "Applied by the Orchestrator". Proposals to add or remove rows still wait for approval
- Japanese wording of the Orchestrator: 「波」 is now 「バッチ」 (e.g. 「第 1 バッチ」, 「種のバッチ」) and 「能力リスト」 is now 「資料」; in English, "capability lists" are now "source lists". A CSV column named 「バッチ」 or "batch" is read as the wave, as 「波」 still is

## [0.36.2] - 2026-10-07

### Changed
- Admin documentation now includes a comprehensive Japanese/English guide to the current CoBRAC harness v2, covering architecture, current ROI and GN rules, hypotheses, validation, outputs and saved versions. Full prompt sources and reference tables open on demand through “Show details”. The three earlier transition articles are retained in a separate collapsed archive, with their existing URLs and language switches preserved

## [0.36.1] - 2026-10-06

### Changed
- The BRA Planner is now called CoBRAC Orchestrator (「CoBRAC オーケストレーター」 in Japanese; "Orchestrator" / 「オーケストレーター」 on project chips and the plan's back link, where space is tight). The sidebar, page titles, chat notices ("Started by the CoBRAC Orchestrator …"), the pull-request chip help, the user manual and the design documents use the new name in all 10 languages. One unit is still a 「計画」 / "plan"; plans, URLs and stored data are unchanged

## [0.36.0] - 2026-10-06

### Added
- BRA Planner with a Canon (stage 3): a draft plan can choose "None", one of the owner's Canons, or "A new Canon" (created at confirmation with the plan's granularity policy; a name typed just before confirming is saved first and named in the confirmation). Each row's project joins that Canon pinned to its latest rev when it starts; when it is finished it is pushed automatically, and the row waits for approval ("Awaiting approval", with a link to its pull request) and is done only once a person approves the pull request. Nothing is approved automatically
- Rows that are not seeds get an AI review of their pull request automatically once a job slot is free (shown as waiting / running on the row, then "AI reviewed" with a link to the pull request, where the review is shown); it lists findings only, and its cost counts in the plan's cost so far
- When a row's pull request has error conflicts because the Canon moved on after the row started, the project is pinned to the latest rev again and gets the follow-up "Canon rev N に合わせて更新" automatically, then is pushed again; at most 2 times per row, shown on the row. While the row waits for a slot it shows its pull request and "Waiting to update to match the Canon"; a pull request approved or rejected in the Canon meanwhile marks the row done or sends it to "Your decision" instead, and no update is sent
- "Your decision" rows: conflicts that remain after 2 updates or are not caused by the Canon moving on, a rejected or withdrawn pull request, a project in another Canon, or a push that failed put the row under "Your decision" with the reason; the owner can mark it done, push it again or skip it; approving the row's pull request in the Canon also marks it done
- Seed rows of a plan with a Canon are built one at a time, and neither the next seed nor the later waves start until a person has approved each seed's pull request (the plan page says so, with a link; also when a seed row needs a decision, with a link to the row); in automatic order the re-plan after a wave runs once that wave's pull requests are approved; no new wave starts while 20 of the plan's pull requests await approval (the plan page says so too)
- A plan whose Canon is deleted pauses with the reason shown instead of starting rows that could not join it; its rows awaiting approval and finished rows that would be pushed go to "Your decision"
- Rows with an existing finished project in no Canon are pushed to the plan's Canon when their wave comes (after the seeds), without being rebuilt
- "Approve selected" on the Canon page: reviewers (the owner and co-editors) tick open pull requests without conflicts or items to review and approve them in one go, one after another, each checked against the Canon as the previous approval left it; it stops at the first one that gains a conflict (or is already decided or gone) and says how many were approved and why it stopped (an unexpected error also stops it there, keeping the approvals made so far). The approver is recorded on each pull request and rev as for a single approval
- Pull requests pushed by a plan show the plan's ID on the Canon's list of pull requests and on the pull request page, with a link to the plan for the Canon's owner; the plan list shows how many rows await approval or a decision

### Changed
- In a plan with a Canon a row counts as done only once its pull request is approved (or the owner marks it done), so such a plan completes only when every row's pull request has been approved or the row was resolved or skipped. Cancelling a plan leaves rows that await approval or a decision, and their pull requests, as they are. Skipping a row now also works for rows awaiting a decision
- The AI reviews and Canon updates a plan starts are ordinary jobs: each takes one slot under the concurrency limits, is never queued ahead of a free slot, runs on the owner's key or the default API key, and its cost is recorded

## [0.35.0] - 2026-10-06

### Added
- BRA Planner drafts (stage 2): "Create draft" on the new-plan form, or on a draft plan, has a planning job write the plan from its goal and capability lists: the rows (ROI × TLF with a rationale; every item of a list, about 8–15 rows for a broad goal such as "a full set of BRAs for language"), each row's anchors (the SABRA units of its ROI and of its main input and output regions, looked up in RCS), which rows build on which, and one granularity policy. Rows already in the plan are kept with their ROI and TLF. While the plan is drafting its rows cannot be edited, the page shows whether the job waits for a free slot, is about to start or runs, with the time so far, and "Cancel draft" stops it. The job usually takes a few minutes and is stopped after 7 minutes (25 minutes for a draft that reads xlsx / PDF lists or covers more than 20 rows); a failed draft says why
- Capability lists can be attached as files when a plan is created (up to 10): CSV, TSV and text files are read into rows at once (rows that cannot be read are listed with the file name, row number and reason), xlsx and PDF files are read by the draft, which lists every item it could not turn into a row with the file, the place and the reason. Other file types are refused
- Only what refers to the plan is taken from a draft: rows, anchors, dependencies and existing projects that do not exist are left out (and counted on the page), as are anchors RCS does not know or that name a region SABRA covers with BNA through a HOMBA ID; the owner's priorities are never overwritten by a draft
- Computed build order: "Order automatically" (and every new draft) puts the rows that share anchors with the most other rows (at most 3) into a seed wave, built first and one at a time, then places each other row in the earliest wave after the rows it depends on that has room within the concurrency and holds no row sharing 2 or more anchors with it. Rows show a "Seed" chip, their anchors, how many rows share an anchor with them, the rows they overlap with and the rows they depend on
- Existing projects: a row with the same ROI × TLF as a finished project of the owner is marked "Existing", links to it, is listed in the last wave and is not built (it is marked done at confirmation, after checking that the project still exists and is finished, and left out of the estimate) unless "Rebuild" is ticked; the "Rebuild" choice stays on the row, also through a new draft; a row matching a project that is not finished shows a warning with a link
- Re-planning after each wave (plans in automatic order): the rows that have not started are ordered again using the anchors the finished projects actually used, and a short planning job (after the first wave, then each time a tenth of the rows have finished; about 10 per plan at most) may propose adding a row, removing a row that has not started, or changing the granularity policy, each with a reason. Nothing changes until the owner presses "Accept"; "Reject" discards the proposal, and a removal whose row has started in the meantime can no longer be accepted. Decided proposals are kept under the history
- The plan's granularity policy is shown on the plan page: editable in a draft, read-only after confirmation (it then changes only through an accepted proposal)

### Changed
- Planning jobs (drafts and re-plans) are billed like any job: each takes one slot under the concurrency limits while it waits or runs, is never queued ahead of a free slot, runs on the owner's key or the default API key, and its cost is recorded. The plan page counts them in the cost so far and shows them on their own line, and they appear in the owner's usage totals
- The plan estimate counts seed rows one at a time, each as a wave of its own, and leaves out rows done by an existing project; a seed row moved by hand into a wave with other rows is no longer counted as a seed
- Saving rows after adding, removing or moving rows or changing a wave keeps the owner's waves (manual order, not re-ordered after waves), while saving only a rationale, ROI, TLF or "Rebuild" keeps the automatic order (re-ordering when "Rebuild" changed); rows imported into a draft in automatic order are ordered automatically with the others, and confirming a plan in automatic order orders it once more with the concurrency limits in force

### Fixed
- Editing a plan's rows in one tab while confirming it in another could leave a running plan whose rows had changed after confirmation. Saving or importing rows, changing the settings or the policy, confirming, asking for or cancelling a draft, ordering and deciding proposals now wait briefly for the plan to be free and check its state again; while another change or the runner still holds it the request is refused with a message to try again shortly, and nothing changes
- Wave headings on the plan page show the wave's own number instead of its position in the list
- Release notes: the changes of 0.34.0 (the hypothesis-mode screens, graph marks, badge, graph data and manual) were listed under 0.33.0 and 0.34.0 was empty; each version now lists its own changes

## [0.34.0] - 2026-10-06

### Added
- Screens for hypothesis mode. On the create screen, the "v" menu has "Evidence": "Literature-supported only" (the default) or "Allow hypotheses" with the claims, the share limit and an optional note. A completed project's Agent panel has the switch "Allow hypotheses with this instruction" (off by default and after every send) with the claims, the target (the whole HCD, or the circuits and GNs selected in the HCD or FRG graph) and the limit
- The HCD graph marks hypotheses without changing how signs are drawn: a hypothesis connection is dotted with an "H" in the middle, a connection whose direction alone is a hypothesis ends in a hollow arrowhead, and a hypothesis UC has a dotted border and an "H". The legend explains them, and "Hide hypotheses" in the toolbar shows the evidence-only graph. In the FRG graph, GNs that depend on hypotheses carry an "H" that names them (for example H2, H5). The detail panel shows each hypothesis's basis, claims, rationale and premise papers
- Projects in hypothesis mode carry a "Hypothesis mode" badge with their number of hypotheses in the header and the project list. The versions tab shows the evidence mode, the scopes and, for connections and UCs, the hypotheses against all elements and the limit; its BRA-DB section disables registering a version with hypotheses and says why. Canon pull requests show how many hypotheses were kept out of the shared layer
- The graph data of hypothesis-mode projects marks the hypotheses of UCs and connections (IDs, basis, rationale, premises) and the GNs that depend on them
- The user manual (Japanese and English) has a section on hypothesis mode

## [0.33.0] - 2026-10-06

### Added
- Hypothesis mode can be switched on through the API (the screens follow in the next stage): creating a project with "Allow hypotheses" stores the claims allowed on the whole HCD (scope S1), the share limit (10, 20, 30 or 50%; 20% when not given) and an optional one-line note, and a follow-up can add a scope of its own (the whole HCD, or chosen circuits and GNs), also to a project that used literature-supported evidence only. The job and its scope are saved together; a follow-up's text alone never allows hypotheses. The agent's follow-up prompt names the scope it added
- A project whose result has no hypotheses goes back to literature-supported evidence only after the job completes
- Saved versions record the evidence mode, the scopes, the share limit and how many connections and UCs are hypotheses; copies of a public project keep its evidence mode, scopes and limit

### Changed
- A version that contains hypotheses cannot be registered in BRA-DB for now ("仮説を含む版は、いまは BRA-DB に登録できません"); versions without hypotheses, and versions saved before, register as before
- Pushing a project into a Canon keeps its hypotheses out of the Canon's shared layer: hypothetical connections and populations stay in the project's role layer, a hypothesized transmitter or modulation is left empty there, and the pull request reports how many hypotheses were kept out. Other projects of the Canon never receive them as definitions to follow
- The agent of a project that does not allow hypotheses is no longer shown the `hypothesis` key in its data-file schemas (as before hypothesis mode), which avoids needless fix turns

## [0.32.0] - 2026-10-06

### Added
- The checks, exports and agent instructions for projects that allow hypotheses ("Allow hypotheses"). Such a project may include connections and UCs, or their direction, sign, population, transmitter, modulation or role, that no paper states directly, but only inside the scopes the user chose, and each is marked as a hypothesis with the kind of reasoning behind it, a rationale and at least one premise paper with a DOI or PMID, which is verified and quoted like any reference. Everything else (references, quotes, naming, interfaces, the FRG) is checked as before, and nothing proposes further investigations
  - The CSV and xlsx files mark each hypothesis without new columns: its Comments start with `Hypothesis (<claims>; <basis>): <rationale>`, an assumed connection has Measurement method `Hypothetical`, an assumed population Source of ID `makeshift`, and a GN of the FRG that relies on hypotheses ends its Comments with `Depends on hypotheses: H2, H5`
  - The hypotheses are numbered (H1, H2, …) and listed in `hypotheses.json` with their share, and the report gets a "Hypotheses" section with every one of them. At most 20% of the connections and 20% of the UCs may be hypotheses (or 10, 30 or 50%, as set for the project); when no path from the ROI's inputs to its outputs is free of hypothetical connections, the report's limitations state that fact
  - Hypothesis mode cannot be switched on yet. Projects that use literature-supported evidence only (all projects today) are checked and exported exactly as before; the only difference is the message under "Changed"
- The BRA error-code checker (a repository script) reports a connection marked `Hypothetical` whose Comments do not start with the hypothesis line (local code `cobrac:hypothesis-marked`), and counts the quotes of hypotheses, which state the premise, separately under code 274

### Changed
- An agent that writes a hypothesis into a project that does not allow hypotheses is now told that the project uses literature-supported evidence only, and to support the element with a paper or leave it out; when the user asked for hypotheses, the agent says that the instruction must be sent again with "Allow hypotheses" switched on (before: a schema error)

## [0.31.0] - 2026-10-06

### Added
- BRA Planner (stage 1, sidebar "BRA Planner"): put many projects (ROI × TLF) in a plan and let the system build them. A plan's rows come from a capability list (CSV, TSV or text; columns found by name in English or Japanese, or ROI, TLF, rationale in that order) or are typed in; rows that cannot be read are listed with their row number and the reason. In a draft the rows can be edited, reordered and grouped into waves by hand, and the model, reasoning effort and research mode chosen. Nothing is queued before the plan is confirmed
- A confirmed plan runs its rows wave by wave within the concurrency limits: the next wave starts once no row of the current one waits to start or runs. Rows are started only when a slot is free, so no job waits in the queue. A failing row is retried automatically up to 2 times and then needs attention (retry or skip it) while the other rows go on. A plan can be paused (running rows continue, nothing new starts), resumed, and cancelled (running jobs are stopped); resuming never rebuilds finished rows. A plan whose owner can no longer run jobs pauses itself and says why
- Question inbox on the plan page: when an agent asks a question only that row waits; the question appears with an answer box, and answering resumes the row
- The plan page shows progress per row state, the current wave, how many rows run at once (with a note that the OpenAI rate limit may be the real ceiling), and the estimated against the actual time and cost
- Projects created by a plan record it and link back to it from their header; their jobs and their versions' generator record it too. Every row of a plan uses the harness rules in force when the plan was confirmed
- Admin page: the overall and per-user concurrency limits can be set from 1 to 16 and apply within a minute, without a deploy (empty uses the deployment value; 17 or more is refused)

### Changed
- The job dispatcher and `GET /config` use the concurrency limits set on the admin page when there are any, otherwise the deployment values as before

## [0.30.3] - 2026-10-05

### Added
- The operator is e-mailed when the SES bounce rate of the account e-mails reaches 5% or the complaint rate 0.1%, and again when it is back to normal, so a rising rate is noticed before SES pauses sending

## [0.30.2] - 2026-10-05

### Fixed
- Deploys no longer fail when Docker Hub rate-limits the build of the worker image ("429 Too Many Requests"): the Node base image is pulled from Amazon ECR Public's mirror of the same official image instead

## [0.30.1] - 2026-10-05

### Removed
- The Tables tab no longer shows the HCD and FRG data files (`uc.json`, `connections.json`, `references.json`, `frg.json`); it shows only the five BRA CSV files, without the "HCD (JSON)" / "FRG (JSON)" / "BRA (CSV)" group labels. The same applies to "View tables" on the Versions tab. The tab now appears once the CSV step has written the CSVs. The JSON files are still used by the agent and still open as the HCD and FRG graphs

## [0.30.0] - 2026-10-05

### Changed
- The account e-mails now come from "CoBRAC Agents" <no-reply@cobrac.site> instead of no-reply@verificationemail.com. They are sent through Amazon SES and signed (DKIM) for cobrac.site, so mail clients show the site's own domain as the sender

## [0.29.0] - 2026-10-05

### Changed
- New projects get a short random ID that is unique across all users, `p` followed by 7 lower-case letters and digits (for example `p7m2q9xa`), instead of `<user key>-<number>`. The ID no longer shows who created the project or how many projects that user has; the owner is kept with the project. New Canons get IDs of the same kind starting with `c` (for example `c4h8w2rk`)
- Projects and Canons created before keep their IDs (`u7m2q9xa-12`, `u7m2q9xa-c1`): their URLs, downloads, version IDs, Canon membership, pull requests, publishing and cloning work as before
- The project list is ordered by creation time, newest first, and pages through all projects instead of stopping at the first 100 in key order
- Public projects and Canons with a new ID show the owner's pseudonymous user key as before
- The example Canon ID in the "send to another Canon" field uses the new form

## [0.28.3] - 2026-10-05

### Fixed
- Admin page on phones and tablets: below 1280px every user and every project is a card with all its controls (role, default-key tier, usage, enable / disable, force stop) instead of a table that had to be scrolled sideways to reach them. On wide screens the user table puts the display name under the e-mail address and wraps long addresses, so the tier, usage, state and buttons are no longer cut off at the right edge
- Canon pull request review on phones: item names in the change list wrap at spaces instead of in the middle of a word ("[Frie / derici, 2011]"); the item links under the checks, the AI review and the history show their whole name instead of cutting it off; the "N conflicts still need a decision" link in the bottom bar, the AI review's "Use" buttons and the comment field get a full-size tap area; the line with the revisions and the "Guide" link no longer starts a new line with "·"
- Canon page: a long co-editor e-mail address wraps instead of disappearing under the "Co-editor" badge; the label of the "Send a pull request to another Canon" field sits above it, so the example ID is no longer cut off; the back link and the public page link are easier to tap
- The "Default Canon for new projects" select in the settings, the status filter of the project list and the project picker of a Canon are white like the other fields and no longer run their text under the arrow; on touch screens these fields are as tall as the buttons
- The per-model cost table of the project list abbreviates token counts on phones (1.84M) so the cost column is no longer cut off
- Create screen: the Canon chip leaves out the revision on phones, so the Canon name is readable
- Project page: on phones the download, visibility and Canon buttons line up from the left instead of leaving gaps
- The Canon creation form shows the whole example of the granularity policy

## [0.28.2] - 2026-10-05

### Fixed
- Each saved version of the BRA data now records the harness rule set its checks followed (0 for a project created before the rules existed), next to the SABRA boundary: in the version's record and in its BRA-DB registration package, and as "Harness rules" in the Versions tab (in all 10 languages). Versions saved earlier are not changed and show it as unknown

## [0.28.1] - 2026-10-04

### Fixed
- BRA-DB could not reach the internet from its private network, so it never finished setting itself up: the NAT instance's setup ran out of memory on the smallest instance size. The NAT instance is now a t4g.micro with its own setup script, and is replaced when that setup changes. BRA-DB's monthly cost becomes about $34

## [0.28.0] - 2026-10-04

### Added
- The FRG is now built by meeting in the middle. Before the FRG step the worker reads the HCD's ROI-internal connections and lists bottom-up candidates: the pathways from the ROI inputs to its outputs (loops as one block), the separate parts of the circuit, the loops and feedforward triangles of 3–4 UCs, and every connected pair, each with the sign of its connections. The agent first decomposes the TLF without looking at them, then reads what each candidate computes, matches the two and shows the result as a table in the report's FRG section (matched, function without a circuit, circuit without a function, mismatch, and what was done about each). The candidates are recomputed whenever the HCD changes and are kept in the project folder as `frg_candidates.json`. This applies to every project, also to follow-ups of earlier ones
- The HCD graph has a "Motifs" selector when the circuit has loops or feedforward triangles of 3–4 UCs: picking one highlights its UCs and connections and names the GNs built on exactly those UCs, with links to the FRG. A circuit's details list the motifs it belongs to. Projects show it once their graphs are built again (by a run or a follow-up)
- New projects follow two more FRG rules (projects created earlier keep the earlier rules, also in their follow-ups; copies keep the original's rules):
  - A GN's UCs must be connected to each other by connections inside the ROI. An FRG whose GN groups unconnected UCs goes back to the agent, which either regroups them or adds a connection the literature reports. For these projects the HCD ↔ FRG consistency record no longer has X4 (UCs of a GN not connected), which the FRG check now enforces
  - A GN may hold 3 or 4 UCs when they form a circuit that pairs cannot express (a loop, a feedforward triangle, or a convergence the literature describes as one computation); the agent writes why in the GN's motif note, which the FRG sheet shows in the GN's comments. Without the note a GN still holds at most 2 UCs, and 5 or more is never accepted

### Changed
- The HCD ↔ FRG consistency record counts the GNs of 3–4 UCs and how many of them are a loop or feedforward triangle of the candidates
- When the agent goes back from the FRG to the HCD to split or add UCs, the FRG instructions remind it to list new ROI-internal UCs under their ROI element and to keep the ROI's side (projects with the ROI rules of 0.25.0)

## [0.27.0] - 2026-10-04

### Added
- BRA-DB on AWS: a BRA-DB (PostgreSQL 17 + Apache AGE 1.7, schema v4.6) of its own, reachable only from inside its network. It runs on a small EC2 instance in a private subnet, keeps its data on a separate encrypted volume with daily snapshots, and keeps its passwords in Secrets Manager; nothing on the internet can connect to it. It adds about $30 a month
- Registering a saved version in BRA-DB from the Versions tab ("Register v<n> in BRA-DB"). Registration does what BRA-DB's import script v3.10 does (the five sheets into BRA-DB's tables and graph, in one transaction with an integrity check), from the version's internal package. BRA-DB records the version ID (`<project ID>@v<n>`), parent, content hash, app version and who registered it for every attempt, so each project in BRA-DB can be traced back to the exact saved version. The box shows which version BRA-DB holds and this version's registrations

### Changed
- Registering a newer version keeps BRA-DB's history: the project keeps its BRA-DB key, each registration adds an import log entry, node history continues (a changed node gets the next version number), and the registration role cannot delete history. Registering the same content again changes nothing; fewer circuits or connections than BRA-DB holds needs the owner's confirmation; a project with review comments in BRA-DB is no longer replaced

## [0.26.0] - 2026-10-04

### Added
- Versions of the BRA data. Each time a run, follow-up or retry finishes, its result is kept as a version (v1, v2, …; the number is the project's revision, so earlier references such as a clone's "revision n" or a Canon's project revision now name a version) that is never changed or deleted: a copy of the data, checks, notes, both xlsx files and the graphs, with a record of how it was made (app version and commit, prompts and schemas, model, reasoning effort, research mode, Canon revision, SABRA boundary), a hash of the five CSVs, its parent version and how many rows changed
- A "Versions" tab on the project page: the list of versions with date, model, follow-up instruction and change counts; for each version its details, its tables, and the rows added, removed or changed compared with any other version. The header shows the current version
- A BRA-DB registration package for each version: the five CSVs under the file names the BRA-DB import script reads and a manifest with the version ID (`<project ID>@v<n>`), the parent version, the content hash, the provenance and how to import it (replace, allow shrinking). It is kept with the version for registering in BRA-DB and is not offered for download

### Changed
- Projects finished before versions existed keep working: their current data is shown as the current version ("Not saved yet"), and the next follow-up saves it as that version before it changes anything

### Fixed
- On a phone, the open tab of the project page stays in view after the outputs load (the last tab could be left cut off at the edge)

## [0.25.0] - 2026-10-04

### Added
- New projects follow three more HCD rules (projects created earlier are checked as before, also in their follow-ups; copies keep the original's rules):
  - Every element of the ROI gets at least one ROI-internal UC of its own. The agent lists the ROI's elements and their UCs in `meta.json` (`roiElements`), and the check sends back an element that shares its only UC with another (for example one UC for both the VWFA and the posterior fusiform gyrus), a ROI-internal UC that belongs to no element, and an ROI that names more regions than it lists
  - An ROI without a side covers both hemispheres. The agent records the side in `meta.json` (`roiSide`, `roiSideSource`) and, when the user gave none, writes in the decision log that it treated the ROI as bilateral; the check sends back an assumed one-sided ROI and, for a bilateral ROI, a one-sided UC without its other-side counterpart (the same rule as the `side` facet of circuit names)
  - A quote that supports several connections between different circuits is shown as a warning in the chat (in all 10 languages) and recorded in `quote_check.json`; it is not sent back to the agent

## [0.24.1] - 2026-10-04

### Fixed
- The usage and cost of a turn that was cut off are now recorded: a turn stopped by a cancel, the research step's 60-minute budget, the 6-hour run-time limit or a worker stop (SIGTERM), and a turn where `codex exec` exited without reporting a failure, are counted from the conversation's session record and added to the job that ran them. Before, such turns were missing from the job's and the project's cost. The next job on the same conversation does not count them again

## [0.24.0] - 2026-10-04

### Changed
- New projects follow the SABRA boundary of 2026-10-04: BNA names the neocortex only, and everything else is a DHBA term. The agent anchors the amygdala, hippocampus (CA1, dentate gyrus, subiculum), entorhinal cortex, olfactory cortex, striatum, nucleus accumbens, pallidum and thalamus on DHBA (for example `HOMBA:10339` / `NAC`, `HOMBA:10341/mol:DRD1+` / `NACs(DRD1+)`, `HOMBA:10297/cell:pyr` / `CA1(pyr)`), and the HCD check sends back any BNA area or group that is not neocortex (BNA labels 211–246, A28/34, TI; `BNAG:Amyg`, `Hipp`, `BG`, `Tha`), as an anchor or as an input / projection value, naming the DHBA term that contains it. The whole parahippocampal gyrus `BNAG:PhG` is sent back too, because it mixes neocortical areas with A28/34 and TI; the message lists its subregions. The whole hippocampus is `HiF`, and a field the source names (CA1, CA3, DG, subiculum) is anchored on its own DHBA term RCS reports the new boundary in its SABRA annotations
- Projects created before this version are unchanged: their BNA anchors for subcortical and hippocampal circuits still load, pass the checks and export as before, follow-ups do not ask to rename them, and copies keep the original's rule. A project that follows a Canon may reuse the Canon's existing names
- The ROI suggestions on the create screen list neocortical Brainnetome areas only
- The circuit-naming article (section 4.3), the design notes and the HCD instructions describe the new boundary; their examples use the DHBA names

## [0.23.0] - 2026-10-04

### Added
- A "User manual" entry in the sidebar for everyone: a short guide to the whole app (what it does, getting started with an account and an API key, creating a project, the project page and the Agent panel, reading the outputs, explanatory articles, Canon basics, publishing and cloning, settings, and troubleshooting), with figures in a wide and a phone layout, a table of contents and links to each heading. It is in Japanese and English for now; other UI languages show the English manual with a note

### Changed
- The "Guide" links next to the "?" tooltips are shown to everyone again and open the matching section of the user manual
- Opening "Docs" without admin rights now leads to the user manual

## [0.22.0] - 2026-10-04

### Added
- A "Release notes" entry in the sidebar for everyone, with a table of contents of the versions. The version label at the bottom of the sidebar opens it too

### Changed
- "Docs" opens on a list of the documents with their number, title and a short description, instead of opening the first document with its table of contents. A document opens with its table of contents and a link back to the list; a document in two languages is listed once and keeps its language switch
- "Docs" is for admins only: the sidebar entry is shown to admins, the page sends anyone else to the start screen, and the documents and their figures are no longer part of the web app. The API serves them to admins only
- The guide links next to the "?" tooltips (research mode, Canons, push, the public library) are shown to admins only, since they open admin documentation

### Removed
- The release notes are no longer listed under "Docs"

## [0.21.0] - 2026-10-04

### Changed
- The account e-mails now say who they are from. The sign-up code, a resent code, the password reset code, the code for a new e-mail address and an admin's invitation each have a subject starting with "[CoBRAC Agents]" and naming the purpose, and the body says what CoBRAC Agents is and that WBAI (the Whole Brain Architecture Initiative) operates it, why the mail was sent, the code and how long it is valid (24 hours; 1 hour for a password reset; 7 days for a temporary password), to ignore it if you did not ask, and the link to https://cobrac.site. They are in the language of the screen when it is Japanese or English, and in both otherwise. The sender address is still Cognito's default `no-reply@verificationemail.com`

## [0.20.1] - 2026-10-04

### Fixed
- Users an admin created in Cognito can now sign in. On the first sign-in with the temporary password from the invitation, the login screen asks for a new password (in all 10 UI languages) and signs in once it is set, instead of stopping with "Additional sign-in step required: CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"

## [0.20.0] - 2026-10-04

### Added
- A review screen for Canon pull requests. The Changes tab draws the Canon and the Canon after approval side by side (added, changed, no longer in the project and conflicting circuits and connections in their own colours; click one to open it) and lists the changes by kind with filters; a row opens the Canon's and the incoming value field by field, its findings and its comments. Phones show one graph at a time and the list in one column
- System checks on every pull request, grouped as IDs, duplicates and conflicts, connections, evidence and provenance, each with the code of WBAI's BRA Error code List (Master) or a local `cobrac:` code: UC Descriptor syntax, Circuit ID characters and form, circuits that may duplicate an entry under another descriptor, existing entries on the same anchor, undefined connection ends, connections that run the other way than the Canon's for the same paper, opposite excitatory / inhibitory signs, missing or unknown Reference IDs, connections without quote or figure, unverified quotes and references, a Canon or source that moved on since the push, a source that left or was deleted, affected projects and what the project no longer uses. They do not block approval; the conflict rules still do
- An AI review on the pull request page: the Canon's owner or a co-editor picks a model and a language, and the model reads the same material (diff, conflicts, checks, both sides of each changed item, references) and returns a summary, flagged inconsistencies with reasons and links to the items and papers, points to verify and draft comments. With the default API key only the models the owner may use are offered. It runs on the worker without web search, never recommends approving or rejecting, and anything pointing at items or papers that are not in the pull request is removed. Its cost counts in the owner's usage and in the default-key usage
- Comments on a pull request or on one of its items (the Canon's owner and the sender), and "Request changes" with a required note, which keeps the pull request open until it is pushed again. Approving takes an optional note; rejecting still needs one
- Co-editors for Canons: the owner adds a person by the e-mail address they signed up with (and can remove them; a co-editor can leave). Co-editors find the Canon under "Shared with you" and can review its pull requests like the owner: comment, run AI reviews on their own key, request changes, approve and reject. One approval is enough. Settings, member projects, visibility, co-editors and deletion stay with the owner
- Who decided is shown everywhere: the pull request page has a banner with who approved, rejected or requested changes, when and with which note; the history names every actor; and the Canon's revision list shows who approved each revision
- A history on every pull request: pushes, replacements, re-judging against a newer revision, comments, change requests, AI reviews, approval (with the revision and the conflict choices), rejection and withdrawal, with who and when. Pull requests made before this version show their push and decision

## [0.19.5] - 2026-10-03

### Changed
- Users on the default API key no longer see their approval level anywhere: the settings status, the note in the model menus, the tooltips and the error for a model they cannot use (now just "this model is not available") leave it out. The admin page is unchanged
- Users on the default API key are never offered a model they cannot run. A default model saved earlier shows as "default" in Settings and on the create screen, and the project header shows the model the next job will run. A follow-up, retry or answer on a project made with such a model (for example with their own key) now runs on the default model of the key instead of failing, and the project keeps that model; an explanatory article without a chosen model is written with it too

## [0.19.4] - 2026-10-03

### Changed
- The worker container no longer lets the agent read the OpenAI API key or the task's AWS credentials from another process. The `node`, Codex and `git` binaries are made execute-only in the image, so the worker, Codex and git processes become non-dumpable and their `/proc/<pid>/environ` cannot be read by the agent's commands (which run as the same OS user). The worker's AWS credentials and credentials URI, the RCS token and the NCBI key are also removed from the environment of every process the worker starts, and the agent can no longer edit the Codex configuration to add an MCP server, hook or notify command. Jobs run unchanged. A new `scripts/worker-image-check.sh` builds the image and verifies both the isolation and that Codex turns still run

## [0.19.3] - 2026-10-03

### Changed
- Explanatory articles now follow the format of the documentation explainers (the harness articles): a title with a subtitle, a summary table, numbered sections separated by rules (in short, terms, region and function, circuits and connections, the FRG decomposition, which connections serve which function, certainty and open questions, where the data is), tables for listable facts, numbered figure captions and a table of contents with direct links to every heading. Japanese articles are written in the polite form (です・ます) in a plain explanatory tone
- Articles have figures drawn from the project's BRA data, not by the model: the circuits and every connection between them (inputs, the ROI, outputs; arrows by sign as in the graph view), the FRG tree, and a map of which connections each function's circuits send and receive. Each figure has a one-column version that phones show instead. The model may add up to two figures of its own only where these cannot show a point. Every figure is cleaned of scripts, links and other active content before it is stored and again before it is shown
- The article check also rejects arrows between two circuits that are not a connection of the HCD, node IDs that are not in the FRG and section links that point to no heading, so the article cannot describe connections the data does not have
- Articles written before this version keep rendering as they were

### Added
- A model menu next to the article language: the article can be written with another model of your API key than the project's (default: the project's model). With the default API key the menu lists only the models of your tier, and when the project was made with a model outside the tier the article uses the tier's default model

## [0.19.2] - 2026-10-03

### Added
- A new article on the Documentation page, "BRA generation: speed and cost (v0.17.1–v0.18.2)" (English and Japanese, with a language switch): the investigation that found 88% of a run waiting for the model and the response latency growing with the context length, the three changes of 0.18.0 (compaction at 75k tokens, shorter tool results and smaller edits, fix turns at reasoning effort medium) with the other options considered and why parallel work could save little (the OpenAI TPM limit, the HCD → FRG order), the before/after comparison of three runs each (48.6 → 31.0 minutes, $0.174 → $0.134, median context 80k → 48k) with its caveats (small sample, fewer research candidates, the before runs on two versions), the usage double count fixed in 0.17.1 and the read-time correction of older jobs in 0.18.1 with its limits, and the Spot interruption handling, the 5-minute janitor, and the message language and clone fixes of 0.18.2. It has diagrams of the time breakdown, latency by context length, the changes, the sequential steps and the TPM limit, the before/after numbers, the double count and the interruption recovery, each with a phone layout

## [0.19.1] - 2026-10-03

### Added
- A new article on the Documentation page, "Naming circuits: UC Descriptor, facets and Circuit ID (v0.17.0)" (English and Japanese, with a language switch): why free circuit names could not be matched across projects, the SABRA anchors and how RCS finds them, the nine facet axes (part, lay, cell, nt, mol, in, out, resp, side), the UC Descriptor as the machine key and the Circuit ID as its readable alias with the `( )` and `.` separators and the allowed characters, laterality as the `side` facet and the older forms that are still read, how the Canon keys circuits by the descriptor, the error codes aligned with WBAI's Error code List (Master) including the local `cobrac:` codes, and the points still to settle with WBAI. It has diagrams of the old and new naming, how a Circuit ID is built, how older forms are read and how the Canon uses the descriptor, each with a phone layout

### Fixed
- Code blocks on the Documentation page (for example the API and file layouts in the design specification) showed their text in the same dark colour as the block's background in light mode, so they looked empty. The text is light again

## [0.19.0] - 2026-10-02

### Added
- Collaborators no longer need their own OpenAI API key. On the admin page, an admin registers a default API key (the organization's key) and approves users at Tier 1 (gpt-6-luna and gpt-5.6-luna only) or Tier 2 (every model). Approved users without a key of their own run jobs with the default key; a user who registers a key runs on it instead, without the tier limit. The default key belongs to no user account, is stored encrypted, and after saving only its last 4 characters and the date are shown; admins can replace or delete it
- The admin page shows each user's default-key cost (total and this month) next to the tier. Settings shows an approved user which key their jobs use

### Changed
- Every request that starts a job (new project, follow-up, retry, answer, explanatory article) and every clone checks the tier: a model outside it is refused, and a saved default outside it falls back to gpt-6-luna. The model menus list only the models the user may run. The worker checks the approval again whenever a job starts or resumes, so revoking an approval or deleting the default key takes effect for the next job without stopping a running turn
- New users and existing users without a key start unapproved; nothing changes for users who have their own key

## [0.18.2] - 2026-10-01

### Fixed
- The notices about starting the worker and the messages of the housekeeping job (the worker stopped responding and the job resumes automatically, or it failed; a question left unanswered for 7 days; no worker within 24 hours) were always in Japanese. They now follow the UI language like the other status lines, also on the project's error banner and for messages stored before this fix
- A clone of a public project keeps the original's research-mode setting. Before, every clone ran without research mode, so a follow-up on a clone of a research-mode project did not get the research-mode instructions even though its data came from a research step
- A Fargate Spot interruption no longer throws away the work of the running turn. The worker now saves the workspace and the conversation to S3 every 5 minutes while a turn runs, and at once when the task is told to stop (it gets up to 2 minutes for that). The chat says that the worker is stopping and that the job resumes automatically
- An interrupted job resumes within about 5 minutes instead of 15–30: the worker hands the job back as soon as it is told to stop, and the housekeeping that resumes stalled jobs runs every 5 minutes instead of every 15

## [0.18.1] - 2026-10-01

### Fixed
- Jobs that ran before 0.17.1 no longer show 2–3 times their real token usage and cost. Their stored records stay as they were; the usage and cost are corrected when they are read, from the usage line the job wrote after each turn, and the project list, the project's job table and total, the usage summary, the admin list and the usage lines in the Agent panel show the corrected values

## [0.18.0] - 2026-10-01

### Changed
- BRA data generation should take less time. Production runs spent most of their time waiting for answers to requests with a long conversation behind them (over about 80k tokens a request waited 15–40 s longer), so the agent's conversation is now compacted at 75k tokens instead of 150k. Compaction takes a few seconds, and the project files keep the work
- The literature tools return shorter results: `find_sentences` gives up to 8 matching sentences instead of 15, and searches return 8 hits by default instead of 10. The agent is told to write each file once and then change it with small edits instead of rewriting whole files, to read only the part of a file it needs, to ask RCS for 5 candidates or fewer, and to run independent lookups together
- Fix turns (the validator's problems, research coverage gaps, CSV problems) run at reasoning effort medium, or at the project's effort when it is lower. The research survey, the HCD and FRG turns and the adjustment turn keep the project's effort

## [0.17.1] - 2026-10-01

### Fixed
- The token usage and estimated cost of a job were counted too high, about 2–3 times the real amount for a full run: Codex reports the conversation's running total at the end of every turn, and the worker added that total each time. A turn now adds only the tokens it used itself (the total after the turn minus the total before it, also when the conversation is resumed in a later job). Jobs recorded before this fix keep their old numbers
- A turn that ends in an error now records the tokens it used, so a failed job no longer shows less usage than it had

## [0.17.0] - 2026-10-01

### Fixed
- BRA error codes now follow the WBAI "BRA data: Error code List (Master)" instead of the ontology report's Appendix D, which cites numbers the Master does not have or that mean something else there. A sender that is not uniform is reported as 203 (was 205, which does not exist), and a Collection without Sub-Circuits as 120 (was 128, which in the Master means an out-of-range Uniform value). This applies to the agent's validator feedback, the HCD phase instructions, the Canon conflict "a connection ends on a Collection" in all ten languages, the design specification and the harness article
- Checks CoBRAC needs that have no Master code get a local `cobrac:` code instead of a borrowed number: a UC with Sub-Circuits (`cobrac:uc-no-sub-circuits`, was 129), a Collection that lists itself, forms a cycle or has only `makeshift` members (`cobrac:collection-members`), a Collection as receiver (`cobrac:collection-end`), a UC that is also split into finer UCs (`cobrac:nested-uc`, was cited as 127), a Collection whose Source of ID is not `collection` (`cobrac:collection-source`, was cited as 108)
- The BRA output checker (`scripts/bra-appendix-d.mjs`) reports Master codes: 203, 120, 121, 402 / 403 (node ID prefix and kebab-case, was 415), 424 (U. node without Circuit ID, was 420), 430 (Projected Circuits, was 418), 562 / 563 (Output Semantics, was 430), and splits 252 / 253, 271 / 272 and 277 / 278 as the Master does. It adds 3 (duplicate DOI), 420 (Circuit ID not in Circuits) and 421 (the same Circuit ID on several FRG rows). Duplicate Reference IDs, Circuit ID characters, duplicate node IDs, a GN with a Circuit ID, missing Capability and FRG cycles have no Master code and are `cobrac:` codes. Each result keeps the old Appendix D number as `appendixD` (and the report shows it in its own column), so reports made before can still be compared
- In the HCD / FRG viewer, the two edges of a feedback loop (for example the excitatory A→B and the inhibitory B→A) were drawn exactly on top of each other, so one of them, its arrowhead or square marker, and its label were hidden. Edges between the same two nodes now run on separate lanes: each one keeps to the right-hand side of its own direction, so the forward and return edges always separate the same way, both end markers stay visible, and each edge can be hovered and clicked on its own. This holds for every line type, both layout directions, any zoom, and light and dark mode; several edges in the same direction are spread the same way, and repeated self loops on one node nest instead of overlapping. Labels of such edges sit on their own side and are shortened when they would cover an arrowhead (the full text shows when the edge is selected). Saved layouts and graph data are unchanged; edges with hand-drawn bends keep their route

### Changed
- The FRG phase instructions call the leaves only Uniform Circuits (UCs); the old name "Uniform Components" is gone
- The 10-word minimum for Pointers on literature is documented as Master code 272 rather than as a provisional reviewer rule; the threshold is unchanged
- Laterality is now the ninth facet of the UC Descriptor, `side` (`left` or `right`; leaving it out means both sides, not distinguished), and anchors are always left-right pairs: the left area 4 upper limb is `BNA:57-58/side:left` instead of `BNA:57`. In the Circuit ID the side is the last item and appears only when the descriptor has one: `A4ul(left)`, `A8m(L3.left)`, both sides `A4ul`. The left and the right of one population can now be separate circuits in the same HCD
- Circuit IDs use only the characters of WBAI's interim specification (`A-Z a-z 0-9 . _ ~ -`, with `/` and `+` as agreed on 2026-08-19) plus the parentheses around the items, and the checks enforce it: items are separated by `.` instead of `,` (`MVOcC(V1.L4Ca)`, `NAC(shell.DRD1+)`), and projection and input partners are written `out-` / `in-` (`Amyg(BL.out-CEN)`). Official abbreviations keep their `/` and `+` (`A9/46d`, `V5/MT+`); only spaces become `_` (`TE1.0_and_TE1.2`). The HCD instructions, examples and checks follow the new form
- The BRA output checker's Circuit ID character check (`cobrac:circuit-id-chars`, formerly 104) accepts the same characters as the HCD checks (`A-Z a-z 0-9 . _ ~ - / +` and the parentheses) and reports anything else, such as the `@` and `,` of older IDs
- Projects and Canons written in the older forms (`BNA:57`, `@L` / `@R`, `A4ul@L(L5,pt,out:Sp)`, `NAC(shell,DRD1+)`) are read as they are; stored files are not rewritten. The Canon treats the old and new forms as the same circuit and the same Circuit ID: a project that still has the old forms brings them to the Canon in the new form, the agent's Canon files list the new form, and when a project brings the new form of a circuit the Canon stored in the old form, the pull request shows the rename and the Canon takes the new form. The next follow-up of an older project asks the agent to rewrite its descriptors and Circuit IDs in the new form

### Added
- Dark mode on every screen (create, projects, project workspace with the HCD / FRG viewer, tables, report and articles, docs, Canon, explore, settings, admin and sign-in). It follows the system setting by default; the switch at the bottom of the sidebar (and on the sign-in card) chooses system, light or dark and is remembered in this browser. The page opens in the chosen theme without a light flash
- In dark mode the graphs keep their colour coding: node fills become dark tints of the same hue with light labels, lines and arrowheads are brightened so they stand out from the dark canvas, and the style panel's swatches show the colour as it will be drawn. Saved layouts are unchanged and look the same as before in light mode

### Changed
- The project's right-hand panel is now called "Agent" (「エージェント」) instead of "Chat" in all ten languages, because it shows the agent's run and is where you answer its questions and give follow-up instructions
- The Agent panel reads like a coding agent: the agent's answers are full-width text instead of bubbles, your own prompts are quiet grey blocks labelled request / answer / follow-up, and notices (step done, files ready, usage, errors) are one-line rows with the time. Thoughts and tool calls fold into one activity row with the step count, elapsed time and to-do progress; while the agent works the row is live with the latest step, failed commands are marked red and running ones show a spinner
- A question from the agent is an amber callout at the end of the log; numbered choices in it are buttons that put the choice in the reply box. The composer at the bottom changes with the project: answer the question, give a follow-up instruction after completion, stop while the agent works, or retry after a failure. Enter sends and Shift+Enter adds a line (never while typing with an IME; on touch screens the button sends). When you scroll up, a "new" button brings you back to the latest entry. Explanations moved into the composer's "?"
- Animations in the panel (the shimmering "Working" label, items sliding in, the pulsing question marker, smooth scrolling) are off when the system asks for reduced motion
- The green "BRA xlsx" button is a darker green so its white label reaches 4.5:1 contrast

## [0.15.0] - 2026-10-01

### Changed
- The project's progress display (header and the empty artifact pane) follows the harness as it runs today: research (only in research mode) → HCD ⇄ FRG with the consistency check → CSV → xlsx, instead of HCD / FRG / CSV / xlsx in a row. HCD and FRG sit in one loop with a two-way arrow, because the FRG can go back to split or add HCD UCs and the adjustment turn revises both. The labels stay short; what each stage does (Collections, the X1–X9 check, the two workbooks) is in the "?" next to it. The empty pane now just says that artifacts appear as their steps finish
- While a job runs, the stage it is on animates from the job's real status: the active stage pulses with a spinner, finished stages show a check, later ones stay grey, and the line into the active stage flows. During the research step the research stage is active (the HCD waits); during the HCD ↔ FRG adjustment turn the loop, HCD, FRG and the check animate together. A question pauses the display on that stage, a failed or cancelled job shows where it stopped, and nothing moves when the system asks for reduced motion. The worker now records the live stage of the job (`activeStage`) so the research step and the adjustment turn can be told apart; projects last run by an older worker fall back to the step states
- The chat's run help describes the same order

## [0.14.1] - 2026-10-01

### Fixed
- Jobs on gpt-6-luna and gpt-6-sol no longer show "Model metadata for `gpt-6-luna` not found. Defaulting to fallback metadata" in the chat. The agent runs on Codex 0.159.3 (was 0.154.0), which knows these models, so Codex uses their real settings instead of fallback metadata. The `gpt-5.6` alias, which Codex does not know, now runs as `gpt-5.6-sol`, the model OpenAI routes it to
- Notices from Codex that do not stop the turn (fallback model metadata, falling back from WebSockets to HTTPS, reconnecting, rate-limit pauses) appear in the chat as grey status lines instead of "Error" rows. Real errors are still shown as errors

## [0.14.0] - 2026-10-01

### Changed
- The create screen is rebuilt around its two inputs. ROI and TLF sit in one composer, one above the other and joined by "×", instead of two boxes among form sections. While they are empty they show a rotating example pair (cerebellum × VOR adaptation, V1 × orientation selectivity, hippocampus × spatial memory, basal ganglia × action selection, the language areas × nonword reading, amygdala × fear conditioning and more, in every UI language); the rotation pauses while a field is focused or has text and stays still when the system asks for reduced motion, and "Use example" fills both fields. Enter moves from ROI to TLF and runs from TLF, Shift+Enter adds a line (on touch screens Enter in TLF adds a line)
- Typing a Brainnetome abbreviation or English area name in the ROI (for example "A44" or "hippocampus") suggests matching BNA areas; choosing one writes the area with its BNA label pair
- Reference materials moved behind a "+" button in the composer (add files or a URL); attached items show as small chips with upload progress, and files can be dropped anywhere on the composer
- Model, reasoning effort and research mode moved into a compact "v" menu at the bottom right; the button shows the model that will run and a book icon while research mode is on
- The Canon choice is a button in the composer that opens a searchable list (none, your Canons with their rev and project count, the default Canon marked, or a new Canon from projects); the button shows the chosen Canon's name and rev. A new Canon is set up in a panel under the composer, where the chosen projects are numbered in priority order and can be reordered or removed

## [0.13.1] - 2026-09-29

### Added
- A new article on the Documentation page, "CoBRAC harness v1.1 → v2" (English and Japanese, with a language switch): how the harness stopped being one-way — the HCD ↔ FRG consistency checks X1–X9, the adjustment turn, going back from the FRG to split or add HCD UCs, the revisions log and the re-validation of a changed HCD — and what else it gained since v1.1: the research step and literature tools, reference and quote checks, BRA spec compliance, Collections, the Template-v2-2 workbook, Canon constraints, reference materials and the handling of rate limits and oversized conversations. It has before / after diagrams of the pipeline, the language-area results (v0, 0.11.0 and the back-edge trial) and the points still open. The design spec now calls the harness v2 from app 0.13.0

## [0.13.0] - 2026-09-29

### Added
- A user guide "Research mode and Canons" (English and Japanese) on the Documentation page: what research mode does, what a Canon is, choosing or seeding a Canon on the create screen, how a Canon constrains generation, revisions and updates, push and pull requests, the public library and cloning. The create, Canon, pull request and public library screens link to it ("Guide")
- A "?" next to labels shows their explanation: on hover and keyboard focus on desktop, on tap on phones; Escape or a tap elsewhere closes it, and screen readers read it with the button

### Changed
- The agent splits a region into Collections whenever it is anatomically or functionally heterogeneous at the chosen granularity — e.g. a whole gyrus with several distinct areas, or parts that are different projection sources — without needing layer or cell-type evidence; the parts must be named and the split justified (a Collection's comment is now required). A parent Collection stays a recommendation
- A sender that spans several SABRA units (a whole gyrus / BNA group or several anchors) goes back to the agent unless it is split into its parts or its `uniformityNote` explains why this project treats it as one population; the note is written into the Circuits comments. A gyrus and one of its areas can no longer both be UCs
- The literature survey also looks for which part of a large region sends or receives each projection
- When the FRG cannot be built from the HCD as it is, the agent may now go back and split or add HCD UCs (backed by the literature) instead of only reshaping the FRG. When the HCD ↔ FRG check finds a collapsed FRG (the TLF directly on UCs, a single group node, fewer than three ROI-internal UCs) or interfaces that disagree with the connections or the ROI tags, the harness asks the agent for one adjustment turn after the FRG step. The agent records each change and its reason under "HCD-FRG revisions" in the decision log, and `cross_check.json` keeps the findings that triggered the turn and the counts of recorded revisions
- The HCD ↔ FRG record also notes ROI-internal UCs that are a whole gyrus-level BNA group or span several SABRA units (a hint that the HCD may be too coarse; recorded only), and the decision log's revisions section has an `[instruction]` tag for changes a follow-up instruction asked for, so that they are counted apart from changes one graph required of the other
- Screens show short labels; the explanations moved behind "?" or into the guide: research mode (the label is just "Research mode", with the time and cost estimate on one line), reference materials, the Run button, the Canon section of the create screen, the Canon list, empty Canon contents, pushing to a Canon, sending a pull request to another Canon, the project's Canon badge (update vs align), the public library and cloning, and the settings (API key, Contributor, default model)
- Clearer wording in all languages: the Canon choice on the create screen reads "None / An existing Canon / A new Canon from existing projects", seeds are "projects to start from (top first)", conflicts between them are settled with "higher-priority project / this project", the badge says "newer revision / Update to latest / Align with Canon", and the Japanese screens say "PR" instead of "取り込み依頼"
- Every Canon now works the same way: conflicts with the Canon (Uniform vs Collection, a different decomposition, a finer circuit next to a Uniform one, Circuit ID ↔ descriptor, connections ending on a Collection, official names, Reference IDs) always go back to the agent to fix. The "constraint strength" choice (strict / advisory) is gone from the create and edit forms; Canons created as advisory, including existing ones, now behave the same, and a mode sent by an older client is ignored. The chat notice that a run follows a Canon no longer names a strength

### Fixed
- The chat notice that a run follows a Canon showed "rev {revision}" instead of the revision number (also for notices already stored); it no longer mentions a constraint strength
- A clone of a project that was running or had failed kept its steps spinning as "running"; copied steps are now done or pending
- Pull requests listed connections and BIF entries with doubled brackets ("[[Catani, 2005]]")
- After approving, rejecting or withdrawing a pull request, the result message at the top of the page was out of view; the page now scrolls up to it
- On the create screen, the seed order of "Create a new Canon from existing projects" overlapped the preview; seeds and preview are now stacked

## [0.12.1] - 2026-09-29

### Fixed
- Long projects no longer fail with "Codex Exec exited with code 1" once their conversation outgrows the OpenAI tokens-per-minute limit of the model (a single request above 200k tokens for gpt-6-luna is refused however long one waits, so follow-ups and retries of such a project failed every time). Codex now compacts the conversation before it reaches that size, and a turn that is still refused as too large continues in a new conversation from the project files instead of failing the job; the chat says so

## [0.12.0] - 2026-09-29

### Added
- The create screen accepts reference materials: up to 10 files (PDF, images, text, CSV / JSON, Word / Excel / PowerPoint; 20 MB each, 50 MB in total) and up to 20 URLs. Files upload straight to the project's storage while you fill in the form, with progress; drag and drop works on desktop and the file picker on phones
- The agent gets the materials as inputs: the files, text extracted from PDFs and Office files, and the content of each URL (fetched once when the project starts) are listed in `materials/INDEX.md`, and images are shown to it with the first prompt. It is told to consult them, but they do not replace verified literature: references still need published sources checked against Crossref / PubMed, and quotes must be verbatim from those sources
- The project page lists the attached materials (under the ROI / TLF line; "Details" on phones): files download under their original names, URLs open in a new tab
- After the FRG and CSV steps, the harness records how well the HCD and the FRG agree in `cross_check.json`: whether each group node's interface matches the connections of its UCs (flows left out or claimed without a connection), whether the ROI's inputs and outputs match the `noROI` tags, whether the two UCs of a group node are connected, whether every ROI-internal UC is mentioned by the group node it belongs to, and whether the FRG has collapsed (the TLF directly on UCs, a single group node, fewer than three ROI-internal UCs). For now this is only recorded and shown as counts in the chat; the agent is not asked to fix it
- A script measures the same consistency on finished projects copied from the artifacts bucket (read-only), including projects from before v0.8 through their CSVs
- A script (`scripts/bra-appendix-d.mjs`) checks a BRA xlsx or CSV folder, including the Template-v2-2 workbook, against the error codes of the ontology's Appendix D and names how CoBRAC guards each code
- Canons (provisional name): a new "Canon" page lists your Canons, sets of your projects whose circuit definitions are to agree. You can create one with a name, description, granularity policy and constraint strength, edit or delete it, and add or remove your projects (a project belongs to at most one Canon). The project header shows the Canon a project is in. This first stage is the container only; Canons are private and stay empty until pushing project definitions arrives
- Public projects and Canons: the project header and the Canon page have a Private / Public switch (private by default, confirmation before publishing). The new "Public library" lists everything public; anyone signed in can read a public project (circuit list, report) or Canon, and clone a public project into a new private project of their own without asking. A clone copies the data (not the chat, cost or BRA xlsx, which a follow-up rebuilds), keeps the original Contributor and shows where it came from; the original is never changed and its owner only sees the clone count. A public Canon can switch off pull requests from other users
- Push to Canon: a completed member project has "Push to Canon" in its header. It previews how the project's circuits, decompositions, connections and references compare with the Canon, then opens a pull request. The Canon page lists pull requests and the Canon's current contents and history. On a pull request the owner sees errors (e.g. the same area Uniform in the Canon but a Collection in the project, a connection ending on a Collection, a reference that failed its check), warnings with "keep the Canon's value / take the incoming one", the other projects affected and the changes; approving creates the next Canon revision, rejecting needs a reason
- Canon → Canon pull requests: the Canon page has "Send to another Canon". It proposes the Canon's latest revision to one of your other Canons or to someone else's public Canon (by its Canon ID); the receiving owner reviews it like a project push. The sender sees the state of what it sent and can withdraw it
- Canon definitions during generation: a member project follows one Canon revision (the header shows it, e.g. "rev 2 (latest 3)"). Every run gives the agent that revision in a read-only `canon/` folder and tells it to reuse the Canon's circuits, Collections and records; with strict constraints the validator sends conflicts (e.g. a Canon Collection used as a UC) back as problems, with advisory constraints they are shown as notes. References and quotes the Canon already checked are not checked again. "Update to latest" moves the pin; when a newer revision changes circuits the project uses, "Align with Canon" runs a follow-up that applies it
- Canon on the create screen: choose "not in a Canon", an existing Canon, or "create a new Canon from existing projects". For a new Canon you pick completed projects in priority order; a preview shows how they fit together, and for each conflict you keep the earlier project's value or take the later one, or keep that project as a pull request, or leave it out. The first run of the new project already follows the Canon. The settings page has a default Canon for new projects

### Changed
- HCD and FRG graph nodes show only the Circuit ID, without the small, usually truncated full name under it, and are shorter. The full name appears in a tooltip on hover, in the search results and, unabridged, in the detail panel of the selected node
- The create screen no longer has project-name and Contributor fields. The project starts with the provisional name from ROI / TLF, which the agent replaces with its own name (rename it on the project page as before), and the Contributor is the one in your account settings

### Fixed
- The agent's literature tools no longer fail on the first hiccup of Europe PMC or PubMed: requests that time out or get HTTP 429 / 5xx are retried with backoff, parallel calls are spaced out instead of reaching the service at once, and a service that keeps failing is skipped for a few minutes. In a production run (2026-09-29) Europe PMC answered 502 / 503 or timed out, and every "sentences from the full text" call, 11 of 28 Europe PMC searches and 6 of 27 abstract lookups failed
- While Europe PMC is down, abstracts and full-text sentences still come back: the record and abstract are taken from PubMed and the open-access full text from PMC (NCBI BioC); the answer notes which service failed. A search that still fails says which service is down and suggests the other search tool
- Sentences are also read from author manuscripts that Europe PMC and PMC show in full (before, only papers flagged open access were read in full)
- A job no longer fails when OpenAI briefly rate-limits it (tokens per minute): Codex's own "Reconnecting…" retries are shown as status lines instead of ending the job after the turn has finished, and a turn that still fails on a rate limit is resumed on the same thread after a pause (up to 3 times)
- The search log (`research_queries.jsonl`) records the error text of failed literature tool calls
- HCD files that the agent changes during the FRG or CSV step (and FRG files changed during CSV) are validated again, including the reference and quote checks; new problems go back to the agent in the same fix round. Before, those changes reached the CSVs and the xlsx unchecked. Problems already left when the HCD step was accepted are not sent again

## [0.11.0] - 2026-09-29

### Added
- Collection Circuits: the agent records the circuits its HCD splits into finer UCs (e.g. a cortical area split into layer and cell-type UCs) under `collections` in `uc.json`. They become Circuits rows with Uniform = FALSE, Sub-Circuits and Source of ID `collection`; the ROI row lists them too. Whether a circuit is Uniform is decided per project, so the same area may be a UC in one project and a Collection in another
- The harness checks Collections and sends problems back to the agent: members must be circuits of the project, no cycles, not all makeshift; a Collection is neither sender nor receiver of a connection (the feedback names its UCs) and is not an FRG leaf; a UC that the HCD also splits into finer UCs has to become a Collection
- The HCD graph draws each Collection as a dashed box around its UCs (nested boxes for nested Collections; "Show Collections" in the menu hides them). Clicking a box label shows its Sub-Circuits, and a UC's details list the Collections it belongs to. The table view shows them as the `collections` sheet of `uc.json`
- The harness checks that each connection's Pointers on literature really is in the cited paper: it reads the paper's open-access full text (Europe PMC, or PMC through NCBI BioC) or, without one, its abstract (Europe PMC, PubMed, Crossref or Semantic Scholar) by DOI / PMID, and compares the quote ignoring spacing, punctuation, hyphenation, ligatures, typographic quotes and citation markers, tolerating small OCR-like differences. A quote that is not in the full text goes back to the agent with the closest passage and a link to the paper. Each result (found in full text, found in abstract, not found, unverified) is kept in `quote_check.json`, and the chat shows a summary when the HCD is accepted. Papers without an open-access full text, and outages of these services, leave the quote "unverified" without holding up the phase
- Research mode, on by default when creating a project (a checkbox on the create screen turns it off). Before the HCD the agent runs a research step: it plans a literature survey and, for each candidate projection, searches PubMed / Europe PMC and the web for tract-tracing, primate and rodent, and layer / cell-type evidence, reads the abstracts or open-access full texts, and records queries, evidence and gaps in `research.json`. The worker checks that every listed query was actually run and that the coverage agrees with the evidence, and sends gaps back up to twice. The step has a 60-minute budget and runs at reasoning effort high or more; gaps or the budget never stop the run
- New literature tools for the agent in every run (with or without research mode): PubMed and Europe PMC search, abstracts, and sentences from open-access full texts that contain given terms, so PMIDs and verbatim quotes come from the source
- Each job records its literature searches by tool, and a research step records its duration, turns, spend, token usage and searches (shown in the chat's summary line and kept with the project) to check real runs
- The create screen shows the estimated extra time and cost of research mode for the selected model; the project header and the chat show whether research mode is on. The setting is chosen at creation and kept for the project
- A second download, "BRA xlsx (Template-v2-2)", next to "BRA xlsx" in the project header: the same BRA data written into the official Template-v2-2.bra workbook of the BRA Data Preparation Manual, as `{name}_{ID}.template-v2-2.bra.xlsx`. The template's sheets, headers, formulas, AdminOnly lists, validation and WholeBIF rows are kept; only the contributor columns are filled, and rows are inserted above the WholeBIF rows when a sheet needs more than the template's input area. Every job produces it; for projects finished earlier the first click builds it
- In that workbook, References get a BibTeX entry built from the Crossref / PubMed record of each DOI / PMID (read by the template's own formulas for the Reference ID, authors, title and journal), Reference IDs take the template's `Author, Year` form, and Circuits anchored on a DHBA term get its DHBA graph_order, name and Lv.2–14 levels (UCs finer than a DHBA term get its graph_order with a decimal; BNA areas have no DHBA hierarchy and stay empty)

### Changed
- The agent is told to quote only text it has retrieved in the run, copied character for character, and preferably from open-access full text or the abstract so that the quote can be checked
- In research mode, the HCD, FRG and follow-up instructions tell the agent to build connections from the survey (tract-tracing evidence first, weak evidence flagged, cell-type / layer UCs where the evidence supports them), to look for computational models in the FRG, and to research what a follow-up adds. Follow-ups and retries keep the project's setting; projects created earlier run without research mode. The validators are unchanged

## [0.10.0] - 2026-09-29

### Added
- References carry a Literature type (the 11 BRA values) and, for a document without DOI, an Alternative URL; the xlsx References sheet has both columns. A reference with neither DOI, PMID nor URL goes back to the agent. With a PMID the PubMed page is written as Alternative URL
- The Circuits sheet starts with the ROI row (`ROI_<Project ID>`, Uniform = FALSE, Sub-Circuits = every ROI-internal UC), which the BRA format requires; the graphs do not show it
- The Project sheet has the Review End Line of each sheet filled in, so the BRA Review Tool reviews every record
- FRG group nodes get their Output Semantics: the items of their UCs that send output outside the group. Rows of UCs outside the ROI get the BRA fixed text "No need for description due to input/output circuit"

### Changed
- Pointers on literature is a sentence quoted verbatim from the cited paper (at least 10 words for now; the threshold is a provisional setting), not a page or section; Pointers on figure is a figure number, written as `Fig. 3B`. At least one of the two is required. The agent is told to quote only text it has read
- Source of ID is one value — `DHBA` for a UC that is a whole DHBA term, `BNA` for a whole Brainnetome area, one defining paper (or `makeshift`) for a finer UC — instead of a list of supporting papers. `BNA` is a CoBRAC extension of the BRA list, pending a request to add it upstream
- Connections record how each UC relates to the circuit the paper reports: sCID / rCID relation (`<` when the paper reports a coarser unit that contains the UC, `>` for a finer unit, `=` for the same) and the paper's own name for it in the Notation columns, instead of always `=` and a copy of the Circuit ID
- Each connection cites one paper: the same sender → receiver is recorded once per paper, with that paper's species, method and pointers. The HCD graph still draws one edge and lists every paper on it
- Taxon, Measurement method, Transmitter, Modulation Type and Literature type must be values of the BRA template lists (e.g. `Macaque`, `Anterograde tracing`); details go in the comment
- Output Semantics of a UC is checked to be exactly one item `[<its Circuit ID>] content;`
- Circuit names start with the SABRA official name (BNA area name or DHBA name) followed by synonyms, and the agent refers to tissue as `[U.<Circuit ID>]` in function descriptions and the report; references to unknown UCs or FRG nodes go back to the agent
- The xlsx Capability&Mechanism cell no longer ends with the CoBRAC-only tag `<<mechanism realized by grainest coding scheme>>`, which is not in the BRA template or manual
- The BRA version in the xlsx is `CoBRAC-v1-1`: columns were only appended, so existing column positions are unchanged. Projects created before this version are checked with the new rules on their next follow-up and the agent is asked to fix what does not conform; their xlsx is still produced meanwhile

## [0.9.0] - 2026-09-29

### Added
- The harness checks that every reference is a real paper: each DOI is looked up in Crossref (other DOIs through doi.org) and each PMID in PubMed, and the record must have the Reference ID's first author, its year (±1) and, when given, a similar title. A DOI or PMID that does not exist or belongs to another paper goes back to the agent as a problem to fix, like the other checks
- The checks also report `[Author, Year]` citations in the data files and the report that are not in `references.json`, references that are cited nowhere (or only in the report's bibliography), and two references with the same DOI or PMID
- The result of each reference (verified, mismatch, not found, invalid, no identifier, unverified) is kept in `reference_check.json` in the project workspace, and the chat shows a summary when the HCD or FRG phase is accepted
- `references.json` may give `pmid`, `title` and `journal` for each reference; the agent is asked to fill them. Files with only `id` and `doi` stay valid
- When Crossref, doi.org or PubMed cannot be reached (timeout, rate limit, outage), the references stay "unverified" and the phase continues
- HCD / FRG graphs: selecting a node lights up its connections (HCD: direct inputs and outputs; FRG: the whole chain up to the TLF and down to its UCs) and dims the rest; opening a node from a link, the search or the URL moves the view to it, also above the detail sheet on phones
- The graph search lists matching nodes by ID, circuit name or UC Descriptor with keyboard navigation (↑ ↓ Enter, `/` to focus) and highlights the matches on the canvas
- HCD node details start with the FRG link and the function groups (GN) that contain the UC; FRG group details have "Show its UCs in HCD", which opens the HCD with those UCs highlighted. Switching between HCD and FRG keeps the selected UC
- FRG UC nodes show the circuit name from the HCD; FRG groups can be collapsed and expanded from a button on the node, and the details show the path from the TLF
- Style editing (node fill / border / size, edge line / colour / arrows / bends) is available on phones and tablets as a bottom sheet
- Explanatory articles are back, on demand: once the BRA data is complete, the Article tab lets you pick a language (your display language by default, any of the 10) and press Create article. A background job writes a readable article from the project's HCD, FRG, report and decision log, citing only the project's references, and adds a reference list with DOI links. Progress shows in the chat; you can stop it, and a failed or stopped article never marks the project as failed
- The Article tab shows one article per language with a table of contents, the date and model it was written with, and a .md download (`{name}_{ID}.article.<locale>.md`). Articles can be recreated; an article written before a later follow-up is marked as out of date
- A Tables tab shows the raw tabular artifacts — `uc.json`, `connections.json`, `references.json`, `frg.json` and the BRA CSVs — as tables you can sort by column, filter by words, expand row by row and download. It is available while a job is still running, as soon as the files exist
- Projects can be deleted from the project list and from the project screen header, after a confirmation dialog. A deleted project disappears from the list and the sidebar and can no longer be opened, followed up or downloaded. Nothing is erased: the data stays stored, the project's cost stays in the usage totals, and admins see it marked as deleted in the admin page
- A project whose job is queued, running, waiting for an answer or finalizing cannot be deleted; its delete button is disabled until the job is stopped

### Changed
- The agent's chat replies (turn summaries and questions) are written in the language selected in the web app (English, Japanese, Chinese, Korean, German, French, Spanish, Portuguese or Russian), whatever language the ROI/TLF or instructions are typed in. The language of the screen at the time of creating, answering, sending a follow-up or retrying is used; files such as the report, the decision log and the xlsx stay in English
- The chat no longer fills up with the agent's thoughts and commands: while the agent works, a single live line shows the latest step with the step count, elapsed time and to-do progress; once it moves on, those steps fold into one "Thinking & actions (N steps, time)" row that expands to the full list. Answers, questions, errors and notices stay visible
- Reasoning previews in the step list no longer show Markdown `**` markers, and a to-do list previews its next open item
- Graph toolbar redesigned: search, fit, undo / redo, an "Edit style" mode and a menu for layout direction, grid snap, edge labels, PNG export and reset. Style panels, resize and connection handles only appear in style edit mode; on touch devices nodes can be dragged only in that mode, so panning does not move them by accident
- Node classes (ROI / noROI, TLF / GN / UC) are shown with a coloured stripe as well as the fill, labels grow when zoomed out, and self-connections (for example gap-junction coupling) are drawn as loops
- Edges are curves by default; edges whose bends were saved with the earlier orthogonal default keep them
- The FRG is laid out left to right, which fits wide hierarchies better
- The viewer adapts to the width of its own area, not the window: the details open beside the graph when there is room and as an expandable sheet otherwise; the legend can be collapsed
- The project screen puts the artifacts in the centre and the chat in a right sidebar: tabs for the HCD graph, FRG graph, Tables, Report and Decision log, with the BRA xlsx download in the header. On a wide screen the chat can be resized or collapsed; on tablets and phones it opens from the Chat button as a drawer or bottom sheet. Before any artifact exists the centre shows what will appear and the progress
- Project links open `/projects/<ID>` (the first available artifact tab); old `/chat/<ID>` links redirect there. `/projects/<ID>/hcd` and `/frg` links keep working

### Fixed
- A project shows a provisional name made from the ROI and TLF as typed, such as "VOR in 小脳", from the moment it is created until the agent names it; before, Japanese input was dropped and a project with TLF "VOR" / ROI "小脳" was called "VOR" while it ran. Projects already created that way show the provisional name too, including in the xlsx download name. A name the user typed or edited is still never replaced
- The project history in the sidebar shows both ROI and TLF under the name instead of only the TLF
- The chat no longer looks as if the user sent a second message at the start of each run: the instruction the worker gives the agent (Project ID, ROI, TLF, Contributor, "Run phase HCD." and the retry / answer / follow-up variants) is shown as a small notice such as "Started phase HCD." that expands to the full text. Existing conversations are shown the same way
- The zoom buttons were hidden behind the legend on wide screens, and the save status covered toolbar buttons when the details were open

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
