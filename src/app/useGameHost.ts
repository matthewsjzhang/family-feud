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
import { recordResult, type ChampionRecord } from "../engine/champions";
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
  /** Family 1 is the returning champion family (from `GameHost.champion`). */
  championReturning?: boolean;
}

export interface QuestionBanks {
  main: Survey[];
  suddenDeath: Survey[];
}

const CHAMPION_KEY = "feud.champion";

function loadChampion(): ChampionRecord | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CHAMPION_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const c = parsed as ChampionRecord;
    const ok =
      typeof c.family?.name === "string" &&
      Array.isArray(c.family.players) &&
      c.family.players.every((p) => typeof p === "string") &&
      Number.isInteger(c.wins) &&
      Number.isFinite(c.winnings);
    return ok ? c : null;
  } catch {
    return null;
  }
}

function saveChampion(champion: ChampionRecord | null) {
  try {
    if (champion) localStorage.setItem(CHAMPION_KEY, JSON.stringify(champion));
    else localStorage.removeItem(CHAMPION_KEY);
  } catch {
    // Storage blocked: champions last for this session only.
  }
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

  // Champions
  /** The family defending its title (saved between sessions); null if none. */
  champion: ChampionRecord | null;
  /** Which family in the current game is the returning champion, if any. */
  championTeam: 0 | 1 | null;
  /** Set right after a family reaches the win limit, until the next game starts. */
  retiredChampion: ChampionRecord | null;
  /** After a won game: record the result (and any Fast Money winnings) and go to setup for the next game. */
  finishGame(): void;
  /** Forget the current champions (e.g. a new group of players). */
  clearChampion(): void;

  // Question bank browser
  /** Both banks once loaded, for browsing. */
  banks: QuestionBanks | null;
  /** Has this survey already been played (main or Sudden Death bank)? */
  isUsed(id: string): boolean;
  /** The survey the host picked to play next, if any. */
  queued: Survey | null;
  /** Play this survey (by id) at the next round it fits; replaces any earlier pick. */
  queueSurvey(id: string): void;
  clearQueue(): void;

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
  const [banks, setBanks] = useState<QuestionBanks | null>(null);
  const [champion, setChampion] = useState<ChampionRecord | null>(loadChampion);
  const [championTeam, setChampionTeam] = useState<0 | 1 | null>(null);
  const championRef = useRef({ champion, championTeam });
  championRef.current = { champion, championTeam };
  const [retiredChampion, setRetiredChampion] = useState<ChampionRecord | null>(null);
  const [queued, setQueued] = useState<Survey | null>(null);
  /** The latest Fast Money payout in this game, kept after leaving the Fast Money screen. */
  const payoutRef = useRef(0);
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
    const { champion: c, championTeam: team } = championRef.current;
    const championView = c && team !== null ? { team, wins: c.wins } : null;
    const snapshot = game ? toSnapshot(game, fmRef.current?.present ?? null, championView) : null;
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
      const outcome = next?.present.outcome;
      if (outcome) payoutRef.current = outcome.payout;
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
          const game = createGame(setup.rules, setup.families);
          const returning = !!setup.championReturning && champion !== null;
          // Starting without the champions means a new group: forget the old champions.
          if (!returning && champion) {
            setChampion(null);
            saveChampion(null);
          }
          const team = returning ? 0 : null;
          championRef.current = { champion: returning ? champion : null, championTeam: team };
          setChampionTeam(team);
          setRetiredChampion(null);
          payoutRef.current = 0;
          commit(createHistory(game));
        } catch (error) {
          fail(error);
        }
      },
      endGame() {
        setChampionTeam(null);
        championRef.current = { champion, championTeam: null };
        commit(null);
      },
      apply,
      can: (action) => !!state && canApply(state, action),
      startNextRound() {
        const next = state && nextRound(state);
        const picker = next && pickerFor(next.kind);
        if (!next || !picker) return;
        try {
          // A question the host picked in the browser is used as soon as it fits the round.
          const fits =
            queued &&
            queued.answerCount >= next.minAnswers &&
            queued.answerCount <= next.maxAnswers &&
            (next.kind === "suddenDeath") === (banks?.suddenDeath.some((s) => s.id === queued.id) ?? false);
          let survey: Survey;
          if (fits && queued) {
            survey = queued;
            picker.markUsed(queued.id);
            setQueued(null);
          } else {
            survey = picker.pick({ min: next.minAnswers, max: next.maxAnswers });
          }
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
      champion,
      championTeam,
      retiredChampion,
      finishGame() {
        if (!state || state.winner === null) return;
        const winner = state.families[state.winner];
        const update = recordResult(
          champion,
          {
            winner: { name: winner.name, players: [...winner.players] },
            winnerWasChampion: championTeam !== null && state.winner === championTeam,
            payout: payoutRef.current,
          },
          state.rules.championLimit,
        );
        setChampion(update.champion);
        saveChampion(update.champion);
        setRetiredChampion(update.retired);
        setChampionTeam(null);
        championRef.current = { champion: update.champion, championTeam: null };
        payoutRef.current = 0;
        commit(null);
      },
      clearChampion() {
        setChampion(null);
        saveChampion(null);
        setRetiredChampion(null);
      },
      banks,
      isUsed: (id) => !!pickersRef.current && (pickersRef.current.main.isUsed(id) || pickersRef.current.suddenDeath.isUsed(id)),
      queued,
      queueSurvey(id) {
        const found = banks && [...banks.main, ...banks.suddenDeath].find((s) => s.id === id);
        if (found) setQueued(found);
        else fail(`No survey with id "${id}".`);
      },
      clearQueue: () => setQueued(null),
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
      champion,
      championTeam,
      retiredChampion,
      queued,
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
