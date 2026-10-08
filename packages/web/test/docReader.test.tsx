// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocReader } from "../src/components/DocReader";
import { I18nProvider } from "../src/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(text: string, path = "/manual") {
  localStorage.setItem("cobrac-locale", "en");
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <DocReader docKey="doc" text={text} />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

const folded = "# Doc\n\n[Jump](#checklist)\n\n## One\n\n## Two\n\n<details>\n<summary>Show details</summary>\n\n## Checklist\n\n- Check output\n\n</details>";

describe("DocReader", () => {
  it("reveals a folded heading when it is selected in the table of contents", async () => {
    await render(folded);
    const details = document.querySelector<HTMLDetailsElement>("article .docs-details")!;
    expect(details.open).toBe(false);
    const entry = [...document.querySelectorAll<HTMLAnchorElement>("nav .docs-toc a")].find((a) => a.textContent === "Checklist")!;
    await act(async () => entry.click());
    expect(details.open).toBe(true);
    expect(details.querySelector("h2")!.id).toBe("checklist");
  });

  it("reveals folded content for an in-document link and for a deep link", async () => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    await render(folded);
    const details = document.querySelector<HTMLDetailsElement>("article .docs-details")!;
    await act(async () => document.querySelector<HTMLAnchorElement>('article a[href="#checklist"]')!.click());
    expect(details.open).toBe(true);
    act(() => root?.unmount());
    host?.remove();

    await render(folded, "/manual#checklist");
    expect(document.querySelector<HTMLDetailsElement>("article .docs-details")!.open).toBe(true);
  });
});
