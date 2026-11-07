import assert from "node:assert/strict";
import { test } from "node:test";
import { correctLegacyProject, estimateCostUsd } from "../packages/shared/dist/index.js";
import { planUsageMigration, planWrites, summarize } from "./migrate-usage-0171.mjs";

const u = (inputTokens, cachedInputTokens = 0, outputTokens = 0, reasoningOutputTokens = 0) => ({ inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens });
const T = { projects: "P", jobs: "J", messages: "M" };
const OLD = "2026-09-29T12:00:00.000Z";
const job = (projectId, jobId, createdAt, usage, extra = {}) => ({ projectId, jobId, type: "initial", createdAt, startedAt: createdAt, status: "COMPLETED", model: "gpt-6-luna", usage, costUsd: 1, ...extra });
const row = (jobId, sk, usage) => ({ jobId, sk, meta: { kind: "usage", model: "gpt-6-luna", usage, costUsd: 1 } });

// running totals of the conversation after each turn, as pre-0.17.1 workers added them: 100, then 100+250
const ROWS = [row("j1", "s1", u(100)), row("j1", "s2", u(350))];

test("plans the same correction the API applies on read, for jobs, usage rows and the project", () => {
  const plan = planUsageMigration({
    projects: [{ userId: "a", projectId: "p1", createdAt: OLD, usage: u(350), costUsd: 1 }, { userId: "a", projectId: "p2", createdAt: "2026-10-05T00:00:00Z", usage: u(5) }],
    jobs: new Map([
      ["p1", [job("p1", "j1", OLD, u(350))]],
      ["p2", [job("p2", "n1", "2026-10-05T00:00:00Z", u(5))]],
    ]),
    messages: new Map([["p1", ROWS]]),
  });
  const expected = correctLegacyProject([job("p1", "j1", OLD, u(350))], new Map([["j1", ROWS.map((r) => ({ sk: r.sk, usage: r.meta.usage }))]]));
  assert.deepEqual(plan.jobs.map((j) => [j.jobId, j.after.usage]), [["j1", expected.get("j1").usage]]);
  assert.deepEqual(plan.jobs[0].after.usage, u(250));
  assert.equal(plan.jobs[0].after.costUsd, estimateCostUsd("gpt-6-luna", u(250)));
  assert.deepEqual(plan.messages.map((m) => [m.sk, m.after.usage]), [["s1", u(100)], ["s2", u(250)]]);
  assert.deepEqual(plan.projects.map((p) => [p.projectId, p.after.usage]), [["p1", u(250)]]);
  assert.deepEqual(summarize(plan), { projects: 1, jobs: 1, messages: 2, skippedProjects: 0, jobCostUsd: { before: 1, after: Math.round(plan.jobs[0].after.costUsd * 100) / 100 } });
});

test("skips projects with an unfinished legacy job and jobs already rewritten", () => {
  const plan = planUsageMigration({
    projects: [],
    jobs: new Map([
      ["p1", [job("p1", "j1", OLD, u(350), { status: "WAITING_USER_INPUT" })]],
      ["p2", [job("p2", "j2", OLD, u(250), { usageCorrected: true })]],
    ]),
    messages: new Map([["p1", ROWS]]),
  });
  assert.deepEqual(plan.skipped, [{ projectId: "p1", jobs: ["j1:WAITING_USER_INPUT"] }]);
  assert.equal(plan.jobs.length + plan.messages.length + plan.projects.length, 0);
});

test("writes jobs first, each conditional on its before value, and reverts to the before values", () => {
  const plan = planUsageMigration({
    projects: [{ userId: "a", projectId: "p1", createdAt: OLD, usage: u(350), costUsd: 1 }],
    jobs: new Map([["p1", [job("p1", "j1", OLD, u(350))]]]),
    messages: new Map([["p1", ROWS]]),
  });
  const w = planWrites(plan, T);
  assert.deepEqual(w.map((x) => x.kind), ["job", "message", "message", "project"]);
  assert.match(w[0].input.ConditionExpression, /attribute_not_exists\(#f\)/);
  assert.deepEqual(w[0].input.ExpressionAttributeValues[":from"], u(350));
  assert.deepEqual(w[0].input.ExpressionAttributeValues[":u"], u(250));
  assert.equal(w[1].input.ExpressionAttributeValues[":t"], true);
  const r = planWrites(plan, T, { revert: true });
  assert.deepEqual(r[0].input.ExpressionAttributeValues[":u"], u(350));
  assert.deepEqual(r[0].input.ExpressionAttributeValues[":from"], u(250));
  assert.match(r[0].input.UpdateExpression, /REMOVE #f/);
});
