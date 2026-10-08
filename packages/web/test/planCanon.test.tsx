// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { CanonDetailResponse, CanonPullDetailResponse, CanonPullRequestRecord, CanonRecord, PlanDetailResponse, PlanRecord, PlanRowState, PlanRowView } from "@cobrac/shared";
import { PLAN_MAX_WAITING_PRS, countRows, estimatePlan } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getPlan: vi.fn(),
  updatePlan: vi.fn(),
  setPlanCanon: vi.fn(),
  resolvePlanRow: vi.fn(),
  planRowAction: vi.fn(),
  listCanons: vi.fn(),
  models: vi.fn(),
  getCanon: vi.fn(),
  canonPulls: vi.fn(),
  canonRevisions: vi.fn(),
  canonRevision: vi.fn(),
  listProjects: vi.fn(),
  canonOutgoing: vi.fn(),
  approveManyPulls: vi.fn(),
  canonPull: vi.fn(),
  confirmPlan: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: { userId: "alice", role: "user" } }) }));

const { I18nProvider } = await import("../src/i18n");
const { PlanDetailPage } = await import("../src/pages/PlanDetailPage");
const { CanonDetailPage } = await import("../src/pages/CanonDetailPage");
const { CanonPullPage } = await import("../src/pages/CanonPullPage");
const { bulkApprovable, seedGateRows, seedsHolding, ROW_STATE_COLOR } = await import("../src/lib/plan");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-06T00:00:00.000Z";
const CANON = "u7m2q9xa-c1";
const project = (name: string, status: "COMPLETED" | "RUNNING" = "COMPLETED") => ({ name, status, pendingQuestion: null, costUsd: 0.18, revision: 1, errorMessage: null, deleted: false });

function row(rowId: string, tlf: string, state: PlanRowState, wave: number, extra: Partial<PlanRowView> = {}): PlanRowView {
  return { planId: "n4h8w2rk", sk: `ROW#${rowId}`, rowId, order: Number(rowId.slice(1)), wave, roi: "left IFG", tlf, rationale: "", source: "llm", state, attempts: 0, createdAt: now, updatedAt: now, projectId: null, project: null, ...extra };
}
function detail(status: PlanRecord["status"], rows: PlanRowView[], extra: Partial<PlanRecord> = {}, canon: PlanDetailResponse["canon"] = null): PlanDetailResponse {
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
    actual: { minutes: null, costUsd: null },
    proposals: [],
    planJobsCostUsd: null,
    canon,
  };
}
const canonRec = (canonId: string, name: string, extra: Partial<CanonRecord> = {}): CanonRecord => ({
  canonId,
  sk: "META",
  ownerUserId: "alice",
  name,
  description: "",
  policy: "",
  visibility: "private",
  headRevision: 3,
  memberCount: 0,
  createdAt: now,
  updatedAt: now,
  ...extra,
});

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
          <Routes>
            <Route path="/plans/:planId" element={<PlanDetailPage />} />
            <Route path="/canons/:canonId" element={<CanonDetailPage />} />
            <Route path="/canons/:canonId/pulls/:no" element={<CanonPullPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const q = <T extends Element = HTMLElement>(sel: string, within: ParentNode = document) => within.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string, within: ParentNode = document) => [...within.querySelectorAll<T>(sel)];
const button = (text: string, within: ParentNode = document) => qa<HTMLButtonElement>("button", within).find((b) => b.textContent?.trim() === text);
const click = (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  api.models.mockResolvedValue({ models: ["gpt-6-luna"], efforts: [], envDefaultModel: "gpt-6-luna", keySource: "own", orgTier: null, restricted: false, pricedModels: [] });
  for (const fn of [api.setPlanCanon, api.resolvePlanRow, api.planRowAction, api.updatePlan, api.confirmPlan]) fn.mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("the plan's Canon in a draft", () => {
  it("offers only the owner's own Canons that are not deleted, and saves each choice", async () => {
    api.listCanons.mockResolvedValue({
      items: [canonRec("u7m2q9xa-c1", "Language"), canonRec("u7m2q9xa-c2", "Old", { deletedAt: now })],
      shared: [{ ...canonRec("ub0b0b0b-c1", "Bob's"), ownerName: "Bob" }],
    });
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "speech production", "pending", 1)]));
    await render("/plans/n4h8w2rk");
    const section = q('[data-testid="plan-canon"]')!;
    expect(q<HTMLInputElement>('[data-testid="canon-none"]', section)!.checked).toBe(true);

    await click(q('[data-testid="canon-existing"]', section));
    expect(api.setPlanCanon).toHaveBeenLastCalledWith("n4h8w2rk", { mode: "existing", canonId: "u7m2q9xa-c1" });

    // the saved choice comes back with the plan; the list has the own Canon only
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "speech production", "pending", 1)], { canonId: CANON }, { canonId: CANON, name: "Language", headRevision: 3 }));
    await click(q('[data-testid="canon-existing"]', section));
    const select = q<HTMLSelectElement>('[data-testid="canon-select"]')!;
    expect(qa("option", select).map((o) => o.getAttribute("value"))).toEqual([CANON]);

    await click(q('[data-testid="canon-new"]', section));
    expect(api.setPlanCanon).toHaveBeenLastCalledWith("n4h8w2rk", { mode: "new", name: "Language" });

    await click(q('[data-testid="canon-none"]', section));
    expect(api.setPlanCanon).toHaveBeenLastCalledWith("n4h8w2rk", { mode: "none" });
  });

  it("says when a new Canon is created and names the Canon in the confirmation", async () => {
    api.listCanons.mockResolvedValue({ items: [], shared: [] });
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "speech production", "pending", 1)], { canonNew: { name: "Language canon" } }));
    await render("/plans/n4h8w2rk");
    const section = q('[data-testid="plan-canon"]')!;
    expect(q<HTMLInputElement>('[data-testid="canon-new"]', section)!.checked).toBe(true);
    expect(q<HTMLInputElement>('[data-testid="canon-new-name"]', section)!.value).toBe("Language canon");
    expect(section.textContent).toContain("created when the plan is confirmed");
    // no Canon of their own: the existing choice is not offered
    expect(q<HTMLInputElement>('[data-testid="canon-existing"]', section)!.disabled).toBe(true);
    expect(section.textContent).toContain("You have no Canon yet.");
  });
});

describe("confirming a draft with a new Canon name being typed", () => {
  const draft = () => detail("DRAFT", [row("r1", "speech production", "pending", 1)], { canonNew: { name: "Language canon" } });
  beforeEach(() => api.listCanons.mockResolvedValue({ items: [], shared: [] }));

  it("stores the typed name first, waits for it and names it in the dialog", async () => {
    api.getPlan.mockResolvedValue(draft());
    await render("/plans/n4h8w2rk");
    await type(q<HTMLInputElement>('[data-testid="canon-new-name"]')!, "Speech canon");
    const put = deferred<{ ok: true }>();
    api.setPlanCanon.mockReturnValue(put.promise);
    await click(button("Confirm and start"));
    expect(api.setPlanCanon).toHaveBeenCalledWith("n4h8w2rk", { mode: "new", name: "Speech canon" });
    // nothing is asked or confirmed before the name is stored
    expect(window.confirm).not.toHaveBeenCalled();
    expect(api.confirmPlan).not.toHaveBeenCalled();
    await act(async () => put.resolve({ ok: true }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("The Canon “Speech canon” is created"));
    expect(api.confirmPlan).toHaveBeenCalledTimes(1);
    expect(api.setPlanCanon).toHaveBeenCalledTimes(1);
  });

  it("waits for the save the blur started instead of saving twice", async () => {
    api.getPlan.mockResolvedValue(draft());
    await render("/plans/n4h8w2rk");
    const input = q<HTMLInputElement>('[data-testid="canon-new-name"]')!;
    await type(input, "Speech canon");
    const put = deferred<{ ok: true }>();
    api.setPlanCanon.mockReturnValue(put.promise);
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(api.setPlanCanon).toHaveBeenCalledTimes(1);
    await click(button("Confirm and start"));
    expect(window.confirm).not.toHaveBeenCalled();
    await act(async () => put.resolve({ ok: true }));
    expect(api.setPlanCanon).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("The Canon “Speech canon” is created"));
    expect(api.confirmPlan).toHaveBeenCalledTimes(1);
  });

  it("does not confirm when the name cannot be stored", async () => {
    api.getPlan.mockResolvedValue(draft());
    await render("/plans/n4h8w2rk");
    await type(q<HTMLInputElement>('[data-testid="canon-new-name"]')!, "Speech canon");
    api.setPlanCanon.mockRejectedValue(new Error("この名前の Canon はすでにあります"));
    await click(button("Confirm and start"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(api.confirmPlan).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("この名前の Canon はすでにあります");
  });

  it("names the stored Canon when nothing is being edited", async () => {
    api.getPlan.mockResolvedValue(draft());
    await render("/plans/n4h8w2rk");
    await click(button("Confirm and start"));
    expect(api.setPlanCanon).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("The Canon “Language canon” is created"));
    expect(api.confirmPlan).toHaveBeenCalledTimes(1);
  });
});

describe("a running plan with a Canon", () => {
  const confirmed = { canonId: CANON, activeWave: 2, confirmedAt: now };
  const canon = { canonId: CANON, name: "Language", headRevision: 4 };

  it("shows the Canon read-only, the pull request rows and the decisions, and acts on them", async () => {
    const rows = [
      row("r1", "speech production", "done", 1, { seed: true, prNo: 1, projectId: "p0000001", project: project("Speech") }),
      row("r2", "phonological processing", "review", 2, { prNo: 5, aiReview: "queued", projectId: "p0000002", project: project("Phonology") }),
      row("r3", "repetition", "review", 2, { prNo: 6, aiReview: "wanted", conformAttempts: 1, projectId: "p0000003", project: project("Repetition") }),
      row("r4", "reading", "decision", 2, { prNo: 7, decisionReason: "conform_limit", conformAttempts: 2, projectId: "p0000004", project: project("Reading") }),
      row("r5", "writing", "decision", 2, { decisionReason: "other_canon", projectId: "p0000005", project: project("Writing", "RUNNING") }),
    ];
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, confirmed, canon));
    await render("/plans/n4h8w2rk");

    const section = q('[data-testid="plan-canon"]')!;
    expect(q<HTMLAnchorElement>(`a[href="/canons/${CANON}"]`, section)!.textContent).toContain("rev 4");
    expect(q('input', section)).toBeNull();

    const summary = q('[data-testid="plan-summary"]')!.textContent!;
    expect(summary).toContain("Awaiting approval 2");
    expect(summary).toContain("Your decision 2");

    const list = q('[data-testid="plan-rows"]')!;
    expect(qa<HTMLAnchorElement>('[data-testid="row-pr"]', list).map((a) => a.getAttribute("href"))).toEqual([1, 5, 6, 7].map((n) => `/canons/${CANON}/pulls/${n}`));
    expect(qa('[data-testid="row-ai-review"]', list).map((e) => e.textContent)).toEqual(["AI review running", "AI review waiting"]);
    expect(qa('[data-testid="row-conform"]', list).map((e) => e.textContent)).toEqual(["Updated to match the Canon 1/2", "Updated to match the Canon 2/2"]);

    const decisions = q('[data-testid="plan-decisions"]')!;
    expect(decisions.textContent).toContain("Your decision (2)");
    const [reading, writing] = qa('[data-testid="plan-decision"]', decisions);
    expect(reading.textContent).toContain("Error conflicts remain after 2 updates to match the Canon.");
    expect(q<HTMLAnchorElement>('[data-testid="row-pr"]', reading)!.getAttribute("href")).toBe(`/canons/${CANON}/pulls/7`);
    expect(writing.textContent).toContain("Its project belongs to another Canon.");

    await click(button("Mark done", reading));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.resolvePlanRow).toHaveBeenLastCalledWith("n4h8w2rk", "r4", "done");
    await click(button("Push again", reading));
    expect(api.resolvePlanRow).toHaveBeenLastCalledWith("n4h8w2rk", "r4", "push");
    // a project that is not completed cannot be pushed
    expect(button("Push again", writing)!.disabled).toBe(true);
    await click(button("Skip", writing));
    expect(api.planRowAction).toHaveBeenLastCalledWith("n4h8w2rk", "r5", "skip");

    // a cancelled dialog does nothing
    vi.mocked(window.confirm).mockReturnValue(false);
    api.resolvePlanRow.mockClear();
    await click(button("Mark done", reading));
    expect(api.resolvePlanRow).not.toHaveBeenCalled();
  });

  it("explains the seed gate with a link to the seed's pull request", async () => {
    const rows = [row("r1", "speech production", "review", 1, { seed: true, prNo: 3 }), row("r2", "repetition", "pending", 2)];
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, { ...confirmed, activeWave: 1 }, canon));
    await render("/plans/n4h8w2rk");
    const gate = q('[data-testid="plan-seed-gate"]')!;
    expect(gate.textContent).toContain("Waiting for the seed pull request to be approved.");
    expect(q('a', gate)!.getAttribute("href")).toBe(`/canons/${CANON}/pulls/3`);
    expect(q('[data-testid="plan-back-pressure"]')).toBeNull();
  });

  it("shows the AI review as waiting, running or done (a link to the pull request), and nothing otherwise", async () => {
    const rows = [
      row("r1", "speech production", "done", 1, { seed: true, prNo: 1 }),
      row("r2", "phonological processing", "review", 2, { prNo: 5, aiReview: null, aiReviewJobId: "j0000005" }),
      row("r3", "repetition", "review", 2, { prNo: 6, aiReview: null }),
      row("r4", "reading", "decision", 2, { prNo: 7, aiReview: "wanted", decisionReason: "conflicts" }),
      row("r5", "naming", "decision", 2, { prNo: 8, aiReview: null, aiReviewJobId: "j0000008", decisionReason: "conflicts" }),
      row("r6", "writing", "done", 2, { prNo: 9, aiReview: null, aiReviewJobId: "j0000009" }),
    ];
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, confirmed, canon));
    await render("/plans/n4h8w2rk");
    const chips = qa('[data-testid="row-ai-review"]', q('[data-testid="plan-rows"]')!);
    expect(chips.map((e) => e.textContent)).toEqual(["AI reviewed", "AI reviewed"]);
    expect(chips.map((e) => e.getAttribute("href"))).toEqual([`/canons/${CANON}/pulls/5`, `/canons/${CANON}/pulls/8`]);
  });

  it("shows the pull request of a row that waits for its update to match the Canon", async () => {
    const rows = [row("r1", "speech production", "done", 1, { seed: true, prNo: 1 }), row("r2", "repetition", "pending", 2, { prNo: 4, conform: true, projectId: "p0000002", project: project("Repetition") }), row("r3", "reading", "pending", 2)];
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, confirmed, canon));
    await render("/plans/n4h8w2rk");
    const list = q('[data-testid="plan-rows"]')!;
    expect(qa<HTMLAnchorElement>('[data-testid="row-pr"]', list).map((a) => a.getAttribute("href"))).toEqual([1, 4].map((n) => `/canons/${CANON}/pulls/${n}`));
    expect(qa('[data-testid="row-conform-waiting"]', list).map((e) => e.textContent)).toEqual(["Waiting to update to match the Canon"]);
    expect(qa('[data-testid="row-ai-review"]', list)).toHaveLength(0);
  });

  it("says when a seed needs a human decision, with a link to its row", async () => {
    const rows = [row("r1", "speech production", "decision", 1, { seed: true, prNo: 3, decisionReason: "conflicts", projectId: "p0000001", project: project("Speech") }), row("r2", "repetition", "pending", 2)];
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, { ...confirmed, activeWave: 1 }, canon));
    const scroll = vi.fn();
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    onTestFinished(() => {
      Element.prototype.scrollIntoView = before;
    });
    await render("/plans/n4h8w2rk");
    expect(q('[data-testid="plan-seed-gate"]')).toBeNull();
    const gate = q('[data-testid="plan-seed-decision"]')!;
    expect(gate.textContent).toContain("A seed row needs your decision.");
    const link = q<HTMLAnchorElement>('[data-testid="seed-decision-link"]', gate)!;
    expect(link.getAttribute("href")).toBe("#plan-decision-r1");
    expect(link.textContent).toBe("speech production in left IFG");
    expect(document.getElementById("plan-decision-r1")!.getAttribute("data-testid")).toBe("plan-decision");
    await click(link);
    expect(scroll).toHaveBeenCalled();
  });

  it("explains the seed gate when the waiting seeds share the seed's wave", async () => {
    const rows = [row("r1", "speech production", "review", 1, { seed: true, prNo: 3 }), row("r2", "comprehension", "pending", 1, { seed: true }), row("r3", "repetition", "done", 1)];
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, { ...confirmed, activeWave: 1 }, canon));
    await render("/plans/n4h8w2rk");
    expect(q('a', q('[data-testid="plan-seed-gate"]')!)!.getAttribute("href")).toBe(`/canons/${CANON}/pulls/3`);
  });

  it("explains the back-pressure when too many pull requests wait", async () => {
    const waiting = Array.from({ length: PLAN_MAX_WAITING_PRS }, (_, i) => row(`r${i + 1}`, `function ${i + 1}`, "review", 1, { prNo: i + 1 }));
    api.getPlan.mockResolvedValue(detail("RUNNING", [...waiting, row("r99", "later", "pending", 3)], confirmed, canon));
    await render("/plans/n4h8w2rk");
    expect(q('[data-testid="plan-back-pressure"]')!.textContent).toBe(`${PLAN_MAX_WAITING_PRS} pull requests are waiting for approval, so the next wave is on hold.`);
    expect(q('[data-testid="plan-seed-gate"]')).toBeNull();
  });

  it("shows no gate once no later wave waits, limits the decision actions to what the API accepts, and names decision reasons in the history", async () => {
    const rows = [
      row("r1", "speech production", "review", 1, { seed: true, prNo: 3 }),
      row("r2", "repetition", "decision", 1, { decisionReason: "push_failed", projectId: "p0000002", project: null }),
    ];
    const d = detail("COMPLETED", rows, { ...confirmed, activeWave: 1 }, canon);
    d.events = [{ planId: "n4h8w2rk", sk: "EVT#1", at: now, type: "row_decision", by: "runner", rowId: "r2", detail: { reason: "push_failed" } }];
    api.getPlan.mockResolvedValue(d);
    await render("/plans/n4h8w2rk");
    expect(q('[data-testid="plan-seed-gate"]')).toBeNull();
    const decision = q('[data-testid="plan-decision"]')!;
    // a missing project cannot be pushed; a finished plan takes neither resolve nor skip
    expect(button("Push again", decision)!.disabled).toBe(true);
    expect(button("Mark done", decision)!.disabled).toBe(true);
    expect(button("Skip", decision)!.disabled).toBe(true);
    expect(q("details")!.textContent).toContain("could not be pushed");
  });

  it("says when the plan's Canon was deleted, and shows no gates on plans without a Canon", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", [row("r1", "speech production", "review", 1, { seed: true, prNo: 3 })], confirmed, { canonId: CANON, name: "", headRevision: 0, missing: true }));
    await render("/plans/n4h8w2rk");
    expect(q('[data-testid="plan-canon"]')!.textContent).toContain("The Canon was not found");
    if (root) await act(async () => root!.unmount());
    host?.remove();

    api.getPlan.mockResolvedValue(detail("RUNNING", [row("r1", "speech production", "running", 1, { seed: true })]));
    await render("/plans/n4h8w2rk");
    expect(q('[data-testid="plan-canon"]')).toBeNull();
    expect(q('[data-testid="plan-seed-gate"]')).toBeNull();
    expect(q('[data-testid="plan-decisions"]')).toBeNull();
  });
});

describe("bulk approval in the Canon", () => {
  const pr = (prNo: number, extra: Partial<CanonPullRequestRecord> = {}): CanonPullRequestRecord => ({
    canonId: CANON,
    sk: `PR#${prNo}`,
    prNo,
    source: `project:u7m2q9xa-${prNo}`,
    sourceName: `Project ${prNo}`,
    sourceRevision: 1,
    baseRevision: 3,
    state: "open",
    summary: { added: 2, changed: 0, unchanged: 0, dropped: 0, errors: 0, warnings: 0, infos: 0 },
    createdBy: "alice",
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
  const pulls = [
    pr(9, { planId: "n4h8w2rk" }),
    pr(8, { summary: { added: 1, changed: 0, unchanged: 0, dropped: 0, errors: 1, warnings: 0, infos: 0 } }),
    pr(7, { summary: { added: 1, changed: 0, unchanged: 0, dropped: 0, errors: 0, warnings: 2, infos: 0 } }),
    pr(6, { reviewState: "changes_requested" }),
    pr(5, { planId: "n4h8w2rk" }),
    pr(4, { state: "approved", planId: "n4h8w2rk" }),
  ];
  function canonDetail(role: CanonDetailResponse["role"]): CanonDetailResponse {
    return { canon: canonRec(CANON, "Language"), members: [], role, ownerName: "Alice", editors: [] };
  }
  beforeEach(() => {
    api.canonPulls.mockResolvedValue({ items: pulls });
    api.canonRevisions.mockResolvedValue({ items: [] });
    api.canonRevision.mockResolvedValue({ canonId: CANON, revision: 3, createdAt: now, circuits: [], groups: [], connections: [], bif: [], references: [], roles: [] });
    api.listProjects.mockResolvedValue({ items: [] });
    api.canonOutgoing.mockResolvedValue({ items: [] });
    api.listCanons.mockResolvedValue({ items: [], shared: [] });
  });

  it("offers only conflict-free open pull requests, approves them oldest first and shows where it stopped", async () => {
    api.getCanon.mockResolvedValue(canonDetail("owner"));
    api.approveManyPulls.mockResolvedValue({ approved: [{ prNo: 5, revision: 4 }], stopped: { prNo: 9, reason: "conflicts", blocking: 1 } });
    await render(`/canons/${CANON}`);
    const list = q('[data-testid="canon-pulls"]')!;
    const offered = qa('[data-testid="bulk-pick"]', list).map((el) => Number(el.closest("li")!.getAttribute("data-pr")));
    expect(offered).toEqual([9, 5]);
    expect(bulkApprovable(pulls[1])).toBe(false);

    // plan chips link to the plan for the owner
    expect(qa<HTMLAnchorElement>('[data-testid="pr-plan"]', list).map((a) => a.getAttribute("href"))).toEqual(["/plans/n4h8w2rk", "/plans/n4h8w2rk", "/plans/n4h8w2rk"]);

    await click(q('[data-testid="bulk-select-all"]'));
    expect(button("Approve selected (2)")).toBeTruthy();
    await click(q('[data-testid="bulk-approve-button"]'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Approve 2 pull requests one after another?"));
    expect(api.approveManyPulls).toHaveBeenCalledWith(CANON, [5, 9]);
    expect(q('[data-testid="bulk-result"]')!.textContent).toBe("Approved 1. Stopped at #9: it conflicts with the Canon as it is now.");
    // the list is read again
    expect(api.canonPulls).toHaveBeenCalledTimes(2);
  });

  it("lets a co-editor approve together but shows the plan as a plain chip, and offers nothing to an admin", async () => {
    api.getCanon.mockResolvedValue(canonDetail("editor"));
    await render(`/canons/${CANON}`);
    expect(qa('[data-testid="bulk-pick"]')).toHaveLength(2);
    expect(qa('[data-testid="pr-plan"]').every((el) => el.tagName === "SPAN")).toBe(true);
    if (root) await act(async () => root!.unmount());
    host?.remove();

    api.getCanon.mockResolvedValue(canonDetail("admin"));
    await render(`/canons/${CANON}`);
    expect(q('[data-testid="bulk-approve"]')).toBeNull();
    expect(qa('[data-testid="bulk-pick"]')).toHaveLength(0);
  });

  it("shows the plan chip on the pull request page", async () => {
    const d = {
      pr: pr(4, { state: "approved", planId: "n4h8w2rk", mergedRevision: 4, decidedByName: "Alice", decidedAt: now }),
      diff: null,
      headRevision: 4,
      targetName: "Language",
      canReview: true,
      canWithdraw: false,
      canComment: false,
      viewerRole: "owner",
      checks: null,
      entries: {},
      graph: null,
      provenance: null,
      events: [],
      ai: null,
    } as unknown as CanonPullDetailResponse;
    api.canonPull.mockResolvedValue(d);
    await render(`/canons/${CANON}/pulls/4`);
    expect(q<HTMLAnchorElement>('[data-testid="pr-plan"]')!.getAttribute("href")).toBe("/plans/n4h8w2rk");
    expect(q('[data-testid="pr-plan"]')!.textContent).toContain("Plan n4h8w2rk");
  });
});

describe("helpers", () => {
  it("the seed gate holds only on seeds of the active wave or earlier that wait for approval", () => {
    const rows = [
      { seed: true, state: "review" as const, wave: 1 },
      { seed: true, state: "review" as const, wave: 3 },
      { seed: false, state: "review" as const, wave: 1 },
      { seed: true, state: "done" as const, wave: 1 },
    ];
    expect(seedGateRows(rows, 2)).toEqual([rows[0]]);
    expect(seedGateRows(rows, null)).toEqual([]);
  });

  it("the seed gate also holds on seeds in 「人の判断」, and is explained only while it holds a row", () => {
    const seed = { seed: true, state: "decision" as const, wave: 1 };
    expect(seedGateRows([seed], 1)).toEqual([seed]);
    // nothing waits: no explanation
    expect(seedsHolding([seed, { seed: false, state: "pending" as const, wave: 1 }], 1)).toEqual([]);
    // a later wave waits, or another seed (even of the same wave)
    expect(seedsHolding([seed, { seed: false, state: "pending" as const, wave: 2 }], 1)).toEqual([seed]);
    expect(seedsHolding([seed, { seed: true, state: "pending" as const, wave: 1 }], 1)).toEqual([seed]);
  });

  it("every row state has a colour", () => {
    expect(ROW_STATE_COLOR.review).toBe("bg-violet-50 text-violet-700");
    expect(ROW_STATE_COLOR.decision).toBe("bg-amber-50 text-amber-700");
  });
});
