# Release notes

Change history for CoBRAC Agents. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
Accumulate changes under `[Unreleased]`, then finalize the version in a release PR with `npm run release -- <patch|minor|major> --no-git`; merging it deploys (see `AGENTS.md`).

## [Unreleased]

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
