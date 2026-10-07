// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocContentResponse, DocListResponse } from "@cobrac/shared";

const api = vi.hoisted(() => ({ adminDocs: vi.fn(), adminDoc: vi.fn() }));
const auth = vi.hoisted(() => ({ me: { role: "admin" } as { role: string } | null }));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => auth }));

const { I18nProvider } = await import("../src/i18n");
const { DocsPage } = await import("../src/pages/DocsPage");
const { AdminOnly } = await import("../src/components/AdminOnly");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const list: DocListResponse = {
  items: [
    { slug: "01_Spec", title: "Design spec", description: "Design and API", number: "01", group: "docs" },
    { slug: "04_Harness", title: "Harness explainer", description: "What changed", number: "04", group: "docs" },
    { slug: "04_Harness_ja", title: "ハーネス解説", description: "変更点", number: "04", group: "docs" },
    { slug: "README", title: "README", description: "Web application", number: null, group: "repo" },
  ],
};
const doc: DocContentResponse = {
  slug: "04_Harness",
  text: "# Harness explainer\n\n## One\n\nSee [spec](./01_Spec.md).\n\n## Two\n\n## Three\n\n![fig](./figures/f.svg)\n",
  figures: { "f.svg": "<svg/>", "f.narrow.svg": "<svg/>" },
};

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/docs" element={<AdminOnly><DocsPage /></AdminOnly>} />
            <Route path="/docs/:slug" element={<AdminOnly><DocsPage /></AdminOnly>} />
            <Route path="/chat" element={<div data-testid="chat" />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  auth.me = { role: "admin" };
  api.adminDocs.mockResolvedValue(list);
  api.adminDoc.mockResolvedValue(doc);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("DocsPage", () => {
  it("opens on an index of the documents, one entry per language pair, with no document open", async () => {
    await render("/docs");
    const items = $$('[data-testid="docs-index-item"]');
    expect(items.map((a) => a.getAttribute("href"))).toEqual(["/docs/01_Spec", "/docs/04_Harness", "/docs/README"]);
    expect(items[0].textContent).toContain("01");
    expect(items[0].textContent).toContain("Design and API");
    expect(document.body.textContent).toContain("3 documents");
    expect(api.adminDoc).not.toHaveBeenCalled();
    expect(document.querySelector(".docs-toc")).toBeNull();
  });

  it("shows a document with its table of contents, a way back to the index and the language switch", async () => {
    await render("/docs/04_Harness");
    expect(api.adminDoc).toHaveBeenCalledWith("04_Harness");
    expect($$(".docs-toc a").map((a) => a.textContent)).toEqual(["One", "Two", "Three", "One", "Two", "Three"]);
    expect(document.querySelector('[data-testid="doc-back"]')!.getAttribute("href")).toBe("/docs");
    expect($$('[aria-label="Document language"] a').map((a) => a.getAttribute("href"))).toEqual(["/docs/04_Harness_ja", "/docs/04_Harness"]);
    expect(document.querySelector('a[href="/docs/01_Spec"]')).not.toBeNull();
    expect(document.querySelector("figure img")!.getAttribute("src")).toBe("blob:x");
  });

  it("sends anyone but an admin away without asking the API", async () => {
    auth.me = { role: "user" };
    await render("/docs");
    expect(document.querySelector('[data-testid="chat"]')).not.toBeNull();
    expect(api.adminDocs).not.toHaveBeenCalled();
  });

  it("keeps language-paired archives collapsed and out of the current document count", async () => {
    api.adminDocs.mockResolvedValue({ items: [...list.items,
      { slug: "04_Old", title: "Old harness", description: "Historic", number: "04", group: "archive" },
      { slug: "04_Old_ja", title: "旧ハーネス", description: "過去", number: "04", group: "archive" },
    ] });
    await render("/docs");
    const archive = document.querySelector<HTMLDetailsElement>('[data-testid="docs-archive"]')!;
    expect(archive.open).toBe(false);
    expect(archive.querySelectorAll("li")).toHaveLength(1);
    expect(archive.querySelector("a")!.getAttribute("href")).toBe("/docs/04_Old");
    expect(document.querySelector("h1")!.textContent).toContain("3 documents");
    expect(document.querySelector('[data-testid="docs-index-docs"]')!.textContent).not.toContain("Old harness");
  });

  it("opens an archived article at its original URL with language links and an archive notice", async () => {
    api.adminDocs.mockResolvedValue({ items: list.items.map((d) => d.slug.startsWith("04_") ? { ...d, group: "archive" } : d) });
    api.adminDoc.mockResolvedValue({ ...doc, text: doc.text.replace("./01_Spec.md", "../01_Spec.md").replace("./figures/f.svg", "../figures/f.svg") });
    await render("/docs/04_Harness");
    expect(document.querySelector('[data-testid="docs-archive-notice"]')!.textContent).toContain("archived");
    expect($$('[aria-label="Document language"] a').map((a) => a.getAttribute("href"))).toEqual(["/docs/04_Harness_ja", "/docs/04_Harness"]);
    expect(document.querySelector('a[href="/docs/01_Spec"]')).not.toBeNull();
    expect(document.querySelector("figure img")!.getAttribute("src")).toBe("blob:x");
  });

  it("reveals a folded heading when it is selected in the table of contents", async () => {
    api.adminDoc.mockResolvedValue({ ...doc, text: "# Harness\n\n<details>\n<summary>Show details</summary>\n\n## Checklist\n\n- Check output\n\n</details>" });
    await render("/docs/04_Harness");
    const details = document.querySelector<HTMLDetailsElement>("article .docs-details")!;
    expect(details.open).toBe(false);
    await act(async () => document.querySelector<HTMLAnchorElement>(".docs-toc a")!.click());
    expect(details.open).toBe(true);
    expect(document.querySelector("h2")!.id).toBe("checklist");
  });

  it("links archived articles to the current harness in the article's language", async () => {
    api.adminDocs.mockResolvedValue({ items: [
      ...list.items.map((d) => d.slug.startsWith("04_") ? { ...d, group: "archive" } : d),
      { slug: "04_CoBRAC_Harness_v2", title: "Current harness", description: "", number: "04", group: "docs" },
      { slug: "04_CoBRAC_Harness_v2_ja", title: "現行ハーネス", description: "", number: "04", group: "docs" },
    ] });
    api.adminDoc.mockResolvedValue({ ...doc, slug: "04_Harness_ja" });
    await render("/docs/04_Harness_ja");
    expect(document.querySelector('[data-testid="docs-archive-notice"] a')!.getAttribute("href")).toBe("/docs/04_CoBRAC_Harness_v2_ja");
  });

  it("reveals folded content when an in-document file link changes only the hash", async () => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    api.adminDoc.mockResolvedValue({ ...doc, text: "# Harness\n\n[Jump](./04_Harness.md#checklist)\n\n<details>\n<summary>Show details</summary>\n\n## Checklist\n\n- Check output\n\n</details>" });
    await render("/docs/04_Harness");
    const details = document.querySelector<HTMLDetailsElement>("article .docs-details")!;
    expect(details.open).toBe(false);
    await act(async () => document.querySelector<HTMLAnchorElement>('article a[href="/docs/04_Harness#checklist"]')!.click());
    expect(details.open).toBe(true);
  });
});
