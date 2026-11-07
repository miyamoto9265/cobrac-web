/** Canon routes: Canons, editors, members, revisions, pushes, pull requests, problems and following (`/canons…`, `/projects/:id/canon…`). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  ApproveManyRequest,
  ApproveManyResponse,
  CanonDetailResponse,
  CanonMemberSummary,
  CanonChoice,
  CanonIssue,
  CanonIssueResolution,
  CanonDiff,
  CanonIncoming,
  CanonAiReviewResult,
  CanonPullDetailResponse,
  CanonPullRequestRecord,
  CanonRecord,
  CanonSeedCandidate,
  CanonSnapshot,
  CreateProjectCanon,
  CreateCanonRequest,
  ProjectRecord,
  UpdateCanonRequest,
  UserRecord,
} from "@cobrac/shared";
import {
  CANON_META_SK,
  isProjectDeleted,
  isOfferedModel,
  canonAiReviewKey,
  canonEditorSk,
  type CanonEditorRecord,
  type CanonEditorSummary,
  type CanonRole,
  parseReviewItemId,
  reviewItemId,
  CANON_PR_NOTE_MAX,
  canonAlignInstruction,
  canonFollowStatus,
  canonFromCanon,
  composeSeeds,
  canonOutSk,
  CANON_ISSUE_RESOLUTIONS,
  issuesTouchedByDiff,
  readCanonIssueInput,
  upstreamCanonIds,
  upstreamIssues,
  canonPrKey,
  canonPrSk,
  canonRevisionKey,
  canonRevisionSk,
  diffCanon,
  emptyCanonSnapshot,
  isCanonDeleted,
  isCanonId,
  isProjectIdLike,
  isUiLocale,
  normalizeCanonText,
  nowIso,
  projectDisplayName,
} from "@cobrac/shared";
import { bad, notFound } from "../lib/http.js";
import { deleteFinishedPlansOfCanon } from "../lib/planOps.js";
import {
  deploymentDefaultModel,
  implicitModel,
  normModel,
  readLocale,
  requireModel,
  requireRunKey,
} from "../lib/runs.js";
import { deleteCatalogItem, reserveNewId } from "../lib/catalog.js";
import { getCanonJson, putCanonJson } from "../lib/aws.js";
import {
  alignAffectedProjects,
  approvePullRequest,
  canonFields,
  createCanon,
  loadCanonHead,
  loadCanonRevision,
  openProjectPr,
  pinProject,
  prReviewMaterial,
  projectIncoming,
  pushProject,
  raiseIssue,
  rejectPullRequest,
  requestAiReview,
  requestPrChanges,
  settleIssue,
} from "../lib/canonOps.js";
import {
  getProject,
  getUser,
  listJobsForCanon,
  findUserByEmail,
  updateUser,
} from "../lib/db.js";
import { actorName, aiState, prTrail, reviewJobsOf } from "../lib/canonReview.js";
import {
  addCanonMember,
  advanceCanonHead,
  closePullRequest,
  getCanon,
  getPullRequest,
  listOutgoing,
  listPullRequests,
  listPrEvents,
  putPrEvent,
  deleteCanonEditor,
  getCanonEditor,
  listCanonEditors,
  putCanonEditor,
  putOutgoing,
  nextPrNumber,
  putCanonRevision,
  putPullRequest,
  listCanonMembers,
  listCanonRevisions,
  listOwnCanons,
  markCanonDeleted,
  putCanon,
  removeCanonMember,
  updateCanon,
} from "../lib/canons.js";
import { loadOwnProject } from "./projects.js";
import type { ApiEnv } from "./env.js";

export const canonsApi = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Canons (a set of the owner's projects whose circuit definitions must agree)
// ---------------------------------------------------------------------------

async function canonRoleOf(u: UserRecord, canon: CanonRecord): Promise<CanonRole | null> {
  if (canon.ownerUserId === u.userId) return "owner";
  if (await getCanonEditor(canon.canonId, u.userId)) return "editor";
  return u.role === "admin" ? "admin" : null;
}

/**
 * A not-deleted Canon the caller may use; anything else is 404. `write`: the owner only (settings, members,
 * co-editors, visibility, deletion). `review`: the owner or a co-editor (decide, comment, AI review). Otherwise
 * the owner, a co-editor or an admin may read it.
 */
export async function loadCanon(u: UserRecord, canonId: string, opts: { write?: boolean; review?: boolean } = {}): Promise<CanonRecord> {
  if (!isCanonId(canonId)) throw notFound();
  const canon = await getCanon(canonId);
  if (!canon || isCanonDeleted(canon)) throw notFound();
  if (canon.ownerUserId === u.userId) return canon;
  if (opts.write) throw notFound();
  const role = await canonRoleOf(u, canon);
  if (!role || (opts.review && role !== "editor")) throw notFound();
  return canon;
}

canonsApi.get("/canons", async (c) => {
  const u = c.get("user");
  const items = (await listOwnCanons(u.userId)).filter((x) => !isCanonDeleted(x)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const shared: (CanonRecord & { ownerName: string })[] = [];
  for (const id of u.editorCanons ?? []) {
    const canon = isCanonId(id) ? await getCanon(id) : null;
    if (!canon || isCanonDeleted(canon) || !(await getCanonEditor(id, u.userId))) continue;
    shared.push({ ...canon, ownerName: actorName(await getUser(canon.ownerUserId)) });
  }
  return c.json({ items, shared });
});

canonsApi.post("/canons", async (c) => {
  const u = c.get("user");
  const fields = canonFields((await c.req.json()) as CreateCanonRequest, false);
  const canon = await createCanon(u, fields);
  return c.json(canon, 201);
});

canonsApi.get("/canons/:id", async (c) => {
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
  const role = (await canonRoleOf(u, canon))!;
  const editors = await editorSummaries(canon, role === "owner");
  const owner = canon.ownerUserId === u.userId ? u : await getUser(canon.ownerUserId);
  const res: CanonDetailResponse = { canon, members, role, editors, ownerName: actorName(owner) };
  return c.json(res);
});

/** Co-editors with their current display names; the e-mail address only for the owner. */
async function editorSummaries(canon: CanonRecord, withEmail: boolean): Promise<CanonEditorSummary[]> {
  const out: CanonEditorSummary[] = [];
  for (const e of await listCanonEditors(canon.canonId)) {
    const user = await getUser(e.userId);
    out.push({ userId: e.userId, name: actorName(user) || e.name, ...(withEmail ? { email: e.email } : {}), addedAt: e.addedAt });
  }
  return out.sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1));
}

async function setEditorCanon(userId: string, canonId: string, on: boolean) {
  const user = await getUser(userId);
  if (!user) return;
  const list = new Set(user.editorCanons ?? []);
  if (on) list.add(canonId);
  else list.delete(canonId);
  await updateUser(userId, { editorCanons: [...list] });
}

/**
 * The owner adds a co-editor by the e-mail address the person signed up with (an existing user; there are no
 * e-mail invitations). Co-editors review pull requests; the Canon stays the owner's.
 */
canonsApi.post("/canons/:id/editors", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: unknown };
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email.trim())) throw bad("メールアドレスを入力してください");
  const user = await findUserByEmail(email);
  if (!user || user.disabled) throw new HTTPException(404, { message: "このメールアドレスで登録したユーザーがいません。先に CoBRAC Agents にサインアップしてもらってから追加してください" });
  if (user.userId === canon.ownerUserId) throw bad("所有者は共同編集者に追加できません");
  const rec: CanonEditorRecord = { canonId: canon.canonId, sk: canonEditorSk(user.userId), userId: user.userId, name: actorName(user), email: user.email, addedBy: u.userId, addedAt: nowIso() };
  if (!(await putCanonEditor(rec))) throw new HTTPException(409, { message: "このユーザーは既に共同編集者です" });
  await setEditorCanon(user.userId, canon.canonId, true);
  const res: CanonEditorSummary = { userId: rec.userId, name: rec.name, email: rec.email, addedAt: rec.addedAt };
  return c.json(res, 201);
});

/** The owner removes a co-editor, or a co-editor leaves. */
canonsApi.delete("/canons/:id/editors/:userId", async (c) => {
  const u = c.get("user");
  const target = c.req.param("userId");
  const canon = await loadCanon(u, c.req.param("id"));
  if (canon.ownerUserId !== u.userId && target !== u.userId) throw notFound();
  if (!(await deleteCanonEditor(canon.canonId, target))) throw notFound();
  await setEditorCanon(target, canon.canonId, false);
  return c.json({ ok: true });
});

canonsApi.put("/canons/:id", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const fields = canonFields((await c.req.json()) as UpdateCanonRequest, true);
  if (Object.keys(fields).length) await updateCanon(canon.canonId, fields);
  return c.json({ ...canon, ...fields, updatedAt: nowIso() });
});

/** Soft delete (owner only): member projects leave the Canon and its finished plans are deleted; nothing is removed from DynamoDB or S3. */
canonsApi.delete("/canons/:id", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  try {
    const deletedAt = await markCanonDeleted(canon.canonId, u.userId);
    if (canon.visibility === "public") await deleteCatalogItem("canon", canon.canonId);
    await deleteFinishedPlansOfCanon(canon.ownerUserId, canon.canonId);
    return c.json({ canonId: canon.canonId, deletedAt });
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw notFound();
    throw e;
  }
});

canonsApi.post("/canons/:id/members", async (c) => {
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

canonsApi.delete("/canons/:id/members/:projectId", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  if (!(await removeCanonMember(canon.canonId, u.userId, c.req.param("projectId")))) throw notFound();
  return c.json({ ok: true });
});

canonsApi.get("/canons/:id/revisions", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  return c.json({ items: await listCanonRevisions(canon.canonId) });
});

// --- push and pull requests (stage 2) ----------------------------------------

async function projectCanon(u: UserRecord, projectId: string): Promise<{ p: ProjectRecord; canon: CanonRecord }> {
  const p = await loadOwnProject(u, projectId);
  if (!p.canonId) throw new HTTPException(409, { message: "このプロジェクトは Canon に入っていません" });
  const canon = await loadCanon(u, p.canonId, { write: true });
  return { p, canon };
}

canonsApi.post("/projects/:id/canon/preview", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const diff = diffCanon(await loadCanonHead(canon), await projectIncoming(u, p));
  return c.json({ canonId: canon.canonId, diff });
});

canonsApi.post("/projects/:id/canon/push", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  return c.json(await pushProject(u, canon, p), 201);
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

canonsApi.post("/canons/seed-preview", async (c) => {
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
export async function resolveProjectCanon(u: UserRecord, choice: CreateProjectCanon | undefined): Promise<{ existing?: CanonRecord; plan?: SeedPlan } | null> {
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
export async function applyProjectCanon(u: UserRecord, project: ProjectRecord, r: { existing?: CanonRecord; plan?: SeedPlan }): Promise<string> {
  if (r.existing) {
    const added = await addCanonMember(r.existing.canonId, u.userId, project.projectId, r.existing.headRevision);
    if (!added.ok) throw new Error("could not add the new project to its Canon");
    return r.existing.canonId;
  }
  const plan = r.plan!;
  const fields = canonFields(plan, false);
  const canonId = await reserveNewId("canon", u.userId);
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

canonsApi.get("/canons/:id/pulls", async (c) => {
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

/**
 * Owner, co-editors (and admins) of the target Canon, or whoever sent the pull request (a Canon → Canon PR of
 * another user). `isOwner` here means "may review": the owner or a co-editor.
 */
async function loadPrForViewer(u: UserRecord, canonId: string, no: string): Promise<{ canon: CanonRecord; pr: CanonPullRequestRecord; isOwner: boolean; role: CanonRole | null }> {
  if (!isCanonId(canonId)) throw notFound();
  const canon = await getCanon(canonId);
  if (!canon || isCanonDeleted(canon)) throw notFound();
  const pr = await loadPr(canon, no);
  const role = await canonRoleOf(u, canon);
  if (!role && pr.createdBy !== u.userId) throw notFound();
  return { canon, pr, isOwner: role === "owner" || role === "editor", role };
}

canonsApi.get("/canons/:id/pulls/:no", async (c) => {
  const u = c.get("user");
  const { canon, pr, isOwner, role } = await loadPrForViewer(u, c.req.param("id"), c.req.param("no"));
  const m = await prReviewMaterial(canon, pr);
  const [events, jobs] = await Promise.all([listPrEvents(canon.canonId, pr.prNo), listJobsForCanon(canon.canonId)]);
  const reviews = reviewJobsOf(jobs, pr.prNo);
  const names = new Map<string, string>();
  for (const id of new Set([pr.createdBy, pr.decidedBy].filter((x): x is string => !!x))) names.set(id, actorName(id === u.userId ? u : await getUser(id)));
  let ai = null;
  if (isOwner) {
    const latest = reviews[0];
    const result = latest?.status === "COMPLETED" ? await getCanonJson<CanonAiReviewResult>(canonAiReviewKey(canon.canonId, pr.prNo, latest.jobId, "result.json")) : null;
    ai = aiState(latest, result);
  }
  const res: CanonPullDetailResponse = {
    pr,
    diff: m.diff,
    headRevision: canon.headRevision,
    targetName: canon.name,
    canReview: isOwner,
    canWithdraw: pr.createdBy === u.userId,
    canComment: isOwner || pr.createdBy === u.userId,
    viewerRole: role,
    checks: m.checks,
    entries: m.entries,
    graph: m.graph,
    provenance: m.provenance,
    events: prTrail(pr, events, isOwner ? reviews : [], names),
    ai,
    ...(isOwner && pr.state === "open" && m.diff ? { issues: issuesTouchedByDiff(await loadCanonHead(canon), m.diff) } : {}),
  };
  return c.json(res);
});

/** A required (or optional) note of a review action. */
function reviewNote(v: unknown, required: boolean, message: string): string | null {
  const r = normalizeCanonText(v, CANON_PR_NOTE_MAX);
  if ("error" in r) throw bad(`${message}: ${r.error}`);
  if (required && !r.text) throw bad(message);
  return r.text || null;
}

canonsApi.post("/canons/:id/pulls/:no/comments", async (c) => {
  const u = c.get("user");
  const { canon, pr, isOwner } = await loadPrForViewer(u, c.req.param("id"), c.req.param("no"));
  if (!isOwner && pr.createdBy !== u.userId) throw new HTTPException(403, { message: "この PR にはコメントできません" });
  const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; item?: unknown };
  const note = reviewNote(body.text, true, "コメントを書いてください");
  let item: string | null = null;
  let itemLabel: string | null = null;
  if (body.item !== undefined && body.item !== null && body.item !== "") {
    const ref = typeof body.item === "string" ? parseReviewItemId(body.item) : null;
    const diff = ref ? await getCanonJson<CanonDiff>(canonPrKey(canon.canonId, pr.prNo, "diff.json")) : null;
    const hit = ref && diff?.items.find((i) => i.kind === ref.kind && i.key === ref.key);
    if (!hit) throw bad("コメントの対象の項目がこの PR にありません");
    item = reviewItemId(hit.kind, hit.key);
    itemLabel = hit.label;
  }
  const e = await putPrEvent(canon.canonId, pr.prNo, { type: "comment", actor: u.userId, actorName: actorName(u), note, item, itemLabel });
  return c.json({ event: e }, 201);
});

canonsApi.post("/canons/:id/pulls/:no/request-changes", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const pr = await loadPr(canon, c.req.param("no"));
  if (pr.state !== "open") throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  const { note } = (await c.req.json().catch(() => ({}))) as { note?: unknown };
  const text = reviewNote(note, true, "依頼する変更を書いてください");
  await requestPrChanges(u, canon, pr, text ?? "");
  return c.json({ ok: true });
});

/** Queues the AI review of an open PR on the worker (one at a time per PR); the owner's key and tier apply. */
canonsApi.post("/canons/:id/pulls/:no/ai-review", async (c) => {
  const u = c.get("user");
  const policy = await requireRunKey(u);
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const pr = await loadPr(canon, c.req.param("no"));
  if (pr.state !== "open") throw new HTTPException(409, { message: "閉じた取り込み依頼には AI レビューを実行できません" });
  const body = (await c.req.json().catch(() => ({}))) as { model?: unknown; locale?: unknown };
  if (!isUiLocale(body.locale)) throw bad("locale が不正です");
  const picked = normModel(body.model);
  if (picked && !isOfferedModel(picked)) throw bad("このモデルは AI レビューに使えません");
  const model = picked ?? implicitModel(policy, deploymentDefaultModel());
  requireModel(policy, model);
  const r = await requestAiReview(u, canon, pr, policy, { model, locale: body.locale });
  if (!r.ok) throw new HTTPException(409, { message: r.message });
  return c.json({ ai: r.ai }, 202);
});

canonsApi.post("/canons/:id/pulls/:no/approve", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const pr = await loadPr(canon, c.req.param("no"));
  if (pr.state !== "open") throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  const body = (await c.req.json().catch(() => ({}))) as { choices?: Record<string, CanonChoice>; note?: unknown; resolveIssues?: unknown };
  const note = reviewNote(body.note, false, "メモが不正です");
  const choices: Record<string, CanonChoice> = {};
  for (const [k, v] of Object.entries(body.choices ?? {})) if (v === "canon" || v === "incoming") choices[k] = v;
  const resolveIssues = Array.isArray(body.resolveIssues) ? body.resolveIssues.filter((x): x is string => typeof x === "string" && /^I[1-9][0-9]*$/.test(x)).slice(0, 100) : [];
  const r = await approvePullRequest(u, canon, pr, { choices, note, resolveIssues });
  if (!r.ok) return c.json(r.body, r.status);
  return c.json({ revision: r.revision });
});

/** Most pull requests one 「まとめて承認」 approves. */
const APPROVE_MANY_MAX = 50;

/**
 * 「まとめて承認」: approves the given pull requests one after another, in order, each judged against the head the
 * previous approval made (exactly as a single approval, without conflict choices); stops at the first one that cannot be
 * approved (conflicts, closed, missing, approvals or a race) and leaves the rest untried.
 */
canonsApi.post("/canons/:id/pulls/approve-many", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const body = (await c.req.json().catch(() => ({}))) as Partial<ApproveManyRequest>;
  const list = body.prNos;
  if (!Array.isArray(list) || list.length === 0 || list.length > APPROVE_MANY_MAX || !list.every((n) => Number.isInteger(n) && n >= 1)) {
    throw bad(`prNos は 1〜${APPROVE_MANY_MAX} 件の PR 番号で指定してください`);
  }
  const res: ApproveManyResponse = { approved: [], stopped: null };
  for (const prNo of [...new Set(list)]) {
    const fresh = await getCanon(canon.canonId);
    if (!fresh || isCanonDeleted(fresh)) {
      // deleted meanwhile: nothing was approved yet → 404; otherwise the PRs approved so far are reported
      if (!res.approved.length) throw notFound();
      res.stopped = { prNo, reason: "not_found" };
      break;
    }
    const pr = await getPullRequest(canon.canonId, prNo);
    if (!pr) {
      res.stopped = { prNo, reason: "not_found" };
      break;
    }
    if (pr.state !== "open") {
      res.stopped = { prNo, reason: "closed" };
      break;
    }
    let r: Awaited<ReturnType<typeof approvePullRequest>>;
    try {
      r = await approvePullRequest(u, fresh, pr, { choices: {} });
    } catch (e) {
      // the earlier approvals already made revisions: report them and stop here instead of failing the whole request
      console.error(`[canon ${canon.canonId}] approve-many stopped at #${prNo}`, e instanceof Error ? e.message : e);
      res.stopped = { prNo, reason: "race" };
      break;
    }
    if (!r.ok) {
      res.stopped = { prNo, reason: r.reason, ...(r.blocking ? { blocking: r.blocking } : {}) };
      break;
    }
    res.approved.push({ prNo, revision: r.revision });
  }
  return c.json(res);
});

canonsApi.post("/canons/:id/pulls/:no/reject", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const pr = await loadPr(canon, c.req.param("no"));
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const text = reviewNote(reason, true, "却下の理由を書いてください");
  if (!(await rejectPullRequest(u, canon, pr, text ?? ""))) throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  return c.json({ ok: true });
});

canonsApi.post("/canons/:id/pulls/:no/withdraw", async (c) => {
  const u = c.get("user");
  const { canon, pr } = await loadPrForViewer(u, c.req.param("id"), c.req.param("no"));
  if (pr.createdBy !== u.userId) throw notFound();
  const at = nowIso();
  if (!(await closePullRequest(canon.canonId, pr.prNo, { state: "withdrawn", decidedBy: u.userId, decidedByName: actorName(u), decidedAt: at }))) {
    throw new HTTPException(409, { message: "この取り込み依頼は既に閉じています" });
  }
  await putPrEvent(canon.canonId, pr.prNo, { type: "withdrawn", at, actor: u.userId, actorName: actorName(u) });
  return c.json({ ok: true });
});

// --- problems on Canon entries (canonIssues.ts) ------------------------------------

/** Reports a problem on one entry of the head revision (owner or co-editor); writes a revision without a pull request. */
canonsApi.post("/canons/:id/issues", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const input = readCanonIssueInput(await c.req.json().catch(() => ({})));
  if ("error" in input) throw bad(input.error);
  const r = await raiseIssue(u, canon, input);
  if (!r.ok) throw new HTTPException(r.status, { message: r.message });
  return c.json({ revision: r.revision, issue: r.issue }, 201);
});

/** Settles an open problem: fixed, not an error (dismissed) or withdrawn with its entry (invalidated). */
canonsApi.post("/canons/:id/issues/:issueId/resolve", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { review: true });
  const issueId = c.req.param("issueId");
  if (!/^I[1-9][0-9]*$/.test(issueId)) throw notFound();
  const body = (await c.req.json().catch(() => ({}))) as { resolution?: unknown; note?: unknown };
  if (!CANON_ISSUE_RESOLUTIONS.includes(body.resolution as CanonIssueResolution)) throw bad("resolution は fixed / dismissed / invalidated のどれかです");
  const note = reviewNote(body.note, false, "メモが不正です");
  const r = await settleIssue(u, canon, issueId, body.resolution as CanonIssueResolution, note);
  if (!r.ok) throw new HTTPException(r.status, { message: r.message });
  return c.json({ revision: r.revision });
});

/** 「まとめて Canon に合わせる」 (owner): a follow-up for every finished member project the head changed something for. */
canonsApi.post("/canons/:id/align", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"), { write: true });
  const body = (await c.req.json().catch(() => ({}))) as { locale?: unknown };
  return c.json(await alignAffectedProjects(u, canon, readLocale(body.locale)));
});

/**
 * Open problems of the Canons this Canon took entries from (Canon → Canon pull requests), on those entries. Only
 * Canons the caller may read are looked at (their own, ones they co-edit, public ones).
 */
canonsApi.get("/canons/:id/upstream-issues", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  if (canon.headRevision === 0) return c.json({ items: [] });
  const head = await loadCanonHead(canon);
  const items: { canonId: string; name: string; issues: CanonIssue[] }[] = [];
  for (const id of upstreamCanonIds(head)) {
    const up = isCanonId(id) ? await getCanon(id) : null;
    if (!up || isCanonDeleted(up) || up.headRevision === 0) continue;
    const readable = up.ownerUserId === u.userId || up.visibility === "public" || !!(await getCanonEditor(up.canonId, u.userId));
    if (!readable) continue;
    const issues = upstreamIssues(head, await loadCanonHead(up));
    if (issues.length) items.push({ canonId: up.canonId, name: up.name, issues });
  }
  return c.json({ items });
});

// --- following a Canon (stage 3) -------------------------------------------------

/** Pinned revision vs head, judged on what the project uses, plus the follow-up text that aligns it. */
canonsApi.get("/projects/:id/canon", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const pinned = Math.min(p.canonRevision ?? 0, canon.headRevision);
  const status = canonFollowStatus(await loadCanonRevision(canon, pinned), await loadCanonRevision(canon, canon.headRevision), p.projectId);
  const info = { canonId: canon.canonId, name: canon.name, policy: canon.policy, revision: canon.headRevision };
  return c.json({ canonId: canon.canonId, name: canon.name, ...status, alignInstruction: canonAlignInstruction(info, status) });
});

/** Moves the project's pin (default: the head). Takes effect from the next job. */
canonsApi.post("/projects/:id/canon/pull", async (c) => {
  const u = c.get("user");
  const { p, canon } = await projectCanon(u, c.req.param("id"));
  const { revision } = (await c.req.json().catch(() => ({}))) as { revision?: number };
  const rev = revision === undefined ? canon.headRevision : Number(revision);
  if (!Number.isInteger(rev) || rev < 0 || rev > canon.headRevision) throw bad("revision が不正です");
  return c.json({ canonRevision: await pinProject(u, p, canon, rev) });
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
  if (canon.ownerUserId === u.userId || (await getCanonEditor(canon.canonId, u.userId))) return canon;
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

canonsApi.post("/canons/:id/pulls/preview", async (c) => {
  const u = c.get("user");
  const { diff } = await canonToCanon(u, c.req.param("id"), (await c.req.json().catch(() => ({}))) as { sourceCanonId?: string });
  return c.json({ diff });
});

canonsApi.post("/canons/:id/pulls", async (c) => {
  const u = c.get("user");
  const { target, source, incoming, diff } = await canonToCanon(u, c.req.param("id"), (await c.req.json().catch(() => ({}))) as { sourceCanonId?: string });
  const src = `canon:${source.canonId}`;
  const prNo = await nextPrNumber(target.canonId);
  await putCanonJson(canonPrKey(target.canonId, prNo, "incoming.json"), incoming);
  await putCanonJson(canonPrKey(target.canonId, prNo, "diff.json"), diff);
  for (const old of await listPullRequests(target.canonId)) {
    if (old.state === "open" && old.source === src && (await closePullRequest(target.canonId, old.prNo, { state: "superseded", reason: `#${prNo}` }))) {
      await putPrEvent(target.canonId, old.prNo, { type: "superseded", actor: u.userId, actorName: actorName(u), byPr: prNo });
    }
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
  await putPrEvent(target.canonId, prNo, { type: "pushed", at: now, actor: u.userId, actorName: actorName(u), revision: source.headRevision });
  await putOutgoing({ canonId: source.canonId, sk: canonOutSk(target.canonId, prNo), targetCanonId: target.canonId, prNo, createdAt: now });
  return c.json({ pr, diff }, 201);
});

/** Pull requests this Canon sent to other Canons, with their current state (read from the target). */
canonsApi.get("/canons/:id/outgoing", async (c) => {
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

canonsApi.get("/canons/:id/revisions/:rev", async (c) => {
  const u = c.get("user");
  const canon = await loadCanon(u, c.req.param("id"));
  const rev = Number(c.req.param("rev"));
  if (!Number.isInteger(rev) || rev < 0 || rev > canon.headRevision) throw notFound();
  if (rev === 0) return c.json(emptyCanonSnapshot(canon.canonId, canon.createdAt));
  const snap = await getCanonJson<CanonSnapshot>(canonRevisionKey(canon.canonId, rev));
  if (!snap) throw notFound();
  return c.json(snap);
});
