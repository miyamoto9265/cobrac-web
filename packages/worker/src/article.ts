/**
 * Explanatory-article job, free of AWS / Codex so it can be tested with a mock agent: one agent turn that writes
 * `article/<locale>.md` from the finished outputs, then `checkArticle` and fix turns. The workspace is read-only here;
 * the worker publishes the checked article (with its reference list) and its figures outside the workspace.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArticleCheck, ArticleFigure, ArticleFormat, FrgGraph, HcdGraph, UiLocale } from "@cobrac/shared";
import {
  ARTICLE_DIR,
  ARTICLE_FIGURE_FILE_RE,
  ARTICLE_FIGURE_NAMES,
  HCD_FILES,
  buildArticleFigures,
  buildGraphs,
  checkArticle,
  sanitizeSvg,
  uiLanguageName,
} from "@cobrac/shared";
import type { Prompt } from "./pipeline.js";
import type { ProjectPaths } from "./steps.js";

/** Where the agent writes the article (in the local workspace only; article jobs never upload the workspace). */
export const articleFile = (paths: ProjectPaths, locale: UiLocale) => join(paths.root, ARTICLE_DIR, `${locale}.md`);
/** Where the agent may put figures of its own */
export const articleFigureDir = (paths: ProjectPaths) => join(paths.root, ARTICLE_DIR, "figures");

export const MAX_CUSTOM_FIGURES = 2;

export type ArticleReference = { id: string; doi: string; pmid?: string; title?: string; journal?: string };

export function readReferences(paths: ProjectPaths): ArticleReference[] {
  const file = join(paths.hcd, HCD_FILES.references);
  if (!existsSync(file)) return [];
  try {
    const refs = (JSON.parse(readFileSync(file, "utf8")) as { references?: unknown }).references;
    return Array.isArray(refs)
      ? refs
          .filter((r): r is Record<string, unknown> & { id: string } => !!r && typeof r.id === "string")
          .map((r) => {
            const text = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
            return { id: r.id.trim(), doi: text("doi"), pmid: text("pmid"), title: text("title"), journal: text("journal") };
          })
      : [];
  } catch {
    return [];
  }
}

/** HCD / FRG graphs from the workspace CSVs (the same data as the published graphs); null when they cannot be read. */
export function readArticleGraphs(paths: ProjectPaths, projectId: string, o: { hypothesisLines?: boolean } = {}): { hcd: HcdGraph; frg: FrgGraph } | null {
  try {
    const read = (f: string) => readFileSync(join(paths.csv, f), "utf8");
    const g = buildGraphs(projectId, {
      circuitsCsv: read("Circuits.csv"),
      connectionsCsv: read("Connections.csv"),
      frgCsv: read("FRG.csv"),
      referencesCsv: read("References.csv"),
      ...(o.hypothesisLines ? { hypothesisLines: true } : {}),
    });
    return g.hcd.nodes.length && g.frg.nodes.length ? g : null;
  } catch {
    return null;
  }
}

export interface ArticleFigureSet {
  graphs: { hcd: HcdGraph; frg: FrgGraph };
  /** Drawn by the worker; the article must embed all of them */
  generated: ArticleFigure[];
}

export function prepareArticleFigures(paths: ProjectPaths, projectId: string, locale: UiLocale, roi: string, o: { hypothesisLines?: boolean } = {}): ArticleFigureSet | null {
  const graphs = readArticleGraphs(paths, projectId, o);
  if (!graphs) return null;
  return { graphs, generated: buildArticleFigures(graphs.hcd, graphs.frg, { locale, roi }) };
}

/** Figures the agent drew itself under `article/figures/`, sanitized; problems go back to the agent. */
export function readCustomFigures(paths: ProjectPaths, reserved: readonly string[]): { figures: ArticleFigure[]; errors: string[] } {
  const dir = articleFigureDir(paths);
  if (!existsSync(dir)) return { figures: [], errors: [] };
  const errors: string[] = [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".svg"));
  const names = [...new Set(files.filter((f) => !f.endsWith(".narrow.svg")).map((f) => f.slice(0, -4)))].sort();
  const figures: ArticleFigure[] = [];
  for (const name of names) {
    if (!ARTICLE_FIGURE_FILE_RE.test(`${name}.svg`)) {
      errors.push(`Figure file names are kebab-case (\`article/figures/<name>.svg\`): rename ${name}.svg.`);
      continue;
    }
    if (reserved.includes(name)) {
      errors.push(`\`${name}\` is a figure the worker draws; give your own figure another name.`);
      continue;
    }
    const svg = sanitizeSvg(readFileSync(join(dir, `${name}.svg`), "utf8"));
    if (!svg) {
      errors.push(`article/figures/${name}.svg is not a usable SVG (one <svg> element of shapes and text, under 200 KB).`);
      continue;
    }
    const narrowFile = join(dir, `${name}.narrow.svg`);
    const narrow = existsSync(narrowFile) ? sanitizeSvg(readFileSync(narrowFile, "utf8")) : null;
    if (existsSync(narrowFile) && !narrow) errors.push(`article/figures/${name}.narrow.svg is not a usable SVG.`);
    figures.push({ name, svg, narrow, title: name, summary: "" });
  }
  if (figures.length > MAX_CUSTOM_FIGURES) errors.push(`Draw at most ${MAX_CUSTOM_FIGURES} figures of your own (found ${figures.length}); delete the others.`);
  return { figures, errors };
}

export function articleFormat(set: ArticleFigureSet, custom: ArticleFigure[]): ArticleFormat {
  const { hcd, frg } = set.graphs;
  return {
    figures: [...set.generated, ...custom].map((f) => f.name),
    requiredFigures: set.generated.map((f) => f.name),
    connections: hcd.edges.map((e) => [e.source, e.target]),
    circuitIds: hcd.nodes.map((n) => n.id),
    gnIds: frg.nodes.filter((n) => n.kind !== "uc").map((n) => n.id),
  };
}

export interface ArticleFacts {
  name: string;
  revision: number;
  model: string;
}

function figureList(figures: ArticleFigure[]): string {
  return figures.map((f) => `- \`./figures/${f.name}.svg\` — "${f.title}": ${f.summary}`).join("\n");
}

export async function articlePrompt(promptsDir: string, projectId: string, locale: UiLocale, facts: ArticleFacts, figures: ArticleFigure[]): Promise<Prompt> {
  const lang = uiLanguageName(locale);
  const spec = (await readFile(join(promptsDir, "article.md"), "utf8"))
    .replaceAll("{P}", projectId)
    .replaceAll("{LANG}", lang)
    .replaceAll("{LOCALE}", locale)
    .replaceAll("{FIGLANG}", locale === "ja" ? "Japanese" : "English")
    .replaceAll("{FIGURES}", figureList(figures))
    .replaceAll("{NAME}", facts.name)
    .replaceAll("{REV}", String(facts.revision))
    .replaceAll("{BRA_MODEL}", facts.model);
  return { shown: `Project ID: ${projectId}\n\nWrite the explanatory article in ${lang} (${projectId}/article/${locale}.md).`, hidden: spec };
}

function fixPrompt(locale: UiLocale, errors: string[], attempt: number, maxNudges: number): Prompt {
  return {
    shown:
      `The article check found ${errors.length} problem(s) in the article (fix attempt ${attempt}/${maxNudges}):\n` +
      `${errors.map((e) => `- ${e}`).join("\n")}\n\nFix them in the article and finish with status "done".`,
  };
}

export interface ArticleDriver {
  paths: ProjectPaths;
  locale: UiLocale;
  maxNudges: number;
  /** The worker's figures and the graph data the article is checked against */
  figures: ArticleFigureSet;
  /** One agent turn; false when the run must stop (failure, cancel). */
  turn: (p: Prompt) => Promise<boolean>;
  onFix?: (errors: string[]) => Promise<void>;
}

export type ArticleRunResult =
  | { result: "completed"; markdown: string; check: ArticleCheck; figures: ArticleFigure[] }
  | { result: "stopped" }
  | { result: "failed"; errors: string[] };

export async function runArticle(d: ArticleDriver, first: Prompt): Promise<ArticleRunResult> {
  const referenceIds = readReferences(d.paths).map((r) => r.id);
  const file = articleFile(d.paths, d.locale);
  const reserved = [...ARTICLE_FIGURE_NAMES, ...d.figures.generated.map((f) => f.name)];
  let pending: Prompt | null = first;
  for (let attempt = 0; ; attempt++) {
    if (!(await d.turn(pending))) return { result: "stopped" };
    const markdown = existsSync(file) ? await readFile(file, "utf8") : null;
    const custom = readCustomFigures(d.paths, reserved);
    const check = checkArticle(markdown, { referenceIds, locale: d.locale, format: articleFormat(d.figures, custom.figures) });
    const errors = [...check.errors, ...custom.errors];
    if (errors.length === 0) {
      const used = [...d.figures.generated, ...custom.figures].filter((f) => check.figures.includes(f.name));
      return { result: "completed", markdown: markdown!, check, figures: used };
    }
    if (attempt >= d.maxNudges) return { result: "failed", errors };
    await d.onFix?.(errors);
    pending = fixPrompt(d.locale, errors, attempt + 1, d.maxNudges);
  }
}
