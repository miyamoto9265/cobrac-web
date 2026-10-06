// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MessageRecord } from "@cobrac/shared";
import { afterEach, describe, expect, it } from "vitest";
import { MessageItem } from "../src/components/MessageItem";
import { I18nProvider } from "../src/i18n";
import { HYPOTHESIS_CATALOG, hypothesisEn } from "../src/i18n/hypothesis";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const status = (content: string, meta: Record<string, unknown>): MessageRecord => ({ projectId: "p", sk: "s", messageId: "m", jobId: "j", role: "system", type: "status", content, step: null, meta, createdAt: "2026-10-06T00:00:00.000Z" });

describe("hypothesis-mode strings", () => {
  it("are translated in every language (no English left)", () => {
    for (const [locale, catalog] of Object.entries(HYPOTHESIS_CATALOG)) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(hypothesisEn).sort());
      if (locale === "en") continue;
      for (const [k, v] of Object.entries(catalog)) expect(v, `${locale} ${k}`).not.toBe(hypothesisEn[k as keyof typeof hypothesisEn]);
    }
  });

  it("show the timeline notices of hypothesis mode in the UI language", async () => {
    localStorage.setItem("cobrac-locale", "ja");
    host = document.createElement("div");
    document.body.appendChild(host);
    const r = (root = createRoot(host));
    await act(async () =>
      r.render(<I18nProvider><MessageItem m={status("Hypotheses allowed: S1: existence on the whole HCD (share limit 20%).", { i18n: "sys.hypothesisOn", scope: "S1", claims: "existence", target: "all", limit: 20 })} /></I18nProvider>),
    );
    expect(host.textContent).toContain("仮説モード: オン（範囲 S1: existence、上限 20%）");
  });
});
