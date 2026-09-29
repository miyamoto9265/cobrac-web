import { useEffect } from "react";

/** Removes the item with `id` and returns a function that puts it back at its old position (if still absent). */
export function removeOptimistically<T extends { projectId: string }>(items: T[], id: string): { next: T[]; restore: (current: T[]) => T[] } {
  const index = items.findIndex((p) => p.projectId === id);
  if (index < 0) return { next: items, restore: (current) => current };
  const removed = items[index];
  return {
    next: items.filter((_, i) => i !== index),
    restore: (current) => (current.some((p) => p.projectId === id) ? current : [...current.slice(0, index), removed, ...current.slice(index)]),
  };
}

const EVENT = "cobrac:projects-changed";

/** Tells other views holding a project list (e.g. the sidebar) to reload. */
export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function useProjectsChanged(onChange: () => void) {
  useEffect(() => {
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [onChange]);
}
