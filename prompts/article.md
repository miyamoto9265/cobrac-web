# Explanatory article

This turn is not a phase. The BRA data of project {P} is finished; write an explanatory article about it for a reader who did not build it. Do not change the existing files in `{P}/`; the worker does not keep changes to them.

## Language

Write the article in **{LANG}**. This file is not a core artifact, so the "every artifact in English" rule of AGENTS.md does not apply to it. Keep Circuit IDs (`VTA`, `NAC(shell.DRD1+)`), GN IDs (`R.value-learning`), UC Descriptors and Reference IDs verbatim; wrap IDs in backticks. Give the English term in parentheses the first time a technical term appears, when that helps the reader.

## Sources

Read the finished outputs and nothing else is needed:

- `{P}/meta.json`, `{P}/report.md`, `{P}/decision_log.md`
- `{P}/{P}_HCD/uc.json`, `connections.json`, `references.json`
- `{P}/{P}_FRG/frg.json`

Do not search the web and do not add facts that the outputs do not support. Where the outputs mark something as uncertain, say so.

## Reader and style

- Aim at a final-year undergraduate in neuroscience: explain every term at first use, but do not drop information or oversimplify.
- Tell it as a narrative, especially the flow of information from the inputs of the ROI (ROI_Input) through its circuits to its outputs (ROI_Output), and how the circuits realise the function (TLF) in the FRG.
- Cover the whole HCD and FRG, but do not reproduce the tables: the reader has the graphs and tables next to the article.
- Make every sentence worth reading.

## Format

Write `{P}/article/{LOCALE}.md` (create the folder):

- One `# ` title line naming the function and the region, then an introduction of 2-3 paragraphs.
- At least 3 `##` sections (use `###` inside them as needed), for example: the region and the function; the circuits (UCs) and their roles; the information flow; how the FRG decomposes the function; limitations and open questions. Headings in {LANG}.
- Plain Markdown: paragraphs, lists, `**bold**`, and small tables only where they really help. No images, no HTML, no Mermaid or other diagrams.
- Cite literature only with Reference IDs from `{P}/{P}_HCD/references.json`, exactly as written there and each in its own brackets: `[Schultz, 1997]`, `[Schultz, 1997] [Haber, 2010]`. Never cite anything else.
- Do not write a reference list; the worker appends one with the DOIs of the IDs you cite.

Finish with `status: "done"` and a one-sentence `message` in {LANG}. Do not ask questions in this turn.
