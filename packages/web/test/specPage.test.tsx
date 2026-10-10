// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecResponse } from "@cobrac/shared";

const api = vi.hoisted(() => ({ adminSpec: vi.fn(), listProjects: vi.fn(), listPlans: vi.fn() }));
const auth = vi.hoisted(() => ({ ready: true, signedIn: true, me: { role: "admin", email: "admin@example.com" } as { role: string; email: string } | null, doSignOut: () => undefined }));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => auth }));

const { I18nProvider } = await import("../src/i18n");
const { SpecPage } = await import("../src/pages/SpecPage");
const { AdminOnly } = await import("../src/components/AdminOnly");
const { default: App } = await import("../src/App");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// about:blank URLs stand in for the presigned ones, so happy-dom's <iframe> loads nothing over the network
const spec = (n: number): SpecResponse => ({
  url: `about:blank#view-${n}`,
  downloadUrl: `about:blank#download-${n}`,
  fileName: "CoBRAC_仕様書.pdf",
  bytes: 3 * 1024 * 1024,
  sha256: "abc".padEnd(64, "0"),
  updatedAt: "2026-10-01T09:00:00.000Z",
});

/** What the media queries answer: `narrow` for (max-width: 767px), `coarse` for (pointer: coarse). */
function screen({ narrow = false, coarse = false }: { narrow?: boolean; coarse?: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 767px") ? narrow : query.includes("pointer: coarse") ? coarse : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(path = "/docs", app = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {app ? (
            <>
              <App />
              <Where />
            </>
          ) : (
            <Routes>
              <Route path="/docs" element={<AdminOnly fallback="/manual"><SpecPage /></AdminOnly>} />
              <Route path="/manual" element={<div data-testid="manual" />} />
            </Routes>
          )}
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);

let clock = Date.parse("2026-10-08T00:00:00.000Z");
beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  auth.me = { role: "admin", email: "admin@example.com" };
  let n = 0;
  api.adminSpec.mockImplementation(async () => spec(++n));
  api.listProjects.mockResolvedValue({ items: [] });
  api.listPlans.mockResolvedValue({ items: [] });
  clock = Date.parse("2026-10-08T00:00:00.000Z");
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  screen({});
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("SpecPage", () => {
  it("embeds the PDF on a wide screen, under its size, date, language note and the two buttons", async () => {
    await render();
    expect(api.adminSpec).toHaveBeenCalledTimes(1);
    expect($("h1")!.textContent).toContain("CoBRAC Agents 仕様書");
    const meta = $('[data-testid="spec-meta"]')!.textContent!;
    expect(meta).toContain("3.0 MB");
    expect(meta).toContain("2026/10/01");
    expect(meta).toContain("この仕様書は日本語です");
    const open = $<HTMLAnchorElement>('[data-testid="spec-open"]')!;
    expect(open.textContent).toContain("新しいタブで開く");
    expect(open.getAttribute("href")).toBe(spec(1).url);
    expect(open.getAttribute("target")).toBe("_blank");
    const download = $<HTMLAnchorElement>('[data-testid="spec-download"]')!;
    expect(download.textContent).toContain("ダウンロード");
    expect(download.getAttribute("href")).toBe(spec(1).downloadUrl);
    expect($<HTMLIFrameElement>('[data-testid="spec-viewer"]')!.getAttribute("src")).toBe(spec(1).url);
    expect($('[data-testid="spec-mobile"]')).toBeNull();
  });

  it("shows only the buttons on a phone, and on touch-first screens", async () => {
    screen({ narrow: true });
    await render();
    expect($("iframe")).toBeNull();
    expect($('[data-testid="spec-open"]')).not.toBeNull();
    expect($('[data-testid="spec-download"]')).not.toBeNull();
    expect($('[data-testid="spec-mobile"]')!.textContent).toContain("新しいタブで開く");
    act(() => root?.unmount());
    host?.remove();

    screen({ coarse: true });
    await render();
    expect($("iframe")).toBeNull();
  });

  it("uses the links it has while they are fresh", async () => {
    await render();
    const open = vi.spyOn(window, "open");
    clock += 7 * 60_000;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => void $('[data-testid="spec-open"]')!.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(api.adminSpec).toHaveBeenCalledTimes(1);
  });

  it("opens a new tab at once and points it at a new URL when the old one is about to expire", async () => {
    await render();
    const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    clock += 9 * 60_000;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => void $('[data-testid="spec-open"]')!.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(api.adminSpec).toHaveBeenCalledTimes(2);
    expect(tab.location.href).toBe(spec(2).url);
    expect(tab.opener).toBeNull();
    expect($('[data-testid="spec-open"]')!.getAttribute("href")).toBe(spec(2).url);
    // the embedded viewer keeps the document it has open
    expect($('[data-testid="spec-viewer"]')!.getAttribute("src")).toBe(spec(1).url);
  });

  it("downloads with a new URL when the old one is about to expire", async () => {
    await render();
    const assign = vi.fn();
    const location = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, assign } });
    try {
      clock += 9 * 60_000;
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => void $('[data-testid="spec-download"]')!.dispatchEvent(click));
      expect(click.defaultPrevented).toBe(true);
      expect(assign).toHaveBeenCalledWith(spec(2).downloadUrl);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: location });
    }
  });

  it("shows why the PDF could not be loaded", async () => {
    api.adminSpec.mockRejectedValue(new Error("仕様書の PDF がありません"));
    await render();
    expect(document.body.textContent).toContain("仕様書を読み込めませんでした: 仕様書の PDF がありません");
  });

  it("sends anyone but an admin away without asking the API", async () => {
    auth.me = { role: "user", email: "user@example.com" };
    await render();
    expect($('[data-testid="manual"]')).not.toBeNull();
    expect(api.adminSpec).not.toHaveBeenCalled();
  });
});

describe("the /docs route", () => {
  it("opens from the admin page, not the sidebar, and keeps 管理 highlighted", async () => {
    await render("/docs", true);
    expect($('aside a[href="/docs"]')).toBeNull();
    expect($('aside a[href="/admin"]')!.className).toContain("bg-slate-800 text-white");
    expect($('[data-testid="where"]')!.textContent).toBe("/docs");
    expect($('[data-testid="spec-viewer"]')).not.toBeNull();
  });

  it("sends old document links to the specification", async () => {
    await render(`/docs/${encodeURIComponent("01_設計仕様")}`, true);
    expect($('[data-testid="where"]')!.textContent).toBe("/docs");
    expect(api.adminSpec).toHaveBeenCalledTimes(1);
  });

  it("keeps sending the release notes link to the release notes", async () => {
    await render("/docs/CHANGELOG", true);
    expect($('[data-testid="where"]')!.textContent).toBe("/releases");
  });
});
