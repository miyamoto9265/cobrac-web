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

describe("the API key card of the settings page", () => {
  it("tells an approved user without a key that none is needed, with the own-key form folded away", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: "org", apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    const card = $("api-key-card")!;
    expect($("key-status")!.textContent).toBe("登録は不要です。そのままジョブを実行できます。");
    expect(card.textContent).toContain("自分の OpenAI API キー（任意）");
    expect(card.textContent).not.toContain("未登録");
    expect(card.textContent).not.toContain("デフォルト");
    const form = $("own-key-form") as HTMLDetailsElement;
    expect(form.open).toBe(false);
    expect(form.querySelector("summary")!.textContent).toBe("自分のキーを使う");
  });

  it("shows an approved user's own key as in use, with the form to change or delete it", async () => {
    auth.me = { ...base, orgAccess: { tier: 2 }, keySource: "own", apiKeyRegistered: true };
    api.apiKeyStatus.mockResolvedValue({ registered: true, last4: "abcd" });
    await render(<SettingsPage />);
    expect($("key-status")!.textContent).toContain("自分のキー（末尾 …abcd）で実行しています");
    expect($("own-key-form")).toBeNull();
    expect($("api-key-card")!.textContent).toContain("削除");
  });

  it("tells an approved user to ask an admin when jobs cannot run", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: null, apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    expect($("key-status")!.textContent).toBe("いまはジョブを実行できません。管理者に連絡してください。");
  });

  it("keeps the plain key status for a user who is not approved", async () => {
    auth.me = { ...base, orgAccess: null, keySource: null, apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    expect($("key-status")!.textContent).toBe("状態: 未登録");
    expect($("own-key-form")).toBeNull();
    expect($("api-key-card")!.textContent).toContain("OpenAI API キー");
  });

  it("shows the Anthropic key card with its own status for each provider", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: "org", claudeKeySource: "own", apiKeyRegistered: false, anthropicKeyRegistered: true };
    api.apiKeyStatus.mockImplementation(async (provider?: string) =>
      provider === "anthropic" ? { registered: true, last4: "wxyz" } : { registered: false, last4: null },
    );
    await render(<SettingsPage />);
    expect(api.apiKeyStatus).toHaveBeenCalledWith("anthropic");
    expect($("key-status")!.textContent).toBe("登録は不要です。そのままジョブを実行できます。");
    const card = $("anthropic-api-key-card")!;
    expect($("anthropic-key-status")!.textContent).toContain("自分のキー（末尾 …wxyz）で実行しています");
    expect(card.textContent).toContain("Anthropic");
    expect(card.textContent).not.toContain("未登録");
  });

  it("asks an approved user for their own Anthropic key while there is no default Anthropic key", async () => {
    auth.me = { ...base, orgAccess: { tier: 1 }, keySource: "org", claudeKeySource: null, apiKeyRegistered: false };
    api.apiKeyStatus.mockResolvedValue({ registered: false, last4: null });
    await render(<SettingsPage />);
    const card = $("anthropic-api-key-card")!;
    expect($("anthropic-key-status")!.textContent).toBe("自分の Anthropic API キーを登録すると、Claude のモデルを使えます。");
    expect($("anthropic-own-key-form")).toBeNull();
    expect(card.querySelector('input[type="password"]')).not.toBeNull();
    expect(card.textContent).not.toContain("任意");
    expect(card.textContent).not.toContain("未登録");
  });
});

