
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobRecord, ProjectRecord, ReasoningEffort } from "@cobrac/shared";
import {
  DEFAULT_BRA_RULES,
  canonSpecNote,
  type FrgCandidates,
  PROJECT_FILES,
  fixTurnEffort,
  formatFrgCandidates,
} from "@cobrac/shared";
import { env } from "./env.js";
import { followupScopeNote, hypothesisRules } from "./hypothesisRules.js";
import { materialsHeaderLine } from "./materials.js";
import { answerPreamble, type Phase, type Prompt } from "./pipeline.js";
import { MAX_REPORTED_ERRORS, mode, paths, projectId, runState } from "./jobContext.js";

// --- prompts -----------------------------------------------------------------

const specCache = new Map<Phase, string>();
/**
 * The phase spec, followed by the research-mode notes when the project researches, the hypothesis rules when it allows
 * hypotheses, and for the FRG the bottom-up candidates.
 */
export async function phaseSpec(phase: Phase): Promise<string> {
  const spec = await rawPhaseSpec(phase);
  const withNotes = runState.research ? `${spec}\n\n${await researchModeNotes()}` : spec;
  const rules = await hypothesisNotes();
  const withRules = rules ? `${withNotes}\n\n${rules}` : withNotes;
  const candidates = phase === "FRG" ? await frgCandidatesSection() : "";
  return candidates ? `${withRules}\n\n---\n\n${candidates}` : withRules;
}

/** The bottom-up candidates of the FRG phase as the last check wrote them from the HCD; empty before the HCD was checked. */
export async function frgCandidatesSection(): Promise<string> {
  try {
    const c = JSON.parse(await readFile(paths.frgCandidates, "utf8")) as FrgCandidates;
    return formatFrgCandidates(c, `${projectId}/${PROJECT_FILES.frgCandidates}`);
  } catch {
    return "";
  }
}

export async function rawPhaseSpec(phase: Phase): Promise<string> {
  if (!specCache.has(phase)) {
    let spec = (await readFile(join(env.promptsDir, "phases", `${phase}.md`), "utf8"))
      .replaceAll("{P}", projectId)
      .replaceAll("{MIN_QUOTE_WORDS}", String(DEFAULT_BRA_RULES.minQuoteWords));
    if (phase === "HCD" && runState.harnessRules >= 1) spec += `\n\n${(await readFile(join(env.promptsDir, "phases", "HCD_roi_rules.md"), "utf8")).replaceAll("{P}", projectId).trim()}\n`;
    if (phase === "FRG" && runState.harnessRules >= 2) spec += `\n\n${(await readFile(join(env.promptsDir, "phases", "FRG_gn_rules.md"), "utf8")).replaceAll("{P}", projectId).trim()}\n`;
    if (phase === "HCD") spec += runState.planNote;
    if (phase === "HCD" && runState.canonRun) spec += canonSpecNote(runState.canonRun.info);
    if (phase === "HCD" && !runState.rcs) {
      spec +=
        "\n\nNote for this run: the RCS MCP server is not available. Still anchor every UC on a SABRA unit from your best knowledge " +
        `(HOMBA/DHBA or BNA IDs), keep UC Descriptors and Circuit IDs in the same format, and state in ${PROJECT_FILES.decisionLog} that the anchors were not checked with RCS.\n`;
    }
    specCache.set(phase, spec);
  }
  return specCache.get(phase)!;
}

async function researchModeNotes(): Promise<string> {
  return (await readFile(join(env.promptsDir, "research_mode.md"), "utf8")).replaceAll("{P}", projectId).trim();
}

/** HYPOTHESIS.md with this project's scopes and limit; "" for projects that do not allow hypotheses (their prompts are unchanged). */
export async function hypothesisNotes(): Promise<string> {
  return hypothesisRules(env.promptsDir, projectId, runState.evidence, { researchMode: runState.research });
}

/** `\n\n---\n\n<rules>` after the reference specs of a hypothesis-mode project; "" otherwise. */
async function hypothesisNotesSection(): Promise<string> {
  const rules = await hypothesisNotes();
  return rules ? `\n\n---\n\n${rules}` : "";
}

export function header(project: ProjectRecord): string {
  const lines = [
    `Project ID: ${projectId}`,
    `ROI: ${project.roi?.trim() || "(not given: determine it by research)"}`,
    `TLF: ${project.tlf?.trim() || "(not given: determine it by research)"}`,
    `Contributor: ${project.contributor}`,
  ];
  const m = materialsHeaderLine(runState.materials);
  if (m) lines.push(m);
  return lines.join("\n");
}

export async function phasePrompt(project: ProjectRecord, phase: Phase): Promise<Prompt> {
  return { shown: `${header(project)}\n\nRun phase ${phase}.`, hidden: await phaseSpec(phase) };
}

export async function firstPrompt(project: ProjectRecord, job: JobRecord, phase: Phase, freshThread: boolean): Promise<Prompt | null> {
  const spec = async () => (freshThread && phase !== "CSV" ? await phaseSpec(phase) : undefined);
  switch (mode) {
    case "initial":
    case "article":
    case "canon-review":
    case "plan":
      return phasePrompt(project, "HCD");
    case "resume":
      return {
        shown: answerPreamble(job),
        hidden: freshThread ? `${header(project)}\n\n${(await spec()) ?? ""}` : undefined,
      };
    case "retry":
      if (phase === "CSV") return null;
      return {
        shown: `${header(project)}\n\nThe previous run stopped midway. Check the existing files in ${projectId}/ and finish phase ${phase}; do not recreate files that are already complete.`,
        hidden: await spec(),
      };
    case "followup":
      // specs are always attached: the thread may be new, and follow-ups can touch every file
      return {
        shown: `${header(project)}\n\nFollow-up instruction:\n${job.instruction ?? ""}${followupScopeNote(project, job)}`,
        hidden:
          `Apply the follow-up instruction to the project files (see "Follow-up instructions" in AGENTS.md). Reference specs:\n\n` +
          `${await rawPhaseSpec("HCD")}\n\n---\n\n${await rawPhaseSpec("FRG")}` +
          (runState.research ? `\n\n---\n\n${await researchModeNotes()}` : "") +
          (await hypothesisNotesSection()),
      };
  }
}

/** The same request on a new thread: the project header, where the work so far is, and every phase spec. */
export async function freshThreadPrompt(project: ProjectRecord, p: Prompt): Promise<Prompt> {
  return {
    ...p,
    shown:
      `${header(project)}\n\nThe previous conversation of this project grew larger than the OpenAI request limit, so this turn starts a new conversation. ` +
      `Everything done so far is in the files of ${projectId}/ (${PROJECT_FILES.decisionLog} has the decisions and their reasons); read them instead of redoing the work. ` +
      `Continue with this request:\n\n${p.shown}`,
    hidden:
      `${p.hidden ? `${p.hidden}\n\n---\n\n` : ""}Reference specs:\n\n${await rawPhaseSpec("HCD")}\n\n---\n\n${await rawPhaseSpec("FRG")}` +
      (runState.research ? `\n\n---\n\n${await researchModeNotes()}` : "") +
      (await hypothesisNotesSection()),
  };
}

export function fixPrompt(phase: Phase, errors: string[], attempt: number): Prompt {
  const list = errors.slice(0, MAX_REPORTED_ERRORS).map((e) => `- ${e}`);
  if (errors.length > MAX_REPORTED_ERRORS) list.push(`- …and ${errors.length - MAX_REPORTED_ERRORS} more of the same kinds`);
  const where = phase === "CSV" ? "while generating the CSVs from the HCD/FRG data files" : `in phase ${phase}`;
  return {
    shown: `The validator found ${errors.length} problem(s) ${where} (fix attempt ${attempt}/${env.maxNudges}):\n${list.join("\n")}\n\nFix them in the files and finish with status "done".`,
    effort: fixTurnEffort(runState.resolvedEffort as ReasoningEffort | null),
  };
}
