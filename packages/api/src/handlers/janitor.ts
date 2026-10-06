/**
 * Scheduled housekeeping:
 *  - RUNNING/FINALIZING jobs with a stale heartbeat → auto-retry (up to MAX_AUTO_RETRY, e.g. Spot interruption) or FAILED
 *  - WAITING_USER_INPUT jobs older than 7 days → FAILED (timeout)
 *  - QUEUED jobs older than 24h → FAILED
 * Jobs without a project (Canon AI reviews, BRA Planner plan jobs) are only marked FAILED, never retried; the PR page
 * shows the review's error, and the plan runner ends the plan's draft / re-plan with it.
 */
import type { JobRecord } from "@cobrac/shared";
import { HEARTBEAT_STALE_MS, WAITING_INPUT_TIMEOUT_MS, isProjectlessMode, newId, nowIso } from "@cobrac/shared";
import { enqueueRun } from "../lib/aws.js";
import { listJobsByStatus, putJob, putMessage, updateJob, updateProject } from "../lib/db.js";

const MAX_AUTO_RETRY = Number(process.env.MAX_AUTO_RETRY ?? "2");

export async function handler() {
  const now = Date.now();

  for (const status of ["RUNNING", "FINALIZING"] as const) {
    for (const j of await listJobsByStatus(status)) {
      const hb = j.lastHeartbeat ? Date.parse(j.lastHeartbeat) : Date.parse(j.createdAt);
      if (now - hb <= HEARTBEAT_STALE_MS) continue;
      if (j.type === "canon-review") await failProjectless(j, "The worker stopped responding. Run the AI review again.");
      else if (isProjectlessMode(j.type)) await failProjectless(j, "The worker stopped responding.");
      else if (j.retryCount < MAX_AUTO_RETRY) await autoRetry(j);
      else await failJob(j, "The worker stopped responding (for example a Fargate Spot interruption). Use “Retry from here” to continue.", "sys.heartbeatLost");
    }
  }

  for (const j of await listJobsByStatus("WAITING_USER_INPUT")) {
    if (now - Date.parse(j.updatedAt) > WAITING_INPUT_TIMEOUT_MS) {
      if (isProjectlessMode(j.type)) await failProjectless(j, "Stopped after waiting more than 7 days.");
      else await failJob(j, "Stopped after waiting more than 7 days for an answer to the question. Use “Retry from here” to continue.", "sys.answerTimeout");
    }
  }

  for (const j of await listJobsByStatus("QUEUED")) {
    if (now - Date.parse(j.createdAt) > 24 * 60 * 60 * 1000) {
      if (isProjectlessMode(j.type)) await failProjectless(j, "No worker could be started within 24 hours.");
      else await failJob(j, "No worker could be started within 24 hours.", "sys.queueTimeout");
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
  const article = prev.type === "article";
  await updateProject(prev.userId, prev.projectId, {
    status: "QUEUED",
    activeJobId: jobId,
    errorMessage: null,
    ...(article && prev.articleLocale ? { articleJob: { jobId, locale: prev.articleLocale, status: "QUEUED" as const, errorMessage: null, requestedAt: now } } : {}),
  });
  await putMessage(prev.projectId, jobId, "system", "status", `The worker stopped responding; resuming automatically (${job.retryCount}/${MAX_AUTO_RETRY}).`, {
    userId: prev.userId,
    meta: { i18n: "sys.autoRetry", attempt: job.retryCount, max: MAX_AUTO_RETRY },
  });
  await enqueueRun({ version: 1, userId: prev.userId, projectId: prev.projectId, jobId, mode: article ? "article" : "retry" });
}

/** A job without a project (Canon AI review, plan job): only the job records the failure. */
async function failProjectless(j: JobRecord, reason: string) {
  await updateJob(j.projectId, j.jobId, { status: "FAILED", errorMessage: reason, endedAt: nowIso() });
}

/** A failed article job leaves the project COMPLETED: its BRA data is unchanged. */
/** `reason` is stored in English; the UI shows it in its language through `resolveSystemMessage` (`i18n` key). */
async function failJob(j: JobRecord, reason: string, i18n: string) {
  const { projectId, jobId, userId } = j;
  await updateJob(projectId, jobId, { status: "FAILED", errorMessage: reason, endedAt: nowIso() });
  if (j.type === "article" && j.articleLocale) {
    await updateProject(userId, projectId, {
      status: "COMPLETED",
      activeJobId: null,
      errorMessage: null,
      articleJob: { jobId, locale: j.articleLocale, status: "FAILED", errorMessage: reason, requestedAt: j.createdAt },
    });
  } else await updateProject(userId, projectId, { status: "FAILED", errorMessage: reason, activeJobId: null });
  await putMessage(projectId, jobId, "system", "error", reason, { userId, meta: { i18n } });
}
