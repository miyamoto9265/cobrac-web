import { query, type EffortLevel, type McpServerConfig, type Options, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Input, McpToolCallItem, RunResult, RunStreamedResult, ThreadEvent, ThreadItem, TurnOptions, Usage } from "@openai/codex-sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReasoningEffort } from "@cobrac/shared";
import { DEFAULT_CLAUDE_MODEL, LIT_MCP_SERVER } from "@cobrac/shared";
import { childEnv } from "./childEnv.js";
import { type ClaudeGateway, startClaudeGateway } from "./claudeGateway.js";
import { RCS_TOOLS, type RcsConnection } from "./rcs.js";

// ---------------------------------------------------------------------------
// Claude models on the Claude Agent SDK, behind the same thread interface as Codex: a `ClaudeThread` takes the same
// input and turn options as a Codex thread and streams the same events (thread / turn / item events with Codex's item
// types), so the runs, their messages and their usage accounting do not depend on the provider. The token totals go
// to a Codex-style session file (see `sessionTotalUsage`), so a turn cut off by a cancel or a SIGTERM is billed too.
// ---------------------------------------------------------------------------

/** IDs of Claude threads (`claude-<Claude Code session id>`), so a project's thread tells which provider it belongs to. */
export const CLAUDE_THREAD_PREFIX = "claude-";

export const isClaudeThreadId = (id: string | null | undefined): boolean => !!id && id.startsWith(CLAUDE_THREAD_PREFIX);

/** Codex's reasoning efforts on Claude's effort levels. */
export function claudeEffort(effort: ReasoningEffort | string | null | undefined): EffortLevel | undefined {
  switch (effort) {
    case null:
    case undefined:
      return undefined;
    case "minimal":
    case "low":
      return "low";
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return effort;
    default:
      // "ultra" / "persistent": Codex's levels above max
      return "max";
  }
}

/** Built-in Claude Code tools of a run (no subagents, no interactive tools); web search adds WebSearch and WebFetch. */
export const CLAUDE_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "TodoWrite"] as const;

export interface ClaudeEngineOptions {
  apiKey: string;
  /** Models the run may call (the gateway refuses the others) */
  models: readonly string[];
  rcs: RcsConnection | null;
  lit: boolean;
  /** Where Claude Code keeps its sessions (persisted with the Codex sessions) */
  configDir: string;
  /** Directory of the usage files (`sessionTotalUsage` reads them) */
  usageDir: string;
  /** Context size at which Claude Code compacts the conversation */
  autoCompactWindow: number;
  crossrefMailto?: string;
  /** Anthropic API origin (tests) */
  upstream?: string;
  /** Claude Code executable (tests); default: the SDK's own */
  executable?: string;
  /** The SDK's `query` (tests replace it with a scripted message stream) */
  query?: typeof query;
}

export interface ClaudeThreadOptions {
  workingDirectory: string;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  webSearch: boolean;
}

export class ClaudeEngine {
  private gateway: Promise<ClaudeGateway> | null = null;

  constructor(readonly options: ClaudeEngineOptions) {}

  startThread(o: ClaudeThreadOptions): ClaudeThread {
    return new ClaudeThread(this, null, o);
  }

  resumeThread(id: string, o: ClaudeThreadOptions): ClaudeThread {
    return new ClaudeThread(this, id, o);
  }

  /** Started on the first turn and shared by the engine's threads */
  gatewayOf(): Promise<ClaudeGateway> {
    this.gateway ??= startClaudeGateway({ apiKey: this.options.apiKey, models: this.options.models, rcs: this.options.rcs, upstream: this.options.upstream });
    return this.gateway;
  }

  async close(): Promise<void> {
    if (this.gateway) await (await this.gateway).close();
    this.gateway = null;
  }

  mcpServers(gw: ClaudeGateway): Record<string, McpServerConfig> {
    const o = this.options;
    const servers: Record<string, McpServerConfig> = {};
    if (o.rcs && gw.rcsUrl) {
      servers.rcs = { type: "http", url: gw.rcsUrl, headers: { Authorization: `Bearer ${gw.token}` }, tools: RCS_TOOLS.map((name) => ({ name })), timeout: 60_000, alwaysLoad: true };
    }
    if (o.lit) {
      servers[LIT_MCP_SERVER] = {
        type: "stdio",
        command: process.execPath,
        args: [fileURLToPath(new URL("./litMcp.js", import.meta.url))],
        env: childEnv(o.crossrefMailto ? { LIT_MAILTO: o.crossrefMailto } : {}),
        timeout: 90_000,
        alwaysLoad: true,
      };
    }
    return servers;
  }

  env(gw: ClaudeGateway): Record<string, string> {
    // Claude Code settings inherited from the worker's environment (none in the image) would override the run's own
    const inherited = Object.fromEntries(Object.entries(childEnv()).filter(([k]) => !/^(?:CLAUDE|ANTHROPIC)/.test(k)));
    return childEnv({
      ANTHROPIC_BASE_URL: gw.anthropicBaseUrl,
      // the per-run token of the gateway, not the key: the agent's commands inherit this environment
      ANTHROPIC_API_KEY: gw.token,
      CLAUDE_CONFIG_DIR: this.options.configDir,
      // Claude Code's small background requests use the cheapest model, which the gateway lets every run call
      ANTHROPIC_DEFAULT_HAIKU_MODEL: DEFAULT_CLAUDE_MODEL,
      ANTHROPIC_SMALL_FAST_MODEL: DEFAULT_CLAUDE_MODEL,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(this.options.autoCompactWindow),
      // the Fargate task itself is the sandbox (as Codex's danger-full-access): no permission prompts
      IS_SANDBOX: "1",
    }, inherited);
  }
}

interface Tokens {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  /** Includes the thinking tokens */
  output: number;
  thinking: number;
}

const NO_TOKENS: Tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 };

const plus = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
  thinking: a.thinking + b.thinking,
});

/** Codex usage (input includes the cache reads and writes) from Anthropic token counts. */
export function toCodexUsage(t: Tokens): Usage {
  return {
    input_tokens: t.input + t.cacheRead + t.cacheWrite,
    cached_input_tokens: t.cacheRead,
    cache_write_input_tokens: t.cacheWrite,
    output_tokens: t.output,
    reasoning_output_tokens: t.thinking,
  };
}

const fromCodexUsage = (u: Usage): Tokens => ({
  input: Math.max(0, u.input_tokens - u.cached_input_tokens - (u.cache_write_input_tokens ?? 0)),
  cacheRead: u.cached_input_tokens,
  cacheWrite: u.cache_write_input_tokens ?? 0,
  output: u.output_tokens,
  thinking: u.reasoning_output_tokens ?? 0,
});

interface ApiUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number | null } | null;
}

const tokensOf = (u: ApiUsage | null | undefined): Tokens => ({
  input: u?.input_tokens ?? 0,
  cacheRead: u?.cache_read_input_tokens ?? 0,
  cacheWrite: u?.cache_creation_input_tokens ?? 0,
  output: u?.output_tokens ?? 0,
  thinking: u?.output_tokens_details?.thinking_tokens ?? 0,
});

const totalOf = (t: Tokens) => t.input + t.cacheRead + t.cacheWrite + t.output;

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  thinking?: string;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

/** The prompt of a turn: a string, or a user message with the local images as base64 blocks. */
async function promptOf(input: Input): Promise<string | AsyncIterable<SDKUserMessage>> {
  if (typeof input === "string") return input;
  const content: Record<string, unknown>[] = [];
  const text = input.filter((i) => i.type === "text").map((i) => (i as { text: string }).text).join("\n\n");
  if (text) content.push({ type: "text", text });
  for (const i of input) {
    if (i.type !== "local_image") continue;
    const media = IMAGE_TYPES[extname(i.path).toLowerCase()];
    if (!media) continue;
    content.push({ type: "image", source: { type: "base64", media_type: media, data: (await readFile(i.path)).toString("base64") } });
  }
  const message = { type: "user", message: { role: "user", content }, parent_tool_use_id: null } as unknown as SDKUserMessage;
  return (async function* () {
    yield message;
  })();
}

/** Text of a tool result's content (a string or content blocks). */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
    .filter(Boolean)
    .join("\n");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A tool call as one of Codex's items, once its result is known. */
export function toolItem(id: string, name: string, input: unknown, content: unknown, isError: boolean): ThreadItem | null {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const output = resultText(content);
  const status = isError ? "failed" : "completed";
  if (name.startsWith("mcp__")) {
    const rest = name.slice(5);
    const cut = rest.indexOf("__");
    const server = cut < 0 ? rest : rest.slice(0, cut);
    const tool = cut < 0 ? "" : rest.slice(cut + 2);
    const item: McpToolCallItem = {
      id,
      type: "mcp_tool_call",
      server,
      tool,
      arguments: input ?? null,
      result: { content: (Array.isArray(content) ? content : [{ type: "text", text: output }]) as NonNullable<McpToolCallItem["result"]>["content"], structured_content: isError ? null : parseJson(output) },
      status,
    };
    return item;
  }
  switch (name) {
    case "Bash":
      return { id, type: "command_execution", command: str(args.command), aggregated_output: output, exit_code: isError ? 1 : 0, status };
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = str(args.file_path) || str(args.notebook_path);
      return { id, type: "file_change", changes: [{ path, kind: name === "Write" ? "add" : "update" }], status };
    }
    case "TodoWrite": {
      const todos = Array.isArray(args.todos) ? (args.todos as { content?: unknown; status?: unknown }[]) : [];
      return { id, type: "todo_list", items: todos.map((t) => ({ text: str(t.content), completed: t.status === "completed" })) };
    }
    case "WebSearch":
      return { id, type: "web_search", query: str(args.query) };
    case "StructuredOutput":
      return null;
    default: {
      // Read / Glob / Grep / WebFetch: shown as commands, as Codex's own reads are
      const what = str(args.file_path) || str(args.pattern) || str(args.url) || str(args.path) || JSON.stringify(input ?? {}).slice(0, 200);
      return { id, type: "command_execution", command: `${name} ${what}`.trim(), aggregated_output: output, exit_code: isError ? 1 : 0, status };
    }
  }
}

/** One thread on a Claude Code session: each turn is one `query()` that resumes the session. */
export class ClaudeThread {
  private sessionId: string | null;

  constructor(
    private readonly engine: ClaudeEngine,
    id: string | null,
    private readonly o: ClaudeThreadOptions,
  ) {
    this.sessionId = id && isClaudeThreadId(id) ? id.slice(CLAUDE_THREAD_PREFIX.length) : null;
  }

  get id(): string | null {
    return this.sessionId ? CLAUDE_THREAD_PREFIX + this.sessionId : null;
  }

  async run(input: Input, turnOptions: TurnOptions = {}): Promise<RunResult> {
    const { events } = await this.runStreamed(input, turnOptions);
    const items: ThreadItem[] = [];
    let finalResponse = "";
    let usage: Usage | null = null;
    let failure: string | null = null;
    for await (const ev of events) {
      if (ev.type === "item.completed") {
        if (ev.item.type === "agent_message") finalResponse = ev.item.text;
        items.push(ev.item);
      } else if (ev.type === "turn.completed") usage = ev.usage;
      else if (ev.type === "turn.failed") {
        failure = ev.error.message;
        break;
      }
    }
    if (failure !== null) throw new Error(failure);
    return { items, finalResponse, usage };
  }

  async runStreamed(input: Input, turnOptions: TurnOptions = {}): Promise<RunStreamedResult> {
    return { events: this.events(input, turnOptions) };
  }

  /** The thread's running total as last written to its usage file. */
  private storedTotal(): Tokens {
    const file = this.usageFile();
    return file ? (readUsageTotal(file) ?? NO_TOKENS) : NO_TOKENS;
  }

  private usageFile(): string | null {
    return this.id ? join(this.engine.options.usageDir, `rollout-${this.id}.jsonl`) : null;
  }

  private writeTotal(total: Tokens) {
    const file = this.usageFile();
    if (!file) return;
    mkdirSync(this.engine.options.usageDir, { recursive: true });
    const line = { timestamp: new Date().toISOString(), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: toCodexUsage(total) } } };
    appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
  }

  private async *events(input: Input, turnOptions: TurnOptions): AsyncGenerator<ThreadEvent> {
    const engine = this.engine;
    const gw = await engine.gatewayOf();
    const abort = new AbortController();
    const signal = turnOptions.signal;
    const onAbort = () => abort.abort(signal?.reason);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });

    const agentsFile = join(this.o.workingDirectory, "AGENTS.md");
    const agents = existsSync(agentsFile) ? await readFile(agentsFile, "utf8") : "";
    const resumed = this.sessionId !== null;
    const options: Options = {
      cwd: this.o.workingDirectory,
      ...(this.o.model ? { model: this.o.model } : {}),
      ...(claudeEffort(this.o.reasoningEffort) ? { effort: claudeEffort(this.o.reasoningEffort) } : {}),
      ...(resumed ? { resume: this.sessionId! } : {}),
      abortController: abort,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: [...CLAUDE_TOOLS, ...(this.o.webSearch ? ["WebSearch", "WebFetch"] : [])],
      mcpServers: engine.mcpServers(gw),
      strictMcpConfig: true,
      // no user / project settings: the harness rules (AGENTS.md) are appended to the system prompt instead
      settingSources: [],
      systemPrompt: { type: "preset", preset: "claude_code", ...(agents ? { append: agents } : {}) },
      ...(turnOptions.outputSchema ? { outputFormat: { type: "json_schema", schema: turnOptions.outputSchema as Record<string, unknown> } } : {}),
      env: engine.env(gw),
      ...(engine.options.executable ? { pathToClaudeCodeExecutable: engine.options.executable } : {}),
      stderr: (data: string) => {
        stderr = (stderr + data).slice(-2000);
      },
    };
    let stderr = "";

    // the turn's usage: one entry per API response (a streamed response repeats its message id)
    const perMessage = new Map<string, Tokens>();
    const turnTokens = () => [...perMessage.values()].reduce(plus, NO_TOKENS);
    let before = this.storedTotal();
    const pending = new Map<string, { name: string; input: unknown }>();
    let failed = false;
    let lastError: string | null = null;

    yield { type: "turn.started" };
    try {
      const run = engine.options.query ?? query;
      for await (const m of run({ prompt: await promptOf(input), options }) as AsyncIterable<SDKMessage>) {
        if (m.type === "system" && m.subtype === "init") {
          if (m.session_id !== this.sessionId) {
            const isNew = this.sessionId === null;
            this.sessionId = m.session_id;
            // a new session id (a new thread, or a resume that forked) starts its usage file at the total so far
            this.writeTotal(before);
            if (isNew) yield { type: "thread.started", thread_id: this.id! };
          }
          continue;
        }
        if (m.type === "system" && m.subtype === "api_retry") {
          const r = m as { attempt: number; max_retries: number; error_status: number | null; error?: unknown };
          yield { type: "error", message: `Reconnecting... ${r.attempt}/${r.max_retries} (${r.error_status ?? "network"} ${typeof r.error === "string" ? r.error : ""})`.trim() };
          continue;
        }
        if (m.type === "assistant") {
          if (m.parent_tool_use_id) continue;
          const msg = m.message as { id?: string; content?: ContentBlock[]; usage?: ApiUsage };
          if (m.error) lastError = String(m.error);
          if (msg.id && msg.usage) {
            perMessage.set(msg.id, tokensOf(msg.usage));
            this.writeTotal(plus(before, turnTokens()));
          }
          for (const b of msg.content ?? []) {
            if (b.type === "text" && b.text?.trim()) {
              // with structured output the turn's answer is the StructuredOutput call; text on the way is narration
              const id = `${msg.id ?? "msg"}-${pending.size}-text`;
              if (turnOptions.outputSchema) yield { type: "item.completed", item: { id, type: "reasoning", text: b.text } };
              else yield { type: "item.completed", item: { id, type: "agent_message", text: b.text } };
            } else if (b.type === "thinking" && b.thinking?.trim()) {
              yield { type: "item.completed", item: { id: `${msg.id ?? "msg"}-thinking`, type: "reasoning", text: b.thinking } };
            } else if (b.type === "tool_use" && b.id && b.name) {
              pending.set(b.id, { name: b.name, input: b.input });
              if (b.name === "Bash") {
                const command = str((b.input as { command?: unknown } | undefined)?.command);
                yield { type: "item.started", item: { id: b.id, type: "command_execution", command, aggregated_output: "", status: "in_progress" } };
              }
            }
          }
          continue;
        }
        if (m.type === "user") {
          if (m.parent_tool_use_id) continue;
          const content = (m.message as { content?: unknown }).content;
          if (!Array.isArray(content)) continue;
          for (const b of content as ContentBlock[]) {
            if (b.type !== "tool_result" || !b.tool_use_id) continue;
            const call = pending.get(b.tool_use_id);
            if (!call) continue;
            pending.delete(b.tool_use_id);
            const item = toolItem(b.tool_use_id, call.name, call.input, b.content, !!b.is_error);
            if (item) yield { type: "item.completed", item };
          }
          continue;
        }
        if (m.type === "result") {
          // The result's usage is this turn's. The streamed responses undercount the output (their usage is taken
          // before the response ends), so they only stand in when the result has none. `modelUsage` adds up the
          // whole session (a resumed one included), so it can only be used for a turn that started the session.
          const reported = tokensOf(m.usage as ApiUsage);
          const session = Object.values(m.modelUsage ?? {}).reduce<Tokens>(
            (t, u) => plus(t, { input: u.inputTokens, cacheRead: u.cacheReadInputTokens, cacheWrite: u.cacheCreationInputTokens, output: u.outputTokens, thinking: u.thinkingTokens ?? 0 }),
            NO_TOKENS,
          );
          const best = totalOf(reported) > 0 ? reported : turnTokens();
          const turn = !resumed && totalOf(session) > totalOf(best) ? session : best;
          const total = plus(before, turn);
          this.writeTotal(total);
          before = total;
          perMessage.clear();
          if (m.subtype === "success" && !m.is_error) {
            const text = m.structured_output !== undefined ? JSON.stringify(m.structured_output) : m.result;
            yield { type: "item.completed", item: { id: `${m.uuid}-final`, type: "agent_message", text } };
            yield { type: "turn.completed", usage: toCodexUsage(total) };
          } else {
            failed = true;
            const message = m.subtype === "success" ? m.result : [m.subtype, ...(m.errors ?? [])].join(": ");
            yield { type: "turn.failed", error: { message: message || lastError || "Claude turn failed" } };
          }
          continue;
        }
      }
    } catch (e) {
      if (abort.signal.aborted) throw e;
      if (!failed) {
        const message = `${e instanceof Error ? e.message : String(e)}${stderr ? `: ${stderr.trim()}` : ""}`;
        yield { type: "turn.failed", error: { message } };
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** The last running total written to a usage file. */
function readUsageTotal(file: string): Tokens | null {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    try {
      const u = (JSON.parse(lines[i]) as { payload?: { info?: { total_token_usage?: Usage } } }).payload?.info?.total_token_usage;
      if (u) return fromCodexUsage(u);
    } catch {
      // a line still being written
    }
  }
  return null;
}
