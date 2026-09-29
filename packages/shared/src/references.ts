/**
 * References: where each Reference ID is cited across the project files, and the comparison of a reference with
 * the bibliographic record fetched for its DOI / PMID. Pure functions; the worker does the lookups.
 */
import { FRG_FILES, HCD_FILES, PROJECT_FILES, REPORT_SECTIONS, type RefRow } from "./harness.js";

// --- identifiers ---------------------------------------------------------------------------------------------------

const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const DOI_PREFIX_RE = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i;
const NO_VALUE_RE = /^(?:n\/?a|none|unknown|-)?$/i;

/** DOI as looked up (prefix removed, lowercase); `null` for N/A, `invalid` when the value is not a DOI. */
export function normalizeDoi(raw: string | undefined): { doi: string | null; invalid: boolean; hadPrefix: boolean } {
  const t = (raw ?? "").trim();
  if (NO_VALUE_RE.test(t)) return { doi: null, invalid: false, hadPrefix: false };
  const hadPrefix = DOI_PREFIX_RE.test(t);
  const doi = t.replace(DOI_PREFIX_RE, "").trim().toLowerCase();
  return DOI_RE.test(doi) ? { doi, invalid: false, hadPrefix } : { doi: null, invalid: true, hadPrefix };
}

export function normalizePmid(raw: string | undefined): { pmid: string | null; invalid: boolean } {
  const t = (raw ?? "").trim().replace(/^pmid:\s*/i, "");
  if (NO_VALUE_RE.test(t)) return { pmid: null, invalid: false };
  return /^\d{1,9}$/.test(t) ? { pmid: t.replace(/^0+/, ""), invalid: false } : { pmid: null, invalid: true };
}

/** `[Schultz et al., 1997a]` → first author "Schultz", year 1997; null parts when the ID has another shape. */
export function parseRefId(id: string): { author: string | null; year: number | null } {
  const m = /^\[(.+),\s*(\d{4})[a-z]?\]$/.exec(id.trim());
  if (!m) return { author: null, year: null };
  const author = m[1].split(/\s+et\s+al\.?|\s+and\s+|\s*&\s*|,/i)[0].trim();
  return { author: author || null, year: Number(m[2]) };
}

// --- text comparison -----------------------------------------------------------------------------------------------

const fold = (x: string) =>
  x
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const words = (x: string) => fold(x).split(/[^a-z0-9]+/).filter(Boolean);
/** Letters only, for surname comparison (`van der Meer` → `vandermeer`) */
export const foldName = (x: string) => fold(x).replace(/[^a-z]/g, "");

/** Dice coefficient of the word multisets (0–1), and how much of the shorter title the longer one contains. */
export function titleSimilarity(a: string, b: string): { dice: number; containment: number } {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return { dice: 0, containment: 0 };
  const count = new Map<string, number>();
  for (const w of wb) count.set(w, (count.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of wa) {
    const n = count.get(w) ?? 0;
    if (n > 0) {
      common++;
      count.set(w, n - 1);
    }
  }
  return { dice: (2 * common) / (wa.length + wb.length), containment: common / Math.min(wa.length, wb.length) };
}

export const TITLE_MIN_DICE = 0.6;
const TITLE_MIN_CONTAINMENT = 0.9;
export const titlesMatch = (a: string, b: string) => {
  const s = titleSimilarity(a, b);
  return s.dice >= TITLE_MIN_DICE || (s.containment >= TITLE_MIN_CONTAINMENT && Math.min(words(a).length, words(b).length) >= 4);
};

const JOURNAL_STOP = new Set(["the", "of", "and", "for", "in", "on", "a", "an"]);
/** Lenient: equal words, word-prefix abbreviations (`J Neurosci` ~ `Journal of Neuroscience`) or an acronym (`PNAS`). */
export function journalsMatch(claimed: string, candidates: string[]): boolean {
  const c = words(claimed).filter((w) => !JOURNAL_STOP.has(w));
  if (!c.length) return true;
  return candidates.some((cand) => {
    const w = words(cand).filter((x) => !JOURNAL_STOP.has(x));
    if (!w.length) return false;
    const [short, long] = c.length <= w.length ? [c, w] : [w, c];
    if (isAbbreviation(short, long)) return true;
    return short.length === 1 && short[0].length >= 2 && long.map((x) => x[0]).join("").startsWith(short[0]);
  });
}

/** Every word of `short` is a prefix of a word of `long`, in order. */
function isAbbreviation(short: string[], long: string[]): boolean {
  let j = 0;
  for (const s of short) {
    while (j < long.length && !long[j].startsWith(s)) j++;
    if (j === long.length) return false;
    j++;
  }
  return true;
}

// --- comparison with a fetched record ------------------------------------------------------------------------------

export type RefSource = "crossref" | "doi.org" | "pubmed";

/** Bibliographic record of a DOI / PMID as returned by Crossref, doi.org (CSL JSON) or PubMed. */
export interface RefRecord {
  source: RefSource;
  title: string;
  /** Surnames in author order (empty for works without personal authors) */
  authors: string[];
  /** Every publication year the record gives (print, online, issued) */
  years: number[];
  /** Journal / container titles, full and abbreviated */
  journals: string[];
  doi?: string;
  pmid?: string;
}

export interface RecordComparison {
  /** Reasons the record is not the cited paper (empty = it matches) */
  problems: string[];
  /** Differences too uncertain to send back (journal names) */
  notes: string[];
}

const YEAR_TOLERANCE = 1;

export function compareWithRecord(ref: Pick<RefRow, "id" | "title" | "journal">, rec: RefRecord): RecordComparison {
  const problems: string[] = [];
  const notes: string[] = [];
  const { author, year } = parseRefId(ref.id);
  if (author && rec.authors.length) {
    const a = foldName(author);
    const at = rec.authors.findIndex((x) => {
      const f = foldName(x);
      return !!f && (f === a || f.endsWith(a) || a.endsWith(f));
    });
    if (at !== 0) {
      problems.push(
        at > 0
          ? `${author} is author #${at + 1}, not the first author (${rec.authors[0]})`
          : `the first author is ${rec.authors[0]}, not ${author}`,
      );
    }
  }
  if (year && rec.years.length && !rec.years.some((y) => Math.abs(y - year) <= YEAR_TOLERANCE)) {
    problems.push(`it was published in ${Math.min(...rec.years)}, not ${year}`);
  }
  if (ref.title && rec.title && !titlesMatch(ref.title, rec.title)) problems.push(`its title is "${clip(rec.title)}"`);
  if (ref.journal && rec.journals.length && !journalsMatch(ref.journal, rec.journals)) notes.push(`journal is "${rec.journals[0]}", not "${ref.journal}"`);
  return { problems, notes };
}

export const clip = (x: string, n = 120) => {
  const t = x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// --- per-reference results (reference_check.json) -----------------------------------------------------------------

/**
 * - `verified`: the DOI / PMID exists and its record matches the Reference ID (and title when given)
 * - `mismatch`: it exists but is another paper (author, year or title differ)
 * - `not_found`: the DOI / PMID does not exist
 * - `invalid`: the value is not a DOI / PMID
 * - `no_identifier`: DOI N/A and no PMID (cannot be checked)
 * - `unverified`: the lookup failed (network, rate limit); the check is repeated in a later run
 */
export type RefStatus = "verified" | "mismatch" | "not_found" | "invalid" | "no_identifier" | "unverified";
export const REF_STATUSES: readonly RefStatus[] = ["verified", "mismatch", "not_found", "invalid", "no_identifier", "unverified"];

export interface RefCheck {
  id: string;
  doi: string;
  pmid: string;
  status: RefStatus;
  /** Record the reference was compared with */
  record?: { source: RefSource; title: string; firstAuthor: string; year: number | null; journal: string; doi?: string; pmid?: string };
  problems: string[];
  notes: string[];
  /** A DOI found by searching the title, for references without one */
  suggestion?: { doi: string; title: string; firstAuthor: string; year: number | null };
}

/** Statuses sent back to the agent as problems to fix */
export const REF_STATUS_NEEDS_FIX: ReadonlySet<RefStatus> = new Set<RefStatus>(["mismatch", "not_found", "invalid"]);

export const recordSummary = (rec: RefRecord): NonNullable<RefCheck["record"]> => ({
  source: rec.source,
  title: clip(rec.title, 300),
  firstAuthor: rec.authors[0] ?? "",
  year: rec.years.length ? Math.min(...rec.years) : null,
  journal: rec.journals[0] ?? "",
  ...(rec.doi ? { doi: rec.doi } : {}),
  ...(rec.pmid ? { pmid: rec.pmid } : {}),
});

/** Validator message for a checked reference, or null when nothing needs fixing. */
export function refCheckMessage(c: RefCheck): string | null {
  const f = HCD_FILES.references;
  const ident = c.doi && c.doi !== "N/A" ? `DOI ${c.doi}` : `PMID ${c.pmid}`;
  switch (c.status) {
    case "invalid":
      return `${f}: ${c.id}: ${c.problems.join("; ")}.`;
    case "not_found":
      return (
        `${f}: ${c.id}: ${c.problems.join("; ")}. The paper may not exist: find it by web search and correct the identifier, ` +
        `set "doi" to "N/A" only if the paper is real but has no DOI, or remove the reference and every citation of it.`
      );
    case "mismatch": {
      const r = c.record;
      const found = r ? ` (${ident} is "${clip(r.title)}", ${r.firstAuthor || "no personal author"}${r.year ? `, ${r.year}` : ""})` : "";
      return (
        `${f}: ${c.id} does not match its identifier: ${c.problems.join("; ")}${found}. ` +
        `Correct the DOI/PMID if it points to another paper; otherwise correct the Reference ID (and every citation of it) and "title".`
      );
    }
    case "no_identifier":
      return c.suggestion
        ? `${f}: ${c.id} has no DOI, but Crossref lists "${clip(c.suggestion.title)}" (${c.suggestion.firstAuthor}${c.suggestion.year ? `, ${c.suggestion.year}` : ""}) as DOI ${c.suggestion.doi}; add it if this is the cited paper.`
        : null;
    default:
      return null;
  }
}

export function summarizeRefChecks(checks: RefCheck[]): Record<RefStatus, number> {
  const out = Object.fromEntries(REF_STATUSES.map((s) => [s, 0])) as Record<RefStatus, number>;
  for (const c of checks) out[c.status]++;
  return out;
}

// --- citations -----------------------------------------------------------------------------------------------------

export interface CitationInputs {
  references?: string | null;
  uc?: string | null;
  connections?: string | null;
  frg?: string | null;
  report?: string | null;
}

export interface ReferenceProblem {
  refId: string;
  /** File the problem is in; `report.md` problems also carry the report section */
  file: string;
  section?: string;
  message: string;
}

export interface CitationCheck {
  problems: ReferenceProblem[];
  /** Reference ID → where it is cited (`uc.json /ucs/0/sourceOfId/0`, `report.md ## HCD`) */
  citedAt: Map<string, string[]>;
}

/** Keys whose values are Reference ID lists (`checkHcd` already reports unknown IDs in them). */
const STRUCTURED_KEYS = new Set(["sourceOfId", "referenceIds"]);
const BIBLIOGRAPHY_RE = /^##\s+references?\b/i;

/** Normalized form for comparing citations with IDs (spacing and case around the comma). */
export const refKey = (id: string) => id.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\[\s*/, "[").replace(/\s*\]/, "]").toLowerCase();

/** `[Author, Year]` citations in free text; `[A, 2000; B, 2001]` yields both. Markdown links and `[U.X]` are ignored. */
export function extractCitations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[([^[\]]+)\](?!\()/g)) {
    for (const part of m[1].split(";")) {
      const p = part.trim();
      if (/^[^\s,][^,]*(?:,[^,]*)*,\s*\d{4}[a-z]?$/.test(p) && /[A-Za-z]/.test(p.replace(/\d{4}[a-z]?$/, ""))) out.push(`[${p}]`);
    }
  }
  return out;
}

function parseJson(text: string | null | undefined): unknown {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Citations across uc.json, connections.json, frg.json and report.md against references.json: citations of IDs that
 * are not in references.json (free text; the ID lists are checked by `checkHcd`), references cited nowhere outside the
 * report's bibliography, and several references with the same DOI / PMID.
 */
export function checkCitations(files: CitationInputs): CitationCheck {
  const problems: ReferenceProblem[] = [];
  const refsJson = parseJson(files.references) as { references?: unknown } | null;
  const refs = (Array.isArray(refsJson?.references) ? refsJson.references : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ id: typeof r.id === "string" ? r.id.trim() : "", doi: typeof r.doi === "string" ? r.doi : "", pmid: typeof r.pmid === "string" ? r.pmid : "" }))
    .filter((r) => r.id);
  const byKey = new Map<string, string>();
  for (const r of refs) if (!byKey.has(refKey(r.id))) byKey.set(refKey(r.id), r.id);

  const citedAt = new Map<string, string[]>();
  const inBibliography: string[] = [];
  const cite = (id: string, where: string) => (citedAt.get(id) ?? citedAt.set(id, []).get(id)!).push(where);
  /** A free-text citation: counts as use of the reference unless it is in the bibliography. */
  const textCitation = (raw: string, file: string, where: string, section?: string, bibliography = false) => {
    const known = byKey.get(refKey(raw));
    if (known && bibliography) inBibliography.push(known);
    else if (known) cite(known, where);
    if (known === raw) return;
    problems.push({
      refId: raw,
      file,
      section,
      message: known
        ? `${where}: cites ${raw}; write it exactly as the Reference ID ${known}.`
        : `${where}: cites ${raw}, which is not in ${HCD_FILES.references}. Add the paper to ${HCD_FILES.references} or cite an existing Reference ID.`,
    });
  };

  const walk = (file: string, v: unknown, path: string, structured: boolean) => {
    if (typeof v === "string") {
      for (const c of structured ? [v.trim()] : extractCitations(v)) {
        if (structured) {
          const known = byKey.get(refKey(c));
          if (known) cite(known, `${file} ${path}`);
        } else textCitation(c, file, `${file} ${path}`);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(file, x, `${path}/${i}`, structured));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(file, x, `${path}/${k}`, structured || STRUCTURED_KEYS.has(k));
  };
  walk(HCD_FILES.uc, parseJson(files.uc), "", false);
  walk(HCD_FILES.connections, parseJson(files.connections), "", false);
  walk(FRG_FILES.frg, parseJson(files.frg), "", false);

  let section = "";
  for (const line of (files.report ?? "").split("\n")) {
    if (/^##\s/.test(line)) section = line.trim();
    const bib = BIBLIOGRAPHY_RE.test(section);
    for (const c of extractCitations(line)) textCitation(c, PROJECT_FILES.report, `${PROJECT_FILES.report} ${section || "(top)"}`, section, bib);
  }

  const unused = refs.filter((r) => !citedAt.has(r.id)).map((r) => r.id);
  for (const id of new Set(unused)) {
    const where = inBibliography.includes(id) ? " (only in the report's bibliography)" : "";
    problems.push({
      refId: id,
      file: HCD_FILES.references,
      message: `${HCD_FILES.references}: ${id} is not cited in uc.json, connections.json, frg.json or the report${where}; cite it where it supports a statement or remove it.`,
    });
  }

  for (const [kind, key] of [
    ["DOI", (r: (typeof refs)[number]) => normalizeDoi(r.doi).doi],
    ["PMID", (r: (typeof refs)[number]) => normalizePmid(r.pmid).pmid],
  ] as const) {
    const seen = new Map<string, string[]>();
    for (const r of refs) {
      const k = key(r);
      if (k) (seen.get(k) ?? seen.set(k, []).get(k)!).push(r.id);
    }
    for (const [k, ids] of seen) {
      const distinct = [...new Set(ids)];
      if (distinct.length > 1) {
        problems.push({
          refId: distinct[1],
          file: HCD_FILES.references,
          message: `${HCD_FILES.references}: ${distinct.join(", ")} have the same ${kind} ${k}; keep one Reference ID per paper and update the citations.`,
        });
      }
    }
  }
  return { problems, citedAt };
}

/** Reference IDs cited in frg.json or the report's FRG section (the references the FRG phase is responsible for). */
export function frgCitedIds(c: CitationCheck): Set<string> {
  const out = new Set<string>();
  for (const [id, where] of c.citedAt) if (where.every(isFrgLocation)) out.add(id);
  return out;
}

const isFrgLocation = (where: string) => where.startsWith(`${FRG_FILES.frg} `) || where.startsWith(`${PROJECT_FILES.report} ${REPORT_SECTIONS.FRG}`);

/** Problems the FRG phase sends back (frg.json and the report's FRG section); the HCD phase sends the rest. */
export const isFrgProblem = (p: ReferenceProblem) => p.file === FRG_FILES.frg || (p.file === PROJECT_FILES.report && !!p.section?.startsWith(REPORT_SECTIONS.FRG));
