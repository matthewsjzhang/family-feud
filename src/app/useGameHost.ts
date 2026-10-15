// The host console's game controller: owns the game state and undo history,
// picks questions, suggests answer matches, and keeps the board window in sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPicker,
  loadBank,
  loadSuddenDeathBank,
  localStorageStore,
  type QuestionPicker,
  type Survey,
} from "../data/bank";
import {
  canApply,
  createGame,
  gameReducer,
  nextRound,
  type GameAction,
  type GameState,
  type UpcomingRound,
} from "../engine/mainGame";
import {
  createFastMoney,
  FAST_MONEY_QUESTIONS,
  fastMoneyReducer,
  type FastMoneyAction,
  type FastMoneyState,
} from "../engine/fastMoney";
import { matchAnswer, type MatchResult } from "../engine/match";
import type { GameRules } from "../engine/rules";
import { createHistory, undoableReducer, type History } from "../engine/undo";
import { createSyncChannel, type SyncChannel } from "../sync/channel";
import { deriveEvents, deriveFastMoneyEvents, toSnapshot, type BoardEvent } from "./boardSnapshot";

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
  /** Playable surveys in the main bank. */
  bankSize: number;
  /** Playable single-answer surveys in the separate Sudden Death bank. */
  suddenDeathBankSize: number;
  /** Null while on the setup screen. */
  state: GameState | null;
  /** The round "Next round" would start, if any. */
  upcoming: UpcomingRound | null;
  /** Undo applies to Fast Money while it is being played, otherwise to the main game. */
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

  // Fast Money (after the game is won)
  /** Null unless Fast Money is being played. */
  fastMoney: FastMoneyState | null;
  /** The game is won, the rules include Fast Money, and it isn't running yet. */
  canStartFastMoney: boolean;
  /** Start Fast Money with two players of the winning family (indexes into its players). */
  startFastMoney(players: [number, number]): void;
  applyFastMoney(action: FastMoneyAction): void;
  canFastMoney(action: FastMoneyAction): boolean;
  /** Suggest the board answer for a Fast Money question. */
  suggestFastMoney(question: number, guess: string): MatchResult | null;
  /** Leave the Fast Money screen (back to the game-over screen). */
  endFastMoney(): void;
}

const reduce = undoableReducer(gameReducer);
const reduceFastMoney = undoableReducer(fastMoneyReducer);
/** How often the Fast Money clock updates while running. */
const CLOCK_TICK_MS = 100;

export function useGameHost(channelFactory: () => SyncChannel = createSyncChannel): GameHost {
  const [banks, setBanks] = useState<{ main: Survey[]; suddenDeath: Survey[] } | null>(null);
  const [history, setHistory] = useState<History<GameState> | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const historyRef = useRef(history);
  const [fmHistory, setFmHistory] = useState<History<FastMoneyState> | null>(null);
  const fmRef = useRef(fmHistory);
  const pickersRef = useRef<{ main: QuestionPicker; suddenDeath: QuestionPicker } | null>(null);
  /** Main rounds and Sudden Death draw from separate banks. */
  const pickerFor = (kind: "round" | "suddenDeath") =>
    pickersRef.current && (kind === "suddenDeath" ? pickersRef.current.suddenDeath : pickersRef.current.main);
  const channelRef = useRef<SyncChannel | null>(null);

  /** Send the board everything it may see: the game, plus Fast Money while it runs. */
  const broadcast = useCallback((events: BoardEvent[]) => {
    const game = historyRef.current?.present;
    const snapshot = game ? toSnapshot(game, fmRef.current?.present ?? null) : null;
    channelRef.current?.post({ type: "snapshot", snapshot, events });
  }, []);

  const setFastMoney = useCallback((next: History<FastMoneyState> | null) => {
    fmRef.current = next;
    setFmHistory(next);
  }, []);

  const commit = useCallback(
    (next: History<GameState> | null, events: BoardEvent[] = [], keepFastMoney = false) => {
      historyRef.current = next;
      setHistory(next);
      // A new game, leaving the game, or undoing back into it ends any Fast Money.
      if (!keepFastMoney) setFastMoney(null);
      setLastError(null);
      broadcast(events);
    },
    [broadcast, setFastMoney],
  );

  const commitFastMoney = useCallback(
    (next: History<FastMoneyState> | null, events: BoardEvent[] = []) => {
      setFastMoney(next);
      setLastError(null);
      broadcast(events);
    },
    [broadcast, setFastMoney],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBank(), loadSuddenDeathBank()]).then(([main, suddenDeath]) => {
      if (cancelled) return;
      pickersRef.current = {
        main: createPicker(main, { store: localStorageStore() }),
        suddenDeath: createPicker(suddenDeath, { store: localStorageStore("feud.usedSuddenDeath") }),
      };
      setBanks({ main, suddenDeath });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const channel = channelFactory();
    channelRef.current = channel;
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "hello") broadcast([]);
    });
    broadcast([]);
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
        commit(next, deriveEvents(current.present, next.present), action.type === "adjustScore");
      } catch (error) {
        fail(error);
      }
    },
    [commit],
  );

  const applyFastMoney = useCallback(
    (action: FastMoneyAction) => {
      const current = fmRef.current;
      if (!current) return;
      try {
        const next = reduceFastMoney(current, action);
        commitFastMoney(next, deriveFastMoneyEvents(current.present, next.present));
      } catch (error) {
        fail(error);
      }
    },
    [commitFastMoney],
  );

  // The Fast Money clock runs here, in the host window, so there is only one clock.
  // Ticks replace the current state instead of adding undo steps.
  const clockRunning = fmHistory?.present.clockRunning ?? false;
  useEffect(() => {
    if (!clockRunning) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const current = fmRef.current;
      if (!current) return;
      const now = performance.now();
      const present = fastMoneyReducer(current.present, { type: "tick", ms: Math.round(now - last) });
      last = now;
      commitFastMoney({ past: current.past, present }, deriveFastMoneyEvents(current.present, present));
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [clockRunning, commitFastMoney]);

  const state = history?.present ?? null;
  const fastMoney = fmHistory?.present ?? null;
  const canStartFastMoney = !!state && state.winner !== null && state.rules.fastMoney.enabled && !fastMoney;
  const upcoming = state ? nextRound(state) : null;
  const round = state?.round ?? null;
  const canSwapQuestion =
    !!round && round.phase === "faceOff" && round.faceOff.buzzed === null && round.slots.every((s) => s === "hidden");

  return useMemo<GameHost>(
    () => ({
      bankReady: banks !== null,
      bankSize: banks?.main.length ?? 0,
      suddenDeathBankSize: banks?.suddenDeath.length ?? 0,
      state,
      upcoming,
      canUndo: fmHistory ? fmHistory.past.length > 0 : !!history?.past.length,
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
        const picker = next && pickerFor(next.kind);
        if (!next || !picker) return;
        try {
          const survey = picker.pick({ min: next.minAnswers, max: next.maxAnswers });
          apply({ type: "startRound", survey });
        } catch (error) {
          fail(error);
        }
      },
      swapQuestion() {
        const current = historyRef.current;
        const r = current?.present.round;
        const picker = r && pickerFor(r.kind);
        if (!current || !r || !canSwapQuestion || !picker) return;
        // Rewind to just before this round started, then start it with a different survey.
        let at = current.past.length;
        while (at > 0 && current.past[at - 1]!.round?.survey.id === r.survey.id) at -= 1;
        if (at === 0) return;
        const before: History<GameState> = { past: current.past.slice(0, at - 1), present: current.past[at - 1]! };
        try {
          const survey = picker.pick({
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
        const fm = fmRef.current;
        if (fm) {
          if (fm.past.length) commitFastMoney(reduceFastMoney(fm, { type: "undo" }));
          return;
        }
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
      fastMoney,
      canStartFastMoney,
      startFastMoney(players) {
        const picker = pickerFor("round");
        if (!state || state.winner === null || !canStartFastMoney || !picker) return;
        const family = state.families[state.winner];
        try {
          if (players[0] === players[1]) throw new Error("Pick two different players for Fast Money.");
          const names = players.map((i) => family.players[i]);
          if (names.some((n) => n === undefined)) throw new Error("Pick two players from the winning family.");
          // Fast Money uses ordinary surveys from the main bank.
          const surveys = Array.from({ length: FAST_MONEY_QUESTIONS }, () => picker.pick({ min: 4, max: 8 }));
          const fm = createFastMoney(state.rules.fastMoney, surveys, names as string[]);
          commitFastMoney(createHistory(fm), deriveFastMoneyEvents(null, fm));
        } catch (error) {
          fail(error);
        }
      },
      applyFastMoney,
      canFastMoney(action) {
        const current = fmRef.current?.present;
        if (!current) return false;
        try {
          fastMoneyReducer(current, action);
          return true;
        } catch {
          return false;
        }
      },
      suggestFastMoney(question, guess) {
        const survey = fastMoney?.surveys[question];
        return survey ? matchAnswer(survey.answers, guess) : null;
      },
      endFastMoney() {
        commitFastMoney(null);
      },
    }),
    // pickerFor only reads a ref, so it doesn't need to be a dependency.
    [
      banks,
      state,
      upcoming,
      history,
      lastError,
      commit,
      apply,
      round,
      canSwapQuestion,
      fastMoney,
      fmHistory,
      canStartFastMoney,
      applyFastMoney,
      commitFastMoney,
    ],
  );
}
