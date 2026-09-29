import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteProjectResponse, JobRecord, MessageRecord, ProjectRecord, UpdateProjectResponse, UsageSummary } from "@cobrac/shared";
import { PROJECT_ID_REGEX, USER_KEY_REGEX } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);

const posted = vi.hoisted(() => [] as { connectionId: string; data: { type: string; projectId: string } }[]);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send(cmd: { input: { ConnectionId: string; Data: Buffer } }) {
      posted.push({ connectionId: cmd.input.ConnectionId, data: JSON.parse(cmd.input.Data.toString()) });
    }
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));

const presign = vi.hoisted(() => vi.fn(async () => "https://signed.example/x"));
vi.mock("../src/lib/aws.js", () => ({
  presignDownload: presign,
  enqueueRun: vi.fn(async () => undefined),
  listArtifacts: vi.fn(async () => []),
  getObjectText: vi.fn(async () => null),
  putObjectText: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  encryptApiKey: vi.fn(async () => "enc"),
  stopEcsTask: vi.fn(async () => undefined),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const { handler: broadcast } = await import("../src/handlers/broadcaster.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };

function call(who: typeof A, method: string, path: string, body?: unknown) {
  const event = { requestContext: { authorizer: { jwt: { claims: who } } } };
  return app.request(
    path,
    { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined },
    { event, lambdaContext: {} },
  );
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const now = "2026-09-01T00:00:00.000Z";
function legacyProject(userId: string, usage: number): ProjectRecord {
  return {
    userId,
    projectId: "VOR",
    roi: "flocculus",
    tlf: "VOR",
    contributor: userId,
    status: "COMPLETED",
    currentStep: "XLSX",
    stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" },
    activeJobId: null,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: true,
    errorMessage: null,
    usage: { inputTokens: usage, cachedInputTokens: 0, outputTokens: usage, reasoningOutputTokens: 0 },
    costUsd: usage / 1000,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}
function job(userId: string, jobId: string, tokens: number): JobRecord {
  return {
    projectId: "VOR",
    jobId,
    userId,
    type: "initial",
    status: "COMPLETED",
    instruction: null,
    pendingAnswer: null,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: now,
    endedAt: now,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    model: "gpt-5.6",
    usage: { inputTokens: tokens, cachedInputTokens: 0, outputTokens: tokens, reasoningOutputTokens: 0 },
    costUsd: tokens / 1000,
  };
}
function message(jobId: string, content: string, sk: string): MessageRecord {
  return { projectId: "VOR", sk, messageId: `m_${sk}`, jobId, role: "agent", type: "agent_message", content, step: null, createdAt: now };
}

/** Alice and Bob both own a legacy project "VOR"; its jobs and (pre-v0.7, userId-less) messages share one partition. */
function seedLegacyCollision() {
  for (const [who, key] of [
    [A, "u7m2q9xa"],
    [B, "u3k8d0hn"],
  ] as const) {
    fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: key, createdAt: now, updatedAt: now });
  }
  fake.put("projects", legacyProject(A.sub, 100));
  fake.put("projects", legacyProject(B.sub, 7));
  fake.put("jobs", job(A.sub, "job_a", 100));
  fake.put("jobs", job(B.sub, "job_b", 7));
  fake.put("messages", message("job_a", "alice secret", "1"));
  fake.put("messages", message("job_b", "bob secret", "2"));
  fake.put("messages", { ...message("job_b", "bob new", "3"), userId: B.sub });
}

beforeEach(() => {
  fake.tables.clear();
  posted.length = 0;
  presign.mockClear();
});

describe("project IDs", () => {
  it("issues a userKey on first sign-in and numbers projects per user", async () => {
    const me = await json<{ userKey: string }>(call(A, "GET", "/users/me"));
    expect(me.userKey).toMatch(USER_KEY_REGEX);
    fake.put("users", { ...fake.items("users")[0], apiKeyRegistered: true });
    await json(call(B, "GET", "/users/me"));
    fake.put("users", { ...fake.items("users").find((u) => u.userId === B.sub)!, apiKeyRegistered: true });

    const a1 = await json<ProjectRecord>(call(A, "POST", "/projects", { roi: "Cerebellum flocculus", tlf: "VOR learning" }));
    const a2 = await json<ProjectRecord>(call(A, "POST", "/projects", { roi: "Cerebellum flocculus", tlf: "VOR learning", name: "  小脳片葉の   VOR 学習 " }));
    const b1 = await json<ProjectRecord>(call(B, "POST", "/projects", { roi: "Cerebellum flocculus", tlf: "VOR learning" }));
    const a3 = await json<ProjectRecord>(call(A, "POST", "/projects", { roi: "小脳", tlf: "VOR", name: "VOR in 小脳" }));

    expect(a1.projectId).toBe(`${me.userKey}-1`);
    expect(a2.projectId).toBe(`${me.userKey}-2`);
    expect(b1.projectId).toMatch(PROJECT_ID_REGEX);
    expect(b1.projectId.endsWith("-1")).toBe(true);
    expect(b1.projectId).not.toBe(a1.projectId);
    expect(a1).toMatchObject({ name: "VOR learning in Cerebellum flocculus", nameSource: "provisional", revision: 0 });
    expect(a2).toMatchObject({ name: "小脳片葉の VOR 学習", nameSource: "user" });
    expect(a3).toMatchObject({ name: "VOR in 小脳", nameSource: "provisional" });
    expect(fake.items("users").find((u) => u.userId === A.sub)!.projectSeq).toBe(3);
    expect(fake.items("messages").every((m) => m.userId)).toBe(true);
  });

  it("gives legacy users a key lazily", async () => {
    fake.put("users", { userId: A.sub, email: A.email, displayName: "a", contributorName: "a", role: "user", disabled: false, apiKeyRegistered: true, createdAt: now, updatedAt: now });
    const p = await json<ProjectRecord>(call(A, "POST", "/projects", { roi: "x", tlf: "y" }));
    expect(p.projectId).toMatch(PROJECT_ID_REGEX);
    expect(p.projectId.endsWith("-1")).toBe(true);
  });

  it("renames with normalisation, marks the name as the user's and warns about duplicates", async () => {
    seedLegacyCollision();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-1", name: "Fear conditioning", nameSource: "auto" });
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-2", name: "Other", nameSource: "auto" });
    fake.put("projects", { ...legacyProject(B.sub, 1), projectId: "u3k8d0hn-1", name: "fear  CONDITIONING", nameSource: "auto" });
    const r = await json<UpdateProjectResponse>(call(A, "PUT", "/projects/u7m2q9xa-2", { name: " FEAR   conditioning " }));
    expect(r.project).toMatchObject({ projectId: "u7m2q9xa-2", name: "FEAR conditioning", nameSource: "user" });
    expect(r.duplicates).toEqual([{ projectId: "u7m2q9xa-1", name: "Fear conditioning" }]);
    expect((await call(A, "PUT", "/projects/u7m2q9xa-2", { name: "a\nb" })).status).toBe(400);
    expect((await call(A, "PUT", "/projects/u7m2q9xa-2", { name: "x".repeat(201) })).status).toBe(400);
    expect((await call(B, "PUT", "/projects/u7m2q9xa-2", { name: "steal" })).status).toBe(404);
  });

  it("resolves legacy IDs to the migrated ID for redirects", async () => {
    seedLegacyCollision();
    fake.table("projects").clear();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-3", legacyId: "VOR", name: "VOR", nameSource: "user" });
    expect(await json(call(A, "GET", "/projects/resolve/VOR"))).toEqual({ projectId: "u7m2q9xa-3" });
    expect(await json(call(A, "GET", "/projects/resolve/u7m2q9xa-3"))).toEqual({ projectId: "u7m2q9xa-3" });
    expect((await call(B, "GET", "/projects/resolve/VOR")).status).toBe(404);
    expect((await call(A, "GET", "/projects/resolve/..%2Fx")).status).toBe(404);
  });

  it("downloads the xlsx as {name}_{ID}.bra.xlsx", async () => {
    seedLegacyCollision();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-2", name: "小脳片葉の VOR 学習 / 再実行", nameSource: "user" });
    await json(call(A, "GET", `/projects/u7m2q9xa-2/artifacts/download?key=${encodeURIComponent("output/u7m2q9xa-2.bra.xlsx")}`));
    expect(presign).toHaveBeenLastCalledWith(A.sub, "u7m2q9xa-2", "output/u7m2q9xa-2.bra.xlsx", {
      ascii: "u7m2q9xa-2.bra.xlsx",
      utf8: "小脳片葉の_VOR_学習_再実行_u7m2q9xa-2.bra.xlsx",
    });
    await json(call(A, "GET", `/projects/u7m2q9xa-2/artifacts/download?key=${encodeURIComponent("u7m2q9xa-2/u7m2q9xa-2_CSV/FRG.csv")}`));
    expect(presign).toHaveBeenLastCalledWith(A.sub, "u7m2q9xa-2", "u7m2q9xa-2/u7m2q9xa-2_CSV/FRG.csv", undefined);
  });

  it("returns the report text for the viewer and refuses non-text keys", async () => {
    seedLegacyCollision();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-2", name: "VOR", nameSource: "user" });
    const aws = await import("../src/lib/aws.js");
    vi.mocked(aws.getObjectText).mockResolvedValueOnce("# Report\n\n## HCD\n");
    const r = await call(A, "GET", `/projects/u7m2q9xa-2/artifacts/text?key=${encodeURIComponent("workspace/report.md")}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("# Report\n\n## HCD\n");
    expect(aws.getObjectText).toHaveBeenLastCalledWith(A.sub, "u7m2q9xa-2", "workspace/report.md");
    expect((await call(A, "GET", `/projects/u7m2q9xa-2/artifacts/text?key=${encodeURIComponent("output/u7m2q9xa-2.bra.xlsx")}`)).status).toBe(400);
    expect((await call(A, "GET", `/projects/u7m2q9xa-2/artifacts/text?key=${encodeURIComponent("../x.md")}`)).status).toBe(400);
    expect((await call(B, "GET", `/projects/u7m2q9xa-2/artifacts/text?key=${encodeURIComponent("workspace/report.md")}`)).status).toBe(404);
  });
});

describe("soft delete", () => {
  const ID = "u7m2q9xa-2";
  function seed(status: ProjectRecord["status"] = "COMPLETED") {
    seedLegacyCollision();
    fake.put("projects", { ...legacyProject(A.sub, 5), projectId: ID, name: "Fear conditioning", nameSource: "user", status });
    fake.put("jobs", { ...job(A.sub, "job_a2", 5), projectId: ID });
    fake.put("messages", { ...message("job_a2", "kept", "5"), projectId: ID, userId: A.sub });
  }
  const stored = () => fake.items("projects").find((p) => p.projectId === ID && p.userId === A.sub)!;

  it("flags the owner's project and keeps every item", async () => {
    seed();
    vi.clearAllMocks();
    const r = await json<DeleteProjectResponse>(call(A, "DELETE", `/projects/${ID}`));
    expect(r.projectId).toBe(ID);
    expect(stored()).toMatchObject({ deletedAt: r.deletedAt, deletedBy: A.sub, status: "COMPLETED", name: "Fear conditioning" });
    expect(fake.items("jobs").some((j) => j.projectId === ID)).toBe(true);
    expect(fake.items("messages").some((m) => m.projectId === ID)).toBe(true);
    const aws = await import("../src/lib/aws.js");
    expect(aws.deleteObject).not.toHaveBeenCalled();
  });

  it("refuses other users with 404 and leaves the project untouched", async () => {
    seed();
    expect((await call(B, "DELETE", `/projects/${ID}`)).status).toBe(404);
    expect(stored().deletedAt).toBeUndefined();
    // Bob's own legacy "VOR" is a different item than Alice's
    await json(call(B, "DELETE", "/projects/VOR"));
    expect(fake.items("projects").find((p) => p.projectId === "VOR" && p.userId === A.sub)!.deletedAt).toBeUndefined();
  });

  it("blocks deletion while a job is in flight", async () => {
    for (const status of ["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING"] as const) {
      fake.tables.clear();
      seed(status);
      expect((await call(A, "DELETE", `/projects/${ID}`)).status).toBe(409);
      expect(stored().deletedAt).toBeUndefined();
    }
    for (const status of ["FAILED", "CANCELLED"] as const) {
      fake.tables.clear();
      seed(status);
      expect((await call(A, "DELETE", `/projects/${ID}`)).status).toBe(200);
    }
  });

  it("hides the project from every owner path", async () => {
    seed();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-3", legacyId: "OLD", name: "fear conditioning", nameSource: "user" });
    await json(call(A, "DELETE", `/projects/${ID}`));

    const list = await json<{ items: ProjectRecord[] }>(call(A, "GET", "/projects"));
    expect(list.items.map((p) => p.projectId).sort()).toEqual(["VOR", "u7m2q9xa-3"]);
    expect((await json<{ items: ProjectRecord[] }>(call(A, "GET", "/projects?q=fear"))).items.map((p) => p.projectId)).toEqual(["u7m2q9xa-3"]);

    const key = encodeURIComponent(`output/${ID}.bra.xlsx`);
    for (const [method, path, body] of [
      ["GET", `/projects/${ID}`],
      ["PUT", `/projects/${ID}`, { name: "x" }],
      ["DELETE", `/projects/${ID}`],
      ["GET", `/projects/resolve/${ID}`],
      ["GET", `/projects/${ID}/messages`],
      ["POST", `/projects/${ID}/followup`, { instruction: "more" }],
      ["POST", `/projects/${ID}/retry`],
      ["POST", `/projects/${ID}/cancel`],
      ["POST", `/projects/${ID}/answer`, { answer: "a" }],
      ["GET", `/projects/${ID}/artifacts`],
      ["GET", `/projects/${ID}/artifacts/download?key=${key}`],
      ["GET", `/projects/${ID}/artifacts/text?key=${encodeURIComponent("workspace/report.md")}`],
      ["GET", `/projects/${ID}/graph/hcd`],
      ["GET", `/projects/${ID}/graph/frg/layout`],
      ["PUT", `/projects/${ID}/graph/frg/layout`, { positions: {} }],
      ["DELETE", `/projects/${ID}/graph/frg/layout`],
    ] as const) {
      expect([method, path, (await call(A, method, path, body)).status]).toEqual([method, path, 404]);
    }
    expect(presign).not.toHaveBeenCalled();

    // A live project with the same name is no longer reported as a duplicate of the deleted one
    const r = await json<UpdateProjectResponse>(call(A, "PUT", "/projects/u7m2q9xa-3", { name: "Fear Conditioning" }));
    expect(r.duplicates).toEqual([]);
  });

  it("does not resolve a deleted project's legacy ID", async () => {
    seedLegacyCollision();
    fake.table("projects").clear();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: "u7m2q9xa-3", legacyId: "VOR", name: "VOR", nameSource: "user" });
    await json(call(A, "DELETE", "/projects/u7m2q9xa-3"));
    expect((await call(A, "GET", "/projects/resolve/VOR")).status).toBe(404);
  });

  it("keeps spent cost in the usage summary, flagged as deleted", async () => {
    seed();
    await json(call(A, "DELETE", `/projects/${ID}`));
    const s = await json<UsageSummary>(call(A, "GET", "/users/me/usage"));
    expect(s.totals.inputTokens).toBe(105);
    expect(s.byProject.find((p) => p.projectId === ID)).toMatchObject({ deleted: true });
    expect(s.byProject.find((p) => p.projectId === "VOR")!.deleted).toBeUndefined();
  });

  it("lists deleted projects for admins with the flag, and admin only", async () => {
    seed();
    await json(call(A, "DELETE", `/projects/${ID}`));
    expect((await call(A, "GET", "/admin/projects")).status).toBe(403);
    fake.put("users", { ...fake.items("users").find((u) => u.userId === B.sub)!, role: "admin" });
    const r = await json<{ items: ProjectRecord[] }>(call(B, "GET", "/admin/projects"));
    expect(r.items.find((p) => p.projectId === ID)).toMatchObject({ deletedBy: A.sub, deletedAt: expect.any(String) });
  });
});

describe("legacy Project IDs shared by two users (project-index cross-talk)", () => {
  it("returns only the caller's messages", async () => {
    seedLegacyCollision();
    const a = await json<{ items: MessageRecord[] }>(call(A, "GET", "/projects/VOR/messages"));
    const b = await json<{ items: MessageRecord[] }>(call(B, "GET", "/projects/VOR/messages"));
    expect(a.items.map((m) => m.content)).toEqual(["alice secret"]);
    expect(b.items.map((m) => m.content)).toEqual(["bob secret", "bob new"]);
  });

  it("returns only the caller's jobs", async () => {
    seedLegacyCollision();
    const p = await json<{ jobs: JobRecord[] }>(call(A, "GET", "/projects/VOR"));
    expect(p.jobs.map((j) => j.jobId)).toEqual(["job_a"]);
  });

  it("counts only the caller's usage", async () => {
    seedLegacyCollision();
    const s = await json<UsageSummary>(call(A, "GET", "/users/me/usage"));
    expect(s.totals.inputTokens).toBe(100);
    expect(s.byModel).toEqual([expect.objectContaining({ model: "gpt-5.6", jobs: 1, usage: expect.objectContaining({ inputTokens: 100 }) })]);
  });

  it("broadcasts messages and project updates only to the owner's connections", async () => {
    seedLegacyCollision();
    fake.put("ws", { connectionId: "conn-a", projectId: "VOR", userId: A.sub, ttl: 1 });
    fake.put("ws", { connectionId: "conn-b", projectId: "VOR", userId: B.sub, ttl: 1 });
    const { marshall } = await import("@aws-sdk/util-dynamodb");
    const rec = (table: string, item: object) => ({
      eventName: "INSERT",
      eventSourceARN: `arn:aws:dynamodb:ap-northeast-1:1:table/${table}/stream/x`,
      dynamodb: { NewImage: marshall(item, { removeUndefinedValues: true }) },
    });
    await broadcast({
      Records: [
        rec("messages", message("job_a", "alice live", "9")),
        rec("messages", { ...message("job_b", "bob live", "10"), userId: B.sub }),
        rec("projects", { ...legacyProject(B.sub, 7), status: "RUNNING" }),
      ],
    } as never);
    const to = (c: string) => posted.filter((p) => p.connectionId === c).map((p) => p.data.type + ":" + JSON.stringify(p.data).includes("alice"));
    expect(to("conn-a")).toEqual(["message:true"]);
    expect(to("conn-b")).toEqual(["message:false", "project:false"]);
  });
});

describe("reply language (web UI locale)", () => {
  const jobsOf = (projectId: string) => fake.items("jobs").filter((j) => j.projectId === projectId) as unknown as JobRecord[];
  const latestJob = (projectId: string) => jobsOf(projectId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const setStatus = (projectId: string, status: ProjectRecord["status"]) => {
    const p = fake.items("projects").find((x) => x.projectId === projectId)!;
    fake.put("projects", { ...p, status });
  };

  it("stores the locale of each request on the job and rejects unknown ones", async () => {
    await json(call(A, "GET", "/users/me"));
    fake.put("users", { ...fake.items("users")[0], apiKeyRegistered: true });

    const p = await json<ProjectRecord>(call(A, "POST", "/projects", { roi: "flocculus", tlf: "VOR learning", locale: "ja" }));
    expect(latestJob(p.projectId).locale).toBe("ja");
    expect((await call(A, "POST", "/projects", { roi: "x", tlf: "y", locale: "xx" })).status).toBe(400);
    const plain = await json<ProjectRecord>(call(A, "POST", "/projects", { roi: "x", tlf: "y" }));
    expect(latestJob(plain.projectId).locale).toBeNull();

    setStatus(p.projectId, "WAITING_USER_INPUT");
    expect((await call(A, "POST", `/projects/${p.projectId}/answer`, { answer: "yes", locale: 5 })).status).toBe(400);
    await json(call(A, "POST", `/projects/${p.projectId}/answer`, { answer: "yes", locale: "de" }));
    expect(latestJob(p.projectId)).toMatchObject({ pendingAnswer: "yes", locale: "de" });
    setStatus(p.projectId, "WAITING_USER_INPUT");
    await json(call(A, "POST", `/projects/${p.projectId}/answer`, { answer: "again" }));
    expect(latestJob(p.projectId).locale).toBe("de");

    setStatus(p.projectId, "COMPLETED");
    const f = await json<{ jobId: string }>(call(A, "POST", `/projects/${p.projectId}/followup`, { instruction: "add a UC", locale: "zhTw" }));
    expect(jobsOf(p.projectId).find((j) => j.jobId === f.jobId)!.locale).toBe("zhTw");

    setStatus(p.projectId, "FAILED");
    const r1 = await json<{ jobId: string }>(call(A, "POST", `/projects/${p.projectId}/retry`));
    expect(jobsOf(p.projectId).find((j) => j.jobId === r1.jobId)!.locale).toBe("zhTw");
    setStatus(p.projectId, "FAILED");
    const r2 = await json<{ jobId: string }>(call(A, "POST", `/projects/${p.projectId}/retry`, { locale: "en" }));
    expect(jobsOf(p.projectId).find((j) => j.jobId === r2.jobId)!.locale).toBe("en");
  });
});

describe("explanatory articles", () => {
  const P = "u7m2q9xa-5";
  async function seed(extra: Partial<ProjectRecord> = {}) {
    seedLegacyCollision();
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: P, name: "報酬 学習", nameSource: "user", revision: 2, ...extra });
    const aws = await import("../src/lib/aws.js");
    vi.mocked(aws.enqueueRun).mockClear();
    return aws;
  }

  it("queues an article job for finished BRA data only, without touching the steps", async () => {
    const aws = await seed();
    const r = await call(A, "POST", `/projects/${P}/articles`, { locale: "ja" });
    expect(r.status).toBe(202);
    const { jobId } = (await r.json()) as { jobId: string };
    const job = fake.items("jobs").find((j) => j.jobId === jobId)!;
    expect(job).toMatchObject({ type: "article", status: "QUEUED", articleLocale: "ja" });
    const p = fake.items("projects").find((x) => x.projectId === P)!;
    expect(p).toMatchObject({ status: "QUEUED", activeJobId: jobId, articleJob: { jobId, locale: "ja", status: "QUEUED" }, stepStates: { XLSX: "done" } });
    expect(aws.enqueueRun).toHaveBeenLastCalledWith({ version: 1, userId: A.sub, projectId: P, jobId, mode: "article" });

    expect((await call(A, "POST", `/projects/${P}/articles`, { locale: "ja" })).status).toBe(400); // busy now
    await seed({ status: "COMPLETED", stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "pending" } });
    expect((await call(A, "POST", `/projects/${P}/articles`, { locale: "ja" })).status).toBe(400);
    await seed();
    expect((await call(A, "POST", `/projects/${P}/articles`, { locale: "ja-JP" })).status).toBe(400);
    expect((await call(B, "POST", `/projects/${P}/articles`, { locale: "ja" })).status).toBe(404);
  });

  it("cancelling an article job leaves the project completed", async () => {
    await seed();
    const { jobId } = await json<{ jobId: string }>(call(A, "POST", `/projects/${P}/articles`, { locale: "en" }));
    await json(call(A, "POST", `/projects/${P}/cancel`));
    const p = fake.items("projects").find((x) => x.projectId === P)!;
    expect(p).toMatchObject({ status: "COMPLETED", activeJobId: null, articleJob: { jobId, status: "CANCELLED" } });
    expect(fake.items("jobs").find((j) => j.jobId === jobId)!.status).toBe("CANCELLED");
  });

  it("lists articles with their metadata and a stale flag, and names downloads", async () => {
    const aws = await seed();
    vi.mocked(aws.listArtifacts).mockResolvedValueOnce([
      { key: "article/ja.md", name: "ja.md", size: 10, lastModified: now, category: "article" },
      { key: "article/en.md", name: "en.md", size: 10, lastModified: now, category: "article" },
      { key: "output/x.bra.xlsx", name: "x.bra.xlsx", size: 10, lastModified: now, category: "output" },
    ]);
    const meta = (locale: string, sourceRevision: number) =>
      JSON.stringify({ locale, language: locale, title: "T", createdAt: now, sourceRevision, jobId: "job_x", model: "gpt-5.6", citedReferences: ["[A, 2000]"] });
    vi.mocked(aws.getObjectText).mockImplementation(async (_u, _p, key) => (key === "article/ja.json" ? meta("ja", 2) : key === "article/en.json" ? meta("en", 1) : null));
    const r = await json<{ items: { locale: string; stale: boolean; key: string }[] }>(call(A, "GET", `/projects/${P}/articles`));
    vi.mocked(aws.getObjectText).mockReset();
    vi.mocked(aws.getObjectText).mockResolvedValue(null);
    expect(r.items.map((a) => [a.locale, a.stale, a.key])).toEqual([
      ["ja", false, "article/ja.md"],
      ["en", true, "article/en.md"],
    ]);

    await json(call(A, "GET", `/projects/${P}/artifacts/download?key=${encodeURIComponent("article/ja.md")}`));
    expect(presign).toHaveBeenLastCalledWith(A.sub, P, "article/ja.md", { ascii: `${P}.article.ja.md`, utf8: `報酬_学習_${P}.article.ja.md` });
  });

  it("retries the last BRA job, not an article job", async () => {
    const aws = await seed({ status: "FAILED" });
    fake.put("jobs", { ...job(A.sub, "job_f", 1), projectId: P, type: "followup", instruction: "add X", status: "FAILED", createdAt: "2026-09-02T00:00:00.000Z" });
    fake.put("jobs", { ...job(A.sub, "job_art", 1), projectId: P, type: "article", articleLocale: "ja", createdAt: "2026-09-03T00:00:00.000Z" });
    await json(call(A, "POST", `/projects/${P}/retry`));
    const retried = fake.items("jobs").filter((j) => j.projectId === P && j.status === "QUEUED");
    expect(retried).toEqual([expect.objectContaining({ type: "followup", instruction: "add X" })]);
    expect(aws.enqueueRun).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "retry" }));
  });
});

describe("janitor and article jobs", () => {
  it("re-runs a stalled article job as an article job, then fails it without failing the project", async () => {
    const { handler: janitor } = await import("../src/handlers/janitor.js");
    const aws = await import("../src/lib/aws.js");
    vi.mocked(aws.enqueueRun).mockClear();
    const P = "u7m2q9xa-6";
    const stalled = { ...job(A.sub, "job_art", 1), projectId: P, type: "article" as const, articleLocale: "ko" as const, status: "RUNNING" as const, lastHeartbeat: now };
    fake.put("projects", { ...legacyProject(A.sub, 1), projectId: P, status: "RUNNING", activeJobId: "job_art" });
    fake.put("jobs", stalled);
    await janitor();
    const next = fake.items("jobs").find((j) => j.projectId === P && j.status === "QUEUED")!;
    expect(next).toMatchObject({ type: "article", articleLocale: "ko", retryCount: 1 });
    expect(aws.enqueueRun).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: next.jobId, mode: "article" }));
    expect(fake.items("projects").find((x) => x.projectId === P)).toMatchObject({ status: "QUEUED", articleJob: { jobId: next.jobId, locale: "ko", status: "QUEUED" } });

    fake.put("jobs", { ...next, status: "RUNNING", lastHeartbeat: now, retryCount: 5 });
    await janitor();
    expect(fake.items("projects").find((x) => x.projectId === P)).toMatchObject({ status: "COMPLETED", activeJobId: null, errorMessage: null, articleJob: { status: "FAILED" } });
  });
});
