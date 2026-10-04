// Registration against a real PostgreSQL 17 + Apache AGE built by packages/infra/bradb/bootstrap.sh.
//   BRADB_TEST_URL=postgres://cobrac_import:…@127.0.0.1/bra_db_v4_6?sslmode=no-verify   (TLS like the Lambda, not verified)
//   BRADB_TEST_ADMIN_URL=postgres://bra:…@127.0.0.1/bra_db_v4_6   (empties the tables before the run)
// Skipped when BRADB_TEST_URL is not set (CI has no database).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BradbRegisterRequest, BraVersionManifest, CsvFileName } from "@cobrac/shared";
import { CSV_FILE_NAMES, bradbCsvName, braVersionId, buildBradbManifest, contentHashInput, parseCsv, toCsv } from "@cobrac/shared";
import { registerVersion, registrationStatus } from "../src/lib/bradb/register.js";

const URL_IMPORT = process.env.BRADB_TEST_URL;
const URL_ADMIN = process.env.BRADB_TEST_ADMIN_URL;
const fixture = (f: string) => readFileSync(new URL(`../../shared/test/fixtures/${f}`, import.meta.url), "utf8");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** The fixture predates the Uniform column (CoBRAC-v1-1 has it): every circuit is a Uniform Circuit */
const circuitsCsv = () => toCsv(parseCsv(fixture("Circuits.csv")).map((r, i) => [...r, i === 0 ? "Uniform" : "TRUE"])) + "\n";

const projectCsv = (pid: string) => `Contributor,Project ID,List of contributors,Description,BRA version
Alice A.,${pid},Alice A.,VOR adaptation in the flocculus.,CoBRAC-v1-1
,,,,
Sheet Name,Review End Line,,,
References,9,,,
Circuits,9,,,
Connections,14,,,
FRG,11,,,
`;

function pkg(pid: string, version: number, csv: Partial<Record<CsvFileName, string>>, parent: number | null = version > 1 ? version - 1 : null): BradbRegisterRequest {
  const files: Record<CsvFileName, string> = {
    "Project.csv": projectCsv(pid),
    "References.csv": fixture("References.csv"),
    "Circuits.csv": circuitsCsv(),
    "Connections.csv": fixture("Connections.csv"),
    "FRG.csv": fixture("FRG.csv"),
    ...csv,
  };
  const csvSha = Object.fromEntries(CSV_FILE_NAMES.map((n) => [n, sha(files[n])]));
  const manifest: BraVersionManifest = {
    schema: "cobrac.bra-version/1",
    versionId: braVersionId(pid, version),
    projectId: pid,
    version,
    parent: parent ? { versionId: braVersionId(pid, parent), projectId: pid, version: parent } : null,
    origin: "job",
    createdAt: new Date().toISOString(),
    contributor: "Alice A.",
    job: { jobId: `job_${version}`, type: version > 1 ? "followup" : "initial", instruction: null },
    generator: { appVersion: "0.26.0", gitSha: "abc1234", promptsSha256: null, schemasSha256: null, model: "gpt-6", reasoningEffort: "high", researchMode: true, canon: null, sabraBoundary: "neocortex", rcsBoundaryVersion: "2026-10-04", braFormat: "CoBRAC-v1-1" },
    contentSha256: sha(contentHashInput(csvSha)),
    files: [],
    changes: null,
    bradb: null,
  };
  const pkgFiles = CSV_FILE_NAMES.map((n) => ({ name: bradbCsvName(pid, n), source: n, sha256: csvSha[n], size: files[n].length }));
  return {
    action: "register",
    manifest: buildBradbManifest(manifest, pkgFiles),
    files: Object.fromEntries(CSV_FILE_NAMES.map((n) => [bradbCsvName(pid, n), files[n]])),
    project: { roi: "cerebellar flocculus", tlf: "VOR gain adaptation" },
    allowShrink: false,
    requestedBy: "test",
  };
}

const run = URL_IMPORT ? describe : describe.skip;

run("BRA-DB registration (PostgreSQL + AGE)", () => {
  let db: pg.Client;
  let admin: pg.Client | null = null;
  const count = async (sql: string, params: unknown[] = []) => Number((await db.query(sql, params)).rows[0].n);
  const graph = async (cypher: string) => Number((await db.query(`SELECT n::text AS n FROM cypher('bradb_graph', $q$ ${cypher} $q$) AS (n agtype)`)).rows[0].n);
  // a project ID with characters a `<userKey>-<seq>` ID never has: IDs are opaque
  const P = `test proj/${Date.now()}`;
  const Q = `other-${Date.now()}`;

  beforeAll(async () => {
    if (URL_ADMIN) {
      admin = new pg.Client({ connectionString: URL_ADMIN });
      await admin.connect();
      await admin.query("SET search_path = public, ag_catalog");
      await admin.query(
        "TRUNCATE cobrac.registrations, bradb_import_log, bradb_bra_node_history, bradb_bra_nodes, bradb_connections, bradb_project_literature, bradb_review_comments, bradb_literature, bradb_local_circuits, bradb_projects RESTART IDENTITY CASCADE",
      );
      await admin.query("SELECT * FROM cypher('bradb_graph', $$ MATCH (n) DETACH DELETE n $$) AS (v agtype)");
    }
    db = new pg.Client({ connectionString: URL_IMPORT });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
    await admin?.end();
  });

  it("creates the project: SQL rows, graph, node history v1, import log and the registration", async () => {
    const r = await registerVersion(db, pkg(P, 1, {}));
    expect(r.registration).toMatchObject({ status: "registered", mode: "create", versionId: `${P}@v1`, parentVersionId: null });
    expect(r.registration.counts).toMatchObject({ connections: 13, nodes: 10, literature: 8 });
    const key = (await db.query("SELECT project_key FROM bradb_projects WHERE project_id = $1", [P])).rows[0].project_key;
    expect(await count("SELECT count(*) AS n FROM bradb_bra_node_history WHERE project_key = $1 AND version = 1 AND change_type = 'import'", [key])).toBe(10);
    expect(await count("SELECT count(*) AS n FROM bradb_import_log WHERE project_key = $1 AND import_type = 'cobrac'", [key])).toBe(1);
    expect(await graph(`MATCH (n:BRANode {project_id: '${P}'}) RETURN count(n)`)).toBe(10);
    expect(await graph(`MATCH ()-[e:PROJECTS]->() WHERE e.project_id = '${P}' RETURN count(e)`)).toBe(13);
    expect(await graph(`MATCH (a:BRANode {project_id: '${P}'})-[e:SUBNODE]->() RETURN count(e)`)).toBeGreaterThan(0);
    expect(await graph(`MATCH (a:BRANode {project_id: '${P}'})-[e:MAPS_TO_LOCAL]->() RETURN count(e)`)).toBeGreaterThan(0);
    const log = (await db.query("SELECT agent, notes FROM bradb_import_log WHERE project_key = $1", [key])).rows[0];
    expect(log.agent).toBe("CoBRAC Agents v0.26.0 (abc1234)");
    expect(JSON.parse(log.notes)).toMatchObject({ versionId: `${P}@v1`, contentSha256: r.registration.contentSha256 });
  });

  it("does nothing for the same content", async () => {
    const r = await registerVersion(db, pkg(P, 1, {}));
    expect(r.registration).toMatchObject({ status: "unchanged", mode: "none" });
  });

  it("asks before shrinking, then replaces without losing history", async () => {
    const key = (await db.query("SELECT project_key FROM bradb_projects WHERE project_id = $1", [P])).rows[0].project_key;
    const conn = fixture("Connections.csv").trimEnd().split("\n");
    const frg = fixture("FRG.csv").replace("Ability to adaptively change system response", "Ability to adaptively tune system response");
    const v2 = { "Connections.csv": conn.slice(0, -1).join("\n") + "\n", "FRG.csv": frg };

    const refused = await registerVersion(db, pkg(P, 2, v2));
    expect(refused.registration.status).toBe("rejected");
    expect(refused.code).toBe("shrink");
    expect(refused.shrink).toEqual({ before: expect.objectContaining({ connections: 13 }), after: expect.objectContaining({ connections: 12 }) });

    const r = await registerVersion(db, { ...pkg(P, 2, v2), allowShrink: true });
    expect(r.registration).toMatchObject({ status: "registered", mode: "replace", parentVersionId: `${P}@v1` });
    expect(r.registration.changes).toEqual({ added: [], removed: [], changed: ["R.VOR-Learning"] });
    expect((await db.query("SELECT project_key, version FROM bradb_projects WHERE project_id = $1", [P])).rows[0]).toEqual({ project_key: key, version: 2 });
    // history and logs of v1 are still there
    expect(await count("SELECT count(*) AS n FROM bradb_bra_node_history WHERE project_key = $1", [key])).toBe(11);
    expect((await db.query("SELECT version, change_type FROM bradb_bra_node_history WHERE project_key = $1 AND node_id = 'R.VOR-Learning' ORDER BY version", [key])).rows).toEqual([
      { version: 1, change_type: "import" },
      { version: 2, change_type: "update" },
    ]);
    expect((await db.query("SELECT current_version FROM bradb_bra_nodes WHERE project_key = $1 AND node_id = 'R.VOR-Learning'", [key])).rows[0].current_version).toBe(2);
    expect(await count("SELECT count(*) AS n FROM bradb_import_log WHERE project_key = $1", [key])).toBe(2);
    expect(await graph(`MATCH ()-[e:PROJECTS]->() WHERE e.project_id = '${P}' RETURN count(e)`)).toBe(12);
    expect(await graph(`MATCH (n:BRANode {project_id: '${P}'}) RETURN count(n)`)).toBe(10);

    const status = await registrationStatus(db, P);
    expect(status.current).toMatchObject({ versionId: `${P}@v2`, projectKey: key });
    expect(status.registrations.map((x) => x.status)).toEqual(["registered", "rejected", "unchanged", "registered"]);
  });

  it("keeps circuits another project defined and still connects to them", async () => {
    const r = await registerVersion(db, pkg(Q, 1, { "Project.csv": projectCsv(Q) }));
    expect(r.registration.status).toBe("registered");
    expect(r.registration.skippedCircuits).toEqual(expect.arrayContaining(["GC", "PC"]));
    expect(await graph(`MATCH ()-[e:PROJECTS]->() WHERE e.project_id = '${Q}' RETURN count(e)`)).toBe(13);
    // the first project's edges to the shared circuits are untouched
    expect(await graph(`MATCH ()-[e:PROJECTS]->() WHERE e.project_id = '${P}' RETURN count(e)`)).toBe(12);
  });

  it("rejects a package whose files do not match the manifest", async () => {
    const req = pkg(P, 3, {});
    req.files[bradbCsvName(P, "Circuits.csv")] += "X,makeshift,tampered\n";
    const r = await registerVersion(db, req);
    expect(r.registration.status).toBe("rejected");
    expect(r.code).toBe("invalid");
  });

  it("cannot rewrite or delete history with the import role", async () => {
    await expect(db.query("UPDATE cobrac.registrations SET status = 'failed'")).rejects.toThrow();
    await expect(db.query("DELETE FROM bradb_import_log")).rejects.toThrow(/permission denied/);
    await expect(db.query("DELETE FROM bradb_bra_node_history")).rejects.toThrow(/permission denied/);
    await expect(db.query("DELETE FROM bradb_projects")).rejects.toThrow(/permission denied/);
  });

  it.runIf(!!URL_ADMIN)("stops replacing once BRA-DB has review comments", async () => {
    const key = (await db.query("SELECT project_key FROM bradb_projects WHERE project_id = $1", [Q])).rows[0].project_key;
    await admin!.query("INSERT INTO bradb_review_comments (project_key, comment_text, commented_by) VALUES ($1, 'check PC', 'reviewer')", [key]);
    const frg = fixture("FRG.csv").replace("Ability to adaptively change", "Ability to change");
    const r = await registerVersion(db, pkg(Q, 2, { "Project.csv": projectCsv(Q), "FRG.csv": frg }));
    expect(r.code).toBe("review_comments");
  });
});
