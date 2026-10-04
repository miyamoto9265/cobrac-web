import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BradbRegisterRequest, BradbRegisterResponse, BraVersionManifest, ProjectBradbResponse, ProjectRecord } from "@cobrac/shared";
import { summarizeManifest } from "@cobrac/shared";

vi.hoisted(() => {
  process.env.BRADB_IMPORT_FUNCTION = "cobrac-bradb-import";
});
vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send() {}
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));

const s3 = vi.hoisted(() => new Map<string, string>());
const invoke = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/aws.js", () => {
  const rels = (u: string, p: string) => [...s3.keys()].filter((k) => k.startsWith(`users/${u}/${p}/`)).map((k) => k.slice(`users/${u}/${p}/`.length));
  return {
    invokeBradb: invoke,
    listArtifacts: vi.fn(async () => []),
    listVersionNumbers: vi.fn(async (u: string, p: string) => [...new Set(rels(u, p).flatMap((r) => (/^revisions\/(\d+)\//.test(r) ? [Number(/^revisions\/(\d+)\//.exec(r)![1])] : [])))]),
    getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
  };
});

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
const P = "an-opaque-project-id";
const now = "2026-10-01T00:00:00.000Z";
const call = (who: typeof A, method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event: { requestContext: { authorizer: { jwt: { claims: who } } } }, lambdaContext: {} });
const put = (rel: string, text: string) => s3.set(`users/${A.sub}/${P}/${rel}`, text);

function manifest(n: number, withPackage = true): BraVersionManifest {
  return {
    schema: "cobrac.bra-version/1",
    versionId: `${P}@v${n}`,
    projectId: P,
    version: n,
    parent: null,
    origin: "job",
    createdAt: now,
    contributor: "Alice A.",
    job: null,
    generator: { appVersion: "0.26.0", gitSha: null, promptsSha256: null, schemasSha256: null, model: null, reasoningEffort: null, researchMode: null, canon: null, sabraBoundary: "neocortex", rcsBoundaryVersion: null, braFormat: "CoBRAC-v1-1" },
    contentSha256: "c".repeat(64),
    files: [],
    changes: null,
    bradb: withPackage ? { prefix: `revisions/${n}/bradb/`, files: [] } : null,
  };
}

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  invoke.mockReset();
  for (const [who, key] of [
    [A, "u7m2q9xa"],
    [B, "u3k8d0hn"],
  ] as const) {
    fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: "Alice A.", role: "user", disabled: false, apiKeyRegistered: true, userKey: key, createdAt: now, updatedAt: now });
  }
  const project: ProjectRecord = {
    userId: A.sub,
    projectId: P,
    revision: 2,
    roi: "flocculus",
    tlf: "VOR gain adaptation",
    contributor: "Alice A.",
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
  fake.put("projects", project);
  for (const n of [1, 2]) {
    const m = manifest(n, n === 2);
    put(`revisions/${n}/manifest.json`, JSON.stringify(m));
    fake.put("jobs", { projectId: P, jobId: `job_${n}`, userId: A.sub, type: "initial", status: "COMPLETED", instruction: null, pendingAnswer: null, ecsTaskArn: null, retryCount: 0, lastHeartbeat: null, startedAt: now, endedAt: now, errorMessage: null, createdAt: now, updatedAt: now, braVersion: summarizeManifest(m) });
  }
  put("revisions/2/bradb/manifest.json", JSON.stringify({ schema: "cobrac.bradb-package/1", projectId: P, versionId: `${P}@v2`, files: [{ name: `${P}_project.csv`, source: "Project.csv", sha256: "x", size: 3 }] }));
  put(`revisions/2/bradb/${P}_project.csv`, "a,b");
});

describe("BRA-DB routes", () => {
  it("sends the version's package to the registration Lambda and remembers what BRA-DB holds", async () => {
    const res: BradbRegisterResponse = {
      registration: { registrationId: 7, versionId: `${P}@v2`, version: 2, parentVersionId: null, contentSha256: "c".repeat(64), status: "registered", mode: "create", reason: null, counts: null, changes: null, skippedCircuits: [], warnings: [], requestedBy: "Alice A.", registeredAt: now },
    };
    invoke.mockResolvedValue(res);
    const r = await call(A, "POST", `/projects/${P}/versions/2/bradb`, {});
    expect(r.status).toBe(200);
    const req = invoke.mock.calls[0][0] as BradbRegisterRequest;
    expect(req).toMatchObject({ action: "register", files: { [`${P}_project.csv`]: "a,b" }, project: { roi: "flocculus", tlf: "VOR gain adaptation" }, allowShrink: false, requestedBy: "Alice A." });
    expect(req.manifest.versionId).toBe(`${P}@v2`);
    expect(fake.items("projects")[0].bradb).toMatchObject({ versionId: `${P}@v2`, registrationId: 7 });
  });

  it("passes allowShrink and does not record a rejected registration", async () => {
    invoke.mockResolvedValue({ registration: { status: "rejected" }, code: "shrink" });
    const r = await (await call(A, "POST", `/projects/${P}/versions/2/bradb`, { allowShrink: true })).json();
    expect(r.code).toBe("shrink");
    expect((invoke.mock.calls[0][0] as BradbRegisterRequest).allowShrink).toBe(true);
    expect(fake.items("projects")[0].bradb).toBeUndefined();
  });

  it("refuses versions without a package and other users' projects", async () => {
    expect((await call(A, "POST", `/projects/${P}/versions/1/bradb`, {})).status).toBe(400);
    expect((await call(B, "POST", `/projects/${P}/versions/2/bradb`, {})).status).toBe(404);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns the registrations from BRA-DB", async () => {
    invoke.mockResolvedValue({ projectId: P, current: null, registrations: [] });
    const r = (await (await call(A, "GET", `/projects/${P}/bradb`)).json()) as ProjectBradbResponse;
    expect(r).toEqual({ enabled: true, projectId: P, current: null, registrations: [] });
    expect(invoke).toHaveBeenCalledWith({ action: "status", projectId: P });
  });
});
