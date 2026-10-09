/**
 * AI review of a Canon pull request, free of AWS / Codex so it can be tested with a mock model: one turn on the
 * packet the API wrote, and one more when the reply is not the schema's object. Only what refers to the packet is
 * kept (`parseCanonAiReview`). A decision job of an autonomous plan (自律実行, `decide`) also returns the verdict
 * (`parseCanonAiDecision`), which the plan runner applies.
 */
import type { CanonAiDecision, CanonAiPacket, CanonAiReview, TokenUsage, UiLocale } from "@cobrac/shared";
import { CANON_AI_DECISION_SCHEMA, CANON_AI_REVIEW_SCHEMA, EMPTY_USAGE, addUsage, canonAiDecisionPrompt, canonAiPrompt, parseCanonAiDecision, parseCanonAiReview } from "@cobrac/shared";

export interface ReviewTurn {
  text: string;
  usage: TokenUsage;
}

export interface CanonReviewDriver {
  packet: CanonAiPacket;
  locale: UiLocale;
  /** decide: the reviewer's decision for an autonomous plan; absent: findings for a human */
  decide?: boolean;
  /** One model turn with the given output schema; throws when the turn fails */
  turn: (prompt: string, schema: object) => Promise<ReviewTurn>;
  maxAttempts?: number;
}

export type CanonReviewOutcome =
  | { result: "completed"; review: CanonAiReview; decision?: CanonAiDecision; dropped: number; usage: TokenUsage }
  | { result: "failed"; error: string; usage: TokenUsage };

export const RETRY_PROMPT = "Your reply was not the JSON object of the output schema. Reply again with that object only, following the same rules.";

export async function runCanonReview(d: CanonReviewDriver): Promise<CanonReviewOutcome> {
  const attempts = d.maxAttempts ?? 2;
  const schema = d.decide ? CANON_AI_DECISION_SCHEMA : CANON_AI_REVIEW_SCHEMA;
  let usage: TokenUsage = EMPTY_USAGE;
  let prompt = d.decide ? canonAiDecisionPrompt(d.packet, d.locale) : canonAiPrompt(d.packet, d.locale);
  for (let i = 0; i < attempts; i++) {
    let t: ReviewTurn;
    try {
      t = await d.turn(prompt, schema);
    } catch (e) {
      return { result: "failed", error: e instanceof Error ? e.message : String(e), usage };
    }
    usage = addUsage(usage, t.usage);
    const parsed = d.decide ? parseCanonAiDecision(t.text, d.packet) : parseCanonAiReview(t.text, d.packet);
    if (parsed) return { result: "completed", ...parsed, usage };
    prompt = RETRY_PROMPT;
  }
  return { result: "failed", error: "The model did not return the review in the expected format. Try again.", usage };
}
