/**
 * Hypothesis mode (stage 1: harness and export) through the real phase checks: hypotheses.json, the cross-check record
 * and the CSV comments of a hypothesis-mode workspace (the reward fixture with one hypothesis UC and one existence
 * hypothesis connection), strict projects left as they were, quote / research / GN-scope checks, and the hypothesis
 * rules appended to the prompts of hypothesis-mode projects only.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  HYPOTHESES_SCHEMA,
  HYPOTHESIS_CLAIMS,
  HYPOTHESIS_PATH_SENTENCE,
  NO_EVIDENCE_PATH_SENTENCE,
  evidenceSettingsOf,
  parseCsvObjects,
  validateJsonSchema,
  type EvidenceSettings,
  type HypothesisScope,
  type QuoteRequest,
} from "@cobrac/shared";
import { hypothesisRules } from "../src/hypothesisRules.js";
import { PHASES, checkPhase, runPhases, type CheckDeps, type Phase, type PhaseContext, type PhaseDriver, type Prompt } from "../src/pipeline.js";
import { QuoteVerifier } from "../src/quotes.js";
import { RcsClient } from "../src/rcs.js";
import { projectPaths, type ProjectPaths } from "../src/steps.js";
import { BIOC, CROSSREF, EUROPE_PMC, EUTILS, HABER_EPMC, HABER_FULLTEXT, S2, SCHULTZ_EPMC, mockLiterature } from "./mockLiterature.js";
import { startMockRcs, type MockRcs } from "./mockRcsServer.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "reward");
const PROMPTS = join(here, "..", "..", "..", "prompts");
const PROJECT_ID = "u7m2q9xa-1";
const TOKEN = "hypothesis-token";

let rcs: MockRcs;
const workDirs: string[] = [];

beforeAll(async () => {
  rcs = await startMockRcs(TOKEN);
});
afterAll(async () => {
  await rcs.close();
});
afterEach(() => {
  for (const d of workDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function freshWorkspace(): ProjectPaths {
  const workDir = mkdtempSync(join(tmpdir(), "cobrac-hypothesis-"));
  workDirs.push(workDir);
  const p = projectPaths(workDir, PROJECT_ID);
  for (const d of [p.hcd, p.frg, p.csv]) mkdirSync(d, { recursive: true });
  return p;
}

const fixture = (f: string) => readFileSync(join(FIXTURE, f), "utf8");
const fixtureJson = (f: string) => JSON.parse(fixture(f));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, v: unknown) => writeFileSync(path, JSON.stringify(v, null, 2));
const csv = (p: ProjectPaths, f: string) => parseCsvObjects(readFileSync(join(p.csv, f), "utf8"));

function scope(id: string, target: HypothesisScope["target"] = { kind: "all" }, claims: HypothesisScope["claims"] = [...HYPOTHESIS_CLAIMS]): HypothesisScope {
  return { id, claims, target, jobId: "job-1", createdAt: "2026-10-01T00:00:00.000Z" };
}

const evidenceOf = (scopes: HypothesisScope[] = [scope("S1")], extra: { researchMode?: boolean; maxShare?: number } = {}): NonNullable<CheckDeps["evidence"]> => ({
  mode: "hypothesis",
  scopes,
  maxShare: extra.maxShare ?? 0.5,
  ...(extra.researchMode ? { researchMode: true } : {}),
});

function depsOf(evidence?: CheckDeps["evidence"], extra: Partial<CheckDeps> = {}): CheckDeps {
  const client = new RcsClient({ url: rcs.url, token: TOKEN });
  return {
    lookupSabra: (ids) => client.lookupHomba(ids),
    csvOptions: async () => ({ projectId: PROJECT_ID, contributor: "Tester", projectTemplate: readFileSync(join(PROMPTS, "Project.csv"), "utf8") }),
    ...(evidence ? { evidence } : {}),
    ...extra,
  };
}

// --- hypothesis-mode workspace -------------------------------------------------------------------------------------

const NAC_RATIONALE = "The accumbens role in value learning rests on the dopamine-gated plasticity of its cortical inputs [Haber, 2010]; no study isolating it in this TLF was found (PubMed: accumbens, value learning, macaque).";
const A9_RATIONALE =
  "Dorsolateral prefrontal fibers reach the ventral striatum [Haber, 2010] and dopamine neurons code prediction errors there [Schultz, 1997]; no tracing study of the left area 9/46d to the accumbens was found (PubMed and Europe PMC: area 9/46, accumbens, tracing, macaque).";
const HAS_HYPOTHESES_SECTION = [
  "## Hypotheses",
  "",
  "| ID | Element | Claims | Basis | Premises | Rationale |",
  "|---|---|---|---|---|---|",
  `| H1 | UC NAC | role | **functional-need** | [Haber, 2010] | ${NAC_RATIONALE} |`,
  `| H2 | A9/46d(left) -> NAC [Haber, 2010] | existence | homology | [Haber, 2010], [Schultz, 1997] | ${A9_RATIONALE} |`,
  "",
  "Hypothesis connections: 1 of 4 (25%); hypothesis UCs: 1 of 4 (25%); limit 50%.",
  "",
].join("\n");

/** report_hcd.md with the `## Hypotheses` section before `## Limitations` and the evidence-only path fact there. */
function hypothesisReport(o: { frg?: boolean } = {}): string {
  const hcd = fixture("report_hcd.md")
    .replace("## Limitations\n", `${HAS_HYPOTHESES_SECTION}\n## Limitations\n`)
    .replace("Laterality of the prefrontal input is simplified.", `Laterality of the prefrontal input is simplified. ${NO_EVIDENCE_PATH_SENTENCE} ${HYPOTHESIS_PATH_SENTENCE}`);
  return o.frg ? hcd + fixture("report_frg.md") : hcd;
}

/**
 * The reward fixture's HCD files in hypothesis mode: H1 = a role hypothesis on `NAC` (UC), H2 = an existence hypothesis
 * on `A9/46d(left)` -> `NAC` (measurementMethod Hypothetical; its quote states the premise in [Haber, 2010]). The only
 * ROI input reaches the ROI only through H2, so there is no evidence-only path.
 */
function writeHypothesisHcd(p: ProjectPaths, o: { researchCandidates?: [string, string]; quote?: string } = {}) {
  writeFileSync(p.meta, fixture("meta.json"));
  writeFileSync(p.decisionLog, fixture("decision_log.md"));
  writeFileSync(p.report, hypothesisReport());
  cpSync(join(FIXTURE, "HCD", "references.json"), join(p.hcd, "references.json"));
  const uc = fixtureJson("HCD/uc.json");
  uc.ucs[2].hypothesis = {
    claims: ["role"],
    basis: "functional-need",
    rationale: NAC_RATIONALE,
    premises: ["[Haber, 2010]"],
    scope: "S1",
    ...(o.researchCandidates ? { researchCandidate: o.researchCandidates[1] } : {}),
  };
  writeJson(join(p.hcd, "uc.json"), uc);
  const conns = fixtureJson("HCD/connections.json");
  Object.assign(conns.connections[0], {
    measurementMethod: "Hypothetical",
    ...(o.quote ? { pointersOnLiterature: o.quote } : {}),
    hypothesis: {
      claims: ["existence"],
      basis: "homology",
      rationale: A9_RATIONALE,
      premises: ["[Haber, 2010]", "[Schultz, 1997]"],
      scope: "S1",
      ...(o.researchCandidates ? { researchCandidate: o.researchCandidates[0] } : {}),
    },
  });
  writeJson(join(p.hcd, "connections.json"), conns);
}

function writeFrg(p: ProjectPaths, report = hypothesisReport({ frg: true })) {
  cpSync(join(FIXTURE, "FRG", "frg.json"), join(p.frg, "frg.json"));
  writeFileSync(p.report, report);
}

function writeStrictHcd(p: ProjectPaths) {
  writeFileSync(p.meta, fixture("meta.json"));
  writeFileSync(p.decisionLog, fixture("decision_log.md"));
  writeFileSync(p.report, fixture("report_hcd.md"));
  for (const f of ["references.json", "uc.json", "connections.json"]) cpSync(join(FIXTURE, "HCD", f), join(p.hcd, f));
}

const ctxOf = (): PhaseContext => ({ hcd: null, frg: null });
const hypothesisErrors = (errors: string[]) => errors.filter((e) => /hypothes|researchCandidate|Hypothetical|evidence-only/i.test(e));

/** Phase driver like pipeline.test.ts: the mock agent writes the files of each phase prompt. */
function driver(p: ProjectPaths, deps: CheckDeps, write: { hcd: () => void; frg: () => void }, out: { turns: string[]; accepted: Phase[]; warnings: string[][]; onAccepted?: (phase: Phase) => void }): PhaseDriver {
  const ctx = ctxOf();
  return {
    maxNudges: 2,
    turn: async (prompt: Prompt) => {
      out.turns.push(prompt.shown.split("\n")[0]);
      if (prompt.shown.startsWith("Run phase HCD")) write.hcd();
      else if (prompt.shown.startsWith("Run phase FRG")) write.frg();
      return true;
    },
    check: (phase) => checkPhase(phase, p, deps, ctx),
    hasFiles: (phase) => readdirSync(phase === "HCD" ? p.hcd : phase === "FRG" ? p.frg : p.csv).length > 0,
    phasePrompt: async (phase) => ({ shown: `Run phase ${phase}` }),
    fixPrompt: async (phase, errors) => ({ shown: `Fix ${phase}\n${errors.join("\n")}` }),
    onWarn: async (_phase, errors) => void out.warnings.push(errors),
    onAccepted: async (phase) => {
      out.accepted.push(phase);
      out.onAccepted?.(phase);
    },
  };
}

// --- 1. hypothesis-mode phases ------------------------------------------------------------------------------------

describe("hypothesis mode in the phase checks", () => {
  const H1 = {
    id: "H1",
    element: { kind: "uc", circuitId: "NAC" },
    claims: ["role"],
    basis: "functional-need",
    scope: "S1",
    premises: ["[Haber, 2010]"],
    rationale: NAC_RATIONALE,
  };
  const H2 = {
    id: "H2",
    element: { kind: "connection", sender: "A9/46d(left)", receiver: "NAC", referenceId: "[Haber, 2010]" },
    claims: ["existence"],
    basis: "homology",
    scope: "S1",
    premises: ["[Haber, 2010]", "[Schultz, 1997]"],
    rationale: A9_RATIONALE,
  };
  const GNS = [
    { id: "R.Reward-Prediction-Error-Learning", hypotheses: ["H1"] },
    { id: "R.Value-Learning", hypotheses: ["H1"] },
  ];

  it("passes HCD → FRG → CSV and writes hypotheses.json, the cross-check record and the hypothesis comments of the CSVs", async () => {
    const p = freshWorkspace();
    const deps = depsOf(evidenceOf());
    const ctx = ctxOf();

    writeHypothesisHcd(p);
    const hcd = await checkPhase("HCD", p, deps, ctx);
    expect(hcd.errors).toEqual([]);
    expect(ctx.hcd?.ucs.find((u) => u.id === "NAC")?.hypothesis).toMatchObject({ claims: ["role"], scope: "S1" });
    const afterHcd = readJson(p.hypotheses);
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, afterHcd)).toEqual([]);
    expect(afterHcd).toMatchObject({
      mode: "hypothesis",
      scopes: [scope("S1")],
      share: { connections: { count: 1, total: 4, ratio: 0.25, limit: 0.5 }, ucs: { count: 1, total: 4, ratio: 0.25, limit: 0.5 } },
      evidenceOnlyPath: false,
    });
    expect(afterHcd.hypotheses).toEqual([H1, H2]);
    // the GNs that depend on hypotheses are only known once the FRG is checked
    expect(afterHcd).not.toHaveProperty("gns");
    expect(existsSync(p.crossCheck)).toBe(false);

    writeFrg(p);
    const frg = await checkPhase("FRG", p, deps, ctx);
    expect(frg.errors).toEqual([]);
    const afterFrg = readJson(p.hypotheses);
    expect(validateJsonSchema(HYPOTHESES_SCHEMA, afterFrg)).toEqual([]);
    expect(afterFrg.hypotheses.map((h: { id: string }) => h.id)).toEqual(["H1", "H2"]);
    expect(afterFrg.evidenceOnlyPath).toBe(false);
    expect(afterFrg.gns).toEqual(GNS);
    expect(readJson(p.crossCheck).hypotheses).toEqual({ count: 2, evidenceOnlyPath: false, pathWithHypotheses: true, gns: GNS });

    const built = await checkPhase("CSV", p, deps, ctx);
    expect(built).toEqual({ errors: [], fatal: false });
    expect(readJson(p.hypotheses)).toMatchObject({ hypotheses: [H1, H2], evidenceOnlyPath: false, gns: GNS });
    expect(readJson(p.crossCheck)).toMatchObject({ phase: "CSV", hypotheses: { count: 2, evidenceOnlyPath: false, pathWithHypotheses: true, gns: GNS } });

    const conns = csv(p, "Connections.csv");
    const a9 = conns.find((r) => r["Sender Circuit ID (sCID)"] === "A9/46d(left)" && r["Receiver Circuit ID (rCID)"] === "NAC")!;
    expect(a9["Measurement method"]).toBe("Hypothetical");
    expect(a9["Reference ID"]).toBe("[Haber, 2010]");
    expect(a9.Comments.split("\n")).toEqual([`Hypothesis (existence; homology): ${A9_RATIONALE}`, "task context"]);
    // evidence records are written as before
    for (const r of conns.filter((x) => x !== a9)) {
      expect(r.Comments).not.toMatch(/Hypothesis/);
      expect(r["Measurement method"]).not.toBe("Hypothetical");
    }
    const nac = csv(p, "Circuits.csv").find((r) => r["Circuit ID"] === "NAC")!;
    expect(nac.Comments.split("\n")).toEqual([`Hypothesis (role; functional-need): ${NAC_RATIONALE}`, "Ventral striatum storing state values"]);
    const frgRows = csv(p, "FRG.csv");
    const comment = (id: string) => frgRows.find((r) => r["Node ID"] === id)!.Comments;
    expect(comment("R.Reward-Prediction-Error-Learning")).toBe("TLF: learn to predict reward from context; Depends on hypotheses: H1");
    expect(comment("R.Value-Learning")).toBe("Update state values from prediction errors; Depends on hypotheses: H1");
    expect(comment("U.NAC").split("\n")[0]).toBe(`Hypothesis (role; functional-need): ${NAC_RATIONALE}`);
    expect(comment("U.VTA")).not.toMatch(/Hypothesis/);
  });

  it("runs the phases without fix turns and rewrites hypotheses.json at every phase", async () => {
    const p = freshWorkspace();
    const out = { turns: [] as string[], accepted: [] as Phase[], warnings: [] as string[][], snapshots: {} as Record<string, Record<string, unknown>> };
    const run = await runPhases(
      driver(p, depsOf(evidenceOf()), { hcd: () => writeHypothesisHcd(p), frg: () => writeFrg(p) }, { ...out, onAccepted: (phase) => void (out.snapshots[phase] = readJson(p.hypotheses)) }),
      0,
      { shown: "Run phase HCD" },
    );
    expect(run).toEqual({ result: "completed" });
    expect(out.turns).toEqual(["Run phase HCD", "Run phase FRG"]);
    expect(out.accepted).toEqual(PHASES);
    expect(out.warnings).toEqual([]);
    expect(out.snapshots.HCD).not.toHaveProperty("gns");
    expect(out.snapshots.FRG.gns).toEqual(GNS);
    expect(out.snapshots.CSV.gns).toEqual(GNS);
  });

  it("sends the report and the hypothesis fields back as HCD fixes", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    // the report lacks the hypotheses section and the evidence-only path fact
    writeFileSync(p.report, fixture("report_hcd.md"));
    const conns = readJson(join(p.hcd, "connections.json"));
    conns.connections[0].hypothesis.premises = ["[Luo, 2011]"]; // no DOI or PMID, and not the record's paper
    writeJson(join(p.hcd, "connections.json"), conns);
    const r = await checkPhase("HCD", p, depsOf(evidenceOf()), ctxOf());
    const errors = hypothesisErrors(r.errors);
    expect(errors).toContainEqual(expect.stringMatching(/^report\.md: add the `## Hypotheses` section: .*\(H1 = UC NAC; H2 = A9\/46d\(left\) -> NAC \[Haber, 2010\]\)/));
    expect(errors).toContainEqual(`report.md: the ROI inputs reach the ROI outputs only through hypothesis connections; state this fact under \`## Limitations\`: "${NO_EVIDENCE_PATH_SENTENCE} ${HYPOTHESIS_PATH_SENTENCE}"`);
    expect(errors).toContainEqual(expect.stringContaining("connections.json: `A9/46d(left)` -> `NAC` ([Haber, 2010]): hypothesis premise [Luo, 2011] has no DOI or PMID"));
    expect(errors).toContainEqual(expect.stringContaining("connections.json: `A9/46d(left)` -> `NAC` ([Haber, 2010]): the first hypothesis premise ([Luo, 2011]) must be the paper of this record"));
    // hypotheses.json is still written, with the hypotheses as the agent wrote them
    expect(readJson(p.hypotheses).hypotheses.map((h: { id: string }) => h.id)).toEqual(["H1", "H2"]);
  });

  it("sends a share above the limit back (exactly at the limit is allowed)", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    // 1 of 4 connections and 1 of 4 UCs: 25% is above 20% and within 30%
    const over = await checkPhase("HCD", p, depsOf(evidenceOf([scope("S1")], { maxShare: 0.2 })), ctxOf());
    expect(hypothesisErrors(over.errors)).toEqual([
      expect.stringMatching(/^Hypotheses make up 1 of 4 connections, more than the 0 this project's limit of 20% allows\./),
      expect.stringMatching(/^Hypotheses make up 1 of 4 UCs, more than the 0 this project's limit of 20% allows\./),
    ]);
    const within = await checkPhase("HCD", p, depsOf(evidenceOf([scope("S1")], { maxShare: 0.3 })), ctxOf());
    expect(hypothesisErrors(within.errors)).toEqual([]);
    expect(readJson(p.hypotheses).share.connections).toEqual({ count: 1, total: 4, ratio: 0.25, limit: 0.3 });
  });

  it("writes the same CSVs as strict mode for a hypothesis-mode project without hypotheses", async () => {
    const strict = freshWorkspace();
    const hyp = freshWorkspace();
    for (const [p, deps] of [
      [strict, depsOf()],
      [hyp, depsOf(evidenceOf())],
    ] as const) {
      writeStrictHcd(p);
      cpSync(join(FIXTURE, "FRG", "frg.json"), join(p.frg, "frg.json"));
      writeFileSync(p.report, fixture("report_hcd.md") + fixture("report_frg.md"));
      const ctx = ctxOf();
      for (const phase of PHASES) expect((await checkPhase(phase, p, deps, ctx)).errors, phase).toEqual([]);
    }
    for (const f of ["Circuits.csv", "Connections.csv", "FRG.csv", "References.csv"]) expect(readFileSync(join(hyp.csv, f), "utf8"), f).toBe(readFileSync(join(strict.csv, f), "utf8"));
    expect(readJson(hyp.hypotheses)).toMatchObject({ hypotheses: [], evidenceOnlyPath: true, gns: [], share: { connections: { count: 0, total: 4 }, ucs: { count: 0, total: 4 } } });
    expect(readJson(hyp.crossCheck).hypotheses).toEqual({ count: 0, evidenceOnlyPath: true, pathWithHypotheses: true, gns: [] });
  });
});

// --- 2. strict projects -------------------------------------------------------------------------------------------

describe("strict projects (no evidence mode)", () => {
  it("never writes hypotheses.json and keeps cross_check.json without a hypotheses record", async () => {
    for (const evidence of [undefined, { ...evidenceSettingsOf(null) }, evidenceSettingsOf({ evidenceMode: "strict", hypothesisScopes: [scope("S1")], hypothesisMaxShare: 0.5 })]) {
      const p = freshWorkspace();
      const deps = depsOf(evidence);
      const ctx = ctxOf();
      writeStrictHcd(p);
      expect((await checkPhase("HCD", p, deps, ctx)).errors).toEqual([]);
      cpSync(join(FIXTURE, "FRG", "frg.json"), join(p.frg, "frg.json"));
      writeFileSync(p.report, fixture("report_hcd.md") + fixture("report_frg.md"));
      expect((await checkPhase("FRG", p, deps, ctx)).errors).toEqual([]);
      expect((await checkPhase("CSV", p, deps, ctx)).errors).toEqual([]);
      expect(existsSync(p.hypotheses)).toBe(false);
      const cross = readJson(p.crossCheck);
      expect(cross).not.toHaveProperty("hypotheses");
      expect(ctx.cross).not.toHaveProperty("hypotheses");
      const text = ["Circuits.csv", "Connections.csv", "FRG.csv"].map((f) => readFileSync(join(p.csv, f), "utf8")).join("\n");
      expect(text).not.toMatch(/Hypothes|Depends on hypotheses/);
    }
  });

  it("sends a hypothesis key back with \"does not allow hypotheses\" and never reads it into the CSVs", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    writeFileSync(p.report, fixture("report_hcd.md"));
    const ctx = ctxOf();
    const r = await checkPhase("HCD", p, depsOf(), ctx);
    const strict = r.errors.filter((e) => e.includes("does not allow hypotheses"));
    expect(strict).toHaveLength(2);
    expect(strict[0]).toMatch(/^uc\.json: 1 UC\(s\) have a hypothesis \(`NAC`\), but this project does not allow hypotheses/);
    expect(strict[1]).toMatch(/^connections\.json: 1 connection\(s\) have a hypothesis \(`A9\/46d\(left\)` -> `NAC`\), but this project does not allow hypotheses/);
    expect(strict[1]).toContain('"Allow hypotheses"');
    // the hypothesis-mode checks do not run on a strict project: Hypothetical is an ordinary method there
    expect(r.errors.filter((e) => /scope|researchCandidate|## Hypotheses|evidence-only/.test(e))).toEqual([]);
    expect(ctx.hcd?.ucs.some((u) => u.hypothesis) || ctx.hcd?.connections.some((c) => c.hypothesis)).toBe(false);
    expect(existsSync(p.hypotheses)).toBe(false);
  });
});

// --- 3. quotes ----------------------------------------------------------------------------------------------------

describe("premise quotes of hypothesis connections", () => {
  const quoteChecker = () => {
    const v = new QuoteVerifier({
      fetch: mockLiterature({ epmc: [HABER_EPMC, SCHULTZ_EPMC], fulltext: { [HABER_EPMC.pmcid]: HABER_FULLTEXT } }).fetch,
      europePmcUrl: EUROPE_PMC,
      eutilsUrl: EUTILS,
      biocUrl: BIOC,
      crossrefUrl: CROSSREF,
      semanticScholarUrl: S2,
      retries: 0,
      sleep: async () => {},
    });
    return { threshold: v.threshold, verify: (reqs: QuoteRequest[]) => v.verify(reqs) };
  };
  const INVENTED = "Fibers from the left dorsolateral area 9/46 project densely and directly to the shell of the nucleus accumbens in the macaque monkey.";

  it("verifies the premise quote against the paper like every quote", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    const r = await checkPhase("HCD", p, depsOf(evidenceOf(), { quoteChecker: quoteChecker() }), ctxOf());
    expect(r.errors).toEqual([]);
    const report = readJson(p.quoteCheck);
    expect(report.quotes.find((q: { sender: string }) => q.sender === "A9/46d(left)")).toMatchObject({ receiver: "NAC", status: "verified_fulltext" });
  });

  it("sends a premise quote that is not in the paper back as not_found", async () => {
    const p = freshWorkspace();
    expect(HABER_FULLTEXT).not.toContain("area 9/46");
    writeHypothesisHcd(p, { quote: INVENTED });
    const ctx = ctxOf();
    const r = await checkPhase("HCD", p, depsOf(evidenceOf(), { quoteChecker: quoteChecker() }), ctx);
    expect(r.errors).toContainEqual(expect.stringContaining("connections.json: `A9/46d(left)` -> `NAC` ([Haber, 2010]): pointersOnLiterature is not in the paper (checked against its full text: Europe PMC PMC3055449"));
    expect(hypothesisErrors(r.errors)).toEqual([]);
    const report = readJson(p.quoteCheck);
    expect(report.summary.not_found).toBe(1);
    expect(report.quotes.find((q: { sender: string }) => q.sender === "A9/46d(left)")).toMatchObject({ receiver: "NAC", quote: INVENTED, status: "not_found" });
    expect(ctx.quotes?.problems).toHaveLength(1);
  });
});

// --- 4. research mode ---------------------------------------------------------------------------------------------

describe("hypotheses in research mode", () => {
  function researchJson(status: string) {
    const candidate = (id: string, sender: string, receiver: string, st: string) => ({
      id,
      sender,
      receiver,
      rationale: "Context input needed for value learning",
      queries: [{ source: "pubmed", query: `${sender} ${receiver} tracing macaque` }],
      coverage: { tractTracing: "searched_none", primate: "searched_none", rodent: "found", cellTypeLayer: "not_applicable" },
      evidence: [],
      status: st,
      note: "No primate tracing study states this projection.",
    });
    return {
      plan: { scope: "Mesolimbic dopamine system, reward prediction error learning, primates", strategy: "PubMed and Europe PMC: tracing and physiology of the VTA and the accumbens" },
      candidates: [candidate("C1", "area 9/46d", "nucleus accumbens", status), candidate("C2", "nucleus accumbens", "ventral tegmental area", "weak")],
      gaps: "",
    };
  }

  it("accepts a hypothesis whose research candidate is not_found (or weak)", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p, { researchCandidates: ["C1", "C2"] });
    writeJson(p.research, researchJson("not_found"));
    const r = await checkPhase("HCD", p, depsOf(evidenceOf([scope("S1")], { researchMode: true })), ctxOf());
    expect(r.errors).toEqual([]);
    expect(readJson(p.hypotheses).hypotheses.map((h: { id: string; researchCandidate?: string }) => [h.id, h.researchCandidate])).toEqual([
      ["H1", "C2"],
      ["H2", "C1"],
    ]);
  });

  it("sends a hypothesis back whose research candidate is contradicted, missing or unknown", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p, { researchCandidates: ["C1", "C2"] });
    writeJson(p.research, researchJson("contradicted"));
    const deps = depsOf(evidenceOf([scope("S1")], { researchMode: true }));
    const contradicted = await checkPhase("HCD", p, deps, ctxOf());
    expect(hypothesisErrors(contradicted.errors)).toEqual([
      "connections.json: `A9/46d(left)` -> `NAC` ([Haber, 2010]): researchCandidate C1 is contradicted in research.json: the literature contradicts this claim, so it cannot be included as a hypothesis. Remove it.",
    ]);

    rmSync(p.research);
    const missingFile = await checkPhase("HCD", p, deps, ctxOf());
    expect(hypothesisErrors(missingFile.errors)).toEqual([
      expect.stringContaining("uc.json: `NAC`: researchCandidate C2 is not a candidate in research.json"),
      expect.stringContaining("connections.json: `A9/46d(left)` -> `NAC` ([Haber, 2010]): researchCandidate C1 is not a candidate in research.json"),
    ]);

    writeHypothesisHcd(p);
    writeJson(p.research, researchJson("not_found"));
    const none = await checkPhase("HCD", p, deps, ctxOf());
    expect(hypothesisErrors(none.errors)).toEqual([expect.stringContaining("uc.json: `NAC`: researchCandidate is required in research mode"), expect.stringContaining("researchCandidate is required in research mode")]);
  });

  it("rejects researchCandidate in a project without research mode", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p, { researchCandidates: ["C1", "C2"] });
    writeJson(p.research, researchJson("not_found"));
    const r = await checkPhase("HCD", p, depsOf(evidenceOf()), ctxOf());
    expect(hypothesisErrors(r.errors)).toEqual([
      expect.stringContaining("uc.json: `NAC`: researchCandidate C2 is only for research mode"),
      expect.stringContaining("connections.json: `A9/46d(left)` -> `NAC` ([Haber, 2010]): researchCandidate C1 is only for research mode"),
    ]);
  });
});

// --- 5. GN targets ------------------------------------------------------------------------------------------------

describe("scopes that target FRG GNs", () => {
  const gnScope = (gnIds: string[]) => [scope("S1", { kind: "items", circuitIds: [], gnIds })];

  it("resolves a GN target through frg.json in the workspace, also in the HCD check", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    const deps = depsOf(evidenceOf(gnScope(["R.Value-Learning"])));
    // before frg.json exists the GN has no UCs, so both hypotheses are outside the scope
    const before = await checkPhase("HCD", p, deps, ctxOf());
    expect(hypothesisErrors(before.errors)).toEqual([
      expect.stringMatching(/^uc\.json: `NAC`: hypothesis \(role\) is outside every hypothesis scope of this project \(S1: .* on FRG GNs `R\.Value-Learning` \(their UCs\)\)\./),
      expect.stringMatching(/^connections\.json: `A9\/46d\(left\)` -> `NAC` \(\[Haber, 2010\]\): hypothesis \(existence\) is outside every hypothesis scope/),
    ]);

    // R.Value-Learning holds U.VTA and U.NAC: the NAC UC and the connection ending on NAC are inside
    cpSync(join(FIXTURE, "FRG", "frg.json"), join(p.frg, "frg.json"));
    const after = await checkPhase("HCD", p, deps, ctxOf());
    expect(after.errors).toEqual([]);
    // a parent GN covers the UCs of its sub-GNs (all levels)
    expect((await checkPhase("HCD", p, depsOf(evidenceOf(gnScope(["R.Reward-Prediction-Error-Learning"]))), ctxOf())).errors).toEqual([]);

    writeFileSync(p.report, hypothesisReport({ frg: true }));
    const ctx = ctxOf();
    expect((await checkPhase("FRG", p, deps, ctx)).errors).toEqual([]);
    expect(readJson(p.hypotheses).scopes).toEqual(gnScope(["R.Value-Learning"]));
  });

  it("checks the hypotheses again in the FRG and CSV phases when the FRG moves a hypothesis out of its GN scope", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    writeFrg(p);
    const deps = depsOf(evidenceOf(gnScope(["R.Value-Learning"])));
    const ctx = ctxOf();
    expect((await checkPhase("HCD", p, deps, ctx)).errors).toEqual([]);
    // the agent renames the GN in the FRG phase: the HCD files are unchanged, but the scope's GN no longer exists
    writeFileSync(join(p.frg, "frg.json"), readFileSync(join(FIXTURE, "FRG", "frg.json"), "utf8").replaceAll("R.Value-Learning", "R.Value-Update"));
    writeFileSync(p.report, hypothesisReport({ frg: true }).replaceAll("R.Value-Learning", "R.Value-Update"));
    const outside = [
      expect.stringMatching(/^HCD \(hypotheses checked again against the current files\): uc\.json: `NAC`: hypothesis \(role\) is outside every hypothesis scope/),
      expect.stringMatching(/^HCD \(hypotheses checked again against the current files\): connections\.json: `A9\/46d\(left\)` -> `NAC` \(\[Haber, 2010\]\): hypothesis \(existence\) is outside every hypothesis scope/),
    ];
    expect((await checkPhase("FRG", p, deps, ctx)).errors).toEqual(outside);
    expect((await checkPhase("CSV", p, deps, ctx)).errors).toEqual(outside);
    // strict projects never run it
    const strict = freshWorkspace();
    writeStrictHcd(strict);
    writeFrg(strict, fixture("report_hcd.md") + fixture("report_frg.md"));
    const strictCtx = ctxOf();
    await checkPhase("HCD", strict, depsOf(), strictCtx);
    expect((await checkPhase("FRG", strict, depsOf(), strictCtx)).errors.filter((e) => e.includes("checked again"))).toEqual([]);
  });

  it("keeps hypotheses outside a GN target that does not hold their UCs", async () => {
    const p = freshWorkspace();
    writeHypothesisHcd(p);
    const frg = fixtureJson("FRG/frg.json");
    frg.nodes[1].subnodes = ["U.VTA"]; // the GN no longer holds NAC
    writeJson(join(p.frg, "frg.json"), frg);
    const r = await checkPhase("HCD", p, depsOf(evidenceOf(gnScope(["R.Value-Learning", "R.Unknown"]))), ctxOf());
    // H2 (A9 -> NAC) touches no target; H1 (NAC) is connected to the target VTA, so it is inside
    expect(hypothesisErrors(r.errors)).toEqual([expect.stringMatching(/^connections\.json: `A9\/46d\(left\)` -> `NAC` \(\[Haber, 2010\]\): hypothesis \(existence\) is outside every hypothesis scope/)]);
  });
});

// --- 6. / 7. hypothesis rules in the prompts ----------------------------------------------------------------------

describe("hypothesis rules (prompts/phases/HYPOTHESIS.md)", () => {
  const SPEC = readFileSync(join(PROMPTS, "phases", "HYPOTHESIS.md"), "utf8");
  const SCOPES: HypothesisScope[] = [
    scope("S1", { kind: "all" }, ["existence", "direction"]),
    { ...scope("S2", { kind: "items", circuitIds: ["VTA"], gnIds: ["R.Value-Learning"] }, ["role"]), note: 'Only the "feedback" loop of the accumbens' },
  ];
  const settings = (maxShare: number, scopes = SCOPES): EvidenceSettings => ({ mode: "hypothesis", scopes, maxShare });

  it("adds nothing to the prompts of strict projects (without reading the spec)", async () => {
    const missing = join(here, "no-such-prompts-dir");
    for (const e of [
      evidenceSettingsOf(null),
      evidenceSettingsOf({}),
      evidenceSettingsOf({ evidenceMode: "strict", hypothesisScopes: SCOPES, hypothesisMaxShare: 0.3 }),
      evidenceSettingsOf({ evidenceMode: "hypotheses", hypothesisScopes: SCOPES }),
    ]) {
      expect(e.mode).toBe("strict");
      expect(await hypothesisRules(missing, PROJECT_ID, e, { researchMode: false })).toBe("");
      expect(await hypothesisRules(PROMPTS, PROJECT_ID, e, { researchMode: true })).toBe("");
    }
  });

  it("inserts a user's note literally, even with $ replacement patterns", async () => {
    const note = "costs $$5, see $' and $& here";
    const rules = await hypothesisRules(PROMPTS, PROJECT_ID, { mode: "hypothesis", scopes: [{ ...scope("S1"), note }], maxShare: 0.2 }, { researchMode: false });
    expect(rules).toContain(`(note from the user: ${JSON.stringify(note)})`);
    expect(rules.match(/### Never/g)).toHaveLength(1);
  });

  it("fills in the project ID, the scopes with the user's notes, the share limit and the research mode", async () => {
    const off = await hypothesisRules(PROMPTS, PROJECT_ID, settings(0.2), { researchMode: false });
    expect(off).not.toMatch(/\{(P|SCOPES|MAX_SHARE|RESEARCH_MODE)\}/);
    expect(off).not.toMatch(/\{[A-Z_]+\}/);
    expect(off.startsWith("## Hypothesis mode (this project)")).toBe(true);
    expect(off).toContain(`\`${PROJECT_ID}/research.json\``);
    expect(off).toContain(`\`${PROJECT_ID}/hypotheses.json\``);
    expect(off).toContain(`\`${PROJECT_ID}/decision_log.md\``);
    expect(off).toContain(
      "- S1: existence, direction on the whole HCD\n" +
        '- S2: role on circuits `VTA` and FRG GNs `R.Value-Learning` (their UCs) (note from the user: "Only the \\"feedback\\" loop of the accumbens")',
    );
    expect(off).toContain("- Hypothesis share limit: 20% of the connections and 20% of the UCs.");
    expect(off).toContain("must each be at most 20%");
    expect(off).toContain("- Research mode: off: leave `researchCandidate` out and name the searches in `rationale`.");
    expect(off).not.toContain("Research mode: on");

    const on = await hypothesisRules(PROMPTS, PROJECT_ID, settings(0.3), { researchMode: true });
    expect(on).toContain("- Hypothesis share limit: 30% of the connections and 30% of the UCs.");
    expect(on).toContain("- Research mode: on: every hypothesis names its research.json candidate in `researchCandidate`.");
    expect(on).not.toContain("Research mode: off");
    // only the placeholders differ
    expect(on.replace(/30%/g, "20%").replace(/Research mode: on: [^\n]*/, "")).toBe(off.replace(/Research mode: off: [^\n]*/, ""));

    const none = await hypothesisRules(PROMPTS, PROJECT_ID, settings(0.1, []), { researchMode: false });
    expect(none).toContain("- (none: no hypothesis is allowed until the user adds a scope)");
    expect(none).toContain("10% of the connections");
  });

  it("proposes no further investigation: the only such words are prohibitions", () => {
    const SUGGESTION = /future (work|stud)|should be (tested|investigated|studied)|next experiment|we suggest|we propose|predict/i;
    const never = /### Never\n+([\s\S]*)$/.exec(SPEC);
    expect(never, "### Never section").not.toBeNull();
    expect(never![1]).toMatch(/^Do not propose further investigations, experiments, tests or predictions, and do not list what should be studied next/);
    const outside = SPEC.slice(0, never!.index);
    // sentences outside the Never section that use such words must themselves forbid them
    const sentences = outside.split(/(?<=[.!?])\s+|\n+/).filter((x) => SUGGESTION.test(x));
    for (const x of sentences) expect(x, x).toMatch(/\b(no|not|never|nothing)\b/i);
  });

  it("leaves the strict prompts untouched: they never mention the hypothesis rules", () => {
    const files = ["AGENTS.md", "research_mode.md", "phases/HCD.md", "phases/FRG.md", "phases/HCD_roi_rules.md", "phases/FRG_gn_rules.md"];
    for (const f of files) {
      const text = readFileSync(join(PROMPTS, f), "utf8");
      expect(text, f).not.toMatch(/HYPOTHESIS\.md|hypotheses\.json|"hypothesis"\s*:|Allow hypotheses|researchCandidate|\{(SCOPES|MAX_SHARE|RESEARCH_MODE)\}/);
    }
  });
});
