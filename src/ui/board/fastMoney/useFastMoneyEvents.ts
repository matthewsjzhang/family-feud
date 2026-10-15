// Turns Fast Money event batches into short-lived visuals (double buzzer, TIME!,
// the cover lifting, cell glows, the result celebration). Everything persistent
// (answers, points, total, outcome) comes from the view, so a missed or replayed
// event never leaves the board wrong.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardEvent } from "../../../app/boardSnapshot";

interface Batch {
  id: number;
  events: BoardEvent[];
}

/** Each transient is the id of the batch that created it, so a repeat event remounts (restarts) its visual. */
export interface FastMoneyTransients {
  duplicate: number | null;
  timeUp: number | null;
  uncover: number | null;
  /** Set by fmResult; plays the banner's entrance. Never cleared (the banner itself comes from the view). */
  result: number | null;
  /** cellKey(player, question) -> key of the event that should make it glow. */
  highlight: Record<string, number>;
}

export type FlashKind = "duplicate" | "timeUp" | "uncover";

export const NO_FM_TRANSIENTS: FastMoneyTransients = {
  duplicate: null,
  timeUp: null,
  uncover: null,
  result: null,
  highlight: {},
};

export const cellKey = (player: 0 | 1, question: number) => `${player}:${question}`;

export function applyFastMoneyEvent(t: FastMoneyTransients, event: BoardEvent, key: number): FastMoneyTransients {
  switch (event.type) {
    case "fmStart":
      return NO_FM_TRANSIENTS;
    case "fmDuplicate":
      return { ...t, duplicate: key };
    case "fmTimeUp":
      return { ...t, timeUp: key };
    case "fmUncover":
      return { ...t, uncover: key };
    case "fmAnswerShown":
    case "fmPoints":
      return { ...t, highlight: { ...t.highlight, [cellKey(event.player, event.question)]: key } };
    case "fmResult":
      return { ...t, result: key };
    default:
      return t;
  }
}

export function useFastMoneyEvents(batch: Batch | null) {
  const [transients, setTransients] = useState<FastMoneyTransients>(NO_FM_TRANSIENTS);
  // Same guard as useBoardEvents: StrictMode re-runs effects, a batch must apply once.
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (!batch || handled.current === batch.id) return;
    handled.current = batch.id;
    setTransients((prev) => batch.events.reduce((t, e) => applyFastMoneyEvent(t, e, batch.id), prev));
  }, [batch]);

  // Only clear if nothing newer replaced it in the meantime.
  const endFlash = useCallback((kind: FlashKind, key: number) => {
    setTransients((t) => (t[kind] === key ? { ...t, [kind]: null } : t));
  }, []);

  return { transients, endFlash };
}
