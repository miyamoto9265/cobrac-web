import { BookOpen, ListTree } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { DocMarkdown } from "../components/DocMarkdown";
import { useI18n, useT, type MessageKey } from "../i18n";
import { docLanguage, extractHeadings, type DocHeading } from "../lib/docs";
import { APP_BUILD_TIME, APP_VERSION_LABEL } from "../lib/version";

// Markdown documents are bundled at build time from the repository root (see vite.config.ts server.fs.allow).
const files: Record<string, string> = {
  ...import.meta.glob("../../../../docs/*.md", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../../{README,CHANGELOG,AGENTS}.md", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

interface Doc {
  slug: string;
  title: string;
  text: string;
  group: "docs" | "repo";
  order: number;
  headings: DocHeading[];
  /** Set when the document exists in both English (`Foo.md`) and Japanese (`Foo_ja.md`). */
  pair: { base: string; lang: "ja" | "en" } | null;
}

const REPO_ORDER: Record<string, number> = { CHANGELOG: 0, README: 1, AGENTS: 2 };
const REPO_TITLE_KEY: Record<string, MessageKey> = {
  CHANGELOG: "docs.changelog",
  README: "docs.readme",
  AGENTS: "docs.agents",
};

const slugs = new Set(Object.keys(files).map((p) => p.split("/").pop()!.replace(/\.md$/, "")));

const DOCS: Doc[] = Object.entries(files)
  .map(([path, text]) => {
    const base = path.split("/").pop()!.replace(/\.md$/, "");
    const isRepo = base in REPO_ORDER;
    const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const lang = docLanguage(base);
    const paired = !isRepo && slugs.has(lang.base) && slugs.has(`${lang.base}_ja`);
    return {
      slug: base,
      title: isRepo ? base : h1 ?? base.replace(/^\d+_/, ""),
      text,
      group: isRepo ? "repo" : "docs",
      order: isRepo ? REPO_ORDER[base] : Number(base.match(/^(\d+)_/)?.[1] ?? 99),
      headings: extractHeadings(text),
      pair: paired ? lang : null,
    } satisfies Doc;
  })
  .sort((a, b) => (a.group === b.group ? a.order - b.order || a.slug.localeCompare(b.slug) : a.group === "docs" ? -1 : 1));

const resolveDoc = (file: string) => (slugs.has(file) ? file : null);

/** Scroll offset (px) under which a heading counts as the current section. */
const SPY_OFFSET = 96;

export function DocsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const doc = useMemo(() => DOCS.find((d) => d.slug === slug) ?? DOCS[0], [slug]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // A document that exists in two languages is listed once, in the UI language when available.
  const preferredLang = locale === "ja" ? "ja" : "en";
  const listed = useMemo(() => DOCS.filter((d) => !d.pair || d.pair.lang === preferredLang), [preferredLang]);
  const isCurrent = (d: Doc) => d.slug === doc?.slug || (!!d.pair && d.pair.base === doc?.pair?.base);
  const variants = doc?.pair ? DOCS.filter((d) => d.pair?.base === doc.pair!.base).sort((a, b) => Number(a.pair!.lang !== "ja") - Number(b.pair!.lang !== "ja")) : [];

  const toc = useMemo(() => {
    const hs = (doc?.headings ?? []).filter((h) => h.depth === 2 || h.depth === 3);
    return hs.length > 40 ? hs.filter((h) => h.depth === 2) : hs;
  }, [doc]);

  const scrollToId = useCallback((id: string) => {
    const el = document.getElementById(id);
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 });
  }, []);

  const onAnchor = useCallback(
    (id: string) => {
      scrollToId(id);
      navigate({ hash: `#${encodeURIComponent(id)}` }, { replace: true });
    },
    [navigate, scrollToId],
  );

  // New document: go to the #hash if there is one, otherwise to the top.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) requestAnimationFrame(() => scrollToId(id));
    else scrollRef.current?.scrollTo({ top: 0 });
  }, [doc?.slug]);

  // Scroll spy for the table of contents.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || toc.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = box.getBoundingClientRect().top + SPY_OFFSET;
      let current: string | null = toc[0].id;
      for (const h of toc) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= top) current = h.id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      box.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [toc]);

  const linkCls = (d: Doc) => `block rounded-md px-3 py-1.5 text-sm ${isCurrent(d) ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-100"}`;
  const repoTitle = (d: Doc) => (REPO_TITLE_KEY[d.slug] ? t(REPO_TITLE_KEY[d.slug]) : d.title);
  const selectValue = listed.find(isCurrent)?.slug ?? doc?.slug ?? "";

  const tocList = (onPick?: () => void) => (
    <ul className="docs-toc">
      {toc.map((h) => (
        <li key={h.id} className={h.depth === 3 ? "pl-3" : ""}>
          <a
            href={`#${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              onAnchor(h.id);
              onPick?.();
            }}
            className={h.id === activeId ? "active" : ""}
            aria-current={h.id === activeId ? "location" : undefined}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
        <BookOpen size={16} className="shrink-0 text-slate-500" />
        <select
          value={selectValue}
          onChange={(e) => navigate(`/docs/${encodeURIComponent(e.target.value)}`)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm coarse:py-2.5"
          aria-label={t("docs.title")}
        >
          <optgroup label={t("docs.title")}>
            {listed
              .filter((d) => d.group === "docs")
              .map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.title}
                </option>
              ))}
          </optgroup>
          <optgroup label={t("docs.repo")}>
            {listed
              .filter((d) => d.group === "repo")
              .map((d) => (
                <option key={d.slug} value={d.slug}>
                  {repoTitle(d)}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      <nav className="hidden w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block">
        <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <BookOpen size={14} /> {t("docs.title")}
        </div>
        {listed
          .filter((d) => d.group === "docs")
          .map((d) => (
            <div key={d.slug}>
              <Link to={`/docs/${encodeURIComponent(d.slug)}`} className={linkCls(d)} aria-current={isCurrent(d) ? "page" : undefined}>
                {d.title}
              </Link>
              {isCurrent(d) && toc.length >= 3 && (
                <div aria-label={t("docs.toc")} role="navigation">
                  {tocList()}
                </div>
              )}
            </div>
          ))}
        <div className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("docs.repo")}</div>
        {listed
          .filter((d) => d.group === "repo")
          .map((d) => (
            <div key={d.slug}>
              <Link to={`/docs/${encodeURIComponent(d.slug)}`} className={linkCls(d)} aria-current={isCurrent(d) ? "page" : undefined}>
                {repoTitle(d)}
              </Link>
              {isCurrent(d) && toc.length >= 3 && (
                <div aria-label={t("docs.toc")} role="navigation">
                  {tocList()}
                </div>
              )}
            </div>
          ))}
        <div className="mt-6 px-3 text-[11px] text-slate-400">
          {APP_VERSION_LABEL}
          {APP_BUILD_TIME && <div>build {APP_BUILD_TIME.replace("T", " ").slice(0, 16)} UTC</div>}
        </div>
      </nav>
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {doc ? (
          <div className="mx-auto max-w-[52rem] px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8">
            <article className="min-w-0" lang={doc.pair?.lang ?? undefined}>
              {(variants.length > 1 || toc.length >= 3) && (
                <div className="mb-5 flex items-start gap-2">
                  {toc.length >= 3 && (
                    <details className="docs-toc-mobile min-w-0 flex-1 lg:hidden">
                      <summary>
                        <ListTree size={16} /> {t("docs.toc")}
                      </summary>
                      {tocList((): void => {
                        document.querySelector<HTMLDetailsElement>(".docs-toc-mobile")?.removeAttribute("open");
                      })}
                    </details>
                  )}
                  {variants.length > 1 && (
                    <div role="group" aria-label={t("docs.docLanguage")} className="ml-auto inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
                      {variants.map((v) => (
                        <Link
                          key={v.slug}
                          to={`/docs/${encodeURIComponent(v.slug)}`}
                          aria-current={v.slug === doc.slug ? "page" : undefined}
                          className={`flex items-center rounded-md px-3 py-1 coarse:min-h-[40px] ${v.slug === doc.slug ? "bg-white font-medium text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                        >
                          {v.pair!.lang === "ja" ? t("langJa") : t("langEn")}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <DocMarkdown key={doc.slug} text={doc.text} headings={doc.headings} resolveDoc={resolveDoc} onAnchor={onAnchor} />
            </article>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-500">{t("docs.empty")}</div>
        )}
      </div>
    </div>
  );
}
