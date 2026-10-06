/**
 * Hypothesis mode, stage 2 (API): "Allow hypotheses" on create (scope S1 on the whole HCD) and on follow-ups (S2, …,
 * stored with the job in one transaction); projects and jobs without it get no new attributes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord, MessageRecord, ProjectRecord } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send() {}
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));
const enqueued = vi.hoisted(() => [] as unknown[]);
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async (m: unknown) => void enqueued.push(m)),
  listArtifacts: vi.fn(async () => []),
  getObjectText: vi.fn(async () => null),
  moveStagingToProject: vi.fn(async () => undefined),
  headStaging: vi.fn(async () => null),
  stopEcsTask: vi.fn(async () => undefined),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const call = (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event: { requestContext: { authorizer: { jwt: { claims: A } } } }, lambdaContext: {} });
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
const stored = (id: string) => fake.items("projects").find((p) => p.projectId === id) as unknown as ProjectRecord;
const jobsOf = (id: string) => fake.items("jobs").filter((j) => j.projectId === id) as unknown as JobRecord[];
const notices = (id: string) => (fake.items("messages") as unknown as MessageRecord[]).filter((m) => m.projectId === id && m.role === "system");
const complete = (id: string) => fake.put("projects", { ...stored(id), status: "COMPLETED" });
const HYPOTHESIS_KEYS = ["evidenceMode", "hypothesisScopes", "hypothesisMaxShare"];

beforeEach(async () => {
  fake.tables.clear();
  enqueued.length = 0;
  await json(call("GET", "/users/me"));
  fake.put("users", { ...fake.items("users")[0], apiKeyRegistered: true });
});

describe("creating a project", () => {
  it("stores nothing new without hypothesis (literature-supported only)", async () => {
    for (const hypothesis of [undefined, null]) {
      const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "flocculus", tlf: "VOR", ...(hypothesis === null ? { hypothesis } : {}) }));
      for (const k of HYPOTHESIS_KEYS) expect(Object.keys(stored(p.projectId))).not.toContain(k);
      expect(Object.keys(jobsOf(p.projectId)[0])).not.toContain("hypothesisScopeId");
      expect(notices(p.projectId).map((m) => m.meta?.i18n)).not.toContain("sys.hypothesisOn");
    }
  });

  it("stores hypothesis mode, scope S1 on the whole HCD and the limit (20% when omitted)", async () => {
    const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "flocculus", tlf: "VOR", hypothesis: { claims: ["existence", "transmitter"], note: "  the climbing\\n fibre input  " } }));
    const job = jobsOf(p.projectId)[0];
    expect(stored(p.projectId)).toMatchObject({
      evidenceMode: "hypothesis",
      hypothesisMaxShare: 0.2,
      hypothesisScopes: [{ id: "S1", claims: ["existence", "transmitter"], target: { kind: "all" }, note: "the climbing\\n fibre input", jobId: job.jobId }],
    });
    expect(job.hypothesisScopeId).toBe("S1");
    expect(notices(p.projectId).find((m) => m.meta?.i18n === "sys.hypothesisOn")?.content).toBe("Hypotheses allowed: S1: existence, transmitter on the whole HCD (share limit 20%).");
    const q = await json<ProjectRecord>(call("POST", "/projects", { roi: "x", tlf: "y", hypothesis: { claims: ["role"], maxShare: 0.5 } }));
    expect(stored(q.projectId).hypothesisMaxShare).toBe(0.5);
  });

  it("puts a note with line breaks on one line", async () => {
    const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "x", tlf: "y", hypothesis: { claims: ["role"], note: "line one\nline two\r\n  three" } }));
    expect(stored(p.projectId).hypothesisScopes![0].note).toBe("line one line two three");
  });

  it("rejects invalid claims, limits and notes with 400 (and stores no project)", async () => {
    for (const hypothesis of [
      { claims: [] },
      { claims: ["existence", "existence"] },
      { claims: ["prediction"] },
      { claims: "existence" },
      { claims: ["existence"], maxShare: 0.25 },
      { claims: ["existence"], maxShare: "0.2" },
      { claims: ["existence"], note: "x".repeat(201) },
      { claims: ["existence"], note: 3 },
      "on",
    ]) {
      const r = await call("POST", "/projects", { roi: "x", tlf: "y", hypothesis });
      expect(r.status, JSON.stringify(hypothesis)).toBe(400);
    }
    expect(fake.items("projects")).toEqual([]);
    expect((await call("POST", "/projects", { roi: "x", tlf: "y", hypothesis: { claims: ["existence"], note: "x".repeat(200) } })).status).toBe(201);
  });
});

describe("follow-ups", () => {
  it("appends a scope S<n> with the job, switches a literature-only project to hypothesis mode, and notes the scope", async () => {
    const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "flocculus", tlf: "VOR" }));
    complete(p.projectId);
    const f = await json<{ jobId: string }>(
      call("POST", `/projects/${p.projectId}/followup`, { instruction: "add the climbing fibre input", hypothesis: { claims: ["existence"], target: { kind: "items", circuitIds: ["U.IO", "IO", "PC(purkinje)"], gnIds: ["R.Learning"] } } }),
    );
    const project = stored(p.projectId);
    expect(project).toMatchObject({ evidenceMode: "hypothesis", hypothesisMaxShare: 0.2, status: "QUEUED", activeJobId: f.jobId });
    expect(project.hypothesisScopes).toEqual([{ id: "S1", claims: ["existence"], target: { kind: "items", circuitIds: ["IO", "PC(purkinje)"], gnIds: ["R.Learning"] }, jobId: f.jobId, createdAt: expect.any(String) }]);
    expect(jobsOf(p.projectId).find((j) => j.jobId === f.jobId)).toMatchObject({ type: "followup", instruction: "add the climbing fibre input", hypothesisScopeId: "S1" });
    expect(notices(p.projectId).find((m) => m.meta?.i18n === "sys.hypothesisScope")?.content).toBe(
      "Hypotheses allowed: S1: existence on circuits `IO`, `PC(purkinje)` and FRG GNs `R.Learning` (their UCs) (share limit 20%).",
    );
    expect(enqueued).toContainEqual(expect.objectContaining({ jobId: f.jobId, mode: "followup" }));

    complete(p.projectId);
    const g = await json<{ jobId: string }>(call("POST", `/projects/${p.projectId}/followup`, { instruction: "more", hypothesis: { claims: ["sign"], target: { kind: "all" }, maxShare: 0.3 } }));
    expect(stored(p.projectId).hypothesisScopes!.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(stored(p.projectId).hypothesisMaxShare).toBe(0.3);
    expect(jobsOf(p.projectId).find((j) => j.jobId === g.jobId)!.hypothesisScopeId).toBe("S2");
  });

  it("creates no scope from the instruction text alone", async () => {
    const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "flocculus", tlf: "VOR" }));
    complete(p.projectId);
    const f = await json<{ jobId: string }>(call("POST", `/projects/${p.projectId}/followup`, { instruction: "hypotheses are fine here, add any connection you need" }));
    for (const k of HYPOTHESIS_KEYS) expect(Object.keys(stored(p.projectId))).not.toContain(k);
    expect(Object.keys(jobsOf(p.projectId).find((j) => j.jobId === f.jobId)!)).not.toContain("hypothesisScopeId");
  });

  it("rejects invalid targets with 400 and writes neither the job nor the scope", async () => {
    const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "flocculus", tlf: "VOR", hypothesis: { claims: ["role"] } }));
    complete(p.projectId);
    const before = { project: structuredClone(stored(p.projectId)), jobs: jobsOf(p.projectId).length };
    for (const target of [
      undefined,
      { kind: "some" },
      { kind: "items", circuitIds: [], gnIds: [] },
      { kind: "items", circuitIds: ["has space"], gnIds: [] },
      { kind: "items", circuitIds: ["x".repeat(101)], gnIds: [] },
      { kind: "items", circuitIds: [], gnIds: ["Learning"] },
      { kind: "items", circuitIds: Array.from({ length: 201 }, (_, i) => `C${i}`), gnIds: [] },
    ]) {
      const r = await call("POST", `/projects/${p.projectId}/followup`, { instruction: "x", hypothesis: { claims: ["existence"], target } });
      expect(r.status, JSON.stringify(target)).toBe(400);
    }
    expect(stored(p.projectId)).toEqual(before.project);
    expect(jobsOf(p.projectId)).toHaveLength(before.jobs);
  });

  it("writes the job and the scope together or not at all (a second submission gets 409)", async () => {
    const p = await json<ProjectRecord>(call("POST", "/projects", { roi: "flocculus", tlf: "VOR", hypothesis: { claims: ["role"] } }));
    complete(p.projectId);
    const body = { instruction: "x", hypothesis: { claims: ["existence"], target: { kind: "all" } } };
    // two submissions read the same COMPLETED project: the first wins, the second writes nothing
    const [r1, r2] = await Promise.all([call("POST", `/projects/${p.projectId}/followup`, body), call("POST", `/projects/${p.projectId}/followup`, body)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(stored(p.projectId).hypothesisScopes!.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(jobsOf(p.projectId).filter((j) => j.type === "followup")).toHaveLength(1);
  });
});
