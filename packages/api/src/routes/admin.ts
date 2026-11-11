/** Admin routes (`/admin…`); every handler checks the admin role. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  AdminUpdateUserRequest,
  DefaultApiKeyRecord,
  UserRecord,
  ConcurrencySettingRecord,
  UpdateConcurrencyRequest,
} from "@cobrac/shared";
import {
  CONCURRENCY_CATALOG_KEY,
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  isConcurrencyLimit,
  DEFAULT_KEY_CATALOG_KEYS,
  nowIso,
  SPEC_PDF_NAME,
} from "@cobrac/shared";
import { toPublicUser } from "../lib/auth.js";
import { bad, notFound } from "../lib/http.js";
import { concurrencyStatus, getConcurrencySetting, putConcurrencySetting } from "../lib/concurrency.js";
import { stopProject } from "../lib/runs.js";
import { encryptDefaultApiKey } from "../lib/aws.js";
import { specLinks } from "../lib/spec.js";
import {
  getProject,
  getUser,
  listAllJobs,
  listAllProjects,
  listUsers,
  updateUser,
} from "../lib/db.js";
import { correctProjects } from "../lib/usageCorrection.js";
import { defaultKeyStatus, deleteDefaultKey, getDefaultKey, orgUsage, putDefaultKey } from "../lib/orgKey.js";
import { providerParam, verifiedKey } from "./users.js";
import type { ApiEnv } from "./env.js";

export const adminApi = new Hono<ApiEnv>();

const requireAdmin = (u: UserRecord) => {
  if (u.role !== "admin") throw new HTTPException(403, { message: "admin only" });
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

adminApi.get("/admin/users", async (c) => {
  requireAdmin(c.get("user"));
  const users = await listUsers();
  return c.json({ items: users.map(toPublicUser) });
});

adminApi.put("/admin/users/:id", async (c) => {
  const me = c.get("user");
  requireAdmin(me);
  const id = c.req.param("id");
  const body = (await c.req.json()) as AdminUpdateUserRequest;
  if (id === me.userId && body.disabled) throw bad("自分自身を無効化することはできません");
  if (!(await getUser(id))) throw notFound();
  const values: Partial<UserRecord> = {};
  if (typeof body.disabled === "boolean") values.disabled = body.disabled;
  if (body.role === "user" || body.role === "admin") values.role = body.role;
  if ("orgApproved" in body) {
    if (typeof body.orgApproved !== "boolean") throw bad("orgApproved は true か false です");
    values.orgAccess = body.orgApproved ? { approvedAt: nowIso(), approvedBy: me.userId } : null;
  }
  await updateUser(id, values);
  return c.json({ ok: true });
});

/** The default API key: write-only (only the last 4 characters and the date are ever returned). */
adminApi.get("/admin/default-api-key", async (c) => {
  requireAdmin(c.get("user"));
  return c.json(defaultKeyStatus(await getDefaultKey(providerParam(c))));
});

adminApi.put("/admin/default-api-key", async (c) => {
  const me = c.get("user");
  requireAdmin(me);
  const provider = providerParam(c);
  const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown; workspaceId?: unknown };
  const { key, stored, models } = await verifiedKey(provider, body);
  const record: DefaultApiKeyRecord = {
    ...DEFAULT_KEY_CATALOG_KEYS[provider],
    encryptedApiKey: await encryptDefaultApiKey(stored, provider),
    last4: key.slice(-4),
    availableModels: models,
    updatedAt: nowIso(),
    updatedBy: me.userId,
  };
  await putDefaultKey(record);
  return c.json(defaultKeyStatus(record));
});

adminApi.delete("/admin/default-api-key", async (c) => {
  requireAdmin(c.get("user"));
  await deleteDefaultKey(providerParam(c));
  return c.json(defaultKeyStatus(null));
});

/** Default-API-key usage per user (jobs recorded with keySource "org"). */
adminApi.get("/admin/org-usage", async (c) => {
  requireAdmin(c.get("user"));
  return c.json(orgUsage(await listAllJobs(), nowIso().slice(0, 7)));
});

/** Concurrency limits (1–16 each; null = the deployment value). Read by the dispatcher and the plan runner without a deploy. */
adminApi.get("/admin/concurrency", async (c) => {
  requireAdmin(c.get("user"));
  return c.json(await concurrencyStatus());
});

adminApi.put("/admin/concurrency", async (c) => {
  const me = c.get("user");
  requireAdmin(me);
  const body = (await c.req.json().catch(() => ({}))) as UpdateConcurrencyRequest;
  const current = await getConcurrencySetting();
  const next: ConcurrencySettingRecord = {
    ...CONCURRENCY_CATALOG_KEY,
    maxConcurrentJobs: current?.maxConcurrentJobs ?? null,
    maxConcurrentJobsPerUser: current?.maxConcurrentJobsPerUser ?? null,
    updatedAt: nowIso(),
    updatedBy: me.userId,
  };
  for (const key of ["maxConcurrentJobs", "maxConcurrentJobsPerUser"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v !== null && !isConcurrencyLimit(v)) throw bad(`同時実行数は ${CONCURRENCY_MIN}〜${CONCURRENCY_MAX} の整数です`);
    next[key] = v;
  }
  await putConcurrencySetting(next);
  return c.json(await concurrencyStatus());
});

adminApi.get("/admin/projects", async (c) => {
  requireAdmin(c.get("user"));
  const items = (await listAllProjects()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return c.json({ items: await correctProjects(items) });
});

// The specification PDF (bundled with this function) is uploaded to S3 once per version and handed out as presigned
// URLs: it is larger than a Lambda response may be.
adminApi.get("/admin/spec", async (c) => {
  requireAdmin(c.get("user"));
  const res = await specLinks();
  if (!res) return c.json({ error: `仕様書の PDF（${SPEC_PDF_NAME}）がこの環境の API に同梱されていません` }, 404);
  return c.json(res);
});

adminApi.post("/admin/projects/:userId/:id/cancel", async (c) => {
  requireAdmin(c.get("user"));
  const p = await getProject(c.req.param("userId"), c.req.param("id"));
  if (!p) throw notFound();
  await stopProject(p, "admin");
  return c.json({ ok: true });
});
