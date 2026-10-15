// Fast Money keyboard shortcuts. Players' answers contain letters, so nothing here fires
// while the host is typing in a field; the answer box handles its own Enter / Escape.

import { useEffect, useRef } from "react";

export interface FastMoneyShortcutHandlers {
  toggleClock(): void;
  undo(): void;
  showNext(): void;
  /** 0-based survey answer from keys 1-8. */
  judgeNext(answer: number): void;
  notOnBoard(): void;
}

export const FAST_MONEY_SHORTCUTS: readonly { keys: string; does: string }[] = [
  { keys: "Enter", does: "Give the typed answer" },
  { keys: "Esc", does: "Clear the box (again: leave it)" },
  { keys: "Space", does: "Start / pause the clock" },
  { keys: "S", does: "Show the next answer" },
  { keys: "1–8", does: "Judge it as that survey answer" },
  { keys: "X", does: "Not on the board" },
  { keys: "U / Ctrl+Z", does: "Undo" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useFastMoneyShortcuts(handlers: FastMoneyShortcutHandlers) {
  // One listener for the screen's lifetime; always call the latest handlers.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || isTyping(e.target)) return;
      const h = ref.current;
      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === "z") {
        e.preventDefault();
        h.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (key === " ") {
        // Space on a focused button already clicks it; don't also toggle the clock.
        if (e.target instanceof HTMLButtonElement) return;
        h.toggleClock();
      } else if (/^[1-8]$/.test(key)) h.judgeNext(Number(key) - 1);
      else if (key === "x") h.notOnBoard();
      else if (key === "s") h.showNext();
      else if (key === "u") h.undo();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
