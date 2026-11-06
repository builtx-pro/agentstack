import { useEffect, useRef } from "react";
/** Keeps a keyboard-operable load button as fallback; only observes while continuation is safe. */
export function useLoadMore(enabled: boolean, load: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          latest.current();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, load]);
  return ref;
}
