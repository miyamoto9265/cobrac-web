import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { BELOW_SM, useMediaQuery } from "../../lib/useMediaQuery";

/**
 * A button that opens a panel: anchored under (or over) the button on wider screens, a bottom sheet on phones.
 * Escape, a click outside or the sheet's backdrop closes it and focus returns to the button.
 */
export function Popover({
  trigger,
  title,
  children,
  align = "start",
  side = "bottom",
  width = "w-80",
  testId,
  disabled,
  minSpace = 320,
}: {
  /** Contents of the trigger button. `label` is its accessible name when the contents are not text alone. */
  trigger: { content: ReactNode; label: string; className: string };
  title: string;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  width?: string;
  testId?: string;
  disabled?: boolean;
  /** Free height (px) the preferred side needs before the panel flips to the other side */
  minSpace?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(side === "top");
  const [maxH, setMaxH] = useState<number>();
  const sheet = useMediaQuery(BELOW_SM);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    const first =
      p?.querySelector<HTMLElement>("[data-autofocus]") ??
      p?.querySelector<HTMLElement>("input:checked") ??
      p?.querySelector<HTMLElement>("input:not([type=hidden]), button:not([data-helptip]), [href]");
    first?.focus({ preventScroll: sheet });
    const onKey = (e: KeyboardEvent) => {
      // a HelpTip inside the panel closes first
      if (e.key === "Escape" && !document.querySelector("[role=tooltip]:not([hidden])")) close();
    };
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!panel.current?.contains(n) && !btn.current?.contains(n) && !(n as Element).closest?.("[role=tooltip]")) close(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, sheet]);

  const place = sheet
    ? "fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    : `absolute z-50 ${width} max-w-[calc(100vw-2rem)] rounded-xl ${up ? "bottom-full mb-2" : "top-full mt-2"} ${align === "start" ? "left-0" : "right-0"}`;

  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={trigger.label}
        title={trigger.label}
        data-testid={testId}
        onClick={() => {
          if (open) return close();
          // open towards the larger free space when the preferred side is short
          const r = btn.current?.getBoundingClientRect();
          const below = r ? window.innerHeight - r.bottom : Infinity;
          const above = r ? r.top : 0;
          const goUp = side === "top" ? above >= minSpace || above > below : below < minSpace && above > below;
          setUp(goUp);
          setMaxH(Math.min(448, Math.max(200, (goUp ? above : below) - 16)));
          setOpen(true);
        }}
        className={trigger.className}
      >
        {trigger.content}
      </button>
      {open && sheet && <div className="fixed inset-0 z-40 bg-slate-900/30" aria-hidden onClick={() => close(false)} />}
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={title}
          data-testid={testId ? `${testId}-panel` : undefined}
          style={sheet ? undefined : { maxHeight: maxH }}
          className={`${place} flex flex-col overflow-hidden border border-slate-200 bg-white text-left shadow-xl animate-step-in`}
        >
          {sheet && (
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2">
              <span className="text-sm font-semibold text-slate-700">{title}</span>
              <button type="button" onClick={() => close()} aria-label={t("close")} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
          )}
          <div className="min-h-0 overflow-y-auto">{children(() => close())}</div>
        </div>
      )}
    </div>
  );
}

/** Small uppercase heading inside a popover. */
export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</div>;
}
