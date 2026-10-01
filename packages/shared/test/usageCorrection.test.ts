import { describe, expect, it } from "vitest";
import { USAGE_FIX_AT, correctLegacyJob, correctLegacyProject, correctedJob, estimateCostUsd, isLegacyUsageJob, sumJobUsage, type UsagePoint } from "../src/index.js";

const u = (inputTokens: number, cachedInputTokens: number, outputTokens: number, reasoningOutputTokens: number) => ({ inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens });

// Usage rows of a production run (test user, 2026-09-29): a research + HCD + FRG job that failed at the end, then a retry
// on the same conversation. The session file's running totals were 9,319,890 / 10,175,056 input tokens.
const FIRST: UsagePoint[] = [
  { sk: "2026-09-29T13:02:30.056Z#00198", usage: u(3_265_610, 3_026_359, 54_223, 30_084) },
  { sk: "2026-09-29T13:16:09.902Z#00247", usage: u(9_092_299, 8_604_259, 114_325, 61_555) },
  { sk: "2026-09-29T13:18:16.529Z#00265", usage: u(15_180_874, 14_422_516, 175_481, 93_326) },
  { sk: "2026-09-29T13:34:57.320Z#00403", usage: u(23_581_682, 22_402_445, 287_226, 153_746) },
  { sk: "2026-09-29T13:43:09.251Z#00440", usage: u(32_901_572, 31_283_673, 405_628, 214_602) },
];
const RETRY: UsagePoint[] = [{ sk: "2026-09-29T13:52:18.922Z#00021", usage: u(10_175_056, 9_730_616, 120_409, 61_063) }];
const job = (jobId: string, createdAt: string, type: "initial" | "followup" | "article" = "initial") => ({ jobId, type, createdAt, startedAt: createdAt, usage: u(1, 0, 0, 0) });

describe("legacy usage correction", () => {
  it("treats only jobs started before the fix as legacy", () => {
    expect(isLegacyUsageJob({ createdAt: "2026-09-29T12:36:00Z", startedAt: "2026-09-29T12:36:33Z", usage: u(1, 0, 0, 0) })).toBe(true);
    expect(isLegacyUsageJob({ createdAt: "2026-10-01T18:40:00Z", startedAt: "2026-10-01T18:40:40Z", usage: u(1, 0, 0, 0) })).toBe(false);
    expect(isLegacyUsageJob({ createdAt: "2026-09-29T12:36:00Z", startedAt: null, usage: undefined })).toBe(false);
    expect(USAGE_FIX_AT < "2026-10-01T18:34:00Z").toBe(true);
  });

  it("recovers the session file's totals from the usage rows of a production run", () => {
    const c = correctLegacyProject([job("job_first", "2026-09-29T12:36:00Z"), job("job_retry", "2026-09-29T13:47:00Z")], new Map([["job_first", FIRST], ["job_retry", RETRY]]));
    expect(c.get("job_first")!.usage).toEqual(u(9_319_890, 8_881_228, 118_402, 60_856));
    // the retry resumed the same conversation: only what it added counts
    expect(c.get("job_retry")!.usage).toEqual(u(855_166, 849_388, 2_007, 207));
    // the usage row after each turn shows the job's corrected running usage
    expect(c.get("job_first")!.points.get(FIRST[1].sk)).toEqual(u(5_826_689, 5_577_900, 60_102, 31_471));
    expect(c.get("job_first")!.points.get(FIRST[4].sk)).toEqual(c.get("job_first")!.usage);
  });

  it("starts from 0 when the conversation is new (its total dropped) and keeps article jobs off the project conversation", () => {
    const fresh = correctLegacyJob([{ sk: "a", usage: u(400, 300, 10, 5) }], u(9_000, 8_000, 100, 50));
    expect(fresh!.usage).toEqual(u(400, 300, 10, 5));
    const c = correctLegacyProject(
      [job("job_first", "2026-09-29T12:36:00Z"), job("job_article", "2026-09-29T13:00:00Z", "article"), job("job_retry", "2026-09-29T13:47:00Z")],
      new Map([["job_first", FIRST], ["job_article", [{ sk: "x", usage: u(100_000, 90_000, 8_000, 4_000) }]], ["job_retry", RETRY]]),
    );
    expect(c.get("job_article")!.usage).toEqual(u(100_000, 90_000, 8_000, 4_000));
    expect(c.get("job_retry")!.usage).toEqual(u(855_166, 849_388, 2_007, 207));
  });

  it("leaves jobs without usage rows and jobs after the fix alone, and reprices corrected jobs", () => {
    const c = correctLegacyProject([job("job_first", "2026-09-29T12:36:00Z"), job("job_new", "2026-10-02T00:00:00Z")], new Map([["job_new", RETRY]]));
    expect(c.size).toBe(0);
    const corrections = correctLegacyProject([job("job_first", "2026-09-29T12:36:00Z")], new Map([["job_first", FIRST]]));
    const stored = { jobId: "job_first", model: "gpt-6-luna", usage: FIRST[4].usage, costUsd: 0.68 };
    const fixed = correctedJob(stored, corrections);
    expect(fixed.costUsd).toBe(estimateCostUsd("gpt-6-luna", u(9_319_890, 8_881_228, 118_402, 60_856)));
    expect(fixed.costUsd!).toBeLessThan(0.3);
    expect(correctedJob({ ...stored, costUsd: null }, corrections).costUsd).toBeNull();
    expect(correctedJob({ ...stored, jobId: "other" }, corrections)).toEqual({ ...stored, jobId: "other" });
  });

  it("sums a project like the worker does", () => {
    expect(sumJobUsage([{ usage: u(10, 5, 2, 1), costUsd: 0.1 }, { usage: u(1, 0, 1, 0), costUsd: 0.02 }, { costUsd: null }])).toEqual({ usage: u(11, 5, 3, 1), costUsd: 0.12 });
    expect(sumJobUsage([{ usage: u(10, 5, 2, 1), costUsd: null }]).costUsd).toBeNull();
  });
});
