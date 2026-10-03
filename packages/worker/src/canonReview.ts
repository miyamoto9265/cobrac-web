/**
 * AI review of a Canon pull request, free of AWS / Codex so it can be tested with a mock model: one turn on the
 * packet the API wrote, and one more when the reply is not the schema's object. Only what refers to the packet is
 * kept (`parseCanonAiReview`).
 */
import type { CanonAiPacket, CanonAiReview, TokenUsage, UiLocale } from "@cobrac/shared";
import { EMPTY_USAGE, addUsage, canonAiPrompt, parseCanonAiReview } from "@cobrac/shared";

export interface ReviewTurn {
  text: string;
  usage: TokenUsage;
}

export interface CanonReviewDriver {
  packet: CanonAiPacket;
  locale: UiLocale;
  /** One model turn; throws when the turn fails */
  turn: (prompt: string) => Promise<ReviewTurn>;
  maxAttempts?: number;
}

export type CanonReviewOutcome =
  | { result: "completed"; review: CanonAiReview; dropped: number; usage: TokenUsage }
  | { result: "failed"; error: string; usage: TokenUsage };

export const RETRY_PROMPT = "Your reply was not the JSON object of the output schema. Reply again with that object only, following the same rules.";

export async function runCanonReview(d: CanonReviewDriver): Promise<CanonReviewOutcome> {
  const attempts = d.maxAttempts ?? 2;
  let usage: TokenUsage = EMPTY_USAGE;
  let prompt = canonAiPrompt(d.packet, d.locale);
  for (let i = 0; i < attempts; i++) {
    let t: ReviewTurn;
    try {
      t = await d.turn(prompt);
    } catch (e) {
      return { result: "failed", error: e instanceof Error ? e.message : String(e), usage };
    }
    usage = addUsage(usage, t.usage);
    const parsed = parseCanonAiReview(t.text, d.packet);
    if (parsed) return { result: "completed", ...parsed, usage };
    prompt = RETRY_PROMPT;
  }
  return { result: "failed", error: "The model did not return the review in the expected format. Try again.", usage };
}
