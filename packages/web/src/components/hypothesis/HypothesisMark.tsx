/**
 * Hypothesis mode, stage 3: the "H" mark of a hypothesis on the graphs (connections, UCs, FRG GNs that depend on
 * hypotheses) and in the legend. Its title lists the hypothesis IDs.
 */
export function HypothesisMark({ title, size = 14, className = "" }: { title?: string; size?: number; className?: string }) {
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      data-testid="hypothesis-mark"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full border border-amber-600 bg-amber-50 font-sans font-bold leading-none text-amber-800 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-200 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      H
    </span>
  );
}

/** Stroke pattern of a hypothesis connection: short dots (the dashes of modulatory connections are longer). */
export const hypothesisDash = (width: number) => `0.1 ${2.4 + width * 1.4}`;
