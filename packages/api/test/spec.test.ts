import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEC_PDF_NAME, type SpecResponse } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.stubEnv("ARTIFACTS_BUCKET", "artifacts-bucket");
vi.stubEnv("AWS_REGION", "ap-northeast-1");
vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
vi.stubEnv("AWS_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY");

const { S3Client } = await import("@aws-sdk/client-s3");
const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const USER = { sub: "sub-user", email: "user@example.com" };
const now = "2026-10-04T00:00:00.000Z";
fake.put("users", { userId: ADMIN.sub, email: ADMIN.email, displayName: "Admin", contributorName: "A", role: "admin", disabled: false, apiKeyRegistered: true, createdAt: now, updatedAt: now });

function call(who: typeof ADMIN, path = "/admin/spec") {
  return app.request(path, { method: "GET" }, { event: { requestContext: { authorizer: { jwt: { claims: who } } } }, lambdaContext: {} });
}

/** A tiny one-page PDF; `note` makes each fixture a different file (another hash, another S3 key). */
function pdf(note: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n% ${note}\n%%EOF\n`,
    "latin1",
  );
}
/** A DOCS_ROOT holding the PDF (or nothing). */
function docsRoot(body?: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "cobrac-spec-"));
  if (body) writeFileSync(join(dir, SPEC_PDF_NAME), body);
  return dir;
}

type Sent = { name: string; input: { Bucket: string; Key: string; Body?: Uint8Array; ContentType?: string } };
let sent: Sent[] = [];
/** What HeadObject finds, by key */
let existing: Record<string, { ContentLength: number; LastModified: Date }> = {};

beforeEach(() => {
  sent = [];
  existing = {};
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: { constructor: { name: string }; input: Sent["input"] }) => {
    sent.push({ name: cmd.constructor.name, input: cmd.input });
    if (cmd.constructor.name === "HeadObjectCommand") {
      const hit = existing[cmd.input.Key];
      if (!hit) throw Object.assign(new Error("NotFound"), { name: "NotFound" });
      return hit;
    }
    return {};
  }) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /admin/spec", () => {
  it("refuses non-admins without touching S3", async () => {
    vi.stubEnv("DOCS_ROOT", docsRoot(pdf("user")));
    expect((await call(USER)).status).toBe(403);
    expect(sent).toEqual([]);
  });

  it("answers 404 with a reason when the PDF is not in the bundle", async () => {
    vi.stubEnv("DOCS_ROOT", docsRoot());
    const res = await call(ADMIN);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain(SPEC_PDF_NAME);
    expect(sent).toEqual([]);
  });

  it("uploads a new version once, then hands out presigned inline and download URLs", async () => {
    const body = pdf("new");
    const sha = createHash("sha256").update(body).digest("hex");
    const key = `admin-docs/spec-${sha.slice(0, 16)}.pdf`;
    vi.stubEnv("DOCS_ROOT", docsRoot(body));

    const res = await call(ADMIN);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as SpecResponse;
    expect(spec).toMatchObject({ fileName: SPEC_PDF_NAME, bytes: body.length, sha256: sha });
    expect(Date.parse(spec.updatedAt!)).toBeGreaterThan(Date.now() - 60_000);
    expect(sent.map((s) => [s.name, s.input.Key])).toEqual([["HeadObjectCommand", key], ["PutObjectCommand", key]]);
    const put = sent[1].input;
    expect(put).toMatchObject({ Bucket: "artifacts-bucket", ContentType: "application/pdf" });
    expect(Buffer.from(put.Body!).equals(body)).toBe(true);

    const view = new URL(spec.url);
    expect(view.host).toBe("artifacts-bucket.s3.ap-northeast-1.amazonaws.com");
    expect(decodeURIComponent(view.pathname)).toBe(`/${key}`);
    expect(view.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(view.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(view.searchParams.get("response-content-disposition")).toBe(`inline; filename="CoBRAC_spec.pdf"; filename*=UTF-8''${encodeURIComponent(SPEC_PDF_NAME)}`);
    const download = new URL(spec.downloadUrl);
    expect(download.pathname).toBe(view.pathname);
    expect(download.searchParams.get("response-content-disposition")).toMatch(/^attachment; /);

    // the same file is neither looked up nor uploaded again by this container
    sent = [];
    const again = (await (await call(ADMIN)).json()) as SpecResponse;
    expect(again.sha256).toBe(sha);
    expect(again.updatedAt).toBe(spec.updatedAt);
    expect(sent).toEqual([]);
  });

  it("does not upload a version S3 already holds, and reports when it was stored", async () => {
    const body = pdf("stored");
    const key = `admin-docs/spec-${createHash("sha256").update(body).digest("hex").slice(0, 16)}.pdf`;
    existing[key] = { ContentLength: body.length, LastModified: new Date("2026-10-01T09:00:00.000Z") };
    vi.stubEnv("DOCS_ROOT", docsRoot(body));

    const spec = (await (await call(ADMIN)).json()) as SpecResponse;
    expect(spec.updatedAt).toBe("2026-10-01T09:00:00.000Z");
    expect(sent.map((s) => s.name)).toEqual(["HeadObjectCommand"]);
  });

  it("replaces an object of the wrong size (an interrupted upload)", async () => {
    const body = pdf("partial");
    const key = `admin-docs/spec-${createHash("sha256").update(body).digest("hex").slice(0, 16)}.pdf`;
    existing[key] = { ContentLength: 3, LastModified: new Date("2026-10-01T09:00:00.000Z") };
    vi.stubEnv("DOCS_ROOT", docsRoot(body));

    expect((await call(ADMIN)).status).toBe(200);
    expect(sent.map((s) => s.name)).toEqual(["HeadObjectCommand", "PutObjectCommand"]);
  });

  it("tries S3 again on the next request after a failed upload", async () => {
    vi.stubEnv("DOCS_ROOT", docsRoot(pdf("retry")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.mocked(S3Client.prototype.send);
    const ok = send.getMockImplementation()!;
    send.mockImplementationOnce(async () => {
      throw Object.assign(new Error("AccessDenied"), { name: "AccessDenied" });
    });
    expect((await call(ADMIN)).status).toBe(500);
    send.mockImplementation(ok);
    expect((await call(ADMIN)).status).toBe(200);
  });
});
