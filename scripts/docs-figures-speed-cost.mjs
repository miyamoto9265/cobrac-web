// Figures of the BRA speed and cost measurements (v0.17.1–v0.18.2), embedded in part 7 of the specification PDF (docs/spec-guide). Rendered by docs-figures.mjs.
import { C, NW, arrow, box, header, svg, text, textWidth } from "./docs-figures-lib.mjs";

const W = 860;
const BEFORE = C.v0;
const AFTER = C.v1;
const MODEL = "#4338ca";
const TOOLS = "#0d9488";
const GREY = "#94a3b8";

// Production runs A, B and C (v0.16.0), minutes.
const STAGES = { startup: 0.7, research: 12.8, hcd: 41.1, frg: 5.5, output: 0.1 };
const NATURE = { model: 52.9, tools: 6.0, checks: 0.6, startup: 0.7 };
// 482 responses of 4 runs fitted as fixed wait + output tokens / speed.
const LATENCY = [
  { n: 203, fixed: 3.9, minutes: 48 },
  { n: 140, fixed: 16.3, minutes: 81 },
  { n: 139, fixed: 41.8, minutes: 124 },
];
// ufwwj0jg-1: input tokens Codex reported at the end of turns 1–3 (thread totals).
const CUMULATIVE = [3265610, 5826689, 6088575];

const S = {
  ja: {
    breakdown: {
      title: "BRA 作成 1 件の時間の内訳（本番の 3 件の平均 60.2 分、v0.16.0）",
      desc: "段ごとに見ると、起動 0.7 分、調査 12.8 分、HCD 41.1 分、FRG 5.5 分、CSV・xlsx・グラフ 0.1 分。性質ごとに見ると、モデルの応答待ち 52.9 分（88%）、ツール実行の待ち 6.0 分（10%）、ワーカーの検証と CSV・xlsx 0.6 分（1%）、起動 0.7 分（1%）。",
      stageHead: "段ごと",
      natureHead: "性質ごと",
      stages: ["起動", "調査", "HCD", "FRG", "CSV・xlsx"],
      nature: ["モデルの応答待ち", "ツール実行の待ち", "ワーカーの検証・出力", "起動"],
      unit: "分",
    },
    latency: {
      title: "コンテキストの長さと応答の待ち時間（4 件の実行、応答 482 回）",
      desc: "応答の待ち時間を、固定分 + 出力トークン数 ÷ 速さ として当てはめた。コンテキストが 8 万トークン未満の応答 203 回は固定分 3.9 秒、8〜12 万の 140 回は 16.3 秒、12 万超の 139 回は 41.8 秒。出力の速さはどれも約 110 トークン/秒で変わらない。モデル時間の合計は 48 分、81 分、124 分で、8 万以上の応答が 8 割を占める。圧縮の前後では、25〜68 秒だった応答が 2〜6 秒になる。",
      leftHead: "1 回の応答の固定の待ち時間（秒）",
      rightHead: "モデル時間の合計（分）",
      rows: ["8 万未満", "8〜12 万", "12 万超"],
      count: (n) => `${n} 回`,
      sec: "秒",
      min: "分",
      note: ["行はリクエストのときのコンテキストの長さ（トークン）", "出力の速さはどれも約 110 トークン/秒。圧縮の前後では 25〜68 秒 → 2〜6 秒"],
      noteNarrow: ["行はリクエストのときのコンテキストの長さ", "出力の速さはどれも約 110 トークン/秒", "圧縮の前後では 25〜68 秒 → 2〜6 秒"],

    },
    changes: {
      title: "v0.18.0 の 3 つの変更と、時間が縮む仕組み",
      desc: "圧縮しきい値を 15 万から 7.5 万トークンに下げ、ツールの結果と書き方を小さくして、会話を 8 万トークン未満に保つ。そうすると 1 回の応答の固定の待ちが約 4 秒で済む。修正ターンは推論レベルを medium にして推論の時間を減らす。3 件ずつの比較で、モデルの応答待ちは 41.7 分から 24.2 分に、合計は 48.6 分から 31.0 分になった。",
      levers: [
        { title: "① 圧縮しきい値 15 万 → 7.5 万", lines: ["`CODEX_AUTO_COMPACT_TOKENS` の既定値"] },
        { title: "② ツールの結果と書き方を小さく", lines: ["`find_sentences` 15 → 8 文、検索 10 → 8 件", "ファイルは一度書き、後は小さな編集で直す", "RCS は `top_k` 5 以下、照会はまとめて"] },
        { title: "③ 修正ターンは推論 medium", lines: ["検証の指摘・調査の被覆・CSV の修正", "本ターンと調整ターンは今までどおり"] },
      ],
      mid: [
        { title: "会話を 8 万トークン未満に保つ", lines: ["1 回の応答の固定の待ちが", "約 4 秒で済む（42 秒にならない）"] },
        { title: "修正ターンの推論が短い", lines: ["指摘を直すだけのターン"] },
      ],
      out: { title: "応答待ち", lines: ["41.7 → 24.2 分", "合計 48.6 → 31.0 分"] },
    },
    sequential: {
      title: "並列化で縮められる範囲が小さい理由",
      desc: "調査 → HCD → FRG → 調整ターン → CSV・xlsx は、前の段の結果を入力にするので直列でしか進められない。HCD は UC・接続・Collection が互いに依存する 1 つのグラフ、FRG は 1 本の木で、分けて作ると結合のときに整合をとり直す必要がある。並列にできるのは調査ステップの証拠集めくらいだが、OpenAI の組織の TPM 上限は gpt-6-luna で 20 万トークン/分で、1 本のスレッドだけで平均 14〜17 万トークン/分を使っているため、2 本目を足すとすぐ上限に当たる。",
      chainHead: "前の段の結果を入力にするので、段は直列",
      steps: [
        { title: "調査", lines: ["候補の投射"] },
        { title: "HCD", lines: ["1 つのグラフ"] },
        { title: "FRG", lines: ["1 本の木"] },
        { title: "調整ターン", lines: ["両方を見て直す"] },
        { title: "CSV・xlsx", lines: ["0.1 分"] },
      ],
      only: "並列にできる余地はここだけ（数分）",
      onlyNarrow: ["並列にできる余地は", "ここだけ（数分）"],
      tpmHead: "OpenAI の組織の TPM 上限（gpt-6-luna）",
      oneThread: "1 本のスレッドの平均 14〜17 万/分",
      limit: "上限 20 万/分",
      unit: "トークン/分",
      second: "2 本目を足すと上限に当たる",
    },
    beforeAfter: {
      title: "変更前と変更後（同じ ROI・TLF で 3 件ずつ、平均）",
      desc: "合計 48.6 分 → 31.0 分、調査 15.8 → 9.0 分、HCD 24.3 → 16.5 分、FRG 7.9 → 5.0 分、モデルの応答待ち 41.7 → 24.2 分。実費 $0.174 → $0.134、コンテキストの中央値 8.0 万 → 4.8 万トークン、入力トークン 763 万 → 390 万。変更前は v0.16.0 が 2 件と v0.17.0 が 1 件、変更後は v0.18.0。",
      series: ["変更前（v0.16.0 × 2、v0.17.0 × 1）", "変更後（v0.18.0）"],
      rows: [
        ["合計（分）", [48.6, 31.0]],
        ["調査（分）", [15.8, 9.0]],
        ["HCD（分）", [24.3, 16.5]],
        ["FRG（分）", [7.9, 5.0]],
        ["モデルの応答待ち（分）", [41.7, 24.2]],
        ["実費（USD）", [0.174, 0.134]],
        ["コンテキストの中央値（k）", [80, 48]],
        ["入力トークン（万）", [763, 390]],
      ],
    },
    usage: {
      title: "使用量の二重計上：累計をターンごとに足していた",
      desc: "Codex がターンの終わりに返す使用量は、そのターンの分ではなくスレッドの累計。テストユーザーの実行では、3 ターン目までの累計が 327 万、583 万、609 万トークン（入力）だった。0.17.0 までのワーカーはこの累計を毎ターン足していたので、記録は 1,518 万になった。0.17.1 からは、ターン後の累計からターン前の累計を引いた差分（327 万、256 万、26 万）だけを足し、記録は実際と同じ 609 万になる。",
      reported: "Codex が返す値（スレッドの累計）",
      turn: (i, v) => `${i} ターン目 ${v}`,
      old: "0.17.0 まで：累計を毎ターン足す",
      fixed: "0.17.1 から：差分だけを足す",
      unit: "百万トークン（入力）",
      oldNote: "実際の約 2.5 倍",
      fixedNote: "実際と同じ",
    },
    interruption: {
      title: "Spot 中断からの再開：v0.18.1 まで と v0.18.2 から",
      desc: "v0.18.1 までは、作業場所の保存がフェーズの受理・質問・完了・失敗のときだけだった。Fargate Spot の中断（2 分前に SIGTERM）では何もせずに終わるので、前回の保存からの作業が消えた。ハートビートが 15 分古くなってから、15 分ごとの janitor が再試行するので、再開は中断の 15〜30 分後だった。v0.18.2 からは、ターンの途中でも 5 分ごとに作業場所とスレッドを S3 に保存し、SIGTERM を受けたらすぐ保存して（猶予 120 秒）ハートビートを古い時刻にする。janitor は 5 分ごとに動くので、約 5 分後に保存した続きから再開する。",
      beforeHead: "v0.18.1 まで",
      afterHead: "v0.18.2 から",
      before: [
        { title: "ターン実行中", lines: ["保存はフェーズの受理・", "質問・完了・失敗のときだけ"], kind: "plain" },
        { title: "Spot 中断", lines: ["SIGTERM では何もしない", "前回の保存からの作業が消える"], kind: "bad" },
        { title: "検出を待つ", lines: ["ハートビートが 15 分古くなる", "janitor は 15 分ごと"], kind: "warn" },
        { title: "再開", lines: ["中断から 15〜30 分後", "前回の保存から"], kind: "plain" },
      ],
      after: [
        { title: "ターン実行中", lines: ["5 分ごとに作業場所と", "スレッドを S3 に保存"], kind: "code" },
        { title: "Spot 中断", lines: ["SIGTERM ですぐ保存", "（猶予 120 秒）", "ハートビートを古い時刻に"], kind: "code" },
        { title: "janitor", lines: ["5 分ごとに動き", "次の実行で再試行"], kind: "code" },
        { title: "再開", lines: ["中断から約 5 分後", "保存した続きから"], kind: "plain" },
      ],
    },
  },
  en: {
    breakdown: {
      title: "Where the time of one BRA run goes (3 production runs, average 60.2 min, v0.16.0)",
      desc: "By stage: start-up 0.7 min, research 12.8, HCD 41.1, FRG 5.5, CSV / xlsx / graphs 0.1. By kind: waiting for the model 52.9 min (88%), waiting for tools 6.0 (10%), the worker's checks and CSV / xlsx 0.6 (1%), start-up 0.7 (1%).",
      stageHead: "By stage",
      natureHead: "By kind",
      stages: ["Start-up", "Research", "HCD", "FRG", "CSV / xlsx"],
      nature: ["Waiting for the model", "Waiting for tools", "Worker checks, output", "Start-up"],
      unit: "min",
    },
    latency: {
      title: "Context length and response latency (4 runs, 482 responses)",
      desc: "Each response's latency was fitted as a fixed wait plus output tokens divided by a speed. The 203 responses with a context under 80k tokens had a fixed wait of 3.9 s, the 140 between 80k and 120k 16.3 s, and the 139 above 120k 41.8 s. The output speed was about 110 tokens/s in every band. The model time adds up to 48, 81 and 124 minutes, so responses above 80k take 80% of it. Around a compaction, responses that took 25–68 s drop to 2–6 s.",
      leftHead: "Fixed wait of one response (s)",
      rightHead: "Total model time (min)",
      rows: ["< 80k", "80k–120k", "> 120k"],
      count: (n) => `${n} resp.`,
      sec: "s",
      min: "min",
      note: ["Rows are the context length of the request (tokens)", "Output speed is about 110 tokens/s in every band. Around a compaction: 25–68 s → 2–6 s"],
      noteNarrow: ["Rows are the context length of the request", "Output speed is about 110 tokens/s in every band", "Around a compaction: 25–68 s → 2–6 s"],

    },
    changes: {
      title: "The three changes of v0.18.0 and why they save time",
      desc: "The compaction threshold drops from 150k to 75k tokens, and the tool results and the way files are written are made smaller, so the conversation stays under 80k tokens and the fixed wait of a response stays around 4 s. Fix turns run at reasoning effort medium, so they reason for less time. In the 3-vs-3 comparison, waiting for the model fell from 41.7 to 24.2 minutes and the total from 48.6 to 31.0 minutes.",
      levers: [
        { title: "① Compaction at 75k instead of 150k", lines: ["default of `CODEX_AUTO_COMPACT_TOKENS`"] },
        { title: "② Smaller tool results and edits", lines: ["`find_sentences` 15 → 8, searches 10 → 8 hits", "write a file once, then small edits", "RCS `top_k` ≤ 5, batch independent lookups"] },
        { title: "③ Fix turns at effort medium", lines: ["validator, coverage and CSV fix turns", "main and adjustment turns unchanged"] },
      ],
      mid: [
        { title: "Conversation stays under 80k", lines: ["fixed wait of a response stays", "around 4 s (not 42 s)"] },
        { title: "Fix turns reason less", lines: ["turns that only fix listed problems"] },
      ],
      out: { title: "Model wait", lines: ["41.7 → 24.2 min", "total 48.6 → 31.0 min"] },
    },
    sequential: {
      title: "Why parallel work can save little",
      desc: "Research → HCD → FRG → adjustment turn → CSV / xlsx can only run in order, because each step takes the previous one's result as input. The HCD is one graph whose UCs, connections and Collections depend on each other, and the FRG is one tree; built in parts, they would have to be reconciled again when joined. Only the evidence gathering of the research step could run in parallel, but the organisation's OpenAI limit for gpt-6-luna is 200k tokens per minute and one thread already uses 140k–170k per minute on average, so a second thread soon hits the limit.",
      chainHead: "Each step needs the previous result: in order",
      steps: [
        { title: "Research", lines: ["candidate search"] },
        { title: "HCD", lines: ["one graph"] },
        { title: "FRG", lines: ["one tree"] },
        { title: "Adjustment", lines: ["revises both"] },
        { title: "CSV / xlsx", lines: ["0.1 min"] },
      ],
      only: "only room for parallel work (a few minutes)",
      onlyNarrow: ["only room for parallel", "work (a few minutes)"],
      tpmHead: "Organisation's OpenAI TPM limit (gpt-6-luna)",
      oneThread: "one thread: 140k–170k/min on average",
      limit: "limit 200k/min",
      unit: "tokens/min",
      second: "a second thread hits the limit",
    },
    beforeAfter: {
      title: "Before and after (same ROI and TLF, 3 runs each, averages)",
      desc: "Total 48.6 → 31.0 min, research 15.8 → 9.0, HCD 24.3 → 16.5, FRG 7.9 → 5.0, waiting for the model 41.7 → 24.2. Real cost $0.174 → $0.134, median context 80k → 48k tokens, input tokens 7.63M → 3.90M. Before: two runs on v0.16.0 and one on v0.17.0; after: v0.18.0.",
      series: ["Before (v0.16.0 × 2, v0.17.0 × 1)", "After (v0.18.0)"],
      rows: [
        ["Total (min)", [48.6, 31.0]],
        ["Research (min)", [15.8, 9.0]],
        ["HCD (min)", [24.3, 16.5]],
        ["FRG (min)", [7.9, 5.0]],
        ["Model wait (min)", [41.7, 24.2]],
        ["Real cost (USD)", [0.174, 0.134]],
        ["Median context (k)", [80, 48]],
        ["Input tokens (M)", [7.63, 3.9]],
      ],
    },
    usage: {
      title: "Usage counted twice: the running total was added every turn",
      desc: "The usage Codex reports at the end of a turn is the thread's running total, not the turn's own. In the test user's run the totals after turns 1–3 were 3.27M, 5.83M and 6.09M input tokens. Up to 0.17.0 the worker added each total, so the record reached 15.18M. From 0.17.1 it adds only the difference between the totals after and before the turn (3.27M, 2.56M, 0.26M), and the record is the real 6.09M.",
      reported: "What Codex reports (thread total)",
      turn: (i, v) => `turn ${i}: ${v}`,
      old: "Up to 0.17.0: add the total every turn",
      fixed: "From 0.17.1: add the difference",
      unit: "million input tokens",
      oldNote: "≈ 2.5× the real usage",
      fixedNote: "the real usage",
    },
    interruption: {
      title: "Resuming after a Spot interruption: up to v0.18.1 and from v0.18.2",
      desc: "Up to v0.18.1 the workspace was saved only when a phase was accepted, a question was asked, or the job completed or failed. A Fargate Spot interruption (SIGTERM two minutes ahead) ended the task without saving, so the work since the last save was lost. The housekeeping job (janitor), every 15 minutes, retried the job once its heartbeat was 15 minutes old, so the job resumed 15–30 minutes after the interruption. From v0.18.2 the worker saves the workspace and the thread to S3 every 5 minutes during a turn, and on SIGTERM saves at once (120 s allowed) and marks its heartbeat stale. The janitor runs every 5 minutes, so the job resumes from the saved state about 5 minutes later.",
      beforeHead: "Up to v0.18.1",
      afterHead: "From v0.18.2",
      before: [
        { title: "Turn running", lines: ["saved only on phase accept,", "question, done or failure"], kind: "plain" },
        { title: "Spot interruption", lines: ["SIGTERM is ignored", "work since last save is lost"], kind: "bad" },
        { title: "Waiting to detect", lines: ["heartbeat 15 min old", "janitor every 15 min"], kind: "warn" },
        { title: "Resume", lines: ["15–30 min after the stop", "from the last save"], kind: "plain" },
      ],
      after: [
        { title: "Turn running", lines: ["workspace and thread", "saved to S3 every 5 min"], kind: "code" },
        { title: "Spot interruption", lines: ["save at once on SIGTERM", "(120 s allowed), then", "mark the heartbeat stale"], kind: "code" },
        { title: "Janitor", lines: ["runs every 5 min,", "retries on its next run"], kind: "code" },
        { title: "Resume", lines: ["about 5 min after the stop", "from the saved state"], kind: "plain" },
      ],
    },
  },
};

// ---------------------------------------------------------------------------

/** One stacked bar with a wrapped legend under it; returns svg parts and the bottom y. */
function stacked(x, y, w, head, segs, unit, lang) {
  const out = [text(x, y + 14, head, { size: 13, weight: 700, color: C.text, maxWidth: w })];
  const total = segs.reduce((a, s) => a + s.v, 0);
  const by = y + 24;
  let acc = 0;
  for (const s of segs) {
    const sx = x + (acc / total) * w;
    const sw = (s.v / total) * w;
    out.push(`<rect x="${sx.toFixed(1)}" y="${by}" width="${sw.toFixed(1)}" height="28" fill="${s.color}" stroke="#ffffff" stroke-width="1"/>`);
    const label = `${s.v.toFixed(1)}`;
    if (sw > textWidth(label, 12) + 10) out.push(text(sx + sw / 2, by + 18.5, label, { size: 12, weight: 700, color: "#ffffff", anchor: "middle" }));
    acc += s.v;
  }
  let lx = x;
  let ly = by + 50;
  for (const s of segs) {
    const pct = Math.round((s.v / total) * 100);
    const label = `${s.name} ${s.v.toFixed(1)} ${unit}${lang === "ja" ? `（${pct}%）` : ` (${pct}%)`}`;
    const lw = 22 + textWidth(label, 12) + 18;
    if (lx > x && lx + lw > x + w) {
      lx = x;
      ly += 20;
    }
    out.push(`<rect x="${lx}" y="${ly - 11}" width="16" height="14" rx="3" fill="${s.color}"/>`);
    out.push(text(lx + 22, ly, label, { size: 12, color: C.muted, maxWidth: x + w - lx - 22 }));
    lx += lw;
  }
  return { svg: out.join("\n"), bottom: ly + 8 };
}

function breakdown(lang, narrow = false) {
  const s = S[lang].breakdown;
  const width = narrow ? NW : W;
  const stageColors = [GREY, C.warn.stroke, C.v1, C.agent.stroke, C.code.stroke];
  const natureColors = [MODEL, TOOLS, C.code.stroke, GREY];
  const stageSegs = Object.values(STAGES).map((v, i) => ({ name: s.stages[i], v, color: stageColors[i] }));
  const natureSegs = Object.values(NATURE).map((v, i) => ({ name: s.nature[i], v, color: natureColors[i] }));
  const a = stacked(10, 6, width - 20, s.stageHead, stageSegs, s.unit, lang);
  const b = stacked(10, a.bottom + 14, width - 20, s.natureHead, natureSegs, s.unit, lang);
  const body = [a.svg, b.svg];
  return svg({ width, height: b.bottom + 6, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function latency(lang, narrow = false) {
  const s = S[lang].latency;
  const width = narrow ? NW : W;
  const colors = [C.code.stroke, C.warn.stroke, C.bad.stroke];
  const body = [];
  const panelW = narrow ? width - 20 : 410;
  const labelW = 92;
  const panel = (px, py, head, values, max, unitLabel, fmt) => {
    body.push(text(px, py + 14, head, { size: 13, weight: 700, color: C.text, maxWidth: panelW }));
    const barMax = panelW - labelW - 64;
    values.forEach((v, i) => {
      const y = py + 28 + i * 40;
      body.push(text(px + labelW - 10, y + 14, s.rows[i], { size: 12.5, weight: 700, color: C.text, anchor: "end", maxWidth: labelW - 10 }));
      body.push(text(px + labelW - 10, y + 29, s.count(LATENCY[i].n), { size: 11, color: C.faint, anchor: "end", maxWidth: labelW - 10 }));
      const w = (v / max) * barMax;
      body.push(`<rect x="${px + labelW}" y="${y + 2}" width="${w.toFixed(1)}" height="26" rx="3" fill="${colors[i]}"/>`);
      body.push(text(px + labelW + w + 6, y + 20, `${fmt(v)} ${unitLabel}`, { size: 12.5, weight: 700, color: C.text }));
    });
    return py + 28 + values.length * 40;
  };
  const top = 6;
  const leftBottom = panel(10, top, s.leftHead, LATENCY.map((r) => r.fixed), 45, s.sec, (v) => v.toFixed(1));
  const [rx, ry] = narrow ? [10, leftBottom + 18] : [440, top];
  const rightBottom = panel(rx, ry, s.rightHead, LATENCY.map((r) => r.minutes), 130, s.min, (v) => String(v));
  let y = Math.max(leftBottom, rightBottom) + 22;
  for (const line of narrow ? s.noteNarrow : s.note) {
    body.push(text(10, y, line, { size: 12.5, weight: 600, color: C.muted, maxWidth: width - 20 }));
    y += 20;
  }
  return svg({ width, height: y - 4, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

const boxH = (b, size = 12) => 34 + b.lines.length * size * 1.45;

function changes(lang, narrow = false) {
  const s = S[lang].changes;
  const body = [];
  if (narrow) {
    const w = NW - 20;
    let y = 10;
    for (const l of s.levers) {
      const h = boxH(l);
      body.push(box({ x: 10, y, w, h, kind: "code", title: l.title, lines: l.lines, size: 12, titleSize: 13 }));
      y += h + 8;
    }
    body.push(arrow([[NW / 2, y], [NW / 2, y + 22]]));
    y += 26;
    for (const [i, m] of s.mid.entries()) {
      const mh = boxH(m);
      body.push(box({ x: 10, y, w, h: mh, kind: "worker", title: m.title, lines: m.lines, size: 12, titleSize: 13 }));
      y += mh + (i < s.mid.length - 1 ? 8 : 0);
    }
    body.push(arrow([[NW / 2, y], [NW / 2, y + 22]]));
    y += 26;
    const oh = boxH(s.out, 13);
    body.push(box({ x: 10, y, w, h: oh, kind: "agent", title: s.out.title, lines: s.out.lines, size: 13, titleSize: 14, align: "middle" }));
    y += oh;
    return svg({ width: NW, height: y + 10, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  const lx = 10;
  const lw = 340;
  const mx = 400;
  const mw = 260;
  const ox = 700;
  const ow = 150;
  const ys = [];
  let y = 10;
  for (const l of s.levers) {
    const h = boxH(l);
    ys.push({ y, h });
    body.push(box({ x: lx, y, w: lw, h, kind: "code", title: l.title, lines: l.lines, size: 12, titleSize: 13 }));
    y += h + 12;
  }
  const bottom = y - 12;
  const m0h = boxH(s.mid[0]) + 6;
  const m0y = (ys[0].y + ys[1].y + ys[1].h) / 2 - m0h / 2;
  const m1h = boxH(s.mid[1]) + 6;
  const m1y = ys[2].y + ys[2].h / 2 - m1h / 2;
  body.push(box({ x: mx, y: m0y, w: mw, h: m0h, kind: "worker", title: s.mid[0].title, lines: s.mid[0].lines, size: 12, titleSize: 13 }));
  body.push(box({ x: mx, y: m1y, w: mw, h: m1h, kind: "worker", title: s.mid[1].title, lines: s.mid[1].lines, size: 12, titleSize: 13 }));
  for (const i of [0, 1]) {
    const cy = ys[i].y + ys[i].h / 2;
    body.push(arrow([[lx + lw, cy], [lx + lw + 26, cy], [lx + lw + 26, m0y + m0h / 2], [mx, m0y + m0h / 2]]));
  }
  body.push(arrow([[lx + lw, m1y + m1h / 2], [mx, m1y + m1h / 2]]));
  const oh = boxH(s.out, 13) + 10;
  const oy = (m0y + m1y + m1h) / 2 - oh / 2;
  body.push(box({ x: ox, y: oy, w: ow, h: oh, kind: "agent", title: s.out.title, lines: s.out.lines, size: 12, titleSize: 14, align: "middle" }));
  body.push(arrow([[mx + mw, m0y + m0h / 2], [mx + mw + 20, m0y + m0h / 2], [mx + mw + 20, oy + oh / 2], [ox, oy + oh / 2]]));
  body.push(arrow([[mx + mw, m1y + m1h / 2], [mx + mw + 20, m1y + m1h / 2], [mx + mw + 20, oy + oh / 2], [ox, oy + oh / 2]]));
  return svg({ width: W, height: bottom + 10, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function sequential(lang, narrow = false) {
  const s = S[lang].sequential;
  const width = narrow ? NW : W;
  const body = [];
  let y = 10;
  body.push(header(10, y, width - 20, s.chainHead, C.line));
  y += 44;
  if (narrow) {
    const w = 200;
    const x = 10;
    for (const [i, st] of s.steps.entries()) {
      body.push(box({ x, y, w, h: 50, kind: i === 0 ? "warn" : "plain", title: st.title, lines: st.lines, size: 12, titleSize: 13, dashed: i === 0 }));
      if (i === 0) {
        body.push(arrow([[x + w + 40, y + 25], [x + w + 6, y + 25]], { color: C.warn.stroke }));
        s.onlyNarrow.forEach((line, k) => body.push(text(x + w + 46, y + 22 + k * 16, line, { size: 11.5, color: C.warn.title, maxWidth: NW - x - w - 52 })));
      }
      if (i < s.steps.length - 1) body.push(arrow([[x + w / 2, y + 50], [x + w / 2, y + 66]]));
      y += 66;
    }
    y -= 16;
  } else {
    const n = s.steps.length;
    const gap = 26;
    const w = (W - 20 - gap * (n - 1)) / n;
    for (const [i, st] of s.steps.entries()) {
      const x = 10 + i * (w + gap);
      body.push(box({ x, y, w, h: 56, kind: i === 0 ? "warn" : "plain", title: st.title, lines: st.lines, size: 12, titleSize: 13, align: "middle", dashed: i === 0 }));
      if (i < n - 1) body.push(arrow([[x + w, y + 28], [x + w + gap, y + 28]]));
    }
    body.push(text(10 + w / 2, y + 76, `↑ ${s.only}`, { size: 12, color: C.warn.title, anchor: "middle", maxWidth: 2 * w }));
    y += 80;
  }
  // TPM gauge
  y += 30;
  body.push(text(10, y, s.tpmHead, { size: 13, weight: 700, color: C.text, maxWidth: width - 20 }));
  y += 14;
  const gx = 10;
  const gw = width - 20;
  const max = 240000;
  const sc = (v) => gx + (v / max) * gw;
  body.push(`<rect x="${gx}" y="${y}" width="${gw}" height="30" rx="4" fill="#f1f5f9" stroke="#e2e8f0"/>`);
  body.push(`<rect x="${gx}" y="${y}" width="${(sc(140000) - gx).toFixed(1)}" height="30" rx="4" fill="${MODEL}"/>`);
  body.push(`<rect x="${sc(140000).toFixed(1)}" y="${y}" width="${(sc(170000) - sc(140000)).toFixed(1)}" height="30" fill="${MODEL}" opacity="0.45"/>`);
  const inside = textWidth(s.oneThread, 12) <= sc(140000) - gx - 16;
  if (inside) body.push(text(gx + 10, y + 20, s.oneThread, { size: 12, weight: 700, color: "#ffffff" }));
  const lim = sc(200000);
  body.push(`<line x1="${lim.toFixed(1)}" y1="${y - 8}" x2="${lim.toFixed(1)}" y2="${y + 40}" stroke="${C.bad.stroke}" stroke-width="2.5"/>`);
  body.push(text(lim, y + 56, s.limit, { size: 12, weight: 700, color: C.bad.title, anchor: "middle" }));
  for (const t of [0, 100000]) body.push(text(sc(t), y + 56, `${t / 1000}k`, { size: 11, color: C.faint, anchor: t === 0 ? "start" : "middle" }));
  y += 56;
  body.push(text(width - 10, y + 18, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  y += 22;
  if (!inside) {
    body.push(`<rect x="10" y="${y + 6}" width="16" height="14" rx="3" fill="${MODEL}"/>`);
    body.push(text(32, y + 18, s.oneThread, { size: 12, color: C.muted, maxWidth: width - 42 }));
    y += 22;
  }
  body.push(text(10, y + 18, s.second, { size: 12.5, weight: 600, color: C.bad.title, maxWidth: width - 20 }));
  y += 28;
  return svg({ width, height: y, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function beforeAfter(lang, narrow = false) {
  const s = S[lang].beforeAfter;
  const width = narrow ? NW : W;
  const colors = [BEFORE, AFTER];
  const body = [];
  let lx = 10;
  let ly = 22;
  s.series.forEach((name, i) => {
    const w = 22 + textWidth(name, 12) + 20;
    if (lx > 10 && lx + w > width) {
      lx = 10;
      ly += 20;
    }
    body.push(`<rect x="${lx}" y="${ly - 11}" width="16" height="12" rx="2" fill="${colors[i]}"/>`);
    body.push(text(lx + 22, ly, name, { size: 12, color: C.muted }));
    lx += w;
  });
  const top = ly + 16;
  const colW = narrow ? width - 20 : 410;
  const labelW = narrow ? 0 : 170;
  const barMax = colW - labelW - 60;
  const rowH = narrow ? 58 : 48;
  const perCol = narrow ? s.rows.length : Math.ceil(s.rows.length / 2);
  const digits = [1, 1, 1, 1, 1, 3, 0, lang === "ja" ? 0 : 2];
  let bottom = top;
  s.rows.forEach(([label, vals], i) => {
    const c = Math.floor(i / perCol);
    const r = i % perCol;
    const x = 10 + c * (colW + 20);
    let y = top + r * rowH;
    const max = Math.max(...vals);
    if (narrow) {
      body.push(text(x, y + 12, label, { size: 12, weight: 700, color: C.text, maxWidth: colW }));
      y += 18;
    } else {
      body.push(text(x + labelW - 10, y + 21, label, { size: 12, weight: 700, color: C.text, anchor: "end", maxWidth: labelW - 14 }));
    }
    const bx = x + labelW;
    vals.forEach((v, k) => {
      const by = y + 4 + k * 16;
      const w = Math.max(2, (v / max) * barMax);
      body.push(`<rect x="${bx}" y="${by}" width="${w.toFixed(1)}" height="13" rx="2" fill="${colors[k]}"/>`);
      body.push(text(bx + w + 6, by + 11, v.toFixed(digits[i]), { size: 11.5, weight: 700, color: C.text }));
    });
    bottom = Math.max(bottom, y + 4 + 2 * 16);
  });
  return svg({ width, height: bottom + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function usage(lang, narrow = false) {
  const s = S[lang].usage;
  const width = narrow ? NW : W;
  const body = [];
  const labelW = narrow ? 0 : 250;
  const x0 = 10 + labelW;
  const barMax = width - x0 - (narrow ? 150 : 150);
  const max = 16e6;
  const sc = (v) => (v / max) * barMax;
  const fmt = (v) => (v / 1e6).toFixed(2);
  const turnColors = ["#6366f1", "#a855f7", "#ec4899"];
  let y = 10;
  const label = (t, yy, weight = 700, color = C.text) => {
    if (narrow) {
      body.push(text(10, yy + 12, t, { size: 12.5, weight, color, maxWidth: width - 20 }));
      return yy + 20;
    }
    body.push(text(x0 - 12, yy + 18, t, { size: 12.5, weight, color, anchor: "end", maxWidth: labelW - 14 }));
    return yy;
  };
  y = label(s.reported, y);
  CUMULATIVE.forEach((v, i) => {
    const by = y + i * 22;
    body.push(`<rect x="${x0}" y="${by}" width="${sc(v).toFixed(1)}" height="18" rx="2" fill="${turnColors[i]}" opacity="0.85"/>`);
    body.push(text(x0 + sc(v) + 6, by + 13.5, s.turn(i + 1, fmt(v)), { size: 11.5, weight: 600, color: C.text }));
  });
  y += 3 * 22 + 16;
  const stackRow = (title, parts, note, noteColor) => {
    y = label(title, y);
    let acc = 0;
    parts.forEach((v, i) => {
      body.push(`<rect x="${(x0 + sc(acc)).toFixed(1)}" y="${y}" width="${sc(v).toFixed(1)}" height="26" fill="${turnColors[i]}" stroke="#ffffff" stroke-width="1"/>`);
      if (sc(v) > textWidth(fmt(v), 11) + 8) body.push(text(x0 + sc(acc) + sc(v) / 2, y + 17.5, fmt(v), { size: 11, weight: 700, color: "#ffffff", anchor: "middle" }));
      acc += v;
    });
    body.push(text(x0 + sc(acc) + 8, y + 13, `= ${fmt(acc)}`, { size: 13, weight: 700, color: noteColor }));
    body.push(text(x0 + sc(acc) + 8, y + 28, note, { size: 11, color: noteColor, maxWidth: width - x0 - sc(acc) - 14 }));
    y += 26 + 20;
  };
  stackRow(s.old, CUMULATIVE, s.oldNote, C.bad.title);
  const diffs = CUMULATIVE.map((v, i) => v - (i ? CUMULATIVE[i - 1] : 0));
  stackRow(s.fixed, diffs, s.fixedNote, C.worker.title);
  body.push(text(width - 10, y, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  return svg({ width, height: y + 10, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function interruption(lang, narrow = false) {
  const s = S[lang].interruption;
  const width = narrow ? NW : W;
  const body = [];
  let y = 10;
  const lane = (head, color, steps) => {
    body.push(header(10, y, width - 20, head, color));
    y += 42;
    if (narrow) {
      const w = NW - 20;
      for (const [i, st] of steps.entries()) {
        const h = boxH(st) - 4;
        body.push(box({ x: 10, y, w, h, kind: st.kind, title: st.title, lines: st.lines, size: 12, titleSize: 13 }));
        y += h;
        if (i < steps.length - 1) {
          body.push(arrow([[NW / 2, y], [NW / 2, y + 16]]));
          y += 18;
        }
      }
      y += 18;
      return;
    }
    const gap = 24;
    const w = (W - 20 - gap * (steps.length - 1)) / steps.length;
    const h = Math.max(...steps.map((st) => boxH(st)));
    for (const [i, st] of steps.entries()) {
      const x = 10 + i * (w + gap);
      body.push(box({ x, y, w, h, kind: st.kind, title: st.title, lines: st.lines, size: 12, titleSize: 13 }));
      if (i < steps.length - 1) body.push(arrow([[x + w, y + h / 2], [x + w + gap, y + h / 2]]));
    }
    y += h + 20;
  };
  lane(s.beforeHead, BEFORE, s.before);
  lane(s.afterHead, AFTER, s.after);
  return svg({ width, height: y - 8, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const SPEED_COST_FIGURES = {
  "speed-cost-breakdown": [breakdown, (lang) => breakdown(lang, true)],
  "speed-cost-latency": [latency, (lang) => latency(lang, true)],
  "speed-cost-changes": [changes, (lang) => changes(lang, true)],
  "speed-cost-sequential": [sequential, (lang) => sequential(lang, true)],
  "speed-cost-before-after": [beforeAfter, (lang) => beforeAfter(lang, true)],
  "speed-cost-usage": [usage, (lang) => usage(lang, true)],
  "speed-cost-interruption": [interruption, (lang) => interruption(lang, true)],
};
