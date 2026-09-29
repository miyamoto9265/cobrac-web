/**
 * Explanatory articles: an optional, on-demand reading of a finished project, written in the language the user picks.
 * They are not core artifacts. They live outside the agent workspace (`article/<locale>.md` under the project prefix,
 * next to `graph/` and `output/`), are never read by the HCD / FRG validators or the CSV / xlsx conversion, and are
 * therefore exempt from the English-only rule of those files. Their own check is `checkArticle`.
 */
import { sanitizeFileNamePart } from "./projectId.js";
import { isUiLocale, uiLanguageName, type UiLocale } from "./locale.js";
import type { JobStatus } from "./types.js";

export const ARTICLE_DIR = "article";

export const articleKey = (locale: UiLocale) => `${ARTICLE_DIR}/${locale}.md`;
export const articleMetaKey = (locale: UiLocale) => `${ARTICLE_DIR}/${locale}.json`;

/** `article/ja.md` → `ja`; null for anything else (including `article/ja.json`). */
export function articleLocaleOfKey(key: string): UiLocale | null {
  const m = key.match(/^article\/([A-Za-z]+)\.md$/);
  return m && isUiLocale(m[1]) ? m[1] : null;
}

/** Stored as `article/<locale>.json` next to the article. */
export interface ArticleMeta {
  locale: UiLocale;
  /** English name of the language, e.g. "Japanese" */
  language: string;
  /** H1 of the article */
  title: string;
  createdAt: string;
  /** `ProjectRecord.revision` the article was written from; a later revision makes it stale */
  sourceRevision: number;
  jobId: string;
  model: string | null;
  /** Reference IDs from references.json cited in the article, in order of first use */
  citedReferences: string[];
}

/** Last article request of a project, so the UI can show progress or failure without touching the BRA status. */
export interface ArticleJobState {
  jobId: string;
  locale: UiLocale;
  status: JobStatus;
  errorMessage: string | null;
  requestedAt: string;
}

export function isArticleStale(meta: Pick<ArticleMeta, "sourceRevision">, project: { revision?: number }): boolean {
  return meta.sourceRevision !== (project.revision ?? 0);
}

export function articleDownloadFileName(name: string | null | undefined, projectId: string, locale: UiLocale): { ascii: string; utf8: string } {
  const ascii = `${projectId}.article.${locale}.md`;
  const base = sanitizeFileNamePart(name ?? "");
  return { ascii, utf8: base ? `${base}_${projectId}.article.${locale}.md` : ascii };
}

/** Heading of the reference list the worker appends (the agent does not write one). */
export const ARTICLE_REFERENCES_HEADING: Record<UiLocale, string> = {
  en: "References",
  ja: "参考文献",
  zh: "参考文献",
  zhTw: "參考文獻",
  ko: "참고 문헌",
  de: "Literatur",
  fr: "Références",
  es: "Referencias",
  pt: "Referências",
  ru: "Литература",
};

const REFERENCE_HEADING_RE = new RegExp(
  `^#{1,6}\\s*(?:${[...new Set([...Object.values(ARTICLE_REFERENCES_HEADING), "Bibliography", "Literature", "Quellen", "Bibliographie", "Bibliografía", "Bibliografia", "Список литературы"])].join("|")})\\s*$`,
  "im",
);

/** Markdown without fenced / inline code, so IDs and code samples do not count as text or citations. */
function prose(md: string): string {
  return md.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, "").replace(/`[^`\n]*`/g, "");
}

/**
 * Bracketed citations `[Author, Year]` (a 4-digit year before the closing bracket) that are not link texts.
 * Several IDs in one bracket (`[A, 2000; B, 2001]`) come back as one token, which never matches an ID.
 */
export function findCitations(md: string): string[] {
  const out: string[] = [];
  for (const m of prose(md).matchAll(/\[([^[\]\n]{1,200}?\b\d{4}[a-z]?)\](?!\()/g)) out.push(`[${m[1]}]`);
  return out;
}

const LETTER_RE = /\p{L}/gu;
const SCRIPTS = {
  kana: /[\u3040-\u30ff]/gu,
  han: /[\u3400-\u9fff]/gu,
  hangul: /[\uac00-\ud7af\u1100-\u11ff]/gu,
  cyrillic: /[\u0400-\u04ff]/gu,
  latin: /[A-Za-z\u00c0-\u024f]/gu,
};
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

/** Rough check that the body is in the requested language's script (Latin languages are not told apart). */
export function articleScriptProblem(md: string, locale: UiLocale): string | null {
  const text = prose(md).replace(/\[[^\]\n]*\]/g, "").replace(/\([^)\n]*\)/g, "");
  const letters = count(text, LETTER_RE);
  if (letters < 200) return null;
  const share = (re: RegExp) => count(text, re) / letters;
  const lang = uiLanguageName(locale);
  const want: Record<UiLocale, boolean> = {
    ja: share(SCRIPTS.kana) > 0.1 && share(SCRIPTS.kana) + share(SCRIPTS.han) > 0.4,
    zh: share(SCRIPTS.han) > 0.4 && share(SCRIPTS.kana) < 0.02,
    zhTw: share(SCRIPTS.han) > 0.4 && share(SCRIPTS.kana) < 0.02,
    ko: share(SCRIPTS.hangul) > 0.4,
    ru: share(SCRIPTS.cyrillic) > 0.4,
    en: share(SCRIPTS.latin) > 0.8,
    de: share(SCRIPTS.latin) > 0.8,
    fr: share(SCRIPTS.latin) > 0.8,
    es: share(SCRIPTS.latin) > 0.8,
    pt: share(SCRIPTS.latin) > 0.8,
  };
  return want[locale] ? null : `The article body is not in ${lang}; write the whole text in ${lang} (keep Circuit IDs, node IDs and Reference IDs verbatim).`;
}

/** Sanity minimum only (CJK text is about half as long as the same content in a Latin script). */
export const ARTICLE_MIN_CHARS = 1500;
const DENSE_LOCALES: readonly UiLocale[] = ["ja", "zh", "zhTw", "ko"];
export const articleMinChars = (locale: UiLocale) => (DENSE_LOCALES.includes(locale) ? ARTICLE_MIN_CHARS / 2 : ARTICLE_MIN_CHARS);

export interface ArticleCheck {
  errors: string[];
  title: string;
  /** Known Reference IDs cited, in order of first use */
  cited: string[];
}

/** Deterministic check of an agent-written article before the worker publishes it. */
export function checkArticle(md: string | null | undefined, o: { referenceIds: string[]; locale: UiLocale }): ArticleCheck {
  const errors: string[] = [];
  const text = (md ?? "").trim();
  if (!text) return { errors: ["The article file is missing or empty."], title: "", cited: [] };
  const title = text.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() ?? "";
  if (!/^#\s+\S/.test(text)) errors.push("Start the article with one `# ` title line.");
  if ((text.match(/^#\s+\S/gm) ?? []).length > 1) errors.push("Use a single `# ` title; use `##` / `###` for sections.");
  const sections = (prose(text).match(/^##\s+\S/gm) ?? []).length;
  if (sections < 3) errors.push(`Organise the article in at least 3 \`##\` sections (found ${sections}).`);
  if (text.length < articleMinChars(o.locale)) errors.push(`The article is too short (${text.length} characters); explain the whole project.`);
  if (/!\[[^\]]*\]\(/.test(text)) errors.push("Do not embed images; the reader shows the HCD / FRG graphs separately.");
  if (/<\/?[a-z][^>]*>/i.test(prose(text))) errors.push("Do not use HTML tags; write plain Markdown.");
  if (REFERENCE_HEADING_RE.test(prose(text))) errors.push("Remove the reference list section; the worker appends it from references.json.");

  const known = new Set(o.referenceIds);
  const cited: string[] = [];
  const unknown = new Set<string>();
  for (const c of findCitations(text)) {
    if (known.has(c)) {
      if (!cited.includes(c)) cited.push(c);
    } else unknown.add(c);
  }
  if (unknown.size) {
    const list = [...unknown].slice(0, 10).join(", ");
    errors.push(`Cite only Reference IDs from references.json, each in its own brackets (e.g. \`[Author, 2000]\`); not found: ${list}${unknown.size > 10 ? ", …" : ""}.`);
  }
  if (known.size && cited.length === 0) errors.push("Cite the supporting literature with Reference IDs from references.json.");
  const script = articleScriptProblem(text, o.locale);
  if (script) errors.push(script);
  return { errors, title, cited };
}

/** The published article: the agent's text plus a reference list of the cited entries (from references.json). */
export function withReferenceList(
  md: string,
  cited: string[],
  refs: { id: string; doi?: string; pmid?: string; title?: string; journal?: string }[],
  locale: UiLocale,
): string {
  const body = md.trim();
  if (!cited.length) return `${body}\n`;
  const byId = new Map(refs.map((r) => [r.id, r]));
  const items = cited.map((id) => {
    const r = byId.get(id);
    const doi = (r?.doi ?? "").trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
    const pmid = (r?.pmid ?? "").trim();
    const title = (r?.title ?? "").trim().replace(/\.$/, "");
    const journal = (r?.journal ?? "").trim();
    const link = /^10\.\S+$/.test(doi) ? `https://doi.org/${doi}` : /^\d{1,9}$/.test(pmid) ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";
    return `- ${[id, title && `${title}.`, journal && `*${journal}*.`, link].filter(Boolean).join(" ")}`;
  });
  return `${body}\n\n## ${ARTICLE_REFERENCES_HEADING[locale]}\n\n${items.join("\n")}\n`;
}
