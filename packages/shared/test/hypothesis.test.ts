import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BRA_TEMPLATE_FILE,
  CONNECTION_CLAIMS,
  DEFAULT_HYPOTHESIS_MAX_SHARE,
  HARNESS_RULES,
  HARNESS_SCHEMAS,
  HYPOTHESES_FILE,
  HYPOTHESES_SCHEMA,
  HYPOTHESIS_CLAIMS,
  HYPOTHESIS_MAX_SHARES,
  HYPOTHESIS_PATH_SENTENCE,
  NO_EVIDENCE_PATH_SENTENCE,
  PROJECT_FILES,
  UC_CLAIMS,
  buildCsvs,
  buildGraphs,
  checkCitations,
  buildHypothesesFile,
  buildTemplateXlsx,
  checkCross,
  checkFrg,
  checkHcd,
  describeScope,
  elementLabel,
  evidencePaths,
  evidenceSettingsOf,
  frgGnUcsFromJson,
  frgNodeUcs,
  gnHypothesisDependencies,
  hypothesisCommentLine,
  hypothesisKeySchema,
  hypothesisProblems,
  hypothesisRecords,
  hypothesisShare,
  isHypothesisMode,
  maxHypotheses,
  normalizeMaxShare,
  normalizeScopes,
  parseCsv,
  parseCsvObjects,
  parseHypothesis,
  readTemplateSheet,
  researchCandidateStatuses,
  scopeTargetCovers,
  shareExceeded,
  validateJsonSchema,
  withHypothesisLine,
  type ConnRow,
  type CsvFileName,
  type EvidenceOptions,
  type FrgModel,
  type HcdInputs,
  type HcdModel,
  type Hypothesis,
  type HypothesisClaim,
  type HypothesisScope,
  type HypothesisScopeTarget,
  type UcRow,
} from "../src/index.js";

// --- fixture: a hypothesis-mode project (harness rules 2), valid with scope S1 (every claim, whole HCD) and limit 50% ---
//
// UCs (uc.json order): VN (input), GC(granule) [H1 role], PC(purkinje), IO [H2 transmitter], GoC(golgi) [H3 population,
// makeshift], FTN (output); Collection Cb = GC(granule), PC(purkinje), GoC(golgi).
// Connections: VN->GC(granule), VN->IO [H4 direction], VN->GoC(golgi), GC(granule)->PC(purkinje), IO->PC(purkinje),
// GoC(golgi)->GC(granule) [H5 existence, Hypothetical], PC(purkinje)->FTN.
// GNs: R.VOR-Adaptation (TLF) -> R.Context {GC, PC}, R.Learning {IO, PC}, R.Gain-Control {GoC, GC} (connected only by H5).

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "fixtures", "hypothesis");
const read = (f: string) => readFileSync(join(FIXTURES, f), "utf8");
const PROJECT_TEMPLATE = readFileSync(join(here, "../../../prompts/Project.csv"), "utf8");
const XLSX_TEMPLATE = readFileSync(join(here, "../../../prompts/templates", BRA_TEMPLATE_FILE));

type Item = Record<string, unknown> & { hypothesis?: Record<string, unknown> };
interface UcFile {
  ucs: Item[];
  collections: Item[];
}
interface ConnFile {
  bif: Item[];
  connections: Item[];
}
interface RefFile {
  references: Item[];
}

const META = read("meta.json");
const LOG = read("decision_log.md");
const REPORT = read("report.md");
const REFS: RefFile = JSON.parse(read("references.json"));
const UC: UcFile = JSON.parse(read("uc.json"));
const CONN: ConnFile = JSON.parse(read("connections.json"));
const FRG_TEXT = read("frg.json");
const j = (v: unknown) => JSON.stringify(v, null, 2);

const scope = (id: string, claims: readonly HypothesisClaim[], target: HypothesisScopeTarget = { kind: "all" }): HypothesisScope => ({
  id,
  claims: [...claims],
  target,
  jobId: "job-1",
  createdAt: "2026-10-01T00:00:00.000Z",
});
const items = (circuitIds: string[], gnIds: string[] = []): HypothesisScopeTarget => ({ kind: "items", circuitIds, gnIds });
const S1 = scope("S1", HYPOTHESIS_CLAIMS);
const EVIDENCE: EvidenceOptions = { mode: "hypothesis", scopes: [S1], maxShare: 0.5 };
const ev = (o: Partial<EvidenceOptions> = {}): EvidenceOptions => ({ ...EVIDENCE, ...o });

interface Mutation {
  uc?: (u: UcFile) => void;
  conn?: (c: ConnFile) => void;
  refs?: (r: RefFile) => void;
  report?: string | null;
}

/** The fixture's HCD inputs after one mutation of copies of its files. */
function filesWith(m: Mutation = {}): HcdInputs {
  const uc = structuredClone(UC);
  const conn = structuredClone(CONN);
  const refs = structuredClone(REFS);
  m.uc?.(uc);
  m.conn?.(conn);
  m.refs?.(refs);
  return { meta: META, decisionLog: LOG, report: m.report === undefined ? REPORT : m.report, references: j(refs), uc: j(uc), connections: j(conn) };
}
/** `evidence` null: no evidence option at all (a project without an evidence mode) */
const hcdOpts = (evidence: EvidenceOptions | null) => ({ harnessRules: HARNESS_RULES, ...(evidence ? { evidence } : {}) });
const checkWith = (m: Mutation = {}, evidence: EvidenceOptions | null = EVIDENCE) => checkHcd(filesWith(m), hcdOpts(evidence));
const errorsWith = (m: Mutation = {}, evidence: EvidenceOptions | null = EVIDENCE) => checkWith(m, evidence).errors;

const ucOf = (u: UcFile, id: string) => u.ucs.find((x) => x.circuitId === id)!;
const hOf = (u: UcFile, id: string) => ucOf(u, id).hypothesis!;
const connOf = (c: ConnFile, sender: string, receiver: string) => c.connections.find((x) => x.sender === sender && x.receiver === receiver)!;
const chOf = (c: ConnFile, sender: string, receiver: string) => connOf(c, sender, receiver).hypothesis!;

/** A regular expression matching `s` literally. */
const lit = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
/** Exactly these errors, one per pattern, in order. */
const expectOnly = (errors: string[], ...patterns: RegExp[]) => expect(errors).toEqual(patterns.map((p) => expect.stringMatching(p)));

/** A direction hypothesis whose premise is the record's own paper. */
const directionHypothesis = (ref: string) => ({
  claims: ["direction"],
  basis: "indirect",
  rationale: `The two regions are co-activated ${ref}; no paper found states which of them drives the other.`,
  premises: [ref],
  scope: "S1",
});
/** report.md with rows for further worker IDs in the `## Hypotheses` table. */
const withRows = (ids: string[], report = REPORT) =>
  report.replace("\n\nHypothesis connections:", `\n${ids.map((id) => `| ${id} | added element | direction | indirect | [Ito, 1982] | added |`).join("\n")}\n\nHypothesis connections:`);
const withoutRow = (id: string, report = REPORT) => report.replace(new RegExp(`^\\| ${id} \\|.*\\n`, "m"), "");
const LIMITATION = "Laterality of the vestibular input is simplified.";

const stripHypotheses = (m: Mutation = {}): Mutation => ({
  ...m,
  uc: (u) => {
    for (const x of u.ucs) delete x.hypothesis;
    m.uc?.(u);
  },
  conn: (c) => {
    for (const x of c.connections) delete x.hypothesis;
    m.conn?.(c);
  },
});

const modelOf = (m: Mutation = {}, evidence: EvidenceOptions | null = EVIDENCE) => {
  const r = checkWith(m, evidence);
  expect(r.fatal).toBe(false);
  return r.model!;
};
const frgOf = (hcd: HcdModel, frg = FRG_TEXT): FrgModel => checkFrg({ report: REPORT, frg }, hcd, { harnessRules: HARNESS_RULES }).model!;
const CSV_OPTS = { projectId: "HYP", contributor: "Tester", projectTemplate: PROJECT_TEMPLATE };
const csvsOf = (hcd: HcdModel, frg: FrgModel = frgOf(hcd)) => {
  const r = buildCsvs(hcd, frg, CSV_OPTS);
  expect(r.errors).toEqual([]);
  return r.files!;
};
const hasKey = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// --- the valid fixture ----------------------------------------------------------------------------------------------

describe("hypothesis-mode fixture", () => {
  it("has data files that conform to the harness schemas, hypothesis keys included", () => {
    expect(validateJsonSchema(HARNESS_SCHEMAS["meta.json"], JSON.parse(META))).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["references.json"], REFS)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["uc.json"], UC)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["connections.json"], CONN)).toEqual([]);
    expect(validateJsonSchema(HARNESS_SCHEMAS["frg.json"], JSON.parse(FRG_TEXT))).toEqual([]);
  });

  it("passes checkHcd (harness rules 2, scope S1, limit 50%) and checkFrg without errors or warnings", () => {
    const r = checkWith();
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.fatal).toBe(false);
    const m = r.model!;
    expect(m.ucs.filter((u) => u.hypothesis).map((u) => [u.id, u.hypothesis!.claims])).toEqual([
      ["GC(granule)", ["role"]],
      ["IO", ["transmitter"]],
      ["GoC(golgi)", ["population"]],
    ]);
    expect(m.connections.filter((c) => c.hypothesis).map((c) => [c.sender, c.receiver, c.hypothesis!.claims])).toEqual([
      ["VN", "IO", ["direction"]],
      ["GoC(golgi)", "GC(granule)", ["existence"]],
    ]);
    expect(m.collections.map((c) => c.id)).toEqual(["Cb"]);
    const frg = checkFrg({ report: REPORT, frg: FRG_TEXT }, m, { harnessRules: HARNESS_RULES });
    expect(frg.errors).toEqual([]);
    expect(frg.fatal).toBe(false);
  });

  it("reads the hypothesis key into the model trimmed, with researchCandidate only when given", () => {
    const m = modelOf({
      uc: (u) => Object.assign(hOf(u, "IO"), { basis: " homology ", premises: [" [Lisberger, 1994] "], rationale: "  Olivary neurons are glutamatergic [Lisberger, 1994].  " }),
    });
    expect(m.ucs.find((u) => u.id === "IO")!.hypothesis).toEqual({
      claims: ["transmitter"],
      basis: "homology",
      rationale: "Olivary neurons are glutamatergic [Lisberger, 1994].",
      premises: ["[Lisberger, 1994]"],
      scope: "S1",
    });
    expect(parseHypothesis({ claims: ["role"], basis: "model", rationale: "r", premises: ["[A, 2000]"], scope: "S1", researchCandidate: " C3 " })).toEqual({
      claims: ["role"],
      basis: "model",
      rationale: "r",
      premises: ["[A, 2000]"],
      scope: "S1",
      researchCandidate: "C3",
    });
    for (const v of [null, undefined, "x", 3, ["a"]]) expect(parseHypothesis(v)).toBeNull();
    expect(parseHypothesis({})).toEqual({ claims: [], basis: "", rationale: "", premises: [], scope: "" });
  });
});

// --- strict projects ------------------------------------------------------------------------------------------------

describe("strict projects reject the hypothesis key", () => {
  const UC_STRICT = lit(
    "uc.json: 3 UC(s) have a hypothesis (`GC(granule)`, `IO`, `GoC(golgi)`), but this project does not allow hypotheses (it uses literature-supported evidence only). Remove the hypothesis key",
  );
  const CONN_STRICT = lit("connections.json: 2 connection(s) have a hypothesis (`VN` -> `IO`, `GoC(golgi)` -> `GC(granule)`), but this project does not allow hypotheses");

  it("without an evidence mode: one message per file, and nothing else", () => {
    const errors = errorsWith({}, null);
    expectOnly(errors, UC_STRICT, CONN_STRICT);
    expect(errors[0]).toMatch(/A request in an instruction's text does not allow hypotheses; .*"Allow hypotheses" switched on\./);
  });

  it("with evidence mode strict: the same messages", () => {
    expect(errorsWith({}, { mode: "strict", scopes: [S1], maxShare: 0.5 })).toEqual(errorsWith({}, null));
    expect(errorsWith({}, evidenceSettingsOf({ evidenceMode: "strict", hypothesisScopes: [S1] }))).toEqual(errorsWith({}, null));
  });

  it("names only the file that has a hypothesis key, and rejects an explicit null too", () => {
    expectOnly(errorsWith({ conn: (c) => c.connections.forEach((x) => delete x.hypothesis) }, null), UC_STRICT);
    const onlyNull = errorsWith(stripHypotheses({ conn: (c) => (connOf(c, "VN", "IO").hypothesis = null as never) }), null);
    expect(onlyNull).toContainEqual(expect.stringMatching(lit("connections.json: 1 connection(s) have a hypothesis (`VN` -> `IO`)")));
    expect(onlyNull).toContainEqual(expect.stringMatching(lit("connections.json: /connections/1/hypothesis must be object (got null)")));
  });

  it("does not check the hypothesis rules there: a stripped copy with a Hypothetical method passes", () => {
    expect(errorsWith(stripHypotheses(), null)).toEqual([]);
  });
});

// --- field problems -------------------------------------------------------------------------------------------------

describe("hypothesis fields (schema)", () => {
  it("rejects empty claims", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "GC(granule)").claims = []) }), lit("uc.json: /ucs/1/hypothesis/claims needs at least 1 item(s) (see schemas/uc.schema.json)."));
  });

  it("rejects a claim of the other element kind", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").claims = ["existence"]) }), lit('uc.json: /ucs/3/hypothesis/claims/0 must be one of "population", "transmitter", "modulation", "role"'));
    expectOnly(errorsWith({ conn: (c) => (chOf(c, "VN", "IO").claims = ["role"]) }), lit('connections.json: /connections/1/hypothesis/claims/0 must be one of "existence", "direction", "sign"'));
  });

  it("rejects an unknown basis", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").basis = "guess") }), lit('uc.json: /ucs/3/hypothesis/basis must be one of "published", "homology", "analogy", "indirect", "model", "functional-need"'));
  });

  it("rejects an empty or blank rationale, once", () => {
    const blank = lit(
      "connections.json: `VN` -> `IO` ([Lisberger, 1994]): hypothesis rationale is empty; write why the premises support the hypothesis and what was searched without finding direct evidence, with [Author, Year] citations.",
    );
    expectOnly(errorsWith({ conn: (c) => (chOf(c, "VN", "IO").rationale = "") }), blank);
    expectOnly(errorsWith({ conn: (c) => (chOf(c, "VN", "IO").rationale = " \n ") }), blank);
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").rationale = "   ") }), lit("uc.json: `IO`: hypothesis rationale is empty"));
  });

  it("rejects a hypothesis without premises (UC and connection)", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").premises = []) }), lit("uc.json: /ucs/3/hypothesis/premises needs at least 1 item(s)"));
    expectOnly(errorsWith({ conn: (c) => (chOf(c, "GoC(golgi)", "GC(granule)").premises = []) }), lit("connections.json: /connections/5/hypothesis/premises needs at least 1 item(s)"));
  });

  it("rejects a malformed scope ID (and says which scope covers the element)", () => {
    expectOnly(
      errorsWith({ uc: (u) => (hOf(u, "IO").scope = "X1") }),
      lit('uc.json: /ucs/3/hypothesis/scope ("X1") must match ^S[1-9][0-9]*$'),
      lit("uc.json: `IO`: hypothesis scope X1 is not a scope of this project; S1 covers it, so write scope S1."),
    );
    expectOnly(
      errorsWith({ uc: (u) => delete hOf(u, "IO").scope }),
      lit("uc.json: /ucs/3/hypothesis/scope is required"),
      lit('uc.json: `IO`: hypothesis scope "" is not a scope of this project; S1 covers it, so write scope S1.'),
    );
  });

  it("keeps additionalProperties false inside the key", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").confidence = "high") }), lit("uc.json: /ucs/3/hypothesis/confidence is not allowed"));
  });

  it("has claim lists per element kind in hypothesisKeySchema", () => {
    expect(hypothesisKeySchema("connection").properties!.claims.items!.enum).toEqual(CONNECTION_CLAIMS);
    expect(hypothesisKeySchema("UC").properties!.claims.items!.enum).toEqual(UC_CLAIMS);
    expect(hypothesisKeySchema("UC").required).toEqual(["claims", "basis", "rationale", "premises", "scope"]);
    expect(HARNESS_SCHEMAS["uc.json"].properties!.ucs.items!.additionalProperties).toBe(false);
    expect(HARNESS_SCHEMAS["connections.json"].properties!.connections.items!.additionalProperties).toBe(false);
  });
});

describe("hypothesis fields (code checks)", () => {
  it("rejects duplicate claims", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "GC(granule)").claims = ["role", "role"]) }), lit("uc.json: `GC(granule)`: hypothesis claims list role more than once; give each claim once."));
  });

  it("rejects duplicate premises", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").premises = ["[Lisberger, 1994]", "[Lisberger, 1994]"]) }), lit("uc.json: `IO`: hypothesis premises list [Lisberger, 1994] more than once."));
  });

  it("rejects a premise that is not in references.json", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").premises as string[]).push("[Nobody, 2000]") }), lit("uc.json: `IO`: hypothesis premise [Nobody, 2000] is not in references.json"));
  });

  it("rejects a premise without DOI or PMID, and accepts one with a PMID only", () => {
    const marr = { uc: (u: UcFile) => (hOf(u, "IO").premises as string[]).push("[Marr, 1969]") };
    expectOnly(errorsWith(marr), lit("uc.json: `IO`: hypothesis premise [Marr, 1969] has no DOI or PMID, so it cannot be verified"));
    // [Lisberger, 1994] (the fixture's premise of H2 and H4) has DOI N/A and a PMID
    expect(errorsWith({ ...marr, refs: (r) => (r.references[3].pmid = "5784122") })).toEqual([]);
  });

  it("requires the first premise of a connection to be its referenceIds[0]", () => {
    expectOnly(
      errorsWith({ conn: (c) => (chOf(c, "VN", "IO").premises = ["[Ito, 1982]", "[Lisberger, 1994]"]) }),
      lit("connections.json: `VN` -> `IO` ([Lisberger, 1994]): the first hypothesis premise ([Ito, 1982]) must be the paper of this record (referenceIds [Lisberger, 1994])"),
    );
    expect(errorsWith({ conn: (c) => (chOf(c, "VN", "IO").premises = ["[Lisberger, 1994]", "[Ito, 1982]"]) })).toEqual([]);
  });
});

// --- claims and the element -----------------------------------------------------------------------------------------

describe("claims against the element", () => {
  it("requires measurementMethod Hypothetical for an existence hypothesis", () => {
    expectOnly(
      errorsWith({ conn: (c) => (connOf(c, "GoC(golgi)", "GC(granule)").measurementMethod = "Axonal tracing") }),
      lit("connections.json: `GoC(golgi)` -> `GC(granule)` ([Eccles, 1967]): an existence hypothesis has measurementMethod Hypothetical"),
    );
  });

  it("keeps Hypothetical for existence hypotheses: not on a direction hypothesis, not without a hypothesis", () => {
    expectOnly(
      errorsWith({ conn: (c) => (connOf(c, "VN", "IO").measurementMethod = "Hypothetical") }),
      lit("connections.json: `VN` -> `IO` ([Lisberger, 1994]): measurementMethod Hypothetical is only for an existence hypothesis; a direction hypothesis keeps the method of the paper's evidence."),
    );
    expectOnly(
      errorsWith({ conn: (c) => (connOf(c, "VN", "GC(granule)").measurementMethod = "Hypothetical") }),
      lit("connections.json: `VN` -> `GC(granule)` ([Ito, 1982]): measurementMethod Hypothetical marks an existence hypothesis; add the hypothesis key with the claim existence"),
    );
  });

  it("requires sourceOfId makeshift for a population hypothesis", () => {
    expectOnly(
      errorsWith({ uc: (u) => (ucOf(u, "GoC(golgi)").sourceOfId = "[Eccles, 1967]") }),
      lit("uc.json: `GoC(golgi)`: a population hypothesis means no paper defines the population: set sourceOfId to makeshift"),
    );
  });

  it("rejects a population hypothesis on a whole SABRA unit (anchor only)", () => {
    expectOnly(
      errorsWith({ uc: (u) => (hOf(u, "IO").claims = ["population"]) }),
      lit("uc.json: `IO`: a population hypothesis is for a population finer than its SABRA unit (a UC with facets); `IO` is a whole SABRA unit, which the atlas defines."),
    );
  });

  it("requires the estimated transmitter / modulationType for those claims", () => {
    expectOnly(errorsWith({ uc: (u) => (ucOf(u, "IO").transmitter = "") }), lit("uc.json: `IO`: a transmitter hypothesis needs the estimated transmitter in transmitter"));
    expectOnly(
      errorsWith({
        uc: (u) => {
          hOf(u, "IO").claims = ["modulation"];
          ucOf(u, "IO").modulationType = "";
        },
      }),
      lit("uc.json: `IO`: a modulation hypothesis needs the estimated modulationType (Excitatory, Inhibitory or Modulatory)."),
    );
    expect(errorsWith({ uc: (u) => (hOf(u, "IO").claims = ["modulation"]) })).toEqual([]);
  });

  it("rejects an existence hypothesis on a pair that already has evidence", () => {
    const evidence = { ...structuredClone(connOf(CONN, "VN", "GoC(golgi)")), sender: "GoC(golgi)", receiver: "GC(granule)", pointersOnLiterature: "Golgi cell axons are reported to end on granule cell dendrites within the glomeruli of the flocculus." };
    expectOnly(
      errorsWith({ conn: (c) => c.connections.push(evidence) }),
      lit("connections.json: `GoC(golgi)` -> `GC(granule)` ([Eccles, 1967]): an existence hypothesis, but the same sender -> receiver already has evidence ([Ito, 1982]); the projection is supported, so remove this hypothetical record."),
    );
  });

  it("counts a direction-hypothesis record on the same pair as evidence of the projection", () => {
    const m = modelOf();
    const ex = m.connections.find((c) => c.hypothesis?.claims.includes("existence"))!;
    const directed: ConnRow = { ...structuredClone(ex), referenceIds: ["[Ito, 1982]"], method: "Axonal tracing", hypothesis: { ...ex.hypothesis!, claims: ["direction"], premises: ["[Ito, 1982]"] } };
    const errors = hypothesisProblems({ ...m, connections: [...m.connections, directed], report: null }, EVIDENCE);
    expect(errors).toEqual([expect.stringMatching(lit("an existence hypothesis, but the same sender -> receiver already has evidence ([Ito, 1982])"))]);
  });

  it("accepts one existence hypothesis per sender -> receiver (further premises go into it)", () => {
    const m = modelOf();
    const ex = m.connections.find((c) => c.hypothesis?.claims.includes("existence"))!;
    const second: ConnRow = { ...structuredClone(ex), referenceIds: ["[Ito, 1982]"], hypothesis: { ...ex.hypothesis!, premises: ["[Ito, 1982]"] } };
    const errors = hypothesisProblems({ ...m, connections: [...m.connections, second], report: null }, EVIDENCE);
    expect(errors).toEqual([
      expect.stringMatching(lit(`(${"[Ito, 1982]"}): a second existence hypothesis for the same sender -> receiver (the first cites [Eccles, 1967]); keep one hypothetical record`)),
    ]);
  });

  it("does not count a record of the reverse direction as evidence", () => {
    const reverse = { ...structuredClone(connOf(CONN, "VN", "GoC(golgi)")), sender: "GC(granule)", receiver: "GoC(golgi)", comment: "parallel fibres", pointersOnLiterature: "Parallel fibres of the granule cells also excite the dendrites of Golgi cells in the molecular layer." };
    const errors = errorsWith({
      conn: (c) => c.connections.push(reverse),
      uc: (u) => {
        ucOf(u, "GC(granule)").interface = "([U.PC(purkinje)], [U.GoC(golgi)]) = GC(granule)([U.VN], [U.GoC(golgi)])";
        ucOf(u, "GoC(golgi)").interface = "([U.GC(granule)]) = GoC(golgi)([U.VN], [U.GC(granule)])";
      },
    });
    expect(errors).toEqual([]);
  });
});

// --- scopes ---------------------------------------------------------------------------------------------------------

describe("hypothesis scopes", () => {
  const ALL = "existence, direction, sign, population, transmitter, modulation, role";
  const outside = (where: string, claims: string, scopes: string) => lit(`${where}: hypothesis (${claims}) is outside every hypothesis scope of this project (${scopes}). Remove the hypothesis`);

  it("rejects a claim that no scope allows", () => {
    const noRole = scope("S1", HYPOTHESIS_CLAIMS.filter((c) => c !== "role"));
    expectOnly(
      errorsWith({}, ev({ scopes: [noRole] })),
      lit("uc.json: `GC(granule)`: hypothesis (role) is outside every hypothesis scope of this project (S1: existence, direction, sign, population, transmitter, modulation on the whole HCD); no scope allows role. Remove the hypothesis"),
    );
  });

  it("rejects every hypothesis without a scope", () => {
    const errors = errorsWith({}, ev({ scopes: [] }));
    expect(errors).toHaveLength(5);
    expect(errors[0]).toMatch(lit("uc.json: `GC(granule)`: hypothesis (role) is outside every hypothesis scope of this project (none); no scope allows role."));
  });

  it("covers an element when a connection end is a target circuit (items target)", () => {
    // VN is the sender of every connection but GoC(golgi) -> GC(granule)
    expectOnly(
      errorsWith({}, ev({ scopes: [scope("S1", HYPOTHESIS_CLAIMS, items(["VN"]))] })),
      outside("connections.json: `GoC(golgi)` -> `GC(granule)` ([Eccles, 1967])", "existence", `S1: ${ALL} on circuits \`VN\``),
    );
  });

  it("expands a Collection target into its UCs", () => {
    // Cb = GC(granule), PC(purkinje), GoC(golgi): IO is covered through IO -> PC(purkinje), VN -> IO is not
    const errors = errorsWith({}, ev({ scopes: [scope("S1", HYPOTHESIS_CLAIMS, items(["Cb"]))] }));
    expectOnly(errors, outside("connections.json: `VN` -> `IO` ([Lisberger, 1994])", "direction", `S1: ${ALL} on circuits \`Cb\``));
    expect(errorsWith({}, ev({ scopes: normalizeScopes([{ id: "S1", claims: HYPOTHESIS_CLAIMS, target: { kind: "items", circuitIds: ["`U.Cb`"] } }]) }))).toEqual(errors);
  });

  it("covers the UCs of target GNs (all levels) through gnUcs from frg.json", () => {
    const gnUcs = frgGnUcsFromJson(FRG_TEXT);
    // R.Context = GC(granule), PC(purkinje)
    expectOnly(
      errorsWith({}, ev({ scopes: [scope("S1", HYPOTHESIS_CLAIMS, items([], ["R.Context"]))], gnUcs })),
      outside("connections.json: `VN` -> `IO` ([Lisberger, 1994])", "direction", `S1: ${ALL} on FRG GNs \`R.Context\` (their UCs)`),
    );
    // the TLF has only GNs as subnodes: its UCs are those of its child GNs
    expect(errorsWith({}, ev({ scopes: [scope("S1", HYPOTHESIS_CLAIMS, items([], ["R.VOR-Adaptation"]))], gnUcs }))).toEqual([]);
    // without the FRG a GN target covers nothing
    expect(errorsWith({}, ev({ scopes: [scope("S1", HYPOTHESIS_CLAIMS, items([], ["R.VOR-Adaptation"]))] }))).toHaveLength(5);
  });

  it("asks for the scope that covers the element when the hypothesis names an unknown one", () => {
    expectOnly(errorsWith({ uc: (u) => (hOf(u, "IO").scope = "S9") }), lit("uc.json: `IO`: hypothesis scope S9 is not a scope of this project; S1 covers it, so write scope S1."));
  });

  it("asks for the scope that covers the element when the named scope does not", () => {
    const scopes = [S1, scope("S2", ["existence"], items(["VN"]))];
    expectOnly(
      errorsWith({ conn: (c) => (chOf(c, "GoC(golgi)", "GC(granule)").scope = "S2") }, ev({ scopes })),
      lit("connections.json: `GoC(golgi)` -> `GC(granule)` ([Eccles, 1967]): hypothesis scope S2 does not cover it; S1 covers it, so write scope S1."),
    );
  });

  it("accepts hypotheses split over several scopes when each names its own", () => {
    const scopes = [scope("S1", ["population", "transmitter", "role"]), scope("S2", ["existence", "direction"], items(["IO", "GC(granule)"]))];
    expectOnly(
      errorsWith({}, ev({ scopes })),
      lit("connections.json: `VN` -> `IO` ([Lisberger, 1994]): hypothesis scope S1 does not cover it; S2 covers it, so write scope S2."),
      lit("connections.json: `GoC(golgi)` -> `GC(granule)` ([Eccles, 1967]): hypothesis scope S1 does not cover it; S2 covers it, so write scope S2."),
    );
    const s2 = (c: ConnFile) => {
      chOf(c, "VN", "IO").scope = "S2";
      chOf(c, "GoC(golgi)", "GC(granule)").scope = "S2";
    };
    expect(errorsWith({ conn: s2 }, ev({ scopes }))).toEqual([]);
  });

  it("scopeTargetCovers: connection ends, UC neighbours, nested Collections, GNs", () => {
    const hcd = {
      collections: [
        { id: "Cb", descriptor: "", names: "", sourceOfId: "collection", subCircuits: ["GC", "PC"], comments: "" },
        { id: "Floc", descriptor: "", names: "", sourceOfId: "collection", subCircuits: ["Cb", "IO"], comments: "" },
        { id: "Loop", descriptor: "", names: "", sourceOfId: "collection", subCircuits: ["Loop", "Floc"], comments: "" },
      ],
      connections: [
        { sender: "VN", receiver: "GC" },
        { sender: "VN", receiver: "IO" },
        { sender: "IO", receiver: "PC" },
        { sender: "PC", receiver: "FTN" },
      ],
    };
    const covers = (target: HypothesisScopeTarget, el: Parameters<typeof scopeTargetCovers>[1], gnUcs?: Map<string, string[]>) => scopeTargetCovers(scope("S1", ["role"], target), el, hcd, gnUcs);
    expect(covers({ kind: "all" }, { kind: "uc", id: "anything" })).toBe(true);
    expect(covers(items(["IO"]), { kind: "connection", sender: "VN", receiver: "IO" })).toBe(true);
    expect(covers(items(["IO"]), { kind: "connection", sender: "PC", receiver: "FTN" })).toBe(false);
    expect(covers(items(["IO"]), { kind: "uc", id: "PC" })).toBe(true);
    expect(covers(items(["IO"]), { kind: "uc", id: "FTN" })).toBe(false);
    expect(covers(items(["Floc"]), { kind: "uc", id: "GC" })).toBe(true);
    expect(covers(items(["Floc"]), { kind: "connection", sender: "PC", receiver: "FTN" })).toBe(true);
    expect(covers(items(["Loop"]), { kind: "uc", id: "GC" })).toBe(true);
    expect(covers(items([], ["R.X"]), { kind: "uc", id: "FTN" }, new Map([["R.X", ["U.PC"]]]))).toBe(true);
    expect(covers(items([], ["R.X"]), { kind: "uc", id: "FTN" })).toBe(false);
    expect(covers(items([]), { kind: "uc", id: "GC" })).toBe(false);
  });
});

// --- research mode --------------------------------------------------------------------------------------------------

describe("research mode", () => {
  const RESEARCH = j({
    candidates: [
      { id: "C1", status: "not_found" },
      { id: "C2", status: "weak" },
      { id: "C3", status: "not_found" },
      { id: "C4", status: "weak" },
      { id: "C5", status: "not_found" },
      { id: "C6", status: "contradicted" },
      { id: "C7", status: "supported" },
      { id: "C8", status: "pending" },
    ],
  });
  const research = ev({ researchMode: true, researchCandidates: researchCandidateStatuses(RESEARCH) });
  /** Every hypothesis points to its candidate (H1 -> C1 … H5 -> C5), then `m` applies. */
  const withCandidates = (m: Mutation = {}): Mutation => ({
    ...m,
    uc: (u) => {
      hOf(u, "GC(granule)").researchCandidate = "C1";
      hOf(u, "IO").researchCandidate = "C2";
      hOf(u, "GoC(golgi)").researchCandidate = "C3";
      m.uc?.(u);
    },
    conn: (c) => {
      chOf(c, "VN", "IO").researchCandidate = "C4";
      chOf(c, "GoC(golgi)", "GC(granule)").researchCandidate = "C5";
      m.conn?.(c);
    },
  });
  const ioCandidate = (id: string | undefined) => withCandidates({ uc: (u) => (id === undefined ? delete hOf(u, "IO").researchCandidate : (hOf(u, "IO").researchCandidate = id)) });

  it("accepts candidates with status not_found or weak, and records them", () => {
    expect(errorsWith(withCandidates(), research)).toEqual([]);
    expect(hypothesisRecords(modelOf(withCandidates(), research)).map((r) => r.researchCandidate)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });

  it("requires researchCandidate", () => {
    expectOnly(errorsWith(ioCandidate(undefined), research), lit("uc.json: `IO`: researchCandidate is required in research mode: search the literature first"));
  });

  it("rejects an unknown candidate (also when research.json is missing)", () => {
    expectOnly(errorsWith(ioCandidate("C99"), research), lit("uc.json: `IO`: researchCandidate C99 is not a candidate in research.json"));
    const missing = errorsWith(withCandidates(), ev({ researchMode: true, researchCandidates: null }));
    expect(missing).toHaveLength(5);
    expect(missing.every((e) => / is not a candidate in research\.json/.test(e))).toBe(true);
  });

  it("rejects contradicted and supported candidates", () => {
    expectOnly(errorsWith(ioCandidate("C6"), research), lit("uc.json: `IO`: researchCandidate C6 is contradicted in research.json: the literature contradicts this claim"));
    expectOnly(errorsWith(ioCandidate("C7"), research), lit("uc.json: `IO`: researchCandidate C7 is supported in research.json: the survey found direct evidence"));
  });

  it("rejects a candidate with another status", () => {
    expectOnly(errorsWith(ioCandidate("C8"), research), lit('uc.json: `IO`: researchCandidate C8 has status "pending" in research.json; a hypothesis points to a candidate with status not_found or weak.'));
  });

  it("rejects researchCandidate outside research mode", () => {
    expectOnly(
      errorsWith({ uc: (u) => (hOf(u, "GC(granule)").researchCandidate = "C1") }),
      lit("uc.json: `GC(granule)`: researchCandidate C1 is only for research mode, and this project has no research survey"),
    );
  });

  it("reads research.json leniently", () => {
    expect(researchCandidateStatuses(RESEARCH).get("C2")).toBe("weak");
    for (const t of [null, undefined, "", "  ", "not json", "[]", j({ candidates: "x" })]) expect(researchCandidateStatuses(t).size).toBe(0);
    expect([...researchCandidateStatuses(j({ candidates: [{ id: " C1 " }, { status: "weak" }, null, { id: "C2", status: " weak " }] }))]).toEqual([
      ["C1", ""],
      ["C2", "weak"],
    ]);
  });
});

// --- share ----------------------------------------------------------------------------------------------------------

describe("hypothesis share", () => {
  const CONN_SHARE = (count: number, total: number, _pct: number, limit: number, most: number) => lit(`Hypotheses make up ${count} of ${total} connections, more than the ${most} this project's limit of ${limit}% allows.`);
  const UC_SHARE = (count: number, total: number, _pct: number, limit: number, most: number) => lit(`Hypotheses make up ${count} of ${total} UCs, more than the ${most} this project's limit of ${limit}% allows.`);

  it("counts the fixture: 2 of 7 connections, 3 of 6 UCs (the Collection is not counted); exactly at the limit passes", () => {
    const share = hypothesisShare(modelOf(), 0.5);
    expect(share).toEqual({ connections: { count: 2, total: 7, ratio: 2 / 7, limit: 0.5 }, ucs: { count: 3, total: 6, ratio: 0.5, limit: 0.5 } });
    expect(shareExceeded(share.ucs)).toBe(false);
    expect(shareExceeded({ ...share.ucs, count: 4 })).toBe(true);
    expect(errorsWith()).toEqual([]);
  });

  it("reports the UC share alone when only it is above the limit", () => {
    expectOnly(errorsWith({}, ev({ maxShare: 0.3 })), UC_SHARE(3, 6, 50, 30, 1));
  });

  it("reports the connection share alone when only it is above the limit", () => {
    const m: Mutation = {
      conn: (c) => {
        connOf(c, "VN", "GoC(golgi)").hypothesis = directionHypothesis("[Ito, 1982]");
        connOf(c, "IO", "PC(purkinje)").hypothesis = directionHypothesis("[Lisberger, 1994]");
      },
      report: withRows(["H6", "H7"]),
    };
    expectOnly(errorsWith(m), CONN_SHARE(4, 7, 57, 50, 3));
  });

  it("honours the limits 0.1, 0.2, 0.3 and 0.5", () => {
    expectOnly(errorsWith({}, ev({ maxShare: 0.1 })), CONN_SHARE(2, 7, 29, 10, 0), UC_SHARE(3, 6, 50, 10, 0));
    expectOnly(errorsWith({}, ev({ maxShare: 0.2 })), CONN_SHARE(2, 7, 29, 20, 1), UC_SHARE(3, 6, 50, 20, 1));
    expectOnly(errorsWith({}, ev({ maxShare: 0.3 })), UC_SHARE(3, 6, 50, 30, 1));
    expect(errorsWith({}, ev({ maxShare: 0.5 }))).toEqual([]);
    expect([0.1, 0.2, 0.3, 0.5].map((l) => maxHypotheses(10, l))).toEqual([1, 2, 3, 5]);
    expect([0.1, 0.2, 0.3, 0.5].map((l) => maxHypotheses(7, l))).toEqual([0, 1, 2, 3]);
    expect(maxHypotheses(30, 0.1)).toBe(3);
    expect(maxHypotheses(0, 0.5)).toBe(0);
  });

  it("uses 20% when the project sets no limit", () => {
    const settings = evidenceSettingsOf({ evidenceMode: "hypothesis", hypothesisScopes: [S1] });
    expect(settings.maxShare).toBe(DEFAULT_HYPOTHESIS_MAX_SHARE);
    expect(settings.maxShare).toBe(0.2);
    expectOnly(errorsWith({}, settings), CONN_SHARE(2, 7, 29, 20, 1), UC_SHARE(3, 6, 50, 20, 1));
  });

  it("gives ratio 0 for an empty HCD and counts each element once, whatever its claims", () => {
    expect(hypothesisShare({ ucs: [], connections: [] }, 0.2)).toEqual({ connections: { count: 0, total: 0, ratio: 0, limit: 0.2 }, ucs: { count: 0, total: 0, ratio: 0, limit: 0.2 } });
    expect(shareExceeded({ count: 0, total: 0, ratio: 0, limit: 0.1 })).toBe(false);
    const h = (claims: string[]): Hypothesis => ({ claims, basis: "model", rationale: "r", premises: ["[A, 2000]"], scope: "S1" });
    const m = modelOf(stripHypotheses());
    m.connections[0].hypothesis = h(["direction"]);
    m.connections[1].hypothesis = h(["existence", "direction", "sign"]);
    m.ucs[1].hypothesis = h(["role"]);
    m.ucs[2].hypothesis = h(["population", "transmitter", "modulation", "role"]);
    const share = hypothesisShare(m, 0.3);
    expect([share.connections.count, share.connections.total, share.ucs.count, share.ucs.total]).toEqual([2, 7, 2, 6]);
  });

  it("does not count Collections among the UCs", () => {
    const more = errorsWith(
      {
        uc: (u) =>
          u.collections.push({ circuitId: "Floc", descriptor: "", names: "flocculus", sourceOfId: "collection", subCircuits: ["Cb", "IO"], comments: "Cortex and olive differ in cell types [Ito, 1982]." }),
      },
      ev({ maxShare: 0.3 }),
    );
    expectOnly(more, UC_SHARE(3, 6, 50, 30, 1));
  });
});

// --- report ---------------------------------------------------------------------------------------------------------

describe("report checks", () => {
  const H_LIST = "H1 = UC GC(granule); H2 = UC IO; H3 = UC GoC(golgi); H4 = VN -> IO [Lisberger, 1994]; H5 = GoC(golgi) -> GC(granule) [Eccles, 1967]";
  /** PC(purkinje) -> FTN, the only way to the ROI output, becomes a direction hypothesis (H6, last in connections.json). */
  const noEvidencePath = (report: string | null): Mutation => ({
    conn: (c) => (connOf(c, "PC(purkinje)", "FTN").hypothesis = directionHypothesis("[Lisberger, 1994]")),
    report,
  });
  const LIMITATIONS_ERROR = lit(
    `report.md: the ROI inputs reach the ROI outputs only through hypothesis connections; state this fact under \`## Limitations\`: "${NO_EVIDENCE_PATH_SENTENCE} ${HYPOTHESIS_PATH_SENTENCE}"`,
  );

  it("requires the ## Hypotheses section", () => {
    const report = REPORT.replace(/## Hypotheses[\s\S]*?(?=## Limitations)/, "");
    expect(report).not.toMatch(/Hypotheses/);
    expectOnly(
      errorsWith({ report }),
      lit(`report.md: add the \`## Hypotheses\` section: a table of every hypothesis (ID, element, claims, basis, premises, rationale) with the IDs the worker gives them (${H_LIST}), and the share of hypothesis connections and UCs against the limit of 50%.`),
    );
  });

  it("requires every worker ID in the section", () => {
    expectOnly(errorsWith({ report: withoutRow("H3") }), lit(`report.md: the \`## Hypotheses\` table lacks H3 (UC GoC(golgi)); list every hypothesis with the worker's IDs (${H_LIST}).`));
    // an ID named in another section does not count
    const elsewhere = withoutRow("H5").replace(LIMITATION, `${LIMITATION} H5 rests on cat data.`);
    expectOnly(errorsWith({ report: elsewhere }), lit("report.md: the `## Hypotheses` table lacks H5 (GoC(golgi) -> GC(granule) [Eccles, 1967])"));
  });

  it("needs no section without hypotheses, and adds nothing when report.md is missing", () => {
    const report = REPORT.replace(/## Hypotheses[\s\S]*?(?=## Limitations)/, "");
    expect(errorsWith(stripHypotheses({ conn: (c) => (connOf(c, "GoC(golgi)", "GC(granule)").measurementMethod = "Axonal tracing"), report }))).toEqual([]);
    expectOnly(errorsWith({ report: null }), lit("report.md is missing or empty."));
  });

  it("asks for the evidence-only-path fact under ## Limitations when no evidence-only path exists", () => {
    expectOnly(errorsWith(noEvidencePath(withRows(["H6"]))), LIMITATIONS_ERROR);
    const noSection = withRows(["H6"]).replace(`## Limitations\n\n${LIMITATION}\n\n`, "");
    expect(noSection).not.toMatch(/Limitations/);
    expectOnly(errorsWith(noEvidencePath(noSection)), LIMITATIONS_ERROR);
    const wrongSection = withRows(["H6"]).replace("## HCD\n", `## HCD\n\n${NO_EVIDENCE_PATH_SENTENCE}\n`);
    expectOnly(errorsWith(noEvidencePath(wrongSection)), LIMITATIONS_ERROR);
  });

  it("asks only for the first sentence when no path leads to the outputs even with the hypotheses", () => {
    // PC(purkinje) -> FTN removed: nothing reaches the ROI output (the strict checks report the interface of PC(purkinje))
    const m = modelOf();
    const connections = m.connections.filter((c) => !(c.sender === "PC(purkinje)" && c.receiver === "FTN"));
    expect(evidencePaths({ ...m, connections })).toMatchObject({ evidenceOnly: false, withHypotheses: false });
    const errors = hypothesisProblems({ ...m, connections, report: REPORT }, EVIDENCE);
    expect(errors).toEqual([
      `report.md: no connections lead from the ROI inputs through the ROI to the ROI outputs, with or without hypotheses; state this fact under \`## Limitations\`: "${NO_EVIDENCE_PATH_SENTENCE}"`,
    ]);
    expect(hypothesisProblems({ ...m, connections, report: REPORT.replace(LIMITATION, `${LIMITATION} ${NO_EVIDENCE_PATH_SENTENCE}`) }, EVIDENCE)).toEqual([]);
  });

  it("accepts the sentence (or another wording of the fact) under ## Limitations", () => {
    expect(errorsWith(noEvidencePath(withRows(["H6"]).replace(LIMITATION, `${LIMITATION} ${NO_EVIDENCE_PATH_SENTENCE}`)))).toEqual([]);
    expect(errorsWith(noEvidencePath(withRows(["H6"]).replace(LIMITATION, `${LIMITATION} There is no Evidence only path to the output.`)))).toEqual([]);
  });
});

// --- strict invariance ----------------------------------------------------------------------------------------------

describe("strict invariance", () => {
  // the inputs of harness.test.ts (a project without any hypothesis key)
  const fn = (id: string) => ({ requirement: `req of [U.${id}]`, requirementRealization: `real of [U.${id}]`, capability: "cap", mechanism: "mech", implementation: `[U.${id}] = f([U.VN])` });
  const noFn = { interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "" };
  const uc = (circuitId: string, descriptor: string, extra: Record<string, unknown>) => ({
    circuitId,
    descriptor,
    names: circuitId,
    roi: "internal",
    sourceOfId: descriptor.includes("/") ? "[Ito, 1982]" : "DHBA",
    transmitter: "Glutamate",
    modulationType: "Excitatory",
    comments: "",
    outputSemantics: `[${circuitId}]content;`,
    ...noFn,
    ...extra,
  });
  const conn = (sender: string, receiver: string, comment: string, ref = "[Ito, 1982]") => ({
    sender,
    senderRelation: "=",
    senderInLiterature: `${sender} of the paper`,
    receiver,
    receiverRelation: "<",
    receiverInLiterature: "cerebellar cortex",
    comment,
    referenceIds: [ref],
    taxon: "Rabbit",
    measurementMethod: "Axonal tracing",
    pointersOnLiterature: `The ${comment} projection from ${sender} terminates on ${receiver} in the flocculus of the rabbit.`,
    pointersOnFigure: "Figure 1b",
  });
  const node = (id: string, subnodes: string[], itf: string) => ({ id, subnodes, comment: `${id} comment`, interface: itf, requirement: "r", requirementRealization: "rr", capability: "c", mechanism: "m" });
  const VOR: HcdInputs = {
    meta: j({ roi: "Cerebellar flocculus", tlf: "VOR adaptation", description: "HCD/FRG of VOR adaptation in the cerebellar flocculus.", name: "VOR adaptation in cerebellar flocculus" }),
    decisionLog: "# Decision log\n",
    report: "# VOR adaptation\n\n## HCD\n\ntext\n",
    references: j({
      references: [
        { id: "[Ito, 1982]", doi: "10.1146/annurev.ne.05.030182.001423", literatureType: "Review" },
        { id: "[Lisberger, 1994]", doi: "N/A", literatureType: "Experimental results", alternativeUrl: "https://example.org/lisberger-1994" },
      ],
    }),
    uc: j({
      ucs: [
        uc("VN", "HOMBA:12950", { roi: "noROI(input)", comments: "head velocity" }),
        uc("GC(granule)", "HOMBA:12852/cell:granule", { comments: "parallel fibres", interface: "([U.PC(purkinje)]) = GC(granule)([U.VN])", ...fn("GC(granule)") }),
        uc("PC(purkinje)", "HOMBA:12852/cell:purkinje", { transmitter: "GABA", modulationType: "Inhibitory", interface: "([U.FTN]) = PC(purkinje)([U.GC(granule)], [U.IO])", ...fn("PC(purkinje)") }),
        uc("IO", "HOMBA:12500", { interface: "([U.PC(purkinje)]) = IO([U.VN])", ...fn("IO") }),
        uc("FTN", "HOMBA:12951", { roi: "noROI(output)", transmitter: "GABA", modulationType: "Inhibitory", outputSemantics: "" }),
      ],
    }),
    connections: j({
      bif: [{ sender: "vestibular nerve", receiver: "granule cell layer", comment: "mossy fibres", referenceIds: ["[Ito, 1982]"] }],
      connections: [
        conn("VN", "GC(granule)", "mossy fibres"),
        conn("VN", "IO", "slip", "[Lisberger, 1994]"),
        conn("GC(granule)", "PC(purkinje)", "parallel fibres, P(a|b)"),
        conn("IO", "PC(purkinje)", "climbing fibres", "[Lisberger, 1994]"),
        conn("PC(purkinje)", "FTN", "inhibition", "[Lisberger, 1994]"),
      ],
    }),
  };
  const VOR_FRG = {
    report: "# VOR adaptation\n\n## HCD\n\ntext\n\n## FRG\n\ntext\n",
    frg: j({
      nodes: [
        node("R.VOR-Adaptation", ["R.Context", "R.Learning"], "([U.FTN]) = R.VOR-Adaptation([U.VN])"),
        node("R.Context", ["U.GC(granule)", "U.PC(purkinje)"], "([U.FTN]) = R.Context([U.VN], [U.IO])"),
        node("R.Learning", ["U.IO", "U.PC(purkinje)"], "([U.FTN]) = R.Learning([U.VN], [U.GC(granule)])"),
      ],
    }),
  };
  const STRICT = { mode: "strict", scopes: [], maxShare: 0.2 } as EvidenceOptions;
  const noHypothesisProperty = (m: HcdModel) => [...m.ucs, ...m.connections].every((x) => !hasKey(x, "hypothesis"));

  it("gives byte-identical check results without an evidence option and in strict mode", () => {
    const base = checkHcd(VOR);
    expect(base.errors).toEqual([]);
    const variants = [checkHcd(VOR, {}), checkHcd(VOR, { evidence: STRICT }), checkHcd(VOR, { evidence: { mode: "strict" } as EvidenceOptions }), checkHcd(VOR, { evidence: evidenceSettingsOf(null) })];
    for (const v of variants) expect(JSON.stringify(v)).toBe(JSON.stringify(base));
    expect(noHypothesisProperty(base.model!)).toBe(true);
  });

  it("gives byte-identical CSVs and cross checks without an evidence option, in strict mode, and in hypothesis mode without hypotheses", () => {
    const csv = (evidence?: EvidenceOptions) => {
      const hcd = checkHcd(VOR, evidence ? { evidence } : {}).model!;
      const frg = checkFrg(VOR_FRG, hcd).model!;
      return { files: buildCsvs(hcd, frg, CSV_OPTS), cross: JSON.stringify(checkCross(hcd, frg)), hcd, frg };
    };
    const base = csv();
    expect(base.files.errors).toEqual([]);
    for (const e of [STRICT, ev()]) {
      const v = csv(e);
      expect(v.files.files).toEqual(base.files.files);
      for (const [k, text] of Object.entries(v.files.files!)) expect(text, k).toBe(base.files.files![k as CsvFileName]);
      expect(v.cross).toBe(base.cross);
    }
    const cross = checkCross(base.hcd, base.frg, { evidence: STRICT });
    expect(hasKey(cross, "hypotheses")).toBe(false);
    expect(JSON.stringify(cross)).toBe(base.cross);
  });

  it("drops hypothesis keys from the model of a strict project, so its CSVs equal those of the file without the keys", () => {
    for (const evidence of [null, STRICT]) {
      const keyed = checkWith({}, evidence);
      const stripped = checkWith(stripHypotheses(), evidence);
      expect(noHypothesisProperty(keyed.model!)).toBe(true);
      expect(keyed.model).toEqual(stripped.model);
      const a = csvsOf(keyed.model!);
      const b = csvsOf(stripped.model!);
      for (const k of Object.keys(a) as (keyof typeof a)[]) expect(a[k], k).toBe(b[k]);
      expect(a["Connections.csv"]).not.toMatch(/Hypothesis \(/);
      expect(a["FRG.csv"]).not.toMatch(/Depends on hypotheses/);
      expect(hasKey(checkCross(keyed.model!, frgOf(keyed.model!), evidence ? { evidence } : {}), "hypotheses")).toBe(false);
    }
  });
});

// --- export ---------------------------------------------------------------------------------------------------------

describe("CSV export in hypothesis mode", () => {
  const hcd = modelOf();
  const frg = frgOf(hcd);
  const files = csvsOf(hcd, frg);
  const circuits = parseCsvObjects(files["Circuits.csv"]);
  const connections = parseCsvObjects(files["Connections.csv"]);
  const frgRows = parseCsvObjects(files["FRG.csv"]);
  const circuit = (id: string) => circuits.find((c) => c["Circuit ID"] === id)!;
  const connection = (s: string, r: string) => connections.find((c) => c["Sender Circuit ID (sCID)"] === s && c["Receiver Circuit ID (rCID)"] === r)!;
  const frgRow = (id: string) => frgRows.find((r) => r["Node ID"] === id)!;
  const lines = (x: string) => x.split("\n");

  it("keeps the CSV headers and row counts", () => {
    const rows = parseCsv(files["Connections.csv"]);
    expect(rows[0][2]).toBe("Comments");
    expect(rows[0][5]).toBe("Measurement method");
    expect(connections).toHaveLength(7);
    expect(circuits).toHaveLength(8);
    expect(frgRows).toHaveLength(10);
  });

  it("puts the hypothesis line first in Connections Comments; an existence hypothesis has method Hypothetical", () => {
    const ex = connection("GoC(golgi)", "GC(granule)");
    expect(lines(ex.Comments)[0].startsWith("Hypothesis (existence; homology): ")).toBe(true);
    expect(lines(ex.Comments)).toEqual([hypothesisCommentLine(hcd.connections[5].hypothesis!), "inhibition"]);
    expect(ex["Measurement method"]).toBe("Hypothetical");
    expect(ex["Reference ID"]).toBe("[Eccles, 1967]");
    const dir = connection("VN", "IO");
    expect(lines(dir.Comments)[0]).toMatch(/^Hypothesis \(direction; indirect\): Vestibular and olivary activity/);
    expect(dir["Measurement method"]).toBe("Electro physiology");
    expect(connection("VN", "GC(granule)").Comments).toBe("mossy fibres");
  });

  it("puts the hypothesis line first in Circuits Comments; a population UC has Source of ID makeshift", () => {
    expect(lines(circuit("IO").Comments)).toEqual([
      "Hypothesis (transmitter; homology): Olivary neurons are glutamatergic in the monkey [Lisberger, 1994]; no paper found reports the transmitter of the olivary neurons that project to the human flocculus.",
      "Retinal slip error signal",
    ]);
    expect(circuit("IO").Transmitter).toBe("Glutamate");
    expect(lines(circuit("GC(granule)").Comments)[0]).toMatch(/^Hypothesis \(role; functional-need\): The FRG needs a context expansion stage/);
    expect(circuit("GoC(golgi)")["Source of ID"]).toBe("makeshift");
    expect(lines(circuit("GoC(golgi)").Comments)[0]).toMatch(/^Hypothesis \(population; analogy\): /);
    expect(circuit("PC(purkinje)").Comments).toBe("Purkinje cells learning the VOR gain");
    expect(circuit("VN").Comments).toBe("Head velocity input; noROI(input)");
  });

  it("ends the FRG GN Comments with the hypotheses the GN depends on, and marks the U. rows", () => {
    expect(frgRow("R.VOR-Adaptation").Comments).toBe("TLF: adapt the gain of the vestibulo-ocular reflex; Depends on hypotheses: H1, H2, H3, H5");
    expect(frgRow("R.Context").Comments).toBe("Context representation read out by Purkinje cells; Depends on hypotheses: H1");
    expect(frgRow("R.Learning").Comments).toMatch(/; Depends on hypotheses: H2$/);
    expect(frgRow("R.Gain-Control").Comments).toMatch(/; Depends on hypotheses: H1, H3, H5$/);
    expect(lines(frgRow("U.IO").Comments)[0]).toMatch(/^Hypothesis \(transmitter; homology\): /);
    expect(lines(frgRow("U.GoC(golgi)").Comments)[0]).toMatch(/^Hypothesis \(population; analogy\): /);
    expect(frgRow("U.PC(purkinje)").Comments).toBe("Purkinje cells learning the VOR gain");
  });

  it("writes no dependency note on a GN without dependencies", () => {
    const m = structuredClone(hcd);
    for (const u of m.ucs) delete u.hypothesis;
    const rows = parseCsvObjects(csvsOf(m, frg)["FRG.csv"]);
    const comments = (id: string) => rows.find((r) => r["Node ID"] === id)!.Comments;
    expect(comments("R.Context")).toBe("Context representation read out by Purkinje cells");
    expect(comments("R.Learning")).toBe("Error-driven learning of the gain");
    expect(comments("R.Gain-Control")).toBe("Feedforward control of the granule cell gain; Depends on hypotheses: H2");
  });

  it("keeps the noROI tag after the hypothesis line of an external UC and joins a multi-line rationale", () => {
    const m = structuredClone(hcd);
    m.ucs[0].hypothesis = { claims: ["role"], basis: "model", rationale: "A model needs\n   this input  [Ito, 1982].", premises: ["[Ito, 1982]"], scope: "S1" };
    const out = csvsOf(m, frg);
    const vn = parseCsvObjects(out["Circuits.csv"]).find((c) => c["Circuit ID"] === "VN")!;
    expect(vn.Comments).toBe("Hypothesis (role; model): A model needs this input [Ito, 1982].\nHead velocity input; noROI(input)");
    const g = buildGraphs("HYP", { circuitsCsv: out["Circuits.csv"], connectionsCsv: out["Connections.csv"], frgCsv: out["FRG.csv"] });
    expect(g.hcd.nodes).toHaveLength(6);
    expect(g.hcd.edges).toHaveLength(7);
  });

  it("withHypothesisLine leaves comments without a hypothesis unchanged", () => {
    const h: Hypothesis = { claims: ["existence", "sign"], basis: "analogy", rationale: "r", premises: [], scope: "S1" };
    expect(withHypothesisLine("c", undefined)).toBe("c");
    expect(withHypothesisLine("", h)).toBe("Hypothesis (existence, sign; analogy): r");
    expect(withHypothesisLine("c", h)).toBe("Hypothesis (existence, sign; analogy): r\nc");
  });
});

describe("Template-v2-2 export of the hypothesis CSVs", () => {
  const hcd = modelOf();
  const files = csvsOf(hcd);
  const xlsx = buildTemplateXlsx(XLSX_TEMPLATE, {
    projectId: "HYP",
    contributor: "Tester",
    csv: { project: files["Project.csv"], references: files["References.csv"], circuits: files["Circuits.csv"], connections: files["Connections.csv"], frg: files["FRG.csv"] },
  });
  const rowWhere = (match: (r: number) => boolean) => {
    for (let r = 2; r < 200; r++) if (match(r)) return r;
    throw new Error("row not found");
  };

  it("writes Hypothetical in Connections K and the hypothesis line first in Connections H", () => {
    const s = readTemplateSheet(xlsx.bytes, "Connections");
    const cell = (c: string, r: number) => s.get(`${c}${r}`)?.text ?? "";
    const r = rowWhere((n) => cell("A", n) === "GoC(golgi)" && cell("D", n) === "GC(granule)");
    expect(cell("K", r)).toBe("Hypothetical");
    expect(cell("H", r).split("\n")[0].startsWith("Hypothesis (existence; homology): ")).toBe(true);
    expect(cell("H", r).split("\n")[1]).toBe("inhibition");
    const d = rowWhere((n) => cell("A", n) === "VN" && cell("D", n) === "IO");
    expect(cell("H", d)).toMatch(/^Hypothesis \(direction; indirect\): /);
    expect(cell("K", d)).toBe("Electro physiology");
  });

  it("writes the hypothesis line first in Circuits AA", () => {
    const s = readTemplateSheet(xlsx.bytes, "Circuits");
    const cell = (c: string, r: number) => s.get(`${c}${r}`)?.text ?? "";
    const io = rowWhere((n) => cell("A", n) === "IO");
    expect(cell("AA", io).split("\n")[0].startsWith("Hypothesis (transmitter; homology): ")).toBe(true);
    expect(cell("AA", io).split("\n").at(-1)).toBe("UC Descriptor: HOMBA:12500");
    const goc = rowWhere((n) => cell("A", n) === "GoC(golgi)");
    expect(cell("B", goc)).toBe("makeshift");
    expect(cell("AA", goc)).toMatch(/^Hypothesis \(population; analogy\): /);
  });
});

// --- records, GN dependencies, paths, hypotheses.json, cross check --------------------------------------------------

describe("hypothesis records and what depends on them", () => {
  const hcd = modelOf();
  const frg = frgOf(hcd);
  const FIXTURE_GNS = [
    { id: "R.VOR-Adaptation", hypotheses: ["H1", "H2", "H3", "H5"] },
    { id: "R.Context", hypotheses: ["H1"] },
    { id: "R.Learning", hypotheses: ["H2"] },
    { id: "R.Gain-Control", hypotheses: ["H1", "H3", "H5"] },
  ];

  it("numbers the UCs first (uc.json order), then the connections (connections.json order)", () => {
    const records = hypothesisRecords(hcd);
    expect(records.map((r) => [r.id, elementLabel(r.element)])).toEqual([
      ["H1", "UC GC(granule)"],
      ["H2", "UC IO"],
      ["H3", "UC GoC(golgi)"],
      ["H4", "VN -> IO [Lisberger, 1994]"],
      ["H5", "GoC(golgi) -> GC(granule) [Eccles, 1967]"],
    ]);
    expect(records[4]).toEqual({
      id: "H5",
      element: { kind: "connection", sender: "GoC(golgi)", receiver: "GC(granule)", referenceId: "[Eccles, 1967]" },
      claims: ["existence"],
      basis: "homology",
      scope: "S1",
      premises: ["[Eccles, 1967]"],
      rationale: "Golgi cells inhibit granule cells in the cat cerebellar cortex [Eccles, 1967]; no paper found states this projection in the flocculus of the modelled species.",
    });
    expect(hasKey(records[0], "researchCandidate")).toBe(false);
    // a UC hypothesis after every connection in file terms still comes first
    const m = structuredClone(hcd);
    m.ucs[5].hypothesis = { ...m.ucs[1].hypothesis! };
    expect(hypothesisRecords(m).map((r) => elementLabel(r.element))).toEqual(["UC GC(granule)", "UC IO", "UC GoC(golgi)", "UC FTN", "VN -> IO [Lisberger, 1994]", "GoC(golgi) -> GC(granule) [Eccles, 1967]"]);
    expect(elementLabel({ kind: "connection", sender: "A", receiver: "B", referenceId: "" })).toBe("A -> B");
  });

  it("lists the GNs over a hypothesis UC (also through child GNs) or connected only through hypothesis connections", () => {
    expect(gnHypothesisDependencies(hcd, frg)).toEqual(FIXTURE_GNS);
  });

  it("does not list a GN whose UCs are connected by evidence and carry no hypothesis", () => {
    const m = structuredClone(hcd);
    for (const u of m.ucs) delete u.hypothesis;
    // H1 = VN -> IO, H2 = GoC(golgi) -> GC(granule): only the GNs holding both Golgi and granule cells depend on H2
    expect(gnHypothesisDependencies(m, frg)).toEqual([
      { id: "R.VOR-Adaptation", hypotheses: ["H2"] },
      { id: "R.Gain-Control", hypotheses: ["H2"] },
    ]);
    const reverse: ConnRow = { ...structuredClone(m.connections[2]), sender: "GC(granule)", receiver: "GoC(golgi)" };
    m.connections.push(reverse);
    expect(gnHypothesisDependencies(m, frg)).toEqual([]);
    expect(gnHypothesisDependencies(modelOf(stripHypotheses({ conn: (c) => (connOf(c, "GoC(golgi)", "GC(granule)").measurementMethod = "Axonal tracing") })), frg)).toEqual([]);
  });

  it("finds the UCs under each FRG node at all levels, cycle-safe", () => {
    const under = frgNodeUcs(frg);
    expect(new Set(under.get("R.VOR-Adaptation"))).toEqual(new Set(["GC(granule)", "PC(purkinje)", "IO", "GoC(golgi)"]));
    expect(under.get("R.Gain-Control")).toEqual(["GoC(golgi)", "GC(granule)"]);
    const cyclic = frgNodeUcs({ gns: [{ id: "R.A", subnodes: ["R.B", "U.X"] }, { id: "R.B", subnodes: ["R.A", "U.Y"] }] });
    expect(new Set(cyclic.get("R.A"))).toEqual(new Set(["X", "Y"]));
    expect(frgGnUcsFromJson(FRG_TEXT)).toEqual(under);
    expect(frgGnUcsFromJson(j({ nodes: [{ id: "R.A", subnodes: ["`U.X`", "U.Y"] }, { subnodes: ["U.Z"] }] }))).toEqual(new Map([["R.A", ["X", "Y"]]]));
    for (const t of [null, "", "not json", j({ nodes: "x" })]) expect(frgGnUcsFromJson(t).size).toBe(0);
  });

  it("evidencePaths: an evidence-only path, a path only through hypotheses, no path", () => {
    expect(evidencePaths(hcd)).toEqual({ evidenceOnly: true, withHypotheses: true, hypothesisConnections: 2 });
    const viaHypothesis = structuredClone(hcd);
    viaHypothesis.connections[6].hypothesis = { ...viaHypothesis.connections[1].hypothesis! };
    expect(evidencePaths(viaHypothesis)).toEqual({ evidenceOnly: false, withHypotheses: true, hypothesisConnections: 3 });
    const none = structuredClone(hcd);
    none.connections.splice(6, 1);
    expect(evidencePaths(none)).toEqual({ evidenceOnly: false, withHypotheses: false, hypothesisConnections: 2 });
    // the path must pass through the ROI; external relays before it are allowed
    const row = (id: string, roi: UcRow["roi"]) => ({ ...hcd.ucs[0], id, roi });
    const edge = (sender: string, receiver: string): ConnRow => ({ ...hcd.connections[0], sender, receiver });
    expect(evidencePaths({ ucs: [row("A", "input"), row("O", "output")], connections: [edge("A", "O")] }).withHypotheses).toBe(false);
    expect(evidencePaths({ ucs: [row("A", "input"), row("B", "input"), row("R", "roi"), row("O", "output")], connections: [edge("A", "B"), edge("B", "R"), edge("R", "O")] }).evidenceOnly).toBe(true);
    expect(evidencePaths({ ucs: [row("A", "both"), row("R", "roi")], connections: [edge("A", "R"), edge("R", "A")] }).evidenceOnly).toBe(true);
  });

  it("builds hypotheses.json that validates against HYPOTHESES_SCHEMA, with and without the FRG", () => {
    expect(PROJECT_FILES.hypotheses).toBe(HYPOTHESES_FILE);
    const settings = evidenceSettingsOf({ evidenceMode: "hypothesis", hypothesisScopes: [{ ...S1, note: "Allow hypotheses for the cerebellar cortex" }], hypothesisMaxShare: 0.5 });
    const withFrg = buildHypothesesFile(hcd, frg, settings, "2026-10-06T00:00:00.000Z");
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, withFrg)).toEqual([]);
    expect(withFrg).toMatchObject({ checkedAt: "2026-10-06T00:00:00.000Z", mode: "hypothesis", evidenceOnlyPath: true, gns: FIXTURE_GNS });
    expect(withFrg.scopes).toEqual(settings.scopes);
    expect(withFrg.scopes[0].note).toBe("Allow hypotheses for the cerebellar cortex");
    expect(withFrg.share).toEqual(hypothesisShare(hcd, 0.5));
    expect(withFrg.hypotheses).toEqual(hypothesisRecords(hcd));
    const withoutFrg = buildHypothesesFile(hcd, null, settings, "2026-10-06T00:00:00.000Z");
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, withoutFrg)).toEqual([]);
    expect(hasKey(withoutFrg, "gns")).toBe(false);
    const research = buildHypothesesFile(modelOf({ uc: (u) => (hOf(u, "IO").researchCandidate = "C2") }, ev({ researchMode: true, researchCandidates: new Map([["C2", "weak"]]) })), frg, settings, "t");
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, research)).toEqual([]);
    expect(research.hypotheses[1].researchCandidate).toBe("C2");
    // the schema is not vacuous
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, { ...withFrg, mode: "strict" })).not.toEqual([]);
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, { ...withFrg, share: { ...withFrg.share, ucs: { ...withFrg.share.ucs, limit: 0.25 } } })).not.toEqual([]);
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, { ...withFrg, gns: [{ id: "R.X", hypotheses: [] }] })).not.toEqual([]);
  });

  it("checkCross adds the hypotheses record only in hypothesis mode", () => {
    const h = checkCross(hcd, frg, { harnessRules: HARNESS_RULES, evidence: EVIDENCE });
    expect(h.hypotheses).toEqual({ count: 5, evidenceOnlyPath: true, pathWithHypotheses: true, gns: FIXTURE_GNS });
    const strict = checkCross(hcd, frg, { harnessRules: HARNESS_RULES, evidence: { mode: "strict" } });
    const none = checkCross(hcd, frg, { harnessRules: HARNESS_RULES });
    expect(hasKey(strict, "hypotheses")).toBe(false);
    expect(hasKey(none, "hypotheses")).toBe(false);
    expect(JSON.stringify(strict)).toBe(JSON.stringify(none));
    const { hypotheses: _h, ...rest } = h;
    expect(rest).toEqual(none);
  });
});

// --- settings -------------------------------------------------------------------------------------------------------

describe("evidence settings", () => {
  it("evidenceSettingsOf: strict unless evidenceMode is exactly hypothesis", () => {
    for (const p of [null, undefined, {}, { evidenceMode: "strict" }, { evidenceMode: "Hypothesis" }, { evidenceMode: " hypothesis" }, { evidenceMode: true }]) {
      expect(evidenceSettingsOf(p as Parameters<typeof evidenceSettingsOf>[0])).toEqual({ mode: "strict", scopes: [], maxShare: 0.2 });
    }
    expect(evidenceSettingsOf({ evidenceMode: "hypothesis", hypothesisMaxShare: 0.3, hypothesisScopes: [S1] })).toEqual({ mode: "hypothesis", scopes: [S1], maxShare: 0.3 });
    expect(isHypothesisMode(evidenceSettingsOf({ evidenceMode: "hypothesis" }))).toBe(true);
    expect(isHypothesisMode(evidenceSettingsOf({}))).toBe(false);
    expect(isHypothesisMode(null)).toBe(false);
    expect(isHypothesisMode(undefined)).toBe(false);
  });

  it("normalizeMaxShare: only the allowed values, else the default", () => {
    for (const v of HYPOTHESIS_MAX_SHARES) expect(normalizeMaxShare(v)).toBe(v);
    for (const v of [undefined, null, 0, 0.25, 1, -0.2, Number.NaN, "0.3", [0.3], {}]) expect(normalizeMaxShare(v)).toBe(DEFAULT_HYPOTHESIS_MAX_SHARE);
  });

  it("normalizeScopes: keeps well-formed scopes, drops unknown claims and bad or duplicate IDs", () => {
    for (const v of [undefined, null, "S1", {}, 3]) expect(normalizeScopes(v)).toEqual([]);
    const out = normalizeScopes([
      null,
      "S1",
      { id: " S1 ", claims: ["existence", "existence", "guess", " role "], target: { kind: "items", circuitIds: ["`U.IO`", "IO", "U.Cb", 3, ""], gnIds: ["R.A", "R.A", " R.B "] }, note: "  hypotheses near the olive ", jobId: " job-1 ", createdAt: 7 },
      { id: "S1", claims: ["direction"] },
      { id: "S2", claims: ["guess"] },
      { id: "S0", claims: ["role"] },
      { id: "s3", claims: ["role"] },
      { id: "S03", claims: ["role"] },
      { id: "S4", claims: ["sign"], target: { kind: "nowhere" }, note: "   " },
      { id: "S10", claims: "role" },
      { id: "S11", claims: ["modulation"] },
    ]);
    expect(out).toEqual([
      { id: "S1", claims: ["existence", "role"], target: { kind: "items", circuitIds: ["IO", "Cb"], gnIds: ["R.A", "R.B"] }, note: "hypotheses near the olive", jobId: "job-1", createdAt: "" },
      { id: "S4", claims: ["sign"], target: { kind: "all" }, jobId: "", createdAt: "" },
      { id: "S11", claims: ["modulation"], target: { kind: "all" }, jobId: "", createdAt: "" },
    ]);
    expect(hasKey(out[1], "note")).toBe(false);
  });

  it("describeScope names the claims and the target", () => {
    expect(describeScope(S1)).toBe("S1: existence, direction, sign, population, transmitter, modulation, role on the whole HCD");
    expect(describeScope(scope("S2", ["existence"], items(["IO", "Cb"], ["R.Learning"])))).toBe("S2: existence on circuits `IO`, `Cb` and FRG GNs `R.Learning` (their UCs)");
    expect(describeScope(scope("S3", ["role"], items([], ["R.A"])))).toBe("S3: role on FRG GNs `R.A` (their UCs)");
    expect(describeScope(scope("S4", ["role"], items([])))).toBe("S4: role on nothing");
  });
});

// --- review regressions -----------------------------------------------------------------------------------------------

describe("hypothesis lines in the graphs (hypothesis mode only)", () => {
  /** One VN -> GC(granule) evidence record plus a second record of the same pair with a direction hypothesis. */
  const csvs = () => {
    const m = modelOf();
    const base = m.connections.find((c) => c.sender === "VN" && c.receiver === "GC(granule)")!;
    const second: ConnRow = {
      ...structuredClone(base),
      referenceIds: ["[Lisberger, 1994]"],
      comment: "mossy fibre terminals",
      hypothesis: { claims: ["direction"], basis: "indirect", rationale: "The reverse pathway is GABAergic and inhibitory [Lisberger, 1994].", premises: ["[Lisberger, 1994]"], scope: "S1" },
    };
    return csvsOf({ ...m, connections: [...m.connections, second] });
  };
  const sources = (out: ReturnType<typeof csvsOf>) => ({ circuitsCsv: out["Circuits.csv"], connectionsCsv: out["Connections.csv"], frgCsv: out["FRG.csv"] });
  const edge = (g: ReturnType<typeof buildGraphs>, s: string, r: string) => g.hcd.edges.find((e) => e.source === s && e.target === r)!;

  it("reads each record's comment without its hypothesis line, whatever the record order", () => {
    const out = csvs();
    const g = buildGraphs("HYP", { ...sources(out), hypothesisLines: true });
    expect(edge(g, "VN", "GC(granule)").comments).toMatch(/Hypothesis \(direction; indirect\)/);
    expect(edge(g, "VN", "GC(granule)").sign).toBe("excitatory");
  });

  it("leaves projects without hypothesis mode as before: a comment that looks like a hypothesis line is read as it is", () => {
    const out = csvs();
    const plain = buildGraphs("HYP", sources(out));
    expect(edge(plain, "VN", "GC(granule)").sign).toBe("inhibitory");
    const csv = out["Connections.csv"].replace("mossy fibres", "Hypothesis (sign; analogy): GABAergic inhibitory projection");
    const strict = buildGraphs("HYP", { ...sources(out), connectionsCsv: csv });
    expect(edge(strict, "VN", "GC(granule)").sign).toBe("inhibitory");
  });
});

describe("premises in the citation check", () => {
  const cite = (conn: ConnFile) => checkCitations({ references: j(REFS), uc: j(UC), connections: j(conn), frg: FRG_TEXT, report: REPORT }).problems.map((p) => p.message);

  it("counts the premises of a hypothesis as Reference IDs, and any other premises key as free text (as before)", () => {
    const inside = structuredClone(CONN);
    chOf(inside, "VN", "IO").premises = ["[Lisberger, 1994]", "[Nope, 1999]"];
    expect(cite(inside).filter((m) => m.includes("[Nope, 1999]"))).toEqual([]);
    const outside = structuredClone(CONN);
    (connOf(outside, "VN", "IO") as unknown as Record<string, unknown>).premises = ["[Nope, 1999]"];
    expect(cite(outside)).toContainEqual(expect.stringMatching(lit("premises/0: cites [Nope, 1999], which is not in references.json")));
  });
});

describe("claims allowed by different scopes", () => {
  it("says that one scope must allow every claim of a hypothesis", () => {
    const scopes = [scope("S1", ["existence", "direction", "sign", "population", "modulation", "role"]), scope("S2", ["transmitter"])];
    const errors = errorsWith({ uc: (u) => (hOf(u, "IO").claims = ["role", "transmitter"]) }, ev({ scopes }));
    expectOnly(
      errors,
      lit("uc.json: `IO`: no single hypothesis scope allows all of its claims (role, transmitter): role by S1; transmitter by S2. A hypothesis names one scope, so keep only the claims one scope allows"),
    );
  });
});
