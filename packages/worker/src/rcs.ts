/**
 * RCS (rosetta-candidate-search) MCP server: connection settings for the agent and SABRA lookups for the harness.
 * The server is stateless Streamable HTTP: every POST carries one JSON-RPC message and gets one JSON reply.
 */
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { HombaSabraInfo, SabraLookup } from "@cobrac/shared";

export interface RcsConnection {
  url: string;
  token: string;
}

/**
 * The secret holds the comma-separated tokens RCS accepts (`old,new` while rotating); the newest is last.
 * Returns null (agent runs without RCS) when not configured or unreadable, so a problem on the RCS side never
 * blocks BRA generation.
 */
export async function resolveRcsConnection(
  cfg: { url?: string; secretId?: string; token?: string; region: string },
  warn: (msg: string) => void,
): Promise<RcsConnection | null> {
  if (!cfg.url) return null;
  let raw = cfg.token ?? "";
  if (!raw && cfg.secretId) {
    try {
      const r = await new SecretsManagerClient({ region: cfg.region }).send(new GetSecretValueCommand({ SecretId: cfg.secretId }));
      raw = r.SecretString ?? "";
    } catch (e) {
      warn(`RCS MCP token secret could not be read (${e instanceof Error ? e.name : "error"}); continuing without RCS.`);
      return null;
    }
  }
  const token = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .at(-1);
  if (!token) {
    warn("RCS MCP token is empty; continuing without RCS.");
    return null;
  }
  return { url: cfg.url, token };
}

interface ToolResult {
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

export class RcsClient {
  private nextId = 1;
  private readonly cache = new Map<string, HombaSabraInfo | null>();

  constructor(
    private readonly conn: RcsConnection,
    private readonly timeoutMs = 30_000,
  ) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const res = await fetch(this.conn.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${this.conn.token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`RCS MCP HTTP ${res.status}`);
    const body = (await res.json()) as { result?: ToolResult; error?: { message: string } };
    if (body.error) throw new Error(`RCS MCP error: ${body.error.message}`);
    return body.result ?? {};
  }

  /**
   * SABRA facts for HOMBA IDs via `get_homba_term`. IDs RCS does not know map to null; IDs that could not be
   * asked (network, server error) are left out so the harness skips only their abbreviation check.
   */
  async lookupHomba(ids: string[]): Promise<SabraLookup> {
    await Promise.all(
      ids
        .filter((id) => !this.cache.has(id))
        .map(async (id) => {
          try {
            const r = await this.callTool("get_homba_term", { homba_id: id });
            const data = (r.structuredContent ?? parseText(r)) as TermResult | undefined;
            if (r.isError) {
              if (/unknown HOMBA ID/i.test(String((data as { error?: string } | undefined)?.error ?? ""))) this.cache.set(id, null);
              return;
            }
            if (data?.sabra) this.cache.set(id, toInfo(data));
          } catch (e) {
            console.warn(`[rcs] get_homba_term ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }),
    );
    return new Map(ids.filter((id) => this.cache.has(id)).map((id) => [id, this.cache.get(id)!]));
  }
}

interface TermResult {
  homba_id: string;
  dhba_acronym?: string | null;
  sabra?: { atlas?: string; dhba_name?: string; dhba_acronym?: string; dhba_homba_id?: string; dhba_exact?: boolean } | null;
}

function parseText(r: ToolResult): unknown {
  const text = r.content?.find((c) => c.type === "text")?.text;
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function toInfo(t: TermResult): HombaSabraInfo {
  const s = t.sabra ?? {};
  const exact = s.atlas !== "BNA" && s.dhba_exact === true;
  return {
    atlas: s.atlas === "BNA" ? "BNA" : "DHBA",
    dhbaAcronym: exact ? (s.dhba_acronym ?? t.dhba_acronym ?? "") : "",
    dhbaExact: exact,
    dhbaHombaId: s.dhba_homba_id ?? "",
    dhbaAncestorAcronym: s.dhba_acronym ?? "",
    dhbaName: exact ? (s.dhba_name ?? "") : "",
  };
}

/** Codex `config` entry for the RCS server; the token stays in an env var that agent shell commands do not inherit. */
export const RCS_TOKEN_ENV = "RCS_MCP_TOKEN";
export const RCS_TOOLS = ["search_homba_candidates", "search_bna_candidates", "get_homba_term", "get_sabra_definition"];

export function rcsCodexConfig(conn: RcsConnection) {
  return {
    mcp_servers: {
      rcs: {
        url: conn.url,
        bearer_token_env_var: RCS_TOKEN_ENV,
        enabled_tools: RCS_TOOLS,
        startup_timeout_sec: 30,
        tool_timeout_sec: 60,
      },
    },
  };
}
