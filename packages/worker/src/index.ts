/**
 * CoBRAC Agents worker (ECS Fargate task) — the "CoBRAC harness".
 *
 * The worker drives the workflow phase by phase instead of letting the agent read instruction files:
 *   HCD (agent turn → validator → fix turns) → FRG (same) → CSV (deterministic from the markdown tables;
 *   agent fallback only when that fails) → xlsx + graphs (deterministic).
 * Shared rules live in prompts/AGENTS.md (auto-loaded by Codex); each phase prompt inlines prompts/phases/<PHASE>.md.
 *
 * Run modes:
 *   - initial : fresh workspace, start at HCD
 *   - resume  : restore workspace + thread, deliver the user's answer, continue the current phase
 *   - followup: restore, apply the instruction, re-validate every phase, regenerate CSV/xlsx
 *   - retry   : restore, continue from the first phase not accepted yet
 *
 * Whenever the agent asks a question we persist state to S3 and exit so no compute is billed while waiting.
 */
import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FrgModel, HcdModel, JobRecord, ProjectRecord, StepState, WorkflowStep } from "@cobrac/shared";
import {
  HCD_FILES,
  addUsage,
  buildCsvs,
  buildGraphs,
  buildProjectCsv,
  checkFrg,
  checkHcd,
  estimateCostUsd,
  formatTokens,
  formatUsd,
  hombaAnchorIds,
  nowIso,
} from "@cobrac/shared";
import { createCodex, openThread, resolveModelSettings, runTurn, type TurnSink } from "./codex.js";
import { getJob, getProject, getUser, putMessage, refreshProjectUsage, updateJob, updateProject } from "./db.js";
import { env } from "./env.js";
import { finalizeProject } from "./finalize.js";
import { RcsClient, resolveRcsConnection } from "./rcs.js";
import { downloadDir, projectPrefix, uploadDir } from "./s3sync.js";
import { csvComplete, csvWrittenSince, currentStepOf, detectStepStates, loadFrgFiles, loadHcdFiles, projectPaths } from "./steps.js";

type Phase = "HCD" | "FRG" | "CSV";
const PHASES: Phase[] = ["HCD", "FRG", "CSV"];
const MAX_REPORTED_ERRORS = 30;

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
let workspaceReadyAt = 0;
let rcs: RcsClient | null = null;
/** New projects follow the UC naming convention; older workspaces only when their 3_UC.md already has the column. */
let ucNaming = false;

const log = async (content: string, meta?: Record<string, unknown>): Promise<void> => {
  await putMessage(projectId, jobId, "system", "status", content, { meta, step: lastStepStates ? currentStepOf(lastStepStates) : null });
};

interface Prompt {
  /** What the chat shows */
  shown: string;
  /** Appended for the agent only (phase specs) */
  hidden?: string;
}

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
  await updateProject(userId, projectId, { status: "RUNNING", activeJobId: jobId, pendingQuestion: null, errorMessage: null });

  // --- workspace ------------------------------------------------------------
  await prepareWorkspace(project);
  workspaceReadyAt = Date.now();
  ucNaming = followsUcNaming();
  if (ucNaming && !rcs) await log("RCS (SABRA lookup) is not available in this run; UC anchors are not checked against RCS.");
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

  const abort = new AbortController();
  const heartbeat = setInterval(async () => {
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
      turn = await runTurn(thread, p.hidden ? `${p.shown}\n\n---\n\n${p.hidden}` : p.shown, sink, abort.signal);
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
    const ctx: PhaseContext = { project, hcd: null, frg: null };
    const firstOpen = PHASES.findIndex((p) => !accepted.has(p));
    const startIdx = firstOpen === -1 ? PHASES.length - 1 : firstOpen;
    let pending = await firstPrompt(project, job, PHASES[startIdx], freshThread);
    if (pending) await putMessage(projectId, jobId, "user", "prompt", pending.shown, { meta: { mode } });

    const requestFix = async (phase: Phase, errors: string[], attempt: number): Promise<Prompt> => {
      const details = errors.join("\n");
      if (phase === "CSV") {
        await log("Automatic CSV conversion failed; asked the agent to write the CSVs.", { i18n: "sys.csvFallback", details });
        return csvFallbackPrompt(errors);
      }
      await log(`Checks found ${errors.length} issue(s) in ${phase}; asked the agent to fix them.`, {
        i18n: "sys.validationFailed",
        step: phase,
        count: errors.length,
        details,
      });
      return fixPrompt(phase, errors, attempt);
    };

    for (let i = startIdx; i < PHASES.length; i++) {
      const phase = PHASES[i];
      let attempts = 0;
      if (i > startIdx && phase !== "CSV") {
        // existing files (follow-ups, resumed runs) are only fixed, never rebuilt
        const pre = await acceptPhase(phase, ctx);
        if (pre.errors.length) {
          pending = phaseHasFiles(phase)
            ? { ...(await requestFix(phase, pre.errors, ++attempts)), hidden: await phaseSpec(phase) }
            : await phasePrompt(project, phase);
        }
      }
      for (;;) {
        if (pending) {
          const p = pending;
          pending = null;
          if (!(await agentTurn(p))) return;
        }
        const r = await acceptPhase(phase, ctx);
        if (r.errors.length === 0) break;
        if (attempts >= env.maxNudges) {
          if (r.fatal) {
            await persistState();
            await fail(`The ${phase} step could not be completed after the allowed fix attempts. Use a follow-up or retry.`, {
              i18n: "sys.phaseIncomplete",
              step: phase,
              details: r.errors.join("\n"),
            });
            return;
          }
          await log(`${phase} still has ${r.errors.length} unresolved check issue(s); continuing.`, {
            i18n: "sys.validationWarn",
            step: phase,
            count: r.errors.length,
            details: r.errors.join("\n"),
          });
          break;
        }
        pending = await requestFix(phase, r.errors, ++attempts);
      }
      accepted.add(phase);
      await syncStepStates();
      await persistState();
    }

    // --- finalize -------------------------------------------------------------
    await updateJob(projectId, jobId, { status: "FINALIZING" });
    await updateProject(userId, projectId, { status: "FINALIZING" });
    await persistState();

    if (csvComplete(paths)) {
      const r = await finalizeProject(paths, userId, projectId, project.contributor, (m, meta) => log(m, meta));
      xlsxDone = true;
      await syncStepStates();
      await putMessage(projectId, jobId, "system", "artifact", `Generated ${projectId}.bra.xlsx.`, {
        meta: { i18n: "sys.xlsxReady", name: `${projectId}.bra.xlsx`, xlsxKey: r.xlsxKey, hcdNodes: r.hcdNodes, hcdEdges: r.hcdEdges, frgNodes: r.frgNodes },
      });
    }
    await persistState();

    await updateJob(projectId, jobId, { status: "COMPLETED", endedAt: nowIso() });
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

// --- phases ------------------------------------------------------------------

interface PhaseContext {
  project: ProjectRecord;
  hcd: HcdModel | null;
  frg: FrgModel | null;
}

interface PhaseCheck {
  errors: string[];
  fatal: boolean;
}

async function acceptPhase(phase: Phase, ctx: PhaseContext): Promise<PhaseCheck> {
  const { files, meta } = loadHcdFiles(paths);
  const hcd = await checkHcdWithRcs(files, meta);
  ctx.hcd = hcd.model;
  if (phase === "HCD") {
    if (hcd.model?.meta && hcd.errors.length === 0) await adoptMeta(ctx.project, hcd.model.meta);
    return { errors: hcd.errors, fatal: hcd.fatal };
  }
  if (!hcd.model) return { errors: ["The HCD files cannot be parsed:", ...hcd.errors], fatal: true };

  const frg = checkFrg(loadFrgFiles(paths), hcd.model);
  ctx.frg = frg.model;
  if (phase === "FRG") return { errors: frg.errors, fatal: frg.fatal };

  // CSV: deterministic conversion first
  const opts = {
    projectId,
    contributor: ctx.project.contributor,
    projectTemplate: await readFile(join(env.promptsDir, "Project.csv"), "utf8"),
    roi: ctx.project.roi,
    tlf: ctx.project.tlf,
  };
  const errors: string[] = [];
  if (frg.model) {
    const built = buildCsvs(hcd.model, frg.model, opts);
    if (built.files) {
      await mkdir(paths.csv, { recursive: true });
      for (const [name, text] of Object.entries(built.files)) await writeFile(join(paths.csv, name), text, "utf8");
      const parseError = await graphParseError();
      if (!parseError) {
        await log("CSVs generated from the HCD/FRG tables.", { i18n: "sys.csvBuilt" });
        return { errors: [], fatal: false };
      }
      errors.push(parseError);
    } else errors.push(...built.errors);
  } else errors.push("The FRG files cannot be parsed:", ...frg.errors);

  // agent-written CSVs (fallback phase) are accepted when they were produced during this run
  if (csvComplete(paths) && csvWrittenSince(paths, workspaceReadyAt)) {
    await writeFile(join(paths.csv, "Project.csv"), buildProjectCsv(opts, hcd.model.meta), "utf8");
    const parseError = await graphParseError();
    if (!parseError) return { errors: [], fatal: false };
    errors.push(parseError);
  }
  return { errors, fatal: true };
}

/** checkHcd, with the HOMBA anchors of the UC Descriptors looked up in RCS for the anchor-abbreviation check. */
async function checkHcdWithRcs(files: ReturnType<typeof loadHcdFiles>["files"], meta: string | null) {
  const opts = { ucNaming: ucNaming || undefined };
  const first = checkHcd(files, meta, opts);
  const ids = first.model ? hombaAnchorIds(first.model.ucs.map((u) => u.descriptor).filter(Boolean)) : [];
  if (!rcs || !ids.length) return first;
  return checkHcd(files, meta, { ...opts, sabra: await rcs.lookupHomba(ids) });
}

function followsUcNaming(): boolean {
  const uc = HCD_FILES.uc.map((f) => join(paths.hcd, f)).find((f) => existsSync(f));
  if (!uc) return true;
  return /\|\s*UC Descriptor\s*\|/i.test(readFileSync(uc, "utf8"));
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
    await appendFile(join(paths.root, "rcs_mcp_calls.jsonl"), JSON.stringify(line) + "\n", "utf8");
  } catch (e) {
    console.warn("[worker] rcs log failed", e);
  }
}

function phaseHasFiles(phase: Phase): boolean {
  const dir = phase === "HCD" ? paths.hcd : phase === "FRG" ? paths.frg : paths.csv;
  return existsSync(dir) && readdirSync(dir).length > 0;
}

async function graphParseError(): Promise<string | null> {
  try {
    const read = (f: string) => readFile(join(paths.csv, f), "utf8");
    const { hcd, frg } = buildGraphs(projectId, {
      circuitsCsv: await read("Circuits.csv"),
      connectionsCsv: await read("Connections.csv"),
      frgCsv: await read("FRG.csv"),
      referencesCsv: await read("References.csv"),
    });
    if (!hcd.nodes.length || !frg.nodes.length) return "The CSVs produce an empty HCD or FRG graph.";
    return null;
  } catch (e) {
    return `The CSVs cannot be parsed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Store ROI/TLF decided by the agent when the user left them empty. */
async function adoptMeta(project: ProjectRecord, meta: { roi: string; tlf: string }) {
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
        "(HOMBA/DHBA or BNA IDs), keep UC Descriptors and Circuit IDs in the same format, and state in 1_Thinking.md that the anchors were not checked with RCS.\n";
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
      // specs are always attached: threads from the legacy prompts have never seen the current table formats
      return {
        shown: `${header(project)}\n\nFollow-up instruction:\n${job.instruction ?? ""}`,
        hidden:
          `Apply the follow-up instruction to the HCD/FRG files (see "Follow-up instructions" in AGENTS.md). ` +
          `If the files use an older format, the validator will report what to adapt. Reference specs:\n\n` +
          `${await phaseSpec("HCD")}\n\n---\n\n${await phaseSpec("FRG")}`,
      };
  }
}

function fixPrompt(phase: Phase, errors: string[], attempt: number): Prompt {
  const list = errors.slice(0, MAX_REPORTED_ERRORS).map((e) => `- ${e}`);
  if (errors.length > MAX_REPORTED_ERRORS) list.push(`- …and ${errors.length - MAX_REPORTED_ERRORS} more of the same kinds`);
  return {
    shown: `The validator found ${errors.length} problem(s) in phase ${phase} (fix attempt ${attempt}/${env.maxNudges}):\n${list.join("\n")}\n\nFix them in the files and finish with status "done".`,
  };
}

async function csvFallbackPrompt(errors: string[]): Promise<Prompt> {
  return {
    shown: `${await phaseSpec("CSV")}\n\nWhy the automatic conversion failed:\n${errors
      .slice(0, MAX_REPORTED_ERRORS)
      .map((e) => `- ${e}`)
      .join("\n")}`,
  };
}

// --- state -------------------------------------------------------------------

async function prepareWorkspace(project: ProjectRecord) {
  await mkdir(env.workDir, { recursive: true });
  await mkdir(env.codexHome, { recursive: true });
  // harness rules at the workspace root (Codex loads AGENTS.md from its working directory)
  const agents = (await readFile(join(env.promptsDir, "AGENTS.md"), "utf8")).replaceAll("{P}", projectId);
  await writeFile(join(env.workDir, "AGENTS.md"), agents, "utf8");

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
