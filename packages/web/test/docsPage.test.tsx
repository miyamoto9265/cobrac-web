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
});
