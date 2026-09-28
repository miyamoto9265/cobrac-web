import { BookOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { useT, type MessageKey } from "../i18n";
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
}

const REPO_ORDER: Record<string, number> = { CHANGELOG: 0, README: 1, AGENTS: 2 };
const REPO_TITLE_KEY: Record<string, MessageKey> = {
  CHANGELOG: "docs.changelog",
  README: "docs.readme",
  AGENTS: "docs.agents",
};

const DOCS: Doc[] = Object.entries(files)
  .map(([path, text]) => {
    const base = path.split("/").pop()!.replace(/\.md$/, "");
    const isRepo = base in REPO_ORDER;
    const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    return {
      slug: base,
      title: isRepo ? base : h1 ?? base.replace(/^\d+_/, ""),
      text,
      group: isRepo ? "repo" : "docs",
      order: isRepo ? REPO_ORDER[base] : Number(base.match(/^(\d+)_/)?.[1] ?? 99),
    } satisfies Doc;
  })
  .sort((a, b) => (a.group === b.group ? a.order - b.order : a.group === "docs" ? -1 : 1));

export function DocsPage() {
  const t = useT();
  const { slug } = useParams();
  const navigate = useNavigate();
  const doc = useMemo(() => DOCS.find((d) => d.slug === slug) ?? DOCS[0], [slug]);

  useEffect(() => {
    document.querySelector("main")?.scrollTo?.({ top: 0 });
  }, [slug]);

  const linkCls = (d: Doc) => `block rounded-md px-3 py-1.5 text-sm ${d.slug === doc?.slug ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-100"}`;
  const repoTitle = (d: Doc) => (REPO_TITLE_KEY[d.slug] ? t(REPO_TITLE_KEY[d.slug]) : d.title);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
        <BookOpen size={16} className="shrink-0 text-slate-500" />
        <select
          value={doc?.slug ?? ""}
          onChange={(e) => navigate(`/docs/${encodeURIComponent(e.target.value)}`)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm coarse:py-2.5"
          aria-label={t("docs.title")}
        >
          <optgroup label={t("docs.title")}>
            {DOCS.filter((d) => d.group === "docs").map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.title}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("docs.repo")}>
            {DOCS.filter((d) => d.group === "repo").map((d) => (
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
        {DOCS.filter((d) => d.group === "docs").map((d) => (
          <Link key={d.slug} to={`/docs/${encodeURIComponent(d.slug)}`} className={linkCls(d)}>
            {d.title}
          </Link>
        ))}
        <div className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("docs.repo")}</div>
        {DOCS.filter((d) => d.group === "repo").map((d) => (
          <Link key={d.slug} to={`/docs/${encodeURIComponent(d.slug)}`} className={linkCls(d)}>
            {repoTitle(d)}
          </Link>
        ))}
        <div className="mt-6 px-3 text-[11px] text-slate-400">
          {APP_VERSION_LABEL}
          {APP_BUILD_TIME && <div>build {APP_BUILD_TIME.replace("T", " ").slice(0, 16)} UTC</div>}
        </div>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {doc ? (
          <article className="mx-auto max-w-4xl px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-6">
            <Markdown text={doc.text} className="docs" />
          </article>
        ) : (
          <div className="p-6 text-sm text-slate-500">{t("docs.empty")}</div>
        )}
      </div>
    </div>
  );
}
