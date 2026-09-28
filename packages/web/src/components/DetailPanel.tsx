import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n";

export function DetailPanel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <aside
      className={
        "flex flex-col border-slate-200 bg-white " +
        // < lg: bottom sheet over the graph (full width on phones, floating card on tablets)
        "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[60dvh] max-lg:rounded-t-2xl max-lg:border-t max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-2xl " +
        "md:max-lg:bottom-3 md:max-lg:left-auto md:max-lg:right-3 md:max-lg:max-h-[70dvh] md:max-lg:w-[26rem] md:max-lg:rounded-2xl md:max-lg:border " +
        "lg:w-[26rem] lg:shrink-0 lg:border-l"
      }
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
        </div>
        <button onClick={onClose} aria-label={t("close")} title={t("close")} className="flex shrink-0 items-center justify-center rounded p-1 text-slate-500 hover:bg-slate-100 coarse:-my-2 coarse:-mr-2 coarse:h-11 coarse:w-11">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">{children}</div>
    </aside>
  );
}

export function Field({ label, value, mono = false }: { label: string; value: string | string[] | null | undefined; mono?: boolean }) {
  const v = Array.isArray(value) ? value.join("; ") : value;
  if (!v) return null;
  return (
    <div className="mb-3">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`whitespace-pre-wrap break-words leading-relaxed text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{v}</div>
    </div>
  );
}

export function Section({ title }: { title: string }) {
  return <div className="mb-2 mt-4 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-700">{title}</div>;
}
