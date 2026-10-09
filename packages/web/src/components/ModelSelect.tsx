import { useEffect, useState } from "react";
import type { ReasoningEffort } from "@cobrac/shared";
import { REASONING_EFFORTS } from "@cobrac/shared";
import { useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";

const CUSTOM = "__custom__";

/** Mirrors shared resolvePricing(): exact match or dated snapshot suffix stripped. */
export function isPriced(model: string, priced: string[]): boolean {
  return priced.includes(model) || priced.includes(model.replace(/-\d{4}-\d{2}-\d{2}$/, ""));
}

/**
 * Models the user may choose (their own key's, or those the default API key allows them); `custom` starts true when the chosen
 * model is not among them. `restricted`: only `models` are allowed, so there is no custom model ID.
 */
export function useModelList(model: string | null) {
  const [models, setModels] = useState<string[]>([]);
  const [priced, setPriced] = useState<string[]>([]);
  const [envDefault, setEnvDefault] = useState<string | null>(null);
  const [onDefaultKey, setOnDefaultKey] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    api
      .models()
      .then((r) => {
        setModels(r.models);
        setPriced(r.pricedModels ?? []);
        setEnvDefault(r.envDefaultModel);
        setOnDefaultKey(r.keySource === "org");
        setRestricted(!!r.restricted);
        if (model && !r.models.includes(model) && !r.restricted) setCustom(true);
      })
      .catch(() => undefined);
  }, [model]);
  return { models, priced, envDefault, onDefaultKey, restricted, custom, setCustom };
}

interface Props {
  model: string | null;
  effort: ReasoningEffort | null;
  onChange: (v: { model: string | null; effort: ReasoningEffort | null }) => void;
  /** Label for the "default" option */
  defaultLabel?: string;
  compact?: boolean;
  /** Only the model is chosen (the reasoning effort is fixed by the caller) */
  hideEffort?: boolean;
  /** Labels of the two pickers instead of 「モデル」 / "Reasoning effort", in sentence case */
  labels?: { model: string; effort?: string };
  /** A line under the model picker (what the model is used for) */
  modelHint?: string;
  /** The 「デフォルトの API キーを使用」 note under the picker; a caller with several pickers may show one note instead */
  keyNote?: boolean;
  /** Told whether the models come from the default API key (for the caller's own note) */
  onKeySource?: (onDefaultKey: boolean) => void;
  /** The pickers join the caller's grid (`display: contents`) instead of a grid of their own */
  contents?: boolean;
}

/** Model + reasoning-effort picker. Model list comes from the user's registered OpenAI key. */
export function ModelSelect({ model, effort, onChange, defaultLabel, compact = false, hideEffort = false, labels, modelHint, keyNote = true, onKeySource, contents = false }: Props) {
  const t = useT();
  const fallbackLabel = defaultLabel ?? t("model.default");
  const { models, priced, envDefault, onDefaultKey, restricted, custom, setCustom } = useModelList(model);
  useEffect(() => {
    onKeySource?.(onDefaultKey);
  }, [onDefaultKey, onKeySource]);

  const sel = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
  const lbl = labels ? "mb-1 block text-sm font-semibold text-slate-700" : "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className={contents ? "contents" : `grid gap-4 ${compact || hideEffort ? "" : "md:grid-cols-2"}`}>
      <label className="block">
        <span className={lbl}>{labels?.model ?? t("model.label")}</span>
        <select
          value={custom ? CUSTOM : model ?? ""}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              onChange({ model: model ?? "", effort });
            } else {
              setCustom(false);
              onChange({ model: e.target.value || null, effort });
            }
          }}
          className={sel}
        >
          <option value="">
            {fallbackLabel}
            {envDefault ? t("model.defaultWith", { model: envDefault }) : t("model.codexDefault")}
          </option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
              {priced.length > 0 && !isPriced(m, priced) ? t("model.unpriced") : ""}
            </option>
          ))}
          {!restricted && <option value={CUSTOM}>{t("model.custom")}</option>}
        </select>
        {modelHint && <span className="mt-1 block text-xs text-slate-500">{modelHint}</span>}
        {keyNote && onDefaultKey && <span className="mt-1 block text-[11px] text-slate-500" data-testid="default-key-note">{t("model.defaultKey")}</span>}
        {custom && (
          <input
            value={model ?? ""}
            onChange={(e) => onChange({ model: e.target.value.trim() || null, effort })}
            placeholder={t("model.customPh")}
            className={`${sel} mt-2 font-mono`}
          />
        )}
        {models.length === 0 && <span className="mt-1 block text-[11px] text-slate-400">{t("model.needKey")}</span>}
      </label>
      {!hideEffort && (
        <label className="block">
          <span className={lbl}>{labels?.effort ?? t("model.effort")}</span>
          <select value={effort ?? ""} onChange={(e) => onChange({ model, effort: (e.target.value || null) as ReasoningEffort | null })} className={sel}>
            <option value="">{fallbackLabel}</option>
            {REASONING_EFFORTS.map((x) => (
              <option key={x} value={x}>
                {t(`effort.${x}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
