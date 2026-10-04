// Apache AGE takes a Cypher query as a dollar-quoted string, where SQL parameters do not work, so values are written
// as Cypher literals (as BRA-DB import v3.10 does). The dollar-quote tag is chosen so that no value can end the
// quoted string early.
import { randomBytes } from "node:crypto";

export function cypherString(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}'`;
}

export function cypherValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (Array.isArray(v)) return `[${v.map(cypherValue).join(", ")}]`;
  return cypherString(String(v));
}

/** `{key: value, …}`; keys are identifiers from the code, never from data. */
export function cypherProps(d: Record<string, unknown>): string {
  return `{${Object.entries(d)
    .map(([k, v]) => `${k}: ${cypherValue(v)}`)
    .join(", ")}}`;
}

export function dollarTag(query: string): string {
  let tag = "cy";
  while (query.includes(`$${tag}$`)) tag = `cy${randomBytes(4).toString("hex")}`;
  return `$${tag}$`;
}

export interface CypherDb {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

/** Runs one Cypher statement on bradb_graph; returns the number of rows it returned. */
export async function runCypher(db: CypherDb, cypher: string): Promise<number> {
  const tag = dollarTag(cypher);
  const returns = /\bRETURN\b/i.test(cypher);
  const r = await db.query(`SELECT * FROM cypher('bradb_graph', ${tag} ${cypher} ${tag}) AS (${returns ? "r" : "v"} agtype)`);
  return r.rows.length;
}
