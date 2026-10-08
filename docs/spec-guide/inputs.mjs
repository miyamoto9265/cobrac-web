// 仕様書の入力の一覧と、そのハッシュ。build.mjs と、PDF が入力に追いついているかを確かめるテスト
// （scripts/spec-guide.test.mjs）の両方が使う。Playwright などには依存しない。
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..");
export const srcDir = join(here, "src");
export const figuresDir = join(repoRoot, "docs", "figures");
/** 生成する PDF（リポジトリにコミットし、API の Lambda に同梱してサイトの「仕様書」ページで見せる） */
export const PDF_NAME = "CoBRAC_仕様書.pdf";
export const pdfPath = join(repoRoot, "docs", PDF_NAME);
/** build.mjs が書く記録（入力のハッシュ・ページ数・バイト数） */
export const buildRecordPath = join(here, "build.json");

/**
 * 付録 B に全文を載せる指示ファイル（LLM に渡すもの）。[パス, 付録の見出し]。
 * 載せる順に並べる。ファイルを増やしたらここにも足す。
 */
export const PROMPT_SOURCES = [
  ["prompts/AGENTS.md", "共通ルール（AGENTS.md）"],
  ["prompts/phases/RESEARCH.md", "調査ステップ（RESEARCH.md）"],
  ["prompts/phases/HCD.md", "HCD の基本仕様（HCD.md）"],
  ["prompts/phases/HCD_roi_rules.md", "HCD の ROI 規則（HCD_roi_rules.md）"],
  ["prompts/phases/FRG.md", "FRG の基本仕様（FRG.md）"],
  ["prompts/phases/FRG_gn_rules.md", "FRG の GN 規則（FRG_gn_rules.md）"],
  ["prompts/research_mode.md", "調査モードの追加指示（research_mode.md）"],
  ["prompts/phases/HYPOTHESIS.md", "仮説モードの規則（HYPOTHESIS.md）"],
  ["prompts/article.md", "解説記事ジョブ（article.md）"],
  ["prompts/plan.md", "オーケストレーターの計画ジョブ（plan.md）"],
];

/** 付録 B の差し込み値の説明で、実行時の値を読むコード（値が変われば PDF も作り直す） */
export const CODE_INPUTS = ["packages/shared/src/bra.ts", "packages/shared/src/research.ts"];

export function srcFiles() {
  return readdirSync(srcDir)
    .filter((f) => f.endsWith(".html") || f.endsWith(".css"))
    .sort();
}

/** 本文が `data-figure="<name>"` で取り込む docs/figures の SVG */
export function referencedFigures() {
  const names = new Set();
  for (const f of srcFiles().filter((f) => f.endsWith(".html"))) {
    for (const m of readFileSync(join(srcDir, f), "utf8").matchAll(/data-figure="([^"]+)"/g)) names.add(m[1]);
  }
  return [...names].sort();
}

/** PDF の中身を決めるすべてのファイル（リポジトリからの相対パス） */
export function inputFiles() {
  const rel = (p) => relative(repoRoot, p);
  return [
    rel(join(here, "build.mjs")),
    rel(join(here, "inputs.mjs")),
    ...srcFiles().map((f) => rel(join(srcDir, f))),
    ...referencedFigures().map((f) => rel(join(figuresDir, f))),
    ...PROMPT_SOURCES.map(([p]) => p),
    ...CODE_INPUTS,
  ];
}

/** 入力ファイルの名前と中身から作る SHA-256（改行コードの違いは無視する） */
export function inputHash() {
  const h = createHash("sha256");
  for (const f of inputFiles()) {
    h.update(f);
    h.update("\0");
    h.update(readFileSync(join(repoRoot, f), "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex");
}
