/** Mission (BRA Planner) routes (`/plans…`). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type {
  ResumePlanRequest,
  AnswerDraftRequest,
  CreatePlanRequest,
  DraftPlanRequest,
  ListPlansResponse,
  UpdatePlanRequest,
} from "@cobrac/shared";
import { countRows, nowIso } from "@cobrac/shared";
import { listOwnPlans, updatePlan } from "../lib/plans.js";
import {
  acceptProposal,
  cancelDraft,
  answerDraft,
  cancelPlan,
  confirmPlan,
  createPlan,
  deletePlan,
  importRows,
  loadOwnPlan,
  orderPlan,
  pausePlan,
  planDetail,
  planPulse,
  rejectProposal,
  replaceRows,
  requestDraft,
  resolveRow,
  resumePlan,
  retryRow,
  skipRow,
  updatePlanFields,
  addPlanAttachments,
  removePlanAttachment,
} from "../lib/planOps.js";
import { readLocale } from "../lib/runs.js";
import { archiveBody } from "./projects.js";
import type { ApiEnv } from "./env.js";

export const plansApi = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// BRA Planner (plans: rows of ROI × TLF built as projects in waves; owner only)
// ---------------------------------------------------------------------------

/** Live plans whose pulse the list reads (the newest first); older ones show their counts only. */
const LIST_PULSE_PLANS = 12;

plansApi.get("/plans", async (c) => {
  const u = c.get("user");
  const plans = (await listOwnPlans(u.userId)).filter((p) => !p.deletedAt).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  // running and paused plans carry what they do now (the list is a live view of them); the rest only their counts
  let live = 0;
  const items = await Promise.all(
    plans.map(async (p) => {
      if ((p.status !== "RUNNING" && p.status !== "PAUSED") || ++live > LIST_PULSE_PLANS) return { ...p, rowCounts: p.rowCounts ?? countRows([]) };
      const d = await planDetail(u, p);
      return { ...p, rowCounts: d.plan.rowCounts ?? countRows([]), rowCount: d.plan.rowCount, pulse: planPulse(d) };
    }),
  );
  const res: ListPlansResponse = { items };
  return c.json(res);
});

plansApi.post("/plans", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as CreatePlanRequest;
  return c.json(await createPlan(u, body), 201);
});

plansApi.get("/plans/:id", async (c) => {
  const u = c.get("user");
  return c.json(await planDetail(u, await loadOwnPlan(u, c.req.param("id"))));
});

plansApi.put("/plans/:id", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  return c.json(await updatePlanFields(u, plan, (await c.req.json().catch(() => ({}))) as UpdatePlanRequest));
});

/** Archive / restore (owner only): hides the plan and its projects from the sidebar history; the plan runs on. */
plansApi.put("/plans/:id/archive", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  const archivedAt = (await archiveBody(c)) ? (plan.archivedAt ?? nowIso()) : null;
  if (!(await updatePlan(plan.planId, { archivedAt }))) throw new HTTPException(409, { message: "ミッションの状態が変わりました。再読み込みしてください" });
  return c.json({ planId: plan.planId, archivedAt });
});

plansApi.delete("/plans/:id", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  return c.json({ planId: plan.planId, deletedAt: await deletePlan(u, plan) });
});

plansApi.put("/plans/:id/rows", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as { rows?: unknown };
  return c.json({ rows: await replaceRows(u, plan, body.rows) });
});

/** Draft only: capability lists uploaded with POST /uploads are added to the plan (CSV / TSV / text become rows at once). */
plansApi.post("/plans/:id/attachments", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  return c.json(await addPlanAttachments(u, plan, await c.req.json().catch(() => ({}))));
});

/** Draft only: a capability list is removed from the plan (rows read from it stay). */
plansApi.delete("/plans/:id/attachments/:fileId", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  return c.json(await removePlanAttachment(u, plan, c.req.param("fileId")));
});

plansApi.post("/plans/:id/rows/import", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as { csv?: unknown };
  return c.json(await importRows(u, plan, body.csv));
});

plansApi.post("/plans/:id/confirm", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as { locale?: unknown };
  return c.json(await confirmPlan(u, plan, readLocale(body.locale)));
});

/** Asks the `plan` job for a draft (queued by the runner when a slot is free). */
plansApi.post("/plans/:id/draft", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as DraftPlanRequest;
  return c.json(await requestDraft(u, plan, readLocale(body.locale)), 202);
});

/** The owner's answers to the Orchestrator's questions before the draft (or `skip`); the draft job is asked for again. */
plansApi.post("/plans/:id/draft/answers", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as AnswerDraftRequest;
  return c.json(await answerDraft(u, await loadOwnPlan(u, c.req.param("id")), body && typeof body === "object" ? body : {}), 202);
});

plansApi.post("/plans/:id/draft/cancel", async (c) => {
  const u = c.get("user");
  return c.json(await cancelDraft(u, await loadOwnPlan(u, c.req.param("id"))));
});

/** 「自動で並べる」: waves and seed rows from the rows' anchors and dependencies (no job). */
plansApi.post("/plans/:id/order", async (c) => {
  const u = c.get("user");
  return c.json(await orderPlan(u, await loadOwnPlan(u, c.req.param("id"))));
});

for (const [action, run] of [
  ["accept", acceptProposal],
  ["reject", rejectProposal],
] as const) {
  plansApi.post(`/plans/:id/proposals/:proposalId/${action}`, async (c) => {
    const u = c.get("user");
    return c.json(await run(u, await loadOwnPlan(u, c.req.param("id")), c.req.param("proposalId")));
  });
}

for (const [action, run] of [
  ["pause", pausePlan],
  ["cancel", cancelPlan],
] as const) {
  plansApi.post(`/plans/:id/${action}`, async (c) => {
    const u = c.get("user");
    await run(u, await loadOwnPlan(u, c.req.param("id")));
    return c.json({ ok: true });
  });
}

/** Resumes a paused or cancelled plan; an autonomous plan paused at its cost limit sends a higher `maxCostUsd`. */
plansApi.post("/plans/:id/resume", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as ResumePlanRequest;
  await resumePlan(u, await loadOwnPlan(u, c.req.param("id")), body && typeof body === "object" ? body : {});
  return c.json({ ok: true });
});

plansApi.post("/plans/:id/rows/:rowId/retry", async (c) => {
  const u = c.get("user");
  await retryRow(u, await loadOwnPlan(u, c.req.param("id")), c.req.param("rowId"));
  return c.json({ ok: true });
});

plansApi.post("/plans/:id/rows/:rowId/skip", async (c) => {
  const u = c.get("user");
  await skipRow(u, await loadOwnPlan(u, c.req.param("id")), c.req.param("rowId"));
  return c.json({ ok: true });
});

/** 「人の判断」: the owner counts the row as done, or has its project pushed again. */
plansApi.post("/plans/:id/rows/:rowId/resolve", async (c) => {
  const u = c.get("user");
  const plan = await loadOwnPlan(u, c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as { action?: unknown };
  await resolveRow(u, plan, c.req.param("rowId"), body.action);
  return c.json({ ok: true });
});
