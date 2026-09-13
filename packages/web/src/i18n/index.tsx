import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type MessageKey } from "./en";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { ko } from "./ko";
import { pt } from "./pt";
import { ru } from "./ru";
import { zh } from "./zh";
import { zhTw } from "./zhTw";

export type { MessageKey } from "./en";

export type Locale = "en" | "ja" | "zh" | "zhTw" | "ko" | "de" | "fr" | "es" | "pt" | "ru";

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

const CATALOG: Record<Locale, Record<MessageKey, string>> = { en, ja, zh, zhTw, ko, de, fr, es, pt, ru };

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
      ? "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
      : "rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400";
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
