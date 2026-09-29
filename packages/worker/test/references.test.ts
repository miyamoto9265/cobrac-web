import { describe, expect, it } from "vitest";
import type { RefRow } from "@cobrac/shared";
import { ReferenceVerifier, type VerifierOptions } from "../src/references.js";
import { CROSSREF, DOI_ORG, EUTILS, HABER_WORK, SCHULTZ_PUBMED, SCHULTZ_WORK, mockLiterature, type Failure, type LiteratureData } from "./mockLiterature.js";

const DATA: LiteratureData = {
  crossref: { [SCHULTZ_WORK.DOI]: SCHULTZ_WORK, [HABER_WORK.DOI]: HABER_WORK },
  csl: {
    "10.5281/zenodo.123": { DOI: "10.5281/zenodo.123", title: "Mouse brain atlas data", author: [{ family: "Lein" }], issued: { "date-parts": [[2007]] }, "container-title": "Zenodo" },
  },
  pubmed: { "9054347": SCHULTZ_PUBMED },
};

function setup(fail?: (url: string, n: number) => Failure | undefined, opts: VerifierOptions = {}, data = DATA) {
  const lit = mockLiterature(data, fail);
  const sleeps: number[] = [];
  let clock = 0;
  const v = new ReferenceVerifier({
    fetch: lit.fetch,
    crossrefUrl: CROSSREF,
    doiUrl: DOI_ORG,
    eutilsUrl: EUTILS,
    sleep: async (ms) => void (sleeps.push(ms), (clock += ms)),
    now: () => clock,
    ...opts,
  });
  return { v, calls: lit.calls, sleeps };
}

const ref = (id: string, doi: string, extra: Partial<RefRow> = {}): RefRow => ({ id, doi, pmid: "", title: "", journal: "", ...extra });

describe("reference verifier", () => {
  it("verifies real DOIs and PMIDs, tolerating online/print years and abbreviated titles", async () => {
    const { v } = setup();
    const r = await v.verify([
      ref("[Schultz et al., 1997]", SCHULTZ_WORK.DOI, { title: "A neural substrate of prediction and reward", pmid: "9054347" }),
      ref("[Haber, 2010]", "https://doi.org/10.1038/NPP.2009.129", { journal: "Neuropsychopharmacology" }),
      ref("[Lein, 2007]", "10.5281/zenodo.123"),
    ]);
    expect(r.map((c) => c.status)).toEqual(["verified", "verified", "verified"]);
    expect(r[0].record).toMatchObject({ source: "crossref", firstAuthor: "Schultz", year: 1997, journal: "Science" });
    expect(r[1].notes).toEqual(["write the DOI without the https://doi.org/ or doi: prefix"]);
    expect(r[2].record).toMatchObject({ source: "doi.org", title: "Mouse brain atlas data" });
  });

  it("flags DOIs and PMIDs that do not exist, and records that point to another paper", async () => {
    const { v } = setup();
    const r = await v.verify([
      ref("[Smith, 2015]", "10.1016/j.neuron.2015.99999"),
      ref("[Smith, 2016]", "N/A", { pmid: "99999999" }),
      ref("[Montague, 1996]", SCHULTZ_WORK.DOI, { title: "A framework for mesencephalic dopamine systems based on predictive Hebbian learning" }),
      ref("[Schultz, 1997]", HABER_WORK.DOI, { pmid: "9054347" }),
      ref("[Bad, 2000]", "Science 275:1593"),
    ]);
    expect(r.map((c) => c.status)).toEqual(["not_found", "not_found", "mismatch", "mismatch", "invalid"]);
    expect(r[0].problems).toEqual(["DOI 10.1016/j.neuron.2015.99999 does not exist (not found in Crossref or doi.org)"]);
    expect(r[1].problems).toEqual(["PMID 99999999 does not exist (not found in PubMed)"]);
    expect(r[2].problems).toEqual([
      "Montague is author #3, not the first author (Schultz)",
      'its title is "A Neural Substrate of Prediction and Reward"',
    ]);
    expect(r[3].problems).toContain("crossref: the first author is Haber, not Schultz");
    expect(r[3].problems).toContain("PMID 9054347 belongs to DOI 10.1126/science.275.5306.1593, not 10.1038/npp.2009.129");
    expect(r[4].problems[0]).toMatch(/is not a DOI/);
  });

  it("suggests a DOI for a reference without one when Crossref has the same paper", async () => {
    const { v, calls } = setup(undefined, {}, { ...DATA, search: [HABER_WORK, SCHULTZ_WORK] });
    const [a, b, c] = await v.verify([
      ref("[Schultz, 1997]", "N/A", { title: "A neural substrate of prediction and reward" }),
      ref("[Dayan, 1997]", "N/A", { title: "A neural substrate of prediction and reward" }),
      ref("[Luo, 2011]", "N/A"),
    ]);
    expect(a).toMatchObject({ status: "no_identifier", suggestion: { doi: SCHULTZ_WORK.DOI, firstAuthor: "Schultz", year: 1997 } });
    expect(b.status).toBe("no_identifier");
    expect(b.suggestion).toBeUndefined();
    expect(c).toMatchObject({ status: "no_identifier" });
    expect(calls.filter((u) => u.includes("query.bibliographic"))).toHaveLength(2);
  });

  it("retries rate limits and server errors, honouring Retry-After", async () => {
    const { v, sleeps, calls } = setup((url, n) => (url.includes("/works/") && n === 1 ? { status: 429, retryAfter: "3" } : url.includes("/works/") && n === 2 ? 503 : undefined));
    const [r] = await v.verify([ref("[Schultz, 1997]", SCHULTZ_WORK.DOI)]);
    expect(r.status).toBe("verified");
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([3000, 2000]);
  });

  it("leaves references unverified during an outage and stops calling a host that keeps failing", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const { v, calls } = setup((url) => (url.startsWith(CROSSREF) ? timeout : undefined), { retries: 1 });
    const refs = [1, 2, 3, 4, 5].map((i) => ref(`[A${i}, 2000]`, `10.1000/x${i}`));
    const r = await v.verify(refs);
    expect(r.map((c) => c.status)).toEqual(Array(5).fill("unverified"));
    expect(r[0].notes).toEqual(["DOI 10.1000/x1 could not be looked up (timeout)"]);
    expect(r[4].notes[0]).toMatch(/crossref\.test unavailable/);
    // 3 failures (2 attempts each) open the breaker; later references are not sent
    expect(calls.filter((u) => u.startsWith(CROSSREF)).length).toBeLessThanOrEqual(8);
    expect(calls.some((u) => u.startsWith(DOI_ORG))).toBe(false);
  });

  it("keeps the verified part when only one of DOI / PMID can be looked up", async () => {
    const { v } = setup((url) => (url.startsWith(EUTILS) ? new TypeError("fetch failed") : undefined), { retries: 0 });
    const [r] = await v.verify([ref("[Schultz, 1997]", SCHULTZ_WORK.DOI, { pmid: "9054347" })]);
    expect(r.status).toBe("verified");
    expect(r.notes).toEqual(["PMID 9054347 could not be looked up (network error)"]);
  });

  it("stops looking up when the time budget is spent", async () => {
    const { v } = setup((url) => (url.startsWith(CROSSREF) ? 503 : undefined), { budgetMs: 2500, concurrency: 1 });
    const r = await v.verify([ref("[A, 2000]", "10.1000/a"), ref("[B, 2000]", "10.1000/b")]);
    expect(r.map((c) => c.status)).toEqual(["unverified", "unverified"]);
    expect(r[1].notes[0]).toMatch(/time budget exceeded/);
  });

  it("caches found and missing identifiers but asks again after a failure", async () => {
    let down = true;
    const { v, calls } = setup((url) => (down && url.includes("x1") ? 500 : undefined), { retries: 0 });
    await v.verify([ref("[Schultz, 1997]", SCHULTZ_WORK.DOI), ref("[A, 2000]", "10.1000/x1"), ref("[B, 2000]", "10.1000/gone")]);
    const n = calls.length;
    down = false;
    const r = await v.verify([ref("[Schultz, 1997]", SCHULTZ_WORK.DOI), ref("[A, 2000]", "10.1000/x1"), ref("[B, 2000]", "10.1000/gone")]);
    expect(calls.slice(n)).toEqual([`${CROSSREF}/works/10.1000/x1`, `${DOI_ORG}/10.1000/x1`]);
    expect(r.map((c) => c.status)).toEqual(["verified", "not_found", "not_found"]);
  });

  it("spaces out PubMed requests (3 per second without an API key)", async () => {
    const { v, sleeps, calls } = setup(undefined, { concurrency: 3 });
    await v.verify([ref("[A, 1997]", "N/A", { pmid: "1" }), ref("[B, 1997]", "N/A", { pmid: "2" }), ref("[C, 1997]", "N/A", { pmid: "3" })]);
    expect(calls.filter((u) => u.startsWith(EUTILS))).toHaveLength(3);
    expect(sleeps.filter((s) => s === 350).length).toBeGreaterThanOrEqual(2);
    const keyed = setup(undefined, { ncbiApiKey: "k" });
    await keyed.v.verify([ref("[A, 1997]", "N/A", { pmid: "1" })]);
    expect(keyed.calls[0]).toMatch(/&api_key=k$/);
  });
});
