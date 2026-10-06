/**
 * Hypothesis mode, stage 2: what a frozen version records about hypotheses, the minimal BRA-DB guard (until a separate
 * specification decides how hypotheses may be registered), and the JSON Schemas shown to the agent.
 */
import { HARNESS_SCHEMAS, HCD_FILES } from "./harness.js";
import { evidenceSettingsOf, type EvidenceMode, type HypothesesFile, type HypothesisScope } from "./hypothesis.js";
import type { JsonSchema } from "./jsonSchema.js";

/** Hypotheses of a version: elements with a hypothesis and all elements, for connections and UCs. */
export interface VersionHypothesisCounts {
  connections: { count: number; total: number };
  ucs: { count: number; total: number };
}

/** Fields of `BraVersionGenerator` about hypotheses (absent on versions saved before stage 2). */
export interface VersionHypothesisInfo {
  evidenceMode?: EvidenceMode;
  hypothesisScopes?: HypothesisScope[];
  hypothesisMaxShare?: number;
  /** Absent when the counts could not be read (a hypothesis-mode version without hypotheses.json) */
  hypotheses?: VersionHypothesisCounts;
}

/** Counts from hypotheses.json (the last check of the job); null when the file is missing or unreadable. */
export function countsFromHypothesesFile(text: string | null | undefined): VersionHypothesisCounts | null {
  if (!text?.trim()) return null;
  try {
    const f = JSON.parse(text) as Partial<HypothesesFile>;
    const c = f.share?.connections;
    const u = f.share?.ucs;
    if (!c || !u || [c.count, c.total, u.count, u.total].some((n) => typeof n !== "number")) return null;
    return { connections: { count: c.count, total: c.total }, ucs: { count: u.count, total: u.total } };
  } catch {
    return null;
  }
}

/**
 * What a version records about hypotheses. A project that does not allow hypotheses records `strict` and no
 * hypotheses (its checks never read the key, so its CSVs carry none); a hypothesis-mode project its scopes, limit and
 * the counts of the job's last check (absent when hypotheses.json could not be read).
 */
export function versionHypothesisInfo(
  project: { evidenceMode?: unknown; hypothesisScopes?: unknown; hypothesisMaxShare?: unknown },
  files: { hypothesesJson?: string | null; ucJson?: string | null; connectionsJson?: string | null },
): VersionHypothesisInfo {
  const e = evidenceSettingsOf(project);
  const hypothesesJson = files.hypothesesJson;
  if (e.mode !== "hypothesis") {
    const n = (text: string | null | undefined, key: string) => {
      try {
        const v = text ? (JSON.parse(text) as Record<string, unknown>)[key] : null;
        return Array.isArray(v) ? v.length : 0;
      } catch {
        return 0;
      }
    };
    return { evidenceMode: "strict", hypotheses: { connections: { count: 0, total: n(files.connectionsJson, "connections") }, ucs: { count: 0, total: n(files.ucJson, "ucs") } } };
  }
  const counts = countsFromHypothesesFile(hypothesesJson);
  return { evidenceMode: "hypothesis", hypothesisScopes: e.scopes, hypothesisMaxShare: e.maxShare, ...(counts ? { hypotheses: counts } : {}) };
}

/** Hypotheses of a version (connections + UCs); null when the version does not say. */
export function versionHypothesisCount(g: VersionHypothesisInfo | null | undefined): number | null {
  const h = g?.hypotheses;
  return h ? h.connections.count + h.ucs.count : null;
}

/** Why a version cannot be registered in BRA-DB, or null. */
export type BradbBlockReason = "hypotheses";

export const BRADB_HYPOTHESIS_BLOCK_MESSAGE = "仮説を含む版は、いまは BRA-DB に登録できません";

/**
 * The minimal BRA-DB guard: a version with at least one hypothesis, or a hypothesis-mode version whose counts are not
 * recorded (it cannot be shown to have none), is not registered. Versions without the fields (saved before stage 2)
 * and versions without hypotheses register as before.
 */
export function bradbBlockReason(generator: VersionHypothesisInfo | null | undefined): BradbBlockReason | null {
  const n = versionHypothesisCount(generator);
  if (n !== null) return n > 0 ? "hypotheses" : null;
  return generator?.evidenceMode === "hypothesis" ? "hypotheses" : null;
}

/**
 * The JSON Schemas written where the agent reads them. A project that does not allow hypotheses gets them without the
 * `hypothesis` key (exactly the schemas before hypothesis mode), so its agent is never shown the key; the checks still
 * use `HARNESS_SCHEMAS` and send a key back with `strictHypothesisProblems`.
 */
export function agentHarnessSchemas(mode: EvidenceMode): Record<string, JsonSchema> {
  if (mode === "hypothesis") return HARNESS_SCHEMAS;
  const out = JSON.parse(JSON.stringify(HARNESS_SCHEMAS)) as Record<string, JsonSchema>;
  for (const [file, arrayKey] of [
    [HCD_FILES.uc, "ucs"],
    [HCD_FILES.connections, "connections"],
  ] as const) {
    const item = out[file]?.properties?.[arrayKey]?.items as { properties?: Record<string, JsonSchema> } | undefined;
    if (item?.properties) delete item.properties.hypothesis;
  }
  return out;
}
