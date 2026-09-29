import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("ARTIFACTS_BUCKET", "artifacts-bucket");
vi.stubEnv("AWS_REGION", "ap-northeast-1");
vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
vi.stubEnv("AWS_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY");
vi.stubEnv("AWS_SESSION_TOKEN", "session-token");

const { presignUpload } = await import("../src/lib/aws.js");

describe("presignUpload", () => {
  it("signs a POST policy that pins bucket, key, type and size (SigV4)", async () => {
    const { url, fields } = await presignUpload("staging/u1/up_x/a.pdf", "application/pdf", 1000, 900);
    expect(url).toBe("https://artifacts-bucket.s3.ap-northeast-1.amazonaws.com/");
    const policy = JSON.parse(Buffer.from(fields.Policy, "base64").toString("utf8")) as { expiration: string; conditions: unknown[] };
    expect(policy.conditions).toEqual([
      { bucket: "artifacts-bucket" },
      ["content-length-range", 1, 1000],
      { key: "staging/u1/up_x/a.pdf" },
      { "Content-Type": "application/pdf" },
      { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
      { "x-amz-credential": fields["x-amz-credential"] },
      { "x-amz-date": fields["x-amz-date"] },
      { "x-amz-security-token": "session-token" },
    ]);
    const day = fields["x-amz-date"].slice(0, 8);
    expect(fields["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(fields["x-amz-credential"]).toBe(`AKIDEXAMPLE/${day}/ap-northeast-1/s3/aws4_request`);
    expect(Date.parse(policy.expiration) - Date.now()).toBeGreaterThan(890_000);

    const h = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();
    const key = h(h(h(h("AWS4wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", day), "ap-northeast-1"), "s3"), "aws4_request");
    expect(fields["X-Amz-Signature"]).toBe(createHmac("sha256", key).update(fields.Policy).digest("hex"));
  });
});
