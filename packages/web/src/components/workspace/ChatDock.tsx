import { MessageSquare, PanelRightClose, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { useMediaQuery } from "../../lib/useMediaQuery";

/** At xl the chat is docked beside the artifacts; below it opens as an overlay (bottom sheet on phones, right drawer on tablets). */
export const CHAT_DOCKED = "(min-width: 1280px)";

const WIDTH_KEY = "cobrac-chat-width";
const OPEN_KEY = "cobrac-chat-open";
const MIN_WIDTH = 300;
const DEFAULT_WIDTH = 380;
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(760, Math.round(window.innerWidth * 0.55)));
const clamp = (w: number) => Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(w)));

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export interface ChatDockState {
  docked: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Docked open/closed is remembered across projects; the overlay always starts closed. */
export function useChatDock(): ChatDockState {
  const docked = useMediaQuery(CHAT_DOCKED);
  const [dockOpen, setDockOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const setOpen = (v: boolean) => {
    if (docked) {
      setDockOpen(v);
      store(OPEN_KEY, v ? "1" : "0");
    } else setSheetOpen(v);
  };
  return { docked, open: docked ? dockOpen : sheetOpen, setOpen };
}

/** Opens the overlay chat below xl; lives at the end of the workspace tab bar. */
export function ChatToggleButton({ state, attention }: { state: ChatDockState; attention: boolean }) {
  const t = useT();
  if (state.docked) return null;
  return (
    <button
      type="button"
      data-testid="chat-toggle"
      onClick={() => state.setOpen(!state.open)}
      aria-label={state.open ? t("ws.closeChat") : t("ws.openChat")}
      aria-expanded={state.open}
      className="relative mb-1 flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 coarse:min-h-11"
    >
      <MessageSquare size={14} /> {t("ws.chat")}
      {attention && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden />}
    </button>
  );
}

/**
 * Right-hand chat container. Children stay mounted while closed so a draft follow-up and the scroll position survive toggling.
 * `attention` marks the toggle when the agent is waiting for an answer.
 */
export function ChatDock({ state, attention, children }: { state: ChatDockState; attention: boolean; children: ReactNode }) {
  const t = useT();
  const { docked, open, setOpen } = state;
  const [width, setWidth] = useState(() => clamp(readNumber(WIDTH_KEY, DEFAULT_WIDTH)));
  const drag = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    if (docked || !open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docked, open, setOpen]);

  useEffect(() => {
    if (!docked) return;
    const onResize = () => setWidth((w) => clamp(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [docked]);

  const resizeTo = (w: number) => {
    const next = clamp(w);
    setWidth(next);
    store(WIDTH_KEY, String(next));
  };

  const dot = attention && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden />;

  const panelCls = docked
    ? open
      ? "relative flex shrink-0 flex-col border-l border-slate-200 bg-white"
      : "hidden"
    : `fixed z-40 flex flex-col bg-white shadow-2xl transition-[transform,visibility] duration-200 inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[26rem] sm:max-w-[90vw] sm:rounded-none ${
        open ? "translate-x-0 translate-y-0" : "invisible translate-y-full sm:translate-x-full sm:translate-y-0"
      }`;

  return (
    <>
      {docked && !open && (
        <div className="flex w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-2">
          <button
            type="button"
            data-testid="chat-toggle"
            onClick={() => setOpen(true)}
            aria-label={t("ws.openChat")}
            title={t("ws.openChat")}
            className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
          >
            <MessageSquare size={18} />
            {dot}
          </button>
          <span className="mt-2 text-xs text-slate-500 [writing-mode:vertical-rl]">{t("ws.chat")}</span>
        </div>
      )}
      {!docked && open && <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={panelCls} style={docked && open ? { width } : undefined} aria-label={t("ws.chat")} aria-hidden={!open}>
        {docked && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("ws.resizeChat")}
            aria-valuenow={width}
            aria-valuemin={MIN_WIDTH}
            title={t("ws.resizeChat")}
            tabIndex={0}
            data-testid="chat-resize"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, w: width };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => drag.current && setWidth(clamp(drag.current.w + drag.current.x - e.clientX))}
            onPointerUp={(e) => {
              if (drag.current) resizeTo(drag.current.w + drag.current.x - e.clientX);
              drag.current = null;
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") resizeTo(width + 24);
              else if (e.key === "ArrowRight") resizeTo(width - 24);
            }}
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-blue-400/40 focus:bg-blue-400/40 focus:outline-none"
          />
        )}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-1.5">
          {!docked && <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300 sm:hidden" aria-hidden />}
          <MessageSquare size={15} className="text-slate-500" />
          <span className="flex-1 text-sm font-semibold">{t("ws.chat")}</span>
          <button
            type="button"
            data-testid="chat-toggle"
            onClick={() => setOpen(false)}
            aria-label={t("ws.closeChat")}
            title={t("ws.closeChat")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 coarse:h-11 coarse:w-11"
          >
            {docked ? <PanelRightClose size={17} /> : <X size={18} />}
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </aside>
    </>
  );
}
