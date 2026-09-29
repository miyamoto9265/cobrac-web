# Phase HCD - Hypothetical Component Diagram

Build the HCD for the given ROI and TLF in `{P}/{P}_HCD/`. The HCD is a graph that describes the information processing of the ROI, grounded in neuroscience evidence, at the mesoscopic level of neural tissue.

## Concepts

- **TLF** (Top Level Function): the computational function the HCD explains. **ROI** (Region of Interest): the neural tissue that realizes it.
- **UC** (Uniform Circuit): the node of the HCD; the smallest mesoscopic neural population that plausibly encodes homogeneous information. "Circuit" here just means *neural population* (not synaptic wiring). Each ROI-internal UC has an Interface, Output Semantics and function items.
- **BIF** (Brain Information Flow): literature evidence of anatomical projections. **Connection**: a directed UC-to-UC edge justified by BIF; connections determine interfaces.

## Steps and files

Files are in `{P}/` (`meta.json`, `decision_log.md`, `report.md`) and `{P}/{P}_HCD/` (`references.json`, `uc.json`, `connections.json`); formats at the end.

1. **ROI/TLF validation -> `decision_log.md`, `meta.json`.** Check with literature that the ROI can realize the TLF. If ROI or TLF is missing, determine a plausible one by research. If the ROI looks inappropriate, or there are several candidates the user must choose from, ask (turn protocol) with evidence and alternatives. Identify ROI_Input (information that must enter the ROI) and ROI_Output (information it must emit). Record the conclusion, ROI_Input / ROI_Output and their evidence in `decision_log.md`; write `meta.json` including `name` (see AGENTS.md).

2. **BIF -> `references.json`, `connections.json` `bif`.** Survey projections relevant to the ROI thoroughly. List each projection between tissues (tissue names; note tissue outside the ROI, strength and excitatory/inhibitory nature in `comment`; prefer connections confirmed by several papers) and add every cited paper to `references.json` with its `literatureType`.

3. **UCs -> `uc.json`.** Define UCs from the BIF. Criteria: involved in the TLF; encodes homogeneous information; appropriate mesoscopic granularity; **distinguish ROI-internal from external UCs (most important)**: set `roi` to `internal`, or to `noROI(input)` / `noROI(output)` / `noROI(input,output)` for every external UC. Name every UC (internal and external) by the UC naming rules below, using the `rcs` MCP tools. Start `names` with the SABRA official name of the anchor (the BNA area name from `search_bna_candidates`, or `sabra.dhba_name` from RCS; for a faceted UC, that name followed by the finer population), then synonyms separated by `;` (e.g. `dorsal area 44; Broca's area pars opercularis`). Set `sourceOfId` to one value (see File formats).

4. **Connections -> `connections.json` `connections`; interfaces in `uc.json`.** Map BIF projections onto UC-to-UC connections (one BIF entry may yield several connections and vice versa). Each connection record cites exactly one paper: when several papers support the same sender -> receiver, repeat the connection once per paper, each with that paper's taxon, measurement method and pointers. For every ROI-internal UC, fill `interface` as `([Out1], [Out2]) = <Circuit ID>([In1], [In2])`, where outputs are the receivers and inputs the senders of its connections (e.g. `([U.PC]) = GC([U.VN])`). External UCs: `interface` is `""`.

5. **Output Semantics in `uc.json`.** For every UC (internal or external, except external sinks without output) describe in `outputSemantics` what information it encodes, as exactly one item `[<its own Circuit ID>] content;` (no other `[ ]` or `;` in the content, except `[Author, Year]` citations at the end). The worker derives each GN's Output Semantics in the FRG from these items. Use computational terms (reward prediction, action selection, sensory feature, internal state), prefer experimentally identified representations, and consider what downstream UCs need.

6. **Function items in `uc.json`** (ROI-internal UCs only; external: `""`). Inside these five items (and in `comments`) refer to tissue as `[U.<Circuit ID>]` with an existing Circuit ID, never by a colloquial or atlas-specific name alone (not "Broca's area", "IFG", "BA44"), and state inputs/outputs explicitly as "input: [U.X]", "output: [U.Y]" (except `implementation`). This demands careful academic interpretation.
   - `requirement`: the computational function this UC must perform for the TLF (a decomposition of the TLF); describe the input-to-output transformation and name the involved UCs together with their Output Semantics.
   - `requirementRealization` (Requirement realization by interface): how the Requirement is realized by the Interface; verify the two do not contradict.
   - `capability`: the Requirement generalized by removing Output Semantics (task-independent); cite the prior work, biology or computational models it is based on.
   - `mechanism`: how the Capability is carried out as a mechanism.
   - `implementation`: only equations relating inputs to outputs, necessary and sufficient for the Mechanism (e.g. `[U.A] = [U.B]/[U.C]`, `[U.A] = P([U.B]|[U.C])`). No prose, no code.

7. **Verification.** The worker checks the schemas, IDs, references and interface/connection consistency itself. Check what it cannot and fix the files: a processing path from ROI_Input to ROI_Output; no duplicated/missing UCs and suitable granularity; the HCD can realize the TLF. Note what remains uncertain for the report's limitations.

8. **Report -> `report.md`.** A paper-style report the user reads in the app. Write it with these sections (the FRG phase adds `## FRG` later):
   - `# <title naming TLF and ROI>`, then `## Overview` (TLF/ROI, ROI_Input and ROI_Output);
   - `## HCD`: each UC's role and evidence, the processing flow from ROI_Input to ROI_Output, key findings. Name each tissue by its Circuit ID in backticks (`` `A44d@L` ``) and its SABRA official name, not by other names;
   - `## Limitations`: open questions from step 7 and future work;
   - `## References`: full bibliography of the cited Reference IDs.

## UC naming (SABRA)

Every UC is anchored on exactly one unit of SABRA, the organisation's mixed atlas: a BNA (Brainnetome) area for neocortex, amygdala, hippocampus, basal ganglia and thalamus, and a DHBA term (a HOMBA term that has a DHBA name) for everything else. SABRA has no IDs of its own and neither do UCs: the **UC Descriptor** (anchor + optional facets) is the UC's key, the **Circuit ID** its readable alias. The same population gets the same names in every project.

**The anchor alone is the normal case.** When a UC is a whole SABRA unit, its descriptor is just the anchor and its Circuit ID just the anchor's abbreviation (`HOMBA:12261` / `VTA`, `BNA:223-224` / `NAC`, `BNA:57` / `A4ul@L`). Add a facet only when the HCD needs a population finer than the unit (e.g. two UCs in the same unit with different connections or Output Semantics, or a sub-population defined by its projection). Do not add facets to describe a UC: the transmitter goes in Transmitter, the content in Output Semantics, the evidence in the connections' references.

Anchor procedure (record each UC's anchor choice and reason in `decision_log.md`; the worker keeps every RCS call in `rcs_mcp_calls.jsonl`):

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

The validator checks the syntax, that the head (and side) equals the anchor's abbreviation from RCS / BNA, that items match the facets, and that no two UCs share a descriptor. Two UCs may not share a descriptor: if they are really different populations, add the facet that separates them. In JSON write them without backticks, in markdown wrap them in backticks; references inside text stay `[U.<Circuit ID>]` (e.g. `[U.NAC(shell,DRD1+)]`).

## File formats

Every key is required (use `""` for an empty value); schemas: `schemas/references.schema.json`, `schemas/uc.schema.json`, `schemas/connections.schema.json`.

`references.json` - every reference cited anywhere in the project, each once. `id` is `[<first author's surname>, <year>]`; `title` is the paper's title as published; `pmid` is the PubMed ID or `""`; `journal` the journal name; `literatureType` one of `Experimental results`, `Meta review`, `Textbook`, `Systematic review`, `Review`, `Modeling`, `Simulation`, `Hypothesis`, `Data description`, `Insight`, `Opinion`; `alternativeUrl` the document's URL (publisher, PubMed or book page) when it has no DOI, else `""` (with a PMID the worker adds the PubMed URL itself). Take DOI, PMID and title from the publisher page or PubMed, never from memory:

```json
{ "references": [ { "id": "[Ito, 1982]", "doi": "10.1146/annurev.ne.05.030182.001423", "pmid": "6803651", "title": "Cerebellar control of the vestibulo-ocular reflex--around the flocculus hypothesis", "journal": "Annual Review of Neuroscience", "literatureType": "Review", "alternativeUrl": "" } ] }
```

The worker looks up every DOI in Crossref / doi.org and every PMID in PubMed and checks that the record has the same first author, year (±1) and title; it also checks that every `[Author, Year]` in the JSON files and `report.md` is in `references.json` and that every reference is cited outside the report's bibliography. A DOI or PMID that does not exist, or that belongs to another paper, comes back as a problem to fix.

`uc.json` - one entry per UC (fill progressively through steps 3-6).

- `sourceOfId`: one value (BRA Source of ID), never a list. A UC that is a whole DHBA term (HOMBA anchor, no facets): `DHBA`. A whole BNA area or group (BNA anchors only, no facets): `BNA` (a CoBRAC extension of the BRA list). A UC finer than its SABRA unit (facets) or spanning several units: the one Reference ID that defines that population, or `makeshift` when no paper does. Other supporting papers go into `comments` as `[Author, Year]` citations.
- `names`: SABRA official name first, then synonyms separated by `;` (step 3).
- `transmitter`: one of `Acetylcholine`, `Dopamine`, `GABA`, `Glutamate`, `Glycine`, `Serotonin`, or `""` when unknown or not in the list (write e.g. noradrenaline or a co-transmitter in `comments`); `modulationType` (`Excitatory` / `Inhibitory` / `Modulatory`): `""` when unknown.
- `comments`: role and corresponding tissue (the worker adds the `noROI(...)` tag to the CSV from `roi`).

```json
{ "ucs": [ {
  "circuitId": "VTA(DA,out:NAC,rpe)", "descriptor": "HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe",
  "names": "ventral tegmental area, dopamine neurons projecting to the nucleus accumbens; VTA DA neurons", "roi": "internal",
  "sourceOfId": "[Schultz, 1997]", "transmitter": "Dopamine", "modulationType": "Modulatory", "comments": "...",
  "interface": "([U.NAC(shell,DRD1+)]) = VTA(DA,out:NAC,rpe)([U.NAC(shell,DRD1+)])",
  "outputSemantics": "[VTA(DA,out:NAC,rpe)] reward prediction error;",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "...", "implementation": "..."
} ] }
```

`connections.json` - `bif`: tissue-level projections from step 2; `connections`: UC-to-UC edges from step 4, whose `sender` / `receiver` are Circuit IDs from `uc.json` (not tissue names). One record per paper: `referenceIds` holds exactly one Reference ID, and `taxon`, `measurementMethod`, the pointers and the literature notations describe that paper. `comment`: property and information carried (add species or method details there).

- `senderInLiterature` / `receiverInLiterature`: the name that paper uses for the sending / receiving circuit (e.g. `ventral striatum`, `midbrain dopamine neurons`), not the Circuit ID.
- `senderRelation` / `receiverRelation`: how the UC relates to that circuit, read as `<UC> <relation> <circuit in the paper>`: `<` the UC is part of the paper's circuit (the paper reports a coarser unit, e.g. UC `NAC(shell,DRD1+)` < `ventral striatum`), `>` the UC contains it (the paper reports a finer unit), `=` the same circuit. Evidence at a coarser granularity is acceptable when marked with `<`.

- `taxon`: one of `Mouse`, `Rat`, `Cat`, `Marmoset`, `Macaque`, `Human`, `(Mixed)`, `Rodent`, `Rabbit`, `(No description)`.
- `measurementMethod`: one of `Anterograde tracing`, `Retrograde tracing`, `Axonal tracing`, `Neuronal Tract Tracing`, `Various tracing`, `Single cell tracing`, `Anterograde Trans-synaptic tracing`, `Retrograde Trans-synaptic tracing`, `Immunohistochemistry(neurobiotin)`, `CRACM`, `Optogenetic`, `Electro physiology`, `DW-MRI`, `fMRI`, `SILPP estimation`, `Anatomical connection in a secondary source`, `Functional connection in a secondary source`, `Unsurveyed secondary source`, `Hypothetical`, `Mixed`, `(No description)`.
- `pointersOnLiterature`: the sentence(s) of that paper that state this projection, copied verbatim (at least {MIN_QUOTE_WORDS} words; not a page, section or summary). Quote only text you actually read (the abstract or the full text); never write or paraphrase a quote from memory. If you cannot read a sentence that states the projection, leave it `""` and give the figure, or cite another paper.
- `pointersOnFigure`: the figure of that paper that shows the projection, like `Fig. 3B` (optionally more panels or a short note), or `""`. At least one of the two pointers is required.

```json
{
  "bif": [ { "sender": "ventral tegmental area", "receiver": "nucleus accumbens shell", "comment": "dopaminergic, strong", "referenceIds": ["[Schultz, 1997]"] } ],
  "connections": [ {
    "sender": "VTA(DA,out:NAC,rpe)", "senderRelation": "<", "senderInLiterature": "midbrain dopamine neurons",
    "receiver": "NAC(shell,DRD1+)", "receiverRelation": "<", "receiverInLiterature": "ventral striatum", "comment": "reward prediction error",
    "referenceIds": ["[Schultz, 1997]"], "taxon": "Macaque", "measurementMethod": "Electro physiology",
    "pointersOnLiterature": "<the sentence of [Schultz, 1997] that states this projection, copied verbatim>", "pointersOnFigure": "Fig. 1"
  } ]
}
```

Finish the turn with `status: "done"` once all eight steps are complete.
