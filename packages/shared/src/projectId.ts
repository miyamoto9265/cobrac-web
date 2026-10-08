// ---------------------------------------------------------------------------
// Project ID (globally unique and immutable) and project name (editable, may repeat).
// New IDs are random (`p` + 7 Crockford base32, e.g. `p7m2q9xa`); IDs issued earlier as `<userKey>-<seq>`
// stay valid as they are. Neither form says who owns the project: that is the `userId` attribute.
// ---------------------------------------------------------------------------

/** Crockford base32 in lower case (no i, l, o, u) */
export const USER_KEY_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const USER_KEY_REGEX = /^u[0-9a-hjkmnp-tv-z]{7}$/;
/** Random Project IDs (the form issued now) */
export const RANDOM_PROJECT_ID_REGEX = /^p[0-9a-hjkmnp-tv-z]{7}$/;
/** `<userKey>-<seq>` Project IDs issued from v0.7.0 until random IDs (still valid, never issued again) */
export const USER_SEQ_PROJECT_ID_REGEX = /^u[0-9a-hjkmnp-tv-z]{7}-[1-9][0-9]*$/;
/** Every current Project ID: the random form or the `<userKey>-<seq>` form */
export const PROJECT_ID_REGEX = /^(?:p[0-9a-hjkmnp-tv-z]{7}|u[0-9a-hjkmnp-tv-z]{7}-[1-9][0-9]*)$/;
/** User-chosen slugs used as Project IDs up to v0.6.x (unique per user only) */
export const LEGACY_PROJECT_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
/** Length of the random part of new Project and Canon IDs (32^7 ≈ 3.4×10^10 values) */
export const RANDOM_ID_LENGTH = 7;
/** How many fresh IDs to try when the reservation finds the drawn ID taken */
export const RANDOM_ID_ATTEMPTS = 5;

/** A uniform number in [0, 1) from the platform CSPRNG (Node 20+ and browsers). */
function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }).crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** `prefix` + `RANDOM_ID_LENGTH` lower-case Crockford base32 characters. */
export function randomCrockfordId(prefix: string, random: () => number = cryptoRandom): string {
  let s = prefix;
  for (let i = 0; i < RANDOM_ID_LENGTH; i++) s += USER_KEY_ALPHABET[Math.floor(random() * USER_KEY_ALPHABET.length) % USER_KEY_ALPHABET.length];
  return s;
}

/** A new random Project ID (`p7m2q9xa`). Uniqueness is checked when it is reserved. */
export function generateProjectId(random?: () => number): string {
  return randomCrockfordId("p", random);
}

export const PROJECT_NAME_MAX = 200;
const FILE_NAME_MAX = 80;

/** "provisional" = from the user's ROI/TLF at creation; "auto" = written by the agent; "user" = typed or edited by the user */
export type ProjectNameSource = "provisional" | "auto" | "user";

export function generateUserKey(random: () => number = Math.random): string {
  return randomCrockfordId("u", random);
}

/** The `<userKey>-<seq>` form (no longer issued for new projects; used by the v0.7.0 migration script). */
export function formatProjectId(userKey: string, seq: number): string {
  if (!USER_KEY_REGEX.test(userKey)) throw new Error(`invalid userKey: ${userKey}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`invalid project seq: ${seq}`);
  return `${userKey}-${seq}`;
}

/** The parts of a `<userKey>-<seq>` ID; null for random IDs (they carry no user) and anything else. */
export function parseProjectId(id: string): { userKey: string; seq: number } | null {
  if (!USER_SEQ_PROJECT_ID_REGEX.test(id)) return null;
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
 * Provisional project name from the user's ROI/TLF as typed (`<TLF> in <ROI>`, any language).
 * Stored with nameSource "provisional" until the agent writes `name` into meta.json.
 */
export function proposeProjectName(roi: string, tlf: string): string {
  const clean = (s: string) => s.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ").replace(/\s+/gu, " ").trim();
  const r = clean(roi);
  const t = clean(tlf);
  const name = t && r ? `${t} in ${r}` : t || r;
  return [...(name || "Untitled project")].slice(0, PROJECT_NAME_MAX).join("").trim();
}

/** The ASCII PascalCase slug stored as the initial name up to v0.8.1 (non-ASCII input was dropped). */
export function legacyProposedProjectName(roi: string, tlf: string): string {
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

/** `{name}_{ID}.template-v2-2.bra.xlsx`: the BRA data in the official Template-v2-2.bra workbook. */
export function templateDownloadFileName(name: string | null | undefined, projectId: string): { ascii: string; utf8: string } {
  const ascii = `${projectId}.template-v2-2.bra.xlsx`;
  const base = sanitizeFileNamePart(name ?? "");
  return { ascii, utf8: base ? `${base}_${ascii}` : ascii };
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

/** RFC 6266 / 5987 header value with an ASCII fallback and the UTF-8 name (`inline` shows the file in the browser). */
export function contentDisposition(ascii: string, utf8: string, type: "attachment" | "inline" = "attachment"): string {
  const fallback = ascii.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(utf8).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export type ProjectNameFields = { projectId: string; name?: string | null; nameSource?: ProjectNameSource | null; roi?: string | null; tlf?: string | null };

/**
 * Name to show and to use in download file names. A not-yet-agent-named project that still carries
 * the old ASCII slug (e.g. "VOR" for TLF "VOR" / ROI "小脳") shows the provisional `<TLF> in <ROI>`.
 */
export function projectDisplayName(p: ProjectNameFields): string {
  const name = p.name?.trim();
  const roi = p.roi ?? "";
  const tlf = p.tlf ?? "";
  const hasInput = !!(roi.trim() || tlf.trim());
  if (hasInput && p.nameSource === "provisional" && !name) return proposeProjectName(roi, tlf);
  if (hasInput && p.nameSource === "auto" && name === legacyProposedProjectName(roi, tlf)) return proposeProjectName(roi, tlf);
  return name || p.projectId;
}

/** Whether the agent may (re)write the name from meta.json. */
export function isAgentNameable(source: ProjectNameSource | null | undefined): boolean {
  return source === "auto" || source === "provisional";
}
