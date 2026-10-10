/**
 * The `plan` job against a scripted model: retries on a reply that is not the schema's object, the time budget,
 * HOMBA anchors RCS does not know, usage, and the plan ID accepted as JOB_PROJECT_ID.
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { HombaSabraInfo, PlanJobInput, SabraLookup } from "@cobrac/shared";
import { PLAN_RESULT_SCHEMA, PLAN_RETRY_PROMPT, PLAN_ROW_ANSWER_SCHEMA, PLAN_ROW_RESOLVE_SCHEMA, PLAN_ROW_RETRY_PROMPT, buildPlanJobInput, buildPlanRowJobInput } from "@cobrac/shared";
import type { MaterialEntry } from "../src/materials.js";
import { PLAN_FORMAT_ERROR, PLAN_TIME_BUDGET_ERROR, planMaterialsIndex, runPlanJob, runPlanRowJob, type PlanTurn } from "../src/planJob.js";
import { RCS_TOOLS, RcsClient } from "../src/rcs.js";
import { startMockRcs } from "./mockRcsServer.js";

const usage = { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10, reasoningOutputTokens: 5 };
const SPEC = "PLAN SPEC";

const input = (over: Partial<PlanJobInput> = {}): PlanJobInput =>
  buildPlanJobInput({
    kind: "draft",
    planId: "n4h8w2rk",
    jobId: "job_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    locale: "ja",
    goal: "言語の BRA を一通りそろえたい",
    policy: "",
    attachments: [{ id: "f1", name: "capabilities.xlsx", key: "attachments/files/01-capabilities.xlsx" }],
    rows: [{ rowId: "r1aaaaaa", roi: "STG", tlf: "hearing", rationale: "", state: "pending", wave: 1, seed: false, anchors: [], anchorsSource: null, projectId: null, existing: false }],
    projects: [{ projectId: "pdone001", name: "VOR", roi: "flocculus", tlf: "VOR", status: "COMPLETED", completed: true, canonId: null }],
    canons: [],
    concurrency: 2,
    wave: null,
    ...over,
  });

const row = (id: string, roi: string, tlf: string, anchors: string[] = [], extra: Record<string, unknown> = {}) => ({
  id,
  roi,
  tlf,
  rationale: "why",
  anchors,
  dependsOn: [],
  priority: 0,
  existingProjectId: "",
  source: "goal",
  ...extra,
});
const reply = (body: Record<string, unknown>) => JSON.stringify({ rows: [], unread: [], policy: "", proposals: [], notes: "", ...body });
const DRAFT = reply({
  rows: [
    row("r1aaaaaa", "STG", "hearing", ["BNA:71-72", "HOMBA:12261"]),
    row("new1", "left IFG (areas 44 and 45)", "speech production", ["BNA:29", "HOMBA:99999", "HOMBA:10339"], { dependsOn: ["r1aaaaaa"] }),
  ],
  unread: [{ source: "capabilities.xlsx", location: "Sheet1, row 7", reason: "no function named" }],
  policy: "neocortex = area × projection class, subcortex = nucleus",
});

/** A turn that answers from a script and records its prompts and signals. */
function scripted(replies: string[]) {
  const prompts: string[] = [];
  const signals: AbortSignal[] = [];
  const turn = async (prompt: string, signal: AbortSignal): Promise<PlanTurn> => {
    prompts.push(prompt);
    signals.push(signal);
    return { text: replies.shift() ?? "", usage };
  };
  return { prompts, signals, turn };
}

const deadline = () => Date.now() + 60_000;
const dhba = (acronym: string): HombaSabraInfo => ({ atlas: "DHBA", dhbaAcronym: acronym, dhbaExact: true, dhbaHombaId: "", dhbaAncestorAcronym: acronym });

describe("runPlanJob", () => {
  it("runs one turn on the spec, the task and the input, and keeps the parsed result", async () => {
    const s = scripted([DRAFT]);
    const r = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: '- f1 "capabilities.xlsx": original `materials/files/01-capabilities.xlsx`', turn: s.turn, deadlineMs: deadline() });
    expect(r.result).toBe("completed");
    if (r.result !== "completed") return;
    expect(s.prompts).toHaveLength(1);
    expect(s.prompts[0].startsWith(SPEC)).toBe(true);
    expect(s.prompts[0]).toContain("Task: DRAFT");
    expect(s.prompts[0]).toContain("materials/files/01-capabilities.xlsx");
    expect(r.attempts).toBe(1);
    expect(r.usage).toEqual(usage);
    expect(r.parsed.rows.map((x) => [x.id, x.ref])).toEqual([
      ["r1aaaaaa", "r1aaaaaa"],
      ["new1", null],
    ]);
    // without RCS every valid anchor is kept
    expect(r.parsed.rows[1].anchors).toEqual(["BNA:29-30", "HOMBA:99999", "HOMBA:10339"]);
    expect(r.parsed.unread).toHaveLength(1);
    expect(r.parsed.policy.granularity).toBe("neocortex = area × projection class, subcortex = nucleus");
    expect(r.parsed.dropped).toBe(0);
  });

  it("asks once more with the retry prompt when the reply is not the object, and adds up the usage", async () => {
    const s = scripted(["Here is the plan: …", DRAFT]);
    const r = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: s.turn, deadlineMs: deadline() });
    expect(r).toMatchObject({ result: "completed", attempts: 2 });
    expect(s.prompts).toHaveLength(2);
    expect(s.prompts[1]).toBe(PLAN_RETRY_PROMPT);
    expect(r.usage).toEqual({ inputTokens: 200, cachedInputTokens: 80, outputTokens: 20, reasoningOutputTokens: 10 });
  });

  it("fails after two replies that are not the object, or when a turn fails", async () => {
    const s = scripted(["no", "still no", DRAFT]);
    const r = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: s.turn, deadlineMs: deadline() });
    expect(r).toEqual({ result: "failed", error: PLAN_FORMAT_ERROR, usage: { inputTokens: 200, cachedInputTokens: 80, outputTokens: 20, reasoningOutputTokens: 10 } });
    expect(s.prompts).toHaveLength(2);
    const broken = await runPlanJob({
      input: input(),
      spec: SPEC,
      materialsIndex: null,
      turn: async () => {
        throw new Error("rate limit");
      },
      deadlineMs: deadline(),
    });
    expect(broken).toEqual({ result: "failed", error: "rate limit", usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 } });
    const leaky = await runPlanJob({
      input: input(),
      spec: SPEC,
      materialsIndex: null,
      turn: async () => {
        throw new Error(`Codex Exec exited with code 1: invalid key sk-proj-abc123XYZ ${"x".repeat(2000)}`);
      },
      deadlineMs: deadline(),
    });
    expect(leaky.result === "failed" && leaky.error).toMatch(/^Codex Exec exited with code 1: invalid key sk-… x+$/);
    expect(leaky.result === "failed" && leaky.error.length).toBeLessThanOrEqual(500);
  });

  it("aborts the turn when the time budget is spent", async () => {
    let seen: AbortSignal | null = null;
    const r = await runPlanJob({
      input: input(),
      spec: SPEC,
      materialsIndex: null,
      turn: (_prompt, signal) => {
        seen = signal;
        return new Promise<PlanTurn>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      },
      deadlineMs: Date.now() + 30,
    });
    expect(r).toMatchObject({ result: "failed", error: PLAN_TIME_BUDGET_ERROR });
    expect(seen!.aborted).toBe(true);
  });

  it("does not wait past the budget for a turn that ignores the signal, nor start one when the budget is gone", async () => {
    const started = Date.now();
    const hanging = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: () => new Promise<PlanTurn>(() => undefined), deadlineMs: Date.now() + 30 });
    expect(hanging).toMatchObject({ result: "failed", error: PLAN_TIME_BUDGET_ERROR });
    expect(Date.now() - started).toBeLessThan(5_000);

    const s = scripted([DRAFT]);
    const late = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: s.turn, deadlineMs: Date.now() - 1 });
    expect(late).toMatchObject({ result: "failed", error: PLAN_TIME_BUDGET_ERROR });
    expect(s.prompts).toHaveLength(0);
  });

  it("drops HOMBA anchors RCS does not know and keeps those it could not look up", async () => {
    const asked: string[][] = [];
    const lookupHomba = async (ids: string[]): Promise<SabraLookup> => {
      asked.push(ids);
      // HOMBA:10339 is left out: it could not be looked up
      return new Map<string, HombaSabraInfo | null>([
        ["HOMBA:12261", dhba("VTA")],
        ["HOMBA:99999", null],
      ]);
    };
    const s = scripted([DRAFT]);
    const r = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: s.turn, lookupHomba, deadlineMs: deadline() });
    expect(r.result).toBe("completed");
    if (r.result !== "completed") return;
    expect(asked).toEqual([["HOMBA:12261", "HOMBA:99999", "HOMBA:10339"]]);
    expect(r.parsed.rows[0].anchors).toEqual(["BNA:71-72", "HOMBA:12261"]);
    expect(r.parsed.rows[1].anchors).toEqual(["BNA:29-30", "HOMBA:10339"]);
    expect(r.parsed.dropped).toBe(1);
  });

  it("drops HOMBA anchors whose region SABRA covers with BNA (finished projects anchor it on the BNA area)", async () => {
    const lookupHomba = async (): Promise<SabraLookup> =>
      new Map<string, HombaSabraInfo | null>([
        ["HOMBA:12261", dhba("VTA")],
        ["HOMBA:99999", dhba("X")],
        ["HOMBA:10339", { ...dhba(""), atlas: "BNA" }],
      ]);
    const r = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: scripted([DRAFT]).turn, lookupHomba, deadlineMs: deadline() });
    expect(r.result === "completed" && r.parsed.rows[1].anchors).toEqual(["BNA:29-30", "HOMBA:99999"]);
    expect(r.result === "completed" && r.parsed.dropped).toBe(1);
  });

  it("checks the anchors of added rows in a re-plan, and keeps every anchor when the lookup fails", async () => {
    const replan = input({
      kind: "replan",
      wave: 1,
      policy: "areas",
      attachments: [],
      rows: [{ rowId: "rdone0001", roi: "STG", tlf: "hearing", rationale: "", state: "done", wave: 1, seed: true, anchors: ["BNA:71-72"], anchorsSource: "used", projectId: "p1", existing: false }],
    });
    const text = reply({
      policy: "areas",
      proposals: [{ kind: "add", rowId: "", roi: "VTA", tlf: "reward prediction", rationale: "shared", anchors: ["HOMBA:12261", "HOMBA:99999"], dependsOn: ["rdone0001"], policy: "", reason: "both rows use it" }],
    });
    const unknown = async (): Promise<SabraLookup> => new Map([["HOMBA:99999", null]]);
    const r = await runPlanJob({ input: replan, spec: SPEC, materialsIndex: null, turn: scripted([text]).turn, lookupHomba: unknown, deadlineMs: deadline() });
    expect(r.result === "completed" && r.parsed.proposals[0].row?.anchors).toEqual(["HOMBA:12261"]);
    expect(r.result === "completed" && r.parsed.dropped).toBe(1);

    const down = async (): Promise<SabraLookup> => {
      throw new Error("RCS down");
    };
    const kept = await runPlanJob({ input: replan, spec: SPEC, materialsIndex: null, turn: scripted([text]).turn, lookupHomba: down, deadlineMs: deadline() });
    expect(kept.result === "completed" && kept.parsed.proposals[0].row?.anchors).toEqual(["HOMBA:12261", "HOMBA:99999"]);
    expect(kept.result === "completed" && kept.parsed.dropped).toBe(0);
  });

  it("looks the anchors up through the RCS client", async () => {
    const rcs = await startMockRcs("secret");
    try {
      const client = new RcsClient({ url: rcs.url, token: "secret" });
      const text = reply({ rows: [row("new1", "VTA", "reward prediction", ["HOMBA:12261", "HOMBA:77777"])] });
      const r = await runPlanJob({ input: input(), spec: SPEC, materialsIndex: null, turn: scripted([text]).turn, lookupHomba: (ids) => client.lookupHomba(ids), deadlineMs: deadline() });
      expect(r.result === "completed" && r.parsed.rows[0].anchors).toEqual(["HOMBA:12261"]);
      expect(rcs.calls.map((c) => c.body.params?.arguments?.homba_id).sort()).toEqual(["HOMBA:12261", "HOMBA:77777"]);
    } finally {
      await rcs.close();
    }
  });
});

describe("planMaterialsIndex", () => {
  it("lists each file with its original and text, and asks for unread on a failed one", () => {
    const entries: MaterialEntry[] = [
      { id: "f1", kind: "file", source: "list.xlsx", path: "materials/files/01-list.xlsx", textPath: "materials/derived/f1.txt", image: false, status: "ok", note: "text extracted from the document" },
      { id: "f2", kind: "file", source: "scan.pdf", path: null, textPath: null, image: false, status: "failed", note: "file missing from storage" },
    ];
    const text = planMaterialsIndex(entries)!;
    expect(text.split("\n")).toEqual([
      '- f1 "list.xlsx": original `materials/files/01-list.xlsx` text `materials/derived/f1.txt` (ok: text extracted from the document)',
      '- f2 "scan.pdf": (failed: file missing from storage; list what you cannot read in `unread`)',
    ]);
    expect(planMaterialsIndex([])).toBeNull();
  });
});

describe("prompts/plan.md", () => {
  const spec = readFileSync(new URL("../../../prompts/plan.md", import.meta.url), "utf8");

  it("names only RCS tools that exist", () => {
    const named = new Set([...spec.matchAll(/`((?:search|get)_[a-z_]+)`/g)].map((m) => m[1]));
    expect(named.size).toBeGreaterThan(0);
    for (const t of named) expect(RCS_TOOLS).toContain(t);
  });

  it("describes every field of the output schema", () => {
    const s = PLAN_RESULT_SCHEMA;
    const fields = [
      ...Object.keys(s.properties),
      ...Object.keys(s.properties.rows.items.properties),
      ...Object.keys(s.properties.unread.items.properties),
      ...Object.keys(s.properties.proposals.items.properties),
    ];
    for (const f of new Set(fields)) expect(spec, f).toContain(`\`${f}\``);
  });
});

describe("runPlanRowJob (自律実行: the Orchestrator's AI for one row)", () => {
  const rowInput = (kind: "answer" | "resolve") =>
    buildPlanRowJobInput({
      kind,
      planId: "n4h8w2rk",
      jobId: "job_1",
      rowId: "r1",
      createdAt: "2026-10-09T00:00:00.000Z",
      locale: "ja",
      plan: { name: "Language", goal: "言語の BRA", policy: "neocortex = area" },
      canon: null,
      row: { roi: "STG", tlf: "hearing", rationale: "", wave: 1, seed: false, anchors: [], dependsOn: [] },
      project: { projectId: "p0000001", status: kind === "answer" ? "WAITING_USER_INPUT" : "FAILED", question: kind === "answer" ? "Left or both?" : null, error: null, decisionLog: "x".repeat(20_000) },
      situation: kind === "resolve" ? { state: "attention", reason: "failed", error: "Rate limit", attempts: 2, followups: 0, pr: null, options: ["retry", "skip"] } : null,
    });

  it("answers with the answer schema, in the plan's language, from the end of the decision log", async () => {
    const schemas: object[] = [];
    const prompts: string[] = [];
    const input = rowInput("answer");
    expect(input.project!.decisionLog.length).toBeLessThan(13_000);
    const o = await runPlanRowJob({
      input,
      spec: "ORCH SPEC",
      turn: async (prompt, schema) => {
        prompts.push(prompt);
        schemas.push(schema);
        return { text: JSON.stringify({ answer: "左だけ", reason: "計画の方針" }), usage };
      },
      deadlineMs: deadline(),
    });
    expect(o).toMatchObject({ result: "completed", decision: { kind: "answer", answer: "左だけ", reason: "計画の方針" }, attempts: 1 });
    expect(schemas).toEqual([PLAN_ROW_ANSWER_SCHEMA]);
    expect(prompts[0]).toContain("ORCH SPEC");
    expect(prompts[0]).toContain("Task of this job: `answer`.");
    expect(prompts[0]).toContain("Japanese");
    expect(prompts[0]).toContain("Left or both?");
  });

  it("asks once more when the action is not among the options, then fails", async () => {
    const s = scripted([JSON.stringify({ action: "push", reason: "?" }), JSON.stringify({ action: "skip", reason: "keeps failing" })]);
    const o = await runPlanRowJob({ input: rowInput("resolve"), spec: "ORCH SPEC", turn: (p, schema, signal) => (expect(schema).toBe(PLAN_ROW_RESOLVE_SCHEMA), s.turn(p, signal)), deadlineMs: deadline() });
    expect(o).toMatchObject({ result: "completed", decision: { kind: "resolve", action: "skip" }, attempts: 2 });
    expect(s.prompts[1]).toBe(PLAN_ROW_RETRY_PROMPT);
    const bad = scripted(["not json", JSON.stringify({ action: "done", reason: "" })]);
    expect(await runPlanRowJob({ input: rowInput("resolve"), spec: "S", turn: (p, _s, signal) => bad.turn(p, signal), deadlineMs: deadline() })).toMatchObject({ result: "failed", error: PLAN_FORMAT_ERROR });
  });
});

describe("prompts/orchestrator.md", () => {
  const spec = readFileSync(new URL("../../../prompts/orchestrator.md", import.meta.url), "utf8");

  it("describes every field and action of the output schemas", () => {
    for (const f of [...Object.keys(PLAN_ROW_ANSWER_SCHEMA.properties), ...Object.keys(PLAN_ROW_RESOLVE_SCHEMA.properties), ...PLAN_ROW_RESOLVE_SCHEMA.properties.action.enum]) expect(spec, f).toContain(`\`${f}\``);
  });
});

describe("JOB_PROJECT_ID", () => {
  const base = { TABLE_USERS: "t", TABLE_PROJECTS: "t", TABLE_JOBS: "t", TABLE_MESSAGES: "t", ARTIFACTS_BUCKET: "b", JOB_USER_ID: "u", JOB_ID: "j" };
  const load = async (projectId: string, mode: string) => {
    for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
    vi.stubEnv("JOB_PROJECT_ID", projectId);
    vi.stubEnv("JOB_MODE", mode);
    vi.resetModules();
    return (await import("../src/env.js")).env;
  };
  afterAll(() => vi.unstubAllEnvs());

  it("is a plan ID for a plan job", async () => {
    expect((await load("n4h8w2rk", "plan")).job).toMatchObject({ projectId: "n4h8w2rk", mode: "plan" });
    await expect(load("u7m2q9xa-1", "plan")).rejects.toThrow(/Invalid JOB_PROJECT_ID/);
    expect((await load("u7m2q9xa-1", "initial")).job.projectId).toBe("u7m2q9xa-1");
  });
});
