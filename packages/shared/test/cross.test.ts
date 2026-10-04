import { describe, expect, it } from "vitest";
import { checkCross, countRevisions, type ConnRow, type FrgModel, type GnRow, type HcdModel, type UcRoi, type UcRow } from "../src/index.js";

const uc = (id: string, roi: UcRoi = "roi"): UcRow => ({
  id,
  descriptor: "",
  names: id,
  roi,
  sourceOfId: "DHBA",
  transmitter: "",
  modulationType: "",
  comments: "",
  interfaceText: "",
  outputSemantics: "",
  requirement: "",
  reqRealization: "",
  capability: "",
  mechanism: "",
  implementation: "",
});
const conn = (sender: string, receiver: string): ConnRow => ({
  sender,
  receiver,
  comment: "",
  referenceIds: ["[A, 2000]"],
  taxon: "Rat",
  method: "Anterograde tracing",
  pointersOnLiterature: "",
  pointersOnFigure: "Fig. 1",
  senderRelation: "=",
  senderInLiterature: sender,
  receiverRelation: "=",
  receiverInLiterature: receiver,
});
const gn = (id: string, subnodes: string[], itf: string, text = ""): GnRow => ({
  id,
  subnodes,
  comment: "",
  interfaceText: itf,
  requirement: text,
  reqRealization: text,
  capability: "",
  mechanism: "",
});
const hcdOf = (ucs: UcRow[], connections: ConnRow[]): HcdModel => ({ meta: null, refs: [], ucs, collections: [], bif: [], connections });

// the mesolimbic fixture of the worker pipeline test: IN -> NAC <-> VTA, NAC -> OUT
const REWARD_HCD = hcdOf([uc("IN", "input"), uc("VTA"), uc("NAC"), uc("OUT", "output")], [conn("IN", "NAC"), conn("VTA", "NAC"), conn("NAC", "VTA"), conn("NAC", "OUT")]);

describe("checkCross (HCD ↔ FRG consistency)", () => {
  it("finds nothing but the collapse warnings in a consistent two-UC FRG", () => {
    const frg: FrgModel = {
      gns: [
        gn("R.TLF", ["R.Value"], "([U.OUT]) = R.TLF([U.IN])", "[U.IN] [U.OUT] [U.VTA] [U.NAC]"),
        gn("R.Value", ["U.VTA", "U.NAC"], "([U.OUT]) = R.Value([U.IN])", "[U.IN] [U.OUT] [U.VTA] [U.NAC]"),
      ],
    };
    const r = checkCross(REWARD_HCD, frg);
    expect(r.findings.map((f) => f.code)).toEqual(["X8", "X8"]);
    expect(r.stats).toEqual({ roiUcs: 2, gns: 2, interfacesParsed: 2, depth: 2, largeGns: 0, largeGnsOnMotif: 0 });
  });

  it("reports interfaces that disagree with the connections, unserved UCs and untagged ROI inputs", () => {
    const hcd = hcdOf(
      [uc("IN", "input"), uc("IDLE", "input"), uc("CTX"), uc("A"), uc("B"), uc("C"), uc("D"), uc("OUT", "output")],
      [conn("IN", "A"), conn("CTX", "A"), conn("A", "B"), conn("B", "OUT"), conn("C", "D"), conn("D", "OUT"), conn("EXT", "C")],
    );
    hcd.ucs.push(uc("EXT", "output"));
    const frg: FrgModel = {
      gns: [
        gn("R.TLF", ["R.Left", "R.Right", "U.CTX"], "([U.OUT]) = R.TLF([U.IN], [U.EXT])", "[U.IN] [U.EXT] [U.OUT] [U.CTX]"),
        // omits the output OUT, claims an input from D that does not reach A or B
        gn("R.Left", ["U.A", "U.B"], "() = R.Left([U.IN], [U.CTX], [U.D])", "[U.A] [U.B] [U.IN] [U.CTX] [U.D]"),
        // C and D are connected; the text does not mention them
        gn("R.Right", ["U.C", "U.D"], "([U.OUT]) = R.Right([U.EXT])", "[U.EXT] [U.OUT]"),
      ],
    };
    const r = checkCross(hcd, frg);
    const by = (code: string) => r.findings.filter((f) => f.code === code).map((f) => `${f.node}: ${f.message}`);
    expect(by("X1")).toEqual(["R.Left: interface of `R.Left` leaves out output(s) [U.OUT], which its UCs connect to in connections.json"]);
    expect(by("X3")).toEqual(["R.Left: interface of `R.Left` claims input [U.D], but no connection from `D` reaches its UCs ([U.A], [U.B])"]);
    expect(by("X2")).toEqual([
      "R.TLF: [U.EXT] send(s) into the ROI but is not tagged noROI(input)",
      "R.TLF: [U.IDLE] is tagged noROI(input) but no connection from it reaches the ROI",
      "R.TLF: [U.EXT] is tagged noROI(output) but the ROI does not connect to it",
    ]);
    expect(by("X5")).toEqual(["C: [U.C] is not mentioned in the function text of `R.Right`", "D: [U.D] is not mentioned in the function text of `R.Right`"]);
    expect(by("X4")).toEqual([]);
    expect(by("X6")).toEqual([]);
    expect(by("X8")).toEqual([]);
    expect(r.summary).toMatchObject({ X1: 1, X2: 3, X3: 1, X5: 2 });
  });

  it("warns about GN pairs without an ROI-internal path and interface UCs missing from the realization text", () => {
    const hcd = hcdOf([uc("IN", "input"), uc("A"), uc("B"), uc("C"), uc("OUT", "output")], [conn("IN", "A"), conn("IN", "B"), conn("A", "OUT"), conn("B", "OUT"), conn("IN", "C"), conn("C", "OUT")]);
    const frg: FrgModel = {
      gns: [
        gn("R.TLF", ["R.Pair", "U.C"], "([U.OUT]) = R.TLF([U.IN])", "[U.IN] [U.OUT] [U.C]"),
        gn("R.Pair", ["U.A", "U.B"], "([U.OUT]) = R.Pair([U.IN])", "[U.A] [U.B]"),
      ],
    };
    const r = checkCross(hcd, frg);
    expect(r.findings.filter((f) => f.code === "X4").map((f) => f.node)).toEqual(["R.Pair"]);
    // from harness rules 2 the FRG check enforces the connection, so X4 is not recorded
    expect(checkCross(hcd, frg, { harnessRules: 2 }).summary.X4).toBe(0);
    expect(r.findings.filter((f) => f.code === "X6").map((f) => f.message)).toEqual(["requirementRealization of `R.Pair` does not mention [U.IN], [U.OUT] of its interface"]);
    expect(r.findings.filter((f) => f.code === "X8").map((f) => f.message)).toEqual(["the FRG has a single GN under the TLF"]);
  });

  it("counts the GNs of 3-4 UCs that are a loop or feedforward motif of the candidates", () => {
    const hcd = hcdOf([uc("A"), uc("B"), uc("C"), uc("D")], [conn("A", "B"), conn("B", "C"), conn("C", "A"), conn("C", "D"), conn("B", "D")]);
    const frg: FrgModel = {
      gns: [
        gn("R.TLF", ["R.Loop", "R.Chain"], "", ""),
        gn("R.Loop", ["U.A", "U.B", "U.C"], "", ""),
        gn("R.Chain", ["U.A", "U.B", "U.D"], "", ""),
      ],
    };
    expect(checkCross(hcd, frg).stats).toMatchObject({ largeGns: 2, largeGnsOnMotif: 1 });
  });

  it("flags a TLF decomposed directly into UCs and skips interfaces it cannot parse", () => {
    const frg: FrgModel = { gns: [gn("R.TLF", ["U.VTA", "U.NAC"], "not an interface", "[U.VTA] [U.NAC]")] };
    const r = checkCross(REWARD_HCD, frg);
    expect(r.findings.map((f) => f.message)).toEqual(["the TLF `R.TLF` has only UCs as subnodes; decompose it or split its UCs", "the HCD has only 2 ROI-internal UC(s)"]);
    expect(r.stats.interfacesParsed).toBe(0);
    expect(r.stats.depth).toBe(1);
  });
});

describe("checkCross X9 (granularity, record-only)", () => {
  it("flags ROI-internal UCs that are a whole BNA gyrus group or span several units, not areas, parts or external UCs", () => {
    const withDescriptor = (id: string, descriptor: string, roi: UcRoi = "roi") => ({ ...uc(id, roi), descriptor });
    const hcd = hcdOf(
      [
        withDescriptor("IN", "BNAG:MVOcC/side:left", "input"),
        withDescriptor("FuG(left)", "BNAG:FuG/side:left"),
        withDescriptor("IPL(AnG.left)", "BNAG:IPL/part:HOMBA:12136/side:left"),
        withDescriptor("A22c(left)", "BNA:75-76/side:left"),
        withDescriptor("Amyg", "BNA:211-212&BNA:213-214"),
        withDescriptor("OUT", "BNA:9-10/side:left", "output"),
      ],
      [conn("IN", "FuG(left)"), conn("FuG(left)", "IPL(AnG.left)"), conn("IPL(AnG.left)", "A22c(left)"), conn("A22c(left)", "Amyg"), conn("Amyg", "OUT")],
    );
    const frg: FrgModel = { gns: [gn("R.TLF", ["U.FuG(left)", "U.IPL(AnG.left)", "U.A22c(left)", "U.Amyg"], "")] };
    const r = checkCross(hcd, frg);
    expect(r.findings.filter((f) => f.code === "X9").map((f) => f.node)).toEqual(["FuG(left)", "Amyg"]);
    expect(r.summary.X9).toBe(2);
  });
});

describe("countRevisions", () => {
  it("counts the tagged lines of the HCD-FRG revisions section only", () => {
    const log = [
      "# Decision log",
      "## Anchors",
      "- [kept] not in the section",
      "## HCD-FRG revisions",
      "### 2026-09-29 adjustment",
      "- [FRG->HCD] split `IFG(left)` into `A44d(left)` and `A45c(left)` — R.Phonological-Assembly needs a separate output [Friederici, 2011]",
      "* [HCD -> FRG] merged R.A into R.B — no connection supports the split",
      "- [kept] X4 — indirect path via the thalamus",
      "- [instruction] split `FuG(left)` into BNA areas — the follow-up asked for finer ROI UCs [Lerma-Usabiaga, 2018]",
      "- untagged note",
      "## Follow-ups",
      "- [FRG->HCD] after the section",
    ].join("\n");
    expect(countRevisions(log)).toEqual({ section: true, "FRG->HCD": 1, "HCD->FRG": 1, instruction: 1, kept: 1 });
    expect(countRevisions(null)).toEqual({ section: false, "FRG->HCD": 0, "HCD->FRG": 0, instruction: 0, kept: 0 });
  });
});
