// Figures of docs/07_CoBRAC_Harness_v1_1_to_v2*.md (harness v1.1 → v2). Rendered by docs-figures.mjs.
import { C, NW, arrow, badge, box, chip, group, header, legendLine, pill, svg, text, textWidth } from "./docs-figures-lib.mjs";

const W = 860;
const V11 = "#0d9488";
const V2 = "#4338ca";

// Instruction tokens (o200k_base) of the prompt files at v0.8.1 and v0.13.0.
const TOK = {
  v11: { agents: 1241, hcd: 3674, frg: 1064 },
  v2: { agents: 2171, hcd: 5974, frg: 1361, research: 1450, researchMode: 336 },
};

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
    pipeline: {
      title: "パイプラインの比較：v1.1 と v2",
      desc: "v1.1 は HCD → FRG → CSV → xlsx を 1 回ずつ進む。受理したフェーズには戻らず、FRG の段で HCD を直しても検査されず、HCD と FRG の整合は見ない。v2 は任意の調査ステップ（既定でオン）から始まり、HCD → FRG の後に整合チェック X1〜X9 を記録する。X1〜X3・X8 があれば調整ターンを 1 回送り、エージェントは FRG を直すか、HCD の手順 3 に戻って UC を分ける・足す。HCD が変わったら HCD の検証をやり直してから CSV に進み、xlsx は CoBRAC-v1-1 と Template-v2-2 の 2 種類を作る。",
      aHead: "v1.1（アプリ 0.8）：1 回ずつ前へ進む",
      bHead: "v2（アプリ 0.13〜）：戻り道と整合チェック",
      noResearch: "調査なし",
      a: [
        { title: "HCD", lines: ["8 手順", "検証 → 受理"] },
        { title: "FRG", lines: ["6 手順", "検証 → 受理"] },
        { title: "CSV", lines: ["JSON から", "コードで生成"] },
        { title: "xlsx", lines: ["CoBRAC-v1-0", "1 種類"] },
      ],
      noReturn: "受理したら戻らない",
      aNotes: ["FRG は「完成した HCD」から作る。HCD に戻る道がない", "FRG の段で HCD を直しても、その変更は検査されない", "HCD と FRG が合っているかは見ない"],
      b: [
        { title: "調査ステップ", lines: ["既定でオン", "`research.json`"] },
        { title: "HCD", lines: ["BRA の値", "文献・引用文"] },
        { title: "FRG", lines: ["手順 3 に", "HCD への戻り道"] },
        { title: "整合チェック", lines: ["X1〜X9", "（記録と調整）"] },
        { title: "CSV", lines: ["JSON から", "コードで生成"] },
        { title: "xlsx × 2", lines: ["CoBRAC-v1-1", "Template-v2-2"] },
      ],
      adj: { title: "調整ターン（1 回）", lines: ["どちらを直すかを証拠で決め、", "revisions 節に記録する"] },
      trigger: ["X1〜X3・X8", "があれば"],
      back: ["UC を分ける・足す", "（粗い単位は Collection）"],
      backNarrow: ["UC を分ける・足す", "（粗い単位は", "Collection に）"],
      fixFrg: "FRG を直す",
      toCsv: ["再検証して", "CSV へ"],
      reval: "HCD が変わったら HCD の検証をやり直す（`phase_baseline.json`）",
      legend: ["① HCD への戻り道と調整ターン", "② 後段での HCD の再検証", "③ HCD↔FRG 整合チェック"],
    },
    adjustment: {
      title: "調整ターンと HCD への戻り道",
      desc: "FRG の段が終わると、ワーカーは checkCross で HCD と FRG の整合を調べ、cross_check.json に記録する。X1・X2・X3・X8 がなければ記録だけで CSV に進む（X4〜X6・X9 は数えるだけ）。あれば実行ごとに 1 回、調整ターンを送る。エージェントは証拠に基づいて、FRG を直す（TLF の分解を細かくする、GN の Interface を直す）、HCD の手順 3 に戻る（UC を分ける・足す、粗い単位は Collection、新しい接続には文献と引用文）、直さずに理由を残す、のどれかを選び、decision_log.md の HCD-FRG revisions 節に 1 行 1 変更でタグ付きで書く。HCD が変わっていれば、ワーカーは HCD の検証を全部やり直してから CSV と xlsx を作る。X9（粒度）はまだ調整のきっかけにしていない。",
      end: { title: "FRG の段が終わる", lines: ["受理でも、警告を残した場合でも"] },
      cross: { title: "整合チェック（`checkCross`）", lines: ["結果は `cross_check.json` とチャットの件数"] },
      q: "X1・X2・X3・X8 がある？",
      no: "ない",
      yes: "ある",
      recordOnly: { title: "記録だけ", lines: ["X4〜X6・X9 は", "数えるだけ", "そのまま CSV へ"] },
      x9: { title: "X9（粒度）", lines: ["記録だけ。調整の", "きっかけにするかは未定"] },
      turn: { title: "調整ターン（実行ごとに 1 回）", lines: ["所見の一覧と各検査の意味を渡す", "「どちらを直すかを証拠で決めよ」"] },
      options: [
        { title: "FRG を直す", lines: ["TLF の分解を細かくする", "GN の Interface を直す", "（証拠がないときもこちら）"] },
        { title: "HCD に戻る（手順 3）", lines: ["UC を分ける・足す", "粗い単位は Collection にする", "新しい接続には文献と引用文"] },
        { title: "直さない", lines: ["食い違いとその理由を", "`[kept]` の行に書く", ""] },
      ],
      any: "どれを選んでも記録する",
      log: { title: "`decision_log.md` の `## HCD-FRG revisions` 節", lines: ["1 行 1 変更。タグ：`[FRG->HCD]` `[HCD->FRG]` `[instruction]` `[kept]`"] },
      logNarrow: { title: "`## HCD-FRG revisions` 節", lines: ["`decision_log.md` に 1 行 1 変更", "`[FRG->HCD]` `[HCD->FRG]`", "`[instruction]` `[kept]`"] },
      reval: { title: "HCD が変わったら HCD の検証を全部やり直す", lines: ["命名・RCS・BRA の値・文献・引用文（`phase_baseline.json` のハッシュで判定）"] },
      revalNarrow: { title: "HCD が変わったら全部を再検証", lines: ["命名・RCS・BRA の値・文献・引用文", "（`phase_baseline.json` のハッシュ）"] },
      csv: { title: "CSV → xlsx", lines: [] },
    },
    literature: {
      title: "文献の流れ：生成中の lit ツールと、ワーカーの照合",
      desc: "生成中、エージェントは lit MCP サーバーの search_pubmed、search_europepmc、get_abstract、find_sentences で論文を探し、抄録や全文から文を取る。Europe PMC が答えないときは、書誌と抄録を PubMed から、全文を PMC（NCBI BioC）から取り、結果の note に落ちたサービスを書く。通信は 15 秒で打ち切り、1・2・4 秒おいて 3 回まで再試行し、3 回続けて失敗したホストは 5 分休み、呼び出しの間隔を空ける。エージェントは references.json と connections.json（論文の原文の引用）、調査モードでは research.json を書く。ワーカーは DOI を Crossref（なければ doi.org）、PMID を PubMed で照合し、第一著者・年・題名を確かめて reference_check.json に、引用文を全文（Europe PMC、PMC BioC）か抄録と照合して quote_check.json に記録する。mismatch と not_found は、一番近い箇所とリンクを添えて修正依頼として返し、照合できないだけ（unverified）なら止めない。",
      agentHead: "生成中：エージェントの `lit` ツール",
      tools: [
        ["search_pubmed", "PubMed を検索"],
        ["search_europepmc", "Europe PMC を検索"],
        ["get_abstract", "書誌と抄録"],
        ["find_sentences", "全文から語を含む文"],
      ],
      fallback: { title: "Europe PMC が答えないとき", lines: ["書誌・抄録は PubMed、全文は PMC（NCBI BioC）", "結果の `note` に落ちたサービスを書く"] },
      guard: { title: "通信の守り（ワーカーの照合と共通）", lines: ["15 秒で打ち切り、1・2・4 秒おいて 3 回まで再試行", "3 回続けて失敗したホストは 5 分休む", "呼び出しの間隔を空ける（200 ms・350 ms）"] },
      writes: { title: "エージェントが書くもの", lines: ["`references.json`（DOI・PMID・文献の種類）", "`connections.json`（論文の原文の引用）", "調査モードでは `research.json`"] },
      workerHead: "検証：ワーカー",
      ref: { title: "文献の照合 → `reference_check.json`", lines: ["DOI → Crossref（なければ doi.org）", "PMID → PubMed", "第一著者・年（±1）・題名が合うか"] },
      quote: { title: "引用文の照合 → `quote_check.json`", lines: ["全文：Europe PMC → PMC（BioC）", "全文がなければ抄録（4 つのサービス）", "空白・記号・引用記号を無視、類似度 0.9 以上"] },
      back: { title: "エージェントに返すもの", lines: ["`mismatch`・`not_found` は修正依頼", "（一番近い箇所と論文のリンクを添える）", "照合できないだけなら止めない（`unverified`）"] },
    },
    relation: {
      title: "BRA 形式の接続：sCID / rCID relation と 1 行 1 文献",
      desc: "接続の両端について、UC と論文が報告した回路の関係を relation で書き、論文上の名前を Notation 列に書く。< は UC が論文の回路の一部（UC A37lv@L と論文の fusiform gyrus）、= は同じ（IFG@L と inferior frontal gyrus）、> は UC が論文の細かい回路を含む（FuG@L と visual word form area）。v1.1 は relation がいつも = で、Notation は Circuit ID の写し、1 行に複数の文献を連結していた。v2 は 1 行 1 文献で、同じ送り手と受け手を文献ごとに繰り返し、それぞれに Taxon、計測法、引用文を書く。",
      head: "UC と論文の回路の関係（relation）",
      cases: [
        { rel: "<", uc: "`A37lv@L`", paper: "fusiform gyrus", cap: ["UC は論文の", "回路の一部"], kind: "lt" },
        { rel: "=", uc: "`IFG@L`", paper: "inferior frontal gyrus", cap: ["UC と論文の", "回路が同じ"], kind: "eq" },
        { rel: ">", uc: "`FuG@L`", paper: "visual word form area", cap: ["UC が論文の細かい", "回路を含む"], kind: "gt" },
      ],
      ucLabel: "UC",
      paperLabel: "論文",
      notation: "論文の名前は Notation 列に書く（`visual word form area` など）",
      rowsHead: "1 行 1 文献",
      v11: "v1.1",
      v2: "v2",
      v11Row: ["`FuG@L` → `IFG@L`", "`[A, 2014]; [B, 2017]`", "relation `=`"],
      v2Rows: [
        ["`FuG@L` → `IFG@L`", "`[A, 2014]`", "Human・fMRI・引用文"],
        ["`FuG@L` → `IFG@L`", "`[B, 2017]`", "Human・DW-MRI・引用文"],
      ],
      rowsNote: "同じ送り手 → 受け手を文献ごとに繰り返す。グラフの辺は 1 本のまま",
    },
    trial: {
      title: "言語野の試行：回単位の UC を分けると FRG の分解が変わった",
      desc: "非語の音読（左の読字ネットワーク）の HCD と FRG。前（0.11.0、ufwwj0jg-1）は ROI 内の UC が FuG@L、IPL@L、IFG@L（回全体、BNAG）と A22c@L の 4 つで、FRG は TLF の下に正書法と頭頂の分析、音韻の組み立ての 2 つの GN だけ、深さ 2。X9 は 3 件。後（戻り道の試行、ufwwj0jg-5）は、FuG@L を A37lv@L と A20rv@L、IPL@L を角回と縁上回、IFG@L を弁蓋部と三角部に分け、元の回は Collection になった（UC 7、Collection 3）。FRG は腹側の正書法分析、側頭頭頂の音韻分析（その下に下頭頂の音韻支援）、前頭の音韻出力の 4 つの GN、深さ 3 になった。X9 は 0 件。",
      before: "前：0.11.0（`ufwwj0jg-1`）",
      after: "後：戻り道の試行（`ufwwj0jg-5`）",
      hcd: "HCD：ROI 内の UC",
      frg: "FRG",
      gyrus: "回全体（`BNAG`）",
      area: "野（`BNA:75`）",
      collection: "Collection",
      tlf: "TLF：非語の音読",
      beforeTree: [
        [1, "GN：正書法と頭頂の分析"],
        [2, ["`FuG@L`", "`IPL@L`"]],
        [1, "GN：音韻の組み立て"],
        [2, ["`A22c@L`", "`IFG@L`"]],
      ],
      afterTree: [
        [1, "GN：腹側の正書法分析"],
        [2, ["`A37lv@L`", "`A20rv@L`"]],
        [1, "GN：側頭頭頂の音韻分析"],
        [2, ["`A22c@L`"]],
        [2, "GN：下頭頂の音韻支援"],
        [3, ["`IPL@L(AnG)`", "`IPL@L(SMG)`"]],
        [1, "GN：前頭の音韻出力"],
        [2, ["`IFG@L(opercular)`", "`IFG@L(triangular)`"]],
      ],
      beforeStats: "UC 4・Collection 0・GN 2・深さ 2・X9 3 件",
      x9Head: "X1〜X8 はすべて 0 件",
      x9Note: ["回全体の UC 3 つが Sender のまま。", "この粗さを捉えたのは X9（粒度）だけ"],
      afterStats: "UC 7・Collection 3・GN 4・深さ 3・X9 0 件",
    },
    metrics: {
      title: "言語野の 3 つの実行の比較：v0、0.11.0、戻り道の試行",
      desc: "同じ ROI と TLF（非語の音読）の 3 つの実行。ROI 内の UC は v0 が 5、0.11.0 が 4、試行が 7。Collection は 0、0、3。接続の行は 17、14、21。文献は 19、17、21。照合済みの引用文は 0、14、21。FRG の GN は 8、2、4。FRG の深さは 3、2、3。X9 は v0 では測れず、0.11.0 が 3、試行が 0。付録 D の自動判定で違反したコードは v0 が 7、0.11.0 が 1、試行は測っていない。v0 の UC は自由な名前で、SABRA の単位に固定していない。",
      series: ["v0（自由な名前）", "0.11.0", "戻り道の試行"],
      rows: [
        ["ROI 内の UC", [5, 4, 7]],
        ["Collection", [0, 0, 3]],
        ["接続の行", [17, 14, 21]],
        ["文献", [19, 17, 21]],
        ["照合済みの引用文", [0, 14, 21]],
        ["FRG の GN", [8, 2, 4]],
        ["FRG の深さ", [3, 2, 3]],
        ["X9（粒度）の件数", [null, 3, 0]],
        ["付録 D の違反コード", [7, 1, null]],
      ],
      na: "測っていない",
    },
    tokens: {
      title: "各段で、リクエストのたびに文脈に載っている指示の量（v1.1 と v2）",
      desc: `調査ステップは v2 だけで ${TOK.v2.agents + TOK.v2.research} トークン（AGENTS.md ${TOK.v2.agents} + RESEARCH.md ${TOK.v2.research}）。HCD は v1.1 が ${TOK.v11.agents + TOK.v11.hcd}、v2 が ${TOK.v2.agents + TOK.v2.hcd}（調査モードではさらに RESEARCH.md と research_mode.md の ${TOK.v2.research + TOK.v2.researchMode}）。FRG は v1.1 が ${TOK.v11.agents + TOK.v11.hcd + TOK.v11.frg}、v2 が ${TOK.v2.agents + TOK.v2.hcd + TOK.v2.frg}（調査モードでは +${TOK.v2.research + TOK.v2.researchMode}）。`,
      rows: ["調査 v2", "HCD v1.1", "HCD v2", "FRG v1.1", "FRG v2"],
      unit: "トークン",
      note: "増えた分の大半は `HCD.md`（BRA の値の規則・Collection）と `AGENTS.md`",
      noteNarrow: "増えた分の大半は `HCD.md` と `AGENTS.md`",
      researchSeg: "調査モードの分",
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
    pipeline: {
      title: "Pipeline comparison: v1.1 and v2",
      desc: "v1.1 runs HCD → FRG → CSV → xlsx once each. It never goes back to an accepted phase, HCD changes made during the FRG are not checked, and the consistency of HCD and FRG is not looked at. v2 starts with an optional research step (on by default) and records the consistency checks X1–X9 after HCD → FRG. When X1–X3 or X8 are found it sends one adjustment turn, in which the agent fixes the FRG or goes back to HCD step 3 to split or add UCs. A changed HCD is validated again before the CSV step, and two workbooks are written: CoBRAC-v1-1 and Template-v2-2.",
      aHead: "v1.1 (app 0.8): forward, once each",
      bHead: "v2 (app 0.13+): back-edge and consistency checks",
      noResearch: "no research",
      a: [
        { title: "HCD", lines: ["8 steps", "check → accept"] },
        { title: "FRG", lines: ["6 steps", "check → accept"] },
        { title: "CSV", lines: ["built from", "JSON in code"] },
        { title: "xlsx", lines: ["CoBRAC-v1-0", "one workbook"] },
      ],
      noReturn: "no way back once accepted",
      aNotes: ["The FRG starts from “the finished HCD”; no way back to it", "HCD changes made during the FRG step are not checked", "Nothing checks that the HCD and the FRG agree"],
      b: [
        { title: "Research", lines: ["on by default", "`research.json`"] },
        { title: "HCD", lines: ["BRA values", "refs, quotes"] },
        { title: "FRG", lines: ["step 3 may go", "back to HCD"] },
        { title: "Consistency", lines: ["X1–X9", "(record, adjust)"] },
        { title: "CSV", lines: ["built from", "JSON in code"] },
        { title: "xlsx × 2", lines: ["CoBRAC-v1-1", "Template-v2-2"] },
      ],
      adj: { title: "Adjustment turn (once)", lines: ["decide from evidence what to fix;", "record it under revisions"] },
      trigger: ["if X1–X3", "or X8"],
      back: ["split or add UCs", "(coarse unit → Collection)"],
      backNarrow: ["split or add UCs", "(coarse unit →", "Collection)"],
      fixFrg: "fix the FRG",
      toCsv: ["re-check,", "then CSV"],
      reval: "A changed HCD is validated again (`phase_baseline.json`)",
      legend: ["① back-edge to the HCD, adjustment turn", "② HCD re-validated in later steps", "③ HCD–FRG consistency checks"],
    },
    adjustment: {
      title: "The adjustment turn and the back-edge to the HCD",
      desc: "When the FRG step ends, the worker checks the consistency of HCD and FRG with checkCross and records it in cross_check.json. Without X1, X2, X3 or X8 it only records and goes on to the CSVs (X4–X6 and X9 are only counted). With them it sends one adjustment turn per run. From the evidence, the agent fixes the FRG (finer TLF decomposition, corrected GN interfaces), goes back to HCD step 3 (split or add UCs, the coarse unit becomes a Collection, new connections need references and quotes), or keeps the difference and says why, and writes one tagged line per change in the HCD-FRG revisions section of decision_log.md. If the HCD changed, the worker runs every HCD check again before building the CSVs and xlsx. X9 (granularity) does not trigger the adjustment yet.",
      end: { title: "The FRG step ends", lines: ["accepted, or with warnings left"] },
      cross: { title: "Consistency check (`checkCross`)", lines: ["kept in `cross_check.json`; counts in the chat"] },
      q: "Any X1, X2, X3 or X8?",
      no: "no",
      yes: "yes",
      recordOnly: { title: "Record only", lines: ["X4–X6 and X9", "are counted;", "on to the CSVs"] },
      x9: { title: "X9 (granularity)", lines: ["record only; whether it", "should trigger: open"] },
      turn: { title: "Adjustment turn (once per run)", lines: ["the findings and what each check means", "“decide from evidence which side to fix”"] },
      options: [
        { title: "Fix the FRG", lines: ["decompose the TLF more finely", "correct GN interfaces", "(also when evidence is missing)"] },
        { title: "Back to HCD step 3", lines: ["split or add UCs", "the coarse unit → Collection", "new connections need references"] },
        { title: "Keep it", lines: ["write the difference and", "the reason as `[kept]`", ""] },
      ],
      any: "every choice is recorded",
      log: { title: "`## HCD-FRG revisions` in `decision_log.md`", lines: ["one line per change, tagged `[FRG->HCD]` `[HCD->FRG]` `[instruction]` `[kept]`"] },
      logNarrow: { title: "`## HCD-FRG revisions`", lines: ["one line per change in `decision_log.md`", "`[FRG->HCD]` `[HCD->FRG]`", "`[instruction]` `[kept]`"] },
      reval: { title: "A changed HCD gets every HCD check again", lines: ["naming, RCS, BRA values, references, quotes (hash in `phase_baseline.json`)"] },
      revalNarrow: { title: "A changed HCD: every check again", lines: ["naming, RCS, BRA values, refs, quotes", "(hash in `phase_baseline.json`)"] },
      csv: { title: "CSV → xlsx", lines: [] },
    },
    literature: {
      title: "Literature flow: lit tools during generation, checks by the worker",
      desc: "During generation the agent searches papers and takes sentences from abstracts and full texts with the lit MCP server: search_pubmed, search_europepmc, get_abstract and find_sentences. When Europe PMC does not answer, the record and abstract come from PubMed and the full text from PMC (NCBI BioC), and the result notes which service failed. Requests time out after 15 s, are retried up to 3 times after 1, 2 and 4 s, a host that fails 3 times in a row is skipped for 5 minutes, and calls are spaced. The agent writes references.json and connections.json (verbatim quotes), and research.json in research mode. The worker looks up DOIs in Crossref (or doi.org) and PMIDs in PubMed, checks first author, year and title (reference_check.json), and compares each quote with the full text (Europe PMC, PMC BioC) or abstract (quote_check.json). mismatch and not_found go back as fix prompts with the closest passage and a link; a paper that cannot be checked (unverified) never stops the run.",
      agentHead: "During generation: the agent's `lit` tools",
      tools: [
        ["search_pubmed", "search PubMed"],
        ["search_europepmc", "search Europe PMC"],
        ["get_abstract", "record and abstract"],
        ["find_sentences", "full-text sentences"],
      ],
      fallback: { title: "When Europe PMC does not answer", lines: ["record, abstract from PubMed; full text from PMC", "(NCBI BioC); `note` names the failed service"] },
      guard: { title: "Request guards (shared with the checks)", lines: ["15 s timeout, up to 3 retries after 1, 2, 4 s", "a host failing 3 times in a row rests 5 min", "calls are spaced (200 ms, 350 ms)"] },
      writes: { title: "What the agent writes", lines: ["`references.json` (DOI, PMID, literature type)", "`connections.json` (verbatim quotes)", "`research.json` in research mode"] },
      workerHead: "Checks: the worker",
      ref: { title: "References → `reference_check.json`", lines: ["DOI → Crossref (else doi.org)", "PMID → PubMed", "first author, year (±1), title must match"] },
      quote: { title: "Quotes → `quote_check.json`", lines: ["full text: Europe PMC → PMC (BioC)", "else the abstract (four services)", "spacing, punctuation ignored; similarity ≥ 0.9"] },
      back: { title: "What goes back to the agent", lines: ["`mismatch`, `not_found`: fix prompt", "(with the closest passage and a link)", "cannot check: never blocks (`unverified`)"] },
    },
    relation: {
      title: "BRA connections: sCID / rCID relation and one reference per row",
      desc: "For both ends of a connection, the relation says how the UC relates to the circuit the paper reports, and the Notation column keeps the paper's name. < means the UC is part of the paper's circuit (UC A37lv@L, paper: fusiform gyrus), = the same (IFG@L and inferior frontal gyrus), > the UC contains the paper's finer circuit (FuG@L and visual word form area). In v1.1 the relation was always = with the Circuit ID copied as notation, and one row joined several references. In v2 each row cites one paper: the same sender and receiver are repeated per paper, each with its taxon, method and quote.",
      head: "How the UC relates to the paper's circuit",
      cases: [
        { rel: "<", uc: "`A37lv@L`", paper: "fusiform gyrus", cap: ["the UC is part of", "the paper's circuit"], kind: "lt" },
        { rel: "=", uc: "`IFG@L`", paper: "inferior frontal gyrus", cap: ["UC and paper", "name the same"], kind: "eq" },
        { rel: ">", uc: "`FuG@L`", paper: "visual word form area", cap: ["the UC contains", "a finer circuit"], kind: "gt" },
      ],
      ucLabel: "UC",
      paperLabel: "paper",
      notation: "The paper's name goes to Notation (e.g. `visual word form area`)",
      rowsHead: "One reference per row",
      v11: "v1.1",
      v2: "v2",
      v11Row: ["`FuG@L` → `IFG@L`", "`[A, 2014]; [B, 2017]`", "relation `=`"],
      v2Rows: [
        ["`FuG@L` → `IFG@L`", "`[A, 2014]`", "Human, fMRI, quote"],
        ["`FuG@L` → `IFG@L`", "`[B, 2017]`", "Human, DW-MRI, quote"],
      ],
      rowsNote: "The same sender → receiver repeats per paper; the graph keeps one edge",
    },
    trial: {
      title: "Language-area trial: splitting gyrus-level UCs changed the FRG",
      desc: "HCD and FRG of nonword reading (left reading network). Before (0.11.0, ufwwj0jg-1) the ROI had 4 UCs, FuG@L, IPL@L, IFG@L (whole gyri, BNAG) and A22c@L, and the FRG had two GNs under the TLF, orthographic–parietal analysis and phonological assembly, depth 2; X9 found 3. After (back-edge trial, ufwwj0jg-5) FuG@L was split into A37lv@L and A20rv@L, IPL@L into angular and supramarginal gyrus, IFG@L into pars opercularis and triangularis, and the gyri became Collections (7 UCs, 3 Collections). The FRG has four GNs, ventral orthographic analysis, temporo-parietal phonological analysis (with inferior parietal phonological support below it) and frontal phonological output, depth 3; X9 found 0.",
      before: "Before: 0.11.0 (`ufwwj0jg-1`)",
      after: "After: back-edge trial (`ufwwj0jg-5`)",
      hcd: "HCD: ROI-internal UCs",
      frg: "FRG",
      gyrus: "gyrus (`BNAG`)",
      area: "area (`BNA:75`)",
      collection: "Collection",
      tlf: "TLF: nonword reading",
      beforeTree: [
        [1, "GN: orthographic–parietal analysis"],
        [2, ["`FuG@L`", "`IPL@L`"]],
        [1, "GN: phonological assembly"],
        [2, ["`A22c@L`", "`IFG@L`"]],
      ],
      afterTree: [
        [1, "GN: ventral orthographic analysis"],
        [2, ["`A37lv@L`", "`A20rv@L`"]],
        [1, "GN: temporo-parietal phonology"],
        [2, ["`A22c@L`"]],
        [2, "GN: inferior parietal support"],
        [3, ["`IPL@L(AnG)`", "`IPL@L(SMG)`"]],
        [1, "GN: frontal phonological output"],
        [2, ["`IFG@L(opercular)`", "`IFG@L(triangular)`"]],
      ],
      beforeStats: "UCs 4, Collections 0, GNs 2, depth 2, X9 3",
      x9Head: "X1–X8: no findings at all",
      x9Note: ["Three whole-gyrus UCs stay senders;", "only X9 (granularity) caught this"],
      afterStats: "UCs 7, Collections 3, GNs 4, depth 3, X9 0",
    },
    metrics: {
      title: "Three runs of the language area: v0, 0.11.0 and the back-edge trial",
      desc: "Three runs with the same ROI and TLF (nonword reading). ROI-internal UCs: v0 5, 0.11.0 4, trial 7. Collections: 0, 0, 3. Connection rows: 17, 14, 21. References: 19, 17, 21. Checked quotes: 0, 14, 21. FRG GNs: 8, 2, 4. FRG depth: 3, 2, 3. X9 cannot be measured on v0; 0.11.0 3, trial 0. Appendix D codes violated in the automatic check: v0 7, 0.11.0 1, the trial not measured. v0's UCs are free names, not anchored on SABRA units.",
      series: ["v0 (free names)", "0.11.0", "back-edge trial"],
      rows: [
        ["ROI-internal UCs", [5, 4, 7]],
        ["Collections", [0, 0, 3]],
        ["Connection rows", [17, 14, 21]],
        ["References", [19, 17, 21]],
        ["Checked quotes", [0, 14, 21]],
        ["FRG group nodes", [8, 2, 4]],
        ["FRG depth", [3, 2, 3]],
        ["X9 (granularity)", [null, 3, 0]],
        ["Appendix D violations", [7, 1, null]],
      ],
      na: "not measured",
    },
    tokens: {
      title: "Instructions in the context of every request, by step (v1.1 vs v2)",
      desc: `The research step exists only in v2: ${TOK.v2.agents + TOK.v2.research} tokens (AGENTS.md ${TOK.v2.agents} + RESEARCH.md ${TOK.v2.research}). HCD: v1.1 ${TOK.v11.agents + TOK.v11.hcd}, v2 ${TOK.v2.agents + TOK.v2.hcd} (research mode adds RESEARCH.md and research_mode.md, ${TOK.v2.research + TOK.v2.researchMode}). FRG: v1.1 ${TOK.v11.agents + TOK.v11.hcd + TOK.v11.frg}, v2 ${TOK.v2.agents + TOK.v2.hcd + TOK.v2.frg} (+${TOK.v2.research + TOK.v2.researchMode} in research mode).`,
      rows: ["Research v2", "HCD v1.1", "HCD v2", "FRG v1.1", "FRG v2"],
      unit: "tokens",
      note: "most of the increase: `HCD.md` (BRA value rules, Collections) and `AGENTS.md`",
      noteNarrow: "most of the increase: `HCD.md` and `AGENTS.md`",
      researchSeg: "research mode",
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

// ---------------------------------------------------------------------------

function laneHead(x, y, w, label, color) {
  return header(x, y, w, label, color);
}

function pipeline(lang, narrow = false) {
  const s = S[lang].pipeline;
  const width = narrow ? NW : W;
  const body = [];
  const green = C.code.stroke;
  let y = 10;

  // Lane A: v1.1
  body.push(laneHead(10, y, width - 20, s.aHead, V11));
  y += 42;
  const aKinds = ["agent", "agent", "code", "code"];
  let aBoxes;
  if (narrow) {
    const bw = 88;
    const gap = (width - 20 - 4 * bw) / 3;
    aBoxes = s.a.map((b, i) => ({ x: 10 + i * (bw + gap), y, w: bw, h: 36, title: b.title, lines: [] }));
  } else {
    const cw = 120;
    const gap = (width - 20 - 6 * cw) / 5;
    const col = (i) => 10 + i * (cw + gap);
    aBoxes = [1, 2, 4, 5].map((c, i) => ({ x: col(c), y, w: cw, h: 66, title: s.a[i].title, lines: s.a[i].lines }));
    body.push(text(col(0) + cw / 2, y + 38, s.noResearch, { size: 12, color: C.faint, anchor: "middle", italic: true }));
  }
  aBoxes.forEach((b, i) => {
    body.push(box({ ...b, kind: aKinds[i], size: 11.5, titleSize: 13, align: "middle" }));
    if (i < aBoxes.length - 1) {
      const n = aBoxes[i + 1];
      body.push(arrow([[b.x + b.w, b.y + b.h / 2], [n.x, n.y + n.h / 2]], { color: C.line }));
    }
  });
  if (!narrow) {
    const f = aBoxes[1];
    const c = aBoxes[2];
    body.push(text((f.x + f.w + c.x) / 2, f.y + f.h / 2 - 8, s.noReturn, { size: 11, color: C.bad.title, anchor: "middle", maxWidth: c.x - f.x - f.w + 20 }));
    body.push(badge((f.x + f.w + c.x) / 2, f.y + f.h / 2 + 16, 1));
    body.push(badge(f.x + f.w - 6, f.y + 2, 2));
    body.push(badge(c.x + c.w - 6, c.y + 2, 3));
  } else {
    body.push(badge(aBoxes[1].x + aBoxes[1].w - 6, aBoxes[1].y + 2, 2));
  }
  y = aBoxes[0].y + aBoxes[0].h + 22;
  s.aNotes.forEach((n, i) => {
    body.push(badge(22, y - 4, i + 1));
    body.push(text(40, y + 1, n, { size: narrow ? 11 : 12, color: C.bad.title, maxWidth: width - 50 }));
    y += 22;
  });
  y += 6;

  // Lane B: v2
  body.push(laneHead(10, y, width - 20, s.bHead, V2));
  y += 42;
  const bKinds = ["agent", "agent", "agent", "worker", "code", "code"];
  const top = y;
  if (!narrow) {
    const cw = 120;
    const gap = (width - 20 - 6 * cw) / 5;
    const col = (i) => 10 + i * (cw + gap);
    const bh = 66;
    s.b.forEach((b, i) => {
      body.push(box({ x: col(i), y: top, w: cw, h: bh, kind: bKinds[i], title: b.title, lines: b.lines, size: 11.5, titleSize: 13, align: "middle" }));
      if (i < 5) body.push(arrow([[col(i) + cw, top + bh / 2], [col(i + 1), top + bh / 2]], { color: C.line }));
    });
    const ay = top + bh + 58;
    const ax = col(2);
    const aw = col(3) + cw - col(2);
    const ah = 58;
    body.push(box({ x: ax, y: ay, w: aw, h: ah, kind: "agent", title: s.adj.title, lines: s.adj.lines, size: 11.5, titleSize: 13, align: "middle" }));
    // trigger: consistency → adjustment
    const c3 = col(3) + cw / 2;
    body.push(arrow([[c3, top + bh], [c3, ay]], { color: C.bad.stroke }));
    s.trigger.forEach((l, k) => body.push(text(c3 + 8, top + bh + 22 + k * 15, l, { size: 11, color: C.bad.title, maxWidth: col(4) + cw - c3 - 10 })));
    // adjustment → FRG
    const c2 = col(2) + cw / 2;
    body.push(arrow([[c2, ay], [c2, top + bh]], { color: C.agent.stroke }));
    body.push(text(c2 - 8, top + bh + 30, s.fixFrg, { size: 11, color: C.agent.title, anchor: "end", maxWidth: c2 - col(1) - 20 }));
    // back-edge: adjustment → HCD
    const c1 = col(1) + cw / 2;
    body.push(arrow([[ax, ay + ah / 2], [c1, ay + ah / 2], [c1, top + bh]], { color: C.agent.stroke, width: 2.2 }));
    s.back.forEach((l, k) => body.push(text(c1 - 10, ay + ah / 2 - 30 + k * 15, l, { size: 11.5, weight: k === 0 ? 700 : 400, color: C.agent.title, anchor: "end", maxWidth: c1 - 18 })));
    body.push(badge(ax + 4, ay + 2, 1, green));
    // adjustment → CSV
    const c4 = col(4) + cw / 2;
    body.push(arrow([[ax + aw, ay + ah / 2], [c4, ay + ah / 2], [c4, top + bh]], { color: C.line }));
    s.toCsv.forEach((l, k) => body.push(text(c4 + 8, ay + ah / 2 + 18 + k * 14, l, { size: 11, color: C.muted, maxWidth: width - c4 - 16 })));
    body.push(badge(col(3) + cw - 6, top + 2, 3, green));
    y = ay + ah + 18;
    body.push(badge(22, y + 12, 2, green));
    body.push(pill(40, y, s.reval, { kind: "code", size: 12 }));
    y += 40;
  } else {
    const cx = 10;
    const cw = 220;
    const tops = [];
    s.b.forEach((b, i) => {
      const h = 30 + b.lines.length * 16;
      tops.push({ y, h });
      body.push(box({ x: cx, y, w: cw, h, kind: bKinds[i], title: b.title, lines: b.lines, size: 11, titleSize: 12.5 }));
      if (i < 5) body.push(arrow([[cx + cw / 2, y + h], [cx + cw / 2, y + h + 18]], { color: C.line }));
      y += h + 18;
    });
    y -= 18;
    const rx = 262;
    const rw = width - 10 - rx;
    const t3 = tops[3];
    const ay = t3.y - 6;
    const ah = 104;
    const lines = lang === "ja" ? ["どちらを直すかを", "証拠で決め、", "revisions 節に記録"] : ["decide from evidence", "what to fix; record", "it under revisions"];
    body.push(box({ x: rx, y: ay, w: rw, h: ah, kind: "agent", title: s.adj.title, lines, size: 11, titleSize: 11.5 }));
    body.push(arrow([[cx + cw, t3.y + t3.h / 2], [rx, t3.y + t3.h / 2]], { color: C.bad.stroke }));
    body.push(text((cx + cw + rx) / 2, t3.y + t3.h / 2 - 8, "X1–3, X8", { size: 9.5, color: C.bad.title, anchor: "middle" }));
    // back-edge to HCD
    const t1 = tops[1];
    const bx = rx + 26;
    body.push(arrow([[bx, ay], [bx, t1.y + t1.h / 2], [cx + cw, t1.y + t1.h / 2]], { color: C.agent.stroke, width: 2.2 }));
    s.backNarrow.forEach((l, k) => body.push(text(bx + 8, t1.y + t1.h / 2 + 22 + k * 15, l, { size: 11, weight: k === 0 ? 700 : 400, color: C.agent.title, maxWidth: width - bx - 14 })));
    body.push(badge(rx + rw - 8, ay + 2, 1, green));
    // to CSV
    const t4 = tops[4];
    const dx = rx + rw / 2 + 20;
    body.push(arrow([[dx, ay + ah], [dx, t4.y + t4.h / 2], [cx + cw, t4.y + t4.h / 2]], { color: C.line }));
    s.toCsv.forEach((l, k) => body.push(text(dx + 8, ay + ah + 18 + k * 14, l, { size: 11, color: C.muted, maxWidth: width - dx - 14 })));
    body.push(badge(cx + cw - 8, t3.y + 2, 3, green));
    y += 18;
    const [r1, r2] = lang === "ja" ? ["HCD が変わったら HCD の検証をやり直す", "（`phase_baseline.json`）"] : ["A changed HCD is validated again", "(`phase_baseline.json`)"];
    body.push(badge(22, y + 12, 2, green));
    body.push(pill(40, y, r1, { kind: "code", size: 11.5 }));
    body.push(text(50, y + 40, r2, { size: 11, color: C.code.title }));
    y += 60;
  }
  const lg = legendLine(s.legend, y, width, C.code.title);
  body.push(lg.svg);
  return svg({ width, height: lg.bottom + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function adjustment(lang, narrow = false) {
  const s = S[lang].adjustment;
  const width = narrow ? NW : W;
  const body = [];
  const cx = narrow ? 10 : 230;
  const cw = narrow ? 250 : 400;
  const mid = cx + cw / 2;
  let y = 10;
  const step = (b, kind, h, x = cx, w = cw, opts = {}) => {
    body.push(box({ x, y, w, h, kind, title: b.title, lines: b.lines, size: narrow ? 11 : 12, titleSize: narrow ? 12.5 : 13.5, align: "middle", ...opts }));
    const r = { x, y, w, h };
    y += h;
    return r;
  };
  const down = (x, len = 22, color = C.line) => {
    body.push(arrow([[x, y], [x, y + len]], { color }));
    y += len;
  };
  step(s.end, "plain", 50, narrow ? 10 : cx, narrow ? width - 20 : cw);
  down(narrow ? width / 2 : mid);
  step(s.cross, "worker", 52, narrow ? 10 : cx, narrow ? width - 20 : cw);
  down(narrow ? width / 2 : mid);
  const q = step({ title: s.q, lines: [] }, "warn", 40);
  // no → record only
  if (narrow) {
    const rx = cx + cw + 20;
    const rw = width - 10 - rx;
    body.push(box({ x: rx, y: q.y - 14, w: rw, h: 72, kind: "plain", title: s.recordOnly.title, lines: s.recordOnly.lines, size: 10.5, titleSize: 12, align: "middle" }));
    body.push(arrow([[cx + cw, q.y + 26], [rx, q.y + 26]], { color: C.line }));
    body.push(text(cx + cw + 10, q.y + 16, s.no, { size: 10.5, color: C.muted, anchor: "middle" }));
  } else {
    const rw = 190;
    body.push(box({ x: 10, y: q.y - 16, w: rw, h: 72, kind: "plain", title: s.recordOnly.title, lines: s.recordOnly.lines, size: 11.5, titleSize: 13, align: "middle" }));
    body.push(arrow([[cx, q.y + 24], [10 + rw, q.y + 24]], { color: C.line }));
    body.push(text((cx + 10 + rw) / 2, q.y + 11, s.no, { size: 11.5, color: C.muted, anchor: "middle" }));
    const xx = cx + cw + 24;
    body.push(box({ x: xx, y: q.y - 12, w: width - 10 - xx, h: 64, kind: "warn", title: s.x9.title, lines: s.x9.lines, size: 11.5, titleSize: 13, dashed: true }));
  }
  const yesX = narrow ? cx + cw / 2 : mid;
  body.push(arrow([[yesX, y], [yesX, y + 26]], { color: C.bad.stroke }));
  body.push(text(yesX + 8, y + 17, s.yes, { size: 11.5, color: C.bad.title, weight: 700 }));
  y += 26;
  const turn = step(s.turn, "agent", 64, narrow ? 10 : cx, narrow ? width - 20 : cw);
  // options
  const opt = [];
  if (!narrow) {
    const ow = 270;
    const og = (width - 20 - 3 * ow) / 2;
    const busY = y + 16;
    const oy = y + 34;
    const centers = [0, 1, 2].map((i) => 10 + i * (ow + og) + ow / 2);
    body.push(`<path d="M${mid} ${y} L${mid} ${busY} M${centers[0]} ${busY} L${centers[2]} ${busY}" fill="none" stroke="${C.agent.stroke}" stroke-width="1.6"/>`);
    s.options.forEach((o, i) => {
      const x = 10 + i * (ow + og);
      body.push(arrow([[centers[i], busY], [centers[i], oy]], { color: C.agent.stroke }));
      body.push(box({ x, y: oy, w: ow, h: 88, kind: i === 1 ? "agent" : "plain", title: o.title, lines: o.lines.filter(Boolean), size: 11.5, titleSize: 13, align: "middle", dashed: i === 2 }));
      opt.push({ x, y: oy, w: ow, h: 88 });
    });
    body.push(badge(opt[1].x + opt[1].w - 6, opt[1].y + 2, 1, C.code.stroke));
    y = oy + 88;
    const busY2 = y + 16;
    body.push(`<path d="M${centers[0]} ${y} L${centers[0]} ${busY2} M${centers[2]} ${y} L${centers[2]} ${busY2} M${centers[1]} ${y} L${centers[1]} ${busY2} M${centers[0]} ${busY2} L${centers[2]} ${busY2}" fill="none" stroke="${C.warn.stroke}" stroke-width="1.6"/>`);
    body.push(text(centers[2] + 0, busY2 + 16, s.any, { size: 11, color: C.warn.title, anchor: "middle" }));
    y = busY2;
    body.push(arrow([[mid, y], [mid, y + 20]], { color: C.warn.stroke }));
    y += 20;
    const lw = 600;
    step(s.log, "warn", 56, (width - lw) / 2, lw);
    down(mid, 22, C.worker.stroke);
    step(s.reval, "worker", 56, (width - lw) / 2, lw);
    body.push(badge((width - lw) / 2 + lw - 6, y - 56 + 2, 2, C.code.stroke));
    down(mid);
    step(s.csv, "code", 36, mid - 100, 200);
  } else {
    const ox = 34;
    const ow = width - 10 - ox;
    const spineX = 20;
    y += 14;
    body.push(`<path d="M${width / 2} ${turn.y + turn.h} L${width / 2} ${y - 6} L${spineX} ${y - 6}" fill="none" stroke="${C.agent.stroke}" stroke-width="1.6"/>`);
    s.options.forEach((o, i) => {
      const ls = o.lines.filter(Boolean);
      const h = 30 + ls.length * 16;
      body.push(box({ x: ox, y, w: ow, h, kind: i === 1 ? "agent" : "plain", title: o.title, lines: ls, size: 11, titleSize: 12.5, dashed: i === 2 }));
      body.push(arrow([[spineX, y + h / 2], [ox, y + h / 2]], { color: C.agent.stroke }));
      opt.push({ x: ox, y, w: ow, h });
      y += h + 10;
    });
    const last = opt[opt.length - 1];
    body.push(`<path d="M${spineX} ${turn.y + turn.h + 8} L${spineX} ${last.y + last.h / 2}" fill="none" stroke="${C.agent.stroke}" stroke-width="1.6"/>`);
    body.push(badge(opt[1].x + opt[1].w - 8, opt[1].y + 2, 1, C.code.stroke));
    y -= 10;
    body.push(arrow([[width / 2, y], [width / 2, y + 30]], { color: C.warn.stroke }));
    body.push(text(width / 2 + 8, y + 19, s.any, { size: 11, color: C.warn.title }));
    y += 30;
    step(s.logNarrow, "warn", 30 + 3 * 16, 10, width - 20);
    down(width / 2, 22, C.worker.stroke);
    step(s.revalNarrow, "worker", 30 + 2 * 16, 10, width - 20);
    body.push(badge(width - 18, y - 62 + 2, 2, C.code.stroke));
    down(width / 2);
    step(s.csv, "code", 36, width / 2 - 90, 180);
    y += 14;
    body.push(box({ x: 10, y, w: width - 20, h: 30 + 2 * 16, kind: "warn", title: s.x9.title, lines: s.x9.lines, size: 11, titleSize: 12.5, dashed: true }));
    y += 30 + 2 * 16;
  }
  return svg({ width, height: y + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang, ligatures: false });
}

// ---------------------------------------------------------------------------

function literature(lang, narrow = false) {
  const s = S[lang].literature;
  const width = narrow ? NW : W;
  const body = [];
  const lx = 10;
  const lw = narrow ? width - 20 : 390;
  const size = narrow ? 11 : 11.5;
  let y = 10;
  const gh = 34 + s.tools.length * 34;
  body.push(group(lx, y, lw, gh, s.agentHead, C.agent.stroke));
  s.tools.forEach(([name, note], i) => body.push(chip(lx + 10, y + 30 + i * 34, lw - 20, name, { kind: "agent", note, noteColor: C.agent.title })));
  y += gh + 12;
  const col = (b, kind, x, w, yy, extra = {}) => {
    const h = 32 + b.lines.length * (size * 1.45);
    body.push(box({ x, y: yy, w, h, kind, title: b.title, lines: b.lines, size, titleSize: narrow ? 12.5 : 13, ...extra }));
    return { x, y: yy, w, h };
  };
  const fb = col(s.fallback, "plain", lx, lw, y);
  y = fb.y + fb.h + 12;
  const gd = col(s.guard, "plain", lx, lw, y);
  y = gd.y + gd.h + 12;
  const wr = col(s.writes, "agent", lx, lw, y);
  y = wr.y + wr.h;
  const rx = narrow ? 10 : 460;
  const rw = narrow ? width - 20 : width - 10 - rx;
  let ry;
  if (narrow) {
    body.push(arrow([[width / 2, y], [width / 2, y + 44]], { color: C.agent.stroke }));
    ry = y + 44 + 22;
  } else {
    ry = 36;
  }
  body.push(text(rx + 2, ry - 10, s.workerHead, { size: 13.5, weight: 700, color: C.worker.title }));
  const rf = col(s.ref, "worker", rx, rw, ry);
  const qt = col(s.quote, "worker", rx, rw, rf.y + rf.h + 14);
  const bk = col(s.back, "bad", rx, rw, qt.y + qt.h + 14);
  if (!narrow) {
    const vx = 430;
    const wy = wr.y + 30;
    body.push(`<path d="M${wr.x + wr.w} ${wy} L${vx} ${wy} L${vx} ${rf.y + rf.h / 2}" fill="none" stroke="${C.agent.stroke}" stroke-width="1.6"/>`);
    body.push(arrow([[vx, rf.y + rf.h / 2], [rx, rf.y + rf.h / 2]], { color: C.agent.stroke }));
    body.push(arrow([[vx, qt.y + qt.h / 2], [rx, qt.y + qt.h / 2]], { color: C.agent.stroke }));
    const fx = 446;
    const fy = wr.y + wr.h - 16;
    body.push(arrow([[rx, bk.y + bk.h / 2], [fx, bk.y + bk.h / 2], [fx, fy], [wr.x + wr.w, fy]], { color: C.bad.stroke }));
    y = Math.max(wr.y + wr.h, bk.y + bk.h);
  } else {
    const fx = width - 5;
    body.push(arrow([[bk.x + bk.w, bk.y + bk.h / 2], [fx, bk.y + bk.h / 2], [fx, wr.y + wr.h / 2], [wr.x + wr.w, wr.y + wr.h / 2]], { color: C.bad.stroke }));
    y = bk.y + bk.h;
  }
  return svg({ width, height: y + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function relation(lang, narrow = false) {
  const s = S[lang].relation;
  const width = narrow ? NW : W;
  const body = [];
  let y = 10;
  body.push(text(10, y + 14, s.head, { size: 14, weight: 700, color: C.worker.title, maxWidth: width - 20 }));
  y += 28;
  const pw = narrow ? 128 : 166;
  const pg = narrow ? (width - 20 - 3 * pw) / 2 : 14;
  const ph = narrow ? 124 : 132;
  const fs = narrow ? 10.5 : 11.5;
  const paper = { fill: "#f8fafc", stroke: "#94a3b8" };
  const uc = { fill: C.code.fill, stroke: C.code.stroke };
  s.cases.forEach((c, i) => {
    const x = 10 + i * (pw + pg);
    body.push(`<rect x="${x}" y="${y}" width="${pw}" height="${ph + 46}" rx="10" fill="${C.lane}" stroke="#e2e8f0"/>`);
    const ix = x + 10;
    const iw = pw - 20;
    const iy = y + 10;
    const ih = ph - 20;
    const rect = (rx, ry, rw, rh, k, dashed) => `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="8" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"${dashed ? ` stroke-dasharray="5 3"` : ""}/>`;
    const ucText = `${s.ucLabel} ${c.uc}`;
    const paperText = `${s.paperLabel}: ${c.paper}`;
    if (c.kind === "lt") {
      body.push(rect(ix, iy, iw, ih, paper, true));
      body.push(text(ix + 8, iy + 16, s.paperLabel, { size: fs, color: C.muted, maxWidth: iw - 12 }));
      body.push(text(ix + 8, iy + 31, c.paper, { size: fs, color: C.muted, italic: true, maxWidth: iw - 12 }));
      body.push(rect(ix + 18, iy + 44, iw - 36, ih - 56, uc, false));
      body.push(text(ix + iw / 2, iy + 44 + (ih - 56) / 2 + 4, ucText, { size: fs, anchor: "middle", maxWidth: iw - 40 }));
    } else if (c.kind === "gt") {
      body.push(rect(ix, iy, iw, ih, uc, false));
      body.push(text(ix + 8, iy + 18, ucText, { size: fs, maxWidth: iw - 12 }));
      body.push(rect(ix + 14, iy + 36, iw - 28, ih - 48, paper, true));
      body.push(text(ix + iw / 2, iy + 36 + (ih - 48) / 2 - 10, s.paperLabel, { size: fs, color: C.muted, anchor: "middle", maxWidth: iw - 32 }));
      const words = c.paper.split(" ");
      const l1 = words.slice(0, 2).join(" ");
      const l2 = words.slice(2).join(" ");
      body.push(text(ix + iw / 2, iy + 36 + (ih - 48) / 2 + 5, l1, { size: fs, color: C.muted, italic: true, anchor: "middle", maxWidth: iw - 32 }));
      if (l2) body.push(text(ix + iw / 2, iy + 36 + (ih - 48) / 2 + 19, l2, { size: fs, color: C.muted, italic: true, anchor: "middle", maxWidth: iw - 32 }));
    } else {
      body.push(rect(ix, iy, iw, ih, uc, false));
      body.push(`<rect x="${ix + 3}" y="${iy + 3}" width="${iw - 6}" height="${ih - 6}" rx="6" fill="none" stroke="${paper.stroke}" stroke-width="1.5" stroke-dasharray="5 3"/>`);
      body.push(text(ix + iw / 2, iy + ih / 2 - 16, ucText, { size: fs, anchor: "middle", maxWidth: iw - 12 }));
      body.push(text(ix + iw / 2, iy + ih / 2 + 4, s.paperLabel, { size: fs, color: C.muted, anchor: "middle", maxWidth: iw - 12 }));
      const words = c.paper.split(" ");
      body.push(text(ix + iw / 2, iy + ih / 2 + 19, words.slice(0, 2).join(" "), { size: fs, color: C.muted, italic: true, anchor: "middle", maxWidth: iw - 12 }));
      if (words.length > 2) body.push(text(ix + iw / 2, iy + ih / 2 + 33, words.slice(2).join(" "), { size: fs, color: C.muted, italic: true, anchor: "middle", maxWidth: iw - 12 }));
    }
    void paperText;
    body.push(text(x + 12, y + ph + 20, `\`${c.rel}\``, { size: 17, weight: 700, color: C.code.title }));
    c.cap.forEach((l, k) => body.push(text(x + (narrow ? 30 : 36), y + ph + 12 + k * 15, l, { size: narrow ? 9.5 : 11, color: C.text, maxWidth: pw - (narrow ? 36 : 42) })));
  });
  y += ph + 46 + 14;
  body.push(text(10, y + 12, s.notation, { size: narrow ? 11 : 12, color: C.muted, maxWidth: width - 20 }));
  y += 30;

  // one reference per row
  const rx = narrow ? 10 : 560;
  let ry = narrow ? y + 6 : 10;
  const rw = narrow ? width - 20 : width - 10 - rx;
  body.push(text(rx, ry + 14, s.rowsHead, { size: 14, weight: 700, color: C.worker.title }));
  ry += 26;
  const row = (yy, cells, kind, tag, tagColor) => {
    const h = 58;
    body.push(`<rect x="${rx}" y="${yy}" width="${rw}" height="${h}" rx="8" fill="${C[kind].fill}" stroke="${C[kind].stroke}" stroke-width="1.3"/>`);
    body.push(`<rect x="${rx}" y="${yy}" width="40" height="${h}" rx="8" fill="${tagColor}"/>`);
    body.push(`<rect x="${rx + 30}" y="${yy}" width="10" height="${h}" fill="${tagColor}"/>`);
    body.push(text(rx + 20, yy + h / 2 + 4, tag, { size: 11, weight: 700, color: "#ffffff", anchor: "middle" }));
    body.push(text(rx + 50, yy + 18, cells[0], { size: 11.5, maxWidth: rw - 60 }));
    body.push(text(rx + 50, yy + 36, cells[1], { size: 11.5, maxWidth: rw - 60 }));
    body.push(text(rx + 50, yy + 52, cells[2], { size: 11, color: C.muted, maxWidth: rw - 60 }));
    return h;
  };
  ry += row(ry, s.v11Row, "bad", s.v11, V11) + 16;
  body.push(arrow([[rx + rw / 2, ry - 14], [rx + rw / 2, ry]], { color: C.line }));
  for (const r of s.v2Rows) ry += row(ry, r, "code", s.v2, V2) + 8;
  const words = s.rowsNote;
  if (narrow) {
    body.push(text(rx, ry + 12, words, { size: 11, color: C.muted, maxWidth: rw }));
    ry += 24;
  } else {
    const cut = lang === "ja" ? words.indexOf("。") + 1 : words.indexOf(";") + 1;
    body.push(text(rx, ry + 12, words.slice(0, cut), { size: 11, color: C.muted, maxWidth: rw }));
    body.push(text(rx, ry + 28, words.slice(cut).trim(), { size: 11, color: C.muted, maxWidth: rw }));
    ry += 36;
  }
  const height = Math.max(y, ry) + 8;
  return svg({ width, height, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

/** Collapsible FRG tree: rows of [depth, label | [leaf, …]] under a TLF row. */
function tree(x, y, w, tlf, rows) {
  const out = [];
  const rowH = 30;
  const ind = 18;
  const nodes = [{ depth: 0, y, x }];
  out.push(`<rect x="${x}" y="${y}" width="${Math.min(w, textWidth(tlf, 12) * 1.08 + 22)}" height="24" rx="6" fill="#1e293b"/>`);
  out.push(text(x + 10, y + 16.5, tlf, { size: 12, weight: 700, color: "#ffffff", maxWidth: w - 20 }));
  let yy = y + rowH;
  for (const [depth, label] of rows) {
    const nx = x + depth * ind;
    let parent = nodes.length - 1;
    while (parent > 0 && nodes[parent].depth >= depth) parent--;
    const p = nodes[parent];
    out.push(`<path d="M${p.x + 8} ${p.y + 24} L${p.x + 8} ${yy + 12} L${nx} ${yy + 12}" fill="none" stroke="${C.faint}" stroke-width="1.3"/>`);
    if (Array.isArray(label)) {
      let lx = nx;
      for (const leaf of label) {
        const lw = textWidth(leaf, 11.5) + 18;
        out.push(`<rect x="${lx}" y="${yy}" width="${lw}" height="24" rx="12" fill="${C.code.fill}" stroke="${C.code.stroke}" stroke-width="1.2"/>`);
        out.push(text(lx + 9, yy + 16.5, leaf, { size: 11.5 }));
        lx += lw + 6;
        if (lx - 6 > x + w) throw new Error(`tree leaves overflow: ${label.join(" ")}`);
      }
    } else {
      const lw = Math.min(w - depth * ind, textWidth(label, 12) * 1.08 + 20);
      out.push(`<rect x="${nx}" y="${yy}" width="${lw}" height="24" rx="6" fill="${C.worker.fill}" stroke="${C.worker.stroke}" stroke-width="1.2"/>`);
      out.push(text(nx + 10, yy + 16.5, label, { size: 12, color: C.worker.title, weight: 600, maxWidth: lw - 16 }));
      nodes.push({ depth, y: yy, x: nx });
    }
    yy += rowH;
  }
  return { svg: out.join("\n"), bottom: yy - rowH + 24 };
}

function trial(lang, narrow = false) {
  const s = S[lang].trial;
  const width = narrow ? NW : W;
  const pw = narrow ? width - 20 : 410;
  const body = [];
  const panelParts = (px, py, head, color, which) => {
    const parts = [];
    let y = py;
    parts.push(header(px, y, pw, head, color));
    y += 42;
    parts.push(text(px + 2, y + 12, s.hcd, { size: 13, weight: 700, color: C.agent.title }));
    y += 22;
    const cw2 = (pw - 30) / 2;
    if (which === "before") {
      const ucs = [
        ["FuG@L", s.gyrus, true],
        ["IPL@L", s.gyrus, true],
        ["IFG@L", s.gyrus, true],
        ["A22c@L", s.area, false],
      ];
      ucs.forEach(([n, note, x9], i) => {
        const cx = px + 10 + (i % 2) * (cw2 + 10);
        const cy = y + Math.floor(i / 2) * 36;
        parts.push(chip(cx, cy, cw2, n, { kind: "code", note: narrow ? "" : note, noteColor: C.muted }));
        if (x9) parts.push(pill(cx + 10 + textWidth(`\`${n}\``, 12) + 8, cy + 3, "X9", { kind: "bad", size: 9.5 }));
      });
      y += 2 * 36;
      if (!narrow) {
        parts.push(box({ x: px + 10, y: y + 6, w: pw - 20, h: 30 + s.x9Note.length * 18, kind: "warn", title: s.x9Head, lines: s.x9Note, size: 11.5, titleSize: 12.5 }));
      }
    } else {
      const cols = [
        ["FuG@L", ["A37lv@L", "A20rv@L"]],
        ["IPL@L", ["IPL@L(AnG)", "IPL@L(SMG)"]],
        ["IFG@L", ["IFG@L(opercular)", "IFG@L(triangular)"]],
      ];
      for (const [cname, members] of cols) {
        parts.push(`<rect x="${px + 6}" y="${y}" width="${pw - 12}" height="62" rx="8" fill="#ffffff" stroke="${C.agent.stroke}" stroke-width="1.2" stroke-dasharray="5 3"/>`);
        parts.push(text(px + 14, y + 15, `${s.collection} \`${cname}\``, { size: 11, color: C.agent.title, weight: 600 }));
        members.forEach((m, i) => parts.push(chip(px + 14 + i * (cw2 + 4), y + 24, cw2 - 2, m, { kind: "code" })));
        y += 68;
      }
      parts.push(chip(px + 14, y, cw2 - 2, "A22c@L", { kind: "code", note: narrow ? "" : "", noteColor: C.muted }));
      y += 36;
    }
    return { parts, y };
  };
  const b = panelParts(10, 10, s.before, C.v1, "before");
  const a = panelParts(narrow ? 10 : 440, narrow ? 0 : 10, s.after, V2, "after");
  if (!narrow) {
    const fy = Math.max(b.y, a.y) + 8;
    body.push(`<rect x="10" y="10" width="${pw}" height="0" fill="none"/>`);
    body.push(...b.parts, ...a.parts);
    const draw = (px, rows, stats, kind) => {
      body.push(text(px + 2, fy + 12, s.frg, { size: 13, weight: 700, color: C.worker.title }));
      const t = tree(px + 10, fy + 22, pw - 20, s.tlf, rows);
      body.push(t.svg);
      return t.bottom;
    };
    const bb = draw(10, s.beforeTree, s.beforeStats, "bad");
    const ab = draw(440, s.afterTree, s.afterStats, "code");
    const sy = Math.max(bb, ab) + 14;
    body.push(pill(10 + pw / 2, sy, s.beforeStats, { kind: "bad", anchor: "middle" }));
    body.push(pill(440 + pw / 2, sy, s.afterStats, { kind: "code", anchor: "middle" }));
    return svg({ width, height: sy + 34, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  body.push(...b.parts);
  let y = b.y + 8;
  body.push(text(12, y + 12, s.frg, { size: 13, weight: 700, color: C.worker.title }));
  const tb = tree(20, y + 22, pw - 20, s.tlf, s.beforeTree);
  body.push(tb.svg);
  y = tb.bottom + 12;
  body.push(pill(10 + pw / 2, y, s.beforeStats, { kind: "bad", anchor: "middle" }));
  y += 40;
  const a2 = panelParts(10, y, s.after, V2, "after");
  body.push(...a2.parts);
  y = a2.y + 8;
  body.push(text(12, y + 12, s.frg, { size: 13, weight: 700, color: C.worker.title }));
  const ta = tree(20, y + 22, pw - 20, s.tlf, s.afterTree);
  body.push(ta.svg);
  y = ta.bottom + 12;
  body.push(pill(10 + pw / 2, y, s.afterStats, { kind: "code", anchor: "middle" }));
  return svg({ width, height: y + 34, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function metrics(lang, narrow = false) {
  const s = S[lang].metrics;
  const width = narrow ? NW : W;
  const colors = [C.v0, C.v1, V2];
  const body = [];
  // legend
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
  const labelW = narrow ? 0 : 150;
  const barMax = colW - labelW - 60;
  const rowH = narrow ? 70 : 56;
  const perCol = narrow ? s.rows.length : Math.ceil(s.rows.length / 2);
  let bottom = top;
  s.rows.forEach(([label, vals], i) => {
    const c = Math.floor(i / perCol);
    const r = i % perCol;
    const x = 10 + c * (colW + 20);
    let y = top + r * rowH;
    const max = Math.max(...vals.filter((v) => v !== null), 1);
    if (narrow) {
      body.push(text(x, y + 12, label, { size: 12, weight: 700, color: C.text, maxWidth: colW }));
      y += 18;
    } else {
      body.push(text(x + labelW - 10, y + 26, label, { size: 12, weight: 700, color: C.text, anchor: "end", maxWidth: labelW - 14 }));
    }
    const bx = x + labelW;
    vals.forEach((v, k) => {
      const by = y + 4 + k * 15;
      if (v === null) {
        body.push(text(bx + 2, by + 10, `— ${s.na}`, { size: 11, color: C.faint, italic: true }));
      } else {
        const w = Math.max(2, (v / max) * barMax);
        body.push(`<rect x="${bx}" y="${by}" width="${w.toFixed(1)}" height="12" rx="2" fill="${colors[k]}"/>`);
        body.push(text(bx + w + 6, by + 10.5, String(v), { size: 11.5, weight: 700, color: C.text }));
      }
    });
    bottom = Math.max(bottom, y + 4 + 3 * 15);
  });
  return svg({ width, height: bottom + 14, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

// ---------------------------------------------------------------------------

function tokens(lang, narrow = false) {
  const s = S[lang].tokens;
  const width = narrow ? NW : W;
  const x0 = narrow ? 84 : 104;
  const barMax = narrow ? 250 : 600;
  const max = 12000;
  const scale = (v) => (v / max) * barMax;
  const colors = { "AGENTS.md": "#94a3b8", "HCD.md": C.v1, "FRG.md": C.agent.stroke, "RESEARCH.md": C.warn.stroke };
  const t1 = TOK.v11;
  const t2 = TOK.v2;
  const rm = t2.research + t2.researchMode;
  const rows = [
    { segs: [["AGENTS.md", t2.agents], ["RESEARCH.md", t2.research]], extra: 0, v2: true },
    { segs: [["AGENTS.md", t1.agents], ["HCD.md", t1.hcd]], extra: 0 },
    { segs: [["AGENTS.md", t2.agents], ["HCD.md", t2.hcd]], extra: rm, v2: true },
    { segs: [["AGENTS.md", t1.agents], ["HCD.md", t1.hcd], ["FRG.md", t1.frg]], extra: 0 },
    { segs: [["AGENTS.md", t2.agents], ["HCD.md", t2.hcd], ["FRG.md", t2.frg]], extra: rm, v2: true },
  ];
  const body = [];
  const top = 34;
  const rowH = 42;
  const gapAfter = new Set([0, 2]);
  const rowY = [];
  let yy = top;
  rows.forEach((_, i) => {
    rowY.push(yy);
    yy += rowH + (gapAfter.has(i) && !narrow ? 8 : 0);
  });
  const bottom = yy - rowH + 24 + 10;
  for (let t = 0; t <= max; t += 1000) {
    const x = x0 + scale(t);
    body.push(`<line x1="${x}" y1="${top - 6}" x2="${x}" y2="${bottom}" stroke="#e2e8f0"/>`);
    if (t % 2000 === 0) body.push(text(x, bottom + 16, `${t / 1000}k`, { size: 11, color: C.faint, anchor: "middle" }));
  }
  body.push(text(x0 + barMax, bottom + 32, s.unit, { size: 11, color: C.faint, anchor: "end" }));
  rows.forEach((row, i) => {
    const y = rowY[i];
    const color = row.v2 ? V2 : "#115e59";
    body.push(text(x0 - 10, y + 17, s.rows[i], { size: 12.5, weight: 700, color, anchor: "end" }));
    let acc = 0;
    for (const [name, v] of row.segs) {
      body.push(`<rect x="${(x0 + scale(acc)).toFixed(1)}" y="${y}" width="${scale(v).toFixed(1)}" height="24" fill="${colors[name]}" stroke="#ffffff" stroke-width="1"/>`);
      if (!narrow && scale(v) > 56) body.push(text(x0 + scale(acc) + scale(v) / 2, y + 16.5, v.toLocaleString("en-US"), { size: 11, color: "#ffffff", anchor: "middle", weight: 600 }));
      acc += v;
    }
    if (row.extra) {
      body.push(`<rect x="${(x0 + scale(acc)).toFixed(1)}" y="${y}" width="${scale(row.extra).toFixed(1)}" height="24" fill="${C.warn.fill}" stroke="${C.warn.stroke}" stroke-width="1.2" stroke-dasharray="4 3"/>`);
    }
    const label = row.extra ? `${acc.toLocaleString("en-US")} (+${row.extra.toLocaleString("en-US")})` : acc.toLocaleString("en-US");
    body.push(text(x0 + scale(acc + row.extra) + 8, y + 17, label, { size: 12, weight: 700, color, maxWidth: width - (x0 + scale(acc + row.extra) + 8) - 4 }));
  });
  // legend
  const items = [
    ["AGENTS.md", colors["AGENTS.md"]],
    ["HCD.md", colors["HCD.md"]],
    ["FRG.md", colors["FRG.md"]],
    ["RESEARCH.md", colors["RESEARCH.md"]],
  ];
  let lx = 10;
  let ly = bottom + (narrow ? 56 : 54);
  for (const [name, color] of items) {
    const w = 22 + textWidth(name, 12) + 18;
    if (lx > 10 && lx + w > width) {
      lx = 10;
      ly += 20;
    }
    body.push(`<rect x="${lx}" y="${ly - 11}" width="16" height="14" rx="3" fill="${color}"/>`);
    body.push(text(lx + 22, ly, name, { size: 12, color: C.muted }));
    lx += w;
  }
  const w = 22 + textWidth(s.researchSeg, 12) + 18;
  if (lx + w > width) {
    lx = 10;
    ly += 20;
  }
  body.push(`<rect x="${lx}" y="${ly - 11}" width="16" height="14" rx="3" fill="${C.warn.fill}" stroke="${C.warn.stroke}" stroke-dasharray="4 3"/>`);
  body.push(text(lx + 22, ly, s.researchSeg, { size: 12, color: C.muted }));
  body.push(text(narrow ? 10 : x0, 18, narrow ? s.noteNarrow : s.note, { size: 12.5, weight: 600, color: C.text, maxWidth: width - 20 }));
  return svg({ width, height: ly + 14, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const HARNESS_V2_FIGURES = {
  "harness-v2-overview": [overview, (lang) => overview(lang, true)],
  "harness-v2-pipeline": [pipeline, (lang) => pipeline(lang, true)],
  "harness-v2-adjustment": [adjustment, (lang) => adjustment(lang, true)],
  "harness-v2-literature": [literature, (lang) => literature(lang, true)],
  "harness-v2-relation": [relation, (lang) => relation(lang, true)],
  "harness-v2-language-trial": [trial, (lang) => trial(lang, true)],
  "harness-v2-language-metrics": [metrics, (lang) => metrics(lang, true)],
  "harness-v2-instruction-tokens": [tokens, (lang) => tokens(lang, true)],
};
