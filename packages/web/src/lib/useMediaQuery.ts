import { useEffect, useState } from "react";

/** Tailwind breakpoints used for layout switches that CSS alone cannot express. */
export const BELOW_MD = "(max-width: 767px)";
export const BELOW_LG = "(max-width: 1023px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
