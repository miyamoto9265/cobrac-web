import { useEffect, useState } from "react";
import type { ReasoningEffort } from "@cobrac/shared";
import { REASONING_EFFORTS, REASONING_EFFORT_LABEL } from "@cobrac/shared";
import { api } from "../lib/api";

const CUSTOM = "__custom__";

/** Mirrors shared resolvePricing(): exact match or dated snapshot suffix stripped. */
function isPriced(model: string, priced: string[]): boolean {
  return priced.includes(model) || priced.includes(model.replace(/-\d{4}-\d{2}-\d{2}$/, ""));
}

interface Props {
  model: string | null;
  effort: ReasoningEffort | null;
  onChange: (v: { model: string | null; effort: ReasoningEffort | null }) => void;
  /** Label for the "default" option, e.g. "既定（ユーザー設定）" */
  defaultLabel?: string;
  compact?: boolean;
}

/** Model + reasoning-effort picker. Model list comes from the user's registered OpenAI key. */
export function ModelSelect({ model, effort, onChange, defaultLabel = "既定", compact = false }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [priced, setPriced] = useState<string[]>([]);
  const [envDefault, setEnvDefault] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    api
      .models()
      .then((r) => {
        setModels(r.models);
        setPriced(r.pricedModels ?? []);
        setEnvDefault(r.envDefaultModel);
        if (model && !r.models.includes(model)) setCustom(true);
      })
      .catch(() => undefined);
  }, [model]);

  const sel = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
      <label className="block">
        <span className={lbl}>モデル</span>
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
          <option value="">{defaultLabel}{envDefault ? `（${envDefault}）` : "（Codex 既定）"}</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}{priced.length > 0 && !isPriced(m, priced) ? "（単価未登録）" : ""}
            </option>
          ))}
          <option value={CUSTOM}>その他（手入力）…</option>
        </select>
        {custom && (
          <input
            value={model ?? ""}
            onChange={(e) => onChange({ model: e.target.value.trim() || null, effort })}
            placeholder="例: gpt-5.5"
            className={`${sel} mt-2 font-mono`}
          />
        )}
        {models.length === 0 && <span className="mt-1 block text-[11px] text-slate-400">API キーを登録すると利用可能なモデル一覧が表示されます</span>}
      </label>
      <label className="block">
        <span className={lbl}>Reasoning effort</span>
        <select value={effort ?? ""} onChange={(e) => onChange({ model, effort: (e.target.value || null) as ReasoningEffort | null })} className={sel}>
          <option value="">{defaultLabel}</option>
          {REASONING_EFFORTS.map((x) => (
            <option key={x} value={x}>
              {REASONING_EFFORT_LABEL[x]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
