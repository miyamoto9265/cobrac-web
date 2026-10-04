import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_DOCS, compareDocs, docFigureFiles, docSummary, type DocContentResponse, type DocSummary } from "@cobrac/shared";

/**
 * Root that holds `docs/*.md`, `docs/figures/*.svg`, `README.md` and `AGENTS.md`: DOCS_ROOT, else `admin-docs/` next to
 * the Lambda handler (copied there by the CDK bundling), else the repository checkout (tests, local runs).
 */
function docsRoot(): string {
  if (process.env.DOCS_ROOT) return process.env.DOCS_ROOT;
  if (process.env.LAMBDA_TASK_ROOT) return join(process.env.LAMBDA_TASK_ROOT, "admin-docs");
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

interface Loaded {
  files: Map<string, string>;
  items: DocSummary[];
}

let cached: Promise<Loaded> | null = null;

async function load(): Promise<Loaded> {
  const root = docsRoot();
  const files = new Map<string, string>();
  const names = (await readdir(join(root, "docs"))).filter((n) => n.endsWith(".md"));
  for (const n of names) files.set(n.replace(/\.md$/, ""), join(root, "docs", n));
  for (const n of REPO_DOCS) files.set(n, join(root, `${n}.md`));
  const items: DocSummary[] = [];
  for (const [slug, path] of files) {
    const text = await readFile(path, "utf8").catch(() => null);
    if (text === null) files.delete(slug);
    else items.push(docSummary(slug, text));
  }
  return { files, items: items.sort(compareDocs) };
}

function loaded(): Promise<Loaded> {
  cached ??= load().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

export async function listDocs(): Promise<DocSummary[]> {
  return (await loaded()).items;
}

/** One document with the SVG text of its figures; null for anything that is not a listed document. */
export async function readDoc(slug: string): Promise<DocContentResponse | null> {
  const { files } = await loaded();
  const path = files.get(slug);
  if (!path) return null;
  const text = await readFile(path, "utf8");
  const figures: Record<string, string> = {};
  const dir = join(docsRoot(), "docs", "figures");
  for (const file of docFigureFiles(text)) {
    const svg = await readFile(join(dir, file), "utf8").catch(() => null);
    if (svg !== null) figures[file] = svg;
  }
  return { slug, text, figures };
}
