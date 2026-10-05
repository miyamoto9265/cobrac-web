// ---------------------------------------------------------------------------
// Publishing and cloning. A public project or Canon is listed in the Catalog table and can be read by any
// signed-in user; a public project can be cloned without asking its owner. Cloning only reads the original:
// artifacts are copied into the cloner's new project and the clone count lives in the Catalog table.
// ---------------------------------------------------------------------------

import { ARTICLE_FIGURE_KEY_RE } from "./articleFigures.js";
import { PROJECT_ID_REGEX } from "./projectId.js";

export type Visibility = "private" | "public";
export const VISIBILITIES: readonly Visibility[] = ["private", "public"];

export interface ClonedFrom {
  projectId: string;
  /** `revision` of the original when it was cloned */
  revision: number;
  /** Pseudonymous key of the original's owner (the userKey; never the owner's userId or e-mail) */
  ownerUserKey: string;
  name: string;
  clonedAt: string;
}

/** Catalog table: PK kind, SK id. `project` / `canon` rows exist while public; `clones` rows count clones and stay. */
export type CatalogKind = "project" | "canon" | "clones";

export interface CatalogItem {
  kind: CatalogKind;
  id: string;
  ownerUserId: string;
  name: string;
  roi?: string;
  tlf?: string;
  contributor?: string;
  /** Canon rows */
  policy?: string;
  headRevision?: number;
  memberCount?: number;
  publishedAt: string;
  updatedAt: string;
}

export interface CloneCounter {
  kind: "clones";
  id: string;
  count: number;
}

/**
 * Catalog rows with kind `id` reserve each random Project / Canon ID (a conditional Put; a taken ID is drawn again).
 * They are never deleted, so an ID is never reused. `<userKey>-<seq>` IDs issued before have no reservation row.
 */
export const ID_RESERVATION_KIND = "id";
export interface IdReservation {
  kind: typeof ID_RESERVATION_KIND;
  id: string;
  type: "project" | "canon";
  ownerUserId: string;
  createdAt: string;
}

export interface PublicProjectSummary {
  projectId: string;
  name: string;
  roi: string;
  tlf: string;
  contributor: string;
  ownerUserKey: string;
  publishedAt: string;
  updatedAt: string;
  cloneCount: number;
}

export interface PublicProjectDetail extends PublicProjectSummary {
  revision: number;
  completedAt: string | null;
  clonedFrom: ClonedFrom | null;
  /** Keys readable through /public/projects/{id}/text */
  files: string[];
}

export interface PublicCanonSummary {
  canonId: string;
  name: string;
  policy: string;
  headRevision: number;
  memberCount: number;
  ownerUserKey: string;
  publishedAt: string;
  updatedAt: string;
  acceptPullRequests: boolean;
}

export interface PublicCanonDetail extends PublicCanonSummary {
  description: string;
  /** Only members that are public themselves */
  publicMembers: { projectId: string; name: string; roi: string; tlf: string }[];
}

export interface CloneProjectResponse {
  projectId: string;
  copied: number;
}

/** Only projects with a random or `<userKey>-<seq>` ID can be published (the ID is rewritten safely when cloned). */
export function isPublishableProjectId(id: string): boolean {
  return PROJECT_ID_REGEX.test(id);
}

const TEXT_FILE_RE = /\.(json|jsonl|csv|md|txt|bib)$/i;

/**
 * Where an artifact of the original goes in the clone (relative to the project prefix), or null if it is not copied.
 * Copied: the workspace (HCD / FRG / CSV data, report, decision log, checks), the graph JSON and articles.
 * Not copied: the chat thread, attached materials (`attachments/`), the BRA xlsx outputs (they carry the original Project ID; a follow-up rebuilds them)
 * and the owner's graph layouts.
 */
export function cloneTargetKey(rel: string, oldId: string, newId: string): string | null {
  if (rel.includes("..") || rel.startsWith("/")) return null;
  if (rel.startsWith("workspace/")) {
    return rel
      .split("/")
      .map((seg) => (seg.startsWith(`${oldId}_`) ? `${newId}_${seg.slice(oldId.length + 1)}` : seg))
      .join("/");
  }
  if (/^graph\/(hcd|frg)\.json$/.test(rel)) return rel;
  if (/^article\/[^/]+\.(md|json)$/.test(rel) || ARTICLE_FIGURE_KEY_RE.test(rel)) return rel;
  return null;
}

export function isCloneTextFile(rel: string): boolean {
  return TEXT_FILE_RE.test(rel);
}

/** Replaces whole-token occurrences of the old Project ID (`u7m2q9xa-1` never matches inside `u7m2q9xa-12`). */
export function rewriteProjectId(text: string, oldId: string, newId: string): string {
  const esc = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<![A-Za-z0-9-])${esc}(?![A-Za-z0-9])`, "g"), newId);
}

/** Artifacts a signed-in user may read from a public project (text only; no thread, no outputs, no layouts). */
export function isPublicReadableKey(rel: string, projectId: string): boolean {
  if (rel.includes("..") || rel.startsWith("/")) return false;
  if (/^workspace\/[^/]+\.md$/.test(rel)) return true;
  if (new RegExp(`^workspace/${projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(HCD|FRG)/[^/]+\\.json$`).test(rel)) return true;
  if (/^graph\/(hcd|frg)\.json$/.test(rel)) return true;
  return /^article\/[^/]+\.md$/.test(rel) || ARTICLE_FIGURE_KEY_RE.test(rel);
}

export function cloneName(name: string): string {
  const suffix = " (clone)";
  const chars = [...name];
  return (chars.length + suffix.length > 200 ? chars.slice(0, 200 - suffix.length).join("") : name) + suffix;
}
