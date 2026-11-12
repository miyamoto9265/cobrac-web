import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UiLocale } from "@cobrac/shared";
import { en, type MessageKey as BaseMessageKey } from "./en";
import { AUTONOMOUS_CATALOG, type AutonomousKey } from "./autonomous";
import { CANON_VIEW_CATALOG, type CanonViewKey } from "./canonView";
import { CANON_ISSUES_CATALOG, type CanonIssuesKey } from "./canonIssues";
import { API_KEYS_CATALOG, type ApiKeysKey } from "./apiKeys";
import { CLAUDE_CATALOG, type ClaudeKey } from "./claude";
import { HYPOTHESIS_CATALOG, type HypothesisKey } from "./hypothesis";
import { PLAN_DRAFT_CATALOG, type PlanDraftKey } from "./planDraft";
import { PLAN_FLOW_CATALOG, type PlanFlowKey } from "./planFlow";
import { PLAN_POLICY_CATALOG, type PlanPolicyKey } from "./planPolicy";
import { PLAN_ASK_CATALOG, type PlanAskKey } from "./planAsk";
import { WORKER_GUARD_CATALOG, type WorkerGuardKey } from "./workerGuard";
import { MISSIONS_CATALOG, type MissionsKey } from "./missions";
import { MISSION_CREATE_CATALOG, type MissionCreateKey } from "./missionCreate";
import { TEAMS_CATALOG, type TeamsKey } from "./teams";
import { ja } from "./ja";

/** Keys of the main catalogs and of the catalogs kept apart (hypothesis.ts, autonomous.ts, planDraft.ts, canonView.ts, canonIssues.ts, planFlow.ts, planAsk.ts, claude.ts, apiKeys.ts, planPolicy.ts, workerGuard.ts, missions.ts, missionCreate.ts, teams.ts) */
export type MessageKey = BaseMessageKey | HypothesisKey | AutonomousKey | PlanDraftKey | CanonViewKey | CanonIssuesKey | PlanFlowKey | PlanAskKey | ClaudeKey | ApiKeysKey | PlanPolicyKey | WorkerGuardKey | MissionsKey | MissionCreateKey | TeamsKey;

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

type Catalog = Record<MessageKey, string>;
type BaseCatalog = Record<BaseMessageKey, string>;

/**
 * English and Japanese are in the main bundle; the other languages' main catalogs load when chosen (each is about
 * 100 kB of text that most users never need). The smaller catalogs kept apart hold every language and stay bundled.
 */
const LAZY_BASE: Record<Exclude<Locale, "en" | "ja">, () => Promise<BaseCatalog>> = {
  zh: () => import("./zh").then((m) => m.zh),
  zhTw: () => import("./zhTw").then((m) => m.zhTw),
  ko: () => import("./ko").then((m) => m.ko),
  de: () => import("./de").then((m) => m.de),
  fr: () => import("./fr").then((m) => m.fr),
  es: () => import("./es").then((m) => m.es),
  pt: () => import("./pt").then((m) => m.pt),
  ru: () => import("./ru").then((m) => m.ru),
};

function catalogOf(l: Locale, base: BaseCatalog): Catalog {
  return { ...base, ...HYPOTHESIS_CATALOG[l], ...AUTONOMOUS_CATALOG[l], ...PLAN_DRAFT_CATALOG[l], ...CANON_VIEW_CATALOG[l], ...CANON_ISSUES_CATALOG[l], ...PLAN_FLOW_CATALOG[l], ...PLAN_ASK_CATALOG[l], ...CLAUDE_CATALOG[l], ...API_KEYS_CATALOG[l], ...PLAN_POLICY_CATALOG[l], ...WORKER_GUARD_CATALOG[l], ...MISSIONS_CATALOG[l], ...MISSION_CREATE_CATALOG[l], ...TEAMS_CATALOG[l] };
}

/** Catalogs ready to use (English and Japanese from the start, the others once loaded). */
const CATALOG: Partial<Record<Locale, Catalog>> = { en: catalogOf("en", en), ja: catalogOf("ja", ja) };
const EN = CATALOG.en!;

/** Loads a language's catalog (resolves at once for one already loaded); false when it could not be loaded. */
export async function loadLocale(l: Locale): Promise<boolean> {
  if (CATALOG[l]) return true;
  try {
    CATALOG[l] = catalogOf(l, await LAZY_BASE[l as keyof typeof LAZY_BASE]());
    return true;
  } catch {
    return false;
  }
}

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
  const [stored] = useState<Locale>(readStored);
  // the language on screen; a chosen language that is still loading takes over once it is there
  const [locale, setLocaleState] = useState<Locale | null>(() => (CATALOG[stored] ? stored : null));
  const setLocale = useCallback((l: Locale) => {
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      /* ignore */
    }
    void loadLocale(l).then((ok) => setLocaleState(ok ? l : "en"));
  }, []);
  useEffect(() => {
    if (locale === null) void loadLocale(stored).then((ok) => setLocaleState(ok ? stored : "en"));
  }, [locale, stored]);
  const shown = locale ?? "en";
  const t = useCallback<TFn>((key, vars) => interpolate(CATALOG[shown]?.[key] ?? EN[key] ?? key, vars), [shown]);

  useEffect(() => {
    document.documentElement.lang = LOCALES.find((l) => l.id === shown)?.htmlLang ?? "en";
  }, [shown]);

  const value = useMemo(() => ({ locale: shown, setLocale, t }), [shown, setLocale, t]);
  // a stored language that is not loaded yet: wait for it (a moment) rather than flash English
  if (locale === null) return null;
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
