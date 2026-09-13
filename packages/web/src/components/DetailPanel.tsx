import { X } from "lucide-react";
import type { ReactNode } from "react";

export function DetailPanel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="flex w-[26rem] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
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
