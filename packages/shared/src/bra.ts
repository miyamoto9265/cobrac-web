/**
 * Value rules of the BRA format (Template-v2-2.bra AdminOnly lists and the BRA Data Preparation Manual) that the
 * harness checks in the agent's JSON files: enumerations, Source of ID, Pointers and the Output Semantics notation.
 * Pure functions shared by the validator, the CSV builder and tests.
 */
import { parseUcDescriptor } from "./ucNaming.js";

/** References "Literature type" (Template-v2-2 AdminOnly). */
export const BRA_LITERATURE_TYPES = [
  "Experimental results",
  "Meta review",
  "Textbook",
  "Systematic review",
  "Review",
  "Modeling",
  "Simulation",
  "Hypothesis",
  "Data description",
  "Insight",
  "Opinion",
] as const;

/** Connections "Taxon" (Template-v2-2 AdminOnly, common names). */
export const BRA_TAXA = ["Mouse", "Rat", "Cat", "Marmoset", "Macaque", "Human", "(Mixed)", "Rodent", "Rabbit", "(No description)"] as const;

/** Connections "Measurement method" (Template-v2-2 AdminOnly, the 21 values in their order there). */
export const BRA_MEASUREMENT_METHODS = [
  "Retrograde Trans-synaptic tracing",
  "Axonal tracing",
  "DW-MRI",
  "fMRI",
  "Electro physiology",
  "Optogenetic",
  "Immunohistochemistry(neurobiotin)",
  "Various tracing",
  "SILPP estimation",
  "Neuronal Tract Tracing",
  "Retrograde tracing",
  "Anterograde Trans-synaptic tracing",
  "CRACM",
  "Anatomical connection in a secondary source",
  "Functional connection in a secondary source",
  "(No description)",
  "Mixed",
  "Unsurveyed secondary source",
  "Hypothetical",
  "Anterograde tracing",
  "Single cell tracing",
] as const;

/** Circuits "Transmitter" (manual table 8). Noradrenaline, histamine and peptides are not in the list. */
export const BRA_TRANSMITTERS = ["Acetylcholine", "Dopamine", "GABA", "Glutamate", "Glycine", "Serotonin"] as const;

export const BRA_MODULATION_TYPES = ["Excitatory", "Inhibitory", "Modulatory"] as const;

/**
 * Source of ID values other than a Reference ID: the ontology §4.1.3 enumeration plus `BNA`, a CoBRAC extension for
 * UCs that are a whole Brainnetome area (SABRA's BNA side has no value upstream; adding it has been requested).
 */
export const SOURCE_OF_ID_KEYWORDS = ["DHBA", "MBA", "UBERON", "BNA", "collection", "makeshift"] as const;

/**
 * sCID / rCID relation (manual table 9): how the UC relates to the circuit the paper names, read as
 * `<UC> <relation> <notation in the literature>`. `<`: the UC is part of the paper's (coarser) circuit;
 * `>`: the UC contains the paper's (finer) circuit; `=`: the same circuit.
 */
export const CIRCUIT_RELATIONS = ["<", "=", ">"] as const;

/** Capability&Mechanism of the FRG rows of UCs outside the ROI (Template-v2-2). */
export const OUT_OF_ROI_CAPABILITY = "No need for description due to input/output circuit";

/** Circuit ID of the ROI row, the first data row of the Circuits sheet (Japanese manual 2025-09, "ROI の指定"). */
export const roiCircuitId = (projectId: string) => `ROI_${projectId}`;
export const isRoiCircuitId = (id: string) => /^ROI_/.test(id);

export interface BraRules {
  /**
   * Minimum words of Pointers on literature: BRA error 272 of the Error code List (Master) asks for at least 10. The
   * manual, the ontology and the template do not state it.
   */
  minQuoteWords: number;
}

export const DEFAULT_BRA_RULES: BraRules = { minQuoteWords: 10 };

const REF_ID_RE = /^\[[^[\]]+\]$/;
export const isReferenceId = (x: string) => REF_ID_RE.test(x);

/**
 * Problem with the Source of ID of one UC, or null. Anchor-only UCs on one HOMBA/DHBA term use `DHBA`, anchor-only
 * BNA UCs (areas or groups) `BNA`; faceted (finer than SABRA) or mixed-atlas UCs cite the one paper that defines the
 * population, or `makeshift` when none does.
 */
export function sourceOfIdProblem(u: { id: string; descriptor: string; sourceOfId: string }): string | null {
  const v = u.sourceOfId;
  const where = `uc.json: sourceOfId of \`${u.id}\``;
  if (!v) return `${where} is empty.`;
  if (!isReferenceId(v) && !(SOURCE_OF_ID_KEYWORDS as readonly string[]).includes(v)) {
    return `${where} is "${v}"; write one value: DHBA, BNA, MBA, UBERON, collection, makeshift or one Reference ID [Author, Year].`;
  }
  const parsed = u.descriptor ? parseUcDescriptor(u.descriptor) : null;
  if (!parsed || "errors" in parsed) return null;
  const d = parsed.descriptor;
  const anchorOnly = d.facets.length === 0;
  if (anchorOnly && d.anchors.length === 1 && d.anchors[0].kind === "homba") {
    return v === "DHBA" ? null : `${where} is "${v}"; the UC is a whole DHBA term (anchor only), so write DHBA.`;
  }
  if (anchorOnly && d.anchors.every((a) => a.kind !== "homba")) {
    return v === "BNA" ? null : `${where} is "${v}"; the UC is a whole BNA area (anchor only), so write BNA.`;
  }
  if (isReferenceId(v) || v === "makeshift") return null;
  return `${where} is "${v}"; the UC is finer than its SABRA unit, so write the one Reference ID that defines the population, or makeshift when no paper does.`;
}

const wordCount = (x: string) => x.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
const LOCATOR_RE = /^["'“‘]?\s*(?:pp?\.\s*\d|pages?\s+\d|§\s*\d|sections?\s+\d)/i;

/** Problems with the relation and literature notation of one end of a connection (`end`: sender / receiver). */
export function relationProblems(where: string, end: "sender" | "receiver", circuitId: string, relation: string, notation: string): string[] {
  const out: string[] = [];
  const key = `${end}InLiterature`;
  if (!(CIRCUIT_RELATIONS as readonly string[]).includes(relation)) out.push(`${where}: ${end}Relation must be <, = or >.`);
  if (!notation) {
    out.push(`${where}: ${key} is empty; write the name the paper uses for the ${end} circuit.`);
  } else if (relation !== "=" && notation.replace(/^U\./, "") === circuitId) {
    out.push(`${where}: ${key} is the Circuit ID \`${circuitId}\`, but ${end}Relation is "${relation}"; write the paper's own name for the circuit it reports.`);
  }
  return out;
}

/** Problems with the two Pointers of one connection (`where` names it). */
export function pointerProblems(where: string, literature: string, figure: string, rules: BraRules): string[] {
  const out: string[] = [];
  if (!literature && !figure) out.push(`${where}: fill pointersOnLiterature or pointersOnFigure (at least one is required).`);
  if (literature) {
    if (LOCATOR_RE.test(literature)) {
      out.push(`${where}: pointersOnLiterature starts with a page or section locator; quote the sentence of the paper verbatim instead (put the location in comment if useful).`);
    } else if (wordCount(literature) < rules.minQuoteWords) {
      out.push(`${where}: pointersOnLiterature has ${wordCount(literature)} words; quote the sentence of the paper that states this projection verbatim (at least ${rules.minQuoteWords} words), not a location or a summary.`);
    }
  }
  if (figure && normalizeFigurePointer(figure) === null) {
    out.push(`${where}: pointersOnFigure "${figure.slice(0, 40)}" is not a figure number; write it like "Fig. 3B" (optionally followed by more panels or a short note).`);
  }
  return out;
}

const FIGURE_RE = /^(supplementary\s+|suppl\.\s*|extended\s+data\s+)?fig(?:ure)?s?\.?\s*(S?\d+)([A-Za-z](?:\s*[-–]\s*[A-Za-z])?)?(?![A-Za-z0-9])(.*)$/is;

/** `Figure 3b` / `fig.3B` → `Fig. 3B` (the prefix and panel normalized, the rest kept); null when not a figure. */
export function normalizeFigurePointer(x: string): string | null {
  const m = FIGURE_RE.exec(x.trim());
  if (!m) return null;
  const prefix = m[1] ? (/^ext/i.test(m[1]) ? "Extended Data " : "Supplementary ") : "";
  const panel = (m[3] ?? "").replace(/\s+/g, "").toUpperCase();
  return `${prefix}Fig. ${m[2].toUpperCase()}${panel}${m[4]}`.trim();
}

export interface OutputSemanticsItem {
  /** Circuit ID without the `U.` prefix */
  id: string;
  text: string;
}

/** Brackets allowed inside an item's text: Reference ID citations (`[Author, Year]`, `[A, 2000; B, 2001]`). */
const OS_ITEM_RE = /\s*\[\s*([^[\]\s;]+)\s*\]\s*((?:[^[\];]|\[[^[\]]*\d{4}[a-z]?\])*?)\s*;/y;

/**
 * `[<Circuit ID>] content;` items (the space after `]` is optional, a `U.` prefix is dropped). Returns null when the
 * text is not a sequence of such items: every item names exactly one circuit, has content and ends with `;`.
 */
export function parseOutputSemantics(text: string): OutputSemanticsItem[] | null {
  const items: OutputSemanticsItem[] = [];
  const x = text.trim();
  OS_ITEM_RE.lastIndex = 0;
  while (OS_ITEM_RE.lastIndex < x.length) {
    const start = OS_ITEM_RE.lastIndex;
    const m = OS_ITEM_RE.exec(x);
    if (!m || !m[2].trim()) return null;
    items.push({ id: m[1].replace(/^U\./, ""), text: m[2].trim() });
    if (OS_ITEM_RE.lastIndex === start) return null;
  }
  return items.length ? items : null;
}

/** Items back to the notation (one space after `]`, items separated by a space). */
export const formatOutputSemantics = (items: OutputSemanticsItem[]) => items.map((i) => `[${i.id}] ${i.text};`).join(" ");
