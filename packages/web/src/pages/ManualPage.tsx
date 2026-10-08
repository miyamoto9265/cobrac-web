import { Info } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { DocFigures } from "../components/DocMarkdown";
import { DocReader } from "../components/DocReader";
import { localeName, useI18n, useT } from "../i18n";
import { MANUAL_LANGS, manualLang, type ManualLang } from "../lib/help";

// The manual and its SVG figures are bundled at build time (docs/manual/, figures from scripts/docs-figures-manual.mjs).
const TEXTS = Object.fromEntries(
  Object.entries(import.meta.glob("../../../../docs/manual/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>).map(([path, text]) => [
    path.split("/").pop()!.replace(/\.md$/, ""),
    text,
  ]),
) as Partial<Record<ManualLang, string>>;

const URLS = Object.fromEntries(
  Object.entries(import.meta.glob("../../../../docs/manual/figures/*.svg", { query: "?url", import: "default", eager: true }) as Record<string, string>).map(([path, url]) => [
    path.split("/").pop()!,
    url,
  ]),
);

const FIGURES: DocFigures = Object.fromEntries(
  Object.entries(URLS)
    .filter(([file]) => !file.endsWith(".narrow.svg"))
    .map(([file, url]) => [file, { url, narrow: URLS[file.replace(/\.svg$/, ".narrow.svg")] }]),
);

/** The user manual, for every signed-in user: in the UI language when it exists, else in English with a note. */
export function ManualPage() {
  const t = useT();
  const { locale } = useI18n();
  const [params] = useSearchParams();
  const asked = params.get("lang");
  const lang: ManualLang = asked && (MANUAL_LANGS as readonly string[]).includes(asked) ? (asked as ManualLang) : manualLang(locale);
  const text = TEXTS[lang] ?? TEXTS.en ?? "";
  const variants = useMemo(
    () => MANUAL_LANGS.filter((l) => TEXTS[l]).map((l) => ({ key: l, to: `/manual?lang=${l}`, label: localeName(l, t), current: l === lang })),
    [lang, t],
  );
  const fallback = !(MANUAL_LANGS as readonly string[]).includes(locale) && !asked;

  return (
    <DocReader
      docKey={`manual-${lang}`}
      text={text}
      lang={lang}
      figures={FIGURES}
      variants={variants}
      navTitle={t("manual.title")}
      notice={
        fallback && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" data-testid="manual-fallback">
            <Info size={16} className="mt-0.5 shrink-0" /> {t("manual.fallback", { lang: localeName(locale, t) })}
          </div>
        )
      }
    />
  );
}
