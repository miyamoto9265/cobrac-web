/**
 * SQS consumer: starts one Fargate task per queued job while enforcing concurrency limits.
 * When limits are hit (or Spot capacity is unavailable) the message is re-enqueued with a delay.
 */
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import type { SQSEvent, SQSBatchResponse } from "aws-lambda";
import type { RunJobMessage } from "@cobrac/shared";
import { nowIso } from "@cobrac/shared";
import { env } from "../env.js";
import { enqueueRun } from "../lib/aws.js";
import { getJob, listJobsByStatus, putMessage, updateJob, updateProject } from "../lib/db.js";

const ecs = new ECSClient({ region: env.region });
const RETRY_DELAY_SECONDS = 60;

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body) as RunJobMessage;
      await dispatch(msg);
    } catch (e) {
      console.error("dispatch failed", e);
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}

async function dispatch(msg: RunJobMessage) {
  const job = await getJob(msg.projectId, msg.jobId);
  if (!job) {
    console.warn("job not found, dropping", msg);
    return;
  }
  if (job.status !== "QUEUED") {
    console.log(`job ${job.jobId} is ${job.status}; dropping message`);
    return;
  }

  // Concurrency check ---------------------------------------------------------
  const active = [...(await listJobsByStatus("RUNNING")), ...(await listJobsByStatus("FINALIZING"))];
  const mine = active.filter((j) => j.userId === msg.userId);
  if (active.length >= env.maxConcurrentJobs || mine.length >= env.maxConcurrentJobsPerUser) {
    console.log(`concurrency limit reached (all=${active.length}, user=${mine.length}); re-enqueue`);
    await enqueueRun(msg, RETRY_DELAY_SECONDS);
    return;
  }

  // Start Fargate task --------------------------------------------------------
  const overrides = {
    containerOverrides: [
      {
        name: env.ecs.containerName,
        environment: [
          { name: "JOB_USER_ID", value: msg.userId },
          { name: "JOB_PROJECT_ID", value: msg.projectId },
          { name: "JOB_ID", value: msg.jobId },
          { name: "JOB_MODE", value: msg.mode },
        ],
      },
    ],
  };

  const runTask = async (spot: boolean) => {
    const r = await ecs.send(
      new RunTaskCommand({
        cluster: env.ecs.clusterArn,
        taskDefinition: env.ecs.taskDefinitionArn,
        count: 1,
        ...(spot ? { capacityProviderStrategy: [{ capacityProvider: "FARGATE_SPOT", weight: 1 }] } : { launchType: "FARGATE" as const }),
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: env.ecs.subnets,
            securityGroups: env.ecs.securityGroup ? [env.ecs.securityGroup] : undefined,
            assignPublicIp: "ENABLED",
          },
        },
        overrides,
        startedBy: `cobrac-${msg.jobId}`.slice(0, 36),
        tags: [
          { key: "cobrac:projectId", value: msg.projectId },
          { key: "cobrac:jobId", value: msg.jobId },
        ],
      }),
    );
    const failure = r.failures?.[0];
    if (!r.tasks?.length) throw new Error(`runTask returned no task: ${failure?.reason ?? "unknown"} ${failure?.detail ?? ""}`);
    return r.tasks[0].taskArn ?? null;
  };

  try {
    let taskArn: string | null;
    let launch = env.ecs.useSpot ? "Fargate Spot" : "Fargate";
    try {
      taskArn = await runTask(env.ecs.useSpot);
    } catch (e) {
      if (!env.ecs.useSpot) throw e;
      // Spot capacity unavailable → fall back to on-demand so the job still runs
      console.warn("Spot runTask failed, falling back to on-demand:", e instanceof Error ? e.message : e);
      taskArn = await runTask(false);
      launch = "Fargate (On-Demand fallback)";
    }
    await updateJob(msg.projectId, msg.jobId, { ecsTaskArn: taskArn, lastHeartbeat: nowIso() });
    await putMessage(msg.projectId, msg.jobId, "system", "status", `Worker started (${launch}).`, { userId: msg.userId, meta: { i18n: "sys.workerStarted", taskArn, launch } });
    // mark project RUNNING so the UI reflects progress even before the worker boots
    await updateProject(msg.userId, msg.projectId, { status: "RUNNING" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("runTask failed; re-enqueue", message);
    const reason = message.slice(0, 200);
    await putMessage(msg.projectId, msg.jobId, "system", "status", `Retrying the worker start (${reason}).`, { userId: msg.userId, meta: { i18n: "sys.workerStartRetry", reason } });
    await enqueueRun(msg, RETRY_DELAY_SECONDS);
  }
}
