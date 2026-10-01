import { AlertTriangle, BookOpen, Bot, Download, ListTree, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ListArticlesResponse, ProjectRecord, UiLocale } from "@cobrac/shared";
import { resolveSystemMessage } from "@cobrac/shared";
import { LOCALES, htmlLangFor, localeName, useI18n, useT, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { extractHeadings } from "../../lib/docs";
import { fmtDate, isActive } from "../../lib/format";
import { DocMarkdown } from "../DocMarkdown";

type ArticleItem = ListArticlesResponse["items"][number];

const SPY_OFFSET = 96;
const noDoc = () => null;

interface Props {
  projectId: string;
  project: ProjectRecord;
  /** BRA data complete (xlsx generated) */
  braReady: boolean;
  /** Changes whenever the artifact list is reloaded */
  version: string;
  onStarted: () => Promise<void> | void;
  onOpenChat?: () => void;
}

/** Explanatory articles: create one in a chosen language from the finished BRA data, then read or download it. */
export function ArticleView({ projectId, project, braReady, version, onStarted, onOpenChat }: Props) {
  const t = useT();
  const { locale: uiLocale } = useI18n();
  const [items, setItems] = useState<ArticleItem[] | null>(null);
  const [selected, setSelected] = useState<UiLocale | null>(null);
  const [genLocale, setGenLocale] = useState<UiLocale>(uiLocale);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const job = project.articleJob ?? null;
  const jobActive = !!job && (job.status === "QUEUED" || job.status === "RUNNING") && project.activeJobId === job.jobId;

  useEffect(() => {
    let live = true;
    api
      .articles(projectId)
      .then((r) => live && setItems(r.items))
      .catch(() => live && setItems((prev) => prev ?? []));
    return () => {
      live = false;
    };
  }, [projectId, version, job?.status, project.revision]);

  // Show the article just written; otherwise keep the choice, falling back to the UI language or the first one.
  const lastDone = useRef<string | null>(null);
  useEffect(() => {
    if (!items) return;
    if (job?.status === "COMPLETED" && lastDone.current !== job.jobId && items.some((a) => a.locale === job.locale)) {
      if (lastDone.current !== null) setSelected(job.locale);
      lastDone.current = job.jobId;
    } else if (lastDone.current === null) lastDone.current = job?.jobId ?? "";
    setSelected((cur) => (cur && items.some((a) => a.locale === cur) ? cur : (items.find((a) => a.locale === uiLocale)?.locale ?? items[0]?.locale ?? null)));
  }, [items, job?.status, job?.jobId, job?.locale, uiLocale]);

  const current = items?.find((a) => a.locale === selected) ?? null;
  const exists = (l: UiLocale) => !!items?.some((a) => a.locale === l);
  const blocked = !braReady ? t("article.notReady") : isActive(project.status) ? t("article.busy") : null;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.createArticle(projectId, genLocale);
      await onStarted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!current) return;
    const { url } = await api.downloadUrl(projectId, current.key);
    window.location.href = url;
  };

  const btn = "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs coarse:min-h-11 disabled:opacity-50";
  const jobLang = job ? localeName(job.locale, t) : "";
  const jobError = (() => {
    const e = job?.errorMessage ?? "";
    const r = resolveSystemMessage(e);
    return r ? t(r.key as MessageKey, r.vars) : e;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="article-view">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
        {items && items.length > 0 && (
          <div role="group" aria-label={t("article.read")} className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-slate-500">{t("article.read")}</span>
            {items.map((a) => (
              <button
                key={a.locale}
                type="button"
                onClick={() => setSelected(a.locale)}
                aria-pressed={a.locale === selected}
                data-testid={`article-read-${a.locale}`}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs coarse:min-h-10 ${
                  a.locale === selected ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {localeName(a.locale, t)}
                {a.stale && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={t("article.stale")} />}
              </button>
            ))}
            {current && (
              <button type="button" onClick={() => void download()} data-testid="article-download" title={t("chat.download")} className={`${btn} ml-1 border-slate-300 hover:bg-slate-50`}>
                <Download size={13} /> .md
              </button>
            )}
          </div>
        )}
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="whitespace-nowrap">{t("article.language")}</span>
            <select
              value={genLocale}
              onChange={(e) => setGenLocale(e.target.value as UiLocale)}
              data-testid="article-language"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 coarse:py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {t(l.nameKey)}
                  {exists(l.id) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !!blocked}
            title={blocked ?? t("article.cost")}
            data-testid="article-create"
            className={`${btn} border-blue-600 bg-blue-600 font-medium text-white hover:bg-blue-700`}
          >
            {exists(genLocale) ? <RefreshCw size={13} /> : <Sparkles size={13} />} {exists(genLocale) ? t("article.recreate") : t("article.create")}
          </button>
        </div>
      </div>

      {(err || jobActive || job?.status === "FAILED" || job?.status === "CANCELLED") && (
        <div className="shrink-0 space-y-1 border-b border-slate-200 px-3 py-2 text-xs sm:px-4">
          {err && <div className="rounded-md bg-rose-50 px-3 py-1.5 text-rose-700">{err}</div>}
          {jobActive && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-blue-800" data-testid="article-progress">
              <Loader2 size={13} className="animate-spin" />
              <span className="min-w-0 flex-1">{t(job!.status === "QUEUED" ? "article.queued" : "article.running", { lang: jobLang })}</span>
              {onOpenChat && (
                <button type="button" onClick={onOpenChat} className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-0.5 hover:bg-blue-50 coarse:min-h-10">
                  <Bot size={12} /> {t("ws.openAgent")}
                </button>
              )}
            </div>
          )}
          {!jobActive && job?.status === "FAILED" && (
            <div className="rounded-md bg-rose-50 px-3 py-1.5 text-rose-700">{t("article.failed", { lang: jobLang, error: jobError })}</div>
          )}
          {!jobActive && job?.status === "CANCELLED" && <div className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-600">{t("article.cancelled", { lang: jobLang })}</div>}
        </div>
      )}

      {items === null ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> {t("loading")}
        </div>
      ) : current ? (
        <ArticleReader key={`${current.locale}|${current.lastModified}`} projectId={projectId} item={current} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
          <BookOpen size={36} className="text-slate-300" />
          <h2 className="text-base font-semibold text-slate-700">{t("article.none")}</h2>
          <p className="max-w-md text-sm text-slate-500">{t("article.intro")}</p>
          <p className="max-w-md text-xs text-slate-400">{blocked ?? t("article.cost")}</p>
        </div>
      )}
    </div>
  );
}

function ArticleReader({ projectId, item }: { projectId: string; item: ArticleItem }) {
  const t = useT();
  const { locale } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api
      .artifactText(projectId, item.key)
      .then((s) => live && setText(s))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [projectId, item.key]);

  const headings = useMemo(() => (text ? extractHeadings(text) : []), [text]);
  const toc = useMemo(() => headings.filter((h) => h.depth === 2 || h.depth === 3), [headings]);

  const onAnchor = useCallback((id: string) => {
    const el = document.getElementById(id);
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 });
  }, []);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || toc.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = box.getBoundingClientRect().top + SPY_OFFSET;
      let cur: string | null = toc[0].id;
      for (const h of toc) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= top) cur = h.id;
      }
      setActiveId(cur);
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
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[64rem] gap-8 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-7">
        {toc.length >= 3 && (
          <nav aria-label={t("docs.toc")} className="sticky top-4 hidden max-h-[calc(100vh-12rem)] w-56 shrink-0 self-start overflow-y-auto xl:block">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <ListTree size={14} /> {t("docs.toc")}
            </div>
            {tocList()}
          </nav>
        )}
        <article className="min-w-0 max-w-[48rem] flex-1" lang={htmlLangFor(item.locale)}>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{localeName(item.locale, t)}</span>
            <span>{t("article.written", { date: fmtDate(item.createdAt, locale) })}</span>
            {item.citedReferences.length > 0 && <span>{t("article.refs", { count: item.citedReferences.length })}</span>}
            {item.model && <span className="font-mono">{item.model}</span>}
          </div>
          {item.stale && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="article-stale">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {t("article.stale")}
            </div>
          )}
          {toc.length >= 3 && (
            <details className="docs-toc-mobile article-toc-mobile mb-5 xl:hidden">
              <summary>
                <ListTree size={16} /> {t("docs.toc")}
              </summary>
              {tocList(() => scrollRef.current?.querySelector<HTMLDetailsElement>(".article-toc-mobile")?.removeAttribute("open"))}
            </details>
          )}
          {err ? (
            <div className="text-sm text-rose-600">{err}</div>
          ) : text === null ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> {t("loading")}
            </div>
          ) : (
            <DocMarkdown text={text} headings={headings} resolveDoc={noDoc} onAnchor={onAnchor} />
          )}
        </article>
      </div>
    </div>
  );
}
