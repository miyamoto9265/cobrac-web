import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectAttachment } from "@cobrac/shared";
import { fetchPublicUrl, htmlToText, materialsHeaderLine, prepareMaterials, type FetchedUrl, type MaterialsDeps } from "../src/materials.js";

const hasPdftotext = spawnSync("pdftotext", ["-v"]).status === 0;

/** Smallest valid one-page PDF with the text "Purkinje cells fire" (xref offsets computed). */
function tinyPdf(): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 12 Tf 20 50 Td (Purkinje cells fire) Tj ET";
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

let work: string;
let store: string;
let uploads: number;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "materials-work-"));
  store = mkdtempSync(join(tmpdir(), "materials-s3-"));
  uploads = 0;
  mkdirSync(join(store, "files"), { recursive: true });
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

/** `store` plays the project's `attachments/` prefix in S3. */
const deps = (fetchUrl?: MaterialsDeps["fetchUrl"]): MaterialsDeps => ({
  download: async (dir) => cpSync(store, dir, { recursive: true }),
  uploadDerived: async (dir) => {
    uploads++;
    cpSync(dir, join(store, "derived"), { recursive: true });
  },
  fetchUrl,
  now: () => "2026-09-29T00:00:00.000Z",
});

const page = (html: string, finalUrl = "https://example.org/a"): FetchedUrl => ({ finalUrl, contentType: "text/html", body: Buffer.from(html) });

describe("prepareMaterials", () => {
  it("does nothing for a project without attachments and clears an old folder", async () => {
    mkdirSync(join(work, "materials"));
    expect(await prepareMaterials(work, undefined, deps())).toBeNull();
    expect(existsSync(join(work, "materials"))).toBe(false);
  });

  it("lists files and URLs, extracts text, fetches pages once and reuses the manifest later", async () => {
    writeFileSync(join(store, "files", "01-notes.md"), "# My notes\nflocculus");
    writeFileSync(join(store, "files", "02-fig.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(store, "files", "03-paper.pdf"), tinyPdf());
    const attachments: ProjectAttachment[] = [
      { kind: "file", id: "f1", name: "notes.md", key: "attachments/files/01-notes.md", size: 20, contentType: "text/markdown" },
      { kind: "file", id: "f2", name: "fig.png", key: "attachments/files/02-fig.png", size: 4, contentType: "image/png" },
      { kind: "file", id: "f3", name: "paper.pdf", key: "attachments/files/03-paper.pdf", size: 400, contentType: "application/pdf" },
      { kind: "url", id: "u1", url: "https://example.org/a" },
      { kind: "url", id: "u2", url: "https://example.org/broken" },
    ];
    let fetches = 0;
    const fetchUrl = async (url: string) => {
      fetches++;
      if (url.endsWith("broken")) throw new Error("HTTP 404");
      return page("<html><head><title>Flocculus &amp; VOR</title><script>x()</script></head><body><h1>Intro</h1><p>Climbing fibres&nbsp;teach.</p></body></html>");
    };
    const extractPdf = hasPdftotext ? undefined : async (_pdf: string, out: string) => writeFileSync(out, "Purkinje cells fire\n");

    const m = (await prepareMaterials(work, attachments, { ...deps(fetchUrl), extractPdf }))!;
    expect(m.entries.map((e) => [e.id, e.status])).toEqual([
      ["f1", "ok"],
      ["f2", "ok"],
      ["f3", "ok"],
      ["u1", "ok"],
      ["u2", "failed"],
    ]);
    expect(m.images).toEqual([join(work, "materials/files/02-fig.png")]);
    expect(readFileSync(join(work, "materials/derived/f3.txt"), "utf8")).toContain("Purkinje cells fire");
    const u1 = readFileSync(join(work, "materials/derived/u1.txt"), "utf8");
    expect(u1).toContain("Title: Flocculus & VOR");
    expect(u1).toContain("Climbing fibres teach.");
    expect(u1).not.toContain("x()");

    const index = readFileSync(m.indexPath, "utf8");
    expect(index).toContain("not verified literature");
    expect(index).toContain("`materials/files/01-notes.md`");
    expect(index).toContain("`materials/derived/f3.txt`");
    expect(index).toContain("URL https://example.org/broken");
    expect(index).toContain("could not fetch (HTTP 404)");
    expect(materialsHeaderLine(m)).toContain("5 item(s) provided by the user, listed in materials/INDEX.md");
    expect(uploads).toBe(1);

    // a later run (resume / follow-up) reuses what was derived: no refetch, no re-upload
    const again = (await prepareMaterials(work, attachments, deps(fetchUrl)))!;
    expect(fetches).toBe(2);
    expect(uploads).toBe(1);
    expect(again.entries).toEqual(m.entries);
  });

  it("records a failed extraction instead of failing the run", async () => {
    writeFileSync(join(store, "files", "01-bad.pdf"), "not a pdf");
    const m = (await prepareMaterials(work, [{ kind: "file", id: "f1", name: "bad.pdf", key: "attachments/files/01-bad.pdf", size: 9, contentType: "application/pdf" }], {
      ...deps(),
      extractPdf: async () => {
        throw new Error("pdftotext failed: Syntax Error");
      },
    }))!;
    expect(m.entries[0]).toMatchObject({ status: "failed", path: "materials/files/01-bad.pdf" });
    expect(m.entries[0].note).toContain("open the original");
  });
});

describe("fetchPublicUrl", () => {
  const ok = (body: string, type = "text/html; charset=utf-8", headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "content-type": type, ...headers } });

  it("refuses hosts that resolve to private addresses, also after a redirect", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (u: string) => {
      calls.push(u);
      return u.includes("start") ? new Response(null, { status: 302, headers: { location: "https://evil.example/meta" } }) : ok("secret");
    }) as unknown as typeof fetch;
    const lookupHost = async (h: string) => (h === "evil.example" ? ["169.254.169.254"] : ["93.184.216.34"]);
    await expect(fetchPublicUrl("https://good.example/start", { fetchImpl, lookupHost })).rejects.toThrow("non-public");
    expect(calls).toEqual(["https://good.example/start"]);
    await expect(fetchPublicUrl("http://127.0.0.1/", { fetchImpl, lookupHost })).rejects.toThrow("not allowed");
  });

  it("follows redirects, reports the media type and caps the size", async () => {
    const fetchImpl = (async (u: string) =>
      u.endsWith("/old") ? new Response(null, { status: 301, headers: { location: "/new" } }) : ok("<p>hi</p>")) as unknown as typeof fetch;
    const r = await fetchPublicUrl("https://example.org/old", { fetchImpl, lookupHost: async () => ["93.184.216.34"] });
    expect(r).toMatchObject({ finalUrl: "https://example.org/new", contentType: "text/html" });
    const big = (async () => ok("x".repeat(2000), "text/plain")) as unknown as typeof fetch;
    await expect(fetchPublicUrl("https://example.org/big", { fetchImpl: big, lookupHost: async () => ["93.184.216.34"], maxBytes: 1000 })).rejects.toThrow("larger than");
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, drops scripts and decodes entities", () => {
    const r = htmlToText("<title> A &#8211; B </title><style>p{}</style><p>One&lt;two</p><div>Three<br>Four</div>");
    expect(r.title).toBe("A – B");
    expect(r.text).toBe("One<two\nThree\nFour");
  });
});
