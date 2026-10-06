import { describe, expect, it } from "vitest";
import { PLAN_RESULT_SCHEMA, buildPlanJobInput, isDeterministicPlanAttachment, parsePlanResult, planAttachmentTypeOf, planJobKey, planJobPrompt, type PlanJobInput } from "../src/index.js";

const input = (over: Partial<PlanJobInput> = {}): PlanJobInput =>
  buildPlanJobInput({
    kind: "draft",
    planId: "n4h8w2rk",
    jobId: "job_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    locale: "ja",
    goal: "言語の BRA を一通りそろえたい",
    policy: "",
    attachments: [],
    rows: [{ rowId: "r1aaaaaaa", roi: "STG", tlf: "hearing", rationale: "", state: "pending", wave: 1, seed: false, anchors: [], anchorsSource: null, projectId: null, existing: false }],
    projects: [
      { projectId: "pdone001", name: "VOR", roi: "flocculus", tlf: "VOR", status: "COMPLETED", completed: true, canonId: null },
      { projectId: "prun0001", name: "x", roi: "x", tlf: "x", status: "RUNNING", completed: false, canonId: null },
    ],
    canons: [],
    concurrency: 2,
    wave: null,
    ...over,
  });

const row = (id: string, roi: string, tlf: string, extra: Record<string, unknown> = {}) => ({ id, roi, tlf, rationale: "why", anchors: [], dependsOn: [], priority: 0, existingProjectId: "", source: "goal", ...extra });
const reply = (body: Record<string, unknown>) => JSON.stringify({ rows: [], unread: [], policy: "", proposals: [], notes: "", ...body });

describe("plan job files", () => {
  it("keys and attachments", () => {
    expect(planJobKey("n4h8w2rk", "job_1", "input.json")).toBe("plans/n4h8w2rk/jobs/job_1/input.json");
    expect(planAttachmentTypeOf("list.xlsx")?.ext).toBe("xlsx");
    expect(planAttachmentTypeOf("figure.png")).toBeNull();
    expect(isDeterministicPlanAttachment("list.csv")).toBe(true);
    expect(isDeterministicPlanAttachment("list.pdf")).toBe(false);
  });

  it("has a strict output schema (every property required, nothing else)", () => {
    const check = (s: { type?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean; items?: unknown }) => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required ?? [])].sort()).toEqual(Object.keys(s.properties ?? {}).sort());
        for (const p of Object.values(s.properties ?? {})) check(p as never);
      }
      if (s.type === "array") check(s.items as never);
    };
    check(PLAN_RESULT_SCHEMA as never);
  });

  it("never carries key material in the input and bounds the summaries", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ projectId: `p${i}`, name: "n".repeat(500), roi: "r", tlf: "t", status: "COMPLETED" as const, completed: true, canonId: null }));
    const i = input({ projects: many });
    expect(i.projects).toHaveLength(300);
    expect(i.projects[0].name.length).toBeLessThanOrEqual(201);
    expect(JSON.stringify(i)).not.toMatch(/apiKey|encrypted|sk-/i);
  });

  it("builds the prompt from the spec, the task and the input", () => {
    const p = planJobPrompt("SPEC", input(), "- list.xlsx");
    expect(p.startsWith("SPEC")).toBe(true);
    expect(p).toContain("Task: DRAFT");
    expect(p).toContain("Japanese");
    expect(p).toContain("list.xlsx");
    expect(p).toContain('"goal":"言語の BRA を一通りそろえたい"');
  });
});

describe("parsePlanResult (draft)", () => {
  it("keeps rows, valid anchors, dependencies on rows of the draft and finished existing projects", () => {
    const r = parsePlanResult(
      reply({
        rows: [
          row("new1", "left IFG (areas 44/45)", "speech production", { anchors: ["BNA:29", "BNA:33-34", "Broca"], priority: 3 }),
          row("new2", "STG", "phonological processing", { anchors: ["BNA:75-76"] }),
          row("new3", "arcuate fasciculus", "repetition", { dependsOn: ["new1", "new2", "new9", "new3"] }),
          row("r1aaaaaaa", "STG", "hearing", { anchors: ["BNA:71-72"], dependsOn: ["new2"] }),
          row("new4", "flocculus", "VOR", { existingProjectId: "pdone001" }),
          row("new5", "x", "x", { existingProjectId: "prun0001" }),
          row("new6", "", "", {}),
          row("new7", "STG", "Phonological  processing", {}),
          row("new1", "dup", "dup", {}),
        ],
        unread: [{ source: "list.xlsx", location: "row 7", reason: "no function named" }, { source: "", location: "", reason: "" }],
        policy: " neocortex = area × projection class, subcortex = nucleus ",
      }),
      input(),
    )!;
    expect(r.rows.map((x) => [x.id, x.ref])).toEqual([
      ["new1", null],
      ["new2", null],
      ["new3", null],
      ["r1aaaaaaa", "r1aaaaaaa"],
      ["new4", null],
      ["new5", null],
    ]);
    expect(r.rows[0]).toMatchObject({ anchors: ["BNA:29-30", "BNA:33-34"], priority: 3, rationale: "why" });
    expect(r.rows[2].dependsOn).toEqual(["new1", "new2"]);
    expect(r.rows[3].dependsOn).toEqual(["new2"]);
    expect(r.rows[4].existingProjectId).toBe("pdone001");
    expect(r.rows[5].existingProjectId).toBeNull();
    expect(r.unread).toEqual([{ source: "list.xlsx", location: "row 7", reason: "no function named" }]);
    expect(r.policy).toBe("neocortex = area × projection class, subcortex = nucleus");
    // Broca, new9, new3 (itself), prun0001, the empty row, the duplicate ROI × TLF, the repeated id
    expect(r.dropped).toBe(7);
  });

  it("returns null for anything that is not the object, and ignores proposals in a draft", () => {
    expect(parsePlanResult("not json", input())).toBeNull();
    expect(parsePlanResult(JSON.stringify({ rows: "x" }), input())).toBeNull();
    const r = parsePlanResult("```json\n" + reply({ proposals: [{ kind: "policy" }] }) + "\n```", input())!;
    expect(r.proposals).toEqual([]);
    expect(r.dropped).toBe(1);
  });
});

describe("parsePlanResult (replan)", () => {
  const rp = input({
    kind: "replan",
    wave: 2,
    policy: "old policy",
    rows: [
      { rowId: "rwait0001", roi: "MTG", tlf: "naming", rationale: "", state: "pending", wave: 3, seed: false, anchors: [], anchorsSource: null, projectId: null, existing: false },
      { rowId: "rdone0001", roi: "STG", tlf: "hearing", rationale: "", state: "done", wave: 1, seed: true, anchors: [], anchorsSource: "used", projectId: "p1", existing: false },
      { rowId: "rretry001", roi: "IPL", tlf: "memory", rationale: "", state: "pending", wave: 2, seed: false, anchors: [], anchorsSource: null, projectId: "p2", existing: false },
    ],
  });

  it("keeps adds of new rows, removals of rows that have not started and a new policy", () => {
    const r = parsePlanResult(
      reply({
        rows: [row("new1", "a", "b")],
        proposals: [
          { kind: "add", rowId: "", roi: "pSTS", tlf: "audiovisual integration", rationale: "shared circuit nobody owns", anchors: ["BNA:121-122"], dependsOn: ["rdone0001", "nope"], policy: "", reason: "used by two finished rows" },
          { kind: "add", rowId: "", roi: "MTG", tlf: "Naming", rationale: "", anchors: [], dependsOn: [], policy: "", reason: "duplicate" },
          { kind: "remove", rowId: "rwait0001", roi: "", tlf: "", rationale: "", anchors: [], dependsOn: [], policy: "", reason: "covered by STG" },
          { kind: "remove", rowId: "rdone0001", roi: "", tlf: "", rationale: "", anchors: [], dependsOn: [], policy: "", reason: "done" },
          { kind: "remove", rowId: "rretry001", roi: "", tlf: "", rationale: "", anchors: [], dependsOn: [], policy: "", reason: "started" },
          { kind: "policy", rowId: "", roi: "", tlf: "", rationale: "", anchors: [], dependsOn: [], policy: "new policy", reason: "finer areas" },
          { kind: "policy", rowId: "", roi: "", tlf: "", rationale: "", anchors: [], dependsOn: [], policy: "old policy", reason: "same" },
        ],
      }),
      rp,
    )!;
    expect(r.rows).toEqual([]);
    expect(r.proposals.map((p) => p.kind)).toEqual(["add", "remove", "policy"]);
    expect(r.proposals[0].row).toMatchObject({ roi: "pSTS", anchors: ["BNA:121-122"], dependsOn: ["rdone0001"] });
    expect(Object.keys(r.proposals[0].row!).sort()).toEqual(["anchors", "dependsOn", "rationale", "roi", "tlf"]);
    expect(r.proposals[1].rowId).toBe("rwait0001");
    expect(r.proposals[2].policy).toBe("new policy");
    // the draft row, "nope", the duplicate add, removing a done row and a started row, the unchanged policy
    expect(r.dropped).toBe(6);
  });
});
