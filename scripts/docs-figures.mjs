#!/usr/bin/env node
// Renders the SVG figures used by docs/*.md into docs/figures/.
//   node scripts/docs-figures.mjs          write the files
//   node scripts/docs-figures.mjs --check  exit 1 if a committed file differs from the generated output
// Figures are plain SVG (no scripts, no external fonts or CDN), so GitHub and the site's Docs page show the same image.
// Text that does not fit its box throws, so a wording change cannot silently overflow a figure.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { C, NW, arrow, badge, box, legendRows, pill, svg, text, textWidth } from "./docs-figures-lib.mjs";
import { HARNESS_V1_1_FIGURES } from "./docs-figures-harness-v1-1.mjs";

export { textWidth };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIGURES_DIR = join(repoRoot, "docs", "figures");

// ---------------------------------------------------------------------------
// Strings. The Japanese and English figures share one layout; keep facts identical to the article.

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
    v0: {
      title: "v0 のアーキテクチャ：エージェントが手順書を読み、全部を自分で回す",
      desc: "ワーカーは「instruction_0.md を読んで従ってください」とだけ送る。Codex エージェントは長い 1 ターンの中で instruction_0.md、instruction_1_HCD.md、instruction_2_FRG.md、instruction_3_csv.md を順に読み、HCD ファイル 8 本、FRG ファイル 5 本、CSV 5 本を書き、フェーズごとに [STEP_COMPLETE] マーカーを出す。文脈上の指示は 1.4k、6.1k、11.5k、13.9k トークンと積み上がる。ターンが終わるとワーカーは CSV があるかだけを確認し、なければ同じ内容で「続けて」と催促し（最大 3 回）、あれば csv_to_excel.py とグラフ生成に進む。",
      workerLane: "ワーカー",
      agentLane: "Codex エージェント（長い 1 ターン）",
      ctxHead: "文脈上の指示（累計）",
      ctxShort: "文脈上の指示",
      w1: ["「`instruction_0.md` を読んで", "従ってください」"],
      a0: "`instruction_0.md` を読む（日本語 1.4k）",
      a1: ["`instruction_1_HCD.md` を読む（日本語 4.8k）", "└ HCD ファイル 8 本（解説記事・Mermaid 図を含む）"],
      a2: ["`instruction_2_FRG.md` を読む（日本語 5.3k）", "└ FRG ファイル 5 本（表 + Mermaid）"],
      a3: ["`instruction_3_csv.md` を読む（日本語 2.4k）", "└ md を読み直して英訳し、CSV 5 本を手で書く"],
      m: ["[STEP_COMPLETE] HCD", "[STEP_COMPLETE] FRG", "[STEP_COMPLETE] CSV"],
      turnEnd: "ターン終了",
      decision: ["CSV は", "あるか？"],
      no: "ない",
      yes: "ある",
      nudge: ["「続けて」と催促", "（最大 3 回、同じ内容）"],
      done: "`csv_to_excel.py` → グラフ",
      legend: ["① 中身を検査しない", "② 進捗は文字列マーカー頼み", "③ CSV は手作業の翻訳", "④ 指示書が文脈に残り続ける"],
    },
    v1: {
      title: "v1 のアーキテクチャ：ワーカーがフェーズを進めて検証する",
      desc: "ワーカー（CoBRAC ハーネス）は作業場所を準備し AGENTS.md を置く。HCD フェーズではヘッダと phases/HCD.md をプロンプトにし、エージェントが HCD 6 本と meta.json を書くと checkHcd() で検査する。問題があれば問題一覧つきの修正依頼を送り（最大 3 回）、エージェントは指摘箇所だけを直す。受理されると FRG フェーズに進み、phases/FRG.md と checkFrg() で同様に進める。CSV フェーズはエージェントなしで buildCsvs() が md の表から CSV 5 本を作り、失敗したときだけフォールバックの phases/CSV.md でエージェントが CSV を書く。最後に csv_to_excel.py が .bra.xlsx を、buildGraphs() が HCD/FRG の JSON を作り S3 に置く。どのターンでも status が question なら状態を S3 に保存してタスクを止め、ユーザーの回答を待つ。",
      workerLane: "ワーカー（CoBRAC ハーネス）",
      agentLane: "Codex エージェント",
      prep: { title: "作業場所の準備", line: "フォルダ作成、`AGENTS.md`（自動で読まれる共通ルール）" },
      agentsMd: ["`AGENTS.md` を自動で読む", "（共通ルール 0.7k）"],
      phases: [
        {
          name: "HCD フェーズ",
          prompt: ["プロンプト", "ヘッダ + `phases/HCD.md`（英語 1.3k）"],
          task: ["調査し、HCD 6 本 +", "`meta.json` を書く"],
          check: ["`checkHcd()`"],
        },
        {
          name: "FRG フェーズ",
          prompt: ["プロンプト", "`phases/FRG.md`（英語 1.0k）"],
          task: ["FRG 5 本を書く"],
          check: ["`checkFrg()`", "根は 1 つ、循環なし、GN の UC は 2 まで…"],
        },
      ],
      json: "JSON {status}",
      fixReq: "問題あり → 問題一覧つきの修正依頼（最大 3 回）",
      fixReqNarrow: ["問題あり → 問題一覧つきの", "修正依頼（最大 3 回）"],
      fix: "指摘箇所だけを直す",
      accepted: "受理",
      csvPhase: "CSV フェーズ（エージェントなし）",
      build: ["`buildCsvs()`", "md の表 → CSV 5 本"],
      fallbackLabel: ["失敗したときだけ（旧形式の日本語ファイルなど）", "フォールバック `phases/CSV.md`"],
      fallbackTask: "CSV を書く",
      xlsx: ["`csv_to_excel.py`", "→ `.bra.xlsx`"],
      graphs: ["`buildGraphs()`", "→ HCD/FRG の JSON"],
      s3: "S3",
      question: ["どのターンでも：`{status:\"question\"}` → 状態を S3 に保存してタスクを止め、", "ユーザーの回答を待つ"],
      questionNarrow: ["どのターンでも：`{status:\"question\"}` →", "状態を S3 に保存してタスクを止め、", "ユーザーの回答を待つ"],
      legendWorker: "ワーカーが送る指示",
      legendCode: "コードによる検査・生成",
      legendAgent: "エージェントの作業",
    },
    tokens: {
      title: "各フェーズで、リクエストのたびに文脈に載っている指示の量",
      desc: "v0 は HCD 6.1k、FRG 11.5k、CSV 13.9k トークン。v1 は HCD 2.0k、FRG 3.1k、CSV 3.1k トークン（予備を除きエージェントは動かない）。",
      unit: "トークン",
      note: "予備を除きエージェントは動かない",
      total: "指示ファイルの合計：13,871 → 3,534 トークン（約 4 分の 1）",
      totalNarrow: ["指示ファイルの合計：", "13,871 → 3,534 トークン（約 4 分の 1）"],
    },
    output: {
      title: "成果物の出力量（v0 の実プロジェクト 5 件の平均から推定）",
      desc: "エージェントが書いた HCD/FRG の成果物全体 62,400 トークンから、初学者向け解説記事と Mermaid 図ファイル 9,100、FRG ファイル内の Mermaid ブロック 1,000、エージェントが打ち込んだ CSV 6,300、日本語部分を英語で書いた場合の差 10,300 を引き、v1 の成果物出力は約 35,700 トークン（約 43% 減）と推定される。",
      rows: [
        ["v0：エージェントが書いた", "HCD/FRG の成果物全体"],
        ["初学者向け解説記事 +", "Mermaid 図ファイル（作らない）"],
        ["FRG ファイル内の", "Mermaid ブロック（作らない）"],
        ["エージェントが打ち込んだ CSV", "（コードで生成）"],
        ["日本語部分を英語で書いた差", "（英語のほうが短い）"],
        ["v1 の成果物出力（推定）", ""],
      ],
      reduction: "約 43% 減",
      unit: "トークン",
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
    v0: {
      title: "v0 architecture: the agent reads the manual and runs everything",
      desc: "The worker only sends \"Read instruction_0.md and follow it\". In one long turn the Codex agent reads instruction_0.md, instruction_1_HCD.md, instruction_2_FRG.md and instruction_3_csv.md in order, writes 8 HCD files, 5 FRG files and 5 CSVs, and prints a [STEP_COMPLETE] marker after each phase. Instructions in the context pile up to 1.4k, 6.1k, 11.5k and 13.9k tokens. When the turn ends the worker only checks whether CSV files exist: if not, it sends the same \"continue\" nudge (max 3); if so, it runs csv_to_excel.py and builds the graphs.",
      workerLane: "Worker",
      agentLane: "Codex agent (one long turn)",
      ctxHead: "Instructions in context",
      ctxShort: "in context",
      w1: ["\"Read `instruction_0.md`", "and follow it\""],
      a0: "read `instruction_0.md` (JA, 1.4k tokens)",
      a1: ["read `instruction_1_HCD.md` (JA, 4.8k)", "└ write 8 HCD files (incl. explainer + Mermaid)"],
      a2: ["read `instruction_2_FRG.md` (JA, 5.3k)", "└ write 5 FRG files (tables + Mermaid)"],
      a3: ["read `instruction_3_csv.md` (JA, 2.4k)", "└ re-read, translate, write 5 CSVs by hand"],
      m: ["[STEP_COMPLETE] HCD", "[STEP_COMPLETE] FRG", "[STEP_COMPLETE] CSV"],
      turnEnd: "turn ends",
      decision: ["CSV files", "present?"],
      no: "no",
      yes: "yes",
      nudge: ["\"continue\" nudge", "(max 3, same prompt)"],
      done: "`csv_to_excel.py` → graphs",
      legend: ["① content not checked", "② progress via text markers", "③ CSV = manual translation", "④ all instructions stay in context"],
    },
    v1: {
      title: "v1 architecture: the worker drives the phases and verifies them",
      desc: "The worker (CoBRAC harness) prepares the workspace and writes AGENTS.md. In the HCD phase the prompt is a header plus phases/HCD.md; when the agent has written 6 HCD files and meta.json, checkHcd() checks them. If there are problems, a fix prompt with the exact list is sent (max 3) and the agent fixes only those problems. Once accepted, the FRG phase runs the same way with phases/FRG.md and checkFrg(). The CSV phase has no agent: buildCsvs() turns the markdown tables into 5 CSVs, and only if that fails does the agent write the CSVs through the fallback prompt phases/CSV.md. Finally csv_to_excel.py builds the .bra.xlsx and buildGraphs() the HCD/FRG JSON, which go to S3. At any turn, status question saves the state to S3, stops the task and waits for the user.",
      workerLane: "Worker (CoBRAC harness)",
      agentLane: "Codex agent",
      prep: { title: "Prepare workspace", line: "folders, `AGENTS.md` (auto-loaded shared rules)" },
      agentsMd: ["auto-loads `AGENTS.md`", "(shared rules, 0.7k)"],
      phases: [
        {
          name: "Phase HCD",
          prompt: ["Prompt", "header + `phases/HCD.md` (EN, 1.3k)"],
          task: ["research, write 6 HCD", "files + `meta.json`"],
          check: ["`checkHcd()`"],
        },
        {
          name: "Phase FRG",
          prompt: ["Prompt", "`phases/FRG.md` (EN, 1.0k)"],
          task: ["write 5 FRG files"],
          check: ["`checkFrg()`", "1 root, no cycle, ≤2 UC per GN, …"],
        },
      ],
      json: "JSON {status}",
      fixReq: "problems? → fix prompt with the exact list (≤3)",
      fixReqNarrow: ["problems? → fix prompt", "with the exact list (≤3)"],
      fix: "fix only those problems",
      accepted: "accepted",
      csvPhase: "Phase CSV (no agent)",
      build: ["`buildCsvs()`", "markdown tables → 5 CSVs"],
      fallbackLabel: ["only if it fails (e.g. legacy Japanese files):", "fallback prompt `phases/CSV.md`"],
      fallbackTask: "write the CSVs",
      xlsx: ["`csv_to_excel.py`", "→ `.bra.xlsx`"],
      graphs: ["`buildGraphs()`", "→ HCD/FRG JSON"],
      s3: "S3",
      question: ["At any turn: `{status:\"question\"}` → save state to S3, stop the task,", "wait for the user"],
      questionNarrow: ["At any turn: `{status:\"question\"}` →", "save state to S3, stop the task,", "wait for the user"],
      legendWorker: "prompt sent by the worker",
      legendCode: "checks and generation in code",
      legendAgent: "agent work",
    },
    tokens: {
      title: "Instructions in the context of every request, by phase",
      desc: "v0: HCD 6.1k, FRG 11.5k, CSV 13.9k tokens. v1: HCD 2.0k, FRG 3.1k, CSV 3.1k tokens (no agent unless fallback).",
      unit: "tokens",
      note: "no agent unless fallback",
      total: "Instruction files in total: 13,871 → 3,534 tokens (about a quarter)",
      totalNarrow: ["Instruction files in total:", "13,871 → 3,534 tokens (about a quarter)"],
    },
    output: {
      title: "Artifact output (estimated from five real v0 projects, average)",
      desc: "All HCD/FRG artifacts written by the agent, 62,400 tokens, minus the beginner explainer and Mermaid diagram file (9,100), Mermaid blocks inside FRG files (1,000), CSVs typed by the agent (6,300) and the difference from writing the Japanese text in English (10,300) gives an estimated v1 artifact output of about 35,700 tokens (about −43%).",
      rows: [
        ["v0: all HCD/FRG artifacts", "written by the agent"],
        ["Beginner explainer + Mermaid", "diagram file (not generated)"],
        ["Mermaid blocks inside", "FRG files (not generated)"],
        ["CSVs typed by the agent", "(generated by code)"],
        ["Japanese text rewritten", "in English (shorter)"],
        ["Estimated v1 artifact output", ""],
      ],
      reduction: "≈ −43%",
      unit: "tokens",
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

function v0Flow(lang) {
  const s = S[lang].v0;
  const W = 860;
  const H = 720;
  const body = [];
  // lanes
  const WL = { x: 10, w: 270 };
  const AL = { x: 300, w: 550 };
  body.push(`<rect x="${WL.x}" y="10" width="${WL.w}" height="${H - 60}" rx="12" fill="${C.lane}" stroke="#e2e8f0"/>`);
  body.push(`<rect x="${AL.x}" y="10" width="${AL.w}" height="${H - 60}" rx="12" fill="${C.lane}" stroke="#e2e8f0"/>`);
  body.push(text(WL.x + WL.w / 2, 36, s.workerLane, { size: 15, weight: 700, color: C.worker.title, anchor: "middle" }));
  body.push(text(AL.x + 20, 36, s.agentLane, { size: 15, weight: 700, color: C.agent.title }));
  body.push(text(AL.x + AL.w - 16, 36, s.ctxHead, { size: 12, weight: 600, color: C.muted, anchor: "end" }));

  // agent turn group
  const G = { x: AL.x + 12, y: 52, w: 390, h: 444 };
  body.push(`<rect x="${G.x}" y="${G.y}" width="${G.w}" height="${G.h}" rx="10" fill="#ffffff" stroke="${C.agent.stroke}" stroke-width="1.2" stroke-dasharray="4 4"/>`);

  const bx = G.x + 12;
  const bw = G.w - 24;
  const rows = [
    { y: 66, h: 44, lines: [s.a0], ctx: 1350 },
    { y: 150, h: 60, lines: s.a1, ctx: 6146 },
    { y: 270, h: 60, lines: s.a2, ctx: 11461 },
    { y: 390, h: 60, lines: s.a3, ctx: 13871 },
  ];
  const markerY = [216, 336, 456];
  rows.forEach((r, i) => {
    body.push(box({ x: bx, y: r.y, w: bw, h: r.h, kind: "agent", lines: r.lines, size: 12.5 }));
    if (i > 0) body.push(arrow([[bx + 40, rows[i - 1].y + rows[i - 1].h + (i > 1 ? 34 : 0)], [bx + 40, r.y]], { color: C.agent.stroke }));
    // cumulative instruction tokens in the context
    const cx = AL.x + 420;
    const maxW = 110;
    const bwTok = (r.ctx / 13871) * maxW;
    const cy = r.y + r.h / 2 - 7;
    body.push(`<rect x="${cx}" y="${cy}" width="${maxW}" height="14" rx="3" fill="#f1f5f9"/>`);
    body.push(`<rect x="${cx}" y="${cy}" width="${bwTok.toFixed(1)}" height="14" rx="3" fill="${C.v0}"/>`);
    body.push(text(cx + maxW, cy + 30, `${(r.ctx / 1000).toFixed(1)}k`, { size: 12, weight: 600, color: C.warn.title, anchor: "end" }));
  });
  markerY.forEach((y, i) => body.push(pill(bx + 64, y, `\`${s.m[i]}\``, { kind: "warn", size: 11.5 })));
  body.push(badge(bx + 64 + textWidth(`\`${s.m[0]}\``, 11.5) + 36, markerY[0] + 12, 2));
  body.push(badge(bx + bw - 4, rows[3].y + 4, 3));
  body.push(badge(AL.x + AL.w - 18, 62, 4));

  // worker: initial prompt
  body.push(box({ x: WL.x + 16, y: 62, w: WL.w - 32, h: 56, kind: "worker", lines: s.w1, size: 12.5 }));
  body.push(arrow([[WL.x + WL.w - 16, 88], [bx, 88]], { color: C.worker.stroke }));

  // nudge loop
  const N = { x: WL.x + 26, y: 400, w: WL.w - 52, h: 56 };
  body.push(box({ ...N, kind: "warn", lines: s.nudge, size: 12.5, align: "middle" }));
  body.push(arrow([[N.x + N.w, N.y + 28], [G.x, N.y + 28]], { color: C.warn.stroke, dashed: true }));

  // decision
  const D = { cx: WL.x + WL.w / 2, cy: 540, rw: 92, rh: 44 };
  body.push(
    `<path d="M${D.cx} ${D.cy - D.rh} L${D.cx + D.rw} ${D.cy} L${D.cx} ${D.cy + D.rh} L${D.cx - D.rw} ${D.cy} Z" fill="${C.bad.fill}" stroke="${C.bad.stroke}" stroke-width="1.5"/>`,
  );
  body.push(text(D.cx, D.cy - 3, s.decision[0], { size: 13, weight: 700, color: C.bad.title, anchor: "middle" }));
  body.push(text(D.cx, D.cy + 14, s.decision[1], { size: 13, weight: 700, color: C.bad.title, anchor: "middle" }));
  body.push(badge(D.cx + D.rw - 6, D.cy - D.rh + 6, 1));
  body.push(arrow([[G.x + G.w / 2, G.y + G.h], [G.x + G.w / 2, D.cy], [D.cx + D.rw, D.cy]], { color: C.agent.stroke }));
  body.push(text(G.x + G.w / 2 - 8, D.cy - 8, s.turnEnd, { size: 12, color: C.muted, anchor: "end" }));
  body.push(arrow([[D.cx, D.cy - D.rh], [D.cx, N.y + N.h]], { color: C.warn.stroke }));
  body.push(text(D.cx + 8, D.cy - D.rh - 16, s.no, { size: 12, weight: 600, color: C.warn.title }));
  body.push(arrow([[D.cx, D.cy + D.rh], [D.cx, 612]], { color: C.line }));
  body.push(text(D.cx + 8, D.cy + D.rh + 18, s.yes, { size: 12, weight: 600, color: C.muted }));
  body.push(box({ x: WL.x + 16, y: 612, w: WL.w - 32, h: 40, kind: "code", lines: [s.done], size: 12.5, align: "middle" }));

  // legend
  let lx = 12;
  for (const item of s.legend) {
    body.push(text(lx, H - 14, item, { size: 12, color: C.bad.title }));
    lx += textWidth(item, 12) + 22;
  }
  if (lx > W) throw new Error(`v0 legend does not fit (${Math.round(lx)} > ${W}px)`);
  return svg({ width: W, height: H, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function v1Flow(lang) {
  const s = S[lang].v1;
  const W = 860;
  const body = [];
  const WL = { x: 10, w: 470 };
  const AL = { x: 500, w: 350 };
  const lanesTop = 10;
  const px = WL.x + 16; // worker box x
  const pw = 300; // worker box width
  const ax = AL.x + 20; // agent box x
  const aw = AL.w - 40;
  const joinX = ax + aw / 2; // vertical line where agent output returns to the validator

  const flowX = px + 40; // vertical flow arrow between phases; phase tags sit to its right
  const phaseTag = (top, name) =>
    `<rect x="${flowX + 16}" y="${top - 11}" width="${textWidth(name, 13) + 20}" height="22" rx="11" fill="#1e293b"/>` +
    text(flowX + 26, top + 4.5, name, { size: 13, weight: 700, color: "#ffffff" });

  let y = 52;
  const parts = [];
  parts.push(box({ x: px, y, w: WL.w - 32, h: 52, kind: "worker", title: s.prep.title, lines: [s.prep.line], size: 12.5 }));
  parts.push(box({ x: ax, y, w: aw, h: 52, kind: "agent", lines: s.agentsMd, size: 12.5, dashed: true, align: "middle" }));
  parts.push(arrow([[px + WL.w - 32, y + 26], [ax, y + 26]], { color: C.worker.stroke, dashed: true }));
  y += 52;

  let prevOut = [flowX, y];
  for (const ph of s.phases) {
    y += 34;
    const top = y;
    const promptY = top + 34;
    const checkY = promptY + 84;
    const fixY = checkY + 76;
    const bottom = fixY + 56;
    parts.push(`<rect x="${WL.x + 6}" y="${top}" width="${W - 32}" height="${bottom - top}" rx="10" fill="none" stroke="#cbd5e1" stroke-width="1.2"/>`);
    parts.push(phaseTag(top, ph.name));
    parts.push(arrow([prevOut, [prevOut[0], promptY]], { color: C.line }));
    if (ph !== s.phases[0]) parts.push(text(prevOut[0] + 8, top - 16, s.accepted, { size: 12, weight: 600, color: C.code.title }));

    parts.push(box({ x: px, y: promptY, w: pw, h: 52, kind: "worker", title: ph.prompt[0], lines: [ph.prompt[1]], size: 12.5, titleSize: 13 }));
    parts.push(box({ x: ax, y: promptY, w: aw, h: 52, kind: "agent", lines: ph.task, size: 12.5, align: "middle" }));
    parts.push(arrow([[px + pw, promptY + 26], [ax, promptY + 26]], { color: C.worker.stroke }));

    parts.push(box({ x: px, y: checkY, w: pw, h: ph.check.length > 1 ? 52 : 40, kind: "code", lines: ph.check, size: 12.5 }));
    const checkMid = checkY + (ph.check.length > 1 ? 26 : 20);
    parts.push(arrow([[joinX, promptY + 52], [joinX, checkMid], [px + pw, checkMid]], { color: C.agent.stroke }));
    parts.push(text(px + pw + 10, checkMid - 8, s.json, { size: 12, color: C.muted }));

    parts.push(box({ x: ax, y: fixY, w: aw, h: 40, kind: "agent", lines: [s.fix], size: 12.5, align: "middle" }));
    parts.push(`<path d="M${joinX} ${fixY} L${joinX} ${checkMid}" fill="none" stroke="${C.agent.stroke}" stroke-width="1.6"/>`);
    const checkBottom = checkY + (ph.check.length > 1 ? 52 : 40);
    parts.push(arrow([[px + 200, checkBottom], [px + 200, fixY + 20], [ax, fixY + 20]], { color: C.bad.stroke }));
    parts.push(text(px + 210, fixY + 14, s.fixReq, { size: 12, color: C.bad.title, maxWidth: ax - px - 216 + 40 }));

    prevOut = [flowX, checkBottom];
    y = bottom;
  }

  // CSV phase
  y += 34;
  const top = y;
  const buildY = top + 34;
  const bottom = buildY + 100;
  parts.push(`<rect x="${WL.x + 6}" y="${top}" width="${W - 32}" height="${bottom - top}" rx="10" fill="none" stroke="#cbd5e1" stroke-width="1.2"/>`);
  parts.push(phaseTag(top, s.csvPhase));
  parts.push(arrow([prevOut, [prevOut[0], buildY]], { color: C.line }));
  parts.push(text(prevOut[0] + 8, top - 16, s.accepted, { size: 12, weight: 600, color: C.code.title }));
  parts.push(box({ x: px, y: buildY, w: pw, h: 52, kind: "code", lines: s.build, size: 12.5 }));
  const fbY = buildY + 60;
  parts.push(box({ x: ax, y: fbY, w: aw, h: 36, kind: "agent", lines: [s.fallbackTask], size: 12.5, dashed: true, align: "middle" }));
  parts.push(arrow([[px + 200, buildY + 52], [px + 200, fbY + 18], [ax, fbY + 18]], { color: C.agent.stroke, dashed: true }));
  parts.push(text(px + pw + 10, buildY + 18, s.fallbackLabel[0], { size: 11.5, color: C.muted, maxWidth: W - px - pw - 30 }));
  parts.push(text(px + pw + 10, buildY + 34, s.fallbackLabel[1], { size: 11.5, color: C.muted, maxWidth: W - px - pw - 30 }));
  y = bottom;

  // outputs
  y += 30;
  const outY = y;
  parts.push(arrow([[flowX, buildY + 52], [flowX, outY]], { color: C.line }));
  parts.push(box({ x: px, y: outY, w: 190, h: 50, kind: "code", lines: s.xlsx, size: 12.5 }));
  parts.push(box({ x: px + 210, y: outY, w: 190, h: 50, kind: "code", lines: s.graphs, size: 12.5 }));
  parts.push(box({ x: ax, y: outY, w: 110, h: 50, kind: "plain", title: s.s3, align: "middle" }));
  parts.push(arrow([[px + 190, outY + 25], [px + 210, outY + 25]], { color: C.line }));
  parts.push(arrow([[px + 400, outY + 25], [ax, outY + 25]], { color: C.line }));
  y = outY + 50;

  // question banner
  y += 20;
  parts.push(box({ x: WL.x + 6, y, w: W - 32, h: 52, kind: "warn", lines: s.question, size: 12.5 }));
  y += 52;

  // legend
  y += 26;
  const legend = [
    ["worker", s.legendWorker],
    ["code", s.legendCode],
    ["agent", s.legendAgent],
  ];
  let lx = WL.x + 6;
  for (const [k, label] of legend) {
    parts.push(`<rect x="${lx}" y="${y - 11}" width="16" height="14" rx="3" fill="${C[k].fill}" stroke="${C[k].stroke}" stroke-width="1.5"/>`);
    parts.push(text(lx + 22, y, label, { size: 12, color: C.muted }));
    lx += 22 + textWidth(label, 12) + 26;
  }
  const H = y + 16;

  body.push(`<rect x="${WL.x}" y="${lanesTop}" width="${WL.w}" height="${H - 20}" rx="12" fill="${C.lane}" stroke="#e2e8f0"/>`);
  body.push(`<rect x="${AL.x}" y="${lanesTop}" width="${AL.w}" height="${H - 20}" rx="12" fill="${C.lane}" stroke="#e2e8f0"/>`);
  body.push(text(WL.x + 20, 36, s.workerLane, { size: 15, weight: 700, color: C.worker.title }));
  body.push(text(AL.x + 20, 36, s.agentLane, { size: 15, weight: 700, color: C.agent.title }));
  body.push(...parts);
  return svg({ width: W, height: H, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function tokens(lang) {
  const s = S[lang].tokens;
  const W = 860;
  const H = 300;
  const x0 = 80;
  const barMax = 560;
  const max = 14000;
  const scale = (v) => (v / max) * barMax;
  const rows = [
    ["HCD", 6146, 2017],
    ["FRG", 11461, 3053],
    ["CSV", 13871, 3053],
  ];
  const body = [];
  for (let t = 0; t <= max; t += 2000) {
    const x = x0 + scale(t);
    body.push(`<line x1="${x}" y1="40" x2="${x}" y2="232" stroke="#e2e8f0"/>`);
    body.push(text(x, 250, `${t / 1000}k`, { size: 11, color: C.faint, anchor: "middle" }));
  }
  body.push(text(x0 + barMax, 268, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  rows.forEach(([name, v0, v1], i) => {
    const y = 50 + i * 62;
    body.push(text(x0 - 14, y + 30, name, { size: 15, weight: 700, color: C.text, anchor: "end" }));
    body.push(`<rect x="${x0}" y="${y}" width="${scale(v0).toFixed(1)}" height="22" rx="4" fill="${C.v0}"/>`);
    body.push(text(x0 + scale(v0) + 8, y + 16, `v0  ${(v0 / 1000).toFixed(1)}k`, { size: 12.5, weight: 700, color: C.warn.title }));
    body.push(`<rect x="${x0}" y="${y + 26}" width="${scale(v1).toFixed(1)}" height="22" rx="4" fill="${C.v1}"/>`);
    const label = `v1  ${(v1 / 1000).toFixed(1)}k${name === "CSV" ? `  (${s.note})` : ""}`;
    body.push(text(x0 + scale(v1) + 8, y + 42, label, { size: 12.5, weight: 700, color: C.worker.title }));
  });
  body.push(text(x0, 22, s.total, { size: 13, weight: 600, color: C.text, maxWidth: W - x0 }));
  body.push(`<rect x="${W - 190}" y="${H - 22}" width="12" height="12" rx="2" fill="${C.v0}"/>`);
  body.push(text(W - 172, H - 12, "v0", { size: 12, color: C.muted }));
  body.push(`<rect x="${W - 130}" y="${H - 22}" width="12" height="12" rx="2" fill="${C.v1}"/>`);
  body.push(text(W - 112, H - 12, "v1", { size: 12, color: C.muted }));
  return svg({ width: W, height: H, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function output(lang) {
  const s = S[lang].output;
  const W = 860;
  const labelW = 250;
  const x0 = labelW + 20;
  const barMax = 480;
  const max = 65000;
  const scale = (v) => (v / max) * barMax;
  const steps = [62400, -9100, -1000, -6300, -10300];
  const rowH = 50;
  const top = 20;
  const body = [];
  const chartBottom = top + rowH * 6;
  for (let t = 0; t <= 60000; t += 10000) {
    const x = x0 + scale(t);
    body.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${chartBottom}" stroke="#e2e8f0"/>`);
    body.push(text(x, chartBottom + 18, `${t / 1000}k`, { size: 11, color: C.faint, anchor: "middle" }));
  }
  body.push(text(x0 + barMax, chartBottom + 36, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  let acc = 0;
  const fmt = (v) => `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")}`;
  s.rows.forEach((label, i) => {
    const y = top + i * rowH + 12;
    body.push(text(labelW, y + 10, label[0], { size: 12.5, weight: i === 0 || i === 5 ? 700 : 400, color: C.text, anchor: "end", maxWidth: labelW }));
    if (label[1]) body.push(text(labelW, y + 26, label[1], { size: 12, color: C.muted, anchor: "end", maxWidth: labelW }));
    if (i < 5) {
      const v = steps[i];
      const from = acc;
      acc += v;
      const a = Math.min(from, acc);
      const b = Math.max(from, acc);
      const fill = i === 0 ? C.v0 : "#fca5a5";
      body.push(`<rect x="${(x0 + scale(a)).toFixed(1)}" y="${y}" width="${(scale(b) - scale(a)).toFixed(1)}" height="24" rx="3" fill="${fill}"/>`);
      if (i > 0) body.push(`<line x1="${(x0 + scale(from)).toFixed(1)}" y1="${y - rowH + 24}" x2="${(x0 + scale(from)).toFixed(1)}" y2="${y}" stroke="${C.faint}" stroke-dasharray="3 3"/>`);
      const lx = i === 0 ? x0 + scale(b) + 8 : x0 + scale(b) + 8;
      body.push(text(lx, y + 17, fmt(v), { size: 12.5, weight: 700, color: i === 0 ? C.warn.title : C.bad.title }));
    } else {
      body.push(`<line x1="${(x0 + scale(acc)).toFixed(1)}" y1="${y - rowH + 24}" x2="${(x0 + scale(acc)).toFixed(1)}" y2="${y}" stroke="${C.faint}" stroke-dasharray="3 3"/>`);
      body.push(`<rect x="${x0}" y="${y}" width="${scale(35700).toFixed(1)}" height="24" rx="3" fill="${C.v1}"/>`);
      body.push(text(x0 + scale(35700) + 8, y + 17, `≈ 35,700  (${s.reduction})`, { size: 12.5, weight: 700, color: C.worker.title }));
    }
  });
  const H = chartBottom + 48;
  return svg({ width: W, height: H, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------
// Narrow (phone) layouts: one column, the actor shown by colour, same facts as the wide figures.

function v0FlowNarrow(lang) {
  const s = S[lang].v0;
  const body = [];
  let y = 26;
  body.push(text(12, y, s.workerLane, { size: 13, weight: 700, color: C.worker.title }));
  y += 8;
  body.push(box({ x: 10, y, w: NW - 20, h: 50, kind: "worker", lines: s.w1, size: 12.5, align: "middle" }));
  y += 50;
  body.push(arrow([[NW / 2, y], [NW / 2, y + 26]], { color: C.worker.stroke }));
  y += 26;
  const gTop = y;
  const parts = [];
  y += 30;
  parts.push(text(22, gTop + 21, s.agentLane, { size: 13, weight: 700, color: C.agent.title }));
  const rows = [
    { lines: [s.a0], h: 40, ctx: 1350 },
    { lines: s.a1, h: 58, ctx: 6146, m: s.m[0] },
    { lines: s.a2, h: 58, ctx: 11461, m: s.m[1] },
    { lines: s.a3, h: 58, ctx: 13871, m: s.m[2] },
  ];
  rows.forEach((r, i) => {
    parts.push(box({ x: 22, y, w: NW - 44, h: r.h, kind: "agent", lines: r.lines, size: 12 }));
    if (i === 3) parts.push(badge(NW - 26, y + 4, 3));
    y += r.h;
    if (i < rows.length - 1) parts.push(arrow([[44, y], [44, y + 44]], { color: C.agent.stroke }));
    if (r.m) {
      parts.push(pill(62, y + 8, `\`${r.m}\``, { kind: "warn", size: 11 }));
      if (i === 1) parts.push(badge(62 + textWidth(`\`${r.m}\``, 11) + 32, y + 19, 2));
    }
    parts.push(text(NW - 26, y + 23, `${s.ctxShort} ${(r.ctx / 1000).toFixed(1)}k`, { size: 11.5, weight: 700, color: C.warn.title, anchor: "end" }));
    y += 44;
  });
  const gBottom = y - 6;
  body.push(`<rect x="10" y="${gTop}" width="${NW - 20}" height="${gBottom - gTop}" rx="10" fill="${C.lane}" stroke="${C.agent.stroke}" stroke-width="1.2" stroke-dasharray="4 4"/>`);
  body.push(...parts);
  body.push(badge(NW - 22, gTop + 16, 4));

  // decision and nudge
  const D = { cx: 112, cy: gBottom + 80, rw: 92, rh: 42 };
  body.push(arrow([[D.cx, gBottom], [D.cx, D.cy - D.rh]], { color: C.agent.stroke }));
  body.push(text(D.cx + 10, gBottom + 22, s.turnEnd, { size: 12, color: C.muted }));
  body.push(text(NW - 12, gBottom + 24, s.workerLane, { size: 13, weight: 700, color: C.worker.title, anchor: "end" }));
  body.push(
    `<path d="M${D.cx} ${D.cy - D.rh} L${D.cx + D.rw} ${D.cy} L${D.cx} ${D.cy + D.rh} L${D.cx - D.rw} ${D.cy} Z" fill="${C.bad.fill}" stroke="${C.bad.stroke}" stroke-width="1.5"/>`,
  );
  body.push(text(D.cx, D.cy - 3, s.decision[0], { size: 13, weight: 700, color: C.bad.title, anchor: "middle" }));
  body.push(text(D.cx, D.cy + 14, s.decision[1], { size: 13, weight: 700, color: C.bad.title, anchor: "middle" }));
  body.push(badge(D.cx - D.rw + 8, D.cy - D.rh + 6, 1));
  const N = { x: 236, y: D.cy - 28, w: NW - 246, h: 56 };
  body.push(box({ ...N, kind: "warn", lines: s.nudge, size: 12, align: "middle" }));
  body.push(arrow([[D.cx + D.rw, D.cy], [N.x, D.cy]], { color: C.warn.stroke }));
  body.push(text(D.cx + D.rw + 6, D.cy - 8, s.no, { size: 12, weight: 600, color: C.warn.title }));
  body.push(arrow([[N.x + N.w / 2, N.y], [N.x + N.w / 2, gBottom]], { color: C.warn.stroke, dashed: true }));
  y = D.cy + D.rh;
  body.push(arrow([[D.cx, y], [D.cx, y + 28]], { color: C.line }));
  body.push(text(D.cx + 8, y + 18, s.yes, { size: 12, weight: 600, color: C.muted }));
  y += 28;
  body.push(box({ x: 10, y, w: 240, h: 40, kind: "code", lines: [s.done], size: 12, align: "middle" }));
  y += 40;

  y += 28;
  for (let i = 0; i < s.legend.length; i += 2) {
    body.push(text(10, y, s.legend[i], { size: 12, color: C.bad.title }));
    if (s.legend[i + 1]) body.push(text(NW / 2 - 4, y, s.legend[i + 1], { size: 12, color: C.bad.title, maxWidth: NW / 2 }));
    y += 20;
  }
  return svg({ width: NW, height: y - 6, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function v1FlowNarrow(lang) {
  const s = S[lang].v1;
  const body = [];
  const legend = legendRows(
    [
      ["worker", s.legendWorker],
      ["code", s.legendCode],
      ["agent", s.legendAgent],
    ],
    22,
    NW,
  );
  body.push(legend.svg);
  let y = legend.bottom + 18;
  const bx = 22;
  const bw = NW - 44;
  const flowX = 56;
  const fixX = 300;
  const phaseTag = (top, name) =>
    `<rect x="${flowX + 14}" y="${top - 11}" width="${textWidth(name, 13) + 20}" height="22" rx="11" fill="#1e293b"/>` +
    text(flowX + 24, top + 4.5, name, { size: 13, weight: 700, color: "#ffffff" });

  body.push(box({ x: 10, y, w: NW - 20, h: 52, kind: "worker", title: s.prep.title, lines: [s.prep.line], size: 12 }));
  y += 52;
  body.push(arrow([[fixX, y], [fixX, y + 22]], { color: C.worker.stroke, dashed: true }));
  body.push(box({ x: 190, y: y + 22, w: NW - 200, h: 44, kind: "agent", lines: s.agentsMd, size: 11.5, dashed: true, align: "middle" }));
  let prev = [flowX, y];
  y += 22 + 44;

  for (const [pi, ph] of s.phases.entries()) {
    y += 30;
    const top = y;
    const parts = [];
    parts.push(phaseTag(top, ph.name));
    if (pi > 0) parts.push(text(flowX + 8, top - 16, s.accepted, { size: 12, weight: 600, color: C.code.title }));
    y += 24;
    parts.push(arrow([prev, [flowX, y]], { color: C.line }));
    parts.push(box({ x: bx, y, w: bw, h: 50, kind: "worker", title: ph.prompt[0], lines: [ph.prompt[1]], size: 12, titleSize: 12.5 }));
    y += 50;
    parts.push(arrow([[NW / 2, y], [NW / 2, y + 22]], { color: C.worker.stroke }));
    y += 22;
    const th = ph.task.length > 1 ? 50 : 36;
    parts.push(box({ x: bx, y, w: bw, h: th, kind: "agent", lines: ph.task, size: 12, align: "middle" }));
    y += th;
    parts.push(arrow([[NW / 2, y], [NW / 2, y + 28]], { color: C.agent.stroke }));
    parts.push(text(NW / 2 + 10, y + 18, s.json, { size: 12, color: C.muted }));
    y += 28;
    const ch = ph.check.length > 1 ? 50 : 36;
    parts.push(box({ x: bx, y, w: bw, h: ch, kind: "code", lines: ph.check, size: 12 }));
    const checkMid = y + ch / 2;
    y += ch;
    const checkBottom = y;
    parts.push(arrow([[fixX, y], [fixX, y + 46]], { color: C.bad.stroke }));
    parts.push(text(fixX - 8, y + 18, s.fixReqNarrow[0], { size: 11.5, color: C.bad.title, anchor: "end", maxWidth: fixX - flowX - 24 }));
    parts.push(text(fixX - 8, y + 34, s.fixReqNarrow[1], { size: 11.5, color: C.bad.title, anchor: "end", maxWidth: fixX - flowX - 24 }));
    y += 46;
    parts.push(box({ x: 190, y, w: NW - 212, h: 36, kind: "agent", lines: [s.fix], size: 12, align: "middle" }));
    parts.push(arrow([[NW - 22, y + 18], [NW - 14, y + 18], [NW - 14, checkMid], [NW - 22, checkMid]], { color: C.agent.stroke }));
    y += 36 + 14;
    body.push(`<rect x="10" y="${top}" width="${NW - 20}" height="${y - top}" rx="10" fill="none" stroke="#cbd5e1" stroke-width="1.2"/>`);
    body.push(...parts);
    prev = [flowX, checkBottom];
  }

  // CSV phase
  y += 30;
  const top = y;
  const parts = [];
  parts.push(phaseTag(top, s.csvPhase));
  parts.push(text(flowX + 8, top - 16, s.accepted, { size: 12, weight: 600, color: C.code.title }));
  y += 24;
  parts.push(arrow([prev, [flowX, y]], { color: C.line }));
  parts.push(box({ x: bx, y, w: bw, h: 50, kind: "code", lines: s.build, size: 12 }));
  y += 50;
  const buildBottom = y;
  parts.push(text(flowX + 16, y + 20, s.fallbackLabel[0], { size: 11.5, color: C.muted, maxWidth: NW - flowX - 30 }));
  parts.push(text(flowX + 16, y + 36, s.fallbackLabel[1], { size: 11.5, color: C.muted, maxWidth: NW - flowX - 30 }));
  y += 44;
  parts.push(arrow([[fixX, y], [fixX, y + 20]], { color: C.agent.stroke, dashed: true }));
  y += 20;
  parts.push(box({ x: 190, y, w: NW - 212, h: 36, kind: "agent", lines: [s.fallbackTask], size: 12, dashed: true, align: "middle" }));
  y += 36 + 14;
  body.push(`<rect x="10" y="${top}" width="${NW - 20}" height="${y - top}" rx="10" fill="none" stroke="#cbd5e1" stroke-width="1.2"/>`);
  body.push(...parts);

  // outputs
  body.push(arrow([[flowX, buildBottom], [flowX, y + 28]], { color: C.line }));
  y += 28;
  const ow = (NW - 20 - 16) / 2;
  body.push(box({ x: 10, y, w: ow, h: 50, kind: "code", lines: s.xlsx, size: 12 }));
  body.push(box({ x: 10 + ow + 16, y, w: ow, h: 50, kind: "code", lines: s.graphs, size: 12 }));
  body.push(arrow([[10 + ow / 2, y + 50], [10 + ow / 2, y + 76]], { color: C.line }));
  body.push(arrow([[10 + ow * 1.5 + 16, y + 50], [10 + ow * 1.5 + 16, y + 76]], { color: C.line }));
  y += 76;
  body.push(box({ x: 10, y, w: NW - 20, h: 36, kind: "plain", title: s.s3, align: "middle" }));
  y += 36 + 18;
  body.push(box({ x: 10, y, w: NW - 20, h: 70, kind: "warn", lines: s.questionNarrow, size: 12 }));
  y += 70;
  return svg({ width: NW, height: y + 10, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function tokensNarrow(lang) {
  const s = S[lang].tokens;
  const x0 = 56;
  const barMax = 250;
  const max = 14000;
  const scale = (v) => (v / max) * barMax;
  const rows = [
    ["HCD", 6146, 2017],
    ["FRG", 11461, 3053],
    ["CSV", 13871, 3053],
  ];
  const body = [];
  body.push(text(10, 20, s.totalNarrow[0], { size: 13, weight: 600, color: C.text, maxWidth: NW - 20 }));
  body.push(text(10, 40, s.totalNarrow[1], { size: 13, weight: 600, color: C.text, maxWidth: NW - 20 }));
  const top = 58;
  const rowH = 70;
  const bottom = top + rowH * 3 + 4;
  for (let t = 0; t <= max; t += 2000) {
    const x = x0 + scale(t);
    body.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#e2e8f0"/>`);
    if (t % 4000 === 0) body.push(text(x, bottom + 16, `${t / 1000}k`, { size: 11, color: C.faint, anchor: "middle" }));
  }
  body.push(text(x0 + barMax, bottom + 32, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  rows.forEach(([name, v0, v1], i) => {
    const y = top + 8 + i * rowH;
    body.push(text(x0 - 10, y + 28, name, { size: 14, weight: 700, color: C.text, anchor: "end" }));
    body.push(`<rect x="${x0}" y="${y}" width="${scale(v0).toFixed(1)}" height="20" rx="4" fill="${C.v0}"/>`);
    body.push(text(x0 + scale(v0) + 6, y + 15, `v0 ${(v0 / 1000).toFixed(1)}k`, { size: 12, weight: 700, color: C.warn.title }));
    body.push(`<rect x="${x0}" y="${y + 24}" width="${scale(v1).toFixed(1)}" height="20" rx="4" fill="${C.v1}"/>`);
    body.push(text(x0 + scale(v1) + 6, y + 39, `v1 ${(v1 / 1000).toFixed(1)}k`, { size: 12, weight: 700, color: C.worker.title }));
    if (name === "CSV") body.push(text(x0 + scale(v1) + 6 + textWidth(`v1 ${(v1 / 1000).toFixed(1)}k`, 12) + 8, y + 39, `(${s.note})`, { size: 11, color: C.worker.title, maxWidth: NW - x0 - scale(v1) - 60 }));
  });
  return svg({ width: NW, height: bottom + 42, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function outputNarrow(lang) {
  const s = S[lang].output;
  const x0 = 12;
  const barMax = 300;
  const max = 65000;
  const scale = (v) => (v / max) * barMax;
  const steps = [62400, -9100, -1000, -6300, -10300];
  const rowH = 54;
  const top = 10;
  const bottom = top + rowH * 6;
  const body = [];
  for (let t = 0; t <= 60000; t += 10000) {
    const x = x0 + scale(t);
    body.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#e2e8f0"/>`);
    if (t % 20000 === 0) body.push(text(x, bottom + 16, `${t / 1000}k`, { size: 11, color: C.faint, anchor: "middle" }));
  }
  body.push(text(x0 + barMax, bottom + 32, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  const fmt = (v) => `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")}`;
  let acc = 0;
  s.rows.forEach((label, i) => {
    const y = top + i * rowH;
    const joined = label[1] ? `${label[0]}${label[1].startsWith("（") ? "" : " "}${label[1]}` : label[0];
    body.push(text(x0, y + 16, joined, { size: 12, weight: i === 0 || i === 5 ? 700 : 400, color: C.text, maxWidth: NW - 20 }));
    const by = y + 24;
    if (i < 5) {
      const from = acc;
      acc += steps[i];
      const a = Math.min(from, acc);
      const b = Math.max(from, acc);
      body.push(`<rect x="${(x0 + scale(a)).toFixed(1)}" y="${by}" width="${(scale(b) - scale(a)).toFixed(1)}" height="20" rx="3" fill="${i === 0 ? C.v0 : "#fca5a5"}"/>`);
      body.push(text(x0 + scale(b) + 6, by + 15, fmt(steps[i]), { size: 12, weight: 700, color: i === 0 ? C.warn.title : C.bad.title }));
    } else {
      body.push(`<rect x="${x0}" y="${by}" width="${scale(35700).toFixed(1)}" height="20" rx="3" fill="${C.v1}"/>`);
      body.push(text(x0 + scale(35700) + 6, by + 15, `≈ 35,700 (${s.reduction})`, { size: 12, weight: 700, color: C.worker.title }));
    }
  });
  return svg({ width: NW, height: bottom + 42, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

const FIGURES = {
  ...HARNESS_V1_1_FIGURES,
  "harness-overview": [overview, (lang) => overview(lang, true)],
  "harness-v0-flow": [v0Flow, v0FlowNarrow],
  "harness-v1-flow": [v1Flow, v1FlowNarrow],
  "harness-instruction-tokens": [tokens, tokensNarrow],
  "harness-artifact-output": [output, outputNarrow],
};

/** { "harness-overview.ja.svg": "<svg…", "harness-overview.ja.narrow.svg": …, … } */
export function renderAll() {
  const out = {};
  for (const [name, [wide, narrow]] of Object.entries(FIGURES)) {
    for (const lang of ["ja", "en"]) {
      out[`${name}.${lang}.svg`] = wide(lang);
      out[`${name}.${lang}.narrow.svg`] = narrow(lang);
    }
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  const files = renderAll();
  mkdirSync(FIGURES_DIR, { recursive: true });
  const stale = [];
  for (const [name, content] of Object.entries(files)) {
    const path = join(FIGURES_DIR, name);
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
  const orphans = readdirSync(FIGURES_DIR).filter((f) => f.endsWith(".svg") && !(f in files));
  if (check && (stale.length || orphans.length)) {
    console.error(`docs/figures is out of date (${[...stale, ...orphans].join(", ")}). Run: npm run docs:figures`);
    process.exit(1);
  }
  console.log(check ? `docs/figures is up to date (${Object.keys(files).length} files)` : `wrote ${Object.keys(files).length} files to docs/figures`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
