import { describe, expect, it } from "vitest";
import {
  CANON_ID_REGEX,
  CONCURRENCY_MAX,
  MAX_ROW_AUTO_RETRIES,
  PLAN_ID_REGEX,
  PLAN_LIMITS,
  PROJECT_ID_REGEX,
  countRows,
  effectiveLimits,
  estimatePlan,
  freeSlots,
  generatePlanId,
  isConcurrencyLimit,
  isPlanId,
  nextActiveWave,
  normalizePlanRow,
  parsePlanRowsCsv,
  planFinished,
  rowsToStart,
  syncRow,
  waveSizes,
  type PlanRowRecord,
  type PlanRowState,
} from "../src/index.js";

const row = (rowId: string, wave: number, state: PlanRowState, order = Number(rowId.slice(1))): Pick<PlanRowRecord, "rowId" | "wave" | "order" | "state" | "attempts"> => ({ rowId, wave, order, state, attempts: 0 });

describe("plan IDs", () => {
  it("are n + 7 base32 and never a Project or Canon ID", () => {
    for (let i = 0; i < 200; i++) {
      const id = generatePlanId();
      expect(id).toMatch(PLAN_ID_REGEX);
      expect(isPlanId(id)).toBe(true);
      expect(PROJECT_ID_REGEX.test(id)).toBe(false);
      expect(CANON_ID_REGEX.test(id)).toBe(false);
    }
    expect(isPlanId("p7m2q9xa")).toBe(false);
    expect(isPlanId("c4h8w2rk")).toBe(false);
  });
});

describe("parsePlanRowsCsv", () => {
  it("reads a 20-row capability list with a header and lists unreadable rows with a reason", () => {
    const lines = ["ROI,TLF,Rationale,Wave"];
    for (let i = 1; i <= 20; i++) lines.push(`Region ${i},Function ${i},why ${i},${(i % 3) + 1}`);
    lines.push(",,only a note,1"); // no ROI or TLF
    lines.push("Region 3,Function 3,dup,1"); // duplicate of an earlier row
    lines.push("Region X,Function X,bad wave,zero");
    lines.push(""); // blank: skipped silently
    const r = parsePlanRowsCsv(lines.join("\n"));
    expect(r.header).toBe(true);
    expect(r.rows).toHaveLength(20);
    expect(r.rows[0]).toMatchObject({ roi: "Region 1", tlf: "Function 1", rationale: "why 1", wave: 2, sourceRow: 2 });
    expect(r.rejected).toEqual([
      { row: 22, reason: "noRoiTlf", text: "only a note | 1" },
      { row: 23, reason: "duplicate", text: "Region 3 | Function 3 | dup | 1" },
      { row: 24, reason: "badWave", text: "Region X | Function X | bad wave | zero" },
    ]);
  });

  it("finds Japanese headers in any order and ignores other columns", () => {
    const r = parsePlanRowsCsv("番号,能力,脳領域,備考,優先度\n1,発話,左下前頭回,ブローカ野,5\n2,読字,,,\n");
    expect(r.rows).toEqual([
      { roi: "左下前頭回", tlf: "発話", rationale: "ブローカ野", wave: 1, priority: 5, sourceRow: 2 },
      { roi: "", tlf: "読字", rationale: "", wave: 1, priority: null, sourceRow: 3 },
    ]);
  });

  it("reads a list without header: one column is the TLF, more are ROI, TLF, rationale", () => {
    expect(parsePlanRowsCsv("speech production\nreading\n").rows.map((r) => [r.roi, r.tlf])).toEqual([
      ["", "speech production"],
      ["", "reading"],
    ]);
    expect(parsePlanRowsCsv("left IFG,speech production,hub\nSTG,phonological processing\n").rows.map((r) => [r.roi, r.tlf, r.rationale])).toEqual([
      ["left IFG", "speech production", "hub"],
      ["STG", "phonological processing", ""],
    ]);
  });

  it("reads TSV, strips a BOM and keeps quoted commas", () => {
    expect(parsePlanRowsCsv("﻿roi\ttlf\nA1\thearing\n").rows[0]).toMatchObject({ roi: "A1", tlf: "hearing" });
    expect(parsePlanRowsCsv('roi,tlf\n"V1, V2",vision\n').rows[0]).toMatchObject({ roi: "V1, V2", tlf: "vision" });
  });

  it("rejects duplicates of existing rows, too long values, bad priorities and rows over the limit", () => {
    const long = "x".repeat(PLAN_LIMITS.maxRoi + 1);
    const r = parsePlanRowsCsv(`roi,tlf,priority\nSTG,hearing,\n${long},y,\nA,B,high\nC,D,\nE,F,\n`, { existing: [{ roi: "stg", tlf: " Hearing " }], maxRows: 2 });
    expect(r.rows.map((x) => x.roi)).toEqual(["C"]);
    expect(r.rejected.map((x) => [x.row, x.reason])).toEqual([
      [2, "duplicate"],
      [3, "tooLong"],
      [4, "badPriority"],
      [6, "tooMany"],
    ]);
  });
});

describe("normalizePlanRow", () => {
  it("collapses whitespace and needs ROI or TLF", () => {
    expect(normalizePlanRow({ roi: "  left\n IFG ", tlf: "" })).toEqual({ row: { roi: "left IFG", tlf: "", rationale: "", wave: 1, priority: null } });
    expect(normalizePlanRow({ roi: " ", tlf: "" })).toEqual({ reason: "noRoiTlf" });
    expect(normalizePlanRow({ roi: "a", wave: 100 })).toEqual({ reason: "badWave" });
    expect(normalizePlanRow({ roi: "a", wave: 3 }, 1)).toMatchObject({ row: { wave: 3 } });
  });
});

describe("waves", () => {
  it("starts with the first wave that has waiting rows", () => {
    expect(nextActiveWave([row("r1", 2, "pending"), row("r2", 5, "pending")], null)).toBe(2);
  });

  it("moves on only when no row of the active wave (or before) waits to start or runs", () => {
    const rows = [row("r1", 1, "done"), row("r2", 1, "running"), row("r3", 2, "pending")];
    expect(nextActiveWave(rows, 1)).toBe(1);
    rows[1].state = "done";
    expect(nextActiveWave(rows, 1)).toBe(2);
  });

  it("is not held up by rows waiting for an answer or needing attention", () => {
    expect(nextActiveWave([row("r1", 1, "question"), row("r2", 1, "attention"), row("r3", 3, "pending")], 1)).toBe(3);
  });

  it("never goes back, and a retry of an earlier wave holds the active one", () => {
    expect(nextActiveWave([row("r1", 1, "pending"), row("r2", 2, "pending")], 2)).toBe(2);
    expect(nextActiveWave([row("r1", 1, "done")], 1)).toBe(1);
  });

  it("starts pending rows of the active wave and earlier in wave and row order, at most the free slots", () => {
    const rows = [row("r5", 2, "pending", 1), row("r1", 1, "pending", 9), row("r2", 1, "pending", 2), row("r3", 3, "pending", 0), row("r4", 1, "running", 0)];
    expect(rowsToStart(rows, 2, 2).map((r) => r.rowId)).toEqual(["r2", "r1"]);
    expect(rowsToStart(rows, 2, 5).map((r) => r.rowId)).toEqual(["r2", "r1", "r5"]);
    expect(rowsToStart(rows, 2, 0)).toEqual([]);
    expect(rowsToStart(rows, null, 3)).toEqual([]);
  });

  it("counts rows per wave without the skipped ones", () => {
    expect(waveSizes([row("r1", 2, "pending"), row("r2", 1, "done"), row("r3", 2, "skipped"), row("r4", 2, "pending")])).toEqual([1, 2]);
  });

  it("is finished when every row is done or skipped", () => {
    expect(planFinished([row("r1", 1, "done"), row("r2", 1, "skipped")])).toBe(true);
    expect(planFinished([row("r1", 1, "done"), row("r2", 1, "attention")])).toBe(false);
    expect(planFinished([])).toBe(false);
    expect(countRows([row("r1", 1, "done"), row("r2", 1, "done"), row("r3", 1, "question")])).toMatchObject({ done: 2, question: 1, pending: 0 });
  });
});

describe("limits", () => {
  it("accepts 1–16 only", () => {
    expect(isConcurrencyLimit(1)).toBe(true);
    expect(isConcurrencyLimit(CONCURRENCY_MAX)).toBe(true);
    for (const v of [0, 17, 2.5, "8", null, -1]) expect(isConcurrencyLimit(v)).toBe(false);
  });

  it("uses the admin setting where it is set and the deployment value otherwise", () => {
    const deployment = { maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 1 };
    expect(effectiveLimits(null, deployment)).toEqual({ maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 1, effective: 1 });
    expect(effectiveLimits({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 8 }, deployment)).toEqual({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 8, effective: 8 });
    expect(effectiveLimits({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: null }, deployment).effective).toBe(1);
    // a stored value outside 1–16 is ignored
    expect(effectiveLimits({ maxConcurrentJobs: 40, maxConcurrentJobsPerUser: 4 }, deployment)).toEqual({ maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 4, effective: 2 });
  });

  it("leaves room for what is not yet used under both limits, counting queued jobs", () => {
    const jobs = [{ userId: "a" }, { userId: "b" }, { userId: "a" }];
    expect(freeSlots({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 8 }, jobs, "a")).toBe(5);
    expect(freeSlots({ maxConcurrentJobs: 8, maxConcurrentJobsPerUser: 3 }, jobs, "a")).toBe(1);
    expect(freeSlots({ maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 1 }, jobs, "c")).toBe(0);
    expect(freeSlots({ maxConcurrentJobs: 2, maxConcurrentJobsPerUser: 1 }, [], "c")).toBe(1);
  });
});

describe("estimatePlan", () => {
  it("matches the planning figures for 141 rows (3 seed rows, the rest in one body wave)", () => {
    const hours = (c: number) => estimatePlan({ seedRows: 3, bodyWaveSizes: [138], concurrency: c }).minutes / 60;
    for (const [c, h] of [
      [1, 120],
      [4, 32],
      [8, 18],
      [12, 12],
      [16, 10],
    ] as const) {
      expect(Math.abs(hours(c) - h)).toBeLessThan(1);
    }
    expect(estimatePlan({ seedRows: 3, bodyWaveSizes: [138], concurrency: 4 }).costUsd).toEqual({ min: 25.38, max: 54.99 });
  });

  it("adds waves one after the other", () => {
    const e = estimatePlan({ seedRows: 0, bodyWaveSizes: [2, 2, 1], concurrency: 2 });
    expect(e).toMatchObject({ rows: 5, waves: 3, concurrency: 2 });
    expect(e.minutes).toBe(3 * 48 + Math.round((5 * 0.2 * 15) / 2));
  });
});

describe("syncRow", () => {
  const p = (status: string, extra: Record<string, unknown> = {}) => ({ status, errorMessage: null, deletedAt: null, ...extra }) as never;

  it("follows the project's status", () => {
    expect(syncRow({ state: "starting", attempts: 0 }, p("QUEUED"), "RUNNING")).toEqual({ state: "running", event: null });
    expect(syncRow({ state: "running", attempts: 0 }, p("RUNNING"), "RUNNING")).toBeNull();
    expect(syncRow({ state: "running", attempts: 0 }, p("WAITING_USER_INPUT"), "RUNNING")).toEqual({ state: "question", event: "row_question" });
    expect(syncRow({ state: "question", attempts: 0 }, p("QUEUED"), "RUNNING")).toEqual({ state: "running", event: "row_resumed" });
    expect(syncRow({ state: "running", attempts: 0 }, p("COMPLETED"), "PAUSED")).toEqual({ state: "done", event: "row_done" });
  });

  it("retries a failed project up to the limit, then needs attention", () => {
    expect(syncRow({ state: "running", attempts: 0 }, p("FAILED", { errorMessage: "boom" }), "RUNNING")).toEqual({ state: "pending", retry: true, event: "row_retry", error: "boom" });
    expect(syncRow({ state: "running", attempts: MAX_ROW_AUTO_RETRIES }, p("FAILED"), "RUNNING")).toMatchObject({ state: "attention", reason: "failed" });
  });

  it("does not retry a question that timed out, a project stopped outside the plan or a deleted project", () => {
    expect(syncRow({ state: "question", attempts: 0 }, p("FAILED"), "RUNNING")).toMatchObject({ state: "attention", reason: "question_timeout" });
    expect(syncRow({ state: "running", attempts: 0 }, p("CANCELLED"), "RUNNING")).toMatchObject({ state: "attention", reason: "cancelled_outside" });
    expect(syncRow({ state: "running", attempts: 0 }, p("CANCELLED"), "CANCELLED")).toEqual({ state: "cancelled", event: "row_cancelled" });
    expect(syncRow({ state: "running", attempts: 0 }, p("COMPLETED", { deletedAt: "2026-10-06" }), "RUNNING")).toMatchObject({ state: "attention", reason: "project_deleted" });
    expect(syncRow({ state: "running", attempts: 0 }, null, "RUNNING")).toMatchObject({ state: "attention", reason: "project_deleted" });
  });
});
