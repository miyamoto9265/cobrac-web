import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlignResult, CanonDiff, CanonIssue, CanonPullDetailResponse, CanonPullRequestRecord, CanonRecord, CanonRevisionSummary, CanonSnapshot, JobRecord, ProjectRecord } from "@cobrac/shared";

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
  fake.put("users", { userId: A.sub, email: A.email, displayName: "a", contributorName: "a", role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", projectSeq: 20, createdAt: now, updatedAt: now });
  fake.put("users", { userId: B.sub, email: B.email, displayName: "b", contributorName: "b", role: "user", disabled: false, apiKeyRegistered: true, userKey: "u3k8d0hn", createdAt: now, updatedAt: now });
  // coarse: A44d(left) uniform; fine: A44d(left) split into IT / PT
  fake.put("projects", project("u7m2q9xa-1"));
  writeProject("u7m2q9xa-1", [uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [], [["A44d(left)", "A22c(left)"]]);
  fake.put("projects", project("u7m2q9xa-2"));
  writeProject(
    "u7m2q9xa-2",
    [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left"), uc("A22c(left)", "BNA:75-76/side:left", "Glutamate; GABA")],
    [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"], comments: "" }],
    [["A44d(L3.IT.left)", "A22c(left)"]],
  );
  fake.put("projects", project("u7m2q9xa-3", { status: "RUNNING" }));
  canon = await json<CanonRecord>(call(A, "POST", "/canons", { name: "Language" }));
  for (const p of ["u7m2q9xa-1", "u7m2q9xa-2", "u7m2q9xa-3"]) await json(call(A, "POST", `/canons/${canon.canonId}/members`, { projectId: p }));
});

const C = () => `/canons/${canon.canonId}`;
const pushed = (p: string) => json<{ pr: CanonPullRequestRecord; diff: CanonDiff }>(call(A, "POST", `/projects/${p}/canon/push`));
const P = "u7m2q9xa-1";
const head = async () => {
  const c = (fake.items("canons") as unknown as CanonRecord[]).find((x) => x.canonId === canon.canonId && x.sk === "META")!;
  return JSON.parse(s3.get(`canons/${canon.canonId}/rev/${c.headRevision}/canon.json`)!) as CanonSnapshot;
};
type Follow = { state: string; pinned: number; head: number; affected: { label: string; reason: string; issue?: string }[] };

describe("problems on Canon entries", () => {
  beforeEach(async () => {
    await pushed(P);
    await json(call(A, "POST", `${C()}/pulls/1/approve`, {}));
  });

  it("reports a problem in a revision of its own, flags what it reaches and marks the projects that use it", async () => {
    // only reviewers report; the input is checked
    expect((await call(B, "POST", `${C()}/issues`, { targetKind: "reference", targetKey: "[Catani, 2005]", kind: "reference", reason: "retracted" })).status).toBe(404);
    expect((await call(A, "POST", `${C()}/issues`, { targetKind: "reference", targetKey: "[Catani, 2005]", kind: "reference", reason: " " })).status).toBe(400);
    expect((await call(A, "POST", `${C()}/issues`, { targetKind: "reference", targetKey: "[Nobody, 1900]", kind: "reference", reason: "x" })).status).toBe(400);

    const r = await json<{ revision: number; issue: CanonIssue }>(call(A, "POST", `${C()}/issues`, { targetKind: "reference", targetKey: "[Catani, 2005]", kind: "reference", reason: "retracted" }));
    expect(r).toMatchObject({ revision: 2, issue: { id: "I1", raisedRevision: 2, raisedByName: "a" } });
    const snap = await head();
    expect(snap.connections.every((c) => c.state === "flagged" && c.issueIds?.[0] === "I1")).toBe(true);
    const revs = await json<{ items: CanonRevisionSummary[] }>(call(A, "GET", `${C()}/revisions`));
    expect(revs.items[0]).toMatchObject({ revision: 2, issueId: "I1", issueAction: "raised", actorName: "a", source: "issue:I1" });

    const st = await json<Follow>(call(A, "GET", `/projects/${P}/canon`));
    expect(st).toMatchObject({ state: "affected", pinned: 1, head: 2 });
    expect(st.affected).toEqual([expect.objectContaining({ issue: "I1", label: "[Catani, 2005]" })]);
  });

  it("aligns every affected finished project at once, and settles a problem in a revision of its own", async () => {
    await json(call(A, "POST", `${C()}/issues`, { targetKind: "reference", targetKey: "[Catani, 2005]", kind: "reference", reason: "retracted" }));
    // the owner only
    expect((await call(B, "POST", `${C()}/align`, { locale: "ja" })).status).toBe(404);
    const r = await json<AlignResult>(call(A, "POST", `${C()}/align`, { locale: "ja" }));
    expect(r.queued.map((q) => q.projectId)).toEqual([P]);
    const job = (fake.items("jobs") as unknown as JobRecord[]).find((j) => j.jobId === r.queued[0].jobId)!;
    expect(job).toMatchObject({ type: "followup", status: "QUEUED" });
    expect(job.instruction).toContain("retracted");
    expect(storedProject(P).canonRevision).toBe(2);

    expect((await call(A, "POST", `${C()}/issues/I1/resolve`, { resolution: "later" })).status).toBe(400);
    expect(await json(call(A, "POST", `${C()}/issues/I1/resolve`, { resolution: "invalidated", note: "retracted 2024" }))).toEqual({ revision: 3 });
    expect((await call(A, "POST", `${C()}/issues/I1/resolve`, { resolution: "fixed" })).status).toBe(409);
    const snap = await head();
    expect(snap.issues![0]).toMatchObject({ resolution: "invalidated", resolvedRevision: 3, resolvedNote: "retracted 2024" });
    expect(snap.connections.every((c) => c.state === "invalidated")).toBe(true);
  });

  it("settles the problems a pull request fixes when it is approved", async () => {
    const a22 = (await head()).circuits.find((c) => c.circuitId === "A22c(left)")!;
    await json(call(A, "POST", `${C()}/issues`, { targetKind: "circuit", targetKey: a22.key, kind: "property", reason: "A22c is GABAergic here" }));
    writeProject(P, [uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left", "GABA")], [], [["A44d(left)", "A22c(left)"]]);
    const { pr, diff } = await pushed(P);
    const detail = await json<CanonPullDetailResponse>(call(A, "GET", `${C()}/pulls/${pr.prNo}`));
    expect(detail.issues?.map((i) => i.id)).toEqual(["I1"]);
    const c7 = diff.conflicts.find((c) => c.code === "C7")!;
    expect(await json(call(A, "POST", `${C()}/pulls/${pr.prNo}/approve`, { choices: { [c7.id]: "incoming" }, resolveIssues: ["I1"] }))).toEqual({ revision: 3 });
    const snap = await head();
    expect(snap.issues![0]).toMatchObject({ resolution: "fixed", resolvedRevision: 3, resolvedPr: pr.prNo });
    expect(snap.circuits.find((c) => c.circuitId === "A22c(left)")).toMatchObject({ transmitter: "GABA", state: "valid" });
  });

  it("shows a Canon the open problems of the Canon it took entries from", async () => {
    await json(call(A, "POST", `${C()}/issues`, { targetKind: "reference", targetKey: "[Catani, 2005]", kind: "reference", reason: "retracted" }));
    const other = await json<CanonRecord>(call(A, "POST", "/canons", { name: "Downstream" }));
    const sent = await json<{ pr: CanonPullRequestRecord }>(call(A, "POST", `/canons/${other.canonId}/pulls`, { sourceCanonId: canon.canonId }));
    await json(call(A, "POST", `/canons/${other.canonId}/pulls/${sent.pr.prNo}/approve`, {}));
    const up = await json<{ items: { canonId: string; issues: CanonIssue[] }[] }>(call(A, "GET", `/canons/${other.canonId}/upstream-issues`));
    expect(up.items).toEqual([expect.objectContaining({ canonId: canon.canonId, issues: [expect.objectContaining({ id: "I1" })] })]);
    // the Downstream Canon itself has no problem until its owner reports one
    expect((await call(A, "GET", `/canons/${other.canonId}/upstream-issues`)).status).toBe(200);
  });
});

const storedProject = (projectId: string) => (fake.items("projects") as unknown as ProjectRecord[]).find((p) => p.projectId === projectId)!;
