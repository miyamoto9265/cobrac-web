import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { TEAM_BUDGET_NOTICE_DAYS } from "@cobrac/shared";
import { useI18n } from "../i18n";
import { fmtDate } from "../lib/format";
import { useWorkspace } from "../lib/workspace";

/**
 * In a team's workspace: a notice from TEAM_BUDGET_NOTICE_DAYS days before the team's budget ends, and once it has ended
 * or was stopped (jobs then run on the member's own key), with a link to the team's page.
 */
export function TeamBudgetBanner() {
  const { t, locale } = useI18n();
  const { team } = useWorkspace();
  if (!team || team.budgetState === "none") return null;
  const end = team.budgetEndsAt;
  const soon = team.budgetState === "active" && !!end && Date.parse(end) - Date.now() <= TEAM_BUDGET_NOTICE_DAYS * 86_400_000;
  const text =
    team.budgetState === "ended"
      ? t("team.banner.ended", { name: team.name })
      : team.budgetState === "stopped"
        ? t("team.banner.stopped", { name: team.name })
        : soon
          ? t("team.banner.ending", { name: team.name, date: fmtDate(end!, locale) })
          : null;
  if (!text) return null;
  const strong = team.budgetState !== "active";
  return (
    <div
      role="status"
      data-testid="team-budget-banner"
      className={`flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs sm:px-4 ${strong ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
    >
      <AlertTriangle size={14} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      <Link to={`/teams/${encodeURIComponent(team.teamId)}`} className="shrink-0 font-medium underline-offset-2 hover:underline coarse:py-2">
        {t("team.manage")}
      </Link>
    </div>
  );
}
