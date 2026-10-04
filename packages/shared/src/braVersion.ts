// ---------------------------------------------------------------------------
// Versions of a project's BRA data. Every COMPLETED BRA job (initial, follow-up, retry) freezes what it produced as
// version n = the project's `revision` after the job: an immutable copy under `revisions/{n}/` of the project prefix
// with a manifest (generation conditions, content hash, parent, change summary) and a BRA-DB registration package
// (the five CSVs under the names the BRA-DB import script reads, plus its own manifest). DynamoDB keeps a summary on
// the job that produced the version (`JobRecord.braVersion`) and the latest one on the project.
//
// Projects finished before versioning have no snapshots: their current data is version `revision` ("live") until a
// follow-up freezes it first (origin "baseline"), so existing references (`clonedFrom.revision`, Canon
// `projectRevision`, article `sourceRevision`) keep pointing at the same number.
// ---------------------------------------------------------------------------

import { strToU8, zipSync, type Zippable } from "fflate";
import { parseCsv } from "./csv.js";
import { CSV_FILE_NAMES, type CsvFileName } from "./harness.js";
import type { JobType, ReasoningEffort } from "./types.js";

export const BRA_VERSION_MANIFEST_SCHEMA = "cobrac.bra-version/1";
export const BRADB_PACKAGE_SCHEMA = "cobrac.bradb-package/1";
/** BRA-DB the package targets: schema v4.6, read by import_bra_project v3.10 or later. */
export const BRADB_TARGET = { schema: "v4.6", importScript: "import_bra_project v3.10+" } as const;

/** `<projectId>@v<n>`: globally unique, because Project IDs are never reused. */
export const braVersionId = (projectId: string, version: number) => `${projectId}@v${version}`;

export function parseBraVersionId(id: string): { projectId: string; version: number } | null {
  const m = /^(.+)@v([1-9]\d{0,5})$/.exec(id);
  return m ? { projectId: m[1], version: Number(m[2]) } : null;
}

export const isVersionNumber = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 999_999;

// --- S3 keys (relative to `users/{userId}/{projectId}/`) ----------------------------------------------------------

export const REVISIONS_PREFIX = "revisions/";
export const versionPrefix = (n: number) => `${REVISIONS_PREFIX}${n}/`;
export const versionManifestKey = (n: number) => `${versionPrefix(n)}manifest.json`;
/** `path` is where the file lives in the project prefix (`workspace/…`, `output/…`, `graph/…`). */
export const versionFileKey = (n: number, path: string) => `${versionPrefix(n)}files/${path}`;
export const bradbPackagePrefix = (n: number) => `${versionPrefix(n)}bradb/`;
export const bradbZipKey = (n: number) => `${versionPrefix(n)}bradb.zip`;

/** Version number of a key under `revisions/` (null for any other key). */
export function versionOfKey(rel: string): number | null {
  const m = /^revisions\/(\d+)\//.exec(rel);
  return m ? Number(m[1]) : null;
}

/** Path of a CSV in the project prefix (`workspace/{P}_CSV/Circuits.csv`). */
export const csvPath = (projectId: string, csv: CsvFileName) => `workspace/${projectId}_CSV/${csv}`;

/** BRA-DB import file names: `{project_id}_project.csv` … `{project_id}_frg.csv`. */
export const BRADB_CSV_SUFFIX: Record<CsvFileName, string> = {
  "Project.csv": "project",
  "References.csv": "references",
  "Circuits.csv": "circuits",
  "Connections.csv": "connections",
  "FRG.csv": "frg",
};
export const bradbCsvName = (projectId: string, csv: CsvFileName) => `${projectId}_${BRADB_CSV_SUFFIX[csv]}.csv`;
export const bradbZipFileName = (projectId: string, n: number) => `${projectId}-v${n}-bradb.zip`;

/**
 * Text whose SHA-256 is the content hash of a version: one line `<CSV name>\t<sha256 of its bytes>` per CSV in
 * `CSV_FILE_NAMES` order. Only the five CSVs count (they are what BRA-DB stores), so the hash is the same however the
 * files are named or packed; a missing CSV is written as `-`.
 */
export function contentHashInput(csvSha256: Partial<Record<CsvFileName, string>>): string {
  return CSV_FILE_NAMES.map((f) => `${f}\t${csvSha256[f] ?? "-"}\n`).join("");
}

// --- manifest ------------------------------------------------------------------------------------------------------

/** `job`: frozen when the job finished. `baseline`: data of a project made before versioning, frozen by the next follow-up. */
export type BraVersionOrigin = "job" | "baseline";

export interface BraVersionRef {
  versionId: string;
  projectId: string;
  version: number;
}

/** Conditions the version was generated under (null where it is not known, e.g. on a baseline). */
export interface BraVersionGenerator {
  appVersion: string | null;
  gitSha: string | null;
  /** SHA-256 over the harness prompts (`prompts/`: rules, phase specs, templates) */
  promptsSha256: string | null;
  /** SHA-256 of the JSON Schemas of the agent's data files (`HARNESS_SCHEMAS`) */
  schemasSha256: string | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  researchMode: boolean | null;
  canon: { canonId: string; revision: number } | null;
  /** SABRA BNA/DHBA boundary version reported by RCS (`get_sabra_definition`) */
  sabraBoundary: string | null;
  /** `BRA version` of Project.csv (the CoBRAC CSV format) */
  braFormat: string | null;
}

export interface BraVersionFile {
  path: string;
  sha256: string;
  size: number;
}

export interface BraTableCounts {
  added: number;
  removed: number;
  changed: number;
}

export type BraTable = "Project" | "References" | "Circuits" | "Connections" | "FRG";
export const BRA_TABLES: readonly BraTable[] = ["Project", "References", "Circuits", "Connections", "FRG"];
export type BraChangeSummary = Record<BraTable, BraTableCounts>;

export interface BraVersionManifest {
  schema: typeof BRA_VERSION_MANIFEST_SCHEMA;
  versionId: string;
  projectId: string;
  version: number;
  /** Version this one was made from: the previous version, or the public project version a clone copied */
  parent: BraVersionRef | null;
  origin: BraVersionOrigin;
  createdAt: string;
  contributor: string;
  job: { jobId: string; type: JobType; instruction: string | null } | null;
  generator: BraVersionGenerator;
  contentSha256: string;
  files: BraVersionFile[];
  /** Against the parent's CSVs (null when the parent has no snapshot to compare with) */
  changes: BraChangeSummary | null;
  bradb: { prefix: string; zip: string; files: string[] } | null;
}

/** DynamoDB copy of a manifest (on the job that produced it, and the latest on the project). */
export interface BraVersionSummary {
  version: number;
  versionId: string;
  parentVersionId: string | null;
  origin: BraVersionOrigin;
  createdAt: string;
  contentSha256: string;
  appVersion: string | null;
  gitSha: string | null;
  changes: BraChangeSummary | null;
  hasBradbPackage: boolean;
}

export function summarizeManifest(m: BraVersionManifest): BraVersionSummary {
  return {
    version: m.version,
    versionId: m.versionId,
    parentVersionId: m.parent?.versionId ?? null,
    origin: m.origin,
    createdAt: m.createdAt,
    contentSha256: m.contentSha256,
    appVersion: m.generator.appVersion,
    gitSha: m.generator.gitSha,
    changes: m.changes,
    hasBradbPackage: !!m.bradb,
  };
}

/** BRA-DB registration package manifest (`revisions/{n}/bradb/manifest.json`, also inside `bradb.zip`). */
export interface BradbPackageManifest {
  schema: typeof BRADB_PACKAGE_SCHEMA;
  target: typeof BRADB_TARGET;
  /** BRA-DB `project_id` (one CoBRAC project = one BRA-DB project) */
  projectId: string;
  versionId: string;
  version: number;
  parentVersionId: string | null;
  /** Same hash as the version manifest; registering a hash already registered is a no-op */
  contentSha256: string;
  files: { name: string; source: CsvFileName; sha256: string; size: number }[];
  /** `bradb_projects.bra_version`: the CSV format of these files */
  braVersion: string | null;
  cobracGenerated: true;
  importType: "cobrac";
  contributor: string;
  createdAt: string;
  provenance: BraVersionGenerator & { origin: BraVersionOrigin; jobId: string | null };
  /**
   * How to import: `replace` when a parent exists (the project is already in BRA-DB while it is reserved), and
   * `allowShrink` when the change removes Circuits or Connections (import v3.10 stops on shrink otherwise).
   */
  import: { replace: boolean; allowShrink: boolean };
}

export function buildBradbManifest(m: BraVersionManifest, files: BradbPackageManifest["files"]): BradbPackageManifest {
  const shrinks = !!m.changes && (m.changes.Circuits.removed > 0 || m.changes.Connections.removed > 0);
  return {
    schema: BRADB_PACKAGE_SCHEMA,
    target: BRADB_TARGET,
    projectId: m.projectId,
    versionId: m.versionId,
    version: m.version,
    parentVersionId: m.parent?.versionId ?? null,
    contentSha256: m.contentSha256,
    files,
    braVersion: m.generator.braFormat,
    cobracGenerated: true,
    importType: "cobrac",
    contributor: m.contributor,
    createdAt: m.createdAt,
    provenance: { ...m.generator, origin: m.origin, jobId: m.job?.jobId ?? null },
    import: { replace: m.parent !== null && m.parent.projectId === m.projectId, allowShrink: shrinks },
  };
}

/** `bradb.zip`: the package files at the top level, with a fixed timestamp so the same package gives the same bytes. */
export function zipBradbPackage(files: Record<string, Uint8Array | string>): Uint8Array {
  const z: Zippable = {};
  for (const [name, body] of Object.entries(files)) z[name] = [typeof body === "string" ? strToU8(body) : body, { mtime: ZIP_MTIME }];
  return zipSync(z, { level: 6 });
}
const ZIP_MTIME = new Date("2026-01-01T00:00:00Z");

/** `BRA version` cell of Project.csv (row 2, column 5). */
export function braFormatOf(projectCsv: string | null): string | null {
  if (!projectCsv) return null;
  return parseCsv(projectCsv)[1]?.[4]?.trim() || null;
}

// --- API DTOs ------------------------------------------------------------------------------------------------------

/** `live`: the current data of a project that has no snapshot for its current revision yet (made before versioning). */
export interface BraVersionListItem extends Omit<BraVersionSummary, "origin" | "contentSha256"> {
  origin: BraVersionOrigin | "live";
  contentSha256: string | null;
  frozen: boolean;
  jobId: string | null;
  jobType: JobType | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  instruction: string | null;
}

export interface ListBraVersionsResponse {
  /** Newest first */
  items: BraVersionListItem[];
  /** The project's revision (= number of the version that is current) */
  current: number;
  /** Parent of the next version when the project is a clone that has no version yet */
  clonedFrom: string | null;
}

export interface BraVersionDetailResponse {
  item: BraVersionListItem;
  manifest: BraVersionManifest | null;
  /** Files that can be downloaded (`path` as in the manifest) */
  files: { path: string; size: number; sha256: string | null }[];
}

export interface BraVersionDiffResponse {
  head: number;
  base: number | null;
  diff: BraVersionDiff | null;
}

// --- diff ----------------------------------------------------------------------------------------------------------

export interface BraFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface BraRowChange {
  key: string;
  fields: BraFieldChange[];
}

export interface BraTableDiff {
  table: BraTable;
  added: string[];
  removed: string[];
  changed: BraRowChange[];
}

export interface BraVersionDiff {
  tables: BraTableDiff[];
  summary: BraChangeSummary;
}

const TABLE_OF: Record<CsvFileName, BraTable> = {
  "Project.csv": "Project",
  "References.csv": "References",
  "Circuits.csv": "Circuits",
  "Connections.csv": "Connections",
  "FRG.csv": "FRG",
};

/**
 * Row identity per table, matching the keys BRA-DB uses: Reference ID, Circuit ID, (sCID, rCID, Reference ID) for a
 * Connection, Node ID for the FRG. Columns are found by header, so CSVs from older formats compare as well.
 */
const KEY_COLUMNS: Record<Exclude<BraTable, "Project">, string[]> = {
  References: ["Reference ID"],
  Circuits: ["Circuit ID"],
  Connections: ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)", "Reference ID"],
  FRG: ["Node ID"],
};

interface KeyedRows {
  columns: string[];
  rows: Map<string, Record<string, string>>;
  order: string[];
}

function keyedRows(table: BraTable, text: string | null): KeyedRows {
  const out: KeyedRows = { columns: [], rows: new Map(), order: [] };
  if (!text) return out;
  const all = parseCsv(text);
  if (table === "Project") {
    // row 2 holds the project; the Review End Lines below only follow the row counts of the other tables
    const header = (all[0] ?? []).map((h) => h.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => h && (row[h] = (all[1]?.[i] ?? "").trim()));
    out.columns = header.filter(Boolean);
    out.rows.set("project", row);
    out.order.push("project");
    return out;
  }
  const header = (all[0] ?? []).map((h) => h.trim());
  out.columns = header.filter(Boolean);
  const keyIdx = KEY_COLUMNS[table].map((k) => header.indexOf(k));
  const seen = new Map<string, number>();
  for (const cells of all.slice(1)) {
    if (cells.every((c) => c.trim() === "")) continue;
    const row: Record<string, string> = {};
    header.forEach((h, i) => h && (row[h] = (cells[i] ?? "").trim()));
    const base = keyIdx.map((i) => (i < 0 ? "" : (cells[i] ?? "").trim())).join(" → ").replace(/ → $/, "");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = n > 1 ? `${base} #${n}` : base;
    out.rows.set(key, row);
    out.order.push(key);
  }
  return out;
}

export function diffBraTable(table: BraTable, before: string | null, after: string | null): BraTableDiff {
  const a = keyedRows(table, before);
  const b = keyedRows(table, after);
  const columns = [...new Set([...a.columns, ...b.columns])];
  const added = b.order.filter((k) => !a.rows.has(k));
  const removed = a.order.filter((k) => !b.rows.has(k));
  const changed: BraRowChange[] = [];
  for (const k of b.order) {
    const x = a.rows.get(k);
    const y = b.rows.get(k)!;
    if (!x) continue;
    const fields = columns.filter((c) => (x[c] ?? "") !== (y[c] ?? "")).map((c) => ({ field: c, before: x[c] ?? "", after: y[c] ?? "" }));
    if (fields.length) changed.push({ key: k, fields });
  }
  return { table, added, removed, changed };
}

/** Row-level differences of the five CSVs between two versions (`null` = file missing). */
export function diffBraCsvs(before: Partial<Record<CsvFileName, string | null>>, after: Partial<Record<CsvFileName, string | null>>): BraVersionDiff {
  const tables = CSV_FILE_NAMES.map((f) => diffBraTable(TABLE_OF[f], before[f] ?? null, after[f] ?? null));
  return { tables, summary: summarizeDiff(tables) };
}

export function summarizeDiff(tables: BraTableDiff[]): BraChangeSummary {
  const out = Object.fromEntries(BRA_TABLES.map((t) => [t, { added: 0, removed: 0, changed: 0 }])) as BraChangeSummary;
  for (const t of tables) out[t.table] = { added: t.added.length, removed: t.removed.length, changed: t.changed.length };
  return out;
}

export const isEmptyChange = (s: BraChangeSummary) => BRA_TABLES.every((t) => s[t].added + s[t].removed + s[t].changed === 0);
