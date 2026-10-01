import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** Same key and logic as the inline script in index.html, which applies the theme before the first paint. */
export const THEME_STORAGE = "cobrac-theme";
const QUERY = "(prefers-color-scheme: dark)";
/** Browser chrome colour (mobile address bar) per theme. */
const CHROME = { light: "#0f172a", dark: "#070b13" } as const;

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

const systemDark = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return pref === "system" ? (prefersDark ? "dark" : "light") : pref;
}

export function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CHROME[theme]);
}

const ThemeCtx = createContext<{ preference: ThemePreference; resolved: ResolvedTheme; setPreference: (p: ThemePreference) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readThemePreference);
  const [prefersDark, setPrefersDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // another tab changed the setting
  useEffect(() => {
    const on = (e: StorageEvent) => e.key === THEME_STORAGE && setPref(readThemePreference());
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);
  useEffect(() => applyTheme(resolved), [resolved]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try {
      if (p === "system") localStorage.removeItem(THEME_STORAGE);
      else localStorage.setItem(THEME_STORAGE, p);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Outside a provider (unit tests of single components) the light theme is assumed. */
export function useTheme() {
  return useContext(ThemeCtx) ?? { preference: "system" as ThemePreference, resolved: "light" as ResolvedTheme, setPreference: () => undefined };
}

export const useDark = () => useTheme().resolved === "dark";
