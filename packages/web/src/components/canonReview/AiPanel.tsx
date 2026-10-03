import { AlertTriangle, Bot, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CanonAiFlag, CanonAiState, UiLocale } from "@cobrac/shared";
import { formatUsd } from "@cobrac/shared";
import { LOCALES, localeName, useI18n, useT, type MessageKey } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { HelpTip } from "../HelpTip";
import { isPriced, useModelList } from "../ModelSelect";
import { checkLabelKey } from "./ChecksPanel";

const SEV: Record<CanonAiFlag["severity"], string> = {
  high: "border-rose-200 bg-rose-50",
  medium: "border-amber-200 bg-amber-50",
  low: "border-slate-200 bg-slate-50",
};

export interface RefLink {
  doi: string;
  pmid: string;
}

interface Props {
  ai: CanonAiState | null;
  /** Open PR and the viewer is its reviewer */
  canRun: boolean;
  onRun: (model: string | null, locale: UiLocale) => Promise<void>;
  labelOf: (id: string) => string;
  checkCodeOf: (id: string) => string | null;
  refs: Map<string, RefLink>;
  onSelect: (id: string) => void;
  onUseComment: (item: string, text: string) => void;
}

const refUrl = (r: RefLink | undefined) => (r?.doi ? `https://doi.org/${r.doi}` : r?.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : null);

/** AI assistance: pick a model (the tier's models with the default API key) and language, run, read the result. */
export function AiPanel({ ai, canRun, onRun, labelOf, checkCodeOf, refs, onSelect, onUseComment }: Props) {
  const t = useT();
  const { locale: uiLocale } = useI18n();
  const { models, priced, envDefault } = useModelList(null);
  const [model, setModel] = useState("");
  const [lang, setLang] = useState<UiLocale>(uiLocale);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = ai?.status === "QUEUED" || ai?.status === "RUNNING";
  const review = ai?.result?.review ?? null;
  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:min-h-11";

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onRun(model || null, lang);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="ai-panel">
      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Bot size={16} /> {t("rv.ai.title")} <HelpTip text={t("rv.ai.help")} />
        </h3>
        <div className="mb-2 flex items-start gap-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs text-violet-800" data-testid="ai-notice">
          <Sparkles size={13} className="mt-0.5 shrink-0" /> {t("rv.ai.notice")}
        </div>
        {canRun ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-0.5 text-[11px] text-slate-500">
              {t("model.label")}
              <select value={model} onChange={(e) => setModel(e.target.value)} className={sel} data-testid="ai-model">
                <option value="">
                  {t("model.default")}
                  {envDefault ? t("model.defaultWith", { model: envDefault }) : ""}
                </option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                    {isPriced(m, priced) ? "" : t("model.unpriced")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-0.5 text-[11px] text-slate-500">
              {t("language")}
              <select value={lang} onChange={(e) => setLang(e.target.value as UiLocale)} className={sel}>
                {LOCALES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {localeName(l.id, t)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || active}
              onClick={() => void run()}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 coarse:min-h-11"
              data-testid="ai-run"
            >
              {busy || active ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {ai ? t("rv.ai.rerun") : t("rv.ai.run")}
            </button>
          </div>
        ) : (
          !ai && <div className="text-xs text-slate-500">{t("rv.ai.closed")}</div>
        )}
        {err && <div className="mt-2 text-xs text-rose-700">{err}</div>}
        {ai && (
          <div className="mt-2 text-[11px] text-slate-500" data-testid="ai-status">
            {active ? (
              <span className="flex items-center gap-1 text-violet-700">
                <Loader2 size={12} className="animate-spin" /> {ai.status === "QUEUED" ? t("rv.ai.queued") : t("rv.ai.running")}
              </span>
            ) : ai.status === "FAILED" ? (
              <span className="flex items-start gap-1 text-rose-700">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t("rv.ai.failed", { error: ai.errorMessage ?? "" })}
              </span>
            ) : (
              <span>
                {[ai.model, ai.locale ? localeName(ai.locale, t) : null, ai.endedAt ? fmtDate(ai.endedAt, uiLocale) : null, ai.costUsd !== null ? formatUsd(ai.costUsd) : null].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        )}
      </section>

      {review && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <h3 className="mb-1 text-sm font-semibold">{t("rv.ai.summary")}</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700" data-testid="ai-summary">
              {review.summary}
            </p>
            {ai!.result!.dropped > 0 && <p className="mt-1 text-[11px] text-slate-500">{t("rv.ai.dropped", { n: ai!.result!.dropped })}</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <h3 className="mb-2 text-sm font-semibold">
              {t("rv.ai.flags")} <span className="font-normal text-slate-400">({review.flags.length})</span>
            </h3>
            {review.flags.length === 0 && <div className="text-xs text-slate-500">{t("rv.ai.noFlags")}</div>}
            <ul className="grid gap-2">
              {review.flags.map((f, i) => (
                <li key={i} className={`rounded-lg border p-2.5 text-xs ${SEV[f.severity]}`} data-testid="ai-flag">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-white/70 px-1.5 text-[10px] uppercase tracking-wide text-slate-600">{t(`rv.ai.sev.${f.severity}` as MessageKey)}</span>
                    <span className="font-medium">{f.title}</span>
                  </div>
                  {f.reason && <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{f.reason}</p>}
                  {(f.items.length > 0 || f.checks.length > 0 || f.references.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {f.items.map((id) => (
                        <button key={id} type="button" onClick={() => onSelect(id)} className="max-w-full truncate rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-blue-700 hover:bg-blue-50 coarse:min-h-9">
                          {labelOf(id)}
                        </button>
                      ))}
                      {f.checks.map((id) => {
                        const code = checkCodeOf(id);
                        return code ? (
                          <span key={id} className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {t(checkLabelKey(code))}
                          </span>
                        ) : null;
                      })}
                      {f.references.map((r) => {
                        const url = refUrl(refs.get(r));
                        return url ? (
                          <a key={r} href={url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-0.5 rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-blue-700 hover:underline coarse:min-h-9">
                            {r} <ExternalLink size={9} />
                          </a>
                        ) : (
                          <span key={r} className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {r}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {review.verify.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <h3 className="mb-1 text-sm font-semibold">{t("rv.ai.verify")}</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                {review.verify.map((v, i) => (
                  <li key={i} className="break-words">
                    {v}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {review.comments.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold">
                {t("rv.ai.comments")} <HelpTip text={t("rv.ai.commentsHelp")} />
              </h3>
              <ul className="divide-y divide-slate-100">
                {review.comments.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 py-1.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-slate-500">{c.item ? labelOf(c.item) : t("rv.wholePr")}</div>
                      <div className="whitespace-pre-wrap break-words">{c.text}</div>
                    </div>
                    {canRun && (
                      <button type="button" onClick={() => onUseComment(c.item, c.text)} className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 coarse:min-h-10" data-testid="ai-use-comment">
                        {t("rv.ai.use")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
