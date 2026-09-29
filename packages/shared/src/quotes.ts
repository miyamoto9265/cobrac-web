/**
 * Quotes: whether the Pointers on literature of a connection appear in the text of the cited paper (open-access full
 * text or abstract, fetched by the worker). Pure functions; the worker does the lookups.
 *
 * Matching is done on letters and digits only, so whitespace, punctuation, hyphenation (`pro- jection`), ligatures,
 * typographic quotes and in-text citation markers do not matter; small OCR-like differences are absorbed by an
 * edit-distance score over the best-matching word window.
 */
import { HCD_FILES, type RefRow } from "./harness.js";
import { clip } from "./references.js";

/** Minimum similarity (0–1) of a quote with the best passage of the paper; 0.9 = at most 1 edit per 10 letters. */
export const DEFAULT_QUOTE_THRESHOLD = 0.9;

// --- text preparation ------------------------------------------------------------------------------------------------

const SUPERSCRIPT_RE = /[\u00b9\u00b2\u00b3\u2070-\u209f]+/g;
/** `(Schultz et al., 1997; Haber, 2010)`: removed from both sides, quotes often leave them out */
const CITATION_PAREN_RE = /\([^()]{0,300}?\b(?:1[89]|20)\d{2}[a-z]?\b[^()]{0,300}?\)/g;
/** `[12]`, `[3–5, 8]` */
const CITATION_NUM_RE = /\[\s*\d+[a-z]?(?:\s*[-–—,;]\s*\d+[a-z]?)*\s*\]/g;
/** Omissions and editorial insertions in a quote: `…`, `...`, `[…]`, `[the VTA]` */
const QUOTE_BREAK_RE = /\s*(?:\.\s*\.\s*\.|…|\[[^\]]*\])\s*/;
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

const baseText = (x: string) =>
  x
    .replace(SUPERSCRIPT_RE, " ")
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(CITATION_PAREN_RE, " ")
    .replace(CITATION_NUM_RE, " ");

const tokenKey = (t: string) =>
  t
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export interface PreparedText {
  /** Text after normalization (for passages shown back) */
  text: string;
  /** Folded tokens */
  tokens: string[];
  /** Offset of each token in `joined` */
  starts: number[];
  /** Character span of each token in `text` */
  spans: [number, number][];
  /** Tokens concatenated without separators */
  joined: string;
}

export function prepareText(raw: string): PreparedText {
  const text = baseText(raw)
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:])/g, "$1")
    .trim();
  const tokens: string[] = [];
  const starts: number[] = [];
  const spans: [number, number][] = [];
  let joined = "";
  for (const m of text.matchAll(TOKEN_RE)) {
    const k = tokenKey(m[0]);
    if (!k) continue;
    tokens.push(k);
    starts.push(joined.length);
    spans.push([m.index!, m.index! + m[0].length]);
    joined += k;
  }
  return { text, tokens, starts, spans, joined };
}

/** Quote split at omissions / insertions; parts shorter than 3 words are only used when nothing longer is left. */
function quoteParts(quote: string): string[][] {
  const parts = baseText(quote)
    .split(QUOTE_BREAK_RE)
    .map((p) => [...p.matchAll(TOKEN_RE)].map((m) => tokenKey(m[0])).filter(Boolean));
  const long = parts.filter((p) => p.length >= 3);
  return long.length ? long : [parts.flat()].filter((p) => p.length);
}

// --- matching --------------------------------------------------------------------------------------------------------

export interface QuoteMatch {
  /** Similarity of the quote with its best passage (0–1); the worst part when the quote has omissions */
  score: number;
  /** Best-matching passage of the text (normalized), for the worst part */
  passage: string;
}

const CANDIDATE_WINDOWS = 6;
const WINDOW_MARGIN = 3;

/** Edit distance of `q` against the best substring of `t` (free start and end in `t`). */
function substringDistance(q: string, t: string): number {
  const m = q.length;
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let best = prev[m];
  for (let j = 1; j <= t.length; j++) {
    cur[0] = 0;
    const tc = t.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const sub = prev[i - 1] + (q.charCodeAt(i - 1) === tc ? 0 : 1);
      const del = prev[i] + 1;
      const ins = cur[i - 1] + 1;
      cur[i] = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
    }
    if (cur[m] < best) best = cur[m];
    [prev, cur] = [cur, prev];
  }
  return best;
}

function passageOf(t: PreparedText, from: number, to: number): string {
  const a = Math.max(0, from);
  const b = Math.min(t.tokens.length - 1, to);
  return b < a ? "" : t.text.slice(t.spans[a][0], t.spans[b][1]);
}

function matchPart(q: string[], t: PreparedText): QuoteMatch {
  const qj = q.join("");
  if (!qj || !t.tokens.length) return { score: 0, passage: "" };
  const exact = t.joined.indexOf(qj);
  if (exact >= 0) {
    const first = upperBound(t.starts, exact) - 1;
    const last = upperBound(t.starts, exact + qj.length - 1) - 1;
    return { score: 1, passage: passageOf(t, first, last) };
  }

  // windows of the quote's length that share the most words with it
  const w = Math.min(q.length, t.tokens.length);
  const need = new Map<string, number>();
  for (const k of q) need.set(k, (need.get(k) ?? 0) + 1);
  const have = new Map<string, number>();
  let overlap = 0;
  const add = (k: string) => {
    const n = (have.get(k) ?? 0) + 1;
    have.set(k, n);
    if (n <= (need.get(k) ?? 0)) overlap++;
  };
  const remove = (k: string) => {
    const n = have.get(k) ?? 0;
    if (n <= (need.get(k) ?? 0)) overlap--;
    have.set(k, n - 1);
  };
  const scored: { at: number; overlap: number }[] = [];
  for (let i = 0; i < t.tokens.length; i++) {
    add(t.tokens[i]);
    if (i >= w) remove(t.tokens[i - w]);
    if (i >= w - 1) scored.push({ at: i - w + 1, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap || a.at - b.at);
  const picked: number[] = [];
  for (const s of scored) {
    if (picked.length >= CANDIDATE_WINDOWS || s.overlap === 0) break;
    if (picked.every((p) => Math.abs(p - s.at) > w / 2)) picked.push(s.at);
  }

  let best: QuoteMatch = { score: 0, passage: "" };
  for (const at of picked) {
    const from = Math.max(0, at - WINDOW_MARGIN);
    const to = Math.min(t.tokens.length - 1, at + w - 1 + WINDOW_MARGIN);
    const region = t.joined.slice(t.starts[from], t.starts[to] + t.tokens[to].length);
    const score = Math.max(0, 1 - substringDistance(qj, region) / qj.length);
    if (score > best.score) best = { score, passage: passageOf(t, at, at + w - 1) };
  }
  return best;
}

/** First index whose value is greater than `x` (sorted ascending). */
function upperBound(a: number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Similarity of a quote with its best passage in `text`. */
export function matchQuote(quote: string, text: string | PreparedText): QuoteMatch {
  const t = typeof text === "string" ? prepareText(text) : text;
  const parts = quoteParts(quote);
  if (!parts.length) return { score: 0, passage: "" };
  let worst: QuoteMatch | null = null;
  for (const p of parts) {
    const m = matchPart(p, t);
    if (!worst || m.score < worst.score) worst = m;
  }
  return worst!;
}

// --- per-connection results (quote_check.json) -----------------------------------------------------------------------

/**
 * - `verified_fulltext`: the quote is in the paper's open-access full text
 * - `verified_abstract`: no full text; the quote is in the abstract
 * - `not_found`: the full text was read and the quote is not in it (sent back to the agent)
 * - `unverified`: no full text could be read (paywalled, lookup failed) and the abstract, if any, does not have it
 */
export type QuoteStatus = "verified_fulltext" | "verified_abstract" | "not_found" | "unverified";
export const QUOTE_STATUSES: readonly QuoteStatus[] = ["verified_fulltext", "verified_abstract", "not_found", "unverified"];

export type PaperTextSource = "europepmc" | "pmc-bioc" | "pubmed" | "crossref" | "semanticscholar";

/** One text of a paper the quote was compared with. */
export interface PaperTextRef {
  kind: "fulltext" | "abstract";
  source: PaperTextSource;
  /** PMCID, PMID or DOI the text was fetched by */
  id: string;
  /** Where a person (or the agent) can read it */
  url: string;
}

/** One connection's quote and the references it may come from (one since 0.10; older files may have several). */
export interface QuoteRequest {
  sender: string;
  receiver: string;
  referenceIds: string[];
  quote: string;
  refs: RefRow[];
}

export interface QuoteCheck {
  sender: string;
  receiver: string;
  referenceIds: string[];
  /** The Pointers on literature (clipped) */
  quote: string;
  status: QuoteStatus;
  /** Texts the quote was compared with */
  checkedIn: PaperTextRef[];
  /** Best similarity found (0–1, two decimals); null when no text was available */
  score: number | null;
  /** Closest passage when the quote was not verified */
  closest?: string;
  notes: string[];
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  verified_fulltext: "verified in full text",
  verified_abstract: "verified in abstract",
  not_found: "not found",
  unverified: "unverified",
};

const SOURCE_LABEL: Record<PaperTextSource, string> = {
  europepmc: "Europe PMC",
  "pmc-bioc": "PMC (BioC)",
  pubmed: "PubMed",
  crossref: "Crossref",
  semanticscholar: "Semantic Scholar",
};

const fulltextOf = (c: QuoteCheck) => c.checkedIn.find((x) => x.kind === "fulltext");

/** Validator message for a checked quote, or null when nothing needs fixing (only `not_found` is sent back). */
export function quoteCheckMessage(c: QuoteCheck): string | null {
  if (c.status !== "not_found") return null;
  const ft = fulltextOf(c);
  const where = `${HCD_FILES.connections}: \`${c.sender}\` -> \`${c.receiver}\` (${c.referenceIds.join("; ")})`;
  const read = ft ? `its full text: ${SOURCE_LABEL[ft.source]} ${ft.id}, ${ft.url}` : "its text";
  const best = c.score !== null ? `; best match ${Math.round(c.score * 100)}%` : "";
  const closest = c.closest ? ` Closest passage: "${clip(c.closest, 300)}".` : "";
  return (
    `${where}: pointersOnLiterature is not in the paper (checked against ${read}${best}).${closest} ` +
    `Open the paper, copy the sentence that states this projection exactly as written, and replace the quote; ` +
    `if the paper does not state it, cite the paper that does.`
  );
}

export function summarizeQuoteChecks(checks: QuoteCheck[]): Record<QuoteStatus, number> {
  const out = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0])) as Record<QuoteStatus, number>;
  for (const c of checks) out[c.status]++;
  return out;
}
