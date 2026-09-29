## Research mode

This project runs in research mode. `{P}/research.json` holds the literature survey of the research step (the worker's search log is `{P}/research_queries.jsonl`, its coverage check `{P}/research_check.json`). Use the `lit` MCP tools (`search_pubmed`, `search_europepmc`, `get_abstract`, `find_sentences`) throughout.

- **HCD**: build the BIF and the connections from the survey. Prefer `supported` candidates and tract-tracing evidence; state in `comment` when a connection rests on `weak` evidence, and leave out `contradicted` ones unless you explain them. Where the evidence names the layer or cell type of the projecting cells, define the UC at that granularity (facets `lay` / `cell` / `nt` / `mol`) when the HCD needs it. Copy `pointersOnLiterature` from sentences you read with `find_sentences` or `get_abstract`. When the HCD needs a projection the survey did not cover, search it first and add it to `research.json` (candidate, queries, evidence). Put the survey's `gaps` into the report's limitations.
- **FRG**: search the literature (`lit` tools, web) for computational models and theories of the TLF and of each group node's function, and cite them in `capability` / `mechanism`.
- **Follow-ups**: research what the instruction adds or questions (new projections, UCs, claims) before changing the files, and keep `research.json` up to date.
