import { Layers } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { CanonRecord, PlanCanonChoice, PlanDetailResponse } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { canonPath, inputCls } from "../../pages/CanonsPage";
import { HelpTip } from "../HelpTip";

/** The Canon named in the confirmation: none, or its name and whether it is created at confirmation. */
export type ConfirmCanon = { isNew: boolean; name: string } | null;
/** Stores the Canon choice that is still being edited; `false` when it could not be saved. */
export type CanonFlush = () => Promise<ConfirmCanon | false>;

const NOTE: Record<PlanCanonChoice["mode"], MessageKey> = { none: "pd.canon.noneNote", existing: "pd.canon.existingNote", new: "pd.canon.newNote" };

/**
 * The plan's Canon: chosen in a draft (none, one of the owner's Canons, or a new one created at confirmation) as a
 * segmented control in 「3. 進め方」, read-only afterwards (a card of its own once the plan is confirmed).
 */
export function CanonSection({ d, onSaved, onError, flushRef }: { d: PlanDetailResponse; onSaved: () => Promise<unknown>; onError: (e: unknown) => void; flushRef: React.MutableRefObject<CanonFlush | null> }) {
  const t = useT();
  const id = useId();
  const { plan } = d;
  const editable = plan.status === "DRAFT";
  const draftLike = editable || plan.status === "DRAFTING";
  const [own, setOwn] = useState<CanonRecord[] | null>(null);
  // the choice while it is being saved (the stored one is shown otherwise)
  const [pending, setPending] = useState<PlanCanonChoice | null>(null);
  const [name, setName] = useState<string | null>(null);
  // the save in flight (confirming waits for it) and whether it was stored
  const inflight = useRef<{ choice: PlanCanonChoice; done: Promise<boolean> } | null>(null);
  useEffect(() => {
    if (!editable) return;
    let live = true;
    // only the owner's own Canons that are not deleted (a co-edited Canon cannot take the owner's projects)
    Promise.resolve()
      .then(() => api.listCanons())
      .then((r) => live && setOwn((r.items ?? []).filter((c) => !c.deletedAt)))
      .catch(() => live && setOwn([]));
    return () => {
      live = false;
    };
  }, [editable]);
  const stored: PlanCanonChoice = plan.canonNew ? { mode: "new", name: plan.canonNew.name } : plan.canonId ? { mode: "existing", canonId: plan.canonId } : { mode: "none" };
  const choice = pending ?? stored;
  const save = (c: PlanCanonChoice): Promise<boolean> => {
    setPending(c);
    const done: Promise<boolean> = api
      .setPlanCanon(plan.planId, c)
      .then(() => onSaved())
      .then(
        () => true,
        (e) => {
          onError(e);
          return false;
        },
      )
      .finally(() => {
        if (inflight.current?.done === done) inflight.current = null;
        setPending(null);
      });
    inflight.current = { choice: c, done };
    return done;
  };
  const canonName = (c: PlanCanonChoice): ConfirmCanon =>
    c.mode === "none" ? null : c.mode === "new" ? { isNew: true, name: c.name } : { isNew: false, name: own?.find((x) => x.canonId === c.canonId)?.name ?? (d.canon?.canonId === c.canonId ? d.canon.name : c.canonId) };
  // confirming first stores a new Canon name that is typed but not saved yet (or waits for the save in flight)
  flushRef.current = editable
    ? async () => {
        const typed = choice.mode === "new" ? (name ?? "").trim() : "";
        const f = inflight.current;
        if (f && !(typed && f.choice.mode === "new" && typed !== f.choice.name)) return (await f.done) ? canonName(f.choice) : false;
        if (f) await f.done;
        if (choice.mode === "new" && typed && typed !== choice.name) {
          const c: PlanCanonChoice = { mode: "new", name: typed };
          return (await save(c)) ? canonName(c) : false;
        }
        return canonName(choice);
      }
    : null;

  if (!editable) {
    const c = d.canon;
    const shown = c?.missing ? (
      <p className="text-sm text-rose-700">{t("plan.canonMissing")}</p>
    ) : c ? (
      <Link to={canonPath(c.canonId)} className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 text-sm text-blue-700 hover:underline coarse:min-h-11">
        <Layers size={14} className="shrink-0" aria-hidden />
        <span className="min-w-0 break-words font-medium">{c.name}</span>
        <span className="font-mono text-xs text-slate-500">{t("canon.revision", { n: c.headRevision })}</span>
      </Link>
    ) : plan.canonNew ? (
      <p className="break-words text-sm text-slate-700">{t("plan.canonToCreate", { name: plan.canonNew.name })}</p>
    ) : null;
    // while the draft is written the choice is shown in 「3. 進め方」 (with 「なし」); a confirmed plan without a Canon shows nothing
    if (draftLike)
      return (
        <div className="grid gap-1" data-testid="plan-canon">
          <h3 className="flex items-center gap-1 font-semibold">
            {t("plan.canon")} <HelpTip text={t("plan.canonHelp")} />
          </h3>
          {shown ?? <p className="text-sm text-slate-700">{t("plan.canonNone")}</p>}
        </div>
      );
    if (!shown) return null;
    return (
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" data-testid="plan-canon">
        <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          {t("plan.canon")} <HelpTip text={t("plan.canonHelp")} />
        </h2>
        {shown}
      </section>
    );
  }

  const canons = own ?? [];
  const pickedId = choice.mode === "existing" ? choice.canonId : (canons[0]?.canonId ?? "");
  // the stored Canon is listed even when the list does not have it (e.g. while it loads)
  const options = choice.mode === "existing" && !canons.some((c) => c.canonId === choice.canonId) ? [{ canonId: choice.canonId, name: d.canon?.name ?? choice.canonId }, ...canons] : canons;
  const newName = name ?? (choice.mode === "new" ? choice.name : plan.name);
  const busy = pending !== null;
  // one segment of the control: a real radio button, hidden under its label
  const segment = (mode: PlanCanonChoice["mode"], label: string, input: { disabled: boolean; onChange: () => void }) => (
    <label className="relative flex cursor-pointer border-l border-slate-300 first:border-l-0 has-[:disabled]:cursor-not-allowed">
      <input type="radio" name="plan-canon" checked={choice.mode === mode} disabled={input.disabled} onChange={input.onChange} className="peer sr-only" data-testid={`canon-${mode}`} />
      <span className="flex min-h-10 items-center px-4 text-sm text-slate-700 peer-checked:bg-blue-50 peer-checked:font-semibold peer-checked:text-blue-700 peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-blue-400 peer-disabled:opacity-50 coarse:min-h-11">
        {label}
      </span>
    </label>
  );
  return (
    <fieldset className="grid min-w-0 gap-2" data-testid="plan-canon">
      <legend className="mb-2 font-semibold">
        {t("plan.canon")} <HelpTip text={t("plan.canonHelp")} />
      </legend>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="inline-flex max-w-full flex-wrap overflow-hidden rounded-lg border border-slate-300 bg-white" role="radiogroup" aria-label={t("plan.canon")}>
          {segment("none", t("plan.canonNone"), { disabled: busy, onChange: () => save({ mode: "none" }) })}
          {segment("existing", t("plan.canonExisting"), { disabled: busy || (!options.length && choice.mode !== "existing"), onChange: () => pickedId && save({ mode: "existing", canonId: pickedId }) })}
          {segment("new", t("plan.canonNew"), { disabled: busy, onChange: () => save({ mode: "new", name: newName.trim() || plan.name }) })}
        </div>
        {choice.mode === "existing" && (
          <select
            value={choice.canonId}
            disabled={busy}
            onChange={(e) => e.target.value && save({ mode: "existing", canonId: e.target.value })}
            aria-label={t("plan.canonSelect")}
            className={`${inputCls} min-w-0 bg-white sm:w-auto sm:max-w-xs`}
            data-testid="canon-select"
          >
            {options.map((c) => (
              <option key={c.canonId} value={c.canonId}>
                {c.name} ({c.canonId})
              </option>
            ))}
          </select>
        )}
        {choice.mode === "new" && (
          <span className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <label htmlFor={`${id}-name`} className="shrink-0 text-sm font-semibold">
              {t("plan.name")}
            </label>
            <input
              id={`${id}-name`}
              value={newName}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const v = newName.trim();
                if (v && v !== choice.name) save({ mode: "new", name: v });
                else setName(null);
              }}
              maxLength={200}
              aria-label={t("plan.canonNewName")}
              placeholder={t("plan.canonNewName")}
              className={`${inputCls} min-w-0 sm:w-60`}
              data-testid="canon-new-name"
            />
          </span>
        )}
      </div>
      {own !== null && !options.length && <p className="text-xs text-slate-500">{t("plan.canonNoOwn")}</p>}
      <p className="text-sm text-slate-600">{t(NOTE[choice.mode])}</p>
    </fieldset>
  );
}
