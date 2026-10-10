import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { UserRecord } from "@cobrac/shared";
import { nowIso } from "@cobrac/shared";
import { env } from "../env.js";
import { assignUserKey, getUser, newUniqueUserKey, putUser, updateUser } from "./db.js";

export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
}

export function extractAuth(event: unknown): AuthContext | null {
  const ev = event as Partial<APIGatewayProxyEventV2WithJWTAuthorizer>;
  const claims = ev.requestContext?.authorizer?.jwt?.claims as Record<string, unknown> | undefined;
  if (!claims) return null;
  const sub = String(claims.sub ?? "");
  if (!sub) return null;
  const email = String(claims.email ?? claims["cognito:username"] ?? "");
  const rawGroups = claims["cognito:groups"];
  let groups: string[] = [];
  if (Array.isArray(rawGroups)) groups = rawGroups.map(String);
  else if (typeof rawGroups === "string") groups = rawGroups.replace(/[[\]]/g, "").split(/[ ,]+/).filter(Boolean);
  return { userId: sub, email, groups };
}

/** Load the user record, creating it on first sign-in. */
export async function ensureUser(auth: AuthContext): Promise<UserRecord> {
  const existing = await getUser(auth.userId);
  const isAdmin = auth.groups.includes("admin") || env.adminEmails.includes(auth.email.toLowerCase());
  if (existing) {
    if (isAdmin && existing.role !== "admin") {
      await updateUser(auth.userId, { role: "admin" });
      existing.role = "admin";
    }
    if (!existing.userKey) existing.userKey = await assignUserKey(auth.userId);
    return existing;
  }
  const now = nowIso();
  const displayName = auth.email.split("@")[0] || "user";
  const user: UserRecord = {
    userId: auth.userId,
    email: auth.email,
    displayName,
    contributorName: displayName,
    role: isAdmin ? "admin" : "user",
    disabled: false,
    userKey: await newUniqueUserKey(),
    apiKeyRegistered: false,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await putUser(user, true);
  } catch (e) {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
    const raced = await getUser(auth.userId);
    if (raced) return raced;
    throw e;
  }
  return user;
}

export function toPublicUser(u: UserRecord) {
  const { encryptedApiKey: _omit, encryptedAnthropicKey: _omitAnthropic, ...rest } = u;
  return rest;
}
