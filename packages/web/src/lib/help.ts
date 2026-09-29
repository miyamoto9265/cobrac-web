/** The user guide for research mode and Canons: `docs/06_Research_mode_and_Canon.md` and its `_ja` twin. */
export const HELP_DOC = "06_Research_mode_and_Canon";

/** Heading anchors of each section in both languages (a test checks that they exist in the documents). */
export const HELP_ANCHORS = {
  research: { en: "research-mode", ja: "調査モード" },
  canon: { en: "canons", ja: "canon" },
  create: { en: "using-a-canon-for-a-new-project", ja: "新しいプロジェクトで-canon-を使う" },
  rules: { en: "how-a-canon-constrains-generation", ja: "canon-による生成時の制約" },
  follow: { en: "revisions-and-updates", ja: "rev-と更新" },
  push: { en: "push-and-pull-requests", ja: "push-と-pr" },
  public: { en: "public-library-and-cloning", ja: "公開ライブラリと複製" },
} as const;

export type HelpSection = keyof typeof HELP_ANCHORS;

/** `/docs/<slug>#<anchor>` in Japanese for the Japanese UI, otherwise in English. */
export function helpDocPath(locale: string, section: HelpSection): string {
  const lang = locale === "ja" ? "ja" : "en";
  const slug = lang === "ja" ? `${HELP_DOC}_ja` : HELP_DOC;
  return `/docs/${encodeURIComponent(slug)}#${encodeURIComponent(HELP_ANCHORS[section][lang])}`;
}
