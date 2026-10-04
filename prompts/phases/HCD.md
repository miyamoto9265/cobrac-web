# Phase HCD - Hypothetical Component Diagram

Build the HCD for the given ROI and TLF in `{P}/{P}_HCD/`. The HCD is a graph that describes the information processing of the ROI, grounded in neuroscience evidence, at the mesoscopic level of neural tissue.

## Concepts

- **TLF** (Top Level Function): the computational function the HCD explains. **ROI** (Region of Interest): the neural tissue that realizes it.
- **UC** (Uniform Circuit): the node of the HCD; the smallest mesoscopic neural population that plausibly encodes homogeneous information. "Circuit" here just means *neural population* (not synaptic wiring). Each ROI-internal UC has an Interface, Output Semantics and function items.
- **Collection**: a circuit this HCD decomposes into finer circuits (its Sub-Circuits). Uniform or Collection is a choice of this HCD, not a property of the tissue: the same SABRA unit may be a UC in a coarse HCD and a Collection in a finer one. A Collection has no Interface, Output Semantics or function items; it is never a sender or receiver of a connection and never an FRG leaf. It records what the UCs belong to and why the HCD splits it.
- **BIF** (Brain Information Flow): literature evidence of anatomical projections. **Connection**: a directed UC-to-UC edge justified by BIF; connections determine interfaces.

## Steps and files

Files are in `{P}/` (`meta.json`, `decision_log.md`, `report.md`) and `{P}/{P}_HCD/` (`references.json`, `uc.json`, `connections.json`); formats at the end.

1. **ROI/TLF validation -> `decision_log.md`, `meta.json`.** Check with literature that the ROI can realize the TLF. If ROI or TLF is missing, determine a plausible one by research. If the ROI looks inappropriate, or there are several candidates the user must choose from, ask (turn protocol) with evidence and alternatives. Identify ROI_Input (information that must enter the ROI) and ROI_Output (information it must emit). Record the conclusion, ROI_Input / ROI_Output and their evidence in `decision_log.md`; write `meta.json` including `name` (see AGENTS.md).

2. **BIF -> `references.json`, `connections.json` `bif`.** Survey projections relevant to the ROI thoroughly. List each projection between tissues (tissue names; note tissue outside the ROI, strength and excitatory/inhibitory nature in `comment`; prefer connections confirmed by several papers) and add every cited paper to `references.json` with its `literatureType`.

3. **UCs -> `uc.json`.** Define UCs from the BIF. Criteria: involved in the TLF; encodes homogeneous information; appropriate mesoscopic granularity; **distinguish ROI-internal from external UCs (most important)**: set `roi` to `internal`, or to `noROI(input)` / `noROI(output)` / `noROI(input,output)` for every external UC. Name every UC (internal and external) by the UC naming rules below, using the `rcs` MCP tools. Start `names` with the SABRA official name of the anchor (the BNA area name from `search_bna_candidates`, or `sabra.dhba_name` from RCS; for a faceted UC, that name followed by the finer population), then synonyms separated by `;` (e.g. `dorsal area 44; Broca's area pars opercularis`). Set `sourceOfId` to one value (see File formats).
   - **Uniform senders and Collections -> `uc.json` `collections`.** Every sender must be uniform at the granularity this HCD chooses (BRA 203): one population whose parts play the same role. Check each candidate UC: if the region is anatomically or functionally heterogeneous at that granularity — a whole gyrus or group that contains several distinct areas (e.g. `BNAG:IFG` with areas 44 and 45), parts that are reported as different projection sources or targets, or parts with different functions in the TLF literature — split it into UCs for the parts the HCD distinguishes and connect those UCs. This needs no layer or cell-type evidence: areas (from `search_bna_candidates` or RCS) or other named parts are enough, as long as each part is named by the UC naming rules and the split is justified with citations. A paper that reports only the whole region still supports each part's connection with relation `<` and the paper's name for the region. Record the split region in `collections` (its descriptor and Circuit ID, the parts as `subCircuits`, and in `comments` what distinguishes them) when it helps the reader; a parent Collection is recommended, not required. Keep a region whole only when the HCD really treats it as one population (e.g. the literature reports it only as a whole and gives its parts no different roles); a sender that spans several SABRA units (a `BNAG` group or several anchors) then needs `uniformityNote` saying why, otherwise the validator asks you to split it. A UC and a finer UC inside it cannot both be UCs (the validator asks you to move the coarser one to `collections`). Uniform or Collection is decided per HCD. Collections are bookkeeping: never a Collection per UC or per connection, and a higher grouping (e.g. a named network) only when useful.

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
   - `## HCD`: each UC's role and evidence, the processing flow from ROI_Input to ROI_Output, key findings. Name each tissue by its Circuit ID in backticks (`` `A44d(left)` ``) and its SABRA official name, not by other names;
   - `## Limitations`: open questions from step 7 and future work;
   - `## References`: full bibliography of the cited Reference IDs.

## UC naming (SABRA)

Every UC is anchored on exactly one unit of SABRA, the organisation's mixed atlas: a BNA (Brainnetome) area for the neocortex only, and a DHBA term (a HOMBA term that has a DHBA name) for everything else: amygdala, hippocampal formation and entorhinal cortex, olfactory and other allocortex, basal ganglia (striatum, NAc, pallidum), thalamus, claustrum, hypothalamus, brainstem, cerebellum. BNA's subcortical areas (`Amyg`, `Hipp`, `BG`, `Tha`: labels 211-246) and its cortical areas A28/34 (115/116, entorhinal) and TI (117/118) are not SABRA units; `search_bna_candidates` marks them `sabra.atlas: DHBA`, `sabra_unit: false`. SABRA has no IDs of its own and neither do UCs: the **UC Descriptor** (anchor + optional facets) is the UC's key, the **Circuit ID** its readable alias. The same population gets the same names in every project.

**The anchor alone is the normal case.** When a UC is a whole SABRA unit, its descriptor is just the anchor and its Circuit ID just the anchor's abbreviation (`HOMBA:12261` / `VTA`, `HOMBA:10339` / `NAC`, `BNA:57-58` / `A4ul`). Add a facet only when the HCD needs a population finer than the unit (e.g. two UCs in the same unit with different connections or Output Semantics, or a sub-population defined by its projection). Do not add facets to describe a UC: the transmitter goes in Transmitter, the content in Output Semantics, the evidence in the connections' references.

Anchor procedure (record each UC's anchor choice and reason in `decision_log.md`; the worker keeps every RCS call in `rcs_mcp_calls.jsonl`):

1. Take only the region words of the UC (drop cell type, layer, transmitter, gene, projection and response words; those become facets if needed).
2. `search_homba_candidates` with them (`context`: ROI/TLF/species). Read `ai.results` (else the top `candidates`):
   - `sabra.atlas: DHBA`, `relation '='`, `sabra.dhba_exact: true` → anchor `HOMBA:<id>`; abbreviation = `sabra.dhba_acronym` (the DHBA acronym, e.g. `Arc`, not the HOMBA acronym `ArH`).
   - `sabra.atlas: DHBA` with `dhba_exact: false` or `relation '<'` (the region is finer than any DHBA term) → anchor `sabra.dhba_homba_id`, and only if the UC needs the finer region, facet `part:<matched HOMBA ID>`.
   - `sabra.atlas: BNA` (neocortex) → `search_bna_candidates` with the same words (add left/right when known) and use only results with `sabra.atlas: BNA`. One BNA area clearly dominates (top `p_raw` ≥ 0.5 with `k_papers` ≥ 2) → anchor the area's pair `BNA:<left>-<right>` (odd = left label, even = right); add `side:left` / `side:right` only when the UC is one side; abbreviation = `bna_area_abbr`. Otherwise use `level: "l2"` and anchor `BNAG:<L2>` (e.g. `BNAG:MFG`). If the HOMBA term is finer than the BNA area (e.g. a cortical layer region) and the UC needs it, add `part:HOMBA:<id>`.
   - Never anchor a non-neocortical region on BNA (no `BNA:211-246`, `BNA:115-116`, `BNA:117-118`, `BNAG:Amyg|Hipp|BG|Tha`, also not as `in:` / `out:` values): CA1, the NAc shell or the central amygdala are DHBA terms (`HOMBA:10297` `CA1`, `HOMBA:10341` `NACs`, `HOMBA:10363` `CEN`). When `search_bna_candidates` returns such an area, take the region from `search_homba_candidates` instead (`sabra.dhba_homba_id` is only the DHBA term that contains the BNA area).
   - `relation '>'` (the UC spans several units) → join anchors with `&` (`BNA:63-64&BNA:65-66`) or use their common SABRA unit.
   - empty `ai.results` → do not guess: ask the user (turn protocol) with the candidates you saw.
3. Region without any DHBA name on its path (e.g. spinal cord) → anchor on the nearest DHBA ancestor that RCS reports (`sabra.dhba_homba_id`) with `part:`; such regions may also appear freely as `in:` / `out:` values.
4. Check an anchor with `get_homba_term` when unsure (`sabra` shows the atlas and DHBA acronym).

UC Descriptor = `<anchor>[&<anchor>]{/<axis>:<value>[,<value>]}`. Anchors: `HOMBA:<id>`, `BNA:<l>-<r>` (always the left-right pair, e.g. `BNA:57-58`; never a single label), `BNAG:<L2>`. Facets, each at most once, in this order: `part` (finer region: HOMBA ID or short word), `lay` (`L5`), `cell` (`pyr`, `purkinje`), `nt` (`Glu` `GABA` `Gly` `ACh` `DA` `NE` `5HT` `His` `pep`), `mol` (official gene symbol + polarity `+` `-` `~hi` `~lo`, e.g. `DRD1+`; HGNC for human), `in` / `out` (population defined by its input / projection target, as an anchor-style ID), `resp` (response tuning, e.g. `rpe`), `side` (`left` or `right`, one value; omit it when the UC covers both sides or the side is not distinguished). No species in descriptors: record the taxon in the evidence. Older projects may show single labels (`BNA:57`) or `@L` / `@R`; the validator asks for the current form (`BNA:57-58/side:left`). Projects created before the 2026-10-04 SABRA boundary may also have BNA anchors for subcortical or hippocampal UCs (`BNA:223-224`, `BNAG:Hipp`): keep those UCs as they are, and anchor any new non-neocortical UC on DHBA.

Circuit ID = `<anchor abbreviation>[(<item>.<item>)]`:

- The head is the anchor's official SABRA abbreviation exactly (case included; spaces → `_`, as would be any other character outside the allowed set): the DHBA acronym, the BNA area abbreviation (`A4ul`, `A9/46d`, `V5/MT+`, `TE1.0_and_TE1.2`), or for `BNAG` / several anchors the common BNA L2 abbreviation (`MFG`; else the first anchor's). Never a custom or colloquial abbreviation (`NAc`, `LC`) or that of a finer region that is not a SABRA unit (`CH10`): those go inside the parentheses.
- The side is the last item, `left` or `right`, and only when the descriptor has `side` (`A4ul(left)`, `A8m(L3.left)`); both sides: no side item (`A4ul`). The left and the right of one population are separate UCs when the HCD needs both (`A4ul(left)`, `A4ul(right)`).
- No facets → no parentheses. Otherwise one item per facet value in facet order, separated by `.`: `part` as a short lowercase word (`floc`, `rostral`) or a well-known abbreviation; other facets as written (`L5`, `pyr`, `DA`, `DRD1+`, `SST-`, `NPY~hi`); `in-` / `out-` + the partner's SABRA abbreviation (HOMBA acronym when it is not a SABRA unit), e.g. `out-CEN`; `left` / `right` for `side`. Inside an item `.` (the separator) becomes `_`.
- Allowed characters: only `A-Z a-z 0-9 . _ ~ - / +` (WBAI's interim Circuit ID characters, with `/` and `+` as agreed on 2026-08-19) and the parentheses around the items. No `@ , :`, spaces, `;`, `|`, `[ ]`, nested parentheses. Older projects may show `A4ul@L`, `NAC(shell,DRD1+)` or `Amyg(BL,out:CEN)`; the validator asks for the current form (`A4ul(left)`, `NAC(shell.DRD1+)`, `Amyg(BL.out-CEN)`).

| UC | UC Descriptor | Circuit ID |
|---|---|---|
| ventral tegmental area | `HOMBA:12261` | `VTA` |
| nucleus accumbens (both sides) | `HOMBA:10339` | `NAC` |
| left area 4, upper limb | `BNA:57-58/side:left` | `A4ul(left)` |
| left medial area 8, layer III | `BNA:1-2/lay:L3/side:left` | `A8m(L3.left)` |
| locus coeruleus noradrenergic cells | `HOMBA:12499/nt:NE` | `NC(NE)` |
| arcuate AgRP neurons | `HOMBA:10492/mol:AGRP+` | `Arc(AGRP+)` |
| NAc shell DRD1+ cells | `HOMBA:10341/mol:DRD1+` | `NACs(DRD1+)` |
| VTA DA cells projecting to NAc, encoding RPE | `HOMBA:12261/nt:DA/out:HOMBA:10339/resp:rpe` | `VTA(DA.out-NAC.rpe)` |
| hippocampal CA1 pyramidal cells | `HOMBA:10297/cell:pyr` | `CA1(pyr)` |
| flocculus Purkinje cells | `HOMBA:12852/part:HOMBA:AA30423/cell:purkinje` | `FNCb(floc.purkinje)` |

A Collection that is a SABRA unit or a faceted population follows the same rules (descriptor and Circuit ID of that population); a grouping of several units has an empty descriptor and a short Circuit ID without spaces (e.g. `Mesolimbic-loop`).

The validator checks the syntax and characters, that the head equals the anchor's abbreviation from RCS / BNA, that items match the facets (the side last), and that no two UCs share a descriptor. Two UCs may not share a descriptor: if they are really different populations, add the facet that separates them. In JSON write them without backticks, in markdown wrap them in backticks; references inside text stay `[U.<Circuit ID>]` (e.g. `[U.NACs(DRD1+)]`).

## File formats

Every key is required (use `""` for an empty value); schemas: `schemas/references.schema.json`, `schemas/uc.schema.json`, `schemas/connections.schema.json`.

`references.json` - every reference cited anywhere in the project, each once. `id` is `[<first author's surname>, <year>]`; `title` is the paper's title as published; `pmid` is the PubMed ID or `""`; `journal` the journal name; `literatureType` one of `Experimental results`, `Meta review`, `Textbook`, `Systematic review`, `Review`, `Modeling`, `Simulation`, `Hypothesis`, `Data description`, `Insight`, `Opinion`; `alternativeUrl` the document's URL (publisher, PubMed or book page) when it has no DOI, else `""` (with a PMID the worker adds the PubMed URL itself). Take DOI, PMID and title from the publisher page or PubMed, never from memory:

```json
{ "references": [ { "id": "[Ito, 1982]", "doi": "10.1146/annurev.ne.05.030182.001423", "pmid": "6803651", "title": "Cerebellar control of the vestibulo-ocular reflex--around the flocculus hypothesis", "journal": "Annual Review of Neuroscience", "literatureType": "Review", "alternativeUrl": "" } ] }
```

The worker looks up every DOI in Crossref / doi.org and every PMID in PubMed and checks that the record has the same first author, year (±1) and title; it also checks that every `[Author, Year]` in the JSON files and `report.md` is in `references.json` and that every reference is cited outside the report's bibliography. A DOI or PMID that does not exist, or that belongs to another paper, comes back as a problem to fix.

`uc.json` - `ucs`: one entry per UC (fill progressively through steps 3-6); `collections` (optional, omit or `[]` when the HCD decomposes nothing): one entry per Collection (step 3).

- `sourceOfId`: one value (BRA Source of ID), never a list. A UC that is a whole DHBA term (HOMBA anchor, no facets): `DHBA`. A whole BNA area or group (BNA anchors only, no facets): `BNA` (a CoBRAC extension of the BRA list). A UC finer than its SABRA unit (facets) or spanning several units: the one Reference ID that defines that population, or `makeshift` when no paper does. Other supporting papers go into `comments` as `[Author, Year]` citations.
- `names`: SABRA official name first, then synonyms separated by `;` (step 3).
- `transmitter`: one of `Acetylcholine`, `Dopamine`, `GABA`, `Glutamate`, `Glycine`, `Serotonin`, or `""` when unknown or not in the list (write e.g. noradrenaline or a co-transmitter in `comments`); `modulationType` (`Excitatory` / `Inhibitory` / `Modulatory`): `""` when unknown.
- `comments`: role and corresponding tissue (the worker adds the `noROI(...)` tag to the CSV from `roi`).
- `uniformityNote` (optional key, omit it otherwise): only for a sender that spans several SABRA units and is kept whole: why this HCD treats it as one uniform population (step 3). The worker adds it to the Circuits comments.

```json
{ "ucs": [ {
  "circuitId": "VTA(DA.out-NAC.rpe)", "descriptor": "HOMBA:12261/nt:DA/out:HOMBA:10339/resp:rpe",
  "names": "ventral tegmental area, dopamine neurons projecting to the nucleus accumbens; VTA DA neurons", "roi": "internal",
  "sourceOfId": "[Schultz, 1997]", "transmitter": "Dopamine", "modulationType": "Modulatory", "comments": "...",
  "interface": "([U.NACs(DRD1+)]) = VTA(DA.out-NAC.rpe)([U.NACs(DRD1+)])",
  "outputSemantics": "[VTA(DA.out-NAC.rpe)] reward prediction error;",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "...", "implementation": "..."
} ] }
```

Collections: `circuitId`, `descriptor` (`""` for a grouping of several units), `names` (SABRA official name first for a SABRA unit), `sourceOfId` (always `collection`), `subCircuits` (Circuit IDs of UCs or other Collections in this file, at least one, no cycles, not all `makeshift`), `comments` (required: why the region is heterogeneous at this granularity — what distinguishes the sub-circuits — with `[Author, Year]` citations):

```json
"collections": [ {
  "circuitId": "IFG(left)", "descriptor": "BNAG:IFG/side:left", "names": "left inferior frontal gyrus; Broca's region", "sourceOfId": "collection",
  "subCircuits": ["A44d(left)", "A45c(left)"], "comments": "Area 44 and area 45 receive different temporal and parietal inputs and support phonological vs. semantic processing [Author, Year]"
} ]
```

`connections.json` - `bif`: tissue-level projections from step 2; `connections`: UC-to-UC edges from step 4, whose `sender` / `receiver` are Circuit IDs from `uc.json` (not tissue names). One record per paper: `referenceIds` holds exactly one Reference ID, and `taxon`, `measurementMethod`, the pointers and the literature notations describe that paper. `comment`: property and information carried (add species or method details there).

- `senderInLiterature` / `receiverInLiterature`: the name that paper uses for the sending / receiving circuit (e.g. `ventral striatum`, `midbrain dopamine neurons`), not the Circuit ID.
- `senderRelation` / `receiverRelation`: how the UC relates to that circuit, read as `<UC> <relation> <circuit in the paper>`: `<` the UC is part of the paper's circuit (the paper reports a coarser unit, e.g. UC `NACs(DRD1+)` < `ventral striatum`), `>` the UC contains it (the paper reports a finer unit), `=` the same circuit. Evidence at a coarser granularity is acceptable when marked with `<`.

- `taxon`: one of `Mouse`, `Rat`, `Cat`, `Marmoset`, `Macaque`, `Human`, `(Mixed)`, `Rodent`, `Rabbit`, `(No description)`.
- `measurementMethod`: one of `Anterograde tracing`, `Retrograde tracing`, `Axonal tracing`, `Neuronal Tract Tracing`, `Various tracing`, `Single cell tracing`, `Anterograde Trans-synaptic tracing`, `Retrograde Trans-synaptic tracing`, `Immunohistochemistry(neurobiotin)`, `CRACM`, `Optogenetic`, `Electro physiology`, `DW-MRI`, `fMRI`, `SILPP estimation`, `Anatomical connection in a secondary source`, `Functional connection in a secondary source`, `Unsurveyed secondary source`, `Hypothetical`, `Mixed`, `(No description)`.
- `pointersOnLiterature`: the sentence(s) of that paper that state this projection, copied verbatim (at least {MIN_QUOTE_WORDS} words; not a page, section or summary). Quote only text you actually retrieved in this run (the abstract or the full text, e.g. from PubMed, Europe PMC / PMC or the publisher page) and copy it character for character; never write, merge or paraphrase a quote from memory. The worker looks the quote up in the paper's open-access full text (Europe PMC / PMC) or, without one, its abstract, and sends back a quote that is not in the full text, with the closest passage; prefer sentences from open-access full text or the abstract so that they can be checked. If you cannot read a sentence that states the projection, leave it `""` and give the figure, or cite another paper.
- `pointersOnFigure`: the figure of that paper that shows the projection, like `Fig. 3B` (optionally more panels or a short note), or `""`. At least one of the two pointers is required.

```json
{
  "bif": [ { "sender": "ventral tegmental area", "receiver": "nucleus accumbens shell", "comment": "dopaminergic, strong", "referenceIds": ["[Schultz, 1997]"] } ],
  "connections": [ {
    "sender": "VTA(DA.out-NAC.rpe)", "senderRelation": "<", "senderInLiterature": "midbrain dopamine neurons",
    "receiver": "NACs(DRD1+)", "receiverRelation": "<", "receiverInLiterature": "ventral striatum", "comment": "reward prediction error",
    "referenceIds": ["[Schultz, 1997]"], "taxon": "Macaque", "measurementMethod": "Electro physiology",
    "pointersOnLiterature": "<the sentence of [Schultz, 1997] that states this projection, copied verbatim>", "pointersOnFigure": "Fig. 1"
  } ]
}
```

Finish the turn with `status: "done"` once all eight steps are complete.
