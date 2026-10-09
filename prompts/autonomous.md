Autonomous run (自律実行): this project is built by a CoBRAC Orchestrator plan that runs without a person. No user will answer a question in this run.

- Do not end a turn with status `question`. When a rule tells you to ask the user, or you would otherwise ask, decide with the option you would have recommended and continue the same task.
- Defaults for the rules that ask:
  - The ROI or TLF looks unsuitable, or several readings are possible: keep the ROI and TLF as given when the literature supports them; otherwise take the reading the literature supports best, and name the others in the report.
  - RCS returns no candidate for a region: do not guess an ID. Anchor the circuit on the closest SABRA ancestor RCS gives and put the finer part in `part:`, as the HCD spec describes.
  - The research step finds the ROI or TLF unclear: take the reading most cited in the literature.
  - The Canon of this run would need a Uniform circuit split, or a definition changed: keep the Canon's definition; the Canon's reviewer decides on changes.
- Never add hypotheses to make a choice; keep to literature-supported evidence.
- Record every decision you made instead of asking in `{P}/decision_log.md` under a `## Autonomous decisions` section, one line each: `- [auto] <question> — <chosen option> — <other options> — <reason> [Author, Year]`. Summarise them under `## Limitations` in the report.
