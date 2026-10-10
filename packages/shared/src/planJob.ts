// ---------------------------------------------------------------------------
// The `plan` job of the BRA Planner (stage 2): one Codex task with the RCS MCP that drafts a plan from a goal and
// capability lists (kind `draft`), or proposes changes after a wave (kind `replan`). Like the AI review of a Canon pull
// request, the API side writes `plans/{planId}/jobs/{jobId}/input.json`, the worker runs the model with
// PLAN_RESULT_SCHEMA and writes `result.json`, and only what refers to the input is kept (`parsePlanResult`). The order
// of the rows is not the model's: `orderPlanRows` computes it from the anchors and dependencies the model supplies.
// No API key or other secret is ever written to these files.
// ---------------------------------------------------------------------------

import type { AttachmentType } from "./attachments.js";
import { attachmentTypeOf } from "./attachments.js";
import type { UiLocale } from "./locale.js";
import { uiLanguageName } from "./locale.js";
import type { PlanJobKind, PlanProposalKind, PlanRowRecord, PlanUnread } from "./plan.js";
import { PLAN_LIMITS, cleanPlanText, normalizePlanRow, planRowKey } from "./plan.js";
import { PLAN_POLICY_ITEMS, type PlanPolicy, isEmptyPlanPolicy, planPolicyOf, samePlanPolicy } from "./planPolicy.js";
import { planAnchors } from "./planOrder.js";
import type { ProjectStatus } from "./types.js";

export const PLAN_JOB_INPUT_SCHEMA = "cobrac.plan-job/1";
export const PLAN_JOB_RESULT_SCHEMA = "cobrac.plan-result/1";

/** Everything of a plan in the artifacts bucket lives under `plans/{planId}/`. */
export const planPrefix = (planId: string) => `plans/${planId}/`;
export const planJobKey = (planId: string, jobId: string, file: "input.json" | "result.json") => `${planPrefix(planId)}jobs/${jobId}/${file}`;

/** Reasoning effort of `plan` jobs: enough to map regions to anchors with RCS, quick enough for the 10-minute draft. */
export const PLAN_JOB_REASONING_EFFORT = "medium" as const;
/**
 * Wall-clock budget of one `plan` job, counted from the worker's start (a draft must be ready within 10 minutes of the
 * request; the rest is left for queueing, Fargate start-up and the runner's next step, which applies the result).
 */
export const PLAN_JOB_TIME_BUDGET_MS = 7 * 60 * 1000;
/** Budget of a draft that reads capability lists (xlsx / PDF) or covers many rows: one row of output per item. */
export const PLAN_JOB_LONG_TIME_BUDGET_MS = 25 * 60 * 1000;
/** A draft with more input rows than this gets the long budget. */
export const PLAN_JOB_SHORT_ROWS = 20;

/** The budget of a job: short for a goal or a short list and for every re-plan, long for a draft of long lists. */
export function planJobBudgetMs(input: Pick<PlanJobInput, "kind" | "attachments" | "rows">): number {
  return input.kind === "draft" && (input.attachments.length > 0 || input.rows.length > PLAN_JOB_SHORT_ROWS) ? PLAN_JOB_LONG_TIME_BUDGET_MS : PLAN_JOB_TIME_BUDGET_MS;
}
/** At most this many of the owner's projects and Canons are summarised in the input. */
export const PLAN_JOB_INPUT_LIMITS = { projects: 300, canons: 50, text: 600 } as const;
export const MAX_PLAN_PROPOSALS = 30;
export const MAX_PLAN_UNREAD = 200;

/**
 * Capability lists a plan accepts: CSV / TSV / text are read at once by the API (`parsePlanRowsCsv`), xlsx and PDF by
 * the draft job.
 */
export const PLAN_ATTACHMENT_EXTS = ["csv", "tsv", "txt", "xlsx", "pdf"] as const;
export const PLAN_DETERMINISTIC_EXTS: readonly string[] = ["csv", "tsv", "txt"];
export function planAttachmentTypeOf(fileName: string): AttachmentType | null {
  const t = attachmentTypeOf(fileName);
  return t && (PLAN_ATTACHMENT_EXTS as readonly string[]).includes(t.ext) ? t : null;
}
/** True for files the API reads itself (the rows are in the plan before any job runs). */
export const isDeterministicPlanAttachment = (fileName: string) => PLAN_DETERMINISTIC_EXTS.includes(planAttachmentTypeOf(fileName)?.ext ?? "");

// --- input -----------------------------------------------------------------------------------------------------------

export interface PlanJobInputRow {
  rowId: string;
  roi: string;
  tlf: string;
  rationale: string;
  state: PlanRowRecord["state"];
  wave: number;
  seed: boolean;
  anchors: string[];
  anchorsSource: "predicted" | "used" | null;
  /** The project the row built or reuses */
  projectId: string | null;
  existing: boolean;
  /** The owner's priority (returned unchanged by the job) and the row's current dependencies (row IDs) */
  priority: number | null;
  dependsOn: string[];
  /** The owner chose to build the row although a finished project has its ROI × TLF: never name an existing project */
  rebuild: boolean;
}

export interface PlanJobInput {
  schema: typeof PLAN_JOB_INPUT_SCHEMA;
  kind: PlanJobKind;
  planId: string;
  jobId: string;
  createdAt: string;
  /** Language of `rationale`, `reason`, `notes` and the policy (null: the language of the goal) */
  locale: UiLocale | null;
  goal: string;
  /** The plan's policy as it is (all items empty before the first draft) */
  policy: PlanPolicy;
  /** Capability lists for the model to read (key relative to `plans/{planId}/`) */
  attachments: { id: string; name: string; key: string }[];
  /** The plan's rows as they are (a draft: rows already read from CSV or typed in; a re-plan: every row) */
  rows: PlanJobInputRow[];
  /** The owner's projects (newest first) for duplicates and context */
  projects: { projectId: string; name: string; roi: string; tlf: string; status: ProjectStatus; completed: boolean; canonId: string | null }[];
  /** The owner's Canons */
  canons: { canonId: string; name: string; policy: string; headRevision: number; memberCount: number }[];
  /** Rows that can run at once (for the model's sense of scale only; the code computes the waves) */
  concurrency: number;
  /** Re-plan: the wave that has just finished */
  wave: number | null;
}

const clipText = (s: string, n: number = PLAN_JOB_INPUT_LIMITS.text) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Bounded input for a job. Rows and their anchors are complete (the model must see every row it may refer to). */
export function buildPlanJobInput(x: Omit<PlanJobInput, "schema" | "projects" | "canons"> & { projects: PlanJobInput["projects"]; canons: PlanJobInput["canons"] }): PlanJobInput {
  return {
    schema: PLAN_JOB_INPUT_SCHEMA,
    ...x,
    goal: clipText(x.goal, PLAN_LIMITS.maxGoal),
    policy: planPolicyOf(x.policy),
    projects: x.projects.slice(0, PLAN_JOB_INPUT_LIMITS.projects).map((p) => ({ ...p, name: clipText(p.name, 200), roi: clipText(p.roi, 300), tlf: clipText(p.tlf, 300) })),
    canons: x.canons.slice(0, PLAN_JOB_INPUT_LIMITS.canons).map((c) => ({ ...c, name: clipText(c.name, 200), policy: clipText(c.policy, 1000) })),
  };
}

// --- output ----------------------------------------------------------------------------------------------------------

const ROW_PROPS = {
  roi: { type: "string" },
  tlf: { type: "string" },
  rationale: { type: "string" },
  anchors: { type: "array", items: { type: "string" } },
  dependsOn: { type: "array", items: { type: "string" } },
} as const;

const POLICY_SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(PLAN_POLICY_ITEMS.map((k) => [k, { type: "string" }])),
    fromAnswers: { type: "array", items: { type: "string", enum: [...PLAN_POLICY_ITEMS] } },
  },
  required: [...PLAN_POLICY_ITEMS, "fromAnswers"],
  additionalProperties: false,
} as const;

/** Output schema of the `plan` job (Codex structured output: every property required, no others). */
export const PLAN_RESULT_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          ...ROW_PROPS,
          priority: { type: "integer" },
          existingProjectId: { type: "string" },
          source: { type: "string" },
        },
        required: ["id", "roi", "tlf", "rationale", "anchors", "dependsOn", "priority", "existingProjectId", "source"],
        additionalProperties: false,
      },
    },
    unread: {
      type: "array",
      items: {
        type: "object",
        properties: { source: { type: "string" }, location: { type: "string" }, reason: { type: "string" } },
        required: ["source", "location", "reason"],
        additionalProperties: false,
      },
    },
    policy: POLICY_SCHEMA,
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["add", "remove", "policy"] },
          rowId: { type: "string" },
          ...ROW_PROPS,
          policy: POLICY_SCHEMA,
          reason: { type: "string" },
        },
        required: ["kind", "rowId", "roi", "tlf", "rationale", "anchors", "dependsOn", "policy", "reason"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["rows", "unread", "policy", "proposals", "notes"],
  additionalProperties: false,
} as const;

/** A row of a draft as kept: `ref` is the input row it describes (null: a new row with the model's `id`). */
export interface PlanDraftRow {
  id: string;
  ref: string | null;
  roi: string;
  tlf: string;
  rationale: string;
  anchors: string[];
  /** IDs of other rows of the draft (`id` of new rows, row IDs of input rows) */
  dependsOn: string[];
  priority: number | null;
  /** A COMPLETED project of the owner (from the input) that already covers the row */
  existingProjectId: string | null;
  /** Where the row came from (the goal, an attachment and its location), for the owner */
  source: string;
}

export interface PlanProposalDraft {
  kind: PlanProposalKind;
  /** remove: a row of the input that has not started */
  rowId: string | null;
  /** add: the new row (dependencies on input rows only) */
  row: { roi: string; tlf: string; rationale: string; anchors: string[]; dependsOn: string[] } | null;
  /** policy: the whole new policy */
  policy: PlanPolicy | null;
  reason: string;
}

/** `result.json` of a `plan` job. */
export interface PlanJobResult {
  schema: typeof PLAN_JOB_RESULT_SCHEMA;
  kind: PlanJobKind;
  planId: string;
  jobId: string;
  model: string;
  locale: UiLocale | null;
  createdAt: string;
  rows: PlanDraftRow[];
  unread: PlanUnread[];
  /** The policy the job returned (empty when it wrote none) */
  policy: PlanPolicy;
  proposals: PlanProposalDraft[];
  notes: string;
  /** Parts that referred to rows, anchors or projects not in the input, or were not usable (removed) */
  dropped: number;
}

export type ParsedPlanResult = Pick<PlanJobResult, "rows" | "unread" | "policy" | "proposals" | "notes" | "dropped">;

const str = (v: unknown, n: number) => (typeof v === "string" ? (v.trim().length > n ? `${v.trim().slice(0, n)}…` : v.trim()) : "");

/**
 * Parses the model's reply and keeps only what refers to the input: rows of a draft (input rows by their row ID, new
 * rows by the model's `id`), valid SABRA anchors, dependencies on rows of the draft, existing projects that are in the
 * input and finished; proposals of a re-plan that add a row not in the plan yet, remove a row that has not started, or
 * change the policy. Everything else is dropped and counted. null when the reply is not the schema's object.
 */
export function parsePlanResult(text: string, input: Pick<PlanJobInput, "kind" | "rows" | "projects" | "policy">): ParsedPlanResult | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // the policy is the schema's object; a string (a reply in the old shape) is read as the granularity
  if (!Array.isArray(r.rows) || !Array.isArray(r.proposals) || r.policy === null || (typeof r.policy !== "object" && typeof r.policy !== "string")) return null;
  let dropped = 0;
  const inputRows = new Map(input.rows.map((x) => [x.rowId, x]));
  const completed = new Set(input.projects.filter((p) => p.completed).map((p) => p.projectId));

  const rows: PlanDraftRow[] = [];
  if (input.kind === "draft") {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const item of r.rows) {
      if (rows.length >= PLAN_LIMITS.maxRows) {
        dropped++;
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const x = item as Record<string, unknown>;
      const id = str(x.id, 40);
      const n = normalizePlanRow({ roi: x.roi, tlf: x.tlf, rationale: x.rationale });
      if (!id || ids.has(id) || "reason" in n) {
        dropped++;
        continue;
      }
      const key = planRowKey(n.row.roi, n.row.tlf);
      if (keys.has(key)) {
        dropped++;
        continue;
      }
      ids.add(id);
      keys.add(key);
      const a = planAnchors(x.anchors);
      dropped += a.dropped;
      const ex = str(x.existingProjectId, 40);
      if (ex && !completed.has(ex)) dropped++;
      rows.push({
        id,
        ref: inputRows.has(id) ? id : null,
        ...n.row,
        anchors: a.anchors,
        dependsOn: Array.isArray(x.dependsOn) ? x.dependsOn.map((d) => str(d, 40)).filter(Boolean) : [],
        priority: typeof x.priority === "number" && Number.isInteger(x.priority) && x.priority >= PLAN_LIMITS.minPriority && x.priority <= PLAN_LIMITS.maxPriority ? x.priority : null,
        existingProjectId: ex && completed.has(ex) ? ex : null,
        source: str(x.source, 300),
      });
    }
    // dependencies only on rows of this draft (by `id`, or input rows by row ID), never on themselves
    const known = new Set([...ids, ...inputRows.keys()]);
    for (const row of rows) {
      const ok = [...new Set(row.dependsOn.filter((d) => known.has(d) && d !== row.id))];
      dropped += row.dependsOn.length - ok.length;
      row.dependsOn = ok;
    }
  } else if (r.rows.length) dropped += r.rows.length;

  const unread: PlanUnread[] = (Array.isArray(r.unread) ? r.unread : [])
    .slice(0, MAX_PLAN_UNREAD)
    .map((u) => (u && typeof u === "object" ? (u as Record<string, unknown>) : {}))
    .map((u) => ({ source: str(u.source, 300), location: str(u.location, 300), reason: str(u.reason, 600) }))
    .filter((u) => u.reason);

  const proposals: PlanProposalDraft[] = [];
  if (input.kind === "replan") {
    const planKeys = new Set(input.rows.filter((x) => x.state !== "skipped").map((x) => planRowKey(x.roi, x.tlf)));
    for (const item of r.proposals) {
      if (!item || typeof item !== "object") continue;
      if (proposals.length >= MAX_PLAN_PROPOSALS) {
        dropped++;
        continue;
      }
      const x = item as Record<string, unknown>;
      const reason = str(x.reason, 1000);
      if (x.kind === "add") {
        const n = normalizePlanRow({ roi: x.roi, tlf: x.tlf, rationale: x.rationale });
        if ("reason" in n || planKeys.has(planRowKey(n.row.roi, n.row.tlf))) {
          dropped++;
          continue;
        }
        planKeys.add(planRowKey(n.row.roi, n.row.tlf));
        const a = planAnchors(x.anchors);
        dropped += a.dropped;
        const deps = Array.isArray(x.dependsOn) ? x.dependsOn.map((d) => str(d, 40)).filter(Boolean) : [];
        const okDeps = [...new Set(deps.filter((d) => inputRows.has(d)))];
        dropped += deps.length - okDeps.length;
        proposals.push({ kind: "add", rowId: null, row: { roi: n.row.roi, tlf: n.row.tlf, rationale: n.row.rationale, anchors: a.anchors, dependsOn: okDeps }, policy: null, reason });
      } else if (x.kind === "remove") {
        const id = str(x.rowId, 40);
        const target = inputRows.get(id);
        if (!target || target.state !== "pending" || target.projectId || target.existing || proposals.some((p) => p.rowId === id)) {
          dropped++;
          continue;
        }
        proposals.push({ kind: "remove", rowId: id, row: null, policy: null, reason });
      } else if (x.kind === "policy") {
        const policy = planPolicyOf(x.policy);
        if (isEmptyPlanPolicy(policy) || samePlanPolicy(policy, planPolicyOf(input.policy)) || proposals.some((p) => p.kind === "policy")) {
          dropped++;
          continue;
        }
        proposals.push({ kind: "policy", rowId: null, row: null, policy, reason });
      } else dropped++;
    }
  } else if (r.proposals.length) dropped += r.proposals.length;

  return { rows, unread, policy: planPolicyOf(r.policy), proposals, notes: str(r.notes, 4000), dropped };
}

// --- prompt ----------------------------------------------------------------------------------------------------------

export const PLAN_RETRY_PROMPT = "Your reply was not the JSON object of the output schema. Reply again with that object only, following the same rules.";

/**
 * The prompt of a `plan` job: the instructions of `prompts/plan.md` (`spec`), the task of this kind, the reply
 * language, where the attachments' text is, and the input.
 */
export function planJobPrompt(spec: string, input: PlanJobInput, materialsIndex: string | null): string {
  const lang = input.locale ? uiLanguageName(input.locale) : "the language of the goal";
  return [
    spec.trim(),
    "",
    `Task: ${input.kind === "draft" ? "DRAFT — write the policy (`policy`), the rows of the plan (`rows`) and the rows you could not read (`unread`); leave `proposals` empty." : `REPLAN — wave ${input.wave ?? "?"} has just finished. Propose changes (\`proposals\`) only where the finished rows show they are needed; leave \`rows\` and \`unread\` empty and return the current policy in \`policy\`.`}`,
    `Write \`rationale\`, \`reason\`, \`notes\` and the policy in ${lang}. Keep ROI and TLF in the language they are given in (English when you write them yourself); keep anchors, row IDs and project IDs exactly as written.`,
    materialsIndex ? `Attached capability lists (read each file; the text of xlsx and PDF files is next to it):\n${materialsIndex.trim()}` : "No attached files.",
    "",
    "Input (JSON):",
    "```json",
    JSON.stringify(input),
    "```",
  ].join("\n");
}

/** One-line summary of a row for the event history. */
export const planRowLabel = (r: { roi: string; tlf: string }) => [cleanPlanText(r.tlf), cleanPlanText(r.roi)].filter(Boolean).join(" in ");
