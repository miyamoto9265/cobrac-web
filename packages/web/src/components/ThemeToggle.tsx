import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useT, type MessageKey } from "../i18n";
import { useTheme, type ThemePreference } from "../lib/theme";

const OPTIONS: { id: ThemePreference; label: MessageKey; Icon: LucideIcon }[] = [
  { id: "system", label: "theme.system", Icon: Monitor },
  { id: "light", label: "theme.light", Icon: Sun },
  { id: "dark", label: "theme.dark", Icon: Moon },
];

/** System / light / dark, remembered per browser. `onDark` is for the always-dark sidebar. */
export function ThemeToggle({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  const t = useT();
  const { preference, setPreference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={t("theme.label")}
      data-testid="theme-toggle"
      className={`inline-flex shrink-0 rounded-md border p-0.5 ${onDark ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-white"} ${className}`}
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const on = preference === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(label)}
            title={`${t("theme.label")}: ${t(label)}`}
            data-testid={`theme-${id}`}
            onClick={() => setPreference(id)}
            className={`flex h-6 w-7 items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:h-10 coarse:w-11 ${
              on ? (onDark ? "bg-slate-600 text-white" : "bg-slate-200 text-slate-900") : onDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
