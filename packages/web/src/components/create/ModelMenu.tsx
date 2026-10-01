import { BookOpenCheck, Check, ChevronDown } from "lucide-react";
import type { ReasoningEffort } from "@cobrac/shared";
import { REASONING_EFFORTS, formatUsd, researchModeEstimate } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { HelpLink, HelpTip } from "../HelpTip";
import { isPriced, useModelList } from "../ModelSelect";
import { MenuHeading, Popover } from "./Popover";

export interface RunSettings {
  model: string | null;
  effort: ReasoningEffort | null;
  research: boolean;
}

/** The composer's "v" menu: model, reasoning effort and research mode. The chip shows the model that will run. */
export function ModelMenu({ value, onChange, fallbackModel, disabled }: { value: RunSettings; onChange: (v: RunSettings) => void; fallbackModel: string; disabled?: boolean }) {
  const t = useT();
  const { models, priced, envDefault, custom, setCustom } = useModelList(value.model);
  const shown = value.model || envDefault || fallbackModel;
  const est = researchModeEstimate(value.model || fallbackModel);
  const vars = { min: est.minutes[0], max: est.minutes[1], model: value.model || fallbackModel };
  const set = (p: Partial<RunSettings>) => onChange({ ...value, ...p });

  const row = "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100 has-[:focus-visible]:bg-slate-100 coarse:min-h-11";
  const radio = "peer sr-only";
  const tick = (on: boolean) => <Check size={14} className={`shrink-0 ${on ? "text-blue-600" : "invisible"}`} aria-hidden />;

  return (
    <Popover
      testId="composer-model"
      title={t("model.label")}
      align="end"
      width="w-72"
      minSpace={460}
      disabled={disabled}
      trigger={{
        label: `${t("model.label")}: ${shown}${value.effort ? ` · ${value.effort}` : ""}${value.research ? ` · ${t("chat.research")}` : ""}`,
        className:
          "flex max-w-[7.5rem] items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 aria-expanded:bg-slate-100 coarse:min-h-11 sm:max-w-[16rem]",
        content: (
          <>
            {value.research && <BookOpenCheck size={14} className="shrink-0 text-blue-600" aria-hidden />}
            <span className="truncate font-mono">{shown}</span>
            {value.effort && <span className="hidden shrink-0 text-slate-400 sm:inline">· {value.effort}</span>}
            <ChevronDown size={14} className="shrink-0 text-slate-400" aria-hidden />
          </>
        ),
      }}
    >
      {() => (
        <div className="pb-2" data-testid="model-menu">
          <MenuHeading>{t("model.label")}</MenuHeading>
          <div role="radiogroup" aria-label={t("model.label")} className="max-h-48 overflow-y-auto px-1.5">
            <label className={row}>
              <input type="radio" name="cm-model" className={radio} checked={!custom && !value.model} onChange={() => (setCustom(false), set({ model: null }))} />
              {tick(!custom && !value.model)}
              <span className="min-w-0 flex-1 truncate">
                {t("model.default")}
                <span className="text-slate-400">{envDefault ? t("model.defaultWith", { model: envDefault }) : t("model.codexDefault")}</span>
              </span>
            </label>
            {models.map((m) => (
              <label key={m} className={row}>
                <input type="radio" name="cm-model" className={radio} checked={!custom && value.model === m} onChange={() => (setCustom(false), set({ model: m }))} />
                {tick(!custom && value.model === m)}
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{m}</span>
                {priced.length > 0 && !isPriced(m, priced) && <span className="shrink-0 text-[11px] text-slate-400">{t("model.unpriced")}</span>}
              </label>
            ))}
            <label className={row}>
              <input type="radio" name="cm-model" className={radio} checked={custom} onChange={() => (setCustom(true), set({ model: value.model ?? "" }))} />
              {tick(custom)}
              <span className="flex-1">{t("model.custom")}</span>
            </label>
            {custom && (
              <input
                value={value.model ?? ""}
                onChange={(e) => set({ model: e.target.value.trim() || null })}
                placeholder={t("model.customPh")}
                aria-label={t("model.custom")}
                className="mx-3 mb-1 w-[calc(100%-1.5rem)] rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            )}
          </div>
          {models.length === 0 && <div className="px-4 pb-1 text-[11px] text-slate-400">{t("model.needKey")}</div>}

          <MenuHeading>{t("model.effort")}</MenuHeading>
          <div role="radiogroup" aria-label={t("model.effort")} className="flex flex-wrap gap-1 px-3">
            {[null, ...REASONING_EFFORTS].map((x) => {
              const on = value.effort === x;
              return (
                <label
                  key={x ?? "default"}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 coarse:py-2 ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                >
                  <input type="radio" name="cm-effort" className="sr-only" checked={on} onChange={() => set({ effort: x })} />
                  {x ? t(`effort.${x}` as MessageKey) : t("model.default")}
                </label>
              );
            })}
          </div>

          <div className="mx-3 mt-3 border-t border-slate-100 pt-2" data-testid="research-toggle">
            <div className="flex items-center gap-2">
              <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800 coarse:min-h-11">
                <input type="checkbox" role="switch" checked={value.research} onChange={(e) => set({ research: e.target.checked })} className="peer sr-only" />
                <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-blue-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 motion-reduce:after:transition-none" aria-hidden />
                <BookOpenCheck size={15} className="text-blue-600" aria-hidden /> {t("chat.research")}
              </label>
              <HelpTip text={t("chat.researchHelp")} />
            </div>
            {value.research && (
              <div className="mt-1 text-xs text-amber-700" data-testid="research-estimate">
                {est.costUsd ? t("chat.researchEstimate", { ...vars, cost: `${formatUsd(est.costUsd[0])}–${formatUsd(est.costUsd[1])}` }) : t("chat.researchEstimateNoPrice", vars)}
              </div>
            )}
            <HelpLink section="research" className="mt-1" />
          </div>
        </div>
      )}
    </Popover>
  );
}
