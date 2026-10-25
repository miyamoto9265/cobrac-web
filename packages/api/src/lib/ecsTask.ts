import { DescribeTasksCommand, ECSClient } from "@aws-sdk/client-ecs";
import { env } from "../env.js";

const ecs = new ECSClient({ region: env.region });

export interface StoppedTask {
  /** The task's stop reason, e.g. "Your Spot Task was interrupted." */
  stoppedReason: string | null;
  /** The worker container's reason, e.g. "OutOfMemoryError: Container killed due to memory usage" */
  containerReason: string | null;
  exitCode: number | null;
}

/** Why a worker task stopped, while ECS still lists it (about an hour); null when unknown. */
export async function describeStoppedTask(taskArn: string | null | undefined): Promise<StoppedTask | null> {
  if (!env.ecs.clusterArn || !taskArn) return null;
  try {
    const r = await ecs.send(new DescribeTasksCommand({ cluster: env.ecs.clusterArn, tasks: [taskArn] }));
    const t = r.tasks?.[0];
    if (!t) return null;
    const c = t.containers?.find((x) => x.name === env.ecs.containerName) ?? t.containers?.[0];
    return { stoppedReason: t.stoppedReason ?? null, containerReason: c?.reason ?? null, exitCode: c?.exitCode ?? null };
  } catch (e) {
    console.warn("describeTasks failed", e);
    return null;
  }
}

export function isOutOfMemory(t: StoppedTask | null): boolean {
  return !!t && /OutOfMemory/i.test(`${t.containerReason ?? ""} ${t.stoppedReason ?? ""}`);
}
