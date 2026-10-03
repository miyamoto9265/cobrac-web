// Runs inside the built worker image as PID 1, the way the worker runs on Fargate (scripts/worker-image-check.sh).
// Two turns through the worker's own createCodex / runTurn against a mock model server: in the first the "agent" runs
// agent-probe.sh as its command, which tries to read the API key and the task role's credentials URI from the other
// processes and to change what runs with them; the second resumes the thread. Exits non-zero on any leak or failure.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const { createCodex, openThread, runTurn } = await import("/app/worker/codex.js");

const API_KEY = `sk-image-check-${randomBytes(12).toString("hex")}`;
const secrets = [API_KEY, process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI, process.env.NCBI_API_KEY];
if (process.pid !== 1 || secrets.some((s) => !s)) throw new Error("run as PID 1 with AWS_CONTAINER_CREDENTIALS_RELATIVE_URI and NCBI_API_KEY set");
mkdirSync("/tmp/image-check", { recursive: true });
writeFileSync("/tmp/image-check/sentinels", secrets.join("\n") + "\n");
const PROBE_OUT = "/tmp/image-check/probe.txt";

const requests = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method !== "POST" || !req.url.endsWith("/responses")) {
      res.writeHead(404).end();
      return;
    }
    const r = JSON.parse(body);
    requests.push({ auth: req.headers.authorization, body });
    const answered = r.input.some((i) => i.type === "custom_tool_call_output" || i.type === "function_call_output");
    const firstTurn = requests.length === 1;
    const item = firstTurn
      ? {
          type: "custom_tool_call",
          id: "ctc_probe",
          call_id: "call_probe",
          name: "exec",
          input: `// @exec: {"yield_time_ms": 60000}\nconst r = await tools.exec_command({ cmd: "sh /check/agent-probe.sh ${PROBE_OUT}", yield_time_ms: 60000 });\ntext(r);`,
        }
      : {
          type: "message",
          id: `msg_${requests.length}`,
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify({ status: "done", message: answered ? "probe finished" : "resumed", question: null }) }],
        };
    const id = `resp_${requests.length}`;
    const usage = { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 15 };
    const events = [
      { type: "response.created", response: { id } },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: { id, usage } },
    ];
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    res.end();
  });
});
server.on("upgrade", (_req, socket) => socket.end("HTTP/1.1 404 Not Found\r\n\r\n"));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

const codex = createCodex(API_KEY, null, {
  lit: true,
  config: {
    model_provider: "image_check",
    model_providers: { image_check: { name: "image check", base_url: baseUrl, env_key: "CODEX_API_KEY", wire_api: "responses", supports_websockets: false } },
  },
});
const settings = { model: "gpt-6-luna", reasoningEffort: null };
const sink = { onMessage: async () => {}, onFileChange: async () => {}, onHeartbeat: async () => {} };
const failures = [];

// The lit MCP server runs for the thread's lifetime; catch it while the turns run (cmdline stays readable).
const { readdirSync, readFileSync: readProc } = await import("node:fs");
let spawnedLitMcp = false;
const watch = setInterval(() => {
  if (spawnedLitMcp) return;
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if (readProc(`/proc/${pid}/cmdline`, "utf8").includes("litMcp.js")) spawnedLitMcp = true;
    } catch {
      /* process gone or unreadable */
    }
  }
}, 100);

const first = await runTurn(openThread(codex, null, settings, { webSearch: false }), "Run the probe.", sink);
if (first.failed || !first.threadId) failures.push(`first turn failed: ${first.errorMessage}`);
const second = await runTurn(openThread(codex, first.threadId, settings, { webSearch: false }), "Continue.", sink);
if (second.failed) failures.push(`resumed turn failed: ${second.errorMessage}`);
clearInterval(watch);
server.close();

if (requests.length < 3) failures.push(`the mock model got ${requests.length} request(s), expected 3`);
if (requests.some((r) => r.auth !== `Bearer ${API_KEY}`)) failures.push("Codex did not send the API key to the model server");
// With code mode (Codex's default) MCP tools are reached through the `exec` sandbox, not listed in the model request,
// so instead of inspecting the request we confirm the lit MCP server (node litMcp.js) actually spawned.
if (!spawnedLitMcp) failures.push("the lit MCP server (node litMcp.js) did not spawn");

let probe = "";
try {
  probe = readFileSync(PROBE_OUT, "utf8");
} catch {
  failures.push("the agent's command did not run");
}
const lines = probe.trim().split("\n").filter(Boolean);
for (const l of lines) console.log(`[probe] ${l}`);
if (lines.at(-1) !== "done") failures.push("the probe did not finish");
failures.push(...lines.filter((l) => l.startsWith("LEAK")));

console.log(`[image-check] turns: ${first.failed ? "failed" : "ok"}, ${second.failed ? "failed" : "ok"}; model requests: ${requests.length}`);
if (failures.length) {
  for (const f of failures) console.error(`[image-check] FAIL ${f}`);
  process.exit(1);
}
console.log("[image-check] PASS");
process.exit(0);
