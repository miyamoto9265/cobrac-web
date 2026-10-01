# Explanatory article

This turn is not a phase. The BRA data of project {P} is finished; write an explanatory article about it for a reader who did not build it. Do not change the existing files in `{P}/`; the worker does not keep changes to them.

The article follows the format of the CoBRAC documentation articles (the harness explainers): a title, a summary table, numbered sections separated by horizontal rules, figures with captions, and tables for facts that can be listed. Borrow their structure and readability; the content is this project's BRA data.

## Language

Write the article in **{LANG}**. This file is not a core artifact, so the "every artifact in English" rule of AGENTS.md does not apply to it. Keep Circuit IDs (`VTA`, `NAC(shell.DRD1+)`), GN IDs (`R.value-learning`), UC Descriptors and Reference IDs verbatim; wrap IDs in backticks. Give the English term in parentheses the first time a technical term appears, when that helps the reader.

## Sources

Read the finished outputs and nothing else is needed:

- `{P}/meta.json`, `{P}/report.md`, `{P}/decision_log.md`
- `{P}/{P}_HCD/uc.json`, `connections.json`, `references.json`
- `{P}/{P}_FRG/frg.json`

Do not search the web and do not add facts that the outputs do not support. Every circuit, connection, function and claim in the article must come from these files; do not add connections, circuits or roles that they do not contain. Where the outputs mark something as uncertain (indirect evidence, another species, a `[kept]` mismatch in the decision log), say so.

Facts for the summary table: project `{NAME}`, Project ID `{P}`, data revision {REV}, BRA built with {BRA_MODEL}.

## Reader and style

- Aim at a final-year undergraduate in neuroscience and at the team members who review this BRA: explain every term at first use, but do not drop information or oversimplify.
- Write plain, calm explanatory prose in complete sentences whose subject and predicate match. No catchphrases, punchlines, rhetorical questions, exaggeration or dramatic wording, and no strings of short fragments. Give the background a reader needs instead of cutting it.
- In Japanese, write in 敬体（です・ます調）throughout, in the tone of a colleague explaining the data at a team meeting: no 常体, no 体言止め, no overly formal honorifics.
- Cover the whole HCD and FRG. Summarise in tables (roles, inputs and outputs, functions), but do not copy whole fields or tables of the source files: the reader has the graphs and tables next to the article.

## Structure

1. One `# ` title line naming the function and the region, with a short subtitle after a colon (Japanese: full-width `：`), e.g. `# 中脳辺縁系の報酬予測誤差学習 解説：回路と機能の対応`.
2. Right after the title, a two-column summary table (header row `| Item | Content |` in {LANG}; Japanese `| 項目 | 内容 |`) with the rows: Document (what the article explains), Readers, Data (the project name, Project ID, revision and model above), Related (the HCD graph, the FRG graph and the tables of this project, on the same project page).
3. Then `---` and numbered `##` sections, with `---` between sections. Use `### N.M` subsections where a section has several parts. Use these sections in this order (headings in {LANG}); add one when the data needs it (for example for Collections), and leave out a subsection that has nothing to say:
   1. **In short** — two or three paragraphs: what the region does for the function, the main route of information from the inputs (ROI_Input) to the outputs (ROI_Output), and how the FRG divides the function. Embed the circuit figure here.
   2. **Terms** — a table `Term | Meaning`: ROI, TLF, HCD, FRG, UC, GN, ROI_Input / ROI_Output, and the domain terms the article uses (transmitters, receptor types or cell types that appear in Circuit IDs). Spell the BRA terms out exactly as: ROI = region of interest, TLF = top-level function, HCD = hypothetical component diagram, FRG = function realization graph, UC = uniform circuit, GN = group node.
   3. **The region and the function** — what the ROI and the TLF are and why this region; a table of the inputs and outputs of the ROI (circuit, what it sends or receives, Reference IDs).
   4. **Circuits and connections (HCD)** — the UCs and their roles (a table `Circuit ID | Role | Main inputs | Main outputs`), then the information flow along the connections in subsections, following the circuit figure.
   5. **How the FRG decomposes the function** — the FRG figure, then each GN: what it computes, its UCs, and how its interface follows from the UCs (a table or one `###` per GN).
   6. **Which connections serve which function** — the function map figure, then a table `GN | Connections within | Inputs | Outputs` and prose on the connections that matter most: which connection carries which part of the function and on what evidence.
   7. **Certainty and open questions** — a list with a **bold** lead-in per item: indirect or cross-species evidence, uncertain anchors, kept mismatches, what the data does not cover.
   8. **Where the data is** — a table `File | Contents` for the source files above and the xlsx.
   For a Japanese article use headings like `## 1. ひとことで言うと`, `## 2. 用語`, `## 3. 領域と機能`, `## 4. 回路と接続（HCD）`, `## 5. 機能の分解（FRG）`, `## 6. どの接続がどの機能を担うか`, `## 7. 確からしさと未解決の点`, `## 8. データの場所`.
4. Contrast tables or before/after comparisons are optional: use them only where the data itself has two things to compare (for example two pathways or two cell populations).
5. You may link to a section like the documentation does: `[4.2](#42-情報の流れ)`. The anchor is the heading text in lower case, spaces replaced by `-`, punctuation (including `.`) removed.

## Figures

The worker drew these figures from the BRA data, each in a wide version and a one-column version for phones (labels in {FIGLANG}):

{FIGURES}

- Embed each of them exactly once, on its own line, where the text explains it: `![<one sentence on what the figure shows>](./figures/<name>.svg "<caption>")`. Number the captions in order of appearance (Japanese: `図 1　<title>` with a full-width space; English: `Figure 1. <title>`).
- Tell the reader in the text what to look at in each figure. Describe only what the figure shows, and refer to its parts by their labels (the input band, the ROI band, a GN's card), not by position: the phone version arranges them differently.
- Only when an important point cannot be shown with these figures (for example the computation inside one UC given by its `implementation`), you may draw up to 2 figures of your own as SVG files `{P}/article/figures/<name>.svg` (kebab-case name, at most 880 px wide; optionally `<name>.narrow.svg`, 430 px wide, for phones) and embed them the same way. Use only shapes, text and arrows: no scripts, styles, links, images or external fonts. Draw only what the data contains. Most articles need none.

## Format

Write `{P}/article/{LOCALE}.md` (create the folder):

- Plain Markdown: paragraphs, lists, `**bold**`, tables and the figures above. No HTML, no Mermaid or other diagrams in code blocks.
- An arrow between two Circuit IDs (`` `A` → `B` ``) means a connection in `connections.json` from `A` to `B`. Write one only for a connection that exists, in its direction; describe a longer route step by step through existing connections.
- Cite literature only with Reference IDs from `{P}/{P}_HCD/references.json`, exactly as written there and each in its own brackets: `[Schultz, 1997]`, `[Schultz, 1997] [Haber, 2010]`. Never cite anything else.
- Do not write a reference list; the worker appends one with the DOIs of the IDs you cite.

Finish with `status: "done"` and a one-sentence `message` in {LANG}. Do not ask questions in this turn.
