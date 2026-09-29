import { EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import type { ArtifactInfo, RunJobMessage } from "@cobrac/shared";
import { contentDisposition } from "@cobrac/shared";
import { env } from "../env.js";

const kms = new KMSClient({ region: env.region });
const s3 = new S3Client({ region: env.region });
const sqs = new SQSClient({ region: env.region });
const ecs = new ECSClient({ region: env.region });

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
      if (rel.startsWith("thread/")) continue;
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

function categorize(rel: string): ArtifactInfo["category"] {
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
