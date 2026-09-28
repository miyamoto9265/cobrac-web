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

3. **UCs -> `3_UC.md`.** Define UCs from the BIF. Criteria: involved in the TLF; encodes homogeneous information; appropriate mesoscopic granularity; **distinguish ROI-internal from external UCs (most important)**: write `noROI(input)` or `noROI(output)` in Comments for every external UC. Name every UC (internal and external) by the UC naming rules below, using the `rcs` MCP tools.

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

## UC naming (SABRA)

Every UC is anchored on exactly one unit of SABRA, the organisation's mixed atlas: a BNA (Brainnetome) area for neocortex, amygdala, hippocampus, basal ganglia and thalamus, and a DHBA term (a HOMBA term that has a DHBA name) for everything else. SABRA has no IDs of its own and neither do UCs: the **UC Descriptor** (anchor + optional facets) is the UC's key, the **Circuit ID** its readable alias. The same population gets the same names in every project.

**The anchor alone is the normal case.** When a UC is a whole SABRA unit, its descriptor is just the anchor and its Circuit ID just the anchor's abbreviation (`HOMBA:12261` / `VTA`, `BNA:223-224` / `NAC`, `BNA:57` / `A4ul@L`). Add a facet only when the HCD needs a population finer than the unit (e.g. two UCs in the same unit with different connections or Output Semantics, or a sub-population defined by its projection). Do not add facets to describe a UC: the transmitter goes in Transmitter, the content in Output Semantics, the evidence in Source of ID.

Anchor procedure (log each UC's query and choice in `1_Thinking.md`; the worker also keeps every RCS call):

1. Take only the region words of the UC (drop cell type, layer, transmitter, gene, projection and response words; those become facets if needed).
2. `search_homba_candidates` with them (`context`: ROI/TLF/species). Read `ai.results` (else the top `candidates`):
   - `sabra.atlas: DHBA`, `relation '='`, `sabra.dhba_exact: true` → anchor `HOMBA:<id>`; abbreviation = `sabra.dhba_acronym` (the DHBA acronym, e.g. `Arc`, not the HOMBA acronym `ArH`).
   - `sabra.atlas: DHBA` with `dhba_exact: false` or `relation '<'` (the region is finer than any DHBA term) → anchor `sabra.dhba_homba_id`, and only if the UC needs the finer region, facet `part:<matched HOMBA ID>`.
   - `sabra.atlas: BNA` → `search_bna_candidates` with the same words (add left/right when known). One BNA area clearly dominates (top `p_raw` ≥ 0.5 with `k_papers` ≥ 2) → `BNA:<label>` (one side) or `BNA:<left>-<right>` (both sides); abbreviation = `bna_area_abbr`. Otherwise use `level: "l2"` and anchor `BNAG:<L2>` (e.g. `BNAG:Hipp`). If the HOMBA term is finer than the BNA area (e.g. CA1, NAc shell) and the UC needs it, add `part:HOMBA:<id>`.
   - `relation '>'` (the UC spans several units) → join anchors with `&` (`BNA:215-216&BNA:217-218`) or use their common SABRA unit.
   - empty `ai.results` → do not guess: ask the user (turn protocol) with the candidates you saw.
3. Region without any DHBA name on its path (e.g. spinal cord) → anchor on the nearest DHBA ancestor that RCS reports (`sabra.dhba_homba_id`) with `part:`; such regions may also appear freely as `in:` / `out:` values.
4. Check an anchor with `get_homba_term` when unsure (`sabra` shows the atlas and DHBA acronym).

UC Descriptor = `<anchor>[&<anchor>][@L|@R]{/<axis>:<value>[,<value>]}`. Anchors: `HOMBA:<id>`, `BNA:<n>` (odd = left, even = right), `BNA:<l>-<r>`, `BNAG:<L2>`. `@L` / `@R` only for a one-sided pair, HOMBA or BNAG anchor (a single BNA label already has a side). Facets, each at most once, in this order: `part` (finer region: HOMBA ID or short word), `lay` (`L5`), `cell` (`pyr`, `purkinje`), `nt` (`Glu` `GABA` `Gly` `ACh` `DA` `NE` `5HT` `His` `pep`), `mol` (official gene symbol + polarity `+` `-` `~hi` `~lo`, e.g. `DRD1+`; HGNC for human), `in` / `out` (population defined by its input / projection target, as an anchor-style ID), `resp` (response tuning, e.g. `rpe`). No species in descriptors: record the taxon in the evidence.

Circuit ID = `<anchor abbreviation>[@L|@R][(<item>,<item>)]`:

- The head is the anchor's official SABRA abbreviation exactly (case included; spaces → `_`): the DHBA acronym, the BNA area abbreviation (`A9/46d`, `rHipp`, `TE1.0_and_TE1.2`), or for `BNAG` / several anchors the common BNA L2 abbreviation (`Hipp`; else the first anchor's). Never a custom or colloquial abbreviation (`NAc`, `LC`) or a sub-unit one (`NACs`, `CA1`): those go inside the parentheses.
- `@L` / `@R` right after the head whenever the UC is one-sided (always for a single BNA label: `A4ul@L`).
- No facets → no parentheses. Otherwise one item per facet value in facet order, separated by `,`: `part` as a short lowercase word (`shell`, `floc`) or a well-known abbreviation (`CA1`); other facets as written (`L5`, `pyr`, `DA`, `DRD1+`); `in:` / `out:` + the partner's SABRA abbreviation (HOMBA acronym when it is not a SABRA unit).
- Allowed characters: letters, digits, `/ . _ + -` and the delimiters `@ ( ) , :` in their roles only. No spaces, `;`, `|`, `[ ]`, nested parentheses.

| UC | UC Descriptor | Circuit ID |
|---|---|---|
| ventral tegmental area | `HOMBA:12261` | `VTA` |
| nucleus accumbens (both sides) | `BNA:223-224` | `NAC` |
| left area 4, upper limb | `BNA:57` | `A4ul@L` |
| locus coeruleus noradrenergic cells | `HOMBA:12499/nt:NE` | `NC(NE)` |
| arcuate AgRP neurons | `HOMBA:10492/mol:AGRP+` | `Arc(AGRP+)` |
| NAc shell DRD1+ cells | `BNA:223-224/part:HOMBA:10341/mol:DRD1+` | `NAC(shell,DRD1+)` |
| VTA DA cells projecting to NAc, encoding RPE | `HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe` | `VTA(DA,out:NAC,rpe)` |
| hippocampal CA1 pyramidal cells (rostral + caudal) | `BNAG:Hipp/part:HOMBA:10297/cell:pyr` | `Hipp(CA1,pyr)` |

The validator checks the syntax, that the head (and side) equals the anchor's abbreviation from RCS / BNA, that items match the facets, and that no two UCs share a descriptor. Two UCs may not share a descriptor: if they are really different populations, add the facet that separates them. In markdown always wrap Circuit IDs in backticks; references stay `[U.<Circuit ID>]` (e.g. `[U.NAC(shell,DRD1+)]`).

If `3_UC.md` of an existing project has no `UC Descriptor` column (made before these rules), keep its Circuit IDs unless the user asks to rename them.

## Table formats

`3_UC.md` holds exactly one UC table with these columns (fill progressively through steps 3-6):

| Circuit ID | UC Descriptor | Names | Source of ID | Transmitter | Modulation Type | Comments | Interface | Output Semantics | Requirement | Requirement realization by interface | Capability | Mechanism | Implementation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

- Circuit ID and UC Descriptor: by the UC naming rules (both in backticks); Names: formal name; Source of ID: main supporting `[Author, Year]`; Transmitter and Modulation Type (`Excitatory` / `Inhibitory` / `Modulatory`): empty when unknown; Comments: role and corresponding tissue (+ `noROI(...)` tag when external).

`4_Connection.md` holds exactly one connection table:

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference ID | Taxon | Measurement method | Pointers on literature | Pointers on figure |
|---|---|---|---|---|---|---|---|

- Sender/Receiver are UC IDs defined in `3_UC.md` (not tissue names); Comment: property and information carried; the pointers are short locations in the paper and its figures.

Finish the turn with `status: "done"` once all eight steps are complete.
