import { useEffect, useState } from "react";

/** Live result of a CSS media query, e.g. useMediaQuery("(min-width: 1250px)"). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Window widths where the layout changes. Keep in sync with the `max-[...]` classes that use them. */
export const LAYOUT = {
  /** At least this wide: the Now panel sits beside the timeline. Narrower: it opens as a drawer. */
  wide: "(min-width: 1250px)",
} as const;
