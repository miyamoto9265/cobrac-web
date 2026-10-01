/**
 * Allow-list sanitizer for SVG figures of explanatory articles (worker-generated and agent-written). The web shows
 * figures through `<img>` (no scripts, no external loads there either); this keeps only drawing elements and
 * presentation attributes so a figure opened on its own is just as inert.
 */

const ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "marker",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "symbol",
  "use",
]);

const ATTRIBUTES = new Set([
  "id",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "dx",
  "dy",
  "width",
  "height",
  "d",
  "points",
  "viewbox",
  "preserveaspectratio",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "clip-path",
  "clip-rule",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "role",
  "aria-label",
  "aria-labelledby",
  "lang",
  "marker-start",
  "marker-mid",
  "marker-end",
  "refx",
  "refy",
  "markerwidth",
  "markerheight",
  "markerunits",
  "orient",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "href",
  "xlink:href",
]);

export const SVG_MAX_BYTES = 200_000;
const MAX_ELEMENTS = 6000;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");

function safeValue(name: string, raw: string): string | null {
  const v = decodeEntities(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  if (name === "href" || name === "xlink:href") return /^#[A-Za-z_][\w.-]*$/.test(v.trim()) ? v.trim() : null;
  const compact = v.replace(/\s+/g, "").toLowerCase();
  if (/javascript:|vbscript:|data:|expression\(|@import|behavior:/.test(compact)) return null;
  for (const m of compact.matchAll(/url\(([^)]*)\)/g)) if (!/^['"]?#[a-z_][\w.-]*['"]?$/.test(m[1])) return null;
  return v;
}

const TAG_RE = /^<\/?([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Returns the sanitized SVG (the first `<svg>` element and its allowed content), or null when the input is not an
 * SVG, is too large, or is malformed.
 */
export function sanitizeSvg(input: string): string | null {
  if (typeof input !== "string" || input.length > SVG_MAX_BYTES) return null;
  const out: string[] = [];
  const stack: string[] = [];
  let skipDepth = 0;
  let started = false;
  let elements = 0;
  let i = 0;
  while (i < input.length) {
    if (started && stack.length === 0 && skipDepth === 0) break;
    const lt = input.indexOf("<", i);
    if (lt < 0) {
      if (started && skipDepth === 0) out.push(escText(decodeEntities(input.slice(i))));
      break;
    }
    if (lt > i && started && skipDepth === 0) out.push(escText(decodeEntities(input.slice(i, lt))));
    const rest = input.slice(lt, lt + 4096);
    if (rest.startsWith("<!--")) {
      const end = input.indexOf("-->", lt + 4);
      if (end < 0) return null;
      i = end + 3;
      continue;
    }
    if (rest.startsWith("<![CDATA[")) {
      const end = input.indexOf("]]>", lt);
      if (end < 0) return null;
      i = end + 3;
      continue;
    }
    if (rest.startsWith("<!") || rest.startsWith("<?")) {
      const end = input.indexOf(">", lt);
      if (end < 0) return null;
      i = end + 1;
      continue;
    }
    const m = TAG_RE.exec(input.slice(lt, lt + 65536));
    if (!m) return null;
    i = lt + m[0].length;
    const closing = m[0][1] === "/";
    const name = m[1].toLowerCase().replace(/^svg:/, "");
    const selfClosing = m[3] === "/";
    if (++elements > MAX_ELEMENTS) return null;

    if (skipDepth > 0) {
      if (!closing && !selfClosing) skipDepth++;
      else if (closing) skipDepth--;
      continue;
    }
    if (closing) {
      if (!started) continue;
      if (stack[stack.length - 1] !== name) {
        if (!stack.includes(name)) continue;
        while (stack.length && stack[stack.length - 1] !== name) out.push(`</${stack.pop()}>`);
      }
      stack.pop();
      out.push(`</${name}>`);
      continue;
    }
    if (!started && name !== "svg") {
      if (!selfClosing) skipDepth = 1;
      continue;
    }
    // anything else (script, style, foreignObject, a, image, animation, …) is dropped with its content
    if (!ELEMENTS.has(name)) {
      if (!selfClosing) skipDepth = 1;
      continue;
    }
    started = true;
    const attrs: string[] = [];
    if (name === "svg" && stack.length === 0) attrs.push(`xmlns="http://www.w3.org/2000/svg"`);
    for (const a of m[2].matchAll(ATTR_RE)) {
      const attr = a[1].toLowerCase();
      if (!ATTRIBUTES.has(attr) || attr.startsWith("on")) continue;
      const value = safeValue(attr, a[2] ?? a[3] ?? a[4] ?? "");
      if (value === null) continue;
      attrs.push(`${a[1]}="${escAttr(value)}"`);
    }
    if (attrs.some((x) => x.startsWith("xlink:href"))) attrs.push(`xmlns:xlink="http://www.w3.org/1999/xlink"`);
    const tag = `<${name === "lineargradient" ? "linearGradient" : name === "radialgradient" ? "radialGradient" : name === "clippath" ? "clipPath" : name}${attrs.length ? " " + attrs.join(" ") : ""}`;
    if (selfClosing) out.push(`${tag}/>`);
    else {
      out.push(`${tag}>`);
      stack.push(name);
    }
  }
  if (!started) return null;
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("").replace(/<\/(lineargradient|radialgradient|clippath)>/g, (_, n: string) => `</${n === "lineargradient" ? "linearGradient" : n === "radialgradient" ? "radialGradient" : "clipPath"}>`) + "\n";
}
