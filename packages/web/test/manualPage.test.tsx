// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n";
import { ManualPage } from "../src/pages/ManualPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(path: string, locale: string) {
  localStorage.setItem("cobrac-locale", locale);
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/manual" element={<ManualPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("ManualPage", () => {
  it("shows the Japanese manual with its table of contents, figures and a language switch", async () => {
    await render("/manual", "ja");
    expect(document.querySelector("article")!.getAttribute("lang")).toBe("ja");
    expect(document.querySelector("h1")!.textContent).toContain("利用マニュアル");
    expect($$(".docs-toc a").map((a) => a.textContent)).toContain("はじめに");
    const imgs = $$("figure img");
    expect(imgs.length).toBe(4);
    for (const img of imgs) expect(img.getAttribute("src")).toMatch(/manual-.*\.ja\.svg/);
    expect($$("figure source").length).toBe(4);
    expect($$('[aria-label="文書の言語"] a').map((a) => a.getAttribute("href"))).toEqual(["/manual?lang=ja", "/manual?lang=en"]);
    expect(document.querySelector('[data-testid="manual-fallback"]')).toBeNull();
  });

  it("falls back to English with a note in a language the manual is not written in yet", async () => {
    await render("/manual", "de");
    expect(document.querySelector("article")!.getAttribute("lang")).toBe("en");
    expect(document.querySelector("h1")!.textContent).toContain("user manual");
    expect(document.querySelector('[data-testid="manual-fallback"]')!.textContent).toContain("Deutsch");
  });

  it("opens the language asked for in the URL", async () => {
    await render("/manual?lang=en", "ja");
    expect(document.querySelector("article")!.getAttribute("lang")).toBe("en");
    expect(document.querySelector('[data-testid="manual-fallback"]')).toBeNull();
  });

  it("has no Tier wording", async () => {
    for (const locale of ["ja", "en"]) {
      await render("/manual", locale);
      expect(document.querySelector("article")!.textContent).not.toMatch(/tier/i);
      act(() => root?.unmount());
      host?.remove();
    }
  });
});
