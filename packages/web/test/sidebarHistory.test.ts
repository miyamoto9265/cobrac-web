import { describe, expect, it } from "vitest";
import type { ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { historyEntries, isArchived, planRowStatus } from "../src/components/Layout";

const p = (projectId: string, planId: string | null = null, status: ProjectStatus = "COMPLETED") => ({ projectId, planId, status }) as ProjectRecord;

describe("sidebar history", () => {
  it("puts one row per plan where its newest project is, and keeps other projects as they are", () => {
    const rows = historyEntries([p("a"), p("b", "plan1"), p("c"), p("d", "plan1"), p("e", "plan2")]);
    expect(rows.map((r) => (r.kind === "plan" ? `${r.planId}:${r.projects.map((x) => x.projectId).join("")}` : r.project.projectId))).toEqual(["a", "plan1:bd", "c", "plan2:e"]);
  });

  it("drops the rows of deleted plans once the live plans are known", () => {
    const all = [p("a"), p("b", "plan1"), p("c", "plan2")];
    expect(historyEntries(all, null)).toHaveLength(3);
    const rows = historyEntries(all, { plan2: {} });
    expect(rows.map((r) => (r.kind === "plan" ? r.planId : r.project.projectId))).toEqual(["a", "plan2"]);
  });

  it("places a mission without projects yet (a draft) by its creation time", () => {
    const at = (projectId: string, createdAt: string, planId: string | null = null) => ({ ...p(projectId, planId), createdAt }) as ProjectRecord;
    const all = [at("a", "2026-10-03"), at("b", "2026-10-02", "plan1"), at("c", "2026-10-01")];
    const rows = historyEntries(all, { plan1: { createdAt: "2026-09-30" }, draft: { createdAt: "2026-10-02T12:00" }, old: { createdAt: "2026-09-01" } });
    expect(rows.map((r) => (r.kind === "plan" ? `${r.planId}:${r.projects.length}` : r.project.projectId))).toEqual(["a", "draft:0", "plan1:1", "c", "old:0"]);
  });

  it("archives a mission's row with the mission and a project's row with the project", () => {
    const rows = historyEntries([{ ...p("a"), archivedAt: "2026-10-25" } as ProjectRecord, p("b"), { ...p("c", "plan1"), archivedAt: null } as ProjectRecord], { plan1: {} });
    const plans = { plan1: { archivedAt: "2026-10-25" } };
    expect(rows.map((r) => isArchived(r, plans))).toEqual([true, false, true]);
  });

  it("shows what needs the owner first and nothing when every project is done", () => {
    expect(planRowStatus([p("a", "x", "RUNNING"), p("b", "x", "WAITING_USER_INPUT")])).toBe("WAITING_USER_INPUT");
    expect(planRowStatus([p("a", "x", "RUNNING"), p("b", "x", "FAILED")])).toBe("FAILED");
    expect(planRowStatus([p("a", "x"), p("b", "x", "CANCELLED")])).toBeNull();
  });
});
