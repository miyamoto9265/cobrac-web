import { EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { ArtifactInfo, BradbRequest, RunJobMessage } from "@cobrac/shared";
import { DEFAULT_KEY_ENCRYPTION_CONTEXT, REVISIONS_PREFIX, contentDisposition, isPlanId, planPrefix } from "@cobrac/shared";
import { createHmac } from "node:crypto";
import { env } from "../env.js";

const kms = new KMSClient({ region: env.region });
const s3 = new S3Client({ region: env.region });
const sqs = new SQSClient({ region: env.region });
const ecs = new ECSClient({ region: env.region });
const lambdaClient = new LambdaClient({ region: env.region });

/** Calls the BRA-DB registration Lambda and returns its result (throws on a function error). */
export async function invokeBradb<T>(payload: BradbRequest): Promise<T> {
  const r = await lambdaClient.send(new InvokeCommand({ FunctionName: env.bradbImportFunction, InvocationType: "RequestResponse", Payload: Buffer.from(JSON.stringify(payload)) }));
  const text = r.Payload ? Buffer.from(r.Payload).toString("utf8") : "null";
  if (r.FunctionError) throw new Error(`BRA-DB: ${(JSON.parse(text) as { errorMessage?: string }).errorMessage ?? r.FunctionError}`);
  return JSON.parse(text) as T;
}

export async function encryptApiKey(plain: string, userId: string): Promise<string> {
  const r = await kms.send(
    new EncryptCommand({
      KeyId: env.kmsKeyId,
      Plaintext: Buffer.from(plain, "utf8"),
      EncryptionContext: { userId, purpose: "openai-api-key" },
    }),
  );
  return Buffer.from(r.CiphertextBlob!).toString("base64");
}

/** The default API key, under its own encryption context (no userId), so it is tied to no user. */
export async function encryptDefaultApiKey(plain: string): Promise<string> {
  const r = await kms.send(new EncryptCommand({ KeyId: env.kmsKeyId, Plaintext: Buffer.from(plain, "utf8"), EncryptionContext: { ...DEFAULT_KEY_ENCRYPTION_CONTEXT } }));
  return Buffer.from(r.CiphertextBlob!).toString("base64");
}

export function projectPrefix(userId: string, projectId: string) {
  return `users/${userId}/${projectId}/`;
}

export async function listArtifacts(userId: string, projectId: string): Promise<ArtifactInfo[]> {
  const prefix = projectPrefix(userId, projectId);
  const out: ArtifactInfo[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: env.artifactsBucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) {
      if (!o.Key) continue;
      const rel = o.Key.slice(prefix.length);
      // thread: the agent's session; revisions: frozen versions, listed by GET /projects/{id}/versions
      if (rel.startsWith("thread/") || rel.startsWith(REVISIONS_PREFIX)) continue;
      out.push({
        key: rel,
        name: rel.split("/").pop() ?? rel,
        size: o.Size ?? 0,
        lastModified: (o.LastModified ?? new Date(0)).toISOString(),
        category: categorize(rel),
      });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Numbers that have a folder under `revisions/` (a version exists only once its manifest.json is there). */
export async function listVersionNumbers(userId: string, projectId: string): Promise<number[]> {
  const prefix = projectPrefix(userId, projectId) + REVISIONS_PREFIX;
  const out: number[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: env.artifactsBucket, Prefix: prefix, Delimiter: "/", ContinuationToken: token }));
    for (const cp of r.CommonPrefixes ?? []) {
      const n = Number(cp.Prefix?.slice(prefix.length).replace(/\/$/, ""));
      if (Number.isInteger(n) && n >= 1) out.push(n);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => a - b);
}

function categorize(rel: string): ArtifactInfo["category"] {
  if (rel.startsWith("attachments/")) return "attachment";
  if (rel.startsWith("output/")) return "output";
  if (rel.startsWith("graph/")) return "graph";
  if (/^article\/[^/]+\.md$/.test(rel)) return "article";
  if (rel.includes("_CSV/")) return "csv";
  if (rel.includes("_HCD/")) return "hcd";
  if (rel.includes("_FRG/")) return "frg";
  if (/^workspace\/[^/]+\.md$/.test(rel)) return "doc";
  return "other";
}

export async function presignDownload(
  userId: string,
  projectId: string,
  rel: string,
  fileName?: { ascii: string; utf8: string },
  expiresIn = 900,
): Promise<string> {
  if (rel.includes("..") || rel.startsWith("thread/") || rel.startsWith("/")) throw new Error("invalid key");
  const key = projectPrefix(userId, projectId) + rel;
  const base = rel.split("/").pop() ?? "download";
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.artifactsBucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(fileName?.ascii ?? base, fileName?.utf8 ?? base),
    }),
    { expiresIn },
  );
}

export async function getObjectText(userId: string, projectId: string, rel: string): Promise<string | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: projectPrefix(userId, projectId) + rel }));
    return await r.Body!.transformToString("utf8");
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function getObjectBytes(userId: string, projectId: string, rel: string): Promise<Uint8Array | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: projectPrefix(userId, projectId) + rel }));
    return await r.Body!.transformToByteArray();
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function putObjectBytes(userId: string, projectId: string, rel: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: env.artifactsBucket, Key: projectPrefix(userId, projectId) + rel, Body: body, ContentType: contentType }));
}

export async function putObjectText(userId: string, projectId: string, rel: string, body: string, contentType = "application/json"): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: env.artifactsBucket, Key: projectPrefix(userId, projectId) + rel, Body: body, ContentType: contentType }));
}

export async function deleteObject(userId: string, projectId: string, rel: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.artifactsBucket, Key: projectPrefix(userId, projectId) + rel }));
}

/** Canon objects live under `canons/{canonId}/` of the artifacts bucket (outside every user prefix). */
export async function getCanonJson<T>(key: string): Promise<T | null> {
  if (!key.startsWith("canons/") || key.includes("..")) throw new Error("invalid canon key");
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: key }));
    return JSON.parse(await r.Body!.transformToString("utf8")) as T;
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function putCanonJson(key: string, value: unknown): Promise<void> {
  if (!key.startsWith("canons/") || key.includes("..")) throw new Error("invalid canon key");
  await s3.send(new PutObjectCommand({ Bucket: env.artifactsBucket, Key: key, Body: JSON.stringify(value), ContentType: "application/json" }));
}

/** BRA Planner objects live under `plans/{planId}/` of the artifacts bucket (job input / result, attachments). */
const checkPlanKey = (key: string) => {
  if (!key.startsWith("plans/") || key.includes("..")) throw new Error("invalid plan key");
};

export async function getPlanJson<T>(key: string): Promise<T | null> {
  checkPlanKey(key);
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: key }));
    return JSON.parse(await r.Body!.transformToString("utf8")) as T;
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function putPlanJson(key: string, value: unknown): Promise<void> {
  checkPlanKey(key);
  await s3.send(new PutObjectCommand({ Bucket: env.artifactsBucket, Key: key, Body: JSON.stringify(value), ContentType: "application/json" }));
}

/** Moves a staging upload to `plans/{planId}/{rel}` (rel under `attachments/files/`), like `moveStagingToProject`. */
export async function movePlanAttachment(stagingKey: string, planId: string, rel: string, contentType: string): Promise<void> {
  if (!stagingKey.startsWith("staging/") || stagingKey.includes("..")) throw new Error("invalid staging key");
  if (!isPlanId(planId) || !rel.startsWith("attachments/files/") || rel.includes("..")) throw new Error("invalid plan attachment key");
  const key = planPrefix(planId) + rel;
  await s3.send(
    new CopyObjectCommand({
      Bucket: env.artifactsBucket,
      CopySource: `${env.artifactsBucket}/${stagingKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: key,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket: env.artifactsBucket, Key: stagingKey }));
}

/** Text of an uploaded staging object (a capability list read before it is moved); null when it does not exist. */
export async function getStagingText(stagingKey: string): Promise<string | null> {
  if (!stagingKey.startsWith("staging/") || stagingKey.includes("..")) throw new Error("invalid staging key");
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.artifactsBucket, Key: stagingKey }));
    return await r.Body!.transformToString("utf8");
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function enqueueRun(msg: RunJobMessage, delaySeconds = 0) {
  await sqs.send(
    new SendMessageCommand({ QueueUrl: env.jobQueueUrl, MessageBody: JSON.stringify(msg), DelaySeconds: delaySeconds }),
  );
}

export async function stopEcsTask(taskArn: string, reason: string) {
  if (!env.ecs.clusterArn) return;
  try {
    await ecs.send(new StopTaskCommand({ cluster: env.ecs.clusterArn, task: taskArn, reason }));
  } catch (e) {
    console.warn("stopTask failed", e);
  }
}

const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

/**
 * Presigned POST (SigV4 POST policy) for one browser upload to `key`: the policy pins the key and Content-Type and
 * limits the size, which a presigned PUT cannot do.
 */
export async function presignUpload(key: string, contentType: string, maxBytes: number, expiresIn = 900): Promise<{ url: string; fields: Record<string, string> }> {
  const creds = await s3.config.credentials();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const credential = `${creds.accessKeyId}/${day}/${env.region}/s3/aws4_request`;
  const fields: Record<string, string> = {
    key,
    "Content-Type": contentType,
    "x-amz-algorithm": "AWS4-HMAC-SHA256",
    "x-amz-credential": credential,
    "x-amz-date": amzDate,
    ...(creds.sessionToken ? { "x-amz-security-token": creds.sessionToken } : {}),
  };
  const policy = {
    expiration: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    conditions: [{ bucket: env.artifactsBucket }, ["content-length-range", 1, maxBytes], ...Object.entries(fields).map(([k, v]) => ({ [k]: v }))],
  };
  const encoded = Buffer.from(JSON.stringify(policy), "utf8").toString("base64");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), env.region), "s3"), "aws4_request");
  fields.Policy = encoded;
  fields["X-Amz-Signature"] = createHmac("sha256", signingKey).update(encoded, "utf8").digest("hex");
  return { url: `https://${env.artifactsBucket}.s3.${env.region}.amazonaws.com/`, fields };
}

/** Size of an uploaded staging object, or null when it does not exist. */
export async function headStaging(key: string): Promise<{ size: number } | null> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: env.artifactsBucket, Key: key }));
    return { size: r.ContentLength ?? 0 };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw e;
  }
}

/** Move a staging upload into the project (copy + delete; the copy gets the canonical Content-Type). */
export async function moveStagingToProject(stagingKey: string, userId: string, projectId: string, rel: string, contentType: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: env.artifactsBucket,
      CopySource: `${env.artifactsBucket}/${stagingKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: projectPrefix(userId, projectId) + rel,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket: env.artifactsBucket, Key: stagingKey }));
}
