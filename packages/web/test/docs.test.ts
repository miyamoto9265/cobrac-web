import { describe, expect, it } from "vitest";
import { extractHeadings } from "../src/lib/docs";

describe("document heading extraction", () => {
  it("keeps embedded prompt headings inside a longer code fence out of the TOC", () => {
    const md = '# Article\n\n## Prompt source\n\n<details>\n<summary>詳細表示：実際のプロンプト</summary>\n\n````markdown\n# AGENTS.md\n\n```json\n{}\n```\n\n## Hidden phase instructions\n\n````\n\n</details>\n\n## Next section';
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["Article", "Prompt source", "Next section"]);
  });

  it("requires a matching fence character, enough markers and no info string to close", () => {
    const md = '~~~markdown\n# Hidden\n```\n## Hidden too\n~~~text\n### Still hidden\n~~~~\n## Shown';
    expect(extractHeadings(md)).toEqual([{ depth: 2, text: "Shown", id: "shown", line: 8 }]);
  });
});
