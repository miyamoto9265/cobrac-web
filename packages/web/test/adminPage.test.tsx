// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  adminUsers: vi.fn(),
  adminProjects: vi.fn(),
  adminDefaultKey: vi.fn(),
  adminOrgUsage: vi.fn(),
  adminUpdateUser: vi.fn(),
  adminCancel: vi.fn(),
  adminConcurrency: vi.fn(),
  adminSetConcurrency: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: { userId: "u-1", role: "admin" } }) }));

const { I18nProvider } = await import("../src/i18n");
const { AdminPage } = await import("../src/pages/AdminPage");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-04T00:00:00.000Z";
const user = (userId: string, email: string): UserPublic =>
  ({ userId, email, displayName: userId, contributorName: "", role: "user", disabled: false, apiKeyRegistered: false, apiKeyLast4: null, defaultModel: null, defaultReasoningEffort: null, createdAt: now, updatedAt: now }) as UserPublic;
const project = { userId: "u-2", projectId: "u7m2q9xa-1", name: "VOR", roi: "Flocculus", tlf: "VOR", contributor: "", status: "RUNNING", currentStep: "HCD", stepStates: {}, activeJobId: null, codexThreadId: null, pendingQuestion: null, hasArtifacts: false, errorMessage: null, createdAt: now, updatedAt: now, completedAt: null };

let root: Root | undefined;
let host: HTMLDivElement | undefined;
/** `narrow`: what `(max-width: 1279px)` answers, i.e. a phone or tablet. */
async function render(narrow: boolean) {
  window.matchMedia = ((query: string) => ({ matches: query.includes("max-width: 1279px") ? narrow : false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AdminPage />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  api.adminUsers.mockResolvedValue({ items: [user("u-1", "admin@example.org"), user("u-2", "researcher.with.a.very.long.address@brain-architecture.example.org")] });
  api.adminProjects.mockResolvedValue({ items: [project] });
  api.adminDefaultKey.mockResolvedValue({ registered: false, last4: null, updatedAt: null });
  api.adminOrgUsage.mockResolvedValue({ month: "2026-10", items: [] });
  api.adminConcurrency.mockResolvedValue(concurrency(null, null));
});

const concurrency = (global: number | null, perUser: number | null) => ({
  maxConcurrentJobs: global ?? 2,
  maxConcurrentJobsPerUser: perUser ?? 1,
  effective: Math.min(global ?? 2, perUser ?? 1),
  setting: { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser, updatedAt: global === null ? null : now },
  deployment: { maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 1 },
  min: 1,
  max: 16,
});
/** Types into a controlled number input the way React sees it. */
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("AdminPage layout", () => {
  it("shows one card per user and project on narrow screens, with every control and no table", async () => {
    await render(true);
    expect(all('[data-testid="admin-user-cards"] > li')).toHaveLength(2);
    expect(all('[data-testid="admin-project-cards"] > li')).toHaveLength(1);
    expect(all("table")).toHaveLength(0);
    expect(all('[data-testid="org-tier-u-2"]')).toHaveLength(1);
    expect(all("button").filter((b) => b.textContent === "Disable")).toHaveLength(1);
    expect(all("button").filter((b) => b.textContent === "Force stop")).toHaveLength(1);
  });

  it("shows the tables on wide screens and renders each control once", async () => {
    await render(false);
    expect(all("table")).toHaveLength(2);
    expect(all('[data-testid="admin-user-cards"], [data-testid="admin-project-cards"]')).toHaveLength(0);
    expect(all('[data-testid="org-tier-u-1"]')).toHaveLength(1);
    expect(all('[data-testid="org-tier-u-2"]')).toHaveLength(1);
  });
});

describe("AdminPage concurrency", () => {
  it("saves limits from 1 to 16 and refuses anything above 16", async () => {
    await render(false);
    const section = document.querySelector('[data-testid="admin-concurrency"]')!;
    expect(section.querySelector('[data-testid="admin-concurrency-effective"]')!.textContent).toBe("In force: 2 overall, 1 per user");
    const save = [...section.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Save")!;
    const global = section.querySelector<HTMLInputElement>('[data-testid="concurrency-global"]')!;
    const perUser = section.querySelector<HTMLInputElement>('[data-testid="concurrency-per-user"]')!;
    await type(global, "17");
    expect(save.disabled).toBe(true);
    expect(section.textContent).toContain("Enter a whole number from 1 to 16");
    await type(global, "8");
    await type(perUser, "8");
    expect(save.disabled).toBe(false);
    api.adminSetConcurrency.mockResolvedValue(concurrency(8, 8));
    await act(async () => save.click());
    expect(api.adminSetConcurrency).toHaveBeenCalledWith({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 8 });
    expect(section.querySelector('[data-testid="admin-concurrency-effective"]')!.textContent).toBe("In force: 8 overall, 8 per user");
    // an empty field goes back to the deployment value
    await type(perUser, "");
    api.adminSetConcurrency.mockResolvedValue(concurrency(8, null));
    await act(async () => save.click());
    expect(api.adminSetConcurrency).toHaveBeenLastCalledWith({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: null });
  });
});
