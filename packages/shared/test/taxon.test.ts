import { describe, expect, it } from "vitest";
import { bifCoverageProblems, isMeshSpecies, meshSpecies, taxonProblems, type BifRow, type ConnRow, type RefCheck } from "../src/index.js";

const conn = (taxon: string, ref: string, comment = ""): ConnRow => ({
  sender: "LSO",
  receiver: "CIC",
  comment,
  referenceIds: [ref],
  taxon,
  method: "Anterograde tracing",
  pointersOnLiterature: "",
  pointersOnFigure: "",
  senderRelation: "=",
  senderInLiterature: "",
  receiverRelation: "=",
  receiverInLiterature: "",
});
const check = (id: string, species?: string[]): RefCheck => ({ id, doi: "N/A", pmid: "1", status: "verified", problems: [], notes: [], ...(species ? { species } : {}) });

describe("MeSH species", () => {
  it("knows the taxa of the list, their strains and species the list lacks", () => {
    expect(isMeshSpecies("Rats, Sprague-Dawley")).toBe(true);
    expect(isMeshSpecies("Ferrets")).toBe(true);
    expect(isMeshSpecies("Inferior Colliculi")).toBe(false);
    const m = meshSpecies(["Mice, Inbred C57BL", "Macaca mulatta", "Gerbillinae"]);
    expect([...m.taxa]).toEqual(["Mouse", "Macaque"]);
    expect([...m.others]).toEqual(["gerbil"]);
  });
});

describe("QC-02-12 taxon against MeSH", () => {
  it("asks for the species when the taxon is (No description) but the paper names one (Loftus 2004, cat)", () => {
    const p = taxonProblems([conn("(No description)", "[Loftus, 2004]")], [check("[Loftus, 2004]", ["Animals", "Cats"].filter(isMeshSpecies))]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/Set taxon to "Cat"/);
  });

  it("asks to name a species the list lacks in the comment (ferret), and accepts it once named", () => {
    const checks = [check("[King, 1998]", ["Ferrets"])];
    expect(taxonProblems([conn("(No description)", "[King, 1998]")], checks)[0]).toMatch(/name the species \(ferret\) in comment/);
    expect(taxonProblems([conn("(No description)", "[King, 1998]", "Ferret (not in the taxon list).")], checks)).toEqual([]);
  });

  it("flags a specific taxon the paper does not study", () => {
    const p = taxonProblems([conn("Mouse", "[A, 2000]")], [check("[A, 2000]", ["Rats"])]);
    expect(p[0]).toMatch(/taxon is "Mouse".*set taxon to "Rat"/);
    expect(taxonProblems([conn("Cat", "[B, 2000]")], [check("[B, 2000]", ["Ferrets"])])[0]).toMatch(/\(No description\)" and name the species \(ferret\)/);
  });

  it("suggests Rodent for mouse and rat, (Mixed) for more, and an animal over Humans", () => {
    expect(taxonProblems([conn("(No description)", "[C, 2000]")], [check("[C, 2000]", ["Mice", "Rats"])])[0]).toMatch(/"Rodent"/);
    expect(taxonProblems([conn("(No description)", "[D, 2000]")], [check("[D, 2000]", ["Mice", "Cats"])])[0]).toMatch(/"\(Mixed\)"/);
    expect(taxonProblems([conn("(No description)", "[E, 2000]")], [check("[E, 2000]", ["Humans", "Cats"])])[0]).toMatch(/"Cat"/);
  });

  it("accepts matching taxa, (Mixed), Rodent for rodents, and papers without MeSH species", () => {
    const checks = [check("[F, 2000]", ["Cats"]), check("[G, 2000]", ["Gerbillinae"]), check("[H, 2000]")];
    expect(taxonProblems([conn("Cat", "[F, 2000]"), conn("(Mixed)", "[F, 2000]"), conn("Rodent", "[G, 2000]"), conn("(No description)", "[H, 2000]")], checks)).toEqual([]);
  });
});

describe("QC-03-43 / QC-03-44 / QC-01-10 BIF coverage", () => {
  const bif = (x: Partial<BifRow>): BifRow => ({ sender: "SPON", receiver: "IC", comment: "", referenceIds: ["[Saldaña, 2009]"], ...x });
  const conns = [conn("Rat", "[Kelly, 1998]")];

  it("needs modelled on every entry and a reason when it is false", () => {
    expect(bifCoverageProblems([bif({})], conns, null)[0]).toMatch(/has no "modelled"/);
    expect(bifCoverageProblems([bif({ modelled: false })], conns, null)[0]).toMatch(/has no "reason"/);
    expect(bifCoverageProblems([bif({ modelled: false, reason: "offset coding, minor role" })], conns, null)).toEqual([]);
  });

  it("needs a connection citing a paper of a modelled entry", () => {
    expect(bifCoverageProblems([bif({ modelled: true })], conns, null)[0]).toMatch(/no connection in connections\.json cites \[Saldaña, 2009\]/);
    expect(bifCoverageProblems([bif({ modelled: true, referenceIds: ["[Kelly, 1998]"] })], conns, null)).toEqual([]);
  });

  it("research mode: every supported or weak candidate is on a BIF entry, and listed IDs exist", () => {
    const cands = new Map([["C12", "supported"], ["C13", "weak"], ["C14", "not_found"]]);
    const p = bifCoverageProblems([bif({ modelled: false, reason: "minor", candidateIds: ["C12", "C99"] })], conns, cands);
    expect(p.join("\n")).toMatch(/candidateIds C99, which research\.json does not have/);
    expect(p.join("\n")).toMatch(/candidates C13 \(weak\) are on no BIF entry/);
    expect(p.join("\n")).not.toMatch(/C14/);
  });
});
