/**
 * Reference materials a user attaches when creating a project: uploaded files and URLs.
 *
 * S3 layout under the project prefix `users/<userId>/<projectId>/`:
 *   attachments/files/<NN>-<safe name>   uploaded originals (copied from staging by the API on create)
 *   attachments/derived/...              written once by the worker: extracted PDF text, fetched URL content, manifest.json
 * Uploads go straight from the browser to `staging/<userId>/<uploadId>/<safe name>` (presigned POST, expires after a day).
 * The worker mirrors `attachments/` into `<workDir>/materials/` for the agent.
 */

export type AttachmentKind = "pdf" | "image" | "text" | "office";

export interface AttachmentType {
  ext: string;
  mime: string;
  kind: AttachmentKind;
}

/** Accepted file types. Extensions decide; the browser's MIME type is replaced by the canonical one. */
export const ATTACHMENT_TYPES: readonly AttachmentType[] = [
  { ext: "pdf", mime: "application/pdf", kind: "pdf" },
  { ext: "png", mime: "image/png", kind: "image" },
  { ext: "jpg", mime: "image/jpeg", kind: "image" },
  { ext: "jpeg", mime: "image/jpeg", kind: "image" },
  { ext: "webp", mime: "image/webp", kind: "image" },
  { ext: "gif", mime: "image/gif", kind: "image" },
  { ext: "txt", mime: "text/plain", kind: "text" },
  { ext: "md", mime: "text/markdown", kind: "text" },
  { ext: "csv", mime: "text/csv", kind: "text" },
  { ext: "tsv", mime: "text/tab-separated-values", kind: "text" },
  { ext: "json", mime: "application/json", kind: "text" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "office" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "office" },
  { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "office" },
];

export const ATTACHMENT_LIMITS = {
  maxFiles: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxUrls: 20,
  maxUrlLength: 2000,
  maxNameLength: 120,
} as const;

/** `accept` attribute for the file picker */
export const ATTACHMENT_ACCEPT = [...new Set(ATTACHMENT_TYPES.flatMap((t) => [`.${t.ext}`, t.mime]))].join(",");

export function attachmentTypeOf(fileName: string): AttachmentType | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ATTACHMENT_TYPES.find((t) => t.ext === ext) ?? null;
}

/**
 * File name safe for S3 keys, shells and every OS: letters/digits of any script, `.`, `-`, `_`; everything else → `_`.
 * Keeps the extension and caps the length.
 */
export function safeAttachmentName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");
  const m = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(cleaned)!;
  const ext = (m[2] ?? "").toLowerCase();
  const stem = [...(m[1] || "file")].slice(0, ATTACHMENT_LIMITS.maxNameLength - ext.length).join("");
  return `${stem}${ext}`;
}

/** Display name kept in the project record (original name, trimmed, no control characters). */
export function attachmentDisplayName(fileName: string): string {
  const base = (fileName.split(/[\\/]/).pop() ?? "").replace(/[\p{Cc}]+/gu, " ").trim();
  return [...(base || "file")].slice(0, 200).join("");
}

/** WHATWG URL (Node and browsers); shared is compiled without DOM or Node typings. */
interface ParsedUrl {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  hash: string;
  toString(): string;
}
const UrlCtor = (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL;

export type UrlCheck = { url: string } | { error: "invalid" | "scheme" | "length" | "host" };

/** Accepts http(s) URLs with a public-looking host; the worker re-checks resolved addresses before fetching. */
export function normalizeAttachmentUrl(raw: string): UrlCheck {
  const s = raw.trim();
  if (s.length > ATTACHMENT_LIMITS.maxUrlLength) return { error: "length" };
  let u: ParsedUrl;
  try {
    u = new UrlCtor(s);
  } catch {
    return { error: "invalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "scheme" };
  if (u.username || u.password) return { error: "invalid" };
  if (!u.hostname.includes(".") || isPrivateHost(u.hostname)) return { error: "host" };
  u.hash = "";
  return { url: u.toString() };
}

/** Loopback, private, link-local (incl. cloud metadata) and other non-public addresses, as literal hosts. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return isPrivateAddress(h);
}

export function isPrivateAddress(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (!ip.includes(":")) return false;
  const h = ip.toLowerCase();
  if (h === "::" || h === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapped) return isPrivateAddress(mapped[1]);
  return /^(fc|fd|fe[89ab]|ff)/.test(h);
}

export interface FileAttachment {
  kind: "file";
  id: string;
  /** Original file name (display) */
  name: string;
  /** Relative to the project prefix: `attachments/files/<NN>-<safe name>` */
  key: string;
  size: number;
  contentType: string;
}

export interface UrlAttachment {
  kind: "url";
  id: string;
  url: string;
}

export type ProjectAttachment = FileAttachment | UrlAttachment;

export const ATTACHMENT_FILES_PREFIX = "attachments/files/";
export const ATTACHMENT_DERIVED_PREFIX = "attachments/derived/";

export const stagingKey = (userId: string, uploadId: string, safeName: string) => `staging/${userId}/${uploadId}/${safeName}`;

export const UPLOAD_ID_REGEX = /^up_[A-Za-z0-9]{8,40}$/;

/** Key of the n-th (0-based) uploaded file of a project. */
export const attachmentFileKey = (index: number, safeName: string) => `${ATTACHMENT_FILES_PREFIX}${String(index + 1).padStart(2, "0")}-${safeName}`;

/** Local folder (relative to the worker's work dir) where the agent finds the materials. */
export const MATERIALS_DIR = "materials";
