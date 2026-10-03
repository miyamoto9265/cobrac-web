import { describe, expect, it } from "vitest";
import type { CanonAiPacket } from "@cobrac/shared";
import { RETRY_PROMPT, runCanonReview } from "../src/canonReview.js";

const packet: CanonAiPacket = {
  canon: { id: "u7m2q9xa-c1", name: "Language", policy: "areas", headRevision: 1 },
  pr: { no: 2, source: "project:u7m2q9xa-2", sourceName: "P2", sourceRevision: 1, baseRevision: 1 },
  summary: { added: 1, changed: 0, unchanged: 0, dropped: 0, errors: 0, warnings: 0, infos: 0 },
  conflicts: [],
  checks: [{ id: "reverse:connection:a|b|[X, 2000]", code: "reverse", severity: "warning", master: null, item: "connection:a|b|[X, 2000]", related: [] }],
  items: [{ id: "connection:a|b|[X, 2000]", change: "added", label: "A → B [X, 2000]", canon: null, incoming: { sender: "A" } }],
  unchanged: [],
  references: [{ id: "[X, 2000]", doi: "10.1/x", pmid: "", title: "", journal: "", check: "verified" }],
  truncated: 0,
};
const usage = { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0 };
const good = JSON.stringify({
  summary: "One connection is added.",
  flags: [{ severity: "medium", title: "Direction", reason: "The Canon has B → A for the same paper.", items: ["connection:a|b|[X, 2000]"], checks: ["reverse:connection:a|b|[X, 2000]"], references: ["[X, 2000]"] }],
  verify: [],
  comments: [],
});

describe("runCanonReview", () => {
  it("runs one turn on the packet and keeps the parsed review", async () => {
    const prompts: string[] = [];
    const r = await runCanonReview({ packet, locale: "ja", turn: async (p) => (prompts.push(p), { text: good, usage }) });
    expect(r).toMatchObject({ result: "completed", dropped: 0, usage });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Japanese");
    expect(prompts[0]).toContain('"reverse:connection:a|b|[X, 2000]"');
  });

  it("asks once more when the reply is not the object, and adds up the usage", async () => {
    const replies = ["Looks fine to approve.", good];
    const prompts: string[] = [];
    const r = await runCanonReview({ packet, locale: "en", turn: async (p) => (prompts.push(p), { text: replies.shift()!, usage }) });
    expect(r.result).toBe("completed");
    expect(prompts[1]).toBe(RETRY_PROMPT);
    expect(r.usage.inputTokens).toBe(200);
  });

  it("fails after the attempts or when a turn fails", async () => {
    expect(await runCanonReview({ packet, locale: "en", turn: async () => ({ text: "no", usage }) })).toMatchObject({ result: "failed" });
    expect(
      await runCanonReview({
        packet,
        locale: "en",
        turn: async () => {
          throw new Error("rate limit");
        },
      }),
    ).toMatchObject({ result: "failed", error: "rate limit" });
  });
});
