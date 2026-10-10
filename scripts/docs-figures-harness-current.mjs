// Current harness v2 figures: who reasons (the LLM agent) and who runs the procedure (the worker program), what passes
// between them in one turn, and which of them writes each file in one BRA run. Embedded in part 3 of the specification
// PDF (docs/spec-guide/src/30_harness.html).
import { C, NW, arrow, box, group, header, legendRows, pill, svg, text, textWidth } from "./docs-figures-lib.mjs";

const W = 860;

/** A dashed vertical lifeline (the turn figure). */
const lifeline = (x, y1, y2) => `<path d="M${x} ${y1} L${x} ${y2}" fill="none" stroke="${C.faint}" stroke-width="1.2" stroke-dasharray="4 5"/>`;

/** Centred text on a white band, so a lifeline it crosses does not run through the letters. */
function bandText(x, y, s, opts) {
  const w = textWidth(s, opts.size) + 10;
  return `<rect x="${(x - w / 2).toFixed(1)}" y="${y - opts.size}" width="${w.toFixed(1)}" height="${opts.size + 5}" fill="#ffffff"/>` + text(x, y, s, { ...opts, anchor: "middle" });
}

const S = {
  ja: {
    legend: [
      ["agent", "LLM（推論する）"],
      ["worker", "プログラム（決まった手順）"],
      ["code", "ファイル（受け渡しの場）"],
      ["plain", "人・外部サービス・保存先"],
    ],
    architecture: {
      title: "CoBRAC ハーネス v2：登場する主体と受け渡し",
      desc: "紫は LLM、青はプログラム、緑はファイル、白は人・外部サービス・保存先を表す。利用者の入力を API（Lambda）がジョブとして記録し、dispatcher（Lambda）がジョブごとに Fargate コンテナでワーカーを起動する。ワーカーは LLM を含まないプログラムで、CoBRAC エージェント（Codex が動かす OpenAI のモデル）に依頼文を送り、ターン終了の JSON を受け取る。作業の中身は作業場所のファイルで受け渡す。エージェントはデータ JSON と説明の md を書き、ワーカーはそれを検査して検査結果、CSV、xlsx、グラフを書く。推論はコンテナの外の OpenAI API で行われる。エージェントは lit で文献データベースを、RCS で SABRA の候補を調べる。成果物と会話は S3 に保存し、進捗は DynamoDB と WebSocket で画面に送る。質問するかどうかはエージェントが決め、保存・停止・再開はワーカーが行う。",
      ui: { title: "利用者（人）", lines: ["ROI・TLF・資料・追加指示", "質問への回答・承認"] },
      api: { title: "API（Lambda・プログラム）", lines: ["プロジェクトとジョブを記録", "SQS に実行を依頼"] },
      queue: { title: "dispatcher（Lambda）", lines: ["同時実行数を確認", "ジョブごとにワーカーを起動"] },
      start: "ワーカーを起動",
      container: "Fargate コンテナ（ジョブごと）",
      worker: { title: "ワーカー（プログラム・LLM なし）", lines: ["段の順序と依頼文を決める", "ファイルを検査（文献・RCS 照合も）", "CSV・xlsx・グラフを生成", "保存・停止・再開"] },
      agent: { title: "CoBRAC エージェント（LLM）", lines: ["Codex が OpenAI のモデルを動かす", "文献を読み、回路と機能を判断", "作業場所のファイルを書き換える", "1 プロジェクトで 1 つの会話"] },
      prompt: "依頼文",
      done: "終了 JSON",
      workerIo: "読む・書く",
      agentIo: "書く・読む",
      lit: { title: "lit（MCP）", lines: ["文献検索・原文取得"] },
      workspace: {
        title: "作業場所（ワーカーのディスク）：受け渡しの場",
        lines: ["エージェントが書く：データ JSON・report.md・decision_log.md", "ワーカーが書く：検査結果 JSON・CSV・xlsx・グラフ", "ワーカーが置く：AGENTS.md・schemas・資料・Canon（変更禁止）"],
      },
      openai: { title: "OpenAI API", lines: ["モデルが推論する場所", "（コンテナの外）"] },
      rcs: { title: "RCS（外部）", lines: ["領域名 → SABRA 候補"] },
      litdb: { title: "文献データベース", lines: ["PubMed・Europe PMC"] },
      store: { title: "S3 に保存", lines: ["作業場所・会話・成果物・保存版"] },
      display: { title: "進捗と質問の表示", lines: ["ワーカー → DynamoDB → WebSocket → 画面"] },
      pause: {
        title: "質問が必要なとき：質問するかはエージェント、保存と再開はワーカー",
        lines: ["質問の JSON → 作業場所と会話を S3 に保存 → ワーカー終了", "利用者の回答 → API / SQS → 新しいワーカーが復元し、同じ会話を再開"],
      },
      workspaceNarrow: {
        title: "作業場所：受け渡しの場",
        lines: ["エージェント：データ JSON・report・判断ログ", "ワーカー：検査結果 JSON・CSV・xlsx・グラフ", "ワーカーが置く：AGENTS.md・schemas ほか"],
      },
      openaiNarrow: { title: "OpenAI API（コンテナの外）", lines: ["エージェントのモデルが推論する場所"] },
      pauseNarrow: {
        title: "質問が必要なとき",
        lines: ["質問するかはエージェント、保存と再開はワーカー", "質問 → 作業場所と会話を S3 に保存 → 終了", "回答 → 新しいワーカーが復元し、同じ会話を再開"],
      },
    },
    turn: {
      title: "CoBRAC ハーネス v2：1 ターンの受け渡し",
      desc: "ワーカー（プログラム）、作業場所（ファイル）、CoBRAC エージェント（LLM）の 3 者の間で 1 ターンに起きることを順に示す。1. ワーカーが段の仕様・問題一覧・候補から依頼文を組み立て、会話のメッセージとして送る。2. エージェントが考え、lit・RCS・Web 検索・シェルを使う。3. エージェントが作業場所のデータ JSON と md を書き換える。4. エージェントがターン終了の JSON（status・message・question）を返す。done は作業を終えたという申告で、合格の意味ではない。5. ワーカーがファイルを読み直して検証器で検査し、検査結果 JSON を書く。6. ワーカーのコードが次を決める。問題があれば修正依頼、合格なら次の段の依頼を 1 に戻って送り、question なら保存して停止する。",
      workerLane: { title: "ワーカー", lines: ["プログラム（LLM なし）"] },
      filesLane: { title: "作業場所", lines: ["プロジェクトフォルダのファイル"] },
      agentLane: { title: "CoBRAC エージェント", lines: ["LLM（Codex + OpenAI のモデル）"] },
      s1: { title: "① 依頼文を組み立てる", lines: ["段の仕様・問題一覧・候補"] },
      m1: "依頼文（会話のメッセージ）",
      s2: { title: "② 考えて道具を使う", lines: ["lit・RCS・Web 検索・シェル"] },
      m3: "③ 書き換える",
      f3: { title: "データ（エージェントが書く）", lines: ["`uc.json`・`frg.json`・`report.md`"] },
      m4: "④ ターン終了の JSON：status・message・question",
      m4note: "done は「作業を終えた」という申告で、合格の意味ではない",
      m5: "⑤ 読む",
      s5: { title: "⑤ 検証器で検査", lines: ["ファイルを読み直して判定"] },
      m5w: "書く",
      f5: { title: "検査結果（ワーカーが書く）", lines: ["`quote_check.json`・`cross_check.json`"] },
      s6: { title: "⑥ 次を決める（コード）", lines: ["問題あり → 修正依頼を ① へ", "合格 → 次の段の依頼を ① へ", "question → 保存して停止"] },
      note: ["会話で行き来するのは依頼文と終了 JSON だけで、作業の中身はすべてファイルで受け渡す。", "次へ進むかを決めるのはワーカーのコードで、エージェントの申告ではない。"],
      narrow: [
        ["worker", { title: "① ワーカー：依頼文を送る", lines: ["段の仕様・問題一覧・候補", "会話のメッセージとして渡す"] }],
        ["agent", { title: "② エージェント：考えて道具を使う", lines: ["lit・RCS・Web 検索・シェル"] }],
        ["agent", { title: "③ エージェント：ファイルを書き換える", lines: ["作業場所のデータ JSON・report.md など"] }],
        ["agent", { title: "④ エージェント：終了 JSON を返す", lines: ["status・message・question", "done は申告で、合格の意味ではない"] }],
        ["worker", { title: "⑤ ワーカー：ファイルを検査", lines: ["読み直して検証器にかける", "検査結果 JSON を作業場所に書く"] }],
        ["worker", { title: "⑥ ワーカー：次を決める（コード）", lines: ["問題あり → 修正依頼（① へ）", "合格 → 次の段の依頼（① へ）", "question → 保存して停止"] }],
      ],
      noteNarrow: ["会話で渡るのは依頼文と終了 JSON だけ", "作業の中身はファイルで受け渡す", "次へ進むかはワーカーのコードが決める"],
    },
    pipeline: {
      title: "CoBRAC ハーネス v2：1 件の BRA の流れと書き手",
      desc: "左の列は CoBRAC エージェント（LLM）のターン、右の列はワーカー（プログラム）の処理で、矢印はファイルと依頼文の受け渡しを表す。1. 調査ターン（既定で有効）でエージェントが research.json を書き、ワーカーが検索ログと被覆を照合して research_check.json を書く。2. HCD ターンでエージェントが uc.json・connections.json などを書き、ワーカーが Schema・命名・文献・引用を検証する。ワーカーは受理した HCD から経路やモチーフを計算して frg_candidates.json を書き、FRG の依頼文に入れる。3. FRG ターンでエージェントが frg.json とレポートの対応表を書き、ワーカーが GN と interface を検査し、整合チェック X1〜X9 を cross_check.json に書く。4. X1・X2・X3・X8 があれば、ワーカーが調整依頼を 1 回送り、エージェントが FRG か HCD を直すか理由を残す。ワーカーは変更されたファイルを再検証する。5. ワーカーが JSON から CSV 5 本、xlsx 2 種、グラフを生成し、保存版にする。この段に LLM は関与しない。各段で問題が残ればワーカーが問題一覧を付けて修正を依頼する。",
      laneAgent: "CoBRAC エージェント（LLM）：判断してファイルを書く",
      laneWorker: "ワーカー（プログラム）：検査・計算・変換",
      research: { title: "1. 調査ターン（既定で有効）", lines: ["候補ごとに文献を探して読む", "→ `research.json`"] },
      researchCheck: { title: "調査の検査", lines: ["検索ログと被覆を照合", "→ `research_check.json`"] },
      hcd: { title: "2. HCD ターン", lines: ["ROI・UC・接続・文献を決める", "→ `uc.json`・`connections.json` ほか"] },
      hcdCheck: { title: "HCD の検証", lines: ["Schema・命名・文献・引用を照合", "→ `quote_check.json` ほか"] },
      candidates: { title: "FRG 候補の計算", lines: ["HCD の接続から経路・モチーフを抽出", "→ `frg_candidates.json`"] },
      frg: { title: "3. FRG ターン", lines: ["TLF を分解し、候補と対応づける", "→ `frg.json`・report の対応表"] },
      frgCheck: { title: "FRG の検証と整合チェック", lines: ["GN・interface を検査、X1〜X9 を計算", "→ `cross_check.json`"] },
      adjust: { title: "4. 調整ターン（該当時のみ・1 回）", lines: ["FRG か HCD を直す、または理由を残す", "→ `decision_log.md` の revisions"] },
      recheck: { title: "変更されたファイルの再検証", lines: ["前段の検査もやり直す", "→ `phase_baseline.json`"] },
      noLlm: { title: "この段に LLM は関与しない", lines: ["CSV の問題は JSON の修正依頼で戻る"] },
      outputs: { title: "5. 成果物の生成と保存", lines: ["JSON → CSV 5 本 → xlsx 2 種・グラフ", "→ 保存版 `<ProjectID>@vN`"] },
      files: "ファイル",
      fix: "修正依頼",
      next: "受理 → 次の段の依頼文",
      accepted: "受理",
      cand: "候補を FRG の依頼文に入れる",
      adj: "X1・X2・X3・X8 → 調整依頼",
      noAdj: "該当なし",
      note: ["どのターンでもエージェントは質問できる。ワーカーが保存して停止し、回答後に同じ会話で再開する。", "仮説は利用者が許可したときだけ書ける。範囲と比率はワーカーが検査する。"],
      tagAgent: "LLM",
      tagWorker: "プログラム",
      noteNarrow: ["左の破線：問題が残ればワーカーが修正依頼を送る", "どのターンでもエージェントは質問できる", "保存と再開はワーカーが行う", "仮説の範囲と比率はワーカーが検査する"],
    },
  },
  en: {
    legend: [
      ["agent", "LLM (reasons)"],
      ["worker", "Program (fixed procedure)"],
      ["code", "Files (where work is handed over)"],
      ["plain", "People, services, storage"],
    ],
    architecture: {
      title: "CoBRAC harness v2: the actors and what they hand over",
      desc: "Purple marks the LLM, blue a program, green files, and white people, external services and storage. The API (Lambda) records the user's input as a job, and the dispatcher (Lambda) starts a worker in a Fargate container for each job. The worker is a program with no LLM: it sends requests to the CoBRAC agent (an OpenAI model run by Codex) and receives the JSON that ends each turn. The work itself is handed over as files in the workspace: the agent writes the data JSON and the explanatory markdown, and the worker checks them and writes the check results, CSVs, xlsx files and graphs. The model reasons outside the container, on the OpenAI API. The agent searches literature databases through lit and SABRA candidates through RCS. Results and the conversation are stored in S3, and progress reaches the screen through DynamoDB and WebSocket. The agent decides whether to ask a question; the worker saves, stops and resumes.",
      ui: { title: "User (person)", lines: ["ROI, TLF, sources, follow-ups", "Answers and approvals"] },
      api: { title: "API (Lambda, program)", lines: ["Records the project and job", "Requests a run through SQS"] },
      queue: { title: "Dispatcher (Lambda)", lines: ["Checks concurrency limits", "Starts one worker per job"] },
      start: "Starts the worker",
      container: "Fargate container (one per job)",
      worker: { title: "Worker (program, no LLM)", lines: ["Decides phase order and requests", "Checks files (also refs and RCS)", "Generates CSV, xlsx and graphs", "Saves, stops and resumes"] },
      agent: { title: "CoBRAC agent (LLM)", lines: ["An OpenAI model run by Codex", "Reads papers; judges circuits", "Edits files in the workspace", "One conversation per project"] },
      prompt: "Request",
      done: "End JSON",
      workerIo: "Reads, writes",
      agentIo: "Writes, reads",
      lit: { title: "lit (MCP)", lines: ["Search, source text"] },
      workspace: {
        title: "Workspace (on the worker's disk): where work is handed over",
        lines: ["Agent writes: data JSON, report.md, decision_log.md", "Worker writes: check-result JSON, CSV, xlsx, graphs", "Worker places: AGENTS.md, schemas, sources, Canon (read-only)"],
      },
      openai: { title: "OpenAI API", lines: ["Where the model reasons", "(outside the container)"] },
      rcs: { title: "RCS (external)", lines: ["Region → SABRA units"] },
      litdb: { title: "Literature databases", lines: ["PubMed, Europe PMC"] },
      store: { title: "Stored in S3", lines: ["Workspace, conversation, results, versions"] },
      display: { title: "Progress and questions on screen", lines: ["Worker → DynamoDB → WebSocket → screen"] },
      pause: {
        title: "When an answer is needed: the agent asks; the worker saves and resumes",
        lines: ["Question JSON → save workspace and conversation to S3 → the worker exits", "User's answer → API / SQS → a new worker restores them and resumes the same conversation"],
      },
      workspaceNarrow: {
        title: "Workspace: where work is handed over",
        lines: ["Agent: data JSON, report, decision log", "Worker: check results, CSV, xlsx, graphs", "Worker places: AGENTS.md, schemas, etc."],
      },
      openaiNarrow: { title: "OpenAI API (outside the container)", lines: ["Where the agent's model reasons"] },
      pauseNarrow: {
        title: "When an answer is needed",
        lines: ["The agent asks; the worker saves and resumes", "Question → save files and conversation → exit", "Answer → a new worker resumes the conversation"],
      },
    },
    turn: {
      title: "CoBRAC harness v2: what passes in one turn",
      desc: "What happens in one turn between the worker (a program), the workspace (files) and the CoBRAC agent (the LLM). 1. The worker builds a request from the phase specification, the list of problems and the candidates, and sends it as a conversation message. 2. The agent reasons and uses lit, RCS, web search and the shell. 3. The agent edits the data JSON and markdown files in the workspace. 4. The agent returns the JSON that ends the turn (status, message, question); done means it has finished its work, not that the work passed. 5. The worker rereads the files, runs the validators and writes the check-result JSON. 6. The worker's code decides what comes next: a fix request or the next phase's request goes back to step 1, and a question saves the state and stops.",
      workerLane: { title: "Worker", lines: ["Program (no LLM)"] },
      filesLane: { title: "Workspace", lines: ["Files in the project folder"] },
      agentLane: { title: "CoBRAC agent", lines: ["LLM (Codex + an OpenAI model)"] },
      s1: { title: "1 Build the request", lines: ["Spec, problems, candidates"] },
      m1: "Request (a conversation message)",
      s2: { title: "2 Reason and use tools", lines: ["lit, RCS, web search, shell"] },
      m3: "3 Edits",
      f3: { title: "Data files (by the agent)", lines: ["`uc.json`, `frg.json`, `report.md`"] },
      m4: "4 JSON that ends the turn: status, message, question",
      m4note: "done means the agent has finished its work, not that the work passed",
      m5: "5 Reads",
      s5: { title: "5 Run the validators", lines: ["Reread the files and judge"] },
      m5w: "Writes",
      f5: { title: "Check results (by the worker)", lines: ["`quote_check.json`, `cross_check.json`"] },
      s6: { title: "6 Decide what next (code)", lines: ["Problems → fix request, to 1", "Passed → next phase, to 1", "question → save and stop"] },
      note: ["Only the request and the end JSON travel as messages; all work is handed over as files.", "The worker's code decides whether to move on, not the agent's report."],
      narrow: [
        ["worker", { title: "1 Worker: sends the request", lines: ["Spec, problems, candidates", "Sent as a conversation message"] }],
        ["agent", { title: "2 Agent: reasons and uses tools", lines: ["lit, RCS, web search, shell"] }],
        ["agent", { title: "3 Agent: edits the files", lines: ["Data JSON, report.md, … in the workspace"] }],
        ["agent", { title: "4 Agent: returns the end JSON", lines: ["status, message, question", "done is a report, not a pass"] }],
        ["worker", { title: "5 Worker: checks the files", lines: ["Rereads them; runs the validators", "Writes the check-result JSON"] }],
        ["worker", { title: "6 Worker: decides what next (code)", lines: ["Problems → fix request (to 1)", "Passed → next phase (to 1)", "question → save and stop"] }],
      ],
      noteNarrow: ["Only the request and end JSON are messages", "All work is handed over as files", "The worker's code decides whether to move on"],
    },
    pipeline: {
      title: "CoBRAC harness v2: one BRA run and who writes what",
      desc: "The left column shows the turns of the CoBRAC agent (the LLM), the right column the processing of the worker (a program); arrows show the files and requests handed over. 1. In the research turn (on by default) the agent writes research.json, and the worker matches it against the search log and writes research_check.json. 2. In the HCD turn the agent writes uc.json, connections.json and the other HCD files, and the worker checks schema, naming, references and quotes. From the accepted HCD the worker computes pathways and motifs into frg_candidates.json and puts them in the FRG request. 3. In the FRG turn the agent writes frg.json and the mapping table of the report, and the worker checks GNs and interfaces and writes cross-checks X1–X9 to cross_check.json. 4. For X1, X2, X3 or X8 the worker sends one adjustment request; the agent changes the FRG or the HCD, or records why not, and the worker revalidates changed files. 5. The worker generates five CSVs, two xlsx formats and graphs from the JSON and saves a version; no LLM takes part. Whenever problems remain, the worker sends them back with a fix request.",
      laneAgent: "CoBRAC agent (LLM): decides and writes files",
      laneWorker: "Worker (program): checks, computes, converts",
      research: { title: "1. Research turn (on by default)", lines: ["Finds and reads papers per candidate", "→ `research.json`"] },
      researchCheck: { title: "Research check", lines: ["Matches search log and coverage", "→ `research_check.json`"] },
      hcd: { title: "2. HCD turn", lines: ["Decides ROI, UCs, connections, refs", "→ `uc.json`, `connections.json`, …"] },
      hcdCheck: { title: "HCD validation", lines: ["Schema, naming, references, quotes", "→ `quote_check.json`, …"] },
      candidates: { title: "FRG candidates", lines: ["Pathways and motifs from HCD links", "→ `frg_candidates.json`"] },
      frg: { title: "3. FRG turn", lines: ["Decomposes the TLF; maps candidates", "→ `frg.json`, report mapping table"] },
      frgCheck: { title: "FRG validation and cross-checks", lines: ["GNs and interfaces; computes X1–X9", "→ `cross_check.json`"] },
      adjust: { title: "4. Adjustment turn (if needed, once)", lines: ["Changes FRG or HCD, or records why not", "→ revisions in `decision_log.md`"] },
      recheck: { title: "Revalidate changed files", lines: ["Reruns earlier checks as well", "→ `phase_baseline.json`"] },
      noLlm: { title: "No LLM takes part here", lines: ["CSV problems return as JSON fixes"] },
      outputs: { title: "5. Generate and save the results", lines: ["JSON → 5 CSVs → 2 xlsx formats, graphs", "→ saved version `<ProjectID>@vN`"] },
      files: "Files",
      fix: "Fix request",
      next: "Accepted → next request",
      accepted: "Accepted",
      cand: "Candidates go into the FRG request",
      adj: "X1, X2, X3, X8 → adjustment",
      noAdj: "No findings",
      note: ["The agent can ask a question in any turn; the worker saves, stops, and resumes the same conversation.", "Hypotheses are allowed only when the user permits them; the worker checks their scope and share."],
      tagAgent: "LLM",
      tagWorker: "Program",
      noteNarrow: ["Dashed lines on the left: the worker's fix requests", "The agent can ask in any turn", "The worker saves and resumes", "The worker checks hypothesis scope and share"],
    },
  },
};

function legend(lang, y, maxW) {
  return legendRows(S[lang].legend, y, maxW);
}

function architecture(lang, narrow = false) {
  const s = S[lang].architecture;
  const width = narrow ? NW : W;
  const body = [];
  const b = (item, x, y, w, h, kind, extra = {}) => body.push(box({ ...item, x, y, w, h, kind, size: 12, titleSize: 13, ...extra }));
  const a = (points, opts) => body.push(arrow(points, opts));
  body.push(header(10, 10, width - 20, s.title, C.worker.title));
  const lg = legend(lang, 62, width - 10);
  body.push(lg.svg);
  if (!narrow) {
    b(s.ui, 10, 82, 250, 72, "plain");
    b(s.api, 305, 82, 250, 72, "worker");
    b(s.queue, 600, 82, 250, 72, "worker");
    a([[260, 118], [305, 118]]);
    a([[555, 118], [600, 118]]);
    a([[725, 154], [725, 172], [250, 172], [250, 230]], { color: C.worker.stroke });
    body.push(text(487, 168, s.start, { size: 10.5, anchor: "middle", color: C.muted, maxWidth: 140 }));
    body.push(group(10, 190, 630, 372, s.container, C.worker.stroke));
    b(s.worker, 30, 230, 240, 124, "worker");
    b(s.agent, 370, 230, 250, 124, "agent");
    a([[270, 268], [370, 268]], { color: C.worker.stroke });
    a([[370, 318], [270, 318]], { color: C.agent.stroke });
    body.push(text(320, 260, s.prompt, { size: 10.5, anchor: "middle", maxWidth: 92 }));
    body.push(text(320, 310, s.done, { size: 10.5, anchor: "middle", maxWidth: 92 }));
    b(s.lit, 470, 372, 150, 56, "worker");
    a([[545, 354], [545, 372]], { color: C.agent.stroke });
    b(s.workspace, 30, 448, 590, 96, "code");
    a([[120, 354], [120, 448]], { color: C.worker.stroke });
    a([[160, 448], [160, 354]], { color: C.worker.stroke });
    body.push(text(170, 405, s.workerIo, { size: 10.5, color: C.muted, maxWidth: 120 }));
    a([[400, 354], [400, 448]], { color: C.agent.stroke });
    a([[440, 448], [440, 354]], { color: C.agent.stroke });
    body.push(text(392, 405, s.agentIo, { size: 10.5, anchor: "end", color: C.muted, maxWidth: 100 }));
    b(s.openai, 660, 230, 190, 76, "agent");
    a([[620, 268], [660, 268]], { color: C.agent.stroke });
    b(s.rcs, 660, 322, 190, 60, "plain");
    a([[620, 336], [650, 336], [650, 352], [660, 352]], { color: C.agent.stroke });
    b(s.litdb, 660, 398, 190, 60, "plain");
    a([[620, 400], [650, 400], [650, 428], [660, 428]], { color: C.worker.stroke });
    a([[215, 544], [215, 582]], { color: C.code.stroke });
    b(s.store, 10, 582, 410, 62, "plain");
    b(s.display, 440, 582, 410, 62, "plain");
    b(s.pause, 10, 664, 840, 80, "warn");
    return svg({ width, height: 754, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  let y = lg.bottom + 18;
  for (const [item, kind] of [[s.ui, "plain"], [s.api, "worker"], [s.queue, "worker"]]) {
    b(item, 10, y, 410, 64, kind);
    a([[215, y + 64], [215, y + 86]], { color: kind === "worker" ? C.worker.stroke : C.line });
    y += 86;
  }
  const gy = y;
  body.push(group(10, gy, 410, 516, s.container, C.worker.stroke));
  b(s.worker, 26, gy + 34, 378, 118, "worker");
  a([[180, gy + 152], [180, gy + 190]], { color: C.worker.stroke });
  a([[250, gy + 190], [250, gy + 152]], { color: C.agent.stroke });
  body.push(text(170, gy + 176, s.prompt, { size: 10.5, anchor: "end", maxWidth: 140 }));
  body.push(text(260, gy + 176, s.done, { size: 10.5, maxWidth: 140 }));
  b(s.agent, 26, gy + 190, 378, 118, "agent");
  a([[215, gy + 308], [215, gy + 326]], { color: C.agent.stroke });
  b(s.lit, 26, gy + 326, 378, 52, "worker");
  b(s.workspaceNarrow, 26, gy + 398, 378, 100, "code");
  a([[26, gy + 93], [18, gy + 93], [18, gy + 448], [26, gy + 448]], { color: C.worker.stroke });
  a([[404, gy + 249], [412, gy + 249], [412, gy + 448], [404, gy + 448]], { color: C.agent.stroke });
  y = gy + 534;
  b(s.openaiNarrow, 10, y, 410, 56, "agent");
  y += 70;
  b(s.rcs, 10, y, 200, 56, "plain");
  b(s.litdb, 220, y, 200, 56, "plain");
  y += 70;
  b(s.store, 10, y, 410, 56, "plain");
  y += 70;
  b(s.display, 10, y, 410, 56, "plain");
  y += 70;
  b(s.pauseNarrow, 10, y, 410, 96, "warn");
  return svg({ width, height: y + 106, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function turn(lang, narrow = false) {
  const s = S[lang].turn;
  const width = narrow ? NW : W;
  const body = [];
  const b = (item, x, y, w, h, kind, extra = {}) => body.push(box({ ...item, x, y, w, h, kind, size: 12, titleSize: 13, ...extra }));
  const a = (points, opts) => body.push(arrow(points, opts));
  body.push(header(10, 10, width - 20, s.title, C.worker.title));
  if (!narrow) {
    const lanes = [
      [s.workerLane, 20, "worker"],
      [s.filesLane, 305, "code"],
      [s.agentLane, 590, "agent"],
    ];
    for (const [, x] of lanes) body.push(lifeline(x + 125, 112, 640));
    for (const [item, x, kind] of lanes) b(item, x, 54, 250, 58, kind, { align: "middle" });
    b(s.s1, 20, 130, 250, 62, "worker");
    a([[270, 161], [590, 161]], { color: C.worker.stroke });
    body.push(bandText(430, 153, s.m1, { size: 11, maxWidth: 300 }));
    b(s.s2, 590, 130, 250, 62, "agent");
    b(s.f3, 305, 222, 250, 62, "code");
    a([[715, 192], [715, 253], [555, 253]], { color: C.agent.stroke });
    body.push(text(635, 245, s.m3, { size: 11, anchor: "middle", maxWidth: 140 }));
    a([[715, 320], [147, 320]], { color: C.agent.stroke });
    body.push(bandText(430, 312, s.m4, { size: 11, maxWidth: 540 }));
    body.push(bandText(430, 338, s.m4note, { size: 10.5, color: C.muted, maxWidth: 540 }));
    b(s.s5, 20, 360, 250, 62, "worker");
    a([[428, 391], [270, 391]], { color: C.code.stroke });
    body.push(text(349, 383, s.m5, { size: 11, anchor: "middle", maxWidth: 140 }));
    b(s.f5, 305, 446, 250, 62, "code");
    a([[270, 410], [430, 410], [430, 446]], { color: C.worker.stroke });
    body.push(text(438, 432, s.m5w, { size: 10.5, color: C.muted, maxWidth: 100 }));
    a([[145, 422], [145, 536]], { color: C.worker.stroke });
    b(s.s6, 20, 536, 250, 96, "worker");
    a([[20, 584], [8, 584], [8, 161], [20, 161]], { color: C.worker.stroke, dashed: true });
    s.note.forEach((line, i) => body.push(text(10, 666 + i * 20, line, { size: 12, color: C.muted, maxWidth: width - 20 })));
    return svg({ width, height: 702, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  let y = 56;
  const tops = [];
  s.narrow.forEach(([kind, item], i) => {
    const h = 40 + item.lines.length * 18;
    b(item, 26, y, 394, h, kind);
    tops.push([y, h]);
    if (i < s.narrow.length - 1) a([[223, y + h], [223, y + h + 22]], { color: kind === "agent" ? C.agent.stroke : C.worker.stroke });
    y += h + 22;
  });
  const [lastY, lastH] = tops.at(-1);
  a([[26, lastY + lastH / 2], [12, lastY + lastH / 2], [12, tops[0][0] + tops[0][1] / 2], [26, tops[0][0] + tops[0][1] / 2]], { color: C.worker.stroke, dashed: true });
  s.noteNarrow.forEach((line, i) => body.push(text(10, y + 6 + i * 18, line, { size: 12, color: C.muted, maxWidth: 410 })));
  return svg({ width, height: y + 6 + s.noteNarrow.length * 18, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function pipeline(lang, narrow = false) {
  const s = S[lang].pipeline;
  const width = narrow ? NW : W;
  const body = [];
  const b = (item, x, y, w, h, kind, extra = {}) => body.push(box({ ...item, x, y, w, h, kind, size: 12, titleSize: 13, ...extra }));
  const a = (points, opts) => body.push(arrow(points, opts));
  const label = (x, y, s2, opts = {}) => body.push(text(x, y, s2, { size: 10.5, color: C.muted, ...opts }));
  body.push(header(10, 10, width - 20, s.title, C.worker.title));
  if (!narrow) {
    const AX = 10;
    const WX = 470;
    const BW = 380;
    const BH = 74;
    body.push(header(AX, 54, BW, s.laneAgent, C.agent.title));
    body.push(header(WX, 54, BW, s.laneWorker, C.worker.title));
    const row = (i) => 106 + i * 114;
    // agent ⇄ worker in one row: files to the worker, a fix request back
    const exchange = (y) => {
      a([[AX + BW, y + 26], [WX, y + 26]], { color: C.agent.stroke });
      label(430, y + 20, s.files, { anchor: "middle", maxWidth: 76 });
      a([[WX, y + 52], [AX + BW, y + 52]], { color: C.worker.stroke, dashed: true });
      label(430, y + 68, s.fix, { anchor: "middle", maxWidth: 76 });
    };
    b(s.research, AX, row(0), BW, BH, "agent", { dashed: true });
    b(s.researchCheck, WX, row(0), BW, BH, "worker");
    exchange(row(0));
    a([[560, row(0) + BH], [560, row(0) + BH + 20], [200, row(0) + BH + 20], [200, row(1)]], { color: C.worker.stroke });
    label(380, row(0) + BH + 16, s.next, { anchor: "middle", maxWidth: 300 });
    b(s.hcd, AX, row(1), BW, BH, "agent");
    b(s.hcdCheck, WX, row(1), BW, BH, "worker");
    exchange(row(1));
    a([[660, row(1) + BH], [660, row(2)]], { color: C.worker.stroke });
    label(668, row(1) + BH + 24, s.accepted, { maxWidth: 160 });
    b(s.candidates, WX, row(2), BW, BH, "worker");
    a([[560, row(2) + BH], [560, row(2) + BH + 20], [200, row(2) + BH + 20], [200, row(3)]], { color: C.worker.stroke });
    label(380, row(2) + BH + 16, s.cand, { anchor: "middle", maxWidth: 300 });
    b(s.frg, AX, row(3), BW, BH, "agent");
    b(s.frgCheck, WX, row(3), BW, BH, "worker");
    exchange(row(3));
    a([[560, row(3) + BH], [560, row(3) + BH + 20], [200, row(3) + BH + 20], [200, row(4)]], { color: C.warn.stroke, dashed: true });
    label(380, row(3) + BH + 16, s.adj, { anchor: "middle", maxWidth: 300 });
    a([[760, row(3) + BH], [760, row(4)]], { color: C.worker.stroke });
    label(768, row(3) + BH + 24, s.noAdj, { maxWidth: 80 });
    b(s.adjust, AX, row(4), BW, BH, "agent", { dashed: true });
    b(s.recheck, WX, row(4), BW, BH, "worker");
    exchange(row(4));
    a([[660, row(4) + BH], [660, row(5)]], { color: C.worker.stroke });
    label(668, row(4) + BH + 24, s.accepted, { maxWidth: 160 });
    b(s.noLlm, AX, row(5), BW, BH, "plain", { dashed: true });
    b(s.outputs, WX, row(5), BW, BH, "worker");
    s.note.forEach((line, i) => body.push(text(10, row(5) + BH + 32 + i * 20, line, { size: 12, color: C.muted, maxWidth: width - 20 })));
    return svg({ width, height: row(5) + BH + 32 + s.note.length * 20 + 4, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  const lg = legendRows([["agent", s.laneAgent], ["worker", s.laneWorker]], 62, width - 10);
  body.push(lg.svg);
  let y = lg.bottom + 18;
  const steps = [
    [s.research, "agent", true, s.files],
    [s.researchCheck, "worker", false, s.next],
    [s.hcd, "agent", false, s.files],
    [s.hcdCheck, "worker", false, s.accepted],
    [s.candidates, "worker", false, s.cand],
    [s.frg, "agent", false, s.files],
    [s.frgCheck, "worker", false, s.adj],
    [s.adjust, "agent", true, s.files],
    [s.recheck, "worker", false, s.accepted],
    [s.outputs, "worker", false, null],
  ];
  const BH = 74;
  const GAP = 30;
  const tops = steps.map((_, i) => y + i * (BH + GAP));
  steps.forEach(([item, kind, dashed, after], i) => {
    const top = tops[i];
    b(item, 26, top, 394, BH, kind, { dashed });
    body.push(pill(412, top + 8, kind === "agent" ? s.tagAgent : s.tagWorker, { kind, size: 10, anchor: "end" }));
    if (after) {
      a([[223, top + BH], [223, top + BH + GAP]], { color: kind === "agent" ? C.agent.stroke : C.worker.stroke });
      label(232, top + BH + 19, after, { maxWidth: 186 });
    }
    // a check that finds problems sends a fix request back to the agent turn above it
    if (kind === "worker" && i > 0 && steps[i - 1][1] === "agent") {
      a([[26, top + BH / 2], [12, top + BH / 2], [12, tops[i - 1] + BH / 2], [26, tops[i - 1] + BH / 2]], { color: C.worker.stroke, dashed: true });
    }
  });
  y = tops.at(-1) + BH;
  const noLlm = `${s.noLlm.title}：${s.noLlm.lines[0]}`;
  body.push(text(10, y + 24, lang === "ja" ? noLlm : `${s.noLlm.title}: ${s.noLlm.lines[0]}`, { size: 12, color: C.muted, maxWidth: 410 }));
  s.noteNarrow.forEach((line, i) => body.push(text(10, y + 46 + i * 18, line, { size: 12, color: C.muted, maxWidth: 410 })));
  return svg({ width, height: y + 46 + s.noteNarrow.length * 18, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const HARNESS_CURRENT_FIGURES = {
  "harness-current-architecture": [architecture, (lang) => architecture(lang, true)],
  "harness-current-turn": [turn, (lang) => turn(lang, true)],
  "harness-current-pipeline": [pipeline, (lang) => pipeline(lang, true)],
};
