// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDetailResponse, PlanEventRecord, PlanProposalRecord, PlanRecord, PlanRowState, PlanRowView, PlanSummary } from "@cobrac/shared";
import { countRows, estimatePlan, planEstimate } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getPlan: vi.fn(),
  listPlans: vi.fn(),
  planRowAction: vi.fn(),
  resolvePlanRow: vi.fn(),
  answer: vi.fn(),
  models: vi.fn(),
  listCanons: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, uploadFile: vi.fn(), ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { PlanDetailPage } = await import("../src/pages/PlanDetailPage");
const { PlansPage, turnItems } = await import("../src/pages/PlansPage");
const { AUTONOMOUS_CATALOG } = await import("../src/i18n/autonomous");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-06T00:00:00.000Z";
const PLAN = "n4h8w2rk";
const CANON = "u7m2q9xa-c1";
const AUTO = { model: "test-model", modelChosen: false, reasoningEffort: null, researchMode: true, locale: "en" as const, autonomous: { maxCostUsd: 20 } };
const project = (status: NonNullable<PlanRowView["project"]>["status"], extra: Partial<NonNullable<PlanRowView["project"]>> = {}) => ({ name: "P", status, pendingQuestion: null, costUsd: 0.1, revision: 1, errorMessage: null, deleted: false, ...extra });

function row(rowId: string, tlf: string, state: PlanRowState, extra: Partial<PlanRowView> = {}): PlanRowView {
  return { planId: PLAN, sk: `ROW#${rowId}`, rowId, order: Number(rowId.slice(1)), wave: 1, roi: "left IFG", tlf, rationale: "", source: "llm", state, attempts: 0, createdAt: now, updatedAt: now, projectId: null, project: null, ...extra };
}
function detail(status: PlanRecord["status"], rows: PlanRowView[], extra: Partial<PlanRecord> = {}, more: Partial<PlanDetailResponse> = {}): PlanDetailResponse {
  const plan: PlanRecord = { planId: PLAN, sk: "META", ownerUserId: "alice", name: "Language", goal: "", status, settings: AUTO, rowCount: rows.length, rowCounts: countRows(rows), activeWave: 1, confirmedAt: now, createdAt: now, updatedAt: now, ...extra };
  return { plan, rows, events: [], limits: { maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 2, effective: 2 }, estimate: planEstimate(rows, 2), actual: { minutes: 30, costUsd: 0.4 }, proposals: [], planJobsCostUsd: null, ...more };
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
/** The row of the running view that shows `tlf`. */
const rowEl = (tlf: string) => qa("li[data-state]", q('[data-testid="plan-rows"]')!).find((li) => li.textContent?.includes(tlf))!;

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  api.models.mockResolvedValue({ models: ["test-model"], efforts: [], envDefaultModel: "test-model", keySource: "own", orgTier: null, restricted: false, pricedModels: [] });
  api.listCanons.mockResolvedValue({ items: [], shared: [] });
  for (const fn of [api.planRowAction, api.resolvePlanRow, api.answer]) fn.mockResolvedValue({ ok: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("rows of an autonomous plan", () => {
  const rows = [
    row("r1", "writing an answer", "question", { projectId: "p0000001", project: project("WAITING_USER_INPUT", { pendingQuestion: "Left or both?" }), rowJob: { kind: "answer", jobId: "j1", status: "queued", requestedAt: now } }),
    row("r2", "answer ready", "question", { projectId: "p0000002", project: project("WAITING_USER_INPUT", { pendingQuestion: "Which atlas?" }), rowJob: { kind: "answer", jobId: "j2", status: "ready", requestedAt: now } }),
    row("r3", "being decided", "attention", { projectId: "p0000003", attentionReason: "failed", attempts: 2, rowJob: { kind: "resolve", jobId: "j3", status: "queued", requestedAt: now } }),
    row("r4", "retried", "running", { projectId: "p0000004", autoAnswers: 4, aiResolution: { action: "retry", reason: "The failure was a timeout.", at: now, jobId: "j4" } }),
    row("r5", "left out by the AI", "skipped", { autoSkip: { reason: "ai_skipped", at: now, error: "Another row covers it." }, aiResolution: { action: "skip", reason: "Another row covers it.", at: now, jobId: "j5" } }),
    row("r6", "left out in v0.40.0", "skipped", { autoSkip: { reason: "question_limit", at: now } }),
    row("r7", "decide failed in v0.40.0", "skipped", { autoSkip: { reason: "decide_failed", at: now } }),
  ];

  it("shows what the Orchestrator's AI does for each row and what it decided", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", rows));
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="row-ai-job"]', rowEl("writing an answer"))!.textContent).toBe("The Orchestrator's AI is writing an answer");
    expect(q('[data-testid="row-ai-job"]', rowEl("answer ready"))!.textContent).toBe("Waiting for its turn to give the answer");
    expect(q('[data-testid="row-ai-job"]', rowEl("being decided"))!.textContent).toBe("The Orchestrator's AI is deciding");
    expect(q('[data-testid="row-ai-resolution"]', rowEl("retried"))!.textContent).toBe("The Orchestrator's AI decided: Retry — The failure was a timeout.");
    // the number of answers, without a limit
    expect(q('[data-testid="row-ai-answers"]', rowEl("retried"))!.textContent).toBe("AI answers: 4");
    expect(rowEl("retried").textContent).not.toContain("/");
    expect(q('[data-testid="row-auto-skip"]', rowEl("left out by the AI"))!.textContent).toBe("The Orchestrator's AI left it out: Another row covers it.");
    // the reasons of v0.40.0 keep their texts
    expect(q('[data-testid="row-auto-skip"]', rowEl("left out in v0.40.0"))!.textContent).toBe("Left out by the autonomous run: The agent kept asking after 3 automatic answers.");
    expect(q('[data-testid="row-auto-skip"]', rowEl("decide failed in v0.40.0"))!.textContent).toBe("Left out by the autonomous run: The AI reviewer could not decide (3 jobs failed); the pull request stays open.");
    expect(qa('[data-testid="row-ai-job"]', rowEl("retried"))).toHaveLength(0);
  });

  it("says it in Japanese as written", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", rows));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    expect(q('[data-testid="row-ai-job"]', rowEl("writing an answer"))!.textContent).toBe("オーケストレーター（AI）が回答を作っています");
    expect(q('[data-testid="row-ai-job"]', rowEl("answer ready"))!.textContent).toBe("回答を渡す順番を待っています");
    expect(q('[data-testid="row-ai-job"]', rowEl("being decided"))!.textContent).toBe("オーケストレーター（AI）が判断しています");
    expect(q('[data-testid="row-ai-resolution"]', rowEl("retried"))!.textContent).toBe("オーケストレーター（AI）の判断: リトライ — The failure was a timeout.");
    expect(q('[data-testid="row-ai-resolution"]', rowEl("left out by the AI"))!.textContent).toContain("オーケストレーター（AI）の判断: スキップ");
    expect(q('[data-testid="row-ai-answers"]', rowEl("retried"))!.textContent).toBe("AI の回答 4 回");
    expect(q('[data-testid="row-auto-skip"]', rowEl("left out by the AI"))!.textContent).toBe("オーケストレーター（AI）が見送りました: Another row covers it.");
  });

  it("names every action the AI may choose as the owner's buttons do", async () => {
    const decided = (["retry", "skip", "done", "push"] as const).map((action, i) => row(`r${i + 1}`, `row ${action}`, "running", { aiResolution: { action, reason: "", at: now, jobId: `j${i}` } }));
    api.getPlan.mockResolvedValue(detail("RUNNING", decided));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    expect(qa('[data-testid="row-ai-resolution"]').map((e) => e.textContent)).toEqual(["リトライ", "スキップ", "完了にする", "もう一度 push"].map((a) => `オーケストレーター（AI）の判断: ${a}`));
  });

  it("keeps the owner's buttons on rows the Orchestrator is answering or deciding", async () => {
    const decision = row("r8", "conflicting", "decision", { prNo: 7, decisionReason: "conflicts", projectId: "p0000008", project: project("COMPLETED"), rowJob: { kind: "resolve", jobId: "j8", status: "queued", requestedAt: now } });
    api.getPlan.mockResolvedValue(detail("RUNNING", [...rows, decision], { canonId: CANON }, { canon: { canonId: CANON, name: "Language", headRevision: 3 } }));
    await render(`/plans/${PLAN}`);
    const inbox = q('[data-testid="plan-inbox"]')!;
    expect(inbox.textContent).toContain("The Orchestrator's AI is writing an answer");
    expect(inbox.textContent).toContain("Waiting for its turn to give the answer");
    expect(qa("textarea", inbox)).toHaveLength(2);

    const attention = q('[data-testid="plan-attention"]')!;
    expect(attention.textContent).toContain("The Orchestrator's AI is deciding");
    await act(async () => button("Retry", attention)!.click());
    expect(api.planRowAction).toHaveBeenCalledWith(PLAN, "r3", "retry");

    const d = q('[data-testid="plan-decision"]')!;
    expect(d.textContent).toContain("The Orchestrator's AI is deciding");
    await act(async () => button("Mark done", d)!.click());
    expect(api.resolvePlanRow).toHaveBeenCalledWith(PLAN, "r8", "done");
  });
});

describe("the history of an autonomous plan", () => {
  const ev = (n: number, type: PlanEventRecord["type"], detail: PlanEventRecord["detail"], extra: Partial<PlanEventRecord> = {}): PlanEventRecord => ({ planId: PLAN, sk: `EVT#${n}`, at: now, type, by: "runner", rowId: "r1", detail, ...extra });
  const proposal = (proposalId: string, kind: PlanProposalRecord["kind"], extra: Partial<PlanProposalRecord>): PlanProposalRecord => ({ planId: PLAN, sk: `PROP#${proposalId}`, proposalId, kind, reason: "", status: "accepted", jobId: "j9", wave: 1, createdAt: now, decidedAt: now, decidedBy: "runner", ...extra });

  it("says what the Orchestrator's AI answered and decided, and which proposals it applied", async () => {
    const answer = `Use both hemispheres. ${"x".repeat(200)}`;
    const d = detail("RUNNING", [row("r1", "speech production", "running")], {}, {
      events: [
        ev(1, "row_auto_answered", { n: 1, jobId: "j1", answer, reason: "The goal names both." }),
        ev(2, "row_ai_resolved", { action: "push", from: "decision", cause: "push_failed", reason: "The push failed once; the project is complete.", jobId: "j2" }),
        ev(3, "proposal_accepted", { kind: "add" }, { rowId: undefined }),
        ev(4, "proposal_accepted", { kind: "remove" }, { rowId: undefined, by: "alice" }),
        ev(5, "row_auto_skipped", { reason: "ai_skipped", error: "Another row covers it." }),
      ],
      proposals: [proposal("q0000001", "add", { row: { roi: "SMA", tlf: "speech initiation", rationale: "", anchors: [], dependsOn: [] } }), proposal("q0000002", "remove", { rowId: "r1", decidedBy: "alice" })],
    });
    api.getPlan.mockResolvedValue(d);
    await render(`/plans/${PLAN}`);
    const items = qa('[data-testid="plan-history"] li');
    const of = (type: string) => items.filter((li) => li.dataset.type === type);
    const answered = of("row_auto_answered")[0];
    expect(answered.textContent).toContain("The Orchestrator's AI answered a question");
    // the start of the answer, the whole of it in the title
    const said = q('[data-testid="plan-event-said"]', answered)!;
    expect(said.textContent).toBe(`${answer.slice(0, 140)}…`);
    expect(said.getAttribute("title")).toBe(answer);
    const resolved = of("row_ai_resolved")[0];
    expect(resolved.textContent).toContain("The Orchestrator's AI decided on the row (Push again)");
    expect(q('[data-testid="plan-event-said"]', resolved)!.textContent).toBe("The push failed once; the project is complete.");
    const [applied, accepted] = of("proposal_accepted");
    expect(applied.textContent).toContain("Applied by the Orchestrator");
    expect(accepted.textContent).not.toContain("Applied by the Orchestrator");
    expect(of("row_auto_skipped")[0].textContent).toContain("Another row covers it.");

    // proposals the Orchestrator applied, of any kind, are labelled so
    const decided = q('[data-testid="plan-decided"]')!;
    const [add, remove] = qa("li", decided);
    expect(add.textContent).toContain("Applied by the Orchestrator");
    expect(remove.textContent).not.toContain("Applied by the Orchestrator");
    expect(remove.textContent).toContain("Accepted");
  });

  it("names the AI's decision in Japanese as written", async () => {
    api.getPlan.mockResolvedValue(detail("RUNNING", [row("r1", "speech production", "running")], {}, { events: [ev(1, "row_auto_answered", { n: 1, jobId: "j1", answer: "両側", reason: "" }), ev(2, "row_ai_resolved", { action: "retry", from: "attention", cause: "failed", reason: "", jobId: "j2" })] }));
    localStorage.setItem("cobrac-locale", "ja");
    await render(`/plans/${PLAN}`);
    const text = q('[data-testid="plan-history"]')!.textContent!;
    expect(text).toContain("オーケストレーター（AI）が質問に回答");
    expect(text).toContain("オーケストレーター（AI）が行を判断（リトライ）");
  });
});

describe("the texts of the autonomous run", () => {
  it("says that the Orchestrator acts for the owner", () => {
    expect(AUTONOMOUS_CATALOG.ja["auto.help"]).toBe(
      "オーケストレーターが人の代わりになって、最後まで進めます。下書きを確定し、エージェントの質問に答え、計画の PR を承認・変更依頼・却下し、要対応・人の判断の行を決め、再計画の提案を反映します。費用の上限に達すると新しい行を始めません。",
    );
    expect(AUTONOMOUS_CATALOG.en["auto.help"]).toBe(
      "The Orchestrator acts for you and runs the plan to the end: it confirms the draft, answers the agents' questions, approves, requests changes on or rejects the plan's pull requests, decides on rows that need attention or a decision, and applies re-plan proposals. No new row starts once the cost limit is spent.",
    );
    expect(AUTONOMOUS_CATALOG.ja["sys.autoAnswered"]).toBe("オーケストレーター（AI）がエージェントの質問に回答しました。");
    expect(AUTONOMOUS_CATALOG.en["sys.autoAnswered"]).toBe("The Orchestrator's AI answered the agent's question.");
    for (const catalog of Object.values(AUTONOMOUS_CATALOG)) {
      expect(catalog).not.toHaveProperty(["sys.autonomousStopped"]);
      expect(catalog).not.toHaveProperty(["auto.answers"]);
      expect(catalog).toHaveProperty(["auto.aiAnswers"]);
    }
  });
});

describe("「あなたの番」 with autonomous plans", () => {
  const asking = { rowId: "r2", roi: "STG", tlf: "phonology", wave: 1, state: "question" as const, projectId: "p0000002", project: project("WAITING_USER_INPUT", { pendingQuestion: "Left or both?" }) };
  const failed = { rowId: "r3", roi: "IFG", tlf: "speech", wave: 1, state: "attention" as const, projectId: "p0000003", attentionReason: "failed" as const };
  const summary = (planId: string, status: PlanRecord["status"], extra: Partial<PlanSummary> = {}): PlanSummary => ({
    ...detail(status, []).plan,
    planId,
    name: `Plan ${planId}`,
    rowCount: 2,
    rowCounts: countRows([]),
    pulse: {
      waves: [{ wave: 1, counts: { question: 1, attention: 1 } }],
      running: [],
      waiting: [asking, failed],
      events: [],
      openProposals: 2,
      estimate: estimatePlan({ seedRows: 0, bodyWaveSizes: [2], concurrency: 2 }),
      actual: { minutes: 10, costUsd: 0.2 },
    },
    ...extra,
  });
  const draftDone = (autoConfirm: boolean) => ({ kind: "draft" as const, jobId: "j1", status: "done" as const, requestedAt: now, requestedBy: "alice", endedAt: now, autoConfirm });
  const manual = { ...AUTO, autonomous: null };

  it("leaves the rows of a running autonomous plan to the Orchestrator, and keeps the plan the owner's when it stops", () => {
    const kinds = (items: PlanSummary[]) => turnItems(items).map((it) => `${it.plan.planId}:${it.kind}`);
    // a running autonomous plan: its questions, rows to look at and proposals are the Orchestrator's
    expect(kinds([summary("n0000001", "RUNNING")])).toEqual([]);
    // the same plan run by hand waits on its owner
    expect(kinds([summary("n0000002", "RUNNING", { settings: manual })])).toEqual(["n0000002:attention", "n0000002:question", "n0000002:proposals"]);
    // paused: the plan is the owner's again
    expect(kinds([summary("n0000003", "PAUSED", { pausedReason: "cost_limit" })])).toContain("n0000003:paused");
    // a draft the autonomous run confirms on its own is not, unless it could not confirm it or was switched on after the draft
    expect(kinds([summary("n0000004", "DRAFT", { pulse: null, draft: draftDone(true) })])).toEqual([]);
    expect(kinds([summary("n0000005", "DRAFT", { pulse: null, draft: draftDone(true), autonomousError: "no rows" })])).toEqual(["n0000005:draftReady"]);
    expect(kinds([summary("n0000006", "DRAFT", { pulse: null, draft: draftDone(false) })])).toEqual(["n0000006:draftReady"]);
  });

  it("shows only what waits on the owner in the list", async () => {
    api.listPlans.mockResolvedValue({ items: [summary("n0000001", "RUNNING"), summary("n0000005", "DRAFT", { pulse: null, draft: draftDone(true), autonomousError: "no rows" })] });
    await render("/plans");
    const turn = q('[data-testid="plan-turn"]')!;
    expect(turn.textContent).not.toContain("Answer a question");
    expect(turn.textContent).not.toContain("Left or both?");
    expect(turn.textContent).toContain("Check the draft and confirm");
    expect(turn.textContent).toContain("The autonomous run could not confirm the draft: no rows.");
    expect(qa("li", turn)).toHaveLength(1);
  });

  it("names the AI's decision in the recent activity of a lane", async () => {
    api.listPlans.mockResolvedValue({
      items: [
        summary("n0000001", "RUNNING", {
          pulse: { ...summary("n0000001", "RUNNING").pulse!, waiting: [], openProposals: 0, events: [{ sk: "EVT#1", type: "row_ai_resolved", at: now, detail: { action: "skip" }, row: { roi: "IFG", tlf: "speech" } }, { sk: "EVT#2", type: "cost_limit_reached", at: now, detail: { spentUsd: 20.4, maxCostUsd: 20 } }] },
        }),
      ],
    });
    await render("/plans");
    const events = q('[data-testid="plan-lane-events"]')!.textContent!;
    expect(events).toContain("The Orchestrator's AI decided on the row (Skip)");
    expect(events).toContain("Cost limit reached ($20.40 / $20.00)");
  });
});
