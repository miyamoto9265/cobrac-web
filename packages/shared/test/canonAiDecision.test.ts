import { describe, expect, it } from "vitest";
import type { CanonAiPacket, CanonConflict } from "../src/index.js";
import { CANON_AI_DECISION_SCHEMA, CANON_AI_REVIEW_SCHEMA, canonAiDecisionPrompt, decisionAction, parseCanonAiDecision } from "../src/index.js";

const conflict = (id: string, code: string, severity: CanonConflict["severity"], extra: Partial<CanonConflict> = {}): CanonConflict =>
  ({ id, code, severity, kind: "circuit", key: id, field: null, canon: "a", incoming: "b", choosable: severity !== "error", ...extra }) as CanonConflict;

const packet = (conflicts: CanonConflict[]): CanonAiPacket => ({
  canon: { id: "c1", name: "Canon", policy: "", headRevision: 3 },
  pr: { no: 4, source: "project:p1", sourceName: "P", sourceRevision: 1, baseRevision: 3 },
  summary: { added: 1, changed: 0, unchanged: 0, dropped: 0, errors: 0, warnings: 0, infos: 0 },
  conflicts: conflicts.map(({ id, code, severity, kind, key, field, canon, incoming }) => ({ id, code, severity, kind, key, field, canon, incoming })),
  checks: [],
  items: [],
  unchanged: [],
  references: [],
  truncated: 0,
});

const reply = (o: Record<string, unknown>) => JSON.stringify({ summary: "s", flags: [], verify: [], comments: [], verdict: "approve", reason: "ok", choices: [], changes: [], ...o });

describe("AI decision on a Canon pull request (自律実行)", () => {
  it("extends the review schema with the verdict, and the prompt asks for a decision", () => {
    for (const k of CANON_AI_REVIEW_SCHEMA.required) expect(CANON_AI_DECISION_SCHEMA.required).toContain(k);
    expect(CANON_AI_DECISION_SCHEMA.required).toEqual(expect.arrayContaining(["verdict", "reason", "choices", "changes"]));
    const p = canonAiDecisionPrompt(packet([]), "ja");
    expect(p).toContain("`approve`");
    expect(p).toContain("Error conflicts can never be approved");
    expect(p).toContain("Japanese");
  });

  it("keeps choices on known warning / info conflicts only, and needs a valid verdict", () => {
    const pk = packet([conflict("C7:a", "C7", "warning"), conflict("C1:b", "C1", "error"), conflict("C13:c", "C13", "info")]);
    const r = parseCanonAiDecision(
      reply({
        choices: [
          { conflictId: "C7:a", choice: "incoming", reason: "the paper says so" },
          { conflictId: "C1:b", choice: "incoming", reason: "no" },
          { conflictId: "nope", choice: "canon", reason: "" },
          { conflictId: "C13:c", choice: "canon", reason: "" },
        ],
      }),
      pk,
    );
    expect(r?.decision.choices.map((c) => c.conflictId)).toEqual(["C7:a", "C13:c"]);
    expect(r?.dropped).toBe(2);
    expect(parseCanonAiDecision(reply({ verdict: "maybe" }), pk)).toBeNull();
    expect(parseCanonAiDecision("not json", pk)).toBeNull();
  });

  it("code has the last word: errors become a fix follow-up, unchosen warnings keep the Canon's value", () => {
    const warnings = [conflict("C7:a", "C7", "warning"), conflict("C2b:x", "C2b", "warning"), conflict("C9b:y", "C9b", "warning")];
    const approve = { verdict: "approve" as const, reason: "fine", choices: [{ conflictId: "C7:a", choice: "incoming" as const, reason: "r" }], changes: [] };
    expect(decisionAction(approve, { conflicts: warnings })).toEqual({ action: "approve", choices: { "C7:a": "incoming", "C2b:x": "canon", "C9b:y": "canon" } });
    const withError = decisionAction(approve, { conflicts: [...warnings, conflict("C3:z", "C3", "error")] });
    expect(withError.action).toBe("fix");
    expect(withError.action === "fix" && withError.note).toContain("C3 circuit C3:z");
    expect(decisionAction({ ...approve, verdict: "request_changes", changes: ["cite a tracer study"] }, { conflicts: [] })).toEqual({ action: "changes", note: "- cite a tracer study" });
    expect(decisionAction({ ...approve, verdict: "reject", reason: "out of scope" }, { conflicts: [] })).toEqual({ action: "reject", note: "out of scope" });
  });
});
