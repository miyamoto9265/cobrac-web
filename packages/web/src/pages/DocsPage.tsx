import { BookOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
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
const REPO_TITLE: Record<string, string> = { CHANGELOG: "リリースノート", README: "README", AGENTS: "AGENTS.md（作業規約）" };

const DOCS: Doc[] = Object.entries(files)
  .map(([path, text]) => {
    const base = path.split("/").pop()!.replace(/\.md$/, "");
    const isRepo = base in REPO_ORDER;
    const h1 = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    return {
      slug: base,
      title: isRepo ? REPO_TITLE[base] : h1 ?? base.replace(/^\d+_/, ""),
      text,
      group: isRepo ? "repo" : "docs",
      order: isRepo ? REPO_ORDER[base] : Number(base.match(/^(\d+)_/)?.[1] ?? 99),
    } satisfies Doc;
  })
  .sort((a, b) => (a.group === b.group ? a.order - b.order : a.group === "docs" ? -1 : 1));

export function DocsPage() {
  const { slug } = useParams();
  const doc = useMemo(() => DOCS.find((d) => d.slug === slug) ?? DOCS[0], [slug]);

  useEffect(() => {
    document.querySelector("main")?.scrollTo?.({ top: 0 });
  }, [slug]);

  const linkCls = (d: Doc) => `block rounded-md px-3 py-1.5 text-sm ${d.slug === doc?.slug ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-100"}`;

  return (
    <div className="flex h-full">
      <nav className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <BookOpen size={14} /> ドキュメント
        </div>
        {DOCS.filter((d) => d.group === "docs").map((d) => (
          <Link key={d.slug} to={`/docs/${encodeURIComponent(d.slug)}`} className={linkCls(d)}>
            {d.title}
          </Link>
        ))}
        <div className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">リポジトリ</div>
        {DOCS.filter((d) => d.group === "repo").map((d) => (
          <Link key={d.slug} to={`/docs/${encodeURIComponent(d.slug)}`} className={linkCls(d)}>
            {d.title}
          </Link>
        ))}
        <div className="mt-6 px-3 text-[11px] text-slate-400">
          {APP_VERSION_LABEL}
          {APP_BUILD_TIME && <div>build {APP_BUILD_TIME.replace("T", " ").slice(0, 16)} UTC</div>}
        </div>
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {doc ? (
          <article className="mx-auto max-w-4xl px-8 py-6">
            <Markdown text={doc.text} className="docs" />
          </article>
        ) : (
          <div className="p-6 text-sm text-slate-500">ドキュメントがありません</div>
        )}
      </div>
    </div>
  );
}
