import { describe, expect, it } from "vitest";
import {
  HARNESS_SCHEMAS,
  checkCitations,
  compareWithRecord,
  extractCitations,
  frgCitedIds,
  isFrgProblem,
  journalsMatch,
  normalizeDoi,
  normalizePmid,
  parseRefId,
  refCheckMessage,
  summarizeRefChecks,
  titlesMatch,
  validateJsonSchema,
  type RefCheck,
  type RefRecord,
} from "../src/index.js";

const SCHULTZ: RefRecord = {
  source: "crossref",
  title: "A Neural Substrate of Prediction and Reward",
  authors: ["Schultz", "Dayan", "Montague"],
  years: [1997],
  journals: ["Science"],
  doi: "10.1126/science.275.5306.1593",
};

describe("identifiers", () => {
  it("normalizes DOIs and rejects values that are not DOIs", () => {
    expect(normalizeDoi("10.1126/Science.275.5306.1593")).toEqual({ doi: "10.1126/science.275.5306.1593", invalid: false, hadPrefix: false });
    expect(normalizeDoi("https://doi.org/10.1038/npp.2009.129")).toEqual({ doi: "10.1038/npp.2009.129", invalid: false, hadPrefix: true });
    expect(normalizeDoi("doi: 10.1038/npp.2009.129").doi).toBe("10.1038/npp.2009.129");
    for (const na of ["N/A", "", "n/a", "NA"]) expect(normalizeDoi(na)).toEqual({ doi: null, invalid: false, hadPrefix: false });
    expect(normalizeDoi("Science 275:1593").invalid).toBe(true);
    expect(normalizePmid("9054347")).toEqual({ pmid: "9054347", invalid: false });
    expect(normalizePmid("PMID: 9054347").pmid).toBe("9054347");
    expect(normalizePmid("")).toEqual({ pmid: null, invalid: false });
    expect(normalizePmid("PMC12345").invalid).toBe(true);
  });

  it("reads the first author and year from a Reference ID", () => {
    expect(parseRefId("[Schultz, 1997]")).toEqual({ author: "Schultz", year: 1997 });
    expect(parseRefId("[Schultz et al., 1997a]")).toEqual({ author: "Schultz", year: 1997 });
    expect(parseRefId("[Haber and Knutson, 2010]")).toEqual({ author: "Haber", year: 2010 });
    expect(parseRefId("[van der Meer & Redish, 2011]")).toEqual({ author: "van der Meer", year: 2011 });
    expect(parseRefId("[Allen Brain Atlas]")).toEqual({ author: null, year: null });
  });

  it("keeps references.json files with only id and doi valid and accepts the new optional keys", () => {
    const schema = HARNESS_SCHEMAS["references.json"];
    expect(validateJsonSchema(schema, { references: [{ id: "[Ito, 1982]", doi: "N/A" }] })).toEqual([]);
    expect(validateJsonSchema(schema, { references: [{ id: "[Ito, 1982]", doi: "N/A", pmid: "123", title: "t", journal: "j" }] })).toEqual([]);
    expect(validateJsonSchema(schema, { references: [{ id: "[Ito, 1982]", doi: "N/A", pmid: "PMC1" }] })[0]).toMatch(/pmid/);
  });
});

describe("matching a record", () => {
  it("compares titles fuzzily", () => {
    expect(titlesMatch("A neural substrate of prediction and reward.", SCHULTZ.title)).toBe(true);
    expect(titlesMatch("Neural substrate of prediction & reward", SCHULTZ.title)).toBe(true);
    expect(titlesMatch("The <i>reward</i> circuit", "The reward circuit: linking primate anatomy and human imaging")).toBe(false);
    expect(titlesMatch("The reward circuit linking primate anatomy", "The reward circuit: linking primate anatomy and human imaging")).toBe(true);
    expect(titlesMatch("Dopamine neurons encode reward prediction errors in the striatum", SCHULTZ.title)).toBe(false);
  });

  it("compares journal names with abbreviations", () => {
    expect(journalsMatch("J Neurosci", ["The Journal of Neuroscience"])).toBe(true);
    expect(journalsMatch("PNAS", ["Proceedings of the National Academy of Sciences"])).toBe(true);
    expect(journalsMatch("Nat. Rev. Neurosci.", ["Nature Reviews Neuroscience"])).toBe(true);
    expect(journalsMatch("Nature", ["Science"])).toBe(false);
  });

  it("accepts the cited paper and explains every difference of another one", () => {
    expect(compareWithRecord({ id: "[Schultz et al., 1997]", title: "A neural substrate of prediction and reward" }, SCHULTZ)).toEqual({ problems: [], notes: [] });
    expect(compareWithRecord({ id: "[Schultz, 1998]" }, SCHULTZ).problems).toEqual([]);
    expect(compareWithRecord({ id: "[Dayan, 1997]" }, SCHULTZ).problems).toEqual(["Dayan is author #2, not the first author (Schultz)"]);
    const other = compareWithRecord({ id: "[Smith, 2015]", title: "Striatal learning", journal: "Nature" }, SCHULTZ);
    expect(other.problems).toEqual([
      "the first author is Schultz, not Smith",
      "it was published in 1997, not 2015",
      'its title is "A Neural Substrate of Prediction and Reward"',
    ]);
    expect(other.notes).toEqual(['journal is "Science", not "Nature"']);
    expect(compareWithRecord({ id: "[Hausser, 2004]" }, { ...SCHULTZ, authors: ["Häusser"], years: [2004] }).problems).toEqual([]);
  });
});

describe("citations", () => {
  it("extracts [Author, Year] citations from free text", () => {
    expect(extractCitations("see [Schultz, 1997; Haber et al., 2010b] and [U.VTA], [link](http://x) [Ito, 1982]")).toEqual([
      "[Schultz, 1997]",
      "[Haber et al., 2010b]",
      "[Ito, 1982]",
    ]);
    expect(extractCitations("[U.NAC(shell,DRD1+)] = f([U.VTA]) [1, 2000]")).toEqual([]);
  });

  const refs = (list: { id: string; doi: string; pmid?: string }[]) => JSON.stringify({ references: list });
  const uc = JSON.stringify({ ucs: [{ circuitId: "VTA", sourceOfId: ["[Schultz, 1997]"], capability: "TD learning [Montague, 1996]" }] });
  const connections = JSON.stringify({ bif: [{ referenceIds: ["[Haber, 2010]"] }], connections: [{ referenceIds: ["[Unknown, 2001]"], comment: "" }] });

  it("reports citations missing from references.json, unused references and duplicate identifiers", () => {
    const c = checkCitations({
      references: refs([
        { id: "[Schultz, 1997]", doi: "10.1126/science.275.5306.1593" },
        { id: "[Haber, 2010]", doi: "10.1038/npp.2009.129", pmid: "19812543" },
        { id: "[Haber and Knutson, 2010]", doi: "https://doi.org/10.1038/NPP.2009.129" },
        { id: "[Ito, 1982]", doi: "N/A" },
        { id: "[Luo, 2011]", doi: "N/A" },
      ]),
      uc,
      connections,
      report: "# T\n\n## HCD\n\nVTA [Schultz,1997] and [Wrong, 1999].\n\n## FRG\n\nGN [Schultz, 1997] [Frg, 2020]\n\n## References\n\n- [Ito, 1982] Ito M.\n- [Ghost, 2000] ...\n",
      frg: JSON.stringify({ nodes: [{ id: "R.X", comment: "per [Luo, 2011]" }] }),
    });
    const msgs = c.problems.map((p) => p.message);
    expect(msgs).toEqual([
      "uc.json /ucs/0/capability: cites [Montague, 1996], which is not in references.json. Add the paper to references.json or cite an existing Reference ID.",
      "report.md ## HCD: cites [Schultz,1997]; write it exactly as the Reference ID [Schultz, 1997].",
      "report.md ## HCD: cites [Wrong, 1999], which is not in references.json. Add the paper to references.json or cite an existing Reference ID.",
      "report.md ## FRG: cites [Frg, 2020], which is not in references.json. Add the paper to references.json or cite an existing Reference ID.",
      "report.md ## References: cites [Ghost, 2000], which is not in references.json. Add the paper to references.json or cite an existing Reference ID.",
      "references.json: [Haber and Knutson, 2010] is not cited in uc.json, connections.json, frg.json or the report; cite it where it supports a statement or remove it.",
      "references.json: [Ito, 1982] is not cited in uc.json, connections.json, frg.json or the report (only in the report's bibliography); cite it where it supports a statement or remove it.",
      "references.json: [Haber, 2010], [Haber and Knutson, 2010] have the same DOI 10.1038/npp.2009.129; keep one Reference ID per paper and update the citations.",
    ]);
    // the unknown ID in a referenceIds list is left to checkHcd
    expect(msgs.join("\n")).not.toMatch(/Unknown, 2001/);
    expect(c.citedAt.get("[Schultz, 1997]")).toEqual(["uc.json /ucs/0/sourceOfId/0", "report.md ## HCD", "report.md ## FRG"]);
    expect([...frgCitedIds(c)]).toEqual(["[Luo, 2011]"]);
    expect(c.problems.filter(isFrgProblem).map((p) => p.refId)).toEqual(["[Frg, 2020]"]);
  });

  it("finds nothing to report in a consistent project", () => {
    const c = checkCitations({
      references: refs([
        { id: "[Schultz, 1997]", doi: "10.1126/science.275.5306.1593" },
        { id: "[Haber, 2010]", doi: "N/A" },
        { id: "[Montague, 1996]", doi: "N/A" },
      ]),
      uc,
      connections: JSON.stringify({ bif: [{ referenceIds: ["[Haber, 2010]"] }], connections: [] }),
      report: "## HCD\n[Schultz, 1997]\n## References\n- [Schultz, 1997]\n",
    });
    expect(c.problems).toEqual([]);
  });
});

describe("reference check results", () => {
  const base: RefCheck = { id: "[Smith, 2015]", doi: "10.1/x", pmid: "", status: "verified", problems: [], notes: [] };

  it("turns results into validator messages only when something must be fixed", () => {
    expect(refCheckMessage(base)).toBeNull();
    expect(refCheckMessage({ ...base, status: "unverified" })).toBeNull();
    expect(refCheckMessage({ ...base, status: "no_identifier", doi: "N/A" })).toBeNull();
    expect(refCheckMessage({ ...base, status: "not_found", problems: ["DOI 10.1/x does not exist (not found in Crossref or doi.org)"] })).toMatch(
      /^references\.json: \[Smith, 2015\]: DOI 10\.1\/x does not exist .*remove the reference and every citation of it\.$/,
    );
    expect(
      refCheckMessage({
        ...base,
        status: "mismatch",
        problems: ["the first author is Schultz, not Smith"],
        record: { source: "crossref", title: SCHULTZ.title, firstAuthor: "Schultz", year: 1997, journal: "Science" },
      }),
    ).toMatch(/does not match its identifier: the first author is Schultz, not Smith \(DOI 10\.1\/x is "A Neural Substrate of Prediction and Reward", Schultz, 1997\)/);
    expect(refCheckMessage({ ...base, status: "no_identifier", doi: "N/A", suggestion: { doi: "10.2/y", title: "T", firstAuthor: "Smith", year: 2015 } })).toMatch(
      /has no DOI, but Crossref lists "T" \(Smith, 2015\) as DOI 10\.2\/y/,
    );
    expect(summarizeRefChecks([base, { ...base, status: "unverified" }, base])).toMatchObject({ verified: 2, unverified: 1, mismatch: 0 });
  });
});
