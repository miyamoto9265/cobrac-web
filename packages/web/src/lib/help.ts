/** Languages the user manual (`docs/manual/<lang>.md`) is written in; other UI languages show the English one. */
export const MANUAL_LANGS = ["ja", "en"] as const;
export type ManualLang = (typeof MANUAL_LANGS)[number];

export function manualLang(locale: string): ManualLang {
  return (MANUAL_LANGS as readonly string[]).includes(locale) ? (locale as ManualLang) : "en";
}

/** Heading anchors of the manual sections the "?" guide links open (a test checks that they exist in every language). */
export const HELP_ANCHORS: Record<string, Record<ManualLang, string>> = {
  research: { ja: "調査モードとモデル", en: "research-mode-and-models" },
  canon: { ja: "canon", en: "canons" },
  create: { ja: "canon-を使う", en: "using-a-canon" },
  rules: { ja: "canon-に従って作る", en: "how-a-canon-guides-generation" },
  follow: { ja: "rev-に追従する", en: "keeping-up-with-revs" },
  push: { ja: "push-と審査", en: "push-and-review" },
  public: { ja: "公開と複製", en: "publishing-and-cloning" },
} satisfies Record<string, Record<ManualLang, string>>;

export type HelpSection = "research" | "canon" | "create" | "rules" | "follow" | "push" | "public";

/** `/manual#<anchor>`: the manual opens in the UI language, or in English when it is not written in that language yet. */
export function helpDocPath(locale: string, section: HelpSection): string {
  return `/manual#${encodeURIComponent(HELP_ANCHORS[section][manualLang(locale)])}`;
}
