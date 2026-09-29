import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord, MessageRecord, ProjectRecord, UpdateProjectResponse, UsageSummary } from "@cobrac/shared";
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

    expect(a1.projectId).toBe(`${me.userKey}-1`);
    expect(a2.projectId).toBe(`${me.userKey}-2`);
    expect(b1.projectId).toMatch(PROJECT_ID_REGEX);
    expect(b1.projectId.endsWith("-1")).toBe(true);
    expect(b1.projectId).not.toBe(a1.projectId);
    expect(a1).toMatchObject({ name: "VORLearning_CerebellumFlocculus", nameSource: "auto", revision: 0 });
    expect(a2).toMatchObject({ name: "小脳片葉の VOR 学習", nameSource: "user" });
    expect(fake.items("users").find((u) => u.userId === A.sub)!.projectSeq).toBe(2);
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
