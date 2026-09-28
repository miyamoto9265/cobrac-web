import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FIGURES_DIR, renderAll, textWidth } from "./docs-figures.mjs";

const files = renderAll();

test("committed figures match the generator (run `npm run docs:figures` after editing it)", () => {
  for (const [name, content] of Object.entries(files)) {
    assert.equal(readFileSync(join(FIGURES_DIR, name), "utf8"), content, name);
  }
});

test("every figure has Japanese and English versions, each in a wide and a narrow (phone) layout", () => {
  const names = Object.keys(files);
  const bases = names.filter((f) => f.endsWith(".ja.svg")).map((f) => f.slice(0, -".ja.svg".length));
  assert.ok(bases.length > 0);
  for (const b of bases) {
    for (const v of [".ja.svg", ".en.svg", ".ja.narrow.svg", ".en.narrow.svg"]) assert.ok(names.includes(b + v), b + v);
  }
  assert.equal(bases.length * 4, names.length);
});

test("figures are self-contained SVG", () => {
  for (const [name, content] of Object.entries(files)) {
    assert.match(content, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, name);
    assert.match(content, /<title id="t">[^<]+<\/title>/, name);
    assert.doesNotMatch(content, /<script|href="http|@import|url\(http/, name);
  }
});

test("docs reference only figures that exist", () => {
  const docsDir = join(FIGURES_DIR, "..");
  for (const md of readdirSync(docsDir).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(docsDir, md), "utf8");
    for (const [, ref] of text.matchAll(/\]\(\.\/figures\/([^)\s]+)/g)) {
      assert.ok(ref in files, `${md} references missing figure ${ref}`);
    }
  }
});

test("text width estimate treats CJK as full width", () => {
  assert.equal(textWidth("あい", 10), 20);
  assert.ok(textWidth("ab", 10) < 12);
});
