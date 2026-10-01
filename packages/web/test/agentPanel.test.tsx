// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MessageRecord, ProjectRecord } from "@cobrac/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatTimeline, questionOptions } from "../src/components/ChatTimeline";
import { AgentPanel, composerMode } from "../src/components/workspace/AgentPanel";
import { I18nProvider } from "../src/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => r.render(<I18nProvider>{node}</I18nProvider>));
  return host;
}

let seq = 0;
const msg = (role: MessageRecord["role"], type: MessageRecord["type"], content: string, meta?: Record<string, unknown>): MessageRecord => {
  seq++;
  return { projectId: "p", sk: `2026-10-01T00:00:${String(seq).padStart(2, "0")}.000Z#${seq}`, messageId: `m${seq}`, jobId: "j", role, type, content, step: null, meta, createdAt: `2026-10-01T00:00:${String(seq).padStart(2, "0")}.000Z` };
};

const QUESTION = "Which top-level function?\n\n1. **VOR gain adaptation** — cerebellar gain only\n2. **Gaze stabilization** — includes OKR\n\nAnswer with a number.";

const project = (status: ProjectRecord["status"], pendingQuestion: string | null = null) => ({ projectId: "p", status, pendingQuestion }) as ProjectRecord;

beforeEach(() => localStorage.setItem("cobrac-locale", "en"));
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("composerMode", () => {
  it("answers a pending question, follows up a completed run, and is locked otherwise", () => {
    expect(composerMode(project("WAITING_USER_INPUT", QUESTION))).toBe("answer");
    expect(composerMode(project("COMPLETED"))).toBe("followup");
    expect(composerMode(project("RUNNING"))).toBe("busy");
    expect(composerMode(project("QUEUED"))).toBe("busy");
    expect(composerMode(project("FAILED"))).toBe("idle");
    expect(composerMode(project("CANCELLED"))).toBe("idle");
  });
});

describe("questionOptions", () => {
  it("offers numbered choices without their markdown and notes", () => {
    expect(questionOptions(QUESTION)).toEqual([
      { n: "1", label: "VOR gain adaptation" },
      { n: "2", label: "Gaze stabilization" },
    ]);
  });
  it("offers nothing for a free-form question or a single item", () => {
    expect(questionOptions("What should the TLF be?")).toEqual([]);
    expect(questionOptions("1. only one")).toEqual([]);
  });
});

describe("ChatTimeline", () => {
  it("shows the awaited question as a callout whose options fill the reply", async () => {
    const onPick = vi.fn();
    const messages = [msg("agent", "question", `[QUESTION]${QUESTION}[/QUESTION]`), msg("system", "status", "Answer the agent’s question to resume work.")];
    const el = await render(<ChatTimeline messages={messages} working={false} pendingQuestion={QUESTION} onPickOption={onPick} />);
    const callout = el.querySelector('[data-testid="pending-question"]')!;
    expect(callout.textContent).toContain("Which top-level function?");
    expect(el.querySelectorAll('[data-kind="question"]').length).toBe(0);
    // the "answer to resume" notice is redundant next to the callout
    expect(el.querySelector('[data-kind="notice"]')).toBeNull();
    const options = el.querySelectorAll<HTMLButtonElement>('[data-testid="question-options"] button');
    expect(options.length).toBe(2);
    await act(async () => options[1].click());
    expect(onPick).toHaveBeenCalledWith("2. Gaze stabilization");
  });

  it("keeps answered questions as history", async () => {
    const el = await render(<ChatTimeline messages={[msg("agent", "question", `[QUESTION]${QUESTION}[/QUESTION]`), msg("user", "prompt", "1", { kind: "answer" })]} working={false} />);
    expect(el.querySelector('[data-testid="pending-question"]')).toBeNull();
    expect(el.querySelector('[data-kind="question"]')).not.toBeNull();
  });

  it("folds tool calls into one live activity row while the agent works", async () => {
    const messages = [msg("agent", "reasoning", "**Plan**\nthinking"), msg("agent", "command", "$ node validate.mjs", { status: "started", itemId: "c1" })];
    const el = await render(<ChatTimeline messages={messages} working />);
    const rows = el.querySelectorAll('[data-kind="activity"]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute("data-live")).toBe("true");
    expect(rows[0].textContent).toContain("2 steps");
    expect(rows[0].textContent).toContain("node validate.mjs");
  });
});

describe("AgentPanel composer", () => {
  const panel = (p: ProjectRecord, act: (fn: () => Promise<unknown>) => Promise<void> = async () => undefined) => (
    <AgentPanel projectId="p" project={p} messages={[]} busy={false} err={null} act={act} />
  );

  it("is locked while the agent works and offers stop instead of send", async () => {
    const el = await render(panel(project("RUNNING")));
    expect(el.querySelector<HTMLTextAreaElement>('[data-testid="agent-input"]')!.disabled).toBe(true);
    expect(el.querySelector('[data-testid="agent-stop"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="agent-send"]')).toBeNull();
  });

  it("sends a follow-up with Enter but not while an IME is composing", async () => {
    const run = vi.fn(async () => undefined);
    const el = await render(panel(project("COMPLETED"), run));
    const input = el.querySelector<HTMLTextAreaElement>('[data-testid="agent-input"]')!;
    expect(el.querySelector('[data-testid="agent-composer"]')!.getAttribute("data-mode")).toBe("followup");
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(input, "Add a UC");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })));
    expect(run).not.toHaveBeenCalled();
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })));
    expect(run).not.toHaveBeenCalled();
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(run).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });
});
