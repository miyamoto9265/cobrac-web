/** Heading anchors compatible with GitHub's, so `[4.4](#44-…)` links work both on GitHub and on the Docs page. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Plain text of an inline Markdown heading: drops code ticks, emphasis and link targets. */
export function inlineText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .trim();
}

export interface DocHeading {
  depth: number;
  text: string;
  id: string;
  /** 1-based source line, used to give the rendered heading the same id */
  line: number;
}

/** h2/h3 headings outside code fences, with GitHub-style de-duplicated ids (`foo`, `foo-1`, …). */
export function extractHeadings(markdown: string): DocHeading[] {
  const out: DocHeading[] = [];
  const seen = new Map<string, number>();
  let fence: { marker: string; length: number } | null = null;
  markdown.split("\n").forEach((raw, i) => {
    const fenceMatch = raw.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence && (marker !== "`" || !fenceMatch[2].includes("`"))) fence = { marker, length: fenceMatch[1].length };
      else if (fence && marker === fence.marker && fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) fence = null;
      return;
    }
    if (fence) return;
    const m = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) return;
    const text = inlineText(m[2]);
    const base = headingSlug(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ depth: m[1].length, text, id: n ? `${base}-${n}` : base, line: i + 1 });
  });
  return out;
}

/** `04_Foo_ja` → { base: "04_Foo", lang: "ja" }. Only meaningful when both `04_Foo` (English) and `04_Foo_ja` exist. */
export function docLanguage(slug: string): { base: string; lang: "ja" | "en" } {
  return slug.endsWith("_ja") ? { base: slug.slice(0, -3), lang: "ja" } : { base: slug, lang: "en" };
}
