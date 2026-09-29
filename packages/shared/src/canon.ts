// ---------------------------------------------------------------------------
// Canon: a set of projects whose circuit definitions must agree (same UC Descriptor → same
// Uniform/Collection status and decomposition; Sender = Uniform across projects).
// Canon ID `<userKey>-c<seq>`: issued once per owner, never changed or reused.
// ---------------------------------------------------------------------------

import { USER_KEY_REGEX, normalizeProjectName } from "./projectId.js";

export const CANON_ID_REGEX = /^u[0-9a-hjkmnp-tv-z]{7}-c[1-9][0-9]*$/;
export const CANON_DESCRIPTION_MAX = 2000;
export const CANON_POLICY_MAX = 2000;

/** strict: Canon violations are errors the agent must fix; advisory: they are only warnings */
export type CanonConstraintMode = "strict" | "advisory";
export const CANON_CONSTRAINT_MODES: readonly CanonConstraintMode[] = ["strict", "advisory"];
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
  constraintMode: CanonConstraintMode;
  visibility: CanonVisibility;
  /** Public Canons accept pull requests from other users' Canons unless this is false (absent = true) */
  acceptPullRequests?: boolean;
  publishedAt?: string | null;
  /** Last approved revision; 0 = empty Canon */
  headRevision: number;
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
  constraintMode?: CanonConstraintMode;
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
}

export interface ListCanonsResponse {
  items: CanonRecord[];
}

export interface CanonRevisionSummary {
  revision: number;
  createdAt: string;
}
