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
  /**
   * Figure files under `article/<locale>/figures/` (`circuit.svg`, `circuit.narrow.svg`, …) the article embeds as
   * `./figures/<file>`; absent in articles written before figures (they have none)
   */
  figures?: string[];
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
  /** Figure names embedded (`circuit` for `./figures/circuit.svg`), in order of appearance */
  figures: string[];
}

/** What an article in the documentation format may embed and mention (from the project's graph data). */
export interface ArticleFormat {
  /** Figures available as `./figures/<name>.svg` */
  figures: string[];
  /** Figures the article must embed */
  requiredFigures: string[];
  /** Connections of the HCD as [sender, receiver] Circuit IDs */
  connections: [string, string][];
  circuitIds: string[];
  /** FRG node IDs (`R.…`) */
  gnIds: string[];
}

/** Anchor of a heading as the article reader makes it (GitHub-style, like the user manual). */
export function articleHeadingSlug(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function headingAnchors(md: string): Set<string> {
  const out = new Set<string>();
  const seen = new Map<string, number>();
  for (const m of withoutFences(md).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = articleHeadingSlug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

const withoutFences = (md: string) => md.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, "");
const IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g;
const stripUc = (id: string) => id.trim().replace(/^U\./, "");

/** Deterministic check of an agent-written article before the worker publishes it. */
export function checkArticle(md: string | null | undefined, o: { referenceIds: string[]; locale: UiLocale; format?: ArticleFormat }): ArticleCheck {
  const errors: string[] = [];
  const text = (md ?? "").trim();
  if (!text) return { errors: ["The article file is missing or empty."], title: "", cited: [], figures: [] };
  const title = text.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() ?? "";
  if (!/^#\s+\S/.test(text)) errors.push("Start the article with one `# ` title line.");
  if ((text.match(/^#\s+\S/gm) ?? []).length > 1) errors.push("Use a single `# ` title; use `##` / `###` for sections.");
  const sections = (prose(text).match(/^##\s+\S/gm) ?? []).length;
  const minSections = o.format ? 5 : 3;
  if (sections < minSections) errors.push(`Organise the article in at least ${minSections} \`##\` sections (found ${sections}).`);
  if (text.length < articleMinChars(o.locale)) errors.push(`The article is too short (${text.length} characters); explain the whole project.`);
  const figures: string[] = [];
  if (!o.format) {
    if (/!\[[^\]]*\]\(/.test(text)) errors.push("Do not embed images; the reader shows the HCD / FRG graphs separately.");
  } else {
    const f = o.format;
    const afterTitle = text.split("\n").slice(1).find((l) => l.trim()) ?? "";
    if (!afterTitle.trim().startsWith("|")) errors.push("Put the summary table (`| Item | Content |`) right after the `# ` title line.");
    const available = new Set(f.figures);
    const bad: string[] = [];
    const noCaption: string[] = [];
    for (const m of withoutFences(text).matchAll(IMAGE_RE)) {
      const name = m[2].match(/^(?:\.\/)?figures\/([a-z0-9][a-z0-9-]*)\.svg$/)?.[1];
      if (!name || !available.has(name)) {
        bad.push(m[2]);
        continue;
      }
      figures.push(name);
      if (!m[1].trim() || !(m[3] ?? "").trim()) noCaption.push(name);
    }
    if (bad.length) errors.push(`Embed only the listed figures as \`./figures/<name>.svg\` (available: ${f.figures.join(", ")}); not available: ${bad.slice(0, 5).join(", ")}.`);
    const missing = f.requiredFigures.filter((n) => !figures.includes(n));
    if (missing.length) errors.push(`Embed these figures where the text explains them: ${missing.map((n) => `./figures/${n}.svg`).join(", ")}.`);
    const twice = [...new Set(figures.filter((n, i) => figures.indexOf(n) !== i))];
    if (twice.length) errors.push(`Embed each figure once (repeated: ${twice.join(", ")}).`);
    if (noCaption.length) errors.push(`Give every figure an alt text and a caption: \`![<what it shows>](./figures/<name>.svg "<caption>")\` (missing for ${noCaption.join(", ")}).`);

    const circuits = new Set(f.circuitIds.map(stripUc));
    const pairs = new Set(f.connections.map(([a, b]) => `${stripUc(a)}\u0000${stripUc(b)}`));
    const wrong = new Set<string>();
    for (const m of withoutFences(text).matchAll(/`([^`\n]+)`\s*(?:→|->|⟶|⇒)\s*(?=`([^`\n]+)`)/g)) {
      const a = stripUc(m[1]);
      const b = stripUc(m[2]);
      if (circuits.has(a) && circuits.has(b) && !pairs.has(`${a}\u0000${b}`)) wrong.add(`\`${a}\` → \`${b}\``);
    }
    if (wrong.size) {
      errors.push(
        `An arrow between two Circuit IDs stands for a connection in connections.json; these are not connections (check the direction, or describe the route step by step): ${[...wrong].slice(0, 10).join(", ")}.`,
      );
    }
    const gns = new Set(f.gnIds);
    const unknownGn = new Set([...withoutFences(text).matchAll(/`(R\.[^`\s]+)`/g)].map((m) => m[1]).filter((id) => !gns.has(id)));
    if (unknownGn.size) errors.push(`These node IDs are not in frg.json: ${[...unknownGn].slice(0, 10).join(", ")}.`);
    const anchors = headingAnchors(text);
    const brokenLinks = new Set(
      [...withoutFences(text).matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => decodeURIComponent(m[1])).filter((a) => !anchors.has(a)),
    );
    if (brokenLinks.size) {
      errors.push(
        `These section links point to no heading: ${[...brokenLinks].slice(0, 6).map((a) => `#${a}`).join(", ")} (an anchor is the heading text in lower case, spaces as \`-\`, punctuation removed: \`## 4.2 情報の流れ\` → \`#42-情報の流れ\`).`,
      );
    }
  }
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
  return { errors, title, cited, figures };
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
