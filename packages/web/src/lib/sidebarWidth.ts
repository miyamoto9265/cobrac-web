import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** The desktop sidebar's width in px: dragged by its right edge, remembered in this browser. The mobile drawer keeps its own width. */
export const SIDEBAR_WIDTH = { min: 208, default: 256, max: 480 } as const;
export const SIDEBAR_WIDTH_STORAGE = "cobrac-sidebar-width";
/** one arrow-key press; with Shift, four */
const STEP = 16;

export function clampSidebarWidth(w: number): number {
  if (!Number.isFinite(w)) return SIDEBAR_WIDTH.default;
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, w)));
}

export function readSidebarWidth(): number {
  try {
    const v = localStorage.getItem(SIDEBAR_WIDTH_STORAGE);
    return v === null ? SIDEBAR_WIDTH.default : clampSidebarWidth(Number(v));
  } catch {
    return SIDEBAR_WIDTH.default;
  }
}

function storeSidebarWidth(w: number) {
  try {
    if (w === SIDEBAR_WIDTH.default) localStorage.removeItem(SIDEBAR_WIDTH_STORAGE);
    else localStorage.setItem(SIDEBAR_WIDTH_STORAGE, String(w));
  } catch {
    /* private mode: the width lasts for this visit */
  }
}

/** Width for a key on the resize handle, or null for a key it does not handle. */
export function sidebarWidthForKey(w: number, key: string, shift = false): number | null {
  const step = shift ? STEP * 4 : STEP;
  if (key === "ArrowLeft") return clampSidebarWidth(w - step);
  if (key === "ArrowRight") return clampSidebarWidth(w + step);
  if (key === "Home") return SIDEBAR_WIDTH.min;
  if (key === "End") return SIDEBAR_WIDTH.max;
  if (key === "Enter") return SIDEBAR_WIDTH.default;
  return null;
}

/** State and handlers for the sidebar's resize handle (a vertical separator on its right edge). */
export function useSidebarWidth() {
  const [width, setWidth] = useState(readSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);

  const commit = useCallback((w: number) => {
    setWidth(w);
    storeSidebarWidth(w);
  }, []);

  // while dragging, the whole page shows the resize cursor and text is not selected
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, w: width };
      setDragging(true);
    },
    [width],
  );
  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!start.current) return;
    setWidth(clampSidebarWidth(start.current.w + e.clientX - start.current.x));
  }, []);
  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      start.current = null;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      setWidth((w) => {
        storeSidebarWidth(w);
        return w;
      });
    },
    [],
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const next = sidebarWidthForKey(width, e.key, e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      commit(next);
    },
    [width, commit],
  );
  // a double click goes back to the standard width
  const onDoubleClick = useCallback(() => commit(SIDEBAR_WIDTH.default), [commit]);

  return {
    width,
    dragging,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown, onDoubleClick },
  };
}
