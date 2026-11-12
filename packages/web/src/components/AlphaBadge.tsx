import { useT } from "../i18n";
import { HelpTip } from "./HelpTip";

/** Small "Alpha" pill shown beside the app name. The pill itself opens the tooltip explaining that the site is still in development. */
export function AlphaBadge({ variant = "dark", className = "" }: { variant?: "dark" | "light"; className?: string }) {
  const t = useT();
  const pill =
    variant === "dark"
      ? "bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
      : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:hover:bg-amber-400/25";
  return (
    <span className={`inline-flex shrink-0 items-center align-middle ${className}`} data-testid="alpha-badge">
      <HelpTip text={t("app.alphaTip")} label={t("app.alpha")} triggerClassName={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 tracking-normal transition-colors ${pill}`}>
        {t("app.alpha")}
      </HelpTip>
    </span>
  );
}
