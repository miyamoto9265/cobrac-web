# CoBRAC harness v2: current specification

The CoBRAC harness builds a BRA from a brain region (ROI) and a function (TLF) by running an LLM agent through a fixed procedure and checking and converting its output with ordinary code. **Only the CoBRAC agent (an LLM) reasons.** The **worker** is a program with no LLM: it runs a loop that sends a request, checks the files that come back, and decides the next request.

Four points to take away first:

1. **One actor reasons.** When a BRA is built, the only LLM that reads the literature and judges circuits and functions is the CoBRAC agent. It is an OpenAI model run through Codex, and it keeps one conversation for the whole project.
2. **The worker is not an LLM.** It is a TypeScript program running on Fargate. Phase order, request assembly, validation, conversion, and saving are all fixed code. The same code decides whether to move to the next phase or to ask for a fix.
3. **Work is handed over as files.** Only two things travel as conversation messages: the worker's request and the short JSON the agent returns at the end of a turn. The agent edits files in the project folder; the worker rereads those files and decides whether they pass.
4. **Each output has one writer.** The agent writes the HCD / FRG data JSON, the report, and the decision log. The worker's code produces the check-result JSON, CSVs, xlsx files, graphs, and saved versions. The LLM never writes a CSV or xlsx file directly.

This article describes **harness v2 as implemented in app 0.37.2**, including the naming rules, ROI handling, FRG construction, hypothesis mode, and saved versions added since v2 was introduced. There is no separate v2.1 release label yet. New projects use validation rules **`harnessRules: 2`**. The harness generation, app version, validation rules, and Excel format each have their own version numbers.

Section 1 introduces the actors, section 2 what passes between the worker and the agent, and section 3 how one BRA is completed; later sections cover the rules of each phase. Open the **“Show details”** sections to read the full prompts, file lists, validation tables, and examples.

## 1. The actors

### 1.1 The LLM that reasons: the CoBRAC agent

In this article, “the agent” means the **CoBRAC agent** that builds the BRA. It is an OpenAI language model; the model and reasoning effort are chosen per project. The model runs through OpenAI's **Codex** (the Codex SDK and Codex CLI). Codex is the runtime that lets the model read and write files through a shell, call MCP tools, and search the web, and that keeps and automatically compacts the conversation history. The reasoning itself happens on the OpenAI API, outside the container.

The agent never starts work or advances a phase on its own. When it receives a request from the worker, it works through one **turn**: it searches the literature, reads source text, and edits files, calling tools as often as it needs within that turn. At the end of the turn it returns a JSON report and stops until the next request.

Every turn of a project (research, HCD, FRG, fixes, and adjustment) continues **the same conversation (Codex thread)**. Answers to questions, retries from an intermediate state, and follow-ups after delivery resume that conversation too. Only when the conversation exceeds the OpenAI request limit does the worker switch to a new conversation and tell the agent to continue by reading the project files and decision log.

### 1.2 What is not an LLM: the worker

The **worker** is a TypeScript (Node.js) program that AWS Fargate starts for each job, normally on Spot capacity with On-Demand as the fallback. It contains no LLM; all of its decisions are fixed code. At its center is this loop:

1. Build the phase's request and send it to the agent
2. Wait for the turn to end
3. Check the files the agent wrote with the validators
4. If there are problems, send a fix request with the list of problems; otherwise move to the next phase

The **CoBRAC harness** is the name for the whole of this worker program together with the instructions given to the agent (`prompts/`), the JSON Schemas, the validators, and the output conversion. The LLM is not part of the harness; it is what the harness runs.

The worker starts the agent's Codex process as a child process in the same container. That is why the agent is sometimes said to run “inside the worker”; this describes where the process runs. It does not mean that the worker reasons.

### 1.3 All actors

| Actor | Kind | Where it runs | What it does | What it produces |
| ---- | ---- | ---- | ---- | ---- |
| User | Person | The interface | Submits ROI, TLF, instructions, and reference materials; answers questions; approves Canon incorporation | Input, answers, approvals |
| API / dispatcher / janitor | Program | AWS Lambda | The API records the project and job and requests a run through SQS; the dispatcher starts a worker within concurrency limits; the janitor recovers jobs whose heartbeat stopped | Job records, worker launches |
| Worker | Program (no LLM) | Fargate | Controls phases, builds requests, validates, converts to CSV / xlsx / graphs, saves and resumes | Requests, check-result files, CSV / xlsx / graphs, saved versions |
| CoBRAC agent | **LLM** | Reasoning on the OpenAI API; tools run on Fargate | Researches the literature, decides ROI, UCs, connections, and functional decomposition, and writes them to files | Data JSON, `report.md`, `decision_log.md`, the JSON that ends each turn |
| `lit` | Program (agent tool) | MCP server inside Fargate | Searches PubMed / Europe PMC at the agent's request and returns abstracts, full text, and matching sentences | Search results and source excerpts |
| RCS | External service (agent tool) | MCP server in another system | Returns candidate SABRA units for a region name; the worker also uses it to check names | Candidate lists |
| Crossref / PubMed / Europe PMC | External services | The internet | Queried by the worker to check that references exist and that quotes appear in the source | Bibliographic data, abstracts, full text |
| DynamoDB / S3 | Storage | AWS | Project and job state and messages / workspace, conversation, artifacts, saved versions | — |

`lit` and RCS are **tools** the agent calls. They return candidates and source text but decide nothing. The agent decides what to use and writes it to files; the worker records the calls.

The worker extracts text from the user's reference materials (PDFs and so on) into `materials/`, and the agent reads them to understand the user's intent. Reference materials do not replace verified literature. A Canon is a fixed revision of circuit definitions shared across several BRAs; the worker adds it to the requests as constraints ([9.1](#91-canon-constraints)).

![Purple marks the LLM, blue a program, green files, and white people, external services and storage. The API and dispatcher start a worker on Fargate for each job. The worker sends requests to the CoBRAC agent and receives the JSON that ends each turn. The work itself is handed over as files in the workspace. The model reasons on the OpenAI API outside the container](./figures/harness-current-architecture.en.svg "Figure 1. The actors and what they hand over. Only the purple CoBRAC agent reasons; the blue worker is a program following a fixed procedure")

### 1.4 Other jobs that use an LLM

Besides building BRAs, the app has three kinds of job that use an LLM. The same worker program runs each of them in another mode and calls the LLM in **a new conversation, separate from the BRA's**. These LLM calls do not inherit the conversation of the agent that built the BRA; they receive only the files or JSON the worker prepares.

| Job | Role of the LLM | Tools the LLM can use | What the LLM produces | Who receives the result |
| ---- | ---- | ---- | ---- | ---- |
| BRA building (initial run, resume after an answer, retry, follow-up) | The CoBRAC agent; the subject of this article | Shell, `lit`, RCS, web search | Data JSON, report, decision log | The worker checks and converts it |
| Explanatory article | Reads only the finished BRA outputs and writes an article in the requested language | Shell (reading the outputs); no web search | The article in Markdown | The worker checks its format, asks for fixes, and publishes it |
| Canon AI review | Reads a Canon incorporation request and reports findings | None | Findings as JSON | People approve or reject; AI review does not substitute for approval |
| Orchestrator plan | Drafts plan rows (ROI × TLF), dependencies, anchors, and the granularity policy; proposes changes after each batch | RCS, reading attachments | The plan as JSON | The worker checks its shape; the plan runner (a Lambda program) computes the order and applies it |

The article job follows its first turn with check-and-fix turns. The AI review and the plan job use one turn and ask once more only when the reply does not match the output schema.

<details>
<summary>Show details: terminology and version numbers</summary>

| Term | Meaning in this harness |
| ---- | ---- |
| CoBRAC agent | The LLM that builds the BRA: an OpenAI model run by Codex. “The agent” in this article |
| Worker | The TypeScript program that runs on Fargate for each job. It contains no LLM |
| CoBRAC harness | The worker program, instructions, JSON Schemas, validators, and conversion together. It does not include the LLM |
| Codex | OpenAI's agent runtime. It lets the model use tools and manages the conversation |
| Turn | The agent's work from receiving one request to returning the end-of-turn JSON |
| Conversation (thread) | The history of turns. One per project, continued throughout |
| Validator | Worker code that checks files. Not an LLM |
| Workspace | The working directory on the worker's disk: the project folder plus `AGENTS.md`, `schemas/`, `materials/`, and `canon/` placed by the worker. Work is handed over here, and it is saved to S3 |
| BRA | Brain Reference Architecture: data describing the relationship between brain structure and function |
| ROI / TLF | The target brain region / the top-level computational function to explain in that region |
| HCD | A graph of brain information processing, represented by literature-supported UCs and Connections |
| UC | Uniform Circuit: a neural population that this HCD treats as representing uniform information |
| Collection | A region grouped into finer circuits; it is not a connection endpoint or an FRG leaf |
| BIF | Literature evidence for anatomical projections between tissues; it supports Connections between UCs |
| FRG / GN | Function Realization Graph, which decomposes the TLF hierarchically / Group Node, which represents an intermediate function |
| SABRA / RCS | A hybrid atlas using BNA for the neocortex and DHBA elsewhere / ROSETTA Candidate Search, which finds its units from region names |
| Canon | Circuit definitions shared across projects, with an approval history for changes |

| Version number | What it identifies | Current value |
| ---- | ---- | ---- |
| Harness generation | The execution model, including HCD–FRG round trips | v2 |
| App version | A release of the Web app, API, and worker | This article describes 0.37.2 |
| `harnessRules` | Validation rules stored on a project | 2 for new projects. 0 uses the earlier rules; 1 adds ROI rules; 2 also adds GN rules |
| BRA CSV format | BRA version in `Project.csv` | `CoBRAC-v1-1` |
| Official xlsx | The BRA template used for output | `Template-v2-2` |
| Saved BRA version | The artifact history of one project | `<ProjectID>@v1`, `@v2`, and so on; unrelated to the harness generation |

Older projects retain the `harnessRules` and SABRA boundary settings from their creation. Updating the app does not automatically apply every new constraint to every existing BRA.

</details>

## 2. What passes between the worker and the agent

### 2.1 One turn

Only two things travel between the worker and the agent as conversation messages: the worker's **request** and the agent's **JSON that ends the turn**. Everything else is handed over as files in the **workspace** (the working directory on the worker's disk, centered on the project folder).

![One turn in three columns: worker, workspace, and CoBRAC agent. 1 The worker builds and sends the request. 2 The agent reasons and uses tools. 3 The agent edits the data files. 4 The agent returns the JSON that ends the turn. 5 The worker rereads and checks the files and writes the check results. 6 The worker's code decides between a fix request, the next phase, and stopping](./figures/harness-current-turn.en.svg "Figure 2. What passes in one turn. The worker's checks decide whether the work passes, not the agent's report")

1. **Worker → agent: the request.** Text combining the project information and phase name, the phase specification, the problems found in the previous check, and the reply-language instruction.
2. **The agent works.** Within the turn the agent calls `lit`, RCS, and web search and reads and writes files through the shell. Meanwhile the worker receives the tool calls and file changes as events, records literature searches and RCS calls, and streams progress to the interface. The worker adds no instructions during a turn (although a cancellation or the research time budget can cut the turn off).
3. **Agent → workspace: files.** The agent edits the data JSON, report, and decision log.
4. **Agent → worker: the JSON that ends the turn.** `{"status": "done" | "question", "message", "question"}`. `done` is the agent's report that it has finished the work for this turn; it does not mean the work passed.
5. **The worker checks.** The worker rereads the files, runs the validators, and writes the results to check-result files.
6. **The worker decides.** If problems remain it sends a fix request with the list of problems; if the phase passes it sends the next phase's request (back to 1). For `question` it saves the workspace and conversation and stops.

### 2.2 What is handed over, and how

| Direction | Channel | Contents | Who creates it and who reads it |
| ---- | ---- | ---- | ---- |
| Worker → agent | Files placed in the workspace | `AGENTS.md` (shared rules), `schemas/` (JSON Schemas), `materials/` (the original reference materials and text extracted from PDFs, Office files, and URLs; images are also attached to the first request), `canon/` (the fixed Canon revision) | The worker places them when the job starts; the agent reads them and does not change them |
| Worker → agent | The request in the conversation | Phase request, phase specification and additional rules, problem list, FRG candidates, reply language | The worker assembles it for each turn |
| Agent → worker | Data files in the workspace | `meta.json`, the three HCD files, `frg.json`, `research.json`, `report.md`, `decision_log.md` | The agent writes them; the worker checks and converts them |
| Agent → worker | The reply in the conversation | The JSON that ends the turn | The worker branches on `status` and `question` only |
| Worker → agent (next turn) | Check-result files in the workspace | `reference_check.json`, `quote_check.json`, `cross_check.json`, `frg_candidates.json`, and others | The worker writes them; the agent may read but not change them. What needs fixing also goes into the next request |
| Worker → user | DynamoDB → WebSocket → interface; S3 through the API | Progress, questions, artifacts, saved versions | The worker writes them; the interface displays them |

### 2.3 How requests are assembled

The worker prepares the shared `AGENTS.md` rules and `schemas/` in the workspace. Each turn's request combines a short request visible to the user, an internal specification, and an instruction about the reply language, separated by delimiters. Specifications omitted from the short request shown in the interface are still sent to the agent.

The specification is assembled for the project. Depending on project settings, the worker adds ROI rules and Canon constraints to HCD, GN rules and candidates computed from the HCD to FRG, instructions for using the survey in research mode, and the permitted scopes in hypothesis mode. **The base specification together with these additional rules is the effective instruction for that project.**

<details>
<summary>Show details: how requests are assembled for each turn</summary>

| Turn | Visible request | Internal additions |
| ---- | ---- | ---- |
| Research | Project ID, ROI, TLF, Contributor, reference-material location, and the request to start research | `RESEARCH.md` with the Project ID, candidate limit, time budget, and query count substituted |
| HCD | Project information and `Run phase HCD.` | `HCD.md`, ROI rules for rules 1 and above, Canon constraints, and an RCS-unavailable note when needed |
| FRG | Project information and `Run phase FRG.` | `FRG.md`, GN rules for rules 2, and the latest candidates in `frg_candidates.json` |
| HCD / FRG in research mode | The usual phase request | `research_mode.md`: use the survey, investigate gaps, and research theories and computational models for the FRG |
| HCD / FRG in hypothesis mode | The usual phase request | `HYPOTHESIS.md` with the permitted scopes, hypothesis share limit, and research-mode setting substituted |
| Validation fix | Problem count, fix attempt number, up to 30 problems, and an instruction to fix the files | Reasoning effort is set to the lower of the project setting and medium |
| Consistency adjustment | X1, X2, X3, and X8 findings, their meaning, and a request to revise one or both graphs | Requires evidence-based decisions and entries in the revisions section; uses normal reasoning effort |
| Answer to a question | The user's answer and an instruction to continue | Project information and specifications are added only when resuming in a fresh conversation |
| Retry from an intermediate state | Read the existing files and finish the incomplete phase | The necessary specifications; completed files should not be rebuilt |
| Follow-up | Project information, the new instruction, and any permitted hypothesis scope | Both HCD and FRG specifications, plus research-mode and hypothesis-mode rules |
| CSV | No agent turn | The worker converts the data; a problem triggers a request to fix the JSON |

These examples show the format. `<...>` stands for a runtime value.

```text
Project ID: <ProjectID>
ROI: <ROI or an instruction to determine it by research>
TLF: <TLF or an instruction to determine it by research>
Contributor: <Contributor>

Run phase HCD.

---

<HCD specification and this project's additional rules>

---

<Reply language for the user-facing message / question>
```

```text
The validator found <N> problem(s) in phase HCD (fix attempt <i>/3):
- <file, JSON pointer, and problem>

Fix them in the files and finish with status "done".
```

Each turn ends with JSON governed by a schema. `done` means that the agent has finished the work for this turn; acceptance by the worker is a separate step.

```json
{"status":"done","message":"<Short description of the work>","question":null}
```

```json
{"status":"question","message":"<Current situation>","question":"<Question with evidence, options, and a recommendation>"}
```

Artifact JSON values, the report, and the decision log are in English. `message` and `question` follow the interface language. The article written by the explanatory-article job ([1.4](#14-other-jobs-that-use-an-llm)) uses the requested language.

</details>

The complete shared rules and phase specifications appear in [section 11](#11-prompt-sources).

### 2.4 Files, not the conversation, as the source of truth

Even when the conversation is compacted or replaced by a new one, intermediate results remain in the project's files. HCD uses `references.json`, `uc.json`, and `connections.json`; FRG uses `frg.json`. `HARNESS_SCHEMAS` defines their structure, with the same definitions used for the agent's `schemas/` and the validator.

The agent puts the readable explanation in `report.md`, covering HCD, FRG, limitations, and references. `decision_log.md` is the agent's append-only account of why a conclusion was chosen, alternatives rejected, the user's answers, and reasons for changes. Raw search logs do not need to be copied into it; the worker records searches in separate files.

<details>
<summary>Show details: files, who writes them, and who reads them</summary>

Here `{P}` is the Project ID. Paths are relative to the project folder.

| File | Writer | Contents | Reader and use |
| ---- | ---- | ---- | ---- |
| `meta.json` | Agent | ROI, TLF, description, and display name; current rules also record ROI elements, side, and the source of the side setting | The worker checks it and uses it for the project display and the CSVs |
| `{P}_HCD/references.json` | Agent | Reference IDs, DOI / PMID, bibliography, and literature type | The worker checks it against Crossref / PubMed and converts it to CSV |
| `{P}_HCD/uc.json` | Agent | UCs and Collections, descriptors, ROI membership, function items, and interfaces | The worker checks it and uses it for FRG candidates, CSVs, and graphs |
| `{P}_HCD/connections.json` | Agent | Tissue-level BIF and UC connections; one paper per connection record | The worker matches its quotes against the source and uses it for FRG candidates, CSVs, and graphs |
| `{P}_FRG/frg.json` | Agent | TLF and GNs; UCs appear as references in `subnodes` | The worker checks it and uses it for cross-checks, CSVs, and graphs |
| `report.md` | Agent | Overview, HCD, FRG, Limitations, and References; Hypotheses when present | The user reads it; it is also an input of the explanatory-article job |
| `decision_log.md` | Agent | Dated decisions and `HCD-FRG revisions` | The user reads it; after an adjustment the worker checks for entries in the revisions section |
| `research.json` | Agent | Survey plan, candidates, searches, evidence, coverage, and gaps in research mode | The worker matches it against the search log; the agent uses it as evidence in the HCD |
| `research_queries.jsonl` / `rcs_mcp_calls.jsonl` | Worker | The agent's literature searches and RCS calls | The worker checks the survey against the former; the latter is a record of the calls |
| `research_check.json` | Worker | Survey coverage and comparison with search logs | Gaps become fix requests and pass forward to the HCD |
| `reference_check.json` / `quote_check.json` | Worker | Reference existence, quotes matched against source text, and quote-reuse warnings | Problems become fix requests; the user reads them with the artifacts |
| `frg_candidates.json` | Worker | Pathways, connected components, motifs, and connected pairs computed from the HCD | Goes into the FRG and adjustment requests; the agent interprets it |
| `cross_check.json` | Worker | HCD / FRG consistency findings, counts, and the adjustment record | Findings become the adjustment request; the user reads the remaining findings |
| `phase_baseline.json` | Worker | Hashes and remaining problems at phase validation | The worker uses it to detect later changes and revalidate |
| `hypotheses.json` | Worker | Hypothesis numbers, shares, evidence-supported paths, and dependent GNs | The user checks hypothesis scopes, shares, and dependencies |
| `{P}_CSV/*.csv` | Worker | Five tables: Project, References, Circuits, Connections, and FRG | The worker builds the xlsx files and graphs from them; the user downloads them |
| `{P}_CSV/bibliography.json` | Worker | Bibliographic information checked for the official template's References sheet | The worker writes it into the Template-v2-2 xlsx |

`schemas/`, `materials/`, and `canon/` are supporting inputs placed outside the project folder. The materials and worker-written files are for reference, and the instructions prohibit the agent from modifying them. The worker runs its checks against the data files.

</details>

## 3. How one BRA is built

### 3.1 Who does what in each phase

For a new project, the **research step**, enabled by default, is followed by the **HCD** and **FRG** phases, and finally the worker generates the outputs. Each phase repeats “agent turn → worker check → fix turn if needed”, and it is always the worker that advances the phase. Disabling research mode starts the workflow at HCD; literature tools and reference checks remain available.

![The left column shows the turns of the CoBRAC agent (the LLM), the right column the processing of the worker (a program). In the research, HCD, FRG, and adjustment turns the worker checks the files the agent wrote and requests fixes when problems remain. Only the worker computes the FRG candidates and generates and saves the CSVs, xlsx files, and graphs; no LLM takes part](./figures/harness-current-pipeline.en.svg "Figure 3. One BRA run and who writes what. LLM turns on the left, program steps on the right")

| Phase | What the agent (LLM) does → writes | What the worker (program) does → writes | What passes to the next phase |
| ---- | ---- | ---- | ---- |
| 1 Research (on by default) | Finds and reads papers for each candidate input, output, and internal projection of the ROI → `research.json` | Records searches and checks coverage; requests fixes for gaps (up to 2) → `research_queries.jsonl`, `research_check.json` | `research.json` and remaining gaps |
| 2 HCD | Decides ROI, UCs, connections, references, and function items → `meta.json`, `references.json`, `uc.json`, `connections.json`, the HCD section of `report.md`, `decision_log.md` | Checks schema, IDs, naming, BRA values, references, and quotes; requests fixes for problems (up to 3) → `reference_check.json`, `quote_check.json`, `rcs_mcp_calls.jsonl`, `phase_baseline.json` | The accepted HCD files |
| FRG candidates | — | Computes pathways, connected components, motifs, and connected pairs from the HCD connections → `frg_candidates.json` | Candidates included in the FRG request |
| 3 FRG | Decomposes the TLF, interprets the candidates, and groups them into GNs → `frg.json`, the FRG section and mapping table of `report.md` | Checks GNs, interfaces, and function items and computes consistency with the HCD; requests fixes for problems (up to 3) → `cross_check.json` | The accepted FRG and the consistency findings |
| 4 Adjustment (when triggered, once per run) | Revises the FRG, revises the HCD with evidence, or records why a mismatch stays → changed files, revisions in `decision_log.md` | Requests the adjustment for X1, X2, X3, or X8, then revalidates changed files | Revalidated HCD and FRG |
| 5 CSV, xlsx, graphs | None; receives a request to fix the JSON only if CSV generation finds problems | Generates five CSVs, two xlsx formats, and graphs from the JSON → `{P}_CSV/*.csv`, `bibliography.json`, xlsx, graphs | The artifacts |
| 6 Saved version | None | Freezes the artifacts and generation settings → `<ProjectID>@vN` | The user views and downloads them |

After FRG, the worker checks consistency between the HCD and FRG, and certain findings trigger **one adjustment turn per run**. The agent decides whether to revise the FRG decomposition or obtain evidence and revise the HCD's UCs and connections. From the CSVs onward, no LLM takes part.

### 3.2 Questions and follow-ups

When **the agent judges** that a decision requires the user, it ends its turn with `status: "question"`. **The worker** then saves the working files and Codex conversation to S3 and exits. Once an answer arrives, a new worker restores them and resumes the same conversation with the answer as the request. Fargate does not keep running while waiting for an answer.

Follow-up instructions after delivery also start from the same files and conversation. The worker supplies both HCD and FRG specifications again in the request, and the agent updates the related IDs, connections, interfaces, and report together. The worker then revalidates every phase, regenerates the CSVs and xlsx files, and records the artifacts as a new saved version.

### 3.3 When validation still finds problems

In the HCD, FRG, and CSV phases the worker lists the problems and asks the agent to fix them, with up to three fix attempts per phase by default. If problems remain, the worker fails the job for a fatal issue that makes the data unreadable; if the data can still be read, it records the unresolved problems as warnings and continues. Fixes after the adjustment turn have a separate allowance.

**A completed job therefore does not guarantee that every check passed or that its science is correct.** Read the remaining warnings, unverified quotes, research gaps, and dependence on hypotheses alongside the artifacts.

## 4. Gathering evidence in the research step

The survey works with **candidate** projections: the ROI's main inputs, outputs, and internal projections. The agent starts from reviews, then searches each candidate using different region synonyms, species, and tracing methods. It reads abstracts or full text and records both the strength of the evidence and what its searches failed to find in `research.json`.

The worker checks that the search strings recorded by the agent appear in the actual search log and that coverage marked `found` agrees with the evidence. The search log is not the agent's own account: the worker records it from the tool-call events. Meeting a query count and finding the desired evidence are separate outcomes. Gaps pass forward to the HCD and report.

<details>
<summary>Show details: research budget and checklist</summary>

| Item | Current value or rule |
| ---- | ---- |
| Candidates | At most 40 |
| Searches | At least 2 distinct queries per candidate, including at least 1 in PubMed or Europe PMC |
| Evidence | Record DOI or PMID, species, measurement method, findings, and the source actually read |
| Coverage | `found` / `searched_none` / `not_applicable` for tract tracing, primates, rodents, and cell types / layers |
| Candidate status | `supported` / `weak` / `not_found` / `contradicted`; explain statuses other than supported |
| Fixes | Up to 2 after the first turn |
| Time | 60 minutes by default; no new fix turn starts with less than 10 minutes remaining; configurable |
| Reasoning | The main research turn raises the project setting to at least high; fixes use medium or lower |
| Gaps or exhausted budget | Record warnings and continue to HCD; completion does not imply exhaustive literature coverage |

`lit` searches return 8 results by default, with a configurable range of 1–25. `find_sentences` returns at most 8 sentences. It uses full text when available, otherwise the abstract. The agent retrieves small, relevant passages and quotes from the source text.

</details>

## 5. Defining regions and information flow in the HCD

In this phase the agent makes the decisions and writes the files, and the worker checks what was written. The rules below are instructions to the agent (the specification) and also conditions that the worker's validators check.

### 5.1 ROI and UC granularity

The agent first checks whether the ROI can realize the TLF, what information enters the ROI, and what leaves it. If ROI or TLF is blank, research fills it in; the agent asks when a choice requires the user.

Current ROI rules record each region within the ROI in `roiElements` and assign at least one internal UC representing each element. One UC cannot stand for two different ROI elements, and every internal UC belongs to an element. Without an explicit side from the user, the ROI is **bilateral**; a lateralized function alone does not justify silently restricting it to one hemisphere.

“Uniform” is a judgment at the granularity chosen for this HCD. When parts of a region have different projections or functions, the agent separates them into UCs with evidence. The original region can become a Collection where needed. Collections express membership; they are not connection senders or receivers, or leaves of the FRG.

### 5.2 Names anchored to SABRA

A UC's key is its **UC Descriptor**; its readable alias is its **Circuit ID**. Under the current SABRA boundary, only the neocortex uses BNA. Everything else uses HOMBA terms with DHBA names, including the hippocampus, entorhinal cortex, amygdala, basal ganglia, and thalamus.

The anchor alone is normally sufficient. Facets such as cell type or layer are added only when distinct populations within the same unit must be identified. BNA anchors are left–right pairs; `side` identifies a unilateral population. The agent's RCS lookups and the worker's checks both limit ad hoc interpretations of abbreviations.

<details>
<summary>Show details: current naming examples and checks</summary>

| Population | UC Descriptor | Circuit ID |
| ---- | ---- | ---- |
| Ventral tegmental area | `HOMBA:12261` | `VTA` |
| Nucleus accumbens | `HOMBA:10339` | `NAC` |
| Left A4ul | `BNA:57-58/side:left` | `A4ul(left)` |
| DA population in VTA | `HOMBA:12261/nt:DA` | `VTA(DA)` |

The worker's validators check the following.

| Check | What it verifies |
| ---- | ---- |
| Anchor | BNA pair / BNAG / HOMBA within the current SABRA boundary; older projects use their stored boundary setting |
| Descriptor | Facet order, values, side, and absence of duplicates |
| Circuit ID | Starts with the official abbreviation; parenthesized facets follow descriptor order, separated by `.`, with side last |
| Name | `names` starts with the official SABRA name |
| Correspondence | Each Circuit ID element corresponds to a descriptor facet |
| Uniqueness and granularity | Duplicate descriptors, overlapping coarse and fine UCs, and non-uniform senders |

`A4ul@L` and `NAC(shell,DRD1+)` are older forms and should not be used as current examples. If RCS is unavailable, the agent notes this in the decision log and generation continues, but external abbreviation checks remain incomplete.

</details>

### 5.3 Connection evidence and interfaces

BIF describes the tissue-level projection reported in a paper; a Connection maps that evidence onto UCs. **Each connection record cites one paper.** When several papers support the same projection, each gets its own record. That record includes the species, measurement method, region names used in the paper, containment relationships with the UCs, and a source-text quote or figure reference.

An internal UC's interface follows its connections: inputs are senders, and outputs are receivers. `outputSemantics` explains the information that the UC itself represents in computational terms. Requirement, Requirement realization, Capability, Mechanism, and Implementation connect its role in the TLF to an implementation equation.

<details>
<summary>Show details: the eight HCD steps and recording checklist</summary>

The agent follows these steps according to the specification.

| Step | What to record | What to check |
| ---- | ---- | ---- |
| 1 ROI / TLF | `meta.json` and the decision log | ROI_Input / ROI_Output, each ROI element and its UCs, side and its source |
| 2 BIF | `references.json` and `bif` in `connections.json` | Research tissue-level projections and record the papers and literature types |
| 3 UC | `uc.json` | Internal / external membership, names, uniformity, granularity, and Collections where needed |
| 4 Connection | `connections` and UC `interface` | One paper per record; align all endpoints, quotes, inputs, and outputs |
| 5 Output Semantics | UC `outputSemantics` | Describe the information in one item keyed by its own ID; an external sink with no outputs may leave it empty |
| 6 Function items | The UC's five items | Requirement states the computation for the TLF; realization maps it to the interface; Capability generalizes away the semantics; Mechanism explains how it works; Implementation contains only equations connecting inputs and outputs |
| 7 Validation | Files and remaining questions | Paths from ROI inputs to outputs, gaps, duplication, granularity, and whether the TLF can be realized |
| 8 Report | `report.md` | Overview, HCD, Limitations, and References; the FRG section is added in the next phase |

Step 7 is the agent's own review. Separately, the worker's validators check the files after the turn.

External UCs use `roi: noROI(input)` / `noROI(output)` / `noROI(input,output)`; internal UCs use `internal`. External UCs do not carry the interface or five function items required for internal UCs.

| Connection field | Meaning |
| ---- | ---- |
| `senderRelation` / `receiverRelation` | `<` when the UC is finer than the region in the paper, `=` when equal, and `>` when the UC is broader |
| `senderInLiterature` / `receiverInLiterature` | The region names actually used in the paper; explicitly describe the granularity difference when using coarse-region evidence for a finer UC |
| `taxon` / `measurementMethod` | The paper's species and measurement method, using BRA's allowed values |
| `pointersOnLiterature` | A verbatim quote stating this projection, at least 10 words; not a summary or page number |
| `pointersOnFigure` | A figure reference such as `Fig. 3B`; at least a quote or a figure reference is required |

</details>

## 6. Reconciling functions and circuits in the FRG

### 6.1 Top-down decomposition and bottom-up interpretation

FRG construction combines a logical decomposition of the TLF with an interpretation of what the HCD's circuits compute. Both are the agent's judgments. The agent considers the top-down decomposition first, removing duplication and excessive subdivision, so the result does not simply copy the circuit graph.

Meanwhile, the worker's code computes paths from ROI inputs to outputs, internal connected components, motifs of 3–4 UCs, and connected pairs from the HCD connections, writes them to `frg_candidates.json`, and includes them in the FRG request. These are mechanically enumerated candidates with no meaning attached. The agent interprets each candidate using Output Semantics, function items, excitatory / inhibitory / modulatory signs, and the literature.

The agent records the correspondence between the two in a table in the report's FRG section. Where they do not match, the agent revises the functional decomposition or returns to the HCD with evidence. It cannot add UCs or connections merely to satisfy a count constraint.

### 6.2 What a GN represents

A GN means more than a list of its UCs' functions. It represents **the computation realized by the UCs and their interactions through connections**. With rules 2, the worker checks that a GN's UCs are connected. A GN normally holds at most 2 UCs; an indivisible motif can hold 3–4 when `motifNote` gives the reason and citations. Five or more are never accepted.

A GN's interface combines its children's interfaces and removes edges that close within the GN. Composing interfaces upward makes the TLF interface match the ROI's external inputs and outputs. The worker derives GN Output Semantics from the values of UCs that send outputs beyond the GN.

<details>
<summary>Show details: FRG correspondence outcomes, construction rules, and checks</summary>

| Outcome | Meaning | Action |
| ---- | ---- | ---- |
| `matched` | A lower-level circuit realizes a higher-level sub-function | Turn the pair / motif into a GN and group upward |
| `top-down only` | No candidate matches the sub-function | Keep it as a higher GN or merge it into its parent; add an evidence-supported gap to the HCD; if outside the ROI, exclude it and record the limitation |
| `bottom-up only` | No sub-function matches the circuit candidate | Add a missed function to the decomposition, or explain its contribution to the TLF through another GN |
| `mismatch` | UCs needed together are not connected | Revise the FRG decomposition or the HCD connections with evidence |

The report's correspondence table uses the columns `sub-function (GN ID)` / `candidate (IDs and UCs)` / `outcome` / `action`.

| Construction rule or check | Current constraint |
| ---- | ---- |
| Graph | Exactly one TLF root, no cycles, and children for every GN |
| Leaves | Include every internal UC; external UCs and Collections cannot be leaves |
| UCs per GN | Normally at most 2; 3–4 require `motifNote`; 5 or more are forbidden |
| GN with only UC children | At least 2 UCs; it must not merely rename one UC |
| UC membership | At most 2 GN parents per UC |
| Connectivity | The GN's UCs must connect through ROI-internal connections, ignoring direction; include intermediate UCs as well |
| Interface | Normal validation checks existing IDs and syntax. The instructions require composition from children with internal edges removed; missing or extra inputs / outputs relative to the connections return for adjustment through X1 / X3 |
| Function items | Normal validation checks the presence of Requirement, realization, Capability, and Mechanism and their referenced IDs. Insufficient explanation of interface UCs is recorded as X6 |
| HCD changes | Update literature, quotes, interfaces, function items, ROI elements, and side consistently, then validate again |

The base `FRG.md` still contains the earlier “at most 2 UCs” wording. Under rules 2, the appended `FRG_gn_rules.md` replaces its two UC-count constraints.

</details>

## 7. Validation and the return path to the HCD

### 7.1 What the worker's code can verify

The validators are the worker's code, not an LLM grading the work. Schemas, IDs, allowed values, quote format, and agreement between connections and interfaces are checked deterministically. References are checked through Crossref / PubMed, and quotes against retrieved source text. Quote matching uses character normalization and a similarity threshold of 0.9 by default, so a match does not necessarily mean exact character-for-character equality. Establishing correspondence with source text does not establish that the paper adequately supports the neuroscientific claim. That requires human evaluation.

<details>
<summary>Show details: validation layers and how to read their results</summary>

| Layer | Main checks | Limits |
| ---- | ---- | ---- |
| JSON Schema | Required keys, types, enums, and extra keys | Correct structure does not ensure correct contents |
| HCD / FRG | IDs, references, ROI membership, Collections, interfaces, hierarchy, and current ROI / GN rules | Does not fully establish biological or computational validity |
| SABRA | Descriptors, abbreviations, official names, boundary, and side | External checks are incomplete when RCS is unavailable |
| BRA values | Literature types, species, methods, equations, quotes / figures, and one paper per connection | Allowed values do not establish the strength of evidence |
| References | DOI / PMID checked against Crossref / PubMed | Bibliographic existence does not guarantee the claim |
| Quotes | Presence in full text or an abstract | Does not automatically establish figure contents or the implications of a claim |
| Research | Agreement with actual search logs and coverage | Cannot prove that unsearched literature does not exist |
| Canon | Circuit-definition and reference conflicts with the fixed revision | The Canon's definitions themselves require review |
| Hypotheses | Scopes, claims, premises, shares, and display | Checking a premise does not demonstrate the hypothesis |
| HCD / FRG consistency | X-series findings and adjustment | Records and addresses findings; does not guarantee that all findings disappear |

| Quote status | Meaning | Treatment |
| ---- | ---- | ---- |
| `verified_fulltext` | Matches the retrieved full text | Recorded as a full-text match |
| `verified_abstract` | Matches the abstract | Recorded as an abstract match |
| `not_found` | Full text was retrieved, but the quote was not found | Returns nearby passages or other feedback and requests a fix |
| `unverified` | Full text is unavailable and no abstract match could be confirmed | Remains unverified; not treated as a successful match |

Reusing the same quote and figure for connections between different circuits also produces a `reused` warning. A figure-only reference does not mean that the figure's contents have been checked.

</details>

### 7.2 Consistency checks and adjustment

The worker's code produces the consistency findings; the agent decides how to resolve them. X1, X2, X3, or X8 findings make the worker send an adjustment request with the findings and candidates. If the HCD is sound, the agent revises the FRG. If evidence supports a finer population or a missing projection, it revises the HCD. Decisions to keep a mismatch must also be recorded with a reason in the decision log.

The worker retains file hashes from the point of acceptance. If the HCD changes during FRG or CSV, it runs HCD validation again, distinguishing previously remaining problems from newly introduced ones. This prevents artifacts from being generated under stale validation results after the HCD has changed.

<details>
<summary>Show details: all X-series checks and the adjustment record</summary>

| Code | Finding | Current behavior |
| ---- | ---- | ---- |
| X1 | A GN interface omits an external output or input present in the HCD | Triggers adjustment |
| X2 | ROI inputs / outputs computed from HCD connections disagree with `noROI` tags | Triggers adjustment |
| X3 | A GN interface requests an input or output absent from HCD connections | Triggers adjustment |
| X4 | A GN's UCs are disconnected | Recorded only for rules 0 / 1; rules 2 checks this in normal FRG validation |
| X5 | An internal UC is absent from the function text of a GN it belongs to | Recorded |
| X6 | Requirement realization does not explain every UC in the interface | Recorded |
| X8 | Possible FRG collapse: the TLF rests directly on UCs, there is only one GN, or fewer than 3 internal UCs, among other conditions | Triggers adjustment |
| X9 | An internal UC spans a whole gyrus-level BNAG or several SABRA units and may be too coarse | Recorded |

There is no X7 in the implementation. There are eight check definitions including X4; rules 2 does not compute X4. A finding's severity and whether it immediately stops the pipeline are separate matters.

There is at most one adjustment turn per run, followed by up to three normal validation fix turns by default. Remaining findings are saved. The agent uses these tags in the decision log:

```text
## HCD-FRG revisions
- [FRG->HCD] <HCD change> — <why the FRG needed it> [Author, Year]
- [HCD->FRG] <FRG change> — <why it must agree with the HCD>
- [instruction] <change> — <the user's instruction and evidence>
- [kept] <remaining mismatch> — <why it was left unchanged>
```

</details>

## 8. Allowing hypotheses

The default is literature-supported data only. The agent can include a connection or UC property without direct evidence as a hypothesis **only when the user explicitly enables “Allow hypotheses” at creation or sets a permitted scope with a follow-up instruction**. Writing “as a hypothesis” in an instruction does not expand the permitted scope. The worker expands the permitted scope into the requests and uses it in its checks.

The relaxed requirement is that a paper directly states the claim itself. Checks still apply to premise papers, DOI / PMID, verbatim premise quotes, naming, schemas, interfaces, FRG, and Canon. A claim contradicted by the literature is not accepted.

Hypotheses are identified in data and graphs, and the agent gives their rationale in the report's Hypotheses section; the worker computes their numbers and shares. If there is no path from input to output without hypothesis connections, Limitations must say so. This mode does not instruct the agent to propose validation experiments or future research on its own.

<details>
<summary>Show details: hypothesis scopes and checklist</summary>

| Item | Rule |
| ---- | ---- |
| Connection claims | `existence`, `direction`, `sign` |
| UC claims | `population`, `transmitter`, `modulation`, `role` |
| Scope | The whole HCD or selected circuits / GNs; one scope must permit the target and every claim |
| Premises | At least one real paper; Reference IDs in `premises`, reasoning in `rationale` |
| Inference types | `published`, `homology`, `analogy`, `indirect`, `model`, `functional-need` |
| Research | Search for direct evidence first; in research mode, link to a `weak` / `not_found` candidate |
| Share | Count connections and UCs separately; each hypothesis share must stay within the limit. Default 20%; choices 10 / 20 / 30 / 50% |
| Denominator | Connection records; internal and external UCs, excluding Collections. Adding elements solely to dilute the share is forbidden |
| Hypothesized existence | Set the connection's measurement method to `Hypothetical`; other claims alone use the premise's method |
| Hypothesized population | `sourceOfId: makeshift`; limited to finer populations within a SABRA unit, not the unit itself |
| Tracking | The worker assigns H1, H2, and so on, to UCs first and then connections; numbers can change after additions or deletions |
| Output | `Hypothesis (...)` in Comments, `Depends on hypotheses` for GNs, H marks in graphs, and an option to hide hypotheses |
| Sharing | Hypotheses do not enter shared Canon definitions; saved versions containing hypotheses currently cannot be registered in BRA-DB |

A connection's quote supports its **premise**. It should not be read as a quote demonstrating the hypothesized connection itself.

</details>

## 9. Canons, saved versions, and the orchestrator

### 9.1 Canon constraints

A project participating in a Canon is pinned to a specific revision. The worker puts its definitions in read-only `canon/` files. The worker passes shared circuit names, Uniform / Collection status, subdivisions, connections, and references to the agent as constraints in the request and checks the agent's output for conflicts. The agent cannot independently split a circuit that the Canon defines as Uniform.

The Canon shares the definition of a neural population; functions and roles that depend on a particular TLF remain with the project. Hypotheses also stay outside the shared definitions. Changing a definition requires an incorporation request and human approval. AI review ([1.4](#14-other-jobs-that-use-an-llm)) is an LLM job that produces findings; it does not substitute for approval.

### 9.2 Recording how a BRA was generated

The worker freezes the artifacts of a completed BRA job as a saved version. Even if the working files later change, that version's artifacts and settings remain available. The record includes the app version, prompt and schema hashes, model, reasoning effort, research mode, Canon revision, SABRA boundary, validation rules, and hypothesis settings. This preserves outputs and provenance; it does not guarantee that rerunning the model will produce identical output.

### 9.3 Coordinating several BRAs

The **CoBRAC orchestrator** puts several ROI × TLF combinations into plan rows and launches normal BRA jobs according to dependencies and concurrency limits. It is split between an LLM and programs.

| Part | Kind | What it does |
| ---- | ---- | ---- |
| Plan job (draft, re-plan) | LLM ([1.4](#14-other-jobs-that-use-an-llm)) | Writes plan rows, dependencies, anchors, and the granularity policy from the goal and source lists; after a batch, proposes rows to add or remove |
| Plan runner | Program (a Lambda that runs every minute) | Applies the plan job's result and computes the build order from anchors, dependencies, and priorities; starts rows' BRA jobs when a slot is free and keeps rows in step with their projects |
| Each row's BRA job | Worker + CoBRAC agent | Builds one BRA exactly as described in this article |
| User | Person | Decides on proposed row additions and removals, Canon incorporation, and remaining conflicts |

A plan's settings choose the model for the orchestrator's own LLM jobs (draft, re-plan, and AI review of the rows' incorporation requests) separately from the model of the agents that build each row's BRA. The LLM never orders the rows; the plan runner's code computes the order.

In a plan using a Canon, the plan runner waits for approval of the preceding seed BRA's incorporation before moving on. A later row also completes only after its Canon incorporation is approved. When the Canon advances and creates conflicts, the plan runner sends a follow-up to that row's project (at most twice per row), and the agent conforms it to the Canon; remaining conflicts require human judgment. The plan runner never approves, rejects, or answers. This separates coordination across projects from HCD / FRG construction within one BRA.

## 10. Outputs and operational checks

### 10.1 Generating artifacts from the same JSON

From here on only the worker's code runs; no LLM takes part. `buildCsvs` creates five CSVs, and `csv_to_excel.py` creates a CoBRAC-format xlsx. The same data is also written to the official Template-v2-2 workbook, while `buildGraphs` creates HCD / FRG graphs. The report and decision log are available to read and download as written by the agent. Because the agent never writes CSVs and the same data feeds the xlsx files and graphs, separately rewritten tables cannot disagree.

If only official-template generation fails, the job can still complete with the CoBRAC-format xlsx and graphs. Check the actual outputs as well as job status to confirm that the formats you need are present.

### 10.2 Long jobs and cost

While a job runs, the worker saves the workspace and conversation every five minutes and also on the SIGTERM sent for a Spot interruption. The janitor attempts recovery when a job's heartbeat stops. If a conversation is too large to resume, the worker asks the agent to continue in a fresh conversation by reading the existing files and decision log.

Codex compacts the conversation automatically at 75,000 tokens by default. Small tool results, partial file edits, and lower reasoning effort for fix turns help control the context and cost. Cost is calculated from model input, cached input, and output usage at the relevant rates, without repeatedly adding the same conversation's cumulative usage for every turn. Historical speed and cost measurements appear in [article 09](./09_BRA_speed_and_cost.md); they are not a guarantee for every current job.

The OpenAI API key is stored encrypted and decrypted inside the worker, which passes it to Codex. Codex uses it only to call the API; the commands the agent runs cannot see it. AWS credentials are not passed to the agent's shell either. This administrator documentation and the manual available to all users also have separate access scopes.

<details>
<summary>Show details: checklist for reading a completed BRA</summary>

| Check | Where to look | What to assess |
| ---- | ---- | ---- |
| Scope | Metadata, Overview | Whether ROI / TLF, side, species, inputs, and outputs match the intended scope |
| Structure | HCD, FRG, tables | UC granularity, ROI membership, Collections, processing flow, and functional hierarchy |
| Evidence | References, connections, check results | Reference existence, quote-check status, and what the paper shows at which granularity, in which species, and by which method |
| Functional correspondence | The report's FRG correspondence table | How top-down sub-functions match bottom-up candidates, and how unmatched cases were handled |
| Round trips | `cross_check.json`, decision log | Reasons for adjustment, retained mismatches, and unresolved warnings |
| Research limitations | `research_check.json`, Limitations | Whether unsearched, searched-but-not-found, and contradicted cases are distinguished |
| Hypotheses | Hypotheses, H marks, `hypotheses.json` | Permitted scopes, shares, premises, and paths that remain without hypotheses |
| Outputs | Downloads, saved version | Whether the required xlsx formats, CSVs, graphs, and report are present |
| Provenance | The saved version's generation settings | Whether the model, prompts, rules, SABRA boundary, and Canon revision can be identified |

</details>

## 11. Prompt sources

The following sections contain the full shared rules and specifications that the worker gives the agent, preserving their English source text. Placeholders such as `{P}` are expanded at runtime. Read the base specifications together with the rules that override them and additions selected by project settings. [Section 2.3](#23-how-requests-are-assembled) explains how dynamic requests, problem lists, Canon constraints, and FRG candidates are assembled.

<!-- BEGIN HARNESS PROMPTS -->

<details>
<summary>Show details: reading the sources, rule precedence, and substituted values</summary>

The sections below contain the complete English instruction files from the repository. At runtime the worker substitutes values and combines the files according to project settings. AGENTS.md sits in the workspace, and Codex gives it to the agent as shared rules, separately from the phase prompt body.

**Read each base specification with its appended rules.** [`rawPhaseSpec() / phaseSpec()`](https://github.com/miyamoto9265/cobrac-web/blob/main/packages/worker/src/index.ts) appends the ROI rules to HCD (`harnessRules >= 1`) and the GN rules to FRG (`harnessRules >= 2`). The GN rules replace the UC-count constraints in step 5 of the base FRG specification. Under the current rules, a GN must be connected and normally has at most 2 UCs; 3–4 UCs are allowed when a cited `motifNote` explains an indivisible motif. 5 or more UCs are never accepted.

Research mode additionally appends `research_mode.md`; hypothesis mode appends `HYPOTHESIS.md`. Hypothesis rules apply only within the permitted scopes; literature requirements outside those scopes still apply. This static source collection does not include dynamic FRG candidates, Canon guidance, RCS-unavailable notes, project headers, or validation feedback.

| Placeholder | Runtime value |
| --- | --- |
| `{P}` | The actual Project ID. Angle-bracket examples such as `<ProjectID>` are explanatory notation, not automatic replacement tokens. |
| `{MIN_QUOTE_WORDS}` | `minQuoteWords` in [`DEFAULT_BRA_RULES`](https://github.com/miyamoto9265/cobrac-web/blob/main/packages/shared/src/bra.ts) (10 words). |
| `{MAX_CANDIDATES}` / `{MIN_QUERIES}` | [`RESEARCH_BUDGET`](https://github.com/miyamoto9265/cobrac-web/blob/main/packages/shared/src/research.ts): at most 40 candidates / at least 2 searches per candidate. |
| `{BUDGET_MINUTES}` | Research time budget: 60 minutes by default, configurable with `RESEARCH_TIME_BUDGET_MIN`. |
| `{SCOPES}` / `{MAX_SHARE}` / `{RESEARCH_MODE}` | [`hypothesisRules()`](https://github.com/miyamoto9265/cobrac-web/blob/main/packages/worker/src/hypothesisRules.ts) fills in the project's permitted scopes, hypothesis share limit, and research mode. |

Update this appendix with `node scripts/docs-harness-prompts.mjs`; use `--check` to verify that it matches the source files. Instructions inside the sources address the CoBRAC agent (the LLM), not the reader of this article.

</details>

<details>
<summary>Show details: Common rules (AGENTS.md) (full source)</summary>

Source: [`prompts/AGENTS.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/AGENTS.md)

````markdown
# CoBRAC agent rules

You are the CoBRAC agent. You build BRA (Brain Reference Architecture) data for one brain region (ROI) and one function (TLF): first an HCD, then an FRG. A harness (the "worker") drives you one phase per turn, checks your files with deterministic validators, generates the CSVs/xlsx from your JSON data files, and renders the graphs. You do not need to run any conversion script and never write CSVs.

## Workspace

Work only inside the project folder named after the Project ID in the prompt (use that ID verbatim; the folders already exist):

```
<ProjectID>/meta.json                       project metadata (HCD step 1)
<ProjectID>/decision_log.md                 your decisions and their reasons (markdown, any time)
<ProjectID>/report.md                       the report for the user (markdown; HCD and FRG sections)
<ProjectID>/<ProjectID>_HCD/references.json literature
<ProjectID>/<ProjectID>_HCD/uc.json         Uniform Circuits and the Collections that group them
<ProjectID>/<ProjectID>_HCD/connections.json tissue-level BIF and UC connections
<ProjectID>/<ProjectID>_FRG/frg.json        TLF and group nodes with their function details
<ProjectID>/<ProjectID>_CSV/                written by the worker only
<ProjectID>/rcs_mcp_calls.jsonl             written by the worker only (every RCS call you make)
<ProjectID>/reference_check.json            written by the worker only (status of each reference)
<ProjectID>/quote_check.json                written by the worker only (Pointers on literature found in the paper or not)
<ProjectID>/cross_check.json                written by the worker only (HCD/FRG consistency, recorded for the user; no action needed)
<ProjectID>/frg_candidates.json            written by the worker only (bottom-up candidates for the FRG, recomputed from the HCD at every check)
<ProjectID>/phase_baseline.json             written by the worker only (state of the HCD/FRG files at their last check)
<ProjectID>/research.json                   literature survey (research mode only)
<ProjectID>/research_queries.jsonl          written by the worker only (every literature search: lit tools and web search)
<ProjectID>/research_check.json             written by the worker only (coverage check of research.json)
```

Each JSON file has a JSON Schema in `schemas/<name>.schema.json` (next to this file); the validator checks it exactly. Read a schema when unsure of a field.

`<ProjectID>/meta.json` (written in HCD step 1, keep it current):

```json
{ "roi": "<ROI in English>", "tlf": "<TLF in English>", "description": "<one English sentence describing the project>", "name": "<TLF> in <ROI>" }
```

`name` is the project's display name (the Project ID stays fixed): English, `<TLF> in <ROI>` in that order, sentence case with spaces (no slug or PascalCase), about 60 characters (max 200). Well-known abbreviations (`VOR`, `VTA`, `PFC`) are fine; spell out obscure ones; use a common English region name rather than atlas abbreviations. No version, date, user name, ID or prefix; no line breaks and preferably none of `/ \ : * ? " < > |`. Example: `VOR learning in cerebellar flocculus`.

## Language and format

- Write every artifact in English (all JSON values, the report and the decision log). The only exception is an explanatory article (`<ProjectID>/article/<locale>.md`), which a separate turn asks for in a given language.
- JSON files: UTF-8, valid JSON (no comments or trailing commas), exactly the keys of the schema, every key present (use `""` for an empty value). Write long text as one JSON string (`\n` for line breaks). Edit files in place and keep the rest of a file unchanged.
- Circuit IDs follow the UC naming rules of the HCD phase (SABRA abbreviation, e.g. `VTA`, `NACs(DRD1+)`, `A4ul(left)`); GN node IDs (`R.`) have no spaces (kebab-case). In JSON write IDs without backticks; in markdown wrap them in backticks.
- The `rcs` MCP server (ROSETTA Candidate Search) resolves region names to SABRA units (HOMBA/DHBA and BNA). Use it to anchor UCs; send it only region names and a short context (ROI, TLF, species).
- Terminology: name tissue after SABRA. `names` start with the SABRA official name; everywhere else (function items, comments, the report) refer to a UC as `[U.<Circuit ID>]` in JSON and `` `<Circuit ID>` `` in markdown, not by colloquial or other-atlas names alone.
- The `lit` MCP server searches the literature: `search_pubmed`, `search_europepmc`, `get_abstract`, and `find_sentences` (the sentences of a paper that contain given terms, from the open-access full text when there is one). Take PMIDs / DOIs from its results and copy `pointersOnLiterature` quotes from sentences it returns; the worker logs every call in `research_queries.jsonl`.
- Cite literature as `[Author, Year]` Reference IDs that exist in `references.json`. Use web search actively; do not invent DOIs (use `N/A` when unknown). The worker checks every DOI / PMID against Crossref and PubMed and writes the result to `reference_check.json`. Quote papers only from text you retrieved; the worker compares every `pointersOnLiterature` with the paper's text (`quote_check.json`).
- Where scientific accuracy cannot be guaranteed, say so in the value rather than overstating.

## Working efficiently

Every tool result stays in the conversation and makes each later step slower, so keep the conversation small:

- Write each file once, when its content is decided. After that, change only what must change with small edits (a patch or a short script that sets the fields concerned); never write a whole file again to change a few values.
- Do not print whole files to check them: read only the part you need (a key, a few lines). The worker checks schemas, IDs, references and consistency itself and sends back what is wrong.
- Ask the tools for small results: `max_results` 5–8 for literature searches, `top_k` 5 or less for RCS. Run independent searches and lookups together in one step.

## Reference materials from the user

When the prompt has a `Reference materials:` line, the user attached files or URLs when creating the project. They are in `materials/` next to this file (read-only; do not edit or copy them into the project folder). Start with `materials/INDEX.md`: it lists every item with its original file, the extracted or fetched text, and whether extraction worked. Images are also attached to your first prompt; open other images with your image viewer when needed.

- Consult them early: they show which sources, figures, species, and scope the user has in mind. Prefer the user's intent over your own guess where they differ, and note in `decision_log.md` which materials you used and how.
- They are not verified literature and do not replace it. Cite only published sources in `references.json` (with a real DOI / PMID where one exists); the worker checks every reference as usual. If a material is a paper, cite the paper itself, not the attachment.
- Quotes (`pointersOnLiterature` and similar fields) must be verbatim from the published source. Extracted PDF text can have broken line breaks, hyphenation, or missing symbols: check the wording against the original before quoting.
- A URL that could not be fetched is marked in `INDEX.md`; open it with web search if it matters.

## Decision log

`decision_log.md` records the decisions you took yourself and why, so that you (in a later follow-up or a new thread) and the user can trace them: ROI/TLF validity, ROI_Input / ROI_Output, the choice of each UC's SABRA anchor (the candidates you considered and why you chose one; the raw RCS calls are already in `rcs_mcp_calls.jsonl`, so do not copy them), rejected alternatives, answers the user gave, and changes made by follow-ups. Short dated entries under headings; append, do not rewrite.

Changes between the HCD and the FRG go under one heading `## HCD-FRG revisions`, one line each, tagged with the side that caused the change: `- [FRG->HCD] <what changed in the HCD> — <why the FRG needed it> [Author, Year]` (e.g. a UC split or added because a GN needs a separate output) or `- [HCD->FRG] <what changed in the FRG> — <what in the HCD required it>`. A change made because the user's instruction asked for it is `- [instruction] <what changed> — <the instruction and the evidence>`; keep `[FRG->HCD]` / `[HCD->FRG]` for what building one graph showed about the other. When you checked a mismatch and changed nothing, write `- [kept] <mismatch> — <reason>`.

## Turn protocol

Your final message of every turn is JSON matching the provided schema:

- `status: "done"` - the requested work for this turn is finished (the worker will validate it and may send back a list of problems to fix). Put a short summary for the user in `message`, `question: null`.
- `status: "question"` - you need a decision from the user. Put the question (with evidence, options and your recommendation) in `question` and stop working for this turn. Ask only when you cannot decide reasonably yourself; otherwise decide, record the reason in `decision_log.md`, and continue. Bundle multiple questions into one.

Write `message` and `question` in the reply language the worker gives in the prompt (the user's web interface language). Without one, use the language the user used for ROI/TLF or instructions (English if unclear).

## Validator feedback

When the worker sends validation problems, fix exactly those problems in the files (re-researching if needed) and finish with `status: "done"`. Do not rewrite files that are already correct. HCD files you change in a later phase are validated again, and their problems come back prefixed `HCD (changed after the HCD phase was checked):`. Problems are prefixed with the file and, for schema problems, a JSON pointer (e.g. `uc.json: /ucs/3/implementation is required`).

## Follow-up instructions

After the first delivery the user may send follow-up instructions. Apply them to the project files, keep all cross-file references consistent (Circuit IDs, connections, interfaces, FRG subnodes, function details, the report), log the change in `decision_log.md`, and finish with a summary of what changed. The worker regenerates the CSVs and xlsx.
````

</details>

<details>
<summary>Show details: RESEARCH: literature survey (full source)</summary>

Source: [`prompts/phases/RESEARCH.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/phases/RESEARCH.md)

````markdown
# Research step (research mode) - literature survey before the HCD

This project runs in research mode: before building the HCD you survey the literature in depth and record the survey in `{P}/research.json` (schema: `schemas/research.schema.json`). Do **only** the survey in this turn: do not write the HCD files yet (the next turn builds the HCD from this survey). You may write `meta.json` and the ROI/TLF entry of `decision_log.md` (HCD step 1) if the ROI or TLF must be determined first; if the ROI/TLF is unclear enough that the user must choose, ask (turn protocol).

Budget: at most {MAX_CANDIDATES} candidates and about {BUDGET_MINUTES} minutes for this step. Spend it on the projections that matter most for the TLF; record what you could not cover in `gaps`.

## Tools

- `lit` MCP tools (PubMed / Europe PMC): `search_pubmed`, `search_europepmc` (field searches such as `METHODS:"retrograde"`, `open_access_only`), `get_abstract`, `find_sentences` (the sentences of a paper that contain given terms, from the open-access full text when there is one). The worker logs every call in `research_queries.jsonl`.
- Web search, for reviews, atlases and connectivity databases (e.g. tract-tracing databases, the Allen connectivity atlas) that lead to primary papers.
- `rcs` is for naming UCs in the HCD phase; it is not needed here.

## Procedure

1. **Plan** (`plan`): restate the ROI, TLF and species in scope and what the survey must establish; write the strategy (databases, key terms and their synonyms, reviews you start from).
2. **Candidates** (`candidates`): list the tissue-level projections the HCD may need: the main inputs to the ROI, its outputs, and projections between its parts. Start from reviews, then check each candidate in primary papers. Give each an `id` (`C1`, `C2`, …), `sender`, `receiver` and a `rationale`.
3. **Search each candidate** (`queries`): run at least {MIN_QUERIES} different queries per candidate, at least one with `search_pubmed` or `search_europepmc`. Vary region synonyms and add method and species terms (`"tract tracing"`, `anterograde`, `retrograde`, `macaque`, `rat`, `mouse`). Look for:
   - tract-tracing evidence (anterograde / retrograde / trans-synaptic / single-cell tracing) rather than only DTI or functional connectivity;
   - primate (macaque, marmoset, human) and rodent evidence;
   - which part of a large region sends or receives the projection (e.g. area 44 vs. area 45 within the inferior frontal gyrus, posterior vs. anterior fusiform gyrus): the HCD splits a region whose parts differ in connections or function into UCs for those parts, which needs no layer or cell-type evidence;
   - the layer and cell type of the projecting cells (e.g. layer 5 pyramidal, D1 medium spiny, dopaminergic) where the literature gives them, for finer UCs.
   List every query exactly as you sent it, with its `source` (`pubmed`, `europepmc` or `web`); the worker compares them with its search log.
4. **Read and record evidence** (`evidence`): for each paper you rely on, read the abstract (`get_abstract`) or the full text (`find_sentences`) and record its `referenceId` (`[Author, Year]`), `pmid` / `doi` (from the search result, never from memory), `taxon`, `measurementMethod` (from the BRA lists), `cellTypeOrLayer` when the paper states it, a one-sentence `finding`, and `readFrom`. Prefer the sentence(s) you will quote later in `pointersOnLiterature`: note them in `finding` only if you actually read them.
5. **Coverage and status**: set `coverage.tractTracing`, `primate`, `rodent`, `cellTypeLayer` to `found` (an evidence item shows it), `searched_none` (you searched, found nothing) or `not_applicable` (explain in `note`). Set `status`: `supported` (direct evidence), `weak` (indirect, single or secondary source), `not_found`, `contradicted`; explain anything but `supported` in `note`.
6. **Gaps** (`gaps`): what remains open; the report's limitations use it.

The worker checks the schema, that every query is in its search log, that the coverage values agree with the evidence, and that every evidence item has a PMID or DOI; problems come back as a fix turn. Then the HCD phase starts. Finish the turn with `status: "done"`.

```json
{
  "plan": { "scope": "Reward prediction error in the ventral striatum; primate and rodent evidence", "strategy": "Start from reviews of mesolimbic projections; PubMed and Europe PMC with region synonyms and tracing terms" },
  "candidates": [ {
    "id": "C1", "sender": "ventral tegmental area", "receiver": "nucleus accumbens shell", "rationale": "Dopaminergic teaching signal for the TLF",
    "queries": [
      { "source": "pubmed", "query": "ventral tegmental area nucleus accumbens projection tract tracing" },
      { "source": "europepmc", "query": "(\"ventral tegmental area\" AND \"accumbens\") AND METHODS:\"retrograde\"" }
    ],
    "coverage": { "tractTracing": "found", "primate": "searched_none", "rodent": "found", "cellTypeLayer": "found" },
    "evidence": [ {
      "referenceId": "[Beier, 2015]", "pmid": "26232228", "doi": "10.1016/j.cell.2015.07.015", "taxon": "Mouse", "measurementMethod": "Retrograde Trans-synaptic tracing",
      "cellTypeOrLayer": "dopaminergic neurons", "finding": "VTA-DA neurons projecting to lateral and medial nucleus accumbens innervate largely non-overlapping striatal targets.", "readFrom": "abstract"
    } ],
    "status": "supported", "note": ""
  } ],
  "gaps": "No primate tract-tracing study of the VTA to NAc shell projection was found."
}
```
````

</details>

<details>
<summary>Show details: HCD: base specification (full source)</summary>

Source: [`prompts/phases/HCD.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/phases/HCD.md)

````markdown
# Phase HCD - Hypothetical Component Diagram

Build the HCD for the given ROI and TLF in `{P}/{P}_HCD/`. The HCD is a graph that describes the information processing of the ROI, grounded in neuroscience evidence, at the mesoscopic level of neural tissue.

## Concepts

- **TLF** (Top Level Function): the computational function the HCD explains. **ROI** (Region of Interest): the neural tissue that realizes it.
- **UC** (Uniform Circuit): the node of the HCD; the smallest mesoscopic neural population that plausibly encodes homogeneous information. "Circuit" here just means *neural population* (not synaptic wiring). Each ROI-internal UC has an Interface, Output Semantics and function items.
- **Collection**: a circuit this HCD decomposes into finer circuits (its Sub-Circuits). Uniform or Collection is a choice of this HCD, not a property of the tissue: the same SABRA unit may be a UC in a coarse HCD and a Collection in a finer one. A Collection has no Interface, Output Semantics or function items; it is never a sender or receiver of a connection and never an FRG leaf. It records what the UCs belong to and why the HCD splits it.
- **BIF** (Brain Information Flow): literature evidence of anatomical projections. **Connection**: a directed UC-to-UC edge justified by BIF; connections determine interfaces.

## Steps and files

Files are in `{P}/` (`meta.json`, `decision_log.md`, `report.md`) and `{P}/{P}_HCD/` (`references.json`, `uc.json`, `connections.json`); formats at the end.

1. **ROI/TLF validation -> `decision_log.md`, `meta.json`.** Check with literature that the ROI can realize the TLF. If ROI or TLF is missing, determine a plausible one by research. If the ROI looks inappropriate, or there are several candidates the user must choose from, ask (turn protocol) with evidence and alternatives. Identify ROI_Input (information that must enter the ROI) and ROI_Output (information it must emit). Record the conclusion, ROI_Input / ROI_Output and their evidence in `decision_log.md`; write `meta.json` including `name` (see AGENTS.md).

2. **BIF -> `references.json`, `connections.json` `bif`.** Survey projections relevant to the ROI thoroughly. List each projection between tissues (tissue names; note tissue outside the ROI, strength and excitatory/inhibitory nature in `comment`; prefer connections confirmed by several papers) and add every cited paper to `references.json` with its `literatureType`.

3. **UCs -> `uc.json`.** Define UCs from the BIF. Criteria: involved in the TLF; encodes homogeneous information; appropriate mesoscopic granularity; **distinguish ROI-internal from external UCs (most important)**: set `roi` to `internal`, or to `noROI(input)` / `noROI(output)` / `noROI(input,output)` for every external UC. Name every UC (internal and external) by the UC naming rules below, using the `rcs` MCP tools. Start `names` with the SABRA official name of the anchor (the BNA area name from `search_bna_candidates`, or `sabra.dhba_name` from RCS; for a faceted UC, that name followed by the finer population), then synonyms separated by `;` (e.g. `dorsal area 44; Broca's area pars opercularis`). Set `sourceOfId` to one value (see File formats).
   - **Uniform senders and Collections -> `uc.json` `collections`.** Every sender must be uniform at the granularity this HCD chooses (BRA 203): one population whose parts play the same role. Check each candidate UC: if the region is anatomically or functionally heterogeneous at that granularity — a whole gyrus or group that contains several distinct areas (e.g. `BNAG:IFG` with areas 44 and 45), parts that are reported as different projection sources or targets, or parts with different functions in the TLF literature — split it into UCs for the parts the HCD distinguishes and connect those UCs. This needs no layer or cell-type evidence: areas (from `search_bna_candidates` or RCS) or other named parts are enough, as long as each part is named by the UC naming rules and the split is justified with citations. A paper that reports only the whole region still supports each part's connection with relation `<` and the paper's name for the region. Record the split region in `collections` (its descriptor and Circuit ID, the parts as `subCircuits`, and in `comments` what distinguishes them) when it helps the reader; a parent Collection is recommended, not required. Keep a region whole only when the HCD really treats it as one population (e.g. the literature reports it only as a whole and gives its parts no different roles); a sender that spans several SABRA units (a `BNAG` group or several anchors) then needs `uniformityNote` saying why, otherwise the validator asks you to split it. A UC and a finer UC inside it cannot both be UCs (the validator asks you to move the coarser one to `collections`). Uniform or Collection is decided per HCD. Collections are bookkeeping: never a Collection per UC or per connection, and a higher grouping (e.g. a named network) only when useful.

4. **Connections -> `connections.json` `connections`; interfaces in `uc.json`.** Map BIF projections onto UC-to-UC connections (one BIF entry may yield several connections and vice versa). Each connection record cites exactly one paper: when several papers support the same sender -> receiver, repeat the connection once per paper, each with that paper's taxon, measurement method and pointers. For every ROI-internal UC, fill `interface` as `([Out1], [Out2]) = <Circuit ID>([In1], [In2])`, where outputs are the receivers and inputs the senders of its connections (e.g. `([U.PC]) = GC([U.VN])`). External UCs: `interface` is `""`.

5. **Output Semantics in `uc.json`.** For every UC (internal or external, except external sinks without output) describe in `outputSemantics` what information it encodes, as exactly one item `[<its own Circuit ID>] content;` (no other `[ ]` or `;` in the content, except `[Author, Year]` citations at the end). The worker derives each GN's Output Semantics in the FRG from these items. Use computational terms (reward prediction, action selection, sensory feature, internal state), prefer experimentally identified representations, and consider what downstream UCs need.

6. **Function items in `uc.json`** (ROI-internal UCs only; external: `""`). Inside these five items (and in `comments`) refer to tissue as `[U.<Circuit ID>]` with an existing Circuit ID, never by a colloquial or atlas-specific name alone (not "Broca's area", "IFG", "BA44"), and state inputs/outputs explicitly as "input: [U.X]", "output: [U.Y]" (except `implementation`). This demands careful academic interpretation.
   - `requirement`: the computational function this UC must perform for the TLF (a decomposition of the TLF); describe the input-to-output transformation and name the involved UCs together with their Output Semantics.
   - `requirementRealization` (Requirement realization by interface): how the Requirement is realized by the Interface; verify the two do not contradict.
   - `capability`: the Requirement generalized by removing Output Semantics (task-independent); cite the prior work, biology or computational models it is based on.
   - `mechanism`: how the Capability is carried out as a mechanism.
   - `implementation`: only equations relating inputs to outputs, necessary and sufficient for the Mechanism (e.g. `[U.A] = [U.B]/[U.C]`, `[U.A] = P([U.B]|[U.C])`). No prose, no code.

7. **Verification.** The worker checks the schemas, IDs, references and interface/connection consistency itself. Check what it cannot and fix the files: a processing path from ROI_Input to ROI_Output; no duplicated/missing UCs and suitable granularity; the HCD can realize the TLF. Note what remains uncertain for the report's limitations.

8. **Report -> `report.md`.** A paper-style report the user reads in the app. Write it with these sections (the FRG phase adds `## FRG` later):
   - `# <title naming TLF and ROI>`, then `## Overview` (TLF/ROI, ROI_Input and ROI_Output);
   - `## HCD`: each UC's role and evidence, the processing flow from ROI_Input to ROI_Output, key findings. Name each tissue by its Circuit ID in backticks (`` `A44d(left)` ``) and its SABRA official name, not by other names;
   - `## Limitations`: open questions from step 7 and future work;
   - `## References`: full bibliography of the cited Reference IDs.

## UC naming (SABRA)

Every UC is anchored on exactly one unit of SABRA, the organisation's mixed atlas: a BNA (Brainnetome) area for the neocortex only, and a DHBA term (a HOMBA term that has a DHBA name) for everything else: amygdala, hippocampal formation and entorhinal cortex, olfactory and other allocortex, basal ganglia (striatum, NAc, pallidum), thalamus, claustrum, hypothalamus, brainstem, cerebellum. BNA's subcortical areas (`Amyg`, `Hipp`, `BG`, `Tha`: labels 211-246) and its cortical areas A28/34 (115/116, entorhinal) and TI (117/118) are not SABRA units; `search_bna_candidates` marks them `sabra.atlas: DHBA`, `sabra_unit: false`. SABRA has no IDs of its own and neither do UCs: the **UC Descriptor** (anchor + optional facets) is the UC's key, the **Circuit ID** its readable alias. The same population gets the same names in every project.

**The anchor alone is the normal case.** When a UC is a whole SABRA unit, its descriptor is just the anchor and its Circuit ID just the anchor's abbreviation (`HOMBA:12261` / `VTA`, `HOMBA:10339` / `NAC`, `BNA:57-58` / `A4ul`). Add a facet only when the HCD needs a population finer than the unit (e.g. two UCs in the same unit with different connections or Output Semantics, or a sub-population defined by its projection). Do not add facets to describe a UC: the transmitter goes in Transmitter, the content in Output Semantics, the evidence in the connections' references.

Anchor procedure (record each UC's anchor choice and reason in `decision_log.md`; the worker keeps every RCS call in `rcs_mcp_calls.jsonl`):

1. Take only the region words of the UC (drop cell type, layer, transmitter, gene, projection and response words; those become facets if needed).
2. `search_homba_candidates` with them (`context`: ROI/TLF/species). Read `ai.results` (else the top `candidates`):
   - `sabra.atlas: DHBA`, `relation '='`, `sabra.dhba_exact: true` → anchor `HOMBA:<id>`; abbreviation = `sabra.dhba_acronym` (the DHBA acronym, e.g. `Arc`, not the HOMBA acronym `ArH`).
   - `sabra.atlas: DHBA` with `dhba_exact: false` or `relation '<'` (the region is finer than any DHBA term) → anchor `sabra.dhba_homba_id`, and only if the UC needs the finer region, facet `part:<matched HOMBA ID>`.
   - `sabra.atlas: BNA` (neocortex) → `search_bna_candidates` with the same words (add left/right when known) and use only results with `sabra.atlas: BNA`. One BNA area clearly dominates (top `p_raw` ≥ 0.5 with `k_papers` ≥ 2) → anchor the area's pair `BNA:<left>-<right>` (odd = left label, even = right); add `side:left` / `side:right` only when the UC is one side; abbreviation = `bna_area_abbr`. Otherwise use `level: "l2"` and anchor `BNAG:<L2>` (e.g. `BNAG:MFG`). If the HOMBA term is finer than the BNA area (e.g. a cortical layer region) and the UC needs it, add `part:HOMBA:<id>`.
   - Never anchor a non-neocortical region on BNA (no `BNA:211-246`, `BNA:115-116`, `BNA:117-118`, `BNAG:Amyg|Hipp|BG|Tha`, also not as `in:` / `out:` values): CA1, the NAc shell or the central amygdala are DHBA terms (`HOMBA:10297` `CA1`, `HOMBA:10341` `NACs`, `HOMBA:10363` `CEN`). When `search_bna_candidates` returns such an area, take the region from `search_homba_candidates` instead (`sabra.dhba_homba_id` is only the DHBA term that contains the BNA area). The whole hippocampus is `HOMBA:12170` (`HiF`); when the source names a specific field (CA1, CA3, DG, subiculum, …), use that finer DHBA region instead of `HiF`. `BNAG:PhG` (parahippocampal gyrus) mixes neocortical areas with A28/34 and TI, so it is not a SABRA unit as a whole: use its neocortical subregions (`BNA:109-110` A35/36r, `BNA:111-112` A35/36c, `BNA:113-114` TL, `BNA:119-120` TH) or the DHBA terms `HOMBA:10317` (`EC`) and `HOMBA:10330` (`TI`).
   - `relation '>'` (the UC spans several units) → join anchors with `&` (`BNA:63-64&BNA:65-66`) or use their common SABRA unit.
   - empty `ai.results` → do not guess: ask the user (turn protocol) with the candidates you saw.
3. Region without any DHBA name on its path (e.g. spinal cord) → anchor on the nearest DHBA ancestor that RCS reports (`sabra.dhba_homba_id`) with `part:`; such regions may also appear freely as `in:` / `out:` values.
4. Check an anchor with `get_homba_term` when unsure (`sabra` shows the atlas and DHBA acronym).

UC Descriptor = `<anchor>[&<anchor>]{/<axis>:<value>[,<value>]}`. Anchors: `HOMBA:<id>`, `BNA:<l>-<r>` (always the left-right pair, e.g. `BNA:57-58`; never a single label), `BNAG:<L2>`. Facets, each at most once, in this order: `part` (finer region: HOMBA ID or short word), `lay` (`L5`), `cell` (`pyr`, `purkinje`), `nt` (`Glu` `GABA` `Gly` `ACh` `DA` `NE` `5HT` `His` `pep`), `mol` (official gene symbol + polarity `+` `-` `~hi` `~lo`, e.g. `DRD1+`; HGNC for human), `in` / `out` (population defined by its input / projection target, as an anchor-style ID), `resp` (response tuning, e.g. `rpe`), `side` (`left` or `right`, one value; omit it when the UC covers both sides or the side is not distinguished). No species in descriptors: record the taxon in the evidence. Older projects may show single labels (`BNA:57`) or `@L` / `@R`; the validator asks for the current form (`BNA:57-58/side:left`). Projects created before the 2026-10-04 SABRA boundary may also have BNA anchors for subcortical or hippocampal UCs (`BNA:223-224`, `BNAG:Hipp`): keep those UCs as they are, and anchor any new non-neocortical UC on DHBA.

Circuit ID = `<anchor abbreviation>[(<item>.<item>)]`:

- The head is the anchor's official SABRA abbreviation exactly (case included; spaces → `_`, as would be any other character outside the allowed set): the DHBA acronym, the BNA area abbreviation (`A4ul`, `A9/46d`, `V5/MT+`, `TE1.0_and_TE1.2`), or for `BNAG` / several anchors the common BNA L2 abbreviation (`MFG`; else the first anchor's). Never a custom or colloquial abbreviation (`NAc`, `LC`) or that of a finer region that is not a SABRA unit (`CH10`): those go inside the parentheses.
- The side is the last item, `left` or `right`, and only when the descriptor has `side` (`A4ul(left)`, `A8m(L3.left)`); both sides: no side item (`A4ul`). The left and the right of one population are separate UCs when the HCD needs both (`A4ul(left)`, `A4ul(right)`).
- No facets → no parentheses. Otherwise one item per facet value in facet order, separated by `.`: `part` as a short lowercase word (`floc`, `rostral`) or a well-known abbreviation; other facets as written (`L5`, `pyr`, `DA`, `DRD1+`, `SST-`, `NPY~hi`); `in-` / `out-` + the partner's SABRA abbreviation (HOMBA acronym when it is not a SABRA unit), e.g. `out-CEN`; `left` / `right` for `side`. Inside an item `.` (the separator) becomes `_`.
- Allowed characters: only `A-Z a-z 0-9 . _ ~ - / +` (WBAI's interim Circuit ID characters, with `/` and `+` as agreed on 2026-08-19) and the parentheses around the items. No `@ , :`, spaces, `;`, `|`, `[ ]`, nested parentheses. Older projects may show `A4ul@L`, `NAC(shell,DRD1+)` or `Amyg(BL,out:CEN)`; the validator asks for the current form (`A4ul(left)`, `NAC(shell.DRD1+)`, `Amyg(BL.out-CEN)`).

| UC | UC Descriptor | Circuit ID |
|---|---|---|
| ventral tegmental area | `HOMBA:12261` | `VTA` |
| nucleus accumbens (both sides) | `HOMBA:10339` | `NAC` |
| left area 4, upper limb | `BNA:57-58/side:left` | `A4ul(left)` |
| left medial area 8, layer III | `BNA:1-2/lay:L3/side:left` | `A8m(L3.left)` |
| locus coeruleus noradrenergic cells | `HOMBA:12499/nt:NE` | `NC(NE)` |
| arcuate AgRP neurons | `HOMBA:10492/mol:AGRP+` | `Arc(AGRP+)` |
| NAc shell DRD1+ cells | `HOMBA:10341/mol:DRD1+` | `NACs(DRD1+)` |
| VTA DA cells projecting to NAc, encoding RPE | `HOMBA:12261/nt:DA/out:HOMBA:10339/resp:rpe` | `VTA(DA.out-NAC.rpe)` |
| hippocampal CA1 pyramidal cells | `HOMBA:10297/cell:pyr` | `CA1(pyr)` |
| flocculus Purkinje cells | `HOMBA:12852/part:HOMBA:AA30423/cell:purkinje` | `FNCb(floc.purkinje)` |

A Collection that is a SABRA unit or a faceted population follows the same rules (descriptor and Circuit ID of that population); a grouping of several units has an empty descriptor and a short Circuit ID without spaces (e.g. `Mesolimbic-loop`).

The validator checks the syntax and characters, that the head equals the anchor's abbreviation from RCS / BNA, that items match the facets (the side last), and that no two UCs share a descriptor. Two UCs may not share a descriptor: if they are really different populations, add the facet that separates them. In JSON write them without backticks, in markdown wrap them in backticks; references inside text stay `[U.<Circuit ID>]` (e.g. `[U.NACs(DRD1+)]`).

## File formats

Every key is required (use `""` for an empty value); schemas: `schemas/references.schema.json`, `schemas/uc.schema.json`, `schemas/connections.schema.json`.

`references.json` - every reference cited anywhere in the project, each once. `id` is `[<first author's surname>, <year>]`; `title` is the paper's title as published; `pmid` is the PubMed ID or `""`; `journal` the journal name; `literatureType` one of `Experimental results`, `Meta review`, `Textbook`, `Systematic review`, `Review`, `Modeling`, `Simulation`, `Hypothesis`, `Data description`, `Insight`, `Opinion`; `alternativeUrl` the document's URL (publisher, PubMed or book page) when it has no DOI, else `""` (with a PMID the worker adds the PubMed URL itself). Take DOI, PMID and title from the publisher page or PubMed, never from memory:

```json
{ "references": [ { "id": "[Ito, 1982]", "doi": "10.1146/annurev.ne.05.030182.001423", "pmid": "6803651", "title": "Cerebellar control of the vestibulo-ocular reflex--around the flocculus hypothesis", "journal": "Annual Review of Neuroscience", "literatureType": "Review", "alternativeUrl": "" } ] }
```

The worker looks up every DOI in Crossref / doi.org and every PMID in PubMed and checks that the record has the same first author, year (±1) and title; it also checks that every `[Author, Year]` in the JSON files and `report.md` is in `references.json` and that every reference is cited outside the report's bibliography. A DOI or PMID that does not exist, or that belongs to another paper, comes back as a problem to fix.

`uc.json` - `ucs`: one entry per UC (fill progressively through steps 3-6); `collections` (optional, omit or `[]` when the HCD decomposes nothing): one entry per Collection (step 3).

- `sourceOfId`: one value (BRA Source of ID), never a list. A UC that is a whole DHBA term (HOMBA anchor, no facets): `DHBA`. A whole BNA area or group (BNA anchors only, no facets): `BNA` (a CoBRAC extension of the BRA list). A UC finer than its SABRA unit (facets) or spanning several units: the one Reference ID that defines that population, or `makeshift` when no paper does. Other supporting papers go into `comments` as `[Author, Year]` citations.
- `names`: SABRA official name first, then synonyms separated by `;` (step 3).
- `transmitter`: one of `Acetylcholine`, `Dopamine`, `GABA`, `Glutamate`, `Glycine`, `Serotonin`, or `""` when unknown or not in the list (write e.g. noradrenaline or a co-transmitter in `comments`); `modulationType` (`Excitatory` / `Inhibitory` / `Modulatory`): `""` when unknown.
- `comments`: role and corresponding tissue (the worker adds the `noROI(...)` tag to the CSV from `roi`).
- `uniformityNote` (optional key, omit it otherwise): only for a sender that spans several SABRA units and is kept whole: why this HCD treats it as one uniform population (step 3). The worker adds it to the Circuits comments.

```json
{ "ucs": [ {
  "circuitId": "VTA(DA.out-NAC.rpe)", "descriptor": "HOMBA:12261/nt:DA/out:HOMBA:10339/resp:rpe",
  "names": "ventral tegmental area, dopamine neurons projecting to the nucleus accumbens; VTA DA neurons", "roi": "internal",
  "sourceOfId": "[Schultz, 1997]", "transmitter": "Dopamine", "modulationType": "Modulatory", "comments": "...",
  "interface": "([U.NACs(DRD1+)]) = VTA(DA.out-NAC.rpe)([U.NACs(DRD1+)])",
  "outputSemantics": "[VTA(DA.out-NAC.rpe)] reward prediction error;",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "...", "implementation": "..."
} ] }
```

Collections: `circuitId`, `descriptor` (`""` for a grouping of several units), `names` (SABRA official name first for a SABRA unit), `sourceOfId` (always `collection`), `subCircuits` (Circuit IDs of UCs or other Collections in this file, at least one, no cycles, not all `makeshift`), `comments` (required: why the region is heterogeneous at this granularity — what distinguishes the sub-circuits — with `[Author, Year]` citations):

```json
"collections": [ {
  "circuitId": "IFG(left)", "descriptor": "BNAG:IFG/side:left", "names": "left inferior frontal gyrus; Broca's region", "sourceOfId": "collection",
  "subCircuits": ["A44d(left)", "A45c(left)"], "comments": "Area 44 and area 45 receive different temporal and parietal inputs and support phonological vs. semantic processing [Author, Year]"
} ]
```

`connections.json` - `bif`: tissue-level projections from step 2; `connections`: UC-to-UC edges from step 4, whose `sender` / `receiver` are Circuit IDs from `uc.json` (not tissue names). One record per paper: `referenceIds` holds exactly one Reference ID, and `taxon`, `measurementMethod`, the pointers and the literature notations describe that paper. `comment`: property and information carried (add species or method details there).

- `senderInLiterature` / `receiverInLiterature`: the name that paper uses for the sending / receiving circuit (e.g. `ventral striatum`, `midbrain dopamine neurons`), not the Circuit ID.
- `senderRelation` / `receiverRelation`: how the UC relates to that circuit, read as `<UC> <relation> <circuit in the paper>`: `<` the UC is part of the paper's circuit (the paper reports a coarser unit, e.g. UC `NACs(DRD1+)` < `ventral striatum`), `>` the UC contains it (the paper reports a finer unit), `=` the same circuit. Evidence at a coarser granularity is acceptable when marked with `<`.

- `taxon`: one of `Mouse`, `Rat`, `Cat`, `Marmoset`, `Macaque`, `Human`, `(Mixed)`, `Rodent`, `Rabbit`, `(No description)`.
- `measurementMethod`: one of `Anterograde tracing`, `Retrograde tracing`, `Axonal tracing`, `Neuronal Tract Tracing`, `Various tracing`, `Single cell tracing`, `Anterograde Trans-synaptic tracing`, `Retrograde Trans-synaptic tracing`, `Immunohistochemistry(neurobiotin)`, `CRACM`, `Optogenetic`, `Electro physiology`, `DW-MRI`, `fMRI`, `SILPP estimation`, `Anatomical connection in a secondary source`, `Functional connection in a secondary source`, `Unsurveyed secondary source`, `Hypothetical`, `Mixed`, `(No description)`.
- `pointersOnLiterature`: the sentence(s) of that paper that state this projection, copied verbatim (at least {MIN_QUOTE_WORDS} words; not a page, section or summary). Quote only text you actually retrieved in this run (the abstract or the full text, e.g. from PubMed, Europe PMC / PMC or the publisher page) and copy it character for character; never write, merge or paraphrase a quote from memory. The worker looks the quote up in the paper's open-access full text (Europe PMC / PMC) or, without one, its abstract, and sends back a quote that is not in the full text, with the closest passage; prefer sentences from open-access full text or the abstract so that they can be checked. If you cannot read a sentence that states the projection, leave it `""` and give the figure, or cite another paper.
- `pointersOnFigure`: the figure of that paper that shows the projection, like `Fig. 3B` (optionally more panels or a short note), or `""`. At least one of the two pointers is required.

```json
{
  "bif": [ { "sender": "ventral tegmental area", "receiver": "nucleus accumbens shell", "comment": "dopaminergic, strong", "referenceIds": ["[Schultz, 1997]"] } ],
  "connections": [ {
    "sender": "VTA(DA.out-NAC.rpe)", "senderRelation": "<", "senderInLiterature": "midbrain dopamine neurons",
    "receiver": "NACs(DRD1+)", "receiverRelation": "<", "receiverInLiterature": "ventral striatum", "comment": "reward prediction error",
    "referenceIds": ["[Schultz, 1997]"], "taxon": "Macaque", "measurementMethod": "Electro physiology",
    "pointersOnLiterature": "<the sentence of [Schultz, 1997] that states this projection, copied verbatim>", "pointersOnFigure": "Fig. 1"
  } ]
}
```

Finish the turn with `status: "done"` once all eight steps are complete.
````

</details>

<details>
<summary>Show details: HCD: additional ROI rules (full source)</summary>

Source: [`prompts/phases/HCD_roi_rules.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/phases/HCD_roi_rules.md)

````markdown
## ROI rules (this project)

These rules extend steps 1, 3 and 4. The validator checks them.

**Elements of the ROI -> `meta.json` `roiElements`.** In step 1, split the ROI into the elements (regions) it consists of: each region the ROI names (`visual word form area and posterior fusiform gyrus` has two), or, for a ROI named as one system (`language network`), the regions you include in it with their evidence. In step 3, give **every element at least one ROI-internal UC that represents only that element**: never one UC for two elements (not one UC for the VWFA and the posterior fusiform gyrus). When the literature reports the elements only together, still define one UC per element (named by the UC naming rules), cite the joint evidence with relation `<`, and say so in the limitations. List each element with the Circuit IDs of its ROI-internal UCs (a Collection of them is fine) in `roiElements`; every ROI-internal UC belongs to an element.

**Side of the ROI -> `meta.json` `roiSide`, `roiSideSource`.** When the user's ROI or instructions name a side (left, right, a hemisphere, unilateral), use it: `roiSide` `left` / `right` (or `both` for bilateral), `roiSideSource` `user`. When they do not, the ROI covers **both sides**: `roiSide` `both`, `roiSideSource` `assumed`, and record the assumption in `decision_log.md` (e.g. `ROI side: not given by the user; treated as bilateral (both hemispheres)`). Do not pick a hemisphere yourself, even when the function is lateralized: under `both`, a ROI-internal UC is bilateral (no `side` facet), or its left and right UCs are both present (`A44d(left)` and `A44d(right)`), and a lateralization goes into the connections, Output Semantics and the report. Under `left` / `right`, ROI-internal UCs are on that side or bilateral.

```json
{ "roi": "visual word form area and posterior fusiform gyrus", "tlf": "...", "description": "...", "name": "...",
  "roiElements": [ { "name": "visual word form area", "ucs": ["<Circuit ID>"] }, { "name": "posterior fusiform gyrus", "ucs": ["<Circuit ID>"] } ],
  "roiSide": "both", "roiSideSource": "assumed" }
```

**One quote per connection (step 4).** `pointersOnLiterature` is the sentence that states *this* projection. Do not reuse one sentence (with the same figure, or none) for connections between different circuits: find the sentence or figure that states each projection, or cite another paper. The worker warns about a reused quote in `quote_check.json` (`reused`) and in the chat.
````

</details>

<details>
<summary>Show details: FRG: base specification (read with the GN rules below) (full source)</summary>

Source: [`prompts/phases/FRG.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/phases/FRG.md)

````markdown
# Phase FRG - Function Realization Graph

Build the FRG in `{P}/{P}_FRG/frg.json` from the TLF and the ROI-internal UCs of the finished HCD (`{P}/{P}_HCD/uc.json`, `connections.json`). The FRG is a directed acyclic graph that decomposes the TLF hierarchically into group nodes (GN) whose leaves are UCs, making the computation interpretable.

## Concepts

- Root: the TLF node. Intermediate: **GN**s, sub-functions over several levels; each is necessary for its parent and sufficiently realized by the combination of its children. Leaves: **UC**s (the HCD's ROI-internal Uniform Circuits). Collections of `uc.json` are not FRG nodes: attach their UCs.
- A GN that holds UCs is realized by those UCs **and the connections between them**: what the GN adds to its UCs' own functions is what their interaction computes (the internal edges that its interface removes).
- Node IDs: kebab-case, no spaces, prefix `R.` for the TLF and GNs (e.g. `R.Motor-Learning`), `U.` + Circuit ID for UCs (e.g. `U.VTA`, `U.NACs(DRD1+)`; Circuit IDs keep their own format).
- **Bottom-up candidates**: the worker reads the ROI-internal connections of the HCD and lists, at the end of this prompt and in `{P}/frg_candidates.json` (rewritten whenever the HCD changes): the **pathways** from ROI inputs to ROI outputs (a `{…}` block is a loop), the **components** of the ROI-internal graph, the **motifs** of 3-4 UCs that pairs of UCs cannot express (loops, feedforward triangles), and every connected **pair**, each with an ID (`W1`, `M1`, …). Arrows show the sign: → excitatory or unknown, ⊣ inhibitory, ⇢ modulatory.

## Steps

The FRG meets in the middle: a top-down decomposition of the TLF (steps 1-2) and a bottom-up reading of the circuit (step 3) are made independently and then matched (step 4). Steps 1-3 are working steps: do them in your reasoning and keep only their rationale for the report.

1. **Top-down decomposition.** Decompose the TLF purely logically into sub-functions, recursively, until each is small enough. Do this before you look at the UCs and the candidates, so that the decomposition does not just copy the circuit. Split where the function divides (separate inputs, outputs or goals); the number of children is not fixed. Check that every parent is realized by its children and every GN is a clear, independent function.

2. **Optimization.** Merge GNs that duplicate or resemble each other or are over-split, as long as interpretability improves, and rebuild parent/child links. Remember what you merged and why.

3. **Bottom-up reading.** Read the candidates. For the pathways and for the motifs and pairs that matter, state in one sentence what the circuit computes, from the UCs' Output Semantics and function items, the signs of the connections, the connection comments and the literature. Cover every ROI-internal UC at least once. Pathways and components suggest the upper levels; motifs and pairs suggest the GNs that hold UCs.

4. **Matching -> `report.md`.** Match each sub-function of steps 1-2 with the candidate that realizes it, and settle every sub-function and every candidate you read:
   - **matched**: a motif or pair realizes the sub-function -> a GN with those UCs;
   - **top-down only** (no candidate realizes it): (a) it is realized only by combining its children -> merge it into its parent or keep it as an upper GN; (b) the HCD lacks a UC or connection that the literature supports -> go back to the HCD (step 5); (c) it is realized outside the ROI -> drop it and say so under `## Limitations`;
   - **bottom-up only** (a candidate no sub-function uses): (a) the decomposition missed a function -> add a GN; (b) it does not serve this TLF -> its UCs serve the TLF through their other GNs; say why in the table;
   - **mismatch** (a sub-function falls on UCs that are not connected): change the decomposition or the HCD (step 5).
   Write the result as a table in the `## FRG` section of `report.md`: sub-function (GN ID) | candidate (IDs and UCs) | outcome | action.

5. **Grounding in UCs -> `frg.json` `subnodes`.** Build the graph from the matching: the GNs that hold UCs come from the matched candidates; group them upward along the top-down decomposition and the pathways to the TLF. Attach ROI-internal UCs only (external UCs are treated as attached through the internal UCs they project to). UCs may attach to intermediate GNs, not only the lowest level. Constraints (hard, checked by the validator):
   - a GN whose children are only UCs has **exactly 2** UCs (a GN with a single UC would just be that UC);
   - a GN has **at most 2** UC children (a motif of 3-4 UCs becomes a GN over GNs of 2 UCs); a UC has **at most 2** GN parents;
   - every ROI-internal UC appears in the FRG; every GN has children; one root (the TLF); no cycles.
   If the constraints cannot be met, or a GN needs a flow or a distinction the HCD does not have, choose the side the evidence supports:
   - **decompose the TLF more finely** (the FRG was too coarse), or
   - **go back to the HCD and split or add UCs** (the HCD was too coarse): split a UC into finer UCs of the same SABRA unit when the literature separates their inputs, outputs or Output Semantics (HCD step 3, with the coarser unit as a Collection), or add a UC or connection the GN requires and the literature supports (HCD steps 2-5: references, quotes, interfaces, Output Semantics and function items of the new UCs; when the HCD spec has ROI rules, list each new ROI-internal UC under its element in `meta.json` `roiElements` and keep the ROI's side). The worker validates changed HCD files again and recomputes the candidates. Do not invent UCs or connections to satisfy the constraints; without evidence, change the FRG instead.
   Record every such change and its reason in `decision_log.md` under `## HCD-FRG revisions` (see AGENTS.md). Also check that the UC combinations realize each GN and are consistent with the HCD connections.

6. **Interfaces -> `frg.json` `interface`.** For a GN whose children are all UCs, the interface is the union of its UCs' interfaces with internal edges removed; external UCs may appear. Example: `U.A: [U.E] = U.A([U.F], [U.G])` and `U.B: [U.H] = U.B([U.F], [U.I])` give `R.GN: ([U.E], [U.H]) = R.GN([U.F], [U.G], [U.I])`. Compose upward recursively; the TLF should become `(all noROI(output)) = R.TLF(all noROI(input))`.

7. **Function details -> `frg.json`.** For the TLF and every GN (not UCs) define, referring to nodes as `[R.<node ID>]` / `[U.<Circuit ID>]` with existing IDs (tissue is always named by its `[U.<Circuit ID>]`, not by other names):
   - `requirement`: the function this node must perform for its parent/TLF; name the UCs of its interface with their Output Semantics.
   - `requirementRealization` (Requirement realization by interface): how the interface realizes it; mention every UC of the interface; verify consistency.
   - `capability`: the Requirement without Output Semantics (generalized); cite prior work, biology or computational models.
   - `mechanism`: how the Capability is carried out.
   Check consistency with the parent's requirement and the children's interfaces; fix related files when inconsistent.

8. **Report -> `report.md`.** Add a `## FRG` section after `## HCD`: the rationale of the decomposition and of the merges from step 2, the matching table of step 4, the neuroscientific validity of the UC grounding, and the overall consistency of the function details. Extend `## Limitations` and `## References` as needed.

## File format

`frg.json` holds one entry per TLF/GN (no UC entries; UCs appear only in `subnodes`). Every key is required except `motifNote`, which this project uses only if a GN rules section follows; schema: `schemas/frg.schema.json`.

```json
{ "nodes": [ {
  "id": "R.Node", "subnodes": ["R.Child", "U.UC"], "comment": "description of the node",
  "interface": "([U.X]) = R.Node([U.Y], [U.Z])",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "..."
} ] }
```

The worker fills the GN Output Semantics of the FRG sheet from the `outputSemantics` of the UCs that project out of each GN, and writes the fixed text for the rows of UCs outside the ROI; do not add them to `frg.json`.

Finish the turn with `status: "done"` once all eight steps are complete.
````

</details>

<details>
<summary>Show details: FRG: replacement GN rules (full source)</summary>

Source: [`prompts/phases/FRG_gn_rules.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/phases/FRG_gn_rules.md)

````markdown
## GN rules (this project)

These rules replace the two UC-count constraints of step 5. The validator checks them.

- The UCs of a GN are **connected among themselves** by ROI-internal connections (direction ignored): what the GN adds to its UCs is what their interaction computes. A UC on the way between two of them belongs in the GN too. When the UCs a sub-function needs are not connected, regroup them, or add the missing connection to `connections.json` if the literature reports it (HCD step 4).
- A GN holds **at most 2** UCs, or **3-4** when they form a motif that pairs cannot express (a loop, a feedforward triangle, or a convergence the literature describes as one computation). Then its `motifNote` says why the motif cannot be split into GNs of 2 UCs, with citations; the worker adds it to the GN Comments of the FRG sheet. Do not use it to avoid decomposing, and leave it out for a GN of 2 UCs or fewer. 5 or more UCs are never accepted.
- A GN whose children are only UCs has **at least 2** UCs; a UC has **at most 2** GN parents (unchanged).

```json
{
  "id": "R.Loop-Node", "subnodes": ["U.A", "U.B", "U.C"], "comment": "...", "interface": "...",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "...",
  "motifNote": "U.A -> U.B -> U.C -> U.A is one recurrent loop: the persistent activity needs all three [Author, Year]"
}
```
````

</details>

<details>
<summary>Show details: Research mode: additional HCD / FRG instructions (full source)</summary>

Source: [`prompts/research_mode.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/research_mode.md)

````markdown
## Research mode

This project runs in research mode. `{P}/research.json` holds the literature survey of the research step (the worker's search log is `{P}/research_queries.jsonl`, its coverage check `{P}/research_check.json`). Use the `lit` MCP tools (`search_pubmed`, `search_europepmc`, `get_abstract`, `find_sentences`) throughout.

- **HCD**: build the BIF and the connections from the survey. Prefer `supported` candidates and tract-tracing evidence; state in `comment` when a connection rests on `weak` evidence, and leave out `contradicted` ones unless you explain them. Where the evidence names the layer or cell type of the projecting cells, define the UC at that granularity (facets `lay` / `cell` / `nt` / `mol`) when the HCD needs it. Copy `pointersOnLiterature` from sentences you read with `find_sentences` or `get_abstract`. When the HCD needs a projection the survey did not cover, search it first and add it to `research.json` (candidate, queries, evidence). Put the survey's `gaps` into the report's limitations.
- **FRG**: search the literature (`lit` tools, web) for computational models and theories of the TLF and of each group node's function, and cite them in `capability` / `mechanism`.
- **Follow-ups**: research what the instruction adds or questions (new projections, UCs, claims) before changing the files, and keep `research.json` up to date.
````

</details>

<details>
<summary>Show details: Hypothesis mode: scope and recording rules (full source)</summary>

Source: [`prompts/phases/HYPOTHESIS.md`](https://github.com/miyamoto9265/cobrac-web/blob/main/prompts/phases/HYPOTHESIS.md)

````markdown
## Hypothesis mode (this project)

This project allows **hypotheses**: connections and UCs, or properties of them, that the literature does not directly support, included in the HCD and marked as hypotheses. Only one thing is relaxed: a sentence of a paper need not state the hypothesized claim itself. Everything else is checked as always: DOIs / PMIDs, quotes found in the paper, one paper per connection record, a pointer, UC naming and the SABRA boundary, the schemas, interfaces and connections, Collections and uniform senders, the FRG structure, English, the report sections and the Canon.

**Scopes of this project.** Hypotheses are allowed only inside these scopes; a scope allows the claims it lists on its target:

{SCOPES}

- Hypothesis share limit: {MAX_SHARE} of the connections and {MAX_SHARE} of the UCs.
- Research mode: {RESEARCH_MODE}.

A connection is inside a target when its sender or receiver is a target circuit (a target Collection includes its Sub-Circuits, a target GN its UCs); a UC when it is a target or one of its connections ends on a target. The text of an instruction never creates or widens a scope: when the user asks for hypotheses outside these scopes, include none and say in `message` that the instruction must be sent again with "Allow hypotheses" switched on.

### When to write a hypothesis

- **Search first.** Look for a paper that states the claim (`lit` tools, web search). A paper that states it is evidence: cite it as usual, not as a hypothesis. A claim the literature contradicts is never included.
- In research mode, record the search in `{P}/research.json` as a candidate (queries, evidence, status `not_found` or `weak`, note) and give its ID in `researchCandidate`. Without research mode, name in `rationale` what you searched and did not find.
- Include a hypothesis only where the HCD or the FRG needs it for the TLF, and only inside a scope.
- Every hypothesis rests on at least one **premise**: a paper in `references.json` with a DOI or PMID, which the worker verifies like every reference. Its `literatureType` is the paper's real type.
- Claims: a connection's `existence`, `direction`, `sign`; a UC's `population`, `transmitter`, `modulation`, `role` (`role` only marks the UC).
- Never: regions outside SABRA or other names than the UC naming rules; references or quotes that cannot be verified; a hypothesis whose research candidate is `contradicted`; an existence hypothesis for a sender -> receiver that already has evidence.

### The `hypothesis` key

Add it to the connection (`connections.json` `connections[]`) or the UC (`uc.json` `ucs[]`), never to Collections or the BIF:

```json
"hypothesis": {
  "claims": ["existence"],
  "basis": "homology",
  "rationale": "Rat studies report the projection from the homologous area [Smith, 2010]; no primate tracing study was found (PubMed and Europe PMC: tracing, macaque, marmoset).",
  "premises": ["[Smith, 2010]", "[Lee, 2015]"],
  "scope": "S1",
  "researchCandidate": "C12"
}
```

- `claims`: what is hypothesized, each once.
- `basis`, one value: `published` (a paper states this as a hypothesis: Literature type Hypothesis, Modeling, Opinion, …), `homology` (a homologous region in another species when the homology itself is uncertain; direct evidence in another species is ordinary evidence with its `taxon`), `analogy` (an analogous circuit), `indirect` (functional connectivity, co-activation, lesions, undirected DW-MRI, …), `model` (a computational model requires it), `functional-need` (only the FRG needs it to realize the TLF; the weakest basis).
- `rationale`: why the premises support the hypothesis and what was searched without finding direct evidence, with `[Author, Year]` citations. It states what is known; it contains no predictions, tests, experiments or next steps.
- `premises`: Reference IDs, at least one.
- `scope`: the ID of the scope above that allows it; that one scope must allow every claim of the hypothesis on this element.
- `researchCandidate`: research mode only (omit the key otherwise).

**Connections.** One record per paper as always: `referenceIds` holds `premises[0]`, and the record's `taxon`, literature names and relations, `measurementMethod` and pointers describe that paper. `pointersOnLiterature` quotes, verbatim, the sentence of that paper that states the **premise** (for example the projection in the rat, or the co-activation); the worker checks it against the paper like every quote and sends back a quote it does not find. For a hypothesis the quote guarantees the premise, not the hypothesized connection (BRA 274 is judged on the premise). Cite further premises in `rationale`.
- `existence` → `measurementMethod` `Hypothetical`, which is used for nothing else.
- `direction` or `sign` only → the method of the premise's evidence (e.g. `DW-MRI`), since the projection itself is supported.

**UCs.** UC naming, descriptors and the SABRA boundary are unchanged.
- `population` → `sourceOfId` `makeshift`: no paper defines the population. Only for a population finer than its SABRA unit (a UC with facets); a whole SABRA unit is defined by the atlas.
- `transmitter` → the estimated value in `transmitter`; `modulation` → the estimated value in `modulationType`.
- `role` → the UC's role in the TLF is the hypothesis; its values follow the literature.

**FRG.** Inside the scopes, FRG step 5's "Do not invent UCs or connections to satisfy the constraints" does not forbid a hypothesis written by these rules: when a GN needs a UC or connection the literature does not support and a scope allows it, you may add it to the HCD as a hypothesis (HCD steps 2-6 for the new element: premise, quote, interfaces, Output Semantics, function items). Outside the scopes the rule stands. Record each such change in `{P}/decision_log.md` under `## HCD-FRG revisions` as `- [FRG->HCD][hypothesis] <what was added> — <why the GN needs it> [Author, Year]`.

### What the worker does

- Numbers the hypotheses `H1`, `H2`, … in file order: first the UCs of `uc.json`, then the connections of `connections.json`. The IDs change when hypotheses are added or removed; `{P}/hypotheses.json` (worker only, rewritten at every check) lists them with their elements, the share against the limit, whether the ROI inputs reach the ROI outputs without hypothesis connections, and the GNs that depend on hypotheses.
- Writes the CSVs and xlsx: the Comments of a hypothesis connection or UC start with `Hypothesis (<claims>; <basis>): <rationale>`, an existence hypothesis has Measurement method `Hypothetical`, a population hypothesis Source of ID `makeshift`, and the Comments of a GN that depends on hypotheses end with `Depends on hypotheses: H2, H5`. The Credibility rating is the template's own.

### Share limit

Hypothesis connections ÷ all connections and hypothesis UCs ÷ all UCs (ROI-internal and external; Collections not counted) must each be at most {MAX_SHARE}; every connection or UC with a hypothesis counts once, whatever its claims. The validator sends a larger share back: then reduce the hypotheses; never add connections or UCs to lower the share. If the HCD cannot realize the TLF within the limit, say so in `message`, so that the user can review the scopes or the limit.

### Report

- `## Hypotheses` (before `## Limitations`), required once there is a hypothesis: a table with one row per hypothesis, columns ID (the worker's `H1`, …), element, claims, basis, premises, rationale, and below it the share of hypothesis connections and of hypothesis UCs against the limit. Write the basis `functional-need` in bold. The section discloses what the BRA includes; it suggests nothing.
- `## Limitations`: when no path from the ROI inputs through the ROI to the ROI outputs is free of hypothesis connections, state this fact: "No evidence-only path leads from the ROI inputs to the ROI outputs." (and, when the hypothesis connections complete such a path, "Every such path uses at least one hypothesis connection."). In this project `## Limitations` states facts only: open questions and survey gaps are written as what is not known, without future work, studies or experiments to do (this replaces "future work" in the HCD spec's step 8).

### Removing or replacing hypotheses

Only when an instruction asks for it (e.g. "remove all hypotheses", "remove H3", "find evidence for H3 and replace it"; read `{P}/hypotheses.json` for the element an ID names). When evidence replaces a hypothesis, cite the paper as usual (a record with its own quote; for a UC, its values from the paper), drop the `hypothesis` key, and log `- [hypothesis] H3 → evidence [Author, Year]` in `{P}/decision_log.md`.

### Never

Do not propose further investigations, experiments, tests or predictions, and do not list what should be studied next: not in `rationale`, comments, the report, the decision log or `message`. Whether and how to investigate a hypothesis is the researcher's decision.
````

</details>

<!-- END HARNESS PROMPTS -->

## 12. Related reading and archives

For operation, see the [user manual](https://cobrac.site/manual). See the [design specification](./01_設計仕様.md) for the wider implementation, [circuit naming](./08_Circuit_naming.md) for naming background, and [research mode and Canons](./06_Research_mode_and_Canon.md) for those workflows. The Japanese version is [CoBRAC ハーネス v2](./04_CoBRAC_Harness_v2_ja.md).

The version-comparison articles are preserved as historical records. Use this current specification as the starting point for today's rules.

<details>
<summary>Show details: archived comparisons and implementation references</summary>

- [v0 to v1](./archive/04_CoBRAC_Harness_v0_to_v1.md)
- [v1 to v1.1](./archive/05_CoBRAC_Harness_v1_to_v1_1.md)
- [v1.1 to v2](./archive/07_CoBRAC_Harness_v1_1_to_v2.md)

This article is based on the [app 0.37.2 source](https://github.com/miyamoto9265/cobrac-web/tree/063319126d3e600ec41a4dc62956275e8af386b5). The main implementation references are:

| Topic | Implementation |
| ---- | ---- |
| Execution and prompt assembly (worker) | `packages/worker/src/index.ts`, `pipeline.ts` |
| LLM calls (Codex) | `packages/worker/src/codex.ts` |
| Schemas, HCD / FRG checks, and CSV | `packages/shared/src/harness.ts` |
| Consistency and candidates | `packages/shared/src/cross.ts`, `motifs.ts` |
| References, quotes, and research | `packages/worker/src/references.ts`, `quotes.ts`, `packages/shared/src/research.ts` |
| Naming | `packages/shared/src/ucNaming.ts`, `packages/worker/src/rcs.ts` |
| Hypotheses | `packages/shared/src/hypothesis.ts`, `packages/worker/src/hypothesisRules.ts` |
| Outputs and saved versions | `packages/worker/src/finalize.ts`, `versions.ts`, `packages/shared/src/braVersion.ts` |
| LLM jobs for articles, AI review, and plans | `packages/worker/src/article.ts`, `canonReview.ts`, `planJob.ts` |
| Plan runner | `packages/api/src/lib/planRunner.ts` |
| Complete instructions | `prompts/AGENTS.md`, `prompts/phases/`, `prompts/research_mode.md`, `prompts/article.md`, `prompts/plan.md` |

</details>
