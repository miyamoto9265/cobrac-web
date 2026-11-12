
import { existsSync, readdirSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ArticleJobState,
  AutoFix,
  ArticleMeta,
  CrossCode,
  JobRecord,
  PipelineStage,
  ProjectRecord,
  ReasoningEffort,
  ResearchCheck,
  ResearchOutcome,
  ResearchStepMetrics,
  TokenUsage,
  WorkflowStep,
} from "@cobrac/shared";
import {
  ATTACHMENT_DERIVED_PREFIX,
  CANON_AGENT_DIR,
  EMPTY_USAGE,
  canonAgentFiles,
  canonRevisionKey,
  planPolicyNote,
  planPolicyOf,
  type CanonRunInfo,
  type CanonSnapshot,
  LIT_MCP_SERVER,
  ADJUSTMENT_CODES,
  CROSS_CODES,
  PROJECT_FILES,
  QUOTE_STATUSES,
  QUOTE_STATUS_LABEL,
  RESEARCH_BUDGET,
  RESEARCH_FILES,
  REF_STATUSES,
  addUsage,
  articleFigureKey,
  articleKey,
  articleMetaKey,
  braDownloadFileName,
  estimateCostUsd,
  fixTurnEffort,
  formatTokens,
  formatUsd,
  harnessPromptNotice,
  isAgentNameable,
  isProjectlessMode,
  isResearchMode,
  agentHarnessSchemas,
  evidenceSettingsOf,
  isHypothesisMode,
  isUiLocale,
  nowIso,
  providerOf,
  projectDisplayName,
  replyLanguageInstruction,
  researchEffort,
  uiLanguageName,
  withReferenceList,
} from "@cobrac/shared";
import { articlePrompt, prepareArticleFigures, readReferences, runArticle } from "./article.js";
import {
  createEngine,
  fromCodexUsage,
  tokenUsageOf,
  InFlightTurn,
  isRequestTooLarge,
  openThread,
  resolveModelSettings,
  runTurn,
  type ModelSettings,
  type TurnSink,
  type TurnUsage,
} from "./codex.js";
import {
  getJob,
  getCanonMeta,
  getProject,
  getDefaultApiKey,
  getTeam,
  getUser,
  incrementProjectRevision,
  putMessage,
  refreshProjectUsage,
  updateAutoProjectName,
  updateJob,
  updateProject,
} from "./db.js";
import { env } from "./env.js";
import { finalizeProject } from "./finalize.js";
import { NO_PROGRESS_MESSAGE, NO_PROGRESS_MS, ProgressWatch, THREAD_RESUME_MAX_BYTES, THREAD_TOO_LARGE_MESSAGE, threadBytes, workspaceFingerprint } from "./guards.js";
import { returnsToStrict, versionHypotheses } from "./hypothesisRules.js";
import { PERIODIC_PERSIST_MS, handleStop, serialized } from "./interrupt.js";
import { prepareMaterials } from "./materials.js";
import { RcsClient, resolveRcsConnection } from "./rcs.js";
import { ownKeyOf, planRunKey, usesTeamKey } from "./runKey.js";
import { threadProviderOf } from "./claude.js";
import { LiteratureHttp } from "./http.js";
import { QuoteVerifier } from "./quotes.js";
import { ReferenceVerifier } from "./references.js";
import { downloadDir, getJsonObject, listFiles, listPrefix, moveObjects, putObject, uploadDir } from "./s3sync.js";
import {
  PHASES,
  adjustmentPrompt,
  checkPhase,
  checkResearchStep,
  researchDone,
  runPhases,
  runResearch,
  turnInput,
  answerPreamble,
  writeSchemas,
  type CheckDeps,
  type Phase,
  type PhaseCheck,
  type CrossReport,
  type PhaseContext,
  type Prompt,
  type QuoteReport,
  type ReferenceReport,
  type ResearchTurn,
} from "./pipeline.js";
import { MAX_REPORTED_ERRORS, jobId, log, mode, paths, prefix, projectId, runState, startedAt, userId, decryptApiKey, taskArn } from "./jobContext.js";
import { phaseSpec, frgCandidatesSection, rawPhaseSpec, hypothesisNotes, header, phasePrompt, firstPrompt, freshThreadPrompt, fixPrompt } from "./jobPrompts.js";
import { freezeJobVersion, freezeBaseline } from "./jobVersions.js";
import { canonReviewJob } from "./canonReviewJob.js";
import { planJobMain, endPlanJob, planJobOnStop } from "./planJobMain.js";
import { csvComplete, currentStepOf, detectStepStates, isLegacyWorkspace, liveStageOf } from "./steps.js";

const LEGACY_WORKSPACE_MESSAGE =
  "This project uses the file format from before v0.8 and can no longer be continued. Its xlsx and graphs stay available; start a new project to continue the work.";
const LEGACY_ARTICLE_MESSAGE = "Explanatory articles need a project made with v0.8 or later.";

/** Phases the harness has accepted (validated) */
const accepted = new Set<WorkflowStep>();
let xlsxDone = false;
/** The research step or the adjustment turn while it runs (the step states cannot tell either apart) */
let stageOverride: "RESEARCH" | "ADJUST" | null = null;
let lastStage: PipelineStage | null | undefined;
let cancelled = false;
/** The workspace was restored or created, so persistState has something to save */
let workspaceReady = false;
/** The saved thread was too large to resume and was moved aside (prepareWorkspace); the run starts a new thread. */
let threadSetAside = false;
const progress = new ProgressWatch();
/** Translation of non-English values in the data files (QC-03-03 / QC-08-01), set for each BRA run */
let translator: ((texts: string[]) => Promise<Map<string, string>>) | null = null;
const literatureHttp = new LiteratureHttp({ mailto: env.crossrefMailto, ncbiApiKey: env.ncbiApiKey });
const referenceVerifier = env.referenceLookup ? new ReferenceVerifier({ http: literatureHttp }) : null;
const quoteVerifier = env.quoteCheck ? new QuoteVerifier({ http: literatureHttp, threshold: env.quoteMatchThreshold }) : null;


async function main() {
  console.log(`[worker] start job=${jobId} project=${projectId} mode=${mode}`);
  if (mode === "canon-review") {
    await canonReviewJob(fail);
    return;
  }
  if (mode === "plan") {
    await planJobMain(fail);
    return;
  }
  const [user, project, job] = await Promise.all([getUser(userId), getProject(userId, projectId), getJob(projectId, jobId)]);
  if (!user || !project || !job) throw new Error("user/project/job not found");
  if (job.status === "CANCELLED") {
    console.log("[worker] job already cancelled; exiting");
    return;
  }
  const runModel = resolveModelSettings(mode === "article" ? { model: job.model || project.model } : project).model!;
  const team = await getTeam(job.teamId ?? project.teamId);
  const key = planRunKey(user, usesTeamKey(user, team, runModel) || ownKeyOf(user, runModel) ? null : await getDefaultApiKey(providerOf(runModel)), runModel, team);
  if ("error" in key) {
    await fail(key.error, key.meta);
    return;
  }
  console.log(`[worker] key=${key.source}`);
  const apiKey = await decryptApiKey(key.encryptedApiKey, key.context);
  if (job.keySource !== key.source) await updateJob(projectId, jobId, { keySource: key.source });
  const rcsConn = await resolveRcsConnection(
    { url: env.rcsMcpUrl, secretId: env.rcsMcpSecretId, token: env.rcsMcpToken, region: env.region },
    (m) => console.warn(`[worker] ${m}`),
  );
  runState.rcs = rcsConn ? new RcsClient(rcsConn) : null;
  console.log(`[worker] rcs=${rcsConn ? rcsConn.url : "(disabled)"}`);

  await updateJob(projectId, jobId, { status: "RUNNING", startedAt: job.startedAt ?? nowIso(), lastHeartbeat: nowIso(), ecsTaskArn: await taskArn() });
  await updateProject(userId, projectId, {
    status: "RUNNING",
    activeJobId: jobId,
    pendingQuestion: null,
    errorMessage: null,
    ...(mode === "article" ? { articleJob: articleState(project, job, "RUNNING") } : {}),
  });
  if (mode === "article") {
    await articleJob(apiKey, project, job);
    return;
  }

  // --- workspace ------------------------------------------------------------
  await prepareWorkspace(project);
  workspaceReady = true;
  if (mode !== "initial" && isLegacyWorkspace(paths)) {
    await fail(LEGACY_WORKSPACE_MESSAGE, { i18n: "sys.legacyWorkspace" });
    return;
  }
  if (mode === "followup") await freezeBaseline(project);
  await prepareCanon(project);
  runState.planNote = project.planPolicy ? planPolicyNote(planPolicyOf(project.planPolicy)) : "";
  if (!runState.rcs) await log("RCS (SABRA lookup) is not available in this run; UC anchors are not checked against RCS.");
  // a follow-up re-validates every phase, so it starts with nothing accepted
  const carryOver = mode === "resume" || mode === "retry";
  xlsxDone = carryOver && project.stepStates?.XLSX === "done";
  if (carryOver) for (const s of PHASES) if (project.stepStates?.[s] === "done") accepted.add(s);
  await syncStepStates();

  // --- codex ----------------------------------------------------------------
  runState.research = isResearchMode(project);
  runState.harnessRules = project.harnessRules ?? 0;
  runState.evidence = evidenceSettingsOf(project);
  // the lit tools are on in every BRA run (quotes, PMIDs); research mode only adds the survey step
  const codex = createEngine(resolveModelSettings(project).model, apiKey, rcsConn, { lit: true });
  translator = (texts) => translateTexts(resolveModelSettings(project).model, apiKey, texts);
  runState.jobUsage = job.usage ?? EMPTY_USAGE;
  runState.jobCostUsd = job.costUsd ?? (job.usage ? null : 0);
  let threadId = mode === "initial" ? null : project.codexThreadId;
  if (threadId && threadSetAside) {
    await log(THREAD_TOO_LARGE_MESSAGE, { i18n: "sys.newThreadTooLarge" });
    threadId = null;
  }
  if (threadId && !existsSync(join(env.codexHome, "sessions"))) {
    await log("Thread state was missing; resuming on a new thread.", { i18n: "sys.newThread" });
    threadId = null;
  }
  if (threadId && threadProviderOf(threadId) !== providerOf(resolveModelSettings(project).model)) {
    // the project moved to a model of another provider (OpenAI, Claude, DeepSeek): one provider cannot resume another's thread
    await log("The model now runs on another provider; continuing on a new thread.", { i18n: "sys.newThreadProvider" });
    threadId = null;
  }
  const freshThread = !threadId;
  const settings = resolveModelSettings(project);
  runState.resolvedModel = settings.model;
  runState.resolvedEffort = settings.reasoningEffort;
  console.log(`[worker] model=${settings.model ?? "(default)"} effort=${settings.reasoningEffort ?? "(default)"} research=${runState.research}`);
  await updateJob(projectId, jobId, { model: runState.resolvedModel, reasoningEffort: (runState.resolvedEffort as JobRecord["reasoningEffort"]) ?? null, researchMode: runState.research });

  const replyLanguage = replyLanguageInstruction(job.locale);
  console.log(`[worker] reply locale=${job.locale ?? "(user's language)"}`);

  const abort = new AbortController();
  const heartbeat = startHeartbeat(abort, { persist: true });

  const sink: TurnSink = {
    onMessage: async (type, content, meta) => {
      await putMessage(projectId, jobId, "agent", type, content, { meta, step: runState.lastStepStates ? currentStepOf(runState.lastStepStates) : null });
    },
    onFileChange: async () => {
      await syncStepStates();
    },
    onHeartbeat: async () => {
      if (!runState.stopping) await updateJob(projectId, jobId, { lastHeartbeat: nowIso() });
    },
    onMcpCall: async (item) => {
      if (item.server === "rcs") await recordRcsCall(item);
      if (item.server === LIT_MCP_SERVER) await recordSearch(item);
    },
  };
  const onMessage = sink.onMessage;
  sink.onMessage = async (type, content, meta) => {
    if (type === "web_search") await recordSearch({ tool: "web_search", arguments: { query: content }, status: "completed" });
    await onMessage(type, content, meta);
  };

  /**
   * One agent turn on the project thread (the prompt's `effort`, else `o.effort`, overrides the reasoning effort for this turn only).
   * "stop" when the run must stop (question, failure, cancel); "budget" when `budget` cut the turn off.
   */
  const runAgentTurn = async (p: Prompt, o: { effort?: ReasoningEffort; budget?: AbortSignal; freshThread?: boolean } = {}): Promise<ResearchTurn> => {
    const effort = p.effort ?? o.effort;
    const turnSettings: ModelSettings = effort ? { ...settings, reasoningEffort: effort } : settings;
    const thread = openThread(codex, threadId, turnSettings);
    let turn;
    try {
      const text = turnInput(p, replyLanguage);
      const input = p.images?.length ? [{ type: "text" as const, text }, ...p.images.map((path) => ({ type: "local_image" as const, path }))] : text;
      turn = await runTurn(thread, input, sink, o.budget ? AbortSignal.any([abort.signal, o.budget]) : abort.signal, { inFlight });
    } catch (e) {
      await countCutOffTurn(cancelled ? "cancelled" : o.budget?.aborted ? "time budget" : "crashed");
      if (cancelled) {
        await persistState();
        console.log("[worker] cancelled; state persisted");
        return "stop";
      }
      if (o.budget?.aborted) {
        threadId = thread.id ?? threadId;
        if (threadId) await updateProject(userId, projectId, { codexThreadId: threadId });
        await syncStepStates();
        await persistState();
        return "budget";
      }
      throw e;
    }
    threadId = turn.threadId ?? threadId;
    if (cancelled) {
      await persistState();
      return "stop";
    }
    if (turn.threadId) await updateProject(userId, projectId, { codexThreadId: turn.threadId });
    await accumulateUsage(turn.usage);
    await syncStepStates();

    if (turn.failed && isRequestTooLarge(turn.errorMessage) && !o.freshThread) {
      // the conversation itself is too large for one request; the files hold the work, so go on in a new conversation
      await log("The conversation grew larger than the OpenAI request limit; continuing the same task in a new conversation.", { details: turn.errorMessage ?? "" });
      threadId = null;
      return runAgentTurn(await freshThreadPrompt(project, p), { ...o, freshThread: true });
    }
    if (turn.failed) {
      await persistState();
      await fail(turn.errorMessage ?? "Codex turn failed");
      return "stop";
    }
    if (turn.question) {
      await persistState();
      await updateJob(projectId, jobId, { status: "WAITING_USER_INPUT", pendingAnswer: null });
      await updateProject(userId, projectId, { status: "WAITING_USER_INPUT", pendingQuestion: turn.question });
      await log("Answer the agent’s question to resume work.", { i18n: "sys.waitingAnswer" });
      console.log("[worker] waiting for user input; exiting");
      return "stop";
    }
    return "ok";
  };
  const agentTurn = async (p: Prompt): Promise<boolean> => (await runAgentTurn(p)) === "ok";

  try {
    const ctx: PhaseContext = { hcd: null, frg: null };
    const firstOpen = PHASES.findIndex((p) => !accepted.has(p));
    const startIdx = firstOpen === -1 ? PHASES.length - 1 : firstOpen;
    const researchFirst = runState.research && startIdx === 0 && mode !== "followup" && !researchDone(paths);
    let first = researchFirst ? await researchFirstPrompt(project, job, freshThread) : await firstPrompt(project, job, PHASES[startIdx], freshThread);
    // a new thread has not seen the attached images yet
    if (first && freshThread && runState.materials?.images.length) first.images = runState.materials.images;
    if (first) {
      const notice = harnessPromptNotice(mode, first.shown);
      await putMessage(projectId, jobId, "system", "status", notice.content, { meta: notice.meta });
    }
    if (researchFirst) {
      await setStage("RESEARCH");
      if ((await researchStep(project, first, runAgentTurn)) === "stopped") return;
      await setStage(null);
      first = await phasePrompt(project, "HCD");
    }

    const run = await runPhases(
      {
        maxNudges: env.maxNudges,
        turn: agentTurn,
        check: (phase) => acceptPhase(phase, project, ctx),
        hasFiles: phaseHasFiles,
        phasePrompt: (phase) => phasePrompt(project, phase),
        fixPrompt: async (phase, errors, attempt, withSpec) => {
          await log(`Checks found ${errors.length} issue(s) in ${phase}; asked the agent to fix them.`, {
            i18n: "sys.validationFailed",
            step: phase,
            count: errors.length,
            details: errors.join("\n"),
          });
          const p = fixPrompt(phase, errors, attempt);
          return withSpec ? { ...p, hidden: await phaseSpec(phase) } : p;
        },
        onWarn: async (phase, errors) => {
          await log(`${phase} still has ${errors.length} unresolved check issue(s); continuing.`, {
            i18n: "sys.validationWarn",
            step: phase,
            count: errors.length,
            details: errors.join("\n"),
          });
        },
        onAccepted: async (phase) => {
          if (phase !== "CSV" && ctx.references) await logReferenceSummary(ctx.references);
          if (phase === "HCD" && ctx.quotes) await logQuoteSummary(ctx.quotes);
          if (phase === "HCD" && ctx.quotes?.reused) await logQuoteReuse(ctx.quotes.reused);
          if (phase !== "HCD" && ctx.cross) await logCrossSummary(ctx.cross);
          accepted.add(phase);
          if (phase === "FRG") stageOverride = null;
          await syncStepStates();
          await persistState();
        },
        adjustPrompt: async (phase) => {
          if (phase !== "FRG") return null;
          const p = adjustmentPrompt(ctx, existsSync(paths.decisionLog) ? await readFile(paths.decisionLog, "utf8") : null);
          if (!p || !ctx.adjustment) return null;
          const counts = Object.entries(ctx.adjustment.before).filter(([c, n]) => n > 0 && ADJUSTMENT_CODES.includes(c as CrossCode));
          await log(`The HCD and the FRG do not fit together yet (${counts.map(([c, n]) => `${c} ${n}`).join(", ")}); asked the agent for one adjustment turn.`, {
            details: ctx.adjustment.findings.map((f) => `${f.code} ${f.message}`).join("\n"),
          });
          await setStage("ADJUST");
          const candidates = await frgCandidatesSection();
          const specs = freshThread ? `${header(project)}\n\nReference specs:\n\n${await rawPhaseSpec("HCD")}\n\n---\n\n${await rawPhaseSpec("FRG")}` : "";
          const hidden = [specs, await hypothesisNotes(), candidates].filter(Boolean).join("\n\n---\n\n");
          return hidden ? { ...p, hidden } : p;
        },
      },
      startIdx,
      first,
    );
    if (run.result === "stopped") return;
    if (run.result === "failed") {
      await persistState();
      await fail(`The ${run.phase} step could not be completed after the allowed fix attempts. Use a follow-up or retry.`, {
        i18n: "sys.phaseIncomplete",
        step: run.phase,
        details: run.errors.join("\n"),
      });
      return;
    }

    // --- finalize -------------------------------------------------------------
    await updateJob(projectId, jobId, { status: "FINALIZING" });
    await updateProject(userId, projectId, { status: "FINALIZING" });
    await persistState();

    if (csvComplete(paths)) {
      const r = await finalizeProject(paths, userId, projectId, project.contributor, (m, meta) => log(m, meta), {
        roi: project.roi,
        bibliography: env.referenceLookup ? { mailto: env.crossrefMailto, ncbiApiKey: env.ncbiApiKey } : null,
        hypothesisLines: isHypothesisMode(runState.evidence),
      });
      xlsxDone = true;
      await syncStepStates();
      const fileName = braDownloadFileName(projectDisplayName(project), projectId).utf8;
      await putMessage(projectId, jobId, "system", "artifact", `Generated ${fileName}.`, {
        meta: { i18n: "sys.xlsxReady", name: fileName, xlsxKey: r.xlsxKey, templateXlsxKey: r.templateXlsxKey, hcdNodes: r.hcdNodes, hcdEdges: r.hcdEdges, frgNodes: r.frgNodes },
      });
    }
    await persistState();

    const version = csvComplete(paths) ? await freezeJobVersion(project, job) : null;
    await updateJob(projectId, jobId, { status: "COMPLETED", endedAt: nowIso(), ...(version ? { braVersion: version } : {}) });
    await incrementProjectRevision(userId, projectId);
    await updateProject(userId, projectId, {
      status: "COMPLETED",
      activeJobId: null,
      activeStage: null,
      hasArtifacts: true,
      ...(version ? { latestVersion: version } : {}),
      completedAt: nowIso(),
      pendingQuestion: null,
    });
    await log(mode === "followup" ? "Follow-up completed." : "BRA data generation completed.", {
      i18n: mode === "followup" ? "sys.followupDone" : "sys.braDone",
    });
    if (csvComplete(paths) && returnsToStrict(runState.evidence, versionHypotheses(paths, project))) {
      // no hypothesis in the result: the project is literature-supported only again (its scopes stay as a record)
      await updateProject(userId, projectId, { evidenceMode: "strict" });
      await log("The result has no hypotheses, so the project uses literature-supported evidence only again.", { i18n: "sys.hypothesisStrict" });
    }
    console.log("[worker] completed");
  } catch (e) {
    console.error("[worker] fatal", e);
    try {
      await persistState();
    } catch (pe) {
      console.error("[worker] persist failed", pe);
    }
    await fail(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
    console.log(`[metrics] ${JSON.stringify({ jobId, mode, research: runState.research, model: runState.resolvedModel, usage: runState.jobUsage, costUsd: runState.jobCostUsd, minutes: Math.round((Date.now() - startedAt) / 6_000) / 10, searches: searchCounts })}`);
  }
}

/**
 * Cancel detection, heartbeat and the run-time limit, once a minute. With `persist` (BRA runs; article jobs never
 * write the workspace back) the workspace and thread also go to S3 every few minutes, so an interruption in the
 * middle of a long turn loses at most that much work, and a run that changes no workspace file for NO_PROGRESS_MS
 * is stopped instead of looping until the run-time limit.
 */
function startHeartbeat(abort: AbortController, o: { persist?: boolean } = {}): NodeJS.Timeout {
  return setInterval(async () => {
    if (runState.stopping) return;
    try {
      const j = await getJob(projectId, jobId);
      if (j?.status === "CANCELLED" && !cancelled) {
        cancelled = true;
        await log("Cancel request received. Saving state and exiting.", { i18n: "sys.cancelReceived" });
        abort.abort();
        return;
      }
      await updateJob(projectId, jobId, { lastHeartbeat: nowIso() });
      if (Date.now() - startedAt > env.workflowTimeoutMs) {
        await countCutOffTurn("run-time limit");
        await fail("Maximum run time (6 hours) exceeded. Retry to continue.", { i18n: "sys.timeout" });
        process.exit(1);
      }
      if (o.persist && workspaceReady && progress.observe(workspaceFingerprint(await listFiles(paths.root)), Date.now()) >= NO_PROGRESS_MS) {
        console.warn(`[worker] no workspace file changed for ${NO_PROGRESS_MS / 60_000} minutes; stopping the run`);
        await countCutOffTurn("no progress");
        await fail(NO_PROGRESS_MESSAGE, { i18n: "sys.noProgress" });
        process.exit(1);
      }
      if (o.persist && workspaceReady && Date.now() - lastPersistAt >= PERIODIC_PERSIST_MS) await persistState();
    } catch (e) {
      console.error("[heartbeat]", e);
    }
  }, 60_000);
}

// --- explanatory article -----------------------------------------------------

function articleState(project: ProjectRecord, job: JobRecord, status: ArticleJobState["status"], errorMessage: string | null = null): ArticleJobState | null {
  if (!isUiLocale(job.articleLocale)) return project.articleJob ?? null;
  return { jobId: job.jobId, locale: job.articleLocale, status, errorMessage, requestedAt: project.articleJob?.jobId === job.jobId ? project.articleJob.requestedAt : job.createdAt };
}

/** The project goes back to COMPLETED whatever happens: the BRA data is unchanged by an article job. */
async function endArticleJob(project: ProjectRecord, job: JobRecord, status: "COMPLETED" | "FAILED", errorMessage: string | null = null) {
  await updateJob(projectId, jobId, { status, endedAt: nowIso(), ...(errorMessage ? { errorMessage } : {}) });
  await updateProject(userId, projectId, { status: "COMPLETED", activeJobId: null, pendingQuestion: null, errorMessage: null, articleJob: articleState(project, job, status, errorMessage) });
}

async function articleJob(apiKey: string, project: ProjectRecord, job: JobRecord) {
  const locale = job.articleLocale;
  if (!isUiLocale(locale)) {
    await fail("The article job has no valid language.");
    return;
  }
  const lang = uiLanguageName(locale);
  await mkdir(env.workDir, { recursive: true });
  await mkdir(env.codexHome, { recursive: true });
  const agents = (await readFile(join(env.promptsDir, "AGENTS.md"), "utf8")).replaceAll("{P}", projectId);
  await writeFile(join(env.workDir, "AGENTS.md"), agents, "utf8");
  await log("Restoring previous workspace…", { i18n: "sys.restoring" });
  await downloadDir(`${prefix}workspace/`, paths.root);
  if (isLegacyWorkspace(paths) || readReferences(paths).length === 0) {
    await fail(LEGACY_ARTICLE_MESSAGE, { i18n: "sys.articleLegacy" });
    return;
  }
  const sourceRevision = project.revision ?? 0;
  const figures = prepareArticleFigures(paths, projectId, locale, project.roi ?? "", { hypothesisLines: isHypothesisMode(evidenceSettingsOf(project)) });
  if (!figures) {
    await fail("The CSVs of the project could not be read to draw the article figures.", { i18n: "sys.articleNoGraph" });
    return;
  }

  // the model chosen for the article (job), else the project's
  const settings = resolveModelSettings({ model: job.model || project.model, reasoningEffort: job.reasoningEffort || project.reasoningEffort });
  runState.resolvedModel = settings.model;
  runState.resolvedEffort = settings.reasoningEffort;
  await updateJob(projectId, jobId, { model: runState.resolvedModel, reasoningEffort: (runState.resolvedEffort as JobRecord["reasoningEffort"]) ?? null });
  const thread = openThread(createEngine(settings.model, apiKey, null), null, settings, { webSearch: false });
  const abort = new AbortController();
  const heartbeat = startHeartbeat(abort);
  const sink: TurnSink = {
    onMessage: async (type, content, meta) => {
      await putMessage(projectId, jobId, "agent", type, content, { meta, step: null });
    },
    onFileChange: async () => undefined,
    onHeartbeat: async () => {
      if (!runState.stopping) await updateJob(projectId, jobId, { lastHeartbeat: nowIso() });
    },
  };
  try {
    const facts = { name: project.name || projectId, revision: sourceRevision, model: project.usedModels?.join(", ") || project.model || "-" };
    const first = await articlePrompt(env.promptsDir, projectId, locale, facts, figures.generated);
    const notice = harnessPromptNotice(mode, first.shown);
    await putMessage(projectId, jobId, "system", "status", notice.content, { meta: { ...notice.meta, lang: locale } });
    const run = await runArticle(
      {
        paths,
        locale,
        maxNudges: env.maxNudges,
        figures,
        turn: async (p) => {
          let turn;
          try {
            turn = await runTurn(thread, p.hidden ? `${p.shown}\n\n---\n\n${p.hidden}` : p.shown, sink, abort.signal, { inFlight });
          } catch (e) {
            await countCutOffTurn(cancelled ? "cancelled" : "crashed");
            if (cancelled) return false;
            throw e;
          }
          if (cancelled) return false;
          await accumulateUsage(turn.usage);
          if (turn.failed) {
            await fail(turn.errorMessage ?? "Codex turn failed");
            return false;
          }
          return true;
        },
        onFix: (errors) =>
          log(`Checks found ${errors.length} issue(s) in the article; asked the agent to fix them.`, {
            i18n: "sys.articleFix",
            count: errors.length,
            details: errors.join("\n"),
          }),
      },
      first,
    );
    if (run.result === "stopped") return;
    if (run.result === "failed") {
      await fail("The article did not pass the checks after the allowed fix attempts. Try again.", { i18n: "sys.articleFailed", details: run.errors.join("\n") });
      return;
    }
    const markdown = withReferenceList(run.markdown, run.check.cited, readReferences(paths), locale);
    const figureDir = join(env.workDir, ".article-figures", locale);
    await rm(figureDir, { recursive: true, force: true });
    await mkdir(figureDir, { recursive: true });
    const figureFiles: string[] = [];
    for (const f of run.figures) {
      await writeFile(join(figureDir, `${f.name}.svg`), f.svg, "utf8");
      figureFiles.push(`${f.name}.svg`);
      if (f.narrow) {
        await writeFile(join(figureDir, `${f.name}.narrow.svg`), f.narrow, "utf8");
        figureFiles.push(`${f.name}.narrow.svg`);
      }
    }
    await uploadDir(figureDir, `${prefix}${articleFigureKey(locale, "")}`, { deleteMissing: true });
    const meta: ArticleMeta = {
      locale,
      language: lang,
      title: run.check.title,
      createdAt: nowIso(),
      sourceRevision,
      jobId,
      model: runState.resolvedModel,
      citedReferences: run.check.cited,
      figures: figureFiles,
    };
    await putObject(prefix + articleKey(locale), markdown, "text/markdown; charset=utf-8");
    await putObject(prefix + articleMetaKey(locale), JSON.stringify(meta, null, 2) + "\n");
    await endArticleJob(project, job, "COMPLETED");
    await putMessage(projectId, jobId, "system", "artifact", `Explanatory article (${lang}) is ready.`, {
      meta: { i18n: "sys.articleReady", lang: locale, articleKey: articleKey(locale) },
    });
    console.log(`[worker] article ${locale} written (${markdown.length} chars, ${run.check.cited.length} references)`);
  } finally {
    clearInterval(heartbeat);
  }
}

// --- research step -----------------------------------------------------------

type AgentTurnFn = (p: Prompt, o?: { effort?: ReasoningEffort; budget?: AbortSignal }) => Promise<ResearchTurn>;

/** Research step before the HCD: survey turn at a raised effort + coverage fix turns at the fix-turn effort, cut off by the time budget. */
async function researchStep(project: ProjectRecord, first: Prompt | null, turn: AgentTurnFn): Promise<"done" | "stopped"> {
  const time = { minutes: Math.max(1, env.researchTimeBudgetMin) };
  const budgetMs = time.minutes * 60_000;
  const budget = AbortSignal.timeout(budgetMs);
  const started = Date.now();
  const deadline = started + budgetMs;
  const effort = researchEffort(runState.resolvedEffort as ReasoningEffort | null);
  const usageAtStart = runState.jobUsage;
  const costAtStart = runState.jobCostUsd ?? 0;
  const searchesAtStart = structuredClone(searchCounts);
  let turns = 0;
  let aborted = false;
  const spent = () => (runState.jobCostUsd === null ? null : Math.max(0, runState.jobCostUsd - costAtStart));
  console.log(`[research] start model=${runState.resolvedModel} effort=${effort} budget=${time.minutes}min`);
  await log(`Research step: surveying the literature before the HCD (up to ${time.minutes} min, reasoning effort ${effort}).`, {
    i18n: "sys.researchStart",
    minutes: time.minutes,
    effort,
  });
  const metrics = (outcome: ResearchOutcome, c: ResearchCheck): ResearchStepMetrics => {
    const searches: ResearchStepMetrics["searches"] = {};
    for (const [tool, n] of Object.entries(searchCounts)) {
      const before = searchesAtStart[tool] ?? { ok: 0, failed: 0 };
      if (n.ok - before.ok || n.failed - before.failed) searches[tool] = { ok: n.ok - before.ok, failed: n.failed - before.failed };
    }
    const c0 = spent();
    return {
      outcome,
      model: runState.resolvedModel,
      effort,
      startedAt: new Date(started).toISOString(),
      endedAt: nowIso(),
      minutes: Math.round((Date.now() - started) / 6_000) / 10,
      turns,
      aborted,
      costUsd: c0 === null ? null : Math.round(c0 * 10_000) / 10_000,
      usage: subtractUsage(runState.jobUsage, usageAtStart),
      timeBudgetMinutes: time.minutes,
      candidates: c.summary?.candidates ?? 0,
      supported: c.summary?.byStatus.supported ?? 0,
      searches,
    };
  };
  return runResearch(
    {
      maxFixTurns: RESEARCH_BUDGET.maxFixTurns,
      turn: async (p) => {
        turns++;
        const r = await turn(p, { effort, budget });
        if (r === "budget") aborted = true;
        return r;
      },
      check: async (end) => {
        if (!end) return checkResearchStep(paths, true, null);
        const c = await checkResearchStep(paths, true, null);
        return checkResearchStep(paths, true, end, metrics(end, c));
      },
      prompt: () => researchPrompt(project),
      fixPrompt: (errors, attempt) => researchFixPrompt(errors, attempt),
      timeForFix: () => deadline - Date.now() >= RESEARCH_BUDGET.minMinutesForFix * 60_000,
      onFix: (errors) =>
        log(`The research coverage check found ${errors.length} gap(s); asked the agent to fill them.`, {
          i18n: "sys.researchFix",
          count: errors.length,
          details: errors.join("\n"),
        }),
      onEnd: async (outcome, c) => {
        await persistState();
        const m = metrics(outcome, c);
        console.log(`[research] end ${JSON.stringify(m)}`);
        await updateJob(projectId, jobId, { researchStep: m });
        if (outcome === "budget") {
          await log(`The research step reached its time budget (${time.minutes} min); building the HCD with what was found.`, {
            i18n: "sys.researchBudget",
            minutes: time.minutes,
          });
        } else if (outcome === "gaps") {
          await log(`The research survey still has ${c.errors.length} coverage gap(s); building the HCD with what was found.`, {
            i18n: "sys.researchWarn",
            count: c.errors.length,
            details: c.errors.join("\n"),
          });
        }
        const lit = Object.entries(m.searches).filter(([t]) => t !== "web_search").reduce((n, [, v]) => n + v.ok, 0);
        const web = m.searches.web_search?.ok ?? 0;
        await log(
          `Research step finished in ${m.minutes} min (${m.costUsd === null ? "cost unknown" : formatUsd(m.costUsd)}): ${m.candidates} candidate projection(s), ${m.supported} supported; ${lit} literature-tool and ${web} web searches (details in ${RESEARCH_FILES.check}).`,
          {
            i18n: "sys.researchDone",
            candidates: m.candidates,
            supported: m.supported,
            queries: lit + web,
            minutes: m.minutes,
            cost: m.costUsd === null ? "—" : formatUsd(m.costUsd),
            details: JSON.stringify(m, null, 2),
          },
        );
      },
    },
    first,
  );
}

async function researchSpec(): Promise<string> {
  return (
    (await readFile(join(env.promptsDir, "phases", "RESEARCH.md"), "utf8"))
      .replaceAll("{P}", projectId)
      .replaceAll("{MAX_CANDIDATES}", String(RESEARCH_BUDGET.maxCandidates))
      .replaceAll("{MIN_QUERIES}", String(RESEARCH_BUDGET.minQueriesPerCandidate))
      .replaceAll("{BUDGET_MINUTES}", String(env.researchTimeBudgetMin)) + runState.planNote
  );
}

async function researchPrompt(project: ProjectRecord): Promise<Prompt> {
  return { shown: `${header(project)}\n\nRun the research step (literature survey before phase HCD).`, hidden: await researchSpec() };
}

async function researchFirstPrompt(project: ProjectRecord, job: JobRecord, freshThread: boolean): Promise<Prompt> {
  if (mode === "resume") {
    return {
      shown: answerPreamble(job),
      hidden: freshThread ? `${header(project)}\n\n${await researchSpec()}` : undefined,
    };
  }
  if (mode === "retry") {
    return {
      shown: `${header(project)}\n\nThe previous run stopped midway. Check ${projectId}/${RESEARCH_FILES.plan} and finish the research step (literature survey before phase HCD); keep what is already there.`,
      hidden: await researchSpec(),
    };
  }
  return researchPrompt(project);
}

function researchFixPrompt(errors: string[], attempt: number): Prompt {
  const list = errors.slice(0, MAX_REPORTED_ERRORS).map((e) => `- ${e}`);
  if (errors.length > MAX_REPORTED_ERRORS) list.push(`- …and ${errors.length - MAX_REPORTED_ERRORS} more of the same kinds`);
  return {
    shown: `The research coverage check found ${errors.length} gap(s) in ${RESEARCH_FILES.plan} (fix attempt ${attempt}/${RESEARCH_BUDGET.maxFixTurns}):\n${list.join("\n")}\n\nRun the missing searches, update ${RESEARCH_FILES.plan} and finish with status "done". Do not start the HCD yet.`,
    effort: fixTurnEffort(runState.resolvedEffort as ReasoningEffort | null),
  };
}

const SEARCH_LOG_MAX_RESULT = 4_000;
/** Calls of this job by tool, for the job record (`searches`) and the research metrics */
const searchCounts: Record<string, { ok: number; failed: number }> = {};

/** Every literature search of the agent (lit tools and web search), one JSON line each; the coverage check reads it. */
async function recordSearch(item: { tool: string; arguments: unknown; status: string; result?: { structured_content: unknown; content?: unknown[] } | null; error?: { message: string } }) {
  if (item.status === "in_progress") return;
  const n = (searchCounts[item.tool] ??= { ok: 0, failed: 0 });
  if (item.status === "failed") n.failed++;
  else n.ok++;
  let result = item.result?.structured_content ?? null;
  const text = JSON.stringify(result);
  if (text && text.length > SEARCH_LOG_MAX_RESULT) result = { truncated: true, head: text.slice(0, SEARCH_LOG_MAX_RESULT) };
  const step = runState.lastStepStates ? currentStepOf(runState.lastStepStates) : null;
  const line = { at: nowIso(), jobId, step, tool: item.tool, arguments: item.arguments, status: item.status, error: mcpErrorText(item), result };
  try {
    await appendFile(paths.researchLog, JSON.stringify(line) + "\n", "utf8");
  } catch (e) {
    console.warn("[worker] search log failed", e);
  }
}

/** Error of a failed MCP call: Codex's message, else the text the tool returned with `isError` (e.g. "Europe PMC is unavailable (HTTP 503)"). */
function mcpErrorText(item: { status: string; result?: { content?: unknown[] } | null; error?: { message: string } }): string | null {
  if (item.error?.message) return item.error.message;
  if (item.status !== "failed") return null;
  const text = (item.result?.content ?? [])
    .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
    .join(" ")
    .trim();
  return text ? text.slice(0, 500) : null;
}

// --- phases ------------------------------------------------------------------

const TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["index", "english"], properties: { index: { type: "integer" }, english: { type: "string" } } },
    },
  },
} as const;
const MAX_TRANSLATION_TEXTS = 200;

/**
 * English for non-English values of the data files, from a separate low-effort turn of the run's model (no tools, no
 * web search). Citations, Circuit IDs and brackets are kept; the usage is added to the job.
 */
async function translateTexts(model: string | null, apiKey: string, texts: string[]): Promise<Map<string, string>> {
  const batch = texts.slice(0, MAX_TRANSLATION_TEXTS);
  const thread = openThread(createEngine(model, apiKey, null), null, { model, reasoningEffort: "low" }, { webSearch: false });
  const prompt =
    "Translate each text below into English for a neuroscience dataset. Keep Reference IDs such as [Smith, 2001], Circuit IDs such as [U.CA1], " +
    "brackets, semicolons, numbers and anatomical abbreviations exactly as they are; translate only the words. Do not read or change any file; " +
    "answer only with the JSON object.\n\n" +
    batch.map((t, i) => `${i}: ${JSON.stringify(t)}`).join("\n");
  const t = await thread.run(prompt, { outputSchema: TRANSLATION_SCHEMA });
  if (t.usage) await accumulateUsage(fromCodexUsage(t.usage));
  const out = new Map<string, string>();
  const parsed = JSON.parse(t.finalResponse) as { items?: { index: number; english: string }[] };
  for (const it of parsed.items ?? []) if (batch[it.index] !== undefined && typeof it.english === "string") out.set(batch[it.index], it.english.trim());
  return out;
}

/** One status line per automatic fix run: how many values were fixed, by check ID (details in autofix_log.json). */
async function logAutoFixes(phase: Phase, fixes: AutoFix[]): Promise<void> {
  const byCode = new Map<string, number>();
  for (const f of fixes) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
  const summary = [...byCode].map(([c, n]) => `${c} ×${n}`).join(", ");
  await log(`${phase}: the worker fixed ${fixes.length} value(s) itself before checking again (${summary}).`, {
    i18n: "sys.autoFixed",
    phase,
    count: fixes.length,
    summary,
    details: fixes.map((f) => `[${f.code}] ${f.file} ${f.where}: ${f.before.slice(0, 80)} → ${f.after.slice(0, 80)}`).join("\n"),
  });
}

/** checkPhase with this run's RCS client, meta adoption and Project.csv options. */
async function acceptPhase(phase: Phase, project: ProjectRecord, ctx: PhaseContext): Promise<PhaseCheck> {
  const deps: CheckDeps = {
    lookupSabra: runState.rcs ? (ids) => runState.rcs!.lookupHomba(ids) : undefined,
    verifyReferences: referenceVerifier ? (refs) => referenceVerifier.verify(refs) : undefined,
    quoteChecker: quoteVerifier ? { threshold: quoteVerifier.threshold, verify: (reqs) => quoteVerifier.verify(reqs) } : undefined,
    canon: runState.canonRun ? { ...runState.canonRun, onNotes: logCanonNotes } : undefined,
    sabraBoundary: project.sabraBoundary,
    harnessRules: project.harnessRules,
    ...(isHypothesisMode(runState.evidence) ? { evidence: { ...runState.evidence, researchMode: runState.research } } : {}),
    onMetaAccepted: (meta) => adoptMeta(project, meta),
    translate: translator ?? undefined,
    onAutoFix: (phase, fixes) => logAutoFixes(phase, fixes),
    csvOptions: async () => {
      const latest = await getProject(userId, projectId);
      if (latest) {
        project.name = latest.name;
        project.nameSource = latest.nameSource;
      }
      return {
        projectId,
        contributor: project.contributor,
        projectTemplate: await readFile(join(env.promptsDir, "Project.csv"), "utf8"),
        roi: project.roi,
        tlf: project.tlf,
        name: project.nameSource === "provisional" ? undefined : project.name,
      };
    },
  };
  const r = await checkPhase(phase, paths, deps, ctx);
  if (phase === "CSV" && r.errors.length === 0) await log("CSVs generated from the HCD/FRG data files.", { i18n: "sys.csvBuilt" });
  return r;
}

let lastCanonNotes = "";
/** Advisory Canon findings, logged when they change (they are not sent back to the agent as errors). */
async function logCanonNotes(notes: string[]) {
  const text = notes.join("\n");
  if (text === lastCanonNotes) return;
  lastCanonNotes = text;
  await log(`Notes from the Canon:\n${text}`);
}

let lastReferenceSummary = "";
async function logReferenceSummary(r: ReferenceReport) {
  if (!r.summary) return;
  const parts = REF_STATUSES.filter((s) => r.summary![s] > 0).map((s) => `${r.summary![s]} ${s.replace("_", " ")}`);
  const line = `References: ${parts.join(", ")} (DOI / PMID checked against Crossref, doi.org and PubMed; details in ${PROJECT_FILES.referenceCheck}).`;
  if (line === lastReferenceSummary) return;
  lastReferenceSummary = line;
  const open = r.references.filter((c) => c.status !== "verified").map((c) => `${c.id}: ${c.status}${c.problems.length ? ` (${c.problems.join("; ")})` : ""}`);
  await log(line, open.length ? { details: open.join("\n") } : undefined);
}

let lastQuoteSummary = "";
async function logQuoteSummary(r: QuoteReport) {
  if (!r.summary) return;
  const parts = QUOTE_STATUSES.filter((s) => r.summary![s] > 0).map((s) => `${r.summary![s]} ${QUOTE_STATUS_LABEL[s]}`);
  const line = `Quotes (Pointers on literature): ${parts.join(", ")} (compared with the cited paper's open-access full text or abstract; details in ${PROJECT_FILES.quoteCheck}).`;
  if (line === lastQuoteSummary) return;
  lastQuoteSummary = line;
  const open = r.quotes
    .filter((c) => !c.status.startsWith("verified"))
    .map((c) => `${c.sender} -> ${c.receiver} ${c.referenceIds.join("; ")}: ${QUOTE_STATUS_LABEL[c.status]}${c.score !== null ? ` (best match ${Math.round(c.score * 100)}%)` : ""}${c.notes.length ? ` — ${c.notes.join("; ")}` : ""}`);
  await log(line, open.length ? { details: open.join("\n") } : undefined);
}

let lastQuoteReuse = "";
/** Quotes that support several connections: a warning for the user, not sent back to the agent. */
async function logQuoteReuse(reused: string[]) {
  const text = reused.join("\n");
  if (text === lastQuoteReuse) return;
  lastQuoteReuse = text;
  await log(`${reused.length} quote(s) in Pointers on literature support more than one connection; each connection should point to the sentence or figure that states its own projection (warning only; details in ${PROJECT_FILES.quoteCheck}).`, {
    i18n: "sys.quoteReuse",
    count: reused.length,
    details: text,
  });
}

let lastCrossSummary = "";
/** Record-only for now: the counts go to the chat and cross_check.json, not to the agent. */
async function logCrossSummary(r: CrossReport) {
  const parts = CROSS_CODES.filter((c) => r.summary[c] > 0).map((c) => `${c} ${r.summary[c]}`);
  const line = `HCD ↔ FRG consistency (recorded only): ${parts.length ? parts.join(", ") : "no findings"} (details in ${PROJECT_FILES.crossCheck}).`;
  if (line === lastCrossSummary) return;
  lastCrossSummary = line;
  await log(line, r.findings.length ? { details: r.findings.map((f) => `${f.code} ${f.message}`).join("\n") } : undefined);
}

const RCS_LOG_MAX_RESULT = 20_000;
/** Evidence for the UC ↔ SABRA mapping: every RCS call of the agent, one JSON line each, kept with the project. */
async function recordRcsCall(item: { tool: string; arguments: unknown; status: string; result?: { structured_content: unknown }; error?: { message: string } }) {
  if (item.status === "in_progress") return;
  let result = item.result?.structured_content ?? null;
  const text = JSON.stringify(result);
  if (text && text.length > RCS_LOG_MAX_RESULT) result = { truncated: true, head: text.slice(0, RCS_LOG_MAX_RESULT) };
  const line = { at: nowIso(), tool: item.tool, arguments: item.arguments, status: item.status, error: item.error?.message ?? null, result };
  try {
    await appendFile(paths.rcsLog, JSON.stringify(line) + "\n", "utf8");
  } catch (e) {
    console.warn("[worker] rcs log failed", e);
  }
}

function phaseHasFiles(phase: Phase): boolean {
  const dir = phase === "HCD" ? paths.hcd : phase === "FRG" ? paths.frg : paths.csv;
  return existsSync(dir) && readdirSync(dir).length > 0;
}

/** Store ROI/TLF decided by the agent when the user left them empty, and the agent's name unless the user named the project. */
async function adoptMeta(project: ProjectRecord, meta: { roi: string; tlf: string; name?: string }) {
  if (meta.name && isAgentNameable(project.nameSource) && (meta.name !== project.name || project.nameSource !== "auto")) {
    if (await updateAutoProjectName(userId, projectId, meta.name)) {
      project.name = meta.name;
      project.nameSource = "auto";
    }
    else {
      const latest = await getProject(userId, projectId);
      project.name = latest?.name;
      project.nameSource = latest?.nameSource;
    }
  }
  const patch: Partial<ProjectRecord> = {};
  if (!project.roi?.trim() && meta.roi) patch.roi = meta.roi;
  if (!project.tlf?.trim() && meta.tlf) patch.tlf = meta.tlf;
  if (Object.keys(patch).length === 0) return;
  Object.assign(project, patch);
  await updateProject(userId, projectId, patch);
}

// --- state -------------------------------------------------------------------

async function prepareWorkspace(project: ProjectRecord) {
  await mkdir(env.workDir, { recursive: true });
  await mkdir(env.codexHome, { recursive: true });
  // harness rules at the workspace root (Codex loads AGENTS.md from its working directory)
  const agents = (await readFile(join(env.promptsDir, "AGENTS.md"), "utf8")).replaceAll("{P}", projectId);
  await writeFile(join(env.workDir, "AGENTS.md"), agents, "utf8");
  // projects that do not allow hypotheses are not shown the hypothesis key (the checks still reject it)
  await writeSchemas(env.workDir, agentHarnessSchemas(evidenceSettingsOf(project).mode));

  if (mode !== "initial" || project.codexThreadId) {
    await log("Restoring previous workspace…", { i18n: "sys.restoring" });
    const n1 = await downloadDir(`${prefix}workspace/`, paths.root);
    const n2 = await restoreThread();
    console.log(`[worker] restored workspace=${n1} thread=${n2}`);
  } else {
    await rm(paths.root, { recursive: true, force: true });
  }
  await mkdir(paths.hcd, { recursive: true });
  await mkdir(paths.frg, { recursive: true });
  await mkdir(paths.csv, { recursive: true });
  await loadMaterials(project);
}

/**
 * The saved thread into the Codex home, unless it is too large to resume: Codex reads the whole rollout when it
 * resumes, and a few hundred MB kill the task before its first heartbeat. Such a thread is moved to thread-archive/
 * (kept for inspection, never downloaded again) and the run continues on a new thread from the workspace files.
 */
async function restoreThread(): Promise<number> {
  const from = `${prefix}thread/`;
  const objs = await listPrefix(from);
  const bytes = threadBytes(objs);
  if (bytes <= THREAD_RESUME_MAX_BYTES) return downloadDir(from, env.codexHome);
  console.warn(`[worker] thread state is ${bytes} bytes (limit ${THREAD_RESUME_MAX_BYTES}); moving it to thread-archive/`);
  await moveObjects(
    objs.map((o) => o.key),
    from,
    `${prefix}thread-archive/${nowIso().replace(/[:.]/g, "-")}/`,
  );
  threadSetAside = true;
  return 0;
}

/** Reference materials of the project into materials/; a failure only costs the agent those inputs. */
async function loadMaterials(project: ProjectRecord) {
  try {
    runState.materials = await prepareMaterials(env.workDir, project.attachments, {
      download: async (dir) => void (await downloadDir(`${prefix}attachments/`, dir)),
      uploadDerived: async (dir) => void (await uploadDir(dir, prefix + ATTACHMENT_DERIVED_PREFIX)),
    });
  } catch (e) {
    console.error("[worker] materials failed", e);
    runState.materials = null;
    if (project.attachments?.length) await log(`Reference materials could not be prepared: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  if (!runState.materials || mode !== "initial") return;
  const open = runState.materials.entries.filter((e) => e.status !== "ok");
  await log(`Prepared ${runState.materials.entries.length} reference material(s) for the agent.`, {
    i18n: "sys.materials",
    count: runState.materials.entries.length,
    details: runState.materials.entries.map((e) => `${e.id} ${e.source}: ${e.status}${e.note ? ` (${e.note})` : ""}`).join("\n"),
    ...(open.length ? { failed: open.length } : {}),
  });
}

/**
 * Puts the pinned Canon revision next to the project folder (`<workDir>/canon/`, never synced back) and remembers it
 * for the HCD spec and the validator. A missing Canon or revision only disables the Canon for this run.
 */
async function prepareCanon(project: ProjectRecord) {
  const dir = join(env.workDir, CANON_AGENT_DIR);
  await rm(dir, { recursive: true, force: true });
  if (!project.canonId) return;
  try {
    const meta = await getCanonMeta(project.canonId);
    if (!meta || meta.deletedAt) return;
    const revision = Math.min(project.canonRevision ?? 0, meta.headRevision);
    if (revision <= 0) return;
    const snapshot = await getJsonObject<CanonSnapshot>(canonRevisionKey(meta.canonId, revision));
    if (!snapshot) throw new Error(`revision ${revision} is missing`);
    const info: CanonRunInfo = { canonId: meta.canonId, name: meta.name, policy: meta.policy, revision };
    await mkdir(dir, { recursive: true });
    for (const [name, text] of Object.entries(canonAgentFiles(snapshot, info, projectId))) await writeFile(join(dir, name), text, "utf8");
    runState.canonRun = { snapshot, info };
    await log(`Canon "${meta.name}" revision ${revision}: the agent follows its definitions (files in ${CANON_AGENT_DIR}/).`, {
      i18n: "sys.canonLoaded",
      name: meta.name,
      revision,
    });
  } catch (e) {
    console.warn("[canon] not loaded", e);
    await log(`The Canon of this project could not be loaded (${e instanceof Error ? e.message : String(e)}); this run does not use it.`);
  }
}

let lastPersistAt = Date.now();
/** Workspace and Codex sessions to S3; calls from the heartbeat, the phases and SIGTERM run one at a time. */
const persistState = serialized(async () => {
  lastPersistAt = Date.now();
  const a = await uploadDir(paths.root, `${prefix}workspace/`, { deleteMissing: true });
  const b = await uploadDir(join(env.codexHome, "sessions"), `${prefix}thread/sessions/`);
  console.log(`[worker] persisted workspace(+${a.uploaded}/-${a.deleted}) thread(+${b.uploaded})`);
});

/**
 * SIGTERM: Fargate Spot interruption (about 2 minutes' notice), or the StopTask of a cancel or an admin stop. The
 * task definition's stop timeout leaves time to save the running turn's work; the janitor then retries the job.
 */
async function onSigterm() {
  if (runState.stopping) return;
  runState.stopping = true;
  console.log("[worker] SIGTERM: saving state before the task stops");
  try {
    await countCutOffTurn("SIGTERM");
    if (planJobOnStop) await planJobOnStop().catch((e) => console.error("[worker] recording the plan job's usage failed", e));
    const outcome = await handleStop({
      jobStatus: async () => (await getJob(projectId, jobId))?.status ?? null,
      workspaceReady: () => workspaceReady,
      notify: () =>
        log("The worker is being stopped (for example a Fargate Spot interruption). Saving the work so far; the job resumes automatically.", {
          i18n: "sys.workerStopping",
        }),
      persist: persistState,
      // the janitor retries a job whose heartbeat is older than HEARTBEAT_STALE_MS
      markStale: () => updateJob(projectId, jobId, { lastHeartbeat: new Date(0).toISOString() }),
    });
    console.log(`[worker] SIGTERM handled: ${outcome}`);
  } catch (e) {
    console.error("[worker] SIGTERM handling failed", e);
  } finally {
    process.exit(143);
  }
}
process.once("SIGTERM", () => void onSigterm());

async function setStage(override: typeof stageOverride) {
  stageOverride = override;
  await syncStepStates();
}

async function syncStepStates() {
  const states = detectStepStates(paths, accepted, xlsxDone);
  const stage = liveStageOf(states, stageOverride);
  const changed = !runState.lastStepStates || JSON.stringify(states) !== JSON.stringify(runState.lastStepStates);
  if (!changed && stage === lastStage) return;
  const prev = runState.lastStepStates;
  runState.lastStepStates = states;
  lastStage = stage;
  await updateProject(userId, projectId, { ...(changed ? { stepStates: states, currentStep: currentStepOf(states) } : {}), activeStage: stage });
  if (!changed) return;
  for (const s of ["HCD", "FRG", "CSV", "XLSX"] as WorkflowStep[]) {
    if (states[s] === "done" && prev && prev[s] !== "done") {
      await putMessage(projectId, jobId, "system", "status", `Step ${s} completed.`, { step: s, meta: { i18n: "sys.stepDone", step: s, stepDone: s } });
    }
  }
}

function subtractUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const cacheWrite = (a.cacheWriteTokens ?? 0) - (b.cacheWriteTokens ?? 0);
  return {
    inputTokens: a.inputTokens - b.inputTokens,
    cachedInputTokens: a.cachedInputTokens - b.cachedInputTokens,
    outputTokens: a.outputTokens - b.outputTokens,
    reasoningOutputTokens: a.reasoningOutputTokens - b.reasoningOutputTokens,
    ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}),
  };
}

async function accumulateUsage(u: TurnUsage) {
  const j = await getJob(projectId, jobId);
  const usage = addUsage(j?.usage, tokenUsageOf(u));
  const costUsd = estimateCostUsd(runState.resolvedModel, usage);
  runState.jobUsage = usage;
  runState.jobCostUsd = costUsd;
  await updateJob(projectId, jobId, {
    usage,
    costUsd,
    searches: searchCounts,
    model: runState.resolvedModel,
    reasoningEffort: (runState.resolvedEffort as JobRecord["reasoningEffort"]) ?? null,
  });
  await refreshProjectUsage(userId, projectId);
  await putMessage(
    projectId,
    jobId,
    "system",
    "status",
    `Tokens: in ${formatTokens(usage.inputTokens)} (cached ${formatTokens(usage.cachedInputTokens)}) / out ${formatTokens(usage.outputTokens)} · est. ${formatUsd(costUsd)}`,
    { meta: { i18n: "sys.usage", kind: "usage", usage, costUsd, model: runState.resolvedModel } },
  );
}

/** The turn running now, if any; a turn that never returns is counted from the session file by `countCutOffTurn`. */
const inFlight = new InFlightTurn();

/**
 * Adds the usage of a turn that was cut off to this job: the job that ran it pays for it, and the next run on the
 * thread starts from the session total that already includes it, so nothing is counted twice.
 */
async function countCutOffTurn(why: string): Promise<void> {
  try {
    const u = inFlight.take();
    if (!u || !(u.input || u.cachedInput || u.output || u.reasoningOutput)) return;
    console.log(`[worker] counted the usage of a turn cut off (${why}): ${JSON.stringify(u)}`);
    await accumulateUsage(u);
  } catch (e) {
    console.error("[worker] counting the cut-off turn failed", e);
  }
}

async function fail(message: string, meta?: Record<string, unknown>) {
  if (cancelled || runState.stopping) return;
  if (isProjectlessMode(mode)) {
    const values = { status: "FAILED", errorMessage: message, endedAt: nowIso() } as const;
    if (mode === "plan") await endPlanJob(values);
    else await updateJob(projectId, jobId, values);
    return;
  }
  if (mode === "article") {
    const [project, job] = await Promise.all([getProject(userId, projectId), getJob(projectId, jobId)]);
    if (project && job) await endArticleJob(project, job, "FAILED", message);
    else await updateJob(projectId, jobId, { status: "FAILED", errorMessage: message, endedAt: nowIso() });
    await putMessage(projectId, jobId, "system", "error", message, { meta });
    return;
  }
  await updateJob(projectId, jobId, { status: "FAILED", errorMessage: message, endedAt: nowIso() });
  await updateProject(userId, projectId, { status: "FAILED", errorMessage: message, activeJobId: null, activeStage: null });
  await putMessage(projectId, jobId, "system", "error", message, { meta });
}

main().catch(async (e) => {
  console.error("[worker] unhandled", e);
  try {
    await fail(e instanceof Error ? e.message : String(e));
  } finally {
    process.exit(1);
  }
});
