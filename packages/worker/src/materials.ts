/**
 * User-provided reference materials (files and URLs attached on the create screen) as agent inputs.
 *
 * `<workDir>/materials/` mirrors `attachments/` of the project in S3:
 *   files/<NN>-<name>        the uploaded originals
 *   derived/manifest.json    what the worker made of each item (written once, then reused by later runs)
 *   derived/<id>.txt         extracted PDF / Office text, fetched URL text
 *   derived/<id>.<ext>       a fetched PDF or image
 *   INDEX.md                 the list the agent reads (regenerated every run, not stored)
 * No AWS or env access here, so it can be tested without a deployment.
 */
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ProjectAttachment } from "@cobrac/shared";
import { ATTACHMENT_DERIVED_PREFIX, MATERIALS_DIR, attachmentTypeOf, isPrivateAddress, normalizeAttachmentUrl } from "@cobrac/shared";

export const MATERIALS_INDEX = "INDEX.md";
const MANIFEST = "manifest.json";
const MAX_URL_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const URL_TIMEOUT_MS = 20_000;
const EXTRACT_TIMEOUT_MS = 90_000;
/** Images larger than this are listed but not attached to the prompt */
const MAX_PROMPT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_IMAGES = 10;

export type MaterialStatus = "ok" | "failed" | "skipped";

export interface MaterialEntry {
  id: string;
  kind: "file" | "url";
  /** File name or URL */
  source: string;
  /** Original file / fetched binary, relative to the work dir */
  path: string | null;
  /** Plain text for the agent, relative to the work dir */
  textPath: string | null;
  /** Image the agent can look at */
  image: boolean;
  status: MaterialStatus;
  note: string;
  title?: string;
}

export interface Manifest {
  version: 1;
  createdAt: string;
  entries: MaterialEntry[];
}

export interface PreparedMaterials {
  entries: MaterialEntry[];
  /** Absolute paths of images to show the model in the first turn */
  images: string[];
  indexPath: string;
}

export interface MaterialsDeps {
  /** Mirror `attachments/` of the project into `dir` */
  download(dir: string): Promise<void>;
  /** Store `dir` (the derived folder) back under `attachments/derived/` */
  uploadDerived(dir: string): Promise<void>;
  fetchUrl?: typeof fetchPublicUrl;
  extractPdf?: (pdf: string, out: string) => Promise<void>;
  extractOffice?: (file: string, out: string) => Promise<void>;
  now?: () => string;
}

/** Materials folder for this run, or null when the project has none (the folder is removed then). */
export async function prepareMaterials(workDir: string, attachments: ProjectAttachment[] | undefined, deps: MaterialsDeps): Promise<PreparedMaterials | null> {
  const dir = join(workDir, MATERIALS_DIR);
  await rm(dir, { recursive: true, force: true });
  if (!attachments?.length) return null;
  await mkdir(dir, { recursive: true });
  await deps.download(dir);

  const derivedDir = join(dir, ATTACHMENT_DERIVED_PREFIX.slice("attachments/".length));
  const manifestPath = join(derivedDir, MANIFEST);
  let manifest = await readManifest(manifestPath);
  const known = new Set(manifest?.entries.map((e) => e.id));
  if (!manifest || attachments.some((a) => !known.has(a.id))) {
    await mkdir(derivedDir, { recursive: true });
    const entries: MaterialEntry[] = [];
    for (const a of attachments) {
      const prev = manifest?.entries.find((e) => e.id === a.id);
      entries.push(prev ?? (await deriveOne(workDir, dir, derivedDir, a, deps)));
    }
    manifest = { version: 1, createdAt: deps.now?.() ?? new Date().toISOString(), entries };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await deps.uploadDerived(derivedDir);
  }

  const indexPath = join(dir, MATERIALS_INDEX);
  await writeFile(indexPath, materialsIndex(manifest.entries), "utf8");
  const images: string[] = [];
  for (const e of manifest.entries) {
    if (!e.image || !e.path || images.length >= MAX_PROMPT_IMAGES) continue;
    const abs = join(workDir, e.path);
    const size = await stat(abs).then((s) => s.size, () => -1);
    if (size > 0 && size <= MAX_PROMPT_IMAGE_BYTES) images.push(abs);
  }
  return { entries: manifest.entries, images, indexPath };
}

async function readManifest(path: string): Promise<Manifest | null> {
  try {
    const m = JSON.parse(await readFile(path, "utf8")) as Manifest;
    return m?.version === 1 && Array.isArray(m.entries) ? m : null;
  } catch {
    return null;
  }
}

async function deriveOne(workDir: string, dir: string, derivedDir: string, a: ProjectAttachment, deps: MaterialsDeps): Promise<MaterialEntry> {
  const rel = (p: string) => relative(workDir, p).split("\\").join("/");
  if (a.kind === "file") {
    const file = join(dir, a.key.slice("attachments/".length));
    const entry: MaterialEntry = { id: a.id, kind: "file", source: a.name, path: rel(file), textPath: null, image: false, status: "ok", note: "" };
    if (!existsSync(file)) return { ...entry, path: null, status: "failed", note: "file missing from storage" };
    const type = attachmentTypeOf(a.key);
    try {
      if (type?.kind === "pdf") {
        const out = join(derivedDir, `${a.id}.txt`);
        await (deps.extractPdf ?? pdfToText)(file, out);
        entry.textPath = rel(out);
        entry.note = "text extracted from the PDF (layout, figures and tables may be lost; check the PDF for exact wording)";
      } else if (type?.kind === "office") {
        const out = join(derivedDir, `${a.id}.txt`);
        await (deps.extractOffice ?? officeToText)(file, out);
        entry.textPath = rel(out);
        entry.note = "text extracted from the document";
      } else if (type?.kind === "image") {
        entry.image = true;
        entry.note = "image";
      } else {
        entry.textPath = entry.path;
        entry.note = "plain text";
      }
    } catch (e) {
      entry.status = "failed";
      entry.note = `text extraction failed: ${errorText(e)}; open the original`;
    }
    return entry;
  }

  const entry: MaterialEntry = { id: a.id, kind: "url", source: a.url, path: null, textPath: null, image: false, status: "ok", note: "" };
  try {
    const r = await (deps.fetchUrl ?? fetchPublicUrl)(a.url);
    const type = r.contentType;
    if (type === "text/html" || type === "application/xhtml+xml") {
      const { title, text } = htmlToText(r.body.toString("utf8"));
      const out = join(derivedDir, `${a.id}.txt`);
      await writeFile(out, `Source: ${r.finalUrl}\nTitle: ${title}\n\n${text}\n`, "utf8");
      Object.assign(entry, { textPath: rel(out), title, note: "web page text (fetched once when the project started)" });
    } else if (type.startsWith("text/") || type === "application/json") {
      const out = join(derivedDir, `${a.id}.txt`);
      await writeFile(out, `Source: ${r.finalUrl}\n\n${r.body.toString("utf8")}\n`, "utf8");
      Object.assign(entry, { textPath: rel(out), note: "text document (fetched once when the project started)" });
    } else if (type === "application/pdf") {
      const pdf = join(derivedDir, `${a.id}.pdf`);
      await writeFile(pdf, r.body);
      const out = join(derivedDir, `${a.id}.txt`);
      entry.path = rel(pdf);
      try {
        await (deps.extractPdf ?? pdfToText)(pdf, out);
        Object.assign(entry, { textPath: rel(out), note: "PDF downloaded and its text extracted" });
      } catch (e) {
        entry.note = `PDF downloaded; text extraction failed: ${errorText(e)}`;
      }
    } else if (type.startsWith("image/") && attachmentTypeOf(`x.${type.slice(6).replace("jpeg", "jpg")}`)?.kind === "image") {
      const img = join(derivedDir, `${a.id}.${type.slice(6).replace("jpeg", "jpg")}`);
      await writeFile(img, r.body);
      Object.assign(entry, { path: rel(img), image: true, note: "image downloaded" });
    } else {
      Object.assign(entry, { status: "skipped", note: `content type ${type || "unknown"} is not converted; open the URL yourself if needed` });
    }
  } catch (e) {
    Object.assign(entry, { status: "failed", note: `could not fetch (${errorText(e)}); try opening the URL yourself` });
  }
  return entry;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** The list the agent reads first. Paths are relative to the work dir (the agent's working directory). */
export function materialsIndex(entries: MaterialEntry[]): string {
  const lines = [
    "# Reference materials from the user",
    "",
    "The user attached these when creating the project. Consult them: they show what the user has in mind (sources, figures, scope).",
    "They are not verified literature. Every claim you take from them must still be backed by a published source in references.json",
    "(real DOI / PMID, checked by the worker), and every quote must be copied from that published source, not from these files.",
    "Text marked as extracted or fetched may be incomplete; open the original when wording matters.",
    "",
  ];
  for (const e of entries) {
    const head = e.kind === "url" ? `URL ${e.source}` : `File "${e.source}"`;
    lines.push(`## ${e.id}: ${head}${e.title ? ` (${e.title})` : ""}`, "");
    if (e.path) lines.push(`- original: \`${e.path}\``);
    if (e.textPath && e.textPath !== e.path) lines.push(`- text: \`${e.textPath}\``);
    if (e.image) lines.push("- image: look at it (it is also attached to the first prompt)");
    lines.push(`- status: ${e.status}${e.note ? ` - ${e.note}` : ""}`, "");
  }
  return lines.join("\n");
}

/** One line for the phase prompt header. */
export function materialsHeaderLine(m: PreparedMaterials | null): string | null {
  if (!m) return null;
  return `Reference materials: ${m.entries.length} item(s) provided by the user, listed in ${MATERIALS_DIR}/${MATERIALS_INDEX} (consult them; they do not replace verified literature)`;
}

// --- conversions -----------------------------------------------------------------

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${(stderr || err.message).toString().trim().slice(0, 200)}`));
      else resolve();
    });
  });
}

export async function pdfToText(pdf: string, out: string): Promise<void> {
  await run("pdftotext", ["-enc", "UTF-8", "-layout", pdf, out]);
}

const OFFICE_SCRIPT = `
import re, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
names = z.namelist()
if "word/document.xml" in names:
    parts = ["word/document.xml"]
elif any(n.startswith("ppt/slides/slide") for n in names):
    parts = sorted([n for n in names if re.match(r"ppt/slides/slide\\d+\\.xml$", n)], key=lambda n: int(re.findall(r"\\d+", n)[-1]))
elif "xl/sharedStrings.xml" in names:
    parts = ["xl/sharedStrings.xml"]
else:
    parts = []
chunks = []
for p in parts:
    x = z.read(p).decode("utf-8", "replace")
    x = re.sub(r"</(w:p|a:p|si)>", "\\n", x)
    x = re.sub(r"<w:tab/>", "\\t", x)
    x = re.sub(r"<[^>]+>", "", x)
    for a, b in (("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&amp;", "&")):
        x = x.replace(a, b)
    chunks.append(("--- " + p + " ---\\n" if len(parts) > 1 else "") + x.strip())
open(out, "w", encoding="utf-8").write("\\n\\n".join(chunks) + "\\n")
`;

export async function officeToText(file: string, out: string): Promise<void> {
  await run(process.env.PYTHON_BIN ?? "python3", ["-c", OFFICE_SCRIPT, file, out]);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): { title: string; text: string } {
  const decode = (s: string) =>
    s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim());
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|head|title)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote|pre|table|ul|ol|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
    .filter((l, i, all) => l || (i > 0 && all[i - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

// --- fetching ------------------------------------------------------------------------

export interface FetchedUrl {
  finalUrl: string;
  /** Lower-case media type without parameters */
  contentType: string;
  body: Buffer;
}

export type HostLookup = (host: string) => Promise<string[]>;

const dnsLookup: HostLookup = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * GET a public http(s) URL: every hop (redirects included) must resolve only to public addresses, so the worker
 * never reaches the task metadata endpoint or anything else inside the VPC. Bodies are capped.
 */
export async function fetchPublicUrl(url: string, opts: { fetchImpl?: typeof fetch; lookupHost?: HostLookup; maxBytes?: number } = {}): Promise<FetchedUrl> {
  const doFetch = opts.fetchImpl ?? fetch;
  const resolveHost = opts.lookupHost ?? dnsLookup;
  const maxBytes = opts.maxBytes ?? MAX_URL_BYTES;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = normalizeAttachmentUrl(current);
    if ("error" in checked) throw new Error(`URL not allowed (${checked.error})`);
    const host = new URL(checked.url).hostname.replace(/^\[|\]$/g, "");
    const addresses = /^[\d.]+$|:/.test(host) ? [host] : await resolveHost(host);
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("host resolves to a non-public address");
    const res = await doFetch(checked.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(URL_TIMEOUT_MS),
      headers: { "User-Agent": "CoBRAC-Agents/1 (reference material fetch)", Accept: "text/html,application/xhtml+xml,application/pdf,text/plain,image/*;q=0.8,*/*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`HTTP ${res.status} without Location`);
      current = new URL(loc, checked.url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new Error(`larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    const body = await readCapped(res, maxBytes);
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { finalUrl: checked.url, contentType, body };
  }
  throw new Error("too many redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error(`larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
