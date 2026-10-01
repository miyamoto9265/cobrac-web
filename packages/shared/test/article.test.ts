import { describe, expect, it } from "vitest";
import {
  ARTICLE_MIN_CHARS,
  articleDownloadFileName,
  articleHeadingSlug,
  articleLocaleOfKey,
  articleScriptProblem,
  checkArticle,
  checkHcd,
  findCitations,
  isArticleStale,
  withReferenceList,
} from "../src/index.js";

const REFS = ["[Schultz, 1997]", "[Haber, 2010]", "[Luo, 2011]"];

const ja = (extra = "") =>
  `# 中脳辺縁系における報酬予測誤差学習\n\n` +
  `この記事では、腹側被蓋野（\`VTA\`）と側坐核（\`NAC\`）がどのように報酬予測誤差を計算し、価値の学習を支えるのかを説明します。[Schultz, 1997]\n\n` +
  `## 対象の領域と機能\n\n${"ドーパミン神経は予測よりも多くの報酬を得たときに発火を増やし、少ないときには発火を減らします。".repeat(12)} [Haber, 2010]\n\n` +
  `## 回路の役割\n\n${"側坐核は状態の価値を表し、その信号が腹側被蓋野へ戻ることで誤差が計算されます。".repeat(12)}\n\n` +
  `## 情報の流れ\n\n${"前頭前野からの文脈入力が側坐核に届き、外側手綱核が負の誤差を伝えます。".repeat(12)} [Schultz, 1997] [Luo, 2011]\n${extra}`;

const en = (body: string) =>
  `# Reward prediction error learning\n\n## Region\n\n${body}\n\n## Circuits\n\n${body}\n\n## Flow\n\n${body} [Schultz, 1997]\n`;
const EN_BODY = "Dopamine neurons in the ventral tegmental area signal the difference between received and predicted reward. ".repeat(6);

describe("explanatory article check", () => {
  it("accepts a Japanese article that cites only references.json IDs", () => {
    const r = checkArticle(ja(), { referenceIds: REFS, locale: "ja" });
    expect(r.errors).toEqual([]);
    expect(r.title).toBe("中脳辺縁系における報酬予測誤差学習");
    expect(r.cited).toEqual(["[Schultz, 1997]", "[Haber, 2010]", "[Luo, 2011]"]);
  });

  it("is not subject to the English-only rule of the core data files", () => {
    expect(checkArticle(ja(), { referenceIds: REFS, locale: "ja" }).errors.some((e) => /English/.test(e))).toBe(false);
    // the same text in a core data file is rejected by the HCD checks
    const refs = JSON.stringify({ references: [{ id: "[Schultz, 1997]", doi: "報酬予測誤差" }] });
    expect(checkHcd({ references: refs }).errors.some((e) => /references\.json: write every value in English/.test(e))).toBe(true);
  });

  it("rejects citations that are not in references.json, and several IDs in one bracket", () => {
    const r = checkArticle(ja("\n[Montague, 1996] と [Schultz, 1997; Haber, 2010] も参照。\n"), { referenceIds: REFS, locale: "ja" });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("[Montague, 1996]");
    expect(r.errors[0]).toContain("[Schultz, 1997; Haber, 2010]");
  });

  it("ignores link texts and code when looking for citations", () => {
    expect(findCitations("See [the 2010 review](https://example.org) and `[Foo, 2001]` and [Haber, 2010].")).toEqual(["[Haber, 2010]"]);
  });

  it("asks for structure, no images, no HTML and no hand-written reference list", () => {
    const r = checkArticle("Some text [Schultz, 1997]", { referenceIds: REFS, locale: "en" });
    expect(r.errors.join("\n")).toMatch(/`# ` title/);
    expect(r.errors.join("\n")).toMatch(/at least 3 `##` sections/);
    expect(r.errors.join("\n")).toMatch(/too short/);
    const extra = checkArticle(`${en(EN_BODY)}\n![fig](x.png)\n<div>x</div>\n\n## References\n\n- [Schultz, 1997]\n`, { referenceIds: REFS, locale: "en" });
    expect(extra.errors.join("\n")).toMatch(/images/);
    expect(extra.errors.join("\n")).toMatch(/HTML/);
    expect(extra.errors.join("\n")).toMatch(/reference list/);
    expect(checkArticle(ja("\n## 参考文献\n"), { referenceIds: REFS, locale: "ja" }).errors.join("\n")).toMatch(/reference list/);
  });

  it("checks that the text is in the requested language's script", () => {
    expect(articleScriptProblem(ja(), "ja")).toBeNull();
    expect(articleScriptProblem(ja(), "en")).toMatch(/not in English/);
    expect(articleScriptProblem(en(EN_BODY), "ja")).toMatch(/not in Japanese/);
    expect(articleScriptProblem(en(EN_BODY), "de")).toBeNull();
    expect(en(EN_BODY).length).toBeGreaterThan(ARTICLE_MIN_CHARS);
    expect(checkArticle(en(EN_BODY), { referenceIds: REFS, locale: "en" }).errors).toEqual([]);
  });

  it("appends the reference list with DOIs of the cited IDs only", () => {
    const refs = [
      { id: "[Schultz, 1997]", doi: "10.1126/science.275.5306.1593" },
      { id: "[Haber, 2010]", doi: "10.1038/npp.2009.129" },
      { id: "[Luo, 2011]", doi: "N/A" },
      { id: "[Kim, 2020]", doi: "", pmid: "31234567", title: "A study.", journal: "Neuron" },
    ];
    const out = withReferenceList("# T\n\nBody\n", ["[Luo, 2011]", "[Schultz, 1997]", "[Kim, 2020]"], refs, "ja");
    expect(out).toBe(
      "# T\n\nBody\n\n## 参考文献\n\n- [Luo, 2011]\n- [Schultz, 1997] https://doi.org/10.1126/science.275.5306.1593\n" +
        "- [Kim, 2020] A study. *Neuron*. https://pubmed.ncbi.nlm.nih.gov/31234567/\n",
    );
    expect(withReferenceList("# T", [], refs, "en")).toBe("# T\n");
  });
});

describe("articles in the documentation format", () => {
  const format = {
    figures: ["circuit", "frg", "function-map"],
    requiredFigures: ["circuit", "frg", "function-map"],
    connections: [
      ["A9/46d(left)", "NAC"],
      ["VTA", "NAC"],
      ["NAC", "VTA"],
      ["NAC", "Arc"],
    ] as [string, string][],
    circuitIds: ["A9/46d(left)", "VTA", "NAC", "Arc"],
    gnIds: ["R.Reward-Prediction-Error-Learning", "R.Value-Learning"],
  };
  const body = "腹側被蓋野のドーパミン神経は、得た報酬と予測との差を伝え、側坐核の価値の学習を支えます。".repeat(5);
  const doc = (o: { flow?: string; figures?: string; link?: string; table?: boolean } = {}) =>
    `# 中脳辺縁系の報酬予測誤差学習 解説：回路と機能の対応\n\n` +
    (o.table === false ? "" : `| 項目 | 内容 |\n| ---- | ---- |\n| 文書 | 解説 |\n\n`) +
    `---\n\n## 1. ひとことで言うと\n\n${body} [Schultz, 1997]\n\n` +
    (o.figures ?? `![回路の図](./figures/circuit.svg "図 1　回路と接続")\n\n`) +
    `---\n\n## 2. 用語\n\n${body}\n\n---\n\n## 3. 領域と機能\n\n${body}\n\n---\n\n## 4. 回路と接続（HCD）\n\n### 4.2 情報の流れ\n\n` +
    `${o.flow ?? "`A9/46d(left)` → `NAC` → `VTA` の順に信号が進みます。"}${o.link ?? "詳しくは [4.2](#42-情報の流れ) を参照してください。"}\n\n` +
    (o.figures === undefined ? `![FRG の図](./figures/frg.svg "図 2　機能の分解")\n\n![対応](./figures/function-map.svg "図 3　どの接続がどの機能を担うか")\n\n` : "") +
    `---\n\n## 5. 機能の分解（FRG）\n\n\`R.Value-Learning\` が価値を学習します。${body} [Haber, 2010]\n`;

  it("accepts a well-formed article and lists the embedded figures", () => {
    const r = checkArticle(doc(), { referenceIds: REFS, locale: "ja", format });
    expect(r.errors).toEqual([]);
    expect(r.figures).toEqual(["circuit", "frg", "function-map"]);
    expect(articleHeadingSlug("4.2 情報の流れ")).toBe("42-情報の流れ");
  });

  it("asks for the summary table, the figures with captions and five sections", () => {
    const figures = `![](./figures/circuit.svg)\n\n![x](./figures/other.svg "図")\n\n![x](./figures/circuit.svg "図")\n\n`;
    const all = checkArticle(doc({ table: false, figures }), { referenceIds: REFS, locale: "ja", format }).errors.join("\n");
    expect(all).toMatch(/summary table/);
    expect(all).toMatch(/not available: \.\/figures\/other\.svg/);
    expect(all).toMatch(/Embed these figures .*frg\.svg, \.\/figures\/function-map\.svg/);
    expect(all).toMatch(/once \(repeated: circuit\)/);
    expect(all).toMatch(/alt text and a caption/);
    expect(checkArticle(ja(), { referenceIds: REFS, locale: "ja", format }).errors.join("\n")).toMatch(/at least 5 `##` sections/);
  });

  it("rejects arrows between circuits that are not connections, unknown GNs and broken section links", () => {
    const flow = "`VTA` → `A9/46d(left)` と `NAC` -> `Arc` と `U.Arc` → `NAC` を通り、`R.Missing` が働きます。";
    const all = checkArticle(doc({ flow, link: "[4.3](#43-なし)" }), { referenceIds: REFS, locale: "ja", format }).errors.join("\n");
    expect(all).toMatch(/not connections .*`VTA` → `A9\/46d\(left\)`, `Arc` → `NAC`/);
    expect(all).not.toMatch(/`NAC` → `Arc`/);
    expect(all).toMatch(/not in frg\.json: R\.Missing/);
    expect(all).toMatch(/point to no heading: #43-なし/);
  });

  it("keeps the old rules (no images) when no format is given", () => {
    expect(checkArticle(doc(), { referenceIds: REFS, locale: "ja" }).errors.join("\n")).toMatch(/Do not embed images/);
  });
});

describe("article keys and metadata", () => {
  it("maps keys to locales and names downloads after the project", () => {
    expect(articleLocaleOfKey("article/ja.md")).toBe("ja");
    expect(articleLocaleOfKey("article/zhTw.md")).toBe("zhTw");
    expect(articleLocaleOfKey("article/ja.json")).toBeNull();
    expect(articleLocaleOfKey("article/xx.md")).toBeNull();
    expect(articleLocaleOfKey("workspace/article/ja.md")).toBeNull();
    expect(articleDownloadFileName("報酬 学習", "u7m2q9xa-1", "ja")).toEqual({ ascii: "u7m2q9xa-1.article.ja.md", utf8: "報酬_学習_u7m2q9xa-1.article.ja.md" });
  });

  it("is stale once the project has a newer revision", () => {
    expect(isArticleStale({ sourceRevision: 2 }, { revision: 2 })).toBe(false);
    expect(isArticleStale({ sourceRevision: 2 }, { revision: 3 })).toBe(true);
    expect(isArticleStale({ sourceRevision: 0 }, {})).toBe(false);
  });
});
