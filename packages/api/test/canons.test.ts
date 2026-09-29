import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonDetailResponse, CanonRecord, ListCanonsResponse, ProjectRecord } from "@cobrac/shared";
import { CANON_ID_REGEX } from "@cobrac/shared";

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
  deleteObject: vi.fn(async () => undefined),
  encryptApiKey: vi.fn(async () => "enc"),
  stopEcsTask: vi.fn(async () => undefined),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };

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
function project(userId: string, projectId: string, extra: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    userId,
    projectId,
    name: `P ${projectId}`,
    nameSource: "user",
    roi: "perisylvian cortex",
    tlf: "sentence comprehension",
    contributor: userId,
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
    ...extra,
  };
}
const storedProject = (userId: string, projectId: string) =>
  fake.items("projects").find((p) => p.userId === userId && p.projectId === projectId) as unknown as ProjectRecord;

beforeEach(() => {
  fake.tables.clear();
  for (const [who, key, role] of [
    [A, "u7m2q9xa", "user"],
    [B, "u3k8d0hn", "user"],
    [ADMIN, "u9z9z9z9", "admin"],
  ] as const) {
    fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role, disabled: false, apiKeyRegistered: true, userKey: key, createdAt: now, updatedAt: now });
  }
  fake.put("projects", project(A.sub, "u7m2q9xa-1"));
  fake.put("projects", project(A.sub, "u7m2q9xa-2"));
  fake.put("projects", project(B.sub, "u3k8d0hn-1"));
});

describe("canons", () => {
  it("creates Canons with per-user IDs, private and empty, and lists only the caller's", async () => {
    const c1 = await json<CanonRecord>(call(A, "POST", "/canons", { name: "  言語野  （層水準）", policy: "新皮質は野 × 投射クラス\n皮質下は核全体" }));
    const c2 = await json<CanonRecord>(call(A, "POST", "/canons", { name: "DMN", constraintMode: "advisory" }));
    const b1 = await json<CanonRecord>(call(B, "POST", "/canons", { name: "Bob's" }));
    expect(c1.canonId).toBe("u7m2q9xa-c1");
    expect(c2.canonId).toBe("u7m2q9xa-c2");
    expect(b1.canonId).toBe("u3k8d0hn-c1");
    expect(c1.canonId).toMatch(CANON_ID_REGEX);
    expect(c1).toMatchObject({ name: "言語野 （層水準）", policy: "新皮質は野 × 投射クラス\n皮質下は核全体", visibility: "private", headRevision: 0, memberCount: 0 });
    // the constraint strength is gone: a mode in the request is ignored and not stored
    expect(c1).not.toHaveProperty("constraintMode");
    expect(c2).not.toHaveProperty("constraintMode");

    const list = await json<ListCanonsResponse>(call(A, "GET", "/canons"));
    expect(list.items.map((c) => c.canonId).sort()).toEqual(["u7m2q9xa-c1", "u7m2q9xa-c2"]);
  });

  it("validates the name and ignores a constraint mode", async () => {
    expect((await call(A, "POST", "/canons", { name: "  " })).status).toBe(400);
    expect((await call(A, "POST", "/canons", { name: "x", constraintMode: "loose" })).status).toBe(201);
    expect((await call(A, "POST", "/canons", { name: "x", policy: "a\u0007" })).status).toBe(400);
  });

  it("hides other users' Canons (404) but lets admins read them", async () => {
    const c = await json<CanonRecord>(call(A, "POST", "/canons", { name: "A" }));
    expect((await call(B, "GET", `/canons/${c.canonId}`)).status).toBe(404);
    expect((await call(B, "PUT", `/canons/${c.canonId}`, { name: "stolen" })).status).toBe(404);
    expect((await call(B, "DELETE", `/canons/${c.canonId}`)).status).toBe(404);
    const seen = await json<CanonDetailResponse>(call(ADMIN, "GET", `/canons/${c.canonId}`));
    expect(seen.canon.name).toBe("A");
    expect((await call(ADMIN, "PUT", `/canons/${c.canonId}`, { name: "x" })).status).toBe(404);
    expect((await call(A, "GET", "/canons/not-a-canon")).status).toBe(404);
  });

  it("updates only the given fields", async () => {
    const c = await json<CanonRecord>(call(A, "POST", "/canons", { name: "A", description: "d", policy: "p" }));
    await json(call(A, "PUT", `/canons/${c.canonId}`, { policy: "p2" }));
    const d = await json<CanonDetailResponse>(call(A, "GET", `/canons/${c.canonId}`));
    expect(d.canon).toMatchObject({ name: "A", description: "d", policy: "p2" });
  });

  it("adds and removes the owner's projects; a project is in at most one Canon", async () => {
    const c1 = await json<CanonRecord>(call(A, "POST", "/canons", { name: "one" }));
    const c2 = await json<CanonRecord>(call(A, "POST", "/canons", { name: "two" }));
    expect((await call(A, "POST", `/canons/${c1.canonId}/members`, { projectId: "u7m2q9xa-1" })).status).toBe(201);
    expect(storedProject(A.sub, "u7m2q9xa-1").canonId).toBe(c1.canonId);
    // idempotent for the same Canon, 409 for another one
    expect((await call(A, "POST", `/canons/${c1.canonId}/members`, { projectId: "u7m2q9xa-1" })).status).toBe(200);
    const clash = await call(A, "POST", `/canons/${c2.canonId}/members`, { projectId: "u7m2q9xa-1" });
    expect(clash.status).toBe(409);
    expect(await clash.text()).toContain("one");
    // other users' projects look like missing ones
    expect((await call(A, "POST", `/canons/${c1.canonId}/members`, { projectId: "u3k8d0hn-1" })).status).toBe(404);

    const d = await json<CanonDetailResponse>(call(A, "GET", `/canons/${c1.canonId}`));
    expect(d.canon.memberCount).toBe(1);
    expect(d.members).toEqual([expect.objectContaining({ projectId: "u7m2q9xa-1", name: "P u7m2q9xa-1", hasArtifacts: true })]);
    const p = await json<ProjectRecord>(call(A, "GET", "/projects/u7m2q9xa-1"));
    expect(p.canonId).toBe(c1.canonId);

    await json(call(A, "DELETE", `/canons/${c1.canonId}/members/u7m2q9xa-1`));
    expect(storedProject(A.sub, "u7m2q9xa-1").canonId).toBeUndefined();
    expect((await json<CanonDetailResponse>(call(A, "GET", `/canons/${c1.canonId}`))).canon.memberCount).toBe(0);
    expect((await call(A, "DELETE", `/canons/${c1.canonId}/members/u7m2q9xa-1`)).status).toBe(404);
    expect((await call(A, "POST", `/canons/${c2.canonId}/members`, { projectId: "u7m2q9xa-1" })).status).toBe(201);
  });

  it("does not add deleted projects, and a deleted project leaves its Canon", async () => {
    const c = await json<CanonRecord>(call(A, "POST", "/canons", { name: "one" }));
    fake.put("projects", project(A.sub, "u7m2q9xa-3", { deletedAt: now, deletedBy: A.sub }));
    expect((await call(A, "POST", `/canons/${c.canonId}/members`, { projectId: "u7m2q9xa-3" })).status).toBe(404);

    await json(call(A, "POST", `/canons/${c.canonId}/members`, { projectId: "u7m2q9xa-2" }));
    await json(call(A, "DELETE", "/projects/u7m2q9xa-2"));
    expect(storedProject(A.sub, "u7m2q9xa-2").canonId).toBeUndefined();
    const d = await json<CanonDetailResponse>(call(A, "GET", `/canons/${c.canonId}`));
    expect(d.members).toEqual([]);
  });

  it("soft-deletes a Canon: its projects are released and nothing is removed", async () => {
    const c = await json<CanonRecord>(call(A, "POST", "/canons", { name: "one" }));
    await json(call(A, "POST", `/canons/${c.canonId}/members`, { projectId: "u7m2q9xa-1" }));
    await json(call(A, "DELETE", `/canons/${c.canonId}`));
    expect(storedProject(A.sub, "u7m2q9xa-1").canonId).toBeUndefined();
    expect((await call(A, "GET", `/canons/${c.canonId}`)).status).toBe(404);
    expect((await json<ListCanonsResponse>(call(A, "GET", "/canons"))).items).toEqual([]);
    // META and MEMBER items are still there
    expect(fake.items("canons").map((i) => i.sk).sort()).toEqual(["MEMBER#u7m2q9xa-1", "META"]);
    expect(fake.items("canons").find((i) => i.sk === "META")!.deletedAt).toBeTruthy();
  });

  it("lists no revisions for a new Canon", async () => {
    const c = await json<CanonRecord>(call(A, "POST", "/canons", { name: "one" }));
    expect(await json(call(A, "GET", `/canons/${c.canonId}/revisions`))).toEqual({ items: [] });
  });
});
