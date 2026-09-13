import { Check, Loader2 } from "lucide-react";
import type { StepState, WorkflowStep } from "@cobrac/shared";
import { WORKFLOW_STEPS } from "@cobrac/shared";
import { STEP_LABEL } from "../lib/format";

export function Stepper({ states }: { states: Record<WorkflowStep, StepState> }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {WORKFLOW_STEPS.map((s, i) => {
        const st = states[s];
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                st === "done" ? "bg-emerald-100 text-emerald-700" : st === "running" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {st === "done" ? <Check size={12} /> : st === "running" ? <Loader2 size={12} className="animate-spin" /> : <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />}
              {STEP_LABEL[s]}
            </span>
            {i < WORKFLOW_STEPS.length - 1 && <span className="h-px w-4 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}
