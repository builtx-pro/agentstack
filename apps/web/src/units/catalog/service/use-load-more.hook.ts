import { useCallback, useEffect, useRef } from "react";
/** One automatic page per intersection; observes newly mounted sentinels after filtering or retry. */
export function useLoadMore(enabled: boolean, load: () => void) {
  const latest = useRef({ enabled, load });
  latest.current = { enabled, load };
  const intersecting = useRef(false);
  const consumed = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const trigger = useRef(() => {
    if (intersecting.current && !consumed.current && latest.current.enabled) {
      consumed.current = true;
      latest.current.load();
    }
  });
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    intersecting.current = false;
    consumed.current = false;
    if (!node || typeof IntersectionObserver === "undefined") return;
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          intersecting.current = entry.isIntersecting;
          if (!entry.isIntersecting) consumed.current = false;
        }
        trigger.current();
      },
      { rootMargin: "240px" },
    );
    observer.current.observe(node);
  }, []);
  useEffect(() => {
    trigger.current();
  }, [enabled]);
  return ref;
}
