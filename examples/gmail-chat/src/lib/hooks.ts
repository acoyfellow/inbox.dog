import { useRef, useEffect, type RefObject } from "react";

export function useAutoScroll(ref: RefObject<HTMLElement | null>, deps: unknown[]): void {
  const isNearBottom = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, [ref]);

  useEffect(() => {
    if (isNearBottom.current && ref.current) {
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
    }
  }, deps);
}
