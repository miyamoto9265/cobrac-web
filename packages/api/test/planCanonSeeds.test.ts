import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApproveManyResponse,
  CanonPullRequestRecord,
  CanonRecord,
  CreatePlanResponse,
  JobRecord,
  PlanDetailResponse,
  PlanEventRecord,
  PlanRecord,
  PlanRowRecord,
  ProjectRecord,
} from "@cobrac/shared";
import { PLAN_MAX_WAITING_PRS, canonPrSk, conformTitle } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
const s3 = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  stopEcsTask: vi.fn(async () => undefined),
  moveStagingToProject: vi.fn(async () => undefined),
  getObjectText: vi.fn(async (u: string, p: string, rel: string) => s3.get(`users/${u}/${p}/${rel}`) ?? null),
  getCanonJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putCanonJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
  getPlanJson: vi.fn(async (key: string) => (s3.has(key) ? JSON.parse(s3.get(key)!) : null)),
  putPlanJson: vi.fn(async (key: string, v: unknown) => void s3.set(key, JSON.stringify(v))),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");
const aws = await import("../src/lib/aws.js");
const { advancePlan } = await import("../src/lib/planRunner.js");
const { resetLimitsCache } = await import("../src/lib/concurrency.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
const E = { sub: "sub-erin", email: "erin@example.com" };
const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const now = "2026-10-06T00:00:00.000Z";

function call(who: typeof A, method: string, path: string, body?: unknown) {
  const event = { requestContext: { authorizer: { jwt: { claims: who } } } };
  return app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
const status = async (r: Response | Promise<Response>) => (await r).status;

function user(who: typeof A, extra: Record<string, unknown> = {}) {
  fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: "u7m2q9xa", createdAt: now, updatedAt: now, ...extra });
}

const rowsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("ROW#")) as unknown as PlanRowRecord[];
const rowOf = (planId: string, roi: string) => rowsOf(planId).find((r) => r.roi === roi)!;
const planOf = (planId: string) => fake.items("plans").find((x) => x.planId === planId && x.sk === "META") as unknown as PlanRecord;
const eventsOf = (planId: string) => fake.items("plans").filter((x) => x.planId === planId && String(x.sk).startsWith("EVT#")) as unknown as PlanEventRecord[];
const projects = () => fake.items("projects") as unknown as ProjectRecord[];
const projectOf = (id: string) => projects().find((p) => p.projectId === id)!;
const jobs = () => fake.items("jobs") as unknown as JobRecord[];
const reviewJobs = () => jobs().filter((j) => j.type === "canon-review");
const canonMeta = (canonId: string) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === "META") as unknown as CanonRecord;
const prOf = (canonId: string, no: number) => fake.items("canons").find((x) => x.canonId === canonId && x.sk === canonPrSk(no)) as unknown as CanonPullRequestRecord;
const isMember = (canonId: string, projectId: string) => fake.items("canons").some((x) => x.canonId === canonId && x.sk === `MEMBER#${projectId}`);

// --- project contents (as in pulls.test.ts) ---------------------------------------------------------------------------

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
type Content = (P: string) => void;
function workspace(ucs: ReturnType<typeof uc>[], collections: unknown[] = [], conns: [string, string][] = []): Content {
  return (P) => {
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
    put("meta.json", { roi: "perisylvian cortex", tlf: "language", description: "x" });
  };
}
/** A44d(left) uniform */
const coarse = workspace([uc("A44d(left)", "BNA:29-30/side:left"), uc("A22c(left)", "BNA:75-76/side:left")], [], [["A44d(left)", "A22c(left)"]]);
/** A44d(left) a Collection: error conflicts (C1, C3) against a Canon where it is uniform */
const fine = workspace(
  [uc("A44d(L3.IT.left)", "BNA:29-30/lay:L3/cell:IT/side:left"), uc("A44d(L5.PT.left)", "BNA:29-30/lay:L5/cell:PT/side:left"), uc("A22c(left)", "BNA:75-76/side:left")],
  [{ circuitId: "A44d(left)", descriptor: "BNA:29-30/side:left", names: "A44d(left)", sourceOfId: "collection", subCircuits: ["A44d(L3.IT.left)", "A44d(L5.PT.left)"], comments: "" }],
  [["A44d(L3.IT.left)", "A22c(left)"]],
);
/** A circuit of its own: never conflicts */
const own = (n: number) => workspace([uc(`R${n}(left)`, `BNA:${2 * n - 1}-${2 * n}/side:left`)]);
/** A22c(left) with another transmitter: a warning (C7, needs a human) against `coarse` */
const warned = workspace([uc("A22c(left)", "BNA:75-76/side:left", "Glutamate; GABA")]);

/** What the worker would do: the row's project completes with `content` (its active job with it). */
function finish(planId: string, roi: string, content: Content) {
  const P = rowOf(planId, roi).projectId!;
  content(P);
  const p = projectOf(P);
  fake.put("projects", { ...p, status: "COMPLETED", hasArtifacts: true, revision: (p.revision ?? 0) + 1, activeJobId: null } as never);
  for (const j of jobs().filter((x) => x.projectId === P && ["QUEUED", "RUNNING"].includes(x.status))) fake.put("jobs", { ...j, status: "COMPLETED" } as never);
}

/** A completed project of A outside any plan. */
function ownProject(projectId: string, roi: string, tlf: string, content: Content, extra: Partial<ProjectRecord> = {}) {
  fake.put("projects", {
    userId: A.sub,
    projectId,
    name: `P ${projectId}`,
    nameSource: "user",
    revision: 1,
    roi,
    tlf,
    contributor: "a",
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
  } as never);
  content(projectId);
}

async function setLimits(global: number | null, perUser: number | null) {
  await json(call(ADMIN, "PUT", "/admin/concurrency", { maxConcurrentJobs: global, maxConcurrentJobsPerUser: perUser }));
  resetLimitsCache();
}

const newCanon = (who: typeof A, name: string) => json<CanonRecord>(call(who, "POST", "/canons", { name }));

/** A draft plan; rows named in `seeds` are seed rows. */
async function newPlan(rows: { roi: string; tlf?: string; wave?: number }[], seeds: string[] = []): Promise<string> {
  const r = await json<CreatePlanResponse>(call(A, "POST", "/plans", { name: "Language", goal: "言語の BRA を一通りそろえたい", rows: rows.map((x) => ({ tlf: `${x.roi} function`, ...x })) }));
  for (const s of seeds) fake.put("plans", { ...rowOf(r.plan.planId, s), seed: true } as never);
  return r.plan.planId;
}

const approve = (canonId: string, no: number, who = A) => json<{ revision: number }>(call(who, "POST", `/canons/${canonId}/pulls/${no}/approve`, {}));

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  resetLimitsCache();
  vi.mocked(aws.enqueueRun).mockClear();
  vi.mocked(aws.getCanonJson).mockClear();
  vi.mocked(aws.putCanonJson).mockClear();
  user(A);
  user(B, { userKey: "u3k8d0hn" });
  user(E, { userKey: "u5f6g7h8" });
  user(ADMIN, { role: "admin", userKey: "u9a8b7c6" });
});

describe("plans with a Canon: seeds sharing a wave", () => {
  it("starts seed rows of the same wave one at a time, each after the previous one's approval", async () => {
    await setLimits(8, 8);
    const planId = await newPlan(
      [
        { roi: "left IFG", wave: 1 },
        { roi: "STG", wave: 1 },
        { roi: "arcuate", wave: 2 },
      ],
      ["left IFG", "STG"],
    );
    await json(call(A, "PUT", `/plans/${planId}`, { canon: { mode: "new", name: "Language" } }));
    await json(call(A, "POST", `/plans/${planId}/confirm`, { locale: "ja" }));
    const canonId = planOf(planId).canonId!;
    const started = () => rowsOf(planId).filter((r) => r.state !== "pending").map((r) => r.roi);

    expect(started()).toHaveLength(1);
    const first = started()[0];
    const second = first === "left IFG" ? "STG" : "left IFG";
    finish(planId, first, own(1));
    await advancePlan(planId);
    expect(rowOf(planId, first)).toMatchObject({ state: "review", prNo: 1 });
    expect(rowOf(planId, second).state).toBe("pending");

    await approve(canonId, 1);
    await advancePlan(planId);
    expect(rowOf(planId, first).state).toBe("done");
    expect(rowOf(planId, second)).toMatchObject({ state: "running", canonRevision: 1 });
    expect(rowOf(planId, "arcuate").state).toBe("pending");
  });
});
