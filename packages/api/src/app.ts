import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { LambdaContext, LambdaEvent } from "hono/aws-lambda";
import type {
  AnswerRequest,
  CreateProjectRequest,
  FollowupRequest,
  JobRecord,
  ProjectRecord,
  EdgeStyle,
  GraphLayout,
  NodeStyle,
  ReasoningEffort,
  TokenUsage,
  UsageSummary,
  UserRecord,
} from "@cobrac/shared";
import {
  ARROW_HEADS,
  DEFAULT_CODEX_MODEL,
  EDGE_LINE_TYPES,
  EMPTY_USAGE,
  PRICING,
  PRICING_AS_OF,
  REASONING_EFFORTS,
  addUsage,
  filterCodexModels,
  isValidProjectId,
  newId,
  nowIso,
  proposeProjectId,
} from "@cobrac/shared";
import { env } from "./env.js";
import { ensureUser, extractAuth, toPublicUser } from "./lib/auth.js";
import { deleteObject, encryptApiKey, enqueueRun, getObjectText, listArtifacts, presignDownload, putObjectText, stopEcsTask } from "./lib/aws.js";
import {
  getJob,
  getProject,
  listAllProjects,
  listJobsForProject,
  listMessages,
  listProjects,
  listUsers,
  putJob,
  putMessage,
  putProject,
  updateJob,
  updateProject,
  updateUser,
} from "./lib/db.js";

type Bindings = { event: LambdaEvent; lambdaContext: LambdaContext };
type Variables = { user: UserRecord };

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: err.message ?? "internal error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true, version: env.appVersion, time: nowIso() }));

// --- auth middleware ---------------------------------------------------------
app.use("*", async (c, next) => {
  if (c.req.path === "/health" || c.req.method === "OPTIONS") return next();
  const auth = extractAuth(c.env.event);
  if (!auth) throw new HTTPException(401, { message: "unauthorized" });
  const user = await ensureUser(auth);
  if (user.disabled) throw new HTTPException(403, { message: "account disabled" });
  c.set("user", user);
  await next();
});

const requireAdmin = (u: UserRecord) => {
  if (u.role !== "admin") throw new HTTPException(403, { message: "admin only" });
};

const bad = (msg: string) => new HTTPException(400, { message: msg });
const notFound = () => new HTTPException(404, { message: "not found" });

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

app.get("/users/me", (c) => c.json(toPublicUser(c.get("user"))));

const isEffort = (v: unknown): v is ReasoningEffort => typeof v === "string" && (REASONING_EFFORTS as string[]).includes(v);
const normModel = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(v)) throw bad("モデル名が不正です");
  return v;
};

app.put("/users/me", async (c) => {
  const body = (await c.req.json()) as Partial<Pick<UserRecord, "displayName" | "contributorName" | "defaultModel" | "defaultReasoningEffort">>;
  const u = c.get("user");
  const values: Partial<UserRecord> = {};
  if (typeof body.displayName === "string" && body.displayName.trim()) values.displayName = body.displayName.trim().slice(0, 80);
  if (typeof body.contributorName === "string" && body.contributorName.trim()) values.contributorName = body.contributorName.trim().slice(0, 120);
  if ("defaultModel" in body) values.defaultModel = normModel(body.defaultModel);
  if ("defaultReasoningEffort" in body) {
    if (body.defaultReasoningEffort !== null && body.defaultReasoningEffort !== undefined && !isEffort(body.defaultReasoningEffort)) throw bad("reasoning effort が不正です");
    values.defaultReasoningEffort = body.defaultReasoningEffort ?? null;
  }
  await updateUser(u.userId, values);
  return c.json(toPublicUser({ ...u, ...values }));
});

app.get("/users/me/models", (c) => {
  const u = c.get("user");
  return c.json({
    models: filterCodexModels(u.availableModels ?? []),
    efforts: REASONING_EFFORTS,
    envDefaultModel: env.codexModel || DEFAULT_CODEX_MODEL,
    pricedModels: Object.keys(PRICING),
    pricingAsOf: PRICING_AS_OF,
  });
});

/** Token / cost summary across the caller's projects (per model and per project). */
app.get("/users/me/usage", async (c) => {
  const u = c.get("user");
  const { items } = await listProjects(u.userId, 200);
  const summary: UsageSummary = { totals: EMPTY_USAGE, costUsd: null, unpricedProjects: 0, byModel: [], byProject: [], pricingAsOf: PRICING_AS_OF };
  const byModel = new Map<string, { usage: TokenUsage; cost: number; unpriced: boolean; jobs: number }>();
  let cost = 0;
  let priced = false;
  for (const p of items) {
    const jobs = await listJobsForProject(p.projectId);
    const models = new Set<string>();
    for (const j of jobs) {
      if (!j.usage) continue;
      const m = j.model ?? "(unknown)";
      models.add(m);
      const e = byModel.get(m) ?? { usage: EMPTY_USAGE, cost: 0, unpriced: false, jobs: 0 };
      e.usage = addUsage(e.usage, j.usage);
      e.jobs++;
      if (j.costUsd === null || j.costUsd === undefined) e.unpriced = true;
      else e.cost += j.costUsd;
      byModel.set(m, e);
    }
    if (p.usage) summary.totals = addUsage(summary.totals, p.usage);
    if (p.costUsd === null || p.costUsd === undefined) {
      if (p.usage && p.usage.inputTokens + p.usage.outputTokens > 0) summary.unpricedProjects++;
    } else {
      cost += p.costUsd;
      priced = true;
    }
    summary.byProject.push({ projectId: p.projectId, usage: p.usage ?? EMPTY_USAGE, costUsd: p.costUsd ?? null, models: [...models] });
  }
  summary.costUsd = priced ? Math.round(cost * 1_000_000) / 1_000_000 : null;
  summary.byModel = [...byModel.entries()]
    .map(([model, e]) => ({ model, usage: e.usage, costUsd: e.unpriced && e.cost === 0 ? null : e.cost, jobs: e.jobs }))
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
  return c.json(summary);
});

app.get("/users/me/apikey/status", (c) => {
  const u = c.get("user");
  return c.json({ registered: !!u.apiKeyRegistered, last4: u.apiKeyLast4 ?? null });
});

app.put("/users/me/apikey", async (c) => {
  const { apiKey } = (await c.req.json()) as { apiKey?: string };
  const key = (apiKey ?? "").trim();
  if (!key || key.length < 20) throw bad("API キーの形式が不正です");
  // Validate by calling OpenAI
  const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) throw bad("OpenAI がこの API キーを拒否しました（無効なキー）");
  if (!r.ok) throw new HTTPException(502, { message: `OpenAI への疎通確認に失敗しました (${r.status})` });
  const models = filterCodexModels((((await r.json()) as { data?: { id: string }[] }).data ?? []).map((m) => m.id));
  const u = c.get("user");
  const encryptedApiKey = await encryptApiKey(key, u.userId);
  await updateUser(u.userId, { encryptedApiKey, apiKeyRegistered: true, apiKeyLast4: key.slice(-4), availableModels: models });
  return c.json({ registered: true, last4: key.slice(-4), models });
});

app.delete("/users/me/apikey", async (c) => {
  const u = c.get("user");
  await updateUser(u.userId, { encryptedApiKey: "", apiKeyRegistered: false, apiKeyLast4: "" });
  return c.json({ registered: false, last4: null });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

app.get("/projects", async (c) => {
  const u = c.get("user");
  const q = c.req.query("q")?.toLowerCase();
  const status = c.req.query("status");
  const { items, nextCursor } = await listProjects(u.userId, Number(c.req.query("limit") ?? 100), c.req.query("cursor"));
  const filtered = items.filter((p) => {
    if (status && p.status !== status) return false;
    if (q && ![p.projectId, p.roi, p.tlf].some((s) => (s ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
  return c.json({ items: filtered, nextCursor });
});

app.post("/projects", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です。設定画面で登録してください。");
  const body = (await c.req.json()) as CreateProjectRequest;
  const roi = (body.roi ?? "").trim();
  const tlf = (body.tlf ?? "").trim();
  if (!roi && !tlf) throw bad("ROI と TLF のどちらか一方は必須です");
  const projectId = (body.projectId ?? "").trim() || proposeProjectId(roi, tlf);
  if (!isValidProjectId(projectId)) throw bad("Project ID は英字で始まる 3〜64 文字の英数字・_・- のみ使用できます");
  const contributor = (body.contributor ?? "").trim() || u.contributorName || u.displayName;
  // Always persist a concrete model so usage can be priced (project → user default → env → DEFAULT_CODEX_MODEL)
  const model = ("model" in body ? normModel(body.model) : null) || u.defaultModel || env.codexModel || DEFAULT_CODEX_MODEL;
  let reasoningEffort: ReasoningEffort | null = u.defaultReasoningEffort ?? null;
  if ("reasoningEffort" in body) {
    if (body.reasoningEffort !== null && body.reasoningEffort !== undefined && !isEffort(body.reasoningEffort)) throw bad("reasoning effort が不正です");
    reasoningEffort = body.reasoningEffort ?? null;
  }

  const now = nowIso();
  const jobId = newId("job_");
  const project: ProjectRecord = {
    userId: u.userId,
    projectId,
    roi,
    tlf,
    contributor,
    model,
    reasoningEffort,
    status: "QUEUED",
    currentStep: null,
    stepStates: { HCD: "pending", FRG: "pending", CSV: "pending", XLSX: "pending" },
    activeJobId: jobId,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: false,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  try {
    await putProject(project, true);
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw new HTTPException(409, { message: "同じ Project ID が既に存在します" });
    throw e;
  }
  const job: JobRecord = {
    projectId,
    jobId,
    userId: u.userId,
    type: "initial",
    status: "QUEUED",
    instruction: null,
    pendingAnswer: null,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  await putJob(job);
  await putMessage(projectId, jobId, "user", "prompt", `ROI: ${roi || "(not set)"}\nTLF: ${tlf || "(not set)"}`, {
    meta: { kind: "create", roi, tlf, projectId, model, reasoningEffort },
  });
  await putMessage(projectId, jobId, "system", "status", `Model: ${model ?? "default"} / reasoning effort: ${reasoningEffort ?? "default"}`, {
    meta: { i18n: "sys.model", model: model ?? "", effort: reasoningEffort ?? "" },
  });
  await putMessage(projectId, jobId, "system", "status", "Job queued. Waiting for a worker to start…", { meta: { i18n: "sys.queued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId, jobId, mode: "initial" });
  return c.json(project, 201);
});

app.get("/projects/propose-id", (c) => {
  const roi = c.req.query("roi") ?? "";
  const tlf = c.req.query("tlf") ?? "";
  return c.json({ projectId: proposeProjectId(roi, tlf) });
});

async function loadOwnProject(u: UserRecord, projectId: string): Promise<ProjectRecord> {
  const p = await getProject(u.userId, projectId);
  if (!p) throw notFound();
  return p;
}

app.get("/projects/:id", async (c) => {
  const p = await loadOwnProject(c.get("user"), c.req.param("id"));
  const jobs = await listJobsForProject(p.projectId);
  return c.json({ ...p, jobs: jobs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) });
});

app.get("/projects/:id/messages", async (c) => {
  const p = await loadOwnProject(c.get("user"), c.req.param("id"));
  const r = await listMessages(p.projectId, Number(c.req.query("limit") ?? 500), c.req.query("cursor"));
  return c.json(r);
});

app.post("/projects/:id/cancel", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING"].includes(p.status)) throw bad("このプロジェクトは実行中ではありません");
  const job = p.activeJobId ? await getJob(p.projectId, p.activeJobId) : null;
  if (job) {
    await updateJob(p.projectId, job.jobId, { status: "CANCELLED", endedAt: nowIso() });
    if (job.ecsTaskArn) await stopEcsTask(job.ecsTaskArn, "cancelled by user");
    await putMessage(p.projectId, job.jobId, "system", "status", "Job cancelled by the user.", { meta: { i18n: "sys.cancelled" } });
  }
  await updateProject(u.userId, p.projectId, { status: "CANCELLED", activeJobId: null, pendingQuestion: null });
  return c.json({ ok: true });
});

app.post("/projects/:id/answer", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "WAITING_USER_INPUT" || !p.activeJobId) throw bad("回答待ちの質問はありません");
  const { answer } = (await c.req.json()) as AnswerRequest;
  const text = (answer ?? "").trim();
  if (!text) throw bad("回答を入力してください");
  const job = await getJob(p.projectId, p.activeJobId);
  if (!job) throw notFound();
  await updateJob(p.projectId, job.jobId, { status: "QUEUED", pendingAnswer: text });
  await updateProject(u.userId, p.projectId, { status: "QUEUED", pendingQuestion: null });
  await putMessage(p.projectId, job.jobId, "user", "prompt", text, { meta: { kind: "answer" } });
  await putMessage(p.projectId, job.jobId, "system", "status", "Answer received. Restarting the worker…", { meta: { i18n: "sys.answered" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId: job.jobId, mode: "resume" });
  return c.json({ ok: true });
});

app.post("/projects/:id/followup", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "COMPLETED") throw bad("フォローアップは完了済みのプロジェクトにのみ送信できます");
  const { instruction } = (await c.req.json()) as FollowupRequest;
  const text = (instruction ?? "").trim();
  if (!text) throw bad("指示を入力してください");
  const now = nowIso();
  const jobId = newId("job_");
  const job: JobRecord = {
    projectId: p.projectId,
    jobId,
    userId: u.userId,
    type: "followup",
    status: "QUEUED",
    instruction: text,
    pendingAnswer: null,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  await putJob(job);
  await updateProject(u.userId, p.projectId, {
    status: "QUEUED",
    activeJobId: jobId,
    errorMessage: null,
    stepStates: { ...p.stepStates, XLSX: "pending" },
  });
  await putMessage(p.projectId, jobId, "user", "prompt", text, { meta: { kind: "followup" } });
  await putMessage(p.projectId, jobId, "system", "status", "Follow-up job queued.", { meta: { i18n: "sys.followupQueued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId, mode: "followup" });
  return c.json({ ok: true, jobId });
});

app.post("/projects/:id/retry", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!["FAILED", "CANCELLED"].includes(p.status)) throw bad("リトライは失敗またはキャンセルされたプロジェクトにのみ実行できます");
  const jobs = await listJobsForProject(p.projectId);
  const last = jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const now = nowIso();
  const jobId = newId("job_");
  const job: JobRecord = {
    projectId: p.projectId,
    jobId,
    userId: u.userId,
    type: last?.type ?? "initial",
    status: "QUEUED",
    instruction: last?.instruction ?? null,
    pendingAnswer: null,
    ecsTaskArn: null,
    retryCount: (last?.retryCount ?? 0) + 1,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  await putJob(job);
  await updateProject(u.userId, p.projectId, { status: "QUEUED", activeJobId: jobId, errorMessage: null, pendingQuestion: null });
  await putMessage(p.projectId, jobId, "system", "status", "Retry queued. Continuing from previous artifacts.", { meta: { i18n: "sys.retryQueued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId, mode: "retry" });
  return c.json({ ok: true, jobId });
});

// --- artifacts ----------------------------------------------------------------

app.get("/projects/:id/artifacts", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  return c.json({ items: await listArtifacts(u.userId, p.projectId) });
});

app.get("/projects/:id/artifacts/download", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const key = c.req.query("key");
  if (!key) throw bad("key is required");
  const url = await presignDownload(u.userId, p.projectId, key);
  return c.json({ url, expiresIn: 900 });
});

app.get("/projects/:id/artifacts/text", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const key = c.req.query("key");
  if (!key || key.includes("..") || key.startsWith("thread/")) throw bad("invalid key");
  if (!/\.(md|csv|txt|json)$/i.test(key)) throw bad("text files only");
  const text = await getObjectText(u.userId, p.projectId, key);
  if (text === null) throw notFound();
  return c.text(text);
});

app.get("/projects/:id/graph/:kind", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const kind = c.req.param("kind");
  if (kind !== "hcd" && kind !== "frg") throw bad("kind must be hcd or frg");
  const text = await getObjectText(u.userId, p.projectId, `graph/${kind}.json`);
  if (text === null) throw notFound();
  return c.body(text, 200, { "Content-Type": "application/json" });
});

// --- user-arranged node positions -------------------------------------------
// Stored next to the graph JSON as graph/{kind}.layout.json: { positions: { [nodeId]: { x, y } }, updatedAt }

const MAX_LAYOUT_NODES = 5000;

function graphKind(kind: string): "hcd" | "frg" {
  if (kind !== "hcd" && kind !== "frg") throw bad("kind must be hcd or frg");
  return kind;
}

app.get("/projects/:id/graph/:kind/layout", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const kind = graphKind(c.req.param("kind"));
  const text = await getObjectText(u.userId, p.projectId, `graph/${kind}.layout.json`);
  if (text === null) return c.json({ positions: {}, updatedAt: null } satisfies GraphLayout);
  return c.body(text, 200, { "Content-Type": "application/json" });
});

app.put("/projects/:id/graph/:kind/layout", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const kind = graphKind(c.req.param("kind"));
  const raw = await c.req.text();
  if (raw.length > 2_000_000) throw bad("layout too large");
  const body = JSON.parse(raw) as Partial<GraphLayout>;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const isXY = (p: unknown): p is { x: number; y: number } => !!p && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y);
  const checkId = (id: string) => {
    if (typeof id !== "string" || id.length === 0 || id.length > 200) throw bad("invalid id");
  };

  const positions: GraphLayout["positions"] = {};
  const posEntries = Object.entries(body.positions ?? {});
  if (posEntries.length > MAX_LAYOUT_NODES) throw bad("too many nodes");
  for (const [id, pos] of posEntries) {
    checkId(id);
    if (!isXY(pos)) throw bad(`invalid position for ${id}`);
    positions[id] = { x: r2(pos.x), y: r2(pos.y) };
  }

  const nodes: NonNullable<GraphLayout["nodes"]> = {};
  for (const [id, s] of Object.entries(body.nodes ?? {})) {
    checkId(id);
    if (!s || typeof s !== "object") continue;
    const n: NodeStyle = {};
    if (Number.isFinite(s.width)) n.width = Math.min(2000, Math.max(40, r2(s.width!)));
    if (Number.isFinite(s.height)) n.height = Math.min(2000, Math.max(24, r2(s.height!)));
    if (typeof s.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(s.color)) n.color = s.color;
    if (typeof s.border === "string" && /^#[0-9a-fA-F]{3,8}$/.test(s.border)) n.border = s.border;
    if (Object.keys(n).length) nodes[id] = n;
  }

  const edges: NonNullable<GraphLayout["edges"]> = {};
  const edgeEntries = Object.entries(body.edges ?? {});
  if (edgeEntries.length > MAX_LAYOUT_NODES * 4) throw bad("too many edges");
  for (const [id, s] of edgeEntries) {
    checkId(id);
    if (!s || typeof s !== "object") continue;
    const e: EdgeStyle = {};
    if (s.lineType && EDGE_LINE_TYPES.includes(s.lineType)) e.lineType = s.lineType;
    if (typeof s.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(s.color)) e.color = s.color;
    if (Number.isFinite(s.width)) e.width = Math.min(12, Math.max(0.5, r2(s.width!)));
    if (typeof s.dashed === "boolean") e.dashed = s.dashed;
    if (typeof s.rounded === "boolean") e.rounded = s.rounded;
    if (typeof s.showLabel === "boolean") e.showLabel = s.showLabel;
    if (s.markerStart && ARROW_HEADS.includes(s.markerStart)) e.markerStart = s.markerStart;
    if (s.markerEnd && ARROW_HEADS.includes(s.markerEnd)) e.markerEnd = s.markerEnd;
    if (Array.isArray(s.waypoints)) {
      if (s.waypoints.length > 100) throw bad(`too many waypoints for ${id}`);
      e.waypoints = s.waypoints.filter(isXY).map((p) => ({ x: r2(p.x), y: r2(p.y) }));
    }
    if (typeof s.sourceHandle === "string" && s.sourceHandle.length <= 32) e.sourceHandle = s.sourceHandle;
    if (typeof s.targetHandle === "string" && s.targetHandle.length <= 32) e.targetHandle = s.targetHandle;
    if (Object.keys(e).length) edges[id] = e;
  }

  const layout: GraphLayout = { positions, nodes, edges, updatedAt: nowIso() };
  await putObjectText(u.userId, p.projectId, `graph/${kind}.layout.json`, JSON.stringify(layout));
  return c.json(layout);
});

app.delete("/projects/:id/graph/:kind/layout", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const kind = graphKind(c.req.param("kind"));
  await deleteObject(u.userId, p.projectId, `graph/${kind}.layout.json`);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

app.get("/admin/users", async (c) => {
  requireAdmin(c.get("user"));
  const users = await listUsers();
  return c.json({ items: users.map(toPublicUser) });
});

app.put("/admin/users/:id", async (c) => {
  const me = c.get("user");
  requireAdmin(me);
  const id = c.req.param("id");
  const body = (await c.req.json()) as { disabled?: boolean; role?: "user" | "admin" };
  if (id === me.userId && body.disabled) throw bad("自分自身を無効化することはできません");
  const values: Partial<UserRecord> = {};
  if (typeof body.disabled === "boolean") values.disabled = body.disabled;
  if (body.role === "user" || body.role === "admin") values.role = body.role;
  await updateUser(id, values);
  return c.json({ ok: true });
});

app.get("/admin/projects", async (c) => {
  requireAdmin(c.get("user"));
  const items = (await listAllProjects()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return c.json({ items });
});

app.post("/admin/projects/:userId/:id/cancel", async (c) => {
  requireAdmin(c.get("user"));
  const p = await getProject(c.req.param("userId"), c.req.param("id"));
  if (!p) throw notFound();
  const job = p.activeJobId ? await getJob(p.projectId, p.activeJobId) : null;
  if (job) {
    await updateJob(p.projectId, job.jobId, { status: "CANCELLED", endedAt: nowIso() });
    if (job.ecsTaskArn) await stopEcsTask(job.ecsTaskArn, "cancelled by admin");
    await putMessage(p.projectId, job.jobId, "system", "status", "Job stopped by an admin.", { meta: { i18n: "sys.adminStopped" } });
  }
  await updateProject(p.userId, p.projectId, { status: "CANCELLED", activeJobId: null, pendingQuestion: null });
  return c.json({ ok: true });
});

app.get("/config", (c) => c.json({ maxConcurrentJobs: env.maxConcurrentJobs, maxConcurrentJobsPerUser: env.maxConcurrentJobsPerUser, codexModel: env.codexModel || null }));
