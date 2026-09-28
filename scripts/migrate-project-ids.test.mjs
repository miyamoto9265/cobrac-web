import assert from "node:assert/strict";
import { test } from "node:test";
import { planMigration, renameRel, summarize } from "./migrate-project-ids.mjs";

const user = (userId, extra = {}) => ({ userId, email: `${userId}@x`, ...extra });
const project = (userId, projectId, createdAt, extra = {}) => ({ userId, projectId, createdAt, status: "COMPLETED", ...extra });
const job = (userId, jobId, status = "COMPLETED") => ({ userId, jobId, status });
const msg = (jobId, sk, userId) => ({ jobId, sk, ...(userId ? { userId } : {}) });

test("numbers each user's legacy projects by createdAt and separates shared legacy IDs", () => {
  const plan = planMigration({
    users: [user("a", { userKey: "u7m2q9xa" }), user("b")],
    projects: [
      project("a", "Second", "2026-02-01"),
      project("a", "VOR", "2026-01-01"),
      project("b", "VOR", "2026-03-01"),
      project("a", "u7m2q9xa-9", "2026-04-01"),
    ],
    jobs: new Map([
      ["VOR", [job("a", "ja"), job("a", "ja2", "FAILED"), job("b", "jb")]],
      ["Second", []],
    ]),
    messages: new Map([
      ["VOR", [msg("ja", "1"), msg("jb", "2"), msg("jb", "3", "b"), msg("gone", "4")]],
      ["Second", []],
    ]),
    random: () => 0.5,
  });
  const a = plan.projects.filter((p) => p.userId === "a");
  assert.deepEqual(
    a.map((p) => [p.legacyId, p.newId, p.jobs, p.messages, p.revision]),
    [
      ["VOR", "u7m2q9xa-1", 2, 1, 1],
      ["Second", "u7m2q9xa-2", 0, 0, 0],
    ],
  );
  const b = plan.projects.find((p) => p.userId === "b");
  assert.match(b.newId, /^u[0-9a-hjkmnp-tv-z]{7}-1$/);
  assert.equal(b.messages, 2);
  assert.equal(b.sharedIdMessages, 2);
  assert.deepEqual(plan.collisions, [{ legacyId: "VOR", users: 2 }]);
  assert.deepEqual(plan.orphanMessages, [{ legacyId: "VOR", messages: 1 }]);
  assert.deepEqual(
    plan.users.map((u) => [u.userId, u.newKey, u.projectSeqBefore, u.projectSeqAfter]),
    [
      ["a", false, 0, 2],
      ["b", true, 0, 1],
    ],
  );
  assert.equal(summarize(plan).projectsToMigrate, 3);
});

test("continues after the current projectSeq, skips active and already migrated projects", () => {
  const plan = planMigration({
    users: [user("a", { userKey: "u7m2q9xa", projectSeq: 3 })],
    projects: [
      project("a", "Done", "2026-01-01"),
      project("a", "Busy", "2026-01-02", { status: "RUNNING" }),
      project("a", "u7m2q9xa-2", "2026-01-03", { legacyId: "Old" }),
      project("a", "Old", "2026-01-00"),
    ],
    jobs: new Map(),
    messages: new Map(),
  });
  assert.deepEqual(
    plan.projects.map((p) => [p.legacyId, p.newId]),
    [["Done", "u7m2q9xa-4"]],
  );
  assert.deepEqual(plan.skipped, [{ userId: "a", legacyId: "Busy", status: "RUNNING" }]);
  assert.equal(plan.users[0].projectSeqAfter, 4);
});

test("keeps an existing name and never issues a duplicate userKey", () => {
  const plan = planMigration({
    users: [user("a", { userKey: "u0000000" }), user("b")],
    projects: [project("b", "Xyz", "2026-01-01", { name: "Named" })],
    jobs: new Map(),
    messages: new Map(),
    random: (() => {
      const seq = [0, 0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
      return () => seq.shift() ?? 0.5;
    })(),
  });
  assert.equal(plan.users[0].userKey, "uzzzzzzz");
  assert.equal(plan.projects[0].name, "Named");
});

test("renames project folders and the xlsx inside S3 keys", () => {
  assert.equal(renameRel("workspace/VOR_HCD/1_Thinking.md", "VOR", "u7m2q9xa-3"), "workspace/u7m2q9xa-3_HCD/1_Thinking.md");
  assert.equal(renameRel("workspace/VOR_CSV/VOR.bra.xlsx", "VOR", "u7m2q9xa-3"), "workspace/u7m2q9xa-3_CSV/u7m2q9xa-3.bra.xlsx");
  assert.equal(renameRel("output/VOR.bra.xlsx", "VOR", "u7m2q9xa-3"), "output/u7m2q9xa-3.bra.xlsx");
  assert.equal(renameRel("workspace/meta.json", "VOR", "u7m2q9xa-3"), "workspace/meta.json");
  assert.equal(renameRel("thread/sessions/VORx.jsonl", "VOR", "u7m2q9xa-3"), "thread/sessions/VORx.jsonl");
});
