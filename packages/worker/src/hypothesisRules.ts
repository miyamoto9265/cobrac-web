/**
 * The hypothesis rules of a hypothesis-mode project: `prompts/phases/HYPOTHESIS.md` with the project's scopes, share
 * limit and research mode filled in. The worker appends them after the HCD / FRG specs (phase prompts, follow-ups,
 * fresh-thread prompts and the HCD ↔ FRG adjustment turn). Projects that do not allow hypotheses get nothing, so their
 * prompts stay exactly as they were.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceSettings, HypothesesFile, HypothesisScope, JobRecord, ProjectRecord, VersionHypothesisInfo } from "@cobrac/shared";
import { HCD_FILES, describeScope, isHypothesisMode, normalizeMaxShare, normalizeScopes, scopeLine, versionHypothesisCount, versionHypothesisInfo } from "@cobrac/shared";
import type { ProjectPaths } from "./steps.js";

export const HYPOTHESIS_SPEC_FILE = "HYPOTHESIS.md";

/** One line per scope; the user's note is quoted as data. */
export function formatScopes(scopes: HypothesisScope[]): string {
  if (!scopes.length) return "- (none: no hypothesis is allowed until the user adds a scope)";
  return scopes.map((x) => `- ${describeScope(x)}${x.note ? ` (note from the user: ${JSON.stringify(x.note)})` : ""}`).join("\n");
}

/** The filled-in hypothesis rules, or "" when the project does not allow hypotheses. */
export async function hypothesisRules(promptsDir: string, projectId: string, evidence: EvidenceSettings, o: { researchMode: boolean }): Promise<string> {
  if (!isHypothesisMode(evidence)) return "";
  const text = await readFile(join(promptsDir, "phases", HYPOTHESIS_SPEC_FILE), "utf8");
  // replacement functions insert the values literally (a user's note may contain `$&`, `$'` or `$$`)
  return text
    .replaceAll("{P}", () => projectId)
    .replaceAll("{SCOPES}", () => formatScopes(evidence.scopes))
    .replaceAll("{MAX_SHARE}", () => `${Math.round(evidence.maxShare * 100)}%`)
    .replaceAll("{RESEARCH_MODE}", () =>
      o.researchMode
        ? "on: every hypothesis names its research.json candidate in `researchCandidate`"
        : "off: leave `researchCandidate` out and name the searches in `rationale`",
    )
    .trim();
}

/**
 * The line a follow-up prompt gets after the instruction when the follow-up allowed hypotheses (its scope and the
 * share limit); "" for every other job, so their prompts are unchanged.
 */
export function followupScopeNote(project: Pick<ProjectRecord, "hypothesisScopes" | "hypothesisMaxShare">, job: Pick<JobRecord, "hypothesisScopeId">): string {
  const id = job.hypothesisScopeId;
  const scope = id ? normalizeScopes(project.hypothesisScopes).find((s) => s.id === id) : undefined;
  if (!scope) return "";
  return `\n\nHypotheses allowed with this instruction: ${scopeLine(scope, normalizeMaxShare(project.hypothesisMaxShare))}. The hypothesis rules list every scope of the project.`;
}

/** What the version of a successful job records about hypotheses (from hypotheses.json and the HCD files). */
export function versionHypotheses(paths: Pick<ProjectPaths, "hypotheses" | "hcd">, project: Pick<ProjectRecord, "evidenceMode" | "hypothesisScopes" | "hypothesisMaxShare">): VersionHypothesisInfo {
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : null);
  return versionHypothesisInfo(project, { hypothesesJson: read(paths.hypotheses), ucJson: read(join(paths.hcd, HCD_FILES.uc)), connectionsJson: read(join(paths.hcd, HCD_FILES.connections)) });
}

/**
 * A hypothesis-mode project goes back to literature-supported only when a job completed successfully with no
 * hypothesis in its result (the counts of the last check say 0). Counts that cannot be read change nothing.
 */
export function returnsToStrict(evidence: EvidenceSettings, info: VersionHypothesisInfo): boolean {
  return isHypothesisMode(evidence) && versionHypothesisCount(info) === 0;
}

/** hypotheses.json of the last check (hypothesis mode), for the marks on the graphs; null when missing or unreadable. */
export async function readHypothesesFile(p: Pick<ProjectPaths, "hypotheses">): Promise<HypothesesFile | null> {
  try {
    const text = existsSync(p.hypotheses) ? await readFile(p.hypotheses, "utf8") : null;
    return text ? (JSON.parse(text) as HypothesesFile) : null;
  } catch {
    return null;
  }
}
