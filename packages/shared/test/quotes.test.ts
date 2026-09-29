import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE_THRESHOLD, matchQuote, prepareText, quoteCheckMessage, summarizeQuoteChecks, type QuoteCheck } from "../src/index.js";

const PAPER = `
<p>The ventral striatum receives its main cortical input from the orbital and medial prefrontal cortex. Fibers from the
dorsolateral prefrontal cortex terminate in the central and dorsal parts of the ventral striatum, including the
accumbens (Haber et al., 2006; Haber and Knutson, 2010). In turn, the ventral striatum projects back to the midbrain
dopamine cells [12, 14–16], providing a feedback pathway to the ventral tegmental area.</p>
<p>Dopamine neurons of the ventral tegmental area send their axons to the nucleus accumbens and report reward
prediction errors¹².</p>`;

const score = (q: string, text = PAPER) => matchQuote(q, text).score;

describe("quote matching", () => {
  it("matches a verbatim quote exactly and returns its passage", () => {
    const m = matchQuote("the ventral striatum projects back to the midbrain dopamine cells, providing a feedback pathway to the ventral tegmental area.", PAPER);
    expect(m.score).toBe(1);
    expect(m.passage).toBe("the ventral striatum projects back to the midbrain dopamine cells, providing a feedback pathway to the ventral tegmental area");
  });

  it("ignores whitespace, case, punctuation, typographic quotes, ligatures, hyphenation and citation markers", () => {
    expect(score("“Fibers from the dorsolateral pre- frontal cortex terminate in the central and dorsal parts of the ventral striatum including the accumbens.”")).toBe(1);
    expect(score("FIBERS FROM THE DORSOLATERAL PREFRONTAL CORTEX TERMINATE IN THE CENTRAL AND DORSAL PARTS OF THE VENTRAL STRIATUM")).toBe(1);
    expect(score("Dopamine neurons of the ventral tegmental area send their axons to the nucleus accumbens and report reward prediction errors")).toBe(1);
    expect(score("the ventral striatum projects back to the midbrain dopamine cells, providing a feedback pathway", PAPER.replace("[12, 14–16]", ""))).toBe(1);
    expect(score("the dorsolateral prefrontal cortex terminate in the central and dorsal parts", "the dorsolateral prefrontal cortex ter\u00ADminate in the central and dorsal parts")).toBe(1);
    expect(score("a ﬁeld of ﬂuorescent neurons in the central and dorsal parts", "a field of fluorescent neurons in the central and dorsal parts")).toBe(1);
    expect(score("the projection (Smith et al., 2001) reaches the dorsal part of the nucleus", "the projection reaches the dorsal part of the nucleus")).toBe(1);
  });

  it("tolerates small OCR-like differences but not paraphrases", () => {
    const ocr = score("Fibers frorn the dorsolateral prefrontal cortex terrninate in the central and dorsal parts of the ventra1 striatum");
    expect(ocr).toBeGreaterThanOrEqual(DEFAULT_QUOTE_THRESHOLD);
    expect(ocr).toBeLessThan(1);
    expect(score("Projections from the dorsolateral prefrontal cortex end mainly in the central and dorsal ventral striatum")).toBeLessThan(DEFAULT_QUOTE_THRESHOLD);
    expect(score("The nucleus accumbens sends a dense GABAergic projection to the lateral hypothalamus in rats")).toBeLessThan(0.7);
  });

  it("checks each part of a quote with an omission or an editorial insertion", () => {
    expect(score("Fibers from the dorsolateral prefrontal cortex … terminate in the central and dorsal parts of the ventral striatum")).toBe(1);
    expect(score("[The] ventral striatum projects back to the midbrain dopamine cells [...] providing a feedback pathway to the ventral tegmental area")).toBe(1);
    expect(score("Fibers from the dorsolateral prefrontal cortex ... terminate densely in the lateral hypothalamus of the rat")).toBeLessThan(DEFAULT_QUOTE_THRESHOLD);
  });

  it("reuses a prepared text and handles empty input", () => {
    const t = prepareText(PAPER);
    expect(matchQuote("send their axons to the nucleus accumbens and report reward prediction errors", t).score).toBe(1);
    expect(matchQuote("", t).score).toBe(0);
    expect(matchQuote("anything at all here", "").score).toBe(0);
  });
});

describe("quote check messages", () => {
  const base: QuoteCheck = {
    sender: "VTA",
    receiver: "NAC",
    referenceIds: ["[Schultz, 1997]"],
    quote: "Dopamine neurons send axons",
    status: "not_found",
    checkedIn: [{ kind: "fulltext", source: "europepmc", id: "PMC123", url: "https://europepmc.org/article/PMC/PMC123" }],
    score: 0.62,
    closest: "dopamine neurons project to the striatum",
    notes: [],
  };

  it("sends back only quotes that are not in the full text, with the closest passage and where to read it", () => {
    const msg = quoteCheckMessage(base)!;
    expect(msg).toContain("connections.json: `VTA` -> `NAC` ([Schultz, 1997]): pointersOnLiterature is not in the paper");
    expect(msg).toContain("Europe PMC PMC123, https://europepmc.org/article/PMC/PMC123; best match 62%");
    expect(msg).toContain('Closest passage: "dopamine neurons project to the striatum"');
    for (const status of ["verified_fulltext", "verified_abstract", "unverified"] as const) expect(quoteCheckMessage({ ...base, status })).toBeNull();
  });

  it("counts the statuses", () => {
    expect(summarizeQuoteChecks([base, { ...base, status: "unverified" }, { ...base, status: "unverified" }])).toEqual({
      verified_fulltext: 0,
      verified_abstract: 0,
      not_found: 1,
      unverified: 2,
    });
  });
});
