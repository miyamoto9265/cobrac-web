import { describe, expect, it } from "vitest";
import { UI_LOCALES, isUiLocale, replyLanguageInstruction, uiLanguageName } from "../src/index.js";

describe("UI locale → reply language", () => {
  it("names every UI locale", () => {
    for (const l of UI_LOCALES) expect(uiLanguageName(l)).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?$/);
    expect(uiLanguageName("ja")).toBe("Japanese");
    expect(uiLanguageName("zhTw")).toBe("Traditional Chinese");
  });

  it("accepts only known locale ids", () => {
    expect(isUiLocale("ja")).toBe(true);
    expect(isUiLocale("zh-TW")).toBe(false);
    expect(isUiLocale("JA")).toBe(false);
    expect(isUiLocale(null)).toBe(false);
    expect(isUiLocale(1)).toBe(false);
  });

  it("tells the agent to reply in the UI language, and nothing without one", () => {
    const ja = replyLanguageInstruction("ja")!;
    expect(ja).toContain("Write the turn's `message` and `question` in Japanese");
    expect(ja).toContain("artifacts in English");
    expect(replyLanguageInstruction(null)).toBeNull();
    expect(replyLanguageInstruction(undefined)).toBeNull();
  });
});
