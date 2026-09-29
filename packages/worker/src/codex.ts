import { Codex, type McpToolCallItem, type ModelReasoningEffort, type Thread, type ThreadEvent, type ThreadItem } from "@openai/codex-sdk";
import type { MessageType } from "@cobrac/shared";
import { DEFAULT_CODEX_MODEL, QUESTION_REGEX, TURN_OUTPUT_SCHEMA, parseTurnOutput } from "@cobrac/shared";
import { env } from "./env.js";
import { RCS_TOKEN_ENV, rcsCodexConfig, type RcsConnection } from "./rcs.js";

export interface TurnResult {
  threadId: string | null;
  finalMessage: string;
  question: string | null;
  failed: boolean;
  errorMessage: string | null;
  usage: { input: number; cachedInput: number; output: number; reasoningOutput: number };
}

export interface TurnSink {
  onMessage(type: MessageType, content: string, meta?: Record<string, unknown>): Promise<void>;
  onFileChange(paths: string[]): Promise<void>;
  onHeartbeat(): Promise<void>;
  onMcpCall?(item: McpToolCallItem): Promise<void>;
}

export function createCodex(apiKey: string, rcs: RcsConnection | null = null): Codex {
  return new Codex({
    apiKey,
    env: {
      ...(process.env as Record<string, string>),
      CODEX_HOME: env.codexHome,
      // never leak the worker's AWS credentials to commands run by the agent
      AWS_ACCESS_KEY_ID: "",
      AWS_SECRET_ACCESS_KEY: "",
      AWS_SESSION_TOKEN: "",
      AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "",
      AWS_CONTAINER_CREDENTIALS_FULL_URI: "",
      NCBI_API_KEY: "",
      // Codex itself sends it as the MCP bearer token; shell_environment_policy keeps it out of agent commands
      [RCS_TOKEN_ENV]: rcs?.token ?? "",
    },
    config: {
      show_raw_agent_reasoning: false,
      shell_environment_policy: { exclude: [RCS_TOKEN_ENV] },
      ...(rcs ? rcsCodexConfig(rcs) : {}),
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

export function openThread(codex: Codex, threadId: string | null, settings: ModelSettings, opts: { webSearch?: boolean } = {}): Thread {
  const webSearch = opts.webSearch ?? true;
  const options = {
    workingDirectory: env.workDir,
    skipGitRepoCheck: true,
    // The Fargate task itself is the sandbox; Landlock/seccomp are unavailable inside the container.
    sandboxMode: "danger-full-access" as const,
    approvalPolicy: "never" as const,
    networkAccessEnabled: true,
    webSearchEnabled: webSearch,
    webSearchMode: webSearch ? ("live" as const) : ("disabled" as const),
    ...(settings.model ? { model: settings.model } : {}),
    ...(settings.reasoningEffort ? { modelReasoningEffort: settings.reasoningEffort } : {}),
  };
  return threadId ? codex.resumeThread(threadId, options) : codex.startThread(options);
}

/** Run one turn, streaming items to the sink. */
export async function runTurn(thread: Thread, prompt: string, sink: TurnSink, signal?: AbortSignal): Promise<TurnResult> {
  const result: TurnResult = {
    threadId: thread.id ?? null,
    finalMessage: "",
    question: null,
    failed: false,
    errorMessage: null,
    usage: { input: 0, cachedInput: 0, output: 0, reasoningOutput: 0 },
  };

  const { events } = await thread.runStreamed(prompt, { outputSchema: TURN_OUTPUT_SCHEMA, ...(signal ? { signal } : {}) });
  let lastHeartbeat = Date.now();

  for await (const ev of events) {
    if (Date.now() - lastHeartbeat > 45_000) {
      lastHeartbeat = Date.now();
      await sink.onHeartbeat();
    }
    await handleEvent(ev, result, sink);
  }

  result.threadId = thread.id ?? result.threadId;
  const structured = parseTurnOutput(result.finalMessage);
  if (structured) result.question = structured.status === "question" ? (structured.question ?? structured.message) : null;
  else result.question = QUESTION_REGEX.exec(result.finalMessage)?.[1].trim() ?? null;
  return result;
}

async function handleEvent(ev: ThreadEvent, result: TurnResult, sink: TurnSink) {
  switch (ev.type) {
    case "thread.started":
      result.threadId = ev.thread_id;
      return;
    case "turn.started":
      return;
    case "turn.completed":
      result.usage.input += ev.usage.input_tokens;
      result.usage.cachedInput += ev.usage.cached_input_tokens;
      result.usage.output += ev.usage.output_tokens;
      result.usage.reasoningOutput += ev.usage.reasoning_output_tokens;
      return;
    case "turn.failed":
      result.failed = true;
      result.errorMessage = ev.error.message;
      await sink.onMessage("error", `Turn failed: ${ev.error.message}`);
      return;
    case "error":
      result.failed = true;
      result.errorMessage = ev.message;
      await sink.onMessage("error", `Error: ${ev.message}`);
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
      await sink.onMessage("error", item.message);
      return;
  }
}
