import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { BraVersionFile, BraVersionGenerator, BraVersionManifest, BraVersionOrigin, BraVersionRef, CsvFileName } from "@cobrac/shared";
import {
  BRA_VERSION_MANIFEST_SCHEMA,
  CSV_FILE_NAMES,
  HARNESS_SCHEMAS,
  braFormatOf,
  braVersionId,
  bradbCsvName,
  bradbPackagePrefix,
  bradbZipKey,
  buildBradbManifest,
  contentHashInput,
  csvPath,
  diffBraCsvs,
  templateXlsxKey,
  versionFileKey,
  versionManifestKey,
  zipBradbPackage,
} from "@cobrac/shared";

/** S3 access of the snapshot writer (keys are full bucket keys); tests pass an in-memory store. */
export interface VersionStore {
  get(key: string): Promise<Buffer | null>;
  put(key: string, body: Buffer | string, contentType?: string): Promise<void>;
  /** Writes only when the key does not exist yet; false when it already did */
  putIfAbsent(key: string, body: string, contentType?: string): Promise<boolean>;
}

export interface FreezeInput {
  /** `users/{userId}/{projectId}/` */
  prefix: string;
  projectId: string;
  version: number;
  parent: BraVersionRef | null;
  origin: BraVersionOrigin;
  createdAt: string;
  contributor: string;
  job: BraVersionManifest["job"];
  generator: Omit<BraVersionGenerator, "braFormat">;
  /** Workspace on disk (`/work/{projectId}`), the same files as `workspace/` in S3 */
  workspaceDir: string;
}

export type FreezeResult = { status: "created" | "exists"; manifest: BraVersionManifest } | { status: "conflict"; manifest: BraVersionManifest };

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** Workspace files kept in a version: the data, checks and notes. Logs (`*.jsonl`) are left out; the xlsx comes from `output/`. */
const keepWorkspaceFile = (rel: string) => !/\.(jsonl|xlsx)$/i.test(rel);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

/**
 * Freezes the project's current data as version `input.version`: copies of the files under `revisions/{n}/files/`,
 * the BRA-DB package under `revisions/{n}/bradb/` (+ `bradb.zip`) and, last, `manifest.json`, written only if absent.
 * The manifest makes the version exist, so a crash before it leaves nothing that counts; running again for the same
 * job returns the existing version, and a version written by another job is reported as a conflict and left alone.
 */
export async function freezeVersion(input: FreezeInput, store: VersionStore): Promise<FreezeResult> {
  const { prefix, projectId: P, version: n } = input;
  const manifestKey = prefix + versionManifestKey(n);
  const existing = await readManifest(store, manifestKey);
  if (existing) return sameRun(existing, input) ? { status: "exists", manifest: existing } : { status: "conflict", manifest: existing };

  const files: { path: string; body: Buffer }[] = [];
  if (existsSync(input.workspaceDir)) {
    const found: string[] = [];
    for await (const f of walk(input.workspaceDir)) found.push(relative(input.workspaceDir, f).split(sep).join("/"));
    for (const rel of found.filter(keepWorkspaceFile).sort()) files.push({ path: `workspace/${rel}`, body: await readFile(join(input.workspaceDir, rel)) });
  }
  for (const path of [`output/${P}.bra.xlsx`, templateXlsxKey(P), "graph/hcd.json", "graph/frg.json"]) {
    const body = await store.get(prefix + path);
    if (body) files.push({ path, body });
  }

  const entries: BraVersionFile[] = [];
  for (const f of files) {
    await store.put(prefix + versionFileKey(n, f.path), f.body);
    entries.push({ path: f.path, sha256: sha256(f.body), size: f.body.length });
  }

  const csv = new Map<CsvFileName, Buffer>();
  for (const name of CSV_FILE_NAMES) {
    const f = files.find((x) => x.path === csvPath(P, name));
    if (f) csv.set(name, f.body);
  }
  const csvSha = Object.fromEntries([...csv].map(([name, body]) => [name, sha256(body)])) as Partial<Record<CsvFileName, string>>;
  const changes = await parentChanges(input, store, csv);

  const manifest: BraVersionManifest = {
    schema: BRA_VERSION_MANIFEST_SCHEMA,
    versionId: braVersionId(P, n),
    projectId: P,
    version: n,
    parent: input.parent,
    origin: input.origin,
    createdAt: input.createdAt,
    contributor: input.contributor,
    job: input.job,
    generator: { ...input.generator, braFormat: braFormatOf(csv.get("Project.csv")?.toString("utf8") ?? null) },
    contentSha256: sha256(contentHashInput(csvSha)),
    files: entries,
    changes,
    bradb: null,
  };

  if (csv.size === CSV_FILE_NAMES.length) {
    const pkgFiles = CSV_FILE_NAMES.map((name) => ({ name: bradbCsvName(P, name), source: name, sha256: csvSha[name]!, size: csv.get(name)!.length }));
    manifest.bradb = { prefix: bradbPackagePrefix(n), zip: bradbZipKey(n), files: [...pkgFiles.map((f) => f.name), "manifest.json"] };
    const pkgManifest = JSON.stringify(buildBradbManifest(manifest, pkgFiles), null, 2) + "\n";
    const zipped: Record<string, Buffer | string> = {};
    for (const f of pkgFiles) {
      const body = csv.get(f.source)!;
      await store.put(prefix + bradbPackagePrefix(n) + f.name, body, "text/csv; charset=utf-8");
      zipped[f.name] = body;
    }
    await store.put(prefix + bradbPackagePrefix(n) + "manifest.json", pkgManifest, "application/json");
    zipped["manifest.json"] = pkgManifest;
    await store.put(prefix + bradbZipKey(n), Buffer.from(zipBradbPackage(zipped)), "application/zip");
  }

  const written = await store.putIfAbsent(manifestKey, JSON.stringify(manifest, null, 2) + "\n", "application/json");
  if (written) return { status: "created", manifest };
  const winner = await readManifest(store, manifestKey);
  return winner && sameRun(winner, input) ? { status: "exists", manifest: winner } : { status: "conflict", manifest: winner ?? manifest };
}

const sameRun = (m: BraVersionManifest, input: FreezeInput) => m.origin === input.origin && (m.job?.jobId ?? null) === (input.job?.jobId ?? null);

async function readManifest(store: VersionStore, key: string): Promise<BraVersionManifest | null> {
  const b = await store.get(key);
  if (!b) return null;
  try {
    return JSON.parse(b.toString("utf8")) as BraVersionManifest;
  } catch {
    return null;
  }
}

/** Change summary against the parent, when the parent is a frozen version of the same project. */
async function parentChanges(input: FreezeInput, store: VersionStore, csv: Map<CsvFileName, Buffer>): Promise<BraVersionManifest["changes"]> {
  const parent = input.parent;
  if (!parent || parent.projectId !== input.projectId) return null;
  if (!(await readManifest(store, input.prefix + versionManifestKey(parent.version)))) return null;
  const before: Partial<Record<CsvFileName, string | null>> = {};
  for (const name of CSV_FILE_NAMES) before[name] = (await store.get(input.prefix + versionFileKey(parent.version, csvPath(input.projectId, name))))?.toString("utf8") ?? null;
  const after = Object.fromEntries(CSV_FILE_NAMES.map((name) => [name, csv.get(name)?.toString("utf8") ?? null]));
  return diffBraCsvs(before, after).summary;
}

/** SHA-256 over every file of the harness prompts (`<relative path>\t<sha256>` lines, sorted by path). */
export async function promptsSha256(dir: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  const lines: string[] = [];
  for await (const f of walk(dir)) if (!f.includes(`${sep}__pycache__${sep}`)) lines.push(`${relative(dir, f).split(sep).join("/")}\t${sha256(await readFile(f))}\n`);
  return sha256(lines.sort().join(""));
}

export const schemasSha256 = () => sha256(JSON.stringify(HARNESS_SCHEMAS));
