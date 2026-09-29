/**
 * BibTeX for the References sheet of the BRA template, and the template's form of Reference IDs.
 *
 * The template derives the Reference ID, type, authors, title and journal from the BibTeX with regular expressions
 * (`@type{Key,`, one `field = {value},` per line, spaces around `=`), and the Reference ID from the key alone:
 * `<letters before the year>, <year and the rest>` with `_` removed. So the key decides the ID
 * (`Schultz_1997a` → `Schultz, 1997a`), and the entry is written in that line-per-field layout.
 */
import { parseRefId } from "./references.js";

/** Bibliographic record of one work as fetched from Crossref or PubMed (bibliography.json). */
export interface BibRecord {
  source: "crossref" | "pubmed";
  /** Crossref work type (`journal-article`, `book-chapter`, …) or `journal-article` for PubMed */
  type: string;
  authors: { family: string; given?: string }[];
  title: string;
  /** Journal, book or proceedings title */
  container: string;
  year: number | null;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  pmid?: string;
}

/** `{P}_CSV/bibliography.json`: records keyed by `doi:<doi>` / `pmid:<pmid>`; null = looked up, not found. */
export interface BibliographyFile {
  version: 1;
  records: Record<string, BibRecord | null>;
}

export const BIBLIOGRAPHY_FILE = "bibliography.json";

export const bibKeyOfDoi = (doi: string) => `doi:${doi.trim().toLowerCase()}`;
export const bibKeyOfPmid = (pmid: string) => `pmid:${pmid.trim()}`;

// --- Reference IDs -------------------------------------------------------------------------------------------------

/** Letters of a surname usable in a BibTeX key (spaces, commas and braces removed). */
const keyName = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[\s_,{}()[\]"#%~\\=@]+/g, "")
    .replace(/\d+/g, "");

/**
 * Template Reference IDs (`Author, Year`) for CoBRAC Reference IDs (`[Author et al., Year]`): first author's surname
 * and the year with its letter. IDs that would coincide get the next free letter (`Smith, 2011` → `Smith, 2011b`).
 */
export function templateReferenceIds(ids: string[]): Map<string, { id: string; key: string }> {
  const out = new Map<string, { id: string; key: string }>();
  const taken = new Set<string>();
  for (const raw of ids) {
    if (out.has(raw)) continue;
    const inner = raw.trim().replace(/^\[|\]$/g, "");
    const m = /^(.*?),?\s*(\d{4})([a-z]?)$/.exec(inner);
    const author = keyName(parseRefId(raw).author ?? (m ? m[1] : inner)) || "Anonymous";
    const year = m ? m[2] : "0000";
    let suffix = m ? m[3] : "";
    const free = (s: string) => !taken.has(`${author}, ${year}${s}`.toLowerCase());
    if (!free(suffix)) {
      let code = suffix ? suffix.charCodeAt(0) + 1 : 98;
      while (code <= 122 && !free(String.fromCharCode(code))) code++;
      suffix = code <= 122 ? String.fromCharCode(code) : `${suffix}${taken.size}`;
    }
    const id = `${author}, ${year}${suffix}`;
    taken.add(id.toLowerCase());
    out.set(raw, { id, key: `${author}_${year}${suffix}` });
  }
  return out;
}

// --- BibTeX --------------------------------------------------------------------------------------------------------

const BIBTEX_TYPES: Record<string, { entry: string; container: "journal" | "booktitle" | null }> = {
  "journal-article": { entry: "article", container: "journal" },
  "book-chapter": { entry: "incollection", container: "booktitle" },
  "book-section": { entry: "incollection", container: "booktitle" },
  "book-part": { entry: "incollection", container: "booktitle" },
  "reference-entry": { entry: "incollection", container: "booktitle" },
  "proceedings-article": { entry: "inproceedings", container: "booktitle" },
  book: { entry: "book", container: null },
  monograph: { entry: "book", container: null },
  "edited-book": { entry: "book", container: null },
  "reference-book": { entry: "book", container: null },
  "posted-content": { entry: "misc", container: null },
  dissertation: { entry: "phdthesis", container: null },
  report: { entry: "techreport", container: null },
};

/** One line, braces balanced away (the template reads each value up to the last `}` of its line). */
const bibValue = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export interface BibtexInput {
  /** BibTeX key from `templateReferenceIds` */
  key: string;
  record?: BibRecord | null;
  /** Used when there is no record (or it lacks the field) */
  fallback: { authors?: string[]; title?: string; container?: string; year?: number | null; doi?: string; pmid?: string; url?: string };
}

export function buildBibtex(b: BibtexInput): { bibtex: string; type: string; authors: string; title: string; container: string } {
  const r = b.record ?? null;
  const kind = BIBTEX_TYPES[r?.type ?? "journal-article"] ?? { entry: "misc", container: null };
  const authors = r?.authors.length
    ? r.authors.map((a) => bibValue([a.given, a.family].filter(Boolean).join(" ")))
    : (b.fallback.authors ?? []).map(bibValue);
  const title = bibValue(r?.title || b.fallback.title || "");
  const container = bibValue(r?.container || b.fallback.container || "");
  const year = r?.year ?? b.fallback.year ?? null;
  const doi = (r?.doi || b.fallback.doi || "").trim();
  const fields: [string, string | number][] = [];
  if (doi) {
    fields.push(["doi", doi]);
    fields.push(["url", `https://doi.org/${doi}`]);
  } else if (b.fallback.url) fields.push(["url", b.fallback.url]);
  if (year) fields.push(["year", year]);
  if (r?.volume) fields.push(["volume", bibValue(r.volume)]);
  if (r?.issue) fields.push(["number", bibValue(r.issue)]);
  if (r?.pages) fields.push(["pages", bibValue(r.pages).replace(/\s*[-\u2013\u2014]+\s*/g, "--")]);
  if (r?.publisher) fields.push(["publisher", bibValue(r.publisher)]);
  const pmid = r?.pmid || b.fallback.pmid;
  if (pmid) fields.push(["pmid", pmid]);
  if (authors.length) fields.push(["author", authors.join(" and ")]);
  if (title) fields.push(["title", title]);
  if (container) fields.push([kind.container ?? "howpublished", container]);
  const body = fields.map(([k, v]) => `\t${k} = ${typeof v === "number" ? v : `{${v}}`}`).join(",\n");
  const type = kind.entry;
  return {
    bibtex: `@${type}{${b.key},\n${body}\n}`,
    type: type.charAt(0).toUpperCase() + type.slice(1),
    authors: authors.join(", "),
    title,
    container: kind.container ? container : "",
  };
}
