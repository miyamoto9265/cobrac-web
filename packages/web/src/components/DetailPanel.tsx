import { X } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { inkOn, nodeFill } from "../lib/graphTheme";
import { useDark } from "../lib/theme";

/** Where the graph viewer puts the panel: a column beside the canvas, or a sheet over its lower part. */
export type DetailPanelMode = "side" | "sheet";
export const DetailPanelModeContext = createContext<DetailPanelMode>("side");

export function DetailPanel({
  title,
  subtitle,
  onClose,
  badges,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  badges?: ReactNode;
  /** primary navigation (e.g. open in the other graph), shown under the title */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const mode = useContext(DetailPanelModeContext);
  const [expanded, setExpanded] = useState(false);
  const sheet = mode === "sheet";
  return (
    <aside
      aria-label={title}
      className={`flex min-h-0 flex-col bg-white ${sheet ? `rounded-t-2xl border-t border-slate-200 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.18)] ${expanded ? "h-[85cqh]" : "max-h-[46cqh]"}` : "h-full"}`}
    >
      {sheet && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? t("graph.sheetCollapse") : t("graph.sheetExpand")} aria-expanded={expanded} className="flex h-5 w-full shrink-0 items-center justify-center coarse:h-7">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </button>
      )}
      <div className={`shrink-0 border-b border-slate-200 px-4 ${sheet ? "pb-2.5" : "py-3"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="break-all font-mono text-sm font-semibold text-slate-900">{title}</h2>
            {subtitle && <div className="break-words text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label={t("close")} title={t("close")} className="flex shrink-0 items-center justify-center rounded p-1 text-slate-500 hover:bg-slate-100 coarse:-my-2 coarse:-mr-2 coarse:h-11 coarse:w-11">
            <X size={16} />
          </button>
        </div>
        {badges && <div className="mt-2 flex flex-wrap gap-1">{badges}</div>}
        {actions && <div className="mt-2.5 flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-sm">{children}</div>
    </aside>
  );
}

export function Field({ label, value, mono = false }: { label: string; value: string | string[] | null | undefined; mono?: boolean }) {
  const v = Array.isArray(value) ? value.join("; ") : value;
  if (!v || /^(-|n\/a)$/i.test(v.trim())) return null;
  return (
    <div className="mb-3">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`whitespace-pre-wrap break-words leading-relaxed text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{v}</div>
    </div>
  );
}

export function Section({ title }: { title: string }) {
  return <h3 className="mb-2 mt-4 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-700 first:mt-0">{title}</h3>;
}

export function Badge({ children, color, text = "#334155" }: { children: ReactNode; color: string; text?: string }) {
  const dark = useDark();
  const fill = nodeFill(color, dark);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-black/5 px-2 py-0.5 text-[10.5px] font-medium dark:border-white/10" style={{ background: fill, color: dark ? inkOn(fill) : text }}>
      {children}
    </span>
  );
}

export const actionBtn =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 coarse:min-h-11 coarse:px-3";
export const primaryActionBtn =
  "inline-flex items-center gap-1 rounded-md border border-blue-600 bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 coarse:min-h-11 coarse:px-3";
