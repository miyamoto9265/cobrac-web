/**
 * The end of a team's budget (its period ended, or an admin pressed 「予算を止める」): the jobs that run on the team's keys
 * are stopped (each project keeps its workspace and conversation, and its creator resumes it with a retry on their own
 * key) and the team's running missions pause. Teams, accounts and data stay. Deleting a team does the same first and
 * then gives every item back to its creator's personal workspace.
 */
import type { CanonRecord, JobRecord, PlanRecord, ProjectRecord, TeamRecord } from "@cobrac/shared";
import { CANON_META_SK, PLAN_META_SK, TEAM_CATALOG_KIND, budgetState, isProjectlessMode, nowIso } from "@cobrac/shared";
import { DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "../env.js";
import { stopEcsTask } from "./aws.js";
import { revokeInvite, getTeam, queryTeamIndex, removeUserTeam, updateTeam } from "./teams.js";
import { ddb, getProject, updateJob } from "./db.js";
import { putPlanEvent, setPlanStatus } from "./plans.js";
import { stopProject } from "./runs.js";

const ACTIVE: JobRecord["status"][] = ["QUEUED", "RUNNING", "FINALIZING"];

/** Stops the team-key jobs of the team and pauses its running missions; true when anything was stopped. */
export async function haltTeam(team: TeamRecord): Promise<{ jobs: number; plans: number }> {
  let jobs = 0;
  let plans = 0;
  for (const j of await queryTeamIndex<JobRecord>(env.tables.jobs, team.teamId)) {
    if (j.keySource !== "team" || !ACTIVE.includes(j.status)) continue;
    if (isProjectlessMode(j.type)) {
      await updateJob(j.projectId, j.jobId, { status: "CANCELLED", errorMessage: "team budget ended", endedAt: nowIso() });
      if (j.ecsTaskArn) await stopEcsTask(j.ecsTaskArn, "team budget ended");
    } else {
      const p = await getProject(j.userId, j.projectId);
      if (p && p.activeJobId === j.jobId) await stopProject(p, "team");
      else await updateJob(j.projectId, j.jobId, { status: "CANCELLED", endedAt: nowIso() });
    }
    jobs++;
  }
  for (const p of await queryTeamIndex<PlanRecord>(env.tables.plans, team.teamId)) {
    if (p.sk !== PLAN_META_SK || p.status !== "RUNNING" || p.deletedAt) continue;
    if (await setPlanStatus(p.planId, "RUNNING", "PAUSED", { pausedReason: "team_budget" })) {
      await putPlanEvent(p.planId, "paused", "runner", { detail: { reason: "team_budget" } });
      plans++;
    }
  }
  return { jobs, plans };
}

/** Halts each team whose budget ended or was stopped and was not halted since (the janitor; once per end). */
export async function haltEndedBudgets(now = nowIso()): Promise<void> {
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({ TableName: env.tables.catalog, KeyConditionExpression: "#k = :k", ExpressionAttributeNames: { "#k": "kind" }, ExpressionAttributeValues: { ":k": TEAM_CATALOG_KIND }, ExclusiveStartKey: start }),
    );
    for (const team of (r.Items as TeamRecord[]) ?? []) {
      const state = budgetState(team, now);
      if ((state !== "ended" && state !== "stopped") || team.budget?.haltedAt) continue;
      try {
        const n = await haltTeam(team);
        await updateTeam(team.teamId, (t) => {
          t.budget = { startsAt: null, endsAt: null, ...(t.budget ?? {}), haltedAt: nowIso() };
        });
        console.log(`[janitor] team ${team.teamId} budget ${state}: stopped ${n.jobs} job(s), paused ${n.plans} mission(s)`);
      } catch (e) {
        console.error(`[janitor] halting team ${team.teamId} failed`, e);
      }
    }
    start = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start);
}

/** 「予算を止める」 (a team admin, or a site admin: then only a site admin can start it again); takes effect at once. */
export async function stopBudget(teamId: string, by: string, siteAdmin: boolean): Promise<TeamRecord> {
  const next = await updateTeam(teamId, (t) => {
    t.budget = { startsAt: null, endsAt: null, ...(t.budget ?? {}), stoppedAt: nowIso(), stoppedBy: by, stoppedBySiteAdmin: siteAdmin || !!t.budget?.stoppedBySiteAdmin };
  });
  await haltTeam(next);
  return updateTeam(teamId, (t) => {
    if (t.budget) t.budget.haltedAt = nowIso();
  });
}

/** Removes `teamId` from an item (it moves back to its creator's personal workspace). */
async function clearTeam(table: string, key: Record<string, string>, teamId: string) {
  try {
    await ddb.send(
      new UpdateCommand({ TableName: table, Key: key, UpdateExpression: "REMOVE teamId", ConditionExpression: "teamId = :t", ExpressionAttributeValues: { ":t": teamId } }),
    );
  } catch (e) {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
  }
}

/**
 * Deletes the team (a team admin): team-key jobs stop, missions pause, every project, mission and Canon of its
 * workspace goes back to its creator's personal workspace, members leave, the invite link stops working. Jobs keep
 * their teamId (the record of what the team paid for).
 */
export async function deleteTeam(team: TeamRecord): Promise<void> {
  await haltTeam(team);
  for (const p of await queryTeamIndex<ProjectRecord>(env.tables.projects, team.teamId)) await clearTeam(env.tables.projects, { userId: p.userId, projectId: p.projectId }, team.teamId);
  for (const p of await queryTeamIndex<PlanRecord>(env.tables.plans, team.teamId)) await clearTeam(env.tables.plans, { planId: p.planId, sk: p.sk }, team.teamId);
  for (const c of await queryTeamIndex<CanonRecord>(env.tables.canons, team.teamId)) await clearTeam(env.tables.canons, { canonId: c.canonId, sk: c.sk ?? CANON_META_SK }, team.teamId);
  for (const m of team.members) await removeUserTeam(m.userId, team.teamId);
  if (team.inviteToken) await revokeInvite(team.inviteToken);
  const fresh = await getTeam(team.teamId);
  if (fresh) await ddb.send(new DeleteCommand({ TableName: env.tables.catalog, Key: { kind: TEAM_CATALOG_KIND, id: team.teamId } }));
}
