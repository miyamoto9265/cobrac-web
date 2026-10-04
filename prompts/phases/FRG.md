# Phase FRG - Function Realization Graph

Build the FRG in `{P}/{P}_FRG/frg.json` from the TLF and the ROI-internal UCs of the finished HCD (`{P}/{P}_HCD/uc.json`, `connections.json`). The FRG is a directed acyclic graph that decomposes the TLF hierarchically into group nodes (GN) whose leaves are UCs, making the computation interpretable.

## Concepts

- Root: the TLF node. Intermediate: **GN**s, sub-functions over several levels; each is necessary for its parent and sufficiently realized by the combination of its children. Leaves: **UC**s (the HCD's ROI-internal Uniform Circuits). Collections of `uc.json` are not FRG nodes: attach their UCs.
- A GN that holds UCs is realized by those UCs **and the connections between them**: what the GN adds to its UCs' own functions is what their interaction computes (the internal edges that its interface removes).
- Node IDs: kebab-case, no spaces, prefix `R.` for the TLF and GNs (e.g. `R.Motor-Learning`), `U.` + Circuit ID for UCs (e.g. `U.VTA`, `U.NACs(DRD1+)`; Circuit IDs keep their own format).
- **Bottom-up candidates**: the worker reads the ROI-internal connections of the HCD and lists, at the end of this prompt and in `{P}/frg_candidates.json` (rewritten whenever the HCD changes): the **pathways** from ROI inputs to ROI outputs (a `{…}` block is a loop), the **components** of the ROI-internal graph, the **motifs** of 3-4 UCs that pairs of UCs cannot express (loops, feedforward triangles), and every connected **pair**, each with an ID (`W1`, `M1`, …). Arrows show the sign: → excitatory or unknown, ⊣ inhibitory, ⇢ modulatory.

## Steps

The FRG meets in the middle: a top-down decomposition of the TLF (steps 1-2) and a bottom-up reading of the circuit (step 3) are made independently and then matched (step 4). Steps 1-3 are working steps: do them in your reasoning and keep only their rationale for the report.

1. **Top-down decomposition.** Decompose the TLF purely logically into sub-functions, recursively, until each is small enough. Do this before you look at the UCs and the candidates, so that the decomposition does not just copy the circuit. Split where the function divides (separate inputs, outputs or goals); the number of children is not fixed. Check that every parent is realized by its children and every GN is a clear, independent function.

2. **Optimization.** Merge GNs that duplicate or resemble each other or are over-split, as long as interpretability improves, and rebuild parent/child links. Remember what you merged and why.

3. **Bottom-up reading.** Read the candidates. For the pathways and for the motifs and pairs that matter, state in one sentence what the circuit computes, from the UCs' Output Semantics and function items, the signs of the connections, the connection comments and the literature. Cover every ROI-internal UC at least once. Pathways and components suggest the upper levels; motifs and pairs suggest the GNs that hold UCs.

4. **Matching -> `report.md`.** Match each sub-function of steps 1-2 with the candidate that realizes it, and settle every sub-function and every candidate you read:
   - **matched**: a motif or pair realizes the sub-function -> a GN with those UCs;
   - **top-down only** (no candidate realizes it): (a) it is realized only by combining its children -> merge it into its parent or keep it as an upper GN; (b) the HCD lacks a UC or connection that the literature supports -> go back to the HCD (step 5); (c) it is realized outside the ROI -> drop it and say so under `## Limitations`;
   - **bottom-up only** (a candidate no sub-function uses): (a) the decomposition missed a function -> add a GN; (b) it does not serve this TLF -> its UCs serve the TLF through their other GNs; say why in the table;
   - **mismatch** (a sub-function falls on UCs that are not connected): change the decomposition or the HCD (step 5).
   Write the result as a table in the `## FRG` section of `report.md`: sub-function (GN ID) | candidate (IDs and UCs) | outcome | action.

5. **Grounding in UCs -> `frg.json` `subnodes`.** Build the graph from the matching: the GNs that hold UCs come from the matched candidates; group them upward along the top-down decomposition and the pathways to the TLF. Attach ROI-internal UCs only (external UCs are treated as attached through the internal UCs they project to). UCs may attach to intermediate GNs, not only the lowest level. Constraints (hard, checked by the validator):
   - a GN whose children are only UCs has **exactly 2** UCs (a GN with a single UC would just be that UC);
   - a GN has **at most 2** UC children (a motif of 3-4 UCs becomes a GN over GNs of 2 UCs); a UC has **at most 2** GN parents;
   - every ROI-internal UC appears in the FRG; every GN has children; one root (the TLF); no cycles.
   If the constraints cannot be met, or a GN needs a flow or a distinction the HCD does not have, choose the side the evidence supports:
   - **decompose the TLF more finely** (the FRG was too coarse), or
   - **go back to the HCD and split or add UCs** (the HCD was too coarse): split a UC into finer UCs of the same SABRA unit when the literature separates their inputs, outputs or Output Semantics (HCD step 3, with the coarser unit as a Collection), or add a UC or connection the GN requires and the literature supports (HCD steps 2-5: references, quotes, interfaces, Output Semantics and function items of the new UCs; when the HCD spec has ROI rules, list each new ROI-internal UC under its element in `meta.json` `roiElements` and keep the ROI's side). The worker validates changed HCD files again and recomputes the candidates. Do not invent UCs or connections to satisfy the constraints; without evidence, change the FRG instead.
   Record every such change and its reason in `decision_log.md` under `## HCD-FRG revisions` (see AGENTS.md). Also check that the UC combinations realize each GN and are consistent with the HCD connections.

6. **Interfaces -> `frg.json` `interface`.** For a GN whose children are all UCs, the interface is the union of its UCs' interfaces with internal edges removed; external UCs may appear. Example: `U.A: [U.E] = U.A([U.F], [U.G])` and `U.B: [U.H] = U.B([U.F], [U.I])` give `R.GN: ([U.E], [U.H]) = R.GN([U.F], [U.G], [U.I])`. Compose upward recursively; the TLF should become `(all noROI(output)) = R.TLF(all noROI(input))`.

7. **Function details -> `frg.json`.** For the TLF and every GN (not UCs) define, referring to nodes as `[R.<node ID>]` / `[U.<Circuit ID>]` with existing IDs (tissue is always named by its `[U.<Circuit ID>]`, not by other names):
   - `requirement`: the function this node must perform for its parent/TLF; name the UCs of its interface with their Output Semantics.
   - `requirementRealization` (Requirement realization by interface): how the interface realizes it; mention every UC of the interface; verify consistency.
   - `capability`: the Requirement without Output Semantics (generalized); cite prior work, biology or computational models.
   - `mechanism`: how the Capability is carried out.
   Check consistency with the parent's requirement and the children's interfaces; fix related files when inconsistent.

8. **Report -> `report.md`.** Add a `## FRG` section after `## HCD`: the rationale of the decomposition and of the merges from step 2, the matching table of step 4, the neuroscientific validity of the UC grounding, and the overall consistency of the function details. Extend `## Limitations` and `## References` as needed.

## File format

`frg.json` holds one entry per TLF/GN (no UC entries; UCs appear only in `subnodes`). Every key is required except `motifNote`, which this project uses only if a GN rules section follows; schema: `schemas/frg.schema.json`.

```json
{ "nodes": [ {
  "id": "R.Node", "subnodes": ["R.Child", "U.UC"], "comment": "description of the node",
  "interface": "([U.X]) = R.Node([U.Y], [U.Z])",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "..."
} ] }
```

The worker fills the GN Output Semantics of the FRG sheet from the `outputSemantics` of the UCs that project out of each GN, and writes the fixed text for the rows of UCs outside the ROI; do not add them to `frg.json`.

Finish the turn with `status: "done"` once all eight steps are complete.
