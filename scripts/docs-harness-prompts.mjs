#!/usr/bin/env node
// Embed the current prompt sources in both harness articles without hand-copied snapshots.
//   node scripts/docs-harness-prompts.mjs          update the marked sections
//   node scripts/docs-harness-prompts.mjs --check  fail if either section has drifted
// This only reads source files; it never imports or starts the worker or its services.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = (path) => `https://github.com/miyamoto9265/cobrac-web/blob/main/${path}`;
const readSource = (path) => readFileSync(join(repoRoot, path), "utf8");

export const BEGIN_HARNESS_PROMPTS = "<!-- BEGIN HARNESS PROMPTS -->";
export const END_HARNESS_PROMPTS = "<!-- END HARNESS PROMPTS -->";
export const HARNESS_ARTICLES = {
  ja: "docs/04_CoBRAC_Harness_v2_ja.md",
  en: "docs/04_CoBRAC_Harness_v2.md",
};

export const PROMPT_SOURCES = [
  ["prompts/AGENTS.md", "共通ルール（AGENTS.md）", "Common rules (AGENTS.md)"],
  ["prompts/phases/RESEARCH.md", "RESEARCH：事前の文献調査", "RESEARCH: literature survey"],
  ["prompts/phases/HCD.md", "HCD：基本仕様", "HCD: base specification"],
  ["prompts/phases/HCD_roi_rules.md", "HCD：ROI の追加ルール", "HCD: additional ROI rules"],
  ["prompts/phases/FRG.md", "FRG：基本仕様（後続の GN ルールと併読）", "FRG: base specification (read with the GN rules below)"],
  ["prompts/phases/FRG_gn_rules.md", "FRG：GN の置換ルール", "FRG: replacement GN rules"],
  ["prompts/research_mode.md", "調査モード：HCD・FRG の追加指示", "Research mode: additional HCD / FRG instructions"],
  ["prompts/phases/HYPOTHESIS.md", "仮説モード：許可範囲と記録のルール", "Hypothesis mode: scope and recording rules"],
];

/** Read only a numeric literal from a named settings object; fail rather than silently document a stale default. */
function numericDefault(read, path, constant, key) {
  const block = new RegExp(`export const ${constant}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\}`).exec(read(path));
  const value = block && new RegExp(`\\b${key}:\\s*(\\d+)\\s*[,}]?`).exec(block[1]);
  if (!value) throw new Error(`Cannot read ${constant}.${key} from ${path}; update the prompt documentation generator.`);
  return Number(value[1]);
}

function details(summary, content) {
  return `<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>`;
}

/** Keep source text literal, including its internal fences, rather than rendering its instructions as article text. */
function fencedSource(source) {
  const runs = [...source.matchAll(/`+/g)].map((m) => m[0].length);
  const fence = "`".repeat(Math.max(4, ...runs.map((length) => length + 1)));
  return `${fence}markdown\n${source}${source.endsWith("\n") ? "" : "\n"}${fence}`;
}

function readingNotes(locale, read) {
  const quotes = numericDefault(read, "packages/shared/src/bra.ts", "DEFAULT_BRA_RULES", "minQuoteWords");
  const candidates = numericDefault(read, "packages/shared/src/research.ts", "RESEARCH_BUDGET", "maxCandidates");
  const queries = numericDefault(read, "packages/shared/src/research.ts", "RESEARCH_BUDGET", "minQueriesPerCandidate");
  const minutes = numericDefault(read, "packages/shared/src/research.ts", "RESEARCH_BUDGET", "timeBudgetMinutes");
  const worker = `[\`rawPhaseSpec() / phaseSpec()\`](${sourceUrl("packages/worker/src/index.ts")})`;
  const hypothesis = `[\`hypothesisRules()\`](${sourceUrl("packages/worker/src/hypothesisRules.ts")})`;
  const budgets = `[\`RESEARCH_BUDGET\`](${sourceUrl("packages/shared/src/research.ts")})`;
  const bra = `[\`DEFAULT_BRA_RULES\`](${sourceUrl("packages/shared/src/bra.ts")})`;
  if (locale === "ja") {
    return details("詳細を表示：原文の読み方・追加ルールの優先順位・差し込み値", [
      "以下はリポジトリにある英語の指示ファイルの全文です。実行時には差し込み値を埋め、プロジェクトの設定に応じて連結します。`AGENTS.md` は作業場所に置かれ、Codex がエージェントに読ませる共通ルールで、フェーズごとの本文とは別に適用されます。",
      `**原文の基本仕様だけで実効ルールを判断しないでください。** ${worker} は HCD の後ろに ROI ルール（\`harnessRules >= 1\`）、FRG の後ろに GN ルール（\`harnessRules >= 2\`）を追加します。GN ルールは FRG 基本仕様の step 5 にある UC 数の制約を置き換えます。現在のルールでは GN 内の連結性が必要で、通常は最大 2 UC、引用を伴う \`motifNote\` で分割できないモチーフを説明した場合は 3〜4 UC を認め、5 UC 以上は認めません。`,
      "調査モードでは `research_mode.md`、仮説モードでは `HYPOTHESIS.md` をさらに追加します。仮説ルールは許可された範囲だけに適用され、範囲外の文献根拠の要件は変わりません。FRG 候補、Canon の案内、RCS が使えない場合の案内、プロジェクトのヘッダや検証結果などの動的な本文は、この静的な原文一覧には含めません。",
      [
        "| 差し込み値 | 実行時の値 |",
        "| --- | --- |",
        "| `{P}` | 実際の Project ID。`<ProjectID>` など山括弧の表記は説明用の例で、自動置換のトークンではありません。 |",
        `| \`{MIN_QUOTE_WORDS}\` | ${bra} の \`minQuoteWords\`（${quotes} 語）。 |`,
        `| \`{MAX_CANDIDATES}\` / \`{MIN_QUERIES}\` | ${budgets} の候補上限 ${candidates} 件 / 候補あたり最低 ${queries} 検索。 |`,
        `| \`{BUDGET_MINUTES}\` | 調査の時間予算。標準 ${minutes} 分、\`RESEARCH_TIME_BUDGET_MIN\` で設定可能。 |`,
        `| \`{SCOPES}\` / \`{MAX_SHARE}\` / \`{RESEARCH_MODE}\` | ${hypothesis} がプロジェクトの許可範囲、仮説率の上限、調査モードの有無を埋めます。 |`,
      ].join("\n"),
      "この付録は `node scripts/docs-harness-prompts.mjs` で更新し、`--check` で原文との一致を検査します。原文内の指示は CoBRAC エージェント（LLM）に向けたもので、この記事の閲覧者への操作指示ではありません。",
    ].join("\n\n"));
  }
  return details("Show details: reading the sources, rule precedence, and substituted values", [
    "The sections below contain the complete English instruction files from the repository. At runtime the worker substitutes values and combines the files according to project settings. AGENTS.md sits in the workspace, and Codex gives it to the agent as shared rules, separately from the phase prompt body.",
    `**Read each base specification with its appended rules.** ${worker} appends the ROI rules to HCD (\`harnessRules >= 1\`) and the GN rules to FRG (\`harnessRules >= 2\`). The GN rules replace the UC-count constraints in step 5 of the base FRG specification. Under the current rules, a GN must be connected and normally has at most 2 UCs; 3–4 UCs are allowed when a cited \`motifNote\` explains an indivisible motif. 5 or more UCs are never accepted.`,
    "Research mode additionally appends `research_mode.md`; hypothesis mode appends `HYPOTHESIS.md`. Hypothesis rules apply only within the permitted scopes; literature requirements outside those scopes still apply. This static source collection does not include dynamic FRG candidates, Canon guidance, RCS-unavailable notes, project headers, or validation feedback.",
    [
      "| Placeholder | Runtime value |",
      "| --- | --- |",
      "| `{P}` | The actual Project ID. Angle-bracket examples such as `<ProjectID>` are explanatory notation, not automatic replacement tokens. |",
      `| \`{MIN_QUOTE_WORDS}\` | \`minQuoteWords\` in ${bra} (${quotes} words). |`,
      `| \`{MAX_CANDIDATES}\` / \`{MIN_QUERIES}\` | ${budgets}: at most ${candidates} candidates / at least ${queries} searches per candidate. |`,
      `| \`{BUDGET_MINUTES}\` | Research time budget: ${minutes} minutes by default, configurable with \`RESEARCH_TIME_BUDGET_MIN\`. |`,
      `| \`{SCOPES}\` / \`{MAX_SHARE}\` / \`{RESEARCH_MODE}\` | ${hypothesis} fills in the project's permitted scopes, hypothesis share limit, and research mode. |`,
    ].join("\n"),
    "Update this appendix with `node scripts/docs-harness-prompts.mjs`; use `--check` to verify that it matches the source files. Instructions inside the sources address the CoBRAC agent (the LLM), not the reader of this article.",
  ].join("\n\n"));
}

/** Deterministic marked Markdown block. An injected reader allows isolated checks without the worker runtime. */
export function renderHarnessPrompts(locale, read = readSource) {
  if (!(locale in HARNESS_ARTICLES)) throw new Error(`Unsupported harness documentation locale: ${locale}`);
  const prompts = PROMPT_SOURCES.map(([path, ja, en]) => details(
    locale === "ja" ? `詳細を表示：${ja}（全文）` : `Show details: ${en} (full source)`,
    `${locale === "ja" ? "原文" : "Source"}: [\`${path}\`](${sourceUrl(path)})\n\n${fencedSource(read(path))}`,
  ));
  return [BEGIN_HARNESS_PROMPTS, readingNotes(locale, read), ...prompts, END_HARNESS_PROMPTS].join("\n\n");
}

/** Replace exactly one marked section, leaving all hand-written article text untouched. */
export function replaceHarnessPrompts(article, block) {
  const begin = article.indexOf(BEGIN_HARNESS_PROMPTS);
  const end = article.indexOf(END_HARNESS_PROMPTS);
  if (begin < 0 || end < begin
    || article.indexOf(BEGIN_HARNESS_PROMPTS, begin + BEGIN_HARNESS_PROMPTS.length) >= 0
    || article.indexOf(END_HARNESS_PROMPTS, end + END_HARNESS_PROMPTS.length) >= 0) {
    throw new Error(`Expected exactly one ordered pair of ${BEGIN_HARNESS_PROMPTS} and ${END_HARNESS_PROMPTS}.`);
  }
  return article.slice(0, begin) + block + article.slice(end + END_HARNESS_PROMPTS.length);
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) throw new Error("Usage: node scripts/docs-harness-prompts.mjs [--check]");
  const check = args.includes("--check");
  // Read and validate both targets before writing, so an absent article or marker cannot cause a partial update.
  const targets = Object.entries(HARNESS_ARTICLES).map(([locale, path]) => {
    let current;
    try {
      current = readSource(path);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`Missing ${path}. Create the article with the HARNESS PROMPTS marker pair first.`);
      throw error;
    }
    return { path, current, generated: replaceHarnessPrompts(current, renderHarnessPrompts(locale)) };
  });
  const stale = targets.filter(({ current, generated }) => current !== generated);
  if (check && stale.length) {
    throw new Error(`Harness prompt appendices are out of date (${stale.map(({ path }) => path).join(", ")}). Run: node scripts/docs-harness-prompts.mjs`);
  }
  if (!check) for (const { path, generated } of stale) writeFileSync(join(repoRoot, path), generated);
  console.log(check ? "Harness prompt appendices match their sources (2 articles)." : `Updated harness prompt appendices (${stale.length} articles).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
