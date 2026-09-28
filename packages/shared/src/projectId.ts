// ---------------------------------------------------------------------------
// Project ID (`<userKey>-<seq>`, globally unique and immutable) and project name (editable, may repeat)
// ---------------------------------------------------------------------------

/** Crockford base32 in lower case (no i, l, o, u) */
export const USER_KEY_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const USER_KEY_REGEX = /^u[0-9a-hjkmnp-tv-z]{7}$/;
export const PROJECT_ID_REGEX = /^u[0-9a-hjkmnp-tv-z]{7}-[1-9][0-9]*$/;
/** User-chosen slugs used as Project IDs up to v0.6.x (unique per user only) */
export const LEGACY_PROJECT_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;

export const PROJECT_NAME_MAX = 200;
const FILE_NAME_MAX = 80;

export type ProjectNameSource = "auto" | "user";

export function generateUserKey(random: () => number = Math.random): string {
  let s = "u";
  for (let i = 0; i < 7; i++) s += USER_KEY_ALPHABET[Math.floor(random() * USER_KEY_ALPHABET.length) % USER_KEY_ALPHABET.length];
  return s;
}

export function formatProjectId(userKey: string, seq: number): string {
  if (!USER_KEY_REGEX.test(userKey)) throw new Error(`invalid userKey: ${userKey}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`invalid project seq: ${seq}`);
  return `${userKey}-${seq}`;
}

export function parseProjectId(id: string): { userKey: string; seq: number } | null {
  if (!PROJECT_ID_REGEX.test(id)) return null;
  const i = id.lastIndexOf("-");
  return { userKey: id.slice(0, i), seq: Number(id.slice(i + 1)) };
}

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_REGEX.test(id);
}

export function isLegacyProjectId(id: string): boolean {
  return !PROJECT_ID_REGEX.test(id) && LEGACY_PROJECT_ID_REGEX.test(id);
}

/** Any ID that may name a project folder / S3 prefix (new or not yet migrated). */
export function isProjectIdLike(id: string): boolean {
  return PROJECT_ID_REGEX.test(id) || LEGACY_PROJECT_ID_REGEX.test(id);
}

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Normalise a project name: NFC, trim, collapse whitespace runs to one space.
 * Any language is allowed; only control characters and line breaks are rejected; 1–200 code points.
 */
export function normalizeProjectName(input: unknown): { name: string } | { error: string } {
  if (typeof input !== "string") return { error: "name must be a string" };
  const raw = input.normalize("NFC");
  if (/[\r\n\u2028\u2029]/.test(raw.trim())) return { error: "name must not contain line breaks" };
  const name = raw.replace(/\s+/gu, " ").trim();
  if (CONTROL_RE.test(name)) return { error: "name must not contain control characters" };
  const len = [...name].length;
  if (len < 1) return { error: "name is empty" };
  if (len > PROJECT_NAME_MAX) return { error: `name must be at most ${PROJECT_NAME_MAX} characters` };
  return { name };
}

/** Case-insensitive comparison key for the duplicate-name warning. */
export function projectNameKey(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * Initial project name proposed from ROI/TLF (ASCII PascalCase slug, TLF first).
 * Used until the agent writes `name` into meta.json.
 */
export function proposeProjectName(roi: string, tlf: string): string {
  const ascii = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, " ")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
  const a = ascii(tlf).slice(0, 32);
  const b = ascii(roi).slice(0, 24);
  const name = [a, b].filter(Boolean).join("_");
  return name || "Untitled project";
}

/**
 * Download file name `{name}_{ID}.bra.xlsx`.
 * `ascii` is for the plain `filename=` parameter, `utf8` for `filename*=UTF-8''…`.
 */
export function braDownloadFileName(name: string | null | undefined, projectId: string): { ascii: string; utf8: string } {
  const ascii = `${projectId}.bra.xlsx`;
  const base = sanitizeFileNamePart(name ?? "");
  return { ascii, utf8: base ? `${base}_${projectId}.bra.xlsx` : ascii };
}

export function sanitizeFileNamePart(name: string): string {
  const s = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f/\\:*?"<>|]|\s+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.\s]+|[_.\s]+$/gu, "");
  return [...s].slice(0, FILE_NAME_MAX).join("").replace(/[_.\s]+$/u, "");
}

/** RFC 6266 / 5987 header value with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(ascii: string, utf8: string): string {
  const fallback = ascii.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(utf8).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function projectDisplayName(p: { projectId: string; name?: string | null }): string {
  return p.name?.trim() || p.projectId;
}
