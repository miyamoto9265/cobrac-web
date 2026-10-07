import { describe, expect, it, vi } from "vitest";
import type { DocContentResponse, DocListResponse } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const ADMIN = { sub: "sub-admin", email: "admin@example.com" };
const USER = { sub: "sub-user", email: "user@example.com" };
const now = "2026-10-04T00:00:00.000Z";
fake.put("users", { userId: ADMIN.sub, email: ADMIN.email, displayName: "Admin", contributorName: "A", role: "admin", disabled: false, apiKeyRegistered: true, createdAt: now, updatedAt: now });

function call(who: typeof ADMIN, path: string) {
  return app.request(path, { method: "GET" }, { event: { requestContext: { authorizer: { jwt: { claims: who } } } }, lambdaContext: {} });
}

describe("admin documentation", () => {
  it("lists the documents for an admin, without the release notes", async () => {
    const res = await call(ADMIN, "/admin/docs");
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as DocListResponse;
    const slugs = items.map((d) => d.slug);
    expect(slugs).toContain("01_設計仕様");
    expect(slugs.slice(-2)).toEqual(["README", "AGENTS"]);
    expect(slugs).not.toContain("CHANGELOG");
    const spec = items.find((d) => d.slug === "01_設計仕様")!;
    expect(spec.number).toBe("01");
    expect(spec.description).toMatch(/Design, features/);
    const archived = items.filter((d) => d.group === "archive");
    expect(archived.map((d) => d.slug)).toEqual([
      "04_CoBRAC_Harness_v0_to_v1", "04_CoBRAC_Harness_v0_to_v1_ja",
      "05_CoBRAC_Harness_v1_to_v1_1", "05_CoBRAC_Harness_v1_to_v1_1_ja",
      "07_CoBRAC_Harness_v1_1_to_v2", "07_CoBRAC_Harness_v1_1_to_v2_ja",
    ]);
    expect(items.filter((d) => d.group === "docs").every((d) => !/_to_v/.test(d.slug))).toBe(true);
  });

  it("returns a document with the SVG of its figures", async () => {
    const res = await call(ADMIN, `/admin/docs/${encodeURIComponent("04_CoBRAC_Harness_v0_to_v1_ja")}`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as DocContentResponse;
    expect(doc.text).toMatch(/^# CoBRAC ハーネス/);
    expect(doc.text).toContain("../figures/");
    const files = Object.keys(doc.figures);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith(".narrow.svg"))).toBe(true);
    expect(doc.figures[files[0]]).toMatch(/<svg/);
  });

  it("refuses non-admins and anything that is not a listed document", async () => {
    expect((await call(USER, "/admin/docs")).status).toBe(403);
    expect((await call(USER, "/admin/docs/README")).status).toBe(403);
    expect((await call(USER, "/admin/docs/04_CoBRAC_Harness_v0_to_v1_ja")).status).toBe(403);
    expect((await call(ADMIN, "/admin/docs/CHANGELOG")).status).toBe(404);
    expect((await call(ADMIN, `/admin/docs/${encodeURIComponent("../package")}`)).status).toBe(404);
    expect((await call(ADMIN, `/admin/docs/${encodeURIComponent("archive/04_CoBRAC_Harness_v0_to_v1_ja")}`)).status).toBe(404);
    expect((await call(ADMIN, "/admin/docs/nope")).status).toBe(404);
  });
});
