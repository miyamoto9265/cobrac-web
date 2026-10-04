import { BNA_AREAS, bnaLabelIsNeocortex } from "@cobrac/shared";

export interface BnaHint {
  /** Left label ID (odd); the right one is +1 */
  left: number;
  abbr: string;
  l2: string;
  name: string;
}

/**
 * Brainnetome areas that match what was typed as the ROI: area abbreviation, gyrus (L2) abbreviation or words of the
 * area name. Only short Latin-script input is matched (the atlas names are English); anything else gives no hints.
 * Only neocortical areas are offered: the other BNA areas (subcortical, hippocampus, entorhinal) are not SABRA units.
 */
export function bnaHints(input: string, limit = 6): BnaHint[] {
  const q = input.trim().toLowerCase();
  if (q.length < 2 || q.length > 40 || !/^[\x20-\x7e]+$/.test(q)) return [];
  const scored: [number, BnaHint][] = [];
  for (const [left, abbr, l2, name] of BNA_AREAS) {
    if (!bnaLabelIsNeocortex(left)) continue;
    const a = abbr.toLowerCase();
    const g = l2.toLowerCase();
    const n = name.toLowerCase();
    const score =
      a === q ? 0 : a.startsWith(q) ? 1 : g === q ? 2 : n.startsWith(q) ? 3 : n.split(/[\s/-]+/).some((w) => w.startsWith(q)) ? 4 : n.includes(q) ? 5 : -1;
    if (score >= 0) scored.push([score, { left, abbr, l2, name }]);
  }
  return scored
    .sort((x, y) => x[0] - y[0] || x[1].left - y[1].left)
    .slice(0, limit)
    .map((s) => s[1]);
}

/** ROI text for a chosen hint, with the BNA label pair the agent can anchor on. */
export const bnaHintText = (h: BnaHint) => `${h.name} (${h.abbr}, BNA:${h.left}-${h.left + 1})`;
