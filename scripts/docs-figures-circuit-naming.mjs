// Figures of docs/08_Circuit_naming*.md (UC Descriptor, facets and Circuit ID). Rendered by docs-figures.mjs.
import { C, NW, arrow, box, header, pill, svg, text } from "./docs-figures-lib.mjs";

const W = 860;
const OLD = "#b45309";
const NEW = "#0d9488";

const S = {
  ja: {
    overview: {
      title: "回路の名前：プロジェクトごとの自由な名前から、SABRA に基づく記述子へ",
      desc: "0.7.0 より前は、プロジェクトごとにエージェントが自由な名前を付けていた。同じ側坐核 shell の DRD1 陽性集団でも、プロジェクト A は NAc_shell_D1、プロジェクト B は NACs-DRD1 と書くことがあり、名前から同じ集団かどうかを判定できず、アトラスとの対応もなかった。0.7.0 以降は、どのプロジェクトも RCS で SABRA の単位（アンカー）を引き、細かい性質をファセットとして足して UC Descriptor HOMBA:10341/mol:DRD1+ を作る。Circuit ID NACs(DRD1+) はその人が読む別名で、記述子が同じなら同じ UC として扱える。",
      beforeHead: "0.7.0 より前：プロジェクトごとの自由な名前",
      afterHead: "0.7.0 以降：SABRA のアンカー + ファセット",
      projA: "プロジェクト A",
      projB: "プロジェクト B",
      namesA: ["`NAc_shell_D1`、`L-DLPFC`、`CA3-Pyr`"],
      namesB: ["`NACs-DRD1`、`DLPFC_L`、`CA3pyr`"],
      example: "（名前は説明のための例）",
      bad: { title: "同じ集団かどうかを名前から判定できない", lines: ["アトラスとの対応もない"] },
      rcs: ["RCS で SABRA の", "単位を引く"],
      descriptor: { title: "UC Descriptor（機械のキー）", lines: ["`HOMBA:10341/mol:DRD1+`"] },
      circuit: { title: "Circuit ID（人が読む別名）", lines: ["`NACs(DRD1+)`"] },
      same: "記述子が同じなら、どのプロジェクトでも同じ UC",
    },
    build: {
      title: "UC Descriptor から Circuit ID を組み立てる",
      desc: "UC Descriptor BNA:57-58/lay:L5/cell:pt/out:HOMBA:AA30565/side:left から Circuit ID A4ul(L5.pt.out-Sp.left) を組み立てる。アンカー BNA:57-58 は正式略称 A4ul になり、ファセットの値は記述子の順に括弧の中へ . で区切って並ぶ。層 L5 と細胞クラス pt は語のまま、投射先 out:HOMBA:AA30565（脊髄）は out-Sp、左右 side:left は最後の項目 left になる。ファセットの軸は part、lay、cell、nt、mol、in、out、resp、side の 9 本で、この順に並べ、空の軸は書かない。",
      descHead: "UC Descriptor（機械のキー）",
      idHead: "Circuit ID（人が読む別名）",
      rows: [
        ["`BNA:57-58`", "アンカー（BNA の左右ペア）", "`A4ul`", "正式略称そのまま"],
        ["`lay:L5`", "層", "`L5`", "語のまま"],
        ["`cell:pt`", "細胞クラス（錐体路細胞）", "`pt`", "語のまま"],
        ["`out:HOMBA:AA30565`", "投射先（脊髄）", "`out-Sp`", "`out-` + 相手の略称"],
        ["`side:left`", "左右（いつも最後の軸）", "`left`", "いつも最後の項目"],
      ],
      rule: "括弧の中は `.` で区切り、ファセットの順に並べる。ファセットが無ければ略称だけ（`VTA`）",
      axesHead: "ファセットの 9 本の軸（この順に並べ、空の軸は書かない）",
      axes: [
        ["part", "部位"],
        ["lay", "層"],
        ["cell", "細胞"],
        ["nt", "伝達物質"],
        ["mol", "分子"],
        ["in", "入力元"],
        ["out", "投射先"],
        ["resp", "反応"],
        ["side", "左右"],
      ],
    },
    legacy: {
      title: "旧い形の読み替え（v0.17.0）",
      desc: "保存済みのデータは書き換えない。読むときに UC Descriptor は canonicalUcDescriptor で現在の形にする。BNA:57 は BNA:57-58/side:left、BNAG:FuG@L は BNAG:FuG/side:left、HOMBA:12261@R は HOMBA:12261/side:right になる。Circuit ID は modernCircuitId で現在の形にする。A4ul@L(L5,pt,out:Sp) は A4ul(L5.pt.out-Sp.left)、NAC(shell,DRD1+) は NAC(shell.DRD1+)、A9/46d@L(L3) は A9/46d(L3.left) になる。検証は次のフォローアップで現在の形への書き直しを求め、Canon は旧い形と新しい形を同じ回路・同じ ID として比べ、ビューアと CSV・xlsx は保存された ID をそのまま出す。",
      oldHead: "保存済みの旧い形（書き換えない）",
      newHead: "読むときの現在の形",
      descGroup: "UC Descriptor（`canonicalUcDescriptor`）",
      idGroup: "Circuit ID（`modernCircuitId`）",
      descRows: [
        ["`BNA:57`", "`BNA:57-58/side:left`"],
        ["`BNAG:FuG@L`", "`BNAG:FuG/side:left`"],
        ["`HOMBA:12261@R`", "`HOMBA:12261/side:right`"],
      ],
      idRows: [
        ["`A4ul@L(L5,pt,out:Sp)`", "`A4ul(L5.pt.out-Sp.left)`"],
        ["`NAC(shell,DRD1+)`", "`NAC(shell.DRD1+)`"],
        ["`A9/46d@L(L3)`", "`A9/46d(L3.left)`"],
      ],
      uses: [
        { title: "検証", lines: ["次のフォローアップで", "現在の形への書き直しを求める"] },
        { title: "Canon", lines: ["旧い形と現在の形を", "同じ回路・同じ ID として比べる"] },
        { title: "出力", lines: ["ビューアと CSV・xlsx は", "保存された ID をそのまま出す"] },
      ],
    },
    canon: {
      title: "Canon は UC Descriptor をキーにする",
      desc: "プロジェクトの uc.json は Circuit ID と UC Descriptor を持つ。push や PR のとき、Canon は記述子を正規化した形（現在の形、mol の値の並べ替え、小文字化）をキーにして回路を照合し、エントリに Circuit ID、正式名、Uniform / Collection、Sub-Circuits を持つ。照合の結果、Circuit ID と記述子が 1 対 1 でない（C4）、同じ記述子で Uniform と Collection が違う（C1）、Uniform の回路と同じアンカーのより細かい回路が並ぶ（C3）、正式名が違う（C6）ときは、生成時には修正ターンでエージェントに戻す。旧い形のキーと ID は現在の形にして比べる。",
      project: { title: "プロジェクトの `uc.json`", lines: ["Circuit ID `A4ul(left)`", "記述子 `BNA:57-58/side:left`"] },
      key: { title: "Canon のキー", lines: ["正規化した記述子", "`bna:57-58/side:left`"] },
      entry: { title: "Canon のエントリ", lines: ["Circuit ID・正式名", "Uniform/Collection・Sub-Circuits"] },
      push: "push / PR",
      match: "照合",
      checksHead: "キーで照合して見る主な衝突（生成時は修正ターンで戻す）",
      checks: [
        { title: "C4", lines: ["Circuit ID と記述子が", "1 対 1 でない"] },
        { title: "C1", lines: ["同じ記述子で Uniform と", "Collection が違う"] },
        { title: "C3", lines: ["Uniform の回路の隣に", "より細かい回路がある"] },
        { title: "C6", lines: ["正式名（`names` の", "先頭）が違う"] },
      ],
      legacy: "旧い形（`bna:29`、`A44d@L`）は現在の形にして比べ、違いは PR に改名として出る",
    },
  },
  en: {
    overview: {
      title: "Circuit names: from free names per project to descriptors based on SABRA",
      desc: "Before 0.7.0 the agent gave circuits free names in each project. The same DRD1-positive population of the nucleus accumbens shell might be NAc_shell_D1 in project A and NACs-DRD1 in project B, so the names could not tell whether two projects meant the same population, and they had no link to an atlas. Since 0.7.0 every project looks up the SABRA unit (the anchor) with RCS and adds the finer properties as facets, giving the UC Descriptor HOMBA:10341/mol:DRD1+. The Circuit ID NACs(DRD1+) is its human-readable alias; the same descriptor means the same UC.",
      beforeHead: "Before 0.7.0: free names per project",
      afterHead: "Since 0.7.0: SABRA anchor + facets",
      projA: "Project A",
      projB: "Project B",
      namesA: ["`NAc_shell_D1`, `L-DLPFC`, `CA3-Pyr`"],
      namesB: ["`NACs-DRD1`, `DLPFC_L`, `CA3pyr`"],
      example: "(names are illustrative)",
      bad: { title: "Names cannot tell if it is the same population", lines: ["and they have no link to an atlas"] },
      rcs: ["look up the SABRA", "unit with RCS"],
      descriptor: { title: "UC Descriptor (machine key)", lines: ["`HOMBA:10341/mol:DRD1+`"] },
      circuit: { title: "Circuit ID (human-readable alias)", lines: ["`NACs(DRD1+)`"] },
      same: "The same descriptor is the same UC in every project",
    },
    build: {
      title: "Building the Circuit ID from the UC Descriptor",
      desc: "The Circuit ID A4ul(L5.pt.out-Sp.left) is built from the UC Descriptor BNA:57-58/lay:L5/cell:pt/out:HOMBA:AA30565/side:left. The anchor BNA:57-58 becomes its official abbreviation A4ul, and the facet values follow in the parentheses in descriptor order, separated by a dot. The layer L5 and the cell class pt stay as they are, the projection target out:HOMBA:AA30565 (spinal cord) becomes out-Sp, and side:left becomes the last item left. The nine facet axes are part, lay, cell, nt, mol, in, out, resp and side, in this order; empty axes are left out.",
      descHead: "UC Descriptor (machine key)",
      idHead: "Circuit ID (human-readable alias)",
      rows: [
        ["`BNA:57-58`", "anchor (BNA left-right pair)", "`A4ul`", "official abbreviation"],
        ["`lay:L5`", "layer", "`L5`", "token as is"],
        ["`cell:pt`", "cell class (pyramidal tract)", "`pt`", "token as is"],
        ["`out:HOMBA:AA30565`", "projection target (spinal cord)", "`out-Sp`", "`out-` + partner"],
        ["`side:left`", "side (always the last axis)", "`left`", "always the last item"],
      ],
      rule: "Items in the parentheses are separated by `.`, in facet order. No facets: the abbreviation alone (`VTA`)",
      axesHead: "The nine facet axes (in this order; empty axes are left out)",
      axes: [
        ["part", "part"],
        ["lay", "layer"],
        ["cell", "cell"],
        ["nt", "transmitter"],
        ["mol", "molecule"],
        ["in", "input"],
        ["out", "target"],
        ["resp", "response"],
        ["side", "side"],
      ],
    },
    legacy: {
      title: "Reading older forms (v0.17.0)",
      desc: "Stored data is not rewritten. When read, a UC Descriptor is brought to the current form by canonicalUcDescriptor: BNA:57 becomes BNA:57-58/side:left, BNAG:FuG@L becomes BNAG:FuG/side:left and HOMBA:12261@R becomes HOMBA:12261/side:right. A Circuit ID is brought to the current form by modernCircuitId: A4ul@L(L5,pt,out:Sp) becomes A4ul(L5.pt.out-Sp.left), NAC(shell,DRD1+) becomes NAC(shell.DRD1+) and A9/46d@L(L3) becomes A9/46d(L3.left). The checks ask for the current form at the next follow-up, the Canon compares old and current forms as the same circuit and the same ID, and the viewer and the CSV / xlsx show the stored ID as it is.",
      oldHead: "Stored older form (not rewritten)",
      newHead: "Current form when read",
      descGroup: "UC Descriptor (`canonicalUcDescriptor`)",
      idGroup: "Circuit ID (`modernCircuitId`)",
      descRows: [
        ["`BNA:57`", "`BNA:57-58/side:left`"],
        ["`BNAG:FuG@L`", "`BNAG:FuG/side:left`"],
        ["`HOMBA:12261@R`", "`HOMBA:12261/side:right`"],
      ],
      idRows: [
        ["`A4ul@L(L5,pt,out:Sp)`", "`A4ul(L5.pt.out-Sp.left)`"],
        ["`NAC(shell,DRD1+)`", "`NAC(shell.DRD1+)`"],
        ["`A9/46d@L(L3)`", "`A9/46d(L3.left)`"],
      ],
      uses: [
        { title: "Checks", lines: ["ask for the current form", "at the next follow-up"] },
        { title: "Canon", lines: ["compares old and current", "as the same circuit and ID"] },
        { title: "Output", lines: ["the viewer and CSV / xlsx", "show the stored ID"] },
      ],
    },
    canon: {
      title: "A Canon is keyed by the UC Descriptor",
      desc: "A project's uc.json has the Circuit ID and the UC Descriptor. On a push or pull request the Canon matches circuits by the normalized descriptor (current form, mol values sorted, lower case) and keeps the Circuit ID, official name, Uniform / Collection and Sub-Circuits in the entry. When the Circuit ID and the descriptor are not one-to-one (C4), the same descriptor is Uniform in one place and a Collection in the other (C1), a Uniform circuit has a finer circuit of the same anchor beside it (C3) or the official names differ (C6), generation sends the problem back to the agent in a fix turn. Older keys and IDs are compared in their current form.",
      project: { title: "The project's `uc.json`", lines: ["Circuit ID `A4ul(left)`", "descriptor `BNA:57-58/side:left`"] },
      key: { title: "Canon key", lines: ["normalized descriptor", "`bna:57-58/side:left`"] },
      entry: { title: "Canon entry", lines: ["Circuit ID, official name", "Uniform/Collection, Sub-Circuits"] },
      push: "push / PR",
      match: "match",
      checksHead: "Main conflicts checked by the key (fixed in a fix turn)",
      checks: [
        { title: "C4", lines: ["Circuit ID and descriptor", "are not one-to-one"] },
        { title: "C1", lines: ["same descriptor, Uniform", "vs Collection"] },
        { title: "C3", lines: ["a finer circuit next to", "a Uniform circuit"] },
        { title: "C6", lines: ["different official name", "(first of `names`)"] },
      ],
      legacy: "Older forms (`bna:29`, `A44d@L`) are compared in the current form; the difference shows as a rename in the PR",
    },
  },
};

// ---------------------------------------------------------------------------

function overview(lang, narrow = false) {
  const s = S[lang].overview;
  const width = narrow ? NW : W;
  const pw = narrow ? width - 20 : 400;
  const body = [];
  const left = (x, y) => {
    body.push(header(x, y, pw, s.beforeHead, OLD));
    y += 42;
    body.push(box({ x, y, w: pw, h: 56, kind: "plain", title: s.projA, lines: s.namesA, size: 12, titleSize: 13 }));
    y += 66;
    body.push(box({ x, y, w: pw, h: 56, kind: "plain", title: s.projB, lines: s.namesB, size: 12, titleSize: 13 }));
    y += 60;
    body.push(text(x + pw - 4, y + 12, s.example, { size: 11, color: C.muted, anchor: "end" }));
    y += 22;
    body.push(box({ x, y, w: pw, h: 54, kind: "bad", title: s.bad.title, lines: s.bad.lines, size: 12, titleSize: 13, align: "middle" }));
    return y + 54;
  };
  const right = (x, y) => {
    body.push(header(x, y, pw, s.afterHead, NEW));
    y += 42;
    const bw = (pw - 16) / 2;
    for (const [i, name] of [s.projA, s.projB].entries()) {
      const bx = x + i * (bw + 16);
      body.push(box({ x: bx, y, w: bw, h: 62, kind: "worker", title: name, lines: s.rcs, size: 11.5, titleSize: 13, align: "middle" }));
      body.push(arrow([[bx + bw / 2, y + 62], [x + pw / 2 + (i ? 30 : -30), y + 92]], { color: C.agent.stroke }));
    }
    y += 94;
    body.push(box({ x, y, w: pw, h: 56, kind: "agent", title: s.descriptor.title, lines: s.descriptor.lines, size: 12, titleSize: 13, align: "middle" }));
    body.push(arrow([[x + pw / 2, y + 56], [x + pw / 2, y + 80]], { color: C.code.stroke }));
    y += 82;
    body.push(box({ x, y, w: pw, h: 56, kind: "code", title: s.circuit.title, lines: s.circuit.lines, size: 12.5, titleSize: 13, align: "middle" }));
    y += 66;
    body.push(pill(x + pw / 2, y, s.same, { kind: "code", anchor: "middle", size: 12 }));
    return y + 26;
  };
  let bottom;
  if (narrow) {
    const b1 = left(10, 10);
    bottom = right(10, b1 + 28);
  } else {
    bottom = Math.max(left(20, 10), right(440, 10));
  }
  return svg({ width, height: bottom + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function build(lang, narrow = false) {
  const s = S[lang].build;
  const width = narrow ? NW : W;
  const body = [];
  const lx = narrow ? 10 : 20;
  const lw = narrow ? 214 : 380;
  const rw = narrow ? 168 : 300;
  const rx = width - lx - rw;
  let y = 10;
  const short = (l) => (narrow ? l.split(/（| \(/)[0] : l);
  body.push(header(lx, y, lw, short(s.descHead), C.agent.stroke));
  body.push(header(rx, y, rw, short(s.idHead), NEW));
  y += 40;
  const full = "`BNA:57-58/lay:L5/cell:pt/out:HOMBA:AA30565/side:left`";
  if (narrow) {
    body.push(box({ x: lx, y, w: width - 20, h: 32, kind: "agent", lines: [full], size: 11.5, align: "middle" }));
    body.push(arrow([[width / 2, y + 32], [width / 2, y + 46]], { color: C.code.stroke }));
    body.push(box({ x: lx, y: y + 46, w: width - 20, h: 32, kind: "code", lines: ["`A4ul(L5.pt.out-Sp.left)`"], size: 12.5, align: "middle" }));
    y += 94;
  } else {
    body.push(box({ x: lx, y, w: lw, h: 34, kind: "agent", lines: [full], size: 12, align: "middle" }));
    body.push(box({ x: rx, y, w: rw, h: 34, kind: "code", lines: ["`A4ul(L5.pt.out-Sp.left)`"], size: 13, align: "middle" }));
    body.push(arrow([[lx + lw, y + 17], [rx, y + 17]], { color: C.code.stroke }));
    y += 50;
  }
  for (const [i, [d, dn, c, cn]] of s.rows.entries()) {
    const h = 46;
    const size = narrow ? 11 : 12;
    body.push(box({ x: lx, y, w: lw, h, kind: i === 0 ? "worker" : "plain", lines: [d, dn], size }));
    body.push(box({ x: rx, y, w: rw, h, kind: i === 0 ? "code" : "plain", lines: [c, cn], size }));
    body.push(arrow([[lx + lw, y + h / 2], [rx, y + h / 2]], { color: i === 0 ? C.code.stroke : C.line }));
    y += h + 10;
  }
  y += 2;
  if (narrow) {
    const [a, b] = s.rule.split(lang === "ja" ? "。" : ". ");
    body.push(text(lx, y + 12, a + (lang === "ja" ? "。" : "."), { size: 11.5, weight: 600, maxWidth: width - 20 }));
    body.push(text(lx, y + 30, b, { size: 11.5, weight: 600, maxWidth: width - 20 }));
    y += 44;
  } else {
    body.push(text(width / 2, y + 12, s.rule, { size: 12.5, weight: 600, anchor: "middle", maxWidth: width - 20 }));
    y += 28;
  }
  y += 10;
  body.push(text(lx, y + 12, s.axesHead, { size: 13, weight: 700, color: C.agent.title, maxWidth: width - 20 }));
  y += 24;
  const perRow = narrow ? 3 : 9;
  const ax = 10;
  const gap = narrow ? 10 : 6;
  const bw = (width - 2 * ax - gap * (perRow - 1)) / perRow;
  s.axes.forEach(([axis, label], i) => {
    const r = Math.floor(i / perRow);
    const col = i % perRow;
    const bx = ax + col * (bw + gap);
    const by = y + r * 62;
    body.push(box({ x: bx, y: by, w: bw, h: 50, kind: axis === "side" ? "warn" : "agent", title: `\`${axis}\``, lines: [label], size: 10.5, titleSize: 13, align: "middle" }));
    if (col < perRow - 1 && i < s.axes.length - 1) body.push(arrow([[bx + bw, by + 25], [bx + bw + gap, by + 25]], { color: C.agent.stroke, width: 1.3 }));
  });
  y += Math.ceil(s.axes.length / perRow) * 62 - 12;
  return svg({ width, height: y + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function legacy(lang, narrow = false) {
  const s = S[lang].legacy;
  const width = narrow ? NW : W;
  const body = [];
  const lx = 10;
  const lw = narrow ? 186 : 330;
  const rw = narrow ? 206 : 330;
  const rx = width - lx - rw;
  const short = (l) => (narrow ? l.split(/（| \(/)[0] : l);
  let y = 10;
  body.push(header(lx, y, lw, short(s.oldHead), OLD));
  body.push(header(rx, y, rw, short(s.newHead), NEW));
  y += 42;
  const size = narrow ? 11 : 12.5;
  for (const [label, rows] of [
    [s.descGroup, s.descRows],
    [s.idGroup, s.idRows],
  ]) {
    body.push(text(lx + 2, y + 13, label, { size: 12.5, weight: 700, color: C.text, maxWidth: width - 20 }));
    y += 22;
    for (const [o, n] of rows) {
      body.push(box({ x: lx, y, w: lw, h: 32, kind: "warn", lines: [o], size, align: "middle" }));
      body.push(box({ x: rx, y, w: rw, h: 32, kind: "code", lines: [n], size, align: "middle" }));
      body.push(arrow([[lx + lw, y + 16], [rx, y + 16]], { color: C.line }));
      y += 40;
    }
    y += 6;
  }
  y += 4;
  if (narrow) {
    for (const u of s.uses) {
      body.push(box({ x: lx, y, w: width - 20, h: 58, kind: "worker", title: u.title, lines: u.lines, size: 11.5, titleSize: 12.5 }));
      y += 66;
    }
    y -= 8;
  } else {
    const gap = 16;
    const bw = (width - 2 * lx - gap * 2) / 3;
    s.uses.forEach((u, i) => body.push(box({ x: lx + i * (bw + gap), y, w: bw, h: 70, kind: "worker", title: u.title, lines: u.lines, size: 12, titleSize: 13, align: "middle" })));
    y += 70;
  }
  return svg({ width, height: y + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

function canon(lang, narrow = false) {
  const s = S[lang].canon;
  const width = narrow ? NW : W;
  const body = [];
  let y = 10;
  if (narrow) {
    const w = width - 20;
    const steps = [
      [s.project, "plain"],
      [s.key, "agent"],
      [s.entry, "worker"],
    ];
    const labels = [s.push, s.match];
    steps.forEach(([b, kind], i) => {
      body.push(box({ x: 10, y, w, h: 62, kind, title: b.title, lines: b.lines, size: 11.5, titleSize: 12.5, align: "middle" }));
      y += 62;
      if (i < steps.length - 1) {
        body.push(arrow([[width / 2, y], [width / 2, y + 26]], { color: C.line }));
        body.push(text(width / 2 + 10, y + 17, labels[i], { size: 11, color: C.muted }));
        y += 26;
      }
    });
  } else {
    const bw = 226;
    const gap = (width - 40 - bw * 3) / 2;
    const steps = [
      [s.project, "plain"],
      [s.key, "agent"],
      [s.entry, "worker"],
    ];
    const labels = [s.push, s.match];
    steps.forEach(([b, kind], i) => {
      const bx = 20 + i * (bw + gap);
      body.push(box({ x: bx, y, w: bw, h: 70, kind, title: b.title, lines: b.lines, size: 12, titleSize: 13, align: "middle" }));
      if (i < steps.length - 1) {
        body.push(arrow([[bx + bw, y + 35], [bx + bw + gap, y + 35]], { color: C.line }));
        body.push(text(bx + bw + gap / 2, y + 28, labels[i], { size: 11, color: C.muted, anchor: "middle", maxWidth: gap - 6 }));
      }
    });
    y += 70;
  }
  y += 22;
  const lx = narrow ? 10 : 20;
  body.push(text(lx, y + 12, s.checksHead, { size: 12.5, weight: 700, color: C.bad.title, maxWidth: width - 2 * lx }));
  y += 22;
  const perRow = narrow ? 2 : 4;
  const gap = 12;
  const cw = (width - 2 * lx - gap * (perRow - 1)) / perRow;
  s.checks.forEach((c, i) => {
    const r = Math.floor(i / perRow);
    const col = i % perRow;
    body.push(box({ x: lx + col * (cw + gap), y: y + r * 76, w: cw, h: 66, kind: "bad", title: c.title, lines: c.lines, size: narrow ? 11 : 12, titleSize: 13, align: "middle" }));
  });
  y += Math.ceil(s.checks.length / perRow) * 76 - 10;
  y += 14;
  if (narrow) {
    const parts = s.legacy.split(lang === "ja" ? "、違い" : "; ");
    body.push(text(lx, y + 12, parts[0] + (lang === "ja" ? "、" : ";"), { size: 11.5, color: C.muted, maxWidth: width - 20 }));
    body.push(text(lx, y + 30, (lang === "ja" ? "違い" : "") + parts[1], { size: 11.5, color: C.muted, maxWidth: width - 20 }));
    y += 36;
  } else {
    body.push(text(width / 2, y + 12, s.legacy, { size: 12, color: C.muted, anchor: "middle", maxWidth: width - 20 }));
    y += 20;
  }
  return svg({ width, height: y + 12, title: s.title, desc: s.desc, body: body.join("\n"), lang });
}

export const CIRCUIT_NAMING_FIGURES = {
  "circuit-naming-overview": [overview, (lang) => overview(lang, true)],
  "circuit-naming-build": [build, (lang) => build(lang, true)],
  "circuit-naming-legacy": [legacy, (lang) => legacy(lang, true)],
  "circuit-naming-canon": [canon, (lang) => canon(lang, true)],
};
