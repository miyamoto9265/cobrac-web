// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MessageRecord } from "@cobrac/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageItem } from "../src/components/MessageItem";
import { I18nProvider } from "../src/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(m: MessageRecord) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => r.render(<I18nProvider><MessageItem m={m} /></I18nProvider>));
  return host;
}
const msg = (role: MessageRecord["role"], type: MessageRecord["type"], content: string, meta?: Record<string, unknown>): MessageRecord => ({
  projectId: "p",
  sk: "2026-10-01T00:00:00.000Z#1",
  messageId: "m1",
  jobId: "j",
  role,
  type,
  content,
  step: null,
  meta,
  createdAt: "2026-10-01T00:00:00.000Z",
});

beforeEach(() => localStorage.setItem("cobrac-locale", "en"));
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("MessageItem", () => {
  it("shows a Codex warning from the worker as a neutral status line, not as an error", async () => {
    const warning = "Model metadata for `gpt-x` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.";
    const el = await render(msg("agent", "status", warning, { kind: "codexWarning" }));
    expect(el.textContent).toContain(warning);
    expect(el.textContent).not.toContain("Error");
    expect(el.querySelector(".bg-slate-100")).not.toBeNull();
    expect(el.querySelector(".bg-rose-50")).toBeNull();
  });

  it("still shows real errors as errors", async () => {
    const el = await render(msg("agent", "error", "Turn failed: invalid_request_error"));
    expect(el.textContent).toContain("Error");
    expect(el.textContent).toContain("Turn failed: invalid_request_error");
  });
});
