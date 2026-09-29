import { describe, expect, it } from "vitest";
import { checkCross, type ConnRow, type FrgModel, type GnRow, type HcdModel, type UcRoi, type UcRow } from "../src/index.js";

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
    expect(r.stats).toEqual({ roiUcs: 2, gns: 2, interfacesParsed: 2, depth: 2 });
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
    expect(r.findings.filter((f) => f.code === "X6").map((f) => f.message)).toEqual(["requirementRealization of `R.Pair` does not mention [U.IN], [U.OUT] of its interface"]);
    expect(r.findings.filter((f) => f.code === "X8").map((f) => f.message)).toEqual(["the FRG has a single GN under the TLF"]);
  });

  it("flags a TLF decomposed directly into UCs and skips interfaces it cannot parse", () => {
    const frg: FrgModel = { gns: [gn("R.TLF", ["U.VTA", "U.NAC"], "not an interface", "[U.VTA] [U.NAC]")] };
    const r = checkCross(REWARD_HCD, frg);
    expect(r.findings.map((f) => f.message)).toEqual(["the TLF `R.TLF` has only UCs as subnodes; decompose it or split its UCs", "the HCD has only 2 ROI-internal UC(s)"]);
    expect(r.stats.interfacesParsed).toBe(0);
    expect(r.stats.depth).toBe(1);
  });
});
