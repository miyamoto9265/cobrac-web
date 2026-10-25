import { describe, expect, it } from "vitest";
import { NO_PROGRESS_MS, ProgressWatch, THREAD_RESUME_MAX_BYTES, threadBytes, workspaceFingerprint } from "../src/guards.js";

describe("threadBytes", () => {
  it("adds up the saved thread objects", () => {
    expect(threadBytes([])).toBe(0);
    expect(threadBytes([{ size: 469_498_887 }, { size: 10 }])).toBeGreaterThan(THREAD_RESUME_MAX_BYTES);
  });
});

describe("workspaceFingerprint", () => {
  it("ignores the logs and the order of the listing", () => {
    const a = workspaceFingerprint([
      { rel: "p/uc.json", size: 10, mtimeMs: 1 },
      { rel: "rcs_mcp_calls.jsonl", size: 100, mtimeMs: 5 },
    ]);
    const b = workspaceFingerprint([
      { rel: "rcs_mcp_calls.jsonl", size: 999, mtimeMs: 9 },
      { rel: "p/uc.json", size: 10, mtimeMs: 1 },
    ]);
    expect(a).toBe(b);
    expect(workspaceFingerprint([{ rel: "p/uc.json", size: 11, mtimeMs: 1 }])).not.toBe(a);
  });
});

describe("ProgressWatch", () => {
  it("measures the time since the workspace last changed", () => {
    const w = new ProgressWatch();
    expect(w.observe("a", 1000)).toBe(0);
    expect(w.observe("a", 1000 + NO_PROGRESS_MS)).toBe(NO_PROGRESS_MS);
    expect(w.observe("b", 2000 + NO_PROGRESS_MS)).toBe(0);
  });
});
