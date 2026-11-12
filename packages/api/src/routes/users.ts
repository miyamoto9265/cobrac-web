/** Routes of the signed-in user: profile, models, usage and API keys (`/users/me…`). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  ModelPolicy,
  ModelProvider,
  MeResponse,
  ModelsResponse,
  TokenUsage,
  UsageSummary,
  UserRecord,
} from "@cobrac/shared";
import {
  isProjectDeleted,
  EMPTY_USAGE,
  PRICING,
  REASONING_EFFORTS,
  addUsage,
  ANTHROPIC_WORKSPACE_ID,
  CLAUDE_MODELS,
  DEEPSEEK_MODELS,
  joinAnthropicCredential,
  messagesOnly,
  filterCodexModels,
  deprecatedLast,
  projectDisplayName,
} from "@cobrac/shared";
import { toPublicUser } from "../lib/auth.js";
import { bad } from "../lib/http.js";
import { listOwnPlans } from "../lib/plans.js";
import {
  deploymentDefaultModel,
  orchestratorDefaultModel,
  implicitModel,
  isEffort,
  normModel,
  requireModel,
} from "../lib/runs.js";
import { encryptApiKey } from "../lib/aws.js";
import { listJobsForProject, listUserProjects, updateUser } from "../lib/db.js";
import { correctJobs, correctProject } from "../lib/usageCorrection.js";
import { modelPolicy } from "../lib/orgKey.js";
import { listOwnCanons } from "../lib/canons.js";
import { loadCanon } from "./canons.js";
import { itemTeam, requireTeamMember } from "../lib/teams.js";
import type { ApiEnv } from "./env.js";

export const usersApi = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** The key each provider's models run with, and the default-API-key tier (GET /users/me, /users/me/models). */
const keySources = (policy: ModelPolicy) => ({ keySource: policy.source, claudeKeySource: policy.claude.source, deepseekKeySource: policy.deepseek.source });

usersApi.get("/users/me", async (c) => {
  const u = c.get("user");
  // ?team=<teamId>: the keys as they are in that team's workspace (ignored when the caller is not in the team)
  const team = await itemTeam(u.userId, c.req.query("team"));
  const { policy } = await modelPolicy(u, team);
  const res: MeResponse = { ...toPublicUser(u), ...keySources(policy) };
  return c.json(res);
});

usersApi.put("/users/me", async (c) => {
  const body = (await c.req.json()) as Partial<Pick<UserRecord, "displayName" | "contributorName" | "defaultModel" | "defaultReasoningEffort" | "defaultCanonId">>;
  const u = c.get("user");
  const values: Partial<UserRecord> = {};
  if (typeof body.displayName === "string" && body.displayName.trim()) values.displayName = body.displayName.trim().slice(0, 80);
  if (typeof body.contributorName === "string" && body.contributorName.trim()) values.contributorName = body.contributorName.trim().slice(0, 120);
  if ("defaultModel" in body) {
    values.defaultModel = normModel(body.defaultModel);
    if (values.defaultModel) requireModel((await modelPolicy(u)).policy, values.defaultModel);
  }
  if ("defaultReasoningEffort" in body) {
    if (body.defaultReasoningEffort !== null && body.defaultReasoningEffort !== undefined && !isEffort(body.defaultReasoningEffort)) throw bad("reasoning effort が不正です");
    values.defaultReasoningEffort = body.defaultReasoningEffort ?? null;
  }
  if ("defaultCanonId" in body) {
    if (body.defaultCanonId) await loadCanon(u, body.defaultCanonId, { write: true });
    values.defaultCanonId = body.defaultCanonId || null;
  }
  await updateUser(u.userId, values);
  const { policy } = await modelPolicy(u);
  const res: MeResponse = { ...toPublicUser({ ...u, ...values }), ...keySources(policy) };
  return c.json(res);
});

usersApi.get("/users/me/models", async (c) => {
  const u = c.get("user");
  // ?team=<teamId>: the models of that team's workspace (its keys first)
  const teamId = c.req.query("team");
  const team = teamId ? await requireTeamMember(u, teamId) : null;
  const { policy, defaultKey } = await modelPolicy(u, team);
  const keyModels = policy.source === "team" ? (team?.keys?.openai?.models ?? []) : policy.source === "org" ? (defaultKey?.availableModels ?? []) : (u.availableModels ?? []);
  // a user with an Anthropic / DeepSeek key and no OpenAI key chooses among those models only
  const noOpenAi = messagesOnly(policy);
  const openAiModels = noOpenAi ? [] : filterCodexModels(keyModels);
  const res: ModelsResponse = {
    models: deprecatedLast([...openAiModels, ...policy.claude.allowed, ...policy.deepseek.allowed]),
    efforts: REASONING_EFFORTS,
    envDefaultModel: implicitModel(policy, deploymentDefaultModel()),
    orchestratorDefaultModel: implicitModel(policy, orchestratorDefaultModel()),
    ...keySources(policy),
    restricted: noOpenAi,
    pricedModels: Object.keys(PRICING),
  };
  return c.json(res);
});

/** Token / cost summary across the caller's projects (per model and per project). */
usersApi.get("/users/me/usage", async (c) => {
  const u = c.get("user");
  const items = await listUserProjects(u.userId);
  const summary: UsageSummary = { totals: EMPTY_USAGE, costUsd: null, byModel: [], byProject: [] };
  const byModel = new Map<string, { usage: TokenUsage; cost: number; unpriced: boolean; jobs: number }>();
  let cost = 0;
  let priced = false;
  for (const stored of items) {
    const recorded = await listJobsForProject(stored.projectId, u.userId);
    const jobs = await correctJobs(stored.projectId, recorded);
    const p = await correctProject(stored, recorded);
    const models = new Set<string>();
    for (const j of jobs) {
      if (!j.usage) continue;
      const m = j.model ?? "(unknown)";
      models.add(m);
      const e = byModel.get(m) ?? { usage: EMPTY_USAGE, cost: 0, unpriced: false, jobs: 0 };
      e.usage = addUsage(e.usage, j.usage);
      e.jobs++;
      if (j.costUsd === null || j.costUsd === undefined) e.unpriced = true;
      else e.cost += j.costUsd;
      byModel.set(m, e);
    }
    if (p.usage) summary.totals = addUsage(summary.totals, p.usage);
    if (typeof p.costUsd === "number") {
      cost += p.costUsd;
      priced = true;
    }
    summary.byProject.push({
      projectId: p.projectId,
      name: projectDisplayName(p),
      usage: p.usage ?? EMPTY_USAGE,
      costUsd: p.costUsd ?? null,
      models: [...models],
      ...(isProjectDeleted(p) ? { deleted: true } : {}),
    });
  }
  // AI reviews of pull requests run as jobs of the reviewer's Canons; BRA Planner drafts and re-plans as jobs of the plan
  const reviewCanons = new Set([...(await listOwnCanons(u.userId)).map((x) => x.canonId), ...(u.editorCanons ?? [])]);
  const projectless = [...[...reviewCanons].map((id) => [id, "canon-review"] as const), ...(await listOwnPlans(u.userId)).map((p) => [p.planId, "plan"] as const)];
  for (const [id, type] of projectless) {
    for (const j of await listJobsForProject(id, u.userId)) {
      if (j.type !== type || !j.usage) continue;
      const m = j.model ?? "(unknown)";
      const e = byModel.get(m) ?? { usage: EMPTY_USAGE, cost: 0, unpriced: false, jobs: 0 };
      e.usage = addUsage(e.usage, j.usage);
      e.jobs++;
      summary.totals = addUsage(summary.totals, j.usage);
      if (j.costUsd === null || j.costUsd === undefined) e.unpriced = true;
      else {
        e.cost += j.costUsd;
        cost += j.costUsd;
        priced = true;
      }
      byModel.set(m, e);
    }
  }
  summary.costUsd = priced ? Math.round(cost * 1_000_000) / 1_000_000 : null;
  summary.byModel = [...byModel.entries()]
    .map(([model, e]) => ({ model, usage: e.usage, costUsd: e.unpriced && e.cost === 0 ? null : e.cost, jobs: e.jobs }))
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
  return c.json(summary);
});

/** `?provider=anthropic` / `?provider=deepseek` selects that provider's key (Claude / DeepSeek models); otherwise the OpenAI key. */
export const providerParam = (c: { req: { query(name: string): string | undefined } }): ModelProvider => {
  const p = c.req.query("provider");
  return p === "anthropic" || p === "deepseek" ? p : "openai";
};

/** The user's own key of `provider` as stored on the user record (`encrypted` "" = none). */
function ownKeyValues(provider: ModelProvider, encrypted: string, last4: string, models: string[]): Partial<UserRecord> {
  const registered = !!encrypted;
  if (provider === "anthropic") return { encryptedAnthropicKey: encrypted, anthropicKeyRegistered: registered, anthropicKeyLast4: last4 };
  if (provider === "deepseek") return { encryptedDeepseekKey: encrypted, deepseekKeyRegistered: registered, deepseekKeyLast4: last4 };
  return { encryptedApiKey: encrypted, apiKeyRegistered: registered, apiKeyLast4: last4, ...(registered ? { availableModels: models } : {}) };
}

usersApi.get("/users/me/apikey/status", (c) => {
  const u = c.get("user");
  const provider = providerParam(c);
  if (provider === "anthropic") return c.json({ registered: !!u.anthropicKeyRegistered, last4: u.anthropicKeyLast4 ?? null });
  if (provider === "deepseek") return c.json({ registered: !!u.deepseekKeyRegistered, last4: u.deepseekKeyLast4 ?? null });
  return c.json({ registered: !!u.apiKeyRegistered, last4: u.apiKeyLast4 ?? null });
});

/** A pasted OpenAI key, checked against OpenAI; returns the key and its Codex models. */
async function verifiedOpenAiKey(apiKey: unknown): Promise<{ key: string; models: string[] }> {
  const key = (typeof apiKey === "string" ? apiKey : "").trim();
  if (!key || key.length < 20) throw bad("API キーの形式が不正です");
  const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) throw bad("OpenAI がこの API キーを拒否しました（無効なキー）");
  if (!r.ok) throw new HTTPException(502, { message: `OpenAI への疎通確認に失敗しました (${r.status})` });
  return { key, models: filterCodexModels((((await r.json()) as { data?: { id: string }[] }).data ?? []).map((m) => m.id)) };
}

/**
 * A pasted Anthropic key, checked against the Anthropic API (the Claude models are a fixed list, `CLAUDE_MODELS`).
 * `workspaceId` is for a key that is not scoped to one workspace; the stored key is then the key and the workspace ID
 * (`joinAnthropicCredential`).
 */
async function verifiedAnthropicKey(apiKey: unknown, workspaceId: unknown): Promise<{ key: string; stored: string; models: string[] }> {
  const key = (typeof apiKey === "string" ? apiKey : "").trim();
  if (!key || key.length < 20 || /\s/.test(key)) throw bad("API キーの形式が不正です");
  const ws = (typeof workspaceId === "string" ? workspaceId : "").trim();
  if (ws && !ANTHROPIC_WORKSPACE_ID.test(ws)) throw bad("ワークスペース ID の形式が不正です（wrkspc_ で始まる ID）");
  const headers: Record<string, string> = { "x-api-key": key, "anthropic-version": "2023-06-01", ...(ws ? { "anthropic-workspace-id": ws } : {}) };
  const r = await fetch("https://api.anthropic.com/v1/models", { headers });
  if (r.status === 401 || r.status === 403) throw bad("Anthropic がこの API キーを拒否しました（無効なキー）");
  if (r.status === 400 && /workspace/i.test(await r.text())) {
    throw bad(ws ? "このワークスペース ID はこのキーでは使えません" : "このキーにはワークスペース ID が必要です。ワークスペース ID も入力してください");
  }
  if (!r.ok) throw new HTTPException(502, { message: `Anthropic への疎通確認に失敗しました (${r.status})` });
  return { key, stored: joinAnthropicCredential(key, ws), models: [...CLAUDE_MODELS] };
}

/** A pasted DeepSeek key, checked against the DeepSeek API (the DeepSeek models are a fixed list, `DEEPSEEK_MODELS`). */
async function verifiedDeepSeekKey(apiKey: unknown): Promise<{ key: string; stored: string; models: string[] }> {
  const key = (typeof apiKey === "string" ? apiKey : "").trim();
  if (!key || key.length < 20 || /\s/.test(key)) throw bad("API キーの形式が不正です");
  const r = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) throw bad("DeepSeek がこの API キーを拒否しました（無効なキー）");
  if (!r.ok) throw new HTTPException(502, { message: `DeepSeek への疎通確認に失敗しました (${r.status})` });
  return { key, stored: key, models: [...DEEPSEEK_MODELS] };
}

async function verifiedOpenAi(apiKey: unknown) {
  const { key, models } = await verifiedOpenAiKey(apiKey);
  return { key, stored: key, models };
}

/** The pasted key of `provider`, checked; `stored` is what gets encrypted (the Anthropic key may carry its workspace ID). */
export const verifiedKey = (provider: ModelProvider, body: { apiKey?: unknown; workspaceId?: unknown }) =>
  provider === "anthropic" ? verifiedAnthropicKey(body.apiKey, body.workspaceId) : provider === "deepseek" ? verifiedDeepSeekKey(body.apiKey) : verifiedOpenAi(body.apiKey);

usersApi.put("/users/me/apikey", async (c) => {
  const provider = providerParam(c);
  const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown; workspaceId?: unknown };
  const { key, stored, models } = await verifiedKey(provider, body);
  const u = c.get("user");
  const encrypted = await encryptApiKey(stored, u.userId, provider);
  await updateUser(u.userId, ownKeyValues(provider, encrypted, key.slice(-4), models));
  return c.json({ registered: true, last4: key.slice(-4), models });
});

usersApi.delete("/users/me/apikey", async (c) => {
  const u = c.get("user");
  await updateUser(u.userId, ownKeyValues(providerParam(c), "", "", []));
  return c.json({ registered: false, last4: null });
});
