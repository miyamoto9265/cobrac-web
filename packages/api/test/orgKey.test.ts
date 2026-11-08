import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DefaultKeyStatus, JobRecord, MeResponse, ModelsResponse, OrgUsageResponse, ProjectRecord, UserRecord } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send() {}
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));
const DEFAULT_CIPHER = vi.hoisted(() => "AQICAHdefault-key-ciphertext");
const WBAI_KEY = "sk-proj-wbai-0123456789abcdefWXYZ";
const openai = vi.hoisted(() => ({ status: 200, models: ["gpt-6-sol", "gpt-6-luna", "gpt-5.6-luna", "gpt-6-astra", "gpt-6-luna-2026-09-01"] }));
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ data: openai.models.map((id) => ({ id })) }), { status: openai.status })),
);
vi.mock("../src/lib/aws.js", () => ({
  presignDownload: vi.fn(async () => "https://signed.example/x"),
  enqueueRun: vi.fn(async () => undefined),
  listArtifacts: vi.fn(async () => []),
  getObjectText: vi.fn(async () => null),
  putObjectText: vi.fn(async () => undefined),
  putObjectBytes: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  encryptApiKey: vi.fn(async () => "enc"),
  encryptDefaultApiKey: vi.fn(async () => DEFAULT_CIPHER),
  stopEcsTask: vi.fn(async () => undefined),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const ALICE = { sub: "sub-alice", email: "alice@example.com" };
const BOB = { sub: "sub-bob", email: "bob@example.com" };

function call(who: typeof ADMIN, method: string, path: string, body?: unknown) {
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
const user = (who: typeof ADMIN, key: string, extra: Partial<UserRecord> = {}): UserRecord => ({
  userId: who.sub,
  email: who.email,
  displayName: who.sub,
  contributorName: who.sub,
  role: "user",
  disabled: false,
  apiKeyRegistered: false,
  userKey: key,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const getUser = (who: typeof ADMIN) => fake.items("users").find((u) => u.userId === who.sub) as unknown as UserRecord;
const setUser = (who: typeof ADMIN, extra: Partial<UserRecord>) => fake.put("users", { ...getUser(who), ...extra });
const jobsOf = (projectId: string) => fake.items("jobs").filter((j) => j.projectId === projectId) as unknown as JobRecord[];

function completed(userId: string, projectId: string, model: string): ProjectRecord {
  return {
    userId,
    projectId,
    roi: "flocculus",
    tlf: "VOR",
    contributor: userId,
    model,
    status: "COMPLETED",
    currentStep: "XLSX",
    stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" },
    activeJobId: null,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: true,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

beforeEach(() => {
  fake.tables.clear();
  openai.status = 200;
  fake.put("users", user(ADMIN, "uadm1n00", { role: "admin", apiKeyRegistered: true, apiKeyLast4: "9xyz", encryptedApiKey: "admin-personal-cipher", availableModels: ["gpt-6-sol"] }));
  fake.put("users", user(ALICE, "ua11ce00"));
  fake.put("users", user(BOB, "ub0b0000"));
});

const share = () => json<DefaultKeyStatus>(call(ADMIN, "PUT", "/admin/default-api-key", { apiKey: WBAI_KEY }));
const approve = (who: typeof ADMIN, approved: boolean) => json(call(ADMIN, "PUT", `/admin/users/${who.sub}`, { orgApproved: approved }));
const create = (who: typeof ADMIN, body: Record<string, unknown> = {}) => call(who, "POST", "/projects", { roi: "flocculus", tlf: "VOR", ...body });

describe("default API key", () => {
  it("is off by default: users without a key cannot run jobs until approved and the key is shared", async () => {
    expect((await json<MeResponse>(call(ALICE, "GET", "/users/me"))).keySource).toBeNull();
    expect((await create(ALICE)).status).toBe(400);

    await approve(ALICE, true);
    const unshared = await create(ALICE);
    expect(unshared.status).toBe(400);
    expect(await unshared.clone().text()).not.toContain("デフォルト");
    expect(await unshared.text()).toContain("いまはジョブを実行できません");

    const status = await share();
    expect(status).toEqual({ registered: true, last4: "WXYZ", updatedAt: expect.any(String) });
    expect(await json<MeResponse>(call(ALICE, "GET", "/users/me"))).toMatchObject({ keySource: "org", orgAccess: { approvedBy: ADMIN.sub } });
    expect(getUser(ALICE).orgAccess).not.toHaveProperty("tier");
    expect((await create(ALICE)).status).toBe(201);
    // approval is per user
    expect((await create(BOB)).status).toBe(400);
  });

  it("only admins manage approvals and the default key", async () => {
    expect((await call(ALICE, "PUT", "/admin/default-api-key", { apiKey: WBAI_KEY })).status).toBe(403);
    expect((await call(ALICE, "GET", "/admin/default-api-key")).status).toBe(403);
    expect((await call(ALICE, "DELETE", "/admin/default-api-key")).status).toBe(403);
    expect((await call(ALICE, "PUT", `/admin/users/${BOB.sub}`, { orgApproved: true })).status).toBe(403);
    expect((await call(ALICE, "GET", "/admin/org-usage")).status).toBe(403);
    expect((await call(ADMIN, "PUT", `/admin/users/${BOB.sub}`, { orgApproved: 2 })).status).toBe(400);
    expect((await call(ADMIN, "PUT", "/admin/users/sub-nobody", { orgApproved: true })).status).toBe(404);
    expect(fake.items("catalog")).toEqual([]);
  });

  it("stores the default key encrypted under its own context, separate from every personal key", async () => {
    expect(await json<DefaultKeyStatus>(call(ADMIN, "GET", "/admin/default-api-key"))).toEqual({ registered: false, last4: null, updatedAt: null });
    expect((await call(ADMIN, "PUT", "/admin/default-api-key", { apiKey: "short" })).status).toBe(400);
    openai.status = 401;
    expect((await call(ADMIN, "PUT", "/admin/default-api-key", { apiKey: WBAI_KEY })).status).toBe(400);
    openai.status = 200;
    await share();
    const { encryptDefaultApiKey } = await import("../src/lib/aws.js");
    expect(encryptDefaultApiKey).toHaveBeenCalledWith(WBAI_KEY, "openai");
    expect(fake.items("catalog")).toEqual([
      expect.objectContaining({ kind: "config", id: "default-api-key", encryptedApiKey: DEFAULT_CIPHER, last4: "WXYZ", updatedBy: ADMIN.sub, availableModels: ["gpt-6-sol", "gpt-6-luna", "gpt-6-astra", "gpt-5.6-luna"] }),
    ]);
    // the admin's personal key is untouched and not used for anyone else
    expect(getUser(ADMIN)).toMatchObject({ encryptedApiKey: "admin-personal-cipher", apiKeyLast4: "9xyz" });
    // replacing overwrites; deleting removes it
    await json(call(ADMIN, "PUT", "/admin/default-api-key", { apiKey: "sk-proj-wbai-0123456789abcdefNEW1" }));
    expect(await json<DefaultKeyStatus>(call(ADMIN, "GET", "/admin/default-api-key"))).toMatchObject({ registered: true, last4: "NEW1" });
    expect(await json<DefaultKeyStatus>(call(ADMIN, "DELETE", "/admin/default-api-key"))).toEqual({ registered: false, last4: null, updatedAt: null });
    expect(fake.items("catalog")).toEqual([]);
  });

  it("never sends the encrypted key to clients", async () => {
    await share();
    await approve(ALICE, true);
    const responses = await Promise.all([
      call(ADMIN, "GET", "/admin/users").then((r) => r.text()),
      call(ADMIN, "GET", "/admin/default-api-key").then((r) => r.text()),
      call(ADMIN, "PUT", "/admin/default-api-key", { apiKey: WBAI_KEY }).then((r) => r.text()),
      call(ALICE, "GET", "/users/me").then((r) => r.text()),
      call(ALICE, "GET", "/users/me/models").then((r) => r.text()),
      call(ADMIN, "GET", "/users/me").then((r) => r.text()),
    ]);
    for (const body of responses) {
      expect(body).not.toContain(DEFAULT_CIPHER);
      expect(body).not.toContain(WBAI_KEY);
    }
  });

  it("lets an approved user choose every model of the default key, deprecated ones last", async () => {
    await share();
    await approve(ALICE, true);
    const models = await json<ModelsResponse>(call(ALICE, "GET", "/users/me/models"));
    expect(models).toMatchObject({ models: ["gpt-6-sol", "gpt-6-astra", "gpt-6-luna", "gpt-5.6-luna"], restricted: false, keySource: "org", envDefaultModel: "gpt-6-sol" });
    expect(models).not.toHaveProperty("orgTier");
    expect((await json<ProjectRecord>(create(ALICE, { model: "gpt-6-astra" }))).model).toBe("gpt-6-astra");
    // deprecated models are still allowed when chosen
    expect((await json<ProjectRecord>(create(ALICE, { model: "gpt-6-luna" }))).model).toBe("gpt-6-luna");
    // the app default (Sonnet 5.5) needs an Anthropic key: the fallback is gpt-6-sol, not a deprecated model
    expect((await json<ProjectRecord>(create(ALICE))).model).toBe("gpt-6-sol");
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "gpt-6-sol"));
    expect((await call(ALICE, "POST", "/projects/ua11ce00-90/followup", { instruction: "more" })).status).toBe(200);
  });

  it("moves a project to an allowed model when the user's keys no longer allow its model", async () => {
    await share();
    await approve(ALICE, true);
    const opus = await create(ALICE, { model: "claude-opus-5-5" });
    expect(opus.status).toBe(403);
    expect(await opus.text()).toBe("Claude のモデルを使うには Anthropic API キーの登録が必要です");
    expect((await call(ALICE, "PUT", "/users/me", { defaultModel: "claude-opus-5-5" })).status).toBe(403);

    // a default saved while the user had an Anthropic key falls back instead of failing
    setUser(ALICE, { defaultModel: "claude-opus-5-5" });
    expect((await json<ProjectRecord>(create(ALICE))).model).toBe("gpt-6-sol");

    // a chosen article model the keys do not allow is refused
    fake.put("projects", completed(ALICE.sub, "ua11ce00-91", "gpt-6-sol"));
    expect((await call(ALICE, "POST", "/projects/ua11ce00-91/articles", { locale: "ja", model: "claude-opus-5-5" })).status).toBe(403);
    const plain = await json<{ jobId: string }>(call(ALICE, "POST", "/projects/ua11ce00-91/articles", { locale: "ja" }));
    expect(jobsOf("ua11ce00-91").find((j) => j.jobId === plain.jobId)).toMatchObject({ model: null });

    // a project made with a Claude model runs its next jobs on the allowed default
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "claude-opus-5-5"));
    const art = await json<{ jobId: string }>(call(ALICE, "POST", "/projects/ua11ce00-90/articles", { locale: "ja" }));
    expect(jobsOf("ua11ce00-90").find((j) => j.jobId === art.jobId)).toMatchObject({ model: "gpt-6-sol", keySource: "org" });
    // (an article leaves the project's model alone)
    expect(fake.items("projects").find((x) => x.projectId === "ua11ce00-90")?.model).toBe("claude-opus-5-5");
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "claude-opus-5-5"));
    const fu = await json<{ jobId: string }>(call(ALICE, "POST", "/projects/ua11ce00-90/followup", { instruction: "more" }));
    expect(fake.items("projects").find((x) => x.projectId === "ua11ce00-90")?.model).toBe("gpt-6-sol");
    expect(fake.items("messages").find((m) => m.jobId === fu.jobId && (m.meta as { i18n?: string })?.i18n === "sys.model")).toMatchObject({ meta: { model: "gpt-6-sol" } });
    fake.put("projects", { ...completed(ALICE.sub, "ua11ce00-92", "claude-opus-5-5"), status: "FAILED" });
    expect((await call(ALICE, "POST", "/projects/ua11ce00-92/retry", {})).status).toBe(200);
    expect(fake.items("projects").find((x) => x.projectId === "ua11ce00-92")?.model).toBe("gpt-6-sol");
    fake.put("projects", { ...completed(ALICE.sub, "ua11ce00-93", "claude-opus-5-5"), status: "WAITING_USER_INPUT", activeJobId: "job_w" });
    fake.put("jobs", { projectId: "ua11ce00-93", jobId: "job_w", userId: ALICE.sub, type: "initial", status: "WAITING_USER_INPUT", instruction: null, pendingAnswer: null, ecsTaskArn: null, retryCount: 0, lastHeartbeat: null, startedAt: now, endedAt: null, errorMessage: null, createdAt: now, updatedAt: now });
    expect((await call(ALICE, "POST", "/projects/ua11ce00-93/answer", { answer: "yes" })).status).toBe(200);
    expect(fake.items("projects").find((x) => x.projectId === "ua11ce00-93")?.model).toBe("gpt-6-sol");
    // a project the keys allow keeps its model, a deprecated one too
    fake.put("projects", completed(ALICE.sub, "ua11ce00-94", "gpt-5.6-luna"));
    const { jobId } = await json<{ jobId: string }>(call(ALICE, "POST", "/projects/ua11ce00-94/followup", { instruction: "more" }));
    expect(jobsOf("ua11ce00-94").find((j) => j.jobId === jobId)?.keySource).toBe("org");
    expect(fake.items("projects").find((x) => x.projectId === "ua11ce00-94")?.model).toBe("gpt-5.6-luna");
  });

  it("treats an approval stored with a legacy tier as an approval for every model", async () => {
    await share();
    setUser(ALICE, { orgAccess: { tier: 1, approvedAt: now, approvedBy: ADMIN.sub } });
    expect((await json<MeResponse>(call(ALICE, "GET", "/users/me"))).keySource).toBe("org");
    expect((await json<ProjectRecord>(create(ALICE, { model: "gpt-6-astra" }))).model).toBe("gpt-6-astra");
  });

  it("uses the user's own key first", async () => {
    await share();
    await approve(ALICE, true);
    setUser(ALICE, { apiKeyRegistered: true, encryptedApiKey: "alice-own", availableModels: ["gpt-6-sol"] });
    expect(await json<MeResponse>(call(ALICE, "GET", "/users/me"))).toMatchObject({ keySource: "own" });
    expect(await json<ModelsResponse>(call(ALICE, "GET", "/users/me/models"))).toMatchObject({ models: ["gpt-6-sol"], restricted: false, keySource: "own" });
    const p = await json<ProjectRecord>(create(ALICE, { model: "gpt-6-sol" }));
    expect(jobsOf(p.projectId)[0].keySource).toBe("own");
  });

  it("stops new jobs as soon as the approval is revoked or the default key is deleted", async () => {
    await share();
    await approve(ALICE, true);
    await approve(BOB, true);
    expect((await create(ALICE)).status).toBe(201);
    await approve(ALICE, false);
    expect(getUser(ALICE).orgAccess).toBeNull();
    expect((await create(ALICE)).status).toBe(400);
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "gpt-6-luna"));
    expect((await call(ALICE, "POST", "/projects/ua11ce00-90/followup", { instruction: "more" })).status).toBe(400);

    expect((await create(BOB)).status).toBe(201);
    await json(call(ADMIN, "DELETE", "/admin/default-api-key"));
    expect((await create(BOB)).status).toBe(400);
    expect(await json<MeResponse>(call(BOB, "GET", "/users/me"))).toMatchObject({ keySource: null, orgAccess: { approvedBy: ADMIN.sub } });
    // the admin's personal key never stands in for the default key
    expect((await create(ADMIN)).status).toBe(201);
  });

  it("sums default-API-key usage per user for the admin", async () => {
    const month = new Date().toISOString().slice(0, 7);
    const job = (jobId: string, userId: string, extra: Partial<JobRecord>): JobRecord => ({
      projectId: "p",
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
      createdAt: `${month}-01T00:00:00.000Z`,
      updatedAt: now,
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0 },
      ...extra,
    });
    fake.put("jobs", job("j1", ALICE.sub, { keySource: "org", costUsd: 0.5 }));
    fake.put("jobs", job("j2", ALICE.sub, { keySource: "org", costUsd: 0.25, createdAt: "2020-01-01T00:00:00.000Z" }));
    fake.put("jobs", job("j3", ALICE.sub, { keySource: "own", costUsd: 9 }));
    fake.put("jobs", job("j4", BOB.sub, { costUsd: 7 }));
    fake.put("jobs", job("j5", BOB.sub, { keySource: "org", costUsd: null }));
    const r = await json<OrgUsageResponse>(call(ADMIN, "GET", "/admin/org-usage"));
    expect(r.month).toBe(month);
    expect(r.items).toEqual([
      expect.objectContaining({ userId: ALICE.sub, jobs: 2, costUsd: 0.75, monthCostUsd: 0.5, unpricedJobs: 0, usage: expect.objectContaining({ inputTokens: 200 }) }),
      expect.objectContaining({ userId: BOB.sub, jobs: 1, costUsd: 0, unpricedJobs: 1 }),
    ]);
  });
});
