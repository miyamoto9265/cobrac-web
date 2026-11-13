import { ChevronRight, FileText, Layers, ListChecks, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { planPath } from "../lib/plan";
import { canonPath } from "../pages/CanonsPage";

export type Kind = "canon" | "mission" | "project";

/**
 * The three things a user works with, each with one icon and one colour wherever it is named: a Canon (the circuit map),
 * a mission (the work that builds it) and a project (one ROI × TLF). `side` is the icon colour on the always-dark sidebar.
 */
export const KIND: Record<Kind, { Icon: LucideIcon; text: string; chip: string; side: string }> = {
  canon: { Icon: Layers, text: "text-violet-700", chip: "bg-violet-50 text-violet-700", side: "text-violet-300" },
  mission: { Icon: ListChecks, text: "text-blue-700", chip: "bg-blue-50 text-blue-700", side: "text-blue-300" },
  project: { Icon: FileText, text: "text-teal-700", chip: "bg-teal-50 text-teal-700", side: "text-teal-300" },
};

export interface TrailStep {
  kind: Kind;
  /** The name of the Canon or mission above the page; absent until it is known (the kind alone is shown) */
  name?: string | null;
  /** Where the step leads; the page's own step (the last one) has none */
  to?: string;
  testId?: string;
}

/**
 * Where the page sits: the Canon and the mission above it as links, then the kind of the page itself.
 * 「Canon 小脳 VOR 回路 › ミッション 前庭動眼反射の回路を広げる › プロジェクト」
 */
export function Trail({ steps, className = "" }: { steps: TrailStep[]; className?: string }) {
  const t = useT();
  const kindName = (k: Kind) => (k === "canon" ? "Canon" : k === "mission" ? t("plan.shortName") : t("nav.newProjectShort"));
  return (
    <nav aria-label={t("cm.where")} className={`flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs ${className}`} data-testid="trail">
      {steps.map((s, i) => {
        const { Icon, chip, text } = KIND[s.kind];
        const body = (
          <>
            <Icon size={12} className="shrink-0" aria-hidden />
            <span className="shrink-0">{kindName(s.kind)}</span>
            {s.name && <span className="min-w-0 truncate font-medium">{s.name}</span>}
          </>
        );
        const box = "inline-flex min-w-0 max-w-[16rem] items-center gap-1 rounded px-1.5 py-0.5 coarse:py-1.5";
        return (
          <span key={i} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="shrink-0 text-slate-400" aria-hidden />}
            {s.to ? (
              <Link to={s.to} className={`${box} ${chip} hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`} data-testid={s.testId} title={s.name ?? undefined}>
                {body}
              </Link>
            ) : (
              <span className={`${box} ${text}`} aria-current={i === steps.length - 1 ? "page" : undefined} data-testid={s.testId}>
                {body}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** The steps above a page that belongs to a Canon and / or a mission, then the page's own kind. A Canon still to be created has a name but no id (no link). */
export function trailSteps(kind: "mission" | "project", above: { canon?: { canonId?: string | null; name?: string | null } | null; plan?: { planId: string; name?: string | null } | null }): TrailStep[] {
  const steps: TrailStep[] = [];
  if (above.canon) steps.push({ kind: "canon", name: above.canon.name, to: above.canon.canonId ? canonPath(above.canon.canonId) : undefined, testId: "trail-canon" });
  if (above.plan) steps.push({ kind: "mission", name: above.plan.name, to: planPath(above.plan.planId), testId: "trail-plan" });
  steps.push({ kind });
  return steps;
}

/** The names of a project's Canon and mission, read from the lists (a project only carries their ids). */
export function useAboveNames(canonId?: string | null, planId?: string | null) {
  const [names, setNames] = useState<{ canon?: string; plan?: string }>({});
  useEffect(() => {
    let live = true;
    setNames({});
    if (canonId)
      api
        .listCanons()
        .then((r) => {
          const c = [...r.items, ...(r.shared ?? [])].find((x) => x.canonId === canonId);
          if (live && c) setNames((n) => ({ ...n, canon: c.name }));
        })
        .catch(() => undefined);
    if (planId)
      api
        .listPlans()
        .then((r) => {
          const p = r.items.find((x) => x.planId === planId);
          if (live && p) setNames((n) => ({ ...n, plan: p.name }));
        })
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [canonId, planId]);
  return names;
}
