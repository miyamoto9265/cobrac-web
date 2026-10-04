import { BookOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DocContentResponse, DocSummary } from "@cobrac/shared";
import type { DocFigures } from "../components/DocMarkdown";
import { DocReader, type DocVariant } from "../components/DocReader";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { docLanguage } from "../lib/docs";

const REPO_TITLE_KEY: Record<string, MessageKey> = { README: "docs.readme", AGENTS: "docs.agents" };

/** A document that exists as `Foo.md` (English) and `Foo_ja.md` (Japanese) is listed once. */
function pairOf(d: DocSummary, slugs: Set<string>): { base: string; lang: "ja" | "en" } | null {
  if (d.group !== "docs") return null;
  const l = docLanguage(d.slug);
  return slugs.has(l.base) && slugs.has(`${l.base}_ja`) ? l : null;
}

const docPath = (slug: string) => `/docs/${encodeURIComponent(slug)}`;

/** Object URLs of the SVG figures that came with a document; revoked when the document changes. */
function useFigureUrls(figures: Record<string, string> | undefined): DocFigures | undefined {
  const [out, setOut] = useState<DocFigures | undefined>(undefined);
  useEffect(() => {
    if (!figures) return setOut(undefined);
    const urls: Record<string, string> = {};
    for (const [file, svg] of Object.entries(figures)) urls[file] = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const res: DocFigures = {};
    for (const [file, url] of Object.entries(urls)) if (!file.endsWith(".narrow.svg")) res[file] = { url, narrow: urls[file.replace(/\.svg$/, ".narrow.svg")] };
    setOut(res);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [figures]);
  return out;
}

/** Admin documentation: an index of the documents, then one document with its table of contents. */
export function DocsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { slug } = useParams();
  const [items, setItems] = useState<DocSummary[] | null>(null);
  const [doc, setDoc] = useState<DocContentResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminDocs()
      .then((r) => setItems(r.items))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    setDoc(null);
    setErr(null);
    if (!slug) return;
    let live = true;
    api
      .adminDoc(slug)
      .then((d) => live && setDoc(d))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [slug]);

  const figures = useFigureUrls(doc?.figures);
  const slugs = useMemo(() => new Set((items ?? []).map((d) => d.slug)), [items]);
  const preferredLang = locale === "ja" ? "ja" : "en";
  const title = (d: DocSummary) => (REPO_TITLE_KEY[d.slug] ? t(REPO_TITLE_KEY[d.slug]) : d.title);
  const docHref = useCallback((file: string) => (file === "CHANGELOG" ? "/releases" : slugs.has(file) ? docPath(file) : null), [slugs]);

  if (err) return <div className="p-6 text-sm text-red-600">{t("docs.loadFailed", { error: err })}</div>;
  if (!items || (slug && !doc)) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" aria-label={t("loading")} />
      </div>
    );
  }

  if (slug && doc) {
    const current = items.find((d) => d.slug === doc.slug);
    const pair = current ? pairOf(current, slugs) : null;
    const variants: DocVariant[] = pair
      ? (["ja", "en"] as const).map((l) => {
          const s = l === "ja" ? `${pair.base}_ja` : pair.base;
          return { key: s, to: docPath(s), label: l === "ja" ? t("langJa") : t("langEn"), current: s === doc.slug };
        })
      : [];
    return (
      <DocReader
        docKey={doc.slug}
        text={doc.text}
        lang={pair?.lang}
        figures={figures ?? {}}
        docHref={docHref}
        back={{ to: "/docs", label: t("docs.back") }}
        variants={variants}
        navTitle={current ? title(current) : undefined}
      />
    );
  }

  const listed = items.filter((d) => {
    const p = pairOf(d, slugs);
    return !p || p.lang === preferredLang;
  });
  const section = (group: DocSummary["group"], label: string) => {
    const ds = listed.filter((d) => d.group === group);
    if (ds.length === 0) return null;
    return (
      <section className="mt-6 first:mt-0">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white" data-testid={`docs-index-${group}`}>
          {ds.map((d) => (
            <li key={d.slug}>
              <Link to={docPath(d.slug)} className="flex gap-3 px-4 py-3 hover:bg-slate-50" data-testid="docs-index-item">
                <span className="w-7 shrink-0 pt-0.5 font-mono text-xs text-slate-400">{d.number ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{title(d)}</span>
                  {d.description && <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">{d.description}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <BookOpen size={20} className="text-slate-500" /> {t("docs.title")}
          <span className="text-sm font-normal text-slate-500">{t("docs.count", { n: listed.length })}</span>
        </h1>
        <p className="mb-5 mt-1 text-sm text-slate-600">{t("docs.intro")}</p>
        {listed.length === 0 && <div className="text-sm text-slate-500">{t("docs.empty")}</div>}
        {section("docs", t("docs.title"))}
        {section("repo", t("docs.repo"))}
      </div>
    </div>
  );
}
