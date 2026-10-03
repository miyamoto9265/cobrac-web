import type { MeResponse } from "@cobrac/shared";
import { orgTierAllows } from "@cobrac/shared";

/** The user's saved default model, or null when the default API key no longer lets them run it (shown as "default"). */
export function usableDefaultModel(me: Pick<MeResponse, "defaultModel" | "orgTier"> | null | undefined): string | null {
  const m = me?.defaultModel;
  if (!m) return null;
  return !me.orgTier || orgTierAllows(me.orgTier, m) ? m : null;
}
