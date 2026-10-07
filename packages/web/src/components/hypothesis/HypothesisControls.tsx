/**
 * Hypothesis mode, stage 3: the controls that allow hypotheses. The create screen's hypothesis-mode checkbox (off =
 * literature-supported only, the default; on = claims, share limit and a note) and the pieces the follow-up switch
 * reuses. They build the stage 2 request types; nothing is sent while hypotheses are not allowed.
 */
import { useId } from "react";
import type { HypothesisClaim, HypothesisCreateRequest } from "@cobrac/shared";
import { DEFAULT_HYPOTHESIS_MAX_SHARE, HYPOTHESIS_MAX_SHARES, HYPOTHESIS_NOTE_MAX } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { HelpTip } from "../HelpTip";
import { HypothesisMark } from "./HypothesisMark";

/** The claim checkboxes: one per claim, transmitter and modulation together. */
export const CLAIM_GROUPS: { key: string; label: MessageKey; claims: HypothesisClaim[] }[] = [
  { key: "existence", label: "hyp.claim.existence", claims: ["existence"] },
  { key: "direction", label: "hyp.claim.direction", claims: ["direction"] },
  { key: "sign", label: "hyp.claim.sign", claims: ["sign"] },
  { key: "population", label: "hyp.claim.population", claims: ["population"] },
  { key: "transmitter", label: "hyp.claim.transmitterModulation", claims: ["transmitter", "modulation"] },
  { key: "role", label: "hyp.claim.role", claims: ["role"] },
];
export const ALL_CLAIM_GROUPS = CLAIM_GROUPS.map((g) => g.key);

/** What the user chose; `claims` holds group keys. */
export interface HypothesisDraft {
  groups: string[];
  maxShare: number;
  note: string;
}

export const defaultHypothesisDraft = (): HypothesisDraft => ({ groups: [...ALL_CLAIM_GROUPS], maxShare: DEFAULT_HYPOTHESIS_MAX_SHARE, note: "" });

/** The claims of the checked groups, in the order of the groups. */
export const claimsOf = (groups: string[]): HypothesisClaim[] => CLAIM_GROUPS.filter((g) => groups.includes(g.key)).flatMap((g) => g.claims);

/** `CreateProjectRequest.hypothesis` of a draft (the note only when written). */
export function createRequestOf(d: HypothesisDraft): HypothesisCreateRequest {
  const note = d.note.replace(/\s+/g, " ").trim();
  return { claims: claimsOf(d.groups), maxShare: d.maxShare, ...(note ? { note } : {}) };
}

export const percent = (share: number) => `${Math.round(share * 100)}%`;

const box = "h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400";

/** Claim checkboxes; the last checked one cannot be unchecked (a scope allows at least one claim). */
export function ClaimPicker({ groups, onChange, testId }: { groups: string[]; onChange: (g: string[]) => void; testId?: string }) {
  const t = useT();
  return (
    <fieldset data-testid={testId}>
      <legend className="mb-1 text-xs font-medium text-slate-600">{t("hyp.claims")}</legend>
      <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
        {CLAIM_GROUPS.map((g) => {
          const on = groups.includes(g.key);
          return (
            <label key={g.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px] text-slate-700 coarse:min-h-11">
              <input
                type="checkbox"
                className={box}
                checked={on}
                disabled={on && groups.length === 1}
                data-claim={g.key}
                onChange={(e) => onChange(e.target.checked ? ALL_CLAIM_GROUPS.filter((k) => k === g.key || groups.includes(k)) : groups.filter((k) => k !== g.key))}
              />
              {t(g.label)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Share limit chips; `keep` adds a first chip that leaves the project's limit as it is (follow-ups). */
export function LimitPicker({ value, onChange, keep }: { value: number | null; onChange: (v: number | null) => void; keep?: number }) {
  const t = useT();
  const name = useId();
  const options: (number | null)[] = keep !== undefined ? [null, ...HYPOTHESIS_MAX_SHARES] : [...HYPOTHESIS_MAX_SHARES];
  return (
    <fieldset>
      <legend className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
        {t("hyp.limit")} <HelpTip text={t("hyp.limitHelp")} />
      </legend>
      <div role="radiogroup" aria-label={t("hyp.limit")} className="flex flex-wrap gap-1">
        {options.map((x) => {
          const on = value === x;
          return (
            <label
              key={x ?? "keep"}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 coarse:py-2 ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
            >
              <input type="radio" name={name} className="sr-only" checked={on} data-limit={x ?? "keep"} onChange={() => onChange(x)} />
              {x === null ? t("hyp.limitKeep", { limit: percent(keep ?? DEFAULT_HYPOTHESIS_MAX_SHARE) }) : percent(x)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Hypothesis mode of a new project: a checkbox on the composer (off = literature-supported only), with its help on
 * the "?" and, once on, the claims, the share limit and an optional note.
 */
export function HypothesisModeChoice({ value, onChange, disabled }: { value: HypothesisDraft | null; onChange: (v: HypothesisDraft | null) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="border-t border-slate-100 px-3 py-1.5" data-testid="hypothesis-mode">
      <div className="flex items-center gap-1.5">
        <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 coarse:min-h-11">
          <input
            type="checkbox"
            checked={!!value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? (value ?? defaultHypothesisDraft()) : null)}
            className="h-3.5 w-3.5 shrink-0 rounded text-amber-600"
            data-testid="hypothesis-mode-check"
          />
          <HypothesisMark size={13} />
          <span className="truncate">{t("hyp.badge")}</span>
        </label>
        <HelpTip text={t("hyp.modeHelp")} />
      </div>
      {value && (
        <div className="mt-1.5 space-y-2.5 rounded-lg bg-slate-50 px-2.5 py-2" data-testid="hypothesis-settings">
          <ClaimPicker groups={value.groups} onChange={(groups) => onChange({ ...value, groups })} testId="hypothesis-claims" />
          <LimitPicker value={value.maxShare} onChange={(maxShare) => onChange({ ...value, maxShare: maxShare ?? DEFAULT_HYPOTHESIS_MAX_SHARE })} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t("hyp.note")}</span>
            <input
              value={value.note}
              maxLength={HYPOTHESIS_NOTE_MAX}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              placeholder={t("hyp.notePh")}
              data-testid="hypothesis-note"
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
        </div>
      )}
    </div>
  );
}
