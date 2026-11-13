// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonRecord, PlanSummary } from "@cobrac/shared";
import { countRows } from "@cobrac/shared";

const api = vi.hoisted(() => ({ listProjects: vi.fn(), listPlans: vi.fn(), listCanons: vi.fn(), listTeams: vi.fn(async () => ({ items: [] })) }));
const auth = vi.hoisted(() => ({ ready: true, signedIn: true, me: { role: "user", email: "alice@example.com" }, doSignOut: () => undefined }));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {}, getWorkspaceTeam: () => null, setWorkspaceTeam: () => undefined }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => auth }));

const { I18nProvider } = await import("../src/i18n");
const { default: App } = await import("../src/App");
const { canonMissionCounts } = await import("../src/pages/CanonsPage");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-11-13T00:00:00.000Z";
const canon = (canonId: string, name: string, extra: Partial<CanonRecord> = {}): CanonRecord => ({ canonId, sk: "META", ownerUserId: "alice", name, description: "", policy: "", visibility: "private", headRevision: 3, memberCount: 2, createdAt: now, updatedAt: now, ...extra });
const plan = (planId: string, status: PlanSummary["status"], extra: Partial<PlanSummary> = {}): PlanSummary =>
  ({ planId, sk: "META", ownerUserId: "alice", name: `Mission ${planId}`, goal: "", status, settings: { model: null, modelChosen: false, reasoningEffort: null, researchMode: true, locale: "en" }, rowCount: 0, rowCounts: countRows([]), activeWave: null, createdAt: now, updatedAt: now, ...extra }) as PlanSummary;

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
          <Where />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  // the pages are lazy: wait until the page has loaded and read its lists
  for (let i = 0; i < 100 && !document.querySelector("main h1"); i++) await act(async () => new Promise((done) => setTimeout(done, 20)));
  await act(async () => new Promise((done) => setTimeout(done, 0)));
}
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const sideLink = (href: string) => $$<HTMLAnchorElement>("aside a").find((a) => a.getAttribute("href") === href);

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  localStorage.removeItem("cobrac-missions-by-canon");
  api.listProjects.mockResolvedValue({ items: [] });
  api.listPlans.mockResolvedValue({ items: [] });
  api.listCanons.mockResolvedValue({ items: [], shared: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("missions and Canons each have an entry", () => {
  it("opens the mission list from 「Missions」 and counts what waits on the owner beside it", async () => {
    api.listPlans.mockResolvedValue({
      items: [plan("n0000001", "DRAFT", { draft: { kind: "draft", jobId: "j1", status: "failed", requestedAt: now, requestedBy: "alice" } }), plan("n0000002", "PAUSED", { pausedReason: "cost_limit" }), plan("n0000003", "COMPLETED")],
    });
    await render("/missions");
    expect($("h1")!.textContent).toContain("Missions");
    const link = sideLink("/missions")!;
    expect(link.querySelector("[data-current]")).not.toBeNull();
    expect(link.querySelector('[data-testid="nav-turn"]')!.textContent).toBe("2");
    expect(link.querySelector('[data-testid="nav-turn"]')!.getAttribute("title")).toBe("Your turn: 2");
    expect(sideLink("/canons")!.querySelector("[data-current]")).toBeNull();
    // the mission list holds no Canon to create or open: those are on the Canon page
    expect($('[data-testid="canon-new-toggle"]')).toBeNull();
  });

  it("shows no count when nothing waits, and sends the old list address to the missions", async () => {
    await render("/plans");
    expect($('[data-testid="where"]')!.textContent).toBe("/missions");
    expect($('[data-testid="nav-turn"]')).toBeNull();
    expect($('[data-testid="missions-empty"]')).not.toBeNull();
  });

  it("lists the Canons alone on 「Canon」: a card each, with the missions that deliver to it", async () => {
    api.listCanons.mockResolvedValue({ items: [canon("c0000001", "Cerebellar VOR", { policy: "cell types" }), canon("c0000002", "Vision", { visibility: "public" })], shared: [{ ...canon("c0000009", "Basal ganglia"), ownerName: "Suzuki" }] });
    api.listPlans.mockResolvedValue({
      items: [plan("n0000001", "RUNNING", { canonId: "c0000001" }), plan("n0000002", "COMPLETED", { canonId: "c0000001" }), plan("n0000003", "COMPLETED", { canonId: "c0000002" }), plan("n0000004", "DRAFT", { canonNew: { name: "Memory" } })],
    });
    await render("/canons");
    expect($("h1")!.textContent).toContain("Canon");
    expect(sideLink("/canons")!.querySelector("[data-current]")).not.toBeNull();
    const cards = $$<HTMLAnchorElement>('[data-testid="canon-card"]');
    expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/canons/c0000001", "/canons/c0000002"]);
    expect(cards[0].textContent).toContain("Cerebellar VOR");
    expect(cards[0].textContent).toContain("rev 3");
    expect(cards[0].querySelector('[data-testid="canon-card-missions"]')!.textContent).toBe("1 running");
    expect(cards[1].querySelector('[data-testid="canon-card-missions"]')!.textContent).toBe("1 missions");
    // a Canon a draft mission will create opens that mission
    const pending = $<HTMLAnchorElement>('[data-testid="canon-card-pending"]')!;
    expect(pending.getAttribute("href")).toBe("/plans/n0000004");
    expect(pending.textContent).toContain("Memory");
    expect($('[data-testid="canon-shared"]')!.textContent).toContain("Basal ganglia");
    // no mission lane or "Your turn" here
    expect($('[data-testid="plan-lane"], [data-testid="plan-turn"], [data-testid="plan-drafts"]')).toBeNull();
  });

  it("says so when there is no Canon", async () => {
    await render("/canons");
    expect($('[data-testid="canon-empty"]')!.textContent).toContain("No Canons yet");
  });

  it("counts the missions of each Canon and those under way", () => {
    expect(canonMissionCounts([{ canonId: "a", status: "RUNNING" }, { canonId: "a", status: "DRAFTING" }, { canonId: "a", status: "COMPLETED" }, { canonId: "b", status: "CANCELLED" }, { canonId: null, status: "RUNNING" }])).toEqual({ a: { all: 3, live: 2 }, b: { all: 1, live: 0 } });
  });
});
