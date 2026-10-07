/**
 * Admin documentation (`docs/*.md`, `README.md`, `AGENTS.md`): served by the API to admins only, so the documents
 * are not part of the public web bundle. The release notes (`CHANGELOG.md`) are not among them.
 */

export type DocGroup = "docs" | "archive" | "repo";

export interface DocSummary {
  slug: string;
  title: string;
  /** First sentence(s) of the document's "Document" row, or of its first paragraph */
  description: string;
  /** `01` for `docs/01_設計仕様.md`; null for README / AGENTS */
  number: string | null;
  group: DocGroup;
}

/** GET /admin/docs */
export interface DocListResponse {
  items: DocSummary[];
}

/** GET /admin/docs/:slug — `figures` holds the SVG text of every `./figures/<file>` the document references (and its `.narrow.svg`). */
export interface DocContentResponse {
  slug: string;
  text: string;
  figures: Record<string, string>;
}

/** Repository files listed after the numbered documents, in this order. */
export const REPO_DOCS = ["README", "AGENTS"] as const;

export const DOC_DESCRIPTION_MAX = 160;

const DOC_ROW = /^\|\s*(Document|文書)\s*\|\s*(.+?)\s*\|\s*$/;

function plain(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max = DOC_DESCRIPTION_MAX): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  const head = chars.slice(0, max).join("");
  const cut = Math.max(head.lastIndexOf("。"), head.lastIndexOf(". "));
  return cut >= max / 2 ? head.slice(0, cut + 1) : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

export function docNumber(slug: string): string | null {
  return slug.match(/^(\d+)_/)?.[1] ?? null;
}

export function docTitle(slug: string, text: string): string {
  return plain(text.match(/^#\s+(.+)$/m)?.[1] ?? "") || slug.replace(/^\d+_/, "");
}

/** The "Document | …" row of the metadata table under the title, else the first paragraph. */
export function docDescription(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#\s/.test(l)) + 1;
  const body: string[] = [];
  for (const l of lines.slice(start)) {
    if (/^##\s/.test(l)) break;
    body.push(l);
  }
  for (const l of body) {
    const m = l.match(DOC_ROW);
    if (m) return clip(plain(m[2]));
  }
  const para: string[] = [];
  let fence = false;
  for (const l of body) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence || /^\s*(```|~~~)/.test(l)) continue;
    if (!l.trim()) {
      if (para.length) break;
      continue;
    }
    if (/^\s*([|#>!]|-{3,}|[-*+]\s|\d+\.\s)/.test(l)) {
      if (para.length) break;
      continue;
    }
    para.push(l.trim());
  }
  const joined = para.reduce((acc, l) => (acc && /[^\x00-\x7f]$/.test(acc) && /^[^\x00-\x7f]/.test(l) ? acc + l : acc ? `${acc} ${l}` : l), "");
  return clip(plain(joined));
}

export function docSummary(slug: string, text: string, archived = false): DocSummary {
  const repo = (REPO_DOCS as readonly string[]).includes(slug);
  return { slug, title: repo ? slug : docTitle(slug, text), description: docDescription(text), number: repo ? null : docNumber(slug), group: repo ? "repo" : archived ? "archive" : "docs" };
}

/** Current documents, archived documents, then README and AGENTS. */
export function compareDocs(a: DocSummary, b: DocSummary): number {
  const order = { docs: 0, archive: 1, repo: 2 };
  if (a.group !== b.group) return order[a.group] - order[b.group];
  if (a.group === "repo") return REPO_DOCS.indexOf(a.slug as (typeof REPO_DOCS)[number]) - REPO_DOCS.indexOf(b.slug as (typeof REPO_DOCS)[number]);
  return Number(a.number ?? 99) - Number(b.number ?? 99) || a.slug.localeCompare(b.slug);
}

/** `figures/<file>.svg` referenced from the Markdown, plus the phone version `<file>.narrow.svg` of each. */
export function docFigureFiles(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*(?:\.{1,2}\/)?figures\/([A-Za-z0-9._-]+\.svg)/g)) {
    out.add(m[1]);
    if (!m[1].endsWith(".narrow.svg")) out.add(m[1].replace(/\.svg$/, ".narrow.svg"));
  }
  return [...out];
}
