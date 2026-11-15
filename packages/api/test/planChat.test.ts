// The chat with the Orchestrator (lib/planChat.ts): the owner writes, a `chat` plan job writes the reply, and the reply's
// actions are carried out under the plan's lease — on the draft (with undo), or on the running mission. A draft never
// starts on its own: 「開始」 stays the owner's.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePlanResponse, JobRecord, PlanChatInput, PlanChatMessage, PlanChatResult, PlanDetailResponse, PlanEventRecord, PlanRecord, PlanRowRecord } from "@cobrac/shared";
import { PLAN_CHAT_INPUT_SCHEMA, PLAN_CHAT_RESULT_SCHEMA, parsePlanChatResult, planJobKey } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
const s3 = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
  getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
  getCanonJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putCanonJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
  getPlanJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putPlanJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const aws = await import("../src/lib/aws.js");
const { handler: runnerTick } = await import("../src/handlers/planRunner.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const now = "2026-10-09T00:00:00.000Z";

function call(who: typeof A, method: string, path: string, body?: unknown) {
  const event = { requestContext: { authorizer: { jwt: { claims: who } } } };
  return app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
function user(who: typeof A, extra: Record<string, unknown> = {}) {
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, roi: string) => rowsOf(planId).find((r) => r.roi === roi)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const eventsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[];
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const chatOf = (planId: string) => (fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("MSG#")) as unknown as PlanChatMessage[]).sort((a, b) => (a.sk < b.sk ? -1 : 1));

/** The queued chat job of the plan, and what the worker would write for it. */
function chatJob(planId: string): { job: JobRecord; input: PlanChatInput } {
  const job = jobs().find((j) => j.projectId === planId && j.type === "plan" && j.planJobKind === "chat" && j.status === "QUEUED")!;
  expect(job).toBeTruthy();
  return { job, input: JSON.parse(s3.get(planJobKey(planId, job.jobId, "input.json"))!) as PlanChatInput };
}
function chatDone(planId: string, job: JobRecord, reply: string, actions: PlanChatResult["actions"]) {
  const result: PlanChatResult = { schema: PLAN_CHAT_RESULT_SCHEMA, planId, jobId: job.jobId, model: "m", createdAt: now, reply, actions, dropped: 0 };
  s3.set(planJobKey(planId, job.jobId, "result.json"), JSON.stringify(result));
  fake.put("jobs", { ...job, status: "COMPLETED", costUsd: 0.01 } as never);
}

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

async function draftPlan(): Promise<string> {
  const created = await json<CreatePlanResponse>(
    call(A, "POST", "/plans", { name: "Language", goal: "言語の BRA", rows: [{ roi: "left IFG", tlf: "speech production" }, { roi: "STG", tlf: "speech perception" }] }),
  );
  expect(planOf(created.plan.planId).status).toBe("DRAFT");
  return created.plan.planId;
}

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  vi.mocked(aws.enqueueRun).mockClear();
  user(A);
  user(ADMIN, { role: "admin", userKey: "u9a8b7c6" });
});

describe("the chat with the Orchestrator", () => {
  it("changes a draft as asked, reports each action under the reply, and undoes it", async () => {
    const planId = await draftPlan();
    const r = await call(A, "POST", `/plans/${planId}/chat`, { text: "海馬の記憶も足して、STG を先にしてください", locale: "ja" });
    expect(r.status).toBe(202);
    // the reply comes from a chat job, queued at once while a slot is free
    const { job, input } = chatJob(planId);
    expect(input).toMatchObject({ schema: PLAN_CHAT_INPUT_SCHEMA, phase: "planning", locale: "ja", messages: [{ role: "user", text: "海馬の記憶も足して、STG を先にしてください" }] });
    expect(input.actions).toEqual(expect.arrayContaining(["add_row", "remove_row", "edit_row", "priority", "policy", "redraft"]));
    expect(input.actions).not.toContain("pause");
    const stg = rowsOf(planId).find((x) => x.roi === "STG")!;
    chatDone(planId, job, "海馬の行を足し、STG を先にしました。", [
      { kind: "add_row", roi: "hippocampus", tlf: "episodic memory", rationale: "記憶の土台", anchors: [], dependsOn: [] },
      { kind: "priority", rowId: stg.rowId, priority: 5 },
    ]);
    await runnerTick();
    const msgs = chatOf(planId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "orchestrator"]);
    expect(msgs[1]).toMatchObject({ text: "海馬の行を足し、STG を先にしました。", undoable: true, outcomes: [{ kind: "add_row", ok: true }, { kind: "priority", ok: true }] });
    expect(rowsOf(planId).map((x) => x.roi).sort()).toEqual(["STG", "hippocampus", "left IFG"]);
    expect(rowOf(planId, "STG").priority).toBe(5);
    expect(planOf(planId)).toMatchObject({ status: "DRAFT", chat: { status: "done" } });
    expect(eventsOf(planId).some((e) => e.type === "chat_applied")).toBe(true);
    // the plan's page reads the conversation with the plan
    const d = await json<PlanDetailResponse>(call(A, "GET", `/plans/${planId}`));
    expect(d.chat?.map((m) => m.role)).toEqual(["user", "orchestrator"]);

    await json(call(A, "POST", `/plans/${planId}/chat/${msgs[1].messageId}/undo`, {}));
    expect(rowsOf(planId).map((x) => x.roi).sort()).toEqual(["STG", "left IFG"]);
    expect(rowOf(planId, "STG").priority ?? null).toBe(null);
    expect(chatOf(planId)[1].undoneAt).toBeTruthy();
    expect((await call(A, "POST", `/plans/${planId}/chat/${msgs[1].messageId}/undo`, {})).status).toBe(409);
    // nothing started on its own
    expect(planOf(planId).status).toBe("DRAFT");
  });

  it("answers only, when the reply has no actions, and asks again for a message written while the job ran", async () => {
    const planId = await draftPlan();
    await json(call(A, "POST", `/plans/${planId}/chat`, { text: "何件ありますか？" }));
    const first = chatJob(planId);
    await json(call(A, "POST", `/plans/${planId}/chat`, { text: "あと費用も教えて" }));
    // one job at a time: the second message waits for the next one
    expect(jobs().filter((j) => j.planJobKind === "chat")).toHaveLength(1);
    chatDone(planId, first.job, "2 件です。", []);
    await runnerTick();
    expect(chatOf(planId).map((m) => m.text)).toEqual(["何件ありますか？", "あと費用も教えて", "2 件です。"]);
    expect(chatOf(planId)[2].outcomes).toBeUndefined();
    const second = chatJob(planId);
    expect(second.job.jobId).not.toBe(first.job.jobId);
    expect(second.input.messages.map((m) => m.text)).toEqual(["何件ありますか？", "あと費用も教えて", "2 件です。"]);
  });

  it("writes a failed reply when the job fails, and checks who may write", async () => {
    const planId = await draftPlan();
    expect((await call(A, "POST", `/plans/${planId}/chat`, { text: "  " })).status).toBe(400);
    user({ sub: "sub-bob", email: "bob@example.com" });
    expect((await call({ sub: "sub-bob", email: "bob@example.com" }, "POST", `/plans/${planId}/chat`, { text: "hi" })).status).toBe(404);
    await json(call(A, "POST", `/plans/${planId}/chat`, { text: "hi" }));
    const { job } = chatJob(planId);
    fake.put("jobs", { ...job, status: "FAILED", errorMessage: "model error" } as never);
    await runnerTick();
    expect(chatOf(planId).at(-1)).toMatchObject({ role: "orchestrator", failed: true });
    expect(planOf(planId).chat?.status).toBe("failed");
  });

  it("acts on a running mission: skips a row that has not started and resumes, but never starts or stops it", async () => {
    await setLimits(1, 1);
    const planId = await draftPlan();
    await json(call(A, "POST", `/plans/${planId}/confirm`, {}));
    expect(planOf(planId).status).toBe("RUNNING");
    await json(call(A, "POST", `/plans/${planId}/pause`, {}));
    const pending = rowsOf(planId).find((x) => x.state === "pending")!;
    expect(pending).toBeTruthy();
    // the one slot is taken by the running row: the chat job waits for it
    await json(call(A, "POST", `/plans/${planId}/chat`, { text: "残りはスキップして再開してください" }));
    expect(planOf(planId).chat?.status).toBe("waiting");
    await setLimits(4, 4);
    await runnerTick();
    const { job, input } = chatJob(planId);
    expect(input.phase).toBe("running");
    expect(input.actions).toEqual(expect.arrayContaining(["retry", "skip", "resolve", "resume"]));
    expect(input.actions).not.toContain("redraft");
    expect(input.actions).not.toContain("pause");
    chatDone(planId, job, "残りをスキップして再開しました。", [{ kind: "skip", rowId: pending.rowId }, { kind: "resume" }]);
    await runnerTick();
    expect(rowsOf(planId).find((x) => x.rowId === pending.rowId)!.state).toBe("skipped");
    expect(planOf(planId).status).toBe("RUNNING");
    expect(chatOf(planId).at(-1)!.outcomes).toEqual([expect.objectContaining({ kind: "skip", ok: true }), expect.objectContaining({ kind: "resume", ok: true })]);
    expect(chatOf(planId).at(-1)!.undoable).toBeUndefined();
  });
});

describe("parsePlanChatResult", () => {
  const input = {
    schema: PLAN_CHAT_INPUT_SCHEMA,
    actions: ["add_row", "remove_row", "priority", "redraft"],
    plan: { status: "DRAFT" },
    rows: [{ rowId: "r1", roi: "STG", tlf: "hearing", state: "pending" }],
  } as unknown as PlanChatInput;
  const empty = { rowId: "", roi: "", tlf: "", rationale: "", anchors: [], dependsOn: [], priority: 0, resolution: "", policy: { scope: "", granularity: "", evidence: "", priority: "", decisions: "", fromAnswers: [] }, note: "" };
  const parse = (actions: object[]) => parsePlanChatResult(JSON.stringify({ reply: "ok", actions: actions.map((a) => ({ ...empty, ...a })) }), input);
  it("keeps the allowed actions on known rows and drops the rest", () => {
    const r = parse([{ kind: "priority", rowId: "r1", priority: 3 }, { kind: "pause" }, { kind: "remove_row", rowId: "r9" }, { kind: "add_row", roi: "STG", tlf: "hearing" }]);
    expect(r?.actions).toEqual([{ kind: "priority", rowId: "r1", priority: 3 }]);
    expect(r?.dropped).toBe(3);
  });
  it("lets a redraft go alone", () => {
    expect(parse([{ kind: "redraft", note: "全部やり直し" }, { kind: "priority", rowId: "r1", priority: 1 }])?.actions.map((a) => a.kind)).toEqual(["redraft"]);
  });
  it("reads nothing from a reply that is not JSON", () => {
    expect(parsePlanChatResult("hello", input)).toBeNull();
  });
});
