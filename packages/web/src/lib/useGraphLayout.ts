import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphLayout } from "@cobrac/shared";
import { api } from "./api";

export type Positions = GraphLayout["positions"];

/**
 * Loads the user's saved node positions for a graph and persists changes (debounced).
 * Positions are keyed by node id so they survive re-generation of the graph.
 */
export function useGraphLayout(projectId: string, kind: "hcd" | "frg") {
  const [saved, setSaved] = useState<Positions | null>(null); // null = not loaded yet
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef<Positions>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setSaved(null);
    api
      .getLayout(projectId, kind)
      .then((l) => alive && setSaved(l.positions ?? {}))
      .catch(() => alive && setSaved({}));
    return () => {
      alive = false;
    };
  }, [projectId, kind]);

  const flush = useCallback(
    async (all: Positions) => {
      setSaving("saving");
      try {
        await api.saveLayout(projectId, kind, all);
        setSaving("saved");
        setTimeout(() => setSaving((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaving("error");
      }
    },
    [projectId, kind],
  );

  /** Merge moved nodes into the saved layout and schedule a PUT. */
  const update = useCallback(
    (moved: Positions) => {
      pending.current = { ...pending.current, ...moved };
      setSaved((prev) => {
        const next = { ...(prev ?? {}), ...moved };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          pending.current = {};
          void flush(next);
        }, 600);
        return next;
      });
    },
    [flush],
  );

  const reset = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = {};
    setSaving("saving");
    try {
      await api.resetLayout(projectId, kind);
      setSaved({});
      setSaving("idle");
    } catch {
      setSaving("error");
    }
  }, [projectId, kind]);

  return { saved, saving, update, reset, hasCustom: !!saved && Object.keys(saved).length > 0 };
}
