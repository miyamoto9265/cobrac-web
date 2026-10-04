// ---------------------------------------------------------------------------
// Canon: a set of projects whose circuit definitions must agree (same UC Descriptor → same
// Uniform/Collection status and decomposition; Sender = Uniform across projects).
// Canon ID `<userKey>-c<seq>`: issued once per owner, never changed or reused.
// ---------------------------------------------------------------------------

import { USER_KEY_REGEX, normalizeProjectName } from "./projectId.js";

export const CANON_ID_REGEX = /^u[0-9a-hjkmnp-tv-z]{7}-c[1-9][0-9]*$/;
export const CANON_DESCRIPTION_MAX = 2000;
export const CANON_POLICY_MAX = 2000;

export type CanonVisibility = "private" | "public";

/** `META` item of the Canons table (PK canonId, SK "META"). */
export interface CanonRecord {
  canonId: string;
  sk: "META";
  ownerUserId: string;
  name: string;
  description: string;
  /** Granularity policy in prose (e.g. "neocortex: area × projection class"); given to the agent */
  policy: string;
  /** Written by 0.12.0 ("strict" / "advisory") and ignored since: every Canon's conflicts are errors to fix */
  constraintMode?: string;
  visibility: CanonVisibility;
  /** Public Canons accept pull requests from other users' Canons unless this is false (absent = true) */
  acceptPullRequests?: boolean;
  publishedAt?: string | null;
  /** Last approved revision; 0 = empty Canon */
  headRevision: number;
  /** Approvals a pull request needs before it is merged. Not settable yet: absent = 1 (`requiredApprovals`) */
  requiredApprovals?: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  /** Soft delete: the items stay; members are released */
  deletedAt?: string | null;
}

/** `MEMBER#<projectId>` item: a project of the owner that follows this Canon. */
export interface CanonMemberRecord {
  canonId: string;
  sk: string;
  projectId: string;
  joinedAt: string;
}

export const CANON_META_SK = "META";
export const CANON_MEMBER_PREFIX = "MEMBER#";
export const CANON_REVISION_PREFIX = "REV#";
export const CANON_PR_PREFIX = "PR#";
const pad = (n: number) => String(n).padStart(6, "0");
export const canonPrSk = (no: number) => `${CANON_PR_PREFIX}${pad(no)}`;
export const canonRevisionSk = (rev: number) => `${CANON_REVISION_PREFIX}${pad(rev)}`;
/** S3 keys (artifacts bucket). Revision snapshots are written once and never changed. */
export const canonRevisionKey = (canonId: string, rev: number) => `canons/${canonId}/rev/${rev}/canon.json`;
export const canonPrKey = (canonId: string, no: number, file: "incoming.json" | "diff.json") => `canons/${canonId}/pr/${no}/${file}`;
/** AI review of a PR: what the API gave the worker, and what the worker wrote back (one folder per job). */
export const canonAiReviewKey = (canonId: string, no: number, jobId: string, file: "input.json" | "result.json") => `canons/${canonId}/pr/${no}/ai/${jobId}/${file}`;

export type CanonPrState = "open" | "approved" | "rejected" | "withdrawn" | "superseded";

/** `PR#<000012>` item: a push waiting for (or past) the owner's review. */
export interface CanonPullRequestRecord {
  canonId: string;
  sk: string;
  prNo: number;
  /** `project:<projectId>` (stage 2) or `canon:<canonId>` (stage 2′) */
  source: string;
  sourceName: string;
  sourceRevision: number;
  /** Canon revision the diff was computed against (updated when the diff is recomputed at approval) */
  baseRevision: number;
  state: CanonPrState;
  summary: { added: number; changed: number; unchanged: number; dropped: number; errors: number; warnings: number; infos: number };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  reason?: string | null;
  /** Revision created by approving it */
  mergedRevision?: number | null;
  /** Display name of `decidedBy` when the decision was made */
  decidedByName?: string | null;
  /** Approvals given so far (one is enough for now; see `requiredApprovals`) */
  approvals?: CanonApproval[];
  /** Who asked for changes, and when */
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  /** The reviewer asked for changes; the PR stays open until it is re-pushed (superseded), approved or rejected */
  reviewState?: "changes_requested" | null;
  reviewNote?: string | null;
}

export interface CanonApproval {
  userId: string;
  name: string;
  at: string;
}

export const CANON_DEFAULT_REQUIRED_APPROVALS = 1;
/** Approvals a pull request of this Canon needs. Fixed at 1 until a setting exists. */
export const requiredApprovals = (_c: Pick<CanonRecord, "requiredApprovals">) => CANON_DEFAULT_REQUIRED_APPROVALS;

/** How the caller relates to a Canon: its owner, a co-editor (reviews pull requests), or an admin reading it. */
export type CanonRole = "owner" | "editor" | "admin";

/** `EDITOR#<userId>` item: a co-editor the owner added. */
export interface CanonEditorRecord {
  canonId: string;
  sk: string;
  userId: string;
  /** Display name when added (refreshed when the list is read) */
  name: string;
  email: string;
  addedBy: string;
  addedAt: string;
}
export const CANON_EDITOR_PREFIX = "EDITOR#";
export const canonEditorSk = (userId: string) => `${CANON_EDITOR_PREFIX}${userId}`;

export interface CanonEditorSummary {
  userId: string;
  name: string;
  /** Shown to the owner only (who typed it when adding) */
  email?: string;
  addedAt: string;
}

export const CANON_PR_EVENT_PREFIX = "PEV#";
/** Query prefix of one PR's audit trail. `PEV#` does not start with `PR#`, so PR listings never see these items. */
export const canonPrEventPrefix = (no: number) => `${CANON_PR_EVENT_PREFIX}${pad(no)}#`;
export const canonPrEventSk = (no: number, at: string, nonce: string) => `${canonPrEventPrefix(no)}${at}#${nonce}`;

export type CanonPrEventType =
  | "pushed"
  | "superseded"
  | "rebased"
  | "comment"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "ai_requested"
  | "ai_completed"
  | "ai_failed";

/** One entry of a PR's audit trail (who did what, when). Comments may point at one diff item (`<kind>:<key>`). */
export interface CanonPrEvent {
  type: CanonPrEventType;
  at: string;
  /** userId; null for entries derived from older PRs without a trail */
  actor: string | null;
  actorName: string;
  note?: string | null;
  item?: string | null;
  itemLabel?: string | null;
  revision?: number | null;
  /** The PR that replaced this one (superseded) */
  byPr?: number | null;
  jobId?: string | null;
  model?: string | null;
  /** Conflict choices the approval was made with */
  choices?: Record<string, "canon" | "incoming"> | null;
}

/** `PEV#<000012>#<at>#<nonce>` item: append-only, never updated or deleted. */
export interface CanonPrEventRecord extends CanonPrEvent {
  canonId: string;
  sk: string;
  prNo: number;
}

export const CANON_PR_NOTE_MAX = 2000;

/** `OUT#<targetCanonId>#<000012>` item in the sending Canon: a pull request it sent to another Canon. */
export interface CanonOutgoingRecord {
  canonId: string;
  sk: string;
  targetCanonId: string;
  prNo: number;
  createdAt: string;
}
export const CANON_OUT_PREFIX = "OUT#";
export const canonOutSk = (target: string, no: number) => `${CANON_OUT_PREFIX}${target}#${pad(no)}`;

export interface CanonRevisionRecord {
  canonId: string;
  sk: string;
  revision: number;
  prNo: number;
  source: string;
  createdAt: string;
  circuitCount: number;
  connectionCount: number;
  /** Who approved the pull request that made this revision (absent for seeds and older revisions) */
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
}
export const canonMemberSk = (projectId: string) => `${CANON_MEMBER_PREFIX}${projectId}`;

export function formatCanonId(userKey: string, seq: number): string {
  if (!USER_KEY_REGEX.test(userKey)) throw new Error(`invalid userKey: ${userKey}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`invalid canon seq: ${seq}`);
  return `${userKey}-c${seq}`;
}

export function isCanonId(id: string): boolean {
  return CANON_ID_REGEX.test(id);
}

export function isCanonDeleted(c: Pick<CanonRecord, "deletedAt"> | null | undefined): boolean {
  return !!c?.deletedAt;
}

/** Same rules as project names (any language, 1–200 code points, no control characters). */
export const normalizeCanonName = normalizeProjectName;

/** Trimmed free text with line breaks kept; control characters other than \n and \t are rejected. */
export function normalizeCanonText(input: unknown, max: number): { text: string } | { error: string } {
  if (input === undefined || input === null) return { text: "" };
  if (typeof input !== "string") return { error: "must be a string" };
  const text = input.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(text)) return { error: "must not contain control characters" };
  if ([...text].length > max) return { error: `must be at most ${max} characters` };
  return { text };
}

export interface CreateCanonRequest {
  name: string;
  description?: string;
  policy?: string;
}

export type UpdateCanonRequest = Partial<CreateCanonRequest>;

export interface CanonMemberSummary {
  projectId: string;
  name: string;
  roi: string;
  tlf: string;
  status: string;
  hasArtifacts: boolean;
  joinedAt: string;
}

export interface CanonDetailResponse {
  canon: CanonRecord;
  members: CanonMemberSummary[];
  role: CanonRole;
  editors: CanonEditorSummary[];
  /** Owner's display name (shown to co-editors) */
  ownerName: string;
}

export interface ListCanonsResponse {
  items: CanonRecord[];
  /** Canons of other users where the caller is a co-editor */
  shared: (CanonRecord & { ownerName: string })[];
}

export interface CanonRevisionSummary {
  revision: number;
  createdAt: string;
  prNo?: number;
  source?: string;
  circuitCount?: number;
  connectionCount?: number;
  approvedByName?: string;
  approvedAt?: string;
}

/** Canon of a new project: none, an existing Canon of the owner, or a new Canon seeded from existing projects. */
export type CreateProjectCanon =
  | { mode: "none" }
  | { mode: "existing"; canonId: string }
  | {
      mode: "new";
      name: string;
      description?: string;
      policy?: string;
      /** Own project IDs in priority order (the first forms the base) */
      seeds: string[];
      /** Conflict ID → keep the earlier seed's value ("canon") or take the later one ("incoming") */
      choices?: Record<string, "canon" | "incoming">;
      /** Seeds with unsettled conflicts: kept as a pull request (default) or left out */
      actions?: Record<string, "pending" | "exclude">;
    };

export interface CanonSeedCandidate {
  projectId: string;
  name: string;
  roi: string;
  tlf: string;
  eligible: boolean;
  /** Why it cannot be a seed: running / no artifacts / in another Canon / deleted / not found */
  reason?: "not-found" | "not-completed" | "in-canon";
  canonName?: string;
}
