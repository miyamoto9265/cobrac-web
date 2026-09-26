# Phase HCD - Hypothetical Component Diagram

Build the HCD for the given ROI and TLF in `{P}/{P}_HCD/`. The HCD is a graph that describes the information processing of the ROI, grounded in neuroscience evidence, at the mesoscopic level of neural tissue.

## Concepts

- **TLF** (Top Level Function): the computational function the HCD explains. **ROI** (Region of Interest): the neural tissue that realizes it.
- **UC** (Uniform Circuit): the node of the HCD; the smallest mesoscopic neural population that plausibly encodes homogeneous information. "Circuit" here just means *neural population* (not synaptic wiring). Each ROI-internal UC has an Interface, Output Semantics and function items.
- **BIF** (Brain Information Flow): literature evidence of anatomical projections. **Connection**: a directed UC-to-UC edge justified by BIF; connections determine interfaces.

## Steps and files

1. **ROI/TLF validation -> `1_Thinking.md`, `../meta.json`.** Check with literature that the ROI can realize the TLF. If ROI or TLF is missing, determine a plausible one by research. If the ROI looks inappropriate, or there are several candidates the user must choose from, ask (turn protocol) with evidence and alternatives. Identify ROI_Input (information that must enter the ROI) and ROI_Output (information it must emit). Log research and reasoning in `1_Thinking.md`; write `meta.json`.

2. **BIF -> `2_BIF.md`.** Survey projections relevant to the ROI thoroughly. Two tables, in this order:
   - `## References`: `| Reference ID | DOI |`
   - `## Connections`: `| Sender | Receiver | Comment | Reference ID |` (tissue names; note tissue outside the ROI in Comment; prefer connections confirmed by several papers; note strength and excitatory/inhibitory nature when known).

3. **UCs -> `3_UC.md`.** Define UCs from the BIF. Criteria: involved in the TLF; encodes homogeneous information; appropriate mesoscopic granularity; **distinguish ROI-internal from external UCs (most important)**: write `noROI(input)` or `noROI(output)` in Comments for every external UC.

4. **Connections -> `4_Connection.md`; interfaces in `3_UC.md`.** Map BIF projections onto UC-to-UC connections (one BIF entry may yield several connections and vice versa). For every ROI-internal UC, fill Interface as `([Out1], [Out2]) = UC([In1], [In2])`, where outputs are the receivers and inputs the senders of its connections. External UCs: leave Interface empty.

5. **Output Semantics in `3_UC.md`.** For every UC (internal or external, except external sinks without output) describe what information it encodes, as `[UC]content;`. Use computational terms (reward prediction, action selection, sensory feature, internal state), prefer experimentally identified representations, and consider what downstream UCs need.

6. **Function items in `3_UC.md`** (ROI-internal UCs only; external: empty). Inside these five items refer to UCs as `[U.Name]` and state inputs/outputs explicitly as "input: [U.X]", "output: [U.Y]" (except Implementation). This demands careful academic interpretation.
   - **Requirement**: the computational function this UC must perform for the TLF (a decomposition of the TLF); describe the input-to-output transformation and name the involved UCs together with their Output Semantics.
   - **Requirement realization by interface**: how the Requirement is realized by the Interface; verify the two do not contradict.
   - **Capability**: the Requirement generalized by removing Output Semantics (task-independent); cite the prior work, biology or computational models it is based on.
   - **Mechanism**: how the Capability is carried out as a mechanism.
   - **Implementation**: only equations relating inputs to outputs, necessary and sufficient for the Mechanism (e.g. `[U.A] = [U.B]/[U.C]`, `[U.A] = P([U.B]\|[U.C])`). No prose, no code.

7. **Verification -> `5_Verification.md`.** Check and fix: connections vs interfaces; a processing path from ROI_Input to ROI_Output; no duplicated/missing UCs and suitable granularity; every connection cited; the HCD can realize the TLF. Record findings and fixes.

8. **Report -> `6_FinalReport.md`.** A paper-style report: title naming TLF and ROI; TLF/ROI overview; each UC's role and evidence; the processing flow from ROI_Input to ROI_Output; key findings; limitations and future work; full bibliography.

## Table formats

`3_UC.md` holds exactly one UC table with these columns (fill progressively through steps 3-6):

| Circuit ID | Names | Source of ID | Transmitter | Modulation Type | Comments | Interface | Output Semantics | Requirement | Requirement realization by interface | Capability | Mechanism | Implementation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- Circuit ID: `` `UC-name` ``; Names: formal name; Source of ID: main supporting `[Author, Year]`; Transmitter and Modulation Type (`Excitatory` / `Inhibitory` / `Modulatory`): empty when unknown; Comments: role and corresponding tissue (+ `noROI(...)` tag when external).

`4_Connection.md` holds exactly one connection table:

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference ID | Taxon | Measurement method | Pointers on literature | Pointers on figure |
|---|---|---|---|---|---|---|---|

- Sender/Receiver are UC IDs defined in `3_UC.md` (not tissue names); Comment: property and information carried; the pointers are short locations in the paper and its figures.

Finish the turn with `status: "done"` once all eight steps are complete.
