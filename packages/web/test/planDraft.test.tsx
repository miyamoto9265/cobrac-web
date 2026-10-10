// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDetailResponse, PlanProposalRecord, PlanRecord, PlanRowState, PlanRowView } from "@cobrac/shared";
import { countRows, planEstimate } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getPlan: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  createUpload: vi.fn(),
  updatePlan: vi.fn(),
  savePlanRows: vi.fn(),
  importPlanRows: vi.fn(),
  confirmPlan: vi.fn(),
  planAction: vi.fn(),
  planRowAction: vi.fn(),
  deletePlan: vi.fn(),
  requestDraft: vi.fn(),
  cancelDraft: vi.fn(),
  orderPlan: vi.fn(),
  proposalAction: vi.fn(),
  answer: vi.fn(),
  models: vi.fn(),
  addPlanAttachments: vi.fn(),
  removePlanAttachment: vi.fn(),
  listCanons: vi.fn(),
}));
const uploadFile = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/api", () => ({ api, uploadFile, ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { PlanDetailPage } = await import("../src/pages/PlanDetailPage");
const { PlansPage } = await import("../src/pages/PlansPage");
const { waveRuns, isSeedWave, seedIndexes, wavesText, shownAnchors, fmtElapsed } = await import("../src/lib/plan");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-06T00:00:00.000Z";
const PLAN = "n4h8w2rk";

function row(rowId: string, roi: string, tlf: string, state: PlanRowState, wave: number, extra: Partial<PlanRowView> = {}): PlanRowView {
  return { planId: PLAN, sk: `ROW#${rowId}`, rowId, order: Number(rowId.slice(1)), wave, roi, tlf, rationale: "", source: "llm", state, attempts: 0, createdAt: now, updatedAt: now, projectId: null, project: null, ...extra };
}
function detail(status: PlanRecord["status"], rows: PlanRowView[], extra: Partial<PlanRecord> = {}, more: Partial<PlanDetailResponse> = {}): PlanDetailResponse {
  const draftLike = status === "DRAFT" || status === "DRAFTING";
  const plan: PlanRecord = {
    planId: PLAN,
    sk: "META",
    ownerUserId: "alice",
    name: "Language",
    goal: "言語の BRA を一通りそろえたい",
    status,
    settings: { model: draftLike ? null : "test-model", modelChosen: false, reasoningEffort: null, researchMode: true, locale: "en" },
    rowCount: rows.length,
    rowCounts: countRows(rows),
    activeWave: draftLike ? null : 1,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
  return {
    plan,
    rows,
    events: [],
    limits: { maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 2, effective: 2 },
    estimate: planEstimate(rows, 2),
    actual: { minutes: draftLike ? null : 30, costUsd: draftLike ? null : 0.21 },
    proposals: [],
    planJobsCostUsd: null,
    ...more,
  };
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
          <Routes>
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/:planId" element={<PlanDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const q = <T extends Element = HTMLElement>(sel: string, within: ParentNode = document) => within.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string, within: ParentNode = document) => [...within.querySelectorAll<T>(sel)];
const button = (text: string, within: ParentNode = document) => qa<HTMLButtonElement>("button", within).find((b) => b.textContent?.trim() === text);
const click = (el: HTMLElement | undefined | null) => act(async () => el!.click());
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function pickFiles(input: HTMLInputElement, files: File[]) {
  await act(async () => {
    Object.defineProperty(input, "files", { value: files, configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
/** The heading of each wave as shown (stored wave number, 「基準プロジェクト」 label). */
const headings = (within: ParentNode) => qa('[data-testid="plan-wave"]', within).map((h) => h.textContent?.trim());
/** Opens the details of every row of the draft's table (rationale, wave, anchors, 「作り直す」). */
async function openDetails(within: ParentNode) {
  for (const b of qa<HTMLButtonElement>('[data-testid="row-summary"]', within)) if (b.getAttribute("aria-expanded") !== "true") await click(b);
}

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  api.models.mockResolvedValue({ models: ["test-model"], efforts: [], envDefaultModel: "test-model", keySource: "own", orgTier: null, restricted: false, pricedModels: [] });
  for (const fn of [api.savePlanRows, api.confirmPlan, api.planAction, api.updatePlan, api.requestDraft, api.cancelDraft, api.orderPlan, api.proposalAction]) fn.mockResolvedValue({ ok: true });
  api.listCanons.mockResolvedValue({ items: [], shared: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("new plan with a draft", () => {
  it("uploads the capability lists and creates the plan with draft: true", async () => {
    api.listPlans.mockResolvedValue({ items: [] });
    let n = 0;
    api.createUpload.mockImplementation(async () => ({ uploadId: `up_file000${++n}`, url: "https://s3.example/upload", fields: {} }));
    uploadFile.mockResolvedValue(undefined);
    api.createPlan.mockResolvedValue({ plan: { planId: PLAN }, rows: [], rejected: [] });
    api.getPlan.mockResolvedValue(detail("DRAFTING", [], { draft: { kind: "draft", jobId: null, status: "waiting", requestedAt: new Date().toISOString(), requestedBy: "alice" } }));
    await render("/plans");
    // 自律実行 is the default: handling the plan yourself is the opt-in that brings “Create plan” and “Create draft”
    await click(q<HTMLInputElement>('[data-testid="plan-manual"]'));

    await type(q<HTMLInputElement>('input[maxlength="200"]')!, "Language");
    const draftBtn = button("Create draft")!;
    // a draft needs a goal or a capability list
    expect(draftBtn.disabled).toBe(true);

    const csv = new File(["ROI,TLF\nSTG,hearing\n"], "language.csv", { type: "text/csv" });
    const xlsx = new File(["PK fake xlsx"], "abilities.xlsx");
    const pdf = new File(["%PDF fake"], "review.pdf", { type: "application/pdf" });
    const docx = new File(["fake"], "notes.docx");
    await pickFiles(q<HTMLInputElement>('[data-testid="plan-files"]')!, [csv, xlsx, pdf, docx]);
    expect(document.body.textContent).toContain("notes.docx: this file type cannot be attached");
    // a long file name is one token: the message breaks it instead of scrolling sideways at 390 px
    const msg = qa("div").find((el) => el.textContent === "notes.docx: this file type cannot be attached")!;
    expect(msg.className).toContain("[overflow-wrap:anywhere]");
    const list = q('[data-testid="plan-file-list"]')!;
    expect(qa("li", list).map((li) => li.textContent?.trim())).toEqual(["language.csv", "abilities.xlsx", "review.pdf"]);
    await click(q<HTMLButtonElement>('button[aria-label="Remove: review.pdf"]', list));
    expect(qa("li", q('[data-testid="plan-file-list"]')!)).toHaveLength(2);
    expect(draftBtn.disabled).toBe(false);

    await click(draftBtn);
    expect(api.createUpload.mock.calls).toEqual([
      ["language.csv", csv.size],
      ["abilities.xlsx", xlsx.size],
    ]);
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile.mock.calls[0][1]).toBe(csv);
    expect(api.createPlan).toHaveBeenCalledWith({
      name: "Language",
      goal: "",
      attachments: [
        { uploadId: "up_file0001", name: "language.csv" },
        { uploadId: "up_file0002", name: "abilities.xlsx" },
      ],
      draft: true,
      locale: "en",
    });
    expect(vi.mocked(uploadFile).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(api.createPlan).mock.invocationCallOrder[0]);
    expect(api.getPlan).toHaveBeenCalledWith(PLAN);
    expect(q('[data-testid="plan-drafting"]')).not.toBeNull();
  });

  it("sends the capability lists with “Create plan” too, without asking for a draft", async () => {
    api.listPlans.mockResolvedValue({ items: [] });
    api.createUpload.mockResolvedValue({ uploadId: "up_file0001", url: "https://s3.example/upload", fields: {} });
    uploadFile.mockResolvedValue(undefined);
    api.createPlan.mockResolvedValue({ plan: { planId: PLAN }, rows: [], rejected: [] });
    api.getPlan.mockResolvedValue(detail("DRAFT", []));
    await render("/plans");
    // 自律実行 is the default: handling the plan yourself is the opt-in that brings “Create plan” and “Create draft”
    await click(q<HTMLInputElement>('[data-testid="plan-manual"]'));
    await type(q<HTMLInputElement>('input[maxlength="200"]')!, "Language");
    const csv = new File(["ROI,TLF\nSTG,hearing\n"], "language.csv", { type: "text/csv" });
    await pickFiles(q<HTMLInputElement>('[data-testid="plan-files"]')!, [csv]);
    await click(button("Create plan"));
    expect(api.createPlan).toHaveBeenCalledWith({ name: "Language", goal: "", attachments: [{ uploadId: "up_file0001", name: "language.csv" }] });
  });

  it("enables the draft with a goal alone and keeps “Create plan” without a draft", async () => {
    api.listPlans.mockResolvedValue({ items: [] });
    api.createPlan.mockResolvedValue({ plan: { planId: PLAN }, rows: [], rejected: [] });
    api.getPlan.mockResolvedValue(detail("DRAFT", []));
    await render("/plans");
    // 自律実行 is the default: handling the plan yourself is the opt-in that brings “Create plan” and “Create draft”
    await click(q<HTMLInputElement>('[data-testid="plan-manual"]'));
    await type(q<HTMLInputElement>('input[maxlength="200"]')!, "Language");
    await type(q<HTMLTextAreaElement>('textarea[maxlength="4000"]')!, "言語の BRA を一通りそろえたい");
    expect(button("Create draft")!.disabled).toBe(false);
    await click(button("Create plan"));
    expect(api.createUpload).not.toHaveBeenCalled();
    expect(api.createPlan).toHaveBeenCalledWith({ name: "Language", goal: "言語の BRA を一通りそろえたい" });
  });

  it("keeps “Create plan” disabled until a goal, a file or rows are given besides the name", async () => {
    api.listPlans.mockResolvedValue({ items: [] });
    localStorage.setItem("cobrac-locale", "ja");
    await render("/plans");
    // 自律実行 is the default: handling the plan yourself is the opt-in that brings “Create plan” and “Create draft”
    await click(q<HTMLInputElement>('[data-testid="plan-manual"]'));
    const create = button("計画を作る")!;
    expect(create.disabled).toBe(true);
    await type(q<HTMLInputElement>('input[maxlength="200"]')!, "Language");
    // a name alone is not enough: the API answers 400 「目標・資料・行のどれかが必要です」
    expect(create.disabled).toBe(true);
    const hint = q('[data-testid="plan-need-input"]')!;
    expect(hint.textContent).toBe("目標・資料・行のどれかを入れてください");
    expect(create.getAttribute("aria-describedby")).toBe(hint.id);
    // each of the three is enough
    await type(q<HTMLTextAreaElement>('textarea[maxlength="4000"]')!, "言語の BRA を一通りそろえたい");
    expect(create.disabled).toBe(false);
    expect(q('[data-testid="plan-need-input"]')).toBeNull();
    await type(q<HTMLTextAreaElement>('textarea[maxlength="4000"]')!, "");
    expect(create.disabled).toBe(true);
    // the paste box sits in the same 資料 section and opens on demand
    expect(q('textarea[aria-label="行を貼り付ける"]')).toBeNull();
    await click(q<HTMLButtonElement>('[data-testid="plan-paste-open"]'));
    expect(q('[data-testid="plan-paste-open"]')).toBeNull();
    await type(q<HTMLTextAreaElement>('textarea[aria-label="行を貼り付ける"]')!, "ROI,TLF\nSTG,hearing\n");
    expect(create.disabled).toBe(false);
    await type(q<HTMLTextAreaElement>('textarea[aria-label="行を貼り付ける"]')!, "  ");
    expect(create.disabled).toBe(true);
    await pickFiles(q<HTMLInputElement>('[data-testid="plan-files"]')!, [new File(["ROI,TLF\n"], "language.csv", { type: "text/csv" })]);
    expect(create.disabled).toBe(false);
    // the autonomous run needs the same
    await click(q<HTMLInputElement>('[data-testid="plan-manual"]'));
    expect(button("自律実行で開始")!.disabled).toBe(false);
    await click(q<HTMLButtonElement>('button[aria-label="削除: language.csv"]'));
    expect(button("自律実行で開始")!.disabled).toBe(true);
    expect(q('[data-testid="plan-need-input"]')).not.toBeNull();
  });
});

describe("a draft being written", () => {
  const drafting = (status: "waiting" | "queued" | "running") =>
    detail("DRAFTING", [row("r1", "STG", "hearing", "pending", 1, { source: "csv" })], {
      draft: { kind: "draft", jobId: status === "waiting" ? null : "j1", status, requestedAt: new Date(Date.now() - 90_000).toISOString(), requestedBy: "alice", locale: "en" },
      attachments: [{ kind: "file", id: "f1", name: "abilities.xlsx", key: "attachments/files/01-abilities.xlsx", size: 10, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    });

  it("shows the job state without the elapsed time, locks the rows and cancels", async () => {
    api.getPlan.mockResolvedValue(drafting("running"));
    await render(`/plans/${PLAN}`);
    // the job's state and its cancel button are in 「1. 作るもの」, next to what the job reads
    const banner = q('[data-testid="plan-drafting"]')!;
    expect(q('[data-testid="plan-what"]')!.contains(banner)).toBe(true);
    expect(banner.textContent).toContain("Drafting: running");
    expect(banner.textContent).not.toContain("so far");
    expect(q('[data-testid="plan-attachments"]')!.textContent).toBe("abilities.xlsx");
    // the goal and the files are read-only while the job runs
    expect(q('textarea[data-testid="plan-goal"]')).toBeNull();
    expect(q('[data-testid="plan-goal"]')!.textContent).toBe("言語の BRA を一通りそろえたい");
    expect(q('[data-testid="plan-attachments"] button')).toBeNull();
    expect(button("Add files")).toBeUndefined();
    // the rows are read-only too, and the plan cannot be confirmed or deleted
    expect(q('[data-testid="plan-editor"]')).toBeNull();
    const view = q('[data-testid="plan-rows"]')!;
    expect(qa("input", view)).toHaveLength(0);
    expect(button("Add row", view)).toBeUndefined();
    expect(button("Confirm and start")!.disabled).toBe(true);
    expect(q('[data-testid="plan-confirm-blocked"]')!.textContent).toBe("The plan cannot be confirmed while the draft is being written");
    expect(button("Delete plan")).toBeUndefined();
    // a draft has no progress, waves, time or cost cards
    expect(q('[data-testid="plan-summary"]')).toBeNull();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await click(button("Cancel draft", banner));
    expect(api.cancelDraft).toHaveBeenCalledWith(PLAN);
  });

  it("says when the job waits for a free slot, and polls every 5 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    api.getPlan.mockResolvedValue(drafting("waiting"));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-drafting"]')!.textContent).toContain("waiting for a free job slot");
    expect(api.getPlan).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(api.getPlan).toHaveBeenCalledTimes(2);
  });

  it("says a draft that reads xlsx / PDF lists or many rows may take up to about half an hour", async () => {
    api.getPlan.mockResolvedValue(drafting("running"));
    await render(`/plans/${PLAN}`);
    // the banner says what the job means for the rows and how long it may take
    expect(q('[data-testid="plan-banner"]')!.textContent).toBe("The rows cannot be edited until the draft is ready. A draft that reads xlsx or PDF lists or covers more than 20 rows can take up to about half an hour.");
  });

  it("says a few minutes for a goal or a short list, and half an hour for more than 20 rows", async () => {
    const short = drafting("running");
    short.plan.attachments = [{ kind: "file", id: "f1", name: "language.csv", key: "attachments/files/01-language.csv", size: 10, contentType: "text/csv" }];
    api.getPlan.mockResolvedValue(short);
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-banner"]')!.textContent).toContain("usually within a few minutes");
    expect(q('[data-testid="plan-banner"]')!.textContent).not.toContain("half an hour");
    act(() => root?.unmount());
    host?.remove();

    const many = drafting("running");
    many.plan.attachments = [];
    many.rows = Array.from({ length: 21 }, (_, i) => row(`r${i + 1}`, `ROI ${i + 1}`, `TLF ${i + 1}`, "pending", 1, { source: "csv" }));
    api.getPlan.mockResolvedValue(many);
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-banner"]')!.textContent).toContain("can take up to about half an hour");
  });

  it("does not cancel when the owner says no", async () => {
    api.getPlan.mockResolvedValue(drafting("queued"));
    await render(`/plans/${PLAN}`);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await click(button("Cancel draft"));
    expect(api.cancelDraft).not.toHaveBeenCalled();
  });
});

describe("a draft written by the plan job", () => {
  const rows = [
    row("r1", "left IFG", "speech production", "pending", 1, { seed: true, anchors: ["BNA:29-30", "BNA:31-32", "HOMBA:1001", "HOMBA:1002", "HOMBA:1003"], anchorsSource: "predicted", hub: 3, overlaps: ["r3"], priority: 5 }),
    row("r2", "STG", "phonological processing", "pending", 2, { seed: true, anchors: ["BNA:79-80", "HOMBA:1001"], hub: 2 }),
    row("r3", "left IFG", "syntactic processing", "pending", 3, { anchors: ["BNA:29-30", "BNA:31-32"], hub: 2, overlaps: ["r1"], dependsOn: ["r1"] }),
    row("r4", "angular gyrus", "reading", "pending", 3, { source: "csv", existing: { projectId: "p0000009", name: "Reading" } }),
    row("r5", "Exner's area", "writing", "pending", 4, { duplicateOf: "p0000010" }),
  ];
  const drafted = (extra: Partial<PlanRecord> = {}) =>
    detail(
      "DRAFT",
      rows,
      {
        ordering: "auto",
        policy: "neocortex = area × projection class, subcortex = nucleus",
        draft: { kind: "draft", jobId: "j1", status: "done", requestedAt: now, requestedBy: "alice", endedAt: now, unread: [{ source: "abilities.xlsx", location: "Sheet1 row 7", reason: "no region given" }], dropped: 2 },
        ...extra,
      },
      { planJobsCostUsd: 0.03 },
    );

  it("shows seeds, anchors, hub scores, overlaps, dependencies, existing and duplicate projects, and what could not be read", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    // stored wave numbers, seed waves labelled
    expect(headings(editor)).toEqual(["Wave 1Baseline project", "Wave 2Baseline project", "Wave 3", "Wave 4"]);
    expect(q('[data-testid="plan-rows-summary"]', editor)!.textContent).toContain("5 rows · 4 waves · automatic order");
    expect(editor.textContent).toContain("Automatic order.");

    // each row says in short what its details show in full
    const summaries = qa('[data-testid="row-summary"]', editor).map((b) => b.textContent?.trim());
    expect(summaries[0]).toBe("5 anchors · hub 3 · Overlaps: syntactic processing");
    expect(summaries[2]).toBe("2 anchors · hub 2 · Overlaps: speech production · Depends on: speech production");
    expect(summaries[3]).toBe("Existing");
    expect(summaries[4]).toBe("Same ROI × TLF as a project");
    expect(qa('[data-testid="row-facts"]', editor)).toHaveLength(0);
    await openDetails(editor);

    const facts = qa('[data-testid="row-facts"]', editor);
    expect(facts).toHaveLength(5);
    expect(facts[0].textContent).toContain("Baseline project");
    const anchors = q('[data-testid="row-anchors"]', facts[0])!;
    expect(qa(".font-mono", anchors).map((a) => a.textContent)).toEqual(["BNA:29-30", "BNA:31-32", "HOMBA:1001", "HOMBA:1002"]);
    expect(anchors.textContent).toContain("+1");
    expect(anchors.getAttribute("title")).toBe("Anchors: BNA:29-30, BNA:31-32, HOMBA:1001, HOMBA:1002, HOMBA:1003");
    expect(facts[0].textContent).toContain("hub 3");
    expect(facts[0].textContent).toContain("Overlaps: syntactic processing");
    expect(facts[2].textContent).not.toContain("Baseline project");
    expect(facts[2].textContent).toContain("Depends on: speech production");
    expect(facts[3].textContent).toContain("Existing");
    expect(q<HTMLAnchorElement>('a[href="/projects/p0000009"]', facts[3])!.textContent).toBe("Reading");
    expect(facts[3].textContent).toContain("Rebuild");
    expect(q<HTMLAnchorElement>('a[href="/projects/p0000010"]', facts[4])!.textContent).toContain("Same ROI × TLF as a project");

    const unread = q('[data-testid="plan-unread"]')!;
    expect(unread.textContent).toContain("Items the draft could not read: 1");
    expect(unread.textContent).toContain("abilities.xlsx · Sheet1 row 7 — no region given");
    expect(unread.textContent).toContain("Parts of the draft not used: 2");
    expect(q('[data-testid="plan-what"]')!.contains(unread)).toBe(true);

    // no progress, waves, time or cost cards before confirmation (the planning jobs' cost is shown once the plan runs)
    expect(q('[data-testid="plan-summary"]')).toBeNull();
    expect(q('[data-testid="plan-jobs-cost"]')).toBeNull();
    const policy = q('[data-testid="plan-policy"]')!;
    expect(policy.textContent).toBe("Granularity policy (decided by the Orchestrator)neocortex = area × projection class, subcortex = nucleus");
    expect(q('[data-testid="plan-what"]')!.contains(policy)).toBe(true);
  });

  it("shows the policy the Orchestrator wrote without a field to edit it, and chooses the two models apart", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-policy"] textarea')).toBeNull();
    // the Orchestrator's model has no reasoning effort; the Agents' model has one
    const orchestrator = q('[data-testid="plan-orchestrator-model"]')!;
    expect(orchestrator.textContent).toContain("Orchestrator");
    expect(orchestrator.textContent).toContain("Drafts, re-plans, decisions and answers");
    expect(orchestrator.querySelectorAll("select")).toHaveLength(1);
    const agents = q('[data-testid="plan-agents-model"]')!;
    expect(agents.textContent).toContain("Build each row's BRA");
    expect(agents.querySelectorAll("select")).toHaveLength(2);
    // three equal columns: the agents' model and effort join the grid of the Orchestrator's model, with plain labels
    expect(agents.className).toBe("contents");
    expect(agents.parentElement).toBe(orchestrator.parentElement);
    expect(agents.parentElement!.className).toContain("sm:grid-cols-3");
    expect(qa("label > span:first-child", q('[data-testid="plan-models"]')!).map((s) => s.textContent)).toEqual(["Orchestrator", "Agents", "Reasoning effort (agents)"]);
    expect(q('[data-testid="plan-models"]')!.innerHTML).not.toContain("uppercase");
  });

  it("says nothing about the API key under the models of an approved user", async () => {
    api.models.mockResolvedValue({ models: ["test-model"], efforts: [], envDefaultModel: "test-model", keySource: "org", orgTier: null, restricted: false, pricedModels: [] });
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    expect(qa('[data-testid="default-key-note"]')).toHaveLength(0);
    expect(q('[data-testid="plan-models"]')!.textContent).not.toMatch(/API key/i);
  });

  it("sends rebuild for an existing project and keeps the priorities when the rows are saved", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    await openDetails(editor);
    await click(qa<HTMLInputElement>('input[type="checkbox"]', editor)[0]);
    expect(q('[data-testid="plan-save-bar"]', editor)!.textContent).toContain("Unsaved changes: 1");
    await click(button("Save rows", editor));
    const saved = vi.mocked(api.savePlanRows).mock.calls[0][1] as Record<string, unknown>[];
    expect(saved.map((r) => r.rowId)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(saved[0]).toEqual({ rowId: "r1", roi: "left IFG", tlf: "speech production", rationale: "", wave: 1, priority: 5 });
    expect(saved[3]).toEqual({ rowId: "r4", roi: "angular gyrus", tlf: "reading", rationale: "", wave: 3, rebuild: true });
    expect(saved.filter((r) => "rebuild" in r)).toHaveLength(1);
  });

  it("shows a stored 「作り直す」 ticked, and sends false only when it is unticked", async () => {
    const rebuilt = rows.map((r) => (r.rowId === "r4" ? { ...r, existing: null, rebuild: true } : r));
    api.getPlan.mockResolvedValue(detail("DRAFT", rebuilt, { ordering: "auto" }));
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    expect(qa('[data-testid="row-summary"]', editor)[3].textContent).toBe("Rebuild");
    await openDetails(editor);
    const boxes = qa<HTMLInputElement>('input[type="checkbox"]', editor);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].checked).toBe(true);
    // untouched: the stored choice is sent as it is
    await type(qa<HTMLInputElement>('input[aria-label="TLF"]', editor)[4], "handwriting");
    await click(button("Save rows", editor));
    let saved = vi.mocked(api.savePlanRows).mock.calls[0][1] as Record<string, unknown>[];
    expect(saved[3]).toEqual({ rowId: "r4", roi: "angular gyrus", tlf: "reading", rationale: "", wave: 3, rebuild: true });
    expect(saved.filter((r) => "rebuild" in r)).toHaveLength(1);
    // unticked: false, so the row may be matched with the finished project again
    await click(qa<HTMLInputElement>('input[type="checkbox"]', editor)[0]);
    await click(button("Save rows", editor));
    saved = vi.mocked(api.savePlanRows).mock.calls[1][1] as Record<string, unknown>[];
    expect(saved[3]).toEqual({ rowId: "r4", roi: "angular gyrus", tlf: "reading", rationale: "", wave: 3, rebuild: false });
    expect(saved.filter((r) => "rebuild" in r)).toHaveLength(1);
  });

  it("notes a rebuilt row in the running view", async () => {
    const rebuilt = rows.map((r) => (r.rowId === "r4" ? { ...r, existing: null, rebuild: true, state: "running" as const, projectId: "p0000011" } : r));
    api.getPlan.mockResolvedValue(detail("RUNNING", rebuilt, { ordering: "auto", activeWave: 3 }));
    await render(`/plans/${PLAN}`);
    const view = q('[data-testid="plan-rows"]')!;
    expect(qa('[data-testid="row-rebuild"]', view).map((el) => el.textContent)).toEqual(["Rebuild"]);
    expect(qa('input[type="checkbox"]', view)).toHaveLength(0);
  });

  it("says in the confirmation which rows an existing project covers", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await click(button("Confirm and start"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Rows with a finished project (1) are marked done without being built."));
    // each seed row is a wave of its own: the dialog and the rows' summary count the same waves
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Projects: 4 · waves: 4"));
    expect(q('[data-testid="plan-rows-summary"]')!.textContent).toContain("5 rows · 4 waves");
    // 「4. 確定して開始」 shows the same estimate
    const e = planEstimate(rows, 2);
    expect(q('[data-testid="plan-estimate"]')!.textContent).toContain(`Estimate: ~${Math.round((e.minutes / 60) * 10) / 10} h · $${e.costUsd.min.toFixed(2)}–$${e.costUsd.max.toFixed(2)} (4 rows, up to 2 at a time)`);
  });

  it("counts a seed moved next to other rows as a body row in the estimate of unsaved rows, as the headings", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    await openDetails(editor);
    // the second seed goes into wave 3 with r3 (and the existing project's row)
    await type(qa<HTMLInputElement>('input[aria-label="Wave"]', editor)[1], "3");
    expect(headings(editor)).toEqual(["Wave 1Baseline project", "Wave 3", "Wave 4"]);
    expect(q('[data-testid="plan-rows-summary"]', editor)!.textContent).toContain("5 rows · 3 waves");
    const facts = qa('[data-testid="row-facts"]', editor);
    expect(facts[0].textContent).toContain("Baseline project");
    expect(facts[1].textContent).not.toContain("Baseline project");
    // unsaved rows are saved before the plan can be confirmed; the estimate already counts them as edited
    expect(button("Confirm and start")!.disabled).toBe(true);
    expect(q('[data-testid="plan-confirm-blocked"]')!.textContent).toBe("Save the row changes before confirming");
    // 1 seed + waves 3 and 4 (not 2 seeds + 2 waves)
    const e = planEstimate(
      [
        { wave: 1, state: "pending", existing: null, seed: true },
        { wave: 3, state: "pending", existing: null, seed: false },
        { wave: 3, state: "pending", existing: null, seed: false },
        { wave: 4, state: "pending", existing: null, seed: false },
      ],
      2,
    );
    expect(e.seedRows).toBe(1);
    expect(e.waves).toBe(3);
    expect(q('[data-testid="plan-estimate"]')!.textContent).toContain(`Estimate: ~${Math.round((e.minutes / 60) * 10) / 10} h`);
    expect(q('[data-testid="plan-estimate"]')!.textContent).toContain("(4 rows, up to 2 at a time)");
    expect(planEstimate(rows, 2).minutes).not.toBe(e.minutes);
  });

  it("orders the rows automatically, saving unsaved rows first", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    await click(button("Order automatically", editor));
    expect(api.orderPlan).toHaveBeenCalledWith(PLAN);
    expect(api.savePlanRows).not.toHaveBeenCalled();
    expect(api.getPlan).toHaveBeenCalledTimes(2);

    await type(qa<HTMLInputElement>('input[aria-label="TLF"]', editor)[4], "handwriting");
    await click(button("Order automatically", editor));
    expect(api.savePlanRows).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.savePlanRows).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.orderPlan).mock.invocationCallOrder[1]);
  });

  it("asks for a new draft after saying that it runs a billed job", async () => {
    api.getPlan.mockResolvedValue(drafted());
    await render(`/plans/${PLAN}`);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // the plan has rows: the draft is made again, and the rows stay
    const what = q('[data-testid="plan-what"]')!;
    expect(button("Create draft", what)).toBeUndefined();
    expect(what.textContent).toContain("The current rows stay. It takes a few minutes, and its cost is recorded.");
    await click(button("Draft again", what));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("billed like any other job"));
    expect(api.requestDraft).toHaveBeenCalledWith(PLAN, "en");
    // the goal was not changed, so it is not stored again
    expect(api.updatePlan).not.toHaveBeenCalled();
  });

  it("names the goal in the language of the screen when the draft could not read part of it", async () => {
    api.getPlan.mockResolvedValue(drafted({ draft: { kind: "draft", jobId: "j1", status: "done", requestedAt: now, requestedBy: "alice", endedAt: now, unread: [{ source: "goal", location: "last sentence", reason: "no function named" }] } }));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-unread"]')!.textContent).toContain("目標 · last sentence — no function named");
  });

  it("shows the error of a failed draft", async () => {
    api.getPlan.mockResolvedValue(drafted({ draft: { kind: "draft", jobId: "j1", status: "failed", requestedAt: now, requestedBy: "alice", error: "no API key" } }));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-draft-failed"]')!.textContent).toBe("The draft could not be made: no API key");
    expect(q('[data-testid="plan-unread"]')).toBeNull();
  });

  it("gives the reason a draft could not be started for the owner in the language of the screen", async () => {
    const error = "No API key to run the job with: register one in Settings, or ask an admin to approve you.";
    api.getPlan.mockResolvedValue(drafted({ draft: { kind: "draft", jobId: null, status: "failed", requestedAt: now, requestedBy: "alice", error, errorCode: "no_key" } }));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    const failed = q('[data-testid="plan-draft-failed"]')!.textContent!;
    expect(failed).toBe("下書きを作成できませんでした: ジョブを実行する API キーがありません。設定画面でキーを登録するか、管理者に利用の承認を依頼してください。");
    expect(failed).not.toContain("No API key");
  });

  it("lists the rows of an attached file that could not be read with the file name", async () => {
    api.getPlan.mockResolvedValue(drafted());
    host = document.createElement("div");
    document.body.appendChild(host);
    const r = (root = createRoot(host));
    await act(async () => {
      r.render(
        <I18nProvider>
          <MemoryRouter initialEntries={[{ pathname: `/plans/${PLAN}`, state: { rejected: [{ file: "language.csv", row: 4, reason: "duplicate", text: "STG | hearing" }] } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/plans/:planId" element={<PlanDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>,
      );
    });
    expect(q('[data-testid="plan-rejected"]')!.textContent).toContain("language.csv, row 4: same ROI × TLF as another row");
  });
});

describe("the draft page", () => {
  const csvFile = { kind: "file" as const, id: "f1", name: "language.csv", key: "attachments/files/01-language.csv", size: 10, contentType: "text/csv" };
  const two = () => [row("r1", "left IFG", "speech production", "pending", 1, { source: "manual" }), row("r2", "STG", "phonological processing", "pending", 2, { source: "manual" })];
  /** The sections from the top, by their headings. */
  const sections = () => qa("h2").map((h) => h.childNodes[0]?.textContent?.trim());

  it("shows an empty draft in four steps, with what to do first and why it cannot be confirmed yet", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [], { goal: "" }, { events: [{ planId: PLAN, sk: "EVT#1", at: now, type: "created", by: "alice" }] }));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    expect(sections()).toEqual(["1. 作るもの", "2. 行とバッチ", "3. 進め方", "4. 確定して開始"]);
    expect(q('[data-testid="plan-banner"]')!.textContent).toBe("まだ何も入っていません。目標を書いて「下書きを作成」を押すか、行を追加してください。確定するまでプロジェクトは 1 件も作られません。");
    // no progress, waves, time or cost cards, no actions at the top
    expect(q('[data-testid="plan-summary"]')).toBeNull();
    expect(q('[data-testid="plan-actions"]')).toBeNull();

    // 1. 作るもの: nothing to draft from yet
    const what = q('[data-testid="plan-what"]')!;
    expect(what.textContent).toContain("資料ファイル （任意・10 個まで）");
    expect(what.textContent).toContain("CSV・TSV・テキスト・xlsx・PDF をここにドロップ");
    const draft = button("下書きを作成", what)!;
    expect(draft.disabled).toBe(true);
    expect(draft.className).toContain("bg-blue-600");
    expect(what.textContent).toContain("目標か資料を入れると押せます。数分かかり、費用は記録されます。");
    expect(q('[data-testid="plan-policy"]')).toBeNull();

    // 2. 行とバッチ: the empty state offers both ways to add rows
    const editor = q('[data-testid="plan-editor"]')!;
    expect(q('[data-testid="plan-rows-summary"]', editor)!.textContent).toBe("0 行");
    const empty = q('[data-testid="plan-rows-empty"]', editor)!;
    expect(empty.textContent).toContain("まだ行がありません");
    expect(qa("button", empty).map((b) => b.textContent?.trim())).toEqual(["行を追加", "CSV を読み込む"]);
    expect(q('[data-testid="plan-rows-toolbar"]')).toBeNull();
    expect(q('[data-testid="plan-save-bar"]')).toBeNull();

    // 4. 確定して開始: no estimate and the reason next to the disabled button
    expect(q('[data-testid="plan-estimate"]')!.textContent).toBe("見積もり：行がないため出せません");
    expect(button("確定して開始")!.disabled).toBe(true);
    expect(q('[data-testid="plan-confirm-blocked"]')!.textContent).toBe("行が 0 件のため、まだ確定できません");

    // the history and 「計画を削除」 come last
    const bottom = q('[data-testid="plan-bottom"]')!;
    expect(bottom.textContent).toContain("履歴");
    expect(bottom.textContent).toContain("計画を作成");
    expect(button("計画を削除", bottom)).toBeTruthy();
    expect(q('[data-testid="plan-confirm"]')!.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // a row added from the empty state is marked as added and waits to be saved
    await click(button("行を追加", empty));
    expect(q('[data-testid="plan-rows-empty"]')).toBeNull();
    expect(headings(editor)).toEqual(["バッチ 1"]);
    expect(q('[data-change="added"]', editor)!.textContent).toContain("追加した行");
    expect(q('[data-testid="plan-save-bar"]')!.textContent).toContain("保存していない変更が 1 件あります");
    expect(q('[data-testid="plan-confirm-blocked"]')!.textContent).toBe("行の変更を保存してから確定できます");
  });

  it("says when the draft is ready, and redrafts a plan with rows as a secondary action", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", two(), { draft: { kind: "draft", jobId: "j1", status: "done", requestedAt: now, requestedBy: "alice", endedAt: now } }));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-banner"]')!.textContent).toBe("下書きができました。行とバッチを確かめて「確定して開始」を押してください。確定するまでプロジェクトは 1 件も作られません。");
    const what = q('[data-testid="plan-what"]')!;
    expect(button("下書きを作り直す", what)!.className).not.toContain("bg-blue-600");
    expect(what.textContent).toContain("今の行は残します。数分かかり、費用は記録されます。");
    expect(q('[data-testid="plan-rows-summary"]')!.textContent).toBe("2 行・2 バッチ・手動の順序");
    act(() => root?.unmount());
    host?.remove();

    // rows, but no finished draft: the usual note
    api.getPlan.mockResolvedValue(detail("DRAFT", two()));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-banner"]')!.textContent).toBe("下書き: 行とバッチを整えてから確定してください。確定するまでプロジェクトは 1 件も作られません。");
  });

  it("stores the goal when the field is left, and before a draft is asked for", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [], { goal: "" }));
    await render(`/plans/${PLAN}`);
    const goal = q<HTMLTextAreaElement>('textarea[data-testid="plan-goal"]')!;
    const draft = button("Create draft", q('[data-testid="plan-what"]')!)!;
    await type(goal, "言語の BRA を一通りそろえたい");
    // typing does not store; the draft can be asked for with the goal alone
    expect(api.updatePlan).not.toHaveBeenCalled();
    expect(draft.disabled).toBe(false);
    api.getPlan.mockResolvedValue(detail("DRAFT", [], { goal: "言語の BRA を一通りそろえたい" }));
    await act(async () => goal.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(api.updatePlan).toHaveBeenCalledWith(PLAN, { goal: "言語の BRA を一通りそろえたい" });
    expect(api.getPlan).toHaveBeenCalledTimes(2);
    // leaving it again without a change stores nothing
    await act(async () => goal.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(api.updatePlan).toHaveBeenCalledTimes(1);

    // a goal typed and not stored yet is stored before the draft job is asked for
    await type(goal, "言語と読みの BRA");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await click(draft);
    expect(api.updatePlan).toHaveBeenLastCalledWith(PLAN, { goal: "言語と読みの BRA" });
    expect(api.requestDraft).toHaveBeenCalledWith(PLAN, "en");
    expect(vi.mocked(api.updatePlan).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(api.requestDraft).mock.invocationCallOrder[0]);
  });

  it("adds capability lists to the draft, shows the lines it could not read, and removes a file", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", two(), { attachments: [csvFile] }));
    api.createUpload.mockResolvedValue({ uploadId: "up_file0002", url: "https://s3.example/upload", fields: {} });
    uploadFile.mockResolvedValue(undefined);
    api.addPlanAttachments.mockResolvedValue({ plan: {}, rows: [], rejected: [{ file: "more.csv", row: 3, reason: "noRoiTlf", text: "only a note" }] });
    api.removePlanAttachment.mockResolvedValue({ plan: {}, rows: [], rejected: [] });
    await render(`/plans/${PLAN}`);
    const what = q('[data-testid="plan-what"]')!;
    expect(what.textContent).toContain("Source files (1 / 10)");
    expect(q('[data-testid="plan-attachments"]')!.textContent).toBe("language.csv");

    // a type the plan cannot read is named and not uploaded
    const input = q<HTMLInputElement>('[data-testid="plan-add-files"]')!;
    await pickFiles(input, [new File(["fake"], "notes.docx")]);
    expect(what.textContent).toContain("notes.docx: this file type cannot be attached");
    expect(api.createUpload).not.toHaveBeenCalled();
    // the same file again is left out
    await pickFiles(input, [new File(["0123456789"], "language.csv", { type: "text/csv" })]);
    expect(api.createUpload).not.toHaveBeenCalled();

    const more = new File(["ROI,TLF\nSTG,hearing\n"], "more.csv", { type: "text/csv" });
    await pickFiles(input, [more]);
    expect(api.createUpload).toHaveBeenCalledWith("more.csv", more.size);
    expect(uploadFile.mock.calls[0][1]).toBe(more);
    expect(api.addPlanAttachments).toHaveBeenCalledWith(PLAN, [{ uploadId: "up_file0002", name: "more.csv" }]);
    expect(vi.mocked(uploadFile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.addPlanAttachments).mock.invocationCallOrder[0]);
    // lines of the file that could not be read are listed as on import, and the plan is read again
    expect(q('[data-testid="plan-rejected"]')!.textContent).toContain("more.csv, row 3: neither ROI nor TLF");
    expect(api.getPlan).toHaveBeenCalledTimes(2);

    await click(q<HTMLButtonElement>('button[aria-label="Remove language.csv"]'));
    expect(api.removePlanAttachment).toHaveBeenCalledWith(PLAN, "f1");
    expect(api.getPlan).toHaveBeenCalledTimes(3);
  });

  it("saves edited rows before files are read into rows, and counts the plan's files against the limit", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...csvFile, id: `f${i + 1}`, name: `list${i + 1}.csv`, key: `attachments/files/0${i + 1}-list.csv` }));
    api.getPlan.mockResolvedValue(detail("DRAFT", two(), { attachments: nine }));
    api.createUpload.mockResolvedValue({ uploadId: "up_file0010", url: "https://s3.example/upload", fields: {} });
    uploadFile.mockResolvedValue(undefined);
    api.addPlanAttachments.mockResolvedValue({ plan: {}, rows: [], rejected: [] });
    await render(`/plans/${PLAN}`);
    await type(qa<HTMLInputElement>('input[aria-label="TLF"]')[1], "phonology");
    await pickFiles(q<HTMLInputElement>('[data-testid="plan-add-files"]')!, [new File(["a"], "a.csv"), new File(["b"], "b.csv")]);
    // nine files and two more: one fits
    expect(q('[data-testid="plan-what"]')!.textContent).toContain("Up to 10 files can be attached");
    expect(api.addPlanAttachments).toHaveBeenCalledWith(PLAN, [{ uploadId: "up_file0010", name: "a.csv" }]);
    expect(api.savePlanRows).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.savePlanRows).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.addPlanAttachments).mock.invocationCallOrder[0]);
  });

  it("shows the save bar only while there are unsaved changes, marks the changed rows and reverts them", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [...two(), row("r3", "angular gyrus", "reading", "pending", 2, { source: "manual" })]));
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    const bar = () => q('[data-testid="plan-save-bar"]', editor);
    expect(bar()).toBeNull();
    expect(button("Confirm and start")!.disabled).toBe(false);

    const tlf = qa<HTMLInputElement>('input[aria-label="TLF"]', editor)[1];
    await type(tlf, "phonology");
    expect(bar()!.textContent).toContain("Unsaved changes: 1");
    const changed = q('[data-change="changed"]', editor)!;
    expect(changed.className).toContain("bg-amber-50");
    expect(changed.textContent).toContain("Changed");
    expect(button("Confirm and start")!.disabled).toBe(true);
    // typed back as it was: nothing to save
    await type(tlf, "phonological processing");
    expect(bar()).toBeNull();
    expect(q("[data-change]", editor)).toBeNull();
    expect(button("Confirm and start")!.disabled).toBe(false);

    // a row moved down is one change; a removed row is one more
    await click(qa<HTMLButtonElement>('button[aria-label="Move down"]', editor)[0]);
    expect(bar()!.textContent).toContain("Unsaved changes: 1");
    expect(qa("[data-change]", editor)).toHaveLength(1);
    await click(qa<HTMLButtonElement>('button[aria-label="Remove row"]', editor)[2]);
    expect(bar()!.textContent).toContain("Unsaved changes: 2");

    await click(button("Revert", bar()!));
    expect(bar()).toBeNull();
    expect(qa<HTMLInputElement>('input[aria-label="TLF"]', editor).map((i) => i.value)).toEqual(["speech production", "phonological processing", "reading"]);
    expect(api.savePlanRows).not.toHaveBeenCalled();
  });

  it("splits the rows into waves of the concurrency from “More actions”", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [...two(), row("r3", "angular gyrus", "reading", "pending", 7, { source: "manual" })]));
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    const more = q<HTMLButtonElement>('button[aria-label="More actions"]', editor)!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(q('[role="menu"]')).toBeNull();
    await click(more);
    const item = q<HTMLButtonElement>('[role="menuitem"]')!;
    expect(item.textContent?.trim()).toBe("Waves of 2");
    await click(item);
    expect(q('[role="menu"]')).toBeNull();
    expect(headings(editor)).toEqual(["Wave 1", "Wave 2"]);
    expect(q('[data-testid="plan-save-bar"]')!.textContent).toContain("Unsaved changes: 2");
  });

  it("leads with the autonomous run and its cost limit, with handling the plan yourself as a secondary checkbox", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", two()));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    const card = q('[data-testid="plan-autonomous-setting"]')!;
    // the first thing of 「3. 進め方」
    expect(q('[data-testid="plan-settings"] h2')!.nextElementSibling).toBe(card);
    expect(card.className).not.toContain("violet");
    // the title is 自律実行; it is off, and the checkbox under it says the owner handles the plan
    expect(q("h3", card)!.textContent).toMatch(/^ 自律実行/);
    // what it does is behind the (?) next to the title, not a paragraph
    expect(q("h3 [data-helptip]", card)).not.toBeNull();
    expect(card.textContent).toContain("オフ: PR の承認や衝突、質問にはご自身で対応します。");
    const sw = q<HTMLInputElement>('[data-testid="plan-manual-switch"]', card)!;
    expect(sw.closest("label")!.textContent).toContain("PR の承認や衝突にご自身で対応する");
    expect(sw.checked).toBe(true);
    expect(q('input[type="number"]', card)).toBeNull();
    await click(sw);
    expect(api.updatePlan).toHaveBeenCalledWith(PLAN, { settings: { autonomous: { maxCostUsd: 20 } } });
    act(() => root?.unmount());
    host?.remove();

    // on, after the draft: it is not confirmed on its own, and 「確定して開始」 hands over to the Orchestrator
    api.getPlan.mockResolvedValue(
      detail("DRAFT", two(), { settings: { model: null, modelChosen: false, reasoningEffort: null, researchMode: true, locale: "ja", autonomous: { maxCostUsd: 20 } }, draft: { kind: "draft", jobId: "j1", status: "done", requestedAt: now, requestedBy: "alice", endedAt: now } }),
    );
    await render(`/plans/${PLAN}`);
    const on = q('[data-testid="plan-autonomous-setting"]')!;
    expect(on.className).toContain("bg-violet-50");
    expect(q<HTMLInputElement>('[data-testid="plan-manual-switch"]', on)!.checked).toBe(false);
    expect(on.textContent).toContain("オーケストレーターが人の代わりになって、最後まで進めます。");
    expect(qa("p", on).some((p) => p.textContent?.includes("オーケストレーターが人の代わりになって"))).toBe(false);
    // the cost limit comes before the secondary checkbox
    expect(q('input[type="number"]', on)!.compareDocumentPosition(q('[data-testid="plan-manual-switch"]', on)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(on.textContent).toContain("1〜1000。達すると新しい行を始めず、動いている行が終わったら一時停止します。");
    expect(q('[data-testid="plan-auto-after-draft"]')!.textContent).toBe("下書きができたあとで自律実行に切り替えたため、下書きは自動では確定しません。「確定して開始」を押すと、そこから自律実行で進みます。");
    expect(q('[data-testid="plan-confirm"]')!.textContent).toContain("確定すると、ここから先はオーケストレーターが人の代わりに進めます。");
    expect(q('[data-testid="plan-autonomous-badge"]')!.textContent).toContain("自律実行");
    const cost = q<HTMLInputElement>('input[type="number"]', on)!;
    await type(cost, "35");
    await act(async () => cost.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(api.updatePlan).toHaveBeenLastCalledWith(PLAN, { settings: { autonomous: { maxCostUsd: 35 } } });
  });

  it("keeps the autonomous banners first and drops the note when the draft confirms itself", async () => {
    const settings = { model: null, modelChosen: false, reasoningEffort: null, researchMode: true, locale: "en" as const, autonomous: { maxCostUsd: 20 } };
    const done = { kind: "draft" as const, jobId: "j1", status: "done" as const, requestedAt: now, requestedBy: "alice", endedAt: now, autoConfirm: true };
    api.getPlan.mockResolvedValue(detail("DRAFT", two(), { settings, draft: done }));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-banner"]')!.textContent).toBe("The draft is ready. The plan is confirmed and started on its own within a minute.");
    expect(q('[data-testid="plan-auto-after-draft"]')).toBeNull();
    act(() => root?.unmount());
    host?.remove();

    api.getPlan.mockResolvedValue(detail("DRAFT", two(), { settings, draft: done, autonomousError: "no rows" }));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-banner"]')!.textContent).toBe("The autonomous run could not confirm the draft: no rows. Check it and press “Confirm and start”.");
  });

  it("chooses the research mode with a switch and its description", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", two()));
    await render(`/plans/${PLAN}`);
    const sw = qa<HTMLInputElement>('[data-testid="plan-settings"] input[role="switch"]').at(-1)!;
    expect(sw.checked).toBe(true);
    expect(document.getElementById(sw.getAttribute("aria-describedby")!)!.textContent).toBe("Researches the literature in depth before the HCD. Off is faster and cheaper, but the research is shallower.");
    await click(sw);
    expect(api.updatePlan).toHaveBeenCalledWith(PLAN, { settings: { researchMode: false } });
  });
});

describe("re-planning while running", () => {
  const rows = [
    row("r1", "left IFG", "speech production", "done", 1, { seed: true, projectId: "p0000001", anchors: ["BNA:29-30"], anchorsSource: "used", project: { name: "Speech", status: "COMPLETED", pendingQuestion: null, costUsd: 0.18, revision: 1, errorMessage: null, deleted: false } }),
    row("r2", "STG", "phonological processing", "done", 2, { seed: true, projectId: "p0000002" }),
    row("r3", "left IFG", "syntactic processing", "running", 4, { projectId: "p0000003" }),
    row("r4", "angular gyrus", "reading", "pending", 4),
    row("r5", "Exner's area", "writing", "pending", 5),
  ];
  const proposal = (proposalId: string, kind: PlanProposalRecord["kind"], extra: Partial<PlanProposalRecord>): PlanProposalRecord => ({
    planId: PLAN,
    sk: `PROP#${proposalId}`,
    proposalId,
    kind,
    reason: "",
    status: "open",
    jobId: "j9",
    wave: 2,
    createdAt: now,
    ...extra,
  });
  const proposals = [
    proposal("q0000001", "add", { row: { roi: "arcuate fasciculus", tlf: "repetition", rationale: "Links the seeds.", anchors: ["BNA:29-30", "BNA:79-80"], dependsOn: ["r1", "r2"] }, reason: "Both seeds use the dorsal stream." }),
    proposal("q0000002", "remove", { rowId: "r5", reason: "speech production already covers it." }),
    proposal("q0000003", "policy", { policy: "neocortex = area × layer", reason: "The finished rows split by layer." }),
    proposal("q0000004", "add", { status: "accepted", decidedAt: now, decidedBy: "alice", row: { roi: "SMA", tlf: "speech initiation", rationale: "", anchors: [], dependsOn: [] } }),
    proposal("q0000005", "policy", { status: "accepted", decidedAt: now, decidedBy: "runner", policy: "neocortex = area" }),
  ];
  const running = () =>
    detail(
      "RUNNING",
      rows,
      { ordering: "auto", activeWave: 4, policy: "neocortex = area", replan: { kind: "replan", jobId: "j9", status: "done", requestedAt: now, requestedBy: "runner", wave: 2 } },
      { proposals, planJobsCostUsd: 0.05 },
    );

  it("lists open proposals with what they change, accepts and rejects them", async () => {
    api.getPlan.mockResolvedValue(running());
    await render(`/plans/${PLAN}`);
    const section = q('[data-testid="plan-proposals"]')!;
    expect(section.textContent).toContain("Proposals (3)");
    expect(section.textContent).toContain("Re-plan after wave 2: done");
    const items = qa('[data-testid="plan-proposal"]', section);
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("Add a row");
    expect(items[0].textContent).toContain("repetition · arcuate fasciculus");
    expect(items[0].textContent).toContain("Links the seeds.");
    expect(items[0].textContent).toContain("Depends on: speech production, phonological processing");
    expect(items[0].textContent).toContain("Why: Both seeds use the dorsal stream.");
    expect(items[0].textContent).toContain("after wave 2");
    expect(items[1].textContent).toContain("Remove a row");
    expect(items[1].textContent).toContain("writing · Exner's area");
    expect(items[2].textContent).toContain("Change the granularity policy");
    expect(items[2].textContent).toContain("neocortex = area × layer");

    await click(button("Accept", items[0]));
    expect(api.proposalAction).toHaveBeenCalledWith(PLAN, "q0000001", "accept");
    await click(button("Reject", items[1]));
    expect(api.proposalAction).toHaveBeenCalledWith(PLAN, "q0000002", "reject");

    // decided proposals are collapsed under the history; the actions of a running plan are unchanged
    const decided = q('[data-testid="plan-decided"]')!;
    expect(decided.tagName).toBe("DETAILS");
    expect(decided.textContent).toContain("Decided proposals (2)");
    expect(decided.textContent).toContain("Accepted");
    // a policy is the Orchestrator's decision: applied without the owner
    expect(decided.textContent).toContain("Applied by the Orchestrator");
    expect(qa("button", q('[data-testid="plan-actions"]')!).map((b) => b.textContent?.trim())).toEqual(["Pause", "Cancel plan"]);
    // the policy is read-only after confirmation; the cost of the plan's own jobs is shown apart
    expect(q('[data-testid="plan-policy"] textarea')).toBeNull();
    expect(q('[data-testid="plan-policy"]')!.textContent).toContain("neocortex = area");
    expect(q('[data-testid="plan-jobs-cost"]')!.textContent).toBe("incl. planning jobs $0.05");
  });

  it("shows only a quiet line for the re-plan job when nothing is proposed", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", rows, { ordering: "auto", activeWave: 4, replan: { kind: "replan", jobId: null, status: "waiting", requestedAt: now, requestedBy: "runner", wave: 2 } }));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-proposals"]')).toBeNull();
    expect(q('[data-testid="plan-replan"]')!.textContent).toBe("Re-plan after wave 2: waiting for a free job slot");
  });

  it("heads the waves with their stored numbers and labels the seed waves", async () => {
    api.getPlan.mockResolvedValue(running());
    await render(`/plans/${PLAN}`);
    const view = q('[data-testid="plan-rows"]')!;
    expect(headings(view)).toEqual(["Wave 1Baseline project", "Wave 2Baseline project", "Wave 4current", "Wave 5"]);
    // four waves numbered 1, 2, 4, 5: the active one keeps its number, without claiming a fifth wave
    expect(q('[data-testid="plan-summary"]')!.textContent).toContain("Wave 4 (3 of 4)");
  });

  it("says “wave n of total” when the waves are numbered without gaps", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", rows.map((r) => ({ ...r, wave: Math.min(r.wave, 3) })), { ordering: "auto", activeWave: 3 }));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-summary"]')!.textContent).toContain("Wave 3 of 3");
  });

  it("explains when proposals come and that the order is updated after every wave", async () => {
    api.getPlan.mockResolvedValue(running());
    await render(`/plans/${PLAN}`);
    const text = q('[data-testid="plan-proposals"]')!.textContent!;
    expect(text).toContain("After the first wave, and then each time about a tenth of the plan's rows have finished (after every wave in plans of up to 10 rows)");
    expect(text).toContain("a planning job may propose adding or removing rows; nothing changes until you accept. The Orchestrator may also change the granularity policy, which applies at once.");
    expect(text).toContain("The order of the rows that have not started is updated after every wave.");
  });

  it("keeps Accept and Reject busy until the plan has been read again", async () => {
    api.getPlan.mockResolvedValue(running());
    await render(`/plans/${PLAN}`);
    let reloaded!: (d: PlanDetailResponse) => void;
    api.getPlan.mockImplementationOnce(() => new Promise<PlanDetailResponse>((res) => (reloaded = res)));
    const first = qa('[data-testid="plan-proposal"]')[0];
    await click(button("Accept", first));
    expect(api.proposalAction).toHaveBeenCalledWith(PLAN, "q0000001", "accept");
    expect(api.getPlan).toHaveBeenCalledTimes(2);
    // the POST is done but the reload is not: the proposal is still listed, and nothing can be decided twice
    expect(qa('[data-testid="plan-proposal"]')).toHaveLength(3);
    for (const b of qa<HTMLButtonElement>('[data-testid="plan-proposal"] button')) expect(b.disabled).toBe(true);
    await click(button("Reject", qa('[data-testid="plan-proposal"]')[1]));
    expect(api.proposalAction).toHaveBeenCalledTimes(1);

    const after = running();
    after.proposals = after.proposals.map((p) => (p.proposalId === "q0000001" ? { ...p, status: "accepted" as const, decidedAt: now, decidedBy: "alice" } : p));
    await act(async () => reloaded(after));
    expect(qa('[data-testid="plan-proposal"]')).toHaveLength(2);
    for (const b of qa<HTMLButtonElement>('[data-testid="plan-proposal"] button')) expect(b.disabled).toBe(false);
  });

  it("gives the reason a re-plan could not be started in the language of the screen", async () => {
    api.getPlan.mockResolvedValue(
      detail("RUNNING", rows, { ordering: "auto", activeWave: 4, replan: { kind: "replan", jobId: null, status: "failed", requestedAt: now, requestedBy: "runner", wave: 2, error: "The model chosen for this plan is not available to the owner.", errorCode: "model_not_allowed" } }),
    );
    localStorage.setItem("cobrac-locale", "de");
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="plan-replan"]')!.textContent).toBe(
      "Neuplanung nach Welle 2: fehlgeschlagen (Das für diesen Plan gewählte Modell steht Ihnen nicht mehr zur Verfügung. Wenden Sie sich an eine Admin-Person.)",
    );
  });
});

describe("seed waves next to rows of an existing project", () => {
  // an existing project's row keeps its wave (1 by default), next to the first seed; it is not built
  const rows = (state: PlanRowState) => [
    row("r1", "left IFG", "speech production", state, 1, { seed: true }),
    row("r2", "angular gyrus", "reading", "done", 1, { source: "csv", existing: { projectId: "p0000009", name: "Reading" }, projectId: "p0000009", project: { name: "Reading", status: "COMPLETED", pendingQuestion: null, costUsd: 0.27, revision: 1, errorMessage: null, deleted: false } }),
    row("r3", "STG", "phonological processing", "pending", 2),
  ];

  it("still labels the wave 「基準プロジェクト」 in the draft editor and in the running view", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", rows("pending").map((r) => (r.rowId === "r2" ? { ...r, state: "pending" as const, projectId: null, project: null } : r)), { ordering: "auto" }));
    await render(`/plans/${PLAN}`);
    expect(headings(q('[data-testid="plan-editor"]')!)).toEqual(["Wave 1Baseline project", "Wave 2"]);
    // with 「作り直す」 the row is built, so the wave is no longer a seed wave
    await openDetails(q('[data-testid="plan-editor"]')!);
    await click(qa<HTMLInputElement>('input[type="checkbox"]', q('[data-testid="plan-editor"]')!)[0]);
    expect(headings(q('[data-testid="plan-editor"]')!)).toEqual(["Wave 1", "Wave 2"]);
  });

  it("labels the seed waves when the rows of existing projects are listed in the last wave", async () => {
    const last = [
      row("r1", "left IFG", "speech production", "pending", 1, { seed: true }),
      row("r2", "STG", "phonological processing", "pending", 2, { seed: true }),
      row("r3", "arcuate fasciculus", "repetition", "pending", 3),
      row("r4", "angular gyrus", "reading", "pending", 3, { source: "csv", existing: { projectId: "p0000009", name: "Reading" } }),
    ];
    api.getPlan.mockResolvedValue(detail("DRAFT", last, { ordering: "auto" }));
    await render(`/plans/${PLAN}`);
    expect(headings(q('[data-testid="plan-editor"]')!)).toEqual(["Wave 1Baseline project", "Wave 2Baseline project", "Wave 3"]);
    act(() => root?.unmount());
    host?.remove();
    // only seeds are built: the last wave is the last seed's, next to the existing project's row
    api.getPlan.mockResolvedValue(detail("DRAFT", [last[0], { ...last[3], wave: 1 }], { ordering: "auto" }));
    await render(`/plans/${PLAN}`);
    expect(headings(q('[data-testid="plan-editor"]')!)).toEqual(["Wave 1Baseline project"]);
  });

  it("leaves the existing project's cost out of the row in the running view", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", rows("running"), { ordering: "auto" }));
    await render(`/plans/${PLAN}`);
    const view = q('[data-testid="plan-rows"]')!;
    expect(headings(view)).toEqual(["Wave 1Baseline projectcurrent", "Wave 2"]);
    expect(view.textContent).not.toContain("$0.27");
  });
});

describe("wave headings of a draft edited by hand", () => {
  it("show the stored wave numbers, not their position", async () => {
    api.getPlan.mockResolvedValue(detail("DRAFT", [row("r1", "STG", "hearing", "pending", 3, { source: "manual" }), row("r2", "MTG", "word meaning", "pending", 3, { source: "manual" }), row("r3", "IFG", "naming", "pending", 7, { source: "manual" })]));
    await render(`/plans/${PLAN}`);
    const editor = q('[data-testid="plan-editor"]')!;
    expect(headings(editor)).toEqual(["Wave 3", "Wave 7"]);
    // changing a row's wave (in its details) moves the heading but keeps the row's inputs
    await openDetails(editor);
    const tlf = qa<HTMLInputElement>('input[aria-label="TLF"]', editor)[1];
    await type(qa<HTMLInputElement>('input[aria-label="Wave"]', editor)[1], "5");
    expect(headings(editor)).toEqual(["Wave 3", "Wave 5", "Wave 7"]);
    expect(qa<HTMLInputElement>('input[aria-label="TLF"]', editor)[1]).toBe(tlf);
  });
});

describe("helpers", () => {
  it("groups runs of waves, finds seed waves, clips anchors and formats elapsed time", () => {
    expect(waveRuns([{ wave: 1 }, { wave: 1 }, { wave: 2 }, { wave: 1 }]).map((r) => [r.wave, r.items.map((x) => x.index)])).toEqual([
      [1, [0, 1]],
      [2, [2]],
      [1, [3]],
    ]);
    // a seed is built one at a time only while it is the only built row of its wave
    expect(isSeedWave([{ seed: true }])).toBe(true);
    expect(isSeedWave([{ seed: true }, { seed: true }])).toBe(false);
    expect(isSeedWave([{ seed: true }, {}])).toBe(false);
    expect(isSeedWave([])).toBe(false);
    expect(isSeedWave([{ seed: true }, { existing: { projectId: "p0000009", name: "Reading" } }, { state: "skipped" }])).toBe(true);
    expect(isSeedWave([{ existing: { projectId: "p0000009", name: "Reading" } }])).toBe(false);
    expect([...seedIndexes([{ wave: 1, seed: true }, { wave: 2, seed: true }, { wave: 2 }, { wave: 3, seed: true }, { wave: 3, existing: { projectId: "p0000009", name: "Reading" } }, { wave: 4, seed: true, state: "skipped" }])]).toEqual([0, 3]);
    const tw = (k: string, v?: Record<string, string | number>) => `${k}:${JSON.stringify(v)}`;
    expect(wavesText([1, 2, 3], null, tw as never)).toBe('plan.waveCount:{"n":3}');
    expect(wavesText([1, 2, 3], 2, tw as never)).toBe('plan.waveOf:{"n":2,"total":3}');
    expect(wavesText([1, 3, 5], 3, tw as never)).toBe('plan.waveOfGapped:{"n":3,"i":2,"count":3}');
    expect(wavesText([], 1, tw as never)).toBe('plan.waveOf:{"n":1,"total":1}');
    expect(shownAnchors(["a", "b", "c", "d", "e", "f"])).toEqual({ shown: ["a", "b", "c", "d"], more: 2 });
    expect(shownAnchors(undefined)).toEqual({ shown: [], more: 0 });
    const t = (k: string, v?: Record<string, string | number>) => `${k}:${JSON.stringify(v)}`;
    const at = Date.parse(now);
    expect(fmtElapsed(now, at + 12_000, t as never)).toBe('plan.seconds:{"s":12}');
    expect(fmtElapsed(now, at + 5 * 60_000, t as never)).toBe('plan.minutes:{"m":5}');
    expect(fmtElapsed(null, at, t as never)).toBe("—");
  });
});
