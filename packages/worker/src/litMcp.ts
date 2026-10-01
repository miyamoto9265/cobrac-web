/**
 * `lit` MCP server (stdio, newline-delimited JSON-RPC) with the literature tools of research mode. Codex starts it as
 * `node litMcp.js`; the worker records every call from the event stream in `research_queries.jsonl`.
 * Dependency-free: only initialize, ping, tools/list and tools/call are needed.
 */
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { LIT_TOOLS, type LitTool } from "@cobrac/shared";
import { LitClient } from "./litsearch.js";

const ID_PROPS = {
  pmid: { type: "string", description: "PubMed ID" },
  pmcid: { type: "string", description: "PubMed Central ID (PMC…)" },
  doi: { type: "string", description: "DOI without prefix" },
} as const;

export const LIT_TOOL_DEFS: { name: LitTool; description: string; inputSchema: Record<string, unknown> }[] = [
  {
    name: "search_pubmed",
    description:
      "Search PubMed (relevance order). Use PubMed syntax: field tags ([tiab], [mh]), AND/OR, quotes. Returns PMID, DOI, title, authors, year, journal and whether a PMC copy exists.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, max_results: { type: "integer", minimum: 1, maximum: 25, description: "default 8" } },
      required: ["query"],
    },
  },
  {
    name: "search_europepmc",
    description:
      "Search Europe PMC (includes PubMed, PMC full texts and preprints). Supports field searches like TITLE:, ABSTRACT:, METHODS:\"retrograde\". open_access_only restricts to papers with a readable full text.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "integer", minimum: 1, maximum: 25, description: "default 8" },
        open_access_only: { type: "boolean" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_abstract",
    description: "Abstract and bibliographic record of one paper, by pmid, pmcid or doi.",
    inputSchema: { type: "object", properties: ID_PROPS },
  },
  {
    name: "find_sentences",
    description:
      "Sentences of one paper that contain the given terms (e.g. region names, 'projection', 'retrograde'), from the open-access full text when available, else the abstract. Use it to read what a paper states and to copy quotes verbatim.",
    inputSchema: {
      type: "object",
      properties: { ...ID_PROPS, terms: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["terms"],
    },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const isTool = (n: unknown): n is LitTool => typeof n === "string" && (LIT_TOOLS as readonly string[]).includes(n);

/** One JSON-RPC message → the response to write (null for notifications). */
export async function handleRpc(msg: Rpc, client: LitClient): Promise<Record<string, unknown> | null> {
  if (msg.id === undefined || msg.id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "cobrac-lit", version: "1.0.0" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: LIT_TOOL_DEFS });
    case "tools/call": {
      const name = msg.params?.name;
      if (!isTool(name)) return err(-32602, `Unknown tool: ${String(name)}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await client.call(name, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return ok({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return err(-32601, `Method not found: ${String(msg.method)}`);
  }
}

export function serve(client: LitClient, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout) {
  const rl = createInterface({ input });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Rpc;
    try {
      msg = JSON.parse(line) as Rpc;
    } catch {
      output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }
    void handleRpc(msg, client).then((res) => {
      if (res) output.write(JSON.stringify(res) + "\n");
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  serve(
    new LitClient({
      eutilsUrl: process.env.LIT_EUTILS_URL || undefined,
      europepmcUrl: process.env.LIT_EUROPEPMC_URL || undefined,
      mailto: process.env.LIT_MAILTO || undefined,
    }),
  );
}
