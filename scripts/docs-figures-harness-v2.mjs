// Harness v1.1 vs v2 overview, embedded in appendix D (history) of the specification PDF
// (docs/spec-guide/src/94_history.html). Rendered by docs-figures.mjs.
import { C, arrow, box, pill, svg, text, textWidth } from "./docs-figures-lib.mjs";

const W = 860;
const V11 = "#0d9488";
const V2 = "#4338ca";

const S = {
  ja: {
    overview: {
      title: "ハーネス v1.1 と v2 の比較：一方通行から往復へ",
      desc: "v1.1 ではエージェントが HCD を仕上げてから FRG を作り、ワーカーは受理したフェーズに戻らず、HCD と FRG が合っているかも見なかった。v2 ではエージェントが調査ステップで文献を集め、FRG から HCD に戻って UC を分けたり足したりでき、その理由を revisions 節に書く。ワーカーは BRA の値・文献・引用文まで検査し、HCD↔FRG 整合チェック X1〜X9 を記録し、X1〜X3・X8 があれば調整ターンを 1 回送り、HCD が後段で変われば検証をやり直す。",
      v11Head: "v1.1（アプリ 0.8）：一方通行",
      v2Head: "v2（アプリ 0.13〜）：往復あり",
      workerV11: "ワーカー（CoBRAC ハーネス v1.1）",
      workerV2: "ワーカー（CoBRAC ハーネス v2）",
      agentV11: "Codex エージェント + RCS",
      agentV2: "Codex エージェント + RCS + `lit`",
      v11Worker: ["JSON Schema と UC 命名規則で検査", "受理したフェーズには戻らない", "HCD と FRG が合っているかは見ない"],
      v11Agent: ["HCD を仕上げてから FRG を作る", "文献は知識と Web 検索から", "合わなければ FRG の側で合わせる"],
      v2Worker: ["BRA の値・文献・引用文まで検査", "HCD↔FRG 整合チェック X1〜X9", "HCD が後段で変われば検証し直す"],
      v2Agent: ["調査ステップで文献を集める", "FRG から HCD に戻って UC を分ける", "往復の理由を revisions 節に書く"],
      v11Down: ["フェーズ仕様", "問題一覧"],
      v11Up: ["JSON 4 本", "+ md 2 本"],
      v2Down: ["フェーズ仕様", "問題 + 調整ターン"],
      v2Up: ["JSON + `research.json`", "revisions 節"],
      v11Foot: "流れ：HCD → FRG → CSV の一方通行",
      v2Foot: "流れ：FRG → HCD の戻り道と整合チェック",
    },
  },
  en: {
    overview: {
      title: "Harness v1.1 vs v2: from one-way to round trips",
      desc: "In v1.1 the agent finished the HCD before building the FRG; the worker never went back to an accepted phase and did not check whether the HCD and the FRG agree. In v2 the agent gathers literature in a research step, can go back from the FRG to the HCD to split or add UCs, and records why in the revisions section. The worker checks BRA values, references and quotes, records the HCD–FRG consistency checks X1–X9, sends one adjustment turn when X1–X3 or X8 are found, and validates the HCD again when a later step changes it.",
      v11Head: "v1.1 (app 0.8): one way",
      v2Head: "v2 (app 0.13+): round trips",
      workerV11: "Worker (CoBRAC harness v1.1)",
      workerV2: "Worker (CoBRAC harness v2)",
      agentV11: "Codex agent + RCS",
      agentV2: "Codex agent + RCS + `lit`",
      v11Worker: ["Checks JSON Schemas and UC naming", "Never goes back to an accepted phase", "Does not check that HCD and FRG agree"],
      v11Agent: ["Finishes the HCD, then builds the FRG", "Literature from memory and web search", "Bends the FRG when the two disagree"],
      v2Worker: ["Also checks BRA values, refs, quotes", "HCD–FRG consistency checks X1–X9", "Re-validates an HCD changed later"],
      v2Agent: ["Gathers literature in a research step", "Goes back from FRG to split HCD UCs", "Records why in the revisions section"],
      v11Down: ["phase spec", "problem list"],
      v11Up: ["4 JSON files", "+ 2 markdown"],
      v2Down: ["phase spec", "problems + adjust"],
      v2Up: ["JSON + `research.json`", "revisions"],
      v11Foot: "Flow: HCD → FRG → CSV, one way",
      v2Foot: "Flow: FRG → HCD back-edge and consistency checks",
    },
  },
};

// ---------------------------------------------------------------------------

function overview(lang, narrow = false) {
  const s = S[lang].overview;
  const pw = 410;
  const ph = 340;
  const width = narrow ? pw + 20 : W;
  const height = narrow ? ph * 2 + 34 : ph + 20;
  const body = [];
  const panel = (px, py, head, color, worker, workerLines, agent, agentLines, down, up, foot, footKind) => {
    body.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${C.lane}" stroke="#e2e8f0"/>`);
    body.push(`<rect x="${px}" y="${py}" width="${pw}" height="36" rx="12" fill="${color}"/>`);
    body.push(`<rect x="${px}" y="${py + 24}" width="${pw}" height="12" fill="${color}"/>`);
    body.push(text(px + pw / 2, py + 23, head, { size: 14, weight: 700, color: "#ffffff", anchor: "middle", maxWidth: pw - 16 }));
    body.push(box({ x: px + 16, y: py + 52, w: pw - 32, h: 92, kind: "worker", title: worker, lines: workerLines }));
    body.push(arrow([[px + 70, py + 146], [px + 70, py + 202]], { color: C.worker.stroke }));
    body.push(text(px + 82, py + 170, down[0], { size: 12, color: C.muted, maxWidth: 165 }));
    body.push(text(px + 82, py + 186, down[1], { size: 12, color: C.muted, maxWidth: 165 }));
    body.push(arrow([[px + pw - 70, py + 202], [px + pw - 70, py + 146]], { color: C.agent.stroke }));
    body.push(text(px + pw - 82, py + 170, up[0], { size: 12, color: C.muted, anchor: "end", maxWidth: 150 }));
    body.push(text(px + pw - 82, py + 186, up[1], { size: 12, color: C.muted, anchor: "end", maxWidth: 150 }));
    body.push(box({ x: px + 16, y: py + 204, w: pw - 32, h: 92, kind: "agent", title: agent, lines: agentLines }));
    body.push(pill(px + pw / 2, py + 304, foot, { kind: footKind, anchor: "middle" }));
    for (const k of [0, 1]) {
      if (textWidth(down[k], 12) + textWidth(up[k], 12) > pw - 164 - 12) throw new Error(`overview arrow labels overlap: ${down[k]} / ${up[k]}`);
    }
    if (textWidth(foot, 12) + 20 > pw - 8) throw new Error(`overview footer too wide: ${foot}`);
  };
  panel(10, 10, s.v11Head, V11, s.workerV11, s.v11Worker, s.agentV11, s.v11Agent, s.v11Down, s.v11Up, s.v11Foot, "bad");
  const [x1, y1] = narrow ? [10, ph + 24] : [440, 10];
  panel(x1, y1, s.v2Head, V2, s.workerV2, s.v2Worker, s.agentV2, s.v2Agent, s.v2Down, s.v2Up, s.v2Foot, "code");
  return svg({ width, height, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const HARNESS_V2_FIGURES = {
  "harness-v2-overview": [overview, (lang) => overview(lang, true)],
};
