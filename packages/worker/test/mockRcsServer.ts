/**
 * Minimal stand-in for rosetta-candidate-search's `rcs-mcp` (web/backend/mcp_function.py): stateless JSON-RPC over
 * POST, Bearer auth, the same result envelope (`content` + `structuredContent` + `isError`).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Term = { homba_id: string; name: string; acronym: string; dhba_acronym: string | null; sabra: Record<string, unknown> };

export const TERMS: Record<string, Term> = {
  "HOMBA:12261": {
    homba_id: "HOMBA:12261",
    name: "ventral tegmental area",
    acronym: "VTA",
    dhba_acronym: "VTA",
    sabra: { atlas: "DHBA", dhba_name: "ventral tegmental area", dhba_acronym: "VTA", dhba_homba_id: "HOMBA:12261", dhba_exact: true },
  },
  "HOMBA:10492": {
    homba_id: "HOMBA:10492",
    name: "arcuate nucleus of hypothalamus",
    acronym: "ArH",
    dhba_acronym: "Arc",
    sabra: { atlas: "DHBA", dhba_name: "arcuate nucleus", dhba_acronym: "Arc", dhba_homba_id: "HOMBA:10492", dhba_exact: true },
  },
  "HOMBA:AA30423": {
    homba_id: "HOMBA:AA30423",
    name: "flocculus",
    acronym: "CH10",
    dhba_acronym: null,
    sabra: { atlas: "DHBA", dhba_name: "flocculonodular lobe", dhba_acronym: "FNCb", dhba_homba_id: "HOMBA:12852", dhba_exact: false },
  },
  "HOMBA:10339": {
    homba_id: "HOMBA:10339",
    name: "nucleus accumbens",
    acronym: "NAC",
    dhba_acronym: null,
    sabra: { atlas: "BNA", bna_territory: "regions of basal ganglia", bna_territory_root: "HOMBA:AA30190" },
  },
};

export interface MockRcs {
  url: string;
  calls: { auth: string | undefined; body: { method: string; params?: { name?: string; arguments?: Record<string, unknown> } } }[];
  /** HOMBA IDs for which the server answers 500 */
  failing: Set<string>;
  close(): Promise<void>;
}

export async function startMockRcs(token: string): Promise<MockRcs> {
  const calls: MockRcs["calls"] = [];
  const failing = new Set<string>();
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status: number, body?: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: "unauthorized" });
      if (req.method !== "POST") return send(405, { error: "method not allowed" });
      const msg = JSON.parse(raw);
      calls.push({ auth: req.headers.authorization, body: msg });
      if (msg.method === "tools/list") return send(200, { jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "get_homba_term" }] } });
      if (msg.method !== "tools/call") return send(200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
      const id = String(msg.params?.arguments?.homba_id ?? "");
      if (failing.has(id)) return send(500, { error: "boom" });
      const term = TERMS[id];
      const data = term ? { ...term, ancestors: [], children: [] } : { error: `unknown HOMBA ID: ${id}` };
      send(200, {
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: !term },
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp`, calls, failing, close: () => new Promise((r) => server.close(() => r())) };
}
