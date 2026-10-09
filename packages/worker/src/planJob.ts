/**
 * The `plan` jobs of the CoBRAC Orchestrator (draft, re-plan, and an autonomous plan's row jobs), free of AWS / Codex
 * so they can be tested with a mock model:
 * one turn on the input the plan runner wrote, one more when the reply is not the schema's object, all within the
 * job's time budget. Only what refers to the input is kept (`parsePlanResult`); HOMBA anchors RCS does not know, or
 * that SABRA covers with BNA, are removed as well.
 */
import type { ParsedPlanResult, PlanJobInput, PlanRowJobDecision, PlanRowJobInput, SabraLookup, TokenUsage } from "@cobrac/shared";
import { EMPTY_USAGE, PLAN_RETRY_PROMPT, PLAN_ROW_RETRY_PROMPT, addUsage, parsePlanResult, parsePlanRowResult, planJobPrompt, planRowJobPrompt, planRowJobSchema } from "@cobrac/shared";
import type { MaterialEntry } from "./materials.js";

export interface PlanTurn {
  text: string;
  /** Tokens of this turn alone */
  usage: TokenUsage;
}

export interface PlanJobDriver {
  input: PlanJobInput;
  /** The instructions (prompts/plan.md) */
  spec: string;
  /** Where the attachments' text is (`planMaterialsIndex`); null: no attachments */
  materialsIndex: string | null;
  /** One model turn on the job's thread; throws when the turn fails or `signal` aborts it */
  turn: (prompt: string, signal: AbortSignal) => Promise<PlanTurn>;
  /** SABRA facts of HOMBA IDs from RCS (absent: RCS is not configured, anchors are kept as parsed) */
  lookupHomba?: (ids: string[]) => Promise<SabraLookup>;
  /** Epoch ms at which the job is out of time; the running turn is aborted then */
  deadlineMs: number;
  now?: () => number;
  maxAttempts?: number;
}

export type PlanJobOutcome =
  | { result: "completed"; parsed: ParsedPlanResult; usage: TokenUsage; attempts: number }
  | { result: "failed"; error: string; usage: TokenUsage };

export const PLAN_TIME_BUDGET_ERROR = "The plan job took longer than its time budget";
export const PLAN_FORMAT_ERROR = "The model did not return the plan in the expected format. Try again.";
const MAX_ERROR_CHARS = 500;

/**
 * A failed turn's message for the job (the owner sees it): Codex may append its stderr, so it is shortened and anything
 * shaped like an API key is masked.
 */
function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(/\bsk-[A-Za-z0-9_-]+/g, "sk-…").slice(0, MAX_ERROR_CHARS);
}

export async function runPlanJob(d: PlanJobDriver): Promise<PlanJobOutcome> {
  const o = await runTurns({
    first: planJobPrompt(d.spec, d.input, d.materialsIndex),
    retry: PLAN_RETRY_PROMPT,
    turn: d.turn,
    parse: (text) => parsePlanResult(text, d.input),
    after: d.lookupHomba ? (parsed, timedOut) => dropUnknownHomba(parsed, d.lookupHomba!, timedOut) : undefined,
    deadlineMs: d.deadlineMs,
    now: d.now,
    maxAttempts: d.maxAttempts,
  });
  return o.result === "completed" ? { result: "completed", parsed: o.value, usage: o.usage, attempts: o.attempts } : o;
}

/** A row job of an autonomous plan (自律実行): the Orchestrator's AI answers a question or resolves a row (prompts/orchestrator.md). */
export interface PlanRowJobDriver {
  input: PlanRowJobInput;
  /** The instructions (prompts/orchestrator.md) */
  spec: string;
  /** One model turn with the kind's output schema; throws when the turn fails or `signal` aborts it */
  turn: (prompt: string, schema: object, signal: AbortSignal) => Promise<PlanTurn>;
  deadlineMs: number;
  now?: () => number;
  maxAttempts?: number;
}

export type PlanRowJobOutcome = { result: "completed"; decision: PlanRowJobDecision; usage: TokenUsage; attempts: number } | { result: "failed"; error: string; usage: TokenUsage };

export async function runPlanRowJob(d: PlanRowJobDriver): Promise<PlanRowJobOutcome> {
  const schema = planRowJobSchema(d.input.kind);
  const o = await runTurns({
    first: planRowJobPrompt(d.spec, d.input),
    retry: PLAN_ROW_RETRY_PROMPT,
    turn: (prompt, signal) => d.turn(prompt, schema, signal),
    parse: (text) => parsePlanRowResult(text, d.input),
    deadlineMs: d.deadlineMs,
    now: d.now,
    maxAttempts: d.maxAttempts,
  });
  return o.result === "completed" ? { result: "completed", decision: o.value, usage: o.usage, attempts: o.attempts } : o;
}

/**
 * The turns of a one-shot job: the first prompt, then the retry prompt while the reply cannot be parsed (at most
 * `maxAttempts` turns), all within the deadline (a turn that ignores the abort signal cannot hold the job past it).
 */
async function runTurns<T>(o: {
  first: string;
  retry: string;
  turn: (prompt: string, signal: AbortSignal) => Promise<PlanTurn>;
  parse: (text: string) => T | null;
  after?: (value: T, timedOut: Promise<unknown>) => Promise<void>;
  deadlineMs: number;
  now?: () => number;
  maxAttempts?: number;
}): Promise<{ result: "completed"; value: T; usage: TokenUsage; attempts: number } | { result: "failed"; error: string; usage: TokenUsage }> {
  const attempts = o.maxAttempts ?? 2;
  const now = o.now ?? Date.now;
  if (o.deadlineMs <= now()) return { result: "failed", error: PLAN_TIME_BUDGET_ERROR, usage: EMPTY_USAGE };
  const controller = new AbortController();
  const { signal } = controller;
  // resolves when the deadline passes, so a turn that ignores the signal cannot hold the job past its budget
  const timedOut = new Promise<"timeout">((resolve) => signal.addEventListener("abort", () => resolve("timeout"), { once: true }));
  const timer = setTimeout(() => controller.abort(new Error(PLAN_TIME_BUDGET_ERROR)), o.deadlineMs - now());
  let usage: TokenUsage = EMPTY_USAGE;
  let prompt = o.first;
  try {
    for (let i = 0; i < attempts; i++) {
      if (signal.aborted) return { result: "failed", error: PLAN_TIME_BUDGET_ERROR, usage };
      let t: PlanTurn | "timeout";
      try {
        const running = o.turn(prompt, signal);
        running.catch(() => undefined);
        t = await Promise.race([running, timedOut]);
      } catch (e) {
        if (signal.aborted) return { result: "failed", error: PLAN_TIME_BUDGET_ERROR, usage };
        return { result: "failed", error: errorText(e), usage };
      }
      if (t === "timeout") return { result: "failed", error: PLAN_TIME_BUDGET_ERROR, usage };
      usage = addUsage(usage, t.usage);
      const value = o.parse(t.text);
      if (value) {
        if (o.after) await o.after(value, timedOut);
        return { result: "completed", value, usage, attempts: i + 1 };
      }
      prompt = o.retry;
    }
    return { result: "failed", error: PLAN_FORMAT_ERROR, usage };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Removes HOMBA anchors RCS reports unknown (`null`), or on the BNA side of SABRA (a region whose SABRA unit is a BNA
 * area, which finished projects anchor as `BNA:<l>-<r>`, so the HOMBA ID would never match their anchors), from the rows
 * and the added rows, counting them in `dropped`. Anchors that could not be looked up (RCS down, out of time) are kept:
 * they are still valid IDs as far as we know.
 */
export async function dropUnknownHomba(parsed: ParsedPlanResult, lookup: (ids: string[]) => Promise<SabraLookup>, timedOut?: Promise<unknown>): Promise<void> {
  const lists: { anchors: string[] }[] = [...parsed.rows, ...parsed.proposals.flatMap((p) => (p.row ? [p.row] : []))];
  const ids = [...new Set(lists.flatMap((r) => r.anchors.filter((a) => a.startsWith("HOMBA:"))))];
  if (!ids.length) return;
  let known: SabraLookup;
  try {
    const asked = lookup(ids);
    asked.catch(() => undefined);
    const found = await Promise.race([asked, ...(timedOut ? [timedOut.then(() => null)] : [])]);
    if (!found) return;
    known = found;
  } catch (e) {
    console.warn(`[plan] HOMBA lookup failed; anchors kept: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const r of lists) {
    const keep = r.anchors.filter((a) => !(known.has(a) && (known.get(a) === null || known.get(a)?.atlas === "BNA")));
    parsed.dropped += r.anchors.length - keep.length;
    r.anchors = keep;
  }
}

/** The attachments for the prompt: where each file and its extracted text is, relative to the agent's working directory. */
export function planMaterialsIndex(entries: MaterialEntry[]): string | null {
  if (!entries.length) return null;
  return entries
    .map((e) => {
      const parts = [`- ${e.id} "${e.source}":`];
      if (e.path) parts.push(`original \`${e.path}\``);
      if (e.textPath && e.textPath !== e.path) parts.push(`text \`${e.textPath}\``);
      parts.push(e.status === "ok" ? `(ok${e.note ? `: ${e.note}` : ""})` : `(${e.status}: ${e.note || "not readable"}; list what you cannot read in \`unread\`)`);
      return parts.join(" ");
    })
    .join("\n");
}
