/**
 * The HTTP API (one Hono app on Lambda): CORS, errors, auth, then the routes of each area from `routes/`.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { nowIso } from "@cobrac/shared";
import { env } from "./env.js";
import { ensureUser, extractAuth } from "./lib/auth.js";
import { currentLimits } from "./lib/concurrency.js";
import type { ApiEnv } from "./routes/env.js";
import { usersApi } from "./routes/users.js";
import { projectsApi } from "./routes/projects.js";
import { canonsApi } from "./routes/canons.js";
import { publicApi } from "./routes/public.js";
import { plansApi } from "./routes/plans.js";
import { adminApi } from "./routes/admin.js";

export const app = new Hono<ApiEnv>();

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: err.message ?? "internal error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true, version: env.appVersion, time: nowIso() }));

// --- auth middleware ---------------------------------------------------------
app.use("*", async (c, next) => {
  if (c.req.path === "/health" || c.req.method === "OPTIONS") return next();
  const auth = extractAuth(c.env.event);
  if (!auth) throw new HTTPException(401, { message: "unauthorized" });
  const user = await ensureUser(auth);
  if (user.disabled) throw new HTTPException(403, { message: "account disabled" });
  c.set("user", user);
  await next();
});


app.route("/", usersApi);
app.route("/", projectsApi);
app.route("/", canonsApi);
app.route("/", publicApi);
app.route("/", plansApi);
app.route("/", adminApi);

app.get("/config", async (c) => {
  const limits = await currentLimits();
  return c.json({ maxConcurrentJobs: limits.maxConcurrentJobs, maxConcurrentJobsPerUser: limits.maxConcurrentJobsPerUser, codexModel: env.codexModel || null });
});
