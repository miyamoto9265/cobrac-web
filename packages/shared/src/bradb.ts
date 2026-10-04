// ---------------------------------------------------------------------------
// Registering CoBRAC versions in BRA-DB (the PostgreSQL + Apache AGE instance of the BraDb stack).
// The API reads a frozen version's package (revisions/{n}/bradb/) and invokes the registration Lambda inside the
// BRA-DB VPC with it; the Lambda writes BRA-DB's tables and appends a row to cobrac.registrations.
// Project IDs are opaque strings throughout: nothing here parses them.
// ---------------------------------------------------------------------------

import type { BradbPackageManifest } from "./braVersion.js";

/** Fixed name, so the CobracAgents stack can call it without a cross-stack reference. */
export const BRADB_IMPORT_FUNCTION_NAME = "cobrac-bradb-import";

export interface BradbRegisterRequest {
  action: "register";
  manifest: BradbPackageManifest;
  /** Package files by name (`{P}_project.csv` …), as text */
  files: Record<string, string>;
  /** Project attributes that the CSVs do not carry */
  project: { roi: string; tlf: string };
  /** Accept fewer Circuits / Connections than BRA-DB holds now */
  allowShrink: boolean;
  requestedBy: string;
}

export interface BradbStatusRequest {
  action: "status";
  projectId: string;
}

export type BradbRequest = BradbRegisterRequest | BradbStatusRequest;

export type BradbRegistrationStatus = "registered" | "unchanged" | "rejected" | "failed";

export interface BradbCounts {
  circuits: number;
  connections: number;
  nodes: number;
  literature: number;
}

export interface BradbNodeChanges {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface BradbRegistration {
  registrationId: number;
  versionId: string;
  version: number;
  parentVersionId: string | null;
  contentSha256: string;
  status: BradbRegistrationStatus;
  mode: "create" | "replace" | "none";
  reason: string | null;
  counts: BradbCounts | null;
  changes: BradbNodeChanges | null;
  /** Circuits defined by another BRA-DB project (shared vocabulary; not overwritten) */
  skippedCircuits: string[];
  warnings: string[];
  requestedBy: string | null;
  registeredAt: string;
}

/** `rejected` with `code`: `shrink` (needs allowShrink), `review_comments` (BRA-DB has review comments: use instructions), `invalid` (data errors) */
export interface BradbRegisterResponse {
  registration: BradbRegistration;
  code?: "shrink" | "review_comments" | "invalid" | "integrity";
  /** Present with code `shrink`: what BRA-DB holds now and what the version has */
  shrink?: { before: { circuits: number; connections: number }; after: { circuits: number; connections: number } };
}

export interface BradbStatusResponse {
  projectId: string;
  /** The version BRA-DB holds now (latest `registered`), null when the project is not in BRA-DB */
  current: { versionId: string; contentSha256: string; registeredAt: string; projectKey: number | null } | null;
  /** Newest first, at most 50 */
  registrations: BradbRegistration[];
}

/** GET /projects/{id}/bradb for the web app; `enabled` false when this deployment has no BRA-DB */
export type ProjectBradbResponse = { enabled: false } | ({ enabled: true } & BradbStatusResponse);

export interface RegisterBradbRequest {
  allowShrink?: boolean;
}
