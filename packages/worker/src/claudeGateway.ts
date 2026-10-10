import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { splitAnthropicCredential } from "@cobrac/shared";
import type { RcsConnection } from "./rcs.js";

/**
 * Local gateway of a Claude run. Claude Code runs as a child process whose environment the agent's shell commands
 * inherit, so the Anthropic key and the RCS token never leave the worker process: Claude Code calls this gateway on
 * 127.0.0.1 with a random per-run token, and the gateway forwards the request with the real key (Anthropic) or bearer
 * token (RCS). The run token is worthless once the worker exits, and the gateway only passes the Messages and Models
 * endpoints, and Messages requests only for the run's models (so the agent cannot spend the key on another model).
 */
export interface ClaudeGateway {
  /** ANTHROPIC_BASE_URL of Claude Code */
  anthropicBaseUrl: string;
  /** URL of the RCS MCP server through the gateway; null without RCS */
  rcsUrl: string | null;
  /** Per-run token: Claude Code's API key and the RCS bearer token */
  token: string;
  close(): Promise<void>;
}

export interface ClaudeGatewayOptions {
  /** The Anthropic key, with its workspace ID when it needs one (`joinAnthropicCredential`) */
  apiKey: string;
  rcs: RcsConnection | null;
  /** Models a Messages request may name */
  models: readonly string[];
  /** Anthropic API origin (tests point it at a mock server) */
  upstream?: string;
}

const ANTHROPIC_PATHS = /^\/v1\/(?:messages(?:\/count_tokens)?|models(?:\/[\w.-]+)?)$/;
const MESSAGES_PATHS = /^\/v1\/messages(?:\/count_tokens)?$/;
/** Largest Messages request body the gateway reads to check its model */
const MAX_BODY = 64 * 1024 * 1024;
/** Hop-by-hop headers, and the ones the gateway sets itself */
const DROP_REQUEST = new Set(["host", "connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "x-api-key", "authorization", "anthropic-workspace-id"]);
const DROP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade"]);

export async function startClaudeGateway(o: ClaudeGatewayOptions): Promise<ClaudeGateway> {
  const token = `cobrac-${randomBytes(24).toString("hex")}`;
  const anthropic = new URL(o.upstream ?? "https://api.anthropic.com");
  const { apiKey, workspaceId } = splitAnthropicCredential(o.apiKey);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://gateway");
    if (url.pathname.startsWith("/anthropic/")) {
      const path = url.pathname.slice("/anthropic".length);
      if (!sameToken(req.headers["x-api-key"], token)) return deny(res, 401);
      if (!ANTHROPIC_PATHS.test(path)) return deny(res, 404);
      const target = new URL(path + url.search, anthropic);
      const auth: Record<string, string> = { "x-api-key": apiKey, ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}) };
      if (!MESSAGES_PATHS.test(path)) return forward(req, res, target, auth);
      return void readBody(req).then(
        (body) => {
          const model = modelOf(body);
          if (model === null || !o.models.includes(model)) return deny(res, 403, `gateway: model ${model ?? "(none)"} is not allowed in this run`);
          forward(req, res, target, auth, body);
        },
        () => deny(res, 413, "gateway: request too large"),
      );
    }
    if (url.pathname === "/rcs" && o.rcs) {
      if (!sameToken(bearer(req.headers.authorization), token)) return deny(res, 401);
      const target = new URL(o.rcs.url);
      if (url.search) target.search = url.search;
      return forward(req, res, target, { authorization: `Bearer ${o.rcs.token}` });
    }
    deny(res, 404);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  // the worker exits when its work is done, whether or not the gateway still listens
  server.unref();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return {
    anthropicBaseUrl: `${base}/anthropic`,
    rcsUrl: o.rcs ? `${base}/rcs` : null,
    token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Forwards `req` to `target`; `body` is the request body when the gateway has already read it. */
function forward(req: IncomingMessage, res: ServerResponse, target: URL, auth: Record<string, string>, body?: Buffer) {
  const headers: OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !DROP_REQUEST.has(k)) headers[k] = v;
  Object.assign(headers, auth, { host: target.host });
  if (body) {
    delete headers["content-length"];
    headers["content-length"] = body.length;
  }
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(target, { method: req.method, headers }, (up) => {
    const out: OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(up.headers)) if (v !== undefined && !DROP_RESPONSE.has(k)) out[k] = v;
    res.writeHead(up.statusCode ?? 502, out);
    up.pipe(res);
  });
  upstream.on("error", (e) => {
    if (res.headersSent) res.destroy(e);
    else deny(res, 502, `gateway: ${e.message}`);
  });
  // a cancelled request (the turn was aborted) cancels the upstream one
  res.on("close", () => {
    if (!res.writableFinished) upstream.destroy();
  });
  if (body) upstream.end(body);
  else req.pipe(upstream);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error("too large"));
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function modelOf(body: Buffer): string | null {
  try {
    const m = (JSON.parse(body.toString("utf8")) as { model?: unknown }).model;
    return typeof m === "string" ? m : null;
  } catch {
    return null;
  }
}

function deny(res: ServerResponse, status: number, message = "not allowed") {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ type: "error", error: { type: "gateway_error", message } }));
}

function bearer(v: string | undefined): string | undefined {
  return v?.startsWith("Bearer ") ? v.slice(7) : undefined;
}

function sameToken(given: string | string[] | undefined, token: string): boolean {
  if (typeof given !== "string" || given.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(token));
}
