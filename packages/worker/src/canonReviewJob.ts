
import {
  canonAiReviewKey,
  type CanonAiPacket,
  type CanonAiReviewResult,
  DEFAULT_CODEX_MODEL,
  EMPTY_USAGE,
  estimateCostUsd,
  isUiLocale,
  nowIso,
  providerOf,
} from "@cobrac/shared";
import { runCanonReview } from "./canonReview.js";
import {
  createEngine,
  fromCodexUsage,
  tokenUsageOf,
  openThread,
  type ModelSettings,
} from "./codex.js";
import {
  getJob,
  getDefaultApiKey,
  getUser,
  updateJob,
} from "./db.js";
import { env } from "./env.js";
import { ownKeyOf, planRunKey } from "./runKey.js";
import { getJsonObject, putObject } from "./s3sync.js";
import { jobId, projectId, userId, decryptApiKey, taskArn, type FailJob } from "./jobContext.js";

// --- AI review of a Canon pull request -------------------------------------------

/** `projectId` is the Canon ID here; the job, the packet and the result are all that is read or written. */
/** `fail` is the worker's job failure handler (index.ts) */
export async function canonReviewJob(fail: FailJob) {
  const [user, job] = await Promise.all([getUser(userId), getJob(projectId, jobId)]);
  if (!user || !job || job.type !== "canon-review" || !job.reviewPrNo || !isUiLocale(job.reviewLocale)) throw new Error("user/review job not found");
  if (job.status !== "QUEUED") {
    console.log(`[worker] review job is ${job.status}; exiting`);
    return;
  }
  const model = job.model || env.codexModel || DEFAULT_CODEX_MODEL;
  const key = planRunKey(user, ownKeyOf(user, model) ? null : await getDefaultApiKey(providerOf(model)), model);
  if ("error" in key) {
    await fail(key.error);
    return;
  }
  const apiKey = await decryptApiKey(key.encryptedApiKey, key.context);
  await updateJob(projectId, jobId, { status: "RUNNING", startedAt: nowIso(), lastHeartbeat: nowIso(), ecsTaskArn: await taskArn(), keySource: key.source });
  const packet = await getJsonObject<CanonAiPacket>(canonAiReviewKey(projectId, job.reviewPrNo, jobId, "input.json"));
  if (!packet) {
    await fail("The material of the pull request could not be read.");
    return;
  }
  const settings: ModelSettings = { model, reasoningEffort: (env.codexReasoningEffort as ModelSettings["reasoningEffort"]) ?? null };
  const thread = openThread(createEngine(settings.model, apiKey), null, settings, { webSearch: false });
  const heartbeat = setInterval(() => void updateJob(projectId, jobId, { lastHeartbeat: nowIso() }).catch(() => undefined), 45_000);
  try {
    const outcome = await runCanonReview({
      packet,
      locale: job.reviewLocale,
      decide: job.reviewKind === "decide",
      turn: async (prompt, schema) => {
        const t = await thread.run(prompt, { outputSchema: schema });
        return { text: t.finalResponse, usage: t.usage ? tokenUsageOf(fromCodexUsage(t.usage)) : { ...EMPTY_USAGE } };
      },
    });
    const usage = { usage: outcome.usage, costUsd: estimateCostUsd(model, outcome.usage), model };
    if (outcome.result === "failed") {
      await updateJob(projectId, jobId, { ...usage, status: "FAILED", errorMessage: outcome.error, endedAt: nowIso() });
      return;
    }
    const result: CanonAiReviewResult = { review: outcome.review, ...(outcome.decision ? { decision: outcome.decision } : {}), dropped: outcome.dropped, model, locale: job.reviewLocale, createdAt: nowIso() };
    await putObject(canonAiReviewKey(projectId, job.reviewPrNo, jobId, "result.json"), JSON.stringify(result, null, 2) + "\n");
    await updateJob(projectId, jobId, { ...usage, status: "COMPLETED", endedAt: nowIso() });
    console.log(`[worker] canon review written (${outcome.review.flags.length} flags, ${outcome.dropped} dropped)`);
  } finally {
    clearInterval(heartbeat);
  }
}
