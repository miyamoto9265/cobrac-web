/**
 * The lit tools against the real PubMed, Europe PMC and NCBI BioC services. Skipped unless LIT_LIVE=1
 * (`npm run test:live -w @cobrac/worker`); needs internet access. Europe PMC may be down: abstracts and sentences
 * must still come back through the NCBI fallback, and search_europepmc must then fail with a usable message.
 */
import { describe, expect, it } from "vitest";
import { LitClient, type AbstractResult, type SearchResult, type SentencesResult } from "../src/litsearch.js";

const live = process.env.LIT_LIVE === "1";
const client = new LitClient({ mailto: process.env.LIT_MAILTO || undefined });

describe.skipIf(!live)("lit tools against the real services", () => {
  it("searches PubMed", async () => {
    const r = (await client.call("search_pubmed", { query: "ventral tegmental area nucleus accumbens tracing", max_results: 3 })) as SearchResult;
    expect(r.total).toBeGreaterThan(0);
    expect(r.hits[0].pmid).toMatch(/^\d+$/);
  }, 90_000);

  it("searches Europe PMC, or says it is down and what to use instead", async () => {
    try {
      const r = (await client.call("search_europepmc", { query: 'TITLE:"ventral tegmental area"', max_results: 3 })) as SearchResult;
      expect(r.hits.length).toBeGreaterThan(0);
    } catch (e) {
      expect(String(e)).toMatch(/Europe PMC is unavailable \(.+\)\. Use search_pubmed instead/);
    }
  }, 90_000);

  it("returns an abstract", async () => {
    const r = (await client.call("get_abstract", { pmid: "26232228" })) as AbstractResult;
    expect(r.title).toMatch(/VTA Dopamine Neurons/i);
    expect(r.abstract.length).toBeGreaterThan(200);
  }, 90_000);

  it("returns sentences from an open-access full text", async () => {
    const r = (await client.call("find_sentences", { pmid: "26232228", terms: ["retrograde", "nucleus accumbens"] })) as SentencesResult;
    expect(r.pmcid).toBe("PMC4522312");
    expect(r.source).toBe("full text");
    expect(r.sentences.length).toBeGreaterThan(0);
  }, 90_000);

  it("answers the find_sentences calls that failed in production (ufwwj0jg-1)", async () => {
    const calls = [
      { pmid: "31965011", terms: ["posterior fusiform gyrus", "V3A/B"] },
      { pmid: "32424290", terms: ["arcuate fasciculus", "angular", "SLF II"] },
      { pmid: "36419463", terms: ["frontal aslant tract", "Broca's area", "supplementary motor area"] },
    ];
    const rs = (await Promise.all(calls.map((a) => client.call("find_sentences", a)))) as SentencesResult[];
    for (const r of rs) {
      expect(r.source).not.toBe("none");
      expect(r.sentences.length).toBeGreaterThan(0);
    }
  }, 90_000);
});
