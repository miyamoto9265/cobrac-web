// ---------------------------------------------------------------------------
// Problems reported on Canon entries and how they reach what reused them. A member project copies the Canon's
// circuits, connections and references as they are, so an error in one entry is in every project (and every Canon)
// that took it. A reviewer reports a problem on one entry with a reason; it spreads along the reuse lineage:
//   circuit → (a Collection's Sub-Circuits, all the way down) → the connections that end on them
//   reference → the connections that cite it
// and from those entries to the projects that use or pushed them. A Canon that took entries from this one sees its
// open problems on those entries (upstreamIssues) and decides whether to report them in its own Canon. Entries
// reached by an open problem are `flagged`; a member project that uses one is "affected" (canonFollowStatus) until it
// is aligned with the Canon again. Reporting and settling a problem each write a new revision without a pull request
// (only the state and the problem record change, never a value); the values are fixed by an approved pull request.
// ---------------------------------------------------------------------------

import { isCanonId } from "./canon.js";
import type { CanonConnection, CanonSnapshot } from "./canonMerge.js";
import { currentCanonSnapshot } from "./canonMerge.js";

/** What kind of error the reporter found (the reason text says the rest). */
export const CANON_ISSUE_KINDS = ["anchor", "property", "connection", "reference", "quote", "other"] as const;
export type CanonIssueKind = (typeof CANON_ISSUE_KINDS)[number];

export const CANON_ISSUE_TARGETS = ["circuit", "connection", "reference"] as const;
export type CanonIssueTargetKind = (typeof CANON_ISSUE_TARGETS)[number];

/**
 * How a problem was settled: `fixed` (a pull request or an edit corrected it; projects that use it are told to
 * follow), `dismissed` (it was not an error; nothing to follow), `invalidated` (the entry is withdrawn from the Canon,
 * e.g. a retracted paper; projects that use it are told to drop it).
 */
export const CANON_ISSUE_RESOLUTIONS = ["fixed", "dismissed", "invalidated"] as const;
export type CanonIssueResolution = (typeof CANON_ISSUE_RESOLUTIONS)[number];

export const CANON_ISSUE_REASON_MAX = 2000;

export interface CanonIssue {
  /** `I1`, `I2`, … in the order they were reported in this Canon (never reused) */
  id: string;
  targetKind: CanonIssueTargetKind;
  /** Circuit key (normalized UC Descriptor), connection key or Reference ID */
  targetKey: string;
  /** Circuit ID, `sender → receiver [ref]` or Reference ID when reported */
  label: string;
  kind: CanonIssueKind;
  reason: string;
  raisedRevision: number;
  raisedAt: string;
  raisedBy: string;
  raisedByName: string;
  resolution?: CanonIssueResolution;
  resolvedRevision?: number;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  /** Optional note of the settlement; the pull request that fixed it, when it was settled by an approval */
  resolvedNote?: string;
  resolvedPr?: number;
}

/** Who reports or settles a problem. */
export interface CanonIssueActor {
  userId: string;
  name: string;
}

/** What a problem reaches in a revision: entries of the Canon, projects, and the Canons the entries came from. */
export interface CanonIssueScope {
  circuits: string[];
  connections: string[];
  references: string[];
  /** Projects that use a reached circuit (role layer) or pushed a reached entry */
  projects: string[];
  /** Canons a reached entry came from (`via`, or a Canon → Canon pull request that pushed it): the problem may be theirs too */
  upstreamCanons: string[];
}

export const isOpenIssue = (i: CanonIssue) => !i.resolution;

const connectionLabel = (c: Pick<CanonConnection, "senderCircuitId" | "receiverCircuitId" | "referenceId">) =>
  `${c.senderCircuitId} → ${c.receiverCircuitId}${c.referenceId ? ` ${c.referenceId.startsWith("[") ? c.referenceId : `[${c.referenceId}]`}` : ""}`;

/** The label of an entry as problems show it, or null when the revision has no such entry. */
export function canonEntryLabel(snapshot: CanonSnapshot, kind: CanonIssueTargetKind, key: string): string | null {
  if (kind === "circuit") return snapshot.circuits.find((c) => c.key === key)?.circuitId ?? null;
  if (kind === "reference") return snapshot.references.find((r) => r.key === key)?.key ?? null;
  const c = snapshot.connections.find((x) => x.key === key);
  return c ? connectionLabel(c) : null;
}

/**
 * What a problem on `target` reaches in `snapshot` (keys in the snapshot's own form; pass a current snapshot).
 * A circuit reaches the Sub-Circuits of a Collection all the way down and every connection that ends on one of them;
 * a reference reaches the connections that cite it; a connection reaches itself.
 */
export function canonIssueScope(snapshot: CanonSnapshot, target: { targetKind: CanonIssueTargetKind; targetKey: string }): CanonIssueScope {
  const byKey = new Map(snapshot.circuits.map((c) => [c.key, c]));
  const circuits = new Set<string>();
  const connections = new Set<string>();
  const references = new Set<string>();
  if (target.targetKind === "circuit") {
    const queue = [target.targetKey];
    while (queue.length) {
      const k = queue.shift()!;
      if (circuits.has(k)) continue;
      const c = byKey.get(k);
      if (!c) continue;
      circuits.add(k);
      if (c.status === "collection") queue.push(...c.subCircuits.filter((s) => !s.startsWith("group:")));
    }
    for (const x of snapshot.connections) if (circuits.has(x.sender) || circuits.has(x.receiver)) connections.add(x.key);
  } else if (target.targetKind === "reference") {
    if (snapshot.references.some((r) => r.key === target.targetKey)) references.add(target.targetKey);
    for (const x of snapshot.connections) if (x.referenceId === target.targetKey) connections.add(x.key);
  } else if (snapshot.connections.some((x) => x.key === target.targetKey)) connections.add(target.targetKey);

  const projects = new Set<string>();
  const upstreamCanons = new Set<string>();
  const reach = (e: { sources: string[]; origin: { via?: string } }) => {
    for (const s of e.sources) (isCanonId(s) ? upstreamCanons : projects).add(s);
    if (e.origin.via) upstreamCanons.add(e.origin.via.split("@")[0]);
  };
  for (const k of circuits) reach(byKey.get(k)!);
  for (const x of snapshot.connections) if (connections.has(x.key)) reach(x);
  for (const r of snapshot.references) if (references.has(r.key)) reach(r);
  for (const role of snapshot.roles) if (role.ucRoles.some((u) => circuits.has(u.key))) projects.add(role.projectId);
  upstreamCanons.delete(snapshot.canonId);
  const sorted = (s: Set<string>) => [...s].sort();
  return { circuits: sorted(circuits), connections: sorted(connections), references: sorted(references), projects: sorted(projects), upstreamCanons: sorted(upstreamCanons) };
}

/**
 * The entries' `issueIds` and states from the open problems: an entry an open problem reaches is `flagged`; a
 * connection that ends on a Collection stays `flagged` as before; `invalidated` entries stay so; every other entry is
 * `valid`. Pure: returns a new snapshot (keys in their current form).
 */
export function applyCanonIssues(stored: CanonSnapshot): CanonSnapshot {
  const snapshot = currentCanonSnapshot(stored);
  const reached = new Map<string, string[]>();
  const add = (kind: string, key: string, id: string) => {
    const k = `${kind}:${key}`;
    reached.set(k, [...(reached.get(k) ?? []), id]);
  };
  for (const i of (snapshot.issues ?? []).filter(isOpenIssue)) {
    const s = canonIssueScope(snapshot, i);
    for (const k of s.circuits) add("circuit", k, i.id);
    for (const k of s.connections) add("connection", k, i.id);
    for (const k of s.references) add("reference", k, i.id);
  }
  const collections = new Set(snapshot.circuits.filter((c) => c.status === "collection").map((c) => c.key));
  const mark = <T extends { key: string; state: CanonSnapshot["circuits"][number]["state"]; issueIds?: string[] }>(kind: string, e: T, otherFlag = false): T => {
    const ids = reached.get(`${kind}:${e.key}`);
    const { issueIds: _old, ...rest } = e;
    const state = e.state === "invalidated" ? "invalidated" : ids || otherFlag ? "flagged" : "valid";
    return { ...(rest as T), state, ...(ids ? { issueIds: ids } : {}) };
  };
  return {
    ...snapshot,
    circuits: snapshot.circuits.map((c) => mark("circuit", c)),
    connections: snapshot.connections.map((c) => mark("connection", c, collections.has(c.sender) || collections.has(c.receiver))),
    references: snapshot.references.map((r) => mark("reference", r)),
  };
}

export type CanonIssueInput = { targetKind: CanonIssueTargetKind; targetKey: string; kind: CanonIssueKind; reason: string };

/** Checked fields of a report (400-style message on a bad value). */
export function readCanonIssueInput(body: unknown): CanonIssueInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!CANON_ISSUE_TARGETS.includes(b.targetKind as CanonIssueTargetKind)) return { error: "targetKind は circuit / connection / reference のどれかです" };
  if (typeof b.targetKey !== "string" || !b.targetKey.trim()) return { error: "対象を選んでください" };
  if (!CANON_ISSUE_KINDS.includes(b.kind as CanonIssueKind)) return { error: "問題の種類を選んでください" };
  const reason = typeof b.reason === "string" ? b.reason.normalize("NFC").replace(/\r\n?/g, "\n").trim() : "";
  if (!reason) return { error: "理由を書いてください" };
  if ([...reason].length > CANON_ISSUE_REASON_MAX) return { error: `理由は ${CANON_ISSUE_REASON_MAX} 文字までです` };
  return { targetKind: b.targetKind as CanonIssueTargetKind, targetKey: b.targetKey, kind: b.kind as CanonIssueKind, reason };
}

/**
 * The next revision with a new problem on one entry (state and problem record only). Errors when the entry is not in
 * the revision or is already withdrawn.
 */
export function raiseCanonIssue(stored: CanonSnapshot, input: CanonIssueInput, actor: CanonIssueActor, now: string): { snapshot: CanonSnapshot; issue: CanonIssue } | { error: string } {
  const head = currentCanonSnapshot(stored);
  const label = canonEntryLabel(head, input.targetKind, input.targetKey);
  if (label === null) return { error: "その項目はこの Canon にありません" };
  const entry =
    input.targetKind === "circuit"
      ? head.circuits.find((c) => c.key === input.targetKey)
      : input.targetKind === "reference"
        ? head.references.find((r) => r.key === input.targetKey)
        : head.connections.find((c) => c.key === input.targetKey);
  if (entry?.state === "invalidated") return { error: "その項目は無効になっています" };
  const issues = head.issues ?? [];
  const n = issues.reduce((m, i) => Math.max(m, Number(i.id.slice(1)) || 0), 0) + 1;
  const revision = head.revision + 1;
  const issue: CanonIssue = {
    id: `I${n}`,
    targetKind: input.targetKind,
    targetKey: input.targetKey,
    label,
    kind: input.kind,
    reason: input.reason,
    raisedRevision: revision,
    raisedAt: now,
    raisedBy: actor.userId,
    raisedByName: actor.name,
  };
  return { snapshot: applyCanonIssues({ ...head, revision, createdAt: now, issues: [...issues, issue] }), issue };
}

/**
 * Settles open problems in `stored` without changing its revision number (the caller decides whether this is a revision
 * of its own or part of an approval). `invalidated` withdraws the target and, for a circuit or a reference, the
 * connections that end on it or cite it. Unknown or already settled IDs are ignored; `settled` lists the ones changed.
 */
export function settleCanonIssues(
  stored: CanonSnapshot,
  ids: string[],
  resolution: CanonIssueResolution,
  actor: CanonIssueActor,
  now: string,
  opts: { note?: string | null; pr?: number } = {},
): { snapshot: CanonSnapshot; settled: string[] } {
  const snapshot = currentCanonSnapshot(stored);
  const want = new Set(ids);
  const settled: string[] = [];
  const issues = (snapshot.issues ?? []).map((i) => {
    if (!want.has(i.id) || !isOpenIssue(i)) return i;
    settled.push(i.id);
    return {
      ...i,
      resolution,
      resolvedRevision: snapshot.revision,
      resolvedAt: now,
      resolvedBy: actor.userId,
      resolvedByName: actor.name,
      ...(opts.note ? { resolvedNote: opts.note } : {}),
      ...(opts.pr ? { resolvedPr: opts.pr } : {}),
    };
  });
  let next: CanonSnapshot = { ...snapshot, issues };
  if (resolution === "invalidated") {
    const gone = issues.filter((i) => settled.includes(i.id));
    const circuits = new Set(gone.filter((i) => i.targetKind === "circuit").map((i) => i.targetKey));
    const refs = new Set(gone.filter((i) => i.targetKind === "reference").map((i) => i.targetKey));
    const conns = new Set(gone.filter((i) => i.targetKind === "connection").map((i) => i.targetKey));
    next = {
      ...next,
      circuits: next.circuits.map((c) => (circuits.has(c.key) ? { ...c, state: "invalidated" as const } : c)),
      references: next.references.map((r) => (refs.has(r.key) ? { ...r, state: "invalidated" as const } : r)),
      connections: next.connections.map((c) =>
        conns.has(c.key) || circuits.has(c.sender) || circuits.has(c.receiver) || refs.has(c.referenceId) ? { ...c, state: "invalidated" as const } : c,
      ),
    };
  }
  return { snapshot: applyCanonIssues(next), settled };
}

/** Open problems whose entry a pull request's diff changes (offered as "fixed by this pull request" when approving). */
export function issuesTouchedByDiff(snapshot: CanonSnapshot, diff: { items: { kind: string; key: string; change: string }[]; conflicts: { kind: string; key: string }[] }): CanonIssue[] {
  const touched = new Set([
    ...diff.items.filter((i) => i.change === "changed").map((i) => `${i.kind}:${i.key}`),
    ...diff.conflicts.map((c) => `${c.kind}:${c.key}`),
  ]);
  return (currentCanonSnapshot(snapshot).issues ?? []).filter((i) => isOpenIssue(i) && touched.has(`${i.targetKind}:${i.targetKey}`));
}

/**
 * Open problems of an upstream Canon that reach entries this Canon took from it: for each Canon named in this Canon's
 * `origin.via`, its open problems whose target is also an entry here.
 */
export function upstreamIssues(local: CanonSnapshot, upstream: CanonSnapshot): CanonIssue[] {
  const here = currentCanonSnapshot(local);
  const up = currentCanonSnapshot(upstream);
  const keys = new Set([
    ...here.circuits.filter((c) => c.origin.via?.startsWith(`${up.canonId}@`)).map((c) => `circuit:${c.key}`),
    ...here.connections.filter((c) => c.origin.via?.startsWith(`${up.canonId}@`)).map((c) => `connection:${c.key}`),
    ...here.references.filter((r) => r.origin.via?.startsWith(`${up.canonId}@`)).map((r) => `reference:${r.key}`),
  ]);
  return (up.issues ?? []).filter((i) => isOpenIssue(i) && keys.has(`${i.targetKind}:${i.targetKey}`));
}

/** Canon IDs this Canon took entries from (`origin.via`). */
export function upstreamCanonIds(snapshot: CanonSnapshot): string[] {
  const ids = new Set<string>();
  for (const e of [...snapshot.circuits, ...snapshot.connections, ...snapshot.references]) if (e.origin.via) ids.add(e.origin.via.split("@")[0]);
  ids.delete(snapshot.canonId);
  return [...ids].sort();
}

/** POST /canons/:id/align (「まとめて Canon に合わせる」). */
export interface AlignResult {
  /** Follow-ups queued (each project re-pinned to the head first) */
  queued: { projectId: string; jobId: string }[];
  /** Affected projects that got no follow-up, and why */
  skipped: { projectId: string; reason: "running" | "not-completed" }[];
}
