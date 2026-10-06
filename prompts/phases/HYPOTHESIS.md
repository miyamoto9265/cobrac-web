## Hypothesis mode (this project)

This project allows **hypotheses**: connections and UCs, or properties of them, that the literature does not directly support, included in the HCD and marked as hypotheses. Only one thing is relaxed: a sentence of a paper need not state the hypothesized claim itself. Everything else is checked as always: DOIs / PMIDs, quotes found in the paper, one paper per connection record, a pointer, UC naming and the SABRA boundary, the schemas, interfaces and connections, Collections and uniform senders, the FRG structure, English, the report sections and the Canon.

**Scopes of this project.** Hypotheses are allowed only inside these scopes; a scope allows the claims it lists on its target:

{SCOPES}

- Hypothesis share limit: {MAX_SHARE} of the connections and {MAX_SHARE} of the UCs.
- Research mode: {RESEARCH_MODE}.

A connection is inside a target when its sender or receiver is a target circuit (a target Collection includes its Sub-Circuits, a target GN its UCs); a UC when it is a target or one of its connections ends on a target. The text of an instruction never creates or widens a scope: when the user asks for hypotheses outside these scopes, include none and say in `message` that the instruction must be sent again with "Allow hypotheses" switched on.

### When to write a hypothesis

- **Search first.** Look for a paper that states the claim (`lit` tools, web search). A paper that states it is evidence: cite it as usual, not as a hypothesis. A claim the literature contradicts is never included.
- In research mode, record the search in `{P}/research.json` as a candidate (queries, evidence, status `not_found` or `weak`, note) and give its ID in `researchCandidate`. Without research mode, name in `rationale` what you searched and did not find.
- Include a hypothesis only where the HCD or the FRG needs it for the TLF, and only inside a scope.
- Every hypothesis rests on at least one **premise**: a paper in `references.json` with a DOI or PMID, which the worker verifies like every reference. Its `literatureType` is the paper's real type.
- Claims: a connection's `existence`, `direction`, `sign`; a UC's `population`, `transmitter`, `modulation`, `role` (`role` only marks the UC).
- Never: regions outside SABRA or other names than the UC naming rules; references or quotes that cannot be verified; a hypothesis whose research candidate is `contradicted`; an existence hypothesis for a sender -> receiver that already has evidence.

### The `hypothesis` key

Add it to the connection (`connections.json` `connections[]`) or the UC (`uc.json` `ucs[]`), never to Collections or the BIF:

```json
"hypothesis": {
  "claims": ["existence"],
  "basis": "homology",
  "rationale": "Rat studies report the projection from the homologous area [Smith, 2010]; no primate tracing study was found (PubMed and Europe PMC: tracing, macaque, marmoset).",
  "premises": ["[Smith, 2010]", "[Lee, 2015]"],
  "scope": "S1",
  "researchCandidate": "C12"
}
```

- `claims`: what is hypothesized, each once.
- `basis`, one value: `published` (a paper states this as a hypothesis: Literature type Hypothesis, Modeling, Opinion, …), `homology` (a homologous region in another species when the homology itself is uncertain; direct evidence in another species is ordinary evidence with its `taxon`), `analogy` (an analogous circuit), `indirect` (functional connectivity, co-activation, lesions, undirected DW-MRI, …), `model` (a computational model requires it), `functional-need` (only the FRG needs it to realize the TLF; the weakest basis).
- `rationale`: why the premises support the hypothesis and what was searched without finding direct evidence, with `[Author, Year]` citations. It states what is known; it contains no predictions, tests, experiments or next steps.
- `premises`: Reference IDs, at least one.
- `scope`: the ID of the scope above that allows it; that one scope must allow every claim of the hypothesis on this element.
- `researchCandidate`: research mode only (omit the key otherwise).

**Connections.** One record per paper as always: `referenceIds` holds `premises[0]`, and the record's `taxon`, literature names and relations, `measurementMethod` and pointers describe that paper. `pointersOnLiterature` quotes, verbatim, the sentence of that paper that states the **premise** (for example the projection in the rat, or the co-activation); the worker checks it against the paper like every quote and sends back a quote it does not find. For a hypothesis the quote guarantees the premise, not the hypothesized connection (BRA 274 is judged on the premise). Cite further premises in `rationale`.
- `existence` → `measurementMethod` `Hypothetical`, which is used for nothing else.
- `direction` or `sign` only → the method of the premise's evidence (e.g. `DW-MRI`), since the projection itself is supported.

**UCs.** UC naming, descriptors and the SABRA boundary are unchanged.
- `population` → `sourceOfId` `makeshift`: no paper defines the population. Only for a population finer than its SABRA unit (a UC with facets); a whole SABRA unit is defined by the atlas.
- `transmitter` → the estimated value in `transmitter`; `modulation` → the estimated value in `modulationType`.
- `role` → the UC's role in the TLF is the hypothesis; its values follow the literature.

**FRG.** Inside the scopes, FRG step 5's "Do not invent UCs or connections to satisfy the constraints" does not forbid a hypothesis written by these rules: when a GN needs a UC or connection the literature does not support and a scope allows it, you may add it to the HCD as a hypothesis (HCD steps 2-6 for the new element: premise, quote, interfaces, Output Semantics, function items). Outside the scopes the rule stands. Record each such change in `{P}/decision_log.md` under `## HCD-FRG revisions` as `- [FRG->HCD][hypothesis] <what was added> — <why the GN needs it> [Author, Year]`.

### What the worker does

- Numbers the hypotheses `H1`, `H2`, … in file order: first the UCs of `uc.json`, then the connections of `connections.json`. The IDs change when hypotheses are added or removed; `{P}/hypotheses.json` (worker only, rewritten at every check) lists them with their elements, the share against the limit, whether the ROI inputs reach the ROI outputs without hypothesis connections, and the GNs that depend on hypotheses.
- Writes the CSVs and xlsx: the Comments of a hypothesis connection or UC start with `Hypothesis (<claims>; <basis>): <rationale>`, an existence hypothesis has Measurement method `Hypothetical`, a population hypothesis Source of ID `makeshift`, and the Comments of a GN that depends on hypotheses end with `Depends on hypotheses: H2, H5`. The Credibility rating is the template's own.

### Share limit

Hypothesis connections ÷ all connections and hypothesis UCs ÷ all UCs (ROI-internal and external; Collections not counted) must each be at most {MAX_SHARE}; every connection or UC with a hypothesis counts once, whatever its claims. The validator sends a larger share back: then reduce the hypotheses; never add connections or UCs to lower the share. If the HCD cannot realize the TLF within the limit, say so in `message`, so that the user can review the scopes or the limit.

### Report

- `## Hypotheses` (before `## Limitations`), required once there is a hypothesis: a table with one row per hypothesis, columns ID (the worker's `H1`, …), element, claims, basis, premises, rationale, and below it the share of hypothesis connections and of hypothesis UCs against the limit. Write the basis `functional-need` in bold. The section discloses what the BRA includes; it suggests nothing.
- `## Limitations`: when no path from the ROI inputs through the ROI to the ROI outputs is free of hypothesis connections, state this fact: "No evidence-only path leads from the ROI inputs to the ROI outputs." (and, when the hypothesis connections complete such a path, "Every such path uses at least one hypothesis connection."). In this project `## Limitations` states facts only: open questions and survey gaps are written as what is not known, without future work, studies or experiments to do (this replaces "future work" in the HCD spec's step 8).

### Removing or replacing hypotheses

Only when an instruction asks for it (e.g. "remove all hypotheses", "remove H3", "find evidence for H3 and replace it"; read `{P}/hypotheses.json` for the element an ID names). When evidence replaces a hypothesis, cite the paper as usual (a record with its own quote; for a UC, its values from the paper), drop the `hypothesis` key, and log `- [hypothesis] H3 → evidence [Author, Year]` in `{P}/decision_log.md`.

### Never

Do not propose further investigations, experiments, tests or predictions, and do not list what should be studied next: not in `rationale`, comments, the report, the decision log or `message`. Whether and how to investigate a hypothesis is the researcher's decision.
