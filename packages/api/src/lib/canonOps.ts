// What the Canon routes do, as functions both the routes and the BRA Planner runner call with the owner's (or the
// reviewer's) UserRecord: creating a Canon, pushing a project (a pull request), moving a project's pin, queueing the AI
// review of a pull request and approving one. The routes keep their own access checks and request parsing.
import { HTTPException } from "hono/http-exception";
import type {
  CanonAiActor,
  CanonAiState,
  CanonApproval,
  CanonChoice,
  CanonDiff,
  CanonIncoming,
  CanonPullRequestRecord,
  CanonRecord,
  CanonSnapshot,
  CreateCanonRequest,
  JobRecord,
  KeySource,
  ModelPolicy,
  ProjectRecord,
  ReviewProvenance,
  UiLocale,
  UpdateCanonRequest,
  UserRecord,
} from "@cobrac/shared";
import {
  CANON_DESCRIPTION_MAX,
  CANON_META_SK,
  CANON_POLICY_MAX,
  FRG_FILES,
  aiActorName,
  HCD_FILES,
  PROJECT_FILES,
  blockingConflicts,
  buildCanonAiPacket,
  canonAiReviewKey,
  canonFromProject,
  canonPrKey,
  canonPrSk,
  canonReviewChecks,
  canonRevisionKey,
  canonRevisionSk,
  diffCanon,
  emptyCanonSnapshot,
  isCanonDeleted,
  isCanonId,
  isProjectDeleted,
  mergeCanon,
  newId,
  normalizeCanonName,
  normalizeCanonText,
  nowIso,
  projectDisplayName,
  requiredApprovals,
  reviewEntries,
  reviewGraph,
} from "@cobrac/shared";
import { getCanonJson, getObjectText, putCanonJson, enqueueRun } from "./aws.js";
import { reserveNewId } from "./catalog.js";
import {
  advanceCanonHead,
  closePullRequest,
  getCanon,
  listPullRequests,
  nextPrNumber,
  putCanon,
  putCanonRevision,
  putPrEvent,
  putPullRequest,
  updatePullRequest,
} from "./canons.js";
import { actorName, aiState, isActiveJob, reviewJobsOf } from "./canonReview.js";
import { getProject, listJobsForCanon, putJob, updateProject } from "./db.js";
import { bad } from "./http.js";

// --- Canons ------------------------------------------------------------------------------------------------------------

/** Checked fields of a create (all) or update (`partial`: only those given) request; 400 on a bad value. */
export function canonFields(body: CreateCanonRequest | UpdateCanonRequest, partial: boolean): Partial<CanonRecord> {
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

/** A new, empty, private Canon of `u` (fields checked with `canonFields`). */
export async function createCanon(u: UserRecord, fields: Partial<CanonRecord>): Promise<CanonRecord> {
  const now = nowIso();
  const canon: CanonRecord = {
    canonId: await reserveNewId("canon", u.userId),
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
  return canon;
}

/** A Canon `ownerUserId` owns and has not deleted (the only Canons a plan's projects can join); null otherwise. */
export async function ownedCanon(canonId: string | null | undefined, ownerUserId: string): Promise<CanonRecord | null> {
  if (!canonId || !isCanonId(canonId)) return null;
  const canon = await getCanon(canonId);
  return canon && !isCanonDeleted(canon) && canon.ownerUserId === ownerUserId ? canon : null;
}

export async function loadCanonHead(canon: CanonRecord): Promise<CanonSnapshot> {
  if (canon.headRevision === 0) return emptyCanonSnapshot(canon.canonId, canon.createdAt);
  const snap = await getCanonJson<CanonSnapshot>(canonRevisionKey(canon.canonId, canon.headRevision));
  if (!snap) throw new Error(`Canon ${canon.canonId} revision ${canon.headRevision} is missing`);
  return snap;
}

export async function loadCanonRevision(canon: CanonRecord, rev: number): Promise<CanonSnapshot> {
  if (rev <= 0) return emptyCanonSnapshot(canon.canonId, canon.createdAt);
  const snap = await getCanonJson<CanonSnapshot>(canonRevisionKey(canon.canonId, rev));
  if (!snap) throw new Error(`Canon ${canon.canonId} revision ${rev} is missing`);
  return snap;
}

// --- push ------------------------------------------------------------------------------------------------------------------

/** The project's latest completed data in Canon form (Q16: only a COMPLETED project with artifacts can be pushed). */
export async function projectIncoming(u: UserRecord, p: ProjectRecord): Promise<CanonIncoming> {
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

/** Stores a project's push as an open pull request of `canon` (superseding its older open one); a plan's project names its plan. */
export async function openProjectPr(u: UserRecord, canon: CanonRecord, p: ProjectRecord, incoming: CanonIncoming, diff: CanonDiff): Promise<CanonPullRequestRecord> {
  const source = `project:${p.projectId}`;
  const prNo = await nextPrNumber(canon.canonId);
  await putCanonJson(canonPrKey(canon.canonId, prNo, "incoming.json"), incoming);
  await putCanonJson(canonPrKey(canon.canonId, prNo, "diff.json"), diff);
  for (const old of await listPullRequests(canon.canonId)) {
    if (old.state === "open" && old.source === source && old.prNo !== prNo && (await closePullRequest(canon.canonId, old.prNo, { state: "superseded", reason: `#${prNo}` }))) {
      await putPrEvent(canon.canonId, old.prNo, { type: "superseded", actor: u.userId, actorName: actorName(u), byPr: prNo });
    }
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
    planId: p.planId ?? null,
  };
  await putPullRequest(pr);
  await putPrEvent(canon.canonId, prNo, { type: "pushed", at: now, actor: u.userId, actorName: actorName(u), revision: incoming.projectRevision });
  return pr;
}

/** Pushes a member project's latest completed data to its Canon (409 when it cannot be pushed). */
export async function pushProject(u: UserRecord, canon: CanonRecord, p: ProjectRecord): Promise<{ pr: CanonPullRequestRecord; diff: CanonDiff }> {
  const incoming = await projectIncoming(u, p);
  const diff = diffCanon(await loadCanonHead(canon), incoming);
  const pr = await openProjectPr(u, canon, p, incoming, diff);
  return { pr, diff };
}

/** Moves a member project's pin to `revision` (checked by the caller). Takes effect from its next job. */
export async function pinProject(u: UserRecord, p: ProjectRecord, _canon: CanonRecord, revision: number): Promise<number> {
  await updateProject(u.userId, p.projectId, { canonRevision: revision });
  p.canonRevision = revision;
  return revision;
}

// --- review ---------------------------------------------------------------------------------------------------------------

/** Where the PR comes from and whether that source still exists (and has moved on) now. */
export async function prProvenance(canon: CanonRecord, pr: CanonPullRequestRecord): Promise<ReviewProvenance> {
  const [kind, id] = pr.source.split(":") as ["project" | "canon", string];
  let current: number | null = null;
  let available = false;
  if (kind === "project") {
    const p = await getProject(canon.ownerUserId, id);
    available = !!p && !isProjectDeleted(p) && p.canonId === canon.canonId;
    current = p ? (p.revision ?? null) : null;
  } else {
    const src = isCanonId(id) ? await getCanon(id) : null;
    available = !!src && !isCanonDeleted(src);
    current = src?.headRevision ?? null;
  }
  return { sourceKind: kind, sourceId: id, sourceRevision: pr.sourceRevision, sourceCurrentRevision: current, sourceAvailable: available, headRevision: canon.headRevision };
}

/** The diff, its base revision and the incoming payload of a PR, with the review aids computed from them. */
export async function prReviewMaterial(canon: CanonRecord, pr: CanonPullRequestRecord) {
  const [diff, incoming] = await Promise.all([
    getCanonJson<CanonDiff>(canonPrKey(canon.canonId, pr.prNo, "diff.json")),
    getCanonJson<CanonIncoming>(canonPrKey(canon.canonId, pr.prNo, "incoming.json")),
  ]);
  if (!diff || !incoming) return { diff, incoming, base: null, checks: null, entries: {}, graph: null, provenance: null };
  const base = await loadCanonRevision(canon, Math.min(diff.baseRevision, canon.headRevision));
  const provenance = await prProvenance(canon, pr);
  return { diff, incoming, base, provenance, checks: canonReviewChecks(base, incoming, diff, provenance), entries: reviewEntries(base, incoming, diff), graph: reviewGraph(base, incoming, diff) };
}

export type AiReviewResult = { ok: true; job: JobRecord; ai: CanonAiState | null } | { ok: false; reason: "closed" | "active" | "material"; message: string; /** reason active: the review job already queued or running */ jobId?: string };

/**
 * Queues the AI review of an open PR on the worker (one at a time per PR), as `u` with `u`'s key; the model is checked
 * by the caller. Not queued when the PR is closed, a review of it is queued or running, or its diff cannot be read.
 */
export async function requestAiReview(
  u: UserRecord,
  canon: CanonRecord,
  pr: CanonPullRequestRecord,
  policy: ModelPolicy & { source: KeySource },
  opts: { model: string; locale: UiLocale; /** decide: the decision job of an autonomous plan (自律実行) */ kind?: "assist" | "decide"; planId?: string | null },
): Promise<AiReviewResult> {
  if (pr.state !== "open") return { ok: false, reason: "closed", message: "閉じた取り込み依頼には AI レビューを実行できません" };
  const jobs = reviewJobsOf(await listJobsForCanon(canon.canonId), pr.prNo);
  const active = jobs.find(isActiveJob);
  if (active) return { ok: false, reason: "active", message: "この PR の AI レビューは実行中です", jobId: active.jobId };
  const m = await prReviewMaterial(canon, pr);
  if (!m.diff || !m.incoming || !m.base || !m.checks) return { ok: false, reason: "material", message: "この PR の差分を読めません" };
  const jobId = newId("job_");
  const packet = buildCanonAiPacket(
    { id: canon.canonId, name: canon.name, policy: canon.policy, headRevision: canon.headRevision },
    { no: pr.prNo, source: pr.source, sourceName: pr.sourceName, sourceRevision: pr.sourceRevision, baseRevision: m.diff.baseRevision },
    m.diff,
    m.checks.checks,
    m.entries,
    m.base,
    m.incoming,
  );
  await putCanonJson(canonAiReviewKey(canon.canonId, pr.prNo, jobId, "input.json"), packet);
  const now = nowIso();
  const job: JobRecord = {
    projectId: canon.canonId,
    jobId,
    userId: u.userId,
    type: "canon-review",
    status: "QUEUED",
    keySource: policy.source,
    instruction: null,
    pendingAnswer: null,
    reviewPrNo: pr.prNo,
    reviewLocale: opts.locale,
    ...(opts.kind === "decide" ? { reviewKind: "decide" as const } : {}),
    ...(opts.planId ? { planId: opts.planId } : {}),
    model: opts.model,
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
  await putPrEvent(canon.canonId, pr.prNo, { type: "ai_requested", at: now, actor: u.userId, actorName: actorName(u), jobId, model: opts.model, ...(opts.kind === "decide" ? { note: "decide" } : {}) });
  await enqueueRun({ version: 1, userId: u.userId, projectId: canon.canonId, jobId, mode: "canon-review" });
  return { ok: true, job, ai: aiState(job, null) };
}

export type ApproveResult =
  | { ok: true; revision: number }
  | { ok: false; status: 409; reason: "conflicts" | "approvals" | "race"; body: Record<string, unknown>; blocking?: number };

/**
 * Approves an open PR as `u`: judged against the current head (re-diffed and recorded as rebased when the Canon moved
 * since the push), merged into a new revision, and the pushing project follows that revision. The caller has checked
 * that `u` may review and that the PR is open.
 */
export async function approvePullRequest(
  u: UserRecord,
  canon: CanonRecord,
  pr: CanonPullRequestRecord,
  opts: { choices: Record<string, CanonChoice>; note?: string | null; /** the AI of an autonomous plan approves for the owner `u` */ via?: CanonAiActor },
): Promise<ApproveResult> {
  const { choices, via } = opts;
  const note = opts.note ?? null;
  const name = via ? aiActorName(via.model) : actorName(u);
  const viaEvent = via ? { via: "ai" as const, jobId: via.jobId, model: via.model } : {};
  const incoming = await getCanonJson<CanonIncoming>(canonPrKey(canon.canonId, pr.prNo, "incoming.json"));
  if (!incoming) throw new Error(`PR ${pr.prNo} payload is missing`);
  const head = await loadCanonHead(canon);
  let diff = await getCanonJson<CanonDiff>(canonPrKey(canon.canonId, pr.prNo, "diff.json"));
  if (!diff || diff.baseRevision !== head.revision) {
    // the Canon moved since the push: judge the PR against the current head
    const from = diff?.baseRevision ?? pr.baseRevision;
    diff = diffCanon(head, incoming);
    await putCanonJson(canonPrKey(canon.canonId, pr.prNo, "diff.json"), diff);
    await updatePullRequest(canon.canonId, pr.prNo, { baseRevision: diff.baseRevision, summary: diff.summary });
    await putPrEvent(canon.canonId, pr.prNo, { type: "rebased", actor: u.userId, actorName: name, note: `rev ${from} → rev ${diff.baseRevision}`, revision: diff.baseRevision, ...viaEvent });
  }
  const blocking = blockingConflicts(diff, choices);
  if (blocking.length) return { ok: false, status: 409, reason: "conflicts", blocking: blocking.length, body: { error: "解決していない衝突があります", blocking, diff } };
  const now = nowIso();
  const approval: CanonApproval = { userId: u.userId, name, at: now, ...(via ? { via } : {}) };
  const approvals = [...(pr.approvals ?? []).filter((a) => a.userId !== u.userId || !!a.via !== !!via), approval];
  // one approval is enough for now (requiredApprovals); the list is kept for a future setting
  if (approvals.length < requiredApprovals(canon)) return { ok: false, status: 409, reason: "approvals", body: { error: "承認がまだ足りません", approvals } };
  const next = mergeCanon(head, incoming, diff, choices, pr.prNo, now);
  await putCanonJson(canonRevisionKey(canon.canonId, next.revision), next);
  if (!(await advanceCanonHead(canon.canonId, head.revision))) {
    return { ok: false, status: 409, reason: "race", body: { error: "ほかの取り込みと重なりました。もう一度承認してください" } };
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
    approvedBy: u.userId,
    approvedByName: approval.name,
    approvedAt: now,
    ...(via ? { approvedVia: via } : {}),
  });
  await closePullRequest(canon.canonId, pr.prNo, { state: "approved", decidedBy: u.userId, decidedByName: approval.name, decidedAt: now, approvals, mergedRevision: next.revision, ...(note ? { reason: note } : {}), ...(via ? { decidedVia: via } : {}) });
  await putPrEvent(canon.canonId, pr.prNo, { type: "approved", at: now, actor: u.userId, actorName: name, note, revision: next.revision, choices, ...viaEvent });
  // the pushing project follows the revision that contains its own content (Q9)
  if (pr.source.startsWith("project:")) {
    const pid = pr.source.slice("project:".length);
    const p = await getProject(canon.ownerUserId, pid);
    if (p && p.canonId === canon.canonId && !isProjectDeleted(p)) await updateProject(canon.ownerUserId, pid, { canonRevision: next.revision });
  }
  return { ok: true, revision: next.revision };
}

/**
 * Rejects an open PR as `u` (or the AI of an autonomous plan for `u`) with a reason. False when it was closed meanwhile.
 * The caller has checked that `u` may review.
 */
export async function rejectPullRequest(u: UserRecord, canon: CanonRecord, pr: CanonPullRequestRecord, reason: string, via?: CanonAiActor): Promise<boolean> {
  const at = nowIso();
  const name = via ? aiActorName(via.model) : actorName(u);
  if (!(await closePullRequest(canon.canonId, pr.prNo, { state: "rejected", decidedBy: u.userId, decidedByName: name, decidedAt: at, reason, ...(via ? { decidedVia: via } : {}) }))) return false;
  await putPrEvent(canon.canonId, pr.prNo, { type: "rejected", at, actor: u.userId, actorName: name, note: reason, ...(via ? { via: "ai" as const, jobId: via.jobId, model: via.model } : {}) });
  return true;
}

/**
 * Asks for changes on an open PR as `u` (or the AI of an autonomous plan for `u`): it stays open until it is re-pushed
 * (superseded), approved or rejected. The caller has checked that `u` may review and that the PR is open.
 */
export async function requestPrChanges(u: UserRecord, canon: CanonRecord, pr: CanonPullRequestRecord, note: string, via?: CanonAiActor): Promise<void> {
  const at = nowIso();
  const name = via ? aiActorName(via.model) : actorName(u);
  await updatePullRequest(canon.canonId, pr.prNo, { reviewState: "changes_requested", reviewNote: note, reviewedBy: u.userId, reviewedByName: name, reviewedAt: at });
  await putPrEvent(canon.canonId, pr.prNo, { type: "changes_requested", at, actor: u.userId, actorName: name, note, ...(via ? { via: "ai" as const, jobId: via.jobId, model: via.model } : {}) });
}
