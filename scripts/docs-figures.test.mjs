import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FIGURES_DIR, MANUAL_FIGURES_DIR, renderAll, renderManual, textWidth } from "./docs-figures.mjs";

const files = renderAll();
const manual = renderManual();
const SETS = [
  ["docs/figures", FIGURES_DIR, files],
  ["docs/manual/figures", MANUAL_FIGURES_DIR, manual],
];

test("committed figures match the generator (run `npm run docs:figures` after editing it)", () => {
  for (const [, dir, set] of SETS) {
    for (const [name, content] of Object.entries(set)) assert.equal(readFileSync(join(dir, name), "utf8"), content, name);
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".svg")).sort(), Object.keys(set).sort(), dir);
  }
});

test("every figure has Japanese and English versions, each in a wide and a narrow (phone) layout", () => {
  for (const [label, , set] of SETS) {
    const names = Object.keys(set);
    const bases = names.filter((f) => f.endsWith(".ja.svg")).map((f) => f.slice(0, -".ja.svg".length));
    assert.ok(bases.length > 0, label);
    for (const b of bases) {
      for (const v of [".ja.svg", ".en.svg", ".ja.narrow.svg", ".en.narrow.svg"]) assert.ok(names.includes(b + v), b + v);
    }
    assert.equal(bases.length * 4, names.length, label);
  }
});

test("figures are self-contained SVG", () => {
  for (const [name, content] of Object.entries({ ...files, ...manual })) {
    assert.match(content, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, name);
    assert.match(content, /<title id="t">[^<]+<\/title>/, name);
    assert.doesNotMatch(content, /<script|href="http|@import|url\(http/, name);
  }
});

test("current docs, archived docs and the manual reference only figures that exist", () => {
  for (const [, dir, set] of SETS) {
    const docsDir = join(dir, "..");
    const archived = dir === FIGURES_DIR ? readdirSync(join(docsDir, "archive")).filter((f) => f.endsWith(".md")).map((f) => join("archive", f)) : [];
    for (const md of [...readdirSync(docsDir).filter((f) => f.endsWith(".md")), ...archived]) {
      const text = readFileSync(join(docsDir, md), "utf8");
      for (const [, ref] of text.matchAll(/\]\(\.{1,2}\/figures\/([^)\s]+)/g)) {
        assert.ok(ref in set, `${md} references missing figure ${ref}`);
      }
    }
  }
});

test("text width estimate treats CJK as full width", () => {
  assert.equal(textWidth("あい", 10), 20);
  assert.ok(textWidth("ab", 10) < 12);
});
