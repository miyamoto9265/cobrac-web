import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactInfo, CanonRecord, CloneProjectResponse, ProjectRecord, PublicCanonDetail, PublicProjectDetail, PublicProjectSummary } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send() {}
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));

const s3 = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("../src/lib/aws.js", () => {
  const key = (u: string, p: string, rel: string) => `users/${u}/${p}/${rel}`;
  return {
    presignDownload: vi.fn(async () => "https://signed.example/x"),
    enqueueRun: vi.fn(async () => undefined),
    listArtifacts: vi.fn(async (u: string, p: string): Promise<ArtifactInfo[]> => {
      const prefix = `users/${u}/${p}/`;
      return [...s3.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
        .filter((rel) => !rel.startsWith("thread/"))
        .map((rel) => ({ key: rel, name: rel.split("/").pop()!, size: 1, lastModified: "2026-09-01T00:00:00.000Z", category: "other" as const }));
    }),
    getObjectText: vi.fn(async (u: string, p: string, rel: string) => {
      const b = s3.get(key(u, p, rel));
      return b ? new TextDecoder().decode(b) : null;
    }),
    getObjectBytes: vi.fn(async (u: string, p: string, rel: string) => s3.get(key(u, p, rel)) ?? null),
    putObjectText: vi.fn(async (u: string, p: string, rel: string, body: string) => void s3.set(key(u, p, rel), new TextEncoder().encode(body))),
    putObjectBytes: vi.fn(async (u: string, p: string, rel: string, body: Uint8Array) => void s3.set(key(u, p, rel), body)),
    deleteObject: vi.fn(async () => undefined),
    encryptApiKey: vi.fn(async () => "enc"),
    stopEcsTask: vi.fn(async () => undefined),
  };
});

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

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
const P = "u7m2q9xa-1";
function project(userId: string, projectId: string, extra: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    userId,
    projectId,
    name: "Sentence comprehension",
    nameSource: "auto",
    revision: 3,
    roi: "perisylvian cortex",
    tlf: "sentence comprehension",
    contributor: "Alice A.",
    status: "COMPLETED",
    currentStep: "XLSX",
    stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" },
    activeJobId: null,
    codexThreadId: "thread-secret",
    pendingQuestion: null,
    hasArtifacts: true,
    errorMessage: null,
    usage: { inputTokens: 5, cachedInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 0 },
    costUsd: 1.23,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    ...extra,
  };
}
const put = (u: string, p: string, rel: string, text: string) => s3.set(`users/${u}/${p}/${rel}`, new TextEncoder().encode(text));
const text = (u: string, p: string, rel: string) => {
  const b = s3.get(`users/${u}/${p}/${rel}`);
  return b ? new TextDecoder().decode(b) : undefined;
};

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  for (const [who, key] of [
    [A, "u7m2q9xa"],
    [B, "u3k8d0hn"],
  ] as const) {
    fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: key, createdAt: now, updatedAt: now });
  }
  fake.put("projects", project(A.sub, P));
  put(A.sub, P, `workspace/${P}_HCD/uc.json`, `{"project":"${P}","ucs":[]}`);
  put(A.sub, P, `workspace/${P}_CSV/Circuits.csv`, `ROI_${P},${P}\n`);
  put(A.sub, P, "workspace/report.md", "# Report");
  put(A.sub, P, "workspace/materials/paper.pdf", "%PDF");
  put(A.sub, P, "graph/hcd.json", `{"projectId":"${P}"}`);
  put(A.sub, P, "graph/hcd.layout.json", "{}");
  put(A.sub, P, `output/${P}.bra.xlsx`, "xlsx");
  put(A.sub, P, "thread/sessions/s.jsonl", "secret chat");
});

const snapshotOf = (u: string, p: string) =>
  [...s3.entries()].filter(([k]) => k.startsWith(`users/${u}/${p}/`)).map(([k, v]) => [k, new TextDecoder().decode(v)]);

describe("publishing projects", () => {
  it("is private by default and hidden from others", async () => {
    expect((await json<{ items: PublicProjectSummary[] }>(call(B, "GET", "/public/projects"))).items).toEqual([]);
    expect((await call(B, "GET", `/public/projects/${P}`)).status).toBe(404);
    expect((await call(B, "POST", `/public/projects/${P}/clone`)).status).toBe(404);
  });

  it("lists a public project without owner identifiers, chat or cost, and hides it again when made private", async () => {
    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    const list = await json<{ items: PublicProjectSummary[] }>(call(B, "GET", "/public/projects"));
    expect(list.items).toEqual([expect.objectContaining({ projectId: P, name: "Sentence comprehension", contributor: "Alice A.", ownerUserKey: "u7m2q9xa", cloneCount: 0 })]);
    const detail = await json<PublicProjectDetail>(call(B, "GET", `/public/projects/${P}`));
    const raw = JSON.stringify(detail);
    for (const secret of [A.sub, A.email, "thread-secret", "costUsd", "usage"]) expect(raw).not.toContain(secret);
    expect(detail.files.sort()).toEqual(["graph/hcd.json", "workspace/report.md", `workspace/${P}_HCD/uc.json`].sort());
    expect(await (await call(B, "GET", `/public/projects/${P}/text?key=workspace/report.md`)).text()).toBe("# Report");
    expect((await call(B, "GET", `/public/projects/${P}/text?key=thread/sessions/s.jsonl`)).status).toBe(400);

    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "private" }));
    expect((await json<{ items: PublicProjectSummary[] }>(call(B, "GET", "/public/projects"))).items).toEqual([]);
    expect((await call(B, "GET", `/public/projects/${P}`)).status).toBe(404);
  });

  it("only lets the owner publish, and only projects with artifacts", async () => {
    expect((await call(B, "PUT", `/projects/${P}/visibility`, { visibility: "public" })).status).toBe(404);
    fake.put("projects", project(A.sub, "u7m2q9xa-2", { hasArtifacts: false }));
    expect((await call(A, "PUT", "/projects/u7m2q9xa-2/visibility", { visibility: "public" })).status).toBe(400);
    expect((await call(A, "PUT", `/projects/${P}/visibility`, { visibility: "everyone" })).status).toBe(400);
  });

  it("drops a deleted public project from the list", async () => {
    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    await json(call(A, "DELETE", `/projects/${P}`));
    expect((await json<{ items: PublicProjectSummary[] }>(call(B, "GET", "/public/projects"))).items).toEqual([]);
  });
});

describe("cloning", () => {
  it("copies artifacts into a new private project of the cloner and never writes to the original", async () => {
    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    const beforeObjects = snapshotOf(A.sub, P);
    const beforeItem = structuredClone(fake.items("projects").find((x) => x.projectId === P));

    const r = await json<CloneProjectResponse>(call(B, "POST", `/public/projects/${P}/clone`));
    expect(r.projectId).toBe("u3k8d0hn-1");
    const N = r.projectId;

    expect(snapshotOf(A.sub, P)).toEqual(beforeObjects);
    expect(fake.items("projects").find((x) => x.projectId === P)).toEqual(beforeItem);

    expect(text(B.sub, N, `workspace/${N}_HCD/uc.json`)).toBe(`{"project":"${N}","ucs":[]}`);
    expect(text(B.sub, N, `workspace/${N}_CSV/Circuits.csv`)).toBe(`ROI_${N},${N}\n`);
    expect(text(B.sub, N, "workspace/report.md")).toBe("# Report");
    expect(text(B.sub, N, "workspace/materials/paper.pdf")).toBe("%PDF");
    expect(text(B.sub, N, "graph/hcd.json")).toBe(`{"projectId":"${N}"}`);
    for (const rel of ["graph/hcd.layout.json", `output/${P}.bra.xlsx`, `output/${N}.bra.xlsx`, "thread/sessions/s.jsonl"]) expect(text(B.sub, N, rel)).toBeUndefined();

    const clone = await json<ProjectRecord>(call(B, "GET", `/projects/${N}`));
    expect(clone).toMatchObject({
      name: "Sentence comprehension (clone)",
      contributor: "Alice A.",
      status: "COMPLETED",
      hasArtifacts: true,
      codexThreadId: null,
      clonedFrom: { projectId: P, revision: 3, ownerUserKey: "u7m2q9xa", name: "Sentence comprehension" },
    });
    expect(clone.visibility ?? "private").toBe("private");
    expect(clone.usage).toBeUndefined();
    expect(clone.stepStates.XLSX).toBe("pending");

    const owner = await json<ProjectRecord & { cloneCount: number }>(call(A, "GET", `/projects/${P}`));
    expect(owner.cloneCount).toBe(1);
    expect((await json<PublicProjectDetail>(call(B, "GET", `/public/projects/${P}`))).cloneCount).toBe(1);
  });

  it("never copies running step states from an original that is mid-run or failed", async () => {
    fake.put("projects", project(A.sub, P, { status: "FAILED", stepStates: { HCD: "running", FRG: "running", CSV: "done", XLSX: "done" } }));
    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    const { projectId } = await json<CloneProjectResponse>(call(B, "POST", `/public/projects/${P}/clone`));
    const clone = await json<ProjectRecord>(call(B, "GET", `/projects/${projectId}`));
    expect(clone.stepStates).toEqual({ HCD: "pending", FRG: "pending", CSV: "done", XLSX: "pending" });
  });

  it("keeps the original's research-mode setting", async () => {
    for (const [i, researchMode] of [true, false, undefined].entries()) {
      const id = `u7m2q9xa-${i + 10}`;
      fake.put("projects", project(A.sub, id, researchMode === undefined ? {} : { researchMode }));
      put(A.sub, id, "workspace/report.md", "# Report");
      await json(call(A, "PUT", `/projects/${id}/visibility`, { visibility: "public" }));
      const { projectId } = await json<CloneProjectResponse>(call(B, "POST", `/public/projects/${id}/clone`));
      const clone = await json<ProjectRecord>(call(B, "GET", `/projects/${projectId}`));
      expect(clone.researchMode).toBe(researchMode);
    }
  });

  it("gives a Tier 1 cloner's copy a model the tier allows", async () => {
    fake.put("users", { userId: "sub-admin", email: "admin@example.com", displayName: "admin", contributorName: "admin", role: "admin", disabled: false, apiKeyRegistered: true, encryptedApiKey: "org", orgKeyProvider: true, createdAt: now, updatedAt: now });
    const bob = fake.items("users").find((u) => u.userId === B.sub)!;
    fake.put("users", { ...bob, apiKeyRegistered: false, defaultModel: "gpt-6-sol", orgAccess: { tier: 1, approvedAt: now, approvedBy: "sub-admin" } });
    fake.put("projects", project(A.sub, P, { model: "gpt-6-astra" }));
    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    const { projectId } = await json<CloneProjectResponse>(call(B, "POST", `/public/projects/${P}/clone`));
    expect((await json<ProjectRecord>(call(B, "GET", `/projects/${projectId}`))).model).toBe("gpt-6-luna");
  });

  it("lets the clone join the cloner's Canon", async () => {
    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    const { projectId } = await json<CloneProjectResponse>(call(B, "POST", `/public/projects/${P}/clone`));
    const canon = await json<CanonRecord>(call(B, "POST", "/canons", { name: "Bob's" }));
    expect((await call(B, "POST", `/canons/${canon.canonId}/members`, { projectId })).status).toBe(201);
  });
});

describe("publishing Canons", () => {
  it("toggles a Canon between private and public and switches pull requests off", async () => {
    const canon = await json<CanonRecord>(call(A, "POST", "/canons", { name: "Language", policy: "area × projection class" }));
    await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: P }));
    expect((await call(B, "GET", `/public/canons/${canon.canonId}`)).status).toBe(404);

    const pub = await json<CanonRecord>(call(A, "PUT", `/canons/${canon.canonId}/visibility`, { visibility: "public" }));
    expect(pub).toMatchObject({ visibility: "public", acceptPullRequests: true });
    let d = await json<PublicCanonDetail>(call(B, "GET", `/public/canons/${canon.canonId}`));
    expect(d).toMatchObject({ name: "Language", policy: "area × projection class", memberCount: 1, ownerUserKey: "u7m2q9xa", acceptPullRequests: true, publicMembers: [] });
    expect(JSON.stringify(d)).not.toContain(A.sub);

    await json(call(A, "PUT", `/projects/${P}/visibility`, { visibility: "public" }));
    await json(call(A, "PUT", `/canons/${canon.canonId}/visibility`, { acceptPullRequests: false }));
    d = await json<PublicCanonDetail>(call(B, "GET", `/public/canons/${canon.canonId}`));
    expect(d.acceptPullRequests).toBe(false);
    expect(d.publicMembers.map((m) => m.projectId)).toEqual([P]);
    expect((await json<{ items: unknown[] }>(call(B, "GET", "/public/canons"))).items).toHaveLength(1);

    expect((await call(B, "PUT", `/canons/${canon.canonId}/visibility`, { visibility: "private" })).status).toBe(404);
    await json(call(A, "PUT", `/canons/${canon.canonId}/visibility`, { visibility: "private" }));
    expect((await json<{ items: unknown[] }>(call(B, "GET", "/public/canons"))).items).toEqual([]);
  });
});
