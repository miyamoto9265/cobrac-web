/**
 * Turn handling in codex.ts against a scripted Codex thread: stream retries reported as `error` events, and turns that
 * fail on an OpenAI rate limit (resumed after a pause instead of failing the job).
 */
import type { Thread, ThreadEvent } from "@openai/codex-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

type CodexModule = typeof import("../src/codex.js");
let codex: CodexModule;

beforeAll(async () => {
  for (const k of ["TABLE_USERS", "TABLE_PROJECTS", "TABLE_JOBS", "TABLE_MESSAGES", "ARTIFACTS_BUCKET", "JOB_USER_ID", "JOB_ID"]) vi.stubEnv(k, "test");
  vi.stubEnv("JOB_PROJECT_ID", "u7m2q9xa-1");
  codex = await import("../src/codex.js");
});

const TPM =
  "rate limit exceeded: Rate limit reached for gpt-6-luna in organization org-x on tokens per min (TPM): Limit 200000, Used 118932, Requested 156060. Please try again in 22.497s. Visit https://platform.openai.com/account/rate-limits to learn more.";
const TOO_LARGE =
  "rate limit exceeded: Request too large for gpt-6-luna in organization org-x on tokens per min (TPM): Limit 200000, Requested 202304. The input or output tokens must be reduced in order to run successfully. Visit https://platform.openai.com/account/rate-limits to learn more.";
const usage = { input_tokens: 10, cached_input_tokens: 5, output_tokens: 2, reasoning_output_tokens: 1 };
const done = (text = '{"status":"done","message":"ok","question":null}'): ThreadEvent[] => [
  { type: "item.completed", item: { id: "m", type: "agent_message", text } },
  { type: "turn.completed", usage },
];

function scriptedThread(runs: ThreadEvent[][]) {
  const inputs: string[] = [];
  const thread = {
    id: "thread-1",
    runStreamed: vi.fn(async (input: string) => {
      inputs.push(input);
      const events = runs[inputs.length - 1] ?? [];
      return {
        events: (async function* () {
          yield* events;
        })(),
      };
    }),
  };
  return { thread: thread as unknown as Thread, inputs };
}

function sink() {
  const messages: { type: string; content: string }[] = [];
  return {
    messages,
    s: {
      onMessage: async (type: string, content: string) => void messages.push({ type, content }),
      onFileChange: async () => {},
      onHeartbeat: async () => {},
    } as Parameters<CodexModule["runTurn"]>[2],
  };
}

describe("runTurn", () => {
  it("does not fail a turn that completes after Codex reconnected on a rate limit", async () => {
    const { thread, inputs } = scriptedThread([[{ type: "error", message: `Reconnecting... 2/5 (${TPM})` }, ...done()]]);
    const { s, messages } = sink();
    const sleep = vi.fn(async () => {});
    const r = await codex.runTurn(thread, "go", s, undefined, { sleep });
    expect(r.failed).toBe(false);
    expect(r.errorMessage).toBeNull();
    expect(r.finalMessage).toContain('"status":"done"');
    expect(inputs).toEqual(["go"]);
    expect(sleep).not.toHaveBeenCalled();
    expect(messages.find((m) => m.content.startsWith("Reconnecting"))?.type).toBe("status");
    expect(messages.some((m) => m.type === "error")).toBe(false);
  });

  it("resumes a turn that failed on a rate limit after the suggested pause, and adds up the usage", async () => {
    const { thread, inputs } = scriptedThread([
      [{ type: "turn.started" }, { type: "turn.failed", error: { message: TPM } }],
      [{ type: "error", message: `Reconnecting... 1/5 (${TPM})` }, ...done()],
    ]);
    const { s, messages } = sink();
    const waits: number[] = [];
    const r = await codex.runTurn(thread, "go", s, undefined, { sleep: async (ms) => void waits.push(ms) });
    expect(r.failed).toBe(false);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toMatch(/rate limit/);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(30_000);
    expect(messages.some((m) => m.type === "status" && /OpenAI rate limit: resuming the turn in 30 s \(retry 1\/3\)/.test(m.content))).toBe(true);
    expect(r.usage).toEqual({ input: 10, cachedInput: 5, output: 2, reasoningOutput: 1 });
  });

  it("fails after the allowed retries, with backoff between them", async () => {
    const failing: ThreadEvent[] = [{ type: "turn.failed", error: { message: TPM } }];
    const { thread, inputs } = scriptedThread([failing, failing, failing, failing, failing]);
    const { s } = sink();
    const waits: number[] = [];
    const r = await codex.runTurn(thread, "go", s, undefined, { sleep: async (ms) => void waits.push(ms) });
    expect(r.failed).toBe(true);
    expect(r.errorMessage).toBe(TPM);
    expect(inputs).toHaveLength(1 + codex.RATE_LIMIT_TURN_RETRIES);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(30_000 + 60_000 + 120_000);
  });

  it("fails at once on other errors, and when the stream ends on an error without completing", async () => {
    const other = scriptedThread([[{ type: "turn.failed", error: { message: "invalid_request_error: bad schema" } }], done()]);
    const r1 = await codex.runTurn(other.thread, "go", sink().s, undefined, { sleep: async () => {} });
    expect(r1).toMatchObject({ failed: true, errorMessage: "invalid_request_error: bad schema" });
    expect(other.inputs).toHaveLength(1);

    const cut = scriptedThread([[{ type: "turn.started" }, { type: "error", message: "stream disconnected" }]]);
    const r2 = await codex.runTurn(cut.thread, "go", sink().s, undefined, { sleep: async () => {} });
    expect(r2).toMatchObject({ failed: true, errorMessage: "stream disconnected" });
  });

  it("returns a request that is larger than the TPM limit as a failed turn at once, even when codex exec then exits with code 1", async () => {
    const thread = {
      id: "thread-1",
      runStreamed: vi.fn(async () => ({
        events: (async function* () {
          yield { type: "error", message: `Reconnecting... 5/5 (${TOO_LARGE})` } as ThreadEvent;
          yield { type: "turn.failed", error: { message: TOO_LARGE } } as ThreadEvent;
          throw new Error("Codex Exec exited with code 1: Reading prompt from stdin...");
        })(),
      })),
    } as unknown as Thread;
    const sleep = vi.fn(async () => {});
    const r = await codex.runTurn(thread, "go", sink().s, undefined, { sleep });
    expect(r).toMatchObject({ failed: true, errorMessage: TOO_LARGE });
    expect(sleep).not.toHaveBeenCalled();
    expect(thread.runStreamed).toHaveBeenCalledTimes(1);
  });

  it("still throws when codex exec fails without a failed turn", async () => {
    const thread = {
      id: "thread-1",
      runStreamed: vi.fn(async () => ({
        events: (async function* () {
          yield { type: "turn.started" } as ThreadEvent;
          throw new Error("Codex Exec exited with code 1");
        })(),
      })),
    } as unknown as Thread;
    await expect(codex.runTurn(thread, "go", sink().s, undefined, { sleep: async () => {} })).rejects.toThrow(/exited with code 1/);
  });

  it("shows a non-fatal Codex warning item as a status line without failing the turn", async () => {
    const warning = "Model metadata for `gpt-x` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.";
    const { thread } = scriptedThread([[{ type: "item.completed", item: { id: "item_0", type: "error", message: warning } }, ...done()]]);
    const { s, messages } = sink();
    const r = await codex.runTurn(thread, "go", s, undefined, { sleep: async () => {} });
    expect(r).toMatchObject({ failed: false, errorMessage: null });
    expect(messages.find((m) => m.content === warning)?.type).toBe("status");
    expect(messages.some((m) => m.type === "error")).toBe(false);
  });

  it("still reports a stream error event as an error", async () => {
    const { thread } = scriptedThread([[{ type: "error", message: "unexpected status 401 Unauthorized" }, ...done()]]);
    const { s, messages } = sink();
    await codex.runTurn(thread, "go", s, undefined, { sleep: async () => {} });
    expect(messages).toContainEqual({ type: "error", content: "Error: unexpected status 401 Unauthorized" });
  });

  it("stops waiting when the job is cancelled during the pause", async () => {
    const { thread } = scriptedThread([[{ type: "turn.failed", error: { message: TPM } }], done()]);
    const abort = new AbortController();
    const p = codex.runTurn(thread, "go", sink().s, abort.signal);
    setTimeout(() => abort.abort(new Error("cancelled")), 20);
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("model metadata", () => {
  it("hands Codex the model an API alias routes to, and other models unchanged", () => {
    expect(codex.codexModelSlug("gpt-5.6")).toBe("gpt-5.6-sol");
    expect(codex.codexModelSlug("gpt-6-luna")).toBe("gpt-6-luna");
  });

  it("compacts the conversation by default well before it reaches the context window", async () => {
    const { env } = await import("../src/env.js");
    expect(env.codexAutoCompactTokens).toBe(75_000);
    expect(env.codexAutoCompactTokens).toBeLessThan(codex.CODEX_CONTEXT_WINDOW);
  });
});

describe("rate limit helpers", () => {
  it("recognises rate limits but not an exhausted quota", () => {
    expect(codex.isRateLimitError(TPM)).toBe(true);
    expect(codex.isRateLimitError("unexpected status 429 Too Many Requests")).toBe(true);
    expect(codex.isRateLimitError("You exceeded your current quota, please check your plan and billing details. (429)")).toBe(false);
    expect(codex.isRateLimitError("invalid_request_error")).toBe(false);
    expect(codex.isRateLimitError(null)).toBe(false);
  });

  it("tells a request larger than the limit from a rate limit that passes", () => {
    expect(codex.isRequestTooLarge(TOO_LARGE)).toBe(true);
    expect(codex.isRateLimitError(TOO_LARGE)).toBe(false);
    expect(codex.isRequestTooLarge(TPM)).toBe(false);
  });

  it("waits for the server's hint or the backoff, whichever is longer, up to 3 minutes", () => {
    expect(codex.rateLimitWaitMs(TPM, 0)).toBe(30_000);
    expect(codex.rateLimitWaitMs("Please try again in 40s.", 0)).toBe(45_000);
    expect(codex.rateLimitWaitMs("Please try again in 1.5m.", 0)).toBe(95_000);
    expect(codex.rateLimitWaitMs("Please try again in 900ms.", 1)).toBe(60_000);
    expect(codex.rateLimitWaitMs("rate limit", 5)).toBe(180_000);
  });
});
