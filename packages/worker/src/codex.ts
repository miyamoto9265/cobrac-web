import { Codex, type Input, type McpToolCallItem, type ModelReasoningEffort, type RunResult, type RunStreamedResult, type ThreadEvent, type ThreadItem, type TurnOptions } from "@openai/codex-sdk";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { MessageType, TokenUsage } from "@cobrac/shared";
import { DEFAULT_CLAUDE_MODEL, DEFAULT_CODEX_MODEL, LIT_MCP_SERVER, LIT_TOOLS, QUESTION_REGEX, TURN_OUTPUT_SCHEMA, isClaudeModel, parseTurnOutput } from "@cobrac/shared";
import { childEnv } from "./childEnv.js";
import { ClaudeEngine } from "./claude.js";
import { env } from "./env.js";
import { RCS_TOKEN_ENV, rcsCodexConfig, type RcsConnection } from "./rcs.js";

export interface TurnResult {
  threadId: string | null;
  finalMessage: string;
  question: string | null;
  failed: boolean;
  errorMessage: string | null;
  /** Tokens of this turn alone (Codex reports the thread's running total; see `turnUsage`) */
  usage: TurnUsage;
}

export interface TurnUsage {
  input: number;
  cachedInput: number;
  output: number;
  reasoningOutput: number;
  /** Input written to the prompt cache (Claude models; part of `input`). Absent = 0 */
  cacheWrite?: number;
}

/** A conversation of either provider: a Codex thread, or a Claude thread that streams the same events. */
export interface AgentThread {
  readonly id: string | null;
  run(input: Input, turnOptions?: TurnOptions): Promise<RunResult>;
  runStreamed(input: Input, turnOptions?: TurnOptions): Promise<RunStreamedResult>;
}

/** The SDK a model runs on: Codex for the OpenAI models, the Claude Agent SDK for the Claude models. */
export type AgentEngine = Codex | ClaudeEngine;

const NO_USAGE: TurnUsage = { input: 0, cachedInput: 0, output: 0, reasoningOutput: 0 };

/**
 * The thread's running token total as Codex last wrote it to the session file (`<codexHome>/sessions/…/rollout-…-<id>.jsonl`,
 * the last `token_count` event); null when there is no such file or event. Codex keeps this total across resumed runs.
 */
export function sessionTotalUsage(threadId: string, codexHome: string = env.codexHome): TurnUsage | null {
  const file = findSessionFile(join(codexHome, "sessions"), threadId);
  if (!file) return null;
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"token_count"')) continue;
    try {
      const t = (JSON.parse(lines[i]) as { payload?: { type?: string; info?: { total_token_usage?: Record<string, number> } | null } }).payload;
      const u = t?.type === "token_count" ? t.info?.total_token_usage : undefined;
      if (u) return withCacheWrite({ input: u.input_tokens ?? 0, cachedInput: u.cached_input_tokens ?? 0, output: u.output_tokens ?? 0, reasoningOutput: u.reasoning_output_tokens ?? 0 }, u.cache_write_input_tokens);
    } catch {
      // a line still being written
    }
  }
  return null;
}

function findSessionFile(dir: string, threadId: string): string | null {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      const found = findSessionFile(path, threadId);
      if (found) return found;
    } else if (e.name.endsWith(`${threadId}.jsonl`)) return path;
  }
  return null;
}

/** `u` with `cacheWrite` when there were cache writes (OpenAI usage keeps its four fields). */
function withCacheWrite(u: TurnUsage, cacheWrite: number | null | undefined): TurnUsage {
  return cacheWrite ? { ...u, cacheWrite } : u;
}

/** Usage of one turn: the running total after it minus the total before it (never below 0). */
export function turnUsage(after: TurnUsage | null, before: TurnUsage | null): TurnUsage {
  if (!after) return { ...NO_USAGE };
  const b = before ?? NO_USAGE;
  const d = (k: keyof TurnUsage) => Math.max(0, (after[k] ?? 0) - (b[k] ?? 0));
  return withCacheWrite({ input: d("input"), cachedInput: d("cachedInput"), output: d("output"), reasoningOutput: d("reasoningOutput") }, d("cacheWrite"));
}

/** A turn's usage as the job's `TokenUsage`. */
export function tokenUsageOf(u: TurnUsage): TokenUsage {
  return { inputTokens: u.input, cachedInputTokens: u.cachedInput, outputTokens: u.output, reasoningOutputTokens: u.reasoningOutput, ...(u.cacheWrite ? { cacheWriteTokens: u.cacheWrite } : {}) };
}

/** Codex usage of a turn or thread total as `TurnUsage`. */
export function fromCodexUsage(u: { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_output_tokens: number; cache_write_input_tokens?: number }): TurnUsage {
  return withCacheWrite({ input: u.input_tokens, cachedInput: u.cached_input_tokens, output: u.output_tokens, reasoningOutput: u.reasoning_output_tokens }, u.cache_write_input_tokens);
}

export interface TurnSink {
  onMessage(type: MessageType, content: string, meta?: Record<string, unknown>): Promise<void>;
  onFileChange(paths: string[]): Promise<void>;
  onHeartbeat(): Promise<void>;
  onMcpCall?(item: McpToolCallItem): Promise<void>;
}

/** Codex config of the `lit` stdio MCP server (research mode): litMcp.js next to this file, run by this Node binary. */
export function litCodexConfig(mailto?: string) {
  return {
    [LIT_MCP_SERVER]: {
      command: process.execPath,
      args: [fileURLToPath(new URL("./litMcp.js", import.meta.url))],
      ...(mailto ? { env: { LIT_MAILTO: mailto } } : {}),
      enabled_tools: [...LIT_TOOLS],
      startup_timeout_sec: 20,
      tool_timeout_sec: 90,
    },
  };
}

/**
 * Context window Codex works with, also for a model missing from its catalog. OpenAI lists 1,050,000 tokens for the
 * gpt-5.6 / gpt-6 models, but input above 272K is billed at 2x; Codex's own catalog uses 272,000 for all of them.
 */
export const CODEX_CONTEXT_WINDOW = 272_000;

/** API aliases missing from Codex's model catalog, mapped to the model OpenAI routes them to. */
export const CODEX_MODEL_ALIASES: Readonly<Record<string, string>> = { "gpt-5.6": "gpt-5.6-sol" };

export function codexModelSlug(model: string): string {
  return CODEX_MODEL_ALIASES[model] ?? model;
}

/**
 * The engine of `model`: Claude models run on the Claude Agent SDK (with `apiKey` as the Anthropic key), every other
 * model on Codex. `rcs` and `opts.lit` give the agent the RCS and literature MCP tools.
 */
export function createEngine(model: string | null, apiKey: string, rcs: RcsConnection | null = null, opts: { lit?: boolean } = {}): AgentEngine {
  if (!isClaudeModel(model)) return createCodex(apiKey, rcs, opts);
  return new ClaudeEngine({
    apiKey,
    models: [...new Set([model!, DEFAULT_CLAUDE_MODEL])],
    rcs,
    lit: !!opts.lit,
    configDir: join(env.codexHome, "sessions", "claude"),
    usageDir: join(env.codexHome, "sessions", "claude-usage"),
    autoCompactWindow: env.claudeAutoCompactWindow,
    crossrefMailto: env.crossrefMailto,
  });
}

/**
 * `config` is merged over the worker's Codex config; only the worker image check uses it (to point Codex at a mock
 * model server).
 */
export function createCodex(apiKey: string, rcs: RcsConnection | null = null, opts: { lit?: boolean; config?: Record<string, unknown> } = {}): Codex {
  const mcpServers = { ...(rcs ? rcsCodexConfig(rcs).mcp_servers : {}), ...(opts.lit ? litCodexConfig(env.crossrefMailto) : {}) };
  return new Codex({
    apiKey,
    env: childEnv({
      CODEX_HOME: env.codexHome,
      // Codex itself sends it as the MCP bearer token; shell_environment_policy keeps it out of agent commands
      ...(rcs ? { [RCS_TOKEN_ENV]: rcs.token } : {}),
    }),
    config: {
      show_raw_agent_reasoning: false,
      model_context_window: CODEX_CONTEXT_WINDOW,
      // compact the conversation before one request outgrows the organisation's tokens-per-minute limit, which is
      // below the context window
      model_auto_compact_token_limit: env.codexAutoCompactTokens,
      // the OpenAI key may be the default API key, so agent commands never see it either
      shell_environment_policy: { exclude: [RCS_TOKEN_ENV, "CODEX_API_KEY", "OPENAI_API_KEY"] },
      ...(Object.keys(mcpServers).length ? { mcp_servers: mcpServers } : {}),
      ...opts.config,
    },
  });
}

export interface ModelSettings {
  model: string | null;
  reasoningEffort: ModelReasoningEffort | null;
}

/** Project-level settings win; then deployment env defaults; then DEFAULT_CODEX_MODEL so cost can always be attributed. */
export function resolveModelSettings(project: { model?: string | null; reasoningEffort?: string | null }): ModelSettings {
  const model = project.model || env.codexModel || DEFAULT_CODEX_MODEL;
  const effort = (project.reasoningEffort || env.codexReasoningEffort || null) as ModelReasoningEffort | null;
  return { model, reasoningEffort: effort };
}

export function openThread(engine: AgentEngine, threadId: string | null, settings: ModelSettings, opts: { webSearch?: boolean } = {}): AgentThread {
  const webSearch = opts.webSearch ?? true;
  if (engine instanceof ClaudeEngine) {
    const o = { workingDirectory: env.workDir, model: settings.model, reasoningEffort: settings.reasoningEffort, webSearch };
    return threadId ? engine.resumeThread(threadId, o) : engine.startThread(o);
  }
  const codex = engine;
  const options = {
    workingDirectory: env.workDir,
    skipGitRepoCheck: true,
    // The Fargate task itself is the sandbox; Landlock/seccomp are unavailable inside the container.
    sandboxMode: "danger-full-access" as const,
    approvalPolicy: "never" as const,
    networkAccessEnabled: true,
    webSearchEnabled: webSearch,
    webSearchMode: webSearch ? ("live" as const) : ("disabled" as const),
    ...(settings.model ? { model: codexModelSlug(settings.model) } : {}),
    ...(settings.reasoningEffort ? { modelReasoningEffort: settings.reasoningEffort } : {}),
  };
  return threadId ? codex.resumeThread(threadId, options) : codex.startThread(options);
}

/**
 * Codex retries a rate-limited request itself ("Reconnecting... n/5"). A turn that still fails on a rate limit is
 * resumed on the same thread after a pause, up to this many times, instead of failing the job.
 */
export const RATE_LIMIT_TURN_RETRIES = 3;
const RATE_LIMIT_MIN_WAIT_MS = 30_000;
const RATE_LIMIT_MAX_WAIT_MS = 180_000;
const HEARTBEAT_MS = 45_000;
const RATE_LIMIT_RESUME_PROMPT =
  "The previous turn stopped on a temporary rate limit before it finished. Continue the same task from where it stopped (check the files you already wrote instead of redoing them), then end the turn as instructed.";

/**
 * Rate limits (TPM / RPM, HTTP 429) and Anthropic's overload (HTTP 529) pass with time; an exhausted quota, a billing
 * problem or a too large request does not.
 */
export function isRateLimitError(message: string | null): boolean {
  if (!message || /quota|billing|credit balance/i.test(message) || isRequestTooLarge(message)) return false;
  return /rate.?limit|too many requests|\b429\b|tokens per min|requests per min|overloaded|\b529\b/i.test(message);
}

/** One request is larger than the tokens-per-minute limit: waiting never helps, only a smaller conversation does. */
export function isRequestTooLarge(message: string | null): boolean {
  return !!message && /request too large|input or output tokens must be reduced|context_length_exceeded|maximum context length|prompt is too long/i.test(message);
}

/** Pause before resuming a rate-limited turn: the server's "try again in …" hint or exponential backoff, whichever is longer. */
export function rateLimitWaitMs(message: string, attempt: number): number {
  const m = /try again in\s*([\d.]+)\s*(ms|s|m)\b/i.exec(message);
  const hinted = m ? Number(m[1]) * (m[2] === "ms" ? 1 : m[2] === "m" ? 60_000 : 1000) : 0;
  return Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.max(Math.ceil(hinted) + 5_000, RATE_LIMIT_MIN_WAIT_MS * 2 ** attempt));
}

/**
 * The usage of the turn that is running, for a turn that never returns: cut off by a cancel or the research time budget,
 * a `codex exec` that dies without a failed turn, a SIGTERM, or the run-time limit. Whichever of those paths comes first
 * takes it, so the turn is counted once.
 */
export class InFlightTurn {
  private measure: (() => TurnUsage) | null = null;

  start(measure: () => TurnUsage): void {
    this.measure = measure;
  }

  end(): void {
    this.measure = null;
  }

  /** The running turn's usage so far, read from the session file; null when no turn is running or it was taken already. */
  take(): TurnUsage | null {
    const m = this.measure;
    this.measure = null;
    return m ? m() : null;
  }
}

export interface RunTurnOptions {
  /** Pause between rate-limit retries (tests); rejects when the signal aborts */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** The thread's running token total so far (tests); default: `sessionTotalUsage` */
  threadTotal?: (threadId: string) => TurnUsage | null;
  /** Registered while the turn runs; cleared when `runTurn` returns (it then reports the usage itself) */
  inFlight?: InFlightTurn;
}

/** Stream state of one Codex run; `error` events alone do not fail a turn that completes. */
interface TurnState {
  completed: boolean;
  /** Running total of the thread reported with `turn.completed` */
  total: TurnUsage | null;
  failedMessage: string | null;
  lastError: string | null;
}

/**
 * Run one turn, streaming items to the sink; turns that fail on a rate limit are resumed after a pause.
 * `turn.completed` carries the thread's running total (also after a resume in a new process), so the turn's own usage
 * is that total minus the total before the turn. A turn that never completes is measured from the session file; one
 * that throws (cancel, time budget, crash) leaves that measurement in `o.inFlight` for the caller to count.
 */
export async function runTurn(thread: AgentThread, prompt: Input, sink: TurnSink, signal?: AbortSignal, o: RunTurnOptions = {}): Promise<TurnResult> {
  const result: TurnResult = {
    threadId: thread.id ?? null,
    finalMessage: "",
    question: null,
    failed: false,
    errorMessage: null,
    usage: { ...NO_USAGE },
  };
  const sleep = o.sleep ?? ((ms: number, s?: AbortSignal) => delay(ms, undefined, s ? { signal: s } : {}));
  const threadTotal = o.threadTotal ?? ((id: string) => sessionTotalUsage(id));
  const before = thread.id ? threadTotal(thread.id) : null;
  if (thread.id && !before) console.warn(`[worker] no token total found for thread ${thread.id}; this turn's usage may include earlier turns`);
  let after: TurnUsage | null = null;
  o.inFlight?.start(() => {
    const id = thread.id ?? result.threadId;
    return id ? turnUsage(threadTotal(id), before) : { ...NO_USAGE };
  });

  let input = prompt;
  for (let attempt = 0; ; attempt++) {
    const state: TurnState = { completed: false, total: null, failedMessage: null, lastError: null };
    const { events } = await thread.runStreamed(input, { outputSchema: TURN_OUTPUT_SCHEMA, ...(signal ? { signal } : {}) });
    let lastHeartbeat = Date.now();
    try {
      for await (const ev of events) {
        if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
          lastHeartbeat = Date.now();
          await sink.onHeartbeat();
        }
        await handleEvent(ev, result, state, sink);
      }
    } catch (e) {
      // codex exec exits with code 1 after a failed turn; the turn's own error says why
      if (!state.failedMessage || signal?.aborted) throw e;
    }
    result.threadId = thread.id ?? result.threadId;
    if (state.total) after = state.total;
    const error = state.failedMessage ?? (state.completed ? null : state.lastError);
    result.failed = error !== null;
    result.errorMessage = error;
    if (!error || !isRateLimitError(error) || attempt >= RATE_LIMIT_TURN_RETRIES) break;

    const wait = rateLimitWaitMs(error, attempt);
    console.warn(`[worker] turn hit a rate limit; resuming in ${Math.round(wait / 1000)} s (${attempt + 1}/${RATE_LIMIT_TURN_RETRIES})`);
    await sink.onMessage("status", `Rate limit: resuming the turn in ${Math.round(wait / 1000)} s (retry ${attempt + 1}/${RATE_LIMIT_TURN_RETRIES}).`, { kind: "rateLimitRetry", waitMs: wait });
    for (let left = wait; left > 0; left -= HEARTBEAT_MS) {
      await sink.onHeartbeat();
      await sleep(Math.min(left, HEARTBEAT_MS), signal);
    }
    input = RATE_LIMIT_RESUME_PROMPT;
    result.finalMessage = "";
  }

  o.inFlight?.end();
  if (!after && result.threadId) after = threadTotal(result.threadId);
  result.usage = turnUsage(after, before);

  const structured = parseTurnOutput(result.finalMessage);
  if (structured) result.question = structured.status === "question" ? (structured.question ?? structured.message) : null;
  else result.question = QUESTION_REGEX.exec(result.finalMessage)?.[1].trim() ?? null;
  return result;
}

async function handleEvent(ev: ThreadEvent, result: TurnResult, state: TurnState, sink: TurnSink) {
  switch (ev.type) {
    case "thread.started":
      result.threadId = ev.thread_id;
      return;
    case "turn.started":
      return;
    case "turn.completed":
      state.completed = true;
      state.total = fromCodexUsage(ev.usage);
      return;
    case "turn.failed":
      state.failedMessage = ev.error.message;
      await sink.onMessage("error", `Turn failed: ${ev.error.message}`);
      return;
    case "error":
      // codex exec also reports stream retries here ("Reconnecting... 2/5 (rate limit exceeded …)"), after which the turn goes on
      state.lastError = ev.message;
      if (/^Reconnecting\b/i.test(ev.message)) await sink.onMessage("status", ev.message, { kind: "reconnecting" });
      else await sink.onMessage("error", `Error: ${ev.message}`);
      return;
    case "item.completed":
      await handleItem(ev.item, result, sink);
      return;
    case "item.started":
      if (ev.item.type === "command_execution") {
        await sink.onMessage("command", `$ ${ev.item.command}`, { status: "started", itemId: ev.item.id });
      }
      return;
    case "item.updated":
      return;
  }
}

async function handleItem(item: ThreadItem, result: TurnResult, sink: TurnSink) {
  switch (item.type) {
    case "agent_message": {
      result.finalMessage = item.text;
      const structured = parseTurnOutput(item.text);
      if (structured?.status === "question") {
        await sink.onMessage("question", structured.question ?? structured.message);
      } else if (structured) {
        if (structured.message.trim()) await sink.onMessage("agent_message", structured.message);
      } else {
        await sink.onMessage(QUESTION_REGEX.test(item.text) ? "question" : "agent_message", item.text);
      }
      return;
    }
    case "reasoning":
      if (item.text.trim()) await sink.onMessage("reasoning", item.text);
      return;
    case "command_execution": {
      const out = item.aggregated_output ?? "";
      const trimmed = out.length > 4000 ? out.slice(0, 2000) + "\n…\n" + out.slice(-2000) : out;
      await sink.onMessage("command", `$ ${item.command}\n${trimmed}`.trimEnd(), {
        status: item.status,
        exitCode: item.exit_code,
        itemId: item.id,
      });
      return;
    }
    case "file_change": {
      const paths = item.changes.map((c) => `${c.kind}: ${c.path}`);
      await sink.onMessage("file_change", paths.join("\n"), { status: item.status, changes: item.changes });
      await sink.onFileChange(item.changes.map((c) => c.path));
      return;
    }
    case "web_search":
      await sink.onMessage("web_search", item.query);
      return;
    case "todo_list":
      await sink.onMessage(
        "todo",
        item.items.map((t) => `${t.completed ? "[x]" : "[ ]"} ${t.text}`).join("\n"),
      );
      return;
    case "mcp_tool_call": {
      const query = (item.arguments as { query?: unknown; homba_id?: unknown } | null) ?? {};
      const what = typeof query.query === "string" ? ` "${query.query}"` : typeof query.homba_id === "string" ? ` ${query.homba_id}` : "";
      await sink.onMessage("command", `MCP ${item.server}.${item.tool}${what} (${item.status})${item.error ? `: ${item.error.message}` : ""}`);
      await sink.onMcpCall?.(item);
      return;
    }
    case "error":
      // non-fatal: Codex warnings such as "Model metadata for `x` not found"; turn failures arrive as `turn.failed` / `error` events
      await sink.onMessage("status", item.message, { kind: "codexWarning" });
      return;
  }
}
