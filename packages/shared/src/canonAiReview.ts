// ---------------------------------------------------------------------------
// AI assistance for a Canon pull request. The API writes a packet (the same material the reviewer sees), the worker
// runs one model turn with CANON_AI_REVIEW_SCHEMA and keeps only what points at that material. The output has no
// verdict: the model summarises, flags inconsistencies with reasons and evidence, and drafts comments; the owner
// approves or rejects.
// ---------------------------------------------------------------------------

import type { CanonPrEvent, CanonPullRequestRecord } from "./canon.js";
import type { CanonConflict, CanonDiff, CanonSnapshot, CanonIncoming } from "./canonMerge.js";
import { currentCanonSnapshot } from "./canonMerge.js";
import type { ReviewCheck, ReviewEntry, ReviewGraph, ReviewProvenance, ReviewReport } from "./canonReview.js";
import type { JobStatus } from "./types.js";
import { reviewItemId } from "./canonReview.js";
import { uiLanguageName, type UiLocale } from "./locale.js";

export type CanonAiSeverity = "high" | "medium" | "low";

export interface CanonAiFlag {
  severity: CanonAiSeverity;
  title: string;
  reason: string;
  /** Diff items (`<kind>:<key>`) the flag is about */
  items: string[];
  /** IDs of the system checks it builds on */
  checks: string[];
  /** Reference IDs of the evidence */
  references: string[];
}

export interface CanonAiComment {
  /** Diff item the comment is for; "" for the PR as a whole */
  item: string;
  text: string;
}

export interface CanonAiReview {
  summary: string;
  flags: CanonAiFlag[];
  /** Points the reviewer should verify themselves (in the papers, against the policy) */
  verify: string[];
  comments: CanonAiComment[];
}

/** `result.json` of an AI review job. */
export interface CanonAiReviewResult {
  review: CanonAiReview;
  /** Parts the model wrote about items, checks or references that are not in the packet (removed) */
  dropped: number;
  model: string;
  locale: UiLocale;
  createdAt: string;
}

export const CANON_AI_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["high", "medium", "low"] },
          title: { type: "string" },
          reason: { type: "string" },
          items: { type: "array", items: { type: "string" } },
          checks: { type: "array", items: { type: "string" } },
          references: { type: "array", items: { type: "string" } },
        },
        required: ["severity", "title", "reason", "items", "checks", "references"],
        additionalProperties: false,
      },
    },
    verify: { type: "array", items: { type: "string" } },
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: { item: { type: "string" }, text: { type: "string" } },
        required: ["item", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "flags", "verify", "comments"],
  additionalProperties: false,
} as const;

export interface CanonAiPacketItem {
  id: string;
  change: string;
  label: string;
  canon: Record<string, string> | null;
  incoming: Record<string, string> | null;
}

/** What the model sees: the PR as the reviewer sees it (`input.json`). */
export interface CanonAiPacket {
  canon: { id: string; name: string; policy: string; headRevision: number };
  pr: { no: number; source: string; sourceName: string; sourceRevision: number; baseRevision: number };
  summary: CanonDiff["summary"];
  conflicts: Pick<CanonConflict, "id" | "code" | "severity" | "kind" | "key" | "field" | "canon" | "incoming">[];
  checks: Pick<ReviewCheck, "id" | "code" | "severity" | "master" | "item" | "related" | "canon" | "incoming" | "detail">[];
  /** Added, changed and dropped items with both sides; unchanged items only by ID (`unchanged`) */
  items: CanonAiPacketItem[];
  unchanged: string[];
  references: { id: string; doi: string; pmid: string; title: string; journal: string; check: string }[];
  /** Items left out to keep the packet within its size */
  truncated: number;
}

const PACKET_MAX_CHARS = 150_000;
const FIELD_MAX = 1500;
const clip = (s: string, n = FIELD_MAX) => (s.length > n ? `${s.slice(0, n)}…` : s);
const clipFields = (f: Record<string, string> | null) => (f ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, clip(v)])) : null);

export function buildCanonAiPacket(
  canon: CanonAiPacket["canon"],
  pr: CanonAiPacket["pr"],
  diff: CanonDiff,
  checks: ReviewCheck[],
  entries: Record<string, ReviewEntry>,
  stored: CanonSnapshot,
  incoming: CanonIncoming,
): CanonAiPacket {
  const base = currentCanonSnapshot(stored);
  const items: CanonAiPacketItem[] = [];
  const unchanged: string[] = [];
  for (const i of diff.items) {
    const id = reviewItemId(i.kind, i.key);
    if (i.change === "unchanged") unchanged.push(id);
    else items.push({ id, change: i.change, label: i.label, canon: clipFields(entries[id]?.canon ?? null), incoming: clipFields(entries[id]?.incoming ?? null) });
  }
  const refs = new Map<string, CanonAiPacket["references"][number]>();
  for (const r of [...base.references, ...incoming.references]) refs.set(r.key, { id: r.key, doi: r.doi, pmid: r.pmid, title: clip(r.title, 300), journal: r.journal, check: r.check });
  const packet: CanonAiPacket = {
    canon: { ...canon, policy: clip(canon.policy, 2000) },
    pr,
    summary: diff.summary,
    conflicts: diff.conflicts.map(({ id, code, severity, kind, key, field, canon: c, incoming: n }) => ({ id, code, severity, kind, key, field, canon: c && clip(c), incoming: n && clip(n) })),
    checks: checks.map(({ id, code, severity, master, item, related, canon: c, incoming: n, detail }) => ({ id, code, severity, master, item, related, canon: c && clip(c), incoming: n && clip(n), detail: detail && clip(detail) })),
    items,
    unchanged,
    references: [...refs.values()],
    truncated: 0,
  };
  // keep the packet bounded: drop unchanged IDs first, then the last items
  while (JSON.stringify(packet).length > PACKET_MAX_CHARS && (packet.unchanged.length || packet.items.length > 1)) {
    if (packet.unchanged.length) packet.unchanged = packet.unchanged.slice(0, Math.floor(packet.unchanged.length / 2));
    else {
      packet.items.pop();
      packet.truncated++;
    }
  }
  return packet;
}

export function canonAiPrompt(packet: CanonAiPacket, locale: UiLocale): string {
  const lang = uiLanguageName(locale);
  return [
    "You assist a human who reviews a pull request (PR) into a Canon of CoBRAC Agents. A Canon is a set of BRA (brain reference architecture) projects whose circuit definitions must agree: the same UC Descriptor has the same Uniform / Collection status and decomposition, connections end on Uniform circuits (BRA error 203), and the same Reference ID is the same paper.",
    "The PR brings circuits, connections and references from a project (or another Canon). The system has already computed the diff, the conflicts (rules C1–C13; errors block approval until the reviewer resolves them) and further deterministic checks. They are all in the JSON below.",
    "",
    "Your task:",
    "- `summary`: what the PR changes in the Canon and what matters for the review, in 3–6 sentences.",
    "- `flags`: inconsistencies a reviewer should look at, most important first: contradictions between the PR and the Canon or within the PR (definitions, granularity against the Canon's policy, directions and signs of connections, evidence that does not support the connection as written, provenance). Give the reason with the concrete values. `items` are item IDs from `items` / `unchanged` (`<kind>:<key>` exactly as written), `checks` are IDs from `checks`, `references` are Reference IDs from `references`. Do not repeat a system check without adding a reason or a consequence.",
    "- `verify`: points the reviewer should check themselves (in the cited papers, against the policy), because the material does not settle them.",
    "- `comments`: short draft comments the reviewer may send to the author, each for one item (`item` = its ID) or for the whole PR (`item` = \"\").",
    "",
    "Rules:",
    "- Do not decide. Never recommend approving or rejecting, and do not say the PR is acceptable or not; the human decides.",
    "- Use only this material. Do not invent items, papers, quotes or DOIs; if something is missing, say it is missing.",
    "- Do not run commands, open files or search the web.",
    `- Write \`summary\`, \`title\`, \`reason\`, \`verify\` and comment texts in ${lang}. Keep IDs, Circuit IDs, descriptors and Reference IDs as written.`,
    "- Reply with the JSON object of the output schema only.",
    "",
    "PR material (JSON):",
    "```json",
    JSON.stringify(packet),
    "```",
  ].join("\n");
}

const TEXT_MAX = 2000;
const LIST_MAX = 30;
const txt = (v: unknown, n = TEXT_MAX) => (typeof v === "string" ? clip(v.trim(), n) : "");

/**
 * Parses the model's reply and keeps only what refers to the packet: unknown item IDs, check IDs and Reference IDs
 * are removed (counted in `dropped`), as are comments for unknown items. null when the reply is not the object.
 */
export function parseCanonAiReview(text: string, packet: CanonAiPacket): { review: CanonAiReview; dropped: number } | null {
  let raw: unknown;
  try {
    const t = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    raw = JSON.parse(t);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.summary !== "string" || !Array.isArray(r.flags)) return null;
  const itemIds = new Set([...packet.items.map((i) => i.id), ...packet.unchanged]);
  const checkIds = new Set([...packet.checks.map((c) => c.id), ...packet.conflicts.map((c) => c.id)]);
  const refIds = new Set(packet.references.map((x) => x.id));
  let dropped = 0;
  const keep = (xs: unknown, known: Set<string>) => {
    const list = Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string") : [];
    const ok = [...new Set(list.filter((x) => known.has(x)))];
    dropped += new Set(list).size - ok.length;
    return ok.slice(0, LIST_MAX);
  };
  const flags: CanonAiFlag[] = [];
  for (const f of r.flags.slice(0, LIST_MAX)) {
    if (!f || typeof f !== "object") continue;
    const x = f as Record<string, unknown>;
    const severity = x.severity === "high" || x.severity === "medium" || x.severity === "low" ? x.severity : "medium";
    const title = txt(x.title, 300);
    if (!title) continue;
    flags.push({ severity, title, reason: txt(x.reason), items: keep(x.items, itemIds), checks: keep(x.checks, checkIds), references: keep(x.references, refIds) });
  }
  const comments: CanonAiComment[] = [];
  for (const c of Array.isArray(r.comments) ? r.comments.slice(0, LIST_MAX) : []) {
    if (!c || typeof c !== "object") continue;
    const x = c as Record<string, unknown>;
    const item = typeof x.item === "string" ? x.item.trim() : "";
    const text = txt(x.text);
    if (!text) continue;
    if (item && !itemIds.has(item)) {
      dropped++;
      continue;
    }
    comments.push({ item, text });
  }
  const verify = (Array.isArray(r.verify) ? r.verify : []).map((v) => txt(v, 600)).filter(Boolean).slice(0, LIST_MAX);
  return { review: { summary: txt(r.summary, 4000), flags, verify, comments }, dropped };
}

// --- API -------------------------------------------------------------------------

/** The latest AI review job of a PR (owner only). */
export interface CanonAiState {
  jobId: string;
  status: JobStatus;
  model: string | null;
  locale: UiLocale | null;
  requestedAt: string;
  endedAt: string | null;
  errorMessage: string | null;
  costUsd: number | null;
  result: CanonAiReviewResult | null;
}

/** POST /canons/:id/pulls/:no/ai-review */
export interface CanonAiReviewRequest {
  /** null / absent: the deployment default (the tier's default model with the default API key) */
  model?: string | null;
  locale: UiLocale;
}

/** GET /canons/:id/pulls/:no */
export interface CanonPullDetailResponse {
  pr: CanonPullRequestRecord;
  diff: CanonDiff | null;
  headRevision: number;
  targetName: string;
  /** Owner or co-editor of the target Canon */
  canReview: boolean;
  canWithdraw: boolean;
  canComment: boolean;
  /** null: the sender of a Canon → Canon pull request who has no role in the target */
  viewerRole: "owner" | "editor" | "admin" | null;
  checks: ReviewReport | null;
  entries: Record<string, ReviewEntry>;
  graph: ReviewGraph | null;
  provenance: ReviewProvenance | null;
  events: CanonPrEvent[];
  ai: CanonAiState | null;
}
