// Figures of docs/05_CoBRAC_Harness_v1_to_v1_1*.md (harness v1 → v1.1). Rendered by docs-figures.mjs.
import { C, NW, arrow, badge, box, legendRows, pill, svg, text, textWidth } from "./docs-figures-lib.mjs";

const W = 860;
const V11 = "#0d9488";

const S = {
  ja: {
    overview: {
      title: "ハーネス v1 と v1.1 の比較：データの形式と UC の名前",
      desc: "v1 ではエージェントがデータを md の表で書き、ワーカーがパースし直して検査した。Circuit ID は自由な名前で、CSV が作れないとエージェントに手書きさせ、画面で見られるのは xlsx とグラフだけだった。v1.1 ではエージェントがデータを JSON で書き、UC を RCS で SABRA 単位に固定して命名する。ワーカーは JSON Schema と UC 命名規則で検査し、CSV・xlsx・グラフを常にコードで作り、レポートと判断ログも画面で閲覧できる。",
      v1Head: "v1（アプリ 0.5〜0.6）：データは md の表",
      v11Head: "v1.1（アプリ 0.8〜）：データは JSON",
      worker: "ワーカー",
      workerV11: "ワーカー（CoBRAC ハーネス v1.1）",
      agent: "Codex エージェント",
      agentV11: "Codex エージェント + RCS",
      v1Worker: ["md の表をパースし直して検査", "CSV が作れないとエージェントに手書きさせる", "画面で見られるのは xlsx とグラフだけ"],
      v1Agent: ["データを md の表で書く（HCD 6・FRG 5 本）", "Circuit ID は自由な名前", "検証メモや中間の分解表も書く"],
      v11Worker: ["JSON Schema と UC 命名規則で検査", "CSV・xlsx・グラフは常にコードで作る", "レポートと判断ログも画面で閲覧できる"],
      v11Agent: ["データを JSON で書く（HCD 3・FRG 1 本）", "UC を RCS で SABRA 単位に固定して命名", "md は report.md と decision_log.md だけ"],
      v1Down: ["フェーズ仕様", "問題一覧"],
      v1Up: ["md の表", "（`\\|`・`<br>` で表現）"],
      v11Down: ["フェーズ仕様", "JSON ポインタ付きの問題"],
      v11Up: ["JSON ファイル 4 本", "+ md 2 本"],
      v1Foot: "データ形式：md の表（パース頼み）",
      v11Foot: "データ形式：JSON（スキーマで保証）",
    },
    v1: {
      title: "ハーネス v1 のデータの流れ（アプリ 0.5〜0.6）",
      desc: "エージェントは HCD の md 6 本と meta.json、FRG の md 5 本を書く。ワーカーは 2_BIF.md、3_UC.md、4_Connection.md、3_FinalFRG.md、4_FunctionDetails.md の表を markdown.ts でパースし、checkHcd と checkFrg で検査し、buildCsvs で CSV 5 本を作る。残りの md は存在を確認するだけ。CSV が作れないときは、エージェントが phases/CSV.md に従って CSV を手書きした。画面で見られるのは xlsx とグラフだけ。",
      agentCol: "エージェントが書くファイル",
      workerCol: "ワーカー",
      hcd: "HCD（`{P}_HCD/`）",
      frg: "FRG（`{P}_FRG/`）",
      parsed: "表をパース",
      exists: "存在確認だけ",
      json: "JSON",
      parse: { title: "md の表をパース（`markdown.ts`）", lines: ["`\\|`・`<br>` のエスケープ、列名のゆれ、", "分割・縦型の表を救済するコード"] },
      check: { title: "検査（`checkHcd`・`checkFrg`）", lines: ["列・ID・参照・インターフェース・FRG の制約"] },
      build: { title: "`buildCsvs` → CSV 5 本", lines: [] },
      fallback: ["失敗したら", "エージェントが", "CSV を手書き", "`phases/CSV.md`"],
      xlsx: { title: "`csv_to_excel.py` → xlsx、グラフ", lines: [] },
      ui: { title: "画面", lines: ["xlsx とグラフだけ（md は見えない）"] },
      fail: "失敗",
      legend: ["① md の表のパースが脆い", "② 誰も読まない中間ファイル", "③ Circuit ID が自由な名前", "④ CSV を手書きする予備フェーズ"],
      naming: "Circuit ID：自由な名前",
    },
    v11: {
      title: "ハーネス v1.1 のデータの流れ（アプリ 0.8 以降）",
      desc: "エージェントは RCS MCP サーバーで脳領域を SABRA 単位に照会し、references.json、uc.json、connections.json、frg.json の JSON と、meta.json、report.md、decision_log.md を書く。ワーカーは全 RCS 呼び出しを rcs_mcp_calls.jsonl に残し、schemas/ に書き出したのと同じ JSON Schema で検査し、相互参照と UC 命名規則を検査する（HOMBA アンカーの略称はワーカーが RCS の get_homba_term で確認）。問題は JSON ポインタ付きの修正依頼として最大 3 回返す。CSV 5 本は buildCsvs が JSON から作り、予備フェーズはない。画面では xlsx、グラフ、レポート、判断ログを見られる。",
      agentCol: "エージェントが書くファイル",
      workerCol: "ワーカー（CoBRAC ハーネス v1.1）",
      agent: { title: "Codex エージェント", lines: ["フェーズ仕様と `schemas/` を見て書く"] },
      rcs: { title: "RCS MCP サーバー", lines: ["`search_homba_candidates`", "`search_bna_candidates`・`get_homba_term`"] },
      rcsQuery: "SABRA の照会",
      rcsLog: "全呼び出しを `rcs_mcp_calls.jsonl` に記録",
      root: "プロジェクト直下（`{P}/`）",
      hcd: "HCD（`{P}_HCD/`）",
      frg: "FRG（`{P}_FRG/`）",
      forUser: "人が読む・画面で閲覧",
      data: "データ（スキーマあり）",
      schema: { title: "JSON Schema で検査", lines: ["`schemas/` に書き出したものと同じ定義"] },
      cross: { title: "相互参照と UC 命名規則", lines: ["ID・参照・インターフェース・FRG の制約", "Circuit ID の略称が SABRA と一致するか"] },
      lookup: "RCS で略称を確認（`get_homba_term`）",
      lookupShort: "略称の確認",
      fixWide: ["JSON ポインタ", "付きの修正依頼", "（最大 3 回）"],
      build: { title: "`buildCsvs` → CSV 5 本", lines: ["JSON から決定的に生成（予備フェーズなし）"] },
      xlsx: { title: "`csv_to_excel.py` → xlsx、グラフ", lines: [] },
      ui: { title: "画面", lines: ["xlsx・グラフ・レポート・判断ログ"] },
      fix: ["JSON ポインタ付きの", "修正依頼（最大 3 回）"],
      legend: ["① JSON とスキーマ", "② 中間ファイル 3 本を廃止", "③ SABRA に基づく命名と検査", "④ CSV はコードだけが作る"],
    },
    naming: {
      title: "UC 記述子と Circuit ID の組み立て方",
      desc: "UC Descriptor の例 HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe は、アンカー HOMBA:12261（腹側被蓋野、DHBA 略称 VTA）に、伝達物質 nt:DA、投射先 out:BNA:223-224（側坐核、BNA 略称 NAC）、応答 resp:rpe のファセットを足したもの。Circuit ID はアンカーの略称を先頭に、ファセットを括弧内に並べて VTA(DA,out:NAC,rpe) になる。ふつうはアンカーだけで、HOMBA:12261 なら VTA。アンカーは、領域の語だけを取り出し、RCS で候補を検索し、DHBA 語なら HOMBA の ID、BNA の領域なら BNA のラベルに決め、必要なときだけファセットを足す。",
      descriptor: "UC Descriptor（キー）",
      circuit: "Circuit ID（読みやすい別名）",
      rows: [
        ["`HOMBA:12261`", "アンカー：腹側被蓋野", "`VTA`", "見出し = DHBA 略称"],
        ["`/nt:DA`", "伝達物質", "`DA`", "括弧内の項目"],
        ["`/out:BNA:223-224`", "投射先：側坐核", "`out:NAC`", "相手の SABRA 略称"],
        ["`/resp:rpe`", "応答", "`rpe`", ""],
      ],
      normal: "ふつうはアンカーだけ：`HOMBA:12261` → `VTA`、`BNA:223-224` → `NAC`、`BNA:57` → `A4ul@L`",
      stepsHead: "アンカーの決め方",
      steps: [
        ["1. 領域の語だけ", "細胞・層・伝達物質などの", "語を外す"],
        ["2. RCS で検索", "`search_homba_candidates`", "結果の `sabra.atlas` を見る"],
        ["3. アンカーを決める", "DHBA 語 → `HOMBA:<id>`", "BNA 領域 → `BNA:<n>`"],
        ["4. 必要なら細分", "ファセットを足す", "（`part`・`nt`・`out` など）"],
      ],
      checks: "ワーカーの検査：構文とファセットの順・略称の一致（RCS / BNA 表）・項目とファセットの対応・記述子の重複",
    },
    files: {
      title: "ファイルの対応：v1 の md から v1.1 のファイルへ",
      desc: "1_Thinking.md は decision_log.md に、2_BIF.md の References 表は references.json に、2_BIF.md の Connections 表と 4_Connection.md は connections.json に、3_UC.md は uc.json に、6_FinalReport.md と 5_Report.md は report.md に、3_FinalFRG.md と 4_FunctionDetails.md は frg.json になった。5_Verification.md、1_InitialDecomposition.md、2_OptimizedFRG.md と、CSV を手書きする予備フェーズ phases/CSV.md は廃止した。",
      v1: "v1（md）",
      v11: "v1.1",
      removed: "廃止",
      notes: {
        "2_BIF.md": "References 表 + Connections 表",
        "3_UC.md": "14 列の表",
        "5_Verification.md": "自己検証の記録",
        "1_InitialDecomposition.md": "論理的な分解",
        "2_OptimizedFRG.md": "統合後の表",
        "phases/CSV.md": "CSV 手書きの予備フェーズ",
        "decision_log.md": "判断とその理由",
        "connections.json": "`bif[]` + `connections[]`",
        "report.md": "`## HCD` と `## FRG`",
        "frg.json": "ノードごとに 1 エントリ",
      },
    },
    tokens: {
      title: "各フェーズで、リクエストのたびに文脈に載っている指示の量（v1 と v1.1）",
      desc: "HCD フェーズは v1 が 2,017 トークン（AGENTS.md 721 + HCD.md 1,296）、v1.1 が 4,915 トークン（AGENTS.md 1,241 + HCD.md 3,674）。FRG フェーズは v1 が 3,053 トークン、v1.1 が 5,979 トークン（FRG.md 1,036 → 1,064）。",
      rows: ["HCD v1", "HCD v1.1", "FRG v1", "FRG v1.1"],
      unit: "トークン",
      note: "増えた分の大半は UC 命名規則（`HCD.md`）",
    },
  },
  en: {
    overview: {
      title: "Harness v1 vs v1.1: data format and UC names",
      desc: "In v1 the agent wrote its data as markdown tables that the worker parsed back and checked. Circuit IDs were free names, the agent typed the CSVs by hand when they could not be built, and only the xlsx and graphs were visible in the app. In v1.1 the agent writes JSON and names each UC after a SABRA unit found with RCS. The worker checks JSON Schemas and the UC naming rules, always builds the CSVs, xlsx and graphs in code, and the report and decision log can be read in the app.",
      v1Head: "v1 (app 0.5–0.6): data as markdown tables",
      v11Head: "v1.1 (app 0.8+): data as JSON",
      worker: "Worker",
      workerV11: "Worker (CoBRAC harness v1.1)",
      agent: "Codex agent",
      agentV11: "Codex agent + RCS",
      v1Worker: ["Parses the markdown tables back to check them", "Has the agent type CSVs when they fail", "Only the xlsx and graphs are visible"],
      v1Agent: ["Writes data as tables (6 HCD, 5 FRG files)", "Circuit IDs are free names", "Also writes verification notes and drafts"],
      v11Worker: ["Checks JSON Schemas and UC naming rules", "Always builds CSVs, xlsx and graphs in code", "Report and decision log visible in the app"],
      v11Agent: ["Writes data as JSON (3 HCD, 1 FRG file)", "Anchors each UC on a SABRA unit via RCS", "Markdown only for report and decision log"],
      v1Down: ["phase spec", "problem list"],
      v1Up: ["markdown tables", "(`\\|`, `<br>` escapes)"],
      v11Down: ["phase spec", "problems + JSON pointer"],
      v11Up: ["4 JSON files", "+ 2 markdown"],
      v1Foot: "Data format: markdown tables (parsed)",
      v11Foot: "Data format: JSON (guaranteed by schemas)",
    },
    v1: {
      title: "Data flow of harness v1 (app 0.5–0.6)",
      desc: "The agent writes six HCD markdown files plus meta.json and five FRG markdown files. The worker parses the tables of 2_BIF.md, 3_UC.md, 4_Connection.md, 3_FinalFRG.md and 4_FunctionDetails.md with markdown.ts, checks them with checkHcd and checkFrg, and builds five CSVs with buildCsvs. The other markdown files are only checked for existence. When the CSVs could not be built, the agent typed them by hand following phases/CSV.md. Only the xlsx and graphs were visible in the app.",
      agentCol: "Files the agent writes",
      workerCol: "Worker",
      hcd: "HCD (`{P}_HCD/`)",
      frg: "FRG (`{P}_FRG/`)",
      parsed: "tables parsed",
      exists: "existence only",
      json: "JSON",
      parse: { title: "Parse markdown tables (`markdown.ts`)", lines: ["code that rescues `\\|` and `<br>` escapes,", "column-name drift, split and vertical tables"] },
      check: { title: "Checks (`checkHcd`, `checkFrg`)", lines: ["columns, IDs, refs, interfaces, FRG rules"] },
      build: { title: "`buildCsvs` → 5 CSVs", lines: [] },
      fallback: ["if it fails,", "the agent types", "the CSVs", "`phases/CSV.md`"],
      xlsx: { title: "`csv_to_excel.py` → xlsx, graphs", lines: [] },
      ui: { title: "App", lines: ["xlsx and graphs only (no markdown)"] },
      fail: "fails",
      legend: ["① fragile table parsing", "② drafts nobody reads", "③ free-form Circuit IDs", "④ hand-typed CSV fallback"],
      naming: "Circuit ID: free name",
    },
    v11: {
      title: "Data flow of harness v1.1 (app 0.8 and later)",
      desc: "The agent looks up brain regions as SABRA units in the RCS MCP server and writes the JSON files references.json, uc.json, connections.json and frg.json, plus meta.json, report.md and decision_log.md. The worker keeps every RCS call in rcs_mcp_calls.jsonl, checks the files against the same JSON Schemas it wrote to schemas/, and checks cross-references and the UC naming rules (it confirms the abbreviation of HOMBA anchors with RCS get_homba_term). Problems go back as fix prompts with JSON pointers, up to 3 times. buildCsvs generates the five CSVs from the JSON; there is no fallback phase. The app shows the xlsx, graphs, report and decision log.",
      agentCol: "Files the agent writes",
      workerCol: "Worker (CoBRAC harness v1.1)",
      agent: { title: "Codex agent", lines: ["writes from the phase spec and `schemas/`"] },
      rcs: { title: "RCS MCP server", lines: ["`search_homba_candidates`", "`search_bna_candidates`, `get_homba_term`"] },
      rcsQuery: "SABRA lookups",
      rcsLog: "every call kept in `rcs_mcp_calls.jsonl`",
      root: "Project root (`{P}/`)",
      hcd: "HCD (`{P}_HCD/`)",
      frg: "FRG (`{P}_FRG/`)",
      forUser: "for people, shown in the app",
      data: "data (with schema)",
      schema: { title: "Check JSON Schemas", lines: ["the same definitions as in `schemas/`"] },
      cross: { title: "Cross-references and UC naming", lines: ["IDs, references, interfaces, FRG rules", "Circuit ID abbreviation matches SABRA"] },
      lookup: "abbreviation checked with RCS (`get_homba_term`)",
      lookupShort: "abbr. check",
      fixWide: ["fix prompt", "with JSON", "pointers (≤3)"],
      build: { title: "`buildCsvs` → 5 CSVs", lines: ["generated from JSON (no fallback phase)"] },
      xlsx: { title: "`csv_to_excel.py` → xlsx, graphs", lines: [] },
      ui: { title: "App", lines: ["xlsx, graphs, report, decision log"] },
      fix: ["fix prompt with JSON", "pointers (up to 3)"],
      legend: ["① JSON with schemas", "② 3 draft files removed", "③ SABRA-based names, checked", "④ CSVs only from code"],
    },
    naming: {
      title: "How a UC Descriptor and a Circuit ID are built",
      desc: "The UC Descriptor HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe is the anchor HOMBA:12261 (ventral tegmental area, DHBA abbreviation VTA) plus the facets transmitter nt:DA, projection target out:BNA:223-224 (nucleus accumbens, BNA abbreviation NAC) and response resp:rpe. The Circuit ID puts the anchor's abbreviation first and the facets in parentheses: VTA(DA,out:NAC,rpe). The anchor alone is the normal case: HOMBA:12261 is just VTA. To find the anchor, keep only the region words, search RCS, take the HOMBA ID for a DHBA term or the BNA label for a BNA area, and add facets only when needed.",
      descriptor: "UC Descriptor (the key)",
      circuit: "Circuit ID (readable alias)",
      rows: [
        ["`HOMBA:12261`", "anchor: ventral tegmental area", "`VTA`", "head = DHBA abbreviation"],
        ["`/nt:DA`", "transmitter", "`DA`", "items in parentheses"],
        ["`/out:BNA:223-224`", "target: nucleus accumbens", "`out:NAC`", "partner's SABRA abbr."],
        ["`/resp:rpe`", "response", "`rpe`", ""],
      ],
      normal: "The anchor alone is the normal case: `HOMBA:12261` → `VTA`, `BNA:223-224` → `NAC`, `BNA:57` → `A4ul@L`",
      stepsHead: "Finding the anchor",
      steps: [
        ["1. Region words only", "drop cell, layer and", "transmitter words"],
        ["2. Search RCS", "`search_homba_candidates`", "read `sabra.atlas`"],
        ["3. Pick the anchor", "DHBA term → `HOMBA:<id>`", "BNA area → `BNA:<n>`"],
        ["4. Refine if needed", "add facets", "(`part`, `nt`, `out`, …)"],
      ],
      checks: "Worker checks: syntax and facet order, abbreviation match (RCS / BNA table), items vs facets, unique descriptors",
    },
    files: {
      title: "File mapping: from the v1 markdown files to v1.1",
      desc: "1_Thinking.md became decision_log.md; the References table of 2_BIF.md became references.json; the Connections table of 2_BIF.md and 4_Connection.md became connections.json; 3_UC.md became uc.json; 6_FinalReport.md and 5_Report.md became report.md; 3_FinalFRG.md and 4_FunctionDetails.md became frg.json. 5_Verification.md, 1_InitialDecomposition.md, 2_OptimizedFRG.md and the hand-typed CSV fallback phases/CSV.md were removed.",
      v1: "v1 (markdown)",
      v11: "v1.1",
      removed: "Removed",
      notes: {
        "2_BIF.md": "References + Connections tables",
        "3_UC.md": "14-column table",
        "5_Verification.md": "self-verification notes",
        "1_InitialDecomposition.md": "logical decomposition",
        "2_OptimizedFRG.md": "merged table",
        "phases/CSV.md": "hand-typed CSV fallback",
        "decision_log.md": "decisions and reasons",
        "connections.json": "`bif[]` + `connections[]`",
        "report.md": "`## HCD` and `## FRG`",
        "frg.json": "one entry per node",
      },
    },
    tokens: {
      title: "Instructions in the context of every request, by phase (v1 vs v1.1)",
      desc: "HCD phase: v1 2,017 tokens (AGENTS.md 721 + HCD.md 1,296), v1.1 4,915 tokens (AGENTS.md 1,241 + HCD.md 3,674). FRG phase: v1 3,053 tokens, v1.1 5,979 tokens (FRG.md 1,036 → 1,064).",
      rows: ["HCD v1", "HCD v1.1", "FRG v1", "FRG v1.1"],
      unit: "tokens",
      note: "most of the increase: UC naming rules (`HCD.md`)",
    },
  },
};

// ---------------------------------------------------------------------------

function header(x, y, w, label, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="30" rx="8" fill="${color}"/>` + text(x + w / 2, y + 20, label, { size: 13.5, weight: 700, color: "#ffffff", anchor: "middle", maxWidth: w - 12 });
}

/** A file chip: monospace name on the left, a short note on the right. */
function chip(x, y, w, name, { kind = "plain", note = "", dashed = false, noteColor = C.muted } = {}) {
  const k = C[kind];
  const nameW = textWidth(`\`${name}\``, 12);
  const out = [
    `<rect x="${x}" y="${y}" width="${w}" height="28" rx="6" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.3"${dashed ? ` stroke-dasharray="5 3"` : ""}/>`,
    text(x + 10, y + 18.5, `\`${name}\``, { size: 12, maxWidth: w - 20 }),
  ];
  if (note) out.push(text(x + w - 10, y + 18.5, note, { size: 11, color: noteColor, anchor: "end", maxWidth: w - 30 - nameW }));
  return out.join("\n");
}

function group(x, y, w, h, label, color) {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#ffffff" stroke="${color}" stroke-width="1.2" stroke-dasharray="4 4"/>` +
    text(x + 12, y + 20, label, { size: 12.5, weight: 700, color, maxWidth: w - 24 })
  );
}

function legendLine(items, y, width, color = C.bad.title) {
  const out = [];
  let lx = 12;
  let ly = y;
  for (const item of items) {
    const w = textWidth(item, 12) + 22;
    if (lx > 12 && lx + w > width) {
      lx = 12;
      ly += 20;
    }
    out.push(text(lx, ly, item, { size: 12, color }));
    lx += w;
  }
  return { svg: out.join("\n"), bottom: ly };
}

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
    body.push(text(px + pw - 82, py + 170, up[0], { size: 12, color: C.muted, anchor: "end", maxWidth: 140 }));
    body.push(text(px + pw - 82, py + 186, up[1], { size: 12, color: C.muted, anchor: "end", maxWidth: 140 }));
    body.push(box({ x: px + 16, y: py + 204, w: pw - 32, h: 92, kind: "agent", title: agent, lines: agentLines }));
    body.push(pill(px + pw / 2, py + 304, foot, { kind: footKind, anchor: "middle" }));
    for (const k of [0, 1]) {
      if (textWidth(down[k], 12) + textWidth(up[k], 12) > pw - 164 - 12) throw new Error(`overview arrow labels overlap: ${down[k]} / ${up[k]}`);
    }
  };
  panel(10, 10, s.v1Head, C.v1, s.worker, s.v1Worker, s.agent, s.v1Agent, s.v1Down, s.v1Up, s.v1Foot, "bad");
  const [x1, y1] = narrow ? [10, ph + 24] : [440, 10];
  panel(x1, y1, s.v11Head, V11, s.workerV11, s.v11Worker, s.agentV11, s.v11Agent, s.v11Down, s.v11Up, s.v11Foot, "code");
  return svg({ width, height, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

/** Worker chain of boxes; returns svg parts and the bottom y. */
function chain(x, y, w, steps, gap = 24, size = 12) {
  const out = [];
  const tops = [];
  for (const [i, st] of steps.entries()) {
    const h = st.h ?? (st.lines?.length ? 34 + st.lines.length * 18 : 40);
    tops.push({ y, h });
    out.push(box({ x, y, w, h, kind: st.kind ?? "code", title: st.title, lines: st.lines ?? [], size, titleSize: 13, dashed: st.dashed }));
    if (i < steps.length - 1) out.push(arrow([[x + w / 2, y + h], [x + w / 2, y + h + gap]], { color: C.line }));
    y += h + gap;
  }
  return { svg: out.join("\n"), tops, bottom: y - gap };
}

function v1Flow(lang, narrow = false) {
  const s = S[lang].v1;
  const body = [];
  const width = narrow ? NW : W;
  const colW = narrow ? width - 20 : 330;
  const fx = 10;
  // files column
  let y = 12;
  body.push(text(fx + 2, y + 14, s.agentCol, { size: 14, weight: 700, color: C.agent.title }));
  y += 26;
  const files = (label, list, top) => {
    const h = 34 + list.length * 34;
    const parts = [group(fx, top, colW, h, label, C.agent.stroke)];
    list.forEach(([name, kind], i) => {
      const cy = top + 30 + i * 34;
      const note = kind === "parsed" ? s.parsed : kind === "json" ? s.json : s.exists;
      parts.push(chip(fx + 10, cy, colW - 20, name, { kind: kind === "exists" ? "plain" : "agent", dashed: kind === "exists", note, noteColor: kind === "exists" ? C.faint : C.agent.title }));
    });
    return { svg: parts.join("\n"), bottom: top + h };
  };
  const hcd = files(s.hcd, [
    ["../meta.json", "json"],
    ["1_Thinking.md", "exists"],
    ["2_BIF.md", "parsed"],
    ["3_UC.md", "parsed"],
    ["4_Connection.md", "parsed"],
    ["5_Verification.md", "exists"],
    ["6_FinalReport.md", "exists"],
  ], y);
  body.push(hcd.svg);
  const ucChipY = y + 30 + 3 * 34;
  const frgTop = hcd.bottom + 14;
  const frg = files(s.frg, [
    ["1_InitialDecomposition.md", "exists"],
    ["2_OptimizedFRG.md", "exists"],
    ["3_FinalFRG.md", "parsed"],
    ["4_FunctionDetails.md", "parsed"],
    ["5_Report.md", "exists"],
  ], frgTop);
  body.push(frg.svg);
  body.push(badge(fx + 20 + textWidth("`3_UC.md`", 12) + 14, ucChipY + 14, 3));
  body.push(badge(fx + colW - 8, frgTop + 30 + 2, 2));

  // worker chain
  const wx = narrow ? 10 : 400;
  const ww = narrow ? width - 20 - 132 : 290;
  let wy = narrow ? frg.bottom + 60 : 38;
  if (narrow) body.push(text(wx + 2, wy - 12, s.workerCol, { size: 14, weight: 700, color: C.worker.title }));
  else body.push(text(wx + 2, 26, s.workerCol, { size: 14, weight: 700, color: C.worker.title }));
  const ch = chain(wx, wy, ww, [
    { ...s.parse, kind: "bad" },
    s.check,
    s.build,
    s.xlsx,
    { ...s.ui, kind: "plain" },
  ], 24, narrow ? 11 : 12);
  body.push(ch.svg);
  body.push(badge(wx + ww - 8, wy + 2, 1));
  // files → parser
  const parseMid = ch.tops[0].y + ch.tops[0].h / 2;
  if (narrow) {
    body.push(arrow([[fx + colW / 2, frg.bottom], [fx + colW / 2, frg.bottom + 22], [wx + ww / 2, frg.bottom + 22], [wx + ww / 2, wy]], { color: C.agent.stroke }));
  } else {
    body.push(arrow([[fx + colW, (y + hcd.bottom) / 2], [fx + colW + 18, (y + hcd.bottom) / 2], [fx + colW + 18, parseMid], [wx, parseMid]], { color: C.agent.stroke }));
    body.push(`<path d="M${fx + colW} ${(frgTop + frg.bottom) / 2} L${fx + colW + 18} ${(frgTop + frg.bottom) / 2} L${fx + colW + 18} ${parseMid}" fill="none" stroke="${C.agent.stroke}" stroke-width="1.6"/>`);
  }
  // fallback
  const b = ch.tops[2];
  const fbx = wx + ww + 18;
  const fbw = width - fbx - 10;
  const fbY = b.y - 6;
  body.push(box({ x: fbx, y: fbY, w: fbw, h: 86, kind: "warn", lines: s.fallback, size: 11.5, align: "middle", dashed: true }));
  body.push(arrow([[wx + ww, b.y + b.h / 2], [fbx, b.y + b.h / 2]], { color: C.warn.stroke, dashed: true }));
  const x4 = ch.tops[3];
  body.push(arrow([[fbx + fbw / 2, fbY + 86], [fbx + fbw / 2, x4.y + x4.h / 2], [wx + ww, x4.y + x4.h / 2]], { color: C.warn.stroke, dashed: true }));
  body.push(badge(fbx + fbw - 6, fbY + 2, 4));

  const bottom = Math.max(frg.bottom, ch.bottom) + 30;
  const lg = legendLine(s.legend, bottom, width);
  body.push(lg.svg);
  return svg({ width, height: lg.bottom + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function v11Flow(lang, narrow = false) {
  const s = S[lang].v11;
  const body = [];
  const width = narrow ? NW : W;
  const colW = narrow ? width - 20 : 300;
  const fx = 10;
  const green = C.code.stroke;
  let y = 10;
  // agent + RCS
  body.push(box({ x: fx, y, w: colW, h: 56, kind: "agent", title: s.agent.title, lines: s.agent.lines, size: 12 }));
  const rx = narrow ? fx : 440;
  const rw = narrow ? colW - 64 : 280;
  const ry = narrow ? y + 56 + 40 : y;
  body.push(box({ x: rx, y: ry, w: rw, h: 72, kind: "plain", title: s.rcs.title, lines: s.rcs.lines, size: 11.5 }));
  if (narrow) {
    body.push(arrow([[fx + 110, y + 56], [fx + 110, ry]], { color: C.agent.stroke }));
    body.push(arrow([[fx + 130, ry], [fx + 130, y + 56]], { color: C.line }));
    body.push(text(fx + 142, y + 80, s.rcsQuery, { size: 12, color: C.muted }));
    body.push(text(fx + 2, ry + 72 + 18, s.rcsLog, { size: 11.5, color: C.muted, maxWidth: colW }));
    y = ry + 72 + 34;
  } else {
    body.push(arrow([[fx + colW, y + 22], [rx, y + 22]], { color: C.agent.stroke }));
    body.push(arrow([[rx, y + 40], [fx + colW, y + 40]], { color: C.line }));
    body.push(text((fx + colW + rx) / 2, y + 16, s.rcsQuery, { size: 11.5, color: C.muted, anchor: "middle" }));
    body.push(text(rx + 2, ry + 72 + 18, s.rcsLog, { size: 11.5, color: C.muted, maxWidth: width - rx - 12 }));
    y += 72 + 40;
  }
  const downX = narrow ? fx + colW - 40 : fx + colW / 2;
  body.push(arrow([[downX, 66], [downX, y]], { color: C.agent.stroke }));
  // files column
  const files = (label, list, top) => {
    const h = 34 + list.length * 34;
    const parts = [group(fx, top, colW, h, label, C.agent.stroke)];
    list.forEach(([name, kind], i) => {
      const cy = top + 30 + i * 34;
      parts.push(chip(fx + 10, cy, colW - 20, name, { kind: kind === "md" ? "warn" : "code", note: kind === "md" ? s.forUser : kind === "json" ? "JSON" : s.data, noteColor: kind === "md" ? C.warn.title : C.code.title }));
    });
    return { svg: parts.join("\n"), bottom: top + h };
  };
  const top = y;
  const root = files(s.root, [
    ["meta.json", "json"],
    ["report.md", "md"],
    ["decision_log.md", "md"],
  ], top);
  body.push(root.svg);
  const hcd = files(s.hcd, [
    ["references.json", "data"],
    ["uc.json", "data"],
    ["connections.json", "data"],
  ], root.bottom + 12);
  body.push(hcd.svg);
  const frg = files(s.frg, [["frg.json", "data"]], hcd.bottom + 12);
  body.push(frg.svg);
  body.push(badge(fx + colW - 8, top + 2, 2, green));
  body.push(badge(fx + colW - 8, root.bottom + 12 + 2, 1, green));

  // worker chain
  const wx = narrow ? 10 : 440;
  const ww = narrow ? width - 20 : 280;
  const wy = narrow ? frg.bottom + 64 : top + 26;
  body.push(text(wx + 2, wy - 12, s.workerCol, { size: 14, weight: 700, color: C.worker.title, maxWidth: ww + (narrow ? 0 : 150) }));
  const ch = chain(wx, wy, ww, [s.schema, s.cross, s.build, s.xlsx, { ...s.ui, kind: "plain" }], narrow ? 36 : 24);
  body.push(ch.svg);
  body.push(badge(wx + ww - 8, ch.tops[0].y + 2, 1, green));
  body.push(badge(wx + ww - 8, ch.tops[1].y + 2, 3, green));
  body.push(badge(wx + ww - 8, ch.tops[2].y + 2, 4, green));
  // files → checks
  const sMid = ch.tops[0].y + ch.tops[0].h / 2;
  if (narrow) {
    body.push(arrow([[fx + colW - 40, frg.bottom], [fx + colW - 40, wy]], { color: C.agent.stroke }));
  } else {
    body.push(arrow([[fx + colW, (hcd.bottom + 12 + hcd.bottom) / 2 - 20], [fx + colW + 20, (hcd.bottom + 12 + hcd.bottom) / 2 - 20], [fx + colW + 20, sMid], [wx, sMid]], { color: C.agent.stroke }));
  }
  // RCS → UC naming check (worker lookup)
  const c1 = ch.tops[1];
  if (!narrow) {
    const lx = wx + ww + 24;
    body.push(arrow([[lx, ry + 72], [lx, c1.y + c1.h / 2], [wx + ww, c1.y + c1.h / 2]], { color: C.line, dashed: true }));
    body.push(text(lx + 8, c1.y + c1.h / 2 - 30, s.lookupShort, { size: 11, color: C.muted, maxWidth: width - lx - 12 }));
    body.push(text(lx + 8, c1.y + c1.h / 2 - 14, `\`get_homba_term\``, { size: 11, color: C.muted, maxWidth: width - lx - 12 }));
  } else {
    body.push(text(wx + 8, c1.y + c1.h + 16, s.lookup, { size: 11, color: C.muted, maxWidth: ww - 60 }));
  }
  // fix loop back to the agent
  if (!narrow) {
    const fy = c1.y + c1.h / 2 + 10;
    body.push(arrow([[wx, fy], [fx + colW + 36, fy], [fx + colW + 36, 10 + 50], [fx + colW, 10 + 50]], { color: C.bad.stroke }));
    s.fixWide.forEach((l, k) => body.push(text(fx + colW + 44, fy - 38 + k * 14, l, { size: 11, color: C.bad.title, maxWidth: wx - fx - colW - 48 })));
  } else {
    const fy = c1.y + c1.h / 2;
    body.push(arrow([[wx + ww, fy], [width - 4, fy], [width - 4, 10 + 28], [fx + colW, 10 + 28]], { color: C.bad.stroke }));
    s.fix.forEach((l, k) => body.push(text(wx + ww / 2 + 12, c1.y - 20 + k * 13, l, { size: 11, color: C.bad.title, maxWidth: ww / 2 - 20 })));
  }
  const bottom = Math.max(frg.bottom, ch.bottom) + 30;
  const lg = legendLine(s.legend, bottom, width, C.code.title);
  body.push(lg.svg);
  return svg({ width, height: lg.bottom + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function naming(lang, narrow = false) {
  const s = S[lang].naming;
  const width = narrow ? NW : W;
  const body = [];
  const colL = narrow ? 10 : 20;
  const lw = narrow ? 204 : 330;
  const rx = narrow ? width - 10 - 162 : width - 20 - 300;
  const rw = narrow ? 162 : 300;
  let y = 10;
  const short = (l) => (narrow ? l.split(/（| \(/)[0] : l);
  body.push(header(colL, y, lw, short(s.descriptor), C.agent.stroke));
  body.push(header(rx, y, rw, short(s.circuit), V11));
  y += 40;
  if (narrow) {
    body.push(box({ x: colL, y, w: width - 20, h: 32, kind: "agent", lines: ["`HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe`"], size: 12, align: "middle" }));
    body.push(arrow([[width / 2, y + 32], [width / 2, y + 46]], { color: C.code.stroke }));
    body.push(box({ x: colL, y: y + 46, w: width - 20, h: 32, kind: "code", lines: ["`VTA(DA,out:NAC,rpe)`"], size: 12.5, align: "middle" }));
    y += 94;
  } else {
    body.push(box({ x: colL, y, w: lw, h: 34, kind: "agent", lines: ["`HOMBA:12261/nt:DA/out:BNA:223-224/resp:rpe`"], size: 12.5, align: "middle" }));
    body.push(box({ x: rx, y, w: rw, h: 34, kind: "code", lines: ["`VTA(DA,out:NAC,rpe)`"], size: 13, align: "middle" }));
    body.push(arrow([[colL + lw, y + 17], [rx, y + 17]], { color: C.code.stroke }));
    y += 50;
  }
  for (const [i, [d, dn, c, cn]] of s.rows.entries()) {
    const h = 46;
    body.push(box({ x: colL, y, w: lw, h, kind: i === 0 ? "worker" : "plain", lines: [d, dn], size: narrow ? 11 : 12 }));
    body.push(box({ x: rx, y, w: rw, h, kind: i === 0 ? "code" : "plain", lines: cn ? [c, cn] : [c], size: narrow ? 11 : 12 }));
    body.push(arrow([[colL + lw, y + h / 2], [rx, y + h / 2]], { color: i === 0 ? C.code.stroke : C.line }));
    y += h + 10;
  }
  y += 4;
  if (narrow) {
    const parts = s.normal.split("：").length > 1 ? s.normal.split("：") : s.normal.split(": ");
    body.push(text(colL, y + 12, parts[0] + (lang === "ja" ? "：" : ":"), { size: 11.5, weight: 600, color: C.text, maxWidth: width - 20 }));
    const items = parts[1].split(lang === "ja" ? "、" : ", ");
    items.forEach((it, i) => body.push(text(colL + 12, y + 30 + i * 17, it, { size: 11.5, color: C.text, maxWidth: width - 30 })));
    y += 30 + items.length * 17;
  } else {
    body.push(text(width / 2, y + 12, s.normal, { size: 12.5, weight: 600, color: C.text, anchor: "middle", maxWidth: width - 20 }));
    y += 26;
  }
  y += 12;
  body.push(text(colL, y + 12, s.stepsHead, { size: 13.5, weight: 700, color: C.worker.title }));
  y += 22;
  if (narrow) {
    for (const [i, [t, ...l]] of s.steps.entries()) {
      const h = 30 + l.length * 17;
      body.push(box({ x: colL, y, w: width - 20, h, kind: "worker", title: t, lines: l, size: 11.5, titleSize: 12.5 }));
      y += h;
      if (i < s.steps.length - 1) body.push(arrow([[width / 2, y], [width / 2, y + 14]], { color: C.worker.stroke }));
      y += 14;
    }
    y -= 14;
  } else {
    const gap = 16;
    const bw = (width - 40 - gap * 3) / 4;
    for (const [i, [t, ...l]] of s.steps.entries()) {
      const bx = colL + i * (bw + gap);
      body.push(box({ x: bx, y, w: bw, h: 72, kind: "worker", title: t, lines: l, size: 11, titleSize: 12.5 }));
      if (i < s.steps.length - 1) body.push(arrow([[bx + bw, y + 36], [bx + bw + gap, y + 36]], { color: C.worker.stroke }));
    }
    y += 72;
  }
  y += 16;
  if (narrow) {
    const [h, rest] = s.checks.split(lang === "ja" ? "：" : ": ");
    body.push(text(colL, y + 12, h + (lang === "ja" ? "：" : ":"), { size: 11.5, weight: 700, color: C.code.title }));
    const items = rest.split(lang === "ja" ? "・" : ", ");
    items.forEach((it, i) => body.push(text(colL + 12, y + 30 + i * 17, `・${it}`.replace(/^・/, lang === "ja" ? "・" : "• "), { size: 11.5, color: C.code.title, maxWidth: width - 30 })));
    y += 30 + items.length * 17;
  } else {
    body.push(pill(width / 2, y, s.checks, { kind: "code", anchor: "middle", size: 12 }));
    y += 26;
  }
  return svg({ width, height: y + 10, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function files(lang, narrow = false) {
  const s = S[lang].files;
  const width = narrow ? NW : W;
  const lx = 10;
  const lw = narrow ? 190 : 330;
  const rw = narrow ? 170 : 300;
  const rxx = width - 10 - rw;
  const rowH = narrow ? 34 : 40;
  const left = [
    "1_Thinking.md",
    "2_BIF.md",
    "4_Connection.md",
    "3_UC.md",
    "6_FinalReport.md",
    "5_Report.md",
    "3_FinalFRG.md",
    "4_FunctionDetails.md",
    "5_Verification.md",
    "1_InitialDecomposition.md",
    "2_OptimizedFRG.md",
    "phases/CSV.md",
  ];
  const targets = {
    "1_Thinking.md": ["decision_log.md"],
    "2_BIF.md": ["references.json", "connections.json"],
    "4_Connection.md": ["connections.json"],
    "3_UC.md": ["uc.json"],
    "6_FinalReport.md": ["report.md"],
    "5_Report.md": ["report.md"],
    "3_FinalFRG.md": ["frg.json"],
    "4_FunctionDetails.md": ["frg.json"],
    "5_Verification.md": ["removed"],
    "1_InitialDecomposition.md": ["removed"],
    "2_OptimizedFRG.md": ["removed"],
    "phases/CSV.md": ["removed"],
  };
  const body = [];
  let y = 10;
  body.push(header(lx, y, lw, s.v1, C.v1));
  body.push(header(rxx, y, rw, s.v11, V11));
  y += 44;
  const top = y;
  const ly = {};
  for (const [i, f] of left.entries()) {
    const cy = top + i * rowH;
    ly[f] = cy + 14;
    const removed = targets[f][0] === "removed";
    body.push(chip(lx, cy, lw, f, { kind: removed ? "plain" : "worker", dashed: removed, note: narrow ? "" : s.notes[f] ?? "", noteColor: C.muted }));
  }
  const leftBottom = top + left.length * rowH - (rowH - 28);
  // right boxes centred on their sources
  const rightOrder = ["decision_log.md", "references.json", "connections.json", "uc.json", "report.md", "frg.json"];
  const ry = {};
  let prev = top - 100;
  for (const r of rightOrder) {
    const srcs = left.filter((f) => targets[f].includes(r)).map((f) => ly[f]);
    let cy = srcs.reduce((a, b) => a + b, 0) / srcs.length - 14;
    cy = Math.max(cy, prev + 34);
    ry[r] = cy;
    prev = cy;
    const kind = r.endsWith(".md") ? "warn" : "code";
    body.push(chip(rxx, cy, rw, r, { kind, note: narrow ? "" : s.notes[r] ?? "", noteColor: kind === "warn" ? C.warn.title : C.code.title }));
  }
  const remTop = ly["5_Verification.md"] - 14;
  const remH = leftBottom - remTop;
  body.push(
    `<rect x="${rxx}" y="${remTop}" width="${rw}" height="${remH}" rx="8" fill="${C.bad.fill}" stroke="${C.bad.stroke}" stroke-width="1.3" stroke-dasharray="5 3"/>`,
  );
  body.push(text(rxx + rw / 2, remTop + remH / 2 + 5, s.removed, { size: 14, weight: 700, color: C.bad.title, anchor: "middle" }));
  const midX = (lx + lw + rxx) / 2;
  for (const f of left) {
    for (const t of targets[f]) {
      const y0 = ly[f];
      const y1 = t === "removed" ? y0 : ry[t] + 14;
      const color = t === "removed" ? C.bad.stroke : t.endsWith(".md") ? C.warn.stroke : C.code.stroke;
      const off = f === "2_BIF.md" && t === "connections.json" ? 8 : 0;
      body.push(arrow([[lx + lw, y0], [midX + off, y0], [midX + off, y1], [rxx, y1]], { color, dashed: t === "removed" }));
    }
  }
  return svg({ width, height: leftBottom + 14, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function tokens(lang, narrow = false) {
  const s = S[lang].tokens;
  const width = narrow ? NW : W;
  const x0 = narrow ? 76 : 96;
  const barMax = narrow ? 250 : 560;
  const max = 6000;
  const scale = (v) => (v / max) * barMax;
  const colors = { "AGENTS.md": "#94a3b8", "HCD.md": C.v1, "FRG.md": C.agent.stroke };
  const rows = [
    [["AGENTS.md", 721], ["HCD.md", 1296]],
    [["AGENTS.md", 1241], ["HCD.md", 3674]],
    [["AGENTS.md", 721], ["HCD.md", 1296], ["FRG.md", 1036]],
    [["AGENTS.md", 1241], ["HCD.md", 3674], ["FRG.md", 1064]],
  ];
  const body = [];
  const top = 34;
  const rowH = 44;
  const bottom = top + rows.length * rowH + (narrow ? 0 : 8);
  for (let t = 0; t <= max; t += 1000) {
    const x = x0 + scale(t);
    body.push(`<line x1="${x}" y1="${top - 6}" x2="${x}" y2="${bottom}" stroke="#e2e8f0"/>`);
    if (!narrow || t % 2000 === 0) body.push(text(x, bottom + 16, `${t / 1000}k`, { size: 11, color: C.faint, anchor: "middle" }));
  }
  body.push(text(x0 + barMax, bottom + 32, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  rows.forEach((segs, i) => {
    const y = top + i * rowH + (i >= 2 && !narrow ? 8 : 0);
    const is11 = i % 2 === 1;
    body.push(text(x0 - 10, y + 17, s.rows[i], { size: 12.5, weight: 700, color: is11 ? "#115e59" : C.text, anchor: "end" }));
    let acc = 0;
    for (const [name, v] of segs) {
      body.push(`<rect x="${(x0 + scale(acc)).toFixed(1)}" y="${y}" width="${scale(v).toFixed(1)}" height="24" fill="${colors[name]}" stroke="#ffffff" stroke-width="1"/>`);
      if (!narrow && scale(v) > 56) body.push(text(x0 + scale(acc) + scale(v) / 2, y + 16.5, v.toLocaleString("en-US"), { size: 11, color: "#ffffff", anchor: "middle", weight: 600 }));
      acc += v;
    }
    body.push(text(x0 + scale(acc) + 8, y + 17, acc.toLocaleString("en-US"), { size: 12.5, weight: 700, color: is11 ? "#115e59" : C.text }));
  });
  // legend
  const lg = legendRows(
    [
      ["plain", "AGENTS.md"],
      ["worker", "HCD.md"],
      ["agent", "FRG.md"],
    ],
    bottom + (narrow ? 58 : 54),
    width,
  ).svg.replace(/fill="#ffffff" stroke="#cbd5e1"/, `fill="${colors["AGENTS.md"]}" stroke="${colors["AGENTS.md"]}"`)
    .replace(new RegExp(`fill="${C.worker.fill}" stroke="${C.worker.stroke}"`), `fill="${C.v1}" stroke="${C.v1}"`)
    .replace(new RegExp(`fill="${C.agent.fill}" stroke="${C.agent.stroke}"`), `fill="${C.agent.stroke}" stroke="${C.agent.stroke}"`);
  body.push(lg);
  body.push(text(narrow ? 10 : x0, 18, s.note, { size: 12.5, weight: 600, color: C.text, maxWidth: width - 20 }));
  return svg({ width, height: bottom + (narrow ? 70 : 66), title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const HARNESS_V1_1_FIGURES = {
  "harness-v1-1-overview": [overview, (lang) => overview(lang, true)],
  "harness-v1-1-v1-flow": [v1Flow, (lang) => v1Flow(lang, true)],
  "harness-v1-1-v11-flow": [v11Flow, (lang) => v11Flow(lang, true)],
  "harness-v1-1-uc-naming": [naming, (lang) => naming(lang, true)],
  "harness-v1-1-files": [files, (lang) => files(lang, true)],
  "harness-v1-1-instruction-tokens": [tokens, (lang) => tokens(lang, true)],
};
