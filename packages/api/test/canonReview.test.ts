import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonAiReviewResult, CanonPullDetailResponse, CanonPullRequestRecord, CanonRecord, JobRecord, ProjectRecord, UsageSummary } from "@cobrac/shared";

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
const aws = await import("../src/lib/aws.js");

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
function writeProject(P: string, ucs: ReturnType<typeof uc>[], conns: [string, string][]) {
  const put = (rel: string, v: unknown) => s3.set(`users/${A.sub}/${P}/workspace/${rel}`, JSON.stringify(v));
  put(`${P}_HCD/uc.json`, { ucs, collections: [] });
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

const A44 = uc("A44d(left)", "BNA:29-30/side:left");
const A22 = uc("A22c(left)", "BNA:75-76/side:left");
const A45 = uc("A45c(left)", "BNA:33-34/side:left");

let canon: CanonRecord;
const C = () => `/canons/${canon.canonId}`;
const pushed = (p: string) => json<{ pr: CanonPullRequestRecord }>(call(A, "POST", `/projects/${p}/canon/push`));
const detail = (who = A, no = 2) => json<CanonPullDetailResponse>(call(who, "GET", `${C()}/pulls/${no}`));

beforeEach(async () => {
  fake.tables.clear();
  s3.clear();
  vi.mocked(aws.enqueueRun).mockClear();
  fake.put("users", { userId: A.sub, email: A.email, displayName: "Alice", contributorName: "a", role: "user", disabled: false, apiKeyRegistered: true, encryptedApiKey: "enc", userKey: "u7m2q9xa", projectSeq: 20, createdAt: now, updatedAt: now });
  fake.put("users", { userId: B.sub, email: B.email, displayName: "Bob", contributorName: "b", role: "user", disabled: false, apiKeyRegistered: true, userKey: "u3k8d0hn", createdAt: now, updatedAt: now });
  // rev 1: A22 → A44 (Catani); the PR reverses it and adds A45
  fake.put("projects", project("u7m2q9xa-1"));
  writeProject("u7m2q9xa-1", [A44, A22], [["A22c(left)", "A44d(left)"]]);
  fake.put("projects", project("u7m2q9xa-2"));
  writeProject("u7m2q9xa-2", [A44, A22, A45], [["A44d(left)", "A22c(left)"], ["A45c(left)", "A22c(left)"]]);
  canon = await json<CanonRecord>(call(A, "POST", "/canons", { name: "Language" }));
  for (const p of ["u7m2q9xa-1", "u7m2q9xa-2"]) await json(call(A, "POST", `${C()}/members`, { projectId: p }));
  await pushed("u7m2q9xa-1");
  await json(call(A, "POST", `${C()}/pulls/1/approve`, {}));
  await pushed("u7m2q9xa-2");
});

describe("PR review material", () => {
  it("returns the checks, both sides of each item, the graph, provenance and the audit trail", async () => {
    const d = await detail();
    expect(d).toMatchObject({ canReview: true, canComment: true, ai: null });
    expect(d.checks!.checks.find((c) => c.code === "reverse")).toMatchObject({ group: "edges", severity: "warning" });
    expect(d.provenance).toMatchObject({ sourceKind: "project", sourceId: "u7m2q9xa-2", sourceRevision: 2, sourceAvailable: true, headRevision: 1 });
    const added = Object.entries(d.entries).find(([id]) => id === "circuit:bna:33-34/side:left")![1];
    expect(added).toMatchObject({ canon: null, incoming: { circuitId: "A45c(left)" } });
    expect(d.graph!.nodes.map((n) => n.label).sort()).toEqual(["A22c(left)", "A44d(left)", "A45c(left)"]);
    expect(d.events.map((e) => [e.type, e.actorName])).toEqual([["pushed", "Alice"]]);
    // the first PR's trail: pushed, approved (rev 1)
    const first = await detail(A, 1);
    expect(first.events.map((e) => [e.type, e.revision ?? null])).toEqual([
      ["pushed", 2],
      ["approved", 1],
    ]);
  });

  it("rebuilds the trail of PRs made before the trail existed", async () => {
    const item = fake.items("canons").find((i) => String(i.sk).startsWith("PEV#000002#"))!;
    fake.tables.get("canons")!.delete(`${item.canonId}|${item.sk}`);
    await json(call(A, "POST", `${C()}/pulls/2/reject`, { reason: "split first" }));
    const d = await detail();
    expect(d.events.map((e) => [e.type, e.actorName, e.note ?? null])).toEqual([
      ["pushed", "Alice", null],
      ["rejected", "Alice", "split first"],
    ]);
  });
});

describe("comments, change requests and decisions", () => {
  it("comments on the PR or on one of its items; others cannot", async () => {
    await json(call(A, "POST", `${C()}/pulls/2/comments`, { text: "Looks reversed", item: "connection:bna:29-30/side:left|bna:75-76/side:left|[Catani, 2005]" }));
    await json(call(A, "POST", `${C()}/pulls/2/comments`, { text: "General" }));
    expect((await call(A, "POST", `${C()}/pulls/2/comments`, { text: "x", item: "circuit:nope" })).status).toBe(400);
    expect((await call(A, "POST", `${C()}/pulls/2/comments`, { text: "  " })).status).toBe(400);
    expect((await call(B, "POST", `${C()}/pulls/2/comments`, { text: "hi" })).status).toBe(404);
    const d = await detail();
    expect(d.events.filter((e) => e.type === "comment").map((e) => [e.note, e.itemLabel ?? null])).toEqual([
      ["Looks reversed", "A44d(left) → A22c(left) [Catani, 2005]"],
      ["General", null],
    ]);
  });

  it("requests changes with a note and keeps the PR open; approval records the note and choices", async () => {
    expect((await call(A, "POST", `${C()}/pulls/2/request-changes`, {})).status).toBe(400);
    await json(call(A, "POST", `${C()}/pulls/2/request-changes`, { note: "Check the direction of Catani 2005" }));
    let d = await detail();
    expect(d.pr).toMatchObject({ state: "open", reviewState: "changes_requested", reviewNote: "Check the direction of Catani 2005" });
    expect(await json(call(A, "POST", `${C()}/pulls/2/approve`, { note: "Direction confirmed in Fig. 2" }))).toEqual({ revision: 2 });
    d = await detail();
    expect(d.events.map((e) => e.type)).toEqual(["pushed", "changes_requested", "approved"]);
    expect(d.events[2]).toMatchObject({ note: "Direction confirmed in Fig. 2", revision: 2 });
    expect((await call(A, "POST", `${C()}/pulls/2/request-changes`, { note: "late" })).status).toBe(409);
  });

  it("records a rebase when the head moved since the push", async () => {
    await pushed("u7m2q9xa-1");
    // #3 re-pushes project 1 (no change); approve it first so #2 has to be re-judged against rev 2
    await json(call(A, "POST", `${C()}/pulls/3/approve`, {}));
    await json(call(A, "POST", `${C()}/pulls/2/approve`, {}));
    const d = await detail();
    expect(d.events.map((e) => e.type)).toEqual(["pushed", "rebased", "approved"]);
    expect(d.events[1].note).toBe("rev 1 → rev 2");
  });
});

describe("AI review", () => {
  const tier1 = () => {
    fake.put("users", { ...fake.items("users").find((u) => u.userId === A.sub)!, apiKeyRegistered: false, encryptedApiKey: "", orgAccess: { tier: 1, approvedAt: now, approvedBy: "admin" } });
    fake.put("catalog", { kind: "config", id: "default-api-key", encryptedApiKey: "org", last4: "abcd", availableModels: ["gpt-6-luna", "gpt-6-sol"], updatedAt: now, updatedBy: "admin" });
  };

  it("queues one worker job per PR with the Tier's models only", async () => {
    tier1();
    expect((await call(A, "POST", `${C()}/pulls/2/ai-review`, { model: "gpt-6-sol", locale: "ja" })).status).toBe(403);
    expect((await call(A, "POST", `${C()}/pulls/2/ai-review`, { locale: "xx" })).status).toBe(400);
    const r = await json<{ ai: { jobId: string; status: string; model: string } }>(call(A, "POST", `${C()}/pulls/2/ai-review`, { model: "gpt-6-luna", locale: "ja" }));
    expect(r.ai).toMatchObject({ status: "QUEUED", model: "gpt-6-luna" });
    const job = fake.items("jobs").find((j) => j.jobId === r.ai.jobId) as unknown as JobRecord;
    expect(job).toMatchObject({ projectId: canon.canonId, type: "canon-review", reviewPrNo: 2, reviewLocale: "ja", keySource: "org" });
    expect(aws.enqueueRun).toHaveBeenCalledWith({ version: 1, userId: A.sub, projectId: canon.canonId, jobId: r.ai.jobId, mode: "canon-review" });
    const input = JSON.parse(s3.get(`canons/${canon.canonId}/pr/2/ai/${r.ai.jobId}/input.json`)!);
    expect(input.checks.some((c: { code: string }) => c.code === "reverse")).toBe(true);
    expect((await call(A, "POST", `${C()}/pulls/2/ai-review`, { locale: "ja" })).status).toBe(409);
    expect((await call(B, "POST", `${C()}/pulls/2/ai-review`, { locale: "ja" })).status).toBe(404);
    expect((await detail()).ai).toMatchObject({ status: "QUEUED", result: null });
  });

  it("shows the worker's result to the owner, puts its end in the trail and its cost in usage", async () => {
    const { ai } = await json<{ ai: { jobId: string } }>(call(A, "POST", `${C()}/pulls/2/ai-review`, { locale: "en" }));
    const result: CanonAiReviewResult = {
      review: { summary: "Adds A45c(left) and reverses Catani 2005.", flags: [], verify: [], comments: [] },
      dropped: 0,
      model: "gpt-6-luna",
      locale: "en",
      createdAt: now,
    };
    s3.set(`canons/${canon.canonId}/pr/2/ai/${ai.jobId}/result.json`, JSON.stringify(result));
    const job = fake.items("jobs").find((j) => j.jobId === ai.jobId)!;
    fake.put("jobs", { ...job, status: "COMPLETED", endedAt: "2099-01-01T00:00:00.000Z", usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 0 }, costUsd: 0.25 });
    const d = await detail();
    expect(d.ai!.result!.review.summary).toContain("A45c(left)");
    expect(d.events.map((e) => e.type)).toEqual(["pushed", "ai_requested", "ai_completed"]);
    const usage = await json<UsageSummary>(call(A, "GET", "/users/me/usage"));
    expect(usage.costUsd).toBeGreaterThanOrEqual(0.25);
    expect(usage.byModel.some((m) => m.jobs >= 1)).toBe(true);
  });
});

describe("co-editors", () => {
  const addBob = () => json(call(A, "POST", `${C()}/editors`, { email: "BOB@example.com " }));

  it("the owner adds a registered user by e-mail; others cannot manage co-editors", async () => {
    expect((await call(A, "POST", `${C()}/editors`, { email: "nobody@example.com" })).status).toBe(404);
    expect((await call(A, "POST", `${C()}/editors`, { email: A.email })).status).toBe(400);
    expect((await call(A, "POST", `${C()}/editors`, { email: "not-an-email" })).status).toBe(400);
    expect(await addBob()).toMatchObject({ userId: B.sub, name: "Bob", email: B.email });
    expect((await call(A, "POST", `${C()}/editors`, { email: B.email })).status).toBe(409);
    expect((await call(B, "POST", `${C()}/editors`, { email: A.email })).status).toBe(404);

    const mine = await json<{ items: CanonRecord[]; shared: (CanonRecord & { ownerName: string })[] }>(call(B, "GET", "/canons"));
    expect(mine.shared.map((x) => [x.canonId, x.ownerName])).toEqual([[canon.canonId, "Alice"]]);
    const asBob = await json<{ role: string; editors: { email?: string }[]; ownerName: string }>(call(B, "GET", C()));
    expect(asBob).toMatchObject({ role: "editor", ownerName: "Alice" });
    expect(asBob.editors[0].email).toBeUndefined();
    const asOwner = await json<{ role: string; editors: { email?: string }[] }>(call(A, "GET", C()));
    expect(asOwner.editors[0].email).toBe(B.email);
    // owner-only operations stay owner-only
    expect((await call(B, "PUT", C(), { name: "x" })).status).toBe(404);
    expect((await call(B, "POST", `${C()}/members`, { projectId: "u7m2q9xa-1" })).status).toBe(404);
    expect((await call(B, "DELETE", C())).status).toBe(404);
  });

  it("a co-editor reviews: requests changes, approves, and is recorded as the approver of the revision", async () => {
    await addBob();
    const d = await detail(B);
    expect(d).toMatchObject({ canReview: true, canComment: true, viewerRole: "editor" });
    await json(call(B, "POST", `${C()}/pulls/2/request-changes`, { note: "Check the direction" }));
    expect((await detail(A)).pr).toMatchObject({ reviewState: "changes_requested", reviewedBy: B.sub, reviewedByName: "Bob" });
    expect(await json(call(B, "POST", `${C()}/pulls/2/approve`, {}))).toEqual({ revision: 2 });
    const pr = (await detail(A)).pr;
    expect(pr).toMatchObject({ state: "approved", decidedBy: B.sub, decidedByName: "Bob" });
    expect(pr.approvals!.map((a) => a.name)).toEqual(["Bob"]);
    const revs = await json<{ items: { revision: number; approvedByName?: string }[] }>(call(A, "GET", `${C()}/revisions`));
    expect(revs.items.map((r) => [r.revision, r.approvedByName])).toEqual([
      [2, "Bob"],
      [1, "Alice"],
    ]);
    const trail = (await detail(A)).events.map((e) => [e.type, e.actorName]);
    expect(trail).toEqual([
      ["pushed", "Alice"],
      ["changes_requested", "Bob"],
      ["approved", "Bob"],
    ]);
  });

  it("a co-editor's AI review is visible to the owner; leaving removes access; admins cannot review", async () => {
    await addBob();
    fake.put("users", { ...fake.items("users").find((u) => u.userId === B.sub)!, encryptedApiKey: "encB" });
    const r = await json<{ ai: { jobId: string } }>(call(B, "POST", `${C()}/pulls/2/ai-review`, { locale: "en" }));
    expect(fake.items("jobs").find((j) => j.jobId === r.ai.jobId)).toMatchObject({ userId: B.sub, projectId: canon.canonId });
    expect((await detail(A)).ai).toMatchObject({ jobId: r.ai.jobId, status: "QUEUED" });
    expect((await call(A, "POST", `${C()}/pulls/2/ai-review`, { locale: "en" })).status).toBe(409);

    await json(call(B, "DELETE", `${C()}/editors/${B.sub}`));
    expect((await call(B, "GET", C())).status).toBe(404);
    expect((await json<{ shared: unknown[] }>(call(B, "GET", "/canons"))).shared).toEqual([]);

    const admin = { sub: "sub-admin", email: "admin@example.com" };
    fake.put("users", { userId: admin.sub, email: admin.email, displayName: "Admin", contributorName: "x", role: "admin", disabled: false, apiKeyRegistered: true, createdAt: now, updatedAt: now });
    expect((await call(admin, "GET", C())).status).toBe(200);
    expect((await call(admin, "POST", `${C()}/pulls/2/approve`, {})).status).toBe(404);
  });
});
