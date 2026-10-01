import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARTICLE_FIGURE_KEY_RE, articleFigureKey, buildArticleFigures, buildGraphs, functionConnections, sanitizeSvg } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");
const graphs = () => buildGraphs("VOR", { circuitsCsv: fx("Circuits.csv"), connectionsCsv: fx("Connections.csv"), frgCsv: fx("FRG.csv") });

describe("article figures", () => {
  const { hcd, frg } = graphs();
  const figs = buildArticleFigures(hcd, frg, { locale: "ja", roi: "Cerebellar flocculus" });
  const byName = Object.fromEntries(figs.map((f) => [f.name, f]));

  it("draws the circuit, the FRG and the function map in a wide and a phone version", () => {
    expect(figs.map((f) => f.name)).toEqual(["circuit", "frg", "function-map"]);
    for (const f of figs) {
      for (const svg of [f.svg, f.narrow!]) {
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg).not.toMatch(/<script|<foreignObject|<image|href=|on[a-z]+=|@import/i);
        // the generated figures pass the sanitizer unchanged in substance
        expect(sanitizeSvg(svg)!.match(/<[a-zA-Z]+/g)!.length).toBe(svg.match(/<[a-zA-Z]+/g)!.length);
      }
      expect(Number(f.narrow!.match(/viewBox="0 0 (\d+)/)![1])).toBe(430);
      expect(Number(f.svg.match(/viewBox="0 0 (\d+)/)![1])).toBeLessThanOrEqual(980);
    }
    expect(byName.circuit.title).toBe("回路と接続（HCD）");
    expect(byName.circuit.svg).toContain("ROI：Cerebellar flocculus");
    expect(buildArticleFigures(hcd, frg, { locale: "de" })[0].title).toBe("Circuits and connections (HCD)");
  });

  it("draws every circuit and only the connections of the data", () => {
    const desc = byName.circuit.svg.match(/<desc id="d">([^<]*)<\/desc>/)![1];
    for (const n of hcd.nodes) expect(byName.circuit.svg).toContain(`>${n.id.replace(/&/g, "&amp;")}<`);
    const arrows = [...desc.matchAll(/([^\s:;]+) → ([^\s;(]+)/g)].map((m) => `${m[1]}>${m[2]}`);
    const real = new Set(hcd.edges.filter((e) => e.source !== e.target).map((e) => `${e.source}>${e.target}`));
    expect(arrows.length).toBe(real.size);
    for (const a of arrows) expect(real.has(a)).toBe(true);
    expect((byName.circuit.svg.match(/marker-end="url\(#m-/g) ?? []).length).toBeGreaterThanOrEqual(real.size);
  });

  it("maps each connection to the functions whose UCs it touches", () => {
    const cards = functionConnections(hcd, frg);
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      const set = new Set(c.circuits);
      for (const { edge, role } of c.connections) {
        expect(set.has(edge.source) || set.has(edge.target)).toBe(true);
        expect(role).toBe(set.has(edge.source) && set.has(edge.target) ? "internal" : set.has(edge.target) ? "in" : "out");
      }
      const touching = hcd.edges.filter((e) => e.source !== e.target && (set.has(e.source) || set.has(e.target)));
      expect(c.connections.length).toBe(touching.length);
      expect(byName["function-map"].svg).toContain(`>${c.gn.id}<`);
    }
  });

  it("keys figures under the article's language", () => {
    expect(articleFigureKey("ja", "circuit.narrow.svg")).toBe("article/ja/figures/circuit.narrow.svg");
    expect(ARTICLE_FIGURE_KEY_RE.test("article/ja/figures/circuit.narrow.svg")).toBe(true);
    expect(ARTICLE_FIGURE_KEY_RE.test("article/ja/figures/../x.svg")).toBe(false);
    expect(ARTICLE_FIGURE_KEY_RE.test("article/ja.md")).toBe(false);
  });
});

describe("sanitizeSvg", () => {
  it("keeps shapes and text and drops scripts, handlers, links, styles and foreign content", () => {
    const dirty = `<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)" style="background:url(http://x)">
<script>alert(1)</script><style>@import url(http://x);</style>
<defs><marker id="m"><path d="M0 0 L10 5 z"/></marker></defs>
<a href="javascript:alert(1)"><rect width="5" height="5"/></a>
<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
<image href="http://x/y.png"/>
<use href="#m"/><use xlink:href="http://x/#m"/>
<rect x="1" y="1" width="2" height="2" fill="url(#m)" stroke="url(http://x)" onclick="x()"/>
<text x="1" y="9" font-size="3">A &amp; B &lt; C</text>
<path d="M0 0" marker-end="url(#m)" fill="&#106;avascript:x"/>
</svg><script>alert(2)</script>`;
    const clean = sanitizeSvg(dirty)!;
    expect(clean).not.toMatch(/script|onload|onclick|style|foreignObject|<image|<a\b|http:\/\/x|javascript/i);
    expect(clean).toContain(`<use href="#m"/>`);
    expect(clean).toContain(`fill="url(#m)"`);
    expect(clean).toContain(`<text x="1" y="9" font-size="3">A &amp; B &lt; C</text>`);
    expect(clean).toContain(`marker-end="url(#m)"`);
    expect(clean).toContain(`viewBox="0 0 10 10"`);
    expect(clean.startsWith(`<svg xmlns="http://www.w3.org/2000/svg"`)).toBe(true);
  });

  it("rejects what is not an SVG", () => {
    expect(sanitizeSvg("<html><body>x</body></html>")).toBeNull();
    expect(sanitizeSvg("no markup")).toBeNull();
    expect(sanitizeSvg(`<svg><!-- unterminated`)).toBeNull();
    expect(sanitizeSvg(`<svg>${"<g>".repeat(7000)}</svg>`)).toBeNull();
  });
});
