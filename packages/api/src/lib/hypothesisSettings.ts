// Hypothesis mode, stage 2: the API side of "Allow hypotheses". The create route stores scope S1 with the project
// (runs.ts), a follow-up that allows hypotheses appends its scope here together with its job, and the BRA-DB route
// refuses versions that contain hypotheses (until a separate specification decides how they may be registered).
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { HTTPException } from "hono/http-exception";
import type { HypothesisInput, HypothesisScope, JobRecord, ProjectRecord } from "@cobrac/shared";
import { BRADB_HYPOTHESIS_BLOCK_MESSAGE, bradbBlockReason, hypothesisFollowupFields, normalizeMaxShare, nowIso, parseHypothesisRequest, scopeLine, type VersionHypothesisInfo } from "@cobrac/shared";
import { env } from "../env.js";
import { ddb } from "./db.js";
import { bad } from "./http.js";

/** The `hypothesis` of a request (400 with the reason when it is invalid); null when the request has none. */
export function readHypothesisRequest(v: unknown, o: { withTarget: boolean }): HypothesisInput | null {
  const r = parseHypothesisRequest(v, o);
  if (!r) return null;
  if ("error" in r) throw bad(r.error);
  return r.input;
}

/** Timeline notice of a scope added by a request (the screens show it with `meta.i18n`). */
export const scopeNotice = (scope: HypothesisScope, maxShare: number) => ({
  content: `Hypotheses allowed: ${scopeLine(scope, maxShare)}.`,
  meta: { i18n: "sys.hypothesisScope", scope: scope.id, claims: scope.claims.join(", "), target: scope.target.kind, limit: Math.round(maxShare * 100) },
});

/**
 * Stores a follow-up job that allows hypotheses and, in the same transaction, appends its scope to the project and
 * queues the project. Either both are written or neither: the project must still be COMPLETED (a second submission
 * of the same follow-up finds it QUEUED and gets 409) and the job must be new.
 */
export async function storeHypothesisFollowup(p: ProjectRecord, job: JobRecord, input: HypothesisInput): Promise<{ scope: HypothesisScope; maxShare: number }> {
  const now = nowIso();
  const { scope, fields } = hypothesisFollowupFields(p, input, job.jobId, now);
  job.hypothesisScopeId = scope.id;
  const values: Record<string, unknown> = {
    status: "QUEUED",
    activeJobId: job.jobId,
    errorMessage: null,
    stepStates: { ...p.stepStates, XLSX: "pending" },
    ...fields,
    updatedAt: now,
  };
  const names: Record<string, string> = { "#cond": "status" };
  const vals: Record<string, unknown> = { ":completed": "COMPLETED" };
  const sets = Object.entries(values).map(([k, v], i) => {
    names[`#k${i}`] = k;
    vals[`:v${i}`] = v;
    return `#k${i} = :v${i}`;
  });
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: env.tables.jobs, Item: job, ConditionExpression: "attribute_not_exists(jobId)" } },
          {
            Update: {
              TableName: env.tables.projects,
              Key: { userId: p.userId, projectId: p.projectId },
              UpdateExpression: `SET ${sets.join(", ")}`,
              ConditionExpression: "#cond = :completed",
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: vals,
            },
          },
        ],
      }),
    );
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "TransactionCanceledException" || name === "ConditionalCheckFailedException")
      throw new HTTPException(409, { message: "プロジェクトの状態が変わったため送信できませんでした。再読み込みしてください" });
    throw e;
  }
  Object.assign(p, values);
  return { scope, maxShare: normalizeMaxShare(p.hypothesisMaxShare) };
}

/** 400 when a version contains hypotheses (or a hypothesis-mode version does not record how many). */
export function requireBradbRegistrable(generator: VersionHypothesisInfo | null | undefined) {
  if (bradbBlockReason(generator)) throw bad(BRADB_HYPOTHESIS_BLOCK_MESSAGE);
}
