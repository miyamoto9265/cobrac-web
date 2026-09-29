/**
 * HCD → FRG → CSV through the real phase driver and validators, with a scripted mock agent in place of Codex and
 * the mock RCS server for the SABRA lookups; then csv_to_excel.py and the graph builder as in finalize.ts.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGraphs, parseCsvObjects, replyLanguageInstruction, validateJsonSchema, type JsonSchema } from "@cobrac/shared";
import { PHASES, checkPhase, runPhases, turnInput, writeSchemas, type CheckDeps, type Phase, type PhaseContext, type PhaseDriver, type Prompt } from "../src/pipeline.js";
import { RcsClient } from "../src/rcs.js";
import { ReferenceVerifier } from "../src/references.js";
import { CROSSREF, DOI_ORG, EUTILS, HABER_WORK, SCHULTZ_WORK, mockLiterature, type Failure } from "./mockLiterature.js";
import { isLegacyWorkspace, loadHcdFiles, projectPaths, type ProjectPaths } from "../src/steps.js";
import { startMockRcs, type MockRcs } from "./mockRcsServer.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "reward");
const PROMPTS = join(here, "..", "..", "..", "prompts");
const PROJECT_ID = "u7m2q9xa-1";
const TOKEN = "pipeline-token";

let rcs: MockRcs;
let workDir: string;

beforeAll(async () => {
  rcs = await startMockRcs(TOKEN);
});
afterAll(async () => {
  await rcs.close();
});

function freshWorkspace(): ProjectPaths {
  workDir = mkdtempSync(join(tmpdir(), "cobrac-pipeline-"));
  const p = projectPaths(workDir, PROJECT_ID);
  for (const d of [p.hcd, p.frg, p.csv]) mkdirSync(d, { recursive: true });
  return p;
}

const fixture = (f: string) => readFileSync(join(FIXTURE, f), "utf8");

/** Mock agent: writes the fixture files for each phase prompt; the first HCD attempt has a wrong interface. */
function mockAgent(p: ProjectPaths, script: { brokenFirstHcd?: boolean; skipFrg?: boolean } = {}) {
  const turns: string[] = [];
  const turn = async (prompt: Prompt) => {
    turns.push(prompt.shown.split("\n")[0]);
    if (prompt.shown.startsWith("Run phase HCD")) {
      writeFileSync(p.meta, fixture("meta.json"));
      writeFileSync(p.decisionLog, fixture("decision_log.md"));
      writeFileSync(p.report, fixture("report_hcd.md"));
      for (const f of ["references.json", "uc.json", "connections.json"]) cpSync(join(FIXTURE, "HCD", f), join(p.hcd, f));
      if (script.brokenFirstHcd) {
        const uc = JSON.parse(fixture("HCD/uc.json"));
        uc.ucs[2].interface = "([U.VTA]) = NAC([U.A9/46d@L])";
        writeFileSync(join(p.hcd, "uc.json"), JSON.stringify(uc, null, 2));
      }
    } else if (prompt.shown.startsWith("Fix HCD")) {
      expect(prompt.shown).toMatch(/`NAC`: interface inputs/);
      cpSync(join(FIXTURE, "HCD", "uc.json"), join(p.hcd, "uc.json"));
    } else if (prompt.shown.startsWith("Run phase FRG") && !script.skipFrg) {
      cpSync(join(FIXTURE, "FRG", "frg.json"), join(p.frg, "frg.json"));
      writeFileSync(p.report, fixture("report_hcd.md") + fixture("report_frg.md"));
    }
    return true;
  };
  return { turn, turns };
}

function depsOf(): CheckDeps {
  const client = new RcsClient({ url: rcs.url, token: TOKEN });
  return {
    lookupSabra: (ids) => client.lookupHomba(ids),
    csvOptions: async () => ({ projectId: PROJECT_ID, contributor: "Tester", projectTemplate: readFileSync(join(PROMPTS, "Project.csv"), "utf8") }),
  };
}

function driver(p: ProjectPaths, agent: Pick<ReturnType<typeof mockAgent>, "turn">, accepted: Phase[], warnings: string[][]): PhaseDriver {
  const ctx: PhaseContext = { hcd: null, frg: null };
  const deps = depsOf();
  return {
    maxNudges: 2,
    turn: agent.turn,
    check: (phase) => checkPhase(phase, p, deps, ctx),
    hasFiles: (phase) => readdirSync(phase === "HCD" ? p.hcd : phase === "FRG" ? p.frg : p.csv).length > 0,
    phasePrompt: async (phase) => ({ shown: `Run phase ${phase}` }),
    fixPrompt: async (phase, errors) => ({ shown: `Fix ${phase}\n${errors.join("\n")}` }),
    onWarn: async (_phase, errors) => void warnings.push(errors),
    onAccepted: async (phase) => void accepted.push(phase),
  };
}

const hasPandas = spawnSync(process.env.PYTHON_BIN ?? "python3", ["-c", "import pandas, openpyxl"]).status === 0;

describe("phase pipeline with a mock agent", () => {
  it("writes the JSON Schemas the agent reads, and they accept the fixtures", async () => {
    const p = freshWorkspace();
    await writeSchemas(workDir);
    const dir = join(workDir, "schemas");
    expect(readdirSync(dir).sort()).toEqual(["connections.schema.json", "frg.schema.json", "meta.schema.json", "references.schema.json", "uc.schema.json"]);
    for (const [schema, file] of [
      ["meta", "meta.json"],
      ["references", "HCD/references.json"],
      ["uc", "HCD/uc.json"],
      ["connections", "HCD/connections.json"],
      ["frg", "FRG/frg.json"],
    ]) {
      const s = JSON.parse(readFileSync(join(dir, `${schema}.schema.json`), "utf8")) as JsonSchema;
      expect(validateJsonSchema(s, JSON.parse(fixture(file))), file).toEqual([]);
    }
    rmSync(p.root, { recursive: true, force: true });
  });

  it("runs HCD (with one fix round) → FRG → CSV and produces the xlsx and graphs", async () => {
    const p = freshWorkspace();
    const agent = mockAgent(p, { brokenFirstHcd: true });
    const accepted: Phase[] = [];
    const warnings: string[][] = [];
    const run = await runPhases(driver(p, agent, accepted, warnings), 0, { shown: "Run phase HCD" });

    expect(run).toEqual({ result: "completed" });
    expect(agent.turns).toEqual(["Run phase HCD", "Fix HCD", "Run phase FRG"]);
    expect(accepted).toEqual(PHASES);
    expect(warnings).toEqual([]);
    expect(rcs.calls.some((c) => c.body.params?.arguments?.homba_id === "HOMBA:12261")).toBe(true);

    const csv = (f: string) => readFileSync(join(p.csv, f), "utf8");
    expect(parseCsvObjects(csv("Project.csv"))[0]).toMatchObject({ Contributor: "Tester", "Project ID": PROJECT_ID });
    expect(parseCsvObjects(csv("References.csv")).map((r) => r["Reference ID"])).toEqual(["[Schultz, 1997]", "[Haber, 2010]", "[Luo, 2011]"]);
    const circuits = parseCsvObjects(csv("Circuits.csv"));
    expect(circuits.map((c) => [c["Circuit ID"], c["UC Descriptor"]])).toEqual([
      [`ROI_${PROJECT_ID}`, ""],
      ["Mesolimbic", ""],
      ["A9/46d@L", "BNA:15"],
      ["VTA", "HOMBA:12261"],
      ["NAC", "BNA:223-224"],
      ["Arc", "HOMBA:10492"],
    ]);
    expect(circuits[0]).toMatchObject({ "Sub-Circuits": "Mesolimbic;VTA;NAC", Uniform: "FALSE" });
    expect(circuits[1]).toMatchObject({ "Source of ID": "collection", "Sub-Circuits": "VTA;NAC", Uniform: "FALSE" });
    expect(circuits[2].Comments).toBe("Prefrontal context input to the striatum; noROI(input)");
    const frg = parseCsvObjects(csv("FRG.csv"));
    expect(frg.map((r) => r["Node ID"])).toEqual(["R.Reward-Prediction-Error-Learning", "R.Value-Learning", "U.A9/46d@L", "U.VTA", "U.NAC", "U.Arc"]);
    expect(frg.find((r) => r["Node ID"] === "U.NAC")?.["Projected Circuits"]).toBe("VTA;Arc");

    const g = buildGraphs(PROJECT_ID, {
      circuitsCsv: csv("Circuits.csv"),
      connectionsCsv: csv("Connections.csv"),
      frgCsv: csv("FRG.csv"),
      referencesCsv: csv("References.csv"),
    });
    expect(g.hcd.nodes).toHaveLength(4);
    expect(g.hcd.edges).toHaveLength(4);
    expect(g.hcd.collections).toEqual([expect.objectContaining({ id: "Mesolimbic", members: ["VTA", "NAC"] })]);
    expect(g.frg.nodes.find((n) => n.id === "R.Reward-Prediction-Error-Learning")?.kind).toBe("tlf");

    if (process.env.COBRAC_TEST_XLSX === "1") expect(hasPandas, "python3 with pandas/openpyxl (prompts/requirements.txt)").toBe(true);
    if (hasPandas) {
      const out = join(p.csv, `${PROJECT_ID}.bra.xlsx`);
      const py = spawnSync(
        process.env.PYTHON_BIN ?? "python3",
        [join(PROMPTS, "csv_to_excel.py"), "--contributor", "Tester", "--project-id", PROJECT_ID, "--base-dir", workDir, "--output", out],
        { encoding: "utf8" },
      );
      expect(py.status, py.stderr).toBe(0);
      const sheets = spawnSync(
        process.env.PYTHON_BIN ?? "python3",
        [
          "-c",
          [
            "import openpyxl,sys",
            "wb=openpyxl.load_workbook(sys.argv[1])",
            "print(wb.sheetnames)",
            "c=wb['Circuits']",
            "print([x.value for x in c[1]])",
            "print([[x.value for x in r][:6] for r in c.iter_rows(min_row=2, max_row=4)])",
            "print([x.value for x in wb['References'][1]])",
            "print([[x.value for x in r][:2] for r in wb['Project'].iter_rows(min_row=4, max_row=8)])",
            "f=wb['FRG']",
            "print([[x.value for x in r][4] for r in f.iter_rows(min_row=2) if r[0].value in ('U.A9/46d@L','U.VTA')])",
            "print([x.value for x in wb['Connections'][2]][:6])",
          ].join("\n"),
          out,
        ],
        { encoding: "utf8" },
      );
      expect(sheets.status, sheets.stderr).toBe(0);
      const lines = sheets.stdout.trim().split("\n");
      expect(lines[0]).toBe("['Project', 'References', 'Circuits', 'Connections', 'FRG']");
      expect(lines[1]).toMatch(/^\['Circuit ID', 'Source of ID', 'Names', 'Sub-Circuits', 'Super Class', 'Uniform', .*'Project ID', 'UC Descriptor'\]$/);
      expect(lines[2]).toBe(`[['ROI_${PROJECT_ID}', 'collection', 'Mesolimbic dopamine system', 'Mesolimbic;VTA;NAC', None, False], ['Mesolimbic', 'collection', 'Mesolimbic pathway', 'VTA;NAC', None, False], ['A9/46d@L', 'BNA', 'left dorsal area 9/46', None, None, True]]`);
      expect(lines[3]).toBe("['Reference ID', 'DOI', 'Literature type', 'Alternative URL']");
      expect(lines[4]).toBe("[['Sheet Name', 'Review End Line'], ['References', 4], ['Circuits', 7], ['Connections', 5], ['FRG', 7]]");
      expect(lines[5]).toMatch(/^\['No need for description due to input\/output circuit', 'Temporal-difference/);
      expect(lines[5]).not.toMatch(/grainest/);
      expect(lines[6]).toBe("['A9/46d@L', '<', 'dorsolateral prefrontal cortex', 'NAC', '<', 'ventral striatum']");
    }
    rmSync(p.root, { recursive: true, force: true });
  });

  it("fails the phase when the agent never writes it", async () => {
    const p = freshWorkspace();
    const agent = mockAgent(p, { skipFrg: true });
    const accepted: Phase[] = [];
    const run = await runPhases(driver(p, agent, accepted, []), 0, { shown: "Run phase HCD" });
    expect(run).toMatchObject({ result: "failed", phase: "FRG" });
    if (run.result === "failed") expect(run.errors.join("\n")).toMatch(/frg\.json is missing/);
    expect(agent.turns).toEqual(["Run phase HCD", "Run phase FRG", "Fix FRG", "Fix FRG"]);
    expect(accepted).toEqual(["HCD"]);
    rmSync(p.root, { recursive: true, force: true });
  });

  it("sends problems back as fixes to the data files (never CSV writing), and fails when the CSVs cannot be built", async () => {
    const p = freshWorkspace();
    await runPhases(driver(p, mockAgent(p), [], []), 0, { shown: "Run phase HCD" });
    const uc = JSON.parse(readFileSync(join(p.hcd, "uc.json"), "utf8"));
    uc.ucs[1].comments = "報酬予測誤差";
    writeFileSync(join(p.hcd, "uc.json"), JSON.stringify(uc));
    const agent = mockAgent(p);
    const turns: string[] = [];
    const d = driver(p, agent, [], []);
    const run = await runPhases({ ...d, maxNudges: 1, turn: async (pr) => (turns.push(pr.shown), true) }, 0, null);
    // HCD keeps the (non-fatal) issue after the allowed fix, FRG passes, and the CSV check refuses the text
    expect(run).toMatchObject({ result: "failed", phase: "CSV" });
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatch(/^Fix HCD\nuc\.json: write every value in English; non-English text at \/ucs\/1\/comments/);
    expect(turns[1]).toMatch(/^Fix CSV\nCircuits\.csv would contain non-English text/);
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe("projects written before the BRA value rules (0.9 format)", () => {
  /** HCD files as 0.9 wrote them: Source of ID lists, several references per connection, no Literature type, locators as pointers. */
  function toOldFormat(p: ProjectPaths) {
    const refs = JSON.parse(fixture("HCD/references.json"));
    for (const r of refs.references) delete r.literatureType;
    writeFileSync(join(p.hcd, "references.json"), JSON.stringify(refs, null, 2));
    const uc = JSON.parse(fixture("HCD/uc.json"));
    uc.ucs[1].sourceOfId = ["[Schultz, 1997]", "[Haber, 2010]"];
    writeFileSync(join(p.hcd, "uc.json"), JSON.stringify(uc, null, 2));
    const c = JSON.parse(fixture("HCD/connections.json"));
    Object.assign(c.connections[1], { referenceIds: ["[Schultz, 1997]", "[Haber, 2010]"], taxon: "Macaca mulatta", pointersOnLiterature: "p.1594" });
    for (const x of c.connections) for (const k of ["senderRelation", "senderInLiterature", "receiverRelation", "receiverInLiterature"]) delete x[k];
    writeFileSync(join(p.hcd, "connections.json"), JSON.stringify(c, null, 2));
  }

  it("asks the agent to fix them on a follow-up and still writes valid CSVs when the problems remain", async () => {
    const p = freshWorkspace();
    await runPhases(driver(p, mockAgent(p), [], []), 0, { shown: "Run phase HCD" });
    toOldFormat(p);
    const warnings: string[][] = [];
    const turns: string[] = [];
    const d = driver(p, mockAgent(p), [], warnings);
    const run = await runPhases({ ...d, maxNudges: 1, turn: async (pr) => (turns.push(pr.shown), true) }, 0, null);
    expect(run).toEqual({ result: "completed" });
    expect(turns).toHaveLength(1);
    const fix = turns[0];
    expect(fix).toMatch(/references\.json: \/references\/0\/literatureType is required/);
    expect(fix).toMatch(/uc\.json: \/ucs\/1\/sourceOfId must be string \(got array\)/);
    expect(fix).toMatch(/`VTA` -> `NAC` cites 2 references; write one connection per reference/);
    expect(fix).toMatch(/\/connections\/1\/taxon must be one of/);
    expect(fix).toMatch(/pointersOnLiterature starts with a page or section locator/);
    expect(fix).toMatch(/\/connections\/0\/senderRelation is required/);
    expect(warnings).toHaveLength(1);

    const csv = (f: string) => parseCsvObjects(readFileSync(join(p.csv, f), "utf8"));
    expect(csv("Circuits.csv").find((r) => r["Circuit ID"] === "VTA")?.["Source of ID"]).toBe("[Schultz, 1997]");
    const vtaNac = csv("Connections.csv").filter((r) => r["Sender Circuit ID (sCID)"] === "VTA" && r["Receiver Circuit ID (rCID)"] === "NAC");
    expect(vtaNac.map((r) => r["Reference ID"])).toEqual(["[Schultz, 1997]", "[Haber, 2010]"]);
    expect(vtaNac[0]).toMatchObject({ "sCID relation": "=", "Notation of sCID in Literature": "VTA", "rCID relation": "=", "Notation of rCID in Literature": "NAC" });
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe("reference checks in the phase pipeline", () => {
  const verifier = (fail?: (url: string) => Failure | undefined) =>
    new ReferenceVerifier({
      fetch: mockLiterature({ crossref: { [SCHULTZ_WORK.DOI]: SCHULTZ_WORK, [HABER_WORK.DOI]: HABER_WORK } }, fail).fetch,
      crossrefUrl: CROSSREF,
      doiUrl: DOI_ORG,
      eutilsUrl: EUTILS,
      retries: 0,
      sleep: async () => {},
    });
  const GHOST = { id: "[Ghost, 2019]", doi: "10.1016/j.neuron.2019.99999" };

  /** The first HCD cites an invented paper; the fix turn removes it. */
  function hallucinatingAgent(p: ProjectPaths, fixes: string[]) {
    const agent = mockAgent(p);
    const turn = async (prompt: Prompt) => {
      if (prompt.shown.startsWith("Run phase HCD")) {
        await agent.turn(prompt);
        const refs = JSON.parse(fixture("HCD/references.json"));
        refs.references.push(GHOST);
        writeFileSync(join(p.hcd, "references.json"), JSON.stringify(refs, null, 2));
        writeFileSync(p.report, fixture("report_hcd.md").replace("stores state values.", "stores state values [Ghost, 2019]."));
        return true;
      }
      if (prompt.shown.startsWith("Fix HCD")) {
        fixes.push(prompt.shown);
        cpSync(join(FIXTURE, "HCD", "references.json"), join(p.hcd, "references.json"));
        writeFileSync(p.report, fixture("report_hcd.md"));
        return true;
      }
      return agent.turn(prompt);
    };
    return { turn, turns: agent.turns };
  }

  it("sends an invented reference back to the agent and records every reference's status", async () => {
    const p = freshWorkspace();
    const fixes: string[] = [];
    const d = driver(p, hallucinatingAgent(p, fixes), [], []);
    const v = verifier();
    const run = await runPhases({ ...d, check: (phase) => checkPhase(phase, p, { ...depsOf(), verifyReferences: (r) => v.verify(r) }, { hcd: null, frg: null }) }, 0, {
      shown: "Run phase HCD",
    });
    expect(run).toEqual({ result: "completed" });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toContain("references.json: [Ghost, 2019]: DOI 10.1016/j.neuron.2019.99999 does not exist (not found in Crossref or doi.org)");

    const report = JSON.parse(readFileSync(p.referenceCheck, "utf8"));
    expect(report).toMatchObject({ phase: "FRG", lookup: "on", summary: { verified: 2, no_identifier: 1, not_found: 0 }, problems: [] });
    expect(report.references.map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([
      ["[Schultz, 1997]", "verified"],
      ["[Haber, 2010]", "verified"],
      ["[Luo, 2011]", "no_identifier"],
    ]);
    expect(report.citedAt["[Schultz, 1997]"]).toContain("frg.json /nodes/0/capability");
    rmSync(p.root, { recursive: true, force: true });
  });

  it("does not hold up the phases when the literature services are down", async () => {
    const p = freshWorkspace();
    const agent = mockAgent(p);
    const d = driver(p, agent, [], []);
    const v = verifier(() => 503);
    const run = await runPhases({ ...d, check: (phase) => checkPhase(phase, p, { ...depsOf(), verifyReferences: (r) => v.verify(r) }, { hcd: null, frg: null }) }, 0, {
      shown: "Run phase HCD",
    });
    expect(run).toEqual({ result: "completed" });
    expect(agent.turns).toEqual(["Run phase HCD", "Run phase FRG"]);
    const report = JSON.parse(readFileSync(p.referenceCheck, "utf8"));
    expect(report.summary).toMatchObject({ unverified: 2, no_identifier: 1 });
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe("legacy workspaces", () => {
  it("detects a pre-v0.8 markdown workspace", () => {
    const p = freshWorkspace();
    expect(isLegacyWorkspace(p)).toBe(false);
    writeFileSync(join(p.hcd, "3_UC.md"), "| Circuit ID |\n|---|\n| `VTA` |\n");
    expect(isLegacyWorkspace(p)).toBe(true);
    expect(loadHcdFiles(p).uc).toBeNull();
    cpSync(join(FIXTURE, "HCD", "uc.json"), join(p.hcd, "uc.json"));
    expect(isLegacyWorkspace(p)).toBe(false);
    expect(existsSync(p.meta)).toBe(false);
    rmSync(p.root, { recursive: true, force: true });
  });
});

describe("turn input", () => {
  it("appends the reply language after the phase spec, only when the request had a UI locale", () => {
    const lang = replyLanguageInstruction("ja");
    expect(turnInput({ shown: "Run phase HCD.", hidden: "SPEC" }, lang)).toBe(`Run phase HCD.\n\n---\n\nSPEC\n\n---\n\n${lang}`);
    expect(turnInput({ shown: "Fix these." }, lang)).toBe(`Fix these.\n\n---\n\n${lang}`);
    expect(turnInput({ shown: "Run phase HCD.", hidden: "SPEC" }, null)).toBe("Run phase HCD.\n\n---\n\nSPEC");
    expect(turnInput({ shown: "Fix these." }, replyLanguageInstruction(undefined))).toBe("Fix these.");
  });
});
