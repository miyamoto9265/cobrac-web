// Current harness v2 architecture and workflow. Keep these independent of the archived comparison articles.
import { C, NW, arrow, box, group, header, svg, text } from "./docs-figures-lib.mjs";

const W = 860;
const S = {
  ja: {
    architecture: {
      title: "CoBRAC ハーネス v2：全体のアーキテクチャ",
      desc: "利用者の入力を Web 画面と API がジョブにし、SQS を読む dispatcher が Fargate ワーカーを起動する。ワーカーが Codex エージェントへフェーズ仕様と修正指示を送り、エージェントは RCS と lit を使って JSON と説明文を作る。ワーカーはファイルを検証し、コードで CSV・xlsx・グラフを生成して S3 に保存する。質問時は作業ファイルと会話を保存して終了し、回答後に新しいワーカーが復元して再開する。",
      ui: { title: "利用者 / Web 画面", lines: ["ROI・TLF・資料・追加指示", "進捗・質問・成果物を表示"] },
      api: { title: "API / ジョブ管理", lines: ["認証・設定・実行受付", "状態とメッセージ：DynamoDB"] },
      queue: { title: "SQS → dispatcher", lines: ["同時実行数を制御", "ジョブごとにワーカーを起動"] },
      runtime: "Fargate ワーカー：実行を管理する CoBRAC ハーネス",
      control: { title: "フェーズ制御", lines: ["調査 → HCD → FRG → CSV", "検証結果から修正・再検証を指示"] },
      agent: { title: "Codex エージェント", lines: ["回路と機能を推論し JSON を編集", "report / decision_log を記録"] },
      checks: { title: "検証器", lines: ["Schema・命名・BRA・HCD↔FRG", "文献・引用文・許可された仮説", "検証結果をファイルに記録"] },
      tools: { title: "RCS + `lit`（MCP）", lines: ["RCS：SABRA（利用可能な場合）", "lit：PubMed / Europe PMC（常時）"] },
      prompts: "仕様・修正指示",
      files: "JSON・md・状態",
      progress: "進捗：DynamoDB → WebSocket → 画面。成果物は API 経由で参照。",
      outputs: { title: "コードで成果物を生成", lines: ["JSON → CSV → xlsx × 2 / HCD・FRG グラフ", "CoBRAC-v1-1 / Template-v2-2"] },
      store: { title: "S3 に保存", lines: ["作業ファイル・会話", "成果物・版の履歴"] },
      pause: { title: "質問が必要なときは、保存して待つ", lines: ["質問 → 作業ファイルと会話を S3 に保存 → ワーカー終了", "利用者の回答 → API / SQS → 新しいワーカーが復元して再開"] },
      pauseNarrow: { title: "質問が必要なときは、保存して待つ", lines: ["質問 → 作業ファイルと会話を S3 に保存", "ワーカー終了 → 利用者が回答", "API / SQS → 新しいワーカーが復元して再開"] },
      progressNarrow: ["進捗：DynamoDB → WebSocket → 画面", "成果物は API 経由で参照"] },
    pipeline: {
      title: "CoBRAC ハーネス v2：生成と検証の流れ",
      desc: "任意の調査ステップ（既定でオン）の後、HCD を作って検証する。ワーカーが HCD から候補をコードで抽出し、FRG は TLF の分解とこのボトムアップ候補を照合して組み立てる。整合チェック X1〜X9 を記録し、X1・X2・X3・X8 があれば実行ごとに一度の調整ターンを送る。調整では FRG の修正、HCD の UC の分割・追加、理由を残して維持を選べる。変更された HCD と FRG を再検証した後、CSV、2 種類の xlsx、グラフをコードで生成する。仮説は明示的な許可、対象、主張の種類、割合の制約の下で扱う。",
      research: { title: "1. 調査（任意・既定でオン）", lines: ["文献検索 → `research.json`", "網羅性の検査と修正"] },
      hypothesis: { title: "仮説は明示的に許可したときだけ", lines: ["対象・主張の種類・割合を検査", "根拠と FRG への依存を記録"] },
      hcd: { title: "2. HCD：回路・接続を作る", lines: ["UC / Collection / 接続 / 文献", "Schema・命名・BRA・文献・引用文を検証"] },
      candidates: { title: "HCD から候補をコードで抽出", lines: ["`frg_candidates.json`", "モチーフ・経路・境界を FRG の材料に"] },
      frg: { title: "3. FRG：機能を回路に対応させる", lines: ["TLF の分解 × ボトムアップ候補", "GN・Interface・機能の内容を検証"] },
      log: { title: "HCD↔FRG の変更理由を残す", lines: ["`decision_log.md`", "`## HCD-FRG revisions` に記録"] },
      cross: { title: "4. 整合チェック X1〜X9", lines: ["`cross_check.json` に記録", "X1・X2・X3・X8 があれば調整へ"] },
      adjust: { title: "調整ターン（実行ごとに最大 1 回）", lines: ["FRG を修正 / HCD の UC を分割・追加", "または維持する理由を記録", "その後の検証・修正ループへ"] },
      recheck: { title: "5. 変更された HCD / FRG を再検証", lines: ["`phase_baseline.json` で変更を検出し、後段でも前段の検証をやり直す", "許可された仮説は対象・割合・依存関係も再確認"] },
      recheckNarrow: { title: "5. 変更された HCD / FRG を再検証", lines: ["`phase_baseline.json` で変更を検出", "後段でも前段の検証をやり直す", "仮説は対象・割合・依存関係も再確認"] },
      outputs: { title: "6. コードで CSV → xlsx / グラフを生成", lines: ["CSV 5 本 → CoBRAC-v1-1 / Template-v2-2 の xlsx", "同じデータから HCD / FRG グラフを作る"] },
      outputsNarrow: { title: "6. コードで成果物を生成", lines: ["CSV 5 本 → xlsx × 2", "CoBRAC-v1-1 / Template-v2-2", "同じデータから HCD / FRG グラフ"] },
      trigger: "該当あり",
      forward: "調整不要 / 調整後",
      note: "各段階は「エージェントの編集 → ワーカーの検証 → 必要な修正」。質問時は保存して中断・回答後に再開。",
      noteNarrow: ["各段階：編集 → 検証 → 必要な修正", "質問時は保存して中断し、回答後に再開"] },
  },
  en: {
    architecture: {
      title: "CoBRAC harness v2: overall architecture",
      desc: "The Web UI and API turn user input into jobs. An SQS dispatcher starts a Fargate worker. The worker sends phase specifications and fixes to the Codex agent, which uses RCS and lit to edit JSON and explanatory text. The worker validates the files and generates CSVs, two xlsx formats and graphs in code, storing the results in S3. For a question it saves the workspace and conversation and exits; after the user answers, a new worker restores them and resumes.",
      ui: { title: "User / Web UI", lines: ["ROI, TLF, sources, follow-ups", "Progress, questions and results"] },
      api: { title: "API / job management", lines: ["Authentication, settings, requests", "State and messages: DynamoDB"] },
      queue: { title: "SQS → dispatcher", lines: ["Enforces concurrency limits", "Starts one worker per job"] },
      runtime: "Fargate worker: the CoBRAC harness controls execution",
      control: { title: "Phase control", lines: ["Research → HCD → FRG → CSV", "Requests fixes and rechecks from findings"] },
      agent: { title: "Codex agent", lines: ["Reasons about circuits; edits JSON", "Writes report / decision_log"] },
      checks: { title: "Validators", lines: ["Schema, naming, BRA, HCD↔FRG", "References, quotes, allowed hypotheses", "Records findings in files"] },
      tools: { title: "RCS + `lit` (MCP)", lines: ["RCS: SABRA (when available)", "lit: PubMed / Europe PMC (always)"] },
      prompts: "Specs / fixes",
      files: "JSON / md / status",
      progress: "Progress: DynamoDB → WebSocket → UI. Results are accessed through the API.",
      outputs: { title: "Code generates the results", lines: ["JSON → CSV → two xlsx formats / HCD and FRG graphs", "CoBRAC-v1-1 / Template-v2-2"] },
      store: { title: "Stored in S3", lines: ["Workspace, conversation", "Results and version history"] },
      pause: { title: "When the agent needs an answer: save and wait", lines: ["Question → save workspace and conversation to S3 → worker exits", "User answer → API / SQS → a new worker restores the state and resumes"] },
      pauseNarrow: { title: "When the agent needs an answer", lines: ["Question → save workspace and conversation to S3", "Worker exits → the user answers", "API / SQS → a new worker restores and resumes"] },
      progressNarrow: ["Progress: DynamoDB → WebSocket → UI", "Results are accessed through the API"] },
    pipeline: {
      title: "CoBRAC harness v2: generation and validation",
      desc: "Optional research, on by default, precedes HCD generation and validation. The worker extracts bottom-up candidates from the HCD in code; the agent combines them with the top-down decomposition of the TLF to build the FRG. Cross-checks X1–X9 are recorded. Findings of X1, X2, X3 or X8 trigger at most one adjustment turn per run: change the FRG, split or add HCD UCs, or retain a mismatch with its reason. Changed HCD and FRG files are revalidated before code generates five CSVs, two xlsx formats and graphs. Hypotheses require explicit permission and checks of scope, allowed claims and share limits.",
      research: { title: "1. Research (optional, on by default)", lines: ["Literature search → `research.json`", "Coverage checks and fixes"] },
      hypothesis: { title: "Hypotheses require explicit permission", lines: ["Check scope, allowed claims and share limits", "Record the basis and FRG dependencies"] },
      hcd: { title: "2. HCD: build circuits and connections", lines: ["UCs, Collections, connections, references", "Check schema, naming, BRA, references and quotes"] },
      candidates: { title: "Code extracts candidates from the HCD", lines: ["`frg_candidates.json`", "Motifs, pathways and boundaries for the FRG"] },
      frg: { title: "3. FRG: map functions to circuits", lines: ["TLF decomposition × bottom-up candidates", "Check GNs, Interfaces and function details"] },
      log: { title: "Record why the HCD / FRG changed", lines: ["`decision_log.md`", "Under `## HCD-FRG revisions`"] },
      cross: { title: "4. Cross-checks X1–X9", lines: ["Record in `cross_check.json`", "X1, X2, X3 or X8 → request an adjustment"] },
      adjust: { title: "Adjustment (at most once per run)", lines: ["Change the FRG / split or add HCD UCs", "Or record why a mismatch is retained", "Then run the validation and fix loop"] },
      recheck: { title: "5. Revalidate changed HCD / FRG files", lines: ["Detect changes with `phase_baseline.json`; rerun earlier checks in later phases", "Recheck allowed hypotheses for scope, share limits and dependencies"] },
      recheckNarrow: { title: "5. Revalidate changed HCD / FRG files", lines: ["Detect changes with `phase_baseline.json`", "Rerun earlier checks in later phases", "Recheck hypothesis scope, shares and dependencies"] },
      outputs: { title: "6. Code generates CSV → xlsx / graphs", lines: ["Five CSVs → CoBRAC-v1-1 / Template-v2-2 xlsx", "HCD / FRG graphs come from the same data"] },
      outputsNarrow: { title: "6. Code generates the results", lines: ["Five CSVs → two xlsx formats", "CoBRAC-v1-1 / Template-v2-2", "HCD / FRG graphs from the same data"] },
      trigger: "Findings",
      forward: "No adjustment / after adjustment",
      note: "Each stage: agent edits → worker validates → fixes as needed. Questions save and pause; answers resume the work.",
      noteNarrow: ["Each stage: edit → validate → fix as needed", "Questions save and pause; answers resume the work"] },
  },
};

function architecture(lang, narrow = false) {
  const s = S[lang].architecture;
  const width = narrow ? NW : W;
  const body = [];
  const b = (item, x, y, w, h, kind, extra = {}) => body.push(box({ ...item, x, y, w, h, kind, size: 12, titleSize: 13, ...extra }));
  const a = (points, opts) => body.push(arrow(points, opts));
  body.push(header(10, 10, width - 20, s.title, C.worker.title));
  if (!narrow) {
    b(s.ui, 10, 58, 240, 84, "plain");
    b(s.api, 310, 58, 240, 84, "worker");
    b(s.queue, 610, 58, 240, 84, "worker");
    a([[250, 100], [310, 100]]);
    a([[550, 100], [610, 100]]);
    a([[730, 142], [730, 190]]);
    body.push(group(10, 190, 840, 300, s.runtime, C.worker.stroke));
    b(s.control, 30, 235, 340, 94, "worker");
    b(s.agent, 490, 235, 340, 94, "agent");
    a([[370, 266], [490, 266]], { color: C.worker.stroke });
    a([[490, 311], [370, 311]], { color: C.agent.stroke });
    body.push(text(430, 253, s.prompts, { size: 10.5, anchor: "middle", maxWidth: 112 }));
    body.push(text(430, 298, s.files, { size: 10.5, anchor: "middle", maxWidth: 112 }));
    a([[200, 329], [200, 382]], { color: C.worker.stroke });
    a([[660, 329], [660, 382]], { color: C.agent.stroke });
    b(s.checks, 30, 382, 340, 88, "worker");
    b(s.tools, 490, 382, 340, 88, "agent");
    body.push(text(10, 644, s.progress, { size: 12, color: C.muted, maxWidth: width - 20 }));
    a([[200, 470], [200, 491], [275, 491], [275, 538]], { color: C.code.stroke });
    b(s.outputs, 10, 538, 530, 86, "code");
    b(s.store, 590, 538, 260, 86, "code");
    a([[540, 581], [590, 581]], { color: C.code.stroke });
    b(s.pause, 10, 659, 840, 82, "warn");
    return svg({ width, height: 751, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  let y = 58;
  for (const [item, kind] of [[s.ui, "plain"], [s.api, "worker"], [s.queue, "worker"]]) {
    b(item, 10, y, 410, 76, kind);
    a([[215, y + 76], [215, y + 100]]);
    y += 100;
  }
  body.push(group(10, y, 410, 424, s.runtime, C.worker.stroke));
  b(s.control, 26, y + 40, 378, 76, "worker");
  a([[180, y + 116], [180, y + 154]], { color: C.worker.stroke });
  a([[250, y + 154], [250, y + 116]], { color: C.agent.stroke });
  body.push(text(164, y + 139, s.prompts, { size: 10.5, anchor: "end", maxWidth: 132 }));
  body.push(text(266, y + 139, s.files, { size: 10.5, maxWidth: 132 }));
  b(s.agent, 26, y + 154, 378, 76, "agent");
  a([[215, y + 230], [215, y + 250]], { color: C.agent.stroke });
  b(s.tools, 26, y + 250, 378, 68, "agent");
  b(s.checks, 26, y + 336, 378, 76, "worker");
  a([[26, y + 78], [18, y + 78], [18, y + 374], [26, y + 374]], { color: C.worker.stroke });
  a([[215, y + 412], [215, y + 449]], { color: C.code.stroke });
  y += 449;
  b(s.outputs, 10, y, 410, 82, "code", { size: 11.5 });
  a([[215, y + 82], [215, y + 106]], { color: C.code.stroke });
  b(s.store, 10, y + 106, 410, 72, "code");
  s.progressNarrow.forEach((line, i) => body.push(text(10, y + 201 + i * 18, line, { size: 12, color: C.muted, maxWidth: 410 })));
  b(s.pauseNarrow, 10, y + 239, 410, 96, "warn");
  return svg({ width, height: y + 345, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function pipeline(lang, narrow = false) {
  const s = S[lang].pipeline;
  const width = narrow ? NW : W;
  const body = [];
  const b = (item, x, y, w, h, kind, extra = {}) => body.push(box({ ...item, x, y, w, h, kind, size: 12, titleSize: 13, ...extra }));
  const a = (points, opts) => body.push(arrow(points, opts));
  body.push(header(10, 10, width - 20, s.title, C.worker.title));
  if (!narrow) {
    b(s.research, 20, 58, 390, 86, "agent", { dashed: true });
    b(s.hypothesis, 460, 58, 380, 86, "warn", { dashed: true });
    a([[215, 144], [215, 180]]);
    b(s.hcd, 20, 180, 390, 90, "agent");
    a([[410, 225], [460, 225]], { color: C.code.stroke });
    b(s.candidates, 460, 180, 380, 90, "code");
    a([[215, 270], [215, 306]]);
    a([[650, 270], [650, 288], [390, 288], [390, 306]], { color: C.code.stroke });
    b(s.frg, 20, 306, 390, 90, "agent");
    b(s.log, 460, 306, 380, 90, "plain");
    a([[215, 396], [215, 436]]);
    b(s.cross, 20, 436, 390, 90, "worker");
    a([[410, 481], [460, 481]], { color: C.warn.stroke });
    body.push(text(435, 463, s.trigger, { size: 10, anchor: "middle", maxWidth: 50 }));
    b(s.adjust, 460, 436, 380, 120, "agent", { dashed: true });
    a([[215, 526], [215, 606]], { color: C.worker.stroke });
    a([[650, 556], [650, 606]], { color: C.worker.stroke });
    body.push(text(235, 582, s.forward, { size: 11.5, color: C.muted, maxWidth: 395 }));
    b(s.recheck, 20, 606, 820, 86, "worker");
    a([[430, 692], [430, 728]], { color: C.code.stroke });
    b(s.outputs, 20, 728, 820, 86, "code");
    body.push(text(10, 843, s.note, { size: 11.5, color: C.muted, maxWidth: width - 20 }));
    return svg({ width, height: 855, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  let y = 58;
  b(s.hypothesis, 10, y, 410, 80, "warn", { dashed: true });
  y += 104;
  const steps = [
    [s.research, "agent", 82, true],
    [s.hcd, "agent", 86, false],
    [s.candidates, "code", 82, false],
    [s.frg, "agent", 86, false],
    [s.cross, "worker", 86, false],
  ];
  for (const [item, kind, h, dashed] of steps) {
    b(item, 10, y, 410, h, kind, { dashed });
    a([[215, y + h], [215, y + h + 28]]);
    y += h + 28;
  }
  b(s.adjust, 38, y, 382, 116, "agent", { dashed: true });
  a([[10, y - 71], [3, y - 71], [3, y + 132], [215, y + 132]], { color: C.worker.stroke, dashed: true });
  a([[215, y + 116], [215, y + 152]], { color: C.worker.stroke });
  y += 152;
  b(s.log, 10, y, 410, 78, "plain");
  a([[215, y + 78], [215, y + 106]]);
  y += 106;
  b(s.recheckNarrow, 10, y, 410, 98, "worker");
  a([[215, y + 98], [215, y + 126]], { color: C.code.stroke });
  y += 126;
  b(s.outputsNarrow, 10, y, 410, 98, "code");
  s.noteNarrow.forEach((line, i) => body.push(text(10, y + 125 + i * 18, line, { size: 11.5, color: C.muted, maxWidth: 410 })));
  return svg({ width, height: y + 156, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const HARNESS_CURRENT_FIGURES = {
  "harness-current-architecture": [architecture, (lang) => architecture(lang, true)],
  "harness-current-pipeline": [pipeline, (lang) => pipeline(lang, true)],
};
