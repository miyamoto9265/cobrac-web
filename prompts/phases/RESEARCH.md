# Research step (research mode) - literature survey before the HCD

This project runs in research mode: before building the HCD you survey the literature in depth and record the survey in `{P}/research.json` (schema: `schemas/research.schema.json`). Do **only** the survey in this turn: do not write the HCD files yet (the next turn builds the HCD from this survey). You may write `meta.json` and the ROI/TLF entry of `decision_log.md` (HCD step 1) if the ROI or TLF must be determined first; if the ROI/TLF is unclear enough that the user must choose, ask (turn protocol).

Budget: at most {MAX_CANDIDATES} candidates and about {BUDGET_MINUTES} minutes for this step. Spend it on the projections that matter most for the TLF; record what you could not cover in `gaps`.

## Tools

- `lit` MCP tools (PubMed / Europe PMC): `search_pubmed`, `search_europepmc` (field searches such as `METHODS:"retrograde"`, `open_access_only`), `get_abstract`, `find_sentences` (the sentences of a paper that contain given terms, from the open-access full text when there is one). The worker logs every call in `research_queries.jsonl`.
- Web search, for reviews, atlases and connectivity databases (e.g. tract-tracing databases, the Allen connectivity atlas) that lead to primary papers.
- `rcs` is for naming UCs in the HCD phase; it is not needed here.

## Procedure

1. **Plan** (`plan`): restate the ROI, TLF and species in scope and what the survey must establish; write the strategy (databases, key terms and their synonyms, reviews you start from).
2. **Candidates** (`candidates`): list the tissue-level projections the HCD may need: the main inputs to the ROI, its outputs, and projections between its parts. Start from reviews, then check each candidate in primary papers. Give each an `id` (`C1`, `C2`, …), `sender`, `receiver` and a `rationale`.
3. **Search each candidate** (`queries`): run at least {MIN_QUERIES} different queries per candidate, at least one with `search_pubmed` or `search_europepmc`. Vary region synonyms and add method and species terms (`"tract tracing"`, `anterograde`, `retrograde`, `macaque`, `rat`, `mouse`). Look for:
   - tract-tracing evidence (anterograde / retrograde / trans-synaptic / single-cell tracing) rather than only DTI or functional connectivity;
   - primate (macaque, marmoset, human) and rodent evidence;
   - the layer and cell type of the projecting cells (e.g. layer 5 pyramidal, D1 medium spiny, dopaminergic), since the HCD needs cell-type-specific UCs where the literature supports them.
   List every query exactly as you sent it, with its `source` (`pubmed`, `europepmc` or `web`); the worker compares them with its search log.
4. **Read and record evidence** (`evidence`): for each paper you rely on, read the abstract (`get_abstract`) or the full text (`find_sentences`) and record its `referenceId` (`[Author, Year]`), `pmid` / `doi` (from the search result, never from memory), `taxon`, `measurementMethod` (from the BRA lists), `cellTypeOrLayer` when the paper states it, a one-sentence `finding`, and `readFrom`. Prefer the sentence(s) you will quote later in `pointersOnLiterature`: note them in `finding` only if you actually read them.
5. **Coverage and status**: set `coverage.tractTracing`, `primate`, `rodent`, `cellTypeLayer` to `found` (an evidence item shows it), `searched_none` (you searched, found nothing) or `not_applicable` (explain in `note`). Set `status`: `supported` (direct evidence), `weak` (indirect, single or secondary source), `not_found`, `contradicted`; explain anything but `supported` in `note`.
6. **Gaps** (`gaps`): what remains open; the report's limitations use it.

The worker checks the schema, that every query is in its search log, that the coverage values agree with the evidence, and that every evidence item has a PMID or DOI; problems come back as a fix turn. Then the HCD phase starts. Finish the turn with `status: "done"`.

```json
{
  "plan": { "scope": "Reward prediction error in the ventral striatum; primate and rodent evidence", "strategy": "Start from reviews of mesolimbic projections; PubMed and Europe PMC with region synonyms and tracing terms" },
  "candidates": [ {
    "id": "C1", "sender": "ventral tegmental area", "receiver": "nucleus accumbens shell", "rationale": "Dopaminergic teaching signal for the TLF",
    "queries": [
      { "source": "pubmed", "query": "ventral tegmental area nucleus accumbens projection tract tracing" },
      { "source": "europepmc", "query": "(\"ventral tegmental area\" AND \"accumbens\") AND METHODS:\"retrograde\"" }
    ],
    "coverage": { "tractTracing": "found", "primate": "searched_none", "rodent": "found", "cellTypeLayer": "found" },
    "evidence": [ {
      "referenceId": "[Beier, 2015]", "pmid": "26232228", "doi": "10.1016/j.cell.2015.07.015", "taxon": "Mouse", "measurementMethod": "Retrograde Trans-synaptic tracing",
      "cellTypeOrLayer": "dopaminergic neurons", "finding": "VTA-DA neurons projecting to lateral and medial nucleus accumbens innervate largely non-overlapping striatal targets.", "readFrom": "abstract"
    } ],
    "status": "supported", "note": ""
  } ],
  "gaps": "No primate tract-tracing study of the VTA to NAc shell projection was found."
}
```
