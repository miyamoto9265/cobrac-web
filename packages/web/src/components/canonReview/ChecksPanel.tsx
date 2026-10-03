import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useState } from "react";
import type { CanonChoice, CanonConflict, ReviewCheck, ReviewGroup, ReviewReport } from "@cobrac/shared";
import { REVIEW_GROUPS } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { ConflictList } from "../CanonDiffView";
import { HelpTip } from "../HelpTip";

const ICON = {
  error: { Icon: AlertOctagon, cls: "text-rose-600" },
  warning: { Icon: AlertTriangle, cls: "text-amber-600" },
  info: { Icon: Info, cls: "text-slate-400" },
} as const;

/** Label of a check code: the conflict rules keep their existing texts. */
export const checkLabelKey = (code: string): MessageKey => (/^C\d/.test(code) ? `cc.${code}` : `rc.${code}`) as MessageKey;

export function CheckRow({ check, labelOf, onSelect, current, compact = false }: { check: ReviewCheck; labelOf: (id: string) => string; onSelect: (id: string) => void; current?: string; compact?: boolean }) {
  const t = useT();
  const { Icon, cls } = ICON[check.severity];
  const links = [check.item, ...check.related].filter((x): x is string => !!x && x !== current);
  return (
    <li className={`flex items-start gap-2 text-xs ${compact ? "" : "py-1.5"}`} data-check={check.id}>
      <Icon size={14} className={`mt-0.5 shrink-0 ${cls}`} aria-label={t(`rv.sev.${check.severity}` as MessageKey)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span className="font-medium">{t(checkLabelKey(check.code))}</span>
          {check.master && <span className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">{check.master}</span>}
        </div>
        {(check.canon || check.incoming) && (
          <div className="break-words text-[11px] text-slate-600">
            {check.canon && (
              <span>
                <span className="text-slate-400">{t("rv.canonSide")}:</span> {check.canon}
              </span>
            )}
            {check.canon && check.incoming && <span className="text-slate-300"> · </span>}
            {check.incoming && (
              <span>
                <span className="text-slate-400">{t("pr.incoming")}:</span> {check.incoming}
              </span>
            )}
          </div>
        )}
        {check.detail && <div className="break-words font-mono text-[10px] text-slate-500">{check.detail}</div>}
        {links.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {links.map((id) => (
              <button key={id} type="button" onClick={() => onSelect(id)} className="max-w-full truncate rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 hover:bg-blue-50 coarse:min-h-9">
                {labelOf(id)}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function GroupCard({ group, checks, labelOf, onSelect }: { group: ReviewGroup; checks: ReviewCheck[]; labelOf: (id: string) => string; onSelect: (id: string) => void }) {
  const t = useT();
  const [showInfo, setShowInfo] = useState(false);
  const errs = checks.filter((c) => c.severity === "error").length;
  const warns = checks.filter((c) => c.severity === "warning").length;
  const infos = checks.filter((c) => c.severity === "info");
  const shown = checks.filter((c) => c.severity !== "info" || showInfo);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-testid={`check-group-${group}`}>
      <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
        {t(`rv.group.${group}` as MessageKey)} <HelpTip text={t(`rv.groupHelp.${group}` as MessageKey)} />
        {checks.length === 0 ? (
          <span className="flex items-center gap-0.5 text-xs font-normal text-emerald-700">
            <CheckCircle2 size={13} /> {t("rv.noFindings")}
          </span>
        ) : (
          <span className="flex gap-1 text-[11px] font-normal">
            {errs > 0 && <span className="rounded bg-rose-100 px-1.5 text-rose-700">{t("pr.errors", { n: errs })}</span>}
            {warns > 0 && <span className="rounded bg-amber-100 px-1.5 text-amber-800">{t("pr.warnings", { n: warns })}</span>}
            {infos.length > 0 && <span className="rounded bg-slate-100 px-1.5 text-slate-600">{t("rv.infos", { n: infos.length })}</span>}
          </span>
        )}
      </h3>
      {shown.length > 0 && (
        <ul className="mt-1 divide-y divide-slate-100">
          {shown.map((c) => (
            <CheckRow key={c.id} check={c} labelOf={labelOf} onSelect={onSelect} />
          ))}
        </ul>
      )}
      {infos.length > 0 && (
        <button type="button" onClick={() => setShowInfo((v) => !v)} className="mt-1 text-xs text-blue-700 hover:underline coarse:min-h-10">
          {showInfo ? t("rv.hideInfo") : t("rv.showInfo", { n: infos.length })}
        </button>
      )}
    </section>
  );
}

interface Props {
  report: ReviewReport;
  conflicts: CanonConflict[];
  choices: Record<string, CanonChoice>;
  onChoose?: (id: string, c: CanonChoice) => void;
  labelOf: (id: string) => string;
  onSelect: (id: string) => void;
}

/** Conflicts to decide (they block approval), then every system check by group. */
export function ChecksPanel({ report, conflicts, choices, onChoose, labelOf, onSelect }: Props) {
  const t = useT();
  const extra = report.checks.filter((c) => !c.conflictId);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="checks-panel">
      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          {t("rv.decide")} <HelpTip text={t("rv.decideHelp")} />
        </h3>
        <ConflictList conflicts={conflicts} choices={choices} onChoose={onChoose} sourceLabel={t("pr.incoming")} />
      </section>
      <div className="flex items-center gap-1 text-xs text-slate-500">
        {t("rv.masterNote")} <HelpTip text={t("rv.masterHelp")} />
      </div>
      {REVIEW_GROUPS.map((g) => (
        <GroupCard key={g} group={g} checks={extra.filter((c) => c.group === g)} labelOf={labelOf} onSelect={onSelect} />
      ))}
    </div>
  );
}
