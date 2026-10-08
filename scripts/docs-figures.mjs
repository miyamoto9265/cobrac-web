#!/usr/bin/env node
// Renders the SVG figures of the specification PDF (docs/CoBRAC_仕様書.pdf, built by docs/spec-guide/build.mjs, which
// embeds a figure where docs/spec-guide/src has `<figure data-figure="<name>.ja.svg">`) into docs/figures/, and those of
// the user manual (docs/manual/*.md) into docs/manual/figures/.
//   node scripts/docs-figures.mjs          write the files
//   node scripts/docs-figures.mjs --check  exit 1 if a committed file differs from the generated output
// Every figure comes in Japanese and English, each in a wide and a narrow (phone) layout; the PDF uses the `.ja.svg`.
// Figures are plain SVG (no scripts, no external fonts or CDN), so the PDF, GitHub and the site show the same image.
// Text that does not fit its box throws, so a wording change cannot silently overflow a figure.
// Writing leaves the files of a removed figure in place; `--check` and the test report them until they are deleted.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { C, arrow, box, pill, svg, text, textWidth } from "./docs-figures-lib.mjs";
import { HARNESS_V2_FIGURES } from "./docs-figures-harness-v2.mjs";
import { HARNESS_CURRENT_FIGURES } from "./docs-figures-harness-current.mjs";
import { CIRCUIT_NAMING_FIGURES } from "./docs-figures-circuit-naming.mjs";
import { SPEED_COST_FIGURES } from "./docs-figures-speed-cost.mjs";
import { MANUAL_FIGURES } from "./docs-figures-manual.mjs";

export { textWidth };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIGURES_DIR = join(repoRoot, "docs", "figures");
export const MANUAL_FIGURES_DIR = join(repoRoot, "docs", "manual", "figures");

// ---------------------------------------------------------------------------
// harness-overview: v0 vs v1, embedded in appendix D (history) of the specification (docs/spec-guide/src/94_history.html).
// Strings. The Japanese and English figures share one layout; keep facts identical to the specification text.

const S = {
  ja: {
    overview: {
      title: "v0 と v1 の比較：誰がワークフローを進めるか",
      desc: "v0 ではワーカーが instruction_0.md を読めと指示するだけで、Codex エージェントが日本語の指示書 4 本を読み、完了を自分で判断し、英訳して CSV を手で書いた。完了の判定は CSV ファイルがあるかだけ。v1 ではワーカーがフェーズを 1 つずつ進め、英語のフェーズ仕様を渡し、ターンごとにファイルをコードで検査して問題一覧を返し、CSV・xlsx・グラフをコードで作る。エージェントは文献調査と科学的な解釈に集中する。",
      v0Head: "v0：エージェントが手順書を読み、全部を自分で回す",
      v1Head: "v1：ワーカーがフェーズを進めて検証する",
      worker: "ワーカー",
      workerV1: "ワーカー（CoBRAC ハーネス）",
      agent: "Codex エージェント",
      agentV0: "Codex エージェント（長い 1 ターン）",
      v0Worker: ["指示は 1 つだけ：", "「`instruction_0.md` を読んで従って」", "完了の判定は「CSV があるか」だけ"],
      v0Agent: ["日本語の指示書 4 本（13.9k）を順に読む", "完了を自分で判断し `[STEP_COMPLETE]`", "全部を英訳して CSV 5 本を手で書く"],
      v1Worker: ["フェーズを 1 つずつ進める（HCD → FRG → CSV）", "ターンごとにファイルをコードで検査", "CSV・xlsx・グラフをコードで作る"],
      v1Agent: ["文献調査と科学的な解釈に集中", "指摘された箇所だけを直す", "ターンの終わりに JSON を返す"],
      v0Down: ["「読んで従え」", "（問題一覧なし）"],
      v0Up: ["文字列マーカー", "`[STEP_COMPLETE]`"],
      v1Down: ["英語のフェーズ仕様", "1 本ずつ／問題一覧"],
      v1Up: ["構造化出力", "`{status, …}`"],
      v0Foot: "品質検査：なし",
      v1Foot: "品質検査：列・ID・参照・FRG の制約",
    },
  },
  en: {
    overview: {
      title: "v0 vs v1: who drives the workflow",
      desc: "In v0 the worker only tells the Codex agent to read instruction_0.md. The agent reads four Japanese instruction files, decides by itself when each phase is done, translates everything and types the CSVs; 'done' only means the CSV files exist. In v1 the worker runs one phase at a time, hands over one English phase spec, checks the files with code after every turn, returns an exact problem list, and builds the CSVs, xlsx and graphs itself. The agent focuses on literature research and scientific interpretation.",
      v0Head: "v0: the agent reads the manual and runs everything",
      v1Head: "v1: the worker drives the phases and verifies them",
      worker: "Worker",
      workerV1: "Worker (CoBRAC harness)",
      agent: "Codex agent",
      agentV0: "Codex agent (one long turn)",
      v0Worker: ["A single instruction:", "\"Read `instruction_0.md` and follow it\"", "\"Done\" = the CSV files exist"],
      v0Agent: ["Reads 4 Japanese instruction files (13.9k)", "Decides when a phase is done", "Translates and types 5 CSVs by hand"],
      v1Worker: ["Runs one phase at a time (HCD → FRG → CSV)", "Checks the files with code after every turn", "Builds the CSVs, xlsx and graphs itself"],
      v1Agent: ["Literature research and interpretation", "Fixes only the listed problems", "Ends every turn with JSON"],
      v0Down: ["\"read and follow\"", "(no problem list)"],
      v0Up: ["text markers", "`[STEP_COMPLETE]`"],
      v1Down: ["one English spec", "at a time / problems"],
      v1Up: ["structured output", "`{status, …}`"],
      v0Foot: "Quality checks: none",
      v1Foot: "Quality checks: columns, IDs, references, FRG rules",
    },
  },
};

// ---------------------------------------------------------------------------

function overview(lang, narrow = false) {
  const s = S[lang].overview;
  const pw = 410;
  const ph = 340;
  const W = narrow ? pw + 20 : 860;
  const H = narrow ? ph * 2 + 34 : ph + 20;
  const body = [];
  const panel = (px, py, head, color, worker, workerLines, agent, agentLines, down, up, foot, footKind) => {
    body.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${C.lane}" stroke="#e2e8f0"/>`);
    body.push(`<rect x="${px}" y="${py}" width="${pw}" height="36" rx="12" fill="${color}"/>`);
    body.push(`<rect x="${px}" y="${py + 24}" width="${pw}" height="12" fill="${color}"/>`);
    body.push(text(px + pw / 2, py + 23, head, { size: 14, weight: 700, color: "#ffffff", anchor: "middle", maxWidth: pw - 16 }));
    body.push(box({ x: px + 16, y: py + 52, w: pw - 32, h: 92, kind: "worker", title: worker, lines: workerLines }));
    // arrows between the worker and the agent
    body.push(arrow([[px + 70, py + 146], [px + 70, py + 202]], { color: C.worker.stroke }));
    body.push(text(px + 82, py + 170, down[0], { size: 12, color: C.muted, maxWidth: 150 }));
    body.push(text(px + 82, py + 186, down[1], { size: 12, color: C.muted, maxWidth: 150 }));
    body.push(arrow([[px + pw - 70, py + 202], [px + pw - 70, py + 146]], { color: C.agent.stroke }));
    body.push(text(px + pw - 82, py + 170, up[0], { size: 12, color: C.muted, anchor: "end", maxWidth: 150 }));
    body.push(text(px + pw - 82, py + 186, up[1], { size: 12, color: C.muted, anchor: "end", maxWidth: 150 }));
    body.push(box({ x: px + 16, y: py + 204, w: pw - 32, h: 92, kind: "agent", title: agent, lines: agentLines }));
    body.push(pill(px + pw / 2, py + 304, foot, { kind: footKind, anchor: "middle" }));
  };
  panel(10, 10, s.v0Head, C.v0, s.worker, s.v0Worker, s.agentV0, s.v0Agent, s.v0Down, s.v0Up, s.v0Foot, "bad");
  const [x1, y1] = narrow ? [10, ph + 24] : [440, 10];
  panel(x1, y1, s.v1Head, C.v1, s.workerV1, s.v1Worker, s.agent, s.v1Agent, s.v1Down, s.v1Up, s.v1Foot, "code");
  return svg({ width: W, height: H, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

const FIGURES = {
  ...HARNESS_V2_FIGURES,
  ...HARNESS_CURRENT_FIGURES,
  ...CIRCUIT_NAMING_FIGURES,
  ...SPEED_COST_FIGURES,
  "harness-overview": [overview, (lang) => overview(lang, true)],
};

function render(figures) {
  const out = {};
  for (const [name, [wide, narrow]] of Object.entries(figures)) {
    for (const lang of ["ja", "en"]) {
      out[`${name}.${lang}.svg`] = wide(lang);
      out[`${name}.${lang}.narrow.svg`] = narrow(lang);
    }
  }
  return out;
}

/** { "harness-overview.ja.svg": "<svg…", "harness-overview.ja.narrow.svg": …, … } */
export const renderAll = () => render(FIGURES);
export const renderManual = () => render(MANUAL_FIGURES);

/** Writes (or with `check`, compares) one figure directory; returns the out-of-date file names. */
function sync(dir, files, check) {
  mkdirSync(dir, { recursive: true });
  const stale = [];
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    let current = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      /* missing */
    }
    if (current === content) continue;
    if (check) stale.push(name);
    else writeFileSync(path, content);
  }
  const orphans = readdirSync(dir).filter((f) => f.endsWith(".svg") && !(f in files));
  return [...stale, ...orphans];
}

function main() {
  const check = process.argv.includes("--check");
  const targets = [
    ["docs/figures", FIGURES_DIR, renderAll()],
    ["docs/manual/figures", MANUAL_FIGURES_DIR, renderManual()],
  ];
  let failed = false;
  for (const [label, dir, files] of targets) {
    const stale = sync(dir, files, check);
    if (check && stale.length) {
      console.error(`${label} is out of date (${stale.join(", ")}). Run: npm run docs:figures`);
      failed = true;
    } else console.log(check ? `${label} is up to date (${Object.keys(files).length} files)` : `wrote ${Object.keys(files).length} files to ${label}`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
