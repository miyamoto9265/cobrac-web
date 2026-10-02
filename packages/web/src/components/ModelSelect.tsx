import { useEffect, useState } from "react";
import type { OrgTier, ReasoningEffort } from "@cobrac/shared";
import { REASONING_EFFORTS } from "@cobrac/shared";
import { useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";

const CUSTOM = "__custom__";

/** Mirrors shared resolvePricing(): exact match or dated snapshot suffix stripped. */
export function isPriced(model: string, priced: string[]): boolean {
  return priced.includes(model) || priced.includes(model.replace(/-\d{4}-\d{2}-\d{2}$/, ""));
}

/**
 * Models the user may choose (their own key's, or the organization-key tier's); `custom` starts true when the chosen
 * model is not among them. `restricted`: only `models` are allowed, so there is no custom model ID.
 */
export function useModelList(model: string | null) {
  const [models, setModels] = useState<string[]>([]);
  const [priced, setPriced] = useState<string[]>([]);
  const [envDefault, setEnvDefault] = useState<string | null>(null);
  const [orgTier, setOrgTier] = useState<OrgTier | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    api
      .models()
      .then((r) => {
        setModels(r.models);
        setPriced(r.pricedModels ?? []);
        setEnvDefault(r.envDefaultModel);
        setOrgTier(r.orgTier ?? null);
        setRestricted(!!r.restricted);
        if (model && !r.models.includes(model) && !r.restricted) setCustom(true);
      })
      .catch(() => undefined);
  }, [model]);
  return { models, priced, envDefault, orgTier, restricted, custom, setCustom };
}

interface Props {
  model: string | null;
  effort: ReasoningEffort | null;
  onChange: (v: { model: string | null; effort: ReasoningEffort | null }) => void;
  /** Label for the "default" option */
  defaultLabel?: string;
  compact?: boolean;
}

/** Model + reasoning-effort picker. Model list comes from the user's registered OpenAI key. */
export function ModelSelect({ model, effort, onChange, defaultLabel, compact = false }: Props) {
  const t = useT();
  const fallbackLabel = defaultLabel ?? t("model.default");
  const { models, priced, envDefault, orgTier, restricted, custom, setCustom } = useModelList(model);

  const sel = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
  const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
      <label className="block">
        <span className={lbl}>{t("model.label")}</span>
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
        {orgTier && <span className="mt-1 block text-[11px] text-slate-500" data-testid="org-tier-note">{t("model.orgTier", { tier: orgTier })}</span>}
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
      <label className="block">
        <span className={lbl}>{t("model.effort")}</span>
        <select value={effort ?? ""} onChange={(e) => onChange({ model, effort: (e.target.value || null) as ReasoningEffort | null })} className={sel}>
          <option value="">{fallbackLabel}</option>
          {REASONING_EFFORTS.map((x) => (
            <option key={x} value={x}>
              {t(`effort.${x}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
