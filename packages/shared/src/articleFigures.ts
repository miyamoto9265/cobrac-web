/**
 * Figures of an explanatory article, drawn from the project's graph data (`buildGraphs`) without the LLM, in the
 * style of the documentation figures (`scripts/docs-figures-lib.mjs`): plain SVG, no scripts or external fonts, a
 * wide version and a one-column `*.narrow.svg` for phones. Only connections and nodes that exist in the BRA data are
 * drawn.
 */
import type { EdgeSign, FrgGraph, FrgNode, HcdEdge, HcdGraph, HcdNode } from "./types.js";
import type { UiLocale } from "./locale.js";

export const ARTICLE_FIGURE_NAMES = ["circuit", "frg", "function-map"] as const;
export type ArticleFigureName = (typeof ARTICLE_FIGURE_NAMES)[number];

export interface ArticleFigure {
  name: string;
  svg: string;
  narrow: string | null;
  /** Short title in the figure's language (also the SVG `<title>`) */
  title: string;
  /** What the figure shows, in English, for the article prompt */
  summary: string;
}

export const articleFigureFiles = (name: string, narrow: boolean) => [`${name}.svg`, ...(narrow ? [`${name}.narrow.svg`] : [])];
/** `article/ja/figures/circuit.svg` */
export const articleFigureKey = (locale: UiLocale, file: string) => `article/${locale}/figures/${file}`;
export const ARTICLE_FIGURE_FILE_RE = /^[a-z0-9][a-z0-9-]{0,40}(?:\.narrow)?\.svg$/;
export const ARTICLE_FIGURE_KEY_RE = /^article\/[A-Za-z]+\/figures\/[a-z0-9][a-z0-9-]{0,40}(?:\.narrow)?\.svg$/;

// --- labels ----------------------------------------------------------------------------------------------------------

interface Labels {
  circuitTitle: string;
  frgTitle: string;
  mapTitle: string;
  inputs: string;
  roi: (roi: string) => string;
  outputs: string;
  sign: Record<EdgeSign, string>;
  direction: string;
  tlf: string;
  gn: string;
  uc: string;
  shared: string;
  circuits: string;
  role: { internal: string; in: string; out: string };
  roleHelp: string;
  noConnections: string;
  sharedHelp: string;
}

const JA: Labels = {
  circuitTitle: "回路と接続（HCD）",
  frgTitle: "機能の分解（FRG）",
  mapTitle: "どの接続がどの機能を担うか",
  inputs: "ROI への入力",
  roi: (roi) => (roi ? `ROI：${roi}` : "ROI 内の回路"),
  outputs: "ROI からの出力",
  sign: { excitatory: "興奮性", inhibitory: "抑制性", modulatory: "調節性", unknown: "種類の記載なし" },
  direction: "矢印は送り手から受け手へ",
  tlf: "TLF",
  gn: "GN",
  uc: "UC",
  shared: "共有",
  circuits: "回路",
  role: { internal: "内部", in: "入力", out: "出力" },
  roleHelp: "内部 = 機能の回路どうし、入力 = 外から機能へ、出力 = 機能から外へ",
  noConnections: "この機能の回路に接続はありません",
  sharedHelp: "点線の枠 = 別の機能と共有する UC（2 回目以降）",
};

const EN: Labels = {
  circuitTitle: "Circuits and connections (HCD)",
  frgTitle: "Decomposition of the function (FRG)",
  mapTitle: "Which connections serve which function",
  inputs: "Inputs to the ROI",
  roi: (roi) => (roi ? `ROI: ${roi}` : "Circuits in the ROI"),
  outputs: "Outputs of the ROI",
  sign: { excitatory: "excitatory", inhibitory: "inhibitory", modulatory: "modulatory", unknown: "type not stated" },
  direction: "arrows point from sender to receiver",
  tlf: "TLF",
  gn: "GN",
  uc: "UC",
  shared: "shared",
  circuits: "Circuits",
  role: { internal: "within", in: "in", out: "out" },
  roleHelp: "within = between the function's circuits, in = into the function, out = out of it",
  noConnections: "No connections touch this function's circuits",
  sharedHelp: "dotted frame = UC shared with another function (repeated)",
};

/** Widest wide figure (the article column is about 770 px; wider figures shrink their text too much) */
const WIDE_MAX = 980;
const NARROW_W = 430;

const labelsFor = (locale: UiLocale): Labels => (locale === "ja" ? JA : EN);

// --- drawing ---------------------------------------------------------------------------------------------------------

const SANS = "'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic',Meiryo,'Noto Sans CJK JP',system-ui,-apple-system,'Segoe UI',sans-serif";
const MONO = "'JetBrains Mono',Consolas,'SFMono-Regular',Menlo,'Noto Sans Mono CJK JP',monospace";

const C = {
  text: "#0f172a",
  muted: "#475569",
  faint: "#94a3b8",
  line: "#64748b",
  lane: "#f8fafc",
  laneStroke: "#e2e8f0",
  input: { fill: "#ecfdf5", stroke: "#10b981", title: "#065f46" },
  roi: { fill: "#eff6ff", stroke: "#3b82f6", title: "#1e3a8a" },
  output: { fill: "#fffbeb", stroke: "#f59e0b", title: "#92400e" },
  gn: { fill: "#f5f3ff", stroke: "#8b5cf6", title: "#4c1d95" },
  tlf: { fill: "#eef2ff", stroke: "#4f46e5", title: "#312e81" },
  plain: { fill: "#ffffff", stroke: "#cbd5e1", title: "#0f172a" },
};

/** Same colours as the graph viewer's edge defaults (`StyledEdge.tsx`). */
const SIGN: Record<EdgeSign, { color: string; marker: "arrow" | "bar" | "dot"; dashed: boolean }> = {
  excitatory: { color: "#475569", marker: "arrow", dashed: false },
  inhibitory: { color: "#2563eb", marker: "bar", dashed: false },
  modulatory: { color: "#7c3aed", marker: "dot", dashed: true },
  unknown: { color: "#94a3b8", marker: "arrow", dashed: false },
};
const SIGN_ORDER: EdgeSign[] = ["excitatory", "inhibitory", "modulatory", "unknown"];

const ROLE_KIND = { internal: C.gn, in: C.input, out: C.output } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (x: number) => (Math.round(x * 10) / 10).toString();

function charWidth(ch: string, mono: boolean): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x2e80 || (c >= 0x2010 && c <= 0x2027) || c === 0x2192 || c === 0x2190 || c === 0x2212) return 1;
  if (mono) return 0.6;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[mwMW]/.test(ch)) return 0.82;
  if (/[il.,:;'|!()[\]{} ]/.test(ch)) return 0.3;
  if (/[0-9]/.test(ch)) return 0.56;
  return 0.54;
}

function textWidth(s: string, size: number, mono = false): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch, mono) * size;
  return w;
}

/** Cuts `s` to `maxWidth` with an ellipsis. */
function fit(s: string, size: number, maxWidth: number, mono = false): string {
  if (textWidth(s, size, mono) <= maxWidth) return s;
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + "…", size, mono) > maxWidth) break;
    out += ch;
  }
  return out.trimEnd() + "…";
}

/** Word wrap (CJK breaks anywhere); the last line is cut with an ellipsis. */
function wrap(s: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = s
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=\s)|(?=[\u2e80-\u9fff\uac00-\ud7af])|(?<=[\u2e80-\u9fff\uac00-\ud7af])/u)
    .filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (textWidth((cur + w).trimEnd(), size) <= maxWidth || !cur) {
      cur += w;
      continue;
    }
    lines.push(cur.trimEnd());
    cur = w.trimStart();
    if (lines.length === maxLines) {
      lines[maxLines - 1] = fit(lines[maxLines - 1] + " " + words.slice(i).join(""), size, maxWidth);
      return lines;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines);
    head[maxLines - 1] = fit(lines.slice(maxLines - 1).join(" "), size, maxWidth);
    return head;
  }
  return lines.map((l) => fit(l, size, maxWidth));
}

interface TextOpts {
  size?: number;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  color?: string;
  mono?: boolean;
}

function text(x: number, y: number, s: string, o: TextOpts = {}): string {
  const { size = 13, anchor = "start", weight = 400, color = C.text, mono = false } = o;
  const family = mono ? ` font-family="${esc(MONO)}"` : "";
  return `<text x="${n1(x)}" y="${n1(y)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${family}>${esc(s)}</text>`;
}

function rect(x: number, y: number, w: number, h: number, k: { fill: string; stroke: string }, o: { rx?: number; dashed?: boolean; width?: number } = {}): string {
  return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${o.rx ?? 8}" fill="${k.fill}" stroke="${k.stroke}" stroke-width="${o.width ?? 1.5}"${o.dashed ? ` stroke-dasharray="5 3"` : ""}/>`;
}

function markers(): string {
  return SIGN_ORDER.map((s) => {
    const { color, marker } = SIGN[s];
    const id = `m-${s}`;
    if (marker === "bar") return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M7 0 L7 10" stroke="${color}" stroke-width="3"/></marker>`;
    if (marker === "dot") return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><circle cx="5" cy="5" r="4" fill="${color}"/></marker>`;
    return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`;
  }).join("") + `<marker id="m-tree" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${C.faint}"/></marker>`;
}

function svgDoc(width: number, height: number, title: string, desc: string, body: string, lang: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" role="img" aria-labelledby="t d" lang="${lang}" font-family="${esc(SANS)}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<defs>${markers()}</defs>
<rect width="${Math.ceil(width)}" height="${Math.ceil(height)}" fill="#ffffff"/>
${body}
</svg>
`;
}

function edgePath(d: string, sign: EdgeSign): string {
  const s = SIGN[sign];
  return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.6"${s.dashed ? ` stroke-dasharray="5 3"` : ""} marker-end="url(#m-${sign})"/>`;
}

/** Legend items in rows that fit `maxW`; returns the svg and the y below it. */
function legend(items: { sign?: EdgeSign; swatch?: { fill: string; stroke: string; dashed?: boolean }; label: string }[], x0: number, y: number, maxW: number): { svg: string; bottom: number } {
  const out: string[] = [];
  let x = x0;
  for (const it of items) {
    const w = 34 + textWidth(it.label, 12) + 18;
    if (x > x0 && x + w > x0 + maxW) {
      x = x0;
      y += 20;
    }
    if (it.sign) {
      const s = SIGN[it.sign];
      out.push(`<path d="M${n1(x)} ${n1(y - 4)} L${n1(x + 26)} ${n1(y - 4)}" stroke="${s.color}" stroke-width="1.6"${s.dashed ? ` stroke-dasharray="5 3"` : ""} marker-end="url(#m-${it.sign})"/>`);
    } else if (it.swatch) out.push(rect(x, y - 12, 24, 14, it.swatch, { rx: 3, dashed: it.swatch.dashed, width: 1.3 }));
    out.push(text(x + 34, y, it.label, { size: 12, color: C.muted }));
    x += w;
  }
  return { svg: out.join("\n"), bottom: y };
}

// --- graph helpers ---------------------------------------------------------------------------------------------------

type Side = "in" | "roi" | "out";
const sideOf = (n: HcdNode): Side => (n.roiClass === "noROI_input" || n.roiClass === "noROI_both" ? "in" : n.roiClass === "noROI_output" ? "out" : "roi");
const signOf = (e: HcdEdge): EdgeSign => e.sign ?? "unknown";

/** Columns of the circuit figure: inputs, the ROI in layers along the forward connections, outputs. */
function circuitColumns(hcd: HcdGraph): { columns: { side: Side; ids: string[] }[]; edges: HcdEdge[] } {
  const ids = new Set(hcd.nodes.map((n) => n.id));
  const edges = hcd.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const side = new Map(hcd.nodes.map((n) => [n.id, sideOf(n)]));
  const roi = hcd.nodes.filter((n) => side.get(n.id) === "roi").map((n) => n.id);
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target]);

  // break cycles by a DFS from the inputs, then from the remaining ROI circuits in file order
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of out.get(u) ?? []) {
      if (side.get(v) !== "roi") continue;
      if (state.get(v) === 1) back.add(`${u}\u0000${v}`);
      else if (!state.has(v)) visit(v);
    }
    state.set(u, 2);
  };
  for (const n of hcd.nodes) if (side.get(n.id) === "in") visit(n.id);
  for (const id of roi) if (!state.has(id)) visit(id);

  const layer = new Map(roi.map((id) => [id, 0]));
  for (let pass = 0; pass < roi.length + 1; pass++) {
    let changed = false;
    for (const e of edges) {
      if (side.get(e.source) !== "roi" || side.get(e.target) !== "roi" || back.has(`${e.source}\u0000${e.target}`)) continue;
      const l = (layer.get(e.source) ?? 0) + 1;
      if (l > (layer.get(e.target) ?? 0)) {
        layer.set(e.target, l);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns: { side: Side; ids: string[] }[] = [];
  const inputs = hcd.nodes.filter((n) => side.get(n.id) === "in").map((n) => n.id);
  if (inputs.length) columns.push({ side: "in", ids: inputs });
  const maxLayer = Math.max(-1, ...layer.values());
  for (let l = 0; l <= maxLayer; l++) columns.push({ side: "roi", ids: roi.filter((id) => layer.get(id) === l) });
  const outputs = hcd.nodes.filter((n) => side.get(n.id) === "out").map((n) => n.id);
  if (outputs.length) columns.push({ side: "out", ids: outputs });

  // order within columns by the mean position of the neighbours (a few sweeps)
  const nbrs = new Map<string, string[]>();
  for (const e of edges) {
    nbrs.set(e.source, [...(nbrs.get(e.source) ?? []), e.target]);
    nbrs.set(e.target, [...(nbrs.get(e.target) ?? []), e.source]);
  }
  for (let sweep = 0; sweep < 6; sweep++) {
    const pos = new Map<string, number>();
    for (const c of columns) c.ids.forEach((id, i) => pos.set(id, (i + 0.5) / c.ids.length));
    const order = sweep % 2 === 0 ? columns : [...columns].reverse();
    for (const c of order) {
      const bary = new Map(
        c.ids.map((id, i) => {
          const ps = (nbrs.get(id) ?? []).filter((x) => !c.ids.includes(x)).map((x) => pos.get(x) ?? 0.5);
          return [id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : (i + 0.5) / c.ids.length];
        }),
      );
      c.ids.sort((a, b) => bary.get(a)! - bary.get(b)!);
      c.ids.forEach((id, i) => pos.set(id, (i + 0.5) / c.ids.length));
    }
  }
  return { columns: columns.filter((c) => c.ids.length), edges };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Spreads the ends of several edges over one side of a box. */
function portOffsets(edges: HcdEdge[], end: "source" | "target", other: (e: HcdEdge) => number, span: number): Map<HcdEdge, number> {
  const groups = new Map<string, HcdEdge[]>();
  for (const e of edges) groups.set(e[end], [...(groups.get(e[end]) ?? []), e]);
  const out = new Map<HcdEdge, number>();
  for (const list of groups.values()) {
    list.sort((a, b) => other(a) - other(b));
    list.forEach((e, i) => out.set(e, list.length === 1 ? 0 : (i / (list.length - 1) - 0.5) * span));
  }
  return out;
}

function circuitNodeBox(n: HcdNode, b: Box, k: { fill: string; stroke: string; title: string }, idSize: number): string {
  const sub = n.transmitter.trim() || n.modulationType.trim();
  const parts = [rect(b.x, b.y, b.w, b.h, k)];
  const cx = b.x + b.w / 2;
  if (sub) {
    parts.push(text(cx, b.y + b.h / 2 - 2, fit(n.id, idSize, b.w - 14, true), { size: idSize, weight: 700, color: k.title, anchor: "middle", mono: true }));
    parts.push(text(cx, b.y + b.h / 2 + 13, fit(sub, 11, b.w - 14), { size: 11, color: C.muted, anchor: "middle" }));
  } else parts.push(text(cx, b.y + b.h / 2 + 4.5, fit(n.id, idSize, b.w - 14, true), { size: idSize, weight: 700, color: k.title, anchor: "middle", mono: true }));
  return parts.join("\n");
}

const sideKind = (s: Side) => (s === "in" ? C.input : s === "out" ? C.output : C.roi);

function circuitDesc(hcd: HcdGraph, edges: HcdEdge[], L: Labels): string {
  const list = edges.map((e) => `${e.source} → ${e.target} (${L.sign[signOf(e)]})`).join("; ");
  return `${hcd.nodes.length} circuits, ${edges.length} connections: ${list}`;
}

function circuitFigure(hcd: HcdGraph, roiName: string, L: Labels, lang: string): ArticleFigure {
  const { columns, edges } = circuitColumns(hcd);
  const byId = new Map(hcd.nodes.map((n) => [n.id, n]));
  const sideById = new Map<string, Side>();
  for (const c of columns) for (const id of c.ids) sideById.set(id, c.side);
  const signs = SIGN_ORDER.filter((s) => edges.some((e) => signOf(e) === s));
  const legendItems = [...signs.map((s) => ({ sign: s, label: L.sign[s] })), { label: L.direction }];
  const desc = circuitDesc(hcd, edges, L);

  // wide: one column per layer
  const horizontal = (): string | null => {
    const idSize = 12;
    const boxW = Math.min(180, Math.max(104, ...hcd.nodes.map((n) => textWidth(n.id, idSize, true) + 20)));
    const boxH = 44;
    const gapY = 18;
    const top = 58;
    const left = 20;
    const gapX = Math.min(72, columns.length > 1 ? (WIDE_MAX - left * 2 - columns.length * boxW) / (columns.length - 1) : 72);
    if (gapX < 40) return null;
    const maxRows = Math.max(1, ...columns.map((c) => c.ids.length));
    const colH = maxRows * boxH + (maxRows - 1) * gapY;
    const boxes = new Map<string, Box>();
    columns.forEach((c, ci) => {
      const x = left + ci * (boxW + gapX);
      const h = c.ids.length * boxH + (c.ids.length - 1) * gapY;
      const y0 = top + (colH - h) / 2;
      c.ids.forEach((id, i) => boxes.set(id, { x, y: y0 + i * (boxH + gapY), w: boxW, h: boxH }));
    });
    const width = Math.max(left * 2 + columns.length * boxW + (columns.length - 1) * gapX, 520);
    const colIndex = new Map<string, number>();
    columns.forEach((c, ci) => c.ids.forEach((id) => colIndex.set(id, ci)));
    const parts: string[] = [];
    // lanes
    const lanes: { side: Side; from: number; to: number }[] = [];
    columns.forEach((c, ci) => {
      const last = lanes[lanes.length - 1];
      if (last && last.side === c.side) last.to = ci;
      else lanes.push({ side: c.side, from: ci, to: ci });
    });
    for (const lane of lanes) {
      const x = left + lane.from * (boxW + gapX) - 10;
      const w = (lane.to - lane.from + 1) * boxW + (lane.to - lane.from) * gapX + 20;
      const k = sideKind(lane.side);
      parts.push(`<rect x="${n1(x)}" y="${top - 40}" width="${n1(w)}" height="${n1(colH + 54)}" rx="10" fill="${C.lane}" stroke="${k.stroke}" stroke-width="1.1" stroke-dasharray="4 4"/>`);
      const label = lane.side === "in" ? L.inputs : lane.side === "out" ? L.outputs : L.roi(roiName);
      parts.push(text(x + 10, top - 20, fit(label, 12.5, w - 20), { size: 12.5, weight: 700, color: k.title }));
    }
    const cy = (b: Box) => b.y + b.h / 2;
    const outPort = portOffsets(edges, "source", (e) => cy(boxes.get(e.target)!), boxH * 0.55);
    const inPort = portOffsets(edges, "target", (e) => cy(boxes.get(e.source)!), boxH * 0.55);
    for (const e of edges) {
      const a = boxes.get(e.source)!;
      const b = boxes.get(e.target)!;
      const ca = colIndex.get(e.source)!;
      const cb = colIndex.get(e.target)!;
      const y1 = cy(a) + (outPort.get(e) ?? 0);
      const y2 = cy(b) + (inPort.get(e) ?? 0);
      let d: string;
      if (cb > ca) {
        const x1 = a.x + a.w;
        const x2 = b.x - 2;
        const dx = Math.max(30, (x2 - x1) / 2);
        d = `M${n1(x1)} ${n1(y1)} C${n1(x1 + dx)} ${n1(y1)} ${n1(x2 - dx)} ${n1(y2)} ${n1(x2)} ${n1(y2)}`;
      } else if (cb < ca) {
        // feedback: leave from the left side, enter from the right, bowing below the straight line
        const x1 = a.x;
        const x2 = b.x + b.w + 2;
        const bow = 26 + 6 * (ca - cb);
        d = `M${n1(x1)} ${n1(y1)} C${n1(x1 - bow)} ${n1(y1 + bow)} ${n1(x2 + bow)} ${n1(y2 + bow)} ${n1(x2)} ${n1(y2)}`;
      } else {
        const x = a.x + a.w;
        const bow = 28 + Math.abs(y2 - y1) * 0.15;
        d = `M${n1(x)} ${n1(y1)} C${n1(x + bow)} ${n1(y1)} ${n1(x + bow)} ${n1(y2)} ${n1(x + 2)} ${n1(y2)}`;
      }
      parts.push(edgePath(d, signOf(e)));
    }
    for (const [id, b] of boxes) parts.push(circuitNodeBox(byId.get(id)!, b, sideKind(sideById.get(id)!), idSize));
    const lg = legend(legendItems, left, top + colH + 44, width - left * 2);
    return svgDoc(width, lg.bottom + 16, L.circuitTitle, desc, [...parts, lg.svg].join("\n"), lang);
  };

  // the same groups as rows, top to bottom: the phone version, and the wide one when the columns do not fit
  const vertical = (W: number) => {
    const left = 14;
    const idSize = 12;
    const boxW = Math.min(186, Math.max(96, ...hcd.nodes.map((n) => textWidth(n.id, idSize, true) + 20)));
    const boxH = 42;
    const gapX = 14;
    const gapY = 40;
    const perRow = Math.max(1, Math.floor((W - left * 2 - 16 + gapX) / (boxW + gapX)));
    const boxes = new Map<string, Box>();
    const rowOf = new Map<string, number>();
    const parts: string[] = [];
    let y = 14;
    let row = 0;
    const lanes: { side: Side; top: number; bottom: number }[] = [];
    for (const c of columns) {
      const last = lanes[lanes.length - 1];
      if (!last || last.side !== c.side) {
        if (last) y += 18;
        lanes.push({ side: c.side, top: y, bottom: y });
        y += 30;
      }
      for (let i = 0; i < c.ids.length; i += perRow) {
        const chunk = c.ids.slice(i, i + perRow);
        const rowW = chunk.length * boxW + (chunk.length - 1) * gapX;
        const x0 = (W - rowW) / 2;
        chunk.forEach((id, j) => {
          boxes.set(id, { x: x0 + j * (boxW + gapX), y, w: boxW, h: boxH });
          rowOf.set(id, row);
        });
        row++;
        y += boxH + gapY;
      }
      lanes[lanes.length - 1].bottom = y - gapY + 12;
    }
    for (const lane of lanes) {
      const k = sideKind(lane.side);
      parts.push(`<rect x="${left - 6}" y="${n1(lane.top)}" width="${W - (left - 6) * 2}" height="${n1(lane.bottom - lane.top)}" rx="10" fill="${C.lane}" stroke="${k.stroke}" stroke-width="1.1" stroke-dasharray="4 4"/>`);
      const label = lane.side === "in" ? L.inputs : lane.side === "out" ? L.outputs : L.roi(roiName);
      parts.push(text(left + 6, lane.top + 19, fit(label, 12.5, W - left * 2 - 12), { size: 12.5, weight: 700, color: k.title }));
    }
    const cx = (b: Box) => b.x + b.w / 2;
    const outPort = portOffsets(edges, "source", (e) => cx(boxes.get(e.target)!), boxW * 0.5);
    const inPort = portOffsets(edges, "target", (e) => cx(boxes.get(e.source)!), boxW * 0.5);
    for (const e of edges) {
      const a = boxes.get(e.source)!;
      const b = boxes.get(e.target)!;
      const ra = rowOf.get(e.source)!;
      const rb = rowOf.get(e.target)!;
      const x1 = cx(a) + (outPort.get(e) ?? 0);
      const x2 = cx(b) + (inPort.get(e) ?? 0);
      let d: string;
      if (rb > ra) {
        const y1 = a.y + a.h;
        const y2 = b.y - 2;
        const dy = Math.max(18, (y2 - y1) / 2);
        d = `M${n1(x1)} ${n1(y1)} C${n1(x1)} ${n1(y1 + dy)} ${n1(x2)} ${n1(y2 - dy)} ${n1(x2)} ${n1(y2)}`;
      } else if (rb < ra) {
        const y1 = a.y;
        const y2 = b.y + b.h + 2;
        const bow = 22 + 4 * (ra - rb);
        d = `M${n1(x1)} ${n1(y1)} C${n1(x1 + bow)} ${n1(y1 - bow)} ${n1(x2 + bow)} ${n1(y2 + bow)} ${n1(x2)} ${n1(y2)}`;
      } else {
        const y1 = a.y + a.h;
        const bow = 22;
        d = `M${n1(x1)} ${n1(y1)} C${n1(x1)} ${n1(y1 + bow)} ${n1(x2)} ${n1(y1 + bow)} ${n1(x2)} ${n1(y1 + 2)}`;
      }
      parts.push(edgePath(d, signOf(e)));
    }
    for (const [id, b] of boxes) parts.push(circuitNodeBox(byId.get(id)!, b, sideKind(sideById.get(id)!), idSize));
    const lg = legend(legendItems, left, y - gapY + 40, W - left * 2);
    return svgDoc(W, lg.bottom + 14, L.circuitTitle, desc, [...parts, lg.svg].join("\n"), lang);
  };

  return {
    name: "circuit",
    svg: horizontal() ?? vertical(880),
    narrow: vertical(NARROW_W),
    title: L.circuitTitle,
    summary:
      "All circuits of the HCD and every connection between them, in three labelled bands: inputs to the ROI, the ROI circuits (in layers along the forward connections) and outputs of the ROI; " +
      "arrow colour and head show the sign (excitatory / inhibitory / modulatory / not stated), each box shows the Circuit ID and its transmitter.",
  };
}

// --- FRG -------------------------------------------------------------------------------------------------------------

const stripU = (id: string) => id.replace(/^U\./, "");

interface TreeRow {
  node: FrgNode;
  depth: number;
  /** The UC already appeared under another GN */
  repeat: boolean;
  parent: number | null;
}

function frgRows(frg: FrgGraph): TreeRow[] {
  const byId = new Map(frg.nodes.map((n) => [n.id, n]));
  const roots = frg.nodes.filter((n) => n.kind === "tlf");
  const start = roots.length ? roots : frg.nodes.filter((n) => n.parents.length === 0 && n.kind !== "uc");
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number, parent: number | null, path: Set<string>) => {
    const node = byId.get(id);
    if (!node || path.has(id)) return;
    const repeat = seen.has(id);
    rows.push({ node, depth, repeat, parent });
    seen.add(id);
    if (repeat) return;
    const me = rows.length - 1;
    const next = new Set(path).add(id);
    const subs = [...node.subnodes].sort((a, b) => Number(a.startsWith("U.")) - Number(b.startsWith("U.")));
    for (const s of subs) walk(s, depth + 1, me, next);
  };
  for (const r of start) walk(r.id, 0, null, new Set());
  return rows;
}

function gnLines(n: FrgNode, size: number, maxW: number, maxLines: number): string[] {
  return n.comments.trim() ? wrap(n.comments.replace(/^TLF:\s*/i, ""), size, maxW, maxLines) : [];
}

function frgFigure(frg: FrgGraph, L: Labels, lang: string): ArticleFigure {
  const rows = frgRows(frg);
  const gns = frg.nodes.filter((n) => n.kind !== "uc");
  const ucs = frg.nodes.filter((n) => n.kind === "uc");
  const desc = `${gns.length} function nodes and ${ucs.length} UCs: ` + gns.map((g) => `${g.id} → ${g.subnodes.join(", ")}`).join("; ");
  const kindOf = (n: FrgNode) => (n.kind === "tlf" ? C.tlf : n.kind === "gn" ? C.gn : C.roi);
  const hasRepeat = rows.some((r) => r.repeat);
  const legendItems = [
    { swatch: C.tlf, label: L.tlf },
    { swatch: C.gn, label: L.gn },
    { swatch: C.roi, label: L.uc },
    ...(hasRepeat ? [{ swatch: { ...C.roi, dashed: true }, label: L.sharedHelp }] : []),
  ];

  // wide: levels as columns, UCs aligned in the last column (a UC with two parents is drawn once)
  const wide = (() => {
    const left = 20;
    const top = 20;
    const maxDepth = Math.max(0, ...gns.map((g) => g.level));
    const deep = maxDepth >= 2;
    const gnW = deep ? 200 : 250;
    const gnLineCount = deep ? 3 : 2;
    const ucW = Math.min(deep ? 180 : 200, Math.max(120, ...ucs.map((u) => textWidth(stripU(u.id), 12.5, true) + 26)));
    const gapX = deep ? 40 : 64;
    const colX = (depth: number) => left + depth * (gnW + gapX);
    const ucX = colX(maxDepth + 1);
    const ucH = 34;
    const ucGap = 12;
    const gnH = (n: FrgNode) => 30 + gnLines(n, 11.5, gnW - 24, gnLineCount).length * 16;
    const pos = new Map<string, Box>();
    // UCs in the order they first appear in the tree
    let y = top;
    for (const r of rows) {
      if (r.node.kind !== "uc" || pos.has(r.node.id)) continue;
      pos.set(r.node.id, { x: ucX, y, w: ucW, h: ucH });
      y += ucH + ucGap;
    }
    const ucBottom = y - ucGap;
    // GNs centred on their children, bottom-up, then pushed apart within a column
    const placeGn = (id: string, seen: Set<string>): number => {
      const n = frg.nodes.find((x) => x.id === id)!;
      if (pos.has(id)) return pos.get(id)!.y + pos.get(id)!.h / 2;
      if (seen.has(id)) return top;
      seen.add(id);
      const cs = n.subnodes.filter((s) => frg.nodes.some((x) => x.id === s)).map((s) => placeGn(s, seen));
      const c = cs.length ? (Math.min(...cs) + Math.max(...cs)) / 2 : top + 20;
      const h = gnH(n);
      pos.set(id, { x: colX(Math.max(0, n.level)), y: c - h / 2, w: gnW, h });
      return c;
    };
    for (const r of rows) if (r.node.kind !== "uc") placeGn(r.node.id, new Set());
    for (let d = 0; d <= maxDepth; d++) {
      const col = gns.filter((g) => pos.has(g.id) && pos.get(g.id)!.x === colX(d)).sort((a, b) => pos.get(a.id)!.y - pos.get(b.id)!.y);
      let floor = top;
      for (const g of col) {
        const b = pos.get(g.id)!;
        if (b.y < floor) b.y = floor;
        floor = b.y + b.h + 14;
      }
    }
    const bottom = Math.max(ucBottom, ...[...pos.values()].map((b) => b.y + b.h));
    const width = ucX + ucW + left;
    const parts: string[] = [];
    for (const n of gns) {
      const a = pos.get(n.id);
      if (!a) continue;
      for (const s of n.subnodes) {
        const b = pos.get(s);
        if (!b) continue;
        const x1 = a.x + a.w;
        const y1 = a.y + a.h / 2;
        const x2 = b.x - 2;
        const y2 = b.y + b.h / 2;
        const dx = Math.max(24, (x2 - x1) / 2);
        parts.push(`<path d="M${n1(x1)} ${n1(y1)} C${n1(x1 + dx)} ${n1(y1)} ${n1(x2 - dx)} ${n1(y2)} ${n1(x2)} ${n1(y2)}" fill="none" stroke="${C.faint}" stroke-width="1.4" marker-end="url(#m-tree)"/>`);
      }
    }
    for (const n of frg.nodes) {
      const b = pos.get(n.id);
      if (!b) continue;
      const k = kindOf(n);
      parts.push(rect(b.x, b.y, b.w, b.h, k));
      if (n.kind === "uc") parts.push(text(b.x + b.w / 2, b.y + b.h / 2 + 4.5, fit(stripU(n.id), 12.5, b.w - 14, true), { size: 12.5, weight: 700, color: k.title, anchor: "middle", mono: true }));
      else {
        parts.push(text(b.x + 12, b.y + 20, fit(n.id, 12.5, b.w - 24, true), { size: 12.5, weight: 700, color: k.title, mono: true }));
        gnLines(n, 11.5, b.w - 24, gnLineCount).forEach((l, i) => parts.push(text(b.x + 12, b.y + 38 + i * 16, l, { size: 11.5, color: C.muted })));
      }
    }
    const lg = legend(legendItems, left, bottom + 30, width - left * 2);
    return svgDoc(width, lg.bottom + 14, L.frgTitle, desc, [...parts, lg.svg].join("\n"), lang);
  })();

  // narrow: an indented outline; a shared UC is repeated with a dotted frame
  const narrow = (() => {
    const W = 430;
    const left = 12;
    const indent = 18;
    const parts: string[] = [];
    const tops: { y: number; h: number; x: number }[] = [];
    let y = 14;
    for (const r of rows) {
      const x = left + r.depth * indent;
      const w = W - x - left;
      const k = kindOf(r.node);
      if (r.node.kind === "uc") {
        const h = 30;
        parts.push(rect(x, y, w, h, k, { dashed: r.repeat }));
        parts.push(text(x + 12, y + 19.5, fit(stripU(r.node.id), 12, w - 24 - (r.repeat ? 50 : 0), true), { size: 12, weight: 700, color: k.title, mono: true }));
        if (r.repeat) parts.push(text(x + w - 10, y + 19.5, L.shared, { size: 11, color: C.muted, anchor: "end" }));
        tops.push({ y, h, x });
        y += h + 8;
      } else {
        const lines = gnLines(r.node, 11.5, w - 24, 3);
        const h = 30 + lines.length * 16;
        parts.push(rect(x, y, w, h, k));
        parts.push(text(x + 12, y + 20, fit(r.node.id, 12, w - 24, true), { size: 12, weight: 700, color: k.title, mono: true }));
        lines.forEach((l, i) => parts.push(text(x + 12, y + 38 + i * 16, l, { size: 11.5, color: C.muted })));
        tops.push({ y, h, x });
        y += h + 8;
      }
    }
    const guides: string[] = [];
    rows.forEach((r, i) => {
      if (r.parent === null) return;
      const p = tops[r.parent];
      const me = tops[i];
      const gx = p.x + 8;
      guides.push(`<path d="M${n1(gx)} ${n1(p.y + p.h)} L${n1(gx)} ${n1(me.y + me.h / 2)} L${n1(me.x - 1)} ${n1(me.y + me.h / 2)}" fill="none" stroke="${C.faint}" stroke-width="1.3"/>`);
    });
    const lg = legend(legendItems, left, y + 18, W - left * 2);
    return svgDoc(W, lg.bottom + 14, L.frgTitle, desc, [...guides, ...parts, lg.svg].join("\n"), lang);
  })();

  return {
    name: "frg",
    svg: wide,
    narrow,
    title: L.frgTitle,
    summary:
      "The FRG as a tree: the TLF, the GNs (each with its comment from frg.json) and the UCs they decompose into; a UC with two parent GNs is drawn once with two incoming lines (repeated with a dotted frame on phones).",
  };
}

// --- function ↔ connection map -----------------------------------------------------------------------------------

type Role = "internal" | "in" | "out";

export interface FunctionConnections {
  gn: FrgNode;
  /** Circuit IDs of the UCs under the GN (nested GNs expanded) */
  circuits: string[];
  connections: { edge: HcdEdge; role: Role }[];
}

/**
 * For each GN with UCs directly under it (all GNs when there is none): the connections that touch its UCs, as
 * `internal` (both ends among them), `in` (only the receiver) or `out` (only the sender).
 */
export function functionConnections(hcd: HcdGraph, frg: FrgGraph): FunctionConnections[] {
  const byId = new Map(frg.nodes.map((n) => [n.id, n]));
  const ucsOf = (id: string, seen = new Set<string>()): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const n = byId.get(id);
    if (!n) return id.startsWith("U.") ? [stripU(id)] : [];
    if (n.kind === "uc") return [n.circuitId ?? stripU(n.id)];
    return n.subnodes.flatMap((s) => ucsOf(s, seen));
  };
  const gns = frg.nodes.filter((n) => n.kind !== "uc");
  const direct = gns.filter((g) => g.kind === "gn" && g.subnodes.some((s) => s.startsWith("U.")));
  const targets = direct.length ? direct : gns;
  const order: Record<Role, number> = { internal: 0, in: 1, out: 2 };
  return targets.map((gn) => {
    const circuits = [...new Set(ucsOf(gn.id))];
    const set = new Set(circuits);
    const connections = hcd.edges
      .filter((e) => e.source !== e.target && (set.has(e.source) || set.has(e.target)))
      .map((edge) => ({ edge, role: (set.has(edge.source) && set.has(edge.target) ? "internal" : set.has(edge.target) ? "in" : "out") as Role }))
      .sort((a, b) => order[a.role] - order[b.role]);
    return { gn, circuits, connections };
  });
}

function mapFigure(hcd: HcdGraph, frg: FrgGraph, L: Labels, lang: string): ArticleFigure {
  const cards = functionConnections(hcd, frg);
  const desc = cards
    .map((c) => `${c.gn.id}: ${c.connections.map((x) => `${x.edge.source} → ${x.edge.target} (${x.role})`).join(", ") || "none"}`)
    .join("; ");
  const signs = SIGN_ORDER.filter((s) => cards.some((c) => c.connections.some((x) => signOf(x.edge) === s)));

  const card = (c: FunctionConnections, x: number, y: number, w: number): { svg: string; h: number } => {
    const pad = 12;
    const parts: string[] = [];
    const lines = gnLines(c.gn, 11.5, w - pad * 2, 3);
    let cy = y + 22;
    const header: string[] = [];
    header.push(text(x + pad, cy, fit(c.gn.id, 12.5, w - pad * 2, true), { size: 12.5, weight: 700, color: C.gn.title, mono: true }));
    lines.forEach((l, i) => header.push(text(x + pad, cy + 18 + i * 16, l, { size: 11.5, color: C.muted })));
    cy += 18 + lines.length * 16;
    // circuit chips
    const chips: string[] = [];
    let chipX = x + pad + textWidth(L.circuits, 11.5) + 10;
    let chipY = cy;
    chips.push(text(x + pad, chipY + 14, L.circuits, { size: 11.5, weight: 700, color: C.muted }));
    for (const id of c.circuits) {
      const cw = Math.min(w - pad * 2, textWidth(id, 11.5, true) + 14);
      if (chipX > x + pad + 60 && chipX + cw > x + w - pad) {
        chipX = x + pad + textWidth(L.circuits, 11.5) + 10;
        chipY += 24;
      }
      chips.push(rect(chipX, chipY, cw, 20, C.roi, { rx: 5, width: 1.1 }));
      chips.push(text(chipX + 7, chipY + 14, fit(id, 11.5, cw - 10, true), { size: 11.5, color: C.roi.title, mono: true }));
      chipX += cw + 6;
    }
    cy = chipY + 32;
    const rowsSvg: string[] = [];
    if (!c.connections.length) {
      rowsSvg.push(text(x + pad, cy + 12, L.noConnections, { size: 11.5, color: C.faint }));
      cy += 22;
    }
    const pillW = Math.max(...Object.values(L.role).map((r) => textWidth(r, 11) + 16));
    for (const { edge, role } of c.connections) {
      const k = ROLE_KIND[role];
      rowsSvg.push(rect(x + pad, cy, pillW, 18, k, { rx: 9, width: 1.1 }));
      rowsSvg.push(text(x + pad + pillW / 2, cy + 13, L.role[role], { size: 11, weight: 600, color: k.title, anchor: "middle" }));
      const tx = x + pad + pillW + 10;
      const avail = w - pad - (tx - x) - 34;
      const src = fit(edge.source, 11.5, avail / 2 - 4, true);
      const srcW = textWidth(src, 11.5, true);
      rowsSvg.push(text(tx, cy + 13, src, { size: 11.5, mono: true }));
      const s = SIGN[signOf(edge)];
      const ax = tx + srcW + 6;
      rowsSvg.push(`<path d="M${n1(ax)} ${n1(cy + 9)} L${n1(ax + 22)} ${n1(cy + 9)}" stroke="${s.color}" stroke-width="1.6"${s.dashed ? ` stroke-dasharray="4 2"` : ""} marker-end="url(#m-${signOf(edge)})"/>`);
      rowsSvg.push(text(ax + 30, cy + 13, fit(edge.target, 11.5, x + w - pad - (ax + 30), true), { size: 11.5, mono: true }));
      cy += 24;
    }
    const h = cy - y + 4;
    parts.push(rect(x, y, w, h, { fill: "#ffffff", stroke: C.gn.stroke }, { rx: 10, width: 1.3 }));
    parts.push(`<rect x="${n1(x)}" y="${n1(y)}" width="6" height="${n1(h)}" rx="3" fill="${C.gn.stroke}"/>`);
    parts.push(...header, ...chips, ...rowsSvg);
    return { svg: parts.join("\n"), h };
  };

  const legendItems = [
    ...(["internal", "in", "out"] as Role[]).map((r) => ({ swatch: ROLE_KIND[r], label: L.role[r] })),
    ...signs.map((s) => ({ sign: s, label: L.sign[s] })),
  ];

  const layout = (W: number, cols: number) => {
    const left = 14;
    const gap = 16;
    const cw = (W - left * 2 - gap * (cols - 1)) / cols;
    const heights = Array(cols).fill(14) as number[];
    const parts: string[] = [];
    for (const c of cards) {
      const col = heights.indexOf(Math.min(...heights));
      const r = card(c, left + col * (cw + gap), heights[col], cw);
      parts.push(r.svg);
      heights[col] += r.h + gap;
    }
    const help = text(left, Math.max(...heights) + 10, fit(L.roleHelp, 12, W - left * 2), { size: 12, color: C.muted });
    const lg = legend(legendItems, left, Math.max(...heights) + 34, W - left * 2);
    return svgDoc(W, lg.bottom + 14, L.mapTitle, desc, [...parts, help, lg.svg].join("\n"), lang);
  };

  return {
    name: "function-map",
    svg: layout(cards.length > 1 ? 880 : 520, cards.length > 1 ? 2 : 1),
    narrow: layout(430, 1),
    title: L.mapTitle,
    summary:
      "One card per GN that has UCs directly under it: its comment, its UCs, and every connection that touches them, marked within (both ends among the GN's UCs), in (into the GN) or out (out of the GN), with the sign of the connection.",
  };
}

// --- entry -------------------------------------------------------------------------------------------------------

/** The worker's figures for an article in `locale` (labels in Japanese for `ja`, English otherwise). */
export function buildArticleFigures(hcd: HcdGraph, frg: FrgGraph, o: { locale: UiLocale; roi?: string }): ArticleFigure[] {
  const L = labelsFor(o.locale);
  const lang = o.locale === "ja" ? "ja" : "en";
  const out: ArticleFigure[] = [];
  if (hcd.nodes.length) out.push(circuitFigure(hcd, o.roi ?? "", L, lang));
  if (frg.nodes.some((n) => n.kind !== "uc")) out.push(frgFigure(frg, L, lang));
  if (hcd.nodes.length && frg.nodes.some((n) => n.kind !== "uc")) out.push(mapFigure(hcd, frg, L, lang));
  return out;
}
