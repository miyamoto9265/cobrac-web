import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { LambdaContext, LambdaEvent } from "hono/aws-lambda";
import type {
  AnswerRequest,
  ArticleJobState,
  ArticleMeta,
  CanonDetailResponse,
  CanonMemberSummary,
  CanonChoice,
  CanonDiff,
  CanonIncoming,
  CanonPullRequestRecord,
  CanonRecord,
  CatalogItem,
  CloneProjectResponse,
  CanonSeedCandidate,
  CanonSnapshot,
  CreateArticleRequest,
  CreateProjectCanon,
  CreateCanonRequest,
  CreateProjectRequest,
  CreateUploadRequest,
  CreateUploadResponse,
  DeleteProjectResponse,
  FollowupRequest,
  JobRecord,
  ProjectAttachment,
  ProjectRecord,
  EdgeStyle,
  GraphLayout,
  ListArticlesResponse,
  NodeStyle,
  ReasoningEffort,
  RetryRequest,
  TokenUsage,
  UiLocale,
  PublicCanonDetail,
  PublicCanonSummary,
  PublicProjectDetail,
  PublicProjectSummary,
  UpdateCanonRequest,
  Visibility,
  UpdateProjectRequest,
  UpdateProjectResponse,
  UsageSummary,
  UserRecord,
} from "@cobrac/shared";
import {
  ARROW_HEADS,
  ATTACHMENT_LIMITS,
  UPLOAD_ID_REGEX,
  attachmentDisplayName,
  attachmentFileKey,
  attachmentTypeOf,
  normalizeAttachmentUrl,
  safeAttachmentName,
  stagingKey,
  CANON_DESCRIPTION_MAX,
  CANON_META_SK,
  CANON_POLICY_MAX,
  DEFAULT_CODEX_MODEL,
  canDeleteProject,
  isProjectDeleted,
  EDGE_LINE_TYPES,
  EMPTY_USAGE,
  PRICING,
  PRICING_AS_OF,
  REASONING_EFFORTS,
  addUsage,
  articleDownloadFileName,
  articleLocaleOfKey,
  articleMetaKey,
  BIBLIOGRAPHY_FILE,
  CSV_FILE_NAMES,
  HCD_FILES,
  PROJECT_FILES,
  braDownloadFileName,
  buildTemplateXlsx,
  filterCodexModels,
  VISIBILITIES,
  cloneName,
  cloneTargetKey,
  blockingConflicts,
  canonAlignInstruction,
  canonFollowStatus,
  canonFromCanon,
  composeSeeds,
  canonFromProject,
  canonOutSk,
  canonPrKey,
  canonPrSk,
  canonRevisionKey,
  canonRevisionSk,
  diffCanon,
  emptyCanonSnapshot,
  mergeCanon,
  FRG_FILES,
  formatCanonId,
  formatProjectId,
  isArticleStale,
  isCanonDeleted,
  isCloneTextFile,
  isPublicReadableKey,
  isPublishableProjectId,
  parseProjectId,
  rewriteProjectId,
  isCanonId,
  isProjectIdLike,
  isUiLocale,
  newId,
  normalizeCanonName,
  normalizeCanonText,
  normalizeProjectName,
  nowIso,
  projectDisplayName,
  projectNameKey,
  proposeProjectName,
  templateDownloadFileName,
  templateInputFromFiles,
  templateXlsxKey,
} from "@cobrac/shared";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { ensureUser, extractAuth, toPublicUser } from "./lib/auth.js";
import { getCatalogItem, getCloneCount, incrementCloneCount, listCatalog, putCatalogItem, deleteCatalogItem } from "./lib/catalog.js";
import {
  deleteObject,
  encryptApiKey,
  enqueueRun,
  getCanonJson,
  getObjectBytes,
  getObjectText,
  headStaging,
  listArtifacts,
  moveStagingToProject,
  presignDownload,
  presignUpload,
  putObjectBytes,
  putCanonJson,
  putObjectText,
  stopEcsTask,
} from "./lib/aws.js";
import { loadBraTemplate } from "./lib/braTemplate.js";
import {
  assignUserKey,
  findProjectByLegacyId,
  getJob,
  getProject,
  listAllProjects,
  listJobsForProject,
  listMessages,
  listProjects,
  listUserProjects,
  listUsers,
  markProjectDeleted,
  nextProjectSeq,
  putJob,
  putMessage,
  putProject,
  updateJob,
  updateProject,
  updateUser,
} from "./lib/db.js";
import { correctJobs, correctProject, correctProjects, correctUsageMessages, legacyCorrections } from "./lib/usageCorrection.js";
import { ownedMessages } from "./lib/ownership.js";
import {
  addCanonMember,
  advanceCanonHead,
  closePullRequest,
  getCanon,
  getPullRequest,
  listOutgoing,
  listPullRequests,
  putOutgoing,
  nextPrNumber,
  putCanonRevision,
  putPullRequest,
  updatePullRequest,
  listCanonMembers,
  listCanonRevisions,
  listOwnCanons,
  markCanonDeleted,
  nextCanonSeq,
  putCanon,
  removeCanonMember,
  updateCanon,
} from "./lib/canons.js";

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
/** Optional UI language of a request (absent / null = let the agent follow the user's language). */
const readLocale = (v: unknown): UiLocale | null => {
  if (v === undefined || v === null) return null;
  if (!isUiLocale(v)) throw bad("locale が不正です");
  return v;
};
const normModel = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(v)) throw bad("モデル名が不正です");
  return v;
};

app.put("/users/me", async (c) => {
  const body = (await c.req.json()) as Partial<Pick<UserRecord, "displayName" | "contributorName" | "defaultModel" | "defaultReasoningEffort" | "defaultCanonId">>;
  const u = c.get("user");
  const values: Partial<UserRecord> = {};
  if (typeof body.displayName === "string" && body.displayName.trim()) values.displayName = body.displayName.trim().slice(0, 80);
  if (typeof body.contributorName === "string" && body.contributorName.trim()) values.contributorName = body.contributorName.trim().slice(0, 120);
  if ("defaultModel" in body) values.defaultModel = normModel(body.defaultModel);
  if ("defaultReasoningEffort" in body) {
    if (body.defaultReasoningEffort !== null && body.defaultReasoningEffort !== undefined && !isEffort(body.defaultReasoningEffort)) throw bad("reasoning effort が不正です");
    values.defaultReasoningEffort = body.defaultReasoningEffort ?? null;
  }
  if ("defaultCanonId" in body) {
    if (body.defaultCanonId) await loadCanon(u, body.defaultCanonId, { write: true });
    values.defaultCanonId = body.defaultCanonId || null;
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
  for (const stored of items) {
    const recorded = await listJobsForProject(stored.projectId, u.userId);
    const jobs = await correctJobs(stored.projectId, recorded);
    const p = await correctProject(stored, recorded);
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
    summary.byProject.push({
      projectId: p.projectId,
      name: projectDisplayName(p),
      usage: p.usage ?? EMPTY_USAGE,
      costUsd: p.costUsd ?? null,
      models: [...models],
      ...(isProjectDeleted(p) ? { deleted: true } : {}),
    });
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
    if (isProjectDeleted(p)) return false;
    if (status && p.status !== status) return false;
    if (q && ![p.name, p.projectId, p.legacyId, p.roi, p.tlf].some((s) => (s ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
  return c.json({ items: await correctProjects(filtered), nextCursor });
});

/** One reference file: validated here, then sent by the browser straight to S3 staging (presigned POST). */
app.post("/uploads", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateUploadRequest>;
  const name = typeof body.name === "string" ? body.name : "";
  const type = attachmentTypeOf(name);
  if (!type) throw bad("このファイル形式は添付できません");
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw bad("空のファイルは添付できません");
  if (size > ATTACHMENT_LIMITS.maxFileBytes) throw bad(`ファイルが大きすぎます（上限 ${ATTACHMENT_LIMITS.maxFileBytes / 1024 / 1024} MB）`);
  const uploadId = `up_${randomUUID().replace(/-/g, "")}`;
  const expiresIn = 900;
  const { url, fields } = await presignUpload(stagingKey(u.userId, uploadId, safeAttachmentName(name)), type.mime, ATTACHMENT_LIMITS.maxFileBytes, expiresIn);
  const res: CreateUploadResponse = { uploadId, url, fields, contentType: type.mime, maxBytes: ATTACHMENT_LIMITS.maxFileBytes, expiresIn };
  return c.json(res, 201);
});

/** Checks the staged uploads of a create request (they must exist and fit the limits) before anything is written. */
async function stagedAttachments(userId: string, list: CreateProjectRequest["attachments"]) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw bad("attachments が不正です");
  if (list.length > ATTACHMENT_LIMITS.maxFiles) throw bad(`添付ファイルは ${ATTACHMENT_LIMITS.maxFiles} 個までです`);
  const out: { staging: string; safeName: string; name: string; size: number; contentType: string }[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const a of list) {
    if (!a || typeof a.uploadId !== "string" || !UPLOAD_ID_REGEX.test(a.uploadId) || typeof a.name !== "string" || seen.has(a.uploadId)) throw bad("attachments が不正です");
    seen.add(a.uploadId);
    const type = attachmentTypeOf(a.name);
    if (!type) throw bad("このファイル形式は添付できません");
    const safeName = safeAttachmentName(a.name);
    const staging = stagingKey(userId, a.uploadId, safeName);
    const head = await headStaging(staging);
    if (!head) throw bad(`アップロードが見つかりません（${attachmentDisplayName(a.name)}）。もう一度添付してください`);
    if (head.size > ATTACHMENT_LIMITS.maxFileBytes) throw bad("ファイルが大きすぎます");
    total += head.size;
    out.push({ staging, safeName, name: attachmentDisplayName(a.name), size: head.size, contentType: type.mime });
  }
  if (total > ATTACHMENT_LIMITS.maxTotalBytes) throw bad(`添付ファイルの合計が上限（${ATTACHMENT_LIMITS.maxTotalBytes / 1024 / 1024} MB）を超えています`);
  return out;
}

function attachmentUrls(list: CreateProjectRequest["urls"]): string[] {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw bad("urls が不正です");
  const urls: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const r = normalizeAttachmentUrl(raw);
    if ("error" in r) throw bad(`URL が不正です: ${raw.slice(0, 200)}`);
    if (!urls.includes(r.url)) urls.push(r.url);
  }
  if (urls.length > ATTACHMENT_LIMITS.maxUrls) throw bad(`URL は ${ATTACHMENT_LIMITS.maxUrls} 件までです`);
  return urls;
}

app.post("/projects", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です。設定画面で登録してください。");
  const body = (await c.req.json()) as CreateProjectRequest;
  const roi = (body.roi ?? "").trim();
  const tlf = (body.tlf ?? "").trim();
  if (!roi && !tlf) throw bad("ROI と TLF のどちらか一方は必須です");
  const canonPlan = await resolveProjectCanon(u, body.canon);
  // provisional until the agent names the project from meta.json; the user can rename it afterwards
  const name = proposeProjectName(roi, tlf);
  const contributor = u.contributorName?.trim() || u.displayName;
  // Always persist a concrete model so usage can be priced (project → user default → env → DEFAULT_CODEX_MODEL)
  const model = ("model" in body ? normModel(body.model) : null) || u.defaultModel || env.codexModel || DEFAULT_CODEX_MODEL;
  let reasoningEffort: ReasoningEffort | null = u.defaultReasoningEffort ?? null;
  if ("reasoningEffort" in body) {
    if (body.reasoningEffort !== null && body.reasoningEffort !== undefined && !isEffort(body.reasoningEffort)) throw bad("reasoning effort が不正です");
    reasoningEffort = body.reasoningEffort ?? null;
  }
  if (body.researchMode !== undefined && typeof body.researchMode !== "boolean") throw bad("researchMode は true / false で指定してください");
  const researchMode = body.researchMode ?? true;
  const locale = readLocale(body.locale);
  const urls = attachmentUrls(body.urls);
  const staged = await stagedAttachments(u.userId, body.attachments);

  const userKey = u.userKey ?? (await assignUserKey(u.userId));
  const projectId = formatProjectId(userKey, await nextProjectSeq(u.userId));
  const attachments: ProjectAttachment[] = [];
  for (const [i, f] of staged.entries()) {
    const key = attachmentFileKey(i, f.safeName);
    await moveStagingToProject(f.staging, u.userId, projectId, key, f.contentType);
    attachments.push({ kind: "file", id: `f${i + 1}`, name: f.name, key, size: f.size, contentType: f.contentType });
  }
  urls.forEach((url, i) => attachments.push({ kind: "url", id: `u${i + 1}`, url }));
  const now = nowIso();
  const jobId = newId("job_");
  const project: ProjectRecord = {
    userId: u.userId,
    projectId,
    name,
    nameSource: "provisional",
    revision: 0,
    roi,
    tlf,
    contributor,
    ...(attachments.length ? { attachments } : {}),
    model,
    reasoningEffort,
    researchMode,
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
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw new HTTPException(409, { message: "Project ID の採番が衝突しました。もう一度作成してください" });
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
    locale,
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
  const owner = { userId: u.userId };
  await putMessage(projectId, jobId, "user", "prompt", `ROI: ${roi || "(not set)"}\nTLF: ${tlf || "(not set)"}`, {
    ...owner,
    meta: { kind: "create", roi, tlf, projectId, name, model, reasoningEffort, researchMode, ...(attachments.length ? { attachments: attachments.length } : {}) },
  });
  await putMessage(projectId, jobId, "system", "status", `Model: ${model ?? "default"} / reasoning effort: ${reasoningEffort ?? "default"}`, {
    ...owner,
    meta: { i18n: "sys.model", model: model ?? "", effort: reasoningEffort ?? "" },
  });
  await putMessage(projectId, jobId, "system", "status", researchMode ? "Research mode: on" : "Research mode: off", {
    ...owner,
    meta: { i18n: researchMode ? "sys.researchOn" : "sys.researchOff" },
  });
  if (canonPlan) {
    // before the job is queued, so the worker's first run already follows the Canon
    const canonId = await applyProjectCanon(u, project, canonPlan);
    const joined = await getProject(u.userId, projectId);
    if (joined) Object.assign(project, { canonId, canonRevision: joined.canonRevision });
  }
  await putMessage(projectId, jobId, "system", "status", "Job queued. Waiting for a worker to start…", { ...owner, meta: { i18n: "sys.queued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId, jobId, mode: "initial" });
  return c.json(project, 201);
});

/** Current Project ID for a URL segment: the ID itself, or the new ID of a migrated legacy ID. */
app.get("/projects/resolve/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isProjectIdLike(id)) throw notFound();
  const direct = await getProject(u.userId, id);
  const p = direct && !isProjectDeleted(direct) ? direct : await findProjectByLegacyId(u.userId, id);
  if (!p) throw notFound();
  return c.json({ projectId: p.projectId });
});

/** The caller's own, not-deleted project; anything else is 404 so other users' and deleted IDs look the same. */
async function loadOwnProject(u: UserRecord, projectId: string): Promise<ProjectRecord> {
  const p = await getProject(u.userId, projectId);
  if (!p || isProjectDeleted(p)) throw notFound();
  return p;
}

app.get("/projects/:id", async (c) => {
  const u = c.get("user");
  const stored = await loadOwnProject(u, c.req.param("id"));
  const recorded = await listJobsForProject(stored.projectId, u.userId);
  const [p, jobs] = await Promise.all([correctProject(stored, recorded), correctJobs(stored.projectId, recorded)]);
  const cloneCount = p.visibility === "public" || p.publishedAt ? await getCloneCount(p.projectId) : 0;
  return c.json({ ...p, cloneCount, jobs: jobs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) });
});

app.put("/projects/:id", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const body = (await c.req.json()) as UpdateProjectRequest;
  if (body.name === undefined) throw bad("name is required");
  const n = normalizeProjectName(body.name);
  if ("error" in n) throw bad(`名前が不正です（${n.error}）`);
  await updateProject(u.userId, p.projectId, { name: n.name, nameSource: "user" });
  const key = projectNameKey(n.name);
  const duplicates = (await listUserProjects(u.userId))
    .filter((o) => o.projectId !== p.projectId && !isProjectDeleted(o) && projectNameKey(projectDisplayName(o)) === key)
    .map((o) => ({ projectId: o.projectId, name: projectDisplayName(o) }));
  const res: UpdateProjectResponse = { project: { ...p, name: n.name, nameSource: "user", updatedAt: nowIso() }, duplicates };
  return c.json(res);
});

/** Soft delete (owner only). Nothing is removed from DynamoDB or S3; running projects must be stopped first. */
app.delete("/projects/:id", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!canDeleteProject(p)) throw new HTTPException(409, { message: "実行中のプロジェクトは削除できません。先に停止してください" });
  let deletedAt: string;
  try {
    deletedAt = await markProjectDeleted(u.userId, p.projectId, u.userId);
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw new HTTPException(409, { message: "プロジェクトの状態が変わったため削除できませんでした。再読み込みしてください" });
    throw e;
  }
  if (p.canonId) await removeCanonMember(p.canonId, u.userId, p.projectId).catch((e) => console.warn("[canon] release on delete failed", e));
  if (p.visibility === "public") await deleteCatalogItem("project", p.projectId);
  const res: DeleteProjectResponse = { projectId: p.projectId, deletedAt };
  return c.json(res);
});

app.get("/projects/:id/messages", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const [r, jobs] = await Promise.all([
    listMessages(p.projectId, Number(c.req.query("limit") ?? 500), c.req.query("cursor")),
    listJobsForProject(p.projectId, u.userId),
  ]);
  const items = ownedMessages(r.items, u.userId, new Set(jobs.map((j) => j.jobId)));
  return c.json({ ...r, items: correctUsageMessages(items, await legacyCorrections(p.projectId, jobs)) });
});

/** Project fields after its active job is stopped. An article job leaves the finished BRA data as it was. */
function afterStop(p: ProjectRecord, job: JobRecord | null): Partial<ProjectRecord> {
  if (job?.type !== "article") return { status: "CANCELLED", activeJobId: null, activeStage: null, pendingQuestion: null };
  const articleJob: ArticleJobState | null = p.articleJob?.jobId === job.jobId ? { ...p.articleJob, status: "CANCELLED" } : (p.articleJob ?? null);
  return { status: "COMPLETED", activeJobId: null, pendingQuestion: null, articleJob };
}

app.post("/projects/:id/cancel", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING"].includes(p.status)) throw bad("このプロジェクトは実行中ではありません");
  const job = p.activeJobId ? await getJob(p.projectId, p.activeJobId) : null;
  if (job) {
    await updateJob(p.projectId, job.jobId, { status: "CANCELLED", endedAt: nowIso() });
    if (job.ecsTaskArn) await stopEcsTask(job.ecsTaskArn, "cancelled by user");
    await putMessage(p.projectId, job.jobId, "system", "status", "Job cancelled by the user.", { userId: p.userId, meta: { i18n: "sys.cancelled" } });
  }
  await updateProject(u.userId, p.projectId, afterStop(p, job));
  return c.json({ ok: true });
});

app.post("/projects/:id/answer", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "WAITING_USER_INPUT" || !p.activeJobId) throw bad("回答待ちの質問はありません");
  const body = (await c.req.json()) as AnswerRequest;
  const text = (body.answer ?? "").trim();
  if (!text) throw bad("回答を入力してください");
  const locale = readLocale(body.locale);
  const job = await getJob(p.projectId, p.activeJobId);
  if (!job) throw notFound();
  await updateJob(p.projectId, job.jobId, { status: "QUEUED", pendingAnswer: text, ...(locale ? { locale } : {}) });
  await updateProject(u.userId, p.projectId, { status: "QUEUED", pendingQuestion: null });
  await putMessage(p.projectId, job.jobId, "user", "prompt", text, { userId: p.userId, meta: { kind: "answer" } });
  await putMessage(p.projectId, job.jobId, "system", "status", "Answer received. Restarting the worker…", { userId: p.userId, meta: { i18n: "sys.answered" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId: job.jobId, mode: "resume" });
  return c.json({ ok: true });
});

app.post("/projects/:id/followup", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "COMPLETED") throw bad("フォローアップは完了済みのプロジェクトにのみ送信できます");
  const body = (await c.req.json()) as FollowupRequest;
  const text = (body.instruction ?? "").trim();
  if (!text) throw bad("指示を入力してください");
  const locale = readLocale(body.locale);
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
    locale,
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
  await putMessage(p.projectId, jobId, "user", "prompt", text, { userId: p.userId, meta: { kind: "followup" } });
  await putMessage(p.projectId, jobId, "system", "status", "Follow-up job queued.", { userId: p.userId, meta: { i18n: "sys.followupQueued" } });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId, mode: "followup" });
  return c.json({ ok: true, jobId });
});

app.post("/projects/:id/retry", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!["FAILED", "CANCELLED"].includes(p.status)) throw bad("リトライは失敗またはキャンセルされたプロジェクトにのみ実行できます");
  const body = (await c.req.json().catch(() => ({}))) as RetryRequest;
  const locale = readLocale(body?.locale);
  const jobs = await listJobsForProject(p.projectId, u.userId);
  const last = jobs.filter((j) => j.type !== "article").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
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
    locale: locale ?? last?.locale ?? null,
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
  await putMessage(p.projectId, jobId, "system", "status", "Retry queued. Continuing from previous artifacts.", { userId: p.userId, meta: { i18n: "sys.retryQueued" } });
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
  const articleLocale = articleLocaleOfKey(key);
  const attachment = p.attachments?.find((a) => a.kind === "file" && a.key === key);
  const fileName =
    key === `output/${p.projectId}.bra.xlsx`
      ? braDownloadFileName(projectDisplayName(p), p.projectId)
      : key === templateXlsxKey(p.projectId)
        ? templateDownloadFileName(projectDisplayName(p), p.projectId)
        : articleLocale
        ? articleDownloadFileName(projectDisplayName(p), p.projectId, articleLocale)
        : attachment?.kind === "file"
          ? { ascii: safeAttachmentName(attachment.name), utf8: attachment.name }
          : undefined;
  const url = await presignDownload(u.userId, p.projectId, key, fileName);
  return c.json({ url, expiresIn: 900 });
});

/**
 * The BRA data in the official Template-v2-2.bra workbook. The worker writes it at the end of every job; projects
 * finished before that (or whose file is older than the CoBRAC xlsx) get it built here from the workspace files.
 */
app.get("/projects/:id/artifacts/template-xlsx", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const P = p.projectId;
  const items = await listArtifacts(u.userId, P);
  const bra = items.find((a) => a.key === `output/${P}.bra.xlsx`);
  if (!bra) throw notFound();
  const key = templateXlsxKey(P);
  const current = items.find((a) => a.key === key);
  if (!current || current.lastModified < bra.lastModified) {
    const ws = "workspace/";
    const text = (rel: string) => getObjectText(u.userId, P, ws + rel);
    const csv: Record<string, string | null> = {};
    for (const f of CSV_FILE_NAMES) csv[f] = await text(`${P}_CSV/${f}`);
    const input = templateInputFromFiles(
      {
        csv,
        referencesJson: await text(`${P}_HCD/${HCD_FILES.references}`),
        referenceCheckJson: await text(PROJECT_FILES.referenceCheck),
        bibliographyJson: await text(`${P}_CSV/${BIBLIOGRAPHY_FILE}`),
      },
      { projectId: P, contributor: p.contributor, roi: p.roi },
    );
    if (!input) throw notFound();
    const r = buildTemplateXlsx(await loadBraTemplate(), input);
    await putObjectBytes(u.userId, P, key, r.bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  const url = await presignDownload(u.userId, P, key, templateDownloadFileName(projectDisplayName(p), P));
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

// --- explanatory articles -----------------------------------------------------
// Written on request from finished BRA data, one per language: article/<locale>.md + article/<locale>.json (ArticleMeta).

app.post("/projects/:id/articles", async (c) => {
  const u = c.get("user");
  if (!u.apiKeyRegistered) throw bad("OpenAI API キーが未登録です");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "COMPLETED" || p.stepStates?.XLSX !== "done") throw bad("解説記事は BRA データの完成後に作成できます");
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateArticleRequest>;
  if (!isUiLocale(body.locale)) throw bad("locale が不正です");
  const locale = body.locale;
  const now = nowIso();
  const jobId = newId("job_");
  const job: JobRecord = {
    projectId: p.projectId,
    jobId,
    userId: u.userId,
    type: "article",
    status: "QUEUED",
    instruction: null,
    pendingAnswer: null,
    articleLocale: locale,
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
  const articleJob: ArticleJobState = { jobId, locale, status: "QUEUED", errorMessage: null, requestedAt: now };
  await updateProject(u.userId, p.projectId, { status: "QUEUED", activeJobId: jobId, errorMessage: null, articleJob });
  await putMessage(p.projectId, jobId, "system", "status", `Explanatory article (${locale}) queued.`, {
    userId: p.userId,
    meta: { i18n: "sys.articleQueued", lang: locale },
  });
  await enqueueRun({ version: 1, userId: u.userId, projectId: p.projectId, jobId, mode: "article" });
  return c.json({ ok: true, jobId, articleJob }, 202);
});

app.get("/projects/:id/articles", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const files = (await listArtifacts(u.userId, p.projectId)).filter((a) => a.category === "article");
  const items: ListArticlesResponse["items"] = [];
  for (const a of files) {
    const locale = articleLocaleOfKey(a.key);
    if (!locale) continue;
    const text = await getObjectText(u.userId, p.projectId, articleMetaKey(locale));
    let meta: ArticleMeta | null = null;
    try {
      meta = text ? (JSON.parse(text) as ArticleMeta) : null;
    } catch {
      meta = null;
    }
    const m: ArticleMeta = meta ?? { locale, language: locale, title: "", createdAt: a.lastModified, sourceRevision: -1, jobId: "", model: null, citedReferences: [] };
    items.push({ ...m, locale, key: a.key, size: a.size, lastModified: a.lastModified, stale: isArticleStale(m, p) });
  }
  return c.json({ items } satisfies ListArticlesResponse);
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
// Canons (a set of the owner's projects whose circuit definitions must agree)
// ---------------------------------------------------------------------------

/** The caller's own, not-deleted Canon (admins may read any); anything else is 404. */
async function loadCanon(u: UserRecord, canonId: string, opts: { write?: boolean } = {}): Promise<CanonRecord> {
  if (!isCanonId(canonId)) throw notFound();
  const canon = await getCanon(canonId);
  if (!canon || isCanonDeleted(canon)) throw notFound();
  if (canon.ownerUserId !== u.userId && (opts.write || u.role !== "admin")) throw notFound();
  return canon;
}

function canonFields(body: CreateCanonRequest | UpdateCanonRequest, partial: boolean): Partial<CanonRecord> {
  const out: Partial<CanonRecord> = {};
  if (!partial || body.name !== undefined) {
    const n = normalizeCanonName(body.name);
    if ("error" in n) throw bad(`名前が不正です（${n.error}）`);
    out.name = n.name;
  }
  for (const [key, max] of [
    ["description", CANON_DESCRIPTION_MAX],
    ["policy", CANON_POLICY_MAX],
  ] as const) {
    if (partial && body[key] === undefined) continue;
    const r = normalizeCanonText(body[key], max);
    if ("error" in r) throw bad(`${key === "policy" ? "粒度方針" : "説明"}が不正です（${r.error}）`);
    out[key] = r.text;
  }
  return out;
}

app.get("/canons", async (c) => {
  const u = c.get("user");
  const items = (await listOwnCanons(u.userId)).filter((x) => !isCanonDeleted(x)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return c.json({ items });
});

app.post("/canons", async (c) => {
  const u = c.get("user");
  const fields = canonFields((await c.req.json()) as CreateCanonRequest, false);
  const userKey = u.userKey ?? (await assignUserKey(u.userId));
  const now = nowIso();
  const canon: CanonRecord = {
    canonId: formatCanonId(userKey, await nextCanonSeq(u.userId)),
    sk: CANON_META_SK,
    ownerUserId: u.userId,
    name: fields.name!,
    description: fields.description ?? "",
    policy: fields.policy ?? "",
    visibility: "private",
    headRevision: 0,
    memberCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await putCanon(canon);
  return c.json(canon, 201);
});

app.get("/canons/:id", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  const members: CanonMemberSummary[] = [];
  for (const m of await listCanonMembers(canon.canonId)) {
    const p = await getProject(canon.ownerUserId, m.projectId);
    if (!p) continue;
    members.push({
      projectId: p.projectId,
      name: projectDisplayName(p),
      roi: p.roi,
      tlf: p.tlf,
      status: p.status,
      hasArtifacts: p.hasArtifacts,
      joinedAt: m.joinedAt,
    });
  }
  members.sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1));
  const res: CanonDetailResponse = { canon, members };
  return c.json(res);
});

app.put("/canons/:id", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const fields = canonFields((await c.req.json()) as UpdateCanonRequest, true);
  if (Object.keys(fields).length) await updateCanon(canon.canonId, fields);
  return c.json({ ...canon, ...fields, updatedAt: nowIso() });
});

/** Soft delete (owner only): member projects leave the Canon; nothing is removed from DynamoDB or S3. */
app.delete("/canons/:id", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  try {
    const deletedAt = await markCanonDeleted(canon.canonId, u.userId);
    if (canon.visibility === "public") await deleteCatalogItem("canon", canon.canonId);
    return c.json({ canonId: canon.canonId, deletedAt });
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw notFound();
    throw e;
  }
});

app.post("/canons/:id/members", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const { projectId } = (await c.req.json()) as { projectId?: string };
  if (!projectId || !isProjectIdLike(projectId)) throw bad("projectId が不正です");
  const p = await loadOwnProject(u, projectId);
  if (p.canonId === canon.canonId) return c.json({ projectId, canonId: canon.canonId });
  if (p.canonId) {
    const other = await getCanon(p.canonId);
    throw new HTTPException(409, { message: `このプロジェクトは既に Canon「${other?.name ?? p.canonId}」に入っています。先にそちらから外してください` });
  }
  const r = await addCanonMember(canon.canonId, u.userId, projectId, canon.headRevision);
  if (!r.ok) throw new HTTPException(409, { message: "プロジェクトの状態が変わったため追加できませんでした。再読み込みしてください" });
  return c.json({ projectId, canonId: canon.canonId, joinedAt: r.member.joinedAt }, 201);
});

app.delete("/canons/:id/members/:projectId", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  if (!(await removeCanonMember(canon.canonId, u.userId, c.req.param("projectId")))) throw notFound();
  return c.json({ ok: true });
});

app.get("/canons/:id/revisions", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  return c.json({ items: await listCanonRevisions(canon.canonId) });
});

// --- push and pull requests (stage 2) ----------------------------------------

async function loadCanonHead(canon: CanonRecord): Promise<CanonSnapshot> {
  if (canon.headRevision === 0) return emptyCanonSnapshot(canon.canonId, canon.createdAt);
  const snap = await getCanonJson<CanonSnapshot>(canonRevisionKey(canon.canonId, canon.headRevision));
  if (!snap) throw new Error(`Canon ${canon.canonId} revision ${canon.headRevision} is missing`);
  return snap;
}

/** The project's latest completed data in Canon form (Q16: only a COMPLETED project with artifacts can be pushed). */
async function projectIncoming(u: UserRecord, p: ProjectRecord): Promise<CanonIncoming> {
  if (p.status !== "COMPLETED" || !p.hasArtifacts) throw new HTTPException(409, { message: "完了したプロジェクトだけを Canon に push できます" });
  const P = p.projectId;
  const text = (rel: string) => getObjectText(u.userId, P, `workspace/${rel}`);
  const uc = await text(`${P}_HCD/${HCD_FILES.uc}`);
  if (!uc) throw new HTTPException(409, { message: "このプロジェクトには uc.json がありません" });
  return canonFromProject(P, p.revision ?? 0, {
    uc,
    connections: await text(`${P}_HCD/${HCD_FILES.connections}`),
    references: await text(`${P}_HCD/${HCD_FILES.references}`),
    frg: await text(`${P}_FRG/${FRG_FILES.frg}`),
    meta: await text(PROJECT_FILES.meta),
    referenceCheck: await text(PROJECT_FILES.referenceCheck),
    quoteCheck: await text(PROJECT_FILES.quoteCheck),
  });
}

async function projectCanon(u: UserRecord, projectId: string): Promise<{ p: ProjectRecord; canon: CanonRecord }> {
  const p = await loadOwnProject(u, projectId);
  if (!p.canonId) throw new HTTPException(409, { message: "このプロジェクトは Canon に入っていません" });
  const canon = await loadCanon(u, p.canonId, { write: true });
  return { p, canon };
}

app.post("/projects/:id/canon/preview", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const diff = diffCanon(await loadCanonHead(canon), await projectIncoming(u, p));
  return c.json({ canonId: canon.canonId, diff });
});

/** Stores a project's push as an open pull request of `canon` (superseding its older open one). */
async function openProjectPr(u: UserRecord, canon: CanonRecord, p: ProjectRecord, incoming: CanonIncoming, diff: CanonDiff): Promise<CanonPullRequestRecord> {
  const source = `project:${p.projectId}`;
  const prNo = await nextPrNumber(canon.canonId);
  await putCanonJson(canonPrKey(canon.canonId, prNo, "incoming.json"), incoming);
  await putCanonJson(canonPrKey(canon.canonId, prNo, "diff.json"), diff);
  for (const old of await listPullRequests(canon.canonId)) {
    if (old.state === "open" && old.source === source && old.prNo !== prNo) await closePullRequest(canon.canonId, old.prNo, { state: "superseded", reason: `#${prNo}` });
  }
  const now = nowIso();
  const pr: CanonPullRequestRecord = {
    canonId: canon.canonId,
    sk: canonPrSk(prNo),
    prNo,
    source,
    sourceName: projectDisplayName(p),
    sourceRevision: incoming.projectRevision,
    baseRevision: diff.baseRevision,
    state: "open",
    summary: diff.summary,
    createdBy: u.userId,
    createdAt: now,
    updatedAt: now,
  };
  await putPullRequest(pr);
  return pr;
}

app.post("/projects/:id/canon/push", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const incoming = await projectIncoming(u, p);
  const diff = diffCanon(await loadCanonHead(canon), incoming);
  const pr = await openProjectPr(u, canon, p, incoming, diff);
  return c.json({ pr, diff }, 201);
});

// --- seeding a new Canon from existing projects (stage 3′) ---------------------------

async function seedCandidates(u: UserRecord, ids: string[]): Promise<{ candidates: CanonSeedCandidate[]; projects: ProjectRecord[] }> {
  const candidates: CanonSeedCandidate[] = [];
  const projects: ProjectRecord[] = [];
  for (const id of [...new Set(ids)]) {
    const p = isProjectIdLike(id) ? await getProject(u.userId, id) : null;
    if (!p || isProjectDeleted(p)) {
      candidates.push({ projectId: id, name: id, roi: "", tlf: "", eligible: false, reason: "not-found" });
      continue;
    }
    const base = { projectId: p.projectId, name: projectDisplayName(p), roi: p.roi, tlf: p.tlf };
    if (p.canonId) candidates.push({ ...base, eligible: false, reason: "in-canon", canonName: (await getCanon(p.canonId))?.name ?? p.canonId });
    else if (p.status !== "COMPLETED" || !p.hasArtifacts) candidates.push({ ...base, eligible: false, reason: "not-completed" });
    else {
      candidates.push({ ...base, eligible: true });
      projects.push(p);
    }
  }
  return { candidates, projects };
}

type SeedPlan = Extract<CreateProjectCanon, { mode: "new" }>;

async function composeSeedPlan(u: UserRecord, plan: SeedPlan, canonId: string) {
  if (!Array.isArray(plan.seeds) || plan.seeds.length === 0) throw bad("種にするプロジェクトを 1 つ以上選んでください");
  const { candidates, projects } = await seedCandidates(u, plan.seeds.map(String));
  const incomings: CanonIncoming[] = [];
  for (const p of projects) incomings.push(await projectIncoming(u, p));
  const composed = composeSeeds(canonId, nowIso(), incomings, plan.choices ?? {}, plan.actions ?? {});
  return { candidates, projects, incomings, ...composed };
}

app.post("/canons/seed-preview", async (c) => {
  const u = c.get("user");
  const plan = (await c.req.json()) as SeedPlan;
  const r = await composeSeedPlan(u, { ...plan, mode: "new", name: plan.name ?? "preview" }, "preview");
  const count = (o: string) => r.steps.filter((s) => s.outcome === o).length;
  return c.json({
    candidates: r.candidates,
    steps: r.steps,
    summary: { circuits: r.snapshot.circuits.length, connections: r.snapshot.connections.length, references: r.snapshot.references.length, merged: count("merged"), pending: count("pending"), excluded: count("excluded") },
  });
});

/** Validated Canon plan of a new project (checked before the project is created, so a bad plan creates nothing). */
async function resolveProjectCanon(u: UserRecord, choice: CreateProjectCanon | undefined): Promise<{ existing?: CanonRecord; plan?: SeedPlan } | null> {
  if (choice === undefined) {
    if (!u.defaultCanonId) return null;
    const canon = await getCanon(u.defaultCanonId);
    return canon && !isCanonDeleted(canon) && canon.ownerUserId === u.userId ? { existing: canon } : null;
  }
  if (choice.mode === "none") return null;
  if (choice.mode === "existing") return { existing: await loadCanon(u, choice.canonId, { write: true }) };
  if (choice.mode === "new") {
    canonFields(choice, false);
    const { candidates } = await seedCandidates(u, (choice.seeds ?? []).map(String));
    const bad_ = candidates.filter((x) => !x.eligible);
    if (!candidates.length) throw bad("種にするプロジェクトを 1 つ以上選んでください");
    if (bad_.length) throw new HTTPException(409, { message: `種にできないプロジェクトがあります: ${bad_.map((x) => `${x.name} (${x.reason})`).join(", ")}` });
    return { plan: choice };
  }
  throw bad("canon.mode が不正です");
}

/** Puts the new project into its Canon (creating the Canon from the seeds first when asked). */
async function applyProjectCanon(u: UserRecord, project: ProjectRecord, r: { existing?: CanonRecord; plan?: SeedPlan }): Promise<string> {
  if (r.existing) {
    const added = await addCanonMember(r.existing.canonId, u.userId, project.projectId, r.existing.headRevision);
    if (!added.ok) throw new Error("could not add the new project to its Canon");
    return r.existing.canonId;
  }
  const plan = r.plan!;
  const fields = canonFields(plan, false);
  const userKey = u.userKey ?? (await assignUserKey(u.userId));
  const canonId = formatCanonId(userKey, await nextCanonSeq(u.userId));
  const composed = await composeSeedPlan(u, plan, canonId);
  const now = nowIso();
  const head = composed.snapshot.revision;
  const canon: CanonRecord = {
    canonId,
    sk: CANON_META_SK,
    ownerUserId: u.userId,
    name: fields.name!,
    description: fields.description ?? "",
    policy: fields.policy ?? "",
    visibility: "private",
    headRevision: 0,
    memberCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await putCanon(canon);
  if (head === 1) {
    await putCanonJson(canonRevisionKey(canonId, 1), { ...composed.snapshot, createdAt: now });
    await putCanonRevision({ canonId, sk: canonRevisionSk(1), revision: 1, prNo: 0, source: "seed", createdAt: now, circuitCount: composed.snapshot.circuits.length, connectionCount: composed.snapshot.connections.length });
    await advanceCanonHead(canonId, 0);
  }
  const live = { ...canon, headRevision: head };
  for (const step of composed.steps) {
    if (step.outcome === "excluded") continue;
    await addCanonMember(canonId, u.userId, step.projectId, head);
    if (step.outcome === "pending") {
      const i = composed.incomings.findIndex((x) => x.projectId === step.projectId);
      const p = composed.projects.find((x) => x.projectId === step.projectId)!;
      await openProjectPr(u, live, p, composed.incomings[i], diffCanon(composed.snapshot, composed.incomings[i]));
    }
  }
  await addCanonMember(canonId, u.userId, project.projectId, head);
  return canonId;
}

app.get("/canons/:id/pulls", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  return c.json({ items: await listPullRequests(canon.canonId) });
});

async function loadPr(canon: CanonRecord, no: string): Promise<CanonPullRequestRecord> {
  const n = Number(no);
  if (!Number.isInteger(n) || n < 1) throw notFound();
  const pr = await getPullRequest(canon.canonId, n);
  if (!pr) throw notFound();
  return pr;
}

/** Owner (and admins) of the target Canon, or whoever sent the pull request (a Canon → Canon PR of another user). */
async function loadPrForViewer(u: UserRecord, canonId: string, no: string): Promise<{ canon: CanonRecord; pr: CanonPullRequestRecord; isOwner: boolean }> {
  if (!isCanonId(canonId)) throw notFound();
  const canon = await getCanon(canonId);
  if (!canon || isCanonDeleted(canon)) throw notFound();
  const pr = await loadPr(canon, no);
  const isOwner = canon.ownerUserId === u.userId;
  if (!isOwner && pr.createdBy !== u.userId && u.role !== "admin") throw notFound();
  return { canon, pr, isOwner };
}

app.get("/canons/:id/pulls/:no", async (c) => {
  const u = c.get("user");
  const { canon, pr, isOwner } = await loadPrForViewer(u, c.req.param("id"), c.req.param("no"));
  const diff = await getCanonJson<CanonDiff>(canonPrKey(canon.canonId, pr.prNo, "diff.json"));
  return c.json({ pr, diff, headRevision: canon.headRevision, targetName: canon.name, canReview: isOwner, canWithdraw: pr.createdBy === u.userId });
});

app.post("/canons/:id/pulls/:no/approve", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const pr = await loadPr(canon, c.req.param("no"));
  if (pr.state !== "open") throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  const body = (await c.req.json().catch(() => ({}))) as { choices?: Record<string, CanonChoice> };
  const choices: Record<string, CanonChoice> = {};
  for (const [k, v] of Object.entries(body.choices ?? {})) if (v === "canon" || v === "incoming") choices[k] = v;
  const incoming = await getCanonJson<CanonIncoming>(canonPrKey(canon.canonId, pr.prNo, "incoming.json"));
  if (!incoming) throw new Error(`PR ${pr.prNo} payload is missing`);
  const head = await loadCanonHead(canon);
  let diff = await getCanonJson<CanonDiff>(canonPrKey(canon.canonId, pr.prNo, "diff.json"));
  if (!diff || diff.baseRevision !== head.revision) {
    // the Canon moved since the push: judge the PR against the current head
    diff = diffCanon(head, incoming);
    await putCanonJson(canonPrKey(canon.canonId, pr.prNo, "diff.json"), diff);
    await updatePullRequest(canon.canonId, pr.prNo, { baseRevision: diff.baseRevision, summary: diff.summary });
  }
  const blocking = blockingConflicts(diff, choices);
  if (blocking.length) return c.json({ error: "解決していない衝突があります", blocking, diff }, 409);
  const now = nowIso();
  const next = mergeCanon(head, incoming, diff, choices, pr.prNo, now);
  await putCanonJson(canonRevisionKey(canon.canonId, next.revision), next);
  if (!(await advanceCanonHead(canon.canonId, head.revision))) {
    return c.json({ error: "ほかの取り込みと重なりました。もう一度承認してください" }, 409);
  }
  await putCanonRevision({
    canonId: canon.canonId,
    sk: canonRevisionSk(next.revision),
    revision: next.revision,
    prNo: pr.prNo,
    source: pr.source,
    createdAt: now,
    circuitCount: next.circuits.length,
    connectionCount: next.connections.length,
  });
  await closePullRequest(canon.canonId, pr.prNo, { state: "approved", decidedBy: u.userId, decidedAt: now, mergedRevision: next.revision });
  // the pushing project follows the revision that contains its own content (Q9)
  if (pr.source.startsWith("project:")) {
    const pid = pr.source.slice("project:".length);
    const p = await getProject(canon.ownerUserId, pid);
    if (p && p.canonId === canon.canonId && !isProjectDeleted(p)) await updateProject(canon.ownerUserId, pid, { canonRevision: next.revision });
  }
  return c.json({ revision: next.revision });
});

app.post("/canons/:id/pulls/:no/reject", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const pr = await loadPr(canon, c.req.param("no"));
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const r = normalizeCanonText(reason, CANON_POLICY_MAX);
  if ("error" in r || !r.text) throw bad("却下の理由を書いてください");
  if (!(await closePullRequest(canon.canonId, pr.prNo, { state: "rejected", decidedBy: u.userId, decidedAt: nowIso(), reason: r.text }))) {
    throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  }
  return c.json({ ok: true });
});

app.post("/canons/:id/pulls/:no/withdraw", async (c) => {
  const u = c.get("user");
  const { canon, pr } = await loadPrForViewer(u, c.req.param("id"), c.req.param("no"));
  if (pr.createdBy !== u.userId) throw notFound();
  if (!(await closePullRequest(canon.canonId, pr.prNo, { state: "withdrawn", decidedBy: u.userId, decidedAt: nowIso() }))) {
    throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  }
  return c.json({ ok: true });
});

// --- following a Canon (stage 3) -------------------------------------------------

async function loadCanonRevision(canon: CanonRecord, rev: number): Promise<CanonSnapshot> {
  if (rev <= 0) return emptyCanonSnapshot(canon.canonId, canon.createdAt);
  const snap = await getCanonJson<CanonSnapshot>(canonRevisionKey(canon.canonId, rev));
  if (!snap) throw new Error(`Canon ${canon.canonId} revision ${rev} is missing`);
  return snap;
}

/** Pinned revision vs head, judged on what the project uses, plus the follow-up text that aligns it. */
app.get("/projects/:id/canon", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const pinned = Math.min(p.canonRevision ?? 0, canon.headRevision);
  const status = canonFollowStatus(await loadCanonRevision(canon, pinned), await loadCanonRevision(canon, canon.headRevision), p.projectId);
  const info = { canonId: canon.canonId, name: canon.name, policy: canon.policy, revision: canon.headRevision };
  return c.json({ canonId: canon.canonId, name: canon.name, ...status, alignInstruction: canonAlignInstruction(info, status) });
});

/** Moves the project's pin (default: the head). Takes effect from the next job. */
app.post("/projects/:id/canon/pull", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const { revision } = (await c.req.json().catch(() => ({}))) as { revision?: number };
  const rev = revision === undefined ? canon.headRevision : Number(revision);
  if (!Number.isInteger(rev) || rev < 0 || rev > canon.headRevision) throw bad("revision が不正です");
  await updateProject(u.userId, p.projectId, { canonRevision: rev });
  return c.json({ canonRevision: rev });
});

// --- Canon → Canon pull requests (stage 2′) --------------------------------------

/**
 * A Canon the caller may send a pull request to: their own, or a public one that accepts pull requests.
 * Everything else looks missing (404).
 */
async function loadPrTarget(u: UserRecord, canonId: string): Promise<CanonRecord> {
  if (!isCanonId(canonId)) throw notFound();
  const canon = await getCanon(canonId);
  if (!canon || isCanonDeleted(canon)) throw notFound();
  if (canon.ownerUserId === u.userId) return canon;
  if (canon.visibility !== "public") throw notFound();
  if (canon.acceptPullRequests === false) throw new HTTPException(403, { message: "この Canon はほかのユーザーからの取り込み依頼を受け付けていません" });
  return canon;
}

async function canonToCanon(u: UserRecord, targetId: string, body: { sourceCanonId?: string }) {
  const target = await loadPrTarget(u, targetId);
  const source = await loadCanon(u, body.sourceCanonId ?? "", { write: true });
  if (source.canonId === target.canonId) throw bad("同じ Canon には送れません");
  if (source.headRevision === 0) throw new HTTPException(409, { message: "送る側の Canon がまだ空です" });
  const incoming = canonFromCanon(await loadCanonHead(source));
  const diff = diffCanon(await loadCanonHead(target), incoming);
  return { target, source, incoming, diff };
}

app.post("/canons/:id/pulls/preview", async (c) => {
  const u = c.get("user");
  const { diff } = await canonToCanon(u, c.req.param("id"), (await c.req.json().catch(() => ({}))) as { sourceCanonId?: string });
  return c.json({ diff });
});

app.post("/canons/:id/pulls", async (c) => {
  const u = c.get("user");
  const { target, source, incoming, diff } = await canonToCanon(u, c.req.param("id"), (await c.req.json().catch(() => ({}))) as { sourceCanonId?: string });
  const src = `canon:${source.canonId}`;
  const prNo = await nextPrNumber(target.canonId);
  await putCanonJson(canonPrKey(target.canonId, prNo, "incoming.json"), incoming);
  await putCanonJson(canonPrKey(target.canonId, prNo, "diff.json"), diff);
  for (const old of await listPullRequests(target.canonId)) {
    if (old.state === "open" && old.source === src) await closePullRequest(target.canonId, old.prNo, { state: "superseded", reason: `#${prNo}` });
  }
  const now = nowIso();
  const pr: CanonPullRequestRecord = {
    canonId: target.canonId,
    sk: canonPrSk(prNo),
    prNo,
    source: src,
    sourceName: source.name,
    sourceRevision: source.headRevision,
    baseRevision: diff.baseRevision,
    state: "open",
    summary: diff.summary,
    createdBy: u.userId,
    createdAt: now,
    updatedAt: now,
  };
  await putPullRequest(pr);
  await putOutgoing({ canonId: source.canonId, sk: canonOutSk(target.canonId, prNo), targetCanonId: target.canonId, prNo, createdAt: now });
  return c.json({ pr, diff }, 201);
});

/** Pull requests this Canon sent to other Canons, with their current state (read from the target). */
app.get("/canons/:id/outgoing", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  const items: (CanonPullRequestRecord & { targetName: string })[] = [];
  for (const o of await listOutgoing(canon.canonId)) {
    const target = await getCanon(o.targetCanonId);
    const pr = target && !isCanonDeleted(target) ? await getPullRequest(o.targetCanonId, o.prNo) : null;
    if (target && pr) items.push({ ...pr, targetName: target.name });
  }
  return c.json({ items });
});

app.get("/canons/:id/revisions/:rev", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  const rev = Number(c.req.param("rev"));
  if (!Number.isInteger(rev) || rev < 0 || rev > canon.headRevision) throw notFound();
  if (rev === 0) return c.json(emptyCanonSnapshot(canon.canonId, canon.createdAt));
  const snap = await getCanonJson<CanonSnapshot>(canonRevisionKey(canon.canonId, rev));
  if (!snap) throw notFound();
  return c.json(snap);
});

// ---------------------------------------------------------------------------
// Publishing and cloning. Public projects and Canons are listed in the Catalog table; every signed-in user may
// read them and clone public projects. Nothing here writes to another user's project or Canon.
// ---------------------------------------------------------------------------

const ownerKeyOf = (id: string) => parseProjectId(id)?.userKey ?? id.replace(/-c\d+$/, "");

function publicProjectSummary(p: ProjectRecord, cloneCount: number): PublicProjectSummary {
  return {
    projectId: p.projectId,
    name: projectDisplayName(p),
    roi: p.roi,
    tlf: p.tlf,
    contributor: p.contributor,
    ownerUserKey: ownerKeyOf(p.projectId),
    publishedAt: p.publishedAt ?? p.updatedAt,
    updatedAt: p.updatedAt,
    cloneCount,
  };
}

function publicCanonSummary(canon: CanonRecord): PublicCanonSummary {
  return {
    canonId: canon.canonId,
    name: canon.name,
    policy: canon.policy,
    headRevision: canon.headRevision,
    memberCount: canon.memberCount,
    ownerUserKey: ownerKeyOf(canon.canonId),
    publishedAt: canon.publishedAt ?? canon.updatedAt,
    updatedAt: canon.updatedAt,
    acceptPullRequests: canon.acceptPullRequests !== false,
  };
}

const isPublicProject = (p: ProjectRecord | null): p is ProjectRecord => !!p && p.visibility === "public" && !isProjectDeleted(p);

/** A public, not-deleted project by ID (through its Catalog row); 404 otherwise. */
async function loadPublicProject(projectId: string): Promise<ProjectRecord> {
  if (!isPublishableProjectId(projectId)) throw notFound();
  const row = await getCatalogItem("project", projectId);
  const p = row ? await getProject(row.ownerUserId, projectId) : null;
  if (!isPublicProject(p)) throw notFound();
  return p;
}

async function loadPublicCanon(canonId: string): Promise<CanonRecord> {
  if (!isCanonId(canonId)) throw notFound();
  const canon = await getCanon(canonId);
  if (!canon || isCanonDeleted(canon) || canon.visibility !== "public") throw notFound();
  return canon;
}

function readVisibility(v: unknown): Visibility {
  if (!VISIBILITIES.includes(v as Visibility)) throw bad("visibility は private か public です");
  return v as Visibility;
}

app.put("/projects/:id/visibility", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const visibility = readVisibility(((await c.req.json()) as { visibility?: unknown }).visibility);
  const now = nowIso();
  if (visibility === "public") {
    if (!isPublishableProjectId(p.projectId)) throw bad("旧形式の ID のプロジェクトは公開できません");
    if (!p.hasArtifacts) throw bad("成果物ができてから公開できます");
    const publishedAt = p.visibility === "public" && p.publishedAt ? p.publishedAt : now;
    await updateProject(u.userId, p.projectId, { visibility, publishedAt });
    const row: CatalogItem = { kind: "project", id: p.projectId, ownerUserId: u.userId, name: projectDisplayName(p), publishedAt, updatedAt: now };
    await putCatalogItem(row);
    return c.json({ visibility, publishedAt, cloneCount: await getCloneCount(p.projectId) });
  }
  await updateProject(u.userId, p.projectId, { visibility, publishedAt: null });
  await deleteCatalogItem("project", p.projectId);
  return c.json({ visibility, publishedAt: null, cloneCount: await getCloneCount(p.projectId) });
});

app.put("/canons/:id/visibility", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const body = (await c.req.json()) as { visibility?: unknown; acceptPullRequests?: unknown };
  const visibility = body.visibility === undefined ? canon.visibility : readVisibility(body.visibility);
  if (body.acceptPullRequests !== undefined && typeof body.acceptPullRequests !== "boolean") throw bad("acceptPullRequests は true か false です");
  const acceptPullRequests = body.acceptPullRequests === undefined ? canon.acceptPullRequests !== false : (body.acceptPullRequests as boolean);
  const now = nowIso();
  const publishedAt = visibility === "public" ? (canon.visibility === "public" && canon.publishedAt ? canon.publishedAt : now) : null;
  await updateCanon(canon.canonId, { visibility, acceptPullRequests, publishedAt });
  if (visibility === "public") await putCatalogItem({ kind: "canon", id: canon.canonId, ownerUserId: u.userId, name: canon.name, publishedAt: publishedAt!, updatedAt: now });
  else await deleteCatalogItem("canon", canon.canonId);
  return c.json({ ...canon, visibility, acceptPullRequests, publishedAt, updatedAt: now });
});

app.get("/public/projects", async (c) => {
  const q = c.req.query("q")?.toLowerCase();
  const out: PublicProjectSummary[] = [];
  for (const row of await listCatalog("project")) {
    const p = await getProject(row.ownerUserId, row.id);
    if (!isPublicProject(p)) continue;
    const s = publicProjectSummary(p, 0);
    if (q && ![s.name, s.projectId, s.roi, s.tlf, s.contributor].some((x) => (x ?? "").toLowerCase().includes(q))) continue;
    out.push(s);
  }
  out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  for (const s of out) s.cloneCount = await getCloneCount(s.projectId);
  return c.json({ items: out });
});

app.get("/public/projects/:id", async (c) => {
  const p = await loadPublicProject(c.req.param("id"));
  const files = (await listArtifacts(p.userId, p.projectId)).map((a) => a.key).filter((k) => isPublicReadableKey(k, p.projectId));
  const res: PublicProjectDetail = {
    ...publicProjectSummary(p, await getCloneCount(p.projectId)),
    revision: p.revision ?? 0,
    completedAt: p.completedAt,
    clonedFrom: p.clonedFrom ?? null,
    files,
  };
  return c.json(res);
});

app.get("/public/projects/:id/text", async (c) => {
  const p = await loadPublicProject(c.req.param("id"));
  const key = c.req.query("key") ?? "";
  if (!isPublicReadableKey(key, p.projectId)) throw bad("invalid key");
  const text = await getObjectText(p.userId, p.projectId, key);
  if (text === null) throw notFound();
  return c.text(text);
});

function cloneStepStates(s: ProjectRecord["stepStates"]): ProjectRecord["stepStates"] {
  const done = (v: string) => (v === "done" ? "done" : "pending");
  return { HCD: done(s.HCD), FRG: done(s.FRG), CSV: done(s.CSV), XLSX: "pending" };
}

const CONTENT_TYPES: Record<string, string> = { json: "application/json", jsonl: "application/x-ndjson", csv: "text/csv; charset=utf-8", md: "text/markdown; charset=utf-8" };

/** Copies a public project into a new private project of the caller. Reads the original only. */
app.post("/public/projects/:id/clone", async (c) => {
  const u = c.get("user");
  const src = await loadPublicProject(c.req.param("id"));
  const userKey = u.userKey ?? (await assignUserKey(u.userId));
  const projectId = formatProjectId(userKey, await nextProjectSeq(u.userId));
  let copied = 0;
  for (const a of await listArtifacts(src.userId, src.projectId)) {
    const target = cloneTargetKey(a.key, src.projectId, projectId);
    if (!target) continue;
    if (isCloneTextFile(a.key)) {
      const text = await getObjectText(src.userId, src.projectId, a.key);
      if (text === null) continue;
      const ext = a.key.split(".").pop()!.toLowerCase();
      await putObjectText(u.userId, projectId, target, rewriteProjectId(text, src.projectId, projectId), CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8");
    } else {
      const bytes = await getObjectBytes(src.userId, src.projectId, a.key);
      if (bytes === null) continue;
      await putObjectBytes(u.userId, projectId, target, bytes, "application/octet-stream");
    }
    copied++;
  }
  const now = nowIso();
  const project: ProjectRecord = {
    userId: u.userId,
    projectId,
    name: cloneName(projectDisplayName(src)),
    nameSource: "user",
    revision: 0,
    roi: src.roi,
    tlf: src.tlf,
    contributor: src.contributor,
    model: u.defaultModel || env.codexModel || DEFAULT_CODEX_MODEL,
    reasoningEffort: u.defaultReasoningEffort ?? null,
    // the copied workspace was built with (or without) the research step, so follow-ups keep the original's setting
    ...(src.researchMode !== undefined ? { researchMode: src.researchMode } : {}),
    status: "COMPLETED",
    currentStep: "CSV",
    // copied steps are done or pending, never running (the original may be mid-run or failed); the BRA xlsx carries
    // the original Project ID and is not copied, so a follow-up rebuilds it
    stepStates: cloneStepStates(src.stepStates),
    activeJobId: null,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: true,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    clonedFrom: { projectId: src.projectId, revision: src.revision ?? 0, ownerUserKey: ownerKeyOf(src.projectId), name: projectDisplayName(src), clonedAt: now },
  };
  await putProject(project, true);
  await incrementCloneCount(src.projectId);
  const res: CloneProjectResponse = { projectId, copied };
  return c.json(res, 201);
});

app.get("/public/canons", async (c) => {
  const out: PublicCanonSummary[] = [];
  for (const row of await listCatalog("canon")) {
    const canon = await getCanon(row.id);
    if (!canon || isCanonDeleted(canon) || canon.visibility !== "public") continue;
    out.push(publicCanonSummary(canon));
  }
  out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return c.json({ items: out });
});

app.get("/public/canons/:id", async (c) => {
  const canon = await loadPublicCanon(c.req.param("id"));
  const publicMembers: PublicCanonDetail["publicMembers"] = [];
  for (const m of await listCanonMembers(canon.canonId)) {
    const p = await getProject(canon.ownerUserId, m.projectId);
    if (isPublicProject(p) && p.canonId === canon.canonId) publicMembers.push({ projectId: p.projectId, name: projectDisplayName(p), roi: p.roi, tlf: p.tlf });
  }
  const res: PublicCanonDetail = { ...publicCanonSummary(canon), description: canon.description, publicMembers };
  return c.json(res);
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
  return c.json({ items: await correctProjects(items) });
});

app.post("/admin/projects/:userId/:id/cancel", async (c) => {
  requireAdmin(c.get("user"));
  const p = await getProject(c.req.param("userId"), c.req.param("id"));
  if (!p) throw notFound();
  const job = p.activeJobId ? await getJob(p.projectId, p.activeJobId) : null;
  if (job) {
    await updateJob(p.projectId, job.jobId, { status: "CANCELLED", endedAt: nowIso() });
    if (job.ecsTaskArn) await stopEcsTask(job.ecsTaskArn, "cancelled by admin");
    await putMessage(p.projectId, job.jobId, "system", "status", "Job stopped by an admin.", { userId: p.userId, meta: { i18n: "sys.adminStopped" } });
  }
  await updateProject(p.userId, p.projectId, afterStop(p, job));
  return c.json({ ok: true });
});

app.get("/config", (c) => c.json({ maxConcurrentJobs: env.maxConcurrentJobs, maxConcurrentJobsPerUser: env.maxConcurrentJobsPerUser, codexModel: env.codexModel || null }));
