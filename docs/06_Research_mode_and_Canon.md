# Research mode and Canons

A user guide to two options of CoBRAC Agents: **research mode**, which surveys the literature before the HCD is built, and **Canons**, which keep circuit definitions consistent across several projects. The screens show short labels and a "?" next to them; this page has the details. The design is in [01_設計仕様.md](./01_設計仕様.md) sections 6.11 and 6.14–6.19.

## Research mode

A switch in the model menu ("v") at the bottom right of the create screen, on by default. While it is on, a book icon shows next to the model name.

- **On**: before the HCD step, the agent surveys the literature in PubMed and Europe PMC — tract-tracing studies, primate and rodent evidence, layers and cell types — and writes what it found for each candidate projection. The worker checks the survey (enough searches per candidate, evidence with a PMID or DOI) and asks the agent to fill gaps up to twice. The HCD and FRG are then built from the survey.
- **Off**: the agent searches the web while it builds the HCD, as before. Faster and cheaper, but the survey is shallower.
- **Time and cost**: the screen shows an estimate for the selected model (about +10–60 minutes, and the cost of the extra tokens). It is a rough figure; the usage line of each job shows the real value. The step stops after 60 minutes and the HCD starts with what was found.
- **Fixed per project**: it cannot be changed after creation. Follow-ups and retries use the same setting. The project header shows "Research mode: on / off".

## Canons

A **Canon** is a set of your projects that share circuit definitions. Inside a Canon, the same UC Descriptor always has the same Uniform / Collection status, the same decomposition (Sub-Circuits) and the same Circuit ID, official name and properties. Different Canons can choose different granularity — for example a coarse network-level Canon next to a layer-level one.

- A project belongs to at most one Canon.
- **Granularity policy**: a sentence such as "neocortex: area × projection class (IT/PT/CT); subcortex: whole nucleus". The agent follows it for circuits the Canon does not have yet.
- **Revisions**: a Canon's contents change only when you approve a pull request. Each approval makes a new revision (rev 1, rev 2, …). rev 0 is the empty Canon.
- The Canon page lists its projects, pull requests, contents (circuits, connections, references) and the revision history. Name, policy and description can be edited there.

### Using a Canon for a new project

Choose it with the "Canon" button under the inputs of the create screen. It opens a list (searchable when there are many Canons); the button then shows the Canon's name and rev. The default Canon from Settings is marked "default".

- **None**: the project is not in a Canon.
- **Existing Canon**: the project joins the Canon and follows its latest revision from the first run.
- **New Canon from existing projects**: a panel opens under the inputs. Enter a name and a granularity policy and pick completed projects that are not in a Canon, in priority order (top first; they are numbered and can be reordered with the arrows). The preview shows how they combine into rev 1. When two projects disagree, choose which value to keep, let the higher one win for all remaining conflicts, or keep a project as a pending pull request (or leave it out).

The default Canon for new projects can be set in Settings.

### How a Canon constrains generation

Every run of a member project follows its pinned revision. The agent gets the Canon's definitions in a read-only `canon/` folder and is told to reuse its Circuit IDs, names, properties, connections and references.

After the HCD step the worker compares the result with the Canon. **Conflicts go back to the agent as problems to fix**, in the same fix turns as the other checks:

- the same descriptor is Uniform in one place and a Collection in the other;
- a Collection is split into different Sub-Circuits;
- a finer circuit sits next to a Uniform one of the same area;
- Circuit ID and descriptor do not match one to one;
- a connection ends on a Collection;
- the official name differs;
- a Reference ID points to another paper.

Smaller differences (extra Sub-Circuits, other properties, the same paper under another ID, a connection written differently) are shown in the Agent panel as notes and do not block the run. References and quotes that the Canon already checked are not looked up again.

Every Canon works this way; there is no weaker "advisory" setting. Canons created with the former advisory setting now behave the same.

### Revisions and updates

The project header shows the Canon and the revision the project follows, e.g. "rev 1 (latest 2)".

- **New revision available**: the Canon moved on, but nothing this project uses changed. "Update to latest" moves the pin; the next run follows it.
- **Changes that affect this project**: something the project uses changed (a circuit became a Collection, its Sub-Circuits or ID changed, …). "Align with Canon" moves the pin and sends a follow-up that updates the project.

## Push and pull requests

- **Push to Canon** (project page, completed member projects): compares the project's latest data with the Canon and opens a **pull request (PR)**. The Canon does not change until its owner approves it.
- **Reviewing a PR** (Canon owner): the PR page has four tabs.
  - **Changes**: a graph of the Canon now and after approval (added green, changed blue, no longer in the project grey dashed, conflicts outlined red), and the list of changes. Open a row to compare the Canon's and the incoming value field by field, see its findings and comment on it.
  - **Checks**: the conflicts to decide, then system checks by group (IDs, duplicates, connections, evidence, provenance) with the code of WBAI's error code list. Serious conflicts (the list above) must be fixed in the project, or — for Uniform / Collection and decomposition — settled by adopting the incoming definition. Every warning needs a choice: keep the Canon's value or take the incoming one. The other checks do not block approval.
  - **AI review**: pick a model (the list shows only the models your key can use) and a language. The model reads the same material and lists inconsistencies with reasons and links to the items and papers, points to verify and draft comments. It does not approve or reject; "Use" puts a draft into the comment field for you to edit.
  - **History**: who pushed, commented, requested changes, approved or rejected, and when.
- **Co-editors**: on the Canon page the owner adds a co-editor by the e-mail address they signed up with. Co-editors find the Canon under "Shared with you" and can do everything on the PR page that the owner can (comment, AI review, request changes, approve, reject). One approval is enough. Settings, member projects, visibility, co-editors and deletion stay with the owner; a co-editor can leave at any time.
- **Who decided**: the PR page shows who approved, rejected or requested changes and when; the history shows every step, and the Canon's revision list shows who approved each revision.
- **Deciding**: approve makes the next revision (a note is optional). **Request changes** keeps the PR open until the sender pushes again; reject closes it. Both need a note, which the sender sees in the history. The sender can withdraw.
- **Canon to Canon**: on the Canon page, "Send a PR to another Canon" sends the latest revision to one of your Canons, or to someone else's public Canon by its Canon ID (shown on its public page). The receiving owner reviews it with the same rules.

## Public library and cloning

- A project (once it has results) or a Canon can be made **public** from its page, and private again at any time. Every signed-in user can then read it in the **public library**. Chat history, cost and e-mail addresses are never shown.
- **Clone**: a public project can be copied into a new private project of your own (HCD, FRG, tables, report, articles). The copy keeps the original's research-mode setting. The original does not change; the BRA xlsx is rebuilt by a follow-up.
- **Pull requests from other users**: a public Canon accepts PRs from other users' Canons unless its owner turns this off. The owner always reviews them.
