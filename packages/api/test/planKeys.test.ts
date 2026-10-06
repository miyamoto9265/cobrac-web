// BRA Planner stage 2: keys of plan objects. Only a whole path segment that is "..", "." or empty is refused, so a
// capability list whose name keeps inner dots ("capabilities..v2.xlsx") is read and attached like any other.
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachmentFileKey, safeAttachmentName, stagingKey } from "@cobrac/shared";

vi.stubEnv("ARTIFACTS_BUCKET", "artifacts-bucket");

/** An in-memory bucket behind the real helpers of aws.ts. */
const objects = new Map<string, string>();
const sent: string[] = [];
vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: { input: Record<string, string> }) => {
  const { Key: key, CopySource } = cmd.input;
  if (cmd instanceof GetObjectCommand) {
    sent.push(`get ${key}`);
    if (!objects.has(key)) throw Object.assign(new Error("no such key"), { name: "NoSuchKey" });
    const text = objects.get(key)!;
    return { Body: { transformToString: async () => text } };
  }
  if (cmd instanceof PutObjectCommand) {
    sent.push(`put ${key}`);
    objects.set(key, String(cmd.input.Body));
    return {};
  }
  if (cmd instanceof CopyObjectCommand) {
    const from = decodeURIComponent(CopySource.slice("artifacts-bucket/".length));
    sent.push(`copy ${from} -> ${key}`);
    objects.set(key, objects.get(from)!);
    return {};
  }
  if (cmd instanceof DeleteObjectCommand) {
    sent.push(`delete ${key}`);
    objects.delete(key);
    return {};
  }
  throw new Error("unexpected command");
}) as never);

const { getPlanJson, getStagingText, movePlanAttachment, putPlanJson } = await import("../src/lib/aws.js");
const { safeKeySegments } = await import("../src/lib/s3Keys.js");

const PLAN = "n7m2q9xa";

beforeEach(() => {
  objects.clear();
  sent.length = 0;
});

describe("plan object keys", () => {
  it("refuses only whole '..', '.' or empty segments", () => {
    for (const ok of ["staging/u1/up_abcdefgh/capabilities..v2.xlsx", "plans/n7m2q9xa/attachments/files/01-list...pdf", "staging/u1/up_x/Report_v1..3.csv", "a..b/c.txt"]) {
      expect(safeKeySegments(ok), ok).toBe(true);
    }
    for (const bad of ["staging/u1/../x.csv", "staging/u1/./x.csv", "staging//x.csv", "plans/n7m2q9xa/..", "staging/u1/x.csv/", "/plans/x"]) {
      expect(safeKeySegments(bad), bad).toBe(false);
    }
  });

  it("reads and moves a capability list whose name keeps inner dots", async () => {
    const names = ["capabilities..v2.xlsx", "list...pdf", "Report v1..3.csv"].map(safeAttachmentName);
    expect(names).toEqual(["capabilities..v2.xlsx", "list...pdf", "Report_v1..3.csv"]);
    const csv = stagingKey("u1", "up_abcdefgh", names[2]);
    objects.set(csv, "roi,tlf\nSTG,phonological processing\n");
    expect(await getStagingText(csv)).toBe("roi,tlf\nSTG,phonological processing\n");
    expect(await getStagingText(stagingKey("u1", "up_abcdefgh", "gone.csv"))).toBeNull();

    const xlsx = stagingKey("u1", "up_abcdefgh", names[0]);
    objects.set(xlsx, "PK-binary");
    const rel = attachmentFileKey(0, names[0]);
    await movePlanAttachment(xlsx, PLAN, rel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(objects.get(`plans/${PLAN}/${rel}`)).toBe("PK-binary");
    expect(objects.has(xlsx)).toBe(false);
  });

  it("refuses traversal and keys outside their prefix before touching the bucket", async () => {
    objects.set("staging/u1/up_abcdefgh/a.csv", "x");
    await expect(getStagingText("staging/u1/../u2/up_abcdefgh/a.csv")).rejects.toThrow("invalid staging key");
    await expect(getStagingText("users/u1/p1/a.csv")).rejects.toThrow("invalid staging key");
    await expect(movePlanAttachment("staging/u1/up_abcdefgh/../a.csv", PLAN, "attachments/files/01-a.csv", "text/csv")).rejects.toThrow("invalid staging key");
    await expect(movePlanAttachment("staging/u1/up_abcdefgh/a.csv", PLAN, "attachments/files/../../jobs/x/input.json", "text/csv")).rejects.toThrow("invalid plan attachment key");
    await expect(movePlanAttachment("staging/u1/up_abcdefgh/a.csv", "../users", "attachments/files/01-a.csv", "text/csv")).rejects.toThrow("invalid plan attachment key");
    await expect(getPlanJson("plans/../users/u1/p1/x.json")).rejects.toThrow("invalid plan key");
    await expect(putPlanJson("canons/c1/x.json", {})).rejects.toThrow("invalid plan key");
    expect(sent).toEqual([]);
    expect(objects.has("staging/u1/up_abcdefgh/a.csv")).toBe(true);

    // job files of a plan with dots in no segment are fine
    await putPlanJson(`plans/${PLAN}/jobs/job_1/input.json`, { kind: "draft" });
    expect(await getPlanJson(`plans/${PLAN}/jobs/job_1/input.json`)).toEqual({ kind: "draft" });
  });
});
