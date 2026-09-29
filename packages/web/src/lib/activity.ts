import type { MessageRecord, MessageType } from "@cobrac/shared";

/** Agent events that describe how the agent works (thoughts and tool calls), as opposed to what it tells the user. */
export const ACTIVITY_TYPES: ReadonlySet<MessageType> = new Set<MessageType>(["reasoning", "command", "file_change", "web_search", "todo"]);

export function isActivity(m: MessageRecord): boolean {
  return m.role === "agent" && ACTIVITY_TYPES.has(m.type);
}

export interface ActivityGroup {
  kind: "activity";
  /** Stable React key: the first step's messageId */
  id: string;
  steps: MessageRecord[];
  startedAt: string;
  endedAt: string;
}

export type TimelineItem = { kind: "message"; message: MessageRecord } | ActivityGroup;

function itemId(m: MessageRecord): string | null {
  const id = m.meta?.itemId;
  return typeof id === "string" && id ? id : null;
}

/** A command reported as started whose completion has already arrived is redundant. */
function isSupersededStart(m: MessageRecord, completed: Set<string>): boolean {
  if (m.type !== "command" || m.meta?.status !== "started") return false;
  const id = itemId(m);
  return id !== null && completed.has(id);
}

/**
 * Fold consecutive activity events into collapsible groups, leaving user prompts, agent answers,
 * questions, errors and system notices as standalone items. Input must be sorted by `sk`.
 */
export function buildTimeline(messages: MessageRecord[]): TimelineItem[] {
  const completed = new Set<string>();
  for (const m of messages) {
    const id = itemId(m);
    if (id && m.type === "command" && m.meta?.status !== "started") completed.add(id);
  }

  const out: TimelineItem[] = [];
  let group: ActivityGroup | null = null;
  for (const m of messages) {
    if (!isActivity(m)) {
      group = null;
      out.push({ kind: "message", message: m });
      continue;
    }
    if (isSupersededStart(m, completed)) continue;
    if (!group) {
      group = { kind: "activity", id: m.messageId, steps: [], startedAt: m.createdAt, endedAt: m.createdAt };
      out.push(group);
    }
    group.steps.push(m);
    group.endedAt = m.createdAt;
  }
  return out;
}

/** The group the agent is still adding to: the trailing group while the project is running. */
export function liveGroupId(items: TimelineItem[], running: boolean): string | null {
  if (!running) return null;
  const last = items[items.length - 1];
  return last?.kind === "activity" ? last.id : null;
}

/** Whole seconds between the first and last step (or `now` for a live group). */
export function groupDurationSec(g: ActivityGroup, now?: number): number {
  const start = Date.parse(g.startedAt);
  const end = now ?? Date.parse(g.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Completed / total items of the latest todo list in the group, if the agent keeps one. */
export function todoProgress(g: ActivityGroup): { done: number; total: number } | null {
  for (let i = g.steps.length - 1; i >= 0; i--) {
    const s = g.steps[i];
    if (s.type !== "todo") continue;
    const lines = s.content.split("\n").filter((l) => /^\[[ x]\]/.test(l));
    if (lines.length === 0) return null;
    return { done: lines.filter((l) => l.startsWith("[x]")).length, total: lines.length };
  }
  return null;
}

/** One-line preview of a step for the live status line and the collapsed step rows. */
export function stepPreview(m: MessageRecord, max = 120): string {
  const text = m.type === "reasoning" ? m.content.replace(/\*\*/g, "") : m.content;
  const lines = text.split("\n");
  const first = (m.type === "todo" ? lines.find((l) => l.startsWith("[ ]")) ?? lines[lines.length - 1] : lines.find((l) => l.trim())) ?? "";
  const line = first.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
