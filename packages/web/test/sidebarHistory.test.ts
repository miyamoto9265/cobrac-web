import { describe, expect, it } from "vitest";
import type { ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { historyEntries, planRowStatus } from "../src/components/Layout";

const p = (projectId: string, planId: string | null = null, status: ProjectStatus = "COMPLETED") => ({ projectId, planId, status }) as ProjectRecord;

describe("sidebar history", () => {
  it("puts one row per plan where its newest project is, and keeps other projects as they are", () => {
    const rows = historyEntries([p("a"), p("b", "plan1"), p("c"), p("d", "plan1"), p("e", "plan2")]);
    expect(rows.map((r) => (r.kind === "plan" ? `${r.planId}:${r.projects.map((x) => x.projectId).join("")}` : r.project.projectId))).toEqual(["a", "plan1:bd", "c", "plan2:e"]);
  });

  it("shows what needs the owner first and nothing when every project is done", () => {
    expect(planRowStatus([p("a", "x", "RUNNING"), p("b", "x", "WAITING_USER_INPUT")])).toBe("WAITING_USER_INPUT");
    expect(planRowStatus([p("a", "x", "RUNNING"), p("b", "x", "FAILED")])).toBe("FAILED");
    expect(planRowStatus([p("a", "x"), p("b", "x", "CANCELLED")])).toBeNull();
  });
});
