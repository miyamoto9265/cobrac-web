import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { env } from "./env.js";

const s3 = new S3Client({ region: env.region });

/** A JSON object of the artifacts bucket (e.g. a Canon revision under `canons/`), or null when it is missing. */
export async function getJsonObject<T>(key: string): Promise<T | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: key }));
    return JSON.parse(await r.Body!.transformToString("utf8")) as T;
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export function projectPrefix(userId: string, projectId: string) {
  return `users/${userId}/${projectId}/`;
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__pycache__") continue;
      yield* walk(p);
    } else if (entry.isFile()) {
      yield p;
    }
  }
}

const toKey = (p: string) => p.split(sep).join("/");

export async function listPrefix(prefix: string): Promise<{ key: string; size: number; lastModified: Date; etag: string }[]> {
  const out: { key: string; size: number; lastModified: Date; etag: string }[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(
      new ListObjectsV2Command({ Bucket: env.artifactsBucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? []) {
      if (!o.Key) continue;
      out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0), etag: (o.ETag ?? "").replace(/"/g, "") });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Upload a local directory to S3 under `prefix`. Optionally delete remote keys no longer present locally. */
export async function uploadDir(localDir: string, prefix: string, opts: { deleteMissing?: boolean } = {}) {
  if (!existsSync(localDir)) return { uploaded: 0, deleted: 0 };
  const remote = new Map((await listPrefix(prefix)).map((o) => [o.key, o]));
  const localKeys = new Set<string>();
  let uploaded = 0;

  for await (const file of walk(localDir)) {
    const rel = toKey(relative(localDir, file));
    const key = prefix + rel;
    localKeys.add(key);
    const body = await readFile(file);
    const md5 = createHash("md5").update(body).digest("hex");
    const r = remote.get(key);
    if (r && r.etag === md5 && r.size === body.length) continue; // unchanged
    await s3.send(new PutObjectCommand({ Bucket: env.artifactsBucket, Key: key, Body: body, ContentType: contentType(rel) }));
    uploaded++;
  }

  let deleted = 0;
  if (opts.deleteMissing) {
    const stale = [...remote.keys()].filter((k) => !localKeys.has(k));
    for (let i = 0; i < stale.length; i += 1000) {
      const chunk = stale.slice(i, i + 1000);
      await s3.send(
        new DeleteObjectsCommand({ Bucket: env.artifactsBucket, Delete: { Objects: chunk.map((Key) => ({ Key })) } }),
      );
      deleted += chunk.length;
    }
  }
  return { uploaded, deleted };
}

/** Download every object under `prefix` into `localDir`. */
export async function downloadDir(prefix: string, localDir: string): Promise<number> {
  const objs = await listPrefix(prefix);
  let n = 0;
  for (const o of objs) {
    const rel = o.key.slice(prefix.length);
    if (!rel || rel.endsWith("/")) continue;
    const dest = join(localDir, ...rel.split("/"));
    await mkdir(dirname(dest), { recursive: true });
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: o.key }));
    const bytes = await r.Body!.transformToByteArray();
    await writeFile(dest, bytes);
    n++;
  }
  return n;
}

export async function putObject(key: string, body: Buffer | string, contentTypeOverride?: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.artifactsBucket,
      Key: key,
      Body: body,
      ContentType: contentTypeOverride ?? contentType(key),
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

/** Conditional write (`If-None-Match: *`): false when the key already exists, so a written object is never replaced. */
export async function putObjectIfAbsent(key: string, body: Buffer | string, contentTypeOverride?: string): Promise<boolean> {
  try {
    await s3.send(new PutObjectCommand({ Bucket: env.artifactsBucket, Key: key, Body: body, ContentType: contentTypeOverride ?? contentType(key), IfNoneMatch: "*" }));
    return true;
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "PreconditionFailed" || err.$metadata?.httpStatusCode === 412) return false;
    throw e;
  }
}

export async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size;
  } catch {
    return -1;
  }
}

function contentType(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (n.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (n.endsWith(".json")) return "application/json";
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".jsonl")) return "application/x-ndjson";
  if (n.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (n.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
