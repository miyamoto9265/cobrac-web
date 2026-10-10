import type { MeResponse } from "@cobrac/shared";
import { isClaudeModel, orgTierAllows } from "@cobrac/shared";

type ModelMe = Pick<MeResponse, "defaultModel" | "orgTier"> & Partial<Pick<MeResponse, "keySource" | "claudeKeySource">>;

/** The user's saved default model, or null when the user's keys no longer let them run it (shown as "default"). */
export function usableDefaultModel(me: ModelMe | null | undefined): string | null {
  const m = me?.defaultModel;
  if (!m) return null;
  const source = isClaudeModel(m) ? me.claudeKeySource : me.keySource;
  if (source === undefined) return !me.orgTier || orgTierAllows(me.orgTier, m) ? m : null;
  if (!source) return null;
  return source !== "org" || !me.orgTier || orgTierAllows(me.orgTier, m) ? m : null;
}
