import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPEC_PDF_ASCII_NAME, SPEC_PDF_NAME, SPEC_URL_TTL_SECONDS, contentDisposition, type SpecResponse } from "@cobrac/shared";
import { headAdminDoc, presignAdminDoc, putAdminDoc } from "./aws.js";

/**
 * Directory that holds `CoBRAC_仕様書.pdf`: DOCS_ROOT, else `admin-docs/` next to the Lambda handler (copied there by
 * the CDK bundling), else `docs/` of the repository checkout (local runs).
 */
function specDir(): string {
  if (process.env.DOCS_ROOT) return process.env.DOCS_ROOT;
  if (process.env.LAMBDA_TASK_ROOT) return join(process.env.LAMBDA_TASK_ROOT, "admin-docs");
  return fileURLToPath(new URL("../../../../docs/", import.meta.url));
}

interface SpecFile {
  body: Buffer;
  sha256: string;
  /** `admin-docs/spec-<first 16 hex of the SHA-256>.pdf`: a new file gets a new object, so old URLs never show it */
  key: string;
}

/** The bundled file, read and hashed once per path (one per container in Lambda). A missing file is not cached. */
let local: { path: string; file: Promise<SpecFile | null> } | null = null;
/** S3 keys known to hold their file, with the time it was stored there */
const stored = new Map<string, Promise<string | undefined>>();

async function readSpec(path: string): Promise<SpecFile | null> {
  let body: Buffer;
  try {
    body = await readFile(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  const sha256 = createHash("sha256").update(body).digest("hex");
  return { body, sha256, key: `admin-docs/spec-${sha256.slice(0, 16)}.pdf` };
}

function specFile(): Promise<SpecFile | null> {
  const path = join(specDir(), SPEC_PDF_NAME);
  if (local?.path === path) return local.file;
  const file = readSpec(path);
  const entry = { path, file };
  local = entry;
  // Look again on the next request when the file is missing or unreadable.
  const forget = () => {
    if (local === entry) local = null;
  };
  file.then((f) => f || forget(), forget);
  return file;
}

/** Uploads the file under its key unless an object of the same size is already there; returns when it was stored. */
function ensureStored(f: SpecFile): Promise<string | undefined> {
  let done = stored.get(f.key);
  if (!done) {
    done = (async () => {
      const head = await headAdminDoc(f.key);
      if (head && head.size === f.body.length) return head.lastModified ?? undefined;
      await putAdminDoc(f.key, f.body, "application/pdf");
      return new Date().toISOString();
    })();
    stored.set(f.key, done);
    done.catch(() => stored.delete(f.key));
  }
  return done;
}

/** GET /admin/spec: presigned URLs of the specification PDF, or null when the PDF is not in the bundle. */
export async function specLinks(): Promise<SpecResponse | null> {
  const f = await specFile();
  if (!f) return null;
  const updatedAt = await ensureStored(f);
  const presign = (type: "inline" | "attachment") =>
    presignAdminDoc(f.key, { contentType: "application/pdf", disposition: contentDisposition(SPEC_PDF_ASCII_NAME, SPEC_PDF_NAME, type) }, SPEC_URL_TTL_SECONDS);
  const [url, downloadUrl] = await Promise.all([presign("inline"), presign("attachment")]);
  return { url, downloadUrl, fileName: SPEC_PDF_NAME, bytes: f.body.length, sha256: f.sha256, ...(updatedAt ? { updatedAt } : {}) };
}
