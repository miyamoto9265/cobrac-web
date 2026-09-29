import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonDiff, CanonPullRequestRecord, CanonRecord, CanonSnapshot, ProjectRecord } from "@cobrac/shared";

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
vi.mock("../src/lib/aws.js", () => ({
  presignDownload: vi.fn(async () => "https://signed.example/x"),
  enqueueRun: vi.fn(async () => undefined),
  listArtifacts: vi.fn(async () => []),
  getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
  putObjectText: vi.fn(async () => undefined),
  putObjectBytes: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  encryptApiKey: vi.fn(async () => "enc"),
  stopEcsTask: vi.fn(async () => undefined),
  getCanonJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putCanonJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
}));

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
function project(projectId: string, extra: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    userId: A.sub,
    projectId,
    name: `P ${projectId}`,
    nameSource: "user",
    revision: 2,
    roi: "perisylvian cortex",
    tlf: "sentence comprehension",
    contributor: "Alice",
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
const uc = (id: string, d: string, tx = "Glutamate") => ({
  circuitId: id,
  descriptor: d,
  names: id,
  roi: "internal",
  sourceOfId: "BNA",
  transmitter: tx,
  modulationType: "Excitatory",
  comments: "",
  interface: "",
  requirement: "",
  requirementRealization: "",
  capability: "",
  mechanism: "",
  implementation: "",
  outputSemantics: "",
});
function writeProject(P: string, ucs: ReturnType<typeof uc>[], collections: unknown[] = [], conns: [string, string][] = []) {
  const put = (rel: string, v: unknown) => s3.set(`users/${A.sub}/${P}/workspace/${rel}`, JSON.stringify(v));
  put(`${P}_HCD/uc.json`, { ucs, collections });
  put(`${P}_HCD/connections.json`, {
    bif: [],
    connections: conns.map(([s, r]) => ({
      sender: s,
      senderRelation: "<",
      senderInLiterature: "area 44",
      receiver: r,
      receiverRelation: "=",
      receiverInLiterature: "area 22",
      comment: "",
      referenceIds: ["[Catani, 2005]"],
      taxon: "Human",
      measurementMethod: "DW-MRI",
      pointersOnLiterature: "The arcuate fasciculus connects Broca's territory with Wernicke's territory in humans.",
      pointersOnFigure: "Fig. 2",
    })),
  });
  put(`${P}_HCD/references.json`, { references: [{ id: "[Catani, 2005]", doi: "10.1002/ana.20319", literatureType: "Experimental results" }] });
  put("meta.json", { roi: "perisylvian cortex", tlf: "sentence comprehension", description: "x" });
}

let canon: CanonRecord;
beforeEach(async () => {
  fake.tables.clear();
  s3.clear();
  fake.put("users", { userId: A.sub, email: A.email, displayName: "a", contributorName: "a", role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now });
  fake.put("users", { userId: B.sub, email: B.email, displayName: "b", contributorName: "b", role: "user", disabled: false, apiKeyRegistered: true, userKey: "u3k8d0hn", createdAt: now, updatedAt: now });
  // coarse: A44d@L uniform; fine: A44d@L split into IT / PT
  fake.put("projects", project("u7m2q9xa-1"));
  writeProject("u7m2q9xa-1", [uc("A44d@L", "BNA:29"), uc("A22c@L", "BNA:75")], [], [["A44d@L", "A22c@L"]]);
  fake.put("projects", project("u7m2q9xa-2"));
  writeProject(
    "u7m2q9xa-2",
    [uc("A44d@L(L3,IT)", "BNA:29/lay:L3/cell:IT"), uc("A44d@L(L5,PT)", "BNA:29/lay:L5/cell:PT"), uc("A22c@L", "BNA:75", "Glutamate; GABA")],
    [{ circuitId: "A44d@L", descriptor: "BNA:29", names: "A44d@L", sourceOfId: "collection", subCircuits: ["A44d@L(L3,IT)", "A44d@L(L5,PT)"], comments: "" }],
    [["A44d@L(L3,IT)", "A22c@L"]],
  );
  fake.put("projects", project("u7m2q9xa-3", { status: "RUNNING" }));
  canon = await json<CanonRecord>(call(A, "POST", "/canons", { name: "Language" }));
  for (const p of ["u7m2q9xa-1", "u7m2q9xa-2", "u7m2q9xa-3"]) await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: p }));
});

const C = () => `/canons/${canon.canonId}`;
const pushed = (p: string) => json<{ pr: CanonPullRequestRecord; diff: CanonDiff }>(call(A, "POST", `/projects/${p}/canon/push`));

describe("push and pull requests", () => {
  it("previews without creating a PR, and only completed member projects can push", async () => {
    const { diff } = await json<{ diff: CanonDiff }>(call(A, "POST", "/projects/u7m2q9xa-1/canon/preview"));
    expect(diff.summary).toMatchObject({ added: 4, errors: 0 });
    expect((await json<{ items: unknown[] }>(call(A, "GET", `${C()}/pulls`))).items).toEqual([]);
    expect((await call(A, "POST", "/projects/u7m2q9xa-3/canon/push")).status).toBe(409);
    fake.put("projects", project("u7m2q9xa-9"));
    expect((await call(A, "POST", "/projects/u7m2q9xa-9/canon/push")).status).toBe(409);
    expect((await call(B, "POST", "/projects/u7m2q9xa-1/canon/push")).status).toBe(404);
  });

  it("approving a clean PR creates revision 1 with the project's content", async () => {
    const { pr } = await pushed("u7m2q9xa-1");
    expect(pr).toMatchObject({ prNo: 1, state: "open", baseRevision: 0, source: "project:u7m2q9xa-1" });
    expect(await json(call(A, "POST", `${C()}/pulls/1/approve`, {}))).toEqual({ revision: 1 });
    const d = await json<{ canon: CanonRecord }>(call(A, "GET", C()));
    expect(d.canon.headRevision).toBe(1);
    const snap = await json<CanonSnapshot>(call(A, "GET", `${C()}/revisions/1`));
    expect(snap.circuits.map((c) => c.circuitId).sort()).toEqual(["A22c@L", "A44d@L"]);
    expect(snap.connections[0].origin).toMatchObject({ projectId: "u7m2q9xa-1", pr: 1 });
    expect((await json<{ items: { revision: number }[] }>(call(A, "GET", `${C()}/revisions`))).items.map((r) => r.revision)).toEqual([1]);
    expect((await call(A, "POST", `${C()}/pulls/1/approve`, {})).status).toBe(409);
  });

  it("blocks conflicts until they are resolved, then adopts the chosen values", async () => {
    await pushed("u7m2q9xa-1");
    await json(call(A, "POST", `${C()}/pulls/1/approve`, {}));
    const { diff } = await pushed("u7m2q9xa-2");
    const c1 = diff.conflicts.find((c) => c.code === "C1")!;
    const c7 = diff.conflicts.find((c) => c.code === "C7")!;
    expect(c1.resolvable).toBe(true);
    expect(diff.impacts.map((i) => i.projectId)).toEqual(["u7m2q9xa-1"]);

    const blocked = await call(A, "POST", `${C()}/pulls/2/approve`, {});
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { blocking: { code: string }[] }).blocking.map((b) => b.code).sort()).toEqual(["C1", "C7"]);
    expect((await call(A, "POST", `${C()}/pulls/2/approve`, { choices: { [c1.id]: "incoming" } })).status).toBe(409);

    expect(await json(call(A, "POST", `${C()}/pulls/2/approve`, { choices: { [c1.id]: "incoming", [c7.id]: "canon" } }))).toEqual({ revision: 2 });
    const snap = await json<CanonSnapshot>(call(A, "GET", `${C()}/revisions/2`));
    expect(snap.circuits.find((c) => c.key === "bna:29")!.status).toBe("collection");
    expect(snap.circuits.find((c) => c.key === "bna:75")!.transmitter).toBe("Glutamate");
    expect(snap.connections.find((c) => c.sender === "bna:29")!.state).toBe("flagged");
  });

  it("re-judges a PR against the current head at approval", async () => {
    await pushed("u7m2q9xa-2");
    const { pr } = await pushed("u7m2q9xa-1");
    expect(pr.baseRevision).toBe(0);
    await json(call(A, "POST", `${C()}/pulls/1/approve`, {}));
    // #2 was clean against rev 0 but now makes A44d@L uniform over the fine UCs
    const r = await call(A, "POST", `${C()}/pulls/2/approve`, {});
    expect(r.status).toBe(409);
    const body = (await r.json()) as { blocking: { code: string }[]; diff: CanonDiff };
    expect(body.diff.baseRevision).toBe(1);
    expect(body.blocking.map((b) => b.code)).toEqual(expect.arrayContaining(["C1", "C3"]));
    const again = await json<{ pr: CanonPullRequestRecord }>(call(A, "GET", `${C()}/pulls/2`));
    expect(again.pr.baseRevision).toBe(1);
  });

  it("supersedes an open PR of the same project, and rejects or withdraws", async () => {
    await pushed("u7m2q9xa-1");
    await pushed("u7m2q9xa-1");
    const list = await json<{ items: CanonPullRequestRecord[] }>(call(A, "GET", `${C()}/pulls`));
    expect(list.items.map((p) => [p.prNo, p.state])).toEqual([
      [2, "open"],
      [1, "superseded"],
    ]);
    expect((await call(A, "POST", `${C()}/pulls/2/reject`, {})).status).toBe(400);
    await json(call(A, "POST", `${C()}/pulls/2/reject`, { reason: "粒度が違う" }));
    expect((await json<{ pr: CanonPullRequestRecord }>(call(A, "GET", `${C()}/pulls/2`))).pr).toMatchObject({ state: "rejected", reason: "粒度が違う" });
    await pushed("u7m2q9xa-2");
    await json(call(A, "POST", `${C()}/pulls/3/withdraw`));
    expect((await call(A, "POST", `${C()}/pulls/3/approve`, {})).status).toBe(409);
    expect((await call(B, "GET", `${C()}/pulls/3`)).status).toBe(404);
  });
});

describe("Canon → Canon pull requests", () => {
  async function bobCanon(extra: Record<string, unknown> = {}) {
    const bc = await json<CanonRecord>(call(B, "POST", "/canons", { name: "Bob's DMN" }));
    const meta = fake.items("canons").find((i) => i.canonId === bc.canonId && i.sk === "META")!;
    fake.put("canons", { ...meta, ...extra });
    return bc;
  }
  async function aliceRev1() {
    await pushed("u7m2q9xa-2");
    await json(call(A, "POST", `${C()}/pulls/1/approve`, {}));
  }

  it("sends the head of one Canon to a public Canon of another user, who approves it", async () => {
    await aliceRev1();
    const bc = await bobCanon({ visibility: "public" });
    const { pr, diff } = await json<{ pr: CanonPullRequestRecord; diff: CanonDiff }>(call(A, "POST", `/canons/${bc.canonId}/pulls`, { sourceCanonId: canon.canonId }));
    expect(pr).toMatchObject({ source: `canon:${canon.canonId}`, sourceName: "Language", sourceRevision: 1, createdBy: A.sub, state: "open" });
    expect(diff.summary.errors).toBe(0);

    // the sender can follow it but not review it
    const seen = await json<{ canReview: boolean; canWithdraw: boolean }>(call(A, "GET", `/canons/${bc.canonId}/pulls/${pr.prNo}`));
    expect(seen).toMatchObject({ canReview: false, canWithdraw: true });
    expect((await call(A, "POST", `/canons/${bc.canonId}/pulls/${pr.prNo}/approve`, {})).status).toBe(404);

    expect(await json(call(B, "POST", `/canons/${bc.canonId}/pulls/${pr.prNo}/approve`, {}))).toEqual({ revision: 1 });
    const snap = await json<CanonSnapshot>(call(B, "GET", `/canons/${bc.canonId}/revisions/1`));
    const col = snap.circuits.find((c) => c.key === "bna:29")!;
    expect(col.origin).toMatchObject({ projectId: "u7m2q9xa-2", via: `${canon.canonId}@1`, pr: 1 });
    expect(snap.roles.map((r) => r.projectId)).toEqual(["u7m2q9xa-2"]);

    const out = await json<{ items: (CanonPullRequestRecord & { targetName: string })[] }>(call(A, "GET", `${C()}/outgoing`));
    expect(out.items).toEqual([expect.objectContaining({ targetName: "Bob's DMN", state: "approved", mergedRevision: 1 })]);
  });

  it("refuses private targets of others and targets that turned pull requests off", async () => {
    await aliceRev1();
    const priv = await bobCanon();
    expect((await call(A, "POST", `/canons/${priv.canonId}/pulls`, { sourceCanonId: canon.canonId })).status).toBe(404);
    const closed = await bobCanon({ visibility: "public", acceptPullRequests: false });
    expect((await call(A, "POST", `/canons/${closed.canonId}/pulls/preview`, { sourceCanonId: canon.canonId })).status).toBe(403);
    // only the owner of the source may send it
    const open = await bobCanon({ visibility: "public" });
    expect((await call(B, "POST", `/canons/${open.canonId}/pulls`, { sourceCanonId: canon.canonId })).status).toBe(404);
  });

  it("works between two Canons of the same owner, applies the same conflict rules, and supersedes", async () => {
    await aliceRev1();
    const coarseCanon = await json<CanonRecord>(call(A, "POST", "/canons", { name: "Coarse" }));
    fake.put("projects", project("u7m2q9xa-5"));
    writeProject("u7m2q9xa-5", [uc("A44d@L", "BNA:29"), uc("A22c@L", "BNA:75")], [], [["A44d@L", "A22c@L"]]);
    await json(call(A, "POST", `/canons/${coarseCanon.canonId}/members`, { projectId: "u7m2q9xa-5" }));
    await json(call(A, "POST", "/projects/u7m2q9xa-5/canon/push"));
    await json(call(A, "POST", `/canons/${coarseCanon.canonId}/pulls/1/approve`, {}));

    const first = await json<{ diff: CanonDiff }>(call(A, "POST", `/canons/${coarseCanon.canonId}/pulls`, { sourceCanonId: canon.canonId }));
    expect(first.diff.conflicts.find((c) => c.code === "C1")).toMatchObject({ canon: "uniform", incoming: "collection" });
    await json(call(A, "POST", `/canons/${coarseCanon.canonId}/pulls`, { sourceCanonId: canon.canonId }));
    const list = await json<{ items: CanonPullRequestRecord[] }>(call(A, "GET", `/canons/${coarseCanon.canonId}/pulls`));
    expect(list.items.filter((p) => p.source.startsWith("canon:")).map((p) => p.state)).toEqual(["open", "superseded"]);
    expect((await call(A, "POST", `${C()}/pulls`, { sourceCanonId: canon.canonId })).status).toBe(400);
  });
});
