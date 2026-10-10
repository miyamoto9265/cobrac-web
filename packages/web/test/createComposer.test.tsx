// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  models: vi.fn(),
  listCanons: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  seedPreview: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, uploadFile: vi.fn(), ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({
  useAuth: () => ({ me: { apiKeyRegistered: true, keySource: "own", defaultModel: null, defaultReasoningEffort: null, defaultCanonId: null, contributorName: "Tester", displayName: "Tester" } }),
}));

const { I18nProvider, LOCALES } = await import("../src/i18n");
const { PairFields } = await import("../src/components/create/PairFields");
const { bnaHints, bnaHintText } = await import("../src/components/create/bnaHint");
const { EXAMPLES } = await import("../src/components/create/examples");
const { ChatPage } = await import("../src/pages/ChatPage");

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
const $ = <T extends Element = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);
const type = (el: HTMLTextAreaElement | HTMLInputElement, value: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (el: Element, k: string, opts: KeyboardEventInit = {}) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts })));
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
const focus = (el: HTMLElement) => act(async () => el.focus());

function Harness({ onSubmit, canSubmit = true }: { onSubmit: () => void; canSubmit?: boolean }) {
  const [roi, setRoi] = useState("");
  const [tlf, setTlf] = useState("");
  return <PairFields roi={roi} tlf={tlf} onRoi={setRoi} onTlf={setTlf} onSubmit={onSubmit} canSubmit={canSubmit} />;
}

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  api.models.mockResolvedValue({ models: ["gpt-6-luna"], pricedModels: ["gpt-6-luna"], envDefaultModel: "gpt-6-luna" });
  api.listCanons.mockResolvedValue({ items: [] });
  api.listProjects.mockResolvedValue({ items: [] });
  api.createProject.mockResolvedValue({ projectId: "p-1" });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BNA hints for the ROI", () => {
  it("matches area abbreviations, gyri and area names; ignores non-Latin input", () => {
    expect(bnaHints("A44").map((h) => h.abbr)).toEqual(["A44d", "A44op", "A44v"]);
    expect(bnaHints("IFG").every((h) => h.l2 === "IFG")).toBe(true);
    expect(bnaHints("hippocampus")).toEqual([]);
    expect(bnaHints("putamen")).toEqual([]);
    expect(bnaHints("A28")).toEqual([]);
    expect(bnaHints("insula").length).toBeGreaterThan(0);
    expect(bnaHints("海馬")).toEqual([]);
    expect(bnaHints("a")).toEqual([]);
    expect(bnaHintText(bnaHints("A44d")[0])).toBe("dorsal area 44 (A44d, BNA:29-30)");
  });
});

describe("example pairs", () => {
  it("has the same number of ROI × TLF pairs in every UI language", () => {
    for (const l of LOCALES) {
      expect(EXAMPLES[l.id].length, l.id).toBe(EXAMPLES.en.length);
      for (const [roi, tlf] of EXAMPLES[l.id]) expect(roi && tlf, l.id).toBeTruthy();
    }
  });

  it("rotates ROI and TLF together while empty and pauses while a field has text", async () => {
    vi.useFakeTimers();
    await render(<Harness onSubmit={() => undefined} />);
    const ex = () => [$("roi-input-example")?.textContent, $("tlf-input-example")?.textContent];
    expect(ex()).toEqual([...EXAMPLES.ja[0]]);
    await act(async () => void vi.advanceTimersByTime(4400));
    expect(ex()).toEqual([...EXAMPLES.ja[1]]);
    await type($<HTMLTextAreaElement>("roi-input")!, "x");
    await act(async () => void vi.advanceTimersByTime(9000));
    expect($("tlf-input-example")?.textContent).toBe(EXAMPLES.ja[1][1]);
  });

  it("fills both fields with the shown pair", async () => {
    await render(<Harness onSubmit={() => undefined} />);
    await click($("use-example"));
    expect($<HTMLTextAreaElement>("roi-input")!.value).toBe(EXAMPLES.ja[0][0]);
    expect($<HTMLTextAreaElement>("tlf-input")!.value).toBe(EXAMPLES.ja[0][1]);
    expect($("use-example")).toBeNull();
  });
});

describe("keyboard flow", () => {
  it("Enter goes ROI → TLF, Enter in TLF submits, Shift+Enter does not", async () => {
    const onSubmit = vi.fn();
    await render(<Harness onSubmit={onSubmit} />);
    const roi = $<HTMLTextAreaElement>("roi-input")!;
    const tlf = $<HTMLTextAreaElement>("tlf-input")!;
    await focus(roi);
    await key(roi, "Enter");
    expect(document.activeElement).toBe(tlf);
    expect(onSubmit).not.toHaveBeenCalled();
    await key(tlf, "Enter", { shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    await key(tlf, "Enter");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit when the form is not ready", async () => {
    const onSubmit = vi.fn();
    await render(<Harness onSubmit={onSubmit} canSubmit={false} />);
    await key($("tlf-input")!, "Enter");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("picks a BNA hint with the arrow keys and Enter instead of moving on", async () => {
    await render(<Harness onSubmit={() => undefined} />);
    const roi = $<HTMLTextAreaElement>("roi-input")!;
    await focus(roi);
    await type(roi, "A44");
    expect($("bna-hints")?.querySelectorAll("[role=option]").length).toBe(3);
    expect(roi.getAttribute("aria-expanded")).toBe("true");
    await key(roi, "ArrowDown");
    await key(roi, "Enter");
    expect(roi.value).toBe("dorsal area 44 (A44d, BNA:29-30)");
    expect(document.activeElement).toBe(roi);
    expect($("bna-hints")).toBeNull();
  });
});

describe("create screen composer", () => {
  it("adds a URL from the + menu with Enter without starting a run, then runs with Enter in TLF", async () => {
    await render(<ChatPage />);
    await click($("composer-plus"));
    const url = $<HTMLInputElement>("attach-url-input")!;
    await type(url, "doi.org/10.1/x");
    await act(async () => void url.form!.requestSubmit());
    expect(api.createProject).not.toHaveBeenCalled();
    expect($("attachment-list")?.textContent).toContain("doi.org/10.1/x");

    await type($<HTMLTextAreaElement>("roi-input")!, "Hippocampus");
    await type($<HTMLTextAreaElement>("tlf-input")!, "Spatial memory");
    await key($("tlf-input")!, "Enter");
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(api.createProject.mock.calls[0][0]).toMatchObject({ roi: "Hippocampus", tlf: "Spatial memory", urls: ["https://doi.org/10.1/x"], researchMode: true, canon: { mode: "none" } });
  });

  it("opens the model menu as a dialog and closes it with Escape, returning focus", async () => {
    await render(<ChatPage />);
    const btn = $<HTMLButtonElement>("composer-model")!;
    await click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect($("composer-model-panel")?.getAttribute("role")).toBe("dialog");
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect($("composer-model-panel")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("offers only the tier's models, without a custom model ID, to a Tier 1 default-API-key user", async () => {
    api.models.mockResolvedValue({ models: ["gpt-6-luna", "gpt-5.6-luna"], pricedModels: ["gpt-6-luna", "gpt-5.6-luna"], envDefaultModel: "gpt-6-luna", keySource: "org", orgTier: 1, restricted: true });
    await render(<ChatPage />);
    await click($("composer-model"));
    const menu = $("model-menu")!;
    const options = [...menu.querySelectorAll('input[name="cm-model"]')].map((i) => i.parentElement!.textContent);
    expect(options).toHaveLength(3);
    expect(options.slice(1)).toEqual(["gpt-6-luna", "gpt-5.6-luna"]);
    expect(menu.textContent).not.toContain("その他（手入力）");
    expect($("default-key-note")).toBeNull();
    expect(menu.textContent).not.toContain("API キー");
    expect(menu.textContent).not.toMatch(/tier/i);
  });
});
