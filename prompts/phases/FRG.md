# Phase FRG - Function Realization Graph

Build the FRG in `{P}/{P}_FRG/` from the TLF and the ROI-internal UCs of the finished HCD (`{P}/{P}_HCD/3_UC.md`, `4_Connection.md`). The FRG is a directed acyclic graph that decomposes the TLF hierarchically into group nodes (GN) whose leaves are UCs, making the computation interpretable.

## Concepts

- Root: the TLF node. Intermediate: **GN**s, sub-functions over several levels; each is necessary for its parent and sufficiently realized by the combination of its children. Leaves: **UC**s (the HCD's ROI-internal Uniform Circuits, called Uniform Components here).
- Node IDs: kebab-case, no spaces, prefix `R.` for the TLF and GNs (e.g. `R.Motor-Learning`), `U.` + Circuit ID for UCs (e.g. `U.VTA`, `U.NAC(shell,DRD1+)`; Circuit IDs keep their own format). Separate Subnodes with `;`.

## Steps and files

1. **Initial decomposition -> `1_InitialDecomposition.md`.** Decompose the TLF purely logically (ignore UCs) into sub-functions, recursively, until each is small enough. Check that every parent is realized by its children and every GN is a clear, independent function. Table: `| Level | Node ID | Function |`.

2. **Optimization -> `2_OptimizedFRG.md`.** Merge GNs that duplicate or resemble each other or are over-split, as long as interpretability improves, and rebuild parent/child links. Table: `| Level | Node ID | Function | Parent | Subnodes |`, followed by the merge rationale.

3. **Grounding in UCs -> `3_FinalFRG.md`.** Attach ROI-internal UCs only (external UCs are treated as attached through the internal UCs they project to). UCs may attach to intermediate GNs, not only the lowest level. Constraints (hard, checked by the validator):
   - a GN whose children are only UCs has **exactly 2** UCs (a GN with a single UC would just be that UC);
   - a GN has **at most 2** UC children; a UC has **at most 2** GN parents;
   - every ROI-internal UC appears in the FRG; every GN has children; one root (the TLF); no cycles.
   If the constraints cannot be met, go back and decompose the TLF more finely. Also check that the UC combinations realize each GN and are consistent with the HCD connections.

4. **Interfaces in `3_FinalFRG.md`.** For a GN whose children are all UCs, the interface is the union of its UCs' interfaces with internal edges removed; external UCs may appear. Example: `U.A: [U.E] = U.A([U.F], [U.G])` and `U.B: [U.H] = U.B([U.F], [U.I])` give `R.GN: ([U.E], [U.H]) = R.GN([U.F], [U.G], [U.I])`. Compose upward recursively; the TLF should become `(all noROI(output)) = R.TLF(all noROI(input))`.

5. **Function details -> `4_FunctionDetails.md`.** For the TLF and every GN (not UCs) define, referring to nodes as `[R.Name]` / `[U.Name]`:
   - **Requirement**: the function this node must perform for its parent/TLF; name the UCs of its interface with their Output Semantics.
   - **Requirement realization by interface**: how the interface realizes it; mention every UC of the interface; verify consistency.
   - **Capability**: the Requirement without Output Semantics (generalized); cite prior work, biology or computational models.
   - **Mechanism**: how the Capability is carried out.
   Check consistency with the parent's requirement and the children's interfaces; fix related files when inconsistent.

6. **Report -> `5_Report.md`.** Rationale of the decomposition and merges, neuroscientific validity of the UC grounding, overall consistency of the function details, limitations and future work.

## Table formats

`3_FinalFRG.md` holds exactly one FRG table: one row per TLF/GN (no UC rows), children separated by `;`:

| Node ID | Subnodes | Comment | Interface |
|---|---|---|---|
| `R.Node` | `R.Child`;`U.UC` | description of the node | ([U.X]) = R.Node([U.Y], [U.Z]) |

`4_FunctionDetails.md` holds exactly one table with one row per TLF/GN:

| Node ID | Requirement | Requirement realization by interface | Capability | Mechanism |
|---|---|---|---|---|

Finish the turn with `status: "done"` once all six steps are complete.
