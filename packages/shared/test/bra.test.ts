import { describe, expect, it } from "vitest";
import { DEFAULT_BRA_RULES, normalizeFigurePointer, parseOutputSemantics, pointerProblems, sourceOfIdProblem } from "../src/index.js";

const rules = DEFAULT_BRA_RULES;
const QUOTE = "Dopamine neurons of the ventral tegmental area project densely to the shell of the nucleus accumbens.";

describe("sourceOfIdProblem", () => {
  const p = (descriptor: string, sourceOfId: string, r = rules) => sourceOfIdProblem({ id: "X", descriptor, sourceOfId }, r);

  it("asks for DHBA on a UC that is a whole DHBA term", () => {
    expect(p("HOMBA:12261", "DHBA")).toBeNull();
    expect(p("HOMBA:12261", "[Schultz, 1997]")).toMatch(/whole DHBA term .* write DHBA/);
  });

  it("keeps any Reference ID for a whole BNA area by default and requires [Fan, 2016] only when that policy is chosen", () => {
    expect(p("BNA:223-224", "[Haber, 2010]")).toBeNull();
    expect(p("BNAG:Hipp", "[Haber, 2010]")).toBeNull();
    expect(p("BNA:223-224", "DHBA")).toMatch(/whole BNA area/);
    const fan = { ...rules, bnaSourceOfId: "fan-2016" as const };
    expect(p("BNA:223-224", "[Haber, 2010]", fan)).toMatch(/\[Fan, 2016\]/);
    expect(p("BNA:223-224", "[Fan, 2016]", fan)).toBeNull();
  });

  it("asks a UC finer than its SABRA unit for one defining paper or makeshift", () => {
    expect(p("HOMBA:12261/nt:DA", "[Schultz, 1997]")).toBeNull();
    expect(p("HOMBA:12261/nt:DA", "makeshift")).toBeNull();
    expect(p("HOMBA:12261/nt:DA", "DHBA")).toMatch(/finer than its SABRA unit/);
    expect(p("BNA:223-224&HOMBA:12261", "makeshift")).toBeNull();
  });

  it("rejects values outside the enumeration and empty values", () => {
    expect(p("HOMBA:12261", "BNA")).toMatch(/write one value: DHBA, MBA, UBERON, collection, makeshift or one Reference ID/);
    expect(p("HOMBA:12261", "[A, 2000]; [B, 2001]")).toMatch(/write one value/);
    expect(p("HOMBA:12261", "")).toMatch(/is empty/);
  });
});

describe("pointerProblems", () => {
  const w = "c";
  it("requires one of the two pointers", () => {
    expect(pointerProblems(w, "", "", rules).join("\n")).toMatch(/at least one is required/);
    expect(pointerProblems(w, "", "Fig. 2", rules)).toEqual([]);
    expect(pointerProblems(w, QUOTE, "", rules)).toEqual([]);
  });

  it("rejects page locators and short text instead of a verbatim quote", () => {
    expect(pointerProblems(w, "p.1594", "", rules).join("\n")).toMatch(/page or section locator/);
    expect(pointerProblems(w, "pp. 12-13: dopamine neurons project to the accumbens shell in all animals tested", "", rules).join("\n")).toMatch(/locator/);
    expect(pointerProblems(w, "Introduction: VOR circuit description", "", rules).join("\n")).toMatch(/has 4 words; quote .*at least 10 words/);
  });

  it("uses the configurable minimum number of words", () => {
    expect(pointerProblems(w, "Purkinje cells inhibit the vestibular nuclei.", "", { ...rules, minQuoteWords: 5 })).toEqual([]);
    expect(pointerProblems(w, "Purkinje cells inhibit the vestibular nuclei.", "", rules)).toHaveLength(1);
  });

  it("requires a figure number", () => {
    expect(pointerProblems(w, "", "Results section", rules).join("\n")).toMatch(/not a figure number; write it like "Fig. 3B"/);
  });
});

describe("normalizeFigurePointer", () => {
  it("normalizes the prefix and panel letters and keeps the rest", () => {
    expect(normalizeFigurePointer("Figure 3b")).toBe("Fig. 3B");
    expect(normalizeFigurePointer("fig.3B, 4A")).toBe("Fig. 3B, 4A");
    expect(normalizeFigurePointer("Fig. 2 (retrograde labelling)")).toBe("Fig. 2 (retrograde labelling)");
    expect(normalizeFigurePointer("Figs. 5c-e")).toBe("Fig. 5C-E");
    expect(normalizeFigurePointer("Supplementary Figure S2a")).toBe("Supplementary Fig. S2A");
    expect(normalizeFigurePointer("Extended Data Fig. 1")).toBe("Extended Data Fig. 1");
    expect(normalizeFigurePointer("Figure 3 shows the projection")).toBe("Fig. 3 shows the projection");
    expect(normalizeFigurePointer("Table 2")).toBeNull();
    expect(normalizeFigurePointer("p.12")).toBeNull();
  });
});

describe("parseOutputSemantics", () => {
  it("parses one or more `[ID] content;` items with or without spaces", () => {
    expect(parseOutputSemantics("[VTA]reward prediction error;")).toEqual([{ id: "VTA", text: "reward prediction error" }]);
    expect(parseOutputSemantics("[ U.NAC(shell,DRD1+) ] expected value [Schultz, 1997];")).toEqual([
      { id: "NAC(shell,DRD1+)", text: "expected value [Schultz, 1997]" },
    ]);
    expect(parseOutputSemantics("[A] a; [B] b [X, 2000; Y, 2001];")).toEqual([
      { id: "A", text: "a" },
      { id: "B", text: "b [X, 2000; Y, 2001]" },
    ]);
  });

  it("rejects missing IDs, empty content, a missing `;` and several IDs in one item", () => {
    expect(parseOutputSemantics("reward prediction error")).toBeNull();
    expect(parseOutputSemantics("[VTA];")).toBeNull();
    expect(parseOutputSemantics("[VTA] reward prediction error")).toBeNull();
    expect(parseOutputSemantics("[VTA] error sent to [U.NAC];")).toBeNull();
    expect(parseOutputSemantics("")).toBeNull();
  });
});
