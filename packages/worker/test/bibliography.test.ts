import { describe, expect, it } from "vitest";
import { updateBibliography } from "../src/bibliography.js";
import { CROSSREF, EUTILS, SCHULTZ_PUBMED, SCHULTZ_WORK, mockLiterature } from "./mockLiterature.js";

describe("bibliography for the Template-v2-2 BibTeX", () => {
  it("reads the Crossref work of a DOI and the PubMed summary of a PMID-only reference", async () => {
    const lit = mockLiterature({ crossref: { [SCHULTZ_WORK.DOI]: { ...SCHULTZ_WORK, type: "journal-article", volume: "275", page: "1593-1599" } }, pubmed: { "9054347": SCHULTZ_PUBMED } });
    const b = await updateBibliography(
      [
        { id: "[Schultz, 1997]", doi: SCHULTZ_WORK.DOI },
        { id: "[Schultz, 1997b]", doi: "N/A", pmid: "9054347" },
        { id: "[Nobody, 2000]", doi: "10.9999/missing" },
      ],
      null,
      { fetch: lit.fetch, crossrefUrl: CROSSREF, eutilsUrl: EUTILS },
    );
    expect(b.records[`doi:${SCHULTZ_WORK.DOI}`]).toMatchObject({ source: "crossref", title: "A Neural Substrate of Prediction and Reward", container: "Science", year: 1997, volume: "275", pages: "1593-1599" });
    expect(b.records[`doi:${SCHULTZ_WORK.DOI}`]!.authors[0]).toEqual({ family: "Schultz", given: "Wolfram" });
    expect(b.records["pmid:9054347"]).toMatchObject({ source: "pubmed", title: "A neural substrate of prediction and reward", year: 1997, doi: SCHULTZ_WORK.DOI });
    expect(b.records["pmid:9054347"]!.authors[2]).toEqual({ family: "Montague", given: "P. R." });
    expect(b.records["doi:10.9999/missing"]).toBeNull();
  });

  it("keeps earlier records, and leaves failed lookups out so the next job retries them", async () => {
    const lit = mockLiterature({}, () => 503);
    const b = await updateBibliography([{ id: "[Schultz, 1997]", doi: SCHULTZ_WORK.DOI }, { id: "[Old, 1990]", doi: "10.1/old" }], { version: 1, records: { "doi:10.1/old": null } }, { fetch: lit.fetch, crossrefUrl: CROSSREF });
    expect(b.records).toEqual({ "doi:10.1/old": null });
    expect(lit.calls).toHaveLength(1);
  });
});
