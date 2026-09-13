import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdgeStyle, GraphLayout, NodeStyle } from "@cobrac/shared";
import { api } from "./api";

export type Positions = GraphLayout["positions"];
export type XY = { x: number; y: number };

/** Layout without the server timestamp; this is what we edit and diff. */
export interface LayoutState {
  positions: Positions;
  nodes: Record<string, NodeStyle>;
  edges: Record<string, EdgeStyle>;
}

const EMPTY: LayoutState = { positions: {}, nodes: {}, edges: {} };
const HISTORY_LIMIT = 100;

function normalize(l: Partial<GraphLayout> | null | undefined): LayoutState {
  return { positions: l?.positions ?? {}, nodes: l?.nodes ?? {}, edges: l?.edges ?? {} };
}

function isEmpty(l: LayoutState) {
  return Object.keys(l.positions).length === 0 && Object.keys(l.nodes).length === 0 && Object.keys(l.edges).length === 0;
}

/**
 * Loads the user's graph arrangement (positions, node sizes/colours, edge styles) and persists
 * changes with a debounce. Keeps an undo/redo history of committed changes.
 */
export function useGraphLayout(projectId: string, kind: "hcd" | "frg") {
  const [layout, setLayout] = useState<LayoutState | null>(null); // null = not loaded yet
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [histLen, setHistLen] = useState({ undo: 0, redo: 0 });
  const undoStack = useRef<LayoutState[]>([]);
  const redoStack = useRef<LayoutState[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<LayoutState>(EMPTY);

  useEffect(() => {
    let alive = true;
    setLayout(null);
    undoStack.current = [];
    redoStack.current = [];
    setHistLen({ undo: 0, redo: 0 });
    api
      .getLayout(projectId, kind)
      .then((l) => {
        if (!alive) return;
        const s = normalize(l);
        latest.current = s;
        setLayout(s);
      })
      .catch(() => {
        if (!alive) return;
        latest.current = EMPTY;
        setLayout(EMPTY);
      });
    return () => {
      alive = false;
    };
  }, [projectId, kind]);

  const flush = useCallback(
    async (s: LayoutState) => {
      setSaving("saving");
      try {
        await api.saveLayout(projectId, kind, s);
        setSaving("saved");
        setTimeout(() => setSaving((x) => (x === "saved" ? "idle" : x)), 1500);
      } catch {
        setSaving("error");
      }
    },
    [projectId, kind],
  );

  const scheduleSave = useCallback(
    (s: LayoutState) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(s), 600);
    },
    [flush],
  );

  /** Apply a committed change (recorded in history and saved). */
  const commit = useCallback(
    (fn: (prev: LayoutState) => LayoutState) => {
      const prev = latest.current;
      const next = fn(prev);
      if (next === prev) return;
      undoStack.current.push(prev);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
      setHistLen({ undo: undoStack.current.length, redo: 0 });
      latest.current = next;
      setLayout(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const move = useCallback((moved: Positions) => commit((p) => ({ ...p, positions: { ...p.positions, ...moved } })), [commit]);

  const setNodeStyle = useCallback(
    (id: string, patch: NodeStyle | null) =>
      commit((p) => {
        const nodes = { ...p.nodes };
        if (patch === null) delete nodes[id];
        else {
          const merged: NodeStyle = { ...nodes[id], ...patch };
          for (const k of Object.keys(merged) as (keyof NodeStyle)[]) if (merged[k] === undefined) delete merged[k];
          if (Object.keys(merged).length === 0) delete nodes[id];
          else nodes[id] = merged;
        }
        return { ...p, nodes };
      }),
    [commit],
  );

  const setEdgeStyle = useCallback(
    (id: string, patch: EdgeStyle | null) =>
      commit((p) => {
        const edges = { ...p.edges };
        if (patch === null) delete edges[id];
        else {
          const merged: EdgeStyle = { ...edges[id], ...patch };
          // undefined values mean "remove override"
          for (const k of Object.keys(merged) as (keyof EdgeStyle)[]) if (merged[k] === undefined) delete merged[k];
          if (Object.keys(merged).length === 0) delete edges[id];
          else edges[id] = merged;
        }
        return { ...p, edges };
      }),
    [commit],
  );

  /** Apply the same patch to many edges at once (one history entry). */
  const setEdgeStyles = useCallback(
    (ids: string[], patch: EdgeStyle) =>
      commit((p) => {
        const edges = { ...p.edges };
        for (const id of ids) {
          const merged: EdgeStyle = { ...edges[id], ...patch };
          for (const k of Object.keys(merged) as (keyof EdgeStyle)[]) if (merged[k] === undefined) delete merged[k];
          edges[id] = merged;
        }
        return { ...p, edges };
      }),
    [commit],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(latest.current);
    latest.current = prev;
    setLayout(prev);
    setHistLen({ undo: undoStack.current.length, redo: redoStack.current.length });
    scheduleSave(prev);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(latest.current);
    latest.current = next;
    setLayout(next);
    setHistLen({ undo: undoStack.current.length, redo: redoStack.current.length });
    scheduleSave(next);
  }, [scheduleSave]);

  /** Discard everything (positions, sizes, edge styles). */
  const reset = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setSaving("saving");
    try {
      await api.resetLayout(projectId, kind);
      undoStack.current.push(latest.current);
      redoStack.current = [];
      setHistLen({ undo: undoStack.current.length, redo: 0 });
      latest.current = EMPTY;
      setLayout(EMPTY);
      setSaving("idle");
    } catch {
      setSaving("error");
    }
  }, [projectId, kind]);

  /** Forget positions only (re-run automatic layout) but keep styles. */
  const resetPositions = useCallback(() => commit((p) => ({ ...p, positions: {} })), [commit]);

  const hasCustom = useMemo(() => !!layout && !isEmpty(layout), [layout]);

  return {
    layout,
    saving,
    hasCustom,
    canUndo: histLen.undo > 0,
    canRedo: histLen.redo > 0,
    move,
    setNodeStyle,
    setEdgeStyle,
    setEdgeStyles,
    undo,
    redo,
    reset,
    resetPositions,
  };
}

export type GraphLayoutController = ReturnType<typeof useGraphLayout>;
