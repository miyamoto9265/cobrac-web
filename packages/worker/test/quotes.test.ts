import { describe, expect, it } from "vitest";
import type { QuoteRequest, RefRow } from "@cobrac/shared";
import { QuoteVerifier, biocDocument, jatsText, pubmedAbstract, type QuoteVerifierOptions } from "../src/quotes.js";
import { BIOC, CROSSREF, EUROPE_PMC, EUTILS, HABER_EPMC, HABER_FULLTEXT, S2, SCHULTZ_EPMC, mockLiterature, type Failure, type LiteratureData } from "./mockLiterature.js";

const DATA: LiteratureData = {
  epmc: [HABER_EPMC, SCHULTZ_EPMC],
  fulltext: { [HABER_EPMC.pmcid]: HABER_FULLTEXT },
};

function setup(data: LiteratureData = DATA, fail?: (url: string, n: number) => Failure | undefined, opts: QuoteVerifierOptions = {}) {
  const lit = mockLiterature(data, fail);
  let clock = 0;
  const v = new QuoteVerifier({
    fetch: lit.fetch,
    europePmcUrl: EUROPE_PMC,
    eutilsUrl: EUTILS,
    biocUrl: BIOC,
    crossrefUrl: CROSSREF,
    semanticScholarUrl: S2,
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
    ...opts,
  });
  return { v, calls: lit.calls, tick: (ms: number) => (clock += ms) };
}

const ref = (id: string, doi: string, pmid = ""): RefRow => ({ id, doi, pmid });
const HABER = ref("[Haber, 2010]", "10.1038/npp.2009.129");
const SCHULTZ = ref("[Schultz, 1997]", "10.1126/science.275.5306.1593", "9054347");
const req = (quote: string, r: RefRow = HABER, sender = "A9/46d@L", receiver = "NAC"): QuoteRequest => ({ sender, receiver, referenceIds: [r.id], quote, refs: [r] });

const IN_BODY = "Fibers from the dorsolateral prefrontal cortex terminate in the central and dorsal parts of the ventral striatum, including the accumbens.";
const IN_CAPTION = "Schematic of the ventral striatal projections to the midbrain dopamine neurons in the primate";
const INVENTED = "The dorsolateral prefrontal cortex sends a dense glutamatergic projection to the lateral hypothalamus.";

describe("quote verifier", () => {
  it("finds quotes in the open-access full text (body and figure captions), ignoring citations and markup", async () => {
    const { v } = setup();
    const [a, b] = await v.verify([req(IN_BODY), req(IN_CAPTION)]);
    expect(a).toMatchObject({ status: "verified_fulltext", score: 1, checkedIn: [{ kind: "fulltext", source: "europepmc", id: "PMC3055449", url: "https://europepmc.org/article/PMC/PMC3055449" }] });
    expect(b.status).toBe("verified_fulltext");
  });

  it("reports a quote that is not in the full text, with the closest passage", async () => {
    const { v } = setup();
    const [c] = await v.verify([req("Fibers from the dorsolateral prefrontal cortex terminate mostly in the shell of the accumbens and in the lateral septum.")]);
    expect(c.status).toBe("not_found");
    expect(c.score).toBeLessThan(0.9);
    expect(c.closest).toMatch(/^Fibers from the dorsolateral prefrontal cortex terminate/);
    const [d] = await v.verify([req(INVENTED)]);
    expect(d.status).toBe("not_found");
  });

  it("does not count text from the reference list", async () => {
    const { v } = setup();
    const [c] = await v.verify([req("Circuits of the primate prefrontal cortex and the ventral striatum revisited in a tracing study")]);
    expect(c.status).toBe("not_found");
  });

  it("falls back to the abstract when there is no open-access full text, and leaves other quotes unverified", async () => {
    const { v, calls } = setup();
    const [a, b] = await v.verify([
      req("Dopamine neurons respond to rewards and to reward-predicting stimuli in a manner consistent with a prediction error signal", SCHULTZ, "VTA", "NAC"),
      req("Dopamine neurons of the ventral tegmental area send their axons to the nucleus accumbens.", SCHULTZ, "VTA", "NAC"),
    ]);
    expect(a).toMatchObject({ status: "verified_abstract", checkedIn: [{ kind: "abstract", source: "europepmc", id: "9054347" }] });
    expect(b).toMatchObject({ status: "unverified", notes: ["no open-access full text; the quote is not in the abstract"] });
    expect(calls.some((u) => u.includes("/fullTextXML") || u.startsWith(BIOC))).toBe(false);
    expect(calls.filter((u) => u.startsWith(`${EUROPE_PMC}/search`))).toHaveLength(1);
  });

  it("tries PubMed, Crossref and Semantic Scholar for the abstract in turn", async () => {
    const abs = "Striatal neurons receive convergent input from cortical areas that are involved in different aspects of reward processing";
    const r1 = ref("[A, 2001]", "N/A", "111");
    const r2 = ref("[B, 2002]", "10.1000/b");
    const r3 = ref("[C, 2003]", "10.1000/c");
    const { v, calls } = setup({
      pubmedXml: { "111": `<PubmedArticle><Abstract><AbstractText Label="BACKGROUND">${abs}.</AbstractText></Abstract></PubmedArticle>` },
      crossref: { "10.1000/b": { DOI: "10.1000/b", title: ["B"], abstract: `<jats:p>${abs}.</jats:p>` } },
      s2: { "DOI:10.1000/c": { paperId: "x", abstract: `${abs}.` } },
    });
    const out = await v.verify([req(abs, r1), req(abs, r2), req(abs, r3)]);
    expect(out.map((c) => [c.status, c.checkedIn[0]?.source])).toEqual([
      ["verified_abstract", "pubmed"],
      ["verified_abstract", "crossref"],
      ["verified_abstract", "semanticscholar"],
    ]);
    expect(calls.filter((u) => u.startsWith(S2))).toHaveLength(1);
  });

  it("reads the PMC full text through BioC when Europe PMC is down", async () => {
    const bioc = {
      documents: [
        {
          id: "PMC3055449",
          passages: [
            { infons: { section_type: "INTRO" }, text: IN_BODY.replace("prefrontal", "pre\u00adfrontal") },
            { infons: { section_type: "REF", type: "ref" }, text: "Some cited paper about the lateral hypothalamus and the dorsolateral prefrontal cortex" },
          ],
        },
      ],
    };
    const { v } = setup({ ...DATA, bioc: { PMC3055449: bioc } }, (url) => (url.includes("/fullTextXML") ? 503 : undefined), { retries: 0 });
    const [c] = await v.verify([req(IN_BODY)]);
    expect(c).toMatchObject({ status: "verified_fulltext", checkedIn: [{ source: "pmc-bioc", id: "PMC3055449", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3055449/" }] });
    expect(c.notes).toEqual(["Europe PMC full text could not be fetched (HTTP 503)"]);
  });

  it("leaves quotes unverified during an outage and fetches the paper again at the next check", async () => {
    let down = true;
    const { v, calls } = setup(DATA, () => (down ? 503 : undefined), { retries: 0 });
    const [c] = await v.verify([req(IN_BODY)]);
    expect(c).toMatchObject({ status: "unverified", score: null });
    expect(c.notes[0]).toBe("no full text or abstract could be read");
    expect(c.notes.some((n) => /Europe PMC record could not be fetched \(HTTP 503\)/.test(n))).toBe(true);
    down = false;
    const [d] = await v.verify([req(IN_BODY)]);
    expect(d.status).toBe("verified_fulltext");
    const n = calls.length;
    await v.verify([req(IN_BODY), req(IN_CAPTION)]);
    expect(calls.length).toBe(n);
  });

  it("fetches each paper once for several connections and stops at the time budget", async () => {
    const { v, calls } = setup();
    await v.verify([req(IN_BODY), req(IN_CAPTION), req(INVENTED)]);
    expect(calls.filter((u) => u.includes("/fullTextXML"))).toHaveLength(1);

    const slow = setup(DATA, undefined, { budgetMs: 0 });
    const [c] = await slow.v.verify([req(IN_BODY)]);
    expect(c.status).toBe("unverified");
    expect(c.notes.join(" ")).toMatch(/time budget exceeded/);
  });

  it("says when a reference has no identifier, and uses the configured threshold", async () => {
    const { v } = setup();
    const [c] = await v.verify([req(IN_BODY, ref("[Luo, 2011]", "N/A"))]);
    expect(c).toMatchObject({ status: "unverified", notes: ["the reference has no DOI or PMID"], checkedIn: [] });

    const ocr = IN_BODY.replace("from", "frorn").replace("terminate", "terrninate");
    expect((await setup().v.verify([req(ocr)]))[0].status).toBe("verified_fulltext");
    const strict = setup(DATA, undefined, { threshold: 0.99 });
    expect(strict.v.threshold).toBe(0.99);
    expect((await strict.v.verify([req(ocr)]))[0].status).toBe("not_found");
    expect(setup(DATA, undefined, { threshold: Number("abc") }).v.threshold).toBe(0.9);
    expect(setup(DATA, undefined, { threshold: 5 }).v.threshold).toBe(0.9);
  });
});

describe("paper text extraction", () => {
  it("reads a JATS article without its reference list, citations and tables", () => {
    const t = jatsText(HABER_FULLTEXT);
    expect(t).toContain("Fibers from the dorsolateral prefrontal cortex terminate");
    expect(t).toContain("Schematic of the ventral striatal projections");
    expect(t).not.toContain("revisited in a tracing study");
    expect(t).not.toContain("Haber et al., 2006");
    expect(t).toContain("the ventral striatum\u2019s");
  });

  it("reads BioC documents and PubMed abstracts, and rejects the BioC error page", () => {
    expect(biocDocument("[Error] : No result can be found.")).toBeNull();
    expect(biocDocument(JSON.stringify([{ documents: [{ id: "123", passages: [{ text: "A" }, { text: "B", infons: { section_type: "REF" } }] }] }]))).toEqual({ id: "123", text: "A" });
    expect(pubmedAbstract('<AbstractText Label="A">One <i>two</i>.</AbstractText><AbstractText>Three &amp; four.</AbstractText>')).toBe("One two. Three & four.");
  });
});
