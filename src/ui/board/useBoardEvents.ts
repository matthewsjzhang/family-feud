// Turns event batches from the host into short-lived visuals (strike X's, glows,
// "+N" pops). Everything persistent (tiles, scores, control) comes from the
// snapshot instead, so a missed or replayed event never leaves the board wrong.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardEvent } from "../../app/boardSnapshot";
import type { Team } from "../../engine/mainGame";

/** Minimal shape of GameBoard's EventBatch (kept here to avoid an import cycle). */
interface Batch {
  id: number;
  events: BoardEvent[];
}

/** Each transient carries the batch id that created it, so a repeat event remounts (restarts) its visual. */
export interface BoardTransients {
  strike: { key: number; count: number } | null;
  /** Board slot number (1-based) -> key of the reveal that should glow. */
  glow: Record<number, number>;
  buzz: { key: number; team: Team } | null;
  gain: { key: number; team: Team; points: number } | null;
  celebrate: number | null;
}

export const NO_TRANSIENTS: BoardTransients = { strike: null, glow: {}, buzz: null, gain: null, celebrate: null };

export function applyEvent(t: BoardTransients, event: BoardEvent, key: number): BoardTransients {
  switch (event.type) {
    case "newRound":
      return NO_TRANSIENTS;
    case "strike":
      return { ...t, strike: { key, count: Math.max(1, Math.min(3, event.count)) } };
    case "reveal":
      // The event's slot is a 0-based answer index; the board numbers from 1.
      return { ...t, glow: { ...t.glow, [event.slot + 1]: key } };
    case "buzz":
      return { ...t, buzz: { key, team: event.team } };
    case "roundWon":
      return { ...t, gain: { key, team: event.team, points: event.points } };
    case "gameWon":
      return { ...t, celebrate: key };
    default:
      // Fast Money events are handled by the Fast Money screen.
      return t;
  }
}

/** Called once per event, in order. Phase 6 plugs the sound player in here. */
export type BoardEventListener = (event: BoardEvent) => void;

export function useBoardEvents(batch: Batch | null, onEvent?: BoardEventListener) {
  const [transients, setTransients] = useState<BoardTransients>(NO_TRANSIENTS);
  // Guards against handling a batch twice (StrictMode re-runs effects; sounds must not double up).
  const handled = useRef<number | null>(null);
  const listener = useRef(onEvent);
  useEffect(() => {
    listener.current = onEvent;
  });

  useEffect(() => {
    if (!batch || handled.current === batch.id) return;
    handled.current = batch.id;
    setTransients((prev) => batch.events.reduce((t, e) => applyEvent(t, e, batch.id), prev));
    for (const event of batch.events) listener.current?.(event);
  }, [batch]);

  // Only clear if nothing newer replaced it in the meantime.
  const endStrike = useCallback((key: number) => {
    setTransients((t) => (t.strike?.key === key ? { ...t, strike: null } : t));
  }, []);
  const endGain = useCallback((key: number) => {
    setTransients((t) => (t.gain?.key === key ? { ...t, gain: null } : t));
  }, []);

  return { transients, endStrike, endGain };
}
