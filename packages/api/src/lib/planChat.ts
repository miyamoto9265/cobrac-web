// The chat with the Orchestrator (shared/src/planChat.ts). The owner's message is stored and asks a `chat` job; the
// runner queues it on a free slot and follows it (`stepChat`, under the plan's lease, like the draft); once it is done
// the step marks it ready (`chatReady`) and, after the lease is given back, `applyChat` checks the result against its
// input again, carries out its actions as the owner (they asked for them) and stores the reply with the outcome of each
// action. One `applyChat` claims a ready reply (`chatReady` cleared conditionally), so nothing is done twice. Changes to
// a draft keep the rows and policy before them (planChatUndoKey) so that the owner can undo the reply.
import { HTTPException } from "hono/http-exception";
import type {
  JobRecord,
  PlanChatAction,
  PlanChatInput,
  PlanChatMessage,
  PlanChatOutcome,
  PlanChatResult,
  PlanChatState,
  PlanProposalRecord,
  PlanRecord,
  PlanRowRecord,
  PostPlanChatRequest,
  ProjectRecord,
  UiLocale,
  UserRecord,
} from "@cobrac/shared";
import {
  PLAN_CHAT_INPUT_SCHEMA,
  PLAN_CHAT_LIMITS,
  PLAN_CHAT_RESULT_SCHEMA,
  PLAN_JOB_REASONING_EFFORT,
  PLAN_LIMITS,
  SLOT_JOB_STATUSES,
  buildPlanChatInput,
  cleanPlanNote,
  countRows,
  freeSlots,
  generatePlanRowId,
  isOpenPlanChat,
  newId,
  nowIso,
  parsePlanChatResult,
  planChatActionRaw,
  planChatActions,
  planChatPhase,
  planChatRowLabel,
  planChatSk,
  planChatUndoKey,
  planJobKey,
  planPolicyOf,
  planProposalSk,
  planRowKey,
  planRowSk,
} from "@cobrac/shared";
import { enqueueRun, getPlanJson, putPlanJson } from "./aws.js";
import { getCanon } from "./canons.js";
import { currentLimits } from "./concurrency.js";
import { getUser, listJobsByStatus, listUserProjects, putJob, updateJob } from "./db.js";
import { bad, notFound } from "./http.js";
import { planSpendUsd } from "./planCost.js";
import { GATE_ERRORS, autoOrder, planJobProgress, readPlanJob } from "./planJobs.js";
import { answerDraft, kick, pausePlan, requestDraft, requireEditable, requirePlanRun, resolveRow, resumePlan, retryRow, setMatch, skipRow } from "./planOps.js";
import { applyProposal } from "./planProposals.js";
import { type AdvanceResult, RUNNER, type PlanGate, runGate } from "./planRunner.js";
import {
  deleteRow,
  getPlan,
  holdsPlan,
  listChatMessages,
  listPlanEvents,
  listRows,
  putChatMessage,
  putPlanEvent,
  putProposal,
  putRow,
  updateChatMessage,
  updatePlan,
  updateRow,
  withPlanLease,
} from "./plans.js";
import { jobKeySource } from "./runs.js";

const conflict = (message: string) => new HTTPException(409, { message });

/** A reply marked ready but never applied (the step that claimed it stopped) is given up after this long. */
const STALE_READY_MS = 10 * 60 * 1000;

function chatMessage(planId: string, role: PlanChatMessage["role"], text: string, by: string, extra: Partial<PlanChatMessage> = {}): PlanChatMessage {
  const createdAt = nowIso();
  const messageId = extra.messageId ?? newId("m_");
  return { planId, sk: planChatSk(createdAt, messageId), messageId, role, text, by, createdAt, ...extra };
}

// --- the owner writes ----------------------------------------------------------------------------------------------------

/**
 * The owner's message (`u` is who the request acts as: the owner, or a team admin acting for them; `by` who wrote it).
 * While the Orchestrator waits for answers to its questions before the draft, the message answers them (the draft job
 * reads the chat); otherwise it asks a chat job, unless one is already on its way (it takes the newest messages when it
 * is done). A draft being written answers once it is ready.
 */
export async function postChatMessage(u: UserRecord, by: string, plan: PlanRecord, body: PostPlanChatRequest, locale: UiLocale | null): Promise<{ message: PlanChatMessage; plan: PlanRecord }> {
  const text = cleanPlanNote(typeof body?.text === "string" ? body.text : "");
  if (!text) throw bad("メッセージを入力してください");
  if ([...text].length > PLAN_CHAT_LIMITS.message) throw bad(`メッセージは ${PLAN_CHAT_LIMITS.message} 文字までです`);
  await requirePlanRun(u, plan);
  const message = chatMessage(plan.planId, "user", text, by);
  await putChatMessage(message);
  if (plan.status === "DRAFTING" && plan.draft?.status === "asking") {
    await answerDraft(u, plan, { chat: true });
    return { message, plan: (await getPlan(plan.planId, true)) ?? plan };
  }
  await withPlanLease(plan.planId, async (fresh) => {
    if (isOpenPlanChat(fresh.chat)) return;
    const chat: PlanChatState = { jobId: null, status: "waiting", requestedAt: message.createdAt, requestedBy: by, locale };
    if (!(await updatePlan(plan.planId, { chat }))) throw conflict("ミッションの状態が変わりました。再読み込みしてください");
  });
  await kick(plan.planId);
  return { message, plan: (await getPlan(plan.planId, true)) ?? plan };
}

// --- the runner --------------------------------------------------------------------------------------------------------

/** The input of a chat job: the plan as it is now, the conversation and what happened recently. */
async function chatJobInput(plan: PlanRecord, jobId: string, locale: UiLocale | null): Promise<{ input: PlanChatInput; upto: string | null }> {
  const [rows, events, messages, projectList] = await Promise.all([listRows(plan.planId, true), listPlanEvents(plan.planId), listChatMessages(plan.planId, true), listUserProjects(plan.ownerUserId)]);
  const projects = new Map(projectList.map((p) => [p.projectId, p]));
  const confirmed = plan.status !== "DRAFT" && plan.status !== "DRAFTING";
  const canon = plan.canonId ? await getCanon(plan.canonId) : null;
  const rowName = new Map(rows.map((r) => [r.rowId, planChatRowLabel(r)]));
  const ordered = [...messages].sort((a, b) => (a.sk < b.sk ? -1 : 1));
  const upto = ordered.filter((m) => m.role === "user").at(-1)?.createdAt ?? null;
  const detail = (d: Record<string, string | number | null> | undefined) =>
    Object.entries(d ?? {})
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
  const input = buildPlanChatInput({
    planId: plan.planId,
    jobId,
    createdAt: nowIso(),
    locale,
    phase: planChatPhase(plan.status),
    actions: planChatActions(plan.status, plan.pausedReason),
    plan: {
      name: plan.name,
      goal: plan.goal,
      status: plan.status,
      pausedReason: plan.pausedReason ?? null,
      policy: planPolicyOf(plan.policy),
      ordering: plan.ordering === "auto" ? "auto" : "manual",
      autonomous: plan.settings.autonomous ?? null,
      spentUsd: confirmed ? Math.round((await planSpendUsd(plan, rows, projects)) * 100) / 100 : null,
      canon: canon ? { name: canon.name, isNew: false } : plan.canonNew ? { name: plan.canonNew.name, isNew: true } : null,
      counts: Object.fromEntries(Object.entries(countRows(rows)).filter(([, n]) => n > 0)),
    },
    rows: [...rows]
      .sort((a, b) => a.wave - b.wave || a.order - b.order)
      .map((r) => {
        const p: ProjectRecord | undefined = r.projectId ? projects.get(r.projectId) : undefined;
        return {
          rowId: r.rowId,
          roi: r.roi,
          tlf: r.tlf,
          rationale: r.rationale,
          state: r.state,
          wave: r.wave,
          seed: !!r.seed,
          priority: r.priority ?? null,
          dependsOn: r.dependsOn ?? [],
          anchors: r.anchors ?? [],
          existing: !!r.existing,
          project: p ? { name: p.name ?? p.projectId, status: p.status } : null,
          prNo: r.prNo ?? null,
          reason: r.state === "attention" ? (r.attentionReason ?? null) : r.state === "decision" ? (r.decisionReason ?? null) : r.state === "skipped" ? (r.autoSkip?.reason ?? null) : null,
          error: r.lastError ?? null,
          ai: r.aiResolution ? `${r.aiResolution.action}: ${r.aiResolution.reason}` : null,
        };
      }),
    messages: ordered.filter((m) => !m.failed).map((m) => ({ role: m.role, text: m.text, at: m.createdAt })),
    events: events
      .sort((a, b) => (a.sk < b.sk ? 1 : -1))
      .slice(0, PLAN_CHAT_LIMITS.events)
      .map((e) => ({ type: e.type, at: e.at, row: e.rowId ? (rowName.get(e.rowId) ?? null) : null, detail: detail(e.detail) })),
  });
  return { input, upto };
}

/** Queues the chat job of a plan (the plan records it before the job is stored and queued, as a draft does). */
async function queueChatJob(plan: PlanRecord, c: PlanChatState, owner: UserRecord, gate: PlanGate): Promise<string | null> {
  const jobId = newId("job_");
  const { input, upto } = await chatJobInput(plan, jobId, c.locale ?? plan.settings.locale ?? null);
  await putPlanJson(planJobKey(plan.planId, jobId, "input.json"), input);
  const at = nowIso();
  const next: PlanChatState = { ...c, jobId, status: "queued", upto, error: null };
  if (!(await updatePlan(plan.planId, { chat: next }))) return null;
  plan.chat = next;
  const job: JobRecord = {
    projectId: plan.planId,
    jobId,
    userId: owner.userId,
    type: "plan",
    planJobKind: "chat",
    planId: plan.planId,
    status: "QUEUED",
    keySource: jobKeySource(gate.policy, gate.orchestratorModel),
    ...(plan.teamId ? { teamId: plan.teamId } : {}),
    instruction: null,
    pendingAnswer: null,
    locale: input.locale,
    model: gate.orchestratorModel,
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
    await updateJob(plan.planId, jobId, { status: "FAILED", errorMessage: "The job could not be queued.", endedAt: nowIso() });
    throw e;
  }
  return jobId;
}

/** The chat job ended without a reply: the owner reads why in the chat. */
async function failChat(plan: PlanRecord, c: PlanChatState, error: string) {
  const chat: PlanChatState = { ...c, status: "failed", error: error.slice(0, 500), endedAt: nowIso() };
  if (!(await updatePlan(plan.planId, { chat, chatReady: null }))) return;
  plan.chat = chat;
  await putChatMessage(chatMessage(plan.planId, "orchestrator", error.slice(0, 500), RUNNER, { failed: true, jobId: c.jobId, messageId: c.jobId ? `m_${c.jobId}` : undefined }));
}

/**
 * One step of a plan's chat job, under the plan's lease: queue it when a slot is free (a draft being written goes
 * first), follow it, and mark its reply ready (`result.chatReady`) for `applyChat` once the lease is given back.
 */
export async function stepChat(plan: PlanRecord, owner: UserRecord | null, now: number, result: AdvanceResult): Promise<void> {
  const c = plan.chat;
  if (!isOpenPlanChat(c)) return;
  if (c.status === "waiting") {
    if (plan.status === "DRAFTING") return;
    const limits = await currentLimits(now);
    const active = (await Promise.all(SLOT_JOB_STATUSES.map((st) => listJobsByStatus(st)))).flat();
    if (freeSlots(limits, active, plan.ownerUserId) <= 0) return;
    const gate = await runGate(plan, owner);
    if (!gate.ok) return failChat(plan, c, GATE_ERRORS[gate.reason as keyof typeof GATE_ERRORS] ?? gate.reason);
    try {
      const jobId = await queueChatJob(plan, c, owner!, gate);
      if (jobId) {
        result.planJob = jobId;
        result.changed++;
      }
    } catch (e) {
      console.error(`[plan ${plan.planId}] chat job could not be queued`, e);
      await failChat(plan, c, "The chat job could not be queued.");
    }
    return;
  }
  if (c.status === "ready") {
    // ready and not yet applied: applied after this step; claimed long ago and never finished: given up
    if (plan.chatReady === c.jobId) result.chatReady = true;
    else if (now - Date.parse(c.endedAt ?? c.requestedAt) > STALE_READY_MS) await failChat(plan, c, "The reply could not be stored.");
    return;
  }
  const p = planJobProgress(await readPlanJob(plan.planId, c.jobId));
  if (p.to === "queued") return;
  if (p.to === "running") {
    if (c.status !== "running") {
      plan.chat = { ...c, status: "running" };
      await updatePlan(plan.planId, { chat: plan.chat });
      result.changed++;
    }
    return;
  }
  if (p.to !== "completed") return failChat(plan, c, p.error);
  const ready: PlanChatState = { ...c, status: "ready", endedAt: nowIso() };
  if (!(await updatePlan(plan.planId, { chat: ready, chatReady: c.jobId }))) return;
  plan.chat = ready;
  plan.chatReady = c.jobId;
  result.changed++;
  result.chatReady = true;
}

// --- carrying out a reply ------------------------------------------------------------------------------------------------

/** The rows and policy of a draft before a reply changed them (for 「元に戻す」). */
interface ChatUndo {
  rows: PlanRowRecord[];
  policy: PlanRecord["policy"] | null;
  ordering: PlanRecord["ordering"] | null;
}

const fail = (a: PlanChatAction, error: string, label?: string | null): PlanChatOutcome => ({ kind: a.kind, rowId: "rowId" in a ? a.rowId : null, label: label ?? null, ok: false, error });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Changes to a draft, under its lease, all at once: rows added, dropped, changed or given a priority, a new policy. A
 * plan ordered automatically is ordered again. The rows and policy before them are kept for 「元に戻す」.
 */
async function applyToDraft(owner: UserRecord, plan: PlanRecord, actions: PlanChatAction[], jobId: string): Promise<{ outcomes: PlanChatOutcome[]; changed: boolean }> {
  return withPlanLease(plan.planId, async (fresh) => {
    if (fresh.status !== "DRAFT") return { outcomes: actions.map((a) => fail(a, "下書きの作成が始まったため、変更しませんでした")), changed: false };
    const before = await listRows(plan.planId, true);
    const rows = before.map((r) => ({ ...r }));
    const byId = new Map(rows.map((r) => [r.rowId, r]));
    const removed = new Set<string>();
    const now = nowIso();
    let projects: ProjectRecord[] | null = null;
    const ownerProjects = async () => (projects ??= await listUserProjects(fresh.ownerUserId));
    const live = () => rows.filter((r) => !removed.has(r.rowId));
    const taken = (key: string, except?: string) => live().some((r) => r.rowId !== except && r.state !== "skipped" && planRowKey(r.roi, r.tlf) === key);
    const outcomes: PlanChatOutcome[] = [];
    let policy: PlanRecord["policy"] | null = null;
    for (const a of actions) {
      const row = "rowId" in a ? byId.get(a.rowId) : undefined;
      const label = row ? planChatRowLabel(row) : null;
      if ("rowId" in a && (!row || removed.has(a.rowId))) {
        outcomes.push(fail(a, "そのプロジェクトは下書きにありません"));
        continue;
      }
      switch (a.kind) {
        case "add_row": {
          if (taken(planRowKey(a.roi, a.tlf))) {
            outcomes.push(fail(a, "同じ ROI × TLF のプロジェクトがすでにあります", planChatRowLabel(a)));
            continue;
          }
          if (live().length >= PLAN_LIMITS.maxRows) {
            outcomes.push(fail(a, `プロジェクトは ${PLAN_LIMITS.maxRows} 件までです`, planChatRowLabel(a)));
            continue;
          }
          const rowId = generatePlanRowId();
          const r: PlanRowRecord = {
            planId: plan.planId,
            sk: planRowSk(rowId),
            rowId,
            order: rows.reduce((m, x) => Math.max(m, x.order + 1), 0),
            wave: Math.max(1, rows.reduce((m, x) => Math.max(m, x.wave), 0)),
            roi: a.roi,
            tlf: a.tlf,
            rationale: a.rationale,
            priority: null,
            source: "llm",
            sourceRow: null,
            state: "pending",
            projectId: null,
            attempts: 0,
            ...(a.anchors.length ? { anchors: a.anchors, anchorsSource: "predicted" as const } : {}),
            ...(a.dependsOn.length ? { dependsOn: a.dependsOn.filter((d) => byId.has(d) && !removed.has(d)) } : {}),
            createdAt: now,
            updatedAt: now,
          };
          setMatch(r, await ownerProjects());
          rows.push(r);
          byId.set(rowId, r);
          outcomes.push({ kind: a.kind, rowId, label: planChatRowLabel(r), ok: true });
          break;
        }
        case "remove_row":
          removed.add(row!.rowId);
          outcomes.push({ kind: a.kind, rowId: row!.rowId, label, ok: true });
          break;
        case "edit_row": {
          const key = planRowKey(a.roi, a.tlf);
          if (taken(key, row!.rowId)) {
            outcomes.push(fail(a, "同じ ROI × TLF のプロジェクトがすでにあります", label));
            continue;
          }
          const moved = key !== planRowKey(row!.roi, row!.tlf);
          Object.assign(row!, { roi: a.roi, tlf: a.tlf, rationale: a.rationale, updatedAt: now });
          if (moved && !row!.rebuild) setMatch(row!, await ownerProjects());
          outcomes.push({ kind: a.kind, rowId: row!.rowId, label: planChatRowLabel(row!), ok: true });
          break;
        }
        case "priority":
          Object.assign(row!, { priority: a.priority, updatedAt: now });
          outcomes.push({ kind: a.kind, rowId: row!.rowId, label, ok: true });
          break;
        case "policy":
          policy = a.policy;
          outcomes.push({ kind: a.kind, ok: true });
          break;
        default:
          outcomes.push(fail(a, "下書きではできない操作です"));
      }
    }
    if (!outcomes.some((o) => o.ok)) return { outcomes, changed: false };
    const next = live();
    for (const r of next) if (r.dependsOn?.some((d) => removed.has(d))) r.dependsOn = r.dependsOn.filter((d) => !removed.has(d));
    const rowsChanged = outcomes.some((o) => o.ok && o.kind !== "policy");
    if (rowsChanged && fresh.ordering === "auto") autoOrder(next, (await currentLimits()).effective);
    const undo: ChatUndo = { rows: before, policy: fresh.policy ?? null, ordering: fresh.ordering ?? null };
    await putPlanJson(planChatUndoKey(plan.planId, jobId), undo);
    if (!(await holdsPlan(fresh, "DRAFT"))) return { outcomes: actions.map((a) => fail(a, "ミッションの状態が変わったため、変更しませんでした")), changed: false };
    for (const id of removed) await deleteRow(plan.planId, id);
    if (rowsChanged) for (const r of next) await putRow(r);
    const values: Partial<PlanRecord> = { rowCount: next.length, rowCounts: countRows(next), ...(policy ? { policy } : {}) };
    if (!(await updatePlan(plan.planId, values, { status: "DRAFT" }))) return { outcomes: actions.map((a) => fail(a, "ミッションの状態が変わったため、変更しませんでした")), changed: false };
    if (rowsChanged) await putPlanEvent(plan.planId, "rows_changed", RUNNER, { detail: { rows: next.length, chat: 1 } });
    return { outcomes, changed: true };
  });
}

/** An add, remove or policy change of a running plan goes through a proposal, applied at once (the owner asked for it). */
async function applyAsProposal(owner: UserRecord, plan: PlanRecord, a: PlanChatAction, jobId: string, i: number): Promise<PlanChatOutcome> {
  const proposalId = `p_${jobId.replace(/^job_/, "")}_${i}`;
  const label = a.kind === "add_row" ? planChatRowLabel(a) : null;
  const record: PlanProposalRecord = {
    planId: plan.planId,
    sk: planProposalSk(proposalId),
    proposalId,
    kind: a.kind === "add_row" ? "add" : a.kind === "remove_row" ? "remove" : "policy",
    row: a.kind === "add_row" ? { roi: a.roi, tlf: a.tlf, rationale: a.rationale, anchors: a.anchors, dependsOn: a.dependsOn } : null,
    rowId: a.kind === "remove_row" ? a.rowId : null,
    policy: a.kind === "policy" ? a.policy : null,
    reason: "chat",
    status: "open",
    jobId,
    wave: plan.activeWave ?? null,
    createdAt: nowIso(),
  };
  await putProposal(record);
  return withPlanLease(plan.planId, async (fresh) => {
    if (fresh.status !== "RUNNING" && fresh.status !== "PAUSED") return fail(a, "実行中のミッションではありません", label);
    const o = await applyProposal(fresh, record, owner.userId);
    if (!o.ok) return fail(a, "stale" in o ? o.stale : "full" in o ? o.full : "すでに処理されています", label);
    const rowId = a.kind === "remove_row" ? a.rowId : a.kind === "add_row" ? ((await listRows(plan.planId, true)).find((r) => planRowKey(r.roi, r.tlf) === planRowKey(a.roi, a.tlf))?.rowId ?? null) : null;
    return { kind: a.kind, rowId, label, ok: true };
  });
}

/** The actions of a running or paused plan, one by one as the owner; each reads the plan again. */
async function applyToRun(owner: UserRecord, planId: string, actions: PlanChatAction[], jobId: string): Promise<PlanChatOutcome[]> {
  const outcomes: PlanChatOutcome[] = [];
  for (const [i, a] of actions.entries()) {
    const plan = await getPlan(planId, true);
    if (!plan) break;
    const row = "rowId" in a ? (await listRows(planId, true)).find((r) => r.rowId === a.rowId) : undefined;
    const label = row ? planChatRowLabel(row) : null;
    if ("rowId" in a && !row) {
      outcomes.push(fail(a, "そのプロジェクトはミッションにありません"));
      continue;
    }
    if (!planChatActions(plan.status, plan.pausedReason).includes(a.kind)) {
      outcomes.push(fail(a, "ミッションの状態が変わったため、できませんでした", label));
      continue;
    }
    try {
      switch (a.kind) {
        case "retry":
          await retryRow(owner, plan, a.rowId);
          break;
        case "skip":
          await skipRow(owner, plan, a.rowId);
          break;
        case "resolve":
          await resolveRow(owner, plan, a.rowId, a.action);
          break;
        case "pause":
          await pausePlan(owner, plan);
          break;
        case "resume":
          await resumePlan(owner, plan, {});
          break;
        case "priority":
          if (!(await updateRow(planId, a.rowId, { priority: a.priority }, { state: "pending" }))) throw new Error("このプロジェクトはもう始まっています");
          break;
        case "add_row":
        case "remove_row":
        case "policy":
          outcomes.push(await applyAsProposal(owner, plan, a, jobId, i));
          continue;
        default:
          throw new Error("実行中のミッションではできない操作です");
      }
      outcomes.push({ kind: a.kind, rowId: "rowId" in a ? a.rowId : null, label, ok: true });
    } catch (e) {
      outcomes.push(fail(a, errText(e), label));
    }
  }
  return outcomes;
}

/**
 * Stores a ready reply and carries out its actions (after the step that found it ready gave the lease back). The one
 * that clears `chatReady` does it; the actions are checked again against the job's input and the plan as it is now.
 * A newer message of the owner, written while the job ran, asks the next job.
 */
export async function applyChat(planId: string): Promise<void> {
  const plan = await getPlan(planId, true);
  const jobId = plan?.chatReady;
  if (!plan || !jobId || plan.chat?.jobId !== jobId || plan.chat.status !== "ready") return;
  if (!(await updatePlan(planId, { chatReady: null }, { chatReady: jobId }))) return;
  const c = plan.chat;
  const [result, input] = await Promise.all([getPlanJson<PlanChatResult>(planJobKey(planId, jobId, "result.json")), getPlanJson<PlanChatInput>(planJobKey(planId, jobId, "input.json"))]);
  const parsed =
    result && input && result.schema === PLAN_CHAT_RESULT_SCHEMA && input.schema === PLAN_CHAT_INPUT_SCHEMA && result.jobId === jobId && Array.isArray(result.actions)
      ? parsePlanChatResult(JSON.stringify({ reply: result.reply, actions: result.actions.map(planChatActionRaw) }), input)
      : null;
  if (!parsed) {
    await failChat(plan, c, "The reply of the chat job could not be read.");
    return;
  }
  const owner = await getUser(plan.ownerUserId);
  let outcomes: PlanChatOutcome[] = [];
  let undoable = false;
  const actions = parsed.actions;
  if (actions.length && (!owner || owner.disabled)) outcomes = actions.map((a) => fail(a, "ミッションの作成者のアカウントが使えないため、できませんでした"));
  else if (actions.length) {
    const redraft = actions.find((a) => a.kind === "redraft");
    if (redraft) {
      try {
        if (plan.status !== "DRAFT") throw new Error("下書きを作り直せるのは、開始する前の下書きだけです");
        await requestDraft(owner!, plan, c.locale ?? null);
        outcomes = [{ kind: "redraft", ok: true }];
      } catch (e) {
        outcomes = [fail(redraft, errText(e))];
      }
    } else if (plan.status === "DRAFT") {
      try {
        const r = await applyToDraft(owner!, plan, actions, jobId);
        outcomes = r.outcomes;
        undoable = r.changed;
      } catch (e) {
        outcomes = actions.map((a) => fail(a, errText(e)));
      }
    } else if (plan.status === "RUNNING" || plan.status === "PAUSED") outcomes = await applyToRun(owner!, planId, actions, jobId);
    else outcomes = actions.map((a) => fail(a, "ミッションの状態が変わったため、できませんでした"));
  }
  await putChatMessage(chatMessage(planId, "orchestrator", parsed.reply, RUNNER, { messageId: `m_${jobId}`, jobId, ...(outcomes.length ? { outcomes } : {}), ...(undoable ? { undoable: true } : {}) }));
  if (outcomes.length) await putPlanEvent(planId, "chat_applied", RUNNER, { detail: { actions: outcomes.length, done: outcomes.filter((o) => o.ok).length } });
  // a message written while the job ran gets the next reply
  const newer = (await listChatMessages(planId, true)).some((m) => m.role === "user" && (!c.upto || m.createdAt > c.upto));
  const next: PlanChatState = newer ? { jobId: null, status: "waiting", requestedAt: nowIso(), requestedBy: c.requestedBy, locale: c.locale ?? null } : { ...c, status: "done", endedAt: nowIso() };
  await updatePlan(planId, { chat: next });
  if (newer) await kick(planId);
}

/**
 * 「元に戻す」: the rows and policy of a draft as they were before a reply of the Orchestrator changed them. Only the
 * latest reply that changed the draft, and only while it is a draft; edits made after it are undone with it.
 */
export async function undoChat(u: UserRecord, plan: PlanRecord, messageId: string): Promise<PlanRecord> {
  requireEditable(plan);
  const messages = await listChatMessages(plan.planId, true);
  const m = messages.find((x) => x.messageId === messageId);
  if (!m || m.role !== "orchestrator" || !m.jobId) throw notFound();
  if (!m.undoable || m.undoneAt) throw conflict("この変更は元に戻せません");
  const later = messages.filter((x) => x.undoable && !x.undoneAt && x.sk > m.sk);
  if (later.length) throw conflict("新しい変更から順に元に戻してください");
  const undo = await getPlanJson<ChatUndo>(planChatUndoKey(plan.planId, m.jobId));
  if (!undo || !Array.isArray(undo.rows)) throw conflict("この変更は元に戻せません");
  return withPlanLease(plan.planId, async (fresh) => {
    requireEditable(fresh);
    const current = await listRows(plan.planId, true);
    const keep = new Set(undo.rows.map((r) => r.rowId));
    if (!(await holdsPlan(fresh, "DRAFT"))) throw conflict("ミッションの状態が変わりました。再読み込みしてください");
    for (const r of current) if (!keep.has(r.rowId)) await deleteRow(plan.planId, r.rowId);
    for (const r of undo.rows) await putRow({ ...r, updatedAt: nowIso() });
    const values: Partial<PlanRecord> = { rowCount: undo.rows.length, rowCounts: countRows(undo.rows), ...(undo.policy ? { policy: undo.policy } : {}), ...(undo.ordering ? { ordering: undo.ordering } : {}) };
    if (!(await updatePlan(plan.planId, values, { status: "DRAFT" }))) throw conflict("ミッションの状態が変わりました。再読み込みしてください");
    await updateChatMessage(plan.planId, m.sk, { undoneAt: nowIso() });
    await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { rows: undo.rows.length, undo: 1 } });
    return { ...fresh, ...values };
  });
}
