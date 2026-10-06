import { ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { planPath } from "../lib/plan";

/** Chip of the BRA Planner plan that pushed a pull request; a link for the Canon's owner (the plan is theirs). */
export function PlanChip({ planId, link }: { planId: string; link: boolean }) {
  const t = useT();
  const cls = "inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-normal text-blue-700";
  const body = (
    <>
      <ListChecks size={11} aria-hidden /> {t("pr.plan", { id: planId })}
    </>
  );
  return link ? (
    <Link to={planPath(planId)} className={`${cls} hover:underline coarse:min-h-11`} title={t("pr.planHelp")} data-testid="pr-plan">
      {body}
    </Link>
  ) : (
    <span className={cls} title={t("pr.planHelp")} data-testid="pr-plan">
      {body}
    </span>
  );
}
