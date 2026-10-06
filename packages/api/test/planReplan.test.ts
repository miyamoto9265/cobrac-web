// BRA Planner stage 2: re-planning an automatically ordered plan after each wave (the anchors its finished rows
// actually used, the re-plan job and its proposals), and plans ordered by hand, which never re-plan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePlanResponse, JobRecord, PlanDetailResponse, PlanEventRecord, PlanJobInput, PlanJobResult, PlanProposalRecord, PlanRecord, PlanRowRecord, ProjectRecord } from "@cobrac/shared";
import { PLAN_JOB_RESULT_SCHEMA, planJobKey, replanRows } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
const s3 = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
  getPlanJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putPlanJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
  getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
}));
vi.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: class {
    send = vi.fn(async () => ({ tasks: [{ taskArn: "arn:task/1" }] }));
  },
  RunTaskCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const aws = await import("../src/lib/aws.js");
const { advancePlan } = await import("../src/lib/planRunner.js");
const { storeProposals } = await import("../src/lib/planJobs.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const now = "2026-10-06T00:00:00.000Z";

function call(who: typeof A, method: string, path: string, body?: unknown) {
  const event = { requestContext: { authorizer: { jwt: { claims: who } } } };
  return app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
const status = async (r: Response | Promise<Response>) => (await r).status;
function user(who: typeof A, extra: Record<string, unknown> = {}) {
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, tlf: string) => rowsOf(planId).find((r) => r.tlf === tlf)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const proposalsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("PROP#")) as unknown as PlanProposalRecord[];
const eventsOf = (planId: string) => (fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[]).sort((a, b) => (a.sk < b.sk ? -1 : 1));
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const planJobs = (planId: string) => jobs().filter((j) => j.projectId === planId && j.type === "plan");
const projects = () => fake.items("projects") as unknown as ProjectRecord[];
const snapshot = (planId: string) => Object.fromEntries(rowsOf(planId).map((r) => [r.rowId, `${r.state}/${r.wave}/${(r.anchors ?? []).join(",")}`]));

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

/** What the dispatcher and the worker would do: the project of `tlf` moves to `to`, its active job with it. */
function projectStatus(planId: string, tlf: string, to: ProjectRecord["status"]) {
  const row = rowOf(planId, tlf);
  const p = projects().find((x) => x.projectId === row.projectId)!;
  fake.put("projects", { ...p, status: to, ...(to === "COMPLETED" ? { hasArtifacts: true, revision: 1 } : {}) } as never);
  const j = jobs().find((x) => x.jobId === p.activeJobId)!;
  fake.put("jobs", { ...j, status: to } as never);
}

function finishJob(planId: string, jobId: string, result: Partial<PlanJobResult>) {
  const input = JSON.parse(s3.get(planJobKey(planId, jobId, "input.json"))!) as PlanJobInput;
  const j = jobs().find((x) => x.jobId === jobId)!;
  const full: PlanJobResult = { schema: PLAN_JOB_RESULT_SCHEMA, kind: input.kind, planId, jobId, model: j.model ?? "", locale: input.locale, createdAt: now, rows: [], unread: [], policy: "", proposals: [], notes: "", dropped: 0, ...result };
  s3.set(planJobKey(planId, jobId, "result.json"), JSON.stringify(full));
  fake.put("jobs", { ...j, status: "COMPLETED", costUsd: 0.02, endedAt: now } as never);
}

const bna = (...lefts: number[]) => lefts.map((l) => `BNA:${l}-${l + 1}`);
const LANGUAGE: { tlf: string; roi: string; anchors: string[]; deps?: string[] }[] = [
  { tlf: "speech production", roi: "left IFG (areas 44/45)", anchors: bna(29, 33, 35, 37, 39, 61, 63, 75, 167) },
  { tlf: "phonological processing", roi: "STG", anchors: bna(71, 73, 75, 79, 121, 123, 145, 29, 39) },
  { tlf: "repetition", roi: "arcuate fasciculus", anchors: bna(75, 145, 29, 37), deps: ["speech production", "phonological processing"] },
  { tlf: "reading", roi: "angular gyrus / VWFA", anchors: bna(135, 107, 91, 33) },
  { tlf: "writing", roi: "Exner's area", anchors: bna(25, 139, 57) },
  { tlf: "semantic comprehension", roi: "MTG", anchors: bna(81, 83, 87, 35) },
  { tlf: "naming", roi: "MTG / ITG", anchors: bna(83, 89, 33) },
  { tlf: "auditory word recognition", roi: "STG / pSTS", anchors: bna(73, 79, 121, 81) },
  { tlf: "verbal working memory", roi: "IPL / IFG", anchors: bna(145, 29, 17) },
  { tlf: "syntactic processing", roi: "IFG pars opercularis / pSTS", anchors: bna(37, 39, 123) },
  { tlf: "articulatory planning", roi: "ventral precentral gyrus / insula", anchors: bna(61, 63, 167) },
  { tlf: "prosody", roi: "anterior STG", anchors: bna(79, 77) },
];

/**
 * A confirmed language plan ordered automatically (seeds: speech production, then phonological processing). The rows
 * get fixed IDs in LANGUAGE order, so ties of the order (broken by row ID) are the same in every run.
 */
async function runningLanguagePlan(): Promise<string> {
  const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", rows: LANGUAGE.map((r) => ({ roi: r.roi, tlf: r.tlf })) }))).plan.planId;
  const fixedId = (tlf: string) => `r${String(LANGUAGE.findIndex((l) => l.tlf === tlf) + 1).padStart(7, "0")}`;
  const typed = rowsOf(planId);
  const table = fake.table("plans");
  for (const [k, v] of [...table]) if (v.planId === planId && String(v.sk).startsWith("ROW#")) table.delete(k);
  for (const l of LANGUAGE) {
    const rowId = fixedId(l.tlf);
    fake.put("plans", { ...typed.find((r) => r.tlf === l.tlf)!, rowId, sk: `ROW#${rowId}`, anchors: l.anchors, anchorsSource: "predicted", dependsOn: (l.deps ?? []).map(fixedId) } as never);
  }
  await json(call(A, "POST", `/plans/${planId}/order`));
  await json(call(A, "POST", `/plans/${planId}/confirm`, { locale: "en" }));
  return planId;
}

/** The uc.json of a finished project: its UCs and Collections anchored on what the project actually used. */
function ucJson(planId: string, tlf: string, descriptors: string[]) {
  const P = rowOf(planId, tlf).projectId!;
  s3.set(`users/${A.sub}/${P}/workspace/${P}_HCD/uc.json`, JSON.stringify({ ucs: descriptors.slice(0, -1).map((d, i) => ({ circuitId: `U${i}`, descriptor: d })), collections: [{ circuitId: "C1", descriptor: descriptors.at(-1) }] }));
}

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  for (const f of Object.values(aws)) if (vi.isMockFunction(f)) f.mockClear();
  user(A);
  user(ADMIN, { role: "admin" });
});

describe("plans: re-planning after each wave", () => {
  it("re-orders only the rows that have not started with the anchors finished rows used, then asks the re-plan job, whose proposals change nothing until accepted", async () => {
    await setLimits(4, 4);
    const planId = await runningLanguagePlan();
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.tlf)).toEqual(["speech production"]);
    expect(planOf(planId)).toMatchObject({ ordering: "auto", activeWave: 1 });
    expect(planJobs(planId)).toEqual([]);

    // wave 1 finishes; its project used other anchors than predicted
    projectStatus(planId, "speech production", "COMPLETED");
    ucJson(planId, "speech production", ["BNA:25-26/side:left", "BNA:139", "BNA:135-136", "BNA:107-108"]);
    const before = rowsOf(planId).map((r) => (r.tlf === "speech production" ? { ...r, state: "done" as const, anchors: bna(25, 139, 135, 107) } : r));
    const expected = replanRows(before, 1, 4);
    expect(expected.size).toBeGreaterThan(0);
    await advancePlan(planId);

    expect(rowOf(planId, "speech production")).toMatchObject({ state: "done", anchors: bna(25, 139, 135, 107), anchorsSource: "used" });
    for (const r of before) {
      const after = rowOf(planId, r.tlf);
      if (expected.has(r.rowId)) {
        expect(r.state === "pending" && !r.projectId).toBe(true);
        expect(after.wave).toBe(expected.get(r.rowId));
      } else expect(after.wave).toBe(r.wave);
    }
    expect(rowOf(planId, "reading").wave).toBe(3);
    expect(eventsOf(planId).find((e) => e.type === "replanned")).toMatchObject({ detail: { wave: 1, moved: expected.size } });
    expect(planOf(planId)).toMatchObject({ lastReplanWave: 1, activeWave: 2, replan: { kind: "replan", status: "queued", wave: 1, requestedBy: "runner" } });
    // the re-plan job took a slot; the next seed starts alone in its wave
    const [job] = planJobs(planId);
    expect(job).toMatchObject({ type: "plan", planJobKind: "replan", status: "QUEUED", projectId: planId });
    const input = JSON.parse(s3.get(planJobKey(planId, job.jobId, "input.json"))!) as PlanJobInput;
    expect(input).toMatchObject({ kind: "replan", wave: 1, locale: "en", concurrency: 4 });
    expect(input.rows).toHaveLength(12);
    expect(input.rows.find((r) => r.tlf === "speech production")).toMatchObject({ state: "done", anchorsSource: "used" });
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.tlf)).toEqual(["phonological processing"]);
    // each wave is re-planned once
    await advancePlan(planId);
    expect(eventsOf(planId).filter((e) => e.type === "replanned")).toHaveLength(1);
    expect(planJobs(planId)).toHaveLength(1);

    // the job proposes; the proposals are stored, nothing else changes
    const id = (tlf: string) => rowOf(planId, tlf).rowId;
    finishJob(planId, job.jobId, {
      proposals: [
        { kind: "add", rowId: null, row: { roi: "left pSTS", tlf: "voice recognition", rationale: "Shares the STS circuit of the finished rows.", anchors: bna(121, 123), dependsOn: [id("phonological processing")] }, policy: null, reason: "Nobody owns the voice area yet." },
        { kind: "remove", rowId: id("prosody"), row: null, policy: null, reason: "Covered by phonological processing." },
        { kind: "policy", rowId: null, row: null, policy: "neocortex = area, subcortex = nucleus", reason: "Projection classes were not separable." },
        { kind: "remove", rowId: id("naming"), row: null, policy: null, reason: "Covered by reading." },
        { kind: "remove", rowId: id("writing"), row: null, policy: null, reason: "Covered by reading." },
        // not in the plan: dropped
        { kind: "remove", rowId: "rzzzzzzz", row: null, policy: null, reason: "?" },
      ],
    });
    const rowsBefore = snapshot(planId);
    await advancePlan(planId);
    expect(planOf(planId).replan).toMatchObject({ status: "done", jobId: job.jobId, dropped: 1 });
    expect(eventsOf(planId).at(-1)).toMatchObject({ type: "proposals_received", detail: { n: 5, wave: 1 } });
    expect(proposalsOf(planId)).toHaveLength(5);
    expect(proposalsOf(planId).every((p) => p.status === "open" && p.jobId === job.jobId && p.wave === 1)).toBe(true);
    expect(snapshot(planId)).toEqual(rowsBefore);
    expect(planOf(planId).policy).toBeUndefined();
    // stored once even if the step runs again
    await advancePlan(planId);
    expect(proposalsOf(planId)).toHaveLength(5);

    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(d.proposals).toHaveLength(5);
    expect(d.planJobsCostUsd).toBeCloseTo(0.02);
    const prop = (kind: string, rowId?: string) => d.proposals.find((p) => p.kind === kind && (rowId === undefined || p.rowId === rowId))!;

    // accept: a new row placed after the active wave
    const add = await json<{ proposal: PlanProposalRecord }>(call(A, "POST", `/plans/${planId}/proposals/${prop("add").proposalId}/accept`));
    expect(add.proposal).toMatchObject({ status: "accepted", decidedBy: A.sub });
    const voice = rowOf(planId, "voice recognition");
    expect(voice).toMatchObject({ state: "pending", source: "llm", anchors: bna(121, 123), anchorsSource: "predicted", dependsOn: [id("phonological processing")], existing: null });
    expect(voice.wave).toBeGreaterThan(2);
    expect(planOf(planId).rowCount).toBe(13);
    expect(eventsOf(planId).at(-1)).toMatchObject({ type: "proposal_accepted", rowId: voice.rowId, detail: { kind: "add" } });
    // accept: the row is left out; the policy changes
    await json(call(A, "POST", `/plans/${planId}/proposals/${prop("remove", id("prosody")).proposalId}/accept`));
    expect(rowOf(planId, "prosody").state).toBe("skipped");
    await json(call(A, "POST", `/plans/${planId}/proposals/${prop("policy").proposalId}/accept`));
    expect(planOf(planId).policy).toBe("neocortex = area, subcortex = nucleus");
    // reject: nothing changes
    const writing = rowOf(planId, "writing");
    await json(call(A, "POST", `/plans/${planId}/proposals/${prop("remove", id("writing")).proposalId}/reject`));
    expect(rowOf(planId, "writing")).toEqual(writing);
    expect(proposalsOf(planId).find((p) => p.rowId === writing.rowId)).toMatchObject({ status: "rejected", decidedBy: A.sub });
    expect(eventsOf(planId).at(-1)!.type).toBe("proposal_rejected");
    // a row that has started meanwhile cannot be removed: the proposal is stale
    const naming = prop("remove", id("naming"));
    fake.put("plans", { ...rowOf(planId, "naming"), state: "running", projectId: "pnaming1" } as never);
    expect(await status(call(A, "POST", `/plans/${planId}/proposals/${naming.proposalId}/accept`))).toBe(409);
    expect(proposalsOf(planId).find((p) => p.proposalId === naming.proposalId)!.status).toBe("stale");
    expect(rowOf(planId, "naming").state).toBe("running");
    // decided proposals stay decided
    expect(await status(call(A, "POST", `/plans/${planId}/proposals/${prop("add").proposalId}/accept`))).toBe(409);
    expect(await status(call(A, "POST", `/plans/${planId}/proposals/${prop("add").proposalId}/reject`))).toBe(409);
    expect(await status(call(A, "POST", `/plans/${planId}/proposals/q0000000/accept`))).toBe(404);
    expect(await status(call(A, "POST", `/plans/${planId}/proposals/bogus/accept`))).toBe(404);
  });

  it("queues the re-plan job only when a slot is free, never while paused, and before the next rows", async () => {
    await setLimits(1, 1);
    const planId = await runningLanguagePlan();
    projectStatus(planId, "speech production", "COMPLETED");
    // another job of the owner holds the only slot
    fake.put("jobs", { projectId: "pother01", jobId: "job_other", userId: A.sub, type: "initial", status: "RUNNING", createdAt: now, updatedAt: now } as never);
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ lastReplanWave: 1, replan: { status: "waiting" } });
    expect(planJobs(planId)).toEqual([]);
    expect(rowOf(planId, "phonological processing").state).toBe("pending");

    // paused: the request waits even with a free slot
    await json(call(A, "POST", `/plans/${planId}/pause`));
    fake.put("jobs", { ...jobs().find((j) => j.jobId === "job_other")!, status: "COMPLETED" } as never);
    await advancePlan(planId);
    expect(planJobs(planId)).toEqual([]);
    expect(planOf(planId).replan!.status).toBe("waiting");

    // resumed: the job takes the free slot before the next row
    await json(call(A, "POST", `/plans/${planId}/resume`));
    expect(planJobs(planId)).toHaveLength(1);
    expect(rowOf(planId, "phonological processing").state).toBe("pending");
    await advancePlan(planId);
    expect(rowOf(planId, "phonological processing").state).toBe("pending");

    // no proposals: the plan goes on
    finishJob(planId, planJobs(planId)[0].jobId, { proposals: [] });
    await advancePlan(planId);
    expect(planOf(planId).replan).toMatchObject({ status: "done" });
    expect(proposalsOf(planId)).toEqual([]);
    expect(rowOf(planId, "phonological processing").state).toBe("running");
  });

  it("goes on when the re-plan job fails, and drops a pending re-plan when the plan completes", async () => {
    await setLimits(4, 4);
    const planId = await runningLanguagePlan();
    projectStatus(planId, "speech production", "COMPLETED");
    await advancePlan(planId);
    const [job] = planJobs(planId);
    fake.put("jobs", { ...job, status: "FAILED", errorMessage: "boom" } as never);
    await advancePlan(planId);
    expect(planOf(planId).replan).toMatchObject({ status: "failed", error: "boom" });
    expect(eventsOf(planId).some((e) => e.type === "replan_failed")).toBe(true);
    expect(planOf(planId).status).toBe("RUNNING");

    // the owner leaves every other row out while a new re-plan job is queued: it is stopped with the plan's end
    projectStatus(planId, "phonological processing", "COMPLETED");
    await advancePlan(planId);
    const second = planJobs(planId).find((j) => j.jobId !== job.jobId)!;
    expect(second).toMatchObject({ status: "QUEUED", planJobKind: "replan" });
    for (const r of rowsOf(planId)) if (r.state === "pending") fake.put("plans", { ...r, state: "skipped" } as never);
    for (const r of rowsOf(planId)) if (r.state === "running") projectStatus(planId, r.tlf, "COMPLETED");
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "COMPLETED", replan: { status: "cancelled" } });
    expect(jobs().find((j) => j.jobId === second.jobId)!.status).toBe("CANCELLED");
  });

  it("queues no re-plan job for a plan cancelled while the job's input is written", async () => {
    await setLimits(4, 4);
    const planId = await runningLanguagePlan();
    projectStatus(planId, "speech production", "COMPLETED");
    // the owner cancels (which takes no lease) in the middle of the runner's step
    vi.mocked(aws.putPlanJson).mockImplementationOnce(async (key: string, v: unknown) => {
      s3.set(key, JSON.stringify(v));
      await json(call(A, "POST", `/plans/${planId}/cancel`));
    });
    await advancePlan(planId);
    expect(planOf(planId)).toMatchObject({ status: "CANCELLED", replan: { status: "cancelled" } });
    expect(planJobs(planId)).toEqual([]);
    expect(vi.mocked(aws.enqueueRun).mock.calls.filter(([m]) => m.projectId === planId)).toEqual([]);
    expect(rowOf(planId, "phonological processing").state).toBe("pending");
  });

  it("stops a re-plan job a cancel could not see yet (it landed before the job was stored)", async () => {
    await setLimits(4, 4);
    const planId = await runningLanguagePlan();
    projectStatus(planId, "speech production", "COMPLETED");
    // what such a cancel leaves behind: the plan cancelled, the re-plan marked cancelled, no job stopped
    vi.mocked(aws.enqueueRun).mockImplementationOnce(async () => {
      const p = planOf(planId);
      fake.put("plans", { ...p, status: "CANCELLED", cancelledAt: now, replan: { ...p.replan!, status: "cancelled" } } as never);
    });
    await advancePlan(planId);
    const [job] = planJobs(planId);
    expect(job).toMatchObject({ planJobKind: "replan", status: "CANCELLED" });
    expect(planOf(planId)).toMatchObject({ status: "CANCELLED", replan: { status: "cancelled" } });
    expect(rowOf(planId, "phonological processing").state).toBe("pending");
  });

  it("stores the proposals of a result once: storing it again keeps their IDs and decisions", async () => {
    await setLimits(4, 4);
    const planId = await runningLanguagePlan();
    const parsed = {
      proposals: [
        { kind: "policy" as const, rowId: null, row: null, policy: "neocortex = area", reason: "Projection classes were not separable." },
        { kind: "remove" as const, rowId: rowOf(planId, "prosody").rowId, row: null, policy: null, reason: "Covered by phonological processing." },
        { kind: "add" as const, rowId: null, row: { roi: "left pSTS", tlf: "voice recognition", rationale: "", anchors: bna(121), dependsOn: [], wave: 1, priority: null } as never, policy: null, reason: "Nobody owns it yet." },
      ],
    };
    expect(await storeProposals(planId, "job_same", 1, parsed)).toBe(3);
    const first = proposalsOf(planId);
    expect(first.find((p) => p.kind === "add")!.row).toEqual({ roi: "left pSTS", tlf: "voice recognition", rationale: "", anchors: bna(121), dependsOn: [] });
    const remove = first.find((p) => p.kind === "remove")!;
    await json(call(A, "POST", `/plans/${planId}/proposals/${remove.proposalId}/reject`));
    // a step that stopped before recording the re-plan as done stores the same result again
    await storeProposals(planId, "job_same", 1, parsed);
    expect(proposalsOf(planId).map((p) => p.proposalId).sort()).toEqual(first.map((p) => p.proposalId).sort());
    expect(proposalsOf(planId).find((p) => p.proposalId === remove.proposalId)).toMatchObject({ status: "rejected", decidedBy: A.sub });
    // another job's proposals are new ones
    await storeProposals(planId, "job_next", 2, parsed);
    expect(proposalsOf(planId)).toHaveLength(6);
  });

  it("never re-plans a plan ordered by hand: no uc.json reads, no plan jobs", async () => {
    await setLimits(4, 4);
    const planId = (await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Manual", rows: [{ roi: "A", tlf: "a", wave: 1 }, { roi: "B", tlf: "b", wave: 2 }, { roi: "C", tlf: "c", wave: 2 }] }))).plan.planId;
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    projectStatus(planId, "a", "COMPLETED");
    await advancePlan(planId);
    expect(rowsOf(planId).filter((r) => r.state === "running").map((r) => r.tlf).sort()).toEqual(["b", "c"]);
    expect(aws.getObjectText).not.toHaveBeenCalled();
    expect(aws.getPlanJson).not.toHaveBeenCalled();
    expect(aws.putPlanJson).not.toHaveBeenCalled();
    expect(planJobs(planId)).toEqual([]);
    expect(planOf(planId).lastReplanWave).toBeUndefined();
    expect(proposalsOf(planId)).toEqual([]);
  });
});
