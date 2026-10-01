import type { JobStatus } from "@cobrac/shared";
import { describe, expect, it } from "vitest";
import { handleStop, serialized, type StopDeps } from "../src/interrupt.js";

function deps(status: JobStatus | null, o: { ready?: boolean; persistFails?: boolean } = {}) {
  const calls: string[] = [];
  const d: StopDeps = {
    jobStatus: async () => status,
    workspaceReady: () => o.ready ?? true,
    notify: async () => void calls.push("notify"),
    persist: async () => {
      calls.push("persist");
      if (o.persistFails) throw new Error("S3 down");
    },
    markStale: async () => void calls.push("markStale"),
  };
  return { d, calls };
}

describe("handleStop", () => {
  it("saves a running job's work, then hands it to the janitor", async () => {
    for (const status of ["RUNNING", "FINALIZING"] as const) {
      const { d, calls } = deps(status);
      expect(await handleStop(d)).toBe("retry");
      expect(calls).toEqual(["notify", "persist", "markStale"]);
    }
  });

  it("only saves a cancelled job (the StopTask of a cancel also sends SIGTERM)", async () => {
    const { d, calls } = deps("CANCELLED");
    expect(await handleStop(d)).toBe("saved");
    expect(calls).toEqual(["persist"]);
  });

  it("leaves a job that already ended or waits for an answer alone", async () => {
    for (const status of ["COMPLETED", "FAILED", "WAITING_USER_INPUT", null] as const) {
      const { d, calls } = deps(status);
      expect(await handleStop(d)).toBe("nothing");
      expect(calls).toEqual([]);
    }
  });

  it("still hands the job to the janitor when there is no workspace yet or saving fails", async () => {
    const early = deps("RUNNING", { ready: false });
    expect(await handleStop(early.d)).toBe("retry");
    expect(early.calls).toEqual(["markStale"]);

    const broken = deps("RUNNING", { persistFails: true });
    await expect(handleStop(broken.d)).rejects.toThrow("S3 down");
    expect(broken.calls).toEqual(["notify", "persist", "markStale"]);
  });
});

describe("serialized", () => {
  it("runs one call at a time, in order, and goes on after a failure", async () => {
    const log: string[] = [];
    let n = 0;
    let active = 0;
    const run = serialized(async () => {
      const i = ++n;
      active++;
      expect(active).toBe(1);
      log.push(`start ${i}`);
      await new Promise((r) => setTimeout(r, 5));
      log.push(`end ${i}`);
      active--;
      if (i === 1) throw new Error("first fails");
    });
    const results = await Promise.allSettled([run(), run(), run()]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });
});
