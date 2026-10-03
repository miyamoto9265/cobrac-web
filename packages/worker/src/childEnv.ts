import { RCS_TOKEN_ENV } from "./rcs.js";

/**
 * Variables only the worker process itself may hold. With the task role's credentials anyone can decrypt every
 * user's API key, so no child process (Codex, the agent's commands, Python, poppler) gets them.
 */
export const WORKER_ONLY_ENV: readonly string[] = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "NCBI_API_KEY",
  RCS_TOKEN_ENV,
];

/** The worker's environment without WORKER_ONLY_ENV, plus `extra`, for spawning a child process. */
export function childEnv(extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) if (v !== undefined && !WORKER_ONLY_ENV.includes(k)) out[k] = v;
  return { ...out, ...extra };
}
