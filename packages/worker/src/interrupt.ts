import type { JobStatus } from "@cobrac/shared";

/** How often the workspace and thread go to S3 while a turn runs, so an interruption loses at most this much work. */
export const PERIODIC_PERSIST_MS = 5 * 60_000;

/** Runs `fn` one call at a time; a call made while one is running waits for it, then runs. A failure does not block later calls. */
export function serialized(fn: () => Promise<void>): () => Promise<void> {
  let last: Promise<void> = Promise.resolve();
  return () => {
    const run = last.then(fn, fn);
    last = run.catch(() => undefined);
    return run;
  };
}

export interface StopDeps {
  /** Current status of the job in the table (null: not found) */
  jobStatus(): Promise<JobStatus | null>;
  /** Whether the workspace was restored or created (nothing to save before that) */
  workspaceReady(): boolean;
  notify(): Promise<void>;
  persist(): Promise<void>;
  /** Make the job look stalled to the janitor, so its next run retries the job instead of waiting for the heartbeat to age */
  markStale(): Promise<void>;
}

export type StopOutcome = "retry" | "saved" | "nothing";

/**
 * What the worker does on SIGTERM (Fargate Spot interruption, scale-in, or the StopTask of a cancel): ECS kills the
 * container after the task's stop timeout, so save the work of the running turn and hand the job to the janitor.
 * A cancelled job is only saved; a job that already ended is left alone.
 */
export async function handleStop(d: StopDeps): Promise<StopOutcome> {
  const status = await d.jobStatus();
  const running = status === "RUNNING" || status === "FINALIZING";
  if (!running && status !== "CANCELLED") return "nothing";
  try {
    if (d.workspaceReady()) {
      if (running) await d.notify();
      await d.persist();
    }
  } finally {
    if (running) await d.markStale();
  }
  return running ? "retry" : "saved";
}
