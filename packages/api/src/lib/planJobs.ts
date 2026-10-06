// The `plan` jobs of the BRA Planner (stage 2): a draft (rows, anchors, dependencies and a policy from the goal and
// capability lists) and a re-plan after a wave (proposals). Like an AI review of a Canon pull request, the input goes
// to `plans/{planId}/jobs/{jobId}/input.json`, the worker writes `result.json`, and only what refers to the input is
// kept. The runner queues a job only when a slot is free (never ahead of one) and follows it to its end; the API and
// the runner never touch API keys (the worker resolves and decrypts the key itself).
import type {
  CanonRecord,
  JobRecord,
  KeySource,
  ModelPolicy,
  ParsedPlanResult,
  PlanJobInput,
  PlanJobKind,
  PlanJobResult,
  PlanJobState,
  PlanProposalRecord,
  PlanRecord,
  PlanRowRecord,
  ProjectRecord,
  UserRecord,
} from "@cobrac/shared";
import {
  PLAN_JOB_REASONING_EFFORT,
  PLAN_JOB_RESULT_SCHEMA,
  PLAN_LIMITS,
  buildPlanJobInput,
  generatePlanProposalId,
  generatePlanRowId,
  hubScores,
  isDeterministicPlanAttachment,
  matchExistingProject,
  newId,
  nowIso,
  orderDraft,
  parsePlanResult,
  planJobKey,
  planProposalSk,
  planRowKey,
  planRowSk,
} from "@cobrac/shared";
import { createHash } from "node:crypto";
import { enqueueRun, getPlanJson, putPlanJson, stopEcsTask } from "./aws.js";
import { listOwnCanons } from "./canons.js";
import { compareProjectsByCreation, getJob, listUserProjects, putJob, updateJob } from "./db.js";
import { putProposal, updatePlan } from "./plans.js";

/** A plan job that has not ended: the plan waits for it (draft) or will receive its proposals (re-plan). */
export const isOpenPlanJob = (s: PlanJobState | null | undefined): s is PlanJobState => !!s && (s.status === "waiting" || s.status === "queued" || s.status === "running");

/** What the runner stores when the owner cannot start a job now (English, like job errors). */
export const GATE_ERRORS: Record<"no_key" | "owner_disabled" | "model_not_allowed", string> = {
  no_key: "No API key to run the job with: register one in Settings, or ask an admin for the default API key.",
  owner_disabled: "The owner's account is disabled.",
  model_not_allowed: "The model chosen for this plan is no longer available.",
};

// --- input -----------------------------------------------------------------------------------------------------------

/** The owner's projects (not deleted, newest first) and Canons (not deleted), as the job sees them. */
export async function ownerContext(userId: string): Promise<{ projects: ProjectRecord[]; canons: CanonRecord[] }> {
  const [projects, canons] = await Promise.all([listUserProjects(userId), listOwnCanons(userId)]);
  return { projects: projects.filter((p) => !p.deletedAt).sort(compareProjectsByCreation), canons: canons.filter((c) => !c.deletedAt) };
}

/** The input of a job: the plan's rows as they are, the owner's projects and Canons, the attachments the job reads. */
export function planJobInput(
  plan: PlanRecord,
  x: { kind: PlanJobKind; jobId: string; rows: PlanRowRecord[]; projects: ProjectRecord[]; canons: CanonRecord[]; concurrency: number; wave: number | null; locale: PlanJobState["locale"] },
): PlanJobInput {
  return buildPlanJobInput({
    kind: x.kind,
    planId: plan.planId,
    jobId: x.jobId,
    createdAt: nowIso(),
    locale: x.locale ?? null,
    goal: plan.goal,
    policy: plan.policy ?? "",
    // CSV / TSV / text were read into rows by the API already
    attachments: (plan.attachments ?? []).filter((a) => !isDeterministicPlanAttachment(a.name)).map((a) => ({ id: a.id, name: a.name, key: a.key })),
    rows: [...x.rows]
      .sort((a, b) => a.wave - b.wave || a.order - b.order)
      .map((r) => ({
        rowId: r.rowId,
        roi: r.roi,
        tlf: r.tlf,
        rationale: r.rationale,
        state: r.state,
        wave: r.wave,
        seed: !!r.seed,
        anchors: r.anchors ?? [],
        anchorsSource: r.anchorsSource ?? null,
        projectId: r.projectId ?? r.existing?.projectId ?? null,
        existing: !!r.existing,
      })),
    projects: x.projects.map((p) => ({ projectId: p.projectId, name: p.name ?? p.projectId, roi: p.roi, tlf: p.tlf, status: p.status, completed: p.status === "COMPLETED" && p.hasArtifacts, canonId: p.canonId ?? null })),
    canons: x.canons.map((c) => ({ canonId: c.canonId, name: c.name, policy: c.policy ?? "", headRevision: c.headRevision, memberCount: c.memberCount })),
    concurrency: x.concurrency,
    wave: x.wave,
  });
}

/**
 * Queues the job of `state` (a draft or re-plan that waits). The plan records the job before it is stored and queued,
 * so a step that stops in between leaves a job the next step finds (or a missing one it reports), never one nobody follows.
 * null (nothing queued) when the plan left `plan.status` meanwhile, e.g. cancelled by its owner, which takes no lease.
 */
export async function queuePlanJob(
  plan: PlanRecord,
  kind: PlanJobKind,
  state: PlanJobState,
  rows: PlanRowRecord[],
  owner: UserRecord,
  gate: { policy: ModelPolicy & { source: KeySource }; model: string },
  concurrency: number,
): Promise<PlanJobState | null> {
  const jobId = newId("job_");
  const { projects, canons } = await ownerContext(owner.userId);
  const input = planJobInput(plan, { kind, jobId, rows, projects, canons, concurrency, wave: kind === "replan" ? (state.wave ?? null) : null, locale: state.locale ?? null });
  await putPlanJson(planJobKey(plan.planId, jobId, "input.json"), input);
  const at = nowIso();
  const next: PlanJobState = { ...state, jobId, status: "queued", queuedAt: at, error: null };
  if (!(await updatePlan(plan.planId, kind === "draft" ? { draft: next } : { replan: next }, { status: plan.status }))) return null;
  plan[kind] = next;
  const job: JobRecord = {
    projectId: plan.planId,
    jobId,
    userId: owner.userId,
    type: "plan",
    planJobKind: kind,
    planId: plan.planId,
    status: "QUEUED",
    keySource: gate.policy.source,
    instruction: null,
    pendingAnswer: null,
    locale: input.locale,
    model: gate.model,
    reasoningEffort: PLAN_JOB_REASONING_EFFORT,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    createdAt: at,
    updatedAt: at,
  };
  await putJob(job);
  try {
    await enqueueRun({ version: 1, userId: owner.userId, projectId: plan.planId, jobId, mode: "plan" });
  } catch (e) {
    // a job that was never queued must not hold a slot until the janitor's 24 hours
    await updateJob(plan.planId, jobId, { status: "FAILED", errorMessage: "The job could not be queued.", endedAt: nowIso() });
    throw e;
  }
  return next;
}

// --- following a job -------------------------------------------------------------------------------------------------

export type PlanJobProgress = { to: "queued" } | { to: "running" } | { to: "completed"; job: JobRecord } | { to: "failed"; error: string } | { to: "cancelled"; error: string };

/** Where a queued or running job of a plan stands. */
export function planJobProgress(job: JobRecord | null): PlanJobProgress {
  if (!job) return { to: "failed", error: "The plan job was not found." };
  switch (job.status) {
    case "QUEUED":
      return { to: "queued" };
    case "RUNNING":
    case "FINALIZING":
    case "WAITING_USER_INPUT":
      return { to: "running" };
    case "COMPLETED":
      return { to: "completed", job };
    case "FAILED":
      return { to: "failed", error: job.errorMessage || "The plan job failed." };
    case "CANCELLED":
      return { to: "cancelled", error: job.errorMessage || "The plan job was stopped." };
  }
}

export const readPlanJob = (planId: string, jobId: string | null) => (jobId ? getJob(planId, jobId) : Promise.resolve(null));

/** Stops a plan job that is queued or running (and its Fargate task); a finished one is left as it is. */
export async function stopPlanJob(planId: string, jobId: string | null, reason: string): Promise<void> {
  const job = await readPlanJob(planId, jobId);
  if (!job || (job.status !== "QUEUED" && job.status !== "RUNNING" && job.status !== "FINALIZING")) return;
  await updateJob(planId, job.jobId, { status: "CANCELLED", errorMessage: reason, endedAt: nowIso() });
  if (job.ecsTaskArn) await stopEcsTask(job.ecsTaskArn, reason);
}

/**
 * The result of a finished job, checked again against the input it was given (`parsePlanResult`): result.json is
 * written from the model's reply, so nothing in it is trusted as it is. null when either file is missing or unusable.
 */
export async function readPlanResult(planId: string, kind: PlanJobKind, jobId: string): Promise<ParsedPlanResult | null> {
  const [result, input] = await Promise.all([getPlanJson<PlanJobResult>(planJobKey(planId, jobId, "result.json")), getPlanJson<PlanJobInput>(planJobKey(planId, jobId, "input.json"))]);
  if (!result || !input || result.schema !== PLAN_JOB_RESULT_SCHEMA || result.kind !== kind || result.jobId !== jobId || input.kind !== kind) return null;
  if (!Array.isArray(result.rows) || !Array.isArray(result.proposals)) return null;
  // back to the shape of the model's reply (PLAN_RESULT_SCHEMA), then through the same parser
  const reply = {
    rows: result.rows,
    unread: Array.isArray(result.unread) ? result.unread : [],
    policy: typeof result.policy === "string" ? result.policy : "",
    proposals: result.proposals.map((p) => (p && typeof p === "object" ? { ...(p.row && typeof p.row === "object" ? p.row : {}), kind: p.kind, rowId: p.rowId ?? "", policy: p.policy ?? "", reason: p.reason } : p)),
    notes: typeof result.notes === "string" ? result.notes : "",
  };
  const parsed = parsePlanResult(JSON.stringify(reply), input);
  if (!parsed) return null;
  return { ...parsed, dropped: parsed.dropped + (Number.isInteger(result.dropped) && result.dropped > 0 ? result.dropped : 0) };
}

// --- order -----------------------------------------------------------------------------------------------------------

/**
 * The automatic order of a draft (`orderDraft` with `concurrency` rows per body wave): wave and seed flag of every row
 * that will be built; rows done by an existing project (or skipped) keep their wave and are no seeds. `order` follows
 * the build order: wave, then hub score and priority (the start order inside a wave); unplaced rows last. Mutates and
 * returns `rows`.
 */
export function autoOrder(rows: PlanRowRecord[], concurrency: number): { rows: PlanRowRecord[]; seeds: number; cycle: boolean } {
  const r = orderDraft(rows, concurrency);
  const hub = hubScores(rows.filter((x) => x.state !== "skipped"));
  const prio = (x: PlanRowRecord) => (typeof x.priority === "number" ? x.priority : 0);
  for (const row of rows) {
    const w = r.wave.get(row.rowId);
    if (w !== undefined) {
      row.wave = w;
      row.seed = r.seed.get(row.rowId) ?? false;
    } else {
      row.wave = row.wave >= 1 ? row.wave : 1;
      row.seed = false;
    }
  }
  const placed = rows
    .filter((x) => r.wave.has(x.rowId))
    .sort((a, b) => a.wave - b.wave || (hub.get(b.rowId) ?? 0) - (hub.get(a.rowId) ?? 0) || prio(b) - prio(a) || (a.rowId < b.rowId ? -1 : 1));
  const rest = rows.filter((x) => !r.wave.has(x.rowId)).sort((a, b) => a.order - b.order);
  [...placed, ...rest].forEach((row, i) => (row.order = i));
  return { rows, seeds: [...r.seed.values()].filter(Boolean).length, cycle: r.cycle };
}

// --- draft -----------------------------------------------------------------------------------------------------------

/**
 * A draft result applied to the plan's rows: rows it refers to get anchors, dependencies, priority (and a rationale
 * when theirs is empty); new rows are added (up to PLAN_LIMITS.maxRows); every row of the result is matched with the
 * owner's projects (existing / duplicate); rows it does not mention stay as they are. Then the rows are ordered.
 */
export function draftRows(
  planId: string,
  current: PlanRowRecord[],
  parsed: Pick<ParsedPlanResult, "rows">,
  projects: ProjectRecord[],
  concurrency: number,
  now: string,
): { rows: PlanRowRecord[]; added: number; dropped: number; seeds: number; cycle: boolean } {
  const rows = current.map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  const byKey = new Map(rows.map((r) => [planRowKey(r.roi, r.tlf), r]));
  /** The model's row ids → row IDs */
  const ids = new Map<string, string>();
  const touched: [PlanRowRecord, (typeof parsed.rows)[number]][] = [];
  let order = rows.reduce((m, r) => Math.max(m, r.order + 1), 0);
  let added = 0;
  let dropped = 0;
  const seen = new Set<string>();
  for (const d of parsed.rows) {
    // a new row with the ROI × TLF of a row in the plan describes that row
    const target = d.ref ? byId.get(d.ref) : byKey.get(planRowKey(d.roi, d.tlf));
    if ((d.ref && !target) || (target && seen.has(target.rowId))) {
      dropped++;
      continue;
    }
    if (target) {
      seen.add(target.rowId);
      ids.set(d.id, target.rowId);
      touched.push([target, d]);
      continue;
    }
    if (rows.length >= PLAN_LIMITS.maxRows) {
      dropped++;
      continue;
    }
    let rowId = generatePlanRowId();
    while (byId.has(rowId)) rowId = generatePlanRowId();
    const row: PlanRowRecord = { planId, sk: planRowSk(rowId), rowId, order: order++, wave: 1, roi: d.roi, tlf: d.tlf, rationale: d.rationale, priority: d.priority, source: "llm", sourceRow: null, state: "pending", projectId: null, attempts: 0, createdAt: now, updatedAt: now };
    rows.push(row);
    byId.set(rowId, row);
    byKey.set(planRowKey(row.roi, row.tlf), row);
    ids.set(d.id, rowId);
    seen.add(rowId);
    touched.push([row, d]);
    added++;
  }
  const completed = new Map(projects.filter((p) => !p.deletedAt && p.status === "COMPLETED" && p.hasArtifacts).map((p) => [p.projectId, p]));
  for (const [row, d] of touched) {
    if (d.anchors.length) {
      row.anchors = d.anchors;
      row.anchorsSource = "predicted";
    }
    const deps = d.dependsOn.map((x) => ids.get(x) ?? (byId.has(x) ? x : null)).filter((x): x is string => !!x && x !== row.rowId);
    dropped += d.dependsOn.length - deps.length;
    row.dependsOn = [...new Set(deps)];
    if (d.priority !== null) row.priority = d.priority;
    if (!row.rationale.trim() && d.rationale) row.rationale = d.rationale;
    const named = d.existingProjectId ? completed.get(d.existingProjectId) : undefined;
    const m = named ? { existing: { projectId: named.projectId, name: named.name ?? named.projectId }, duplicateOf: null } : matchExistingProject(row, projects);
    row.existing = m.existing;
    row.duplicateOf = m.duplicateOf;
    row.updatedAt = now;
  }
  const o = autoOrder(rows, concurrency);
  return { rows: o.rows, added, dropped, seeds: o.seeds, cycle: o.cycle };
}

// --- re-plan ---------------------------------------------------------------------------------------------------------

/** A proposal ID derived from the job and the proposal's place in it, so a result stored twice yields the same items. */
function proposalIdOf(jobId: string, index: number): string {
  const bytes = createHash("sha256").update(`${jobId}#${index}`).digest();
  let i = 0;
  return generatePlanProposalId(() => bytes[i++ % bytes.length] / 256);
}

/** Stores the proposals of a re-plan result (open until the owner decides); returns how many there are. */
export async function storeProposals(planId: string, jobId: string, wave: number | null, parsed: Pick<ParsedPlanResult, "proposals">): Promise<number> {
  const at = nowIso();
  for (const [i, p] of parsed.proposals.entries()) {
    const proposalId = proposalIdOf(jobId, i);
    // the parsed row also carries the wave and priority of a typed row: keep the proposal's fields only
    const row = p.row ? { roi: p.row.roi, tlf: p.row.tlf, rationale: p.row.rationale, anchors: p.row.anchors, dependsOn: p.row.dependsOn } : null;
    const record: PlanProposalRecord = { planId, sk: planProposalSk(proposalId), proposalId, kind: p.kind, row, rowId: p.rowId, policy: p.policy, reason: p.reason, status: "open", jobId, wave, createdAt: at, decidedAt: null, decidedBy: null };
    await putProposal(record);
  }
  return parsed.proposals.length;
}
