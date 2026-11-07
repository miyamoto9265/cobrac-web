/** Project routes: create, list, read, run, artifacts, BRA data versions, BRA-DB registration, articles and graph layouts (`/projects…`, `/uploads`). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  AnswerRequest,
  BraVersionDetailResponse,
  BradbPackageManifest,
  BradbRegisterResponse,
  BradbStatusResponse,
  ProjectBradbResponse,
  RegisterBradbRequest,
  BraVersionDiffResponse,
  BraVersionListItem,
  BraVersionManifest,
  CsvFileName,
  ListBraVersionsResponse,
  ArticleJobState,
  ArticleMeta,
  CreateArticleRequest,
  CreateProjectRequest,
  CreateUploadRequest,
  CreateUploadResponse,
  DeleteProjectResponse,
  FollowupRequest,
  JobRecord,
  ProjectRecord,
  EdgeStyle,
  GraphLayout,
  ListArticlesResponse,
  NodeStyle,
  ReasoningEffort,
  RetryRequest,
  UpdateProjectRequest,
  UpdateProjectResponse,
  ArchiveRequest,
  UserRecord,
} from "@cobrac/shared";
import {
  ARROW_HEADS,
  ATTACHMENT_LIMITS,
  UPLOAD_ID_REGEX,
  attachmentDisplayName,
  attachmentTypeOf,
  normalizeAttachmentUrl,
  safeAttachmentName,
  stagingKey,
  canDeleteProject,
  isProjectDeleted,
  EDGE_LINE_TYPES,
  policyAllows,
  ARTICLE_FIGURE_KEY_RE,
  articleDownloadFileName,
  articleLocaleOfKey,
  articleMetaKey,
  BIBLIOGRAPHY_FILE,
  CSV_FILE_NAMES,
  HCD_FILES,
  PROJECT_FILES,
  braDownloadFileName,
  buildTemplateXlsx,
  isOfferedModel,
  isArticleStale,
  isProjectIdLike,
  isUiLocale,
  newId,
  normalizeProjectName,
  nowIso,
  projectDisplayName,
  projectNameKey,
  proposeProjectName,
  templateDownloadFileName,
  templateInputFromFiles,
  templateXlsxKey,
  REVISIONS_PREFIX,
  isThreadKey,
  bradbBlockReason,
  bradbPackagePrefix,
  csvPath,
  diffBraCsvs,
  summarizeManifest,
  versionFileKey,
  versionManifestKey,
} from "@cobrac/shared";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { bad, notFound } from "../lib/http.js";
import { readHypothesisRequest, requireBradbRegistrable } from "../lib/hypothesisSettings.js";
import {
  answerQuestion,
  createProject,
  deploymentDefaultModel,
  legacyDefaultModel,
  implicitModel,
  isEffort,
  moveToAllowedModel,
  normModel,
  queueFollowup,
  queueRetry,
  readLocale,
  requireModel,
  jobKeySource,
  requireRunKey,
  stopProject,
  type StagedAttachment,
} from "../lib/runs.js";
import { getCloneCount, deleteCatalogItem } from "../lib/catalog.js";
import {
  deleteObject,
  enqueueRun,
  getObjectText,
  headStaging,
  listArtifacts,
  invokeBradb,
  listVersionNumbers,
  presignDownload,
  presignUpload,
  putObjectBytes,
  putObjectText,
} from "../lib/aws.js";
import { loadBraTemplate } from "../lib/braTemplate.js";
import {
  findProjectByLegacyId,
  getJob,
  getProject,
  listJobsForProject,
  listMessages,
  listProjects,
  listUserProjects,
  markProjectDeleted,
  putJob,
  putMessage,
  updateProject,
} from "../lib/db.js";
import { correctJobs, correctProject, correctProjects, correctUsageMessages, legacyCorrections } from "../lib/usageCorrection.js";
import { ownedMessages } from "../lib/ownership.js";
import { liveVersionFiles, liveVersionItem, versionItem } from "../lib/versions.js";
import { removeCanonMember } from "../lib/canons.js";
import { applyProjectCanon, resolveProjectCanon } from "./canons.js";
import type { ApiEnv } from "./env.js";

export const projectsApi = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

projectsApi.get("/projects", async (c) => {
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
projectsApi.post("/uploads", async (c) => {
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
async function stagedAttachments(userId: string, list: CreateProjectRequest["attachments"]): Promise<StagedAttachment[]> {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw bad("attachments が不正です");
  if (list.length > ATTACHMENT_LIMITS.maxFiles) throw bad(`添付ファイルは ${ATTACHMENT_LIMITS.maxFiles} 個までです`);
  const out: StagedAttachment[] = [];
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

projectsApi.post("/projects", async (c) => {
  const u = c.get("user");
  const policy = await requireRunKey(u);
  const body = (await c.req.json()) as CreateProjectRequest;
  const roi = (body.roi ?? "").trim();
  const tlf = (body.tlf ?? "").trim();
  if (!roi && !tlf) throw bad("ROI と TLF のどちらか一方は必須です");
  const canonPlan = await resolveProjectCanon(u, body.canon);
  // provisional until the agent names the project from meta.json; the user can rename it afterwards
  const name = proposeProjectName(roi, tlf);
  const contributor = u.contributorName?.trim() || u.displayName;
  // Always persist a concrete model so usage can be priced (project → user default → env → DEFAULT_CODEX_MODEL)
  const chosen = "model" in body ? normModel(body.model) : null;
  if (chosen) requireModel(policy, chosen);
  const model = chosen || implicitModel(policy, u.defaultModel || deploymentDefaultModel());
  let reasoningEffort: ReasoningEffort | null = u.defaultReasoningEffort ?? null;
  if ("reasoningEffort" in body) {
    if (body.reasoningEffort !== null && body.reasoningEffort !== undefined && !isEffort(body.reasoningEffort)) throw bad("reasoning effort が不正です");
    reasoningEffort = body.reasoningEffort ?? null;
  }
  if (body.researchMode !== undefined && typeof body.researchMode !== "boolean") throw bad("researchMode は true / false で指定してください");
  const researchMode = body.researchMode ?? true;
  const hypothesis = readHypothesisRequest(body.hypothesis, { withTarget: false });
  const locale = readLocale(body.locale);
  const urls = attachmentUrls(body.urls);
  const staged = await stagedAttachments(u.userId, body.attachments);

  const project = await createProject(u, {
    roi,
    tlf,
    name,
    contributor,
    model,
    reasoningEffort,
    researchMode,
    ...(hypothesis ? { hypothesis } : {}),
    locale,
    keySource: jobKeySource(policy, model),
    staged,
    urls,
    // before the job is queued, so the worker's first run already follows the Canon
    beforeQueue: canonPlan
      ? async (project) => {
          const canonId = await applyProjectCanon(u, project, canonPlan);
          const joined = await getProject(u.userId, project.projectId);
          if (joined) Object.assign(project, { canonId, canonRevision: joined.canonRevision });
        }
      : undefined,
  });
  return c.json(project, 201);
});

/** Current Project ID for a URL segment: the ID itself, or the new ID of a migrated legacy ID. */
projectsApi.get("/projects/resolve/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isProjectIdLike(id)) throw notFound();
  const direct = await getProject(u.userId, id);
  const p = direct && !isProjectDeleted(direct) ? direct : await findProjectByLegacyId(u.userId, id);
  if (!p) throw notFound();
  return c.json({ projectId: p.projectId });
});

/** The caller's own, not-deleted project; anything else is 404 so other users' and deleted IDs look the same. */
export async function loadOwnProject(u: UserRecord, projectId: string): Promise<ProjectRecord> {
  const p = await getProject(u.userId, projectId);
  if (!p || isProjectDeleted(p)) throw notFound();
  return p;
}

projectsApi.get("/projects/:id", async (c) => {
  const u = c.get("user");
  const stored = await loadOwnProject(u, c.req.param("id"));
  const recorded = await listJobsForProject(stored.projectId, u.userId);
  const [p, jobs] = await Promise.all([correctProject(stored, recorded), correctJobs(stored.projectId, recorded)]);
  const cloneCount = p.visibility === "public" || p.publishedAt ? await getCloneCount(p.projectId) : 0;
  return c.json({ ...p, cloneCount, jobs: jobs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) });
});

projectsApi.put("/projects/:id", async (c) => {
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

/** `{ archived }` of PUT /projects/:id/archive and PUT /plans/:id/archive */
export async function archiveBody(c: { req: { json: () => Promise<unknown> } }): Promise<boolean> {
  const body = (await c.req.json().catch(() => ({}))) as Partial<ArchiveRequest>;
  if (typeof body.archived !== "boolean") throw bad("archived is required");
  return body.archived;
}

/** Archive / restore (owner only): only hides the project from the sidebar history; nothing stops or changes. */
projectsApi.put("/projects/:id/archive", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const archivedAt = (await archiveBody(c)) ? (p.archivedAt ?? nowIso()) : null;
  await updateProject(u.userId, p.projectId, { archivedAt });
  return c.json({ projectId: p.projectId, archivedAt });
});

/** Soft delete (owner only). Nothing is removed from DynamoDB or S3; running projects must be stopped first. */
projectsApi.delete("/projects/:id", async (c) => {
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

projectsApi.get("/projects/:id/messages", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const [r, jobs] = await Promise.all([
    listMessages(p.projectId, Number(c.req.query("limit") ?? 500), c.req.query("cursor")),
    listJobsForProject(p.projectId, u.userId),
  ]);
  const items = ownedMessages(r.items, u.userId, new Set(jobs.map((j) => j.jobId)));
  return c.json({ ...r, items: correctUsageMessages(items, await legacyCorrections(p.projectId, jobs)) });
});

projectsApi.post("/projects/:id/cancel", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING"].includes(p.status)) throw bad("このプロジェクトは実行中ではありません");
  await stopProject(p, "user");
  return c.json({ ok: true });
});

projectsApi.post("/projects/:id/answer", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "WAITING_USER_INPUT" || !p.activeJobId) throw bad("回答待ちの質問はありません");
  const policy = await requireRunKey(u);
  const body = (await c.req.json()) as AnswerRequest;
  const text = (body.answer ?? "").trim();
  if (!text) throw bad("回答を入力してください");
  const locale = readLocale(body.locale);
  const job = await getJob(p.projectId, p.activeJobId);
  if (!job) throw notFound();
  if (!(await answerQuestion(u, p, policy, text, { source: "user", locale }))) throw bad("回答待ちの質問はありません");
  return c.json({ ok: true });
});

projectsApi.post("/projects/:id/followup", async (c) => {
  const u = c.get("user");
  const policy = await requireRunKey(u);
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "COMPLETED") throw bad("フォローアップは完了済みのプロジェクトにのみ送信できます");
  const body = (await c.req.json()) as FollowupRequest;
  const text = (body.instruction ?? "").trim();
  if (!text) throw bad("指示を入力してください");
  // a scope only from the explicit request part, never from the instruction text
  const hypothesis = readHypothesisRequest(body.hypothesis, { withTarget: true });
  const moved = await moveToAllowedModel(u, p, policy);
  const locale = readLocale(body.locale);
  const jobId = await queueFollowup(u, p, policy, { instruction: text, locale, moved, hypothesis });
  return c.json({ ok: true, jobId });
});

projectsApi.post("/projects/:id/retry", async (c) => {
  const u = c.get("user");
  const policy = await requireRunKey(u);
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!["FAILED", "CANCELLED"].includes(p.status)) throw bad("リトライは失敗またはキャンセルされたプロジェクトにのみ実行できます");
  const moved = await moveToAllowedModel(u, p, policy);
  const body = (await c.req.json().catch(() => ({}))) as RetryRequest;
  const locale = readLocale(body?.locale);
  const jobId = await queueRetry(u, p, policy, { locale, moved });
  return c.json({ ok: true, jobId });
});

// --- artifacts ----------------------------------------------------------------

projectsApi.get("/projects/:id/artifacts", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  return c.json({ items: await listArtifacts(u.userId, p.projectId) });
});

projectsApi.get("/projects/:id/artifacts/download", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const key = c.req.query("key");
  if (!key) throw bad("key is required");
  // frozen versions are shown and compared, not downloaded
  if (key.startsWith(REVISIONS_PREFIX)) throw notFound();
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
 * The BRA data in the official Template-v2-3.bra workbook. The worker writes it at the end of every job; projects
 * finished before that (or whose file is older than the CoBRAC xlsx) get it built here from the workspace files.
 */
projectsApi.get("/projects/:id/artifacts/template-xlsx", async (c) => {
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

projectsApi.get("/projects/:id/artifacts/text", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const key = c.req.query("key");
  if (!key || key.includes("..") || isThreadKey(key)) throw bad("invalid key");
  if (!/\.(md|csv|txt|json)$/i.test(key) && !ARTICLE_FIGURE_KEY_RE.test(key)) throw bad("text files only");
  const text = await getObjectText(u.userId, p.projectId, key);
  if (text === null) throw notFound();
  return c.text(text);
});

// --- BRA data versions ----------------------------------------------------------
// Frozen by the worker under revisions/{n}/ (see shared braVersion.ts); read-only here.

async function getVersionManifest(p: ProjectRecord, n: number): Promise<BraVersionManifest | null> {
  const text = await getObjectText(p.userId, p.projectId, versionManifestKey(n));
  if (!text) return null;
  try {
    return JSON.parse(text) as BraVersionManifest;
  } catch {
    return null;
  }
}

/** Every version of the project, newest first: summaries on the jobs, manifests in S3 without one, and the live data. */
async function listVersions(p: ProjectRecord): Promise<BraVersionListItem[]> {
  const jobs = await listJobsForProject(p.projectId, p.userId);
  const byVersion = new Map<number, BraVersionListItem>();
  for (const j of jobs) if (j.braVersion) byVersion.set(j.braVersion.version, versionItem(j.braVersion, j));
  for (const n of await listVersionNumbers(p.userId, p.projectId)) {
    if (byVersion.has(n)) continue;
    const m = await getVersionManifest(p, n);
    if (m) byVersion.set(n, versionItem(summarizeManifest(m), jobs.find((j) => j.jobId === m.job?.jobId) ?? null, m));
  }
  const current = p.revision ?? 0;
  if (current >= 1 && p.hasArtifacts && !byVersion.has(current)) byVersion.set(current, liveVersionItem(p, jobs));
  return [...byVersion.values()].sort((a, b) => b.version - a.version);
}

async function loadVersion(p: ProjectRecord, raw: string): Promise<{ item: BraVersionListItem; manifest: BraVersionManifest | null; items: BraVersionListItem[] }> {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw notFound();
  const items = await listVersions(p);
  const item = items.find((i) => i.version === n);
  if (!item) throw notFound();
  const manifest = item.frozen ? await getVersionManifest(p, n) : null;
  if (item.frozen && !manifest) throw notFound();
  return { item, manifest, items };
}

async function versionCsvs(p: ProjectRecord, item: BraVersionListItem): Promise<Record<CsvFileName, string | null>> {
  const out = {} as Record<CsvFileName, string | null>;
  for (const f of CSV_FILE_NAMES) {
    const path = csvPath(p.projectId, f);
    out[f] = await getObjectText(p.userId, p.projectId, item.frozen ? versionFileKey(item.version, path) : path);
  }
  return out;
}

projectsApi.get("/projects/:id/versions", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const items = await listVersions(p);
  const src = p.clonedFrom;
  const res: ListBraVersionsResponse = { items, current: p.revision ?? 0, clonedFrom: src && src.revision >= 1 ? `${src.projectId}@v${src.revision}` : null };
  return c.json(res);
});

projectsApi.get("/projects/:id/versions/:n", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const { item, manifest } = await loadVersion(p, c.req.param("n"));
  const files = manifest ? manifest.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })) : liveVersionFiles(p.projectId, await listArtifacts(u.userId, p.projectId));
  const blocked = manifest ? bradbBlockReason(manifest.generator) : null;
  const res: BraVersionDetailResponse = { item, manifest, files, ...(blocked ? { bradbBlockedReason: blocked } : {}) };
  return c.json(res);
});

/** Row-level changes of the five CSVs against `?base=` (default: the version before). */
projectsApi.get("/projects/:id/versions/:n/diff", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const { item, items } = await loadVersion(p, c.req.param("n"));
  const rawBase = c.req.query("base");
  const base = rawBase ? items.find((i) => i.version === Number(rawBase)) : items.find((i) => i.version === item.version - 1);
  if (rawBase && !base) throw bad("base is not a version of this project");
  const res: BraVersionDiffResponse = { head: item.version, base: base?.version ?? null, diff: base ? diffBraCsvs(await versionCsvs(p, base), await versionCsvs(p, item)) : null };
  return c.json(res);
});

// --- BRA-DB registration ---------------------------------------------------------
// A frozen version's package (revisions/{n}/bradb/) goes to the registration Lambda in the BRA-DB VPC (BraDb stack).

const bradbOff = () => new HTTPException(404, { message: "この環境には BRA-DB がありません" });

projectsApi.get("/projects/:id/bradb", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!env.bradbImportFunction) return c.json({ enabled: false } satisfies ProjectBradbResponse);
  const status = await invokeBradb<BradbStatusResponse>({ action: "status", projectId: p.projectId });
  return c.json({ enabled: true, ...status } satisfies ProjectBradbResponse);
});

/** Registers version n (owner). `rejected` comes back with a code: `shrink` asks to resend with `allowShrink`. */
projectsApi.post("/projects/:id/versions/:n/bradb", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  if (!env.bradbImportFunction) throw bradbOff();
  const { item, manifest } = await loadVersion(p, c.req.param("n"));
  if (!manifest?.bradb) throw bad("この版には BRA-DB 登録パッケージがありません（保存済みで 5 つの CSV がそろった版だけを登録できます）");
  // hypothesis mode: no registration of versions with hypotheses until a separate specification decides how
  requireBradbRegistrable(manifest.generator);
  const body = (await c.req.json().catch(() => ({}))) as RegisterBradbRequest;
  const prefix = bradbPackagePrefix(item.version);
  const pkgText = await getObjectText(u.userId, p.projectId, `${prefix}manifest.json`);
  if (!pkgText) throw notFound();
  const pkg = JSON.parse(pkgText) as BradbPackageManifest;
  const files: Record<string, string> = {};
  for (const f of pkg.files) {
    const text = await getObjectText(u.userId, p.projectId, prefix + f.name);
    if (text === null) throw notFound();
    files[f.name] = text;
  }
  const r = await invokeBradb<BradbRegisterResponse>({
    action: "register",
    manifest: pkg,
    files,
    project: { roi: p.roi, tlf: p.tlf },
    allowShrink: body.allowShrink === true,
    requestedBy: u.contributorName || u.displayName || u.userId,
  });
  if (r.registration.status === "registered") {
    await updateProject(u.userId, p.projectId, {
      bradb: { versionId: r.registration.versionId, version: r.registration.version, contentSha256: r.registration.contentSha256, registeredAt: r.registration.registeredAt, registrationId: r.registration.registrationId },
    });
  }
  return c.json(r);
});

// --- explanatory articles -----------------------------------------------------
// Written on request from finished BRA data, one per language: article/<locale>.md + article/<locale>.json (ArticleMeta).

projectsApi.post("/projects/:id/articles", async (c) => {
  const u = c.get("user");
  const policy = await requireRunKey(u);
  const p = await loadOwnProject(u, c.req.param("id"));
  if (p.status !== "COMPLETED" || p.stepStates?.XLSX !== "done") throw bad("解説記事は BRA データの完成後に作成できます");
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateArticleRequest> & { model?: unknown };
  if (!isUiLocale(body.locale)) throw bad("locale が不正です");
  const locale = body.locale;
  // a model chosen for the article itself, else the project's (or the tier's default when the project's is outside it)
  const chosen = normModel(body.model);
  if (chosen && !isOfferedModel(chosen)) throw bad("このモデルは解説記事に使えません");
  if (chosen) requireModel(policy, chosen);
  const projectModel = p.model || legacyDefaultModel();
  const model = chosen || (policyAllows(policy, projectModel) ? null : implicitModel(policy, projectModel));
  const now = nowIso();
  const jobId = newId("job_");
  const job: JobRecord = {
    projectId: p.projectId,
    jobId,
    userId: u.userId,
    type: "article",
    status: "QUEUED",
    keySource: jobKeySource(policy, model ?? projectModel),
    instruction: null,
    pendingAnswer: null,
    articleLocale: locale,
    model,
    reasoningEffort: null,
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

projectsApi.get("/projects/:id/articles", async (c) => {
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

projectsApi.get("/projects/:id/graph/:kind", async (c) => {
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

projectsApi.get("/projects/:id/graph/:kind/layout", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const kind = graphKind(c.req.param("kind"));
  const text = await getObjectText(u.userId, p.projectId, `graph/${kind}.layout.json`);
  if (text === null) return c.json({ positions: {}, updatedAt: null } satisfies GraphLayout);
  return c.body(text, 200, { "Content-Type": "application/json" });
});

projectsApi.put("/projects/:id/graph/:kind/layout", async (c) => {
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

projectsApi.delete("/projects/:id/graph/:kind/layout", async (c) => {
  const u = c.get("user");
  const p = await loadOwnProject(u, c.req.param("id"));
  const kind = graphKind(c.req.param("kind"));
  await deleteObject(u.userId, p.projectId, `graph/${kind}.layout.json`);
  return c.json({ ok: true });
});
