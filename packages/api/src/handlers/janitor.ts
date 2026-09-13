/**
 * Scheduled housekeeping:
 *  - RUNNING/FINALIZING jobs with a stale heartbeat → auto-retry (up to MAX_AUTO_RETRY, e.g. Spot interruption) or FAILED
 *  - WAITING_USER_INPUT jobs older than 7 days → FAILED (timeout)
 *  - QUEUED jobs older than 24h → FAILED
 */
import type { JobRecord } from "@cobrac/shared";
import { HEARTBEAT_STALE_MS, WAITING_INPUT_TIMEOUT_MS, newId, nowIso } from "@cobrac/shared";
import { enqueueRun } from "../lib/aws.js";
import { listJobsByStatus, putJob, putMessage, updateJob, updateProject } from "../lib/db.js";

const MAX_AUTO_RETRY = Number(process.env.MAX_AUTO_RETRY ?? "2");

export async function handler() {
  const now = Date.now();

  for (const status of ["RUNNING", "FINALIZING"] as const) {
    for (const j of await listJobsByStatus(status)) {
      const hb = j.lastHeartbeat ? Date.parse(j.lastHeartbeat) : Date.parse(j.createdAt);
      if (now - hb <= HEARTBEAT_STALE_MS) continue;
      if (j.retryCount < MAX_AUTO_RETRY) await autoRetry(j);
      else await failJob(j.projectId, j.jobId, j.userId, "ワーカーからの応答が途絶えました（Spot 中断など）。「続きからリトライ」で再開できます。");
    }
  }

  for (const j of await listJobsByStatus("WAITING_USER_INPUT")) {
    if (now - Date.parse(j.updatedAt) > WAITING_INPUT_TIMEOUT_MS) {
      await failJob(j.projectId, j.jobId, j.userId, "質問への回答待ちが 7 日間を超えたため終了しました。「続きからリトライ」で再開できます。");
    }
  }

  for (const j of await listJobsByStatus("QUEUED")) {
    if (now - Date.parse(j.createdAt) > 24 * 60 * 60 * 1000) {
      await failJob(j.projectId, j.jobId, j.userId, "24 時間以内にワーカーを起動できませんでした。");
    }
  }
}

async function autoRetry(prev: JobRecord) {
  const now = nowIso();
  await updateJob(prev.projectId, prev.jobId, { status: "FAILED", errorMessage: "heartbeat lost", endedAt: now });
  const jobId = newId("job_");
  const job: JobRecord = {
    ...prev,
    jobId,
    status: "QUEUED",
    pendingAnswer: null,
    ecsTaskArn: null,
    retryCount: prev.retryCount + 1,
    lastHeartbeat: null,
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    usage: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await putJob(job);
  await updateProject(prev.userId, prev.projectId, { status: "QUEUED", activeJobId: jobId, errorMessage: null });
  await putMessage(prev.projectId, jobId, "system", "status", `ワーカーからの応答が途絶えたため、自動で再開します（${job.retryCount}/${MAX_AUTO_RETRY}）。`);
  await enqueueRun({ version: 1, userId: prev.userId, projectId: prev.projectId, jobId, mode: "retry" });
}

async function failJob(projectId: string, jobId: string, userId: string, reason: string) {
  await updateJob(projectId, jobId, { status: "FAILED", errorMessage: reason, endedAt: nowIso() });
  await updateProject(userId, projectId, { status: "FAILED", errorMessage: reason, activeJobId: null });
  await putMessage(projectId, jobId, "system", "error", reason);
}
