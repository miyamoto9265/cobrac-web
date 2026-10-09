import { useEffect, useId, useRef, useState } from "react";
import type { PlanDetailResponse, PlanRecord, UpdatePlanRequest } from "@cobrac/shared";
import { AUTONOMOUS_DEFAULT_MAX_COST_USD, AUTONOMOUS_MAX_COST_RANGE, orchestratorModelOf } from "@cobrac/shared";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { inputCls } from "../../pages/CanonsPage";
import { HelpTip } from "../HelpTip";
import { ModelSelect } from "../ModelSelect";
import { CanonSection, type CanonFlush } from "./CanonSection";

type SaveSettings = (b: NonNullable<UpdatePlanRequest["settings"]>) => void;

/** A checkbox drawn as a switch (`role="switch"`); its label and description sit next to it. */
const switchCls =
  "relative mt-0.5 h-[26px] w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-[#fff] after:shadow after:transition-transform after:content-[''] checked:after:translate-x-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 自律実行 of a draft: on / off and the cost limit (saved when the field is left). Switched on after the draft was
 * applied, the draft is not confirmed on its own: the note says that 「確定して開始」 starts the autonomous run.
 */
function AutonomousCard({ plan, save }: { plan: PlanRecord; save: SaveSettings }) {
  const t = useT();
  const id = useId();
  const a = plan.settings.autonomous ?? null;
  const [cost, setCost] = useState(String(a?.maxCostUsd ?? AUTONOMOUS_DEFAULT_MAX_COST_USD));
  useEffect(() => setCost(String(a?.maxCostUsd ?? AUTONOMOUS_DEFAULT_MAX_COST_USD)), [a?.maxCostUsd]);
  const ok = (v: string) => Number(v) >= AUTONOMOUS_MAX_COST_RANGE.min && Number(v) <= AUTONOMOUS_MAX_COST_RANGE.max;
  const afterDraft = !!a && plan.draft?.status === "done" && !plan.draft.autoConfirm;
  return (
    <div className={`flex gap-3.5 rounded-xl border p-4 ${a ? "border-violet-200 bg-violet-50" : "border-slate-200"}`} data-testid="plan-autonomous-setting">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={!!a}
        onChange={(e) => save({ autonomous: e.target.checked ? { maxCostUsd: ok(cost) ? Number(cost) : AUTONOMOUS_DEFAULT_MAX_COST_USD } : null })}
        aria-describedby={`${id}-help`}
        className={`${switchCls} checked:bg-violet-600`}
      />
      <div className="grid min-w-0 flex-1 gap-2.5">
        <div className="grid gap-0.5">
          <label htmlFor={id} className={`cursor-pointer font-semibold ${a ? "text-violet-800" : ""}`}>
            {t("auto.label")}
          </label>
          <p id={`${id}-help`} className={`text-sm ${a ? "text-violet-700" : "text-slate-600"}`}>
            {t("auto.help")}
          </p>
        </div>
        {a && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <label htmlFor={`${id}-cost`} className="text-sm font-semibold text-violet-800">
              {t("auto.cost")}
            </label>
            <input
              id={`${id}-cost`}
              type="number"
              min={AUTONOMOUS_MAX_COST_RANGE.min}
              max={AUTONOMOUS_MAX_COST_RANGE.max}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onBlur={() => ok(cost) && Number(cost) !== a.maxCostUsd && save({ autonomous: { maxCostUsd: Number(cost) } })}
              // inputCls is full width: the limit is a short number field
              className={`${inputCls.replace("w-full", "w-28")} bg-white`}
              aria-invalid={!ok(cost)}
              aria-describedby={`${id}-cost-hint`}
            />
            <span id={`${id}-cost-hint`} className="text-xs text-violet-700">
              {t("auto.costHint", { min: AUTONOMOUS_MAX_COST_RANGE.min, max: AUTONOMOUS_MAX_COST_RANGE.max })}
            </span>
          </div>
        )}
        {afterDraft && (
          <p className="text-xs text-violet-700" data-testid="plan-auto-after-draft">
            {t("auto.afterDraft")}
          </p>
        )}
      </div>
    </div>
  );
}

/** The two models in three equal columns (the Orchestrator's, the agents' and the agents' reasoning effort), one key note. */
function Models({ d, save }: { d: PlanDetailResponse; save: SaveSettings }) {
  const t = useT();
  const s = d.plan.settings;
  const o = orchestratorModelOf(s);
  // the models and effort are shown from local state and saved after a pause, so typing a custom model ID is not interrupted
  const [choice, setChoice] = useState({ model: s.modelChosen ? s.model : null, effort: s.reasoningEffort, orchestratorModel: o.chosen ? o.model : null });
  const [orgKey, setOrgKey] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const choose = (v: typeof choice) => {
    setChoice(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ model: v.model, reasoningEffort: v.effort, orchestratorModel: v.orchestratorModel }), 600);
  };
  return (
    <div className="grid gap-2.5" data-testid="plan-models">
      <h3 className="font-semibold">{t("model.label")}</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div data-testid="plan-orchestrator-model">
          <ModelSelect
            model={choice.orchestratorModel}
            effort={null}
            onChange={(v) => choose({ ...choice, orchestratorModel: v.model })}
            hideEffort
            labels={{ model: t("pd.models.orchestrator") }}
            modelHint={t("pd.models.orchestratorHint")}
            keyNote={false}
          />
        </div>
        <div className="contents" data-testid="plan-agents-model">
          <ModelSelect
            model={choice.model}
            effort={choice.effort}
            onChange={(v) => choose({ ...choice, model: v.model, effort: v.effort })}
            labels={{ model: t("pd.models.agents"), effort: t("pd.models.effort") }}
            modelHint={t("pd.models.agentsHint")}
            keyNote={false}
            onKeySource={setOrgKey}
            contents
          />
        </div>
      </div>
      {orgKey && (
        <p className="text-xs text-slate-500" data-testid="default-key-note">
          {t("pd.models.defaultKey")}
        </p>
      )}
    </div>
  );
}

/**
 * 「3. 進め方」: 自律実行, the Canon, the models and research mode. They stay open while a draft is being written (only the
 * rows are locked then), except the Canon, which is chosen once the draft is ready.
 */
export function DraftHow({ d, onChanged, onSaved, onError, flushRef }: { d: PlanDetailResponse; onChanged: () => void; onSaved: () => Promise<unknown>; onError: (e: unknown) => void; flushRef: React.MutableRefObject<CanonFlush | null> }) {
  const t = useT();
  const id = useId();
  const { plan } = d;
  const save: SaveSettings = (b) => void api.updatePlan(plan.planId, { settings: b }).then(onChanged).catch(onError);
  return (
    <section aria-labelledby={`${id}-h`} className="grid gap-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" data-testid="plan-settings">
      <h2 id={`${id}-h`} className="flex items-center gap-1 text-base font-semibold sm:text-lg">
        {t("pd.how.title")} <HelpTip text={t("plan.settingsNote")} />
      </h2>
      <AutonomousCard plan={plan} save={save} />
      <CanonSection d={d} onSaved={onSaved} onError={onError} flushRef={flushRef} />
      <Models d={d} save={save} />
      <div className="flex gap-3.5">
        <input id={`${id}-research`} type="checkbox" role="switch" checked={plan.settings.researchMode} onChange={(e) => save({ researchMode: e.target.checked })} aria-describedby={`${id}-research-help`} className={`${switchCls} checked:bg-blue-600`} />
        <div className="grid min-w-0 gap-0.5">
          <label htmlFor={`${id}-research`} className="cursor-pointer font-semibold">
            {t("plan.researchMode")}
          </label>
          <p id={`${id}-research-help`} className="text-sm text-slate-600">
            {t("pd.research.help")}
          </p>
        </div>
      </div>
    </section>
  );
}
