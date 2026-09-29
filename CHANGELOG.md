# Release notes

Change history for CoBRAC Agents. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).
Accumulate changes under `[Unreleased]`, then finalize the version in a release PR with `npm run release -- <patch|minor|major> --no-git`; merging it deploys (see `AGENTS.md`).

## [Unreleased]

### Added
- The create screen accepts reference materials: up to 10 files (PDF, images, text, CSV / JSON, Word / Excel / PowerPoint; 20 MB each, 50 MB in total) and up to 20 URLs. Files upload straight to the project's storage while you fill in the form, with progress; drag and drop works on desktop and the file picker on phones
- The agent gets the materials as inputs: the files, text extracted from PDFs and Office files, and the content of each URL (fetched once when the project starts) are listed in `materials/INDEX.md`, and images are shown to it with the first prompt. It is told to consult them, but they do not replace verified literature: references still need published sources checked against Crossref / PubMed, and quotes must be verbatim from those sources
- The project page lists the attached materials (under the ROI / TLF line; "Details" on phones): files download under their original names, URLs open in a new tab
- After the FRG and CSV steps, the harness records how well the HCD and the FRG agree in `cross_check.json`: whether each group node's interface matches the connections of its UCs (flows left out or claimed without a connection), whether the ROI's inputs and outputs match the `noROI` tags, whether the two UCs of a group node are connected, whether every ROI-internal UC is mentioned by the group node it belongs to, and whether the FRG has collapsed (the TLF directly on UCs, a single group node, fewer than three ROI-internal UCs). For now this is only recorded and shown as counts in the chat; the agent is not asked to fix it
- A script measures the same consistency on finished projects copied from the artifacts bucket (read-only), including projects from before v0.8 through their CSVs
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
