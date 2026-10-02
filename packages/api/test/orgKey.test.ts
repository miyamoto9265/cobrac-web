import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord, MeResponse, ModelsResponse, OrgKeyStatus, OrgUsageResponse, ProjectRecord, UserRecord } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send() {}
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("../src/lib/aws.js", () => ({
  presignDownload: vi.fn(async () => "https://signed.example/x"),
  enqueueRun: vi.fn(async () => undefined),
  listArtifacts: vi.fn(async () => []),
  getObjectText: vi.fn(async () => null),
  putObjectText: vi.fn(async () => undefined),
  putObjectBytes: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  encryptApiKey: vi.fn(async () => "enc"),
  stopEcsTask: vi.fn(async () => undefined),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const ALICE = { sub: "sub-alice", email: "alice@example.com" };
const BOB = { sub: "sub-bob", email: "bob@example.com" };
const ORG_SECRET = "AQICAHorg-key-ciphertext";

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
  fake.put("users", user(ADMIN, "uadm1n00", { role: "admin", apiKeyRegistered: true, apiKeyLast4: "9xyz", encryptedApiKey: ORG_SECRET, availableModels: ["gpt-6-sol", "gpt-6-luna", "gpt-5.6-luna", "gpt-6-astra"] }));
  fake.put("users", user(ALICE, "ua11ce00"));
  fake.put("users", user(BOB, "ub0b0000"));
});

const share = () => json<OrgKeyStatus>(call(ADMIN, "PUT", "/admin/org-key", { share: true }));
const approve = (who: typeof ADMIN, tier: 0 | 1 | 2) => json(call(ADMIN, "PUT", `/admin/users/${who.sub}`, { orgTier: tier }));
const create = (who: typeof ADMIN, body: Record<string, unknown> = {}) => call(who, "POST", "/projects", { roi: "flocculus", tlf: "VOR", ...body });

describe("organization key", () => {
  it("is off by default: users without a key cannot run jobs until approved and the key is shared", async () => {
    expect((await json<MeResponse>(call(ALICE, "GET", "/users/me"))).keySource).toBeNull();
    expect((await create(ALICE)).status).toBe(400);

    await approve(ALICE, 1);
    const unshared = await create(ALICE);
    expect(unshared.status).toBe(400);
    expect(await unshared.text()).toContain("組織の API キー");

    const status = await share();
    expect(status).toEqual({ provider: { userId: ADMIN.sub, email: ADMIN.email, last4: "9xyz" }, available: true });
    expect(await json<MeResponse>(call(ALICE, "GET", "/users/me"))).toMatchObject({ keySource: "org", orgTier: 1, orgAccess: { tier: 1, approvedBy: ADMIN.sub } });
    expect((await create(ALICE)).status).toBe(201);
    // approval is per user
    expect((await create(BOB)).status).toBe(400);
  });

  it("only admins manage approvals and the key, and only the key's owner can share it", async () => {
    expect((await call(ALICE, "PUT", "/admin/org-key", { share: true })).status).toBe(403);
    expect((await call(ALICE, "PUT", `/admin/users/${BOB.sub}`, { orgTier: 2 })).status).toBe(403);
    expect((await call(ALICE, "GET", "/admin/org-usage")).status).toBe(403);
    expect((await call(ALICE, "GET", "/admin/org-key")).status).toBe(403);
    expect((await call(ADMIN, "PUT", `/admin/users/${BOB.sub}`, { orgTier: 3 })).status).toBe(400);
    expect((await call(ADMIN, "PUT", "/admin/users/sub-nobody", { orgTier: 1 })).status).toBe(404);

    setUser(ALICE, { role: "admin" });
    const noKey = await call(ALICE, "PUT", "/admin/org-key", { share: true });
    expect(noKey.status).toBe(400);
    expect(getUser(ALICE).orgKeyProvider).toBeUndefined();
  });

  it("never sends the encrypted key to clients", async () => {
    await share();
    await approve(ALICE, 2);
    const responses = await Promise.all([
      call(ADMIN, "GET", "/admin/users").then((r) => r.text()),
      call(ADMIN, "GET", "/admin/org-key").then((r) => r.text()),
      call(ALICE, "GET", "/users/me").then((r) => r.text()),
      call(ALICE, "GET", "/users/me/models").then((r) => r.text()),
      call(ADMIN, "GET", "/users/me").then((r) => r.text()),
    ]);
    for (const body of responses) expect(body).not.toContain(ORG_SECRET);
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

  it("lets Tier 2 use every model of the organization key", async () => {
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

  it("stops new jobs as soon as the approval is revoked or the key is no longer shared", async () => {
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
    expect(await json<OrgKeyStatus>(call(ADMIN, "PUT", "/admin/org-key", { share: false }))).toEqual({ provider: null, available: false });
    expect((await create(BOB)).status).toBe(400);
    await share();
    // deleting the provider's own key stops the organization key as well
    await json(call(ADMIN, "DELETE", "/users/me/apikey"));
    expect(await json<OrgKeyStatus>(call(ADMIN, "GET", "/admin/org-key"))).toMatchObject({ provider: { userId: ADMIN.sub, last4: null }, available: false });
    expect((await create(BOB)).status).toBe(400);
  });

  it("moves the shared key to the admin who shares last", async () => {
    await share();
    setUser(ALICE, { role: "admin", apiKeyRegistered: true, apiKeyLast4: "aaaa", encryptedApiKey: "alice-own" });
    const status = await json<OrgKeyStatus>(call(ALICE, "PUT", "/admin/org-key", { share: true }));
    expect(status.provider?.userId).toBe(ALICE.sub);
    expect(getUser(ADMIN).orgKeyProvider).toBe(false);
    expect(getUser(ALICE).orgKeyProvider).toBe(true);
  });

  it("sums organization-key usage per user for the admin", async () => {
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
