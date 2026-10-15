// Small timing helpers for the board. Timers live in the component that owns the
// visual, so a remount (or React StrictMode's double effects) restarts them
// instead of leaving an overlay stuck on screen.

import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  // jsdom and some older TVs' browsers have no matchMedia.
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** Calls onDone once, ms after mount. */
export function useTimeout(onDone: () => void, ms: number) {
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => latest.current(), ms);
    return () => clearTimeout(id);
  }, [ms]);
}

const COUNT_STEP_MS = 40;

/**
 * Counts the displayed number up (or down) to target. Uses setInterval rather
 * than requestAnimationFrame so tests can drive it with fake timers.
 */
export function useCountUp(target: number, durationMs = 1200): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const set = (n: number) => {
      shownRef.current = n;
      setShown(n);
    };
    if (prefersReducedMotion()) {
      set(target);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      set(t >= 1 ? target : Math.round(from + (target - from) * t));
      if (t >= 1) clearInterval(id);
    }, COUNT_STEP_MS);
    return () => clearInterval(id);
  }, [target, durationMs]);

  return shown;
}
