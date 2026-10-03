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
const approve = (who: typeof ADMIN, tier: 0 | 1 | 2) => json(call(ADMIN, "PUT", `/admin/users/${who.sub}`, { orgTier: tier }));
const create = (who: typeof ADMIN, body: Record<string, unknown> = {}) => call(who, "POST", "/projects", { roi: "flocculus", tlf: "VOR", ...body });

describe("default API key", () => {
  it("is off by default: users without a key cannot run jobs until approved and the key is shared", async () => {
    expect((await json<MeResponse>(call(ALICE, "GET", "/users/me"))).keySource).toBeNull();
    expect((await create(ALICE)).status).toBe(400);

    await approve(ALICE, 1);
    const unshared = await create(ALICE);
    expect(unshared.status).toBe(400);
    expect(await unshared.text()).toContain("デフォルトの API キー");

    const status = await share();
    expect(status).toEqual({ registered: true, last4: "WXYZ", updatedAt: expect.any(String) });
    expect(await json<MeResponse>(call(ALICE, "GET", "/users/me"))).toMatchObject({ keySource: "org", orgTier: 1, orgAccess: { tier: 1, approvedBy: ADMIN.sub } });
    expect((await create(ALICE)).status).toBe(201);
    // approval is per user
    expect((await create(BOB)).status).toBe(400);
  });

  it("only admins manage approvals and the default key", async () => {
    expect((await call(ALICE, "PUT", "/admin/default-api-key", { apiKey: WBAI_KEY })).status).toBe(403);
    expect((await call(ALICE, "GET", "/admin/default-api-key")).status).toBe(403);
    expect((await call(ALICE, "DELETE", "/admin/default-api-key")).status).toBe(403);
    expect((await call(ALICE, "PUT", `/admin/users/${BOB.sub}`, { orgTier: 2 })).status).toBe(403);
    expect((await call(ALICE, "GET", "/admin/org-usage")).status).toBe(403);
    expect((await call(ADMIN, "PUT", `/admin/users/${BOB.sub}`, { orgTier: 3 })).status).toBe(400);
    expect((await call(ADMIN, "PUT", "/admin/users/sub-nobody", { orgTier: 1 })).status).toBe(404);
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
    expect(encryptDefaultApiKey).toHaveBeenCalledWith(WBAI_KEY);
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
    await approve(ALICE, 2);
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

  it("limits Tier 1 to the luna models on every model choice", async () => {
    await share();
    await approve(ALICE, 1);
    const models = await json<ModelsResponse>(call(ALICE, "GET", "/users/me/models"));
    expect(models).toMatchObject({ models: ["gpt-6-luna", "gpt-5.6-luna"], restricted: true, keySource: "org", orgTier: 1, envDefaultModel: "gpt-6-luna" });

    const sol = await create(ALICE, { model: "gpt-6-sol" });
    expect(sol.status).toBe(403);
    expect(await sol.text()).toContain("Tier 1");
    expect((await call(ALICE, "PUT", "/users/me", { defaultModel: "gpt-6-sol" })).status).toBe(403);

    const luna = await json<ProjectRecord>(create(ALICE, { model: "gpt-5.6-luna" }));
    expect(luna.model).toBe("gpt-5.6-luna");
    expect(jobsOf(luna.projectId)).toEqual([expect.objectContaining({ keySource: "org", userId: ALICE.sub })]);

    // a default saved before the tier was lowered falls back to the tier's default instead of failing
    setUser(ALICE, { defaultModel: "gpt-6-sol" });
    expect((await json<ProjectRecord>(create(ALICE))).model).toBe("gpt-6-luna");

    // follow-ups, retries, answers and articles check the model the job will run
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "gpt-6-sol"));
    fake.put("projects", completed(ALICE.sub, "ua11ce00-91", "gpt-6-luna"));
    expect((await call(ALICE, "POST", "/projects/ua11ce00-90/followup", { instruction: "more" })).status).toBe(403);
    expect((await call(ALICE, "POST", "/projects/ua11ce00-90/articles", { locale: "ja" })).status).toBe(403);
    expect((await call(ALICE, "POST", "/projects/ua11ce00-91/articles", { locale: "ja", model: "gpt-6-astra" })).status).toBe(403);
    expect((await call(ALICE, "POST", "/projects/ua11ce00-91/articles", { locale: "ja" })).status).toBe(202);
    fake.put("projects", { ...completed(ALICE.sub, "ua11ce00-92", "gpt-6-sol"), status: "FAILED" });
    expect((await call(ALICE, "POST", "/projects/ua11ce00-92/retry", {})).status).toBe(403);
    fake.put("projects", { ...completed(ALICE.sub, "ua11ce00-93", "gpt-6-sol"), status: "WAITING_USER_INPUT", activeJobId: "job_w" });
    expect((await call(ALICE, "POST", "/projects/ua11ce00-93/answer", { answer: "yes" })).status).toBe(403);
    fake.put("projects", completed(ALICE.sub, "ua11ce00-94", "gpt-5.6-luna"));
    const { jobId } = await json<{ jobId: string }>(call(ALICE, "POST", "/projects/ua11ce00-94/followup", { instruction: "more" }));
    expect(jobsOf("ua11ce00-94").find((j) => j.jobId === jobId)?.keySource).toBe("org");
  });

  it("lets Tier 2 use every model of the default key", async () => {
    await share();
    await approve(ALICE, 2);
    const models = await json<ModelsResponse>(call(ALICE, "GET", "/users/me/models"));
    expect(models).toMatchObject({ restricted: false, orgTier: 2 });
    expect(models.models).toEqual(expect.arrayContaining(["gpt-6-sol", "gpt-6-astra", "gpt-6-luna", "gpt-5.6-luna"]));
    expect((await json<ProjectRecord>(create(ALICE, { model: "gpt-6-astra" }))).model).toBe("gpt-6-astra");
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "gpt-6-sol"));
    expect((await call(ALICE, "POST", "/projects/ua11ce00-90/followup", { instruction: "more" })).status).toBe(200);
  });

  it("uses the user's own key first, without the tier limit", async () => {
    await share();
    await approve(ALICE, 1);
    setUser(ALICE, { apiKeyRegistered: true, encryptedApiKey: "alice-own", availableModels: ["gpt-6-sol"] });
    expect(await json<MeResponse>(call(ALICE, "GET", "/users/me"))).toMatchObject({ keySource: "own", orgTier: null });
    expect(await json<ModelsResponse>(call(ALICE, "GET", "/users/me/models"))).toMatchObject({ models: ["gpt-6-sol"], restricted: false, keySource: "own" });
    const p = await json<ProjectRecord>(create(ALICE, { model: "gpt-6-sol" }));
    expect(jobsOf(p.projectId)[0].keySource).toBe("own");
  });

  it("stops new jobs as soon as the approval is revoked or the default key is deleted", async () => {
    await share();
    await approve(ALICE, 2);
    await approve(BOB, 1);
    expect((await create(ALICE)).status).toBe(201);
    await approve(ALICE, 0);
    expect(getUser(ALICE).orgAccess).toBeNull();
    expect((await create(ALICE)).status).toBe(400);
    fake.put("projects", completed(ALICE.sub, "ua11ce00-90", "gpt-6-luna"));
    expect((await call(ALICE, "POST", "/projects/ua11ce00-90/followup", { instruction: "more" })).status).toBe(400);

    expect((await create(BOB)).status).toBe(201);
    await json(call(ADMIN, "DELETE", "/admin/default-api-key"));
    expect((await create(BOB)).status).toBe(400);
    expect(await json<MeResponse>(call(BOB, "GET", "/users/me"))).toMatchObject({ keySource: null, orgAccess: { tier: 1 } });
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
