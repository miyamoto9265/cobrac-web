/**
 * CoBRAC Agents worker (ECS Fargate task) — the "CoBRAC harness".
 *
 * The worker drives the workflow phase by phase instead of letting the agent read instruction files:
 *   HCD (agent turn → validator → fix turns) → FRG (same) → CSV (generated from the JSON data files; problems go
 *   back to the agent as fixes to those files) → xlsx + graphs (deterministic). The loop itself is in pipeline.ts.
 * Shared rules live in prompts/AGENTS.md (auto-loaded by Codex); each phase prompt inlines prompts/phases/<PHASE>.md,
 * and the JSON Schemas of the data files are written to schemas/ next to AGENTS.md.
 *
 * Run modes:
 *   - initial : fresh workspace, start at HCD
 *   - resume  : restore workspace + thread, deliver the user's answer, continue the current phase
 *   - followup: restore, apply the instruction, re-validate every phase, regenerate CSV/xlsx
 *   - retry   : restore, continue from the first phase not accepted yet
 *   - article : restore the workspace read-only and write an explanatory article in the requested language on a
 *               fresh thread (article.ts); the BRA data, step states, revision and project thread stay untouched
 *
 * Whenever the agent asks a question we persist state to S3 and exit so no compute is billed while waiting.
 */
import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { existsSync, readdirSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArticleJobState, ArticleMeta, JobRecord, ProjectRecord, StepState, WorkflowStep } from "@cobrac/shared";
import {
  PROJECT_FILES,
  REF_STATUSES,
  addUsage,
  articleKey,
  articleMetaKey,
  braDownloadFileName,
  estimateCostUsd,
  formatTokens,
  formatUsd,
  harnessPromptNotice,
  isAgentNameable,
  isUiLocale,
  nowIso,
  projectDisplayName,
  replyLanguageInstruction,
  uiLanguageName,
  withReferenceList,
} from "@cobrac/shared";
import { articlePrompt, readReferences, runArticle } from "./article.js";
import { createCodex, openThread, resolveModelSettings, runTurn, type TurnSink } from "./codex.js";
import {
  getJob,
  getProject,
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
import { RcsClient, resolveRcsConnection } from "./rcs.js";
import { ReferenceVerifier } from "./references.js";
import { downloadDir, projectPrefix, putObject, uploadDir } from "./s3sync.js";
import { PHASES, checkPhase, runPhases, turnInput, writeSchemas, type CheckDeps, type Phase, type PhaseCheck, type PhaseContext, type Prompt, type ReferenceReport } from "./pipeline.js";
import { csvComplete, currentStepOf, detectStepStates, isLegacyWorkspace, projectPaths } from "./steps.js";

const MAX_REPORTED_ERRORS = 30;
const LEGACY_WORKSPACE_MESSAGE =
  "This project uses the file format from before v0.8 and can no longer be continued. Its xlsx and graphs stay available; start a new project to continue the work.";
const LEGACY_ARTICLE_MESSAGE = "Explanatory articles need a project made with v0.8 or later.";

const { userId, projectId, jobId, mode } = env.job;
const prefix = projectPrefix(userId, projectId);
const paths = projectPaths(env.workDir, projectId);
const kms = new KMSClient({ region: env.region });

const startedAt = Date.now();
/** Phases the harness has accepted (validated) */
const accepted = new Set<WorkflowStep>();
let xlsxDone = false;
let lastStepStates: Record<WorkflowStep, StepState> | null = null;
let cancelled = false;
let rcs: RcsClient | null = null;
const referenceVerifier = env.referenceLookup ? new ReferenceVerifier({ mailto: env.crossrefMailto, ncbiApiKey: env.ncbiApiKey }) : null;

const log = async (content: string, meta?: Record<string, unknown>): Promise<void> => {
  await putMessage(projectId, jobId, "system", "status", content, { meta, step: lastStepStates ? currentStepOf(lastStepStates) : null });
};

async function main() {
  console.log(`[worker] start job=${jobId} project=${projectId} mode=${mode}`);
  const [user, project, job] = await Promise.all([getUser(userId), getProject(userId, projectId), getJob(projectId, jobId)]);
  if (!user || !project || !job) throw new Error("user/project/job not found");
  if (job.status === "CANCELLED") {
    console.log("[worker] job already cancelled; exiting");
    return;
  }
  if (!user.encryptedApiKey) throw new Error("OpenAI API key is not registered for this user");

  const apiKey = await decryptApiKey(user.encryptedApiKey, userId);
  const rcsConn = await resolveRcsConnection(
    { url: env.rcsMcpUrl, secretId: env.rcsMcpSecretId, token: env.rcsMcpToken, region: env.region },
    (m) => console.warn(`[worker] ${m}`),
  );
  rcs = rcsConn ? new RcsClient(rcsConn) : null;
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
  if (mode !== "initial" && isLegacyWorkspace(paths)) {
    await fail(LEGACY_WORKSPACE_MESSAGE, { i18n: "sys.legacyWorkspace" });
    return;
  }
  if (!rcs) await log("RCS (SABRA lookup) is not available in this run; UC anchors are not checked against RCS.");
  // a follow-up re-validates every phase, so it starts with nothing accepted
  const carryOver = mode === "resume" || mode === "retry";
  xlsxDone = carryOver && project.stepStates?.XLSX === "done";
  if (carryOver) for (const s of PHASES) if (project.stepStates?.[s] === "done") accepted.add(s);
  await syncStepStates();

  // --- codex ----------------------------------------------------------------
  const codex = createCodex(apiKey, rcsConn);
  let threadId = mode === "initial" ? null : project.codexThreadId;
  if (threadId && !existsSync(join(env.codexHome, "sessions"))) {
    await log("Thread state was missing; resuming on a new thread.", { i18n: "sys.newThread" });
    threadId = null;
  }
  const freshThread = !threadId;
  const settings = resolveModelSettings(project);
  resolvedModel = settings.model;
  resolvedEffort = settings.reasoningEffort;
  const thread = openThread(codex, threadId, settings);
  console.log(`[worker] model=${settings.model ?? "(default)"} effort=${settings.reasoningEffort ?? "(default)"}`);
  await updateJob(projectId, jobId, { model: resolvedModel, reasoningEffort: (resolvedEffort as JobRecord["reasoningEffort"]) ?? null });

  const replyLanguage = replyLanguageInstruction(job.locale);
  console.log(`[worker] reply locale=${job.locale ?? "(user's language)"}`);

  const abort = new AbortController();
  const heartbeat = startHeartbeat(abort);

  const sink: TurnSink = {
    onMessage: async (type, content, meta) => {
      await putMessage(projectId, jobId, "agent", type, content, { meta, step: lastStepStates ? currentStepOf(lastStepStates) : null });
    },
    onFileChange: async () => {
      await syncStepStates();
    },
    onHeartbeat: async () => {
      await updateJob(projectId, jobId, { lastHeartbeat: nowIso() });
    },
    onMcpCall: async (item) => {
      if (item.server === "rcs") await recordRcsCall(item);
    },
  };

  /** One agent turn. Returns false when the run must stop (question, failure, cancel). */
  const agentTurn = async (p: Prompt): Promise<boolean> => {
    let turn;
    try {
      turn = await runTurn(thread, turnInput(p, replyLanguage), sink, abort.signal);
    } catch (e) {
      if (cancelled) {
        await persistState();
        console.log("[worker] cancelled; state persisted");
        return false;
      }
      throw e;
    }
    if (cancelled) {
      await persistState();
      return false;
    }
    if (turn.threadId) await updateProject(userId, projectId, { codexThreadId: turn.threadId });
    await accumulateUsage(turn.usage);
    await syncStepStates();

    if (turn.failed) {
      await persistState();
      await fail(turn.errorMessage ?? "Codex turn failed");
      return false;
    }
    if (turn.question) {
      await persistState();
      await updateJob(projectId, jobId, { status: "WAITING_USER_INPUT", pendingAnswer: null });
      await updateProject(userId, projectId, { status: "WAITING_USER_INPUT", pendingQuestion: turn.question });
      await log("Answer the agent’s question to resume work.", { i18n: "sys.waitingAnswer" });
      console.log("[worker] waiting for user input; exiting");
      return false;
    }
    return true;
  };

  try {
    const ctx: PhaseContext = { hcd: null, frg: null };
    const firstOpen = PHASES.findIndex((p) => !accepted.has(p));
    const startIdx = firstOpen === -1 ? PHASES.length - 1 : firstOpen;
    const first = await firstPrompt(project, job, PHASES[startIdx], freshThread);
    if (first) {
      const notice = harnessPromptNotice(mode, first.shown);
      await putMessage(projectId, jobId, "system", "status", notice.content, { meta: notice.meta });
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
          accepted.add(phase);
          await syncStepStates();
          await persistState();
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
      const r = await finalizeProject(paths, userId, projectId, project.contributor, (m, meta) => log(m, meta));
      xlsxDone = true;
      await syncStepStates();
      const fileName = braDownloadFileName(projectDisplayName(project), projectId).utf8;
      await putMessage(projectId, jobId, "system", "artifact", `Generated ${fileName}.`, {
        meta: { i18n: "sys.xlsxReady", name: fileName, xlsxKey: r.xlsxKey, hcdNodes: r.hcdNodes, hcdEdges: r.hcdEdges, frgNodes: r.frgNodes },
      });
    }
    await persistState();

    await updateJob(projectId, jobId, { status: "COMPLETED", endedAt: nowIso() });
    await incrementProjectRevision(userId, projectId);
    await updateProject(userId, projectId, {
      status: "COMPLETED",
      activeJobId: null,
      hasArtifacts: true,
      completedAt: nowIso(),
      pendingQuestion: null,
    });
    await log(mode === "followup" ? "Follow-up completed." : "BRA data generation completed.", {
      i18n: mode === "followup" ? "sys.followupDone" : "sys.braDone",
    });
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
  }
}

/** Cancel detection, heartbeat and the run-time limit, once a minute. */
function startHeartbeat(abort: AbortController): NodeJS.Timeout {
  return setInterval(async () => {
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
        await fail("Maximum run time (6 hours) exceeded. Retry to continue.", { i18n: "sys.timeout" });
        process.exit(1);
      }
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

  const settings = resolveModelSettings(project);
  resolvedModel = settings.model;
  resolvedEffort = settings.reasoningEffort;
  await updateJob(projectId, jobId, { model: resolvedModel, reasoningEffort: (resolvedEffort as JobRecord["reasoningEffort"]) ?? null });
  const thread = openThread(createCodex(apiKey, null), null, settings, { webSearch: false });
  const abort = new AbortController();
  const heartbeat = startHeartbeat(abort);
  const sink: TurnSink = {
    onMessage: async (type, content, meta) => {
      await putMessage(projectId, jobId, "agent", type, content, { meta, step: null });
    },
    onFileChange: async () => undefined,
    onHeartbeat: () => updateJob(projectId, jobId, { lastHeartbeat: nowIso() }).then(() => undefined),
  };
  try {
    const first = await articlePrompt(env.promptsDir, projectId, locale);
    const notice = harnessPromptNotice(mode, first.shown);
    await putMessage(projectId, jobId, "system", "status", notice.content, { meta: { ...notice.meta, lang: locale } });
    const run = await runArticle(
      {
        paths,
        locale,
        maxNudges: env.maxNudges,
        turn: async (p) => {
          let turn;
          try {
            turn = await runTurn(thread, p.hidden ? `${p.shown}\n\n---\n\n${p.hidden}` : p.shown, sink, abort.signal);
          } catch (e) {
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
    const meta: ArticleMeta = {
      locale,
      language: lang,
      title: run.check.title,
      createdAt: nowIso(),
      sourceRevision,
      jobId,
      model: resolvedModel,
      citedReferences: run.check.cited,
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

// --- phases ------------------------------------------------------------------

/** checkPhase with this run's RCS client, meta adoption and Project.csv options. */
async function acceptPhase(phase: Phase, project: ProjectRecord, ctx: PhaseContext): Promise<PhaseCheck> {
  const deps: CheckDeps = {
    lookupSabra: rcs ? (ids) => rcs!.lookupHomba(ids) : undefined,
    verifyReferences: referenceVerifier ? (refs) => referenceVerifier.verify(refs) : undefined,
    onMetaAccepted: (meta) => adoptMeta(project, meta),
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

// --- prompts -----------------------------------------------------------------

const specCache = new Map<Phase, string>();
async function phaseSpec(phase: Phase): Promise<string> {
  if (!specCache.has(phase)) {
    let spec = (await readFile(join(env.promptsDir, "phases", `${phase}.md`), "utf8")).replaceAll("{P}", projectId);
    if (phase === "HCD" && !rcs) {
      spec +=
        "\n\nNote for this run: the RCS MCP server is not available. Still anchor every UC on a SABRA unit from your best knowledge " +
        `(HOMBA/DHBA or BNA IDs), keep UC Descriptors and Circuit IDs in the same format, and state in ${PROJECT_FILES.decisionLog} that the anchors were not checked with RCS.\n`;
    }
    specCache.set(phase, spec);
  }
  return specCache.get(phase)!;
}

function header(project: ProjectRecord): string {
  return (
    `Project ID: ${projectId}\n` +
    `ROI: ${project.roi?.trim() || "(not given: determine it by research)"}\n` +
    `TLF: ${project.tlf?.trim() || "(not given: determine it by research)"}\n` +
    `Contributor: ${project.contributor}`
  );
}

async function phasePrompt(project: ProjectRecord, phase: Phase): Promise<Prompt> {
  return { shown: `${header(project)}\n\nRun phase ${phase}.`, hidden: await phaseSpec(phase) };
}

async function firstPrompt(project: ProjectRecord, job: JobRecord, phase: Phase, freshThread: boolean): Promise<Prompt | null> {
  const spec = async () => (freshThread && phase !== "CSV" ? await phaseSpec(phase) : undefined);
  switch (mode) {
    case "initial":
    case "article":
      return phasePrompt(project, "HCD");
    case "resume":
      return {
        shown: `User's answer:\n${job.pendingAnswer ?? "(no answer)"}\n\nContinue the work from where you stopped.`,
        hidden: freshThread ? `${header(project)}\n\n${(await spec()) ?? ""}` : undefined,
      };
    case "retry":
      if (phase === "CSV") return null;
      return {
        shown: `${header(project)}\n\nThe previous run stopped midway. Check the existing files in ${projectId}/ and finish phase ${phase}; do not recreate files that are already complete.`,
        hidden: await spec(),
      };
    case "followup":
      // specs are always attached: the thread may be new, and follow-ups can touch every file
      return {
        shown: `${header(project)}\n\nFollow-up instruction:\n${job.instruction ?? ""}`,
        hidden:
          `Apply the follow-up instruction to the project files (see "Follow-up instructions" in AGENTS.md). Reference specs:\n\n` +
          `${await phaseSpec("HCD")}\n\n---\n\n${await phaseSpec("FRG")}`,
      };
  }
}

function fixPrompt(phase: Phase, errors: string[], attempt: number): Prompt {
  const list = errors.slice(0, MAX_REPORTED_ERRORS).map((e) => `- ${e}`);
  if (errors.length > MAX_REPORTED_ERRORS) list.push(`- …and ${errors.length - MAX_REPORTED_ERRORS} more of the same kinds`);
  const where = phase === "CSV" ? "while generating the CSVs from the HCD/FRG data files" : `in phase ${phase}`;
  return {
    shown: `The validator found ${errors.length} problem(s) ${where} (fix attempt ${attempt}/${env.maxNudges}):\n${list.join("\n")}\n\nFix them in the files and finish with status "done".`,
  };
}

// --- state -------------------------------------------------------------------

async function prepareWorkspace(project: ProjectRecord) {
  await mkdir(env.workDir, { recursive: true });
  await mkdir(env.codexHome, { recursive: true });
  // harness rules at the workspace root (Codex loads AGENTS.md from its working directory)
  const agents = (await readFile(join(env.promptsDir, "AGENTS.md"), "utf8")).replaceAll("{P}", projectId);
  await writeFile(join(env.workDir, "AGENTS.md"), agents, "utf8");
  await writeSchemas(env.workDir);

  if (mode !== "initial" || project.codexThreadId) {
    await log("Restoring previous workspace…", { i18n: "sys.restoring" });
    const n1 = await downloadDir(`${prefix}workspace/`, paths.root);
    const n2 = await downloadDir(`${prefix}thread/`, env.codexHome);
    console.log(`[worker] restored workspace=${n1} thread=${n2}`);
  } else {
    await rm(paths.root, { recursive: true, force: true });
  }
  await mkdir(paths.hcd, { recursive: true });
  await mkdir(paths.frg, { recursive: true });
  await mkdir(paths.csv, { recursive: true });
}

async function persistState() {
  const a = await uploadDir(paths.root, `${prefix}workspace/`, { deleteMissing: true });
  const b = await uploadDir(join(env.codexHome, "sessions"), `${prefix}thread/sessions/`);
  console.log(`[worker] persisted workspace(+${a.uploaded}/-${a.deleted}) thread(+${b.uploaded})`);
}

async function syncStepStates() {
  const states = detectStepStates(paths, accepted, xlsxDone);
  if (lastStepStates && JSON.stringify(states) === JSON.stringify(lastStepStates)) return;
  const prev = lastStepStates;
  lastStepStates = states;
  await updateProject(userId, projectId, { stepStates: states, currentStep: currentStepOf(states) });
  for (const s of ["HCD", "FRG", "CSV", "XLSX"] as WorkflowStep[]) {
    if (states[s] === "done" && prev && prev[s] !== "done") {
      await putMessage(projectId, jobId, "system", "status", `Step ${s} completed.`, { step: s, meta: { i18n: "sys.stepDone", step: s, stepDone: s } });
    }
  }
}

let resolvedModel: string | null = null;
let resolvedEffort: string | null = null;

async function accumulateUsage(u: { input: number; cachedInput: number; output: number; reasoningOutput: number }) {
  const j = await getJob(projectId, jobId);
  const usage = addUsage(j?.usage, {
    inputTokens: u.input,
    cachedInputTokens: u.cachedInput,
    outputTokens: u.output,
    reasoningOutputTokens: u.reasoningOutput,
  });
  const costUsd = estimateCostUsd(resolvedModel, usage);
  await updateJob(projectId, jobId, {
    usage,
    costUsd,
    model: resolvedModel,
    reasoningEffort: (resolvedEffort as JobRecord["reasoningEffort"]) ?? null,
  });
  await refreshProjectUsage(userId, projectId);
  await putMessage(
    projectId,
    jobId,
    "system",
    "status",
    `Tokens: in ${formatTokens(usage.inputTokens)} (cached ${formatTokens(usage.cachedInputTokens)}) / out ${formatTokens(usage.outputTokens)} · est. ${formatUsd(costUsd)}`,
    { meta: { i18n: "sys.usage", kind: "usage", usage, costUsd, model: resolvedModel } },
  );
}

async function fail(message: string, meta?: Record<string, unknown>) {
  if (cancelled) return;
  if (mode === "article") {
    const [project, job] = await Promise.all([getProject(userId, projectId), getJob(projectId, jobId)]);
    if (project && job) await endArticleJob(project, job, "FAILED", message);
    else await updateJob(projectId, jobId, { status: "FAILED", errorMessage: message, endedAt: nowIso() });
    await putMessage(projectId, jobId, "system", "error", message, { meta });
    return;
  }
  await updateJob(projectId, jobId, { status: "FAILED", errorMessage: message, endedAt: nowIso() });
  await updateProject(userId, projectId, { status: "FAILED", errorMessage: message, activeJobId: null });
  await putMessage(projectId, jobId, "system", "error", message, { meta });
}

async function decryptApiKey(ciphertextB64: string, uid: string): Promise<string> {
  const r = await kms.send(
    new DecryptCommand({ CiphertextBlob: Buffer.from(ciphertextB64, "base64"), EncryptionContext: { userId: uid, purpose: "openai-api-key" } }),
  );
  if (!r.Plaintext) throw new Error("KMS decrypt returned empty plaintext");
  return Buffer.from(r.Plaintext).toString("utf8");
}

async function taskArn(): Promise<string | null> {
  const uri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!uri) return null;
  try {
    const r = await fetch(`${uri}/task`);
    const j = (await r.json()) as { TaskARN?: string };
    return j.TaskARN ?? null;
  } catch {
    return null;
  }
}

main().catch(async (e) => {
  console.error("[worker] unhandled", e);
  try {
    await fail(e instanceof Error ? e.message : String(e));
  } finally {
    process.exit(1);
  }
});
