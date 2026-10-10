// What the plan routes do. Owner only: other users' plans are 404. Nothing is queued before confirmation, except the
// `plan` job of a draft the owner asks for, which the runner queues once a slot is free.
//
// Every change whose validity depends on the plan's status (rows, settings and policy, confirmation, drafting, ordering,
// proposals) runs under the plan's lease (`withPlanLease`) and checks the status of a strongly consistent read taken
// once the lease is held (rows are read the same way), so two tabs (or a tab and the runner) can never interleave: for
// example rows saved while another tab confirms the plan. Rows of a draft are written only after a conditional write
// that the plan is still a draft under this lease (`holdsPlan`). The runner is kicked after the lease is given back.
import { HTTPException } from "hono/http-exception";
import type {
  AddPlanAttachmentsRequest,
  AnswerDraftRequest,
  PlanAttachmentsResponse,
  PlanAutonomous,
  ResumePlanRequest,
  CreatePlanRequest,
  CreatePlanResponse,
  FileAttachment,
  NormalizedPlanRow,
  PlanCanonChoice,
  PlanDetailResponse,
  PlanJobState,
  PlanPulse,
  PlanPulseRow,
  PlanProposalRecord,
  PlanRecord,
  PlanRowInput,
  PlanRowRecord,
  PlanRowRejected,
  PlanRowView,
  PlanRowWait,
  PlanSettings,
  ProjectRecord,
  UiLocale,
  UpdatePlanRequest,
  UserRecord,
} from "@cobrac/shared";
import {
  AUTONOMOUS_DEFAULT_MAX_COST_USD,
  AUTONOMOUS_MAX_COST_RANGE,
  autonomousMaxCost,
  isAutonomous,
  ACTIVE_PROJECT_STATUSES,
  ATTACHMENT_LIMITS,
  HARNESS_RULES,
  PLAN_ASK_LIMITS,
  PLAN_LIMITS,
  PLAN_META_SK,
  PLAN_PULSE_EVENTS,
  PLAN_PROPOSAL_ID_REGEX,
  PLAN_ROW_ID_REGEX,
  TRACKED_ROW_STATES,
  UPLOAD_ID_REGEX,
  attachmentDisplayName,
  attachmentFileKey,
  byWaveAndOrder,
  cleanPlanNote,
  countRows,
  generatePlanRowId,
  hubScores,
  isDeterministicPlanAttachment,
  isCanonDeleted,
  isCanonId,
  isMovableRow,
  isPlanId,
  isProjectDeleted,
  matchExistingProject,
  normalizeCanonName,
  normalizePlanRow,
  normalizeProjectName,
  nowIso,
  orchestratorModelOf,
  overlapsOf,
  parsePlanRowsCsv,
  planAttachmentTypeOf,
  PLAN_MAX_WAITING_PRS,
  flowPlan,
  isFlowPlan,
  planEstimate,
  planEstimateFor,
  planLanes,
  planRowKey,
  waitingPrs,
  planRowSk,
  replanRows,
  safeAttachmentName,
  stagingKey,
} from "@cobrac/shared";
import { deletePlanAttachment, getStagingText, headStaging, movePlanAttachment } from "./aws.js";
import { canonFields, createCanon, ownedCanon } from "./canonOps.js";
import { getCanon, listPullRequests } from "./canons.js";
import { reserveNewId } from "./catalog.js";
import { currentLimits } from "./concurrency.js";
import { getProject, listJobsForCanon, listUserProjects } from "./db.js";
import { bad, notFound } from "./http.js";
import { autoOrder, stopPlanJob } from "./planJobs.js";
import { applyProposal } from "./planProposals.js";
import { planSpendUsd } from "./planCost.js";
import { advancePlan, dropReplan } from "./planRunner.js";
import {
  deleteRow,
  getPlan,
  getProposal,
  listPlanEvents,
  listProposals,
  listRows,
  putPlan,
  putPlanEvent,
  putRow,
  setPlanStatus,
  updatePlan,
  updateProposal,
  updateRow,
  holdsPlan,
  withPlanLease,
} from "./plans.js";
import { deploymentDefaultModel, implicitModel, isEffort, normModel, readLocale, requireModel, requireRunKey, stopProject, type StagedAttachment } from "./runs.js";
import { safeKeySegments } from "./s3Keys.js";

const conflict = (message: string) => new HTTPException(409, { message });
const STATUS_CHANGED = "計画の状態が変わりました。再読み込みしてください";

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

/** The Canon choice of a draft, checked (an existing Canon is checked for ownership under the lease). */
function planCanonChoice(v: unknown): PlanCanonChoice {
  const c = (v ?? {}) as { mode?: unknown; canonId?: unknown; name?: unknown };
  if (c.mode === "none") return { mode: "none" };
  if (c.mode === "existing") {
    if (typeof c.canonId !== "string" || !isCanonId(c.canonId)) throw bad("canon.canonId が不正です");
    return { mode: "existing", canonId: c.canonId };
  }
  if (c.mode === "new") {
    const n = normalizeCanonName(c.name);
    if ("error" in n) throw bad(`Canon の名前が不正です（${n.error}）`);
    return { mode: "new", name: n.name };
  }
  throw bad("canon.mode が不正です");
}

/** 自律実行 as the owner sent it: absent / null / false = off; an object = on, with its cost limit (default 20 USD). */
function readAutonomous(v: unknown): PlanAutonomous | null {
  if (v === undefined || v === null || v === false) return null;
  if (typeof v !== "object") throw bad("autonomous が不正です");
  const raw = (v as { maxCostUsd?: unknown }).maxCostUsd;
  if (raw === undefined || raw === null) return { maxCostUsd: AUTONOMOUS_DEFAULT_MAX_COST_USD };
  const maxCostUsd = autonomousMaxCost(raw);
  if (maxCostUsd === null) throw bad(`費用の上限は ${AUTONOMOUS_MAX_COST_RANGE.min}〜${AUTONOMOUS_MAX_COST_RANGE.max} USD で指定してください`);
  return { maxCostUsd };
}

function csvText(v: unknown): string {
  if (typeof v !== "string") throw bad("csv が不正です");
  if (v.length > PLAN_LIMITS.maxCsvChars) throw bad("CSV が大きすぎます");
  if (v.includes("\u0000")) throw bad("CSV として読めないファイルです");
  return v;
}

/** 409 unless the rows of the plan may be changed (a draft that is not being drafted). */
function requireEditable(plan: PlanRecord) {
  if (plan.status === "DRAFTING") throw conflict("下書きの作成中は行を変更できません");
  if (plan.status !== "DRAFT") throw conflict("確定後の計画の行は変更できません");
}

/** Rows of a form, checked; any unusable row is a 400 that names it. Existing rows keep their ID, state and history. */
function checkRowInputs(inputs: unknown): { input: PlanRowInput; row: NormalizedPlanRow }[] {
  if (!Array.isArray(inputs)) throw bad("rows が不正です");
  if (inputs.length > PLAN_LIMITS.maxRows) throw bad(`行は ${PLAN_LIMITS.maxRows} 行までです`);
  const seen = new Set<string>();
  return inputs.map((raw, i) => {
    const input = (raw ?? {}) as PlanRowInput;
    if (input.rebuild !== undefined && input.rebuild !== null && typeof input.rebuild !== "boolean") throw bad(`${i + 1} 行目: rebuild が不正です`);
    // an automatic order may number more waves than a typed one (at concurrency 1 every body row is a wave of its own)
    const longWave = typeof input.wave === "number" && Number.isInteger(input.wave) && input.wave > PLAN_LIMITS.maxWave && input.wave <= PLAN_LIMITS.maxRows;
    const n = normalizePlanRow(longWave ? { ...input, wave: undefined } : input);
    if ("reason" in n) throw bad(`${i + 1} 行目: ${REASON_JA[n.reason]}`);
    const row = longWave ? { ...n.row, wave: input.wave! } : n.row;
    const key = planRowKey(row.roi, row.tlf);
    if (seen.has(key)) throw bad(`${i + 1} 行目: ${REASON_JA.duplicate}`);
    seen.add(key);
    return { input, row };
  });
}

const REASON_JA: Record<PlanRowRejected["reason"], string> = {
  noRoiTlf: "ROI と TLF のどちらか一方は必須です",
  tooLong: "長すぎる値があります",
  duplicate: "同じ ROI × TLF の行がすでにあります",
  badWave: "バッチは 1〜99 の整数です",
  badPriority: "優先度は整数です",
  tooMany: `行は ${PLAN_LIMITS.maxRows} 行までです`,
};

function newRow(planId: string, order: number, r: NormalizedPlanRow, source: PlanRowRecord["source"], sourceRow: number | null, now: string): PlanRowRecord {
  const rowId = generatePlanRowId();
  return { planId, sk: planRowSk(rowId), rowId, order, wave: r.wave, roi: r.roi, tlf: r.tlf, rationale: r.rationale, priority: r.priority, source, sourceRow, state: "pending", projectId: null, attempts: 0, createdAt: now, updatedAt: now };
}

/**
 * A row's match among the owner's projects: done by a finished one, or a warning for an unfinished one. A row the
 * owner chose to rebuild (「作り直す」, `rebuild`) is never matched: it is built.
 */
function setMatch(row: PlanRowRecord, projects: ProjectRecord[]): PlanRowRecord {
  if (row.rebuild) {
    row.existing = null;
    row.duplicateOf = null;
    return row;
  }
  const m = matchExistingProject(row, projects);
  row.existing = m.existing;
  row.duplicateOf = m.duplicateOf;
  return row;
}

/** Checks the capability lists of a create request (staged uploads of the accepted types, within the limits) before anything is written. */
async function stagedPlanAttachments(userId: string, list: CreatePlanRequest["attachments"]): Promise<StagedAttachment[]> {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw bad("attachments が不正です");
  if (list.length > ATTACHMENT_LIMITS.maxFiles) throw bad(`添付ファイルは ${ATTACHMENT_LIMITS.maxFiles} 個までです`);
  const out: StagedAttachment[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const a of list) {
    if (!a || typeof a.uploadId !== "string" || !UPLOAD_ID_REGEX.test(a.uploadId) || typeof a.name !== "string" || seen.has(a.uploadId)) throw bad("attachments が不正です");
    seen.add(a.uploadId);
    const type = planAttachmentTypeOf(a.name);
    if (!type) throw bad(`計画に添付できるのは CSV・TSV・テキスト・xlsx・PDF のファイルです（${attachmentDisplayName(a.name)}）`);
    const safeName = safeAttachmentName(a.name);
    const staging = stagingKey(userId, a.uploadId, safeName);
    // checked here, before the plan ID is reserved and the first file is moved, so a bad name leaves nothing behind
    if (!safeKeySegments(staging) || !safeKeySegments(attachmentFileKey(out.length, safeName))) throw bad(`添付ファイルの名前が不正です（${attachmentDisplayName(a.name)}）`);
    const head = await headStaging(staging);
    if (!head) throw bad(`アップロードが見つかりません（${attachmentDisplayName(a.name)}）。もう一度添付してください`);
    if (head.size > ATTACHMENT_LIMITS.maxFileBytes) throw bad("ファイルが大きすぎます");
    total += head.size;
    out.push({ staging, safeName, name: attachmentDisplayName(a.name), size: head.size, contentType: type.mime });
  }
  if (total > ATTACHMENT_LIMITS.maxTotalBytes) throw bad(`添付ファイルの合計が上限（${ATTACHMENT_LIMITS.maxTotalBytes / 1024 / 1024} MB）を超えています`);
  return out;
}

const draftState = (u: UserRecord, at: string, locale: UiLocale | null): PlanJobState => ({ kind: "draft", jobId: null, status: "waiting", requestedAt: at, requestedBy: u.userId, locale });

export async function createPlan(u: UserRecord, body: CreatePlanRequest): Promise<CreatePlanResponse> {
  const name = planName(body.name);
  const goal = planGoal(body.goal);
  const manual = body.rows === undefined ? [] : checkRowInputs(body.rows);
  const csv = body.csv === undefined || body.csv === "" ? null : parsePlanRowsCsv(csvText(body.csv), { existing: manual.map((m) => m.row) });
  const staged = await stagedPlanAttachments(u.userId, body.attachments);
  if (body.draft !== undefined && body.draft !== null && typeof body.draft !== "boolean") throw bad("draft が不正です");
  const draft = body.draft === true;
  // not in CreatePlanRequest: the reply language of the draft (absent: the language of the goal)
  const locale = readLocale(body.locale);
  // 自律実行: the plan runs from its draft to the end on its own (it always starts with a draft)
  const autonomous = readAutonomous(body.autonomous);
  if (autonomous && !draft) throw bad("自律実行の計画は下書きの作成から始めます");
  const canonChoice = body.canon !== undefined ? planCanonChoice(body.canon) : autonomous ? ({ mode: "new", name } as const) : null;
  if (canonChoice?.mode === "existing" && !(await ownedCanon(canonChoice.canonId, u.userId))) throw new HTTPException(404, { message: "Canon が見つかりません" });
  // a plan starts from something to build: a goal (for a draft), capability lists or rows
  if (!goal && !staged.length && !manual.length && !csv?.rows.length) throw bad(draft ? "下書きを作成するには目標か資料が必要です" : "目標・資料・行のどれかが必要です");
  if (draft) await requireRunKey(u);

  // capability lists in CSV / TSV / text are read now (before they are moved); xlsx and PDF wait for the draft job
  const fileRows: (NormalizedPlanRow & { sourceRow: number })[] = [];
  const rejected: PlanRowRejected[] = [...(csv?.rejected ?? [])];
  for (const f of staged) {
    if (!isDeterministicPlanAttachment(f.name)) continue;
    const text = await getStagingText(f.staging);
    if (text === null) throw bad(`アップロードが見つかりません（${f.name}）。もう一度添付してください`);
    if (text.length > PLAN_LIMITS.maxCsvChars || text.includes("\u0000")) throw bad(`資料として読めないファイルです（${f.name}）`);
    const parsed = parsePlanRowsCsv(text, { existing: [...manual.map((m) => m.row), ...(csv?.rows ?? []), ...fileRows] });
    fileRows.push(...parsed.rows);
    rejected.push(...parsed.rejected.map((r) => ({ file: f.name, ...r })));
  }

  const now = nowIso();
  const planId = await reserveNewId("plan", u.userId);
  const attachments: FileAttachment[] = [];
  for (const [i, f] of staged.entries()) {
    const key = attachmentFileKey(i, f.safeName);
    await movePlanAttachment(f.staging, planId, key, f.contentType);
    attachments.push({ kind: "file", id: `f${i + 1}`, name: f.name, key, size: f.size, contentType: f.contentType });
  }
  const typed = [
    ...manual.map((m) => ({ row: m.row, source: "manual" as const, sourceRow: null })),
    ...[...(csv?.rows ?? []), ...fileRows].map((r) => ({ row: r, source: "csv" as const, sourceRow: r.sourceRow })),
  ];
  const projects = typed.length ? await listUserProjects(u.userId) : [];
  const rows: PlanRowRecord[] = typed.map((t, i) => setMatch(newRow(planId, i, t.row, t.source, t.sourceRow, now), projects));
  const settings: PlanSettings = {
    model: null,
    modelChosen: false,
    orchestratorModel: null,
    orchestratorModelChosen: false,
    reasoningEffort: u.defaultReasoningEffort ?? null,
    researchMode: true,
    locale: null,
    ...(autonomous ? { autonomous } : {}),
  };
  const plan: PlanRecord = {
    planId,
    sk: PLAN_META_SK,
    ownerUserId: u.userId,
    name,
    goal,
    status: "DRAFT",
    settings,
    ...(attachments.length ? { attachments, attachmentSeq: attachments.length } : {}),
    ...(canonChoice?.mode === "existing" ? { canonId: canonChoice.canonId, canonNew: null } : canonChoice?.mode === "new" ? { canonId: null, canonNew: { name: canonChoice.name } } : {}),
    rowCount: rows.length,
    rowCounts: countRows(rows),
    activeWave: null,
    createdAt: now,
    updatedAt: now,
  };
  await putPlan(plan);
  for (const r of rows) await putRow(r);
  await putPlanEvent(planId, "created", u.userId, { detail: { rows: rows.length, rejected: rejected.length, files: attachments.length } });
  if (!draft) return { plan, rows, rejected };
  // drafting only once every row is stored: the runner may queue the draft job as soon as the plan is DRAFTING
  if (!(await setPlanStatus(planId, "DRAFT", "DRAFTING", { draft: draftState(u, now, locale) }))) throw conflict(STATUS_CHANGED);
  await putPlanEvent(planId, "draft_requested", u.userId, { detail: { locale } });
  await kick(planId);
  return { plan: (await getPlan(planId, true)) ?? plan, rows, rejected };
}

export async function updatePlanFields(u: UserRecord, plan: PlanRecord, body: UpdatePlanRequest): Promise<PlanRecord> {
  const values: Partial<PlanRecord> = {};
  if (body.name !== undefined) values.name = planName(body.name);
  if (body.goal !== undefined) values.goal = planGoal(body.goal);
  // the granularity policy is the Orchestrator's to write (the draft, then re-plans), never the owner's
  if ((body as { policy?: unknown }).policy !== undefined) throw bad("粒度方針はオーケストレーターが決めます");
  const canon = body.canon !== undefined ? planCanonChoice(body.canon) : undefined;
  if (body.settings === undefined && canon === undefined) {
    // name and goal can change in any status
    if (!(await updatePlan(plan.planId, values, { status: plan.status }))) throw conflict(STATUS_CHANGED);
    return { ...plan, ...values, updatedAt: nowIso() };
  }
  return withPlanLease(plan.planId, async (fresh) => {
    if (canon !== undefined) {
      if (fresh.status === "DRAFTING") throw conflict("下書きの作成中は Canon を変更できません");
      if (fresh.status !== "DRAFT") throw conflict("確定後の計画の Canon は変更できません");
      if (canon.mode === "existing") {
        // a plan's projects join its Canon, and projects can only join their owner's Canons
        if (!(await ownedCanon(canon.canonId, fresh.ownerUserId))) throw new HTTPException(404, { message: "Canon が見つかりません" });
        values.canonId = canon.canonId;
        values.canonNew = null;
      } else if (canon.mode === "new") {
        values.canonId = null;
        values.canonNew = { name: canon.name };
      } else {
        values.canonId = null;
        values.canonNew = null;
      }
    }
    if (body.settings !== undefined) {
      if (fresh.status !== "DRAFT" && fresh.status !== "DRAFTING") throw conflict("確定後の計画の設定は変更できません");
      const s = body.settings ?? {};
      const settings: PlanSettings = { ...fresh.settings };
      if ("model" in s) {
        settings.model = normModel(s.model);
        settings.modelChosen = !!settings.model;
      }
      if ("orchestratorModel" in s) {
        settings.orchestratorModel = normModel(s.orchestratorModel);
        settings.orchestratorModelChosen = !!settings.orchestratorModel;
      }
      if ("reasoningEffort" in s) {
        if (s.reasoningEffort !== null && s.reasoningEffort !== undefined && !isEffort(s.reasoningEffort)) throw bad("reasoning effort が不正です");
        settings.reasoningEffort = s.reasoningEffort ?? null;
      }
      if ("researchMode" in s) {
        if (typeof s.researchMode !== "boolean") throw bad("researchMode は true / false で指定してください");
        settings.researchMode = s.researchMode;
      }
      if ("autonomous" in s) settings.autonomous = readAutonomous(s.autonomous);
      values.settings = settings;
    }
    if (!(await updatePlan(plan.planId, values, { status: fresh.status }))) throw conflict(STATUS_CHANGED);
    return { ...fresh, ...values, updatedAt: nowIso() };
  });
}

/**
 * Replaces the rows of a draft (order = array order). Rows that keep their `rowId` keep their history, anchors,
 * dependencies and seed flag. `rebuild: true` (「作り直す」) is stored on the row: it is built and never matched with
 * an existing project again; only `rebuild: false` clears it (the row is then matched again). New rows (and rows whose
 * ROI × TLF changed) are matched with the owner's projects.
 *
 * The plan keeps its ordering only when the same rows come back in their stored order and waves (for example only a
 * rationale or 「作り直す」 changed); an automatic order is then computed again when a row's rebuild or existing project
 * changed. Anything else keeps the owner's waves (ordering becomes manual), and a seed row that no longer has its wave
 * to itself among the rows to build is no seed any more.
 */
export async function replaceRows(u: UserRecord, plan: PlanRecord, inputs: unknown): Promise<PlanRowRecord[]> {
  requireEditable(plan);
  const checked = checkRowInputs(inputs);
  return withPlanLease(plan.planId, async (fresh) => {
    requireEditable(fresh);
    const current = await listRows(plan.planId, true);
    const byId = new Map(current.map((r) => [r.rowId, r]));
    const now = nowIso();
    let projects: ProjectRecord[] | null = null;
    const ownerProjects = async () => (projects ??= await listUserProjects(u.userId));
    const next: PlanRowRecord[] = [];
    const used = new Set<string>();
    /** A row's rebuild flag or existing project changed (an automatic order depends on them) */
    let flagsChanged = false;
    for (const [i, { input, row: n }] of checked.entries()) {
      const old = input.rowId && PLAN_ROW_ID_REGEX.test(input.rowId) && !used.has(input.rowId) ? byId.get(input.rowId) : undefined;
      if (!old) {
        const row = newRow(plan.planId, i, n, "manual", null, now);
        if (input.rebuild === true) row.rebuild = true;
        next.push(setMatch(row, await ownerProjects()));
        continue;
      }
      used.add(old.rowId);
      const r: PlanRowRecord = { ...old, order: i, roi: n.roi, tlf: n.tlf, rationale: n.rationale, wave: n.wave, priority: n.priority, updatedAt: now };
      if (input.rebuild === true) r.rebuild = true;
      else if (input.rebuild === false) delete r.rebuild;
      if (r.rebuild) {
        r.existing = null;
        r.duplicateOf = null;
      } else if (old.rebuild || planRowKey(old.roi, old.tlf) !== planRowKey(n.roi, n.tlf)) setMatch(r, await ownerProjects());
      if (!!r.rebuild !== !!old.rebuild || (r.existing?.projectId ?? null) !== (old.existing?.projectId ?? null)) flagsChanged = true;
      next.push(r);
    }
    const keep = new Set(next.map((r) => r.rowId));
    for (const r of next) if (r.dependsOn) r.dependsOn = r.dependsOn.filter((d) => keep.has(d));

    const stored = [...current].sort((a, b) => a.order - b.order || (a.rowId < b.rowId ? -1 : 1));
    const sameRows = next.length === stored.length && next.every((r, i) => stored[i].rowId === r.rowId && byId.get(r.rowId)!.wave === r.wave);
    const auto = sameRows && fresh.ordering === "auto";
    if (auto && flagsChanged) autoOrder(next, (await currentLimits()).effective);
    else if (!auto) {
      // the owner's waves: a seed is only a seed while it is built alone in its wave
      const built = new Map<number, number>();
      for (const r of next) if (r.state !== "skipped" && !r.existing) built.set(r.wave, (built.get(r.wave) ?? 0) + 1);
      for (const r of next) if (r.seed && (r.existing || r.state === "skipped" || (built.get(r.wave) ?? 0) > 1)) r.seed = false;
    }

    if (!(await holdsPlan(fresh, "DRAFT"))) throw conflict(STATUS_CHANGED);
    for (const r of current) if (!keep.has(r.rowId)) await deleteRow(plan.planId, r.rowId);
    for (const r of next) await putRow(r);
    if (!(await updatePlan(plan.planId, { rowCount: next.length, rowCounts: countRows(next), ordering: auto ? "auto" : "manual" }, { status: "DRAFT" }))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { rows: next.length } });
    return next.sort(byWaveAndOrder);
  });
}

/** Appends the rows of a CSV to a draft; rows that cannot be read come back with their reason. An automatic order is computed again. */
/**
 * Adds capability lists to a draft (up to `ATTACHMENT_LIMITS.maxFiles` with those it has). CSV / TSV / text are read
 * into rows at once, as on creation (an automatic order is computed again); xlsx and PDF wait for the next draft job.
 */
export async function addPlanAttachments(u: UserRecord, plan: PlanRecord, body: unknown): Promise<PlanAttachmentsResponse> {
  requireEditable(plan);
  const list = (body as Partial<AddPlanAttachmentsRequest> | null)?.attachments;
  if (!Array.isArray(list) || !list.length) throw bad("attachments が不正です");
  const staged = await stagedPlanAttachments(u.userId, list);
  return withPlanLease(plan.planId, async (fresh) => {
    requireEditable(fresh);
    const have = fresh.attachments ?? [];
    if (have.length + staged.length > ATTACHMENT_LIMITS.maxFiles) throw bad(`添付ファイルは ${ATTACHMENT_LIMITS.maxFiles} 個までです`);
    if (have.reduce((n, a) => n + a.size, 0) + staged.reduce((n, f) => n + f.size, 0) > ATTACHMENT_LIMITS.maxTotalBytes) {
      throw bad(`添付ファイルの合計が上限（${ATTACHMENT_LIMITS.maxTotalBytes / 1024 / 1024} MB）を超えています`);
    }
    const current = await listRows(plan.planId, true);
    const fileRows: (NormalizedPlanRow & { sourceRow: number })[] = [];
    const rejected: PlanRowRejected[] = [];
    for (const f of staged) {
      if (!isDeterministicPlanAttachment(f.name)) continue;
      const text = await getStagingText(f.staging);
      if (text === null) throw bad(`アップロードが見つかりません（${f.name}）。もう一度添付してください`);
      if (text.length > PLAN_LIMITS.maxCsvChars || text.includes("\u0000")) throw bad(`資料として読めないファイルです（${f.name}）`);
      const parsed = parsePlanRowsCsv(text, { existing: [...current, ...fileRows] });
      fileRows.push(...parsed.rows);
      rejected.push(...parsed.rejected.map((r) => ({ file: f.name, ...r })));
    }
    // file IDs and keys continue after every file the plan ever had (a removed file's are never used again)
    let next = attachmentSeq(fresh);
    const added: FileAttachment[] = [];
    for (const f of staged) {
      const key = attachmentFileKey(next, f.safeName);
      await movePlanAttachment(f.staging, plan.planId, key, f.contentType);
      next++;
      added.push({ kind: "file", id: `f${next}`, name: f.name, key, size: f.size, contentType: f.contentType });
    }
    const now = nowIso();
    const start = current.reduce((m, r) => Math.max(m, r.order + 1), 0);
    const projects = fileRows.length ? await listUserProjects(u.userId) : [];
    const newRows = fileRows.map((r, i) => setMatch(newRow(plan.planId, start + i, r, "csv", r.sourceRow, now), projects));
    const all = [...current, ...newRows];
    const reorder = fresh.ordering === "auto" && newRows.length > 0;
    if (reorder) autoOrder(all, (await currentLimits()).effective);
    if (!(await holdsPlan(fresh, "DRAFT"))) throw conflict(STATUS_CHANGED);
    for (const r of reorder ? all : newRows) await putRow(r);
    const values: Partial<PlanRecord> = { attachments: [...have, ...added], attachmentSeq: next, rowCount: all.length, rowCounts: countRows(all) };
    if (!(await updatePlan(plan.planId, values, { status: "DRAFT" }))) throw conflict(STATUS_CHANGED);
    await dropDerivedManifest(plan.planId);
    await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { files: added.length, added: newRows.length, rejected: rejected.length } });
    return { plan: { ...fresh, ...values, updatedAt: now }, rows: newRows, rejected };
  });
}

/** The attachments a plan ever had: its counter, or (plans from before it) the highest file number it has. */
const attachmentSeq = (p: PlanRecord) => p.attachmentSeq ?? (p.attachments ?? []).reduce((m, a) => Math.max(m, Number(/^f(\d+)$/.exec(a.id)?.[1] ?? 0)), 0);

/**
 * The text extracted from a plan's capability lists is kept by attachment ID (`attachments/derived/manifest.json`);
 * once the files change, the next draft job extracts them again.
 */
const dropDerivedManifest = (planId: string) =>
  deletePlanAttachment(planId, "attachments/derived/manifest.json").catch((e) => console.warn(`[plan ${planId}] derived manifest not deleted`, e));

/** Removes a capability list from a draft. Rows already read from it stay (they are the plan's rows now). */
export async function removePlanAttachment(u: UserRecord, plan: PlanRecord, fileId: string): Promise<PlanAttachmentsResponse> {
  requireEditable(plan);
  return withPlanLease(plan.planId, async (fresh) => {
    requireEditable(fresh);
    const have = fresh.attachments ?? [];
    const target = have.find((a) => a.id === fileId);
    if (!target) throw notFound();
    const attachments = have.filter((a) => a.id !== fileId);
    if (!(await updatePlan(plan.planId, { attachments, attachmentSeq: attachmentSeq(fresh) }, { status: "DRAFT" }))) throw conflict(STATUS_CHANGED);
    await deletePlanAttachment(plan.planId, target.key).catch((e) => console.warn(`[plan ${plan.planId}] attachment ${target.key} not deleted`, e));
    await dropDerivedManifest(plan.planId);
    await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { removedFile: target.name.slice(0, 200) } });
    return { plan: { ...fresh, attachments, updatedAt: nowIso() }, rows: [], rejected: [] };
  });
}

export async function importRows(u: UserRecord, plan: PlanRecord, csv: unknown): Promise<{ rows: PlanRowRecord[]; rejected: PlanRowRejected[] }> {
  requireEditable(plan);
  const text = csvText(csv);
  return withPlanLease(plan.planId, async (fresh) => {
    requireEditable(fresh);
    const current = await listRows(plan.planId, true);
    const parsed = parsePlanRowsCsv(text, { existing: current });
    const now = nowIso();
    const start = current.reduce((m, r) => Math.max(m, r.order + 1), 0);
    const projects = parsed.rows.length ? await listUserProjects(u.userId) : [];
    const added = parsed.rows.map((r, i) => setMatch(newRow(plan.planId, start + i, r, "csv", r.sourceRow, now), projects));
    const all = [...current, ...added];
    const reorder = fresh.ordering === "auto" && added.length > 0;
    if (reorder) autoOrder(all, (await currentLimits()).effective);
    if (!(await holdsPlan(fresh, "DRAFT"))) throw conflict(STATUS_CHANGED);
    for (const r of reorder ? all : added) await putRow(r);
    if (!(await updatePlan(plan.planId, { rowCount: all.length, rowCounts: countRows(all) }, { status: "DRAFT" }))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "rows_changed", u.userId, { detail: { added: added.length, rejected: parsed.rejected.length } });
    return { rows: all.sort(byWaveAndOrder), rejected: parsed.rejected };
  });
}

/** 「自動で並べる」: the waves and seed rows of a draft computed from the anchors and dependencies of its rows. */
export async function orderPlan(u: UserRecord, plan: PlanRecord): Promise<{ plan: PlanRecord; rows: PlanRowRecord[] }> {
  requireEditable(plan);
  return withPlanLease(plan.planId, async (fresh) => {
    requireEditable(fresh);
    const rows = await listRows(plan.planId, true);
    if (!rows.length) throw bad("行が 1 つもありません");
    const o = autoOrder(rows, (await currentLimits()).effective);
    const now = nowIso();
    if (!(await holdsPlan(fresh, "DRAFT"))) throw conflict(STATUS_CHANGED);
    for (const r of rows) await putRow({ ...r, updatedAt: now });
    const values: Partial<PlanRecord> = { ordering: "auto", rowCount: rows.length, rowCounts: countRows(rows) };
    if (!(await updatePlan(plan.planId, values, { status: "DRAFT" }))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "ordered", u.userId, { detail: { rows: rows.length, seeds: o.seeds, cycle: o.cycle ? 1 : 0 } });
    return { plan: { ...fresh, ...values, updatedAt: now }, rows: rows.sort(byWaveAndOrder) };
  });
}

/** Every job of the plan may run for the owner: a key to run jobs with (400) and the chosen models (403). */
async function requirePlanRun(u: UserRecord, plan: PlanRecord) {
  const policy = await requireRunKey(u);
  const o = orchestratorModelOf(plan.settings);
  if (plan.settings.modelChosen && plan.settings.model) requireModel(policy, plan.settings.model);
  if (o.chosen && o.model) requireModel(policy, o.model);
  return policy;
}

/** Asks the `plan` job for a draft: the plan waits (rows locked) until the runner queues it on a free slot. */
export async function requestDraft(u: UserRecord, plan: PlanRecord, locale: UiLocale | null): Promise<PlanRecord> {
  if (plan.status !== "DRAFT") throw conflict(plan.status === "DRAFTING" ? "下書きを作成中です" : "確定後の計画の下書きは作成できません");
  await requirePlanRun(u, plan);
  await withPlanLease(plan.planId, async (fresh) => {
    if (fresh.status !== "DRAFT") throw conflict(fresh.status === "DRAFTING" ? "下書きを作成中です" : "確定後の計画の下書きは作成できません");
    if (!fresh.goal && !fresh.attachments?.length && !fresh.rowCount) throw bad("下書きを作成するには目標か資料が必要です");
    if (!(await setPlanStatus(plan.planId, "DRAFT", "DRAFTING", { draft: draftState(u, nowIso(), locale) }))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "draft_requested", u.userId, { detail: { locale } });
  });
  await kick(plan.planId);
  return (await getPlan(plan.planId, true)) ?? plan;
}

/**
 * The owner answers the questions the Orchestrator asked before drafting (an answer per question; "" leaves one to the
 * Orchestrator), or skips them: the draft is asked for again with the answers, and after a skip it asks no more.
 */
export async function answerDraft(u: UserRecord, plan: PlanRecord, body: AnswerDraftRequest): Promise<PlanRecord> {
  const asking = (p: PlanRecord) => p.status === "DRAFTING" && p.draft?.status === "asking" && !!p.draft.qa?.length;
  if (!asking(plan)) throw conflict("質問に回答できる状態ではありません");
  const skip = body?.skip === true;
  const raw = Array.isArray(body?.answers) ? body.answers : [];
  if (!skip && raw.some((a) => typeof a !== "string")) throw bad("回答が不正です");
  await requirePlanRun(u, plan);
  const updated = await withPlanLease(plan.planId, async (fresh) => {
    if (!asking(fresh)) throw conflict("質問に回答できる状態ではありません");
    const d = fresh.draft!;
    const qa = [...d.qa!];
    const last = qa[qa.length - 1];
    const answers = last.questions.map((_, i) => (skip ? "" : cleanPlanNote(raw[i] ?? "").slice(0, PLAN_ASK_LIMITS.answer)));
    if (!skip && answers.every((a) => !a)) throw bad("回答を入力してください");
    const at = nowIso();
    qa[qa.length - 1] = { ...last, answers, answeredAt: at, ...(skip ? { skipped: true } : {}) };
    const draft: PlanJobState = { ...d, jobId: null, status: "waiting", requestedAt: at, endedAt: null, error: null, errorCode: null, qa };
    if (!(await updatePlan(plan.planId, { draft }, { status: "DRAFTING" }))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "draft_answered", u.userId, { detail: skip ? { round: qa.length, skipped: 1 } : { round: qa.length } });
    return { ...fresh, draft, updatedAt: at };
  });
  await kick(plan.planId);
  return updated;
}

/** Stops a draft that is waiting or running: its job is cancelled and the plan is an editable draft again. */
export async function cancelDraft(u: UserRecord, plan: PlanRecord): Promise<PlanRecord> {
  if (plan.status !== "DRAFTING") throw conflict("下書きを作成中の計画ではありません");
  return withPlanLease(plan.planId, async (fresh) => {
    if (fresh.status !== "DRAFTING") throw conflict("下書きを作成中の計画ではありません");
    const d = fresh.draft;
    if (d?.jobId && (d.status === "queued" || d.status === "running")) await stopPlanJob(plan.planId, d.jobId, "cancelled by user");
    const draft: PlanJobState | null = d ? { ...d, status: "cancelled", error: null, endedAt: nowIso() } : null;
    if (!(await setPlanStatus(plan.planId, "DRAFTING", "DRAFT", { draft }))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "draft_cancelled", u.userId);
    return { ...fresh, status: "DRAFT" as const, draft, updatedAt: nowIso() };
  });
}

/**
 * Confirms a draft: checks that the owner can run jobs, fixes the model, reasoning effort, research mode, reply
 * language and harness rules of every row, and lets the runner start (the first rows start right away). Rows done by an
 * existing project are done, once that project is checked again (it may have been deleted or changed since the draft:
 * then the row is built). A plan ordered automatically is ordered again for the limits in force now.
 */
export async function confirmPlan(u: UserRecord, plan: PlanRecord, locale: UiLocale | null, by: string = u.userId): Promise<PlanRecord> {
  if (plan.status === "DRAFTING") throw conflict("下書きの作成中は確定できません");
  if (plan.status !== "DRAFT") throw conflict("この計画は確定済みです");
  const confirmed = await withPlanLease(plan.planId, async (fresh) => {
    if (fresh.status === "DRAFTING") throw conflict("下書きの作成中は確定できません");
    if (fresh.status !== "DRAFT") throw conflict("この計画は確定済みです");
    const rows = await listRows(plan.planId, true);
    if (!rows.length) throw bad("行が 1 つもありません");
    const policy = await requirePlanRun(u, fresh);
    const fallback = () => implicitModel(policy, u.defaultModel || deploymentDefaultModel());
    const chosen = fresh.settings.modelChosen ? fresh.settings.model : null;
    const model = chosen || fallback();
    const o = orchestratorModelOf(fresh.settings);
    const orchestratorChosen = o.chosen ? o.model : null;
    const orchestratorModel = orchestratorChosen || fallback();
    const settings: PlanSettings = { ...fresh.settings, model, modelChosen: !!chosen, orchestratorModel, orchestratorModelChosen: !!orchestratorChosen, locale };
    const limits = await currentLimits();
    const at = nowIso();
    const lost = await recheckExisting(u, rows, at);
    if (fresh.ordering === "auto") autoOrder(rows, limits.effective);
    // the plan's Canon: an existing one must still be the owner's; a new one is checked now and created below
    let canonId = fresh.canonId ?? null;
    if (canonId && !(await ownedCanon(canonId, u.userId))) throw conflict("この計画の Canon が見つかりません");
    const newCanon = !canonId && fresh.canonNew ? canonFields({ name: fresh.canonNew.name, policy: fresh.policy ?? "" }, false) : null;
    if (!(await holdsPlan(fresh, "DRAFT"))) throw conflict(STATUS_CHANGED);
    if (newCanon) {
      const created = await createCanon(u, newCanon);
      canonId = created.canonId;
      // stored at once, so a confirmation that fails after this point keeps the Canon instead of making another
      if (!(await updatePlan(plan.planId, { canonId, canonNew: null }, { status: "DRAFT" }))) throw conflict(STATUS_CHANGED);
      await putPlanEvent(plan.planId, "canon_created", by, { detail: { canonId, name: created.name } });
    }
    for (const r of rows) if (fresh.ordering === "auto" || lost.has(r.rowId)) await putRow(r);
    const owned = canonId && rows.some((r) => r.existing && r.state === "pending") ? new Map((await listUserProjects(u.userId)).map((p) => [p.projectId, p])) : null;
    for (const r of rows) {
      if (!r.existing || r.state !== "pending") continue;
      let values: Partial<PlanRowRecord> = { state: "done", projectId: r.existing.projectId, completedAt: at };
      const inCanon = owned?.get(r.existing.projectId)?.canonId ?? null;
      // in a plan with a Canon an existing project counts once it is in that Canon: one in another Canon needs a human;
      // one in no Canon waits for its wave like any other row (seeds first), and the runner then pushes it (joining
      // the Canon pinned to its head) without building anything
      if (canonId && inCanon !== canonId) {
        values = inCanon ? { state: "decision", decisionReason: "other_canon", projectId: r.existing.projectId } : { state: "pending", projectId: r.existing.projectId };
        // 自律実行: a project in another Canon is left alone; the row is built anew for this plan's Canon
        if (inCanon && isAutonomous(fresh)) values = { state: "pending", existing: null, projectId: null, rebuild: true };
      }
      if (!(await updateRow(plan.planId, r.rowId, values, { state: "pending" }))) continue;
      Object.assign(r, values);
      if (values.state === "decision") await putPlanEvent(plan.planId, "row_decision", by, { rowId: r.rowId, projectId: r.existing.projectId, detail: { reason: "other_canon" } });
    }
    // plans ordered automatically run as a flow (waves only set the order); the owner's waves are kept as barriers
    // (a draft that already carries one keeps it)
    const scheduling = fresh.scheduling ?? (fresh.ordering === "auto" ? ("flow" as const) : ("waves" as const));
    const estimate = planEstimateFor({ ...fresh, scheduling }, rows, limits.effective);
    const values: Partial<PlanRecord> = { settings, scheduling, harnessRules: HARNESS_RULES, confirmedAt: at, confirmedBy: by, estimate, activeWave: null, pausedReason: null, autonomousError: null, rowCounts: countRows(rows) };
    if (!(await setPlanStatus(plan.planId, "DRAFT", "RUNNING", values))) throw conflict(STATUS_CHANGED);
    await putPlanEvent(plan.planId, "confirmed", by, { detail: { rows: rows.length, model, orchestratorModel, harnessRules: HARNESS_RULES, ...(lost.size ? { existingGone: lost.size } : {}), ...(canonId ? { canonId } : {}) } });
    return { ...fresh, ...values, ...(canonId ? { canonId, canonNew: null } : {}), status: "RUNNING" as const };
  });
  await kick(plan.planId);
  return confirmed;
}

/**
 * Rows that wait to be done by an existing project, checked against the owner's projects now: the project must still
 * exist, be COMPLETED and have its artifacts. Otherwise the row is matched again (another finished project with its
 * ROI × TLF, or a warning for an unfinished one) and, without a finished project, built. Mutates `rows`; returns the
 * IDs of the rows that changed.
 */
async function recheckExisting(u: UserRecord, rows: PlanRowRecord[], at: string): Promise<Set<string>> {
  const changed = new Set<string>();
  const waiting = rows.filter((r) => r.existing && r.state === "pending");
  if (!waiting.length) return changed;
  const projects = await listUserProjects(u.userId);
  const byId = new Map(projects.map((p) => [p.projectId, p]));
  for (const r of waiting) {
    const p = byId.get(r.existing!.projectId);
    if (p && !isProjectDeleted(p) && p.status === "COMPLETED" && p.hasArtifacts) continue;
    setMatch(r, projects);
    r.updatedAt = at;
    changed.add(r.rowId);
  }
  return changed;
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
  if (!(await setPlanStatus(plan.planId, "RUNNING", "PAUSED", { pausedReason: "user" }))) throw conflict(STATUS_CHANGED);
  await putPlanEvent(plan.planId, "paused", u.userId, { detail: { reason: "user" } });
}

/**
 * Continues a paused or cancelled plan: done rows stay done; rows stopped by the cancel continue from their artifacts. An
 * autonomous plan paused at its cost limit resumes only with a higher limit (`maxCostUsd`, above what it has spent).
 */
export async function resumePlan(u: UserRecord, plan: PlanRecord, body: ResumePlanRequest = {}): Promise<void> {
  if (plan.status !== "PAUSED" && plan.status !== "CANCELLED") throw conflict("一時停止中または中止した計画ではありません");
  await requirePlanRun(u, plan);
  if (body.maxCostUsd !== undefined && body.maxCostUsd !== null) {
    if (!plan.settings.autonomous) throw bad("費用の上限があるのは自律実行の計画だけです");
    const maxCostUsd = autonomousMaxCost(body.maxCostUsd);
    if (maxCostUsd === null) throw bad(`費用の上限は ${AUTONOMOUS_MAX_COST_RANGE.min}〜${AUTONOMOUS_MAX_COST_RANGE.max} USD で指定してください`);
    const spent = await planSpendUsd(plan, await listRows(plan.planId, true), new Map((await listUserProjects(plan.ownerUserId)).map((p) => [p.projectId, p])));
    if (maxCostUsd <= spent) throw bad(`費用の上限は、これまでの費用（${spent.toFixed(2)} USD）より大きくしてください`);
    const settings: PlanSettings = { ...plan.settings, autonomous: { ...plan.settings.autonomous, maxCostUsd } };
    if (!(await updatePlan(plan.planId, { settings, costLimitAt: null }, { status: plan.status }))) throw conflict(STATUS_CHANGED);
    plan = { ...plan, settings, costLimitAt: null };
    await putPlanEvent(plan.planId, "cost_limit_raised", u.userId, { detail: { maxCostUsd, spentUsd: spent } });
  } else if (plan.pausedReason === "cost_limit") throw bad("費用の上限に達しています。上限を上げて再開してください");
  if (plan.status === "CANCELLED") {
    for (const r of await listRows(plan.planId)) if (r.state === "cancelled") await updateRow(plan.planId, r.rowId, { state: "pending", claimedAt: null }, { state: "cancelled" });
  }
  if (!(await setPlanStatus(plan.planId, plan.status, "RUNNING", { pausedReason: null, cancelledAt: null }))) throw conflict(STATUS_CHANGED);
  await putPlanEvent(plan.planId, "resumed", u.userId);
  await kick(plan.planId);
}

/** Stops the plan: nothing new starts and the running rows' jobs (and a re-plan job) are cancelled. Done rows stay done. */
export async function cancelPlan(u: UserRecord, plan: PlanRecord): Promise<void> {
  if (plan.status !== "RUNNING" && plan.status !== "PAUSED") throw conflict("実行中または一時停止中の計画ではありません");
  if (!(await setPlanStatus(plan.planId, plan.status, "CANCELLED", { cancelledAt: nowIso(), pausedReason: null }))) throw conflict(STATUS_CHANGED);
  for (const r of await listRows(plan.planId)) {
    // 自律実行: the Orchestrator's job for the row (an answer or a resolution) is of no use any more
    if (r.rowJob) {
      if (r.rowJob.status === "queued") await stopPlanJob(plan.planId, r.rowJob.jobId, "plan cancelled");
      await updateRow(plan.planId, r.rowId, { rowJob: null }, { state: r.state });
    }
    if (!TRACKED_ROW_STATES.includes(r.state)) continue;
    const p = r.projectId ? await getProject(u.userId, r.projectId) : null;
    if (p && !isProjectDeleted(p) && ACTIVE_PROJECT_STATUSES.includes(p.status)) await stopProject(p, "plan");
    await updateRow(plan.planId, r.rowId, { state: "cancelled", claimedAt: null }, { state: r.state });
  }
  const fresh = await getPlan(plan.planId, true);
  if (fresh) await dropReplan(fresh, "plan cancelled");
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
  if (plan.status === "DRAFT" || plan.status === "DRAFTING" || plan.status === "COMPLETED") throw conflict("確定済みで終了していない計画の行だけをスキップできます");
  const row = (await listRows(plan.planId)).find((r) => r.rowId === rowId);
  if (!row) throw notFound();
  if (row.state !== "pending" && row.state !== "attention" && row.state !== "decision") throw conflict("待ち・要対応・人の判断の行だけをスキップできます");
  if (!(await updateRow(plan.planId, rowId, { state: "skipped" }, { state: row.state }))) throw conflict("行の状態が変わりました。再読み込みしてください");
  await putPlanEvent(plan.planId, "row_skipped", u.userId, { rowId });
  if (plan.status === "RUNNING" || plan.status === "PAUSED") await kick(plan.planId);
}

/**
 * The owner decides a 「人の判断」 row of a plan with a Canon: `done` counts it as done as it is (its pull request, if
 * any, stays as it is in the Canon); `push` pushes its finished project again (the runner pushes it on its next step).
 */
export async function resolveRow(u: UserRecord, plan: PlanRecord, rowId: string, action: unknown): Promise<void> {
  if (action !== "done" && action !== "push") throw bad("action は done か push です");
  if (plan.status !== "RUNNING" && plan.status !== "PAUSED") throw conflict("実行中または一時停止中の計画ではありません");
  const running = await withPlanLease(plan.planId, async (fresh) => {
    if (fresh.status !== "RUNNING" && fresh.status !== "PAUSED") throw conflict("実行中または一時停止中の計画ではありません");
    const row = (await listRows(plan.planId, true)).find((r) => r.rowId === rowId);
    if (!row) throw notFound();
    if (row.state !== "decision") throw conflict("人の判断を待つ行ではありません");
    let values: Partial<PlanRowRecord>;
    if (action === "done") values = { state: "done", completedAt: nowIso(), lastError: null };
    else {
      const p = row.projectId ? await getProject(u.userId, row.projectId) : null;
      if (!p || isProjectDeleted(p) || p.status !== "COMPLETED") throw conflict("完了したプロジェクトの行だけをもう一度 push できます");
      values = { state: "running", decisionReason: null, lastError: null, claimedAt: null };
    }
    if (!(await updateRow(plan.planId, rowId, values, { state: "decision" }))) throw conflict("行の状態が変わりました。再読み込みしてください");
    await putPlanEvent(plan.planId, "row_resolved", u.userId, { rowId, ...(row.projectId ? { projectId: row.projectId } : {}), detail: { action, reason: row.decisionReason ?? null } });
    return fresh.status === "RUNNING";
  });
  if (running || action === "push") await kick(plan.planId);
}

/** Soft delete of a draft, finished or cancelled plan (its projects stay). */
export async function deletePlan(u: UserRecord, plan: PlanRecord): Promise<string> {
  if (plan.status === "RUNNING" || plan.status === "PAUSED") throw conflict("実行中・一時停止中の計画は削除できません。先に中止してください");
  if (plan.status === "DRAFTING") throw conflict("下書きの作成中の計画は削除できません。先に下書きの作成を中止してください");
  const at = nowIso();
  if (!(await updatePlan(plan.planId, { deletedAt: at }, { status: plan.status }))) throw conflict(STATUS_CHANGED);
  return at;
}

// --- proposals of re-plan jobs ---------------------------------------------------------------------------------------

/** An open proposal of a plan that is running or paused; 404 / 409 otherwise. */
async function openProposal(fresh: PlanRecord, proposalId: string): Promise<PlanProposalRecord> {
  if (fresh.status !== "RUNNING" && fresh.status !== "PAUSED") throw conflict("実行中または一時停止中の計画ではありません");
  const p = PLAN_PROPOSAL_ID_REGEX.test(proposalId) ? await getProposal(fresh.planId, proposalId, true) : null;
  if (!p) throw notFound();
  if (p.status !== "open") throw conflict("この提案はすでに処理されています");
  return p;
}

/** Applies an open proposal: a new row (placed by the automatic order), a row left out, or the new policy. */
export async function acceptProposal(u: UserRecord, plan: PlanRecord, proposalId: string): Promise<{ ok: true; proposal: PlanProposalRecord }> {
  const r = await withPlanLease(plan.planId, async (fresh) => {
    const p = await openProposal(fresh, proposalId);
    const o = await applyProposal(fresh, p, u.userId);
    if (!o.ok) throw conflict("stale" in o ? o.stale : "full" in o ? o.full : "この提案はすでに処理されています");
    return { proposal: o.proposal, running: fresh.status === "RUNNING" };
  });
  if (r.running) await kick(plan.planId);
  return { ok: true, proposal: r.proposal };
}

export async function rejectProposal(u: UserRecord, plan: PlanRecord, proposalId: string): Promise<{ ok: true; proposal: PlanProposalRecord }> {
  return withPlanLease(plan.planId, async (fresh) => {
    const p = await openProposal(fresh, proposalId);
    const decided = { status: "rejected" as const, decidedAt: nowIso(), decidedBy: u.userId };
    if (!(await updateProposal(plan.planId, p.proposalId, decided, { status: "open" }))) throw conflict("この提案はすでに処理されています");
    await putPlanEvent(plan.planId, "proposal_rejected", u.userId, { detail: { kind: p.kind, proposalId: p.proposalId } });
    return { ok: true as const, proposal: { ...p, ...decided } };
  });
}

// --- detail ----------------------------------------------------------------------------------------------------------

const round6 = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

/**
 * The plan with its rows (their projects' live state, hub scores and overlaps), recent history, proposals, limits,
 * estimate, and what was spent so far (the rows' projects and the plan's own draft / re-plan jobs).
 */
export async function planDetail(u: UserRecord, plan: PlanRecord): Promise<PlanDetailResponse> {
  const [rows, events, limits, projects, proposals, jobs] = await Promise.all([
    listRows(plan.planId),
    listPlanEvents(plan.planId),
    currentLimits(),
    listUserProjects(u.userId),
    listProposals(plan.planId),
    // plan jobs are stored under the plan ID (like a Canon's AI reviews under the Canon ID)
    listJobsForCanon(plan.planId),
  ]);
  const byId = new Map(projects.map((p) => [p.projectId, p]));
  const live = rows.filter((r) => r.state !== "skipped");
  const hub = hubScores(live);
  const overlaps = overlapsOf(live);
  const flow = flowFacts(plan, rows, limits.effective);
  let cost = 0;
  let priced = false;
  const views: PlanRowView[] = rows.sort(byWaveAndOrder).map((r) => {
    const shared = r.state === "skipped" ? {} : { hub: hub.get(r.rowId) ?? 0, overlaps: overlaps.get(r.rowId) ?? [], ...(flow ? { lane: flow.lanes.get(r.rowId), wait: flow.waits.get(r.rowId) ?? null } : {}) };
    const p = r.projectId ? byId.get(r.projectId) : undefined;
    // a row done by an existing project did not spend anything for this plan
    if (!p || r.existing) return { ...r, ...shared, project: p ? projectView(p) : null };
    if (typeof p.costUsd === "number") {
      cost += p.costUsd;
      priced = true;
    }
    return { ...r, ...shared, project: projectView(p) };
  });
  let jobsCost = 0;
  let jobsPriced = false;
  for (const j of jobs) {
    if (j.type !== "plan" || j.userId !== plan.ownerUserId || typeof j.costUsd !== "number") continue;
    jobsCost += j.costUsd;
    jobsPriced = true;
  }
  const end = plan.completedAt ?? plan.cancelledAt ?? null;
  // only plans with a Canon read it
  const canon = plan.canonId ? await getCanon(plan.canonId) : null;
  // AI reviews of the plan's pull requests are stored under the Canon ID: they count toward what the plan spent
  if (canon && !isCanonDeleted(canon)) {
    const ours = new Set((await listPullRequests(canon.canonId)).filter((pr) => pr.planId === plan.planId).map((pr) => pr.prNo));
    if (ours.size) {
      for (const j of await listJobsForCanon(canon.canonId)) {
        if (j.type !== "canon-review" || j.userId !== plan.ownerUserId || typeof j.costUsd !== "number" || !ours.has(j.reviewPrNo ?? -1)) continue;
        cost += j.costUsd;
        priced = true;
      }
    }
  }
  const canonView: PlanDetailResponse["canon"] = plan.canonId
    ? canon && !isCanonDeleted(canon) && canon.ownerUserId === plan.ownerUserId
      ? { canonId: canon.canonId, name: canon.name, headRevision: canon.headRevision }
      : { canonId: plan.canonId, name: canon?.name ?? "", headRevision: canon?.headRevision ?? 0, missing: true }
    : null;
  const minutes = plan.confirmedAt ? Math.max(0, Math.round(((end ? Date.parse(end) : Date.now()) - Date.parse(plan.confirmedAt)) / 60000)) : null;
  return {
    plan: { ...plan, rowCounts: countRows(rows), rowCount: rows.length },
    rows: views,
    events: events.sort((a, b) => (a.sk < b.sk ? 1 : -1)).slice(0, 100),
    limits,
    estimate: planEstimateFor(plan, rows, limits.effective),
    actual: { minutes, costUsd: priced || jobsPriced ? round6(cost + jobsCost) : null },
    slots: flow?.slots ?? null,
    proposals: proposals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.sk < b.sk ? 1 : -1)),
    planJobsCostUsd: jobsPriced ? round6(jobsCost) : null,
    canon: canonView,
  };
}

/**
 * Flow plans (and drafts ordered automatically, which will run as one): the lane of every row, why each waiting row has
 * not started, and the slots in use (from the plan's own records: rows being built and the Orchestrator's jobs).
 */
function flowFacts(plan: PlanRecord, rows: PlanRowRecord[], effective: number) {
  const draft = plan.ordering === "auto" && (plan.status === "DRAFT" || plan.status === "DRAFTING");
  if (!isFlowPlan(plan) && !draft) return null;
  const live = rows.filter((r) => r.state !== "skipped");
  const lanes = planLanes(live);
  if (draft) return { lanes, waits: new Map<string, PlanRowWait>(), slots: null };
  const f = flowPlan(rows);
  const building = rows.filter((r) => r.state === "starting" || r.state === "running").length;
  const orchestrator = rows.filter((r) => r.rowJob?.status === "queued" || r.aiReview === "queued").length + (plan.replan?.status === "queued" || plan.replan?.status === "running" ? 1 : 0);
  const used = building + orchestrator;
  const held = !!plan.canonId && waitingPrs(rows) >= PLAN_MAX_WAITING_PRS;
  const waits = new Map<string, PlanRowWait>(f.waits);
  // ready rows that have not started wait for a slot, or for the plan's pull requests to be approved
  if (plan.status === "RUNNING") for (const id of f.ready) if (!rows.find((r) => r.rowId === id)?.projectId) waits.set(id, { kind: held ? "prs" : "slot", rowIds: [] });
  return { lanes, waits, slots: { used, orchestrator, limit: effective } };
}

const PULSE_WAITING: ReadonlySet<PlanRowView["state"]> = new Set(["question", "review", "decision", "attention"]);
const pulseRow = (r: PlanRowView): PlanPulseRow => ({
  rowId: r.rowId,
  roi: r.roi,
  tlf: r.tlf,
  wave: r.wave,
  state: r.state,
  projectId: r.projectId,
  startedAt: r.startedAt ?? null,
  decisionReason: r.decisionReason ?? null,
  attentionReason: r.attentionReason ?? null,
  prNo: r.prNo ?? null,
  project: r.project ?? null,
});

/** What a live plan is doing now, from its detail: rows by wave and state, the rows running and waiting, the newest events. */
export function planPulse(d: PlanDetailResponse): PlanPulse {
  const waves = new Map<number, Partial<Record<PlanRowView["state"], number>>>();
  for (const r of d.rows) {
    const c = waves.get(r.wave) ?? {};
    c[r.state] = (c[r.state] ?? 0) + 1;
    waves.set(r.wave, c);
  }
  const lanes = new Map<number, Partial<Record<PlanRowView["state"], number>>>();
  for (const r of d.rows) {
    if (r.lane === undefined) continue;
    const c = lanes.get(r.lane) ?? {};
    c[r.state] = (c[r.state] ?? 0) + 1;
    lanes.set(r.lane, c);
  }
  const byId = new Map(d.rows.map((r) => [r.rowId, r]));
  return {
    waves: [...waves.entries()].sort((a, b) => a[0] - b[0]).map(([wave, counts]) => ({ wave, counts })),
    ...(lanes.size ? { lanes: [...lanes.entries()].sort((a, b) => a[0] - b[0]).map(([lane, counts]) => ({ lane, counts })) } : {}),
    running: d.rows.filter((r) => r.state === "starting" || r.state === "running").map(pulseRow),
    waiting: d.rows.filter((r) => PULSE_WAITING.has(r.state)).map(pulseRow),
    events: d.events.slice(0, PLAN_PULSE_EVENTS).map((e) => {
      const row = e.rowId ? byId.get(e.rowId) : undefined;
      return { sk: e.sk, type: e.type, at: e.at, ...(e.detail ? { detail: e.detail } : {}), row: row ? { roi: row.roi, tlf: row.tlf } : null };
    }),
    openProposals: d.proposals.filter((p) => p.status === "open").length,
    estimate: d.estimate,
    actual: d.actual,
  };
}

function projectView(p: ProjectRecord): NonNullable<PlanRowView["project"]> {
  return {
    name: p.name ?? p.projectId,
    status: p.status,
    pendingQuestion: p.status === "WAITING_USER_INPUT" ? p.pendingQuestion : null,
    costUsd: p.costUsd ?? null,
    revision: p.revision ?? 0,
    errorMessage: p.errorMessage ?? null,
    deleted: isProjectDeleted(p),
    stepStates: p.stepStates,
    activeStage: p.activeStage ?? null,
    researchMode: !!p.researchMode,
  };
}
