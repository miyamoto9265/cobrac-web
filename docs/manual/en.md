# CoBRAC Agents user manual

A guide for people who make BRA (Brain Reference Architecture) data with CoBRAC Agents. If you are new, read "What it does" and "Getting started" and you can run your first project. Open the other sections from the table of contents when you need them. The "?" buttons on the screens have short explanations as well.

## What it does

Enter an ROI (region of interest) and a TLF (top-level function) and run: an AI agent surveys the literature and builds the BRA data. The work runs on the server, so it goes on when you close the browser.

![From ROI and TLF to BRA data](./figures/manual-overview.en.svg "From ROI and TLF to BRA data. Each output appears on the screen when its step is done")

- **HCD** (circuit diagram): the circuits (UCs) of the region and the connections between them, with the papers that support them.
- **FRG** (function breakdown): a tree that breaks the TLF down through groups (GNs) to UCs.
- **CSV and BRA xlsx**: the data for submission, built from the HCD and the FRG. The xlsx comes in two formats: CoBRAC's own and the official Template-v2-2.
- When the agent needs a decision it asks you a question, and continues once you answer. After completion you can change the result with follow-up instructions.
- One run takes from tens of minutes to a few hours and costs OpenAI usage ([costs](#where-do-i-see-the-cost)).
- To build many projects, put them in a plan with the [CoBRAC Orchestrator](#cobrac-orchestrator); it runs them in turn for you.

## Getting started

![Four steps to get started](./figures/manual-start.en.svg "From creating an account to the first project")

### Create an account

1. On the sign-in screen, choose "Create an account" and enter your e-mail address and a password (10 characters or more).
2. Enter the confirmation code from the e-mail, and you can sign in. If no code arrives, press "Resend code".
3. If you forget your password, use "Forgot password" on the sign-in screen.

If sign-up is closed, ask an admin.

### Get an API key

Runs need an OpenAI API key. You need one of these:

- **Your own key**: paste it under "OpenAI API key" in Settings and press "Register / update". It is stored encrypted, and usage is billed to your OpenAI account.
- **The default API key**: without a key of your own, ask an admin to approve you for it. Once approved, Settings shows "Using the default API key".

If you have both, your own key is used.

## Create a project

Open "New project" in the sidebar.

1. Write a brain region in **ROI** and the function it serves in **TLF**. Either one alone is enough. Typing a region name in the ROI shows suggestions. "Use example" fills in an example.
2. If needed, use the buttons under the input:
   - "+": attach reference materials (files and URLs).
   - "Canon": choose one when circuit definitions should match other projects ([using a Canon](#using-a-canon)).
   - "Hypothesis mode": check it to include connections and UCs that the literature does not directly support, marked as hypotheses ([hypothesis mode](#hypothesis-mode)).
   - "v": model, reasoning effort and research mode ([research mode and models](#research-mode-and-models)).
3. Press "Run" (or Enter in the TLF; Shift+Enter adds a line).

The project gets a name automatically; you can change it on the project page.

### Research mode and models

- **Research mode** (on by default): before the HCD, the agent surveys PubMed and Europe PMC in depth. When off, the run is faster and cheaper but the survey is shallower. It cannot be changed after creation.
- **Model and reasoning effort**: the defaults come from Settings. High reasoning effort is recommended.

## The project page and the agent

After "Run" you are on the project page. You can also open it from "History" and "Projects" in the sidebar.

![The project page](./figures/manual-workspace.en.svg "Header and progress, the outputs in tabs, and the Agent panel (on the right on a computer, behind a button on a phone)")

- **Header**: name, status, ROI and TLF, model, usage, downloads and more.
- **Progress**: how far the run is: research → HCD ⇄ FRG → CSV → xlsx.
- **Tabs**: HCD, FRG, Tables, Report, Decision log, Article and Versions.
- **Agent panel**: the log of the run, questions and the input box.

### Status

| Status | Meaning |
| ------ | ------- |
| Queued | Waiting for its turn to start |
| Running, Finalizing | The agent is working |
| Waiting for answer | The agent asked a question; answering resumes the run |
| Completed | The BRA data is ready; follow-up instructions can change it |
| Failed, Cancelled | The run stopped; "Retry from here" resumes it |

### Answer a question

A question appears at the end of the Agent panel in an amber box. Press one of its options or write your answer in the input box and send it, and the run resumes.

### Follow-up instructions

On a completed project, write what to change in the input box of the Agent panel (for example "Add a UC for … and review the connections"). The instruction runs as a new job and costs usage.

### Stop and retry

- While running, "Stop" in the header stops the run.
- A failed or cancelled project resumes from its last outputs with "Retry from here". One job stops after 6 hours; continue with a retry then as well.
- Delete a project you no longer need with the bin button in the header.

## Reading the outputs

Each output appears in its tab when its step is done.

- **HCD graph**: nodes are circuits (UCs); arrows are connections. Select one to see its details, including the supporting papers and quotes. Dashed boxes are Collections (UCs that come from splitting one circuit). You can rearrange and restyle the graph and save it as PNG.
- **FRG graph**: a tree from the TLF through GNs to UCs. Selecting a UC or a GN can take you to, or highlight, the matching circuits in the HCD.
- **Tables**: the five CSV files as tables; the raw files can be downloaded.
- **Report and decision log**: the agent's report of the work, and what it decided and why.
- **BRA xlsx**: when the data is complete, the header has the download buttons "BRA xlsx" (CoBRAC's format) and "BRA xlsx (Template-v2-2)" (the official template's format).

### Versions

Each time a run or a follow-up finishes, its result is kept as a version (v1, v2, …). In the "Versions" tab you can open the tables of a version or compare two versions to see which rows changed.

When the site has a BRA-DB, the "BRA-DB" box of a version registers that version in BRA-DB.

## Hypothesis mode

By default, the BRA contains only connections and UCs that the literature directly supports. With "Hypothesis mode" checked, connections and UC properties that the literature does not directly support can be included, marked as **hypotheses**. A hypothesis still needs at least one premise paper.

- **When creating**: checking "Hypothesis mode" on the create screen opens its settings: which kinds of claims may be hypotheses, and the share limit (20% by default). Above the limit, the work goes back to the agent.
- **With a follow-up**: turn on "Allow hypotheses with this instruction" under the input box and send. Select circuits or GNs in a graph first to limit the scope to them. Writing "hypotheses are fine" in the instruction alone does not allow them.
- **How they look**: in the graphs, hypothetical connections and UCs are dotted and marked "H". "Hide hypotheses" shows only the literature-supported graph.
- Hypotheses are not added to a Canon's shared definitions, and versions with hypotheses cannot be registered in BRA-DB for now.
- The tool does not suggest studies or experiments to test hypotheses. To reduce them, send a follow-up such as "Find evidence for H3 and replace it".

## Explanatory articles

When the BRA data is complete, the "Article" tab makes an illustrated article about it in a language you choose. Choose the "Article language" and a model, then press "Create article". It takes a few minutes and its usage is added to the project. Articles can be downloaded as .md. If the BRA data changes afterwards, "Recreate article" brings it up to date.

## Canons

A **Canon** is a set of projects that keep circuit definitions consistent. Within a Canon the same circuit has the same ID, name and breakdown in every project.

### Using a Canon

- Under "Canons" in the sidebar, create a "New Canon" with a name and a granularity policy (for example "neocortex by area × projection class, subcortex by whole nucleus"). Add existing projects with "Add a project".
- For a new project, choose a Canon with the "Canon" button on the create screen. Settings has a default Canon for new projects.
- A project can be in one Canon only.

### How a Canon guides generation

Projects in a Canon are built to its definitions (circuit IDs, names, breakdowns, connections and references). Circuits the Canon does not have yet follow its granularity policy.

### Push and review

![Canon basics](./figures/manual-canon.en.svg "A push creates a pull request; when the owner or a co-editor approves it, the Canon gets a new rev")

1. **Push**: on a completed project, "Push to Canon" shows the differences and creates a pull request (PR). The Canon does not change until the PR is approved.
2. **Review**: the Canon's owner or a co-editor checks the changes, the check results and the AI review (which points out issues but does not decide) on the PR page.
3. **Decide**: "Approve" creates a new rev (version) of the Canon. "Request changes" and "Reject" are also available. PRs without conflicts can be approved together with "Approve selected" on the Canon page.

The owner can add **co-editors** by the e-mail address they signed up with. Co-editors open the Canon from "Shared with you" and can review its PRs.

### Keeping up with revs

The project header shows the rev the project follows (for example "rev 1 (latest 2)"). "Update to latest" makes the next run follow the new definitions. When definitions this project uses have changed, "Align with Canon" also sends a follow-up instruction to update the project.

## CoBRAC Orchestrator

**CoBRAC Orchestrator** builds many BRA projects (ROI × TLF) from one **plan**. Once you confirm the plan, the rows run automatically in **waves**, within the concurrency limits. No project is created before you confirm.

### Create a plan

1. Under "CoBRAC Orchestrator" in the sidebar, press "New plan" and enter a name and a goal (for example "Cover the BRA of language").
2. Add source files (CSV, xlsx, PDF and others) or paste rows. One row is one project.
3. "Start autonomous run" has the AI write a draft of the rows from the goal and the sources (it takes a few minutes and its cost is recorded) and then runs the plan to the end on its own (the default). Turn on "Handle pull requests and conflicts yourself" to get "Create plan" (a plan from the rows read) and "Create draft" instead. None of them can be pressed without a goal, files or rows.
4. The draft screen has four parts. "1. What to build" edits the goal, adds and removes files and writes the draft. "2. Rows and waves" adds, removes and reorders rows. "3. How it runs" chooses the autonomous run, the Canon, the models and the research mode. "4. Confirm and start" shows the estimate and starts.

### Ordering

- Each row has **anchors** for the regions it involves. Rows that would build the same circuits (sharing anchors) are not put in the same wave.
- Rows shared with many others are **baseline projects**, built first, one at a time. The later rows take their circuits as their baseline.
- "Order automatically" works out the waves again from the anchors and dependencies. If you change rows or waves by hand and save, your order is used as it is.
- A row whose ROI × TLF already has a completed project is marked "Existing" and is done without building. Tick "Rebuild" to build it anyway.

### Confirm and run

- "Confirm and start" shows the estimate (time and cost) before starting.
- A failed row is retried automatically up to 2 times; after that it "Needs attention" (choose "Retry" or "Skip").
- In an automatically ordered plan, the remaining rows are reordered after each wave, and rows may be proposed for adding or removing. A proposal changes nothing until you approve it.
- "Your turn" in the list of plans gathers what is waiting for you, such as questions and approvals.
- The projects a plan creates open on the usual project page.

### Plans with a Canon

With a Canon set on the plan, each completed row is pushed to the Canon automatically and is "Awaiting approval"; it is complete once a person approves its PR. The AI review runs automatically too. Rows that cannot go on by themselves, such as ones with unresolved conflicts, need "Your decision", with the reason shown.

### Autonomous run

In an **autonomous run** the Orchestrator acts for you and takes the plan to the end. It is the default for a new plan: enter a **cost limit** (USD) in the new plan form and press "Start autonomous run".

To handle pull requests, conflicts and questions yourself, turn on "Handle pull requests and conflicts yourself" in the form or under "3. How it runs" of the draft. In such a plan you confirm the draft, answer the questions, review the PRs and decide on the rows that need attention or a decision.

- Once the draft is written, it is confirmed and started automatically. Without a chosen Canon, a new Canon named after the plan is created.
- The rows' agents may ask questions. The Orchestrator's AI answers each one after reading the row, the plan's goal, the Canon's policy and the decision log, with no limit on the number of answers (the row shows "AI answers: n").
- The AI reads each PR and approves, requests changes or rejects it.
- When a row needs attention or a decision, the Orchestrator's AI picks one of the choices you would have and records why. Only when the plan's Canon is gone does the plan pause for you.
- Re-plan proposals (rows to add or remove) are applied as soon as they arrive.
- A failed Orchestrator job is asked again after a short wait (at most an hour).
- When the cost reaches the limit, nothing new starts and the plan pauses. Raise the limit to resume.

### Questions, pause and cancel

- When an agent asks a question, only its row stops, and the question appears under "Questions" on the plan page. Answering resumes that row.
- "Pause" starts no new rows; running rows go on. "Resume" continues from where it stopped.
- "Cancel" also stops the running jobs. A cancelled plan can be resumed.
- Deleting a plan keeps the projects it created.

## Publishing and cloning

- Projects and Canons can be made public with the button in their header, and made private again at any time.
- Anyone signed in can see public items in the "Public library". The agent's log, costs and e-mail addresses are not shown.
- "Clone" copies a public project into a new private project of yours. The original does not change.
- Other users can send PRs to a public Canon. Only the owner approves.

## Settings

"Settings" in the sidebar has:

- **OpenAI API key**: register, update or delete it, and the status of the default API key
- **Profile**: display name and Contributor name (written to Project.csv and the xlsx; English is recommended)
- **Default model / reasoning effort / Canon**: starting values for new projects
- **Change password**
- **Language**

The display language and the theme (light or dark) can also be switched at the bottom of the sidebar. Press the version number at the very bottom of the sidebar for the release notes, which list what changed in the app.

## Troubleshooting

### I cannot run a project

If the screen says that no OpenAI API key is available, register your own key in Settings or ask an admin to approve you for the default API key ([get an API key](#get-an-api-key)).

### The model I want is not in the list

With the default API key, the lists show only the models it can use. Register your own key to use other models.

### The run seems stuck

The last row of the Agent panel shows the current step and the elapsed time. If the status is "Waiting for answer", answer the question; if it is "Failed" or "Cancelled", press "Retry from here".

### Where do I see the cost?

Press the usage in the header for the tokens and estimated cost of each job. "Projects" shows the total of all projects. Costs are estimates; check the OpenAI dashboard for what you are actually billed.

### I want to change the result

On a completed project, send a follow-up instruction from the Agent panel. To start over, create a new project.
