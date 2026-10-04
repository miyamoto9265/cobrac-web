import type { EdgeSign, HcdEdge, HcdNode } from "./types.js";

const INHIB_RE = /\binhibit|\bGABA|glycin|抑制/i;
const EXCIT_RE = /\bexcitat|glutamat|\bAMPA\b|\bNMDA\b|興奮/i;
const MOD_RE = /modulat|dopamin|serotonin|noradren|norepineph|acetylcholin|cholinerg|histamin|neuropeptide|調節/i;

/**
 * Classify the physiological sign of a connection. The Connection comment wins (it describes this
 * projection specifically); otherwise fall back to the sender circuit's Modulation Type / Transmitter.
 * Mixed senders (e.g. "Excitatory / Inhibitory") stay unknown unless the comment disambiguates.
 */
export function classifyEdgeSign(edge: Pick<HcdEdge, "comments">, sender?: Pick<HcdNode, "transmitter" | "modulationType"> | null): EdgeSign {
  const c = edge.comments ?? "";
  const inh = INHIB_RE.test(c);
  const exc = EXCIT_RE.test(c);
  if (inh && !exc) return "inhibitory";
  if (exc && !inh) return "excitatory";
  if (inh && exc) {
    // Both words present: prefer the one that describes the projection itself ("(GABAergic; inhibitory)" pattern)
    const m = c.match(/\(([^)]*)\)/g)?.join(" ") ?? "";
    if (INHIB_RE.test(m) && !EXCIT_RE.test(m)) return "inhibitory";
    if (EXCIT_RE.test(m) && !INHIB_RE.test(m)) return "excitatory";
  }
  if (!inh && !exc && MOD_RE.test(c)) return "modulatory";
  if (sender) {
    const s = `${sender.modulationType ?? ""} ${sender.transmitter ?? ""}`;
    const si = INHIB_RE.test(s);
    const se = EXCIT_RE.test(s);
    if (si && !se) return "inhibitory";
    if (se && !si) return "excitatory";
    if (!si && !se && MOD_RE.test(s)) return "modulatory";
  }
  return "unknown";
}
