// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  models: vi.fn(),
  listCanons: vi.fn(),
  apiKeyStatus: vi.fn(),
  setApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  updateMe: vi.fn(),
}));
const auth = vi.hoisted(() => ({ me: {} as Record<string, unknown> }));
vi.mock("../src/lib/api", () => ({ api, uploadFile: vi.fn(), ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: auth.me, refreshMe: vi.fn(), doUpdatePassword: vi.fn() }) }));

const { I18nProvider } = await import("../src/i18n");
const { SettingsPage } = await import("../src/pages/SettingsPage");

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
const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const base = { email: "a@example.com", role: "user", displayName: "A", contributorName: "A", defaultModel: null, defaultReasoningEffort: null, defaultCanonId: null };

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  api.models.mockResolvedValue({ models: ["gpt-6-luna"], pricedModels: [], envDefaultModel: "gpt-6-luna" });
  api.listCanons.mockResolvedValue({ items: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

const click = async (el: HTMLElement) => act(async () => el.click());

describe("the API key rows of the settings page", () => {
  it("tells an approved user without a key that none is needed, with the input folded away", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: "org", apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    const row = $("api-key-card")!;
    expect($("key-status")!.textContent).toBe("登録は不要です");
    expect(row.textContent).not.toContain("未登録");
    expect(row.textContent).not.toContain("デフォルト");
    expect($("own-key-form")).toBeNull();
    expect(row.querySelector('input[type="password"]')).toBeNull();
    await click($("key-edit")!);
    expect($("own-key-form")!.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("shows an approved user's own key as in use, with buttons to change or delete it", async () => {
    auth.me = { ...base, orgAccess: { tier: 2 }, keySource: "own", apiKeyRegistered: true };
    api.apiKeyStatus.mockResolvedValue({ registered: true, last4: "abcd" });
    await render(<SettingsPage />);
    expect($("key-status")!.textContent).toBe("自分のキー（…abcd）");
    expect($("key-edit")!.textContent).toBe("変更");
    expect($("api-key-card")!.querySelector('button[aria-label="削除"]')).not.toBeNull();
  });

  it("asks an approved user to contact an admin when OpenAI jobs cannot run", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: null, apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    expect($("key-status")!.textContent).toBe("管理者にお問い合わせください");
  });

  it("keeps the plain key status for a user who is not approved", async () => {
    auth.me = { ...base, orgAccess: null, keySource: null, apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    expect($("key-status")!.textContent).toBe("未登録");
    expect($("api-key-card")!.textContent).toContain("OpenAI");
    expect($("key-edit")!.textContent).toBe("登録");
  });

  it("lists OpenAI, Anthropic and DeepSeek, each with its own status", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: "org", claudeKeySource: "own", deepseekKeySource: "org", apiKeyRegistered: false, anthropicKeyRegistered: true };
    api.apiKeyStatus.mockImplementation(async (provider?: string) => (provider === "anthropic" ? { registered: true, last4: "wxyz" } : { registered: false, last4: null }));
    await render(<SettingsPage />);
    expect(api.apiKeyStatus).toHaveBeenCalledWith("anthropic");
    expect(api.apiKeyStatus).toHaveBeenCalledWith("deepseek");
    expect($("key-status")!.textContent).toBe("登録は不要です");
    expect($("anthropic-key-status")!.textContent).toBe("自分のキー（…wxyz）");
    expect($("deepseek-key-status")!.textContent).toBe("登録は不要です");
    expect($("api-keys-card")!.textContent).not.toContain("未登録");
  });

  it("asks an approved user for their own key of a provider without a default key, and saves it", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: "org", claudeKeySource: null, deepseekKeySource: null, apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    api.setApiKey.mockResolvedValue({ registered: true, last4: "9876", models: ["deepseek-flash"] });
    await render(<SettingsPage />);
    expect($("deepseek-key-status")!.textContent).toBe("キーを登録してください");
    expect($("anthropic-key-status")!.textContent).toBe("キーを登録してください");
    expect($("api-keys-card")!.textContent).not.toContain("未登録");
    await click($("deepseek-key-edit")!);
    expect($("anthropic-workspace-id")).toBeNull();
    const input = $("deepseek-own-key-form")!.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "sk-deepseek-0123456789abcdef9876");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click([...$("deepseek-own-key-form")!.querySelectorAll("button")].find((b) => b.textContent?.includes("保存"))!);
    expect(api.setApiKey).toHaveBeenCalledWith("sk-deepseek-0123456789abcdef9876", "deepseek", "");
    expect($("deepseek-key-status")!.textContent).toBe("自分のキー（…9876）");
    expect($("deepseek-own-key-form")).toBeNull();
  });
});
