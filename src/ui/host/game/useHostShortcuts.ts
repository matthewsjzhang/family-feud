// Keyboard shortcuts for the host console. They are ignored while the host is typing
// in a field (the answer box handles its own Enter / Escape).

import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  /** 0-based board answer from keys 1-8. */
  answer(index: number): void;
  miss(): void;
  buzz(team: 0 | 1): void;
  undo(): void;
  nextRound(): void;
  focusEntry(): void;
}

export const SHORTCUTS: readonly { keys: string; does: string }[] = [
  { keys: "1–8", does: "Answer is correct (reveal after the round)" },
  { keys: "X", does: "Not on the board / strike" },
  { keys: "Q / P", does: "Left / right family buzzed" },
  { keys: "/", does: "Type an answer" },
  { keys: "N", does: "Next round" },
  { keys: "U / Ctrl+Z", does: "Undo" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useHostShortcuts(handlers: ShortcutHandlers) {
  // Keep one listener for the screen's lifetime; always call the latest handlers.
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

      if (/^[1-8]$/.test(key)) h.answer(Number(key) - 1);
      else if (key === "x") h.miss();
      else if (key === "q") h.buzz(0);
      else if (key === "p") h.buzz(1);
      else if (key === "u") h.undo();
      else if (key === "n") h.nextRound();
      else if (key === "/") h.focusEntry();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
