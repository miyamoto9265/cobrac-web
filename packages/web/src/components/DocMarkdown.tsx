import { Link2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useT } from "../i18n";
import type { DocHeading } from "../lib/docs";
import { remarkDetails } from "../lib/remarkDetails";

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[]; position?: { start: { line: number } } };

const nodeText = (n: HastNode | undefined): string => (n ? (n.value ?? "") + (n.children ?? []).map(nodeText).join("") : "");

/** Figure files of an explanatory article: `circuit.svg` → object URLs of the sanitized wide / phone versions. */
export type DocFigures = Record<string, { url: string; narrow?: string }>;

interface Props {
  text: string;
  headings: DocHeading[];
  /** Resolves a relative `Foo.md` link to an in-app path, or null if it is not a document of the app. */
  docHref: (file: string) => string | null;
  onAnchor: (id: string) => void;
  /** Resolves `./figures/<file>` and archived documents' `../figures/<file>`; other images keep their src */
  figures?: DocFigures;
}

export function DocMarkdown({ text, headings, docHref, onAnchor, figures }: Props) {
  const t = useT();
  const components = useMemo<Components>(() => {
    const idByLine = new Map(headings.map((h) => [h.line, h.id]));
    const heading =
      (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
      ({ node, children }: { node?: unknown; children?: ReactNode }) => {
        const id = idByLine.get((node as HastNode | undefined)?.position?.start.line ?? -1);
        return (
          <Tag id={id} className="group">
            {children}
            {id && Tag !== "h1" && (
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onAnchor(id);
                }}
                className="heading-anchor"
                aria-label="#"
              >
                <Link2 size={14} />
              </a>
            )}
          </Tag>
        );
      };
    return {
      h1: heading("h1"),
      h2: heading("h2"),
      h3: heading("h3"),
      h4: heading("h4"),
      h5: heading("h5"),
      h6: heading("h6"),
      p: ({ node, children }) => {
        const kids = (node as HastNode | undefined)?.children ?? [];
        const onlyImage = kids.filter((k) => !(k.type === "text" && !k.value?.trim())).every((k) => k.tagName === "img");
        return onlyImage && kids.length > 0 ? <>{children}</> : <p>{children}</p>;
      },
      img: ({ src = "", alt = "", title }) => {
        const file = src.match(/^(?:\.{1,2}\/)?figures\/([^/?#]+)$/)?.[1];
        if (figures && !(file && figures[file])) return null;
        const url = figures ? figures[file!].url : src;
        const narrow = figures ? figures[file!].narrow : undefined;
        return (
          <figure className={`docs-figure${narrow ? " has-narrow" : ""}`}>
            <div className="docs-figure-scroll">
              <a href={url} target="_blank" rel="noreferrer">
                <picture>
                  {narrow && <source media="(max-width: 639px)" srcSet={narrow} />}
                  <img src={url} alt={alt} loading="lazy" decoding="async" />
                </picture>
              </a>
            </div>
            {title && <figcaption>{title}</figcaption>}
            {!narrow && <div className="docs-figure-hint">{t("docs.figureHint")}</div>}
          </figure>
        );
      },
      a: ({ href = "", children }) => {
        if (href.startsWith("#")) {
          const id = decodeURIComponent(href.slice(1));
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                onAnchor(id);
              }}
            >
              {children}
            </a>
          );
        }
        const md = href.match(/^(?:\.{1,2}\/)*(?:docs\/)?(?:archive\/)?([^/:?#]+)\.md(#.*)?$/);
        const to = md ? docHref(decodeURIComponent(md[1])) : null;
        if (to) return <Link to={`${to}${md?.[2] ?? ""}`}>{children}</Link>;
        return /^https?:/.test(href) ? (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ) : (
          <a href={href}>{children}</a>
        );
      },
      table: ({ children }) => (
        <div className="docs-table">
          <table>{children}</table>
        </div>
      ),
      details: ({ children }) => <details className="docs-details">{children}</details>,
      summary: ({ children }) => <summary>{children}</summary>,
      th: ({ node, children, style }) => {
        const label = nodeText(node as HastNode | undefined).trim();
        const version = label === "v0" || label === "v1" || label === "v1.1" ? label.replace(".", "-") : null;
        return <th style={style}>{version ? <span className={`version-pill version-${version}`}>{children}</span> : children}</th>;
      },
    };
  }, [headings, docHref, onAnchor, t, figures]);

  return (
    <div className="markdown docs">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDetails]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
