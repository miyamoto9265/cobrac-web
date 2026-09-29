import { Check, Loader2, MoreHorizontal, Search, TriangleAlert, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import type { GNode } from "./BoxNode";

export const toolBtn =
  "inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:h-11 coarse:min-w-11";

export function ToolButton({ label, onClick, disabled, active, children, showLabel = false }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode; showLabel?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active} className={`${toolBtn} ${active ? "!bg-blue-600 !text-white hover:!bg-blue-700" : ""}`}>
      {children}
      {showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

export const ToolDivider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchProps {
  query: string;
  onQuery: (q: string) => void;
  hits: GNode[];
  onPick: (id: string) => void;
}

export const SearchBox = forwardRef<HTMLInputElement, SearchProps>(function SearchBox({ query, onQuery, hits, onPick }, ref) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => setActive(0), [query]);
  const show = open && query.trim() !== "";
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-72">
      <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            pick(hits[active].id);
          } else if (e.key === "Escape") {
            if (query) onQuery("");
            else (e.target as HTMLInputElement).blur();
            setOpen(false);
          }
        }}
        placeholder={t("graph.search")}
        aria-label={t("graph.search")}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show && hits[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="h-8 w-full rounded-md border border-slate-300 bg-white pl-7 pr-7 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 coarse:h-11"
      />
      {query && (
        <button type="button" onClick={() => onQuery("")} aria-label={t("graph.clearSearch")} title={t("graph.clearSearch")} className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 coarse:h-9 coarse:w-9">
          <X size={13} />
        </button>
      )}
      {show && (
        <ul id={listId} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full min-w-60 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg">
          {hits.length === 0 && <li className="px-3 py-2 text-slate-500">{t("graph.noHits")}</li>}
          {hits.map((n, i) => (
            <li
              key={n.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(n.id)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 coarse:py-2.5 ${i === active ? "bg-blue-50" : ""}`}
            >
              <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: n.accent ?? n.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono font-semibold text-slate-900">{n.label}</span>
                {n.sublabel && <span className="block truncate text-[11px] text-slate-500">{n.sublabel}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Overflow menu
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** draw a separator above this item */
  separator?: boolean;
}

export function OverflowMenu({ items }: { items: MenuItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={t("graph.more")} title={t("graph.more")} className={`${toolBtn} ${open ? "bg-slate-100" : ""}`}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-60 rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg">
          {items.map((it) => (
            <div key={it.label}>
              {it.separator && <div className="my-1 border-t border-slate-100" />}
              <button
                type="button"
                role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={it.checked}
                disabled={it.disabled}
                onClick={() => {
                  it.onClick();
                  if (it.checked === undefined) setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40 coarse:py-3 ${it.danger ? "text-rose-700" : "text-slate-700"}`}
              >
                <span className="flex w-4 shrink-0 justify-center text-slate-500">{it.checked !== undefined ? it.checked && <Check size={14} className="text-blue-600" /> : it.icon}</span>
                <span className="flex-1">{it.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save status
// ---------------------------------------------------------------------------

export function SaveStatus({ saving, compact }: { saving: "idle" | "saving" | "saved" | "error"; compact: boolean }) {
  const t = useT();
  if (saving === "idle") return null;
  const map = {
    saving: { icon: <Loader2 size={13} className="animate-spin" />, text: t("graph.saving"), cls: "text-slate-500" },
    saved: { icon: <Check size={13} />, text: t("graph.saved"), cls: "text-emerald-700" },
    error: { icon: <TriangleAlert size={13} />, text: t("graph.saveFail"), cls: "text-rose-700" },
  }[saving];
  return (
    <span role="status" className={`flex shrink-0 items-center gap-1 px-1 text-[11px] ${map.cls}`} title={map.text}>
      {map.icon}
      {!compact && map.text}
    </span>
  );
}
