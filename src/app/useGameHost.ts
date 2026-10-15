// The host console's game controller: owns the game state and undo history,
// picks questions, suggests answer matches, and keeps the board window in sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPicker, loadBank, localStorageStore, type QuestionPicker, type Survey } from "../data/bank";
import {
  canApply,
  createGame,
  gameReducer,
  nextRound,
  type GameAction,
  type GameState,
  type UpcomingRound,
} from "../engine/mainGame";
import { matchAnswer, type MatchResult } from "../engine/match";
import type { GameRules } from "../engine/rules";
import { createHistory, undoableReducer, type History } from "../engine/undo";
import { createSyncChannel, type SyncChannel } from "../sync/channel";
import { deriveEvents, toSnapshot, type BoardEvent } from "./boardSnapshot";

export interface FamilySetup {
  name: string;
  players: string[];
}

export interface GameSetup {
  rules: GameRules;
  families: [FamilySetup, FamilySetup];
}

export interface GameHost {
  /** False until the question bank has loaded. */
  bankReady: boolean;
  /** Playable surveys in the bank. */
  bankSize: number;
  /** Null while on the setup screen. */
  state: GameState | null;
  /** The round "Next round" would start, if any. */
  upcoming: UpcomingRound | null;
  canUndo: boolean;
  /** Message from the last action the engine refused, cleared by the next successful one. */
  lastError: string | null;
  newGame(setup: GameSetup): void;
  /** Leave the game and go back to setup. */
  endGame(): void;
  apply(action: GameAction): void;
  can(action: GameAction): boolean;
  /** Pick a survey of the right size and start the next round. */
  startNextRound(): void;
  /** Replace the current question with another of the same size. Only before anyone buzzes. */
  swapQuestion(): void;
  canSwapQuestion: boolean;
  undo(): void;
  /** Suggest the board answer for a guess, ignoring answers already revealed. */
  suggest(guess: string): MatchResult | null;
  /** Open (or focus) the audience board window. */
  openBoard(): void;
}

const reduce = undoableReducer(gameReducer);

export function useGameHost(channelFactory: () => SyncChannel = createSyncChannel): GameHost {
  const [bank, setBank] = useState<Survey[] | null>(null);
  const [history, setHistory] = useState<History<GameState> | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const historyRef = useRef(history);
  const pickerRef = useRef<QuestionPicker | null>(null);
  const channelRef = useRef<SyncChannel | null>(null);

  const broadcast = useCallback((next: History<GameState> | null, events: BoardEvent[]) => {
    channelRef.current?.post({ type: "snapshot", snapshot: next && toSnapshot(next.present), events });
  }, []);

  const commit = useCallback(
    (next: History<GameState> | null, events: BoardEvent[] = []) => {
      historyRef.current = next;
      setHistory(next);
      setLastError(null);
      broadcast(next, events);
    },
    [broadcast],
  );

  useEffect(() => {
    let cancelled = false;
    loadBank().then((loaded) => {
      if (cancelled) return;
      pickerRef.current = createPicker(loaded, { store: localStorageStore() });
      setBank(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const channel = channelFactory();
    channelRef.current = channel;
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "hello") broadcast(historyRef.current, []);
    });
    broadcast(historyRef.current, []);
    return () => {
      unsubscribe();
      channel.close();
      channelRef.current = null;
    };
  }, [channelFactory, broadcast]);

  const fail = (error: unknown) => setLastError(error instanceof Error ? error.message : String(error));

  const apply = useCallback(
    (action: GameAction) => {
      const current = historyRef.current;
      if (!current) return;
      try {
        const next = reduce(current, action);
        commit(next, deriveEvents(current.present, next.present));
      } catch (error) {
        fail(error);
      }
    },
    [commit],
  );

  const state = history?.present ?? null;
  const upcoming = state ? nextRound(state) : null;
  const round = state?.round ?? null;
  const canSwapQuestion =
    !!round && round.phase === "faceOff" && round.faceOff.buzzed === null && round.slots.every((s) => s === "hidden");

  return useMemo<GameHost>(
    () => ({
      bankReady: bank !== null,
      bankSize: bank?.length ?? 0,
      state,
      upcoming,
      canUndo: !!history?.past.length,
      lastError,
      newGame(setup) {
        try {
          commit(createHistory(createGame(setup.rules, setup.families)));
        } catch (error) {
          fail(error);
        }
      },
      endGame: () => commit(null),
      apply,
      can: (action) => !!state && canApply(state, action),
      startNextRound() {
        const next = state && nextRound(state);
        if (!next || !pickerRef.current) return;
        try {
          const survey = pickerRef.current.pick({ min: next.minAnswers, max: next.maxAnswers });
          apply({ type: "startRound", survey });
        } catch (error) {
          fail(error);
        }
      },
      swapQuestion() {
        const current = historyRef.current;
        const r = current?.present.round;
        if (!current || !r || !canSwapQuestion || !pickerRef.current) return;
        // Rewind to just before this round started, then start it with a different survey.
        let at = current.past.length;
        while (at > 0 && current.past[at - 1]!.round?.survey.id === r.survey.id) at -= 1;
        if (at === 0) return;
        const before: History<GameState> = { past: current.past.slice(0, at - 1), present: current.past[at - 1]! };
        try {
          const survey = pickerRef.current.pick({
            min: r.survey.answerCount,
            max: r.survey.answerCount,
            exclude: [r.survey.id],
          });
          const next = reduce(before, { type: "startRound", survey });
          commit(next, deriveEvents(null, next.present));
        } catch (error) {
          fail(error);
        }
      },
      canSwapQuestion,
      undo() {
        const current = historyRef.current;
        if (current?.past.length) commit(reduce(current, { type: "undo" }));
      },
      suggest(guess) {
        if (!round) return null;
        const revealed = round.slots.flatMap((slot, i) => (slot === "hidden" ? [] : [i]));
        return matchAnswer(round.survey.answers, guess, { exclude: revealed });
      },
      openBoard() {
        window.open(`${window.location.pathname}#/board`, "feud-board", "popup,width=1280,height=720");
      },
    }),
    [bank, state, upcoming, history, lastError, commit, apply, round, canSwapQuestion],
  );
}
