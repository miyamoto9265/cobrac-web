/**
 * Hypothesis mode, stage 2: the `hypothesis` part of a create or follow-up request. The API validates it with these
 * functions (messages in Japanese, like the API's other 400s) and the screens build it with the same types, so both
 * sides agree on what a scope is. A scope is never inferred from the text of an instruction.
 */
import {
  DEFAULT_HYPOTHESIS_MAX_SHARE,
  HYPOTHESIS_CLAIMS,
  HYPOTHESIS_MAX_SHARES,
  describeScope,
  normalizeScopes,
  type EvidenceMode,
  type HypothesisClaim,
  type HypothesisScope,
  type HypothesisScopeTarget,
} from "./hypothesis.js";

/** `CreateProjectRequest.hypothesis`: the first scope (S1, the whole HCD) and the share limit. */
export interface HypothesisCreateRequest {
  claims: HypothesisClaim[];
  /** One of `HYPOTHESIS_MAX_SHARES`; absent = 0.2 */
  maxShare?: number;
  /** Where hypotheses may be needed, one line (200 characters at most) */
  note?: string;
}

/** `FollowupRequest.hypothesis`: a new scope for this follow-up (S2, S3, …) and, optionally, a new share limit. */
export interface HypothesisFollowupRequest extends HypothesisCreateRequest {
  target: HypothesisScopeTarget;
}

/** A request part after validation. `maxShare` null: not given (create: the default; follow-up: the limit stays). */
export interface HypothesisInput {
  claims: HypothesisClaim[];
  maxShare: number | null;
  note: string | null;
  target: HypothesisScopeTarget;
}

export const HYPOTHESIS_NOTE_MAX = 200;
export const HYPOTHESIS_TARGET_MAX = 200;
export const HYPOTHESIS_TARGET_ID_MAX = 100;

type Parsed = { input: HypothesisInput } | { error: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function parseClaims(v: unknown): HypothesisClaim[] | string {
  if (!Array.isArray(v) || v.length === 0) return "仮説の主張（claims）を 1 つ以上指定してください";
  const out: HypothesisClaim[] = [];
  for (const c of v) {
    if (typeof c !== "string" || !(HYPOTHESIS_CLAIMS as readonly string[]).includes(c)) return `仮説の主張が不正です: ${String(c).slice(0, 40)}`;
    if (out.includes(c as HypothesisClaim)) return `仮説の主張が重複しています: ${c}`;
    out.push(c as HypothesisClaim);
  }
  return out;
}

function parseMaxShare(v: unknown): number | null | string {
  if (v === undefined || v === null) return null;
  return typeof v === "number" && (HYPOTHESIS_MAX_SHARES as readonly number[]).includes(v) ? v : "仮説の割合の上限は 0.1・0.2・0.3・0.5 のどれかで指定してください";
}

/** The note on one line (line breaks and runs of spaces become one space); null when empty. */
function parseNote(v: unknown): string | null | { error: string } {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return { error: "仮説の一文（note）は文字列で指定してください" };
  const note = v.replace(/\s+/g, " ").trim();
  if ([...note].length > HYPOTHESIS_NOTE_MAX) return { error: `仮説の一文（note）は ${HYPOTHESIS_NOTE_MAX} 文字までです` };
  return note || null;
}

function parseIds(v: unknown, what: string, gn: boolean): string[] | string {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return `仮説の対象（${what}）は配列で指定してください`;
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string" || !raw || /\s/.test(raw) || [...raw].length > HYPOTHESIS_TARGET_ID_MAX)
      return `仮説の対象の ID が不正です（空白を含まない ${HYPOTHESIS_TARGET_ID_MAX} 文字以内）: ${String(raw).slice(0, 40)}`;
    // the forms the checks use: Circuit IDs without `U.` or backticks, GN IDs with `R.`
    const id = gn ? raw : raw.replace(/`/g, "").replace(/^U\./, "");
    if (gn && !/^R\.\S+$/.test(id)) return `GN の ID は R. で始めてください: ${raw.slice(0, 40)}`;
    if (!id) return `仮説の対象の ID が不正です: ${raw.slice(0, 40)}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function parseTarget(v: unknown): HypothesisScopeTarget | string {
  if (!isObject(v)) return "仮説の対象（target）を指定してください";
  if (v.kind === "all") return { kind: "all" };
  if (v.kind !== "items") return "仮説の対象（target.kind）は all か items で指定してください";
  const circuitIds = parseIds(v.circuitIds, "circuitIds", false);
  if (typeof circuitIds === "string") return circuitIds;
  const gnIds = parseIds(v.gnIds, "gnIds", true);
  if (typeof gnIds === "string") return gnIds;
  const n = circuitIds.length + gnIds.length;
  if (n === 0) return "仮説の対象に回路か GN を 1 つ以上選んでください";
  if (n > HYPOTHESIS_TARGET_MAX) return `仮説の対象は ${HYPOTHESIS_TARGET_MAX} 件までです`;
  return { kind: "items", circuitIds, gnIds };
}

/**
 * `hypothesis` of a create (`withTarget` false: the target is the whole HCD) or follow-up request. `null` when the
 * request has none (absent or null): the project / job is unchanged.
 */
export function parseHypothesisRequest(v: unknown, o: { withTarget: boolean }): Parsed | null {
  if (v === undefined || v === null) return null;
  if (!isObject(v)) return { error: "hypothesis はオブジェクトで指定してください" };
  const claims = parseClaims(v.claims);
  if (typeof claims === "string") return { error: claims };
  const maxShare = parseMaxShare(v.maxShare);
  if (typeof maxShare === "string") return { error: maxShare };
  const note = parseNote(v.note);
  if (note && typeof note === "object") return note;
  const target = o.withTarget ? parseTarget(v.target) : ({ kind: "all" } as const);
  if (typeof target === "string") return { error: target };
  return { input: { claims, maxShare, note, target } };
}

/** The next scope ID of a project: `S<largest number + 1>` (S1 for the first). */
export function nextScopeId(stored: unknown): string {
  const nums = normalizeScopes(stored).map((s) => Number(s.id.slice(1)));
  return `S${nums.length ? Math.max(...nums) + 1 : 1}`;
}

export function buildScope(input: HypothesisInput, id: string, jobId: string, createdAt: string): HypothesisScope {
  return { id, claims: input.claims, target: input.target, ...(input.note ? { note: input.note } : {}), jobId, createdAt };
}

/** Project attributes of a project created in hypothesis mode: scope S1 on the whole HCD and the share limit. */
export function hypothesisCreateFields(input: HypothesisInput, jobId: string, createdAt: string): { evidenceMode: EvidenceMode; hypothesisScopes: HypothesisScope[]; hypothesisMaxShare: number } {
  return {
    evidenceMode: "hypothesis",
    hypothesisScopes: [buildScope({ ...input, target: { kind: "all" } }, "S1", jobId, createdAt)],
    hypothesisMaxShare: input.maxShare ?? DEFAULT_HYPOTHESIS_MAX_SHARE,
  };
}

/**
 * A follow-up that allows hypotheses: its new scope (appended after the stored ones) and the project attributes to
 * write with the job. A project that did not allow hypotheses switches to hypothesis mode here.
 */
export function hypothesisFollowupFields(
  project: { hypothesisScopes?: unknown; hypothesisMaxShare?: unknown },
  input: HypothesisInput,
  jobId: string,
  createdAt: string,
): { scope: HypothesisScope; fields: { evidenceMode: EvidenceMode; hypothesisScopes: HypothesisScope[]; hypothesisMaxShare?: number } } {
  const stored = Array.isArray(project.hypothesisScopes) ? (project.hypothesisScopes as HypothesisScope[]) : [];
  const scope = buildScope(input, nextScopeId(stored), jobId, createdAt);
  return {
    scope,
    fields: {
      evidenceMode: "hypothesis",
      hypothesisScopes: [...stored, scope],
      ...(input.maxShare !== null ? { hypothesisMaxShare: input.maxShare } : project.hypothesisMaxShare === undefined ? { hypothesisMaxShare: DEFAULT_HYPOTHESIS_MAX_SHARE } : {}),
    },
  };
}

/** One line for the timeline and the follow-up prompt: the scope and the share limit. */
export function scopeLine(scope: HypothesisScope, maxShare: number): string {
  return `${describeScope(scope)} (share limit ${Math.round(maxShare * 100)}%)`;
}
