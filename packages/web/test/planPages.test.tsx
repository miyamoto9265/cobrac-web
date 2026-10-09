// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDetailResponse, PlanRecord, PlanRowState, PlanRowView, PlanSummary } from "@cobrac/shared";
import { countRows, estimatePlan } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getPlan: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  savePlanRows: vi.fn(),
  importPlanRows: vi.fn(),
  confirmPlan: vi.fn(),
  planAction: vi.fn(),
  planRowAction: vi.fn(),
  deletePlan: vi.fn(),
  answer: vi.fn(),
  models: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { PlanDetailPage } = await import("../src/pages/PlanDetailPage");
const { PlansPage } = await import("../src/pages/PlansPage");
const { splitIntoWaves, fmtDuration } = await import("../src/lib/plan");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-06T00:00:00.000Z";

function row(rowId: string, roi: string, tlf: string, state: PlanRowState, wave: number, extra: Partial<PlanRowView> = {}): PlanRowView {
  return { planId: "n4h8w2rk", sk: `ROW#${rowId}`, rowId, order: Number(rowId.slice(1)), wave, roi, tlf, rationale: "", source: "manual", state, attempts: 0, createdAt: now, updatedAt: now, projectId: null, project: null, ...extra };
}
function detail(status: PlanRecord["status"], rows: PlanRowView[], extra: Partial<PlanRecord> = {}): PlanDetailResponse {
  const plan: PlanRecord = {
    planId: "n4h8w2rk",
    sk: "META",
    ownerUserId: "alice",
    name: "Language",
    goal: "言語の BRA を一通りそろえたい",
    status,
    settings: { model: status === "DRAFT" ? null : "gpt-6-luna", modelChosen: false, reasoningEffort: null, researchMode: true, locale: "en" },
    rowCount: rows.length,
    rowCounts: countRows(rows),
    activeWave: status === "DRAFT" ? null : 1,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
  return {
    plan,
    rows,
    events: [],
    limits: { maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 2, effective: 2 },
    estimate: estimatePlan({ seedRows: 0, bodyWaveSizes: [rows.length], concurrency: 2 }),
    actual: { minutes: status === "DRAFT" ? null : 30, costUsd: status === "DRAFT" ? null : 0.18 },
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(path: string, state?: unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[{ pathname: path, state }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/:planId" element={<PlanDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const button = (text: string, within: ParentNode = document) => [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  api.models.mockResolvedValue({ models: ["gpt-6-luna"], efforts: [], envDefaultModel: "gpt-6-luna", keySource: "own", orgTier: null, restricted: false, pricedModels: [] });
  for (const fn of [api.answer, api.planRowAction, api.planAction, api.savePlanRows, api.confirmPlan]) fn.mockResolvedValue({ ok: true });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("plan screen while running", () => {
  const rows = [
    row("r1", "left IFG", "speech production", "done", 1, { projectId: "p0000001", project: { name: "Speech", status: "COMPLETED", pendingQuestion: null, costUsd: 0.18, revision: 1, errorMessage: null, deleted: false } }),
    row("r2", "STG", "phonological processing", "question", 1, { projectId: "p0000002", project: { name: "Phonology", status: "WAITING_USER_INPUT", pendingQuestion: "Left or both hemispheres?", costUsd: 0.05, revision: 0, errorMessage: null, deleted: false } }),
    row("r3", "angular gyrus", "reading", "attention", 2, { projectId: "p0000003", attentionReason: "failed", lastError: "boom", attempts: 2 }),
    row("r4", "Exner's area", "writing", "pending", 2),
  ];

  it("shows progress, the question inbox and the rows that need attention, and acts on them", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", rows));
    await render("/plans/n4h8w2rk");
    expect(q('[data-testid="plan-summary"]')!.textContent).toContain("1 / 4 done");
    const inbox = q('[data-testid="plan-inbox"]')!;
    expect(inbox.textContent).toContain("Questions (1)");
    expect(inbox.textContent).toContain("Left or both hemispheres?");
    await type(inbox.querySelector("textarea")!, "Left");
    await act(async () => button("Answer", inbox)!.click());
    expect(api.answer).toHaveBeenCalledWith("p0000002", "Left", "en");

    const attention = q('[data-testid="plan-attention"]')!;
    expect(attention.textContent).toContain("Failed again after 2 automatic retries.");
    await act(async () => button("Retry", attention)!.click());
    expect(api.planRowAction).toHaveBeenCalledWith("n4h8w2rk", "r3", "retry");

    // rows by wave, with no editing controls once confirmed
    expect(q('[data-testid="plan-rows"]')!.textContent).toContain("Wave 2");
    expect(q('[data-testid="plan-editor"]')).toBeNull();
    // actions of a running plan
    const actions = q('[data-testid="plan-actions"]')!;
    expect([...actions.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Pause", "Cancel plan"]);
    await act(async () => button("Pause", actions)!.click());
    expect(api.planAction).toHaveBeenCalledWith("n4h8w2rk", "pause");
  });

  it("explains why a plan paused itself", async () => {
    api.getPlan.mockResolvedValue(detail("PAUSED", rows, { pausedReason: "no_key" }));
    await render("/plans/n4h8w2rk");
    expect(document.body.textContent).toContain("Paused: there is no API key to run jobs with.");
    expect([...q('[data-testid="plan-actions"]')!.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Resume", "Cancel plan"]);
  });
});

describe("draft plan", () => {
  it("edits rows and waves, saves them before confirming, and lists the CSV rows that could not be read", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "left IFG", "speech production", "pending", 1), row("r2", "STG", "phonological processing", "pending", 1)]));
    await render("/plans/n4h8w2rk", { rejected: [{ row: 22, reason: "noRoiTlf", text: "only a note" }] });
    expect(q('[data-testid="plan-rejected"]')!.textContent).toContain("Row 22: neither ROI nor TLF");
    const editor = q('[data-testid="plan-editor"]')!;
    await act(async () => button("Add row", editor)!.click());
    const inputs = [...editor.querySelectorAll<HTMLInputElement>('input[aria-label="ROI"]')];
    expect(inputs).toHaveLength(3);
    await type(inputs[2], "arcuate fasciculus");
    await type([...editor.querySelectorAll<HTMLInputElement>('input[aria-label="TLF"]')][2], "repetition");
    await type([...editor.querySelectorAll<HTMLInputElement>('input[aria-label="Wave"]')][2], "2");
    expect(editor.textContent).toContain("Unsaved changes");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => button("Confirm and start")!.click());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Projects: 3 · waves: 2 · up to 2 at a time"));
    expect(api.savePlanRows).toHaveBeenCalledWith("n4h8w2rk", [
      { rowId: "r1", roi: "left IFG", tlf: "speech production", rationale: "", wave: 1 },
      { rowId: "r2", roi: "STG", tlf: "phonological processing", rationale: "", wave: 1 },
      { rowId: undefined, roi: "arcuate fasciculus", tlf: "repetition", rationale: "", wave: 2 },
    ]);
    expect(api.confirmPlan).toHaveBeenCalledWith("n4h8w2rk", "en");
    expect(vi.mocked(api.savePlanRows).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.confirmPlan).mock.invocationCallOrder[0]);
  });

  it("does not confirm when the owner says no", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "STG", "hearing", "pending", 1)]));
    await render("/plans/n4h8w2rk");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => button("Confirm and start")!.click());
    expect(api.confirmPlan).not.toHaveBeenCalled();
  });
});

describe("plan list", () => {
  it("creates a plan from pasted CSV rows", async () => {
    api.listPlans.mockResolvedValue({ items: [] });
    api.createPlan.mockResolvedValue({ plan: { planId: "n4h8w2rk" }, rows: [], rejected: [] });
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "STG", "hearing", "pending", 1)]));
    await render("/plans");
    expect(q('[data-testid="plan-list"]')!.textContent).toContain("No plans yet.");
    await type(q<HTMLInputElement>('input[maxlength="200"]')!, "Language");
    await type(q<HTMLTextAreaElement>('textarea[aria-label="Source list (CSV, TSV or text)"]')!, "ROI,TLF\nSTG,hearing\n");
    await act(async () => button("Create plan")!.click());
    expect(api.createPlan).toHaveBeenCalledWith({ name: "Language", goal: "", csv: "ROI,TLF\nSTG,hearing\n" });
    expect(api.getPlan).toHaveBeenCalledWith("n4h8w2rk");
  });

  it("starts an autonomous run with its cost limit", async () => {
    api.listPlans.mockResolvedValue({ items: [] });
    api.createPlan.mockResolvedValue({ plan: { planId: "n4h8w2rk" }, rows: [], rejected: [] });
    api.getPlan.mockResolvedValue(detail("DRAFT", []));
    await render("/plans");
    await type(q<HTMLInputElement>('input[maxlength="200"]')!, "Language");
    await type(q<HTMLTextAreaElement>('textarea[aria-label="Source list (CSV, TSV or text)"]')!, "ROI,TLF\nSTG,hearing\n");
    await act(async () => q<HTMLInputElement>('[data-testid="plan-autonomous"] input[type="checkbox"]')!.click());
    expect(button("Create plan")).toBeUndefined();
    await type(q<HTMLInputElement>('[data-testid="plan-autonomous"] input[type="number"]')!, "35");
    await act(async () => button("Start autonomous run")!.click());
    expect(api.createPlan).toHaveBeenCalledWith(expect.objectContaining({ name: "Language", draft: true, autonomous: { maxCostUsd: 35 } }));
  });
});

describe("plan list as a live view", () => {
  const summary = (planId: string, status: PlanRecord["status"], extra: Partial<PlanSummary> = {}): PlanSummary => ({ ...detail(status, []).plan, planId, name: `Plan ${planId}`, rowCounts: countRows([]), ...extra });
  const project = (status: NonNullable<PlanRowView["project"]>["status"], extra: Partial<NonNullable<PlanRowView["project"]>> = {}) => ({
    name: "P",
    status,
    pendingQuestion: null,
    costUsd: null,
    revision: 0,
    errorMessage: null,
    deleted: false,
    stepStates: { HCD: "done", FRG: "running", CSV: "pending", XLSX: "pending" } as const,
    activeStage: "FRG" as const,
    ...extra,
  });
  const running = row("r1", "amygdala", "fear conditioning", "running", 1, { projectId: "p0000001", startedAt: now, project: project("RUNNING") });
  const asking = row("r2", "STG", "phonology", "question", 1, { projectId: "p0000002", project: project("WAITING_USER_INPUT", { pendingQuestion: "Left or both?" }) });
  const live = summary("n0000001", "RUNNING", {
    confirmedAt: now,
    rowCount: 3,
    rowCounts: countRows([running, asking, row("r3", "IFG", "speech", "pending", 2)]),
    pulse: {
      waves: [
        { wave: 1, counts: { running: 1, question: 1 } },
        { wave: 2, counts: { pending: 1 } },
      ],
      running: [running],
      waiting: [asking],
      events: [{ sk: "EVT#2", type: "row_question", at: now, row: { roi: "STG", tlf: "phonology" } }],
      openProposals: 1,
      estimate: estimatePlan({ seedRows: 0, bodyWaveSizes: [2, 1], concurrency: 2 }),
      actual: { minutes: 12, costUsd: 0.4 },
    },
  });
  const items = [
    live,
    summary("n0000002", "DRAFT", { draft: { status: "done", requestedAt: now } as PlanRecord["draft"] }),
    summary("n0000003", "COMPLETED", { completedAt: now }),
  ];

  it("shows what waits on the owner first, then the running plans as lanes, the drafts and the finished plans", async () => {
    api.listPlans.mockResolvedValue({ items });
    await render("/plans");
    const turn = q('[data-testid="plan-turn"]')!;
    expect(turn.textContent).toContain("Your turn");
    expect(turn.textContent).toContain("Answer a question");
    expect(turn.textContent).toContain("Left or both?");
    expect(turn.textContent).toContain("Decide on 1 re-plan proposals");
    expect(turn.textContent).toContain("Check the draft and confirm");

    const lane = q('[data-testid="plan-lane"]')!;
    expect(lane.dataset.status).toBe("RUNNING");
    expect(lane.querySelector('[data-testid="plan-lane-running"]')!.textContent).toContain("fear conditioning");
    expect(lane.querySelector('[data-testid="plan-lane-stage"]')!.textContent).toBe("FRG");
    expect(lane.querySelector('[data-testid="plan-lane-events"]')!.textContent).toContain("phonology");
    const bar = lane.querySelector('[data-testid="plan-bar"]')!;
    expect([...bar.querySelectorAll("[data-wave]")].map((w) => (w as HTMLElement).dataset.wave)).toEqual(["1", "2"]);
    expect(bar.querySelector('[data-wave="1"]')!.getAttribute("data-current")).toBe("true");
    expect(bar.querySelector('[data-state="starting"]')!.className).toContain("plan-flow");
    expect(q('[data-testid="plan-live"]')).not.toBeNull();
    expect(q('[data-testid="plan-drafts"]')!.textContent).toContain("Plan n0000002");
    expect(q<HTMLDetailsElement>('[data-testid="plan-finished"]')!.open).toBe(false);
  });

  it("opens the new-plan form in a drawer that Esc closes", async () => {
    api.listPlans.mockResolvedValue({ items });
    await render("/plans");
    expect(q('[data-testid="plan-new-drawer"]')).toBeNull();
    await act(async () => button("New plan")!.click());
    const drawer = q('[data-testid="plan-new-drawer"]')!;
    expect(drawer.querySelector('[role="dialog"]')).not.toBeNull();
    expect(drawer.querySelector('input[maxlength="200"]')).toBe(document.activeElement);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(q('[data-testid="plan-new-drawer"]')).toBeNull();
  });

  it("says when nothing waits on the owner while plans run", async () => {
    api.listPlans.mockResolvedValue({ items: [{ ...live, pulse: { ...live.pulse!, waiting: [], openProposals: 0 } }] });
    await render("/plans");
    expect(q('[data-testid="plan-turn"]')).toBeNull();
    expect(q('[data-testid="plan-turn-none"]')!.textContent).toContain("Nothing waits on you right now.");
  });

  it("shows the stage strip on the rows being built in the plan screen", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", [running, row("r3", "IFG", "speech", "done", 1)]));
    await render("/plans/n4h8w2rk");
    const rowsEl = q('[data-testid="plan-rows"]')!;
    const strips = rowsEl.querySelectorAll('[data-testid="pipeline"]');
    expect(strips.length).toBe(1);
    expect(strips[0].querySelector('[data-testid="stage-frg"]')!.getAttribute("data-status")).toBe("active");
    expect(q('[data-testid="plan-summary"] [data-testid="plan-bar"]')).not.toBeNull();
  });
});

describe("helpers", () => {
  it("splits rows into waves of the concurrency and formats durations", () => {
    expect(splitIntoWaves([{ wave: 9 }, { wave: 9 }, { wave: 9 }], 2).map((r) => r.wave)).toEqual([1, 1, 2]);
    const t = (k: string, v?: Record<string, string | number>) => `${k}:${JSON.stringify(v)}`;
    expect(fmtDuration(48, t as never)).toBe('plan.minutes:{"m":48}');
    expect(fmtDuration(1930, t as never)).toBe('plan.hours:{"h":32}');
    expect(fmtDuration(601, t as never)).toBe('plan.hours:{"h":10}');
    expect(fmtDuration(null, t as never)).toBe("—");
  });
});
