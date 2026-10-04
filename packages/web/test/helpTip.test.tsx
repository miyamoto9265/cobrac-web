// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HelpLink, HelpTip } from "../src/components/HelpTip";
import { I18nProvider } from "../src/i18n";
import { extractHeadings } from "../src/lib/docs";
import { HELP_ANCHORS, MANUAL_LANGS, helpDocPath } from "../src/lib/help";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter>
      </I18nProvider>,
    );
  });
}
const fire = (el: Element, ev: Event) => act(async () => void el.dispatchEvent(ev));
const btn = () => document.querySelector<HTMLButtonElement>("[data-helptip]")!;
const tip = () => document.getElementById(btn().getAttribute("aria-describedby")!)!;

beforeEach(() => localStorage.setItem("cobrac-locale", "ja"));
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("HelpTip", () => {
  it("is a focusable button described by its tooltip, hidden until opened", async () => {
    await render(<HelpTip text="説明の本文" />);
    expect(btn().tagName).toBe("BUTTON");
    expect(btn().getAttribute("type")).toBe("button");
    expect(btn().getAttribute("aria-label")).toBe("ヘルプ");
    expect(tip().getAttribute("role")).toBe("tooltip");
    expect(tip().textContent).toBe("説明の本文");
    expect(tip().hidden).toBe(true);
  });

  it("opens on keyboard focus and closes on Escape and blur", async () => {
    await render(<HelpTip text="x" />);
    await act(async () => btn().focus());
    expect(tip().hidden).toBe(false);
    expect(btn().getAttribute("aria-expanded")).toBe("true");
    await fire(window as unknown as Element, new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tip().hidden).toBe(true);
    await act(async () => btn().blur());
    await act(async () => btn().focus());
    expect(tip().hidden).toBe(false);
  });

  it("toggles on click / tap, and a tap elsewhere closes it", async () => {
    await render(<HelpTip text="x" />);
    await act(async () => btn().click());
    expect(tip().hidden).toBe(false);
    await act(async () => btn().click());
    expect(tip().hidden).toBe(true);
    await act(async () => btn().click());
    await act(async () => btn().blur());
    await fire(document.body, new Event("pointerdown", { bubbles: true }));
    expect(tip().hidden).toBe(true);
  });

  it("stays open on a tap, which focuses the button before the click", async () => {
    await render(<HelpTip text="x" />);
    await act(async () => btn().focus());
    await act(async () => btn().click());
    expect(tip().hidden).toBe(false);
    await act(async () => btn().click());
    expect(tip().hidden).toBe(true);
  });

  it("opens on mouse hover", async () => {
    await render(<HelpTip text="x" />);
    await fire(btn(), Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "mouse" }));
    await fire(btn(), Object.assign(new Event("pointerenter"), { pointerType: "mouse" }));
    expect(tip().hidden).toBe(false);
    await fire(btn(), Object.assign(new Event("pointerout", { bubbles: true }), { pointerType: "mouse" }));
    await fire(btn(), Object.assign(new Event("pointerleave"), { pointerType: "mouse" }));
    expect(tip().hidden).toBe(true);
  });
});

describe("help links", () => {
  it("open the manual section in the UI language, or in English when the manual is not written in it", async () => {
    await render(<HelpLink section="rules" />);
    expect(document.querySelector("a")!.getAttribute("href")).toBe(`/manual#${encodeURIComponent("canon-に従って作る")}`);
    expect(helpDocPath("de", "push")).toBe("/manual#push-and-review");
    expect(helpDocPath("en", "public")).toBe("/manual#publishing-and-cloning");
  });

  it("use anchors that exist in every language of the manual", () => {
    for (const lang of MANUAL_LANGS) {
      const file = resolve(__dirname, `../../../docs/manual/${lang}.md`);
      const ids = extractHeadings(readFileSync(file, "utf8")).map((h) => h.id);
      for (const [section, anchors] of Object.entries(HELP_ANCHORS)) expect(ids, `${lang} ${section}`).toContain(anchors[lang]);
    }
  });
});
