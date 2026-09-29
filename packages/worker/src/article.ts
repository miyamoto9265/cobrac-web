/**
 * Explanatory-article job, free of AWS / Codex so it can be tested with a mock agent: one agent turn that writes
 * `article/<locale>.md` from the finished outputs, then `checkArticle` and fix turns. The workspace is read-only here;
 * the worker publishes the checked article (with its reference list) outside the workspace.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArticleCheck, UiLocale } from "@cobrac/shared";
import { ARTICLE_DIR, HCD_FILES, checkArticle, uiLanguageName } from "@cobrac/shared";
import type { Prompt } from "./pipeline.js";
import type { ProjectPaths } from "./steps.js";

/** Where the agent writes the article (in the local workspace only; article jobs never upload the workspace). */
export const articleFile = (paths: ProjectPaths, locale: UiLocale) => join(paths.root, ARTICLE_DIR, `${locale}.md`);

export function readReferences(paths: ProjectPaths): { id: string; doi: string }[] {
  const file = join(paths.hcd, HCD_FILES.references);
  if (!existsSync(file)) return [];
  try {
    const refs = (JSON.parse(readFileSync(file, "utf8")) as { references?: unknown }).references;
    return Array.isArray(refs)
      ? refs.filter((r): r is { id: string; doi: string } => !!r && typeof r.id === "string").map((r) => ({ id: r.id.trim(), doi: typeof r.doi === "string" ? r.doi : "" }))
      : [];
  } catch {
    return [];
  }
}

export async function articlePrompt(promptsDir: string, projectId: string, locale: UiLocale): Promise<Prompt> {
  const lang = uiLanguageName(locale);
  const spec = (await readFile(join(promptsDir, "article.md"), "utf8")).replaceAll("{P}", projectId).replaceAll("{LANG}", lang).replaceAll("{LOCALE}", locale);
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
  /** One agent turn; false when the run must stop (failure, cancel). */
  turn: (p: Prompt) => Promise<boolean>;
  onFix?: (errors: string[]) => Promise<void>;
}

export type ArticleRunResult =
  | { result: "completed"; markdown: string; check: ArticleCheck }
  | { result: "stopped" }
  | { result: "failed"; errors: string[] };

export async function runArticle(d: ArticleDriver, first: Prompt): Promise<ArticleRunResult> {
  const referenceIds = readReferences(d.paths).map((r) => r.id);
  const file = articleFile(d.paths, d.locale);
  let pending: Prompt | null = first;
  for (let attempt = 0; ; attempt++) {
    if (!(await d.turn(pending))) return { result: "stopped" };
    const markdown = existsSync(file) ? await readFile(file, "utf8") : null;
    const check = checkArticle(markdown, { referenceIds, locale: d.locale });
    if (check.errors.length === 0) return { result: "completed", markdown: markdown!, check };
    if (attempt >= d.maxNudges) return { result: "failed", errors: check.errors };
    await d.onFix?.(check.errors);
    pending = fixPrompt(d.locale, check.errors, attempt + 1, d.maxNudges);
  }
}
