// Registers one CoBRAC version in BRA-DB: the counterpart of BRA-DB import_bra_project v3.10 (SQL + AGE in one
// transaction, integrity check, roll back on failure), with the registration rules decided on the CoBRAC side:
// - Replacing a registered project keeps its bradb_projects row (and project_key), so bradb_import_log and
//   bradb_bra_node_history are never deleted: node history continues (a changed node gets version n+1, an unchanged
//   one keeps its version) and every registration adds an import_log row (import_type 'cobrac').
// - Circuits are upserted, not deleted and recreated, so other projects' PROJECTS edges to them survive; only the
//   circuits this project no longer defines are removed.
// - Every attempt (registered / unchanged / rejected / failed) is appended to cobrac.registrations with the version ID,
//   parent, content hash and provenance. The same content hash as the current registration is a no-op.
// - The project ID is an opaque string (BRA-DB project_id = CoBRAC project ID).
import { createHash } from "node:crypto";
import type { BradbCounts, BradbNodeChanges, BradbRegisterRequest, BradbRegisterResponse, BradbRegistration, BradbStatusResponse } from "@cobrac/shared";
import { BRADB_PACKAGE_SCHEMA, CSV_FILE_NAMES, bradbCsvName, contentHashInput } from "@cobrac/shared";
import { cypherProps, cypherValue, runCypher } from "./cypher.js";
import { loadBundle, sheetsFromPackage, validateBundle, type Bundle, type NodeRow } from "./sheets.js";

export interface Db {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

class Rejected extends Error {
  constructor(
    public code: NonNullable<BradbRegisterResponse["code"]>,
    message: string,
    public extra: Partial<BradbRegisterResponse> = {},
  ) {
    super(message);
  }
}

/** Checks the package against its manifest: file hashes and the content hash (the same definition as the worker's). */
export function verifyPackage(req: BradbRegisterRequest): string[] {
  const m = req.manifest;
  const errors: string[] = [];
  if (m.schema !== BRADB_PACKAGE_SCHEMA) errors.push(`unknown package schema ${m.schema}`);
  const csvSha: Record<string, string> = {};
  for (const f of m.files) {
    const text = req.files[f.name];
    if (text === undefined) {
      errors.push(`${f.name} is missing`);
      continue;
    }
    const got = sha256(text);
    if (got !== f.sha256) errors.push(`${f.name} does not match its hash`);
    csvSha[f.source] = got;
  }
  for (const name of CSV_FILE_NAMES) if (!m.files.some((f) => f.source === name && f.name === bradbCsvName(m.projectId, name))) errors.push(`${name} is not in the package`);
  if (sha256(contentHashInput(csvSha)) !== m.contentSha256) errors.push("the content hash does not match the files");
  return errors;
}

interface RegistrationRowInput {
  req: BradbRegisterRequest;
  projectKey: number | null;
  status: BradbRegistration["status"];
  mode: BradbRegistration["mode"];
  reason: string | null;
  counts: BradbCounts | null;
  changes: BradbNodeChanges | null;
  skipped: string[];
  warnings: string[];
}

async function appendRegistration(db: Db, r: RegistrationRowInput): Promise<BradbRegistration> {
  const m = r.req.manifest;
  const res = await db.query<{ registration_id: string; registered_at: Date }>(
    `INSERT INTO cobrac.registrations (project_id, project_key, version_id, version, parent_version_id, content_sha256, status, mode, reason,
       counts, changes, skipped, warnings, provenance, package_manifest, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING registration_id, registered_at`,
    [
      m.projectId,
      r.projectKey,
      m.versionId,
      m.version,
      m.parentVersionId,
      m.contentSha256,
      r.status,
      r.mode,
      r.reason,
      json(r.counts),
      json(r.changes),
      json(r.skipped),
      json(r.warnings),
      json(m.provenance),
      json(m),
      r.req.requestedBy,
    ],
  );
  return {
    registrationId: Number(res.rows[0].registration_id),
    versionId: m.versionId,
    version: m.version,
    parentVersionId: m.parentVersionId,
    contentSha256: m.contentSha256,
    status: r.status,
    mode: r.mode,
    reason: r.reason,
    counts: r.counts,
    changes: r.changes,
    skippedCircuits: r.skipped,
    warnings: r.warnings,
    requestedBy: r.req.requestedBy,
    registeredAt: new Date(res.rows[0].registered_at).toISOString(),
  };
}

/**
 * Registers the version. Writes happen in one transaction (`db` must be a single connection); a rejection or failure
 * rolls them back and is then recorded in its own transaction.
 */
export async function registerVersion(db: Db, req: BradbRegisterRequest): Promise<BradbRegisterResponse> {
  const pid = req.manifest.projectId;
  const fail = async (status: "rejected" | "failed", reason: string, mode: BradbRegistration["mode"], warnings: string[], projectKey: number | null, extra: Partial<BradbRegisterResponse> = {}) => {
    const registration = await appendRegistration(db, { req, projectKey, status, mode, reason, counts: null, changes: null, skipped: [], warnings });
    return { registration, ...extra };
  };

  const packageErrors = verifyPackage(req);
  if (packageErrors.length) return fail("rejected", packageErrors.join("; "), "none", [], null, { code: "invalid" });

  const bundle = loadBundle(pid, sheetsFromPackage(pid, req.files), { roi: req.project.roi, tlf: req.project.tlf, contributor: req.manifest.contributor });

  await db.query("BEGIN");
  let projectKey: number | null = null;
  let mode: BradbRegistration["mode"] = "none";
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`bradb:${pid}`]);
    const existing = await db.query<{ project_key: number }>("SELECT project_key FROM bradb_projects WHERE project_id = $1", [pid]);
    projectKey = existing.rows[0]?.project_key ?? null;
    mode = projectKey === null ? "create" : "replace";

    const current = await db.query<{ content_sha256: string; version_id: string }>(
      "SELECT content_sha256, version_id FROM cobrac.registrations WHERE project_id = $1 AND status = 'registered' ORDER BY registration_id DESC LIMIT 1",
      [pid],
    );
    if (projectKey !== null && current.rows[0]?.content_sha256 === req.manifest.contentSha256) {
      const registration = await appendRegistration(db, {
        req,
        projectKey,
        status: "unchanged",
        mode: "none",
        reason: `BRA-DB already holds this content (${current.rows[0].version_id})`,
        counts: null,
        changes: null,
        skipped: [],
        warnings: [],
      });
      await db.query("COMMIT");
      return { registration };
    }

    await classifyCircuits(db, bundle);
    const errors = validateBundle(bundle);
    if (errors.length) throw new Rejected("invalid", errors.join("; "));

    if (projectKey !== null) {
      const comments = await db.query<{ n: string }>("SELECT count(*) AS n FROM bradb_review_comments WHERE project_key = $1", [projectKey]);
      if (Number(comments.rows[0].n) > 0) throw new Rejected("review_comments", `BRA-DB has ${comments.rows[0].n} review comment(s) on this project; it can no longer be replaced (send instructions instead)`);
      const before = await currentCounts(db, projectKey);
      const after = { circuits: bundle.circuits.filter((c) => c.circuitKind === "local").length, connections: bundle.connections.length };
      if (!req.allowShrink && (after.circuits < before.circuits || after.connections < before.connections)) {
        throw new Rejected("shrink", `the version has fewer Circuits or Connections than BRA-DB holds (Circuits ${before.circuits}→${after.circuits}, Connections ${before.connections}→${after.connections})`, {
          shrink: { before, after },
        });
      }
    }

    const result = await writeProject(db, bundle, req, projectKey);
    const integrity = await checkIntegrity(db, bundle, result.projectKey, result.created);
    if (integrity.length) throw new Rejected("integrity", integrity.join("; "));

    const registration = await appendRegistration(db, {
      req,
      projectKey: result.projectKey,
      status: "registered",
      mode,
      reason: null,
      counts: result.counts,
      changes: result.changes,
      skipped: result.skipped,
      warnings: bundle.warnings,
    });
    await db.query(
      `INSERT INTO bradb_import_log (project_key, import_type, agent, source_path, records_inserted, records_skipped, notes)
       VALUES ($1, 'cobrac', $2, $3, $4, $5, $6)`,
      [
        result.projectKey,
        `CoBRAC Agents ${req.manifest.provenance.appVersion ? `v${req.manifest.provenance.appVersion}` : "(unknown version)"}${req.manifest.provenance.gitSha ? ` (${req.manifest.provenance.gitSha})` : ""}`.slice(0, 200),
        `cobrac:${req.manifest.versionId}`.slice(0, 500),
        result.counts.nodes + result.counts.circuits + result.counts.connections,
        result.skipped.length,
        JSON.stringify({ versionId: req.manifest.versionId, parentVersionId: req.manifest.parentVersionId, contentSha256: req.manifest.contentSha256, registrationId: registration.registrationId, mode }),
      ],
    );
    await db.query("COMMIT");
    return { registration };
  } catch (e) {
    await db.query("ROLLBACK");
    if (e instanceof Rejected) return fail("rejected", e.message, mode, bundle.warnings, projectKey, { code: e.code, ...e.extra });
    return fail("failed", e instanceof Error ? e.message : String(e), mode, bundle.warnings, projectKey);
  }
}

/** v3.10 classify_circuits: a circuit already approved as BIF in BRA-DB is a BIFCircuit (referenced, not stored again). */
async function classifyCircuits(db: Db, b: Bundle): Promise<void> {
  const ids = [...new Set([...b.referencedCircuitIds, ...b.circuits.map((c) => c.circuitId)])];
  const present = new Set(
    ids.length
      ? (await db.query<{ circuit_id: string }>("SELECT circuit_id FROM bradb_local_circuits WHERE circuit_id = ANY($1) AND circuit_kind = 'bif' AND approval_status = 'approved'", [ids])).rows.map(
          (r) => r.circuit_id,
        )
      : [],
  );
  b.circuits = b.circuits.filter((c) => !present.has(c.circuitId));
  const defined = new Set(b.circuits.map((c) => c.circuitId));
  for (const id of b.referencedCircuitIds) {
    if (present.has(id) || defined.has(id)) continue;
    b.circuits.push({
      circuitId: id,
      rawSourceOfId: "",
      sourceOfId: "makeshift",
      names: null,
      graphOrder: null,
      isUniform: false,
      transmitter: null,
      modulationType: null,
      subCircuitIds: null,
      size: null,
      outputSemantics0: null,
      physiologicalData: null,
      comments: null,
      contributor: null,
      extra: null,
      sourceRowNo: 0,
      circuitKind: "local",
    });
  }
  for (const e of b.edges) if (e.type === "MAPS_TO_BIF" && !present.has(e.to)) e.type = "MAPS_TO_LOCAL";
  b.referencedCircuitIds = b.referencedCircuitIds.filter((id) => present.has(id));
}

async function currentCounts(db: Db, projectKey: number) {
  const c = await db.query<{ n: string }>("SELECT count(*) AS n FROM bradb_local_circuits WHERE origin_project_key = $1", [projectKey]);
  const k = await db.query<{ n: string }>("SELECT count(*) AS n FROM bradb_connections WHERE project_key = $1", [projectKey]);
  return { circuits: Number(c.rows[0].n), connections: Number(k.rows[0].n) };
}

const NODE_FIELDS = ["node_role", "capability", "requirements", "output_semantics", "interface", "implementation", "mechanism", "region_category"] as const;
const nodeValues = (n: NodeRow) => [n.nodeRole, n.capability, n.requirements, n.outputSemantics, n.interface, n.implementation, n.mechanism, n.regionCategory];

async function writeProject(db: Db, b: Bundle, req: BradbRegisterRequest, existingKey: number | null) {
  const p = b.project;
  const pid = p.projectId;
  const sheetHeaders = json(b.sheetHeaders);
  const sheetMeta = json(b.sheetMeta);
  const source = `cobrac:${req.manifest.versionId}`.slice(0, 500);
  let projectKey: number;
  if (existingKey === null) {
    const r = await db.query<{ project_key: number }>(
      `INSERT INTO bradb_projects (project_id, project_kind, roi_circuit_id, roi_label, tlf_description, contributor, contributors, description,
         root_node_id, source_file, cobrac_generated, sheet_headers, sheet_meta, bra_version, public_comment, import_status, version)
       VALUES ($1,'bra',$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,$13,'imported',1) RETURNING project_key`,
      [pid, p.roiCircuitId.slice(0, 100), p.roiLabel?.slice(0, 200) ?? null, p.tlfDescription, p.contributor.slice(0, 200), p.contributors, p.description, p.rootNodeId, source, sheetHeaders, sheetMeta, p.braVersion?.slice(0, 50) ?? null, p.publicComment],
    );
    projectKey = r.rows[0].project_key;
  } else {
    projectKey = existingKey;
    await db.query(
      `UPDATE bradb_projects SET roi_circuit_id=$2, roi_label=$3, tlf_description=$4, contributor=$5, contributors=$6, description=$7, root_node_id=$8,
         source_file=$9, cobrac_generated=TRUE, sheet_headers=$10, sheet_meta=$11, bra_version=$12, public_comment=$13, version=version+1, updated_at=NOW()
       WHERE project_key=$1`,
      [projectKey, p.roiCircuitId.slice(0, 100), p.roiLabel?.slice(0, 200) ?? null, p.tlfDescription, p.contributor.slice(0, 200), p.contributors, p.description, p.rootNodeId, source, sheetHeaders, sheetMeta, p.braVersion?.slice(0, 50) ?? null, p.publicComment],
    );
    // graph: this project's nodes and connection edges are rebuilt; circuits are updated in place below
    await runCypher(db, `MATCH ()-[e:PROJECTS]->() WHERE e.project_id = ${cypherValue(pid)} DELETE e`);
    await runCypher(db, `MATCH (n:BRANode {project_id: ${cypherValue(pid)}}) DETACH DELETE n`);
    await db.query("DELETE FROM bradb_connections WHERE project_key = $1", [projectKey]);
    await db.query("DELETE FROM bradb_bra_nodes WHERE project_key = $1", [projectKey]);
    await db.query("DELETE FROM bradb_project_literature WHERE project_key = $1", [projectKey]);
  }

  // circuits: own (or ownerless) definitions are upserted; other projects' definitions are shared vocabulary and kept
  const skipped: string[] = [];
  const written = new Set<string>();
  for (const c of b.circuits) {
    const r = await db.query(
      `INSERT INTO bradb_local_circuits (circuit_id, circuit_kind, source_of_id, names, graph_order, is_uniform, transmitter, modulation_type, sub_circuit_ids,
         contributor, region, layer, approval_status, origin_project_key, extra, source_row_no, size, output_semantics_0, physiological_data, comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$1,NULL,'unverified',$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (circuit_id) DO UPDATE SET circuit_kind=EXCLUDED.circuit_kind, source_of_id=EXCLUDED.source_of_id, names=EXCLUDED.names,
         graph_order=EXCLUDED.graph_order, is_uniform=EXCLUDED.is_uniform, transmitter=EXCLUDED.transmitter, modulation_type=EXCLUDED.modulation_type,
         sub_circuit_ids=EXCLUDED.sub_circuit_ids, contributor=EXCLUDED.contributor, region=EXCLUDED.region, layer=EXCLUDED.layer,
         approval_status=EXCLUDED.approval_status, approval_source=NULL, verified_at=NULL, origin_project_key=EXCLUDED.origin_project_key,
         extra=EXCLUDED.extra, source_row_no=EXCLUDED.source_row_no, size=EXCLUDED.size, output_semantics_0=EXCLUDED.output_semantics_0,
         physiological_data=EXCLUDED.physiological_data, comments=EXCLUDED.comments, updated_at=NOW()
       WHERE bradb_local_circuits.origin_project_key IS NULL OR bradb_local_circuits.origin_project_key = EXCLUDED.origin_project_key
       RETURNING local_circuit_key`,
      [
        c.circuitId,
        c.circuitKind,
        c.sourceOfId,
        c.names,
        c.graphOrder,
        c.isUniform,
        c.transmitter,
        c.modulationType,
        json(c.subCircuitIds),
        (c.contributor ?? p.contributor).slice(0, 200),
        projectKey,
        json(c.extra),
        c.sourceRowNo || null,
        c.size,
        c.outputSemantics0,
        c.physiologicalData,
        c.comments,
      ],
    );
    if (r.rowCount) written.add(c.circuitId);
    else skipped.push(c.circuitId);
  }
  const stale = await db.query<{ circuit_id: string }>("SELECT circuit_id FROM bradb_local_circuits WHERE origin_project_key = $1 AND NOT (circuit_id = ANY($2))", [projectKey, [...written]]);
  for (const { circuit_id } of stale.rows) await runCypher(db, `MATCH (c {circuit_id: ${cypherValue(circuit_id)}}) DETACH DELETE c`);
  if (stale.rows.length) await db.query("DELETE FROM bradb_local_circuits WHERE origin_project_key = $1 AND NOT (circuit_id = ANY($2))", [projectKey, [...written]]);

  // literature: a shared master by Reference ID; a DOI already used by another Reference ID is kept in extra
  for (const l of b.literature) {
    let doi = l.doi;
    let extra = l.extra;
    if (doi) {
      const other = await db.query<{ literature_id: string }>("SELECT literature_id FROM bradb_literature WHERE doi = $1 AND literature_id <> $2", [doi, l.literatureId]);
      if (other.rows.length) {
        b.warnings.push(`References ${l.literatureId}: DOI ${doi} is already registered as ${other.rows[0].literature_id}; kept in extra`);
        extra = { ...(extra ?? {}), DOI: doi };
        doi = null;
      }
    }
    await db.query(
      `INSERT INTO bradb_literature (literature_id, doi, url, literature_type, bibtex, contributor, title, authors, journal_name, extra, source_row_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (literature_id) DO UPDATE SET doi=COALESCE(EXCLUDED.doi, bradb_literature.doi), url=COALESCE(EXCLUDED.url, bradb_literature.url),
         literature_type=COALESCE(EXCLUDED.literature_type, bradb_literature.literature_type), bibtex=COALESCE(EXCLUDED.bibtex, bradb_literature.bibtex),
         title=COALESCE(EXCLUDED.title, bradb_literature.title), authors=COALESCE(EXCLUDED.authors, bradb_literature.authors),
         journal_name=COALESCE(EXCLUDED.journal_name, bradb_literature.journal_name), extra=COALESCE(EXCLUDED.extra, bradb_literature.extra), updated_at=NOW()`,
      [l.literatureId, doi, l.url, l.literatureType, l.bibtex, p.contributor.slice(0, 200), l.title, l.authors, l.journalName, json(extra), l.sourceRowNo],
    );
    await db.query(
      `INSERT INTO bradb_project_literature (project_key, literature_key, contributor) SELECT $1, literature_key, $2 FROM bradb_literature WHERE literature_id = $3 ON CONFLICT DO NOTHING`,
      [projectKey, p.contributor.slice(0, 200), l.literatureId],
    );
  }

  // node history continues across registrations: compare with each node's latest history row
  const prev = await db.query<Record<string, string | number | null>>(
    `SELECT DISTINCT ON (node_id) node_id, version, ${NODE_FIELDS.join(", ")} FROM bradb_bra_node_history WHERE project_key = $1 ORDER BY node_id, version DESC`,
    [projectKey],
  );
  const prevBy = new Map(prev.rows.map((r) => [String(r.node_id), r]));
  const changes: BradbNodeChanges = { added: [], removed: [], changed: [] };
  const note = `CoBRAC ${req.manifest.versionId}${req.manifest.parentVersionId ? ` (parent ${req.manifest.parentVersionId})` : ""}, content ${req.manifest.contentSha256.slice(0, 12)}`;
  for (const n of b.nodes) {
    const before = prevBy.get(n.nodeId);
    const values = nodeValues(n);
    let version = before ? Number(before.version) : 1;
    if (!before || NODE_FIELDS.some((f, i) => (before[f] ?? null) !== values[i])) {
      version = before ? version + 1 : 1;
      (before ? changes.changed : changes.added).push(n.nodeId);
      await db.query(
        `INSERT INTO bradb_bra_node_history (node_id, project_key, version, ${NODE_FIELDS.join(", ")}, change_type, changed_by, change_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [n.nodeId, projectKey, version, ...values, before ? "update" : "import", p.contributor.slice(0, 200), note],
      );
    }
    await db.query(
      `INSERT INTO bradb_bra_nodes (project_key, node_id, source_row_no, node_role, capability, requirements, output_semantics, interface, implementation, mechanism,
         region_category, circuit_id, comments, extra, current_version, contributor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [projectKey, n.nodeId, n.sourceRowNo, n.nodeRole, n.capability, n.requirements, n.outputSemantics, n.interface, n.implementation, n.mechanism, n.regionCategory, n.circuitId?.slice(0, 100) ?? null, n.comments, json(n.extra), version, p.contributor.slice(0, 200)],
    );
  }
  const now = new Set(b.nodes.map((n) => n.nodeId));
  for (const id of prevBy.keys()) if (!now.has(id)) changes.removed.push(id);

  // connections
  const connectionKeys: number[] = [];
  for (const c of b.connections) {
    const r = await db.query<{ connection_key: number }>(
      `INSERT INTO bradb_connections (project_key, source_row_no, sender_circuit_id, receiver_circuit_id, sender_relation, receiver_relation, sender_notation,
         receiver_notation, reference_id, taxon, measurement_method, pointers_on_literature, pointers_on_figure, in_depth_literature, size, comments, derived_flow,
         approval_status, contributor, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'unverified',$18,$19) RETURNING connection_key`,
      [
        projectKey,
        c.sourceRowNo,
        c.senderCircuitId.slice(0, 100),
        c.receiverCircuitId.slice(0, 100),
        c.senderRelation,
        c.receiverRelation,
        c.senderNotation,
        c.receiverNotation,
        c.referenceId,
        c.taxon,
        c.measurementMethod,
        c.pointersOnLiterature,
        c.pointersOnFigure,
        c.inDepthLiterature,
        c.size,
        c.comments,
        c.derivedFlow,
        c.contributor?.slice(0, 200) ?? null,
        json(c.extra),
      ],
    );
    connectionKeys.push(r.rows[0].connection_key);
  }

  // graph
  for (const n of b.nodes) await runCypher(db, `CREATE (n:BRANode ${cypherProps({ node_id: n.nodeId, project_id: pid, node_role: n.nodeRole })})`);
  for (const c of b.circuits) {
    if (!written.has(c.circuitId)) continue;
    const label = c.circuitKind === "bif" ? "BIFCircuit" : "LocalCircuit";
    const key = cypherValue(c.circuitId);
    await runCypher(db, `MERGE (lc:${label} {circuit_id: ${key}})`);
    const sets = Object.entries({
      origin_project_id: pid,
      names: c.names,
      region: c.circuitId,
      layer: null,
      circuit_kind: c.circuitKind,
      source_of_id: c.sourceOfId,
      is_uniform: c.isUniform,
      transmitter: c.transmitter,
      approval_status: "unverified",
      approval_source: null,
    })
      .map(([k, v]) => `lc.${k} = ${cypherValue(v)}`)
      .join(", ");
    await runCypher(db, `MATCH (lc:${label} {circuit_id: ${key}}) SET ${sets}`);
    await runCypher(db, `MATCH (lc:${label} {circuit_id: ${key}})-[e:HAS_SUBCIRCUIT]->() DELETE e`);
  }
  for (const id of b.referencedCircuitIds) await runCypher(db, `MERGE (b:BIFCircuit {circuit_id: ${cypherValue(id)}})`);
  for (const c of b.circuits) {
    if (!written.has(c.circuitId) || !c.subCircuitIds) continue;
    for (const [k, child] of c.subCircuitIds.entries()) {
      const n = await runCypher(db, `MATCH (p {circuit_id: ${cypherValue(c.circuitId)}}), (c {circuit_id: ${cypherValue(child)}}) CREATE (p)-[e:HAS_SUBCIRCUIT ${cypherProps({ order: k + 1 })}]->(c) RETURN e`);
      if (!n) b.warnings.push(`Sub-Circuit ${child} of ${c.circuitId} is not in BRA-DB; no HAS_SUBCIRCUIT edge`);
    }
  }
  // edges whose ends are not in the graph are data problems: reported as warnings, not created
  const created = new Map<string, number>();
  const made = (type: string, n: number) => {
    if (n) created.set(type, (created.get(type) ?? 0) + 1);
    return n > 0;
  };
  for (const [i, c] of b.connections.entries()) {
    const props = cypherProps({ project_id: pid, connection_key: connectionKeys[i], derived_flow: c.derivedFlow, approval_status: "unverified" });
    const n = await runCypher(db, `MATCH (s {circuit_id: ${cypherValue(c.senderCircuitId)}}), (r {circuit_id: ${cypherValue(c.receiverCircuitId)}}) CREATE (s)-[e:PROJECTS ${props}]->(r) RETURN e`);
    if (!made("PROJECTS", n)) b.warnings.push(`Connection ${c.senderCircuitId} → ${c.receiverCircuitId}: a circuit is not in BRA-DB; no PROJECTS edge (the row is stored)`);
  }
  const ownNode = (id: string) => `(b:BRANode {node_id: ${cypherValue(id)}, project_id: ${cypherValue(pid)}})`;
  for (const e of b.edges) {
    const from = `(a:BRANode {node_id: ${cypherValue(e.from)}, project_id: ${cypherValue(pid)}})`;
    const to = cypherValue(e.to);
    let ok: boolean;
    if (e.type === "SUBNODE") ok = made(e.type, await runCypher(db, `MATCH ${from}, ${ownNode(e.to)} CREATE (a)-[e:SUBNODE ${cypherProps({ order: e.order })}]->(b) RETURN e`));
    else if (e.type === "PROJECTS_TO") {
      // Projected Circuits are Circuit IDs; older sheets wrote node IDs, or U.<Circuit ID>
      const candidates = [`(b {circuit_id: ${to}})`, ownNode(e.to), ...(e.to.startsWith("U.") ? [`(b {circuit_id: ${cypherValue(e.to.slice(2))}})`] : [])];
      ok = false;
      for (const target of candidates) if (!ok) ok = made(e.type, await runCypher(db, `MATCH ${from}, ${target} CREATE (a)-[e:PROJECTS_TO]->(b) RETURN e`));
    } else {
      const label = e.type === "MAPS_TO_BIF" ? "BIFCircuit" : "LocalCircuit";
      ok = made(e.type, await runCypher(db, `MATCH ${from}, (b:${label} {circuit_id: ${to}}) CREATE (a)-[e:${e.type}]->(b) RETURN e`));
    }
    if (!ok) b.warnings.push(`${e.type} ${e.from} → ${e.to}: the target is not in BRA-DB; no edge`);
  }

  const counts: BradbCounts = { circuits: written.size, connections: b.connections.length, nodes: b.nodes.length, literature: b.literature.length };
  return { projectKey, counts, changes, skipped, created };
}

const countOf = async (db: Db, cypher: string) => {
  const r = await db.query<{ n: string }>(`SELECT n::text AS n FROM cypher('bradb_graph', $q$ ${cypher} $q$) AS (n agtype)`);
  return Number(r.rows[0]?.n ?? 0);
};

/** v3.10 check_integrity: SQL and the graph agree on this project's nodes, and the graph holds every edge written. */
async function checkIntegrity(db: Db, b: Bundle, projectKey: number, created: Map<string, number>): Promise<string[]> {
  const errors: string[] = [];
  const pid = cypherValue(b.project.projectId);
  const graphNodes = await countOf(db, `MATCH (n:BRANode {project_id: ${pid}}) RETURN count(n)`);
  const sqlNodes = Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM bradb_bra_nodes WHERE project_key = $1", [projectKey])).rows[0].n);
  if (graphNodes !== b.nodes.length || sqlNodes !== b.nodes.length) errors.push(`BRANode: expected ${b.nodes.length}, graph ${graphNodes}, SQL ${sqlNodes}`);
  const sqlConn = Number((await db.query<{ n: string }>("SELECT count(*) AS n FROM bradb_connections WHERE project_key = $1", [projectKey])).rows[0].n);
  if (sqlConn !== b.connections.length) errors.push(`Connections: expected ${b.connections.length}, SQL ${sqlConn}`);
  const graphConn = await countOf(db, `MATCH ()-[e:PROJECTS]->() WHERE e.project_id = ${pid} RETURN count(e)`);
  if (graphConn !== (created.get("PROJECTS") ?? 0)) errors.push(`PROJECTS: written ${created.get("PROJECTS") ?? 0}, graph ${graphConn}`);
  for (const type of ["SUBNODE", "PROJECTS_TO", "MAPS_TO_BIF", "MAPS_TO_LOCAL"]) {
    const got = await countOf(db, `MATCH (a:BRANode {project_id: ${pid}})-[e:${type}]->() RETURN count(e)`);
    if (got !== (created.get(type) ?? 0)) errors.push(`${type}: written ${created.get(type) ?? 0}, graph ${got}`);
  }
  return errors;
}

function rowToRegistration(r: Record<string, unknown>): BradbRegistration {
  const parse = <T>(v: unknown, d: T): T => (v === null || v === undefined ? d : typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
  return {
    registrationId: Number(r.registration_id),
    versionId: String(r.version_id),
    version: Number(r.version),
    parentVersionId: (r.parent_version_id as string | null) ?? null,
    contentSha256: String(r.content_sha256),
    status: r.status as BradbRegistration["status"],
    mode: r.mode as BradbRegistration["mode"],
    reason: (r.reason as string | null) ?? null,
    counts: parse(r.counts, null),
    changes: parse(r.changes, null),
    skippedCircuits: parse(r.skipped, []),
    warnings: parse(r.warnings, []),
    requestedBy: (r.requested_by as string | null) ?? null,
    registeredAt: new Date(r.registered_at as string).toISOString(),
  };
}

export async function registrationStatus(db: Db, projectId: string): Promise<BradbStatusResponse> {
  const rows = await db.query("SELECT * FROM cobrac.registrations WHERE project_id = $1 ORDER BY registration_id DESC LIMIT 50", [projectId]);
  const cur = await db.query<{ version_id: string; content_sha256: string; registered_at: Date; project_key: number | null }>(
    "SELECT version_id, content_sha256, registered_at, project_key FROM cobrac.current_versions WHERE project_id = $1",
    [projectId],
  );
  const c = cur.rows[0];
  return {
    projectId,
    current: c ? { versionId: c.version_id, contentSha256: c.content_sha256, registeredAt: new Date(c.registered_at).toISOString(), projectKey: c.project_key } : null,
    registrations: rows.rows.map(rowToRegistration),
  };
}
