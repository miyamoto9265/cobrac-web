// ---------------------------------------------------------------------------
// BRAES submission set: what the BRA Data Submission Form of BRAES (WBAI's Brain Reference Architecture Editorial
// System) asks for, built from a project's graphs (Brain-morphic Software Design Guide ver.2, "Publication of BRA
// Data" and "How to make BRA and FRG Images").
//
//   {ID}.bra.xlsx   the BRA data (Template-v2-3) with the BRAES Project ID   (built by the API, braTemplate.ts)
//   {ID}BIF.xml     BIF image: Circuits as rectangles, Collections drawn around their UCs, the ROI in a bracket,
//                   excitatory / inhibitory / modulatory connections in black / blue (square end) / green
//   {ID}HCD.xml     HCD image: one ellipse per ROI UC over its circuit, white arrows between them
//   {ID}FRG.xml     FRG image: rounded rectangles with the Node ID, 2 pt arrows from a node to its subnodes
//   {ID}.drawio     BIF and HCD as layers of one diagram, with the 60 % opaque Semi-Transparent layer between them
//   submission-form.txt  the values to paste into the form, question by question
//
// The images are draw.io XML (uncompressed `mxfile`). Node positions follow the user's arrangement on the graph
// screens (graph/{kind}.layout.json); nodes without one are laid out by dagre, as the screens do.
// ---------------------------------------------------------------------------

import dagre from "@dagrejs/dagre";
import { strToU8, zipSync, type Zippable } from "fflate";
import type { EdgeSign, FrgGraph, GraphLayout, HcdGraph } from "./types.js";

/** BRAES Project ID: initial (≤ 5 capitals) + 2-digit year + running title (UpperCamelCase, ≤ 30 alphanumerics). */
export const BRAES_PROJECT_ID_REGEX = /^[A-Z]{1,5}[0-9]{2}[A-Z][A-Za-z0-9]{0,29}$/;

export function isBraesProjectId(id: string): boolean {
  return BRAES_PROJECT_ID_REGEX.test(id);
}

const asciiWords = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[A-Za-z0-9]+/g) ?? [];

/**
 * A proposal for the BRAES Project ID: the initials of the contributor, the year the project was created and the
 * project name in UpperCamelCase (ROI and TLF when the name has no Latin words). May need editing (a name without Latin
 * letters gives no initials), so the caller checks it with isBraesProjectId().
 */
export function suggestBraesProjectId(input: { contributor: string; createdAt: string; name?: string; roi?: string; tlf?: string }): string {
  const initials = asciiWords(input.contributor)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 5);
  const year = String(new Date(input.createdAt).getUTCFullYear() % 100 || new Date().getUTCFullYear() % 100).padStart(2, "0");
  // whole words while they fit in 30 characters (a long first word is cut)
  const camel = (s: string | undefined) => {
    let out = "";
    for (const w of asciiWords(s ?? "")) {
      const word = w[0].toUpperCase() + w.slice(1);
      if (out && out.length + word.length > 30) break;
      out += word;
    }
    return out.slice(0, 30);
  };
  let title = camel(input.name) || camel([input.roi, input.tlf].filter(Boolean).join(" ")) || "Project";
  if (!/^[A-Z]/.test(title)) title = `P${title}`.slice(0, 30);
  return `${initials}${year}${title}`;
}

// --- draw.io XML ------------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;");
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Same node size and dagre settings as the graph screens (GraphCanvas.tsx). */
const NODE_W = 160;
const NODE_H = 44;

/**
 * Rectangles of the nodes: the saved arrangement, else dagre. `cluster` (the ROI UCs) is kept together by dagre, so the
 * ROI bracket drawn around it does not take in circuits outside the ROI.
 */
function placeNodes(
  ids: string[],
  edges: { source: string; target: string }[],
  layout: GraphLayout | null | undefined,
  direction: "TB" | "LR",
  cluster: string[] = [],
): Map<string, Rect> {
  const size = (id: string) => ({ width: layout?.nodes?.[id]?.width ?? NODE_W, height: layout?.nodes?.[id]?.height ?? NODE_H });
  const run = (compound: boolean) => {
    const g = new dagre.graphlib.Graph({ compound });
    g.setGraph({ rankdir: direction, nodesep: 36, ranksep: compound ? 56 : 84, edgesep: 16, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of ids) g.setNode(id, size(id));
    for (const e of edges) if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
    if (compound) {
      g.setNode("\u0000cluster", {});
      for (const id of cluster) if (g.hasNode(id)) g.setParent(id, "\u0000cluster");
    }
    dagre.layout(g);
    return g;
  };
  const useCluster = cluster.length > 0 && cluster.length < ids.length;
  let g: dagre.graphlib.Graph;
  try {
    g = run(useCluster);
  } catch {
    g = run(false);
  }
  const out = new Map<string, Rect>();
  for (const id of ids) {
    const s = size(id);
    const saved = layout?.positions?.[id];
    const p = g.node(id);
    const x = saved ? saved.x : (p?.x ?? 0) - s.width / 2;
    const y = saved ? saved.y : (p?.y ?? 0) - s.height / 2;
    out.set(id, { x, y, ...s });
  }
  // draw.io starts at the origin: shift everything so the top-left node sits at (40, 40)
  const minX = Math.min(...[...out.values()].map((r) => r.x));
  const minY = Math.min(...[...out.values()].map((r) => r.y));
  if (Number.isFinite(minX)) for (const r of out.values()) ((r.x -= minX - 80), (r.y -= minY - 80));
  return out;
}

const bounds = (rects: Rect[], pad: number): Rect | null => {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)) - pad;
  const y = Math.min(...rects.map((r) => r.y)) - pad;
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) + pad - x, height: Math.max(...rects.map((r) => r.y + r.height)) + pad - y };
};

class Cells {
  readonly xml: string[] = [];
  vertex(id: string, parent: string, value: string, style: string, r: Rect) {
    this.xml.push(
      `<mxCell id="${esc(id)}" value="${esc(value)}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.width)}" height="${r1(r.height)}" as="geometry"/></mxCell>`,
    );
  }
  edge(id: string, parent: string, source: string, target: string, style: string) {
    this.xml.push(`<mxCell id="${esc(id)}" style="${style}" edge="1" parent="${parent}" source="${esc(source)}" target="${esc(target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
}

/** A draw.io file: one page whose layers are given in back-to-front order. */
function mxfile(name: string, layers: { id: string; name: string; cells: string[] }[]): string {
  const root = ['<mxCell id="0"/>', ...layers.flatMap((l) => [`<mxCell id="${l.id}" value="${esc(l.name)}" parent="0"/>`, ...l.cells])];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<mxfile host="CoBRAC" type="device"><diagram id="${esc(name)}" name="${esc(name)}"><mxGraphModel grid="1" gridSize="10" guides="1" connect="1" arrows="1" page="0" math="0" shadow="0"><root>`,
    ...root,
    "</root></mxGraphModel></diagram></mxfile>",
    "",
  ].join("\n");
}

const ARROW: Record<EdgeSign, string> = {
  excitatory: "strokeColor=#000000;endArrow=block;endFill=1;",
  inhibitory: "strokeColor=#0000FF;endArrow=box;endFill=1;",
  modulatory: "strokeColor=#009900;endArrow=block;endFill=1;",
  // the sign could not be read from the record: grey, so it is not taken for an excitatory connection
  unknown: "strokeColor=#808080;endArrow=block;endFill=1;",
};
const startOf = (sign: EdgeSign) => (sign === "inhibitory" ? "startArrow=box;startFill=1;" : "startArrow=block;startFill=1;");

interface MergedEdge {
  source: string;
  target: string;
  both: boolean;
}

/** One arrow per sender → receiver; a mutual pair becomes one double-headed arrow when `same(a, b)` says they match. */
function mergeMutual<E extends { source: string; target: string }>(edges: E[], same: (a: E, b: E) => boolean): (MergedEdge & { e: E })[] {
  const key = (a: string, b: string) => `${a}\u0000${b}`;
  const byPair = new Map<string, E>();
  for (const e of edges) if (!byPair.has(key(e.source, e.target))) byPair.set(key(e.source, e.target), e);
  const done = new Set<string>();
  const out: (MergedEdge & { e: E })[] = [];
  for (const [k, e] of byPair) {
    if (done.has(k)) continue;
    done.add(k);
    const back = e.source !== e.target ? byPair.get(key(e.target, e.source)) : undefined;
    if (back && !done.has(key(e.target, e.source)) && same(e, back)) {
      done.add(key(e.target, e.source));
      out.push({ source: e.source, target: e.target, both: true, e });
    } else out.push({ source: e.source, target: e.target, both: false, e });
  }
  return out;
}

export interface BraImages {
  bif: string;
  hcd: string;
  frg: string;
  /** BIF + Semi-Transparent + HCD layers in one draw.io file, for editing */
  drawio: string;
}

export function buildBraImages(hcd: HcdGraph, frg: FrgGraph, layouts: { hcd?: GraphLayout | null; frg?: GraphLayout | null } = {}): BraImages {
  // --- BIF layer ------------------------------------------------------------------------------------------------------
  const pos = placeNodes(
    hcd.nodes.map((n) => n.id),
    hcd.edges,
    layouts.hcd,
    "TB",
    hcd.nodes.filter((n) => n.roiClass === "roi").map((n) => n.id),
  );
  const bif = new Cells();
  const BIF = "bif";
  const roi = hcd.nodes.filter((n) => n.roiClass === "roi");
  const roiBox = bounds(
    roi.map((n) => pos.get(n.id)!),
    36,
  );
  if (roiBox) bif.vertex("bif-roi", BIF, "ROI", "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;strokeWidth=2;dashed=1;verticalAlign=top;align=left;spacingLeft=6;fontStyle=1;", roiBox);
  // Collections (Non-Uniform Circuits) are drawn so that their UCs are inside; larger ones first, so nested ones stay visible
  const collections = (hcd.collections ?? [])
    .map((c) => ({ c, box: bounds(c.members.map((m) => pos.get(m)).filter((r): r is Rect => !!r), 18) }))
    .filter((x): x is { c: (typeof x)["c"]; box: Rect } => !!x.box)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  collections.forEach(({ c, box }, i) =>
    bif.vertex(`bif-col-${i}`, BIF, c.id, "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#666666;verticalAlign=top;align=left;spacingLeft=4;fontSize=10;", box),
  );
  hcd.nodes.forEach((n, i) => bif.vertex(`bif-c-${i}`, BIF, n.id, "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#000000;", pos.get(n.id)!));
  const bifCell = new Map(hcd.nodes.map((n, i) => [n.id, `bif-c-${i}`]));
  const sign = (e: { sign?: EdgeSign }) => e.sign ?? "unknown";
  const dotted = (e: (typeof hcd.edges)[number]) => !!e.hypothesis?.only;
  mergeMutual(hcd.edges, (a, b) => sign(a) === sign(b) && dotted(a) === dotted(b)).forEach((m, i) => {
    const s = sign(m.e);
    const style = `edgeStyle=none;html=1;rounded=0;strokeWidth=1;${ARROW[s]}${m.both ? startOf(s) : "startArrow=none;"}${dotted(m.e) ? "dashed=1;" : ""}`;
    bif.edge(`bif-e-${i}`, BIF, bifCell.get(m.source) ?? "", bifCell.get(m.target) ?? "", style);
  });

  // --- HCD layer: a component (ellipse) over each ROI UC, white arrows between them -------------------------------------
  const HCD = "hcd";
  const hcdCells = new Cells();
  const roiIds = new Set(roi.map((n) => n.id));
  const compCell = new Map<string, string>();
  roi.forEach((n, i) => {
    const r = pos.get(n.id)!;
    const id = `hcd-u-${i}`;
    compCell.set(n.id, id);
    hcdCells.vertex(id, HCD, n.label || n.id, "ellipse;whiteSpace=wrap;html=1;fillColor=#FFF2CC;strokeColor=#000000;", { x: r.x + 6, y: r.y - 4, width: r.width - 12, height: r.height + 8 });
  });
  mergeMutual(
    hcd.edges.filter((e) => e.source !== e.target && roiIds.has(e.source) && roiIds.has(e.target)),
    () => true,
  ).forEach((m, i) =>
    hcdCells.edge(
      `hcd-e-${i}`,
      HCD,
      compCell.get(m.source)!,
      compCell.get(m.target)!,
      `shape=flexArrow;html=1;rounded=0;fillColor=#FFFFFF;strokeColor=#000000;width=6;endWidth=12;endSize=5;endArrow=block;${m.both ? "startArrow=block;startWidth=12;startSize=5;" : "startArrow=none;"}`,
    ),
  );

  // --- Semi-Transparent layer -----------------------------------------------------------------------------------------
  const semi = new Cells();
  const all = bounds([...pos.values()], 60);
  if (all) semi.vertex("semi-rect", "semi", "", "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=none;opacity=60;", all);

  // --- FRG ------------------------------------------------------------------------------------------------------------
  const fpos = placeNodes(
    frg.nodes.map((n) => n.id),
    frg.edges,
    layouts.frg,
    "LR",
  );
  const frgCells = new Cells();
  const frgCell = new Map(frg.nodes.map((n, i) => [n.id, `frg-n-${i}`]));
  frg.nodes.forEach((n, i) =>
    frgCells.vertex(`frg-n-${i}`, "frg", n.id, `rounded=1;whiteSpace=wrap;html=1;fillColor=${n.kind === "uc" ? "#FFFFFF" : n.kind === "tlf" ? "#DAE8FC" : "#F5F5F5"};strokeColor=#000000;`, fpos.get(n.id)!),
  );
  frg.edges.forEach((e, i) => {
    if (frgCell.has(e.source) && frgCell.has(e.target)) frgCells.edge(`frg-e-${i}`, "frg", frgCell.get(e.source)!, frgCell.get(e.target)!, "edgeStyle=none;html=1;rounded=0;strokeColor=#000000;strokeWidth=2;endArrow=block;endFill=1;");
  });

  return {
    bif: mxfile("BIF", [{ id: BIF, name: "BIF", cells: bif.xml }]),
    hcd: mxfile("HCD", [{ id: HCD, name: "HCD", cells: hcdCells.xml }]),
    frg: mxfile("FRG", [{ id: "frg", name: "FRG", cells: frgCells.xml }]),
    drawio: mxfile("BRA image", [
      { id: BIF, name: "BIF", cells: bif.xml },
      { id: "semi", name: "Semi-Transparent", cells: semi.xml },
      { id: HCD, name: "HCD", cells: hcdCells.xml },
    ]),
  };
}

// --- submission form memo ---------------------------------------------------------------------------------------------

export interface BraesFormInput {
  braesProjectId: string;
  contributor: string;
  /** Project sheet Description */
  description: string;
  hasFrg: boolean;
  files: { bra: string; bif: string; hcd: string; frg: string };
  /** CoBRAC Project ID and name, for the comment to the manager */
  cobrac: { projectId: string; name: string; version?: number };
}

/** The values of the BRA Data Submission Form, question by question (the form is filled in English). */
export function braesFormText(f: BraesFormInput, locale: "ja" | "en"): string {
  const ja = locale === "ja";
  const nonAscii = /[^\x20-\x7e\n\r\t]/.test(f.description) || /[^\x20-\x7e]/.test(f.contributor);
  const lines = [
    ja ? "BRAES 投稿フォーム（BRA Data Submission Form）の記入メモ" : "BRAES: values for the BRA Data Submission Form",
    "https://sites.google.com/wba-initiative.org/braes/form",
    ja ? "フォームはすべて英語で記入します。" : "Fill in the form in English.",
    "",
    `Q1  Author Names: ${f.contributor}`,
    `Q2  Project ID: ${f.braesProjectId}`,
    `Q3  BRA Data: ${f.files.bra}`,
    `Q4  BIF Image: ${f.files.bif}`,
    `Q5  Does your BRA data include FRG data?: ${f.hasFrg ? "Yes" : "No"}`,
    ...(f.hasFrg ? [`Q6  FRG Image: ${f.files.frg}`, `Q7  HCD Image1: ${f.files.hcd}`] : []),
    `Q8  Name: ${f.contributor}`,
    `Q9  E-mail: ${ja ? "（連絡先のメールアドレス）" : "(contact e-mail address)"}`,
    `Q10 Comment: Created with CoBRAC (project ${f.cobrac.projectId}${f.cobrac.version ? `, BRA data version ${f.cobrac.version}` : ""}).`,
    `Q11 Affiliation: ${ja ? "（所属。任意）" : "(optional)"}`,
    `Q12 Consent: ${ja ? "CC-BY-SA での公開と Allen Institute の利用規約に同意する場合にチェックします。" : "check it to agree to publication under CC-BY-SA and to the Allen Institute's Terms of Use."}`,
    "",
    ja ? "Project シートの Description:" : "Description on the Project sheet:",
    f.description || (ja ? "（空欄）" : "(empty)"),
    "",
    ja ? "出す前の確認" : "Before you submit",
    ...(ja
      ? [
          `- ${f.files.bra} は Google スプレッドシートで開くと、WholeBIF の取り込みと Graph Generator の数式が動きます。フォームが Google スプレッドシートを求める場合は、Google ドライブで開いて「Google スプレッドシートとして保存」してから添付してください。`,
          "- 投稿の前に BRA Data Review Tool (ver. 4.4) for v2-3 で形式の審査を通しておくと安心です（https://github.com/wbap/BRA2）。",
          `- 図は draw.io の XML です。配置を直すときは ${f.braesProjectId}.drawio を draw.io で開き、BIF・HCD のレイヤーをそれぞれ「選択範囲のみ」で XML に書き出し直してください。灰色の矢印は、興奮性・抑制性・修飾性を記録から読み取れなかった接続です。`,
          ...(nonAscii ? ["- 著者名か Description に英語以外の文字があります。英語に直してから記入してください。"] : []),
        ]
      : [
          `- Opened in Google Sheets, ${f.files.bra} imports WholeBIF and runs the Graph Generator formulas. If the form asks for a Google Sheets file, open it on Google Drive and save it as Google Sheets before attaching it.`,
          "- Running BRA Data Review Tool (ver. 4.4) for v2-3 before submitting catches format errors early (https://github.com/wbap/BRA2).",
          `- The images are draw.io XML. To adjust them, open ${f.braesProjectId}.drawio in draw.io and export the BIF and HCD layers again as XML (selection only). Grey arrows are connections whose sign (excitatory / inhibitory / modulatory) could not be read from the records.`,
          ...(nonAscii ? ["- The author name or the Description contains non-English characters; translate them before filling in the form."] : []),
        ]),
    "",
  ];
  return lines.join("\n");
}

// --- the zip ----------------------------------------------------------------------------------------------------------

export interface BraesBundleInput {
  braesProjectId: string;
  xlsx: Uint8Array;
  hcd: HcdGraph;
  frg: FrgGraph;
  layouts?: { hcd?: GraphLayout | null; frg?: GraphLayout | null };
  form: Omit<BraesFormInput, "braesProjectId" | "files" | "hasFrg">;
  locale: "ja" | "en";
}

export function braesBundleFileNames(id: string) {
  return { bra: `${id}.bra.xlsx`, bif: `${id}BIF.xml`, hcd: `${id}HCD.xml`, frg: `${id}FRG.xml`, drawio: `${id}.drawio`, form: "submission-form.txt", zip: `${id}_BRAES.zip` };
}

export function buildBraesBundle(input: BraesBundleInput): Uint8Array {
  const id = input.braesProjectId;
  const names = braesBundleFileNames(id);
  const images = buildBraImages(input.hcd, input.frg, input.layouts);
  const hasFrg = input.frg.nodes.length > 0;
  const files: Zippable = {
    [names.bra]: input.xlsx,
    [names.bif]: strToU8(images.bif),
    [names.hcd]: strToU8(images.hcd),
    [names.frg]: strToU8(images.frg),
    [names.drawio]: strToU8(images.drawio),
    [names.form]: strToU8(braesFormText({ ...input.form, braesProjectId: id, hasFrg, files: names }, input.locale)),
  };
  if (!hasFrg) {
    delete files[names.hcd];
    delete files[names.frg];
  }
  // the folder keeps the files together when the zip is expanded
  const out: Zippable = {};
  for (const [k, v] of Object.entries(files)) out[`${id}_BRAES/${k}`] = v;
  return zipSync(out, { level: 6 });
}
