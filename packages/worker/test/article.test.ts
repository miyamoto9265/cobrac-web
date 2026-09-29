/** Explanatory-article job with a scripted mock agent in place of Codex (read-only workspace from the fixture). */
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { articleFile, articlePrompt, readReferences, runArticle } from "../src/article.js";
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
  return p;
}

const section = (h: string, s: string) => `## ${h}\n\n${s.repeat(10)}\n\n`;
const article = (cite: string) =>
  `# 中脳辺縁系の報酬予測誤差学習\n\n` +
  section("領域と機能", `腹側被蓋野のドーパミン神経は、得た報酬と予測との差を伝えます。${cite}`) +
  section("回路", "側坐核は状態の価値を表し、その出力が腹側被蓋野に戻ります。[Haber, 2010]") +
  section("情報の流れ", "前頭前野からの入力が側坐核に届き、誤差の計算に文脈を与えます。外側手綱核は負の誤差を伝えます。");

describe("explanatory article job", () => {
  it("writes the spec in the requested language and keeps the workspace read-only", async () => {
    const p = await articlePrompt(PROMPTS, PROJECT_ID, "ja");
    expect(p.shown).toContain("Write the explanatory article in Japanese");
    expect(p.hidden).toContain("Write the article in **Japanese**");
    expect(p.hidden).toContain(`${PROJECT_ID}/article/ja.md`);
    expect(p.hidden).toContain("does not apply to it");
    expect(p.hidden).not.toMatch(/\{(P|LANG|LOCALE)\}/);
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
    const first = await articlePrompt(PROMPTS, PROJECT_ID, "ja");
    const r = await runArticle({ paths, locale: "ja", maxNudges: 3, turn, onFix: async (e) => void fixes.push(e) }, first);
    expect(fixes.slice(1)).toEqual([]);
    expect(turns).toEqual([`Project ID: ${PROJECT_ID}`, "The article check found 1 problem(s) in the article (fix attempt 1/3):"]);
    expect(fixes[0][0]).toContain("[Montague, 1996]");
    expect(r.result).toBe("completed");
    if (r.result !== "completed") return;
    expect(r.check.cited).toEqual(["[Schultz, 1997]", "[Haber, 2010]"]);
    expect(readReferences(paths).map((x) => x.id)).toEqual(["[Schultz, 1997]", "[Haber, 2010]", "[Luo, 2011]"]);
  });

  it("fails after the allowed fix attempts and stops when a turn stops", async () => {
    const paths = workspace();
    let n = 0;
    const r = await runArticle({ paths, locale: "en", maxNudges: 2, turn: async () => (n++, true) }, { shown: "go" });
    expect(n).toBe(3);
    expect(r).toEqual({ result: "failed", errors: ["The article file is missing or empty."] });
    expect(await runArticle({ paths, locale: "en", maxNudges: 2, turn: async () => false }, { shown: "go" })).toEqual({ result: "stopped" });
  });
});
