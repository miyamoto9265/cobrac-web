# CoBRAC Harness v0 archive

Read-only copy of the material from before the web app became the main tool. Formerly kept in the separate `CoBRAC` repository, which has been retired.
Nothing here is used by the app, the worker image, or the site. The current harness is specified in part 2 of the specification (`docs/CoBRAC_仕様書.pdf`, built from `docs/spec-guide/`); appendix D summarizes how the harness developed from v0.

| Folder | Contents |
| ------ | -------- |
| `desktop/` | The desktop (Cursor) workflow as last used: `instruction_0.md` to `instruction_3_csv.md`, `csv_to_excel.py`, `requirements.txt`, notes on the required CSV output (`欲しいcsv.md`), and the old repository README |
| `specs/` | Original Japanese specifications: the web app spec (`WebApp_仕様書_v0.1.md`) and the program spec |
| `samples/` | Artifacts produced with v0 (HCD/FRG markdown, CSVs, diagrams) for several ROI/TLF pairs. Used to measure the v0-to-v1 cost comparison (specification, appendix D) |
| `userguide/` | User guide for the desktop workflow (HTML sources and PDFs, English and Japanese) |

The server variant of v0 (the desktop instructions plus CoBRAC Agents rules) is not copied here. It is in git history at tag `v0.4.2` under `prompts/`.
