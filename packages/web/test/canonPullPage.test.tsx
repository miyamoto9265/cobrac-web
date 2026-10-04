// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonAiState, CanonPullDetailResponse, CanonPullRequestRecord } from "@cobrac/shared";
import { canonFromProject, canonReviewChecks, diffCanon, emptyCanonSnapshot, mergeCanon, reviewEntries, reviewGraph } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  canonPull: vi.fn(),
  models: vi.fn(),
  approvePull: vi.fn(),
  rejectPull: vi.fn(),
  requestChanges: vi.fn(),
  commentPull: vi.fn(),
  aiReviewPull: vi.fn(),
  withdrawPull: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: { userId: "alice", role: "user" } }) }));

const { I18nProvider } = await import("../src/i18n");
const { CanonPullPage } = await import("../src/pages/CanonPullPage");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const uc = (id: string, d: string) => ({ circuitId: id, descriptor: d, names: id, roi: "internal", sourceOfId: "BNA", transmitter: "Glutamate", modulationType: "Excitatory", comments: "", interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "", outputSemantics: "" });
function files(ucs: ReturnType<typeof uc>[], conns: [string, string][], cols: unknown[] = []) {
  return {
    uc: JSON.stringify({ ucs, collections: cols }),
    connections: JSON.stringify({
      bif: [],
      connections: conns.map(([s, r]) => ({ sender: s, senderRelation: "=", senderInLiterature: "x", receiver: r, receiverRelation: "=", receiverInLiterature: "y", comment: "", referenceIds: ["[Catani, 2005]"], taxon: "Human", measurementMethod: "DW-MRI", pointersOnLiterature: "The arcuate fasciculus connects Broca's territory with Wernicke's territory in humans.", pointersOnFigure: "Fig. 2" })),
    }),
    references: JSON.stringify({ references: [{ id: "[Catani, 2005]", doi: "10.1002/ana.20319", literatureType: "Experimental results" }] }),
  };
}

const now = "2026-10-03T00:00:00.000Z";
function detail(ai: CanonAiState | null = null): CanonPullDetailResponse {
  const coarse = canonFromProject("u7m2q9xa-1", 1, files([uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [["A22c(left)", "A44d(left)"]]));
  const empty = emptyCanonSnapshot("u7m2q9xa-c1", now);
  const base = mergeCanon(empty, coarse, diffCanon(empty, coarse), {}, 1, now);
  const inc = canonFromProject(
    "u7m2q9xa-2",
    1,
    files(
      [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left"), uc("A22c(left)", "BNA:75-76/side:left")],
      [["A44d(L3.IT.left)", "A22c(left)"]],
      [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"], comments: "" }],
    ),
  );
  const diff = diffCanon(base, inc);
  const pr: CanonPullRequestRecord = { canonId: "u7m2q9xa-c1", sk: "PR#000002", prNo: 2, source: "project:u7m2q9xa-2", sourceName: "Fine", sourceRevision: 1, baseRevision: 1, state: "open", summary: diff.summary, createdBy: "me", createdAt: now, updatedAt: now };
  return {
    pr,
    diff,
    headRevision: 1,
    targetName: "Language",
    canReview: true,
    canWithdraw: true,
    canComment: true,
    viewerRole: "owner",
    checks: canonReviewChecks(base, inc, diff),
    entries: reviewEntries(base, inc, diff),
    graph: reviewGraph(base, inc, diff),
    provenance: null,
    events: [{ type: "pushed", at: now, actor: "me", actorName: "Tatsuya", revision: 1 }],
    ai,
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/canons/u7m2q9xa-c1/pulls/2"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/canons/:canonId/pulls/:no" element={<CanonPullPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const click = (el: Element | null | undefined) =>
  act(async () => {
    (el as HTMLElement).click();
  });
async function type(el: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  vi.clearAllMocks();
  api.models.mockResolvedValue({ models: ["gpt-6-luna", "gpt-5.6-luna"], pricedModels: ["gpt-6-luna"], envDefaultModel: "gpt-6-luna", keySource: "org", orgTier: 1, restricted: true });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  document.body.innerHTML = "";
});

describe("Canon PR review page", () => {
  it("shows who decided the pull request and when", async () => {
    const d = detail();
    d.pr = { ...d.pr, state: "approved", decidedBy: "bob", decidedByName: "Bob", decidedAt: now, mergedRevision: 2, approvals: [{ userId: "bob", name: "Bob", at: now }] };
    api.canonPull.mockResolvedValue(d);
    await render();
    expect($('[data-testid="decision-banner"]')!.textContent).toContain("Approved by Bob → rev 2");
    expect($('[data-testid="review-decision"]')).toBeNull();
  });

  it("shows who requested changes on an open pull request", async () => {
    const d = detail();
    d.pr = { ...d.pr, reviewState: "changes_requested", reviewNote: "Split A22c", reviewedBy: "bob", reviewedByName: "Bob", reviewedAt: now };
    d.viewerRole = "editor";
    api.canonPull.mockResolvedValue(d);
    await render();
    expect($('[data-testid="decision-banner"]')!.textContent).toContain("Changes requested by Bob");
    expect($('[data-testid="decision-banner"]')!.textContent).toContain("Split A22c");
    // a co-editor reviews like the owner
    expect($('[data-testid="review-decision"]')).not.toBeNull();
  });

  it("shows the graph and the structured diff, and keeps approval blocked until the conflicts are decided", async () => {
    api.canonPull.mockResolvedValue(detail());
    await render();
    expect($('[data-testid="review-graph"]')).not.toBeNull();
    expect($('[data-testid="diff-table"]')!.textContent).toContain("A44d(L3.IT.left)");
    expect(($('[data-testid="approve-pr"]') as HTMLButtonElement).disabled).toBe(true);
    // reject and request changes need a note
    expect(($('[data-testid="reject-pr"]') as HTMLButtonElement).disabled).toBe(true);
    await type($('[data-testid="review-note"]') as HTMLTextAreaElement, "Please split A22c too");
    expect(($('[data-testid="request-changes"]') as HTMLButtonElement).disabled).toBe(false);
    api.requestChanges.mockResolvedValue({ ok: true });
    await click($('[data-testid="request-changes"]'));
    expect(api.requestChanges).toHaveBeenCalledWith("u7m2q9xa-c1", 2, "Please split A22c too");
  });

  it("opens both sides of an item and comments on it", async () => {
    api.canonPull.mockResolvedValue(detail());
    api.commentPull.mockResolvedValue({ event: {} });
    await render();
    await click($('li[data-item="circuit:bna:29-30/side:left"] > button'));
    const row = $('li[data-item="circuit:bna:29-30/side:left"]')!;
    expect(row.querySelector("table")!.textContent).toContain("collection");
    expect(row.querySelector('[data-differs="true"]')).not.toBeNull();
    await type(row.querySelector('[data-testid="comment-input"]') as HTMLTextAreaElement, "Why a Collection?");
    await click([...row.querySelectorAll("button")].find((b) => b.textContent?.includes("Comment")));
    expect(api.commentPull).toHaveBeenCalledWith("u7m2q9xa-c1", 2, "Why a Collection?", "circuit:bna:29-30/side:left");
  });

  it("lists the system checks by group with their Master codes", async () => {
    api.canonPull.mockResolvedValue(detail());
    await render();
    await click($('[data-testid="tab-checks"]'));
    expect($('[data-testid="checks-panel"]')!.textContent).toContain("To decide");
    expect($('[data-testid="check-group-provenance"]')!.textContent).toContain("Affects another project");
  });

  it("runs the AI review with a Tier model, says the human decides, and turns a draft into a comment", async () => {
    api.canonPull.mockResolvedValue(detail());
    api.aiReviewPull.mockResolvedValue({ ai: null });
    await render();
    await click($('[data-testid="tab-ai"]'));
    expect($('[data-testid="ai-notice"]')!.textContent).toContain("You decide");
    const options = [...document.querySelectorAll<HTMLOptionElement>('[data-testid="ai-model"] option')].map((o) => o.value);
    expect(options).toEqual(["", "gpt-6-luna", "gpt-5.6-luna"]);
    await click($('[data-testid="ai-run"]'));
    expect(api.aiReviewPull).toHaveBeenCalledWith("u7m2q9xa-c1", 2, null, "en");

    const ai: CanonAiState = {
      jobId: "job_1",
      status: "COMPLETED",
      model: "gpt-6-luna",
      locale: "en",
      requestedAt: now,
      endedAt: now,
      errorMessage: null,
      costUsd: 0.01,
      result: {
        review: {
          summary: "Splits A44d(left).",
          flags: [{ severity: "high", title: "Granularity", reason: "The Canon keeps A44d(left) uniform.", items: ["circuit:bna:29-30/side:left"], checks: [], references: ["[Catani, 2005]"] }],
          verify: [],
          comments: [{ item: "circuit:bna:29-30/side:left", text: "Is the split needed for the TLF?" }],
        },
        dropped: 0,
        model: "gpt-6-luna",
        locale: "en",
        createdAt: now,
      },
    };
    api.canonPull.mockResolvedValue(detail(ai));
    if (root) await act(async () => root!.unmount());
    document.body.innerHTML = "";
    await render();
    await click($('[data-testid="tab-ai"]'));
    expect($('[data-testid="ai-summary"]')!.textContent).toBe("Splits A44d(left).");
    expect($('[data-testid="ai-flag"]')!.querySelector('a[href="https://doi.org/10.1002/ana.20319"]')).not.toBeNull();
    await click($('[data-testid="ai-use-comment"]'));
    const box = $('li[data-item="circuit:bna:29-30/side:left"] [data-testid="comment-input"]') as HTMLTextAreaElement;
    expect(box.value).toBe("Is the split needed for the TLF?");
  });
});
