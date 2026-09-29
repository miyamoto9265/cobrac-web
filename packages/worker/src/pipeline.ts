/**
 * Phase driver of the CoBRAC harness, free of AWS / Codex so it can be tested with a mock agent:
 * each phase is an agent turn followed by deterministic checks and fix turns; CSV has no agent turn of its own
 * (the CSVs are generated from the JSON files, and problems are sent back as fixes to those files).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuildCsvOptions, CheckResult, CrossCheck, FrgModel, HcdModel, ProjectMeta, QuoteCheck, QuoteRequest, QuoteStatus, RefCheck, RefRow, RefStatus, ResearchCheck, ResearchOutcome, ResearchStepMetrics, ResearchSummary, SabraLookup } from "@cobrac/shared";
import {
  CROSS_RULES,
  DEFAULT_BRA_RULES,
  FRG_FILES,
  HARNESS_SCHEMAS,
  HCD_FILES,
  SCHEMA_DIR,
  buildCsvs,
  buildGraphs,
  checkCitations,
  checkCross,
  checkFrg,
  checkHcd,
  checkResearch,
  frgCitedIds,
  hombaAnchorIds,
  isFrgProblem,
  pointerProblems,
  quoteCheckMessage,
  refCheckMessage,
  schemaFileName,
  summarizeQuoteChecks,
  summarizeRefChecks,
} from "@cobrac/shared";
import { existsSync, readFileSync } from "node:fs";
import { loadFrgFiles, loadHcdFiles, type ProjectPaths } from "./steps.js";

export type Phase = "HCD" | "FRG" | "CSV";
export const PHASES: Phase[] = ["HCD", "FRG", "CSV"];

export interface Prompt {
  /** What the chat shows */
  shown: string;
  /** Appended for the agent only (phase specs) */
  hidden?: string;
  /** Local image files sent with the text (user-provided reference images) */
  images?: string[];
}

/** Text sent to the agent for one turn: shown part, hidden part and the reply-language line, separated by rules. */
export function turnInput(p: Prompt, replyLanguage: string | null): string {
  return [p.shown, p.hidden, replyLanguage].filter((s): s is string => !!s).join("\n\n---\n\n");
}

export interface PhaseCheck {
  errors: string[];
  fatal: boolean;
}

export interface PhaseContext {
  hcd: HcdModel | null;
  frg: FrgModel | null;
  /** Latest reference check (also written to reference_check.json) */
  references?: ReferenceReport | null;
  /** Latest quote check (also written to quote_check.json) */
  quotes?: QuoteReport | null;
  /** Latest HCD ↔ FRG consistency check (also written to cross_check.json) */
  cross?: CrossReport | null;
  /** phase_baseline.json, read on first use */
  baselines?: PhaseBaselines;
}

/** Contents of `{P}/cross_check.json`, rewritten by every FRG / CSV check. Record-only: nothing goes back to the agent. */
export interface CrossReport extends CrossCheck {
  checkedAt: string;
  phase: Phase;
  mode: "record-only";
  rules: typeof CROSS_RULES;
}

/**
 * The HCD / FRG files as their own phase last checked them: a hash of the data files and the problems left then
 * (accepted with warnings after the fix turns). A later phase re-validates a phase whose files changed since.
 */
export interface PhaseBaseline {
  checkedAt: string;
  hash: string;
  problems: string[];
}
export type PhaseBaselines = Partial<Record<"HCD" | "FRG", PhaseBaseline>>;

/** Contents of `{P}/quote_check.json`, rewritten by every HCD check. */
export interface QuoteReport {
  checkedAt: string;
  /** Whether the papers' texts were fetched (off: nothing was checked) */
  lookup: "on" | "off";
  /** Minimum similarity for a quote to count as found */
  threshold: number | null;
  summary: Record<QuoteStatus, number> | null;
  /** One entry per connection with a well-formed Pointers on literature */
  quotes: QuoteCheck[];
  /** Quotes sent back to the agent */
  problems: string[];
}

/** Contents of `{P}/reference_check.json`, rewritten by every HCD / FRG check. */
export interface ReferenceReport {
  checkedAt: string;
  phase: Phase;
  /** Whether the DOIs / PMIDs were looked up (off: only the citations were checked) */
  lookup: "on" | "off";
  summary: Record<RefStatus, number> | null;
  references: RefCheck[];
  /** Reference ID → where it is cited */
  citedAt: Record<string, string[]>;
  /** Every reference problem found, including those of the other phase */
  problems: string[];
}

export interface CheckDeps {
  /** RCS facts for the HOMBA anchors of the UC Descriptors (omitted when RCS is unavailable) */
  lookupSabra?: (hombaIds: string[]) => Promise<SabraLookup>;
  /** Looks up each reference's DOI / PMID (omitted: only the citations are checked) */
  verifyReferences?: (refs: RefRow[]) => Promise<RefCheck[]>;
  /** Compares each connection's Pointers on literature with the cited paper's text (omitted: not checked) */
  quoteChecker?: { threshold: number; verify: (reqs: QuoteRequest[]) => Promise<QuoteCheck[]> };
  /** Called with meta.json once the HCD passes every check */
  onMetaAccepted?: (meta: ProjectMeta) => Promise<void>;
  /** Options for Project.csv, resolved when the CSV phase runs (the user may have renamed the project) */
  csvOptions: () => Promise<BuildCsvOptions>;
}

/** Writes the JSON Schemas of the data files where the agent can read them (`<workDir>/schemas/`). */
export async function writeSchemas(workDir: string): Promise<void> {
  const dir = join(workDir, SCHEMA_DIR);
  await mkdir(dir, { recursive: true });
  for (const [file, schema] of Object.entries(HARNESS_SCHEMAS)) {
    await writeFile(join(dir, schemaFileName(file)), JSON.stringify(schema, null, 2) + "\n", "utf8");
  }
}

async function checkHcdWithRcs(paths: ProjectPaths, deps: CheckDeps) {
  const files = loadHcdFiles(paths);
  const first = checkHcd(files);
  const ids = first.model ? hombaAnchorIds([...first.model.ucs, ...first.model.collections].map((u) => u.descriptor).filter(Boolean)) : [];
  if (!deps.lookupSabra || !ids.length) return first;
  return checkHcd(files, { sabra: await deps.lookupSabra(ids) });
}

/**
 * Validate a phase (and the phases before it). The CSV phase also writes the five CSVs. HCD / FRG files that changed
 * after their own phase checked them are validated again, and their new problems are sent back with this phase's.
 */
export async function checkPhase(phase: Phase, paths: ProjectPaths, deps: CheckDeps, ctx: PhaseContext): Promise<PhaseCheck> {
  const hcd = await checkHcdWithRcs(paths, deps);
  ctx.hcd = hcd.model;
  if (phase === "HCD") {
    if (hcd.model?.meta && hcd.errors.length === 0) await deps.onMetaAccepted?.(hcd.model.meta);
    const errors = await hcdProblems(hcd, paths, deps, ctx);
    await saveBaseline("HCD", errors, paths, ctx);
    return { errors, fatal: hcd.fatal };
  }
  if (!hcd.model) return { errors: ["The HCD files cannot be used:", ...hcd.errors], fatal: true };
  const hcdErrors = await changedSinceChecked("HCD", paths, ctx, () => hcdProblems(hcd, paths, deps, ctx));

  const frg = checkFrg(loadFrgFiles(paths), hcd.model);
  ctx.frg = frg.model;
  if (frg.model) await writeCrossCheck(phase, hcd.model, frg.model, paths, ctx);
  if (phase === "FRG") {
    const errors = await frgProblems(frg, paths, deps, ctx);
    await saveBaseline("FRG", errors, paths, ctx);
    return { errors: [...hcdErrors, ...errors], fatal: frg.fatal };
  }
  if (!frg.model) return { errors: ["The FRG file cannot be used:", ...frg.errors], fatal: true };
  const frgErrors = await changedSinceChecked("FRG", paths, ctx, () => frgProblems(frg, paths, deps, ctx));

  const built = buildCsvs(hcd.model, frg.model, await deps.csvOptions());
  if (!built.files) return { errors: [...hcdErrors, ...frgErrors, ...built.errors], fatal: true };
  await mkdir(paths.csv, { recursive: true });
  for (const [name, text] of Object.entries(built.files)) await writeFile(join(paths.csv, name), text, "utf8");
  const graphError = await graphParseError(paths);
  // the CSVs are written even with re-validation problems, so that a run that ends with warnings still has them
  return { errors: [...hcdErrors, ...frgErrors, ...(graphError ? [graphError] : [])], fatal: !!graphError };
}

async function hcdProblems(hcd: CheckResult<HcdModel>, paths: ProjectPaths, deps: CheckDeps, ctx: PhaseContext): Promise<string[]> {
  const refErrors = await checkReferences("HCD", paths, deps, ctx);
  const quoteErrors = await checkQuotes(paths, deps, ctx);
  return [...new Set([...hcd.errors, ...refErrors, ...quoteErrors])];
}

async function frgProblems(frg: CheckResult<FrgModel>, paths: ProjectPaths, deps: CheckDeps, ctx: PhaseContext): Promise<string[]> {
  return [...new Set([...frg.errors, ...(await checkReferences("FRG", paths, deps, ctx))])];
}

/** Hash of the data files a phase answers for (the report and the decision log change in every phase). */
export function phaseDataHash(phase: "HCD" | "FRG", paths: ProjectPaths): string {
  const files = phase === "HCD" ? [paths.meta, ...Object.values(HCD_FILES).map((f) => join(paths.hcd, f))] : Object.values(FRG_FILES).map((f) => join(paths.frg, f));
  const h = createHash("sha256");
  for (const f of files) h.update(f).update("\0").update(readText(f) ?? "\u0001").update("\0");
  return h.digest("hex");
}

function loadBaselines(paths: ProjectPaths, ctx: PhaseContext): PhaseBaselines {
  if (!ctx.baselines) {
    try {
      ctx.baselines = JSON.parse(readText(paths.phaseBaseline) ?? "{}") as PhaseBaselines;
    } catch {
      ctx.baselines = {};
    }
  }
  return ctx.baselines;
}

async function saveBaseline(phase: "HCD" | "FRG", problems: string[], paths: ProjectPaths, ctx: PhaseContext): Promise<void> {
  const baselines = loadBaselines(paths, ctx);
  baselines[phase] = { checkedAt: new Date().toISOString(), hash: phaseDataHash(phase, paths), problems };
  try {
    await writeFile(paths.phaseBaseline, JSON.stringify(baselines, null, 2) + "\n", "utf8");
  } catch (e) {
    console.warn(`[baseline] ${paths.phaseBaseline} could not be written: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Re-validation of an earlier phase's files from a later phase. Unchanged files are not checked again. Changed files
 * get the full check of their phase; problems that were already left when that phase was accepted are not sent
 * again. Without a baseline (a workspace from before this check), the current state becomes the baseline.
 */
async function changedSinceChecked(phase: "HCD" | "FRG", paths: ProjectPaths, ctx: PhaseContext, full: () => Promise<string[]>): Promise<string[]> {
  const base = loadBaselines(paths, ctx)[phase];
  if (base?.hash === phaseDataHash(phase, paths)) return [];
  const problems = await full();
  const known = new Set(base?.problems ?? problems);
  const fresh = problems.filter((p) => !known.has(p));
  if (!fresh.length) await saveBaseline(phase, base ? base.problems.filter((p) => problems.includes(p)) : problems, paths, ctx);
  return fresh.map((p) => `${phase} (changed after the ${phase} phase was checked): ${p}`);
}

async function writeCrossCheck(phase: Phase, hcd: HcdModel, frg: FrgModel, paths: ProjectPaths, ctx: PhaseContext): Promise<void> {
  const report: CrossReport = { checkedAt: new Date().toISOString(), phase, mode: "record-only", ...checkCross(hcd, frg), rules: CROSS_RULES };
  ctx.cross = report;
  try {
    await writeFile(paths.crossCheck, JSON.stringify(report, null, 2) + "\n", "utf8");
  } catch (e) {
    console.warn(`[cross] ${paths.crossCheck} could not be written: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Citations and (with `verifyReferences`) the DOIs / PMIDs of references.json. Every check writes the full result to
 * reference_check.json; the returned problems are those of `phase`: the FRG phase answers for frg.json, the report's
 * FRG section and the references cited only there, the HCD phase for everything else.
 */
async function checkReferences(phase: "HCD" | "FRG", paths: ProjectPaths, deps: CheckDeps, ctx: PhaseContext): Promise<string[]> {
  const hcdFiles = loadHcdFiles(paths);
  const citations = checkCitations({ ...hcdFiles, frg: loadFrgFiles(paths).frg });
  const frgOnly = frgCitedIds(citations);
  const inPhase = (frg: boolean) => frg === (phase === "FRG");
  const errors = citations.problems.filter((p) => inPhase(isFrgProblem(p))).map((p) => p.message);

  const refs = ctx.hcd?.refs ?? [];
  const checks = deps.verifyReferences && refs.length ? await deps.verifyReferences(refs) : [];
  for (const c of checks) {
    const msg = refCheckMessage(c);
    if (msg && inPhase(frgOnly.has(c.id))) errors.push(msg);
  }

  const report: ReferenceReport = {
    checkedAt: new Date().toISOString(),
    phase,
    lookup: deps.verifyReferences ? "on" : "off",
    summary: checks.length ? summarizeRefChecks(checks) : null,
    references: checks,
    citedAt: Object.fromEntries(citations.citedAt),
    problems: [...citations.problems.map((p) => p.message), ...checks.map(refCheckMessage).filter((m): m is string => !!m)],
  };
  ctx.references = report;
  try {
    await writeFile(paths.referenceCheck, JSON.stringify(report, null, 2) + "\n", "utf8");
  } catch (e) {
    console.warn(`[references] ${paths.referenceCheck} could not be written: ${e instanceof Error ? e.message : String(e)}`);
  }
  return errors;
}

/**
 * Pointers on literature against the text of the cited paper (HCD phase only: connections are HCD data). Quotes
 * that already fail the format rules (too short, a locator) are left to those messages. Writes quote_check.json.
 */
async function checkQuotes(paths: ProjectPaths, deps: CheckDeps, ctx: PhaseContext): Promise<string[]> {
  const hcd = ctx.hcd;
  if (!hcd) return [];
  const refs = new Map(hcd.refs.map((r) => [r.id, r]));
  const reqs: QuoteRequest[] = [];
  for (const c of hcd.connections) {
    const quote = c.pointersOnLiterature;
    if (!quote || pointerProblems("", quote, "", DEFAULT_BRA_RULES).length) continue;
    const cited = c.referenceIds.flatMap((id) => refs.get(id) ?? []);
    if (cited.length) reqs.push({ sender: c.sender, receiver: c.receiver, referenceIds: c.referenceIds, quote, refs: cited });
  }
  const checks = deps.quoteChecker && reqs.length ? await deps.quoteChecker.verify(reqs) : [];
  const problems = checks.map(quoteCheckMessage).filter((m): m is string => !!m);
  const report: QuoteReport = {
    checkedAt: new Date().toISOString(),
    lookup: deps.quoteChecker ? "on" : "off",
    threshold: deps.quoteChecker?.threshold ?? null,
    summary: checks.length ? summarizeQuoteChecks(checks) : null,
    quotes: checks,
    problems,
  };
  ctx.quotes = report;
  try {
    await writeFile(paths.quoteCheck, JSON.stringify(report, null, 2) + "\n", "utf8");
  } catch (e) {
    console.warn(`[quotes] ${paths.quoteCheck} could not be written: ${e instanceof Error ? e.message : String(e)}`);
  }
  return problems;
}

export async function graphParseError(paths: ProjectPaths): Promise<string | null> {
  try {
    const read = (f: string) => readFile(join(paths.csv, f), "utf8");
    const { hcd, frg } = buildGraphs("check", {
      circuitsCsv: await read("Circuits.csv"),
      connectionsCsv: await read("Connections.csv"),
      frgCsv: await read("FRG.csv"),
      referencesCsv: await read("References.csv"),
    });
    if (!hcd.nodes.length || !frg.nodes.length) return "The CSVs produce an empty HCD or FRG graph.";
    return null;
  } catch (e) {
    return `The CSVs cannot be parsed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export interface PhaseDriver {
  maxNudges: number;
  /** One agent turn; false when the run must stop (question, failure, cancel). */
  turn: (p: Prompt) => Promise<boolean>;
  check: (phase: Phase) => Promise<PhaseCheck>;
  hasFiles: (phase: Phase) => boolean;
  phasePrompt: (phase: Phase) => Promise<Prompt>;
  /** `withSpec`: the phase spec must be attached (the agent has not been given this phase in this run) */
  fixPrompt: (phase: Phase, errors: string[], attempt: number, withSpec: boolean) => Promise<Prompt>;
  onWarn: (phase: Phase, errors: string[]) => Promise<void>;
  onAccepted: (phase: Phase) => Promise<void>;
}

export type PhaseRunResult = { result: "completed" } | { result: "stopped" } | { result: "failed"; phase: Phase; errors: string[] };

/** Run the phases from `startIdx`; `first` is the prompt that opens the run (null: validate what is there first). */
export async function runPhases(d: PhaseDriver, startIdx: number, first: Prompt | null): Promise<PhaseRunResult> {
  let pending = first;
  for (let i = startIdx; i < PHASES.length; i++) {
    const phase = PHASES[i];
    let attempts = 0;
    if (i > startIdx && phase !== "CSV") {
      // existing files (follow-ups, resumed runs) are only fixed, never rebuilt
      const pre = await d.check(phase);
      if (pre.errors.length) pending = d.hasFiles(phase) ? await d.fixPrompt(phase, pre.errors, ++attempts, true) : await d.phasePrompt(phase);
    }
    for (;;) {
      if (pending) {
        const p = pending;
        pending = null;
        if (!(await d.turn(p))) return { result: "stopped" };
      }
      const r = await d.check(phase);
      if (r.errors.length === 0) break;
      if (attempts >= d.maxNudges) {
        if (r.fatal) return { result: "failed", phase, errors: r.errors };
        await d.onWarn(phase, r.errors);
        break;
      }
      pending = await d.fixPrompt(phase, r.errors, ++attempts, false);
    }
    await d.onAccepted(phase);
  }
  return { result: "completed" };
}

// --- research step (research mode) ---------------------------------------------------------------------------------

/** Contents of `{P}/research_check.json`, rewritten by every research check. */
export interface ResearchReport {
  checkedAt: string;
  /** Set once the research step is over (passed, out of fix turns or out of time); the HCD phase follows */
  done: boolean;
  /** How the step ended: passed = no coverage gaps; budget = cut off by the time budget */
  outcome: ResearchOutcome | null;
  litTools: boolean;
  summary: ResearchSummary | null;
  problems: string[];
  /** Time, spend and searches of the step (written when it ends) */
  metrics?: ResearchStepMetrics;
}

const readText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/** Whether this workspace has finished its research step (a later run goes straight to the HCD). */
export function researchDone(paths: ProjectPaths): boolean {
  try {
    return (JSON.parse(readText(paths.researchCheck) ?? "{}") as Partial<ResearchReport>).done === true;
  } catch {
    return false;
  }
}

/** Coverage check of research.json against the search log; writes research_check.json. */
export async function checkResearchStep(paths: ProjectPaths, litTools: boolean, end: ResearchReport["outcome"] = null, metrics?: ResearchStepMetrics): Promise<ResearchCheck> {
  const r = checkResearch(readText(paths.research), readText(paths.researchLog), { litTools });
  const report: ResearchReport = { checkedAt: new Date().toISOString(), done: end !== null, outcome: end, litTools, summary: r.summary, problems: r.errors, ...(metrics ? { metrics } : {}) };
  try {
    await writeFile(paths.researchCheck, JSON.stringify(report, null, 2) + "\n", "utf8");
  } catch (e) {
    console.warn(`[research] ${paths.researchCheck} could not be written: ${e instanceof Error ? e.message : String(e)}`);
  }
  return r;
}

export type ResearchTurn = "ok" | "stop" | "budget";

export interface ResearchDriver {
  maxFixTurns: number;
  /** One research turn; `budget` when it was cut off by the time budget */
  turn: (p: Prompt) => Promise<ResearchTurn>;
  /** Coverage check; `end` marks the step as over */
  check: (end?: ResearchReport["outcome"]) => Promise<ResearchCheck>;
  prompt: () => Promise<Prompt>;
  fixPrompt: (errors: string[], attempt: number) => Prompt;
  /** Whether enough of the time budget is left for another fix turn */
  timeForFix: () => boolean;
  onFix: (errors: string[], attempt: number) => Promise<void>;
  onEnd: (outcome: NonNullable<ResearchReport["outcome"]>, check: ResearchCheck) => Promise<void>;
}

/**
 * The research step before the HCD: a survey turn, then coverage fix turns while problems remain, fix turns are left
 * and the time budget allows. Gaps never block the run: the HCD phase follows with what was found.
 */
export async function runResearch(d: ResearchDriver, first: Prompt | null): Promise<"done" | "stopped"> {
  let p: Prompt = first ?? (await d.prompt());
  let attempts = 0;
  for (;;) {
    const t = await d.turn(p);
    if (t === "stop") return "stopped";
    if (t === "budget") {
      await d.onEnd("budget", await d.check("budget"));
      return "done";
    }
    const c = await d.check();
    if (c.errors.length === 0) {
      await d.onEnd("passed", await d.check("passed"));
      return "done";
    }
    if (attempts >= d.maxFixTurns || !d.timeForFix()) {
      await d.onEnd("gaps", await d.check("gaps"));
      return "done";
    }
    attempts++;
    await d.onFix(c.errors, attempts);
    p = d.fixPrompt(c.errors, attempts);
  }
}
