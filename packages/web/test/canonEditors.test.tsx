// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonDetailResponse } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getCanon: vi.fn(),
  canonPulls: vi.fn(),
  canonRevisions: vi.fn(),
  canonRevision: vi.fn(),
  listProjects: vi.fn(),
  addCanonEditor: vi.fn(),
  removeCanonEditor: vi.fn(),
  canonOutgoing: vi.fn(),
  listCanons: vi.fn(),
  me: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: { userId: "bob" } }) }));

const { I18nProvider } = await import("../src/i18n");
const { CanonDetailPage } = await import("../src/pages/CanonDetailPage");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-03T00:00:00.000Z";

function detail(role: CanonDetailResponse["role"]): CanonDetailResponse {
  return {
    canon: { canonId: "u7m2q9xa-c1", sk: "META", ownerUserId: "alice", name: "Language", description: "", policy: "areas", visibility: "private", headRevision: 2, memberCount: 0, createdAt: now, updatedAt: now },
    members: [],
    role,
    ownerName: "Alice",
    editors: [{ userId: "bob", name: "Bob", ...(role === "owner" ? { email: "bob@example.com" } : {}), addedAt: now }],
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(path = "/canons/u7m2q9xa-c1/settings") {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/canons/:canonId/:view?" element={<CanonDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  vi.clearAllMocks();
  api.canonPulls.mockResolvedValue({ items: [] });
  api.canonRevisions.mockResolvedValue({ items: [{ revision: 2, createdAt: now, prNo: 2, source: "project:u7m2q9xa-2", approvedByName: "Bob", approvedAt: now }] });
  api.canonRevision.mockResolvedValue({ canonId: "u7m2q9xa-c1", revision: 2, createdAt: now, circuits: [], groups: [], connections: [], bif: [], references: [], roles: [] });
  api.listProjects.mockResolvedValue({ items: [] });
  api.canonOutgoing.mockResolvedValue({ items: [] });
  api.listCanons.mockResolvedValue({ items: [], shared: [] });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  document.body.innerHTML = "";
});

describe("Canon co-editors", () => {
  it("the owner adds a co-editor by e-mail and sees who approved each revision", async () => {
    api.getCanon.mockResolvedValue(detail("owner"));
    api.addCanonEditor.mockResolvedValue({ userId: "carol", name: "Carol", email: "carol@example.com", addedAt: now });
    await render();
    const card = $('[data-testid="canon-editors"]')!;
    expect(card.textContent).toContain("Alice");
    expect(card.textContent).toContain("bob@example.com");
    const input = $('[data-testid="editor-email"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "carol@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => $('[data-testid="editor-add"]')!.click());
    expect(api.addCanonEditor).toHaveBeenCalledWith("u7m2q9xa-c1", "carol@example.com");
    await act(async () => $('[data-testid="canon-tab-history"]')!.click());
    expect($('[data-testid="canon-history"]')!.textContent).toContain("approved by Bob");
  });

  it("a co-editor sees their role and no owner-only controls", async () => {
    api.getCanon.mockResolvedValue(detail("editor"));
    await render();
    expect($('[data-testid="canon-role"]')!.textContent).toContain("Co-editor (owner: Alice)");
    expect($('[data-testid="editor-email"]')).toBeNull();
    expect(document.body.textContent).not.toContain("bob@example.com");
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Delete"))).toBe(false);
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Leave this Canon"))).toBe(true);
  });
});
