/** Explanatory-article job with a scripted mock agent in place of Codex (read-only workspace from the fixture). */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCsvs, checkFrg, checkHcd } from "@cobrac/shared";
import { articleFigureDir, articleFile, articlePrompt, prepareArticleFigures, readReferences, runArticle, type ArticleFigureSet } from "../src/article.js";
import type { Prompt } from "../src/pipeline.js";
import { projectPaths } from "../src/steps.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "reward");
const PROMPTS = join(here, "..", "..", "..", "prompts");
const PROJECT_ID = "u7m2q9xa-1";

function workspace() {
  const p = projectPaths(mkdtempSync(join(tmpdir(), "cobrac-article-")), PROJECT_ID);
  for (const d of [p.hcd, p.frg, p.csv]) mkdirSync(d, { recursive: true });
  for (const f of ["references.json", "uc.json", "connections.json"]) cpSync(join(FIXTURE, "HCD", f), join(p.hcd, f));
  cpSync(join(FIXTURE, "FRG", "frg.json"), join(p.frg, "frg.json"));
  const read = (...f: string[]) => readFileSync(join(FIXTURE, ...f), "utf8");
  const hcd = checkHcd({ meta: read("meta.json"), references: read("HCD", "references.json"), uc: read("HCD", "uc.json"), connections: read("HCD", "connections.json") });
  const frg = checkFrg({ frg: read("FRG", "frg.json") }, hcd.model!);
  const { files } = buildCsvs(hcd.model!, frg.model!, { projectId: PROJECT_ID, contributor: "T", projectTemplate: readFileSync(join(PROMPTS, "Project.csv"), "utf8") });
  for (const [name, text] of Object.entries(files!)) writeFileSync(join(p.csv, name), text);
  return p;
}

const FACTS = { name: "Reward prediction error learning in mesolimbic system", revision: 2, model: "gpt-6-luna" };
const figuresOf = (paths: ReturnType<typeof workspace>, locale: "ja" | "en" = "ja"): ArticleFigureSet => prepareArticleFigures(paths, PROJECT_ID, locale, "Mesolimbic system")!;

const section = (h: string, s: string, extra = "") => `---\n\n## ${h}\n\n${s.repeat(6)}\n\n${extra}`;
const fig = (name: string, n: number) => `![${name} の図](./figures/${name}.svg "図 ${n}　${name}")\n\n`;
const article = (cite: string, figures = fig("circuit", 1) + fig("frg", 2) + fig("function-map", 3)) =>
  `# 中脳辺縁系の報酬予測誤差学習 解説：回路と機能\n\n| 項目 | 内容 |\n| ---- | ---- |\n| 文書 | 解説 |\n\n` +
  section("1. ひとことで言うと", `腹側被蓋野のドーパミン神経は、得た報酬と予測との差を伝えます。${cite}`, figures) +
  section("2. 用語", "側坐核は状態の価値を表し、その出力が腹側被蓋野に戻ります。[Haber, 2010]") +
  section("3. 領域と機能", "前頭前野からの入力が側坐核に届き、誤差の計算に文脈を与えます。") +
  section("4. 回路と接続", "`VTA` → `NAC` の接続が誤差を運びます。") +
  section("5. 機能の分解", "`R.Value-Learning` が価値を学習します。");

describe("explanatory article job", () => {
  it("writes the spec in the requested language and keeps the workspace read-only", async () => {
    const paths = workspace();
    const p = await articlePrompt(PROMPTS, PROJECT_ID, "ja", FACTS, figuresOf(paths).generated);
    expect(p.shown).toContain("Write the explanatory article in Japanese");
    expect(p.hidden).toContain("Write the article in **Japanese**");
    expect(p.hidden).toContain(`${PROJECT_ID}/article/ja.md`);
    expect(p.hidden).toContain("does not apply to it");
    expect(p.hidden).toContain("敬体");
    expect(p.hidden).toContain("`./figures/circuit.svg`");
    expect(p.hidden).toContain("`./figures/function-map.svg`");
    expect(p.hidden).toContain("data revision 2, BRA built with gpt-6-luna");
    expect(p.hidden).not.toMatch(/\{[A-Z_]+\}/);
  });

  it("sends citation problems back to the agent and returns the checked article", async () => {
    const paths = workspace();
    const turns: string[] = [];
    const fixes: string[][] = [];
    const turn = async (prompt: Prompt) => {
      turns.push(prompt.shown.split("\n")[0]);
      mkdirSync(join(paths.root, "article"), { recursive: true });
      writeFileSync(articleFile(paths, "ja"), article(turns.length === 1 ? "[Montague, 1996]" : "[Schultz, 1997]"));
      return true;
    };
    const figures = figuresOf(paths);
    const first = await articlePrompt(PROMPTS, PROJECT_ID, "ja", FACTS, figures.generated);
    const r = await runArticle({ paths, locale: "ja", maxNudges: 3, figures, turn, onFix: async (e) => void fixes.push(e) }, first);
    expect(fixes.slice(1)).toEqual([]);
    expect(turns).toEqual([`Project ID: ${PROJECT_ID}`, "The article check found 1 problem(s) in the article (fix attempt 1/3):"]);
    expect(fixes[0][0]).toContain("[Montague, 1996]");
    expect(r.result).toBe("completed");
    if (r.result !== "completed") return;
    expect(r.check.cited).toEqual(["[Schultz, 1997]", "[Haber, 2010]"]);
    expect(r.figures.map((f) => [f.name, !!f.narrow])).toEqual([
      ["circuit", true],
      ["frg", true],
      ["function-map", true],
    ]);
    expect(readReferences(paths).map((x) => x.id)).toEqual(["[Schultz, 1997]", "[Haber, 2010]", "[Luo, 2011]"]);
  });

  it("fails after the allowed fix attempts and stops when a turn stops", async () => {
    const paths = workspace();
    let n = 0;
    const figures = figuresOf(paths, "en");
    const r = await runArticle({ paths, locale: "en", maxNudges: 2, figures, turn: async () => (n++, true) }, { shown: "go" });
    expect(n).toBe(3);
    expect(r).toEqual({ result: "failed", errors: ["The article file is missing or empty."] });
    expect(await runArticle({ paths, locale: "en", maxNudges: 2, figures, turn: async () => false }, { shown: "go" })).toEqual({ result: "stopped" });
  });

  it("requires the worker's figures and sanitizes figures the agent drew", async () => {
    const paths = workspace();
    const figures = figuresOf(paths);
    const fixes: string[][] = [];
    let n = 0;
    const dir = articleFigureDir(paths);
    const turn = async () => {
      n++;
      mkdirSync(dir, { recursive: true });
      if (n === 1) {
        // the worker's own figure name is taken, and two figures are missing
        writeFileSync(join(dir, "circuit.svg"), "<svg></svg>");
        writeFileSync(articleFile(paths, "ja"), article("[Schultz, 1997]", fig("circuit", 1)));
      } else {
        rmSync(join(dir, "circuit.svg"));
        writeFileSync(join(dir, "td-error.svg"), `<svg viewBox="0 0 10 10"><script>x()</script><rect width="4" height="4" onclick="x()"/></svg>`);
        writeFileSync(articleFile(paths, "ja"), article("[Schultz, 1997]", fig("circuit", 1) + fig("frg", 2) + fig("function-map", 3) + fig("td-error", 4)));
      }
      return true;
    };
    const r = await runArticle({ paths, locale: "ja", maxNudges: 3, figures, turn, onFix: async (e) => void fixes.push(e) }, { shown: "go" });
    expect(fixes[0].join("\n")).toMatch(/Embed these figures .*frg\.svg/);
    expect(fixes[0].join("\n")).toMatch(/`circuit` is a figure the worker draws/);
    expect(r.result).toBe("completed");
    if (r.result !== "completed") return;
    const own = r.figures.find((f) => f.name === "td-error")!;
    expect(own.svg).toContain("<rect");
    expect(own.svg).not.toMatch(/script|onclick/);
  });
});
