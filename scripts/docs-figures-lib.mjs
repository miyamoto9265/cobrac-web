// Drawing helpers shared by the documentation figures (see docs-figures.mjs).
// Plain SVG only: no scripts, no external fonts or CDN.

export const SANS = "'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic',Meiryo,'Noto Sans CJK JP',system-ui,-apple-system,'Segoe UI',sans-serif";
export const MONO = "'JetBrains Mono',Consolas,'SFMono-Regular',Menlo,'Noto Sans Mono CJK JP',monospace";

export const C = {
  text: "#0f172a",
  muted: "#475569",
  faint: "#94a3b8",
  line: "#64748b",
  worker: { fill: "#eff6ff", stroke: "#3b82f6", title: "#1e3a8a" },
  agent: { fill: "#f5f3ff", stroke: "#8b5cf6", title: "#4c1d95" },
  code: { fill: "#ecfdf5", stroke: "#10b981", title: "#065f46" },
  warn: { fill: "#fffbeb", stroke: "#f59e0b", title: "#92400e" },
  bad: { fill: "#fef2f2", stroke: "#ef4444", title: "#991b1b" },
  plain: { fill: "#ffffff", stroke: "#cbd5e1", title: "#0f172a" },
  lane: "#f8fafc",
  v0: "#f59e0b",
  v1: "#3b82f6",
};

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Splits `code` spans out of a label: [{ text, code }]. */
export function segments(s) {
  return String(s)
    .split("`")
    .map((text, i) => ({ text, code: i % 2 === 1 }))
    .filter((p) => p.text);
}

export function charWidth(ch, mono) {
  const c = ch.codePointAt(0);
  if (c >= 0x2e80 || (c >= 0x2010 && c <= 0x2027) || c === 0x2192 || c === 0x2190 || c === 0x2212) return 1;
  if (mono) return 0.6;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[mwMW]/.test(ch)) return 0.82;
  if (/[il.,:;'|!()[\]{} ]/.test(ch)) return 0.3;
  if (/[0-9]/.test(ch)) return 0.56;
  return 0.54;
}

export function textWidth(s, size) {
  let w = 0;
  for (const seg of segments(s)) {
    const k = seg.code ? 0.92 : 1;
    for (const ch of seg.text) w += charWidth(ch, seg.code) * size * k;
  }
  return w;
}

export function text(x, y, s, { size = 13, anchor = "start", weight = 400, color = C.text, maxWidth, italic = false } = {}) {
  if (maxWidth !== undefined && textWidth(s, size) > maxWidth) {
    throw new Error(`text does not fit (${Math.round(textWidth(s, size))} > ${maxWidth}px): ${s}`);
  }
  const spans = segments(s)
    .map((seg) =>
      seg.code
        ? `<tspan font-family="${esc(MONO)}" font-size="${(size * 0.92).toFixed(1)}" fill="#1e293b">${esc(seg.text)}</tspan>`
        : `<tspan>${esc(seg.text)}</tspan>`,
    )
    .join("");
  const style = italic ? ` font-style="italic"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${style}>${spans}</text>`;
}

/**
 * A rounded box with an optional bold title and body lines, vertically centred.
 * kind: worker | agent | code | warn | bad | plain
 */
export function box({ x, y, w, h, kind = "plain", title, lines = [], align = "start", size = 13, titleSize = 14, dashed = false, rx = 8 }) {
  const k = C[kind];
  const pad = 12;
  const lineH = size * 1.45;
  const titleH = title ? titleSize * 1.5 : 0;
  const contentH = titleH + lines.length * lineH;
  let cy = y + (h - contentH) / 2;
  const tx = align === "middle" ? x + w / 2 : x + pad;
  const maxWidth = w - pad * 2;
  const out = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"${dashed ? ` stroke-dasharray="6 4"` : ""}/>`,
  ];
  if (title) {
    out.push(text(tx, cy + titleSize * 1.1, title, { size: titleSize, weight: 700, color: k.title, anchor: align, maxWidth }));
    cy += titleH;
  }
  for (const l of lines) {
    out.push(text(tx, cy + size * 1.1, l, { size, anchor: align, color: C.text, maxWidth }));
    cy += lineH;
  }
  return out.join("\n");
}

export function pill(x, y, s, { kind = "warn", size = 12, anchor = "start" } = {}) {
  const w = textWidth(s, size) + 20;
  const h = size + 12;
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const k = C[kind];
  return [
    `<rect x="${left.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.2"/>`,
    text(left + 10, y + h / 2 + size * 0.36, s, { size, color: k.title, weight: 600 }),
  ].join("\n");
}

export function badge(x, y, n, color = C.bad.stroke) {
  return `<circle cx="${x}" cy="${y}" r="11" fill="${color}"/>${text(x, y + 4.5, String(n), { size: 13, weight: 700, color: "#ffffff", anchor: "middle" })}`;
}

/** Polyline arrow through the given points; the last segment carries the arrowhead. */
export function arrow(points, { color = C.line, dashed = false, width = 1.6, marker = "arrow" } = {}) {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const id = `${marker}-${color.slice(1)}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dashed ? ` stroke-dasharray="6 4"` : ""} marker-end="url(#${id})"/>`;
}

export function markers(colors) {
  return colors
    .map(
      (c) =>
        `<marker id="arrow-${c.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`,
    )
    .join("");
}

export function svg({ width, height, title, desc, body, lang }) {
  const colors = [C.line, C.worker.stroke, C.agent.stroke, C.code.stroke, C.warn.stroke, C.bad.stroke];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="t d" lang="${lang}" font-family="${esc(SANS)}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<defs>${markers(colors)}</defs>
<rect width="${width}" height="${height}" fill="#ffffff"/>
${body}
</svg>
`;
}

/** Width of the narrow (phone) figures. */
export const NW = 430;

export function legendRows(items, y, maxW) {
  const out = [];
  let lx = 10;
  let ly = y;
  for (const [k, label] of items) {
    const w = 22 + textWidth(label, 12) + 22;
    if (lx > 10 && lx + w > maxW) {
      lx = 10;
      ly += 20;
    }
    out.push(`<rect x="${lx}" y="${ly - 11}" width="16" height="14" rx="3" fill="${C[k].fill}" stroke="${C[k].stroke}" stroke-width="1.5"/>`);
    out.push(text(lx + 22, ly, label, { size: 12, color: C.muted }));
    lx += w;
  }
  return { svg: out.join("\n"), bottom: ly };
}
