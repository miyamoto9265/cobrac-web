/** Web UI languages; the agent replies to the user (turn `message` / `question`) in the one the request was sent from. */
export const UI_LOCALES = ["en", "ja", "zh", "zhTw", "ko", "de", "fr", "es", "pt", "ru"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

const LANGUAGE_NAMES: Record<UiLocale, string> = {
  en: "English",
  ja: "Japanese",
  zh: "Simplified Chinese",
  zhTw: "Traditional Chinese",
  ko: "Korean",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  ru: "Russian",
};

export function isUiLocale(v: unknown): v is UiLocale {
  return typeof v === "string" && (UI_LOCALES as readonly string[]).includes(v);
}

export function uiLanguageName(locale: UiLocale): string {
  return LANGUAGE_NAMES[locale];
}

/** Per-turn prompt line fixing the reply language; null keeps the AGENTS.md fallback (the language the user wrote in). */
export function replyLanguageInstruction(locale: UiLocale | null | undefined): string | null {
  if (!isUiLocale(locale)) return null;
  const lang = uiLanguageName(locale);
  return (
    `Reply language: the user's web interface is set to ${lang}. Write the turn's \`message\` and \`question\` in ${lang}, ` +
    `whatever language the ROI/TLF or instructions are in. Files keep the language rules of AGENTS.md (artifacts in English).`
  );
}
