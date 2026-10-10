import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UiLocale } from "@cobrac/shared";
import { en, type MessageKey as BaseMessageKey } from "./en";
import { AUTONOMOUS_CATALOG, type AutonomousKey } from "./autonomous";
import { CANON_VIEW_CATALOG, type CanonViewKey } from "./canonView";
import { HYPOTHESIS_CATALOG, type HypothesisKey } from "./hypothesis";
import { PLAN_DRAFT_CATALOG, type PlanDraftKey } from "./planDraft";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { ko } from "./ko";
import { pt } from "./pt";
import { ru } from "./ru";
import { zh } from "./zh";
import { zhTw } from "./zhTw";

/** Keys of the main catalogs and of the catalogs kept apart (hypothesis.ts, autonomous.ts, planDraft.ts, canonView.ts) */
export type MessageKey = BaseMessageKey | HypothesisKey | AutonomousKey | PlanDraftKey | CanonViewKey;

export type Locale = UiLocale;

export const LOCALES: { id: Locale; nameKey: MessageKey; htmlLang: string; dateTag: string }[] = [
  { id: "en", nameKey: "langEn", htmlLang: "en", dateTag: "en-US" },
  { id: "ja", nameKey: "langJa", htmlLang: "ja", dateTag: "ja-JP" },
  { id: "zh", nameKey: "langZh", htmlLang: "zh-CN", dateTag: "zh-CN" },
  { id: "zhTw", nameKey: "langZhTw", htmlLang: "zh-TW", dateTag: "zh-TW" },
  { id: "ko", nameKey: "langKo", htmlLang: "ko", dateTag: "ko-KR" },
  { id: "de", nameKey: "langDe", htmlLang: "de", dateTag: "de-DE" },
  { id: "fr", nameKey: "langFr", htmlLang: "fr", dateTag: "fr-FR" },
  { id: "es", nameKey: "langEs", htmlLang: "es", dateTag: "es" },
  { id: "pt", nameKey: "langPt", htmlLang: "pt-BR", dateTag: "pt-BR" },
  { id: "ru", nameKey: "langRu", htmlLang: "ru", dateTag: "ru-RU" },
];

export const DEFAULT_LOCALE: Locale = "en";
const STORAGE = "cobrac-locale";

const BASE: Record<Locale, Record<BaseMessageKey, string>> = { en, ja, zh, zhTw, ko, de, fr, es, pt, ru };
const CATALOG = Object.fromEntries(Object.entries(BASE).map(([l, c]) => [l, { ...c, ...HYPOTHESIS_CATALOG[l as Locale], ...AUTONOMOUS_CATALOG[l as Locale], ...PLAN_DRAFT_CATALOG[l as Locale], ...CANON_VIEW_CATALOG[l as Locale] }])) as Record<Locale, Record<MessageKey, string>>;

/** Name of a UI language in the current UI language (`ja` → "日本語" / "Japanese"); unknown ids come back unchanged. */
export function localeName(id: string, t: TFn): string {
  const l = LOCALES.find((x) => x.id === id);
  return l ? t(l.nameKey) : id;
}

export function htmlLangFor(locale: string): string {
  return LOCALES.find((l) => l.id === locale)?.htmlLang ?? "en";
}

export function dateTagFor(locale: string): string {
  return LOCALES.find((l) => l.id === locale)?.dateTag ?? "en-US";
}

export type Vars = Record<string, string | number>;
export type TFn = (key: MessageKey, vars?: Vars) => string;

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
}

function readStored(): Locale {
  try {
    const v = localStorage.getItem(STORAGE);
    if (v && LOCALES.some((l) => l.id === v)) return v as Locale;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

const I18nCtx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: TFn } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStored);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback<TFn>((key, vars) => interpolate(CATALOG[locale][key] ?? CATALOG.en[key] ?? key, vars), [locale]);

  useEffect(() => {
    document.documentElement.lang = LOCALES.find((l) => l.id === locale)?.htmlLang ?? "en";
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): TFn {
  return useI18n().t;
}

export function LanguageSelect({ className = "", variant = "dark" }: { className?: string; variant?: "dark" | "light" }) {
  const { locale, setLocale, t } = useI18n();
  const sel =
    variant === "light"
      ? "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 coarse:py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
      : "rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 coarse:py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400";
  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t("language")}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className={sel} title={t("language")}>
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id}>
            {t(l.nameKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
