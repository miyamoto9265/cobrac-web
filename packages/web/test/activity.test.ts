import { describe, expect, it } from "vitest";
import type { MessageRecord } from "@cobrac/shared";
import { buildTimeline, fmtDuration, groupDurationSec, liveGroupId, stepPreview, todoProgress, type ActivityGroup } from "../src/lib/activity";

let seq = 0;
function msg(role: MessageRecord["role"], type: MessageRecord["type"], content: string, at: string, meta?: Record<string, unknown>): MessageRecord {
  seq++;
  const createdAt = `2026-09-29T00:${at}.000Z`;
  return { projectId: "p", sk: `${createdAt}#${seq}`, messageId: `m${seq}`, jobId: "j", role, type, content, step: null, meta, createdAt };
}

describe("buildTimeline", () => {
  it("folds consecutive thoughts and tool calls into one group between visible messages", () => {
    const items = buildTimeline([
      msg("user", "prompt", "ROI", "00:00"),
      msg("system", "status", "queued", "00:01"),
      msg("agent", "reasoning", "**Plan**", "00:02"),
      msg("agent", "command", "$ ls", "00:05"),
      msg("agent", "file_change", "add: uc.json", "00:09"),
      msg("agent", "agent_message", "done", "00:10"),
      msg("agent", "todo", "[x] a", "00:11"),
    ]);
    expect(items.map((i) => (i.kind === "message" ? i.message.type : `group:${i.steps.length}`))).toEqual([
      "prompt",
      "status",
      "group:3",
      "agent_message",
      "group:1",
    ]);
    const g = items[2] as ActivityGroup;
    expect(g.id).toBe(g.steps[0].messageId);
    expect(g.startedAt).toBe("2026-09-29T00:00:02.000Z");
    expect(g.endedAt).toBe("2026-09-29T00:00:09.000Z");
  });

  it("keeps errors, questions and system notices outside the groups", () => {
    const items = buildTimeline([
      msg("agent", "reasoning", "a", "00:00"),
      msg("agent", "error", "Turn failed", "00:01"),
      msg("agent", "command", "$ x", "00:02"),
      msg("system", "status", "Checks found 2 issue(s)", "00:03"),
      msg("agent", "question", "[QUESTION]?[/QUESTION]", "00:04"),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["activity", "message", "activity", "message", "message"]);
  });

  it("drops a command's start notice once its completion arrived, but keeps a running one", () => {
    const items = buildTimeline([
      msg("agent", "command", "$ npm test", "00:00", { status: "started", itemId: "c1" }),
      msg("agent", "command", "$ npm test\nok", "00:04", { status: "completed", exitCode: 0, itemId: "c1" }),
      msg("agent", "command", "$ python csv_to_excel.py", "00:05", { status: "started", itemId: "c2" }),
    ]);
    expect(items).toHaveLength(1);
    const g = items[0] as ActivityGroup;
    expect(g.steps.map((s) => s.content)).toEqual(["$ npm test\nok", "$ python csv_to_excel.py"]);
    expect(g.id).toBe(g.steps[0].messageId);
  });

  it("returns nothing for an empty list", () => {
    expect(buildTimeline([])).toEqual([]);
  });
});

describe("liveGroupId", () => {
  const steps = [msg("agent", "reasoning", "a", "00:00"), msg("agent", "command", "$ b", "00:01")];

  it("is the trailing group while the agent is working", () => {
    const items = buildTimeline(steps);
    expect(liveGroupId(items, true)).toBe(steps[0].messageId);
  });

  it("is null once the run stopped or a visible message followed", () => {
    expect(liveGroupId(buildTimeline(steps), false)).toBeNull();
    expect(liveGroupId(buildTimeline([...steps, msg("agent", "agent_message", "done", "00:02")]), true)).toBeNull();
  });
});

describe("group summary", () => {
  const g = buildTimeline([
    msg("agent", "todo", "[x] HCD\n[ ] FRG\n[ ] CSV", "00:00"),
    msg("agent", "reasoning", "x", "01:05"),
    msg("agent", "todo", "[x] HCD\n[x] FRG\n[ ] CSV", "01:10"),
  ])[0] as ActivityGroup;

  it("measures from the first to the last step, or to now while live", () => {
    expect(groupDurationSec(g)).toBe(70);
    expect(groupDurationSec(g, Date.parse("2026-09-29T00:02:00.000Z"))).toBe(120);
  });

  it("reports the latest todo list progress", () => {
    expect(todoProgress(g)).toEqual({ done: 2, total: 3 });
    expect(todoProgress(buildTimeline([msg("agent", "reasoning", "x", "00:00")])[0] as ActivityGroup)).toBeNull();
  });

  it("formats durations compactly", () => {
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(59)).toBe("59s");
    expect(fmtDuration(65)).toBe("1m 05s");
    expect(fmtDuration(3725)).toBe("1h 02m");
  });

  it("previews the first non-empty line without markdown emphasis", () => {
    expect(stepPreview(msg("agent", "reasoning", "\n**Checking UC anchors**\n\nmore", "00:00"))).toBe("Checking UC anchors");
    expect(stepPreview(msg("agent", "command", "$ " + "a".repeat(200), "00:00"), 10)).toBe("$ aaaaaaa…");
  });

  it("previews a todo list by its next open item, or the last one when all are done", () => {
    expect(stepPreview(msg("agent", "todo", "[x] HCD\n[ ] FRG\n[ ] CSV", "00:00"))).toBe("[ ] FRG");
    expect(stepPreview(msg("agent", "todo", "[x] HCD\n[x] FRG", "00:00"))).toBe("[x] FRG");
  });
});

describe("harness prompts in stored conversations", () => {
  it("shows only the user's input as a user message; the worker's prompt becomes a notice", () => {
    const items = buildTimeline([
      msg("user", "prompt", "ROI: 小脳\nTLF: VOR", "00:00", { kind: "create", roi: "小脳", tlf: "VOR" }),
      msg("system", "status", "Job queued. Waiting for a worker to start…", "00:01", { i18n: "sys.queued" }),
      msg("user", "prompt", "Project ID: u2ttdyxs-2\nROI: 小脳\nTLF: VOR\nContributor: miyamoto9265\n\nRun phase HCD.", "00:05", { mode: "initial" }),
      msg("agent", "reasoning", "x", "00:06"),
    ]);
    const shown = items.flatMap((i) => (i.kind === "message" ? [i.message] : []));
    expect(shown.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["ROI: 小脳\nTLF: VOR"]);
    expect(shown[2]).toMatchObject({ role: "system", type: "status", meta: { i18n: "sys.promptPhase", step: "HCD" } });
  });
});
