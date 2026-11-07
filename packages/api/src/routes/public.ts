/** Publishing: visibility of projects and Canons, the public listings and cloning (`/public…`). */
import { Hono } from "hono";
import type {
  CanonRecord,
  CatalogItem,
  CloneProjectResponse,
  ProjectRecord,
  PublicCanonDetail,
  PublicCanonSummary,
  PublicProjectDetail,
  PublicProjectSummary,
  Visibility,
} from "@cobrac/shared";
import {
  isProjectDeleted,
  VISIBILITIES,
  cloneName,
  cloneTargetKey,
  isCanonDeleted,
  isCloneTextFile,
  isPublicReadableKey,
  isPublishableProjectId,
  parseProjectId,
  USER_SEQ_CANON_ID_REGEX,
  rewriteProjectId,
  isCanonId,
  nowIso,
  projectDisplayName,
} from "@cobrac/shared";
import { bad, notFound } from "../lib/http.js";
import { deploymentDefaultModel, implicitModel } from "../lib/runs.js";
import { getCatalogItem, getCloneCount, incrementCloneCount, listCatalog, putCatalogItem, deleteCatalogItem, reserveNewId } from "../lib/catalog.js";
import {
  getObjectBytes,
  getObjectText,
  listArtifacts,
  putObjectBytes,
  putObjectText,
} from "../lib/aws.js";
import {
  getProject,
  getUser,
  putProject,
  updateProject,
} from "../lib/db.js";
import { modelPolicy } from "../lib/orgKey.js";
import { getCanon, listCanonMembers, updateCanon } from "../lib/canons.js";
import { loadCanon } from "./canons.js";
import { loadOwnProject } from "./projects.js";
import type { ApiEnv } from "./env.js";

export const publicApi = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Publishing and cloning. Public projects and Canons are listed in the Catalog table; every signed-in user may
// read them and clone public projects. Nothing here writes to another user's project or Canon.
// ---------------------------------------------------------------------------

/** The owner's pseudonymous userKey: the prefix of a `<userKey>-…` ID, otherwise from the owner's Users record. */
async function ownerKeyOf(id: string, ownerUserId: string): Promise<string> {
  const fromId = parseProjectId(id)?.userKey ?? (USER_SEQ_CANON_ID_REGEX.test(id) ? id.replace(/-c\d+$/, "") : null);
  return fromId ?? (await getUser(ownerUserId))?.userKey ?? "";
}

async function publicProjectSummary(p: ProjectRecord, cloneCount: number): Promise<PublicProjectSummary> {
  return {
    projectId: p.projectId,
    name: projectDisplayName(p),
    roi: p.roi,
    tlf: p.tlf,
    contributor: p.contributor,
    ownerUserKey: await ownerKeyOf(p.projectId, p.userId),
    publishedAt: p.publishedAt ?? p.updatedAt,
    updatedAt: p.updatedAt,
    cloneCount,
  };
}

async function publicCanonSummary(canon: CanonRecord): Promise<PublicCanonSummary> {
  return {
    canonId: canon.canonId,
    name: canon.name,
    policy: canon.policy,
    headRevision: canon.headRevision,
    memberCount: canon.memberCount,
    ownerUserKey: await ownerKeyOf(canon.canonId, canon.ownerUserId),
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

publicApi.put("/projects/:id/visibility", async (c) => {
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

publicApi.put("/canons/:id/visibility", async (c) => {
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

publicApi.get("/public/projects", async (c) => {
  const q = c.req.query("q")?.toLowerCase();
  const out: PublicProjectSummary[] = [];
  for (const row of await listCatalog("project")) {
    const p = await getProject(row.ownerUserId, row.id);
    if (!isPublicProject(p)) continue;
    const s = await publicProjectSummary(p, 0);
    if (q && ![s.name, s.projectId, s.roi, s.tlf, s.contributor].some((x) => (x ?? "").toLowerCase().includes(q))) continue;
    out.push(s);
  }
  out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  for (const s of out) s.cloneCount = await getCloneCount(s.projectId);
  return c.json({ items: out });
});

publicApi.get("/public/projects/:id", async (c) => {
  const p = await loadPublicProject(c.req.param("id"));
  const files = (await listArtifacts(p.userId, p.projectId)).map((a) => a.key).filter((k) => isPublicReadableKey(k, p.projectId));
  const res: PublicProjectDetail = {
    ...(await publicProjectSummary(p, await getCloneCount(p.projectId))),
    revision: p.revision ?? 0,
    completedAt: p.completedAt,
    clonedFrom: p.clonedFrom ?? null,
    files,
  };
  return c.json(res);
});

publicApi.get("/public/projects/:id/text", async (c) => {
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
publicApi.post("/public/projects/:id/clone", async (c) => {
  const u = c.get("user");
  const src = await loadPublicProject(c.req.param("id"));
  const { policy } = await modelPolicy(u);
  const projectId = await reserveNewId("project", u.userId);
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
    model: implicitModel(policy, u.defaultModel || deploymentDefaultModel()),
    reasoningEffort: u.defaultReasoningEffort ?? null,
    // the copied workspace was built with (or without) the research step, so follow-ups keep the original's setting
    ...(src.researchMode !== undefined ? { researchMode: src.researchMode } : {}),
    // the copy keeps the original's UCs, so it keeps the original's SABRA boundary too
    ...(src.sabraBoundary ? { sabraBoundary: src.sabraBoundary } : {}),
    ...(src.harnessRules ? { harnessRules: src.harnessRules } : {}),
    // the copy keeps the original's hypotheses, so it keeps the evidence mode, scopes and share limit that allowed them
    ...(src.evidenceMode ? { evidenceMode: src.evidenceMode } : {}),
    ...(src.hypothesisScopes ? { hypothesisScopes: src.hypothesisScopes } : {}),
    ...(src.hypothesisMaxShare !== undefined ? { hypothesisMaxShare: src.hypothesisMaxShare } : {}),
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
    clonedFrom: { projectId: src.projectId, revision: src.revision ?? 0, ownerUserKey: await ownerKeyOf(src.projectId, src.userId), name: projectDisplayName(src), clonedAt: now },
  };
  await putProject(project, true);
  await incrementCloneCount(src.projectId);
  const res: CloneProjectResponse = { projectId, copied };
  return c.json(res, 201);
});

publicApi.get("/public/canons", async (c) => {
  const out: PublicCanonSummary[] = [];
  for (const row of await listCatalog("canon")) {
    const canon = await getCanon(row.id);
    if (!canon || isCanonDeleted(canon) || canon.visibility !== "public") continue;
    out.push(await publicCanonSummary(canon));
  }
  out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return c.json({ items: out });
});

publicApi.get("/public/canons/:id", async (c) => {
  const canon = await loadPublicCanon(c.req.param("id"));
  const publicMembers: PublicCanonDetail["publicMembers"] = [];
  for (const m of await listCanonMembers(canon.canonId)) {
    const p = await getProject(canon.ownerUserId, m.projectId);
    if (isPublicProject(p) && p.canonId === canon.canonId) publicMembers.push({ projectId: p.projectId, name: projectDisplayName(p), roi: p.roi, tlf: p.tlf });
  }
  const res: PublicCanonDetail = { ...(await publicCanonSummary(canon)), description: canon.description, publicMembers };
  return c.json(res);
});
