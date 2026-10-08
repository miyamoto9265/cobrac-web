import type { PlanPulse, PlanRowState } from "@cobrac/shared";
import { useT, type MessageKey } from "../i18n";

/** Segments of a wave, in workflow order; pending rows are the empty track. Colours as the detail page's chips. */
const SEGMENTS: { states: PlanRowState[]; cls: string; flow?: boolean }[] = [
  { states: ["done"], cls: "bg-emerald-500" },
  { states: ["starting", "running"], cls: "bg-blue-500", flow: true },
  { states: ["question"], cls: "bg-amber-400" },
  { states: ["review"], cls: "bg-violet-400" },
  { states: ["decision"], cls: "bg-amber-600" },
  { states: ["attention"], cls: "bg-rose-500" },
  { states: ["skipped", "cancelled"], cls: "bg-slate-300" },
];

const total = (c: Partial<Record<PlanRowState, number>>) => Object.values(c).reduce((n, v) => n + (v ?? 0), 0);

/**
 * Progress of a plan, one block per wave (as wide as its rows) filled by the states of its rows. While the plan runs,
 * the rows being built flow and the current wave is outlined; widths animate as rows move on (no motion with
 * prefers-reduced-motion).
 */
export function PlanBar({ waves, activeWave, live, className = "" }: { waves: PlanPulse["waves"]; activeWave?: number | null; live: boolean; className?: string }) {
  const t = useT();
  const all = waves.reduce((n, w) => n + total(w.counts), 0);
  if (!all) return null;
  const label = (w: PlanPulse["waves"][number]) =>
    [
      t("plan.wave", { n: w.wave }),
      ...(Object.entries(w.counts) as [PlanRowState, number][]).filter(([, n]) => n > 0).map(([s, n]) => `${t(`plan.row.${s}` as MessageKey)} ${n}`),
    ].join(" · ");
  return (
    <div className={`flex h-2.5 gap-1 ${className}`} data-testid="plan-bar" role="img" aria-label={`${t("plan.progress")}: ${waves.map(label).join(" / ")}`}>
      {waves.map((w) => {
        const n = total(w.counts);
        const current = live && activeWave === w.wave;
        return (
          <div
            key={w.wave}
            title={label(w)}
            data-wave={w.wave}
            data-current={current || undefined}
            className={`plan-seg flex min-w-[6px] overflow-hidden rounded-full bg-slate-100 ${current ? "ring-2 ring-blue-300 ring-offset-1 ring-offset-white" : ""}`}
            style={{ flexGrow: n, flexBasis: 0 }}
          >
            {SEGMENTS.map((s) => {
              const k = s.states.reduce((m, st) => m + (w.counts[st] ?? 0), 0);
              return k > 0 ? <div key={s.states[0]} data-state={s.states[0]} className={`plan-seg h-full ${s.flow && live ? "plan-flow" : s.cls}`} style={{ width: `${(k / n) * 100}%` }} /> : null;
            })}
          </div>
        );
      })}
    </div>
  );
}

/** A small dot that beats while a plan runs: blue running, amber paused or waiting, still otherwise. */
export function LiveDot({ tone, className = "" }: { tone: "running" | "waiting" | "idle"; className?: string }) {
  const color = tone === "running" ? "bg-blue-500" : tone === "waiting" ? "bg-amber-500" : "bg-slate-300";
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden data-tone={tone}>
      {tone === "running" && <span className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-60 motion-safe:animate-ping`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color} ${tone === "waiting" ? "plan-beat" : ""}`} />
    </span>
  );
}
