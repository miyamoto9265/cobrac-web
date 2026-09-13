/**
 * CoBRAC Agents worker (ECS Fargate task).
 *
 * One task = one "run" of a job:
 *   - initial : create workspace, run instruction_0 workflow until completion or a [QUESTION]
 *   - resume  : restore workspace + thread, deliver the user's answer, continue
 *   - followup: restore workspace + thread, deliver follow-up instruction, regenerate outputs
 *   - retry   : restore workspace (+ thread if any), ask agent to continue from remaining work
 *
 * Whenever the agent asks a [QUESTION] we persist state to S3 and exit so no compute is billed while waiting.
 */
import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { JobRecord, ProjectRecord, StepState, WorkflowStep } from "@cobrac/shared";
import { addUsage, estimateCostUsd, formatTokens, formatUsd, nowIso } from "@cobrac/shared";
import { createCodex, openThread, resolveModelSettings, runTurn, type TurnSink } from "./codex.js";
import { getJob, getProject, getUser, putMessage, refreshProjectUsage, updateJob, updateProject } from "./db.js";
import { env } from "./env.js";
import { finalizeProject } from "./finalize.js";
import { downloadDir, projectPrefix, uploadDir } from "./s3sync.js";
import { currentStepOf, csvComplete, detectStepStates, listArtifactsSummary, projectPaths } from "./steps.js";

const { userId, projectId, jobId, mode } = env.job;
const prefix = projectPrefix(userId, projectId);
const paths = projectPaths(env.workDir, projectId);
const kms = new KMSClient({ region: env.region });

const startedAt = Date.now();
const markers = new Set<WorkflowStep>();
let xlsxDone = false;
let lastStepStates: Record<WorkflowStep, StepState> | null = null;
let cancelled = false;

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

  await updateJob(projectId, jobId, { status: "RUNNING", startedAt: job.startedAt ?? nowIso(), lastHeartbeat: nowIso(), ecsTaskArn: await taskArn() });
  await updateProject(userId, projectId, { status: "RUNNING", activeJobId: jobId, pendingQuestion: null, errorMessage: null });

  // --- workspace ------------------------------------------------------------
  await prepareWorkspace(project);
  xlsxDone = project.stepStates?.XLSX === "done" && mode !== "initial";
  if (mode !== "initial") for (const s of ["HCD", "FRG", "CSV"] as WorkflowStep[]) if (project.stepStates?.[s] === "done") markers.add(s);
  await syncStepStates();

  // --- codex ----------------------------------------------------------------
  const codex = createCodex(apiKey);
  let threadId = mode === "initial" ? null : project.codexThreadId;
  if (threadId && !existsSync(join(env.codexHome, "sessions"))) {
    await log("スレッド状態が見つからないため、新しいスレッドで再開します。");
    threadId = null;
  }
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
        await log("キャンセル要求を受信しました。状態を保存して終了します。");
        abort.abort();
        return;
      }
      await updateJob(projectId, jobId, { lastHeartbeat: nowIso() });
      if (Date.now() - startedAt > env.workflowTimeoutMs) {
        await fail("最大実行時間（6時間）を超過しました。リトライで続きから再開できます。");
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
  };

  try {
    let prompt = buildPrompt(project, job);
    await putMessage(projectId, jobId, "user", "prompt", prompt, { meta: { mode } });

    let nudges = 0;
    for (;;) {
      let turn;
      try {
        turn = await runTurn(thread, prompt, sink, abort.signal);
      } catch (e) {
        if (cancelled) {
          await persistState();
          console.log("[worker] cancelled; state persisted");
          return;
        }
        throw e;
      }
      if (cancelled) {
        await persistState();
        return;
      }
      for (const m of turn.markers) markers.add(m);
      if (turn.threadId) await updateProject(userId, projectId, { codexThreadId: turn.threadId });
      await accumulateUsage(turn.usage);
      await syncStepStates();

      if (turn.failed) {
        await persistState();
        await fail(turn.errorMessage ?? "Codex turn failed");
        return;
      }

      if (turn.question) {
        await persistState();
        await updateJob(projectId, jobId, { status: "WAITING_USER_INPUT", pendingAnswer: null });
        await updateProject(userId, projectId, { status: "WAITING_USER_INPUT", pendingQuestion: turn.question });
        await log("エージェントからの質問に回答すると作業が再開されます。");
        console.log("[worker] waiting for user input; exiting");
        return;
      }

      // Completion criteria: follow-ups end after one answered turn; other modes require the 5 CSVs.
      if (mode === "followup" || csvComplete(paths)) break;

      if (nudges >= env.maxNudges) {
        await persistState();
        await fail("エージェントが所定回数の続行指示後も CSV を生成しませんでした。フォローアップ指示またはリトライで続きを実行してください。");
        return;
      }
      nudges++;
      const have = listArtifactsSummary(paths);
      prompt =
        `作業がまだ完了していません（続行 ${nudges}/${env.maxNudges}）。instruction_0.md の手順のうち残っている作業を続行し、` +
        `最終的に ${projectId}/${projectId}_CSV/ 内に 5 種類の CSV をすべて作成してください。\n` +
        `現在存在する成果物:\n${have.length ? have.map((h) => `- ${h}`).join("\n") : "(なし)"}`;
      await putMessage(projectId, jobId, "system", "status", "作業が未完了のため、続行を指示しました。");
    }

    // --- finalize -------------------------------------------------------------
    await updateJob(projectId, jobId, { status: "FINALIZING" });
    await updateProject(userId, projectId, { status: "FINALIZING" });
    await persistState();

    if (csvComplete(paths)) {
      const r = await finalizeProject(paths, userId, projectId, project.contributor, (m) => log(m));
      xlsxDone = true;
      await syncStepStates();
      await putMessage(projectId, jobId, "system", "artifact", `${projectId}.bra.xlsx を生成しました。`, {
        meta: { xlsxKey: r.xlsxKey, hcdNodes: r.hcdNodes, hcdEdges: r.hcdEdges, frgNodes: r.frgNodes },
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
    await log(mode === "followup" ? "フォローアップが完了しました。" : "BRA データの作成が完了しました。");
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

// ---------------------------------------------------------------------------

function buildPrompt(project: ProjectRecord, job: JobRecord): string {
  const header =
    `ROI: ${project.roi?.trim() || "（未指定。調査によって妥当な ROI を決定してください）"}\n` +
    `TLF: ${project.tlf?.trim() || "（未指定。調査によって妥当な TLF を決定してください）"}\n` +
    `Project ID: ${projectId}\n` +
    `Contributor: ${project.contributor}\n`;

  switch (mode) {
    case "initial":
      return `${header}\n作業ディレクトリ内の instruction_0.md を読み、その手順に従って作業を開始してください。`;
    case "resume":
      return (
        `ユーザーからの回答:\n${job.pendingAnswer ?? "(回答なし)"}\n\n` +
        `この回答を踏まえて、中断した箇所から instruction_0.md の手順に沿って作業を再開してください。`
      );
    case "followup":
      return (
        `${header}\nフォローアップ指示です。instruction_0.md の「フォローアップ（修正指示）モード」に従って対応してください。\n\n` +
        `指示:\n${job.instruction ?? ""}`
      );
    case "retry":
      return (
        `${header}\n前回の実行が途中で終了しました。作業ディレクトリ内の既存の成果物を確認し、instruction_0.md の手順のうち` +
        `残っている作業を続行してください。既に完成しているファイルは作り直さないでください。`
      );
  }
}

async function prepareWorkspace(project: ProjectRecord) {
  await mkdir(env.workDir, { recursive: true });
  await mkdir(env.codexHome, { recursive: true });
  // instruction files & tools at workspace root
  await cp(env.promptsDir, env.workDir, { recursive: true, force: true });

  if (mode !== "initial" || project.codexThreadId) {
    await log("前回の作業状態を復元しています…");
    const n1 = await downloadDir(`${prefix}workspace/`, paths.root);
    const n2 = await downloadDir(`${prefix}thread/`, env.codexHome);
    console.log(`[worker] restored workspace=${n1} thread=${n2}`);
  } else {
    await rm(paths.root, { recursive: true, force: true });
  }
  await mkdir(paths.root, { recursive: true });
}

async function persistState() {
  const a = await uploadDir(paths.root, `${prefix}workspace/`, { deleteMissing: true });
  const b = await uploadDir(join(env.codexHome, "sessions"), `${prefix}thread/sessions/`);
  console.log(`[worker] persisted workspace(+${a.uploaded}/-${a.deleted}) thread(+${b.uploaded})`);
}

async function syncStepStates() {
  const states = detectStepStates(paths, markers, xlsxDone);
  if (lastStepStates && JSON.stringify(states) === JSON.stringify(lastStepStates)) return;
  const prev = lastStepStates;
  lastStepStates = states;
  await updateProject(userId, projectId, { stepStates: states, currentStep: currentStepOf(states) });
  for (const s of ["HCD", "FRG", "CSV", "XLSX"] as WorkflowStep[]) {
    if (states[s] === "done" && prev?.[s] !== "done") {
      await putMessage(projectId, jobId, "system", "status", `ステップ ${s} が完了しました。`, { step: s, meta: { stepDone: s } });
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
  await putMessage(projectId, jobId, "system", "status", `トークン: 入力 ${formatTokens(usage.inputTokens)}（キャッシュ ${formatTokens(usage.cachedInputTokens)}）/ 出力 ${formatTokens(usage.outputTokens)} · 推定 ${formatUsd(costUsd)}`, {
    meta: { kind: "usage", usage, costUsd, model: resolvedModel },
  });
}

async function fail(message: string) {
  if (cancelled) return;
  await updateJob(projectId, jobId, { status: "FAILED", errorMessage: message, endedAt: nowIso() });
  await updateProject(userId, projectId, { status: "FAILED", errorMessage: message, activeJobId: null });
  await putMessage(projectId, jobId, "system", "error", message);
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
