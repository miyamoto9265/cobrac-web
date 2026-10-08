import { ListTree } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useT } from "../i18n";
import { extractHeadings } from "../lib/docs";
import { DocMarkdown, type DocFigures } from "./DocMarkdown";

/** Scroll offset (px) under which a heading counts as the current section. */
const SPY_OFFSET = 96;

export interface DocVariant {
  key: string;
  to: string;
  label: string;
  current: boolean;
}

interface Props {
  /** Identifies the document; a new one scrolls to the #hash or to the top */
  docKey: string;
  text: string;
  lang?: string;
  figures?: DocFigures;
  /** Language versions of the same document */
  variants?: DocVariant[];
  navTitle?: string;
  navFooter?: ReactNode;
  /** Shown above the document (e.g. a note that this language is not available yet) */
  notice?: ReactNode;
}

/** One Markdown document with a table of contents that follows the scroll, heading anchors and a language switch. */
export function DocReader({ docKey, text, lang, figures, variants = [], navTitle, navFooter, notice }: Props) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const headings = useMemo(() => extractHeadings(text), [text]);

  const toc = useMemo(() => {
    const hs = headings.filter((h) => h.depth === 2 || h.depth === 3);
    return hs.length > 40 ? hs.filter((h) => h.depth === 2) : hs;
  }, [headings]);

  const scrollToId = useCallback((id: string) => {
    const el = document.getElementById(id);
    const box = scrollRef.current;
    if (!el || !box) return;
    // A deep link or TOC entry may target a heading inside a closed disclosure.
    let parent = el.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 });
  }, []);

  const onAnchor = useCallback(
    (id: string) => {
      scrollToId(id);
      navigate({ search: location.search, hash: `#${encodeURIComponent(id)}` }, { replace: true });
    },
    [navigate, scrollToId, location.search],
  );

  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) {
      const frame = requestAnimationFrame(() => scrollToId(id));
      return () => cancelAnimationFrame(frame);
    }
    scrollRef.current?.scrollTo({ top: 0 });
  }, [docKey, location.hash, scrollToId]);

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
        if (el && !el.closest("details:not([open])") && el.getBoundingClientRect().top <= top) current = h.id;
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
      <nav className="hidden w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block" aria-label={t("docs.toc")}>
        {navTitle && <div className="mb-2 px-3 text-xs font-semibold leading-snug text-slate-500">{navTitle}</div>}
        {toc.length > 0 && tocList()}
        {navFooter}
      </nav>
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[52rem] px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8">
          <article className="min-w-0" lang={lang}>
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
                        key={v.key}
                        to={v.to}
                        aria-current={v.current ? "page" : undefined}
                        className={`flex items-center rounded-md px-3 py-1 coarse:min-h-[40px] ${v.current ? "bg-white font-medium text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                      >
                        {v.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {notice}
            <DocMarkdown key={docKey} text={text} headings={headings} onAnchor={onAnchor} figures={figures} />
          </article>
        </div>
      </div>
    </div>
  );
}
