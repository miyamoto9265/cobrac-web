import type { ReasoningEffort, UserRecord } from "@cobrac/shared";
import { updateUser } from "./db.js";

/** What the user last picked on a create screen or a mission draft; a key left out is not changed. null = 「既定」. */
export type RememberedChoice = { model?: string | null; reasoningEffort?: ReasoningEffort | null; orchestratorModel?: string | null };

/**
 * Saves the models the user just picked as their defaults, so the next project or mission starts from them (the
 * project create screen, the mission draft's models). A deprecated model is remembered too: the user chose it, and the
 * rule that deprecated models are never chosen implicitly is about the app's defaults. Best-effort: a failure here never
 * fails the request that picked the model.
 */
export async function rememberChoice(u: UserRecord, c: RememberedChoice): Promise<void> {
  const values: Partial<UserRecord> = {};
  if (c.model !== undefined && (u.defaultModel ?? null) !== c.model) values.defaultModel = c.model;
  if (c.reasoningEffort !== undefined && (u.defaultReasoningEffort ?? null) !== c.reasoningEffort) values.defaultReasoningEffort = c.reasoningEffort;
  if (c.orchestratorModel !== undefined && (u.defaultOrchestratorModel ?? null) !== c.orchestratorModel) values.defaultOrchestratorModel = c.orchestratorModel;
  if (!Object.keys(values).length) return;
  try {
    await updateUser(u.userId, values);
    Object.assign(u, values);
  } catch (e) {
    console.warn("rememberChoice failed", e);
  }
}
