// Applying a re-plan proposal (a new row, a row left out, a new policy). The owner accepts proposals one by one; in an
// autonomous plan (自律実行) the runner applies them as they arrive, since the Orchestrator acts for the owner. Both run
// under the plan's lease, so the caller has read the plan (`fresh`) and holds it.
import type { PlanProposalRecord, PlanRecord, PlanRowRecord } from "@cobrac/shared";
import { PLAN_LIMITS, countRows, generatePlanRowId, isMovableRow, matchExistingProject, nowIso, planRowKey, planRowSk, replanRows } from "@cobrac/shared";
import { currentLimits } from "./concurrency.js";
import { listUserProjects } from "./db.js";
import { listRows, putPlanEvent, putRow, updatePlan, updateProposal, updateRow } from "./plans.js";

export type ProposalOutcome =
  | { ok: true; proposal: PlanProposalRecord }
  /** The proposal no longer applies as it is (marked stale) */
  | { ok: false; stale: string }
  /** The plan has no room for it now (the proposal stays open) */
  | { ok: false; full: string }
  /** Someone else decided it meanwhile */
  | { ok: false; decided: true };

/** Marks a proposal that can no longer be applied as it is. */
async function stale(planId: string, p: PlanProposalRecord, message: string): Promise<ProposalOutcome> {
  await updateProposal(planId, p.proposalId, { status: "stale" }, { status: "open" });
  return { ok: false, stale: message };
}

/** Applies an open proposal of a running or paused plan as `by` (the owner, or the runner of an autonomous plan). */
export async function applyProposal(fresh: PlanRecord, p: PlanProposalRecord, by: string): Promise<ProposalOutcome> {
  const planId = fresh.planId;
  const rows = await listRows(planId, true);
  const now = nowIso();
  const detail: Record<string, string | number | null> = { kind: p.kind, proposalId: p.proposalId };
  if (p.kind === "add") {
    const add = p.row;
    if (!add) return stale(planId, p, "この提案は適用できません");
    if (rows.some((r) => r.state !== "skipped" && planRowKey(r.roi, r.tlf) === planRowKey(add.roi, add.tlf))) return stale(planId, p, "同じ ROI × TLF の行がすでにあります");
    if (rows.length >= PLAN_LIMITS.maxRows) return { ok: false, full: `行は ${PLAN_LIMITS.maxRows} 行までです` };
    const ids = new Set(rows.map((r) => r.rowId));
    const lastWave = rows.reduce((m, r) => Math.max(m, r.wave), 0);
    const rowId = generatePlanRowId();
    // a plan ordered by hand gets the row after its last wave
    const row: PlanRowRecord = {
      planId,
      sk: planRowSk(rowId),
      rowId,
      order: rows.reduce((m, r) => Math.max(m, r.order + 1), 0),
      wave: lastWave + 1,
      roi: add.roi,
      tlf: add.tlf,
      rationale: add.rationale,
      priority: null,
      source: "llm",
      sourceRow: null,
      state: "pending",
      projectId: null,
      attempts: 0,
      anchors: add.anchors,
      anchorsSource: "predicted",
      dependsOn: add.dependsOn.filter((d) => ids.has(d)),
      createdAt: now,
      updatedAt: now,
    };
    const own = new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x));
    const m = matchExistingProject(row, await listUserProjects(fresh.ownerUserId), own);
    row.existing = m.existing;
    row.duplicateOf = m.duplicateOf;
    // done by an existing project: listed with the last wave rather than opening a wave of its own
    if (row.existing) Object.assign(row, { state: "done", projectId: row.existing.projectId, completedAt: now, wave: Math.max(lastWave, 1) });
    else if (fresh.ordering === "auto") row.wave = (fresh.activeWave ?? 0) + 1;
    const all = [...rows, row];
    if (fresh.ordering === "auto") {
      // the rows waiting after the active wave (the new one among them) are placed again; rows of the active wave
      // that wait for a slot keep their wave
      for (const [id, wave] of replanRows(all, fresh.activeWave ?? 0, (await currentLimits()).effective)) {
        if (id === row.rowId) row.wave = wave;
        else if (await updateRow(planId, id, { wave }, { state: "pending" })) all.find((x) => x.rowId === id)!.wave = wave;
      }
    }
    await putRow(row);
    await updatePlan(planId, { rowCount: all.length, rowCounts: countRows(all) });
    detail.rowId = row.rowId;
  } else if (p.kind === "remove") {
    const target = rows.find((r) => r.rowId === p.rowId);
    if (!target || !isMovableRow(target)) return stale(planId, p, "この行はもう外せません（開始済みなど）");
    if (!(await updateRow(planId, target.rowId, { state: "skipped" }, { state: "pending" }))) return stale(planId, p, "この行はもう外せません（開始済みなど）");
    target.state = "skipped";
    await updatePlan(planId, { rowCounts: countRows(rows) });
    detail.rowId = target.rowId;
  } else {
    if (!p.policy) return stale(planId, p, "この提案は適用できません");
    await updatePlan(planId, { policy: p.policy });
  }
  const decided = { status: "accepted" as const, decidedAt: now, decidedBy: by };
  if (!(await updateProposal(planId, p.proposalId, decided, { status: "open" }))) return { ok: false, decided: true };
  await putPlanEvent(planId, "proposal_accepted", by, { ...(detail.rowId ? { rowId: String(detail.rowId) } : {}), detail });
  return { ok: true, proposal: { ...p, ...decided } };
}
