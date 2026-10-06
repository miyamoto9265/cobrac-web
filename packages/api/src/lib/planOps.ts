// What the plan routes do. Owner only: other users' plans are 404. Nothing is queued before confirmation.
import { HTTPException } from "hono/http-exception";
import type {
  CreatePlanRequest,
  NormalizedPlanRow,
  CreatePlanResponse,
  PlanDetailResponse,
  PlanRecord,
  PlanRowInput,
  PlanRowRecord,
  PlanRowRejected,
  PlanRowView,
  PlanSettings,
  UiLocale,
  UpdatePlanRequest,
  UserRecord,
} from "@cobrac/shared";
import {
  ACTIVE_PROJECT_STATUSES,
  HARNESS_RULES,
  PLAN_LIMITS,
  PLAN_META_SK,
  PLAN_ROW_ID_REGEX,
  TRACKED_ROW_STATES,
  byWaveAndOrder,
  cleanPlanNote,
  countRows,
  estimatePlan,
  generatePlanRowId,
  isPlanId,
  isProjectDeleted,
  normalizePlanRow,
  normalizeProjectName,
  nowIso,
  parsePlanRowsCsv,
  planRowKey,
  planRowSk,
  waveSizes,
} from "@cobrac/shared";
import { reserveNewId } from "./catalog.js";
import { currentLimits } from "./concurrency.js";
import { getProject, listUserProjects } from "./db.js";
import { bad, notFound } from "./http.js";
import { advancePlan } from "./planRunner.js";
import { deleteRow, getPlan, listPlanEvents, listRows, putPlan, putPlanEvent, putRow, setPlanStatus, updatePlan, updateRow } from "./plans.js";
import { deploymentDefaultModel, implicitModel, isEffort, normModel, requireModel, requireRunKey, stopProject } from "./runs.js";

const conflict = (message: string) => new HTTPException(409, { message });

/** The caller's own, not-deleted plan; anything else is 404. */
export async function loadOwnPlan(u: UserRecord, planId: string): Promise<PlanRecord> {
  if (!isPlanId(planId)) throw notFound();
  const plan = await getPlan(planId);
  if (!plan || plan.deletedAt || plan.ownerUserId !== u.userId) throw notFound();
  return plan;
}

function planName(v: unknown): string {
  const n = normalizeProjectName(v);
  if ("error" in n) throw bad(`名前が不正です（${n.error}）`);
  return n.name;
}

function planGoal(v: unknown): string {
  const goal = cleanPlanNote(v);
  if ([...goal].length > PLAN_LIMITS.maxGoal) throw bad(`目標は ${PLAN_LIMITS.maxGoal} 文字までです`);
  return goal;
}

function csvText(v: unknown): string {
  if (typeof v !== "string") throw bad("csv が不正です");
  if (v.length > PLAN_LIMITS.maxCsvChars) throw bad("CSV が大きすぎます");
  if (v.includes("\u0000")) throw bad("CSV として読めないファイルです");
  return v;
}

/** Rows of a form, checked; any unusable row is a 400 that names it. Existing rows keep their ID, state and history. */
function checkRowInputs(inputs: unknown): { input: PlanRowInput; row: NormalizedPlanRow }[] {
  if (!Array.isArray(inputs)) throw bad("rows が不正です");
  if (inputs.length > PLAN_LIMITS.maxRows) throw bad(`行は ${PLAN_LIMITS.maxRows} 行までです`);
  const seen = new Set<string>();
  return inputs.map((raw, i) => {
    const input = (raw ?? {}) as PlanRowInput;
    const n = normalizePlanRow(input);
    if ("reason" in n) throw bad(`${i + 1} 行目: ${REASON_JA[n.reason]}`);
    const key = planRowKey(n.row.roi, n.row.tlf);
    if (seen.has(key)) throw bad(`${i + 1} 行目: ${REASON_JA.duplicate}`);
    seen.add(key);
    return { input, row: n.row };
  });
}

const REASON_JA: Record<PlanRowRejected["reason"], string> = {
  noRoiTlf: "ROI と TLF のどちらか一方は必須です",
  tooLong: "長すぎる値があります",
  duplicate: "同じ ROI × TLF の行がすでにあります",
  badWave: "波は 1〜99 の整数です",
  badPriority: "優先度は整数です",
  tooMany: `行は ${PLAN_LIMITS.maxRows} 行までです`,
};

function newRow(planId: string, order: number, r: NormalizedPlanRow, source: PlanRowRecord["source"], sourceRow: number | null, now: string): PlanRowRecord {
  const rowId = generatePlanRowId();
  return { planId, sk: planRowSk(rowId), rowId, order, wave: r.wave, roi: r.roi, tlf: r.tlf, rationale: r.rationale, priority: r.priority, source, sourceRow, state: "pending", projectId: null, attempts: 0, createdAt: now, updatedAt: now };
}

export async function createPlan(u: UserRecord, body: CreatePlanRequest): Promise<CreatePlanResponse> {
  const name = planName(body.name);
  const goal = planGoal(body.goal);
  const manual = body.rows === undefined ? [] : checkRowInputs(body.rows);
  const csv = body.csv === undefined || body.csv === "" ? null : parsePlanRowsCsv(csvText(body.csv), { existing: manual.map((m) => m.row) });
  const now = nowIso();
  const planId = await reserveNewId("plan", u.userId);
  const rows: PlanRowRecord[] = [
    ...manual.map((m, i) => newRow(planId, i, m.row, "manual", null, now)),
    ...(csv?.rows ?? []).map((r, i) => newRow(planId, manual.length + i, r, "csv", r.sourceRow, now)),
  ];
  const settings: PlanSettings = { model: null, modelChosen: false, reasoningEffort: u.defaultReasoningEffort ?? null, researchMode: true, locale: null };
  const plan: PlanRecord = { planId, sk: PLAN_META_SK, ownerUserId: u.userId, name, goal, status: "DRAFT", settings, rowCount: rows.length, rowCounts: countRows(rows), activeWave: null, createdAt: now, updatedAt: now };
  await putPlan(plan);
  for (const r of rows) await putRow(r);
  await putPlanEvent(planId, "created", u.userId, { detail: { rows: rows.length, rejected: csv?.rejected.length ?? 0 } });
  return { plan, rows, rejected: csv?.rejected ?? [] };
}

export async function updatePlanFields(u: UserRecord, plan: PlanRecord, body: UpdatePlanRequest): Promise<PlanRecord> {
  const values: Partial<PlanRecord> = {};
  if (body.name !== undefined) values.name = planName(body.name);
  if (body.goal !== undefined) values.goal = planGoal(body.goal);
  if (body.settings !== undefined) {
    if (plan.status !== "DRAFT") throw conflict("確定後の計画の設定は変更できません");
    const s = body.settings ?? {};
    const settings: PlanSettings = { ...plan.settings };
    if ("model" in s) {
      settings.model = normModel(s.model);
      settings.modelChosen = !!settings.model;
    }
    if ("reasoningEffort" in s) {
      if (s.reasoningEffort !== null && s.reasoningEffort !== undefined && !isEffort(s.reasoningEffort)) throw bad("reasoning effort が不正です");
      settings.reasoningEffort = s.reasoningEffort ?? null;
    }
    if ("researchMode" in s) {
      if (typeof s.researchMode !== "boolean") throw bad("researchMode は true / false で指定してください");
      settings.researchMode = s.researchMode;
    }
    values.settings = settings;
  }
  if (!(await updatePlan(plan.planId, values, { status: plan.status }))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  return { ...plan, ...values, updatedAt: nowIso() };
}

/** Replaces the rows of a draft (order = array order). Rows that keep their `rowId` keep their history. */
export async function replaceRows(u: UserRecord, plan: PlanRecord, inputs: unknown): Promise<PlanRowRecord[]> {
  if (plan.status !== "DRAFT") throw conflict("確定後の計画の行は変更できません");
  const checked = checkRowInputs(inputs);
  const current = await listRows(plan.planId);
  const byId = new Map(current.map((r) => [r.rowId, r]));
  const now = nowIso();
  const next: PlanRowRecord[] = checked.map(({ input, row }, i) => {
    const old = input.rowId && PLAN_ROW_ID_REGEX.test(input.rowId) ? byId.get(input.rowId) : undefined;
    const n = row;
    return old ? { ...old, order: i, roi: n.roi, tlf: n.tlf, rationale: n.rationale, wave: n.wave, priority: n.priority, updatedAt: now } : newRow(plan.planId, i, n, "manual", null, now);
  });
  const keep = new Set(next.map((r) => r.rowId));
  for (const r of current) if (!keep.has(r.rowId)) await deleteRow(plan.planId, r.rowId);
  for (const r of next) await putRow(r);
  if (!(await updatePlan(plan.planId, { rowCount: next.length, rowCounts: countRows(next) }, { status: "DRAFT" }))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { rows: next.length } });
  return next.sort(byWaveAndOrder);
}

/** Appends the rows of a CSV to a draft; rows that cannot be read come back with their reason. */
export async function importRows(u: UserRecord, plan: PlanRecord, csv: unknown): Promise<{ rows: PlanRowRecord[]; rejected: PlanRowRejected[] }> {
  if (plan.status !== "DRAFT") throw conflict("確定後の計画の行は変更できません");
  const current = await listRows(plan.planId);
  const parsed = parsePlanRowsCsv(csvText(csv), { existing: current });
  const now = nowIso();
  const start = current.reduce((m, r) => Math.max(m, r.order + 1), 0);
  const added = parsed.rows.map((r, i) => newRow(plan.planId, start + i, r, "csv", r.sourceRow, now));
  for (const r of added) await putRow(r);
  const all = [...current, ...added];
  await updatePlan(plan.planId, { rowCount: all.length, rowCounts: countRows(all) });
  await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { added: added.length, rejected: parsed.rejected.length } });
  return { rows: all.sort(byWaveAndOrder), rejected: parsed.rejected };
}

/**
 * Confirms a draft: checks that the owner can run jobs, fixes the model, reasoning effort, research mode, reply
 * language and harness rules of every row, and lets the runner start (the first rows start right away).
 */
export async function confirmPlan(u: UserRecord, plan: PlanRecord, locale: UiLocale | null): Promise<PlanRecord> {
  if (plan.status !== "DRAFT") throw conflict("この計画は確定済みです");
  const rows = await listRows(plan.planId);
  if (!rows.length) throw bad("行が 1 つもありません");
  const policy = await requireRunKey(u);
  const chosen = plan.settings.modelChosen ? plan.settings.model : null;
  if (chosen) requireModel(policy, chosen);
  const model = chosen || implicitModel(policy, u.defaultModel || deploymentDefaultModel());
  const settings: PlanSettings = { ...plan.settings, model, modelChosen: !!chosen, locale };
  const limits = await currentLimits();
  const estimate = estimatePlan({ seedRows: 0, bodyWaveSizes: waveSizes(rows), concurrency: limits.effective });
  const at = nowIso();
  const values: Partial<PlanRecord> = { settings, harnessRules: HARNESS_RULES, confirmedAt: at, confirmedBy: u.userId, estimate, activeWave: null, pausedReason: null };
  if (!(await setPlanStatus(plan.planId, "DRAFT", "RUNNING", values))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  await putPlanEvent(plan.planId, "confirmed", u.userId, { detail: { rows: rows.length, model, harnessRules: HARNESS_RULES } });
  await kick(plan.planId);
  return { ...plan, ...values, status: "RUNNING" };
}

/** Lets the runner act now instead of at its next minute; a failure only waits for the scheduled step. */
async function kick(planId: string) {
  try {
    await advancePlan(planId);
  } catch (e) {
    console.error(`[plan ${planId}] immediate step failed; the runner retries`, e);
  }
}

export async function pausePlan(u: UserRecord, plan: PlanRecord): Promise<void> {
  if (plan.status !== "RUNNING") throw conflict("実行中の計画ではありません");
  if (!(await setPlanStatus(plan.planId, "RUNNING", "PAUSED", { pausedReason: "user" }))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  await putPlanEvent(plan.planId, "paused", u.userId, { detail: { reason: "user" } });
}

/** Continues a paused or cancelled plan: done rows stay done; rows stopped by the cancel continue from their artifacts. */
export async function resumePlan(u: UserRecord, plan: PlanRecord): Promise<void> {
  if (plan.status !== "PAUSED" && plan.status !== "CANCELLED") throw conflict("一時停止中または中止した計画ではありません");
  const policy = await requireRunKey(u);
  if (plan.settings.modelChosen && plan.settings.model) requireModel(policy, plan.settings.model);
  if (plan.status === "CANCELLED") {
    for (const r of await listRows(plan.planId)) if (r.state === "cancelled") await updateRow(plan.planId, r.rowId, { state: "pending", claimedAt: null }, { state: "cancelled" });
  }
  if (!(await setPlanStatus(plan.planId, plan.status, "RUNNING", { pausedReason: null, cancelledAt: null }))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  await putPlanEvent(plan.planId, "resumed", u.userId);
  await kick(plan.planId);
}

/** Stops the plan: nothing new starts and the running rows' jobs are cancelled. Done rows stay done. */
export async function cancelPlan(u: UserRecord, plan: PlanRecord): Promise<void> {
  if (plan.status !== "RUNNING" && plan.status !== "PAUSED") throw conflict("実行中または一時停止中の計画ではありません");
  if (!(await setPlanStatus(plan.planId, plan.status, "CANCELLED", { cancelledAt: nowIso(), pausedReason: null }))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  for (const r of await listRows(plan.planId)) {
    if (!TRACKED_ROW_STATES.includes(r.state)) continue;
    const p = r.projectId ? await getProject(u.userId, r.projectId) : null;
    if (p && !isProjectDeleted(p) && ACTIVE_PROJECT_STATUSES.includes(p.status)) await stopProject(p, "plan");
    await updateRow(plan.planId, r.rowId, { state: "cancelled", claimedAt: null }, { state: r.state });
  }
  await putPlanEvent(plan.planId, "cancelled", u.userId);
}

/** A row that needs attention goes back to its turn (its project continues from its artifacts). */
export async function retryRow(u: UserRecord, plan: PlanRecord, rowId: string): Promise<void> {
  if (plan.status !== "RUNNING" && plan.status !== "PAUSED") throw conflict("実行中または一時停止中の計画ではありません");
  const ok = await updateRow(plan.planId, rowId, { state: "pending", attentionReason: null, claimedAt: null }, { state: "attention" });
  if (!ok) throw conflict("要対応の行ではありません");
  await putPlanEvent(plan.planId, "row_retry", u.userId, { rowId, detail: { manual: 1 } });
  if (plan.status === "RUNNING") await kick(plan.planId);
}

/** The owner leaves a waiting row or one that needs attention out of the plan. */
export async function skipRow(u: UserRecord, plan: PlanRecord, rowId: string): Promise<void> {
  if (plan.status === "DRAFT" || plan.status === "COMPLETED") throw conflict("確定済みで終了していない計画の行だけをスキップできます");
  const row = (await listRows(plan.planId)).find((r) => r.rowId === rowId);
  if (!row) throw notFound();
  if (row.state !== "pending" && row.state !== "attention") throw conflict("待ちまたは要対応の行だけをスキップできます");
  if (!(await updateRow(plan.planId, rowId, { state: "skipped" }, { state: row.state }))) throw conflict("行の状態が変わりました。再読み込みしてください");
  await putPlanEvent(plan.planId, "row_skipped", u.userId, { rowId });
  if (plan.status === "RUNNING" || plan.status === "PAUSED") await kick(plan.planId);
}

/** Soft delete of a draft, finished or cancelled plan (its projects stay). */
export async function deletePlan(u: UserRecord, plan: PlanRecord): Promise<string> {
  if (plan.status === "RUNNING" || plan.status === "PAUSED") throw conflict("実行中・一時停止中の計画は削除できません。先に中止してください");
  const at = nowIso();
  if (!(await updatePlan(plan.planId, { deletedAt: at }, { status: plan.status }))) throw conflict("計画の状態が変わりました。再読み込みしてください");
  return at;
}

/** The plan with its rows (and their projects' live state), recent history, limits, estimate and what was spent so far. */
export async function planDetail(u: UserRecord, plan: PlanRecord): Promise<PlanDetailResponse> {
  const [rows, events, limits, projects] = await Promise.all([listRows(plan.planId), listPlanEvents(plan.planId), currentLimits(), listUserProjects(u.userId)]);
  const byId = new Map(projects.map((p) => [p.projectId, p]));
  let cost = 0;
  let priced = false;
  let unpricedProjects = 0;
  const views: PlanRowView[] = rows.sort(byWaveAndOrder).map((r) => {
    const p = r.projectId ? byId.get(r.projectId) : undefined;
    if (!p) return { ...r, project: null };
    if (typeof p.costUsd === "number") {
      cost += p.costUsd;
      priced = true;
    } else if (p.usage && p.usage.inputTokens + p.usage.outputTokens > 0) unpricedProjects++;
    return {
      ...r,
      project: {
        name: p.name ?? p.projectId,
        status: p.status,
        pendingQuestion: p.status === "WAITING_USER_INPUT" ? p.pendingQuestion : null,
        costUsd: p.costUsd ?? null,
        revision: p.revision ?? 0,
        errorMessage: p.errorMessage ?? null,
        deleted: isProjectDeleted(p),
      },
    };
  });
  const end = plan.completedAt ?? plan.cancelledAt ?? null;
  const minutes = plan.confirmedAt ? Math.max(0, Math.round(((end ? Date.parse(end) : Date.now()) - Date.parse(plan.confirmedAt)) / 60000)) : null;
  return {
    plan: { ...plan, rowCounts: countRows(rows), rowCount: rows.length },
    rows: views,
    events: events.sort((a, b) => (a.sk < b.sk ? 1 : -1)).slice(0, 100),
    limits,
    estimate: estimatePlan({ seedRows: 0, bodyWaveSizes: waveSizes(rows), concurrency: limits.effective }),
    actual: { minutes, costUsd: priced ? Math.round(cost * 1_000_000) / 1_000_000 : null, unpricedProjects },
  };
}
