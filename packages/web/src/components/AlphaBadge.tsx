import { useT } from "../i18n";
import { HelpTip } from "./HelpTip";

/** Small "Alpha" pill shown beside the app name, with a (?) tooltip explaining that the site is still in development. */
export function AlphaBadge({ variant = "dark", className = "" }: { variant?: "dark" | "light"; className?: string }) {
  const t = useT();
  const pill =
    variant === "dark"
      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 align-middle ${className}`} data-testid="alpha-badge">
      <span className={`rounded border px-1.5 py-px text-[10px] font-medium leading-4 tracking-normal ${pill}`}>{t("app.alpha")}</span>
      <HelpTip text={t("app.alphaTip")} label={t("app.alpha")} className={variant === "dark" ? "[&_button:hover]:text-slate-200" : ""} />
    </span>
  );
}
