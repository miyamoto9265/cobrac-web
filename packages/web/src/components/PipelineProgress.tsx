import { ArrowLeftRight, Check, CircleDot, CircleSlash, Loader2, Pause, Repeat2 } from "lucide-react";
import type { JobRecord, ProjectRecord } from "@cobrac/shared";
import type { ReactNode } from "react";
import { useT, type MessageKey } from "../i18n";
import { pipelineView, type RunState, type StageId, type StageStatus } from "../lib/pipeline";
import { HelpTip } from "./HelpTip";

const LABEL: Record<StageId, string> = { research: "stage.research", hcd: "HCD", frg: "FRG", cross: "stage.cross", csv: "CSV", xlsx: "xlsx" };

/**
 * Harness stages from the project's live status: research → HCD ⇄ FRG (consistency check, adjustment turn) → CSV →
 * xlsx. While the job runs, the active stage animates (none with prefers-reduced-motion); the "?" explains the stages.
 */
export function PipelineProgress({
  project,
  jobs,
  center = false,
  help = true,
  className = "",
}: {
  project: Pick<ProjectRecord, "status" | "stepStates" | "activeStage" | "researchMode">;
  jobs: Pick<JobRecord, "researchStep">[];
  center?: boolean;
  /** The "?" that explains the stages (off where many strips are listed) */
  help?: boolean;
  className?: string;
}) {
  const t = useT();
  const v = pipelineView(project, jobs);
  const label = (id: StageId) => (LABEL[id].startsWith("stage.") ? t(LABEL[id] as MessageKey) : LABEL[id]);
  const chip = (id: StageId, before?: ReactNode, after?: ReactNode, small = false) => (
    <Stage id={id} label={label(id)} status={v[id] as StageStatus} run={v.run} small={small} before={before} after={after} />
  );
  const loopOn = v.loop || v.hcd === "active" || v.frg === "active";
  const swap = v.loop && v.run === "running";

  return (
    <div className={`flex items-center ${center ? "justify-center" : ""} ${className}`} data-testid="pipeline" data-run={v.run}>
      <ol aria-label={t("stage.label")} className={`flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs ${center ? "justify-center" : ""}`}>
        {v.research && chip("research")}
        <li className="flex items-center gap-1">
          {v.research && <Connector from={v.research} to={v.loop ? "active" : v.hcd} run={v.run} />}
          <div
            data-testid="stage-loop"
            data-active={v.loop || undefined}
            className={`flex items-center gap-1 rounded-full border border-dashed py-0.5 pl-1.5 pr-0.5 transition-colors ${
              v.loop ? "border-blue-400 bg-blue-50" : loopOn ? "border-blue-300" : "border-slate-300"
            }`}
          >
            <Repeat2 size={13} className={v.loop ? "text-blue-600" : loopOn ? "text-blue-400" : "text-slate-400"} aria-hidden />
            <ol className="flex items-center gap-1" aria-label={t("stage.loop")}>
              {chip("hcd", null, <ArrowLeftRight size={13} aria-hidden className={swap ? "stage-swap text-blue-600" : loopOn ? "text-blue-400" : "text-slate-400"} />)}
              {chip("frg")}
              {chip("cross", null, null, true)}
            </ol>
          </div>
        </li>
        {chip("csv", <Connector from={v.frg === "done" ? "done" : "pending"} to={v.csv} run={v.run} />)}
        {chip("xlsx", <Connector from={v.csv} to={v.xlsx} run={v.run} />, help ? <HelpTip text={t("stage.help")} label={t("stage.helpLabel")} className="ml-1" /> : null)}
      </ol>
    </div>
  );
}

function Stage({ id, label, status, run, small, before, after }: { id: StageId; label: string; status: StageStatus; run: RunState; small: boolean; before?: ReactNode; after?: ReactNode }) {
  const t = useT();
  const animate = status === "active" && run === "running";
  const paused = status === "active" && run === "waiting";
  const tone =
    status === "done"
      ? "bg-emerald-100 text-emerald-700"
      : animate
        ? "stage-active bg-blue-600 text-white"
        : paused
          ? "bg-amber-100 text-amber-800"
          : status === "stopped"
            ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
            : "bg-slate-100 text-slate-500";
  const statusKey: MessageKey = paused ? "stage.paused" : `stage.${status}`;
  return (
    <li className="flex items-center gap-1">
      {before}
      <span
        data-testid={`stage-${id}`}
        data-status={status}
        aria-current={status === "active" ? "step" : undefined}
        className={`flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5"} ${tone}`}
      >
        {status === "done" ? (
          <Check size={12} aria-hidden />
        ) : animate ? (
          <>
            <Loader2 size={12} className="animate-spin motion-reduce:hidden" aria-hidden />
            <CircleDot size={12} className="hidden motion-reduce:inline" aria-hidden />
          </>
        ) : paused ? (
          <Pause size={12} aria-hidden />
        ) : status === "stopped" ? (
          <CircleSlash size={12} aria-hidden />
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-slate-300" aria-hidden />
        )}
        {label}
        <span className="sr-only">, {t(statusKey)}</span>
      </span>
      {after}
    </li>
  );
}

/** The line between two stages: green once the next stage is reached, flowing into the stage that is running. */
function Connector({ from, to, run }: { from: StageStatus; to: StageStatus; run: RunState }) {
  const flowing = from === "done" && to === "active" && run === "running";
  const tone = flowing ? "stage-flow" : from === "done" && to !== "pending" ? "bg-emerald-300" : "bg-slate-300";
  return <span aria-hidden className={`h-0.5 w-3 shrink-0 rounded-full sm:w-4 ${tone}`} />;
}
