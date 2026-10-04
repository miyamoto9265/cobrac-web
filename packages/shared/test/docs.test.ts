import { describe, expect, it } from "vitest";
import { compareDocs, docDescription, docFigureFiles, docSummary } from "../src/docs.js";

describe("docDescription", () => {
  it("uses the Document row of the metadata table", () => {
    const md = "# Title\n\n| Item | Description |\n| ---- | ---- |\n| Document | Design, **features**, and [API](./x.md) |\n| Audience | x |\n\nBody.\n";
    expect(docDescription(md)).toBe("Design, features, and API");
    expect(docDescription("# 題\n\n| 項目 | 内容 |\n| ---- | ---- |\n| 文書 | 解説の `本文` |\n")).toBe("解説の 本文");
  });

  it("falls back to the first paragraph, joined and clipped at a sentence", () => {
    expect(docDescription("# T\n\n> note\n\nFirst line\nsecond line.\n\nNext.\n")).toBe("First line second line.");
    expect(docDescription("# T\n\n一行目。\n二行目。\n")).toBe("一行目。二行目。");
    const long = `${"あ".repeat(100)}。${"い".repeat(100)}。`;
    expect(docDescription(`# T\n\n${long}\n`)).toBe(`${"あ".repeat(100)}。`);
    expect([...docDescription(`# T\n\n${"x".repeat(300)}\n`)].length).toBe(160);
  });

  it("stops at the first section", () => {
    expect(docDescription("# T\n\n## 1. Intro\n\nInside.\n")).toBe("");
  });
});

describe("docSummary / compareDocs", () => {
  it("numbers docs and keeps README / AGENTS after them", () => {
    const items = [docSummary("AGENTS", "# AGENTS.md\n\nRules."), docSummary("README", "# R\n\nApp."), docSummary("10_B", "# B"), docSummary("02_A", "# A")].sort(compareDocs);
    expect(items.map((d) => d.slug)).toEqual(["02_A", "10_B", "README", "AGENTS"]);
    expect(items[0]).toMatchObject({ number: "02", title: "A", group: "docs" });
    expect(items[2]).toMatchObject({ number: null, title: "README", group: "repo" });
  });
});

describe("docFigureFiles", () => {
  it("lists referenced figures with their phone versions", () => {
    const md = '![a](./figures/x.ja.svg "c")\n![b](figures/y.svg)\n![ext](https://e/z.svg)';
    expect(docFigureFiles(md)).toEqual(["x.ja.svg", "x.ja.narrow.svg", "y.svg", "y.narrow.svg"]);
  });
});
