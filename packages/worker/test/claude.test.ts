/**
 * The Claude engine (claude.ts) against a scripted Claude Agent SDK stream: the Codex-shaped events it streams, the
 * usage it reports and writes to the thread's usage file, resuming a thread, failed turns, and the local gateway that
 * keeps the Anthropic key and the RCS token in the worker process (claudeGateway.ts).
 */
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ThreadEvent } from "@openai/codex-sdk";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

type ClaudeModule = typeof import("../src/claude.js");
type CodexModule = typeof import("../src/codex.js");
let claude: ClaudeModule;
let codex: CodexModule;

beforeAll(async () => {
  for (const k of ["TABLE_USERS", "TABLE_PROJECTS", "TABLE_JOBS", "TABLE_MESSAGES", "ARTIFACTS_BUCKET", "JOB_USER_ID", "JOB_ID"]) vi.stubEnv(k, "test");
  vi.stubEnv("JOB_PROJECT_ID", "u7m2q9xa-1");
  claude = await import("../src/claude.js");
  codex = await import("../src/codex.js");
});

const SESSION = "0d6c1f9e-5b1a-4c55-9a43-2f0c8e3c7a11";
const init = (session = SESSION) => ({ type: "system", subtype: "init", session_id: session }) as unknown as SDKMessage;
const assistant = (id: string, content: unknown[], usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50 }) =>
  ({ type: "assistant", parent_tool_use_id: null, message: { id, content, usage }, session_id: SESSION }) as unknown as SDKMessage;
const toolResult = (id: string, content: unknown, isError = false) =>
  ({ type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] }, session_id: SESSION }) as unknown as SDKMessage;
const success = (structured: unknown, modelUsage: Record<string, unknown> = {}) =>
  ({ type: "result", subtype: "success", is_error: false, result: "", structured_output: structured, modelUsage, uuid: "r1", session_id: SESSION }) as unknown as SDKMessage;

function engineWith(script: SDKMessage[][], extra: Record<string, unknown> = {}) {
  const home = mkdtempSync(join(tmpdir(), "claude-home-"));
  const work = mkdtempSync(join(tmpdir(), "claude-work-"));
  writeFileSync(join(work, "AGENTS.md"), "# Harness rules\n", "utf8");
  const calls: Options[] = [];
  const query = vi.fn(({ options }: { options: Options }) => {
    calls.push(options);
    const messages = script[calls.length - 1] ?? [];
    return (async function* () {
      yield* messages;
    })();
  });
  const engine = new claude.ClaudeEngine({
    apiKey: "sk-ant-api03-secret",
    models: ["claude-haiku-5-5"],
    rcs: null,
    lit: true,
    configDir: join(home, "sessions", "claude"),
    usageDir: join(home, "sessions", "claude-usage"),
    autoCompactWindow: 100_000,
    query: query as never,
    ...extra,
  });
  const opts = { workingDirectory: work, model: "claude-haiku-5-5", reasoningEffort: "minimal" as const, webSearch: false };
  return { engine, calls, home, opts };
}

async function collect(events: AsyncGenerator<ThreadEvent>): Promise<ThreadEvent[]> {
  const out: ThreadEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("Claude thread", () => {
  it("streams Codex-shaped events and reports the thread's running usage", async () => {
    const answer = { status: "done", message: "HCD written", question: null };
    const { engine, calls, home, opts } = engineWith([
      [
        init(),
        assistant("msg_1", [
          { type: "text", text: "Reading the specs first." },
          { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls hcd" } },
        ]),
        toolResult("t1", "hcd_1.json"),
        assistant("msg_2", [
          { type: "tool_use", id: "t2", name: "Write", input: { file_path: "/work/p/hcd/hcd_2.json", content: "{}" } },
          { type: "tool_use", id: "t3", name: "mcp__lit__search_pubmed", input: { query: "amygdala" } },
          { type: "tool_use", id: "t4", name: "TodoWrite", input: { todos: [{ content: "HCD", status: "completed" }, { content: "FRG", status: "pending" }] } },
        ]),
        toolResult("t2", "File created"),
        toolResult("t3", [{ type: "text", text: '{"hits":[{"pmid":"1"}]}' }]),
        toolResult("t4", "ok"),
        success(answer, { "claude-haiku-5-5": { inputTokens: 200, outputTokens: 40, cacheReadInputTokens: 2000, cacheCreationInputTokens: 100 } }),
      ],
    ]);
    const thread = engine.startThread(opts);
    expect(thread.id).toBeNull();
    const { events } = await thread.runStreamed("go", { outputSchema: { type: "object" } });
    const out = await collect(events);

    expect(thread.id).toBe(`claude-${SESSION}`);
    expect(out[0]).toEqual({ type: "turn.started" });
    expect(out).toContainEqual({ type: "thread.started", thread_id: `claude-${SESSION}` });
    const items = out.filter((e) => e.type === "item.completed").map((e) => (e as { item: { type: string } }).item);
    expect(items.map((i) => i.type)).toEqual(["reasoning", "command_execution", "file_change", "mcp_tool_call", "todo_list", "agent_message"]);
    expect(items[1]).toMatchObject({ command: "ls hcd", aggregated_output: "hcd_1.json", exit_code: 0, status: "completed" });
    expect(items[2]).toMatchObject({ changes: [{ path: "/work/p/hcd/hcd_2.json", kind: "add" }] });
    expect(items[3]).toMatchObject({ server: "lit", tool: "search_pubmed", arguments: { query: "amygdala" }, status: "completed", result: { structured_content: { hits: [{ pmid: "1" }] } } });
    expect(items[4]).toMatchObject({ items: [{ text: "HCD", completed: true }, { text: "FRG", completed: false }] });
    expect(JSON.parse((items[5] as unknown as { text: string }).text)).toEqual(answer);
    expect(out.find((e) => e.type === "item.started")).toMatchObject({ item: { type: "command_execution", command: "ls hcd" } });

    // a fresh session: the result's per-model totals (input = uncached + cache reads + cache writes)
    const completed = out.find((e) => e.type === "turn.completed") as { usage: unknown };
    expect(completed.usage).toEqual({ input_tokens: 2300, cached_input_tokens: 2000, cache_write_input_tokens: 100, output_tokens: 40, reasoning_output_tokens: 0 });
    expect(codex.sessionTotalUsage(thread.id!, home)).toEqual({ input: 2300, cachedInput: 2000, cacheWrite: 100, output: 40, reasoningOutput: 0 });

    const o = calls[0];
    expect(o).toMatchObject({ model: "claude-haiku-5-5", effort: "low", permissionMode: "bypassPermissions", settingSources: [], strictMcpConfig: true });
    expect(o.resume).toBeUndefined();
    expect(o.tools).toEqual(["Bash", "Read", "Write", "Edit", "Glob", "Grep", "TodoWrite"]);
    expect(o.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: "# Harness rules\n" });
    expect(o.outputFormat).toEqual({ type: "json_schema", schema: { type: "object" } });
    expect(Object.keys(o.mcpServers ?? {})).toEqual(["lit"]);
    // Claude Code gets the gateway and its per-run token, never the key
    expect(o.env?.ANTHROPIC_BASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/anthropic$/);
    expect(o.env?.ANTHROPIC_API_KEY).toMatch(/^cobrac-[0-9a-f]{48}$/);
    expect(JSON.stringify(o)).not.toContain("sk-ant-api03-secret");
    await engine.close();
  });

  it("resumes the session and counts only the new turn's responses", async () => {
    const { engine, calls, home, opts } = engineWith([
      [init(), assistant("msg_1", [{ type: "text", text: "a" }]), success({ status: "done", message: "1", question: null })],
      [
        init(),
        assistant("msg_2", [{ type: "text", text: "b" }], { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
        // the same response streamed again: counted once
        assistant("msg_2", [{ type: "text", text: "c" }], { input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
        // a resumed session's totals include the earlier turns, so they are not used
        success({ status: "done", message: "2", question: null }, { "claude-haiku-5-5": { inputTokens: 999, outputTokens: 999, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } }),
      ],
    ]);
    const first = engine.startThread(opts);
    const r1 = await first.run("one", { outputSchema: { type: "object" } });
    expect(r1.usage).toEqual({ input_tokens: 1150, cached_input_tokens: 1000, cache_write_input_tokens: 50, output_tokens: 20, reasoning_output_tokens: 0 });

    const again = codex.openThread(engine, first.id, { model: opts.model, reasoningEffort: null }, { webSearch: true });
    const r2 = await again.run("two", { outputSchema: { type: "object" } });
    expect(calls[1].resume).toBe(SESSION);
    expect(calls[1].effort).toBeUndefined();
    expect(calls[1].tools).toContain("WebSearch");
    expect(r2.finalResponse).toBe('{"status":"done","message":"2","question":null}');
    // the thread's running total, as Codex reports it
    expect(r2.usage).toEqual({ input_tokens: 1160, cached_input_tokens: 1000, cache_write_input_tokens: 50, output_tokens: 27, reasoning_output_tokens: 0 });
    expect(codex.turnUsage(codex.sessionTotalUsage(again.id!, home), codex.fromCodexUsage(r1.usage!))).toEqual({ input: 10, cachedInput: 0, output: 7, reasoningOutput: 0 });
    await engine.close();
  });

  it("fails a turn the SDK ends with an error, and `run` throws like Codex", async () => {
    const rateLimited = { type: "result", subtype: "success", is_error: true, result: 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}', modelUsage: {}, uuid: "r", session_id: SESSION } as unknown as SDKMessage;
    const { engine, opts } = engineWith([[init(), rateLimited], [init(), rateLimited]]);
    const t = engine.startThread(opts);
    const out = await collect((await t.runStreamed("go")).events);
    const failed = out.find((e) => e.type === "turn.failed") as { error: { message: string } };
    expect(codex.isRateLimitError(failed.error.message)).toBe(true);
    await expect(engine.startThread(opts).run("go")).rejects.toThrow(/429/);
    await engine.close();
  });

  it("runs a rate-limited turn again on the same session through runTurn", async () => {
    const rateLimited = { type: "result", subtype: "success", is_error: true, result: "API Error: 429 rate_limit_error. Please try again in 1s", modelUsage: {}, uuid: "r", session_id: SESSION } as unknown as SDKMessage;
    const { engine, calls, opts } = engineWith([[init(), rateLimited], [init(), assistant("m", []), success({ status: "done", message: "ok", question: null })]]);
    const thread = engine.startThread(opts);
    const messages: string[] = [];
    const sink = { onMessage: async (_t: string, c: string) => void messages.push(c), onFileChange: async () => {}, onHeartbeat: async () => {} };
    const r = await codex.runTurn(thread, "go", sink, undefined, { sleep: async () => {} });
    expect(r.failed).toBe(false);
    expect(calls[1].resume).toBe(SESSION);
    expect(r.usage).toMatchObject({ input: 1150, cachedInput: 1000, cacheWrite: 50, output: 20 });
    expect(messages.some((m) => /^Rate limit: resuming the turn/.test(m))).toBe(true);
    await engine.close();
  });

  it("maps efforts and tool calls", () => {
    expect([null, "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "persistent"].map((e) => claude.claudeEffort(e))).toEqual([undefined, "low", "low", "medium", "high", "xhigh", "max", "max", "max"]);
    expect(claude.toolItem("x", "Read", { file_path: "/work/a.md" }, "text", false)).toMatchObject({ type: "command_execution", command: "Read /work/a.md" });
    expect(claude.toolItem("x", "Bash", { command: "false" }, "Exit code 1", true)).toMatchObject({ type: "command_execution", exit_code: 1, status: "failed" });
    expect(claude.toolItem("x", "WebSearch", { query: "bnst" }, "", false)).toMatchObject({ type: "web_search", query: "bnst" });
    expect(claude.toolItem("x", "mcp__rcs__get_homba_term", { homba_id: "H1" }, "RCS is unavailable", true)).toMatchObject({ server: "rcs", tool: "get_homba_term", status: "failed", result: { structured_content: null } });
    expect(claude.toolItem("x", "StructuredOutput", {}, "", false)).toBeNull();
    expect(claude.isClaudeThreadId(`claude-${SESSION}`)).toBe(true);
    expect(claude.isClaudeThreadId(SESSION)).toBe(false);
  });
});

describe("Claude gateway", () => {
  it("forwards the Messages API with the real key and refuses everything else", async () => {
    const seen: { url: string; headers: IncomingHttpHeaders; body: string }[] = [];
    const upstream = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ url: req.url ?? "", headers: req.headers, body });
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("event: message_start\n\n");
        res.end("event: message_stop\n\n");
      });
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
    const { startClaudeGateway } = await import("../src/claudeGateway.js");
    const rcsSeen: IncomingHttpHeaders[] = [];
    const rcs = createServer((req, res) => {
      rcsSeen.push(req.headers);
      res.end("{}");
    });
    await new Promise<void>((r) => rcs.listen(0, "127.0.0.1", () => r()));
    const gw = await startClaudeGateway({
      apiKey: "sk-ant-api03-secret",
      models: ["claude-haiku-5-5"],
      rcs: { url: `http://127.0.0.1:${(rcs.address() as AddressInfo).port}/mcp`, token: "rcs-secret" },
      upstream: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    });
    const post = (path: string, key: string, model = "claude-haiku-5-5") =>
      fetch(gw.anthropicBaseUrl + path, { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model }) });

    const ok = await post("/v1/messages?beta=true", gw.token);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("event: message_start\n\nevent: message_stop\n\n");
    expect(seen[0]).toMatchObject({ url: "/v1/messages?beta=true", body: '{"model":"claude-haiku-5-5"}' });
    expect(seen[0].headers["x-api-key"]).toBe("sk-ant-api03-secret");
    expect(seen[0].headers["anthropic-version"]).toBe("2023-06-01");

    expect((await post("/v1/messages", "wrong")).status).toBe(401);
    expect((await post("/v1/messages", gw.token, "claude-opus-5-5")).status).toBe(403);
    expect((await post("/v1/messages/count_tokens", gw.token, "claude-fable-5-1")).status).toBe(403);
    expect((await post("/v1/files", gw.token)).status).toBe(404);
    expect((await post("/v1/organizations/api_keys", gw.token)).status).toBe(404);
    expect(seen).toHaveLength(1);

    expect((await fetch(gw.rcsUrl!, { method: "POST", headers: { authorization: `Bearer ${gw.token}` }, body: "{}" })).status).toBe(200);
    expect(rcsSeen[0].authorization).toBe("Bearer rcs-secret");
    expect((await fetch(gw.rcsUrl!, { method: "POST", headers: { authorization: "Bearer rcs-secret" }, body: "{}" })).status).toBe(401);

    await gw.close();
    upstream.close();
    rcs.close();
  });

  it("sends the workspace ID of a key that needs one", async () => {
    const seen: IncomingHttpHeaders[] = [];
    const upstream = createServer((req, res) => {
      seen.push(req.headers);
      req.resume();
      req.on("end", () => res.end("{}"));
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
    const { startClaudeGateway } = await import("../src/claudeGateway.js");
    const gw = await startClaudeGateway({
      apiKey: "sk-ant-usr-secret\nwrkspc_0123456789",
      models: ["claude-haiku-5-5"],
      rcs: null,
      upstream: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    });
    const r = await fetch(gw.anthropicBaseUrl + "/v1/messages", { method: "POST", headers: { "x-api-key": gw.token, "anthropic-workspace-id": "wrkspc_other" }, body: '{"model":"claude-haiku-5-5"}' });
    expect(r.status).toBe(200);
    expect(seen[0]["x-api-key"]).toBe("sk-ant-usr-secret");
    expect(seen[0]["anthropic-workspace-id"]).toBe("wrkspc_0123456789");
    await gw.close();
    upstream.close();
  });
});
