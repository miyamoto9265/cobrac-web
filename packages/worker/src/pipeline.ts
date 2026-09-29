/**
 * Phase driver of the CoBRAC harness, free of AWS / Codex so it can be tested with a mock agent:
 * each phase is an agent turn followed by deterministic checks and fix turns; CSV has no agent turn of its own
 * (the CSVs are generated from the JSON files, and problems are sent back as fixes to those files).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuildCsvOptions, FrgModel, HcdModel, ProjectMeta, RefCheck, RefRow, RefStatus, SabraLookup } from "@cobrac/shared";
import {
  HARNESS_SCHEMAS,
  SCHEMA_DIR,
  buildCsvs,
  buildGraphs,
  checkCitations,
  checkFrg,
  checkHcd,
  frgCitedIds,
  hombaAnchorIds,
  isFrgProblem,
  refCheckMessage,
  schemaFileName,
  summarizeRefChecks,
} from "@cobrac/shared";
import { loadFrgFiles, loadHcdFiles, type ProjectPaths } from "./steps.js";

export type Phase = "HCD" | "FRG" | "CSV";
export const PHASES: Phase[] = ["HCD", "FRG", "CSV"];

export interface Prompt {
  /** What the chat shows */
  shown: string;
  /** Appended for the agent only (phase specs) */
  hidden?: string;
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

/** Validate a phase (and the phases before it). The CSV phase also writes the five CSVs. */
export async function checkPhase(phase: Phase, paths: ProjectPaths, deps: CheckDeps, ctx: PhaseContext): Promise<PhaseCheck> {
  const hcd = await checkHcdWithRcs(paths, deps);
  ctx.hcd = hcd.model;
  if (phase === "HCD") {
    if (hcd.model?.meta && hcd.errors.length === 0) await deps.onMetaAccepted?.(hcd.model.meta);
    const refErrors = await checkReferences("HCD", paths, deps, ctx);
    return { errors: [...new Set([...hcd.errors, ...refErrors])], fatal: hcd.fatal };
  }
  if (!hcd.model) return { errors: ["The HCD files cannot be used:", ...hcd.errors], fatal: true };

  const frg = checkFrg(loadFrgFiles(paths), hcd.model);
  ctx.frg = frg.model;
  if (phase === "FRG") return { errors: [...frg.errors, ...(await checkReferences("FRG", paths, deps, ctx))], fatal: frg.fatal };
  if (!frg.model) return { errors: ["The FRG file cannot be used:", ...frg.errors], fatal: true };

  const built = buildCsvs(hcd.model, frg.model, await deps.csvOptions());
  if (!built.files) return { errors: built.errors, fatal: true };
  await mkdir(paths.csv, { recursive: true });
  for (const [name, text] of Object.entries(built.files)) await writeFile(join(paths.csv, name), text, "utf8");
  const graphError = await graphParseError(paths);
  return graphError ? { errors: [graphError], fatal: true } : { errors: [], fatal: false };
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
