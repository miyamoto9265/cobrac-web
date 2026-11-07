import { describe, expect, it } from "vitest";
import {
  autoFixFiles,
  emptyCanonSnapshot,
  kebabNodeId,
  lenientFigurePointer,
  matchMethod,
  matchTaxon,
  matchTransmitter,
  nonEnglishStrings,
  normalizeOutputSemantics,
  replaceStrings,
  stripLocator,
  type CanonSnapshot,
  type QuoteCheck,
  type RefCheck,
} from "../src/index.js";

const json = (v: unknown) => JSON.stringify(v, null, 2);
const QUOTE = "Neurons of the dentate gyrus project to CA3 through the mossy fibers in the rat hippocampus.";

function files(over: { refs?: unknown[]; ucs?: unknown[]; conns?: unknown[]; nodes?: unknown[]; report?: string } = {}) {
  return {
    references: json({ references: over.refs ?? [{ id: "[Amaral, 1990]", doi: "10.1002/a", literatureType: "Review", title: "Hippocampus" }] }),
    uc: json({
      ucs: over.ucs ?? [
        { circuitId: "DG", descriptor: "DHBA:10", names: "dentate gyrus", roi: "internal", sourceOfId: "DHBA", transmitter: "Glutamate", modulationType: "Excitatory", comments: "[Amaral, 1990]", interface: "", outputSemantics: "[DG] pattern separation;" },
        { circuitId: "CA3", descriptor: "DHBA:11", names: "CA3", roi: "internal", sourceOfId: "DHBA", transmitter: "Glutamate", modulationType: "Excitatory", comments: "", interface: "", outputSemantics: "[CA3] completion;" },
      ],
    }),
    connections: json({
      bif: [],
      connections: over.conns ?? [{ sender: "DG", receiver: "CA3", referenceIds: ["[Amaral, 1990]"], taxon: "Rat", measurementMethod: "Axonal tracing", pointersOnLiterature: QUOTE, pointersOnFigure: "" }],
    }),
    frg: json({ nodes: over.nodes ?? [{ id: "R.Pattern-Separation", subnodes: ["U.DG", "U.CA3"], comment: "x", interface: "([U.CA3]) = R.Pattern-Separation([U.DG])" }] }),
    report: over.report ?? "## HCD\n\nSee [Amaral, 1990].\n",
  };
}
const parse = (t: string | null | undefined) => JSON.parse(t ?? "null");

describe("value matching", () => {
  it("maps spellings to the BRA values", () => {
    expect(matchTransmitter("glutamatergic")).toBe("Glutamate");
    expect(matchTransmitter("gaba")).toBe("GABA");
    expect(matchTransmitter("noradrenaline")).toBeNull();
    expect(matchTaxon("rats")).toBe("Rat");
    expect(matchTaxon("Rhesus monkey")).toBe("Macaque");
    expect(matchMethod("electrophysiology")).toBe("Electro physiology");
    expect(matchMethod("anterograde tracing")).toBe("Anterograde tracing");
  });
});

describe("text fixes", () => {
  it("strips a leading locator", () => {
    expect(stripLocator(`p. 512: "${QUOTE}"`)).toBe(QUOTE);
    expect(stripLocator(`Section 3.2, ${QUOTE}`)).toBe(QUOTE);
    expect(stripLocator(QUOTE)).toBe(QUOTE);
  });
  it("finds the figure number", () => {
    expect(lenientFigurePointer("(see Figure 3b)")).toBe("Fig. 3B");
    expect(lenientFigurePointer("3B")).toBe("Fig. 3B");
    expect(lenientFigurePointer("as shown in Fig 2")).toBe("Fig. 2");
    expect(lenientFigurePointer("Table 2")).toBeNull();
  });
  it("rewrites Output Semantics into one item", () => {
    expect(normalizeOutputSemantics("DG", "pattern separation")).toBe("[DG] pattern separation;");
    expect(normalizeOutputSemantics("DG", "[U.DG] sparse code; orthogonalized [Amaral, 1990]")).toBe("[DG] sparse code, orthogonalized [Amaral, 1990];");
    expect(normalizeOutputSemantics("DG", "[CA3] sparse code;")).toBe("[DG] sparse code;");
    expect(normalizeOutputSemantics("DG", "[DG] ;")).toBeNull();
  });
  it("makes node IDs kebab-case", () => {
    expect(kebabNodeId("R.Pattern Separation")).toBe("R.Pattern-Separation");
    expect(kebabNodeId("R.pattern_separation__dg")).toBe("R.pattern-separation-dg");
    expect(kebabNodeId("R.__")).toBeNull();
  });
});

describe("autoFixFiles", () => {
  it("changes nothing in valid files", () => {
    const r = autoFixFiles(files());
    expect(r.fixes).toEqual([]);
    expect(r.files).toEqual({});
  });

  it("merges two Reference IDs of one paper and rewrites the citations", () => {
    const f = files({
      refs: [
        { id: "[Amaral, 1990]", doi: "10.1002/a", literatureType: "Review" },
        { id: "[Amaral and Witter, 1990]", doi: "https://doi.org/10.1002/A", literatureType: "Review" },
      ],
      conns: [{ sender: "DG", receiver: "CA3", referenceIds: ["[Amaral and Witter, 1990]"], taxon: "Rat", measurementMethod: "Axonal tracing", pointersOnLiterature: QUOTE, pointersOnFigure: "" }],
      report: "## HCD\n\n[Amaral, 1990] and [Amaral and Witter, 1990].\n",
    });
    const r = autoFixFiles(f);
    expect(r.fixes.map((x) => x.code)).toEqual(["QC-02-05"]);
    expect(parse(r.files.references).references.map((x: { id: string }) => x.id)).toEqual(["[Amaral, 1990]"]);
    expect(parse(r.files.connections).connections[0].referenceIds).toEqual(["[Amaral, 1990]"]);
    expect(r.files.report).toBe("## HCD\n\n[Amaral, 1990] and [Amaral, 1990].\n");
  });

  it("removes references cited nowhere", () => {
    const f = files({ refs: [{ id: "[Amaral, 1990]", doi: "10.1002/a", literatureType: "Review" }, { id: "[Unused, 2000]", doi: "10.1002/u", literatureType: "Review" }] });
    const r = autoFixFiles(f);
    expect(r.fixes).toEqual([{ code: "QC-02-08", file: "references.json", where: "[Unused, 2000]", before: "[Unused, 2000]", after: "(removed)" }]);
    expect(parse(r.files.references).references).toHaveLength(1);
  });

  it("takes the record's title when only the title differs", () => {
    const checks: RefCheck[] = [
      { id: "[Amaral, 1990]", doi: "10.1002/a", pmid: "", status: "mismatch", problems: ['its title is "Hippocampal formation"'], notes: [], record: { source: "crossref", title: "Hippocampal formation", firstAuthor: "Amaral", year: 1990, journal: "J" } },
    ];
    const r = autoFixFiles(files(), { refChecks: checks });
    expect(r.fixes.map((x) => x.code)).toEqual(["QC-02-04"]);
    expect(parse(r.files.references).references[0].title).toBe("Hippocampal formation");
    // an author or year mismatch is another paper: left to the agent
    const other = [{ ...checks[0], problems: ["the first author is Smith, not Amaral", 'its title is "X"'] }];
    expect(autoFixFiles(files(), { refChecks: other }).fixes).toEqual([]);
  });

  it("fixes enum spellings, locators, figures and Output Semantics", () => {
    const f = files({
      ucs: [
        { circuitId: "DG", descriptor: "DHBA:10", names: "dentate gyrus", roi: "internal", sourceOfId: "DHBA", transmitter: "glutamatergic", modulationType: "excitation", comments: "[Amaral, 1990]", interface: "", outputSemantics: "pattern separation" },
        { circuitId: "CA3", descriptor: "DHBA:11", names: "CA3", roi: "internal", sourceOfId: "DHBA", transmitter: "Glutamate", modulationType: "Excitatory", comments: "", interface: "", outputSemantics: "[CA3] completion;" },
      ],
      conns: [{ sender: "DG", receiver: "CA3", referenceIds: ["[Amaral, 1990]"], taxon: "rats", measurementMethod: "axonal tracing", pointersOnLiterature: `p. 3: ${QUOTE}`, pointersOnFigure: "see Figure 2c" }],
    });
    const r = autoFixFiles(f);
    expect(r.fixes.map((x) => x.code).sort()).toEqual(["QC-03-17", "QC-03-17", "QC-03-23", "QC-03-24", "QC-03-26", "QC-03-26", "QC-03-30"]);
    const dg = parse(r.files.uc).ucs[0];
    expect([dg.transmitter, dg.modulationType, dg.outputSemantics]).toEqual(["Glutamate", "Excitatory", "[DG] pattern separation;"]);
    const c = parse(r.files.connections).connections[0];
    expect([c.taxon, c.measurementMethod, c.pointersOnLiterature, c.pointersOnFigure]).toEqual(["Rat", "Axonal tracing", QUOTE, "Fig. 2C"]);
  });

  it("puts the SABRA official name first", () => {
    const f = files({
      ucs: [
        { circuitId: "VTA", descriptor: "HOMBA:12261", names: "VTA; midbrain dopamine area", roi: "internal", sourceOfId: "DHBA", transmitter: "Dopamine", modulationType: "Modulatory", comments: "[Amaral, 1990]", interface: "", outputSemantics: "[VTA] reward prediction error;" },
      ],
    });
    const sabra = new Map([["HOMBA:12261", { atlas: "DHBA", dhbaAcronym: "VTA", dhbaExact: true, dhbaHombaId: "HOMBA:12261", dhbaAncestorAcronym: "VTA", dhbaName: "ventral tegmental area" }]]);
    const r = autoFixFiles(f, { sabra: sabra as never });
    expect(r.fixes.map((x) => x.code)).toEqual(["QC-03-09"]);
    expect(parse(r.files.uc).ucs[0].names).toBe("ventral tegmental area; VTA; midbrain dopamine area");
  });

  it("follows the Canon's official name and DOI", () => {
    const canon: CanonSnapshot = {
      ...emptyCanonSnapshot("c1", "2026-11-01T00:00:00Z"),
      revision: 1,
      circuits: [{ descriptor: "DHBA:10", key: "DHBA:10", circuitId: "DG", names: "Dentate gyrus; DG", status: "uniform", subCircuits: [], transmitter: "Glutamate", modulationType: "Excitatory", sourceOfId: "DHBA", outputSemantics: "", origin: { pr: 1, projectId: "p", revision: 1 }, sources: ["p"], state: "valid" } as never],
      references: [{ key: "[Amaral, 1990]", doi: "10.1002/canon", pmid: "", title: "", journal: "", literatureType: "Review", alternativeUrl: "", check: "verified", origin: { pr: 1, projectId: "p", revision: 1 }, sources: ["p"], state: "valid" } as never],
    };
    const r = autoFixFiles(files(), { canon });
    expect(r.fixes.map((x) => x.code).sort()).toEqual(["QC-07-07", "QC-07-09"]);
    expect(parse(r.files.uc).ucs[0].names).toBe("Dentate gyrus");
    expect(parse(r.files.references).references[0].doi).toBe("10.1002/canon");
  });

  it("quotes the closest passage of the paper when the quote was not found", () => {
    const passage = "Granule cells of the dentate gyrus send their axons, the mossy fibers, to the CA3 field of the hippocampus.";
    const q: QuoteCheck = { sender: "DG", receiver: "CA3", referenceIds: ["[Amaral, 1990]"], quote: QUOTE, status: "not_found", checkedIn: [], score: 0.72, closest: passage, notes: [] };
    const r = autoFixFiles(files(), { quoteChecks: [q] });
    expect(r.fixes.map((x) => x.code)).toEqual(["QC-02-09"]);
    expect(parse(r.files.connections).connections[0].pointersOnLiterature).toBe(passage);
    expect(autoFixFiles(files(), { quoteChecks: [{ ...q, score: 0.45 }] }).fixes).toEqual([]);
  });

  it("renames non-kebab node IDs and their references", () => {
    const f = files({ nodes: [{ id: "R.Pattern Separation", subnodes: ["R.dg_part"], comment: "x", interface: "([U.CA3]) = R.Pattern Separation([U.DG])" }, { id: "R.dg_part", subnodes: ["U.DG", "U.CA3"], comment: "y", interface: "" }] });
    const r = autoFixFiles(f);
    const nodes = parse(r.files.frg).nodes;
    expect(nodes.map((n: { id: string }) => n.id)).toEqual(["R.Pattern-Separation", "R.dg-part"]);
    expect(nodes[0].subnodes).toEqual(["R.dg-part"]);
    expect(nodes[0].interface).toBe("([U.CA3]) = R.Pattern-Separation([U.DG])");
  });
});

describe("translation helpers", () => {
  it("lists and replaces non-English values", () => {
    const f = files({ ucs: [{ circuitId: "DG", descriptor: "DHBA:10", names: "歯状回", roi: "internal", sourceOfId: "DHBA", transmitter: "", modulationType: "", comments: "", interface: "", outputSemantics: "" }] });
    expect(nonEnglishStrings(f)).toEqual(["歯状回"]);
    const r = replaceStrings(f, new Map([["歯状回", "dentate gyrus"]]));
    expect(r.fixes).toEqual([{ code: "QC-03-03", file: "uc.json", where: "/ucs/0/names", before: "歯状回", after: "dentate gyrus" }]);
    expect(parse(r.files.uc).ucs[0].names).toBe("dentate gyrus");
    // a translation that is still not English is not used
    expect(replaceStrings(f, new Map([["歯状回", "歯状回 (DG)"]])).fixes).toEqual([]);
  });
});
