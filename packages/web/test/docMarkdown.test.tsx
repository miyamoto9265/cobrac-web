// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { DocMarkdown } from "../src/components/DocMarkdown";
import { I18nProvider } from "../src/i18n";
import { extractHeadings } from "../src/lib/docs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(text: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <I18nProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DocMarkdown text={text} headings={extractHeadings(text)} docHref={(s) => `/docs/${s}`} onAnchor={() => {}} />
    </MemoryRouter></I18nProvider>,
  ));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("documentation disclosures", () => {
  it("starts closed and preserves Markdown tables, code, links and heading IDs inside details", async () => {
    await render('# Title\n\n<details>\n<summary>詳細表示：チェックリスト</summary>\n\n## Checks\n\n| Check | Result |\n| --- | --- |\n| Schema | **Pass** |\n\n```text\nReturn {status, message, question}.\n```\n\n[Old](./archive/04_Old.md#checks)\n\n[From README](./docs/archive/04_Old.md)\n\n</details>');
    const details = host!.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("詳細表示：チェックリスト");
    expect(details.querySelector("table strong")!.textContent).toBe("Pass");
    expect(details.querySelector("pre code")!.textContent).toContain("{status, message, question}");
    expect(details.querySelector("h2")!.id).toBe("checks");
    expect(details.querySelector('a[href="/docs/04_Old#checks"]')).not.toBeNull();
    expect(details.querySelector('a[href="/docs/04_Old"]')).not.toBeNull();
  });

  it("does not enable raw HTML, scripts, source attributes or javascript links", async () => {
    await render('<details>\n<summary>Details</summary>\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n</details>\n\n<details open ontoggle="alert(1)">\n<summary>Unsafe</summary>\n\nText\n\n</details>\n\n<details>\n<summary><img src="x" onerror="alert(1)"></summary>\n\nText\n\n</details>');
    expect(host!.querySelectorAll("details")).toHaveLength(1);
    expect(host!.querySelector("script, img, [ontoggle], [onerror]")).toBeNull();
    expect(host!.querySelector("details")!.open).toBe(false);
    expect(host!.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("keeps examples in fences as text and leaves unmatched blocks unconverted", async () => {
    await render('```html\n<details>\n<summary>Example</summary>\n\nContent\n\n</details>\n```\n\n<details>\n<summary>Missing close</summary>\n\nContent');
    expect(host!.querySelector("details")).toBeNull();
    expect(host!.querySelector("pre code")!.textContent).toContain("<summary>Example</summary>");
    expect(host!.textContent).toContain("Missing close");
  });

  it("hides prompt synchronization markers while retaining code examples and other escaped HTML", async () => {
    await render('<!-- BEGIN HARNESS PROMPTS -->\n\n<details>\n<summary>Prompt source</summary>\n\n```markdown\n<!-- BEGIN HARNESS PROMPTS -->\n<!-- END HARNESS PROMPTS -->\n```\n\n</details>\n\n<!-- END HARNESS PROMPTS -->\n\n<!-- unrelated comment -->\n\n<iframe src="https://example.com"></iframe>');
    const code = host!.querySelector("pre code")!;
    expect(code.textContent).toContain("<!-- BEGIN HARNESS PROMPTS -->");
    expect(code.textContent).toContain("<!-- END HARNESS PROMPTS -->");
    code.parentElement!.remove();
    expect(host!.textContent).not.toContain("HARNESS PROMPTS");
    expect(host!.textContent).toContain("<!-- unrelated comment -->");
    expect(host!.querySelector("iframe")).toBeNull();
  });
});
