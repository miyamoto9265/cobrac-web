# Phase CSV (fallback) - write the CSVs yourself

The worker normally generates the CSVs from your markdown tables. That automatic conversion failed for the reasons listed below (typically legacy or non-English artifacts, or tables that cannot be parsed), so write the four CSVs yourself in `{P}/{P}_CSV/`. `Project.csv` is written by the worker; do not touch it.

Rules: UTF-8, RFC 4180 (quote cells containing commas, quotes or newlines), exactly the headers below, **all content in English** (translate when the source is not), no backticks, IDs without the `U.`/`R.` prefix unless stated.

1. `References.csv` - `Reference ID,DOI`: every reference of `2_BIF.md`, plus any Reference ID used in `4_Connection.md` or `3_UC.md` (DOI `N/A` if unknown); no duplicates.
2. `Circuits.csv` - `Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor`: one row per UC of `3_UC.md` (keep the `noROI(...)` tags in Comments; omit the last column when `3_UC.md` has no UC Descriptor column). Quote every field that contains `,` (Circuit IDs such as `NAC(shell,DRD1+)`).
3. `Connections.csv` - `Sender Circuit ID (sCID),Receiver Circuit ID (rCID),Comments,Reference ID,Taxon,Measurement method,Pointers on literature,Pointers on figure`: one row per connection of `4_Connection.md`.
4. `FRG.csv` - `Node ID,Subnodes,Circuit ID,Projected Circuits,Capability,Mechanism,Implementation of Uniform Circuit,Requirements Realization by Interface,Requirements,Output Semantics,Comments`:
   - one row per TLF/GN of the final FRG table: Node ID `R.*`; Subnodes `;`-separated with prefixes; Circuit ID, Projected Circuits, Implementation and Output Semantics empty; the function items from the function-details table; Comments from the FRG table;
   - one row per UC of `3_UC.md`: Node ID `U.<Circuit ID>`; Subnodes empty; Circuit ID; Projected Circuits = `;`-separated receivers of its connections (no prefix); all function items, Output Semantics and Comments from `3_UC.md`.

Finish the turn with `status: "done"`.
