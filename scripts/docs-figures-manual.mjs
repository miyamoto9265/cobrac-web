// Figures of the user manual (docs/manual/*.md). Rendered by docs-figures.mjs into docs/manual/figures/.
import { C, NW, arrow, badge, box, svg, text } from "./docs-figures-lib.mjs";

const W = 880;

const S = {
  ja: {
    overview: {
      title: "CoBRAC Agents の流れ：ROI と TLF から BRA データまで",
      desc: "ROI（対象領域）と TLF（トップレベル機能）を入れて実行すると、エージェントが調査（調査モードのとき）、HCD と FRG の往復、CSV、BRA xlsx の順に作ります。各ステップが終わるとプロジェクト画面に成果物が出ます。質問が来たらエージェント欄で答え、完了後は追加の指示で直せます。",
      steps: [
        { title: "入力", lines: ["ROI・TLF", "参考資料（任意）"] },
        { title: "調査", lines: ["調査モードのとき", "文献を集める"] },
        { title: "HCD ⇄ FRG", lines: ["回路と機能の分解", "食い違いを調整"] },
        { title: "CSV", lines: ["5 つの表"] },
        { title: "BRA xlsx", lines: ["CoBRAC 形式", "Template-v2-2"] },
      ],
      lane: "成果物は各ステップの後にプロジェクト画面に出ます",
      agent: { title: "エージェント欄", lines: ["質問が来たら回答する（作業はそこで止まって待つ）", "完了後は「追加の指示」で直す"] },
      agentNarrow: { title: "エージェント欄", lines: ["質問が来たら回答する", "完了後は「追加の指示」で直す"] },
    },
    start: {
      title: "使い始めるまでの 4 つの手順",
      desc: "1. メールアドレスとパスワードでアカウントを作る。2. メールに届いた確認コードを入れる。3. 設定画面で自分の OpenAI API キーを登録するか、管理者にデフォルトの API キーの利用を承認してもらう。4. 新規プロジェクトで ROI と TLF を入れて実行する。",
      steps: [
        { title: "アカウント作成", lines: ["メールアドレスと", "パスワード（10 文字以上）"] },
        { title: "確認コード", lines: ["メールに届いた", "コードを入力"] },
        { title: "API キー", lines: ["自分のキーを登録", "またはデフォルトの", "API キーの承認"] },
        { title: "新規プロジェクト", lines: ["ROI と TLF を", "入れて実行"] },
      ],
    },
    workspace: {
      title: "プロジェクト画面の構成",
      desc: "上のヘッダーに名前・状態・ROI と TLF・モデル・利用量、停止とリトライ、BRA xlsx のダウンロード、公開、Canon への push、削除が並び、その下に進み具合が出ます。成果物はタブ（HCD、FRG、表データ、レポート、判断ログ、解説記事）で切り替えます。右のエージェント欄に作業のログ、質問、入力欄があります。スマホではエージェント欄はボタンで開きます。",
      header: "ヘッダー：名前・状態・ROI / TLF・モデル・利用量",
      buttons: "停止 / リトライ · BRA xlsx · 公開 · push · 削除",
      progress: "進み具合：調査 → HCD ⇄ FRG → CSV → xlsx",
      tabs: ["HCD", "FRG", "表データ", "レポート", "判断ログ", "解説記事"],
      center: { title: "成果物", lines: ["グラフ・表・文書を表示", "グラフはノードを選ぶと詳細"] },
      agentHead: "エージェント",
      agent: ["作業のログ", "（思考・実行は折りたたみ）", "", "質問（黄色の枠）", "選択肢のボタン", "", "入力欄", "回答 / 追加の指示"],
      sidebar: ["新規", "履歴", "", "一覧", "Canon", "公開", "設定"],
      narrowAgent: { title: "エージェント", lines: ["タブの右の「エージェント」で開く", "ログ・質問・入力欄"] },
    },
    canon: {
      title: "Canon の基本：push、審査、承認、rev",
      desc: "完了した参加プロジェクトの画面で「Canon に push」すると PR ができます。所有者か共同編集者が、変更・検査・AI レビュー・履歴を見て判断します。承認すると Canon に新しい rev ができ、参加プロジェクトは従う rev を進めて次の実行から使います。変更を依頼されたら直して push し直します。",
      steps: [
        { title: "参加プロジェクト", lines: ["完了したら", "「Canon に push」"] },
        { title: "PR", lines: ["変更・検査", "AI レビュー・履歴"] },
        { title: "審査", lines: ["所有者か", "共同編集者が判断"] },
        { title: "新しい rev", lines: ["承認 1 人で", "Canon が更新"] },
      ],
      back: "参加プロジェクトは従う rev を進めて次の実行から使う",
      backNarrow: ["参加プロジェクトは従う rev を", "進めて次の実行から使う"],
      request: "変更を依頼 → 直して push し直す",
      reject: "却下 → PR を閉じる",
    },
  },
  en: {
    overview: {
      title: "How CoBRAC Agents works: from ROI and TLF to BRA data",
      desc: "Enter an ROI (region of interest) and a TLF (top-level function) and run: the agent does the research (in research mode), the HCD and FRG with round trips between them, the CSV files and the BRA xlsx. Each output appears on the project page when its step is done. Answer questions in the Agent panel; after completion, send follow-up instructions to change the result.",
      steps: [
        { title: "Input", lines: ["ROI · TLF", "materials (optional)"] },
        { title: "Research", lines: ["in research mode:", "gathers literature"] },
        { title: "HCD ⇄ FRG", lines: ["circuits and the", "function breakdown"] },
        { title: "CSV", lines: ["five tables"] },
        { title: "BRA xlsx", lines: ["CoBRAC format", "Template-v2-2"] },
      ],
      lane: "Each output appears on the project page when its step is done",
      agent: { title: "Agent panel", lines: ["Answer questions (the run waits for you)", "After completion, send follow-up instructions"] },
      agentNarrow: { title: "Agent panel", lines: ["Answer questions", "Send follow-up instructions"] },
    },
    start: {
      title: "Four steps to get started",
      desc: "1. Create an account with your e-mail address and a password. 2. Enter the confirmation code from the e-mail. 3. Register your own OpenAI API key in Settings, or have an admin approve you for the default API key. 4. Create a new project with an ROI and a TLF and run it.",
      steps: [
        { title: "Create account", lines: ["e-mail address and", "password (10+ chars)"] },
        { title: "Confirm", lines: ["enter the code", "from the e-mail"] },
        { title: "API key", lines: ["register your own", "or get approved for", "the default API key"] },
        { title: "New project", lines: ["enter ROI and TLF", "and run"] },
      ],
    },
    workspace: {
      title: "The project page",
      desc: "The header shows the name, status, ROI and TLF, model and usage, with stop and retry, the BRA xlsx downloads, publishing, push to Canon and delete; the progress is under it. Tabs switch between the outputs (HCD, FRG, Tables, Report, Decision log, Article). The Agent panel on the right holds the log, questions and the input box. On a phone the Agent panel opens with a button.",
      header: "Header: name · status · ROI / TLF · model · usage",
      buttons: "Stop / Retry · BRA xlsx · Publish · Push · Delete",
      progress: "Progress: research → HCD ⇄ FRG → CSV → xlsx",
      tabs: ["HCD", "FRG", "Tables", "Report", "Log", "Article"],
      center: { title: "Outputs", lines: ["graphs, tables and documents", "select a node for its details"] },
      agentHead: "Agent",
      agent: ["Log of the run", "(steps are folded)", "", "Question (amber box)", "option buttons", "", "Input box", "answer / follow-up"],
      sidebar: ["New", "History", "", "Projects", "Canons", "Library", "Settings"],
      narrowAgent: { title: "Agent", lines: ["Opens with “Agent” next to the tabs", "log · questions · input box"] },
    },
    canon: {
      title: "Canon basics: push, review, approve, rev",
      desc: "On a completed member project, “Push to Canon” creates a pull request (PR). The owner or a co-editor reviews its changes, checks, AI review and history and decides. Approving creates a new rev of the Canon; member projects move to that rev and use it from their next run. When changes are requested, fix the project and push again.",
      steps: [
        { title: "Member project", lines: ["when completed,", "“Push to Canon”"] },
        { title: "Pull request", lines: ["changes · checks", "AI review · history"] },
        { title: "Review", lines: ["the owner or a", "co-editor decides"] },
        { title: "New rev", lines: ["one approval", "updates the Canon"] },
      ],
      back: "Member projects move to the new rev and use it from their next run",
      backNarrow: ["Member projects move to the new rev", "and use it from their next run"],
      request: "Request changes → fix and push again",
      reject: "Reject → the PR is closed",
    },
  },
};

/** Boxes in a row joined by arrows, with a step number on each. */
function row(steps, { x = 20, y, w, h, gap, kind = "worker", numbered = false }) {
  const out = [];
  steps.forEach((st, i) => {
    const bx = x + i * (w + gap);
    out.push(box({ x: bx, y, w, h, kind: st.kind ?? kind, title: st.title, lines: st.lines, size: 12.5, titleSize: 14, align: "middle" }));
    if (numbered) out.push(badge(bx + 4, y + 4, i + 1, C.worker.stroke));
    if (i < steps.length - 1) out.push(arrow([[bx + w + 3, y + h / 2], [bx + w + gap - 3, y + h / 2]]));
  });
  return out.join("\n");
}

/** The same boxes stacked for phones. */
function column(steps, { x = 20, y, w, h, gap = 26, kind = "worker", numbered = false }) {
  const out = [];
  steps.forEach((st, i) => {
    const by = y + i * (h + gap);
    out.push(box({ x, y: by, w, h, kind: st.kind ?? kind, title: st.title, lines: st.lines, size: 12.5, titleSize: 14, align: "middle" }));
    if (numbered) out.push(badge(x + 4, by + 4, i + 1, C.worker.stroke));
    if (i < steps.length - 1) out.push(arrow([[x + w / 2, by + h + 2], [x + w / 2, by + h + gap - 2]]));
  });
  return { svg: out.join("\n"), bottom: y + steps.length * (h + gap) - gap };
}

function overview(lang, narrow = false) {
  const s = S[lang].overview;
  const steps = s.steps.map((st, i) => ({ ...st, kind: i === 0 ? "plain" : i === 2 ? "agent" : "worker" }));
  if (narrow) {
    const w = NW - 40;
    const col = column(steps, { y: 20, w, h: 64, gap: 24 });
    const y = col.bottom + 22;
    const body = [
      col.svg,
      text(NW / 2, y + 4, s.lane, { size: 12, color: C.muted, anchor: "middle", maxWidth: w }),
      box({ x: 20, y: y + 20, w, h: 76, kind: "warn", title: s.agentNarrow.title, lines: s.agentNarrow.lines, size: 12.5, align: "middle" }),
    ];
    return svg({ width: NW, height: y + 116, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  const w = 146;
  const gap = 26;
  const x = (W - 5 * w - 4 * gap) / 2;
  const body = [
    row(steps, { x, y: 24, w, h: 84, gap }),
    text(W / 2, 140, s.lane, { size: 12.5, color: C.muted, anchor: "middle", maxWidth: W - 40 }),
    arrow([[x + 2 * (w + gap) + w / 2, 160], [x + 2 * (w + gap) + w / 2, 112]], { color: C.warn.stroke, dashed: true }),
    box({ x: x + (w + gap), y: 160, w: 3 * w + 2 * gap, h: 70, kind: "warn", title: s.agent.title, lines: s.agent.lines, size: 12.5 }),
  ];
  return svg({ width: W, height: 250, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function start(lang, narrow = false) {
  const s = S[lang].start;
  const steps = s.steps.map((st, i) => ({ ...st, kind: i === 2 ? "warn" : i === 3 ? "code" : "plain" }));
  if (narrow) {
    const col = column(steps, { x: 30, y: 20, w: NW - 50, h: 74, gap: 24, numbered: true });
    return svg({ width: NW, height: col.bottom + 20, title: s.title, desc: s.desc, body: col.svg, lang });
  }
  return svg({ width: W, height: 140, title: s.title, desc: s.desc, body: row(steps, { x: 24, y: 24, w: 190, h: 92, gap: 30, numbered: true }), lang });
}

function workspace(lang, narrow = false) {
  const s = S[lang].workspace;
  const frame = (x, y, w, h, fill = "#ffffff", stroke = "#cbd5e1") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
  const tabRow = (x, y, w, names, active = 0) => {
    const tw = (w - (names.length - 1) * 4) / names.length;
    return names
      .map((n, i) => frame(x + i * (tw + 4), y, tw, 26, i === active ? "#ffffff" : "#f1f5f9", i === active ? C.worker.stroke : "#cbd5e1") + text(x + i * (tw + 4) + tw / 2, y + 17.5, n, { size: 11.5, anchor: "middle", maxWidth: tw - 6, weight: i === active ? 700 : 400 }))
      .join("\n");
  };
  if (narrow) {
    const w = NW - 40;
    const x = 20;
    const body = [
      frame(x, 20, w, 58, C.worker.fill, C.worker.stroke),
      text(x + 10, 42, s.header, { size: 11.5, maxWidth: w - 20, weight: 700, color: C.worker.title }),
      text(x + 10, 62, s.buttons, { size: 11, maxWidth: w - 20, color: C.muted }),
      frame(x, 86, w, 30, C.code.fill, C.code.stroke),
      text(x + 10, 105, s.progress, { size: 11.5, maxWidth: w - 20 }),
      tabRow(x, 124, w, s.tabs.slice(0, 3)),
      tabRow(x, 154, w, s.tabs.slice(3), -1),
      box({ x, y: 188, w, h: 84, kind: "plain", title: s.center.title, lines: s.center.lines, size: 12, align: "middle" }),
      box({ x, y: 284, w, h: 74, kind: "warn", title: s.narrowAgent.title, lines: s.narrowAgent.lines, size: 12, align: "middle" }),
    ];
    return svg({ width: NW, height: 378, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  const sideW = 96;
  const agentW = 210;
  const x0 = 20 + sideW + 8;
  const midW = W - 40 - sideW - agentW - 16;
  const ax = x0 + midW + 8;
  const body = [
    frame(20, 20, sideW, 330, "#1e293b", "#1e293b"),
    ...s.sidebar.map((l, i) => (l ? text(32, 46 + i * 22 + (i > 2 ? 150 : 0), l, { size: 11.5, color: "#e2e8f0", maxWidth: sideW - 20 }) : "")),
    frame(x0, 20, midW, 62, C.worker.fill, C.worker.stroke),
    text(x0 + 12, 44, s.header, { size: 12.5, weight: 700, color: C.worker.title, maxWidth: midW - 24 }),
    text(x0 + 12, 66, s.buttons, { size: 11.5, color: C.muted, maxWidth: midW - 24 }),
    frame(x0, 90, midW, 30, C.code.fill, C.code.stroke),
    text(x0 + 12, 109, s.progress, { size: 12, maxWidth: midW - 24 }),
    tabRow(x0, 128, midW, s.tabs),
    box({ x: x0, y: 162, w: midW, h: 188, kind: "plain", title: s.center.title, lines: s.center.lines, size: 12.5, align: "middle" }),
    frame(ax, 20, agentW, 330, C.warn.fill, C.warn.stroke),
    text(ax + agentW / 2, 44, s.agentHead, { size: 14, weight: 700, color: C.warn.title, anchor: "middle", maxWidth: agentW - 20 }),
    ...s.agent.map((l, i) => (l ? text(ax + 14, 78 + i * 24, l, { size: 12, maxWidth: agentW - 28, color: i % 3 === 0 ? C.text : C.muted, weight: i % 3 === 0 ? 700 : 400 }) : "")),
  ];
  return svg({ width: W, height: 370, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function canon(lang, narrow = false) {
  const s = S[lang].canon;
  const steps = s.steps.map((st, i) => ({ ...st, kind: i === 0 ? "plain" : i === 2 ? "warn" : i === 3 ? "code" : "worker" }));
  if (narrow) {
    const w = NW - 80;
    const col = column(steps, { x: 20, y: 20, w, h: 66, gap: 26 });
    const right = 20 + w;
    const lastMid = 20 + 3 * (66 + 26) + 33;
    const y = col.bottom + 24;
    const body = [
      col.svg,
      arrow([[right + 2, lastMid], [right + 26, lastMid], [right + 26, 53], [right + 4, 53]], { color: C.code.stroke }),
      ...s.backNarrow.map((l, i) => text(20, y + i * 18, l, { size: 12, color: C.code.title, maxWidth: NW - 40 })),
      text(20, y + 46, s.request, { size: 12, color: C.warn.title, maxWidth: NW - 40 }),
      text(20, y + 66, s.reject, { size: 12, color: C.muted, maxWidth: NW - 40 }),
    ];
    return svg({ width: NW, height: y + 84, title: s.title, desc: s.desc, body: body.join("\n"), lang });
  }
  const w = 176;
  const gap = 44;
  const x = 30;
  const h = 80;
  const y = 52;
  const reviewX = x + 2 * (w + gap);
  const body = [
    row(steps, { x, y, w, h, gap }),
    arrow([[x + 3 * (w + gap) + w / 2, y + h + 2], [x + 3 * (w + gap) + w / 2, y + h + 46], [x + w / 2, y + h + 46], [x + w / 2, y + h + 4]], { color: C.code.stroke }),
    text((x + w / 2 + x + 3 * (w + gap) + w / 2) / 2, y + h + 66, s.back, { size: 12.5, color: C.code.title, anchor: "middle", maxWidth: W - 60 }),
    arrow([[reviewX + w / 2, y - 2], [reviewX + w / 2, y - 18], [x + w / 2, y - 18], [x + w / 2, y - 3]], { color: C.warn.stroke, dashed: true }),
    text(x + w + gap / 2 + 8, y - 24, s.request, { size: 12, color: C.warn.title, maxWidth: 2 * (w + gap) }),
    text(reviewX + w / 2, y + h + 26, s.reject, { size: 11.5, color: C.muted, anchor: "middle", maxWidth: w + gap }),
  ];
  return svg({ width: W, height: y + h + 86, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const MANUAL_FIGURES = {
  "manual-overview": [overview, (lang) => overview(lang, true)],
  "manual-start": [start, (lang) => start(lang, true)],
  "manual-workspace": [workspace, (lang) => workspace(lang, true)],
  "manual-canon": [canon, (lang) => canon(lang, true)],
};
