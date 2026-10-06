/**
 * Hypothesis mode, stage 3: the follow-up composer's switch "Allow hypotheses with this instruction" (off by default
 * and after every send). On, it picks the claims, the target (the whole HCD, or the circuits and GNs selected in the
 * graph viewer) and the share limit; the follow-up then carries a stage 2 `hypothesis` with a new scope.
 */
import { useInRouterContext, useLocation, useParams } from "react-router-dom";
import type { HypothesisFollowupRequest, HypothesisScopeTarget, ProjectRecord } from "@cobrac/shared";
import { normalizeMaxShare } from "@cobrac/shared";
import { useT } from "../../i18n";
import { HelpTip } from "../HelpTip";
import { ALL_CLAIM_GROUPS, ClaimPicker, LimitPicker, claimsOf } from "./HypothesisControls";
import { HypothesisMark } from "./HypothesisMark";

export interface FollowupHypothesisDraft {
  groups: string[];
  target: "all" | "selected";
  /** null: the project's limit stays */
  maxShare: number | null;
}

export const defaultFollowupDraft = (): FollowupHypothesisDraft => ({ groups: [...ALL_CLAIM_GROUPS], target: "all", maxShare: null });

/** Circuits and GNs selected in the graph viewer of the workspace (`?node=` on the HCD or FRG tab, `?gn=` on the HCD). */
export interface GraphSelection {
  circuitIds: string[];
  gnIds: string[];
}

export function graphSelectionOf(view: string | undefined, params: URLSearchParams): GraphSelection {
  const circuitIds: string[] = [];
  const gnIds: string[] = [];
  const node = params.get("node");
  if (view === "hcd") {
    // a UC or a Collection (Circuit IDs without `U.`) and the FRG group highlighted on the HCD
    if (node) circuitIds.push(node.replace(/^U\./, ""));
    const gn = params.get("gn");
    if (gn && /^R\.\S+$/.test(gn)) gnIds.push(gn);
  } else if (view === "frg" && node) {
    if (/^R\.\S+$/.test(node)) gnIds.push(node);
    else if (node.startsWith("U.")) circuitIds.push(node.slice(2));
  }
  return { circuitIds, gnIds };
}

const NO_SELECTION: GraphSelection = { circuitIds: [], gnIds: [] };

/**
 * The graph selection of the workspace; nothing outside a router (the panel rendered on its own). Whether there is a
 * router never changes while a component is mounted, so the hooks below run in the same order on every render.
 */
export function useGraphSelection(): GraphSelection {
  if (!useInRouterContext()) return NO_SELECTION;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { view } = useParams();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { search } = useLocation();
  return graphSelectionOf(view, new URLSearchParams(search));
}

const selectionSize = (s: GraphSelection) => s.circuitIds.length + s.gnIds.length;

/** `FollowupRequest.hypothesis` of a draft; null when the target is the graph selection and nothing is selected. */
export function followupRequestOf(d: FollowupHypothesisDraft, selection: GraphSelection): HypothesisFollowupRequest | null {
  let target: HypothesisScopeTarget = { kind: "all" };
  if (d.target === "selected") {
    if (!selectionSize(selection)) return null;
    target = { kind: "items", circuitIds: selection.circuitIds, gnIds: selection.gnIds };
  }
  return { claims: claimsOf(d.groups), target, ...(d.maxShare !== null ? { maxShare: d.maxShare } : {}) };
}

export function FollowupHypothesis({
  project,
  value,
  onChange,
  selection,
  disabled,
}: {
  project: Pick<ProjectRecord, "hypothesisMaxShare">;
  value: FollowupHypothesisDraft | null;
  onChange: (v: FollowupHypothesisDraft | null) => void;
  selection: GraphSelection;
  disabled?: boolean;
}) {
  const t = useT();
  const n = selectionSize(selection);
  const ids = [...selection.circuitIds, ...selection.gnIds].join(", ");
  return (
    <div className="border-t border-slate-100 px-3 py-1.5" data-testid="followup-hypothesis">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 coarse:min-h-11">
          <input type="checkbox" role="switch" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked ? defaultFollowupDraft() : null)} className="peer sr-only" data-testid="followup-hypothesis-switch" />
          <span className="relative h-4 w-7 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-amber-600 peer-checked:after:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-disabled:opacity-50 motion-reduce:after:transition-none" aria-hidden />
          <HypothesisMark size={13} />
          <span className="truncate">{t("hyp.followSwitch")}</span>
        </label>
        <HelpTip text={t("hyp.followHelp")} />
      </div>
      {value && (
        <div className="mt-1.5 max-h-64 space-y-2.5 overflow-y-auto pb-1" data-testid="followup-hypothesis-settings">
          <ClaimPicker groups={value.groups} onChange={(groups) => onChange({ ...value, groups })} testId="followup-hypothesis-claims" />
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-slate-600">{t("hyp.target")}</legend>
            <div role="radiogroup" aria-label={t("hyp.target")} className="space-y-0.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700 coarse:min-h-11">
                <input type="radio" name="fh-target" checked={value.target === "all"} onChange={() => onChange({ ...value, target: "all" })} data-testid="followup-target-all" />
                {t("hyp.targetAll")}
              </label>
              <label className={`flex items-start gap-2 text-[13px] coarse:min-h-11 ${n ? "cursor-pointer text-slate-700" : "cursor-not-allowed text-slate-400"}`}>
                <input type="radio" name="fh-target" className="mt-1" disabled={!n && value.target !== "selected"} checked={value.target === "selected"} onChange={() => onChange({ ...value, target: "selected" })} data-testid="followup-target-selected" />
                <span className="min-w-0 break-words">
                  {t("hyp.targetSelected")}
                  {n > 0 && <span className="ml-1 font-mono text-[11px] text-slate-500">({ids})</span>}
                </span>
              </label>
              {!n && <p className={`pl-6 text-[11px] ${value.target === "selected" ? "text-rose-600" : "text-slate-500"}`}>{t("hyp.targetNone")}</p>}
            </div>
          </fieldset>
          <LimitPicker value={value.maxShare} onChange={(maxShare) => onChange({ ...value, maxShare })} keep={normalizeMaxShare(project.hypothesisMaxShare)} />
        </div>
      )}
    </div>
  );
}
