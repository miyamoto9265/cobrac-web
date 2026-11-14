// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamDetail, TeamSummary } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getTeam: vi.fn(),
  updateTeamSettings: vi.fn(),
  stopTeamBudget: vi.fn(),
  startTeamBudget: vi.fn(),
}));
const workspace = vi.hoisted(() => ({ team: null as TeamSummary | null }));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: { userId: "u-1", role: "user" } }) }));
vi.mock("../src/lib/workspace", () => ({
  useWorkspace: () => ({ teamId: workspace.team?.teamId ?? null, team: workspace.team, teams: [], switchTo: vi.fn(), reloadTeams: vi.fn(async () => []) }),
}));

const { I18nProvider } = await import("../src/i18n");
const { TeamPage } = await import("../src/pages/TeamPage");
const { TeamBudgetBanner } = await import("../src/components/TeamBudgetBanner");

const now = "2026-11-01T00:00:00.000Z";
const none = { registered: false, last4: null, updatedAt: null };
const detail = (role: "admin" | "member", extra: Partial<TeamDetail> = {}): TeamDetail => ({
  teamId: "t7m2q9xa",
  name: "Lab",
  role,
  members: [{ userId: "u-1", role, joinedAt: now, displayName: "me", costUsd: 3, monthCostUsd: 3, lastJobAt: now }],
  keys: { openai: { registered: true, last4: "abcd", updatedAt: now }, anthropic: none, deepseek: none },
  usage: { costUsd: 3, monthCostUsd: 3, month: "2026-11", jobs: 2, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 } },
  ownMonthCostUsd: 3,
  teamMonthCostUsd: 3,
  budget: { startsAt: null, endsAt: null, state: "active" },
  limits: { monthUsd: null, memberMonthUsd: 5 },
  allowedModels: null,
  ...(role === "admin" ? { keyModels: ["gpt-6-sol", "gpt-6-astra"], projects: [{ projectId: "p7m2q9xa", name: "VOR", ownerName: "bob", costUsd: 3, monthCostUsd: 3 }], invite: null, sentInvites: [] } : {}),
  createdAt: now,
  ...extra,
});

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/teams/t7m2q9xa"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/teams/:teamId" element={node} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const button = (text: string) => [...host!.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  workspace.team = null;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("team budget", () => {
  it("lets a team admin set limits, allowed models and stop the budget", async () => {
    api.getTeam.mockResolvedValue(detail("admin"));
    api.updateTeamSettings.mockResolvedValue(detail("admin"));
    api.stopTeamBudget.mockResolvedValue({ ok: true });
    await render(<TeamPage />);
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="team-tab-budget"]')!.click());
    expect(host!.querySelector('[data-testid="team-budget-state"]')!.textContent).toContain("In use");
    expect(host!.querySelector('[data-testid="team-project-costs"]')!.textContent).toContain("VOR");
    const member = host!.querySelector<HTMLInputElement>('[data-testid="team-limit-member"]')!;
    expect(member.value).toBe("5");
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(member, "2.5");
      member.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="team-limits-save"]')!.click());
    expect(api.updateTeamSettings).toHaveBeenCalledWith("t7m2q9xa", { limits: { monthUsd: null, memberMonthUsd: 2.5 } });
    const sol = [...host!.querySelectorAll("label")].find((l) => l.textContent === "gpt-6-sol")!.querySelector("input")!;
    await act(async () => sol.click());
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="team-models-save"]')!.click());
    expect(api.updateTeamSettings).toHaveBeenLastCalledWith("t7m2q9xa", { allowedModels: ["gpt-6-sol"] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => button("Stop the budget").click());
    expect(api.stopTeamBudget).toHaveBeenCalledWith("t7m2q9xa");
  });

  it("shows a member the remaining limit and no settings", async () => {
    api.getTeam.mockResolvedValue(detail("member"));
    await render(<TeamPage />);
    expect(host!.querySelector('[data-testid="team-limit-left"]')!.textContent).toBe("Limit $5.00 · $2.00 left");
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="team-tab-budget"]')!.click());
    expect(host!.querySelector('[data-testid="team-budget-stop"]')).toBeNull();
    expect(host!.querySelector<HTMLInputElement>('[data-testid="team-limit-member"]')!.disabled).toBe(true);
  });

  it("tells members on screen before the budget ends and once it has ended", async () => {
    workspace.team = { teamId: "t7m2q9xa", name: "Lab", role: "member", memberCount: 2, keys: { openai: true }, budgetState: "active", budgetEndsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
    await render(<TeamBudgetBanner />);
    expect(host!.querySelector('[data-testid="team-budget-banner"]')!.textContent).toContain('The budget of "Lab" ends on');
    act(() => root?.unmount());
    host?.remove();
    workspace.team = { ...workspace.team, budgetEndsAt: new Date(Date.now() + 10 * 86_400_000).toISOString() };
    await render(<TeamBudgetBanner />);
    expect(host!.querySelector('[data-testid="team-budget-banner"]')).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    workspace.team = { ...workspace.team, budgetState: "ended" };
    await render(<TeamBudgetBanner />);
    expect(host!.querySelector('[data-testid="team-budget-banner"]')!.textContent).toContain("has ended");
  });
});
