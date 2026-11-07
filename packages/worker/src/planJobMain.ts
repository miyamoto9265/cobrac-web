
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobRecord } from "@cobrac/shared";
import {
  ATTACHMENT_DERIVED_PREFIX,
  ATTACHMENT_FILES_PREFIX,
  DEFAULT_CODEX_MODEL,
  type FileAttachment,
  PLAN_JOB_INPUT_SCHEMA,
  PLAN_ROW_JOB_INPUT_SCHEMA,
  PLAN_ROW_JOB_RESULT_SCHEMA,
  PLAN_ROW_JOB_TIME_BUDGET_MS,
  PLAN_JOB_REASONING_EFFORT,
  PLAN_JOB_RESULT_SCHEMA,
  planJobBudgetMs,
  PLAN_RESULT_SCHEMA,
  type PlanJobInput,
  type PlanJobResult,
  type PlanRowJobInput,
  type PlanRowJobResult,
  addUsage,
  estimateCostUsd,
  nowIso,
  planAttachmentTypeOf,
  providerOf,
  planJobKey,
  planPrefix,
} from "@cobrac/shared";
import {
  createEngine,
  fromCodexUsage,
  tokenUsageOf,
  openThread,
  sessionTotalUsage,
  turnUsage,
  type ModelSettings,
  type TurnUsage,
} from "./codex.js";
import {
  getJob,
  getDefaultApiKey,
  getUser,
  updateJob,
  updateJobIfStatus,
} from "./db.js";
import { env } from "./env.js";
import { prepareMaterials, type MaterialEntry } from "./materials.js";
import { planMaterialsIndex, runPlanJob, runPlanRowJob } from "./planJob.js";
import { RcsClient, resolveRcsConnection } from "./rcs.js";
import { ownKeyOf, planRunKey } from "./runKey.js";
import { downloadDir, getJsonObject, putObject, uploadDir } from "./s3sync.js";
import { jobId, projectId, runState, startedAt, userId, decryptApiKey, taskArn, type FailJob } from "./jobContext.js";

// --- BRA Planner draft / re-plan ----------------------------------------------------

/** While a plan job's turns run: records their usage so far on the job (SIGTERM calls it before the process ends). */
export let planJobOnStop: (() => Promise<void>) | null = null;

/**
 * `projectId` is the plan ID here; the job, its input.json and result.json (and the plan's attachments) are all that
 * is read or written. The plan runner applies the result.
 */
/** `fail` is the worker's job failure handler (index.ts) */
export async function planJobMain(fail: FailJob) {
  const [user, job] = await Promise.all([getUser(userId), getJob(projectId, jobId)]);
  if (!user || !job || job.type !== "plan" || !job.planJobKind) throw new Error("user/plan job not found");
  if (job.status !== "QUEUED") {
    console.log(`[worker] plan job is ${job.status}; exiting`);
    return;
  }
  const model = job.model || env.codexModel || DEFAULT_CODEX_MODEL;
  const key = planRunKey(user, ownKeyOf(user, model) ? null : await getDefaultApiKey(providerOf(model)), model);
  if ("error" in key) {
    await fail(key.error);
    return;
  }
  const apiKey = await decryptApiKey(key.encryptedApiKey, key.context);
  const reasoningEffort = job.reasoningEffort ?? PLAN_JOB_REASONING_EFFORT;
  const ecsTaskArn = await taskArn();
  // the owner may have cancelled the draft meanwhile: never turn a cancelled job back into a running one
  if (runState.stopping || !(await updateJobIfStatus(projectId, jobId, "QUEUED", { status: "RUNNING", startedAt: nowIso(), lastHeartbeat: nowIso(), ecsTaskArn, keySource: key.source }))) {
    console.log("[worker] plan job is no longer queued (cancelled, or the worker is stopping); exiting");
    return;
  }
  // after SIGTERM the job is left to the janitor (its heartbeat is marked stale), so no beat may follow
  const heartbeat = setInterval(() => void (runState.stopping ? undefined : updateJob(projectId, jobId, { lastHeartbeat: nowIso() }).catch(() => undefined)), 45_000);
  try {
    if (job.planJobKind === "answer" || job.planJobKind === "resolve") {
      await planRowJob(job, apiKey, model, reasoningEffort, fail);
      return;
    }
    const input = await getJsonObject<PlanJobInput>(planJobKey(projectId, jobId, "input.json"));
    if (!input || input.schema !== PLAN_JOB_INPUT_SCHEMA || input.planId !== projectId || input.jobId !== jobId || input.kind !== job.planJobKind) {
      await fail("The input of the plan job could not be read.");
      return;
    }
    const rcsConn = await resolveRcsConnection(
      { url: env.rcsMcpUrl, secretId: env.rcsMcpSecretId, token: env.rcsMcpToken, region: env.region },
      (m) => console.warn(`[worker] ${m}`),
    );
    console.log(`[worker] rcs=${rcsConn ? rcsConn.url : "(disabled)"}`);
    let spec = await readFile(join(env.promptsDir, "plan.md"), "utf8");
    if (!rcsConn) {
      spec +=
        "\n\nNote for this job: the RCS MCP tools are not available. Leave `anchors` empty instead of guessing IDs, and say in `notes` that the anchors are missing because RCS was not available.\n";
    }
    await mkdir(env.workDir, { recursive: true });
    const materialsIndex = await planMaterials(input);

    const settings: ModelSettings = { model, reasoningEffort: reasoningEffort as ModelSettings["reasoningEffort"] };
    const thread = openThread(createEngine(settings.model, apiKey, rcsConn), null, settings, { webSearch: false });
    const rcsClient = rcsConn ? new RcsClient(rcsConn) : null;
    // Codex reports the thread's running total with each turn; a retry turn counts only what it added
    let total: TurnUsage | null = null;
    const toTokens = tokenUsageOf;
    // SIGTERM (the StopTask of a cancelled draft, a Spot interruption) ends the process before the job ends; what the
    // turns used is billed all the same: the thread is this job's own, so its running total is the job's usage
    planJobOnStop = async () => {
      const u = thread.id ? sessionTotalUsage(thread.id) : null;
      if (!u) return;
      const stopped = toTokens(u);
      await updateJob(projectId, jobId, { usage: stopped, costUsd: estimateCostUsd(model, stopped), model, reasoningEffort });
    };
    const outcome = await runPlanJob({
      input,
      spec,
      materialsIndex,
      turn: async (prompt, signal) => {
        const t = await thread.run(prompt, { outputSchema: PLAN_RESULT_SCHEMA, signal });
        const after = t.usage ? fromCodexUsage(t.usage) : null;
        const usage = turnUsage(after, total);
        if (after) total = after;
        return { text: t.finalResponse, usage: toTokens(usage) };
      },
      lookupHomba: rcsClient ? (ids) => rcsClient.lookupHomba(ids) : undefined,
      // the budget counts from the worker's start, so the draft is ready in time after the request (long lists get more)
      deadlineMs: startedAt + planJobBudgetMs(input),
    });
    let usage = outcome.usage;
    if (outcome.result === "failed" && thread.id) {
      // a turn cut off by the time budget is billed too: count it from the session file
      const cut = turnUsage(sessionTotalUsage(thread.id), total);
      usage = addUsage(usage, toTokens(cut));
    }
    const cost = { usage, costUsd: estimateCostUsd(model, usage), model, reasoningEffort };
    if (outcome.result === "failed") {
      console.log(`[worker] plan job failed: ${outcome.error}`);
      await endPlanJob({ ...cost, status: "FAILED", errorMessage: outcome.error, endedAt: nowIso() });
      return;
    }
    const result: PlanJobResult = {
      schema: PLAN_JOB_RESULT_SCHEMA,
      kind: input.kind,
      planId: projectId,
      jobId,
      model,
      locale: input.locale,
      createdAt: nowIso(),
      ...outcome.parsed,
    };
    try {
      await putObject(planJobKey(projectId, jobId, "result.json"), JSON.stringify(result, null, 2) + "\n");
      await endPlanJob({ ...cost, status: "COMPLETED", endedAt: nowIso() });
    } catch (e) {
      // the turns ran and are billed: keep their usage on the failed job
      console.error("[worker] plan result could not be stored", e);
      await endPlanJob({ ...cost, status: "FAILED", errorMessage: "The result of the plan job could not be stored.", endedAt: nowIso() });
      return;
    }
    const p = outcome.parsed;
    console.log(`[worker] plan ${input.kind} written (${p.rows.length} rows, ${p.proposals.length} proposals, ${p.unread.length} unread, ${p.questions.length} questions, ${p.dropped} dropped, ${outcome.attempts} turn(s))`);
  } finally {
    clearInterval(heartbeat);
    planJobOnStop = null;
  }
}

/**
 * A row job of an autonomous plan (自律実行): the Orchestrator's AI answers the question of the row's agent or resolves a
 * row that needs attention or a decision, in one turn without tools (prompts/orchestrator.md). The plan runner applies
 * the result after checking it against the input again.
 */
async function planRowJob(job: JobRecord, apiKey: string, model: string, reasoningEffort: NonNullable<JobRecord["reasoningEffort"]>, fail: FailJob): Promise<void> {
  const input = await getJsonObject<PlanRowJobInput>(planJobKey(projectId, jobId, "input.json"));
  if (!input || input.schema !== PLAN_ROW_JOB_INPUT_SCHEMA || input.planId !== projectId || input.jobId !== jobId || input.kind !== job.planJobKind || input.rowId !== job.planRowId) {
    await fail("The input of the plan job could not be read.");
    return;
  }
  const spec = await readFile(join(env.promptsDir, "orchestrator.md"), "utf8");
  const settings: ModelSettings = { model, reasoningEffort: reasoningEffort as ModelSettings["reasoningEffort"] };
  const thread = openThread(createEngine(settings.model, apiKey, null), null, settings, { webSearch: false });
  let total: TurnUsage | null = null;
  const toTokens = tokenUsageOf;
  planJobOnStop = async () => {
    const u = thread.id ? sessionTotalUsage(thread.id) : null;
    if (!u) return;
    const stopped = toTokens(u);
    await updateJob(projectId, jobId, { usage: stopped, costUsd: estimateCostUsd(model, stopped), model, reasoningEffort });
  };
  const outcome = await runPlanRowJob({
    input,
    spec,
    turn: async (prompt, schema, signal) => {
      const t = await thread.run(prompt, { outputSchema: schema, signal });
      const after = t.usage ? fromCodexUsage(t.usage) : null;
      const usage = turnUsage(after, total);
      if (after) total = after;
      return { text: t.finalResponse, usage: toTokens(usage) };
    },
    deadlineMs: startedAt + PLAN_ROW_JOB_TIME_BUDGET_MS,
  });
  let usage = outcome.usage;
  if (outcome.result === "failed" && thread.id) usage = addUsage(usage, toTokens(turnUsage(sessionTotalUsage(thread.id), total)));
  const cost = { usage, costUsd: estimateCostUsd(model, usage), model, reasoningEffort };
  if (outcome.result === "failed") {
    console.log(`[worker] plan ${input.kind} job failed: ${outcome.error}`);
    await endPlanJob({ ...cost, status: "FAILED", errorMessage: outcome.error, endedAt: nowIso() });
    return;
  }
  const result: PlanRowJobResult = { schema: PLAN_ROW_JOB_RESULT_SCHEMA, kind: input.kind, planId: projectId, jobId, rowId: input.rowId, model, createdAt: nowIso(), decision: outcome.decision };
  try {
    await putObject(planJobKey(projectId, jobId, "result.json"), JSON.stringify(result, null, 2) + "\n");
    await endPlanJob({ ...cost, status: "COMPLETED", endedAt: nowIso() });
  } catch (e) {
    console.error("[worker] plan row result could not be stored", e);
    await endPlanJob({ ...cost, status: "FAILED", errorMessage: "The result of the plan job could not be stored.", endedAt: nowIso() });
    return;
  }
  console.log(`[worker] plan ${input.kind} written for row ${input.rowId} (${outcome.attempts} turn(s))`);
}

/**
 * The capability lists the job reads (xlsx / PDF; CSV / TSV / text were read by the API) into materials/, with their
 * extracted text; the derived text is stored under the plan's `attachments/derived/` for later jobs. A file that cannot
 * be prepared is listed as failed, so the model reports it in `unread`.
 */
async function planMaterials(input: PlanJobInput): Promise<string | null> {
  if (!input.attachments.length) return null;
  const failed = (a: { id: string; name: string }, note: string): MaterialEntry => ({ id: a.id, kind: "file", source: a.name, path: null, textPath: null, image: false, status: "failed", note });
  // keys come from the plan's META; anything outside its files folder is not read
  const inFiles = (key: string) => {
    const name = key.startsWith(ATTACHMENT_FILES_PREFIX) ? key.slice(ATTACHMENT_FILES_PREFIX.length) : "";
    // one file name, no path (a name may contain dots, e.g. `list..v2.xlsx`)
    return !!name && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\");
  };
  const files: FileAttachment[] = input.attachments
    .filter((a) => inFiles(a.key))
    .map((a) => ({ kind: "file", id: a.id, name: a.name, key: a.key, size: 0, contentType: (planAttachmentTypeOf(a.name) ?? planAttachmentTypeOf(a.key))?.mime ?? "application/octet-stream" }));
  const outside = input.attachments.filter((a) => !inFiles(a.key)).map((a) => failed(a, "not stored with the plan"));
  const base = planPrefix(projectId);
  try {
    const m = await prepareMaterials(env.workDir, files, {
      download: async (dir) => void (await downloadDir(`${base}attachments/`, dir)),
      uploadDerived: async (dir) => void (await uploadDir(dir, base + ATTACHMENT_DERIVED_PREFIX)),
    });
    return planMaterialsIndex([...(m?.entries ?? []), ...outside]);
  } catch (e) {
    console.error("[worker] plan materials failed", e);
    const note = `could not be prepared: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
    return planMaterialsIndex(input.attachments.map((a) => failed(a, note)));
  }
}

/**
 * Ends a plan job; one its owner cancelled meanwhile stays cancelled and only gets its usage (the runner reads the
 * status). A job that does not exist is not created by the write.
 */
export async function endPlanJob(values: Parameters<typeof updateJob>[2]): Promise<void> {
  const status = (await getJob(projectId, jobId))?.status;
  if (!status) return;
  if (status === "CANCELLED") {
    console.log("[worker] plan job was cancelled meanwhile; keeping it cancelled");
    if (values.usage) await updateJob(projectId, jobId, { usage: values.usage, costUsd: values.costUsd, model: values.model });
    return;
  }
  await updateJob(projectId, jobId, values);
}
