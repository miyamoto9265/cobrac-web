/**
 * The hypothesis rules of a hypothesis-mode project: `prompts/phases/HYPOTHESIS.md` with the project's scopes, share
 * limit and research mode filled in. The worker appends them after the HCD / FRG specs (phase prompts, follow-ups,
 * fresh-thread prompts and the HCD ↔ FRG adjustment turn). Projects that do not allow hypotheses get nothing, so their
 * prompts stay exactly as they were.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describeScope, isHypothesisMode, type EvidenceSettings, type HypothesisScope } from "@cobrac/shared";

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
