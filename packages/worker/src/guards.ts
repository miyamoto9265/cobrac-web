/**
 * Guards against a run that cannot finish: a thread too large to resume (its rollout is read whole when Codex resumes
 * it, and a few hundred MB kill the worker task before its first heartbeat), and a turn that goes on for hours without
 * changing a file (the agent re-reads the same files after each context compaction and never writes).
 */

/** Above this many bytes of saved thread state, a run continues on a new thread from the workspace files. */
export const THREAD_RESUME_MAX_BYTES = 128 * 1024 * 1024;

/** A turn that changes no workspace file for this long is stopped (see `NO_PROGRESS_MESSAGE`). */
export const NO_PROGRESS_MS = 2 * 60 * 60 * 1000;

export const THREAD_TOO_LARGE_MESSAGE = "The previous thread grew too large to resume; continuing on a new thread from the saved files.";
export const NO_PROGRESS_MESSAGE = "No files changed for 2 hours, so the run was stopped to avoid a loop. Retry to continue.";

export function threadBytes(objects: { size: number }[]): number {
  return objects.reduce((n, o) => n + o.size, 0);
}

/** Logs the agent appends to on every tool call; writing them is not progress. */
function isLog(rel: string): boolean {
  return rel.endsWith(".jsonl");
}

/** Path, size and modification time of each workspace file but the logs, in a stable order. */
export function workspaceFingerprint(files: { rel: string; size: number; mtimeMs: number }[]): string {
  return files
    .filter((f) => !isLog(f.rel))
    .map((f) => `${f.rel}\t${f.size}\t${Math.trunc(f.mtimeMs)}`)
    .sort()
    .join("\n");
}

/** How long the workspace has gone unchanged; the first observation starts the clock. */
export class ProgressWatch {
  private last: string | null = null;
  private since = 0;

  observe(fingerprint: string, now: number): number {
    if (fingerprint !== this.last) {
      this.last = fingerprint;
      this.since = now;
    }
    return now - this.since;
  }
}
