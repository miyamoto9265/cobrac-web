# CoBRAC Harness v0 → v1: What Changed and Why

| Item | Description |
| ---- | ----------- |
| Document | Explainer: how the agent harness moved from the legacy instruction files (v0) to the dedicated CoBRAC harness (v1), with a cost comparison |
| Audience | Users, operators, and anyone reviewing BRA output quality or OpenAI spend |
| Applies to | v0 = app up to 0.4.2 / v1 = app 0.5.0 and later |
| Related | [01_設計仕様.md](./01_設計仕様.md) / [03_AWSインフラと予算.md](./03_AWSインフラと予算.md) / 日本語版: [04_CoBRAC_Harness_v0_to_v1_ja.md](./04_CoBRAC_Harness_v0_to_v1_ja.md) |

---

## 1. In one paragraph

v0 was the desktop Cursor workflow moved onto a server as-is. The agent received a single instruction ("read `instruction_0.md` and follow it") and had to read four Japanese instruction files in order, decide by itself when each phase was finished, print text markers such as `[STEP_COMPLETE] HCD`, and finally translate everything into five CSVs. v1 turns this around. **The worker drives the workflow.** It hands the agent one compact English phase spec at a time, checks the files with code after every turn, sends back an exact list of problems, and builds the CSVs, xlsx, and graphs itself. The agent does what only an LLM can do: literature research and scientific interpretation.

---

## 2. Terms

| Term | Meaning |
| ---- | ------- |
| Harness | Everything around the model: prompts, the control loop, validation, and post-processing |
| Worker | The Fargate task that runs one job (`packages/worker`) |
| Phase | HCD, FRG, or CSV. xlsx and graphs follow CSV |
| Turn | One `runStreamed` call. A turn contains many model requests (one per tool call) |
| Validator | Deterministic checks in `packages/shared/src/harness.ts` (`checkHcd`, `checkFrg`, `buildCsvs`) |

---

## 3. Architecture

### 3.1 v0: the agent reads the manual and runs everything

```
 Worker                               Codex agent (one long turn)
 ──────                               ─────────────────────────────────────────────
 "Read instruction_0.md               read instruction_0.md  (JA, 1.4k tokens)
  and follow it"          ───────▶    read instruction_1_HCD.md (JA, 4.8k)
                                        └─ write 8 HCD files (incl. explainer + Mermaid)
                                      "[STEP_COMPLETE] HCD"
                                      read instruction_2_FRG.md (JA, 5.3k)
                                        └─ write 5 FRG files (tables + Mermaid)
                                      "[STEP_COMPLETE] FRG"
                                      read instruction_3_csv.md (JA, 2.4k)
                                        └─ re-read the markdown, translate to English,
                                           write 5 CSVs by hand
                                      "[STEP_COMPLETE] CSV"
 CSV files present?  ◀───────────────
   no  → "continue" nudge (max 3), same prompt again
   yes → csv_to_excel.py → graphs
```

Weak points:

- **Nobody checked the content.** "Done" meant "the CSV files exist". A missing column, an unknown circuit ID, or a broken FRG only showed up later in the graph or the xlsx.
- **Progress relied on free text.** A missed or misspelled marker, or a `[QUESTION]` block inside a longer message, confused the step display.
- **The CSV phase was manual translation.** The agent read all markdown again, translated Japanese to English, and typed five CSVs. This was slow and expensive, and the output was sometimes inconsistent.
- **All instructions stayed in the context.** By the CSV phase, about 13.9k tokens of instructions were re-sent with every model request.

### 3.2 v1: the worker drives the phases and verifies them

```
 Worker (CoBRAC harness)                                   Codex agent
 ───────────────────────                                   ───────────
 prepare workspace: folders, AGENTS.md (auto-loaded rules)
                                                           
 ┌─ Phase HCD ───────────────────────────────────────┐
 │ prompt = header + phases/HCD.md (EN, 1.3k) ─────▶ │ research, write 6 HCD files + meta.json
 │ checkHcd()  ◀──────────────────── JSON {status}   │
 │   problems? → fix prompt with exact list (≤3) ──▶ │ fix only those problems
 └───────────────────────────────────────────────────┘
 ┌─ Phase FRG ───────────────────────────────────────┐
 │ prompt = phases/FRG.md (EN, 1.0k) ──────────────▶ │ write 5 FRG files
 │ checkFrg()  (1 root, no cycle, ≤2 UC per GN, …)   │
 │   problems? → fix prompt (≤3) ──────────────────▶ │
 └───────────────────────────────────────────────────┘
 ┌─ Phase CSV (no agent) ────────────────────────────┐
 │ buildCsvs(): markdown tables → 5 CSVs             │
 │   fails (e.g. legacy Japanese files)?             │
 │   → fallback prompt phases/CSV.md ──────────────▶ │ write the CSVs
 └───────────────────────────────────────────────────┘
 csv_to_excel.py → .bra.xlsx, buildGraphs() → HCD/FRG JSON → S3

 At any turn: {status:"question"} → save state to S3, stop the task, wait for the user
```

### 3.3 Side by side

| Aspect | v0 | v1 |
| ------ | -- | -- |
| Who sequences phases | The agent, by reading `instruction_0.md` | The worker (`packages/worker/src/index.ts`) |
| Instructions | 4 Japanese files, 13.9k tokens, all read in-thread | `AGENTS.md` (0.7k, auto-loaded) + one phase spec at a time (0.5–1.3k) |
| Phase completion | Text marker `[STEP_COMPLETE] X` | Validator accepts the files |
| Questions | `[QUESTION]…[/QUESTION]` in free text | Structured output `{status, message, question}` (`outputSchema`) |
| Quality checks | None (only "CSV files exist") | Columns, IDs, references, interfaces vs connections, FRG rules |
| Retry on problems | Generic "continue" nudge | Exact problem list, up to 3 fix turns per phase |
| Artifact language | Japanese, translated at the CSV phase | English from the start. Chat replies follow the user's language |
| HCD files | 8 (incl. beginner explainer and Mermaid diagram) | 6 (+ `meta.json`) |
| FRG files | 5, each table also drawn as Mermaid | 5, tables only |
| CSV | Written by the agent | Generated by code; the agent is only a fallback |
| Folder creation, `Project.csv` | Agent | Worker |

---

## 4. The five changes in detail

### 4.1 Fixed rules move to `AGENTS.md`

Codex automatically loads `AGENTS.md` from its working directory. The worker writes `prompts/AGENTS.md` there. It holds everything that is true in every phase: workspace layout, table formatting, citation rules, the turn protocol, and how to handle validator feedback and follow-ups. The file is short (721 tokens) and identical for every project, so it sits in the cacheable prefix of each request.

### 4.2 The worker runs one phase at a time

The agent never sees a later phase's instructions early. The HCD prompt inlines only `phases/HCD.md`. The FRG prompt is sent once HCD is accepted. Because the worker knows the current phase, retry and resume restart exactly there, and a follow-up re-validates every phase instead of redoing all of them.

### 4.3 Deterministic work is done by code

| Task | v0 | v1 |
| ---- | -- | -- |
| Create `{P}/`, `{P}_HCD/`, `{P}_FRG/`, `{P}_CSV/` | Agent | Worker |
| `Project.csv` | Agent copied a template | `buildProjectCsv()` |
| References / Circuits / Connections / FRG CSV | Agent read, translated, typed | `buildCsvs()` from the markdown tables |
| Diagrams | Mermaid in `8_diagram.md` and every FRG file | Web graphs from the CSVs |
| Beginner explainer (`7_EasyToUnderstand.md`) | Always written | Removed. Ask for it in a follow-up if needed |

### 4.4 Validation with exact feedback

After each turn the worker parses the markdown tables and checks, among other things:

- required files and table columns exist; IDs contain no spaces;
- every connection endpoint is a UC defined in `3_UC.md`, and every Reference ID exists in `2_BIF.md`;
- each ROI-internal UC's interface inputs and outputs match its senders and receivers in `4_Connection.md`;
- FRG: exactly one root, no cycles, a GN has at most 2 UC children, a GN made only of UCs has exactly 2, a UC has at most 2 GN parents, and every ROI-internal UC is attached;
- the CSV content is English.

Problems go back to the agent as a list ("`PC`: Interface inputs [GC] differ from the senders in 4_Connection.md [GC, IO]"). In the chat, the check notice can be expanded to show every issue. After 3 fix attempts the phase continues with a warning, or fails if the output cannot be used at all.

### 4.5 Structured turn output and English artifacts

Every turn ends with JSON that matches a schema, so a question can no longer be missed or misread. Artifacts are written in English from the start, so the CSV phase no longer needs translation, and the tables can be converted mechanically.

---

## 5. Cost comparison

### 5.1 How the bill is made

For each model request, the whole context (rules + instructions + conversation + tool output) is sent again. Most of it is billed at the cached-input rate, which is 10% of the input rate. Output (including reasoning) is the most expensive part. So a harness saves money in three ways: a smaller always-present context, less output, and less rework.

Prices used below (USD per 1M tokens, standard short context, `packages/shared/src/pricing.ts` as of 2026-09-25):

| Model | Input | Cached input | Output |
| ----- | ----: | -----------: | -----: |
| gpt-6-luna (default) | 0.10 | 0.01 | 0.50 |
| gpt-6-sol | 2.00 | 0.20 | 10.00 |
| gpt-5.6-sol | 4.00 | 0.40 | 20.00 |
| gpt-6-astra | 10.00 | 1.00 | 50.00 |

### 5.2 Instruction tokens (measured)

Measured with the `o200k_base` tokenizer:

| v0 file | Tokens | v1 file | Tokens |
| ------- | -----: | ------- | -----: |
| `instruction_0.md` | 1,350 | `AGENTS.md` | 721 |
| `instruction_1_HCD.md` | 4,796 | `phases/HCD.md` | 1,296 |
| `instruction_2_FRG.md` | 5,315 | `phases/FRG.md` | 1,036 |
| `instruction_3_csv.md` | 2,410 | `phases/CSV.md` (fallback only) | 481 |
| **Total** | **13,871** | **Total** | **3,534** |

Instructions in the context of every request, by phase:

```
            v0 (tokens)                                 v1 (tokens)
HCD   ██████ 6.1k                                 ██ 2.0k
FRG   ███████████▌ 11.5k                          ███ 3.1k
CSV   █████████████▉ 13.9k                        ███ 3.1k (no agent unless fallback)
```

The prompts shrink to about a quarter. Roughly a third of the reduction comes from writing them in English: the same sentence costs about 1.75× more tokens in Japanese (42 vs 24 tokens in our sample). The rest comes from removing duplicated explanations and the steps that code now does.

### 5.3 Artifact output (estimated from real v0 projects)

We measured the final artifacts of five v0-era projects in the repository archive (VOR learning, deductive reasoning, associative memory, and two perceptual-speed projects). Average per project:

| Item | Tokens | In v1 |
| ---- | -----: | ----- |
| All HCD/FRG artifacts written by the agent | 62,400 | |
| Beginner explainer + Mermaid diagram file | −9,100 | not generated |
| Mermaid blocks inside FRG files | −1,000 | not generated |
| CSVs typed by the agent | −6,300 | generated by code |
| Japanese text in the remaining markdown, rewritten in English | −10,300 | English is shorter |
| **Estimated v1 artifact output** | **≈35,700** | **≈ −43%** |

These are the sizes of the final files, so this is a lower bound. The agent usually rewrites `3_UC.md` several times while filling steps 3–6, and each rewrite is output again.

### 5.4 What this means per project (illustrative)

Assumptions: about 200 model requests per run (120 in HCD, 60 in FRG, 20 in CSV for v0). Instruction savings: 120×4.1k + 60×8.4k + 20×10.8k ≈ 1.2M context tokens, almost all cached. Output savings: about 26.7k tokens.

| Model | Context savings (cached) | Output savings | Total per project |
| ----- | -----------------------: | -------------: | ----------------: |
| gpt-6-luna | $0.01 | $0.01 | **≈ $0.03** |
| gpt-6-sol | $0.24 | $0.27 | **≈ $0.51** |
| gpt-5.6-sol | $0.48 | $0.53 | **≈ $1.01** |
| gpt-6-astra | $1.21 | $1.33 | **≈ $2.54** |

Not counted above:

- **Less context from artifacts.** English files are smaller when the agent reads them back, which saves further input tokens on every request.
- **No CSV re-read.** In v0 the CSV phase read all markdown again (tens of thousands of tokens) before translating. In v1 this only happens in the fallback.
- **Fewer wasted runs.** v0 could finish with broken tables that needed a follow-up job, which is a whole new run. v1 catches those problems during the run.
- **New cost in v1: fix turns.** Each fix turn re-sends the context. It is limited to 3 per phase and targets only the listed problems, but a very broken first draft can cost more than in v0.

Reasoning tokens depend mostly on the model and the reasoning effort, not on the harness, so the percentage saved on the whole bill is smaller than the figures above. On the default gpt-6-luna the absolute difference is small. The harness matters more on larger models and for data quality. The usage line in each chat and the OpenAI dashboard remain the source of truth. Compare a v0 and a v1 run of the same ROI/TLF to see the real effect.

---

## 6. Compatibility

- Projects created with v0 still open, and follow-ups work on them. The validator also reads the legacy file names (`6_FinalPaper.md`, `1_初期分解結果.md`, `3_最終FRG.md`, …) and split or vertical table layouts.
- If legacy artifacts are in Japanese, automatic CSV conversion refuses non-English content and the agent writes the CSVs through the fallback phase.
- The `[QUESTION]` marker is still recognized for threads started before v1.

---

## 7. Where to look in the code

| Piece | Location |
| ----- | -------- |
| Shared agent rules | `prompts/AGENTS.md` |
| Phase specs | `prompts/phases/HCD.md`, `FRG.md`, `CSV.md` |
| Control loop | `packages/worker/src/index.ts` |
| Turn runner and structured output | `packages/worker/src/codex.ts` |
| Validators and CSV conversion | `packages/shared/src/harness.ts`, `markdown.ts` |
| Tests | `packages/shared/test/harness.test.ts` |
