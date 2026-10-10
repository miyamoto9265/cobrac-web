import { MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { PLAN_POLICY_ITEMS, type PlanPolicy, isEmptyPlanPolicy, planPolicyOf } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { HelpTip } from "../HelpTip";

/** Items longer than this are cut to one line until the owner opens the policy. */
const SHORT = 60;

/**
 * The plan's policy (方針): its non-empty items, one line each, as label and text. The Orchestrator writes it, so it is
 * only shown. `bare` leaves out the card and the heading (inside a proposal).
 */
export function PlanPolicyView({ policy, bare, className = "mb-5" }: { policy: PlanPolicy | string | null | undefined; bare?: boolean; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const p = planPolicyOf(policy ?? "");
  if (isEmptyPlanPolicy(p)) return null;
  const items = PLAN_POLICY_ITEMS.filter((k) => p[k]);
  const long = items.some((k) => p[k].length > SHORT || p[k].includes("\n"));
  const list = (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {items.map((k) => (
        <div key={k} className="contents" data-testid={`plan-policy-${k}`}>
          <dt className="whitespace-nowrap pt-px text-xs font-medium text-slate-500">{t(`pp.${k}` as MessageKey)}</dt>
          <dd className={`min-w-0 break-words text-sm text-slate-700 ${open || bare ? "whitespace-pre-line" : "truncate"}`}>
            {p[k]}
            {p.fromAnswers?.includes(k) && (
              <span role="img" title={t("pp.fromAnswers")} aria-label={t("pp.fromAnswers")} className="ml-1 inline-block align-[-1px] text-sky-600">
                <MessageCircleQuestion size={12} aria-hidden />
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  if (bare) return <div className="min-w-0 rounded bg-slate-100 p-2">{list}</div>;
  return (
    <section className={`${className} rounded-xl border border-slate-200 bg-white px-4 py-3`} data-testid="plan-policy">
      <div className="mb-1.5 flex items-center gap-1">
        <h2 className="text-sm font-semibold">{t("pp.title")}</h2>
        <HelpTip text={t("plan.policyHelp")} />
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="plan-policy-more" className="ml-auto text-xs text-blue-700 hover:underline">
            {open ? t("pp.less") : t("pp.more")}
          </button>
        )}
      </div>
      {list}
    </section>
  );
}
