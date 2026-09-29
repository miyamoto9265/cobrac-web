# Phase FRG - Function Realization Graph

Build the FRG in `{P}/{P}_FRG/frg.json` from the TLF and the ROI-internal UCs of the finished HCD (`{P}/{P}_HCD/uc.json`, `connections.json`). The FRG is a directed acyclic graph that decomposes the TLF hierarchically into group nodes (GN) whose leaves are UCs, making the computation interpretable.

## Concepts

- Root: the TLF node. Intermediate: **GN**s, sub-functions over several levels; each is necessary for its parent and sufficiently realized by the combination of its children. Leaves: **UC**s (the HCD's ROI-internal Uniform Circuits, called Uniform Components here).
- Node IDs: kebab-case, no spaces, prefix `R.` for the TLF and GNs (e.g. `R.Motor-Learning`), `U.` + Circuit ID for UCs (e.g. `U.VTA`, `U.NAC(shell,DRD1+)`; Circuit IDs keep their own format).

## Steps

Steps 1-2 are working steps: do them in your reasoning and keep only their rationale for the report.

1. **Initial decomposition.** Decompose the TLF purely logically (ignore UCs) into sub-functions, recursively, until each is small enough. Check that every parent is realized by its children and every GN is a clear, independent function.

2. **Optimization.** Merge GNs that duplicate or resemble each other or are over-split, as long as interpretability improves, and rebuild parent/child links. Remember what you merged and why.

3. **Grounding in UCs -> `frg.json` `subnodes`.** Attach ROI-internal UCs only (external UCs are treated as attached through the internal UCs they project to). UCs may attach to intermediate GNs, not only the lowest level. Constraints (hard, checked by the validator):
   - a GN whose children are only UCs has **exactly 2** UCs (a GN with a single UC would just be that UC);
   - a GN has **at most 2** UC children; a UC has **at most 2** GN parents;
   - every ROI-internal UC appears in the FRG; every GN has children; one root (the TLF); no cycles.
   If the constraints cannot be met, go back and decompose the TLF more finely. Also check that the UC combinations realize each GN and are consistent with the HCD connections.

4. **Interfaces -> `frg.json` `interface`.** For a GN whose children are all UCs, the interface is the union of its UCs' interfaces with internal edges removed; external UCs may appear. Example: `U.A: [U.E] = U.A([U.F], [U.G])` and `U.B: [U.H] = U.B([U.F], [U.I])` give `R.GN: ([U.E], [U.H]) = R.GN([U.F], [U.G], [U.I])`. Compose upward recursively; the TLF should become `(all noROI(output)) = R.TLF(all noROI(input))`.

5. **Function details -> `frg.json`.** For the TLF and every GN (not UCs) define, referring to nodes as `[R.<node ID>]` / `[U.<Circuit ID>]` with existing IDs (tissue is always named by its `[U.<Circuit ID>]`, not by other names):
   - `requirement`: the function this node must perform for its parent/TLF; name the UCs of its interface with their Output Semantics.
   - `requirementRealization` (Requirement realization by interface): how the interface realizes it; mention every UC of the interface; verify consistency.
   - `capability`: the Requirement without Output Semantics (generalized); cite prior work, biology or computational models.
   - `mechanism`: how the Capability is carried out.
   Check consistency with the parent's requirement and the children's interfaces; fix related files when inconsistent.

6. **Report -> `report.md`.** Add a `## FRG` section after `## HCD`: the rationale of the decomposition and of the merges from step 2, the neuroscientific validity of the UC grounding, and the overall consistency of the function details. Extend `## Limitations` and `## References` as needed.

## File format

`frg.json` holds one entry per TLF/GN (no UC entries; UCs appear only in `subnodes`). Every key is required; schema: `schemas/frg.schema.json`.

```json
{ "nodes": [ {
  "id": "R.Node", "subnodes": ["R.Child", "U.UC"], "comment": "description of the node",
  "interface": "([U.X]) = R.Node([U.Y], [U.Z])",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "..."
} ] }
```

The worker fills the GN Output Semantics of the FRG sheet from the `outputSemantics` of the UCs that project out of each GN, and writes the fixed text for the rows of UCs outside the ROI; do not add them to `frg.json`.

Finish the turn with `status: "done"` once all six steps are complete.
