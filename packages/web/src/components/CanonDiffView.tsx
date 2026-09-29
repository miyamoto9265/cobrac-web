import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { CanonChoice, CanonConflict, CanonDiff } from "@cobrac/shared";
import { useT, type MessageKey } from "../i18n";

const SEVERITY = {
  error: { Icon: AlertOctagon, cls: "border-rose-200 bg-rose-50", icon: "text-rose-600" },
  warning: { Icon: AlertTriangle, cls: "border-amber-200 bg-amber-50", icon: "text-amber-600" },
  info: { Icon: Info, cls: "border-slate-200 bg-slate-50", icon: "text-slate-500" },
} as const;

export function DiffSummary({ diff }: { diff: CanonDiff }) {
  const t = useT();
  const s = diff.summary;
  const chip = "rounded px-1.5 py-0.5 font-mono";
  return (
    <div className="flex flex-wrap gap-1.5 text-xs" data-testid="diff-summary">
      <span className={`${chip} bg-emerald-50 text-emerald-700`}>{t("pr.added", { n: s.added })}</span>
      <span className={`${chip} bg-blue-50 text-blue-700`}>{t("pr.changed", { n: s.changed })}</span>
      <span className={`${chip} bg-slate-100 text-slate-600`}>{t("pr.unchanged", { n: s.unchanged })}</span>
      {s.dropped > 0 && <span className={`${chip} bg-slate-100 text-slate-600`}>{t("pr.dropped", { n: s.dropped })}</span>}
      <span className={`${chip} ${s.errors ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{t("pr.errors", { n: s.errors })}</span>
      <span className={`${chip} ${s.warnings ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{t("pr.warnings", { n: s.warnings })}</span>
    </div>
  );
}

/**
 * Conflicts of a diff. With `onChoose`, each warning and each resolvable error gets its choice buttons
 * (keep the Canon's value / take the incoming one); plain errors only explain what to fix in the project.
 */
export function ConflictList({
  conflicts,
  choices,
  onChoose,
  sourceLabel,
}: {
  conflicts: CanonConflict[];
  choices?: Record<string, CanonChoice>;
  onChoose?: (id: string, c: CanonChoice) => void;
  sourceLabel: string;
}) {
  const t = useT();
  if (!conflicts.length) return <div className="text-sm text-emerald-700">{t("pr.noConflicts")}</div>;
  const order = { error: 0, warning: 1, info: 2 } as const;
  return (
    <ul className="grid gap-2" data-testid="conflict-list">
      {[...conflicts]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((c) => {
          const { Icon, cls, icon } = SEVERITY[c.severity];
          const canChoose = !!onChoose && (c.severity === "warning" || (c.severity === "error" && c.resolvable));
          const onlyIncoming = c.severity === "error";
          return (
            <li key={c.id} className={`rounded-lg border p-3 text-sm ${cls}`}>
              <div className="flex items-start gap-2">
                <Icon size={16} className={`mt-0.5 shrink-0 ${icon}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    <span className="mr-1 font-mono text-xs">{c.code}</span> {t(`cc.${c.code}` as MessageKey)}
                  </div>
                  <div className="break-all font-mono text-[11px] text-slate-600">
                    {c.key}
                    {c.field ? ` · ${c.field}` : ""}
                  </div>
                  {(c.canon !== undefined || c.incoming !== undefined) && (
                    <dl className="mt-1 grid gap-0.5 text-xs">
                      {c.canon !== undefined && (
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-500">Canon</dt>
                          <dd className="min-w-0 break-words">{c.canon || "—"}</dd>
                        </div>
                      )}
                      {c.incoming !== undefined && (
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-500">{sourceLabel}</dt>
                          <dd className="min-w-0 break-words">{c.incoming || "—"}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {c.severity === "error" && !c.resolvable && <div className="mt-1 text-xs text-rose-700">{t("pr.fixInProject")}</div>}
                  {canChoose && (
                    <div className="mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:gap-4">
                      {!onlyIncoming && (
                        <label className="flex items-center gap-1.5 coarse:min-h-11">
                          <input type="radio" name={c.id} checked={choices?.[c.id] === "canon"} onChange={() => onChoose!(c.id, "canon")} />
                          {t("pr.keepCanon")}
                        </label>
                      )}
                      <label className="flex items-center gap-1.5 coarse:min-h-11">
                        <input type={onlyIncoming ? "checkbox" : "radio"} name={c.id} checked={choices?.[c.id] === "incoming"} onChange={(e) => (onlyIncoming && !e.target.checked ? onChoose!(c.id, "canon") : onChoose!(c.id, "incoming"))} />
                        {onlyIncoming ? t("pr.adoptIncoming") : t("pr.takeIncoming")}
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
    </ul>
  );
}

export function DiffItems({ diff }: { diff: CanonDiff }) {
  const t = useT();
  const shown = diff.items.filter((i) => i.change !== "unchanged");
  if (!shown.length) return <div className="text-sm text-slate-400">{t("pr.noChanges")}</div>;
  const badge = { added: "bg-emerald-100 text-emerald-800", changed: "bg-blue-100 text-blue-800", dropped: "bg-slate-200 text-slate-700", unchanged: "" } as const;
  return (
    <ul className="divide-y divide-slate-100 text-xs" data-testid="diff-items">
      {shown.map((i) => (
        <li key={`${i.kind}:${i.key}`} className="py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${badge[i.change]}`}>{t(`pr.change.${i.change}` as MessageKey)}</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">{t(`pr.kind.${i.kind}` as MessageKey)}</span>
            <span className="min-w-0 break-all font-mono">{i.label}</span>
          </div>
          {i.fields?.map((f) => (
            <div key={f.field} className="ml-2 mt-0.5 break-words text-slate-600">
              <span className="font-mono">{f.field}</span>: {f.from || "—"} → {f.to || "—"}
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
