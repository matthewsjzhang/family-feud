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
import {
  createCustomQuestionStore,
  isCustomId,
  type CustomQuestionInput,
  type CustomQuestionStore,
} from "../data/customQuestions";
import { localJsonStorage } from "../data/jsonStorage";
import { createQuestionSetStore, type QuestionSet, type QuestionSetStore } from "../data/questionSets";
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
  /** A saved question set to play (see data/questionSets.ts); null or missing = random questions. */
  questionSetId?: string | null;
}

export interface QuestionBanks {
  main: Survey[];
  suddenDeath: Survey[];
  /** Questions the host wrote (main-game and Sudden Death); never drawn at random. */
  custom: Survey[];
}

/** Which bank a survey plays in: Sudden Death or the main game. */
export function bankOf(survey: Survey, suddenDeathIds: ReadonlySet<string>): "main" | "suddenDeath" {
  if (survey.custom) return survey.custom;
  return suddenDeathIds.has(survey.id) ? "suddenDeath" : "main";
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
  /** Any survey by id: main bank, Sudden Death bank or custom. */
  findSurvey(id: string): Survey | undefined;

  // Custom questions (saved in the browser)
  /** Adds a question; returns null and sets lastError if it's invalid. */
  addCustomQuestion(input: CustomQuestionInput): Survey | null;
  updateCustomQuestion(id: string, input: CustomQuestionInput): Survey | null;
  removeCustomQuestion(id: string): void;
  /** A custom question as editable form input. */
  toCustomInput(survey: Survey): CustomQuestionInput;

  // Question sets ("preset games": hand-picked questions in order)
  questionSets: QuestionSet[];
  /** Adds or replaces a set; returns null and sets lastError if it's invalid. */
  saveQuestionSet(set: QuestionSet): QuestionSet | null;
  removeQuestionSet(id: string): void;
  /** The set the current game plays, if any. */
  activeQuestionSet: QuestionSet | null;

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
  const [customStore] = useState<CustomQuestionStore>(() =>
    createCustomQuestionStore(localJsonStorage("feud.customQuestions")),
  );
  const [customSurveys, setCustomSurveys] = useState<Survey[]>(() => customStore.list());
  const [setStore] = useState<QuestionSetStore>(() => createQuestionSetStore(localJsonStorage("feud.questionSets")));
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>(() => setStore.list());
  const [activeQuestionSet, setActiveQuestionSet] = useState<QuestionSet | null>(null);
  /** Surveys asked in the current game, so a set's Sudden Death list moves on to the next one. */
  const askedRef = useRef(new Set<string>());
  /** The queued survey the current round started with, so undoing that start puts it back in the queue. */
  const queuedStartRef = useRef<Survey | null>(null);
  /** The latest Fast Money payout in this game, kept after leaving the Fast Money screen. */
  const payoutRef = useRef(0);
  /** Fast Money was played to the end this game: it isn't offered again. */
  const [fastMoneyPlayed, setFastMoneyPlayed] = useState(false);
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
      // Leaving (null) keeps the payout; undoing the last judgement takes it away again.
      if (next) payoutRef.current = next.present.outcome?.payout ?? 0;
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
      setBanks({ main, suddenDeath, custom: [] });
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

  const allBanks: QuestionBanks | null = banks && { ...banks, custom: customSurveys };
  const suddenDeathIds = new Set(banks?.suddenDeath.map((s) => s.id));
  const findSurvey = (id: string): Survey | undefined =>
    customSurveys.find((s) => s.id === id) ??
    banks?.main.find((s) => s.id === id) ??
    banks?.suddenDeath.find((s) => s.id === id);

  const state = history?.present ?? null;
  const fastMoney = fmHistory?.present ?? null;
  const canStartFastMoney =
    !!state && state.winner !== null && state.rules.fastMoney.enabled && !fastMoney && !fastMoneyPlayed;
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
          setActiveQuestionSet((setup.questionSetId && setStore.get(setup.questionSetId)) || null);
          askedRef.current = new Set();
          queuedStartRef.current = null;
          setFastMoneyPlayed(false);
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
        setFastMoneyPlayed(false);
        commit(null);
      },
      apply,
      can: (action) => !!state && canApply(state, action),
      startNextRound() {
        const next = state && nextRound(state);
        const picker = next && pickerFor(next.kind);
        if (!next || !picker) return;
        try {
          // 1. A question the host queued in the browser, at the next round of its kind.
          // 2. The question set's question for this round.
          // 3. A random question of the right size.
          const isSuddenDeath = next.kind === "suddenDeath";
          const fromQueue = queued && (bankOf(queued, suddenDeathIds) === "suddenDeath") === isSuddenDeath ? queued : null;
          const set = activeQuestionSet;
          const setId =
            set &&
            (next.kind === "round"
              ? set.rounds[next.number - 1]
              : set.suddenDeath.find((id) => !askedRef.current.has(id)));
          const fromSet = setId ? findSurvey(setId) : undefined;
          const handPicked = fromQueue ?? fromSet ?? null;
          const survey = handPicked ?? picker.pick({ min: next.minAnswers, max: next.maxAnswers });
          if (handPicked && !isCustomId(handPicked.id)) picker.markUsed(handPicked.id);
          if (fromQueue) setQueued(null);
          queuedStartRef.current = fromQueue;
          askedRef.current.add(survey.id);
          apply({ type: "startRound", survey, handPicked: !!handPicked });
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
        const up = nextRound(before.present);
        if (!up) return;
        // Same size as the question it replaces, unless that one was hand-picked outside the round's usual
        // sizes (e.g. a 3-answer custom question): then any size the round allows.
        const count = r.survey.answerCount;
        const fits = count >= up.minAnswers && count <= up.maxAnswers;
        try {
          const survey = picker.pick({
            min: fits ? count : up.minAnswers,
            max: fits ? count : up.maxAnswers,
            exclude: [r.survey.id],
          });
          const next = reduce(before, { type: "startRound", survey });
          askedRef.current.add(survey.id);
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
        if (!current?.past.length) return;
        const next = reduce(current, { type: "undo" });
        // Undoing a round's start: that question wasn't asked after all, and a queued one goes back in the queue.
        const undone = current.present.round?.survey;
        if (undone && undone.id !== next.present.round?.survey.id) {
          askedRef.current.delete(undone.id);
          if (queuedStartRef.current?.id === undone.id) setQueued(queuedStartRef.current);
          queuedStartRef.current = null;
        }
        // Undoing the win: the game isn't over, so its Fast Money hasn't been played either.
        if (next.present.winner === null) {
          setFastMoneyPlayed(false);
          payoutRef.current = 0;
        }
        commit(next);
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
        setFastMoneyPlayed(false);
        commit(null);
      },
      clearChampion() {
        setChampion(null);
        saveChampion(null);
        setRetiredChampion(null);
      },
      banks: allBanks,
      isUsed: (id) => !!pickersRef.current && (pickersRef.current.main.isUsed(id) || pickersRef.current.suddenDeath.isUsed(id)),
      queued,
      queueSurvey(id) {
        const found = findSurvey(id);
        if (found) setQueued(found);
        else fail(`No survey with id "${id}".`);
      },
      clearQueue: () => setQueued(null),
      findSurvey,
      addCustomQuestion(input) {
        try {
          const survey = customStore.add(input);
          setCustomSurveys(customStore.list());
          setLastError(null);
          return survey;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      updateCustomQuestion(id, input) {
        try {
          const survey = customStore.update(id, input);
          setCustomSurveys(customStore.list());
          if (queued?.id === id) setQueued(survey);
          setLastError(null);
          return survey;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      removeCustomQuestion(id) {
        customStore.remove(id);
        setCustomSurveys(customStore.list());
        if (queued?.id === id) setQueued(null);
      },
      toCustomInput: (survey) => customStore.toInput(survey),
      questionSets,
      saveQuestionSet(set) {
        try {
          const saved = setStore.save(set);
          setQuestionSets(setStore.list());
          if (activeQuestionSet?.id === saved.id) setActiveQuestionSet(saved);
          setLastError(null);
          return saved;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      removeQuestionSet(id) {
        setStore.remove(id);
        setQuestionSets(setStore.list());
      },
      activeQuestionSet,
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
          // The question set's five, if it has them; otherwise ordinary surveys from the main bank.
          const fromSet = (activeQuestionSet?.fastMoney ?? []).map(findSurvey);
          const useSet = fromSet.length === FAST_MONEY_QUESTIONS && fromSet.every((s) => s !== undefined);
          const surveys = useSet
            ? (fromSet as Survey[])
            : Array.from({ length: FAST_MONEY_QUESTIONS }, () => picker.pick({ min: 4, max: 8 }));
          // The set's bank questions count as played, so they don't come up again at random.
          if (useSet) for (const s of surveys) if (!isCustomId(s.id)) picker.markUsed(s.id);
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
        if (fmRef.current?.present.outcome) setFastMoneyPlayed(true);
        commitFastMoney(null);
      },
    }),
    // pickerFor only reads a ref, so it doesn't need to be a dependency.
    [
      banks,
      customSurveys,
      questionSets,
      activeQuestionSet,
      customStore,
      setStore,
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
      fastMoneyPlayed,
      applyFastMoney,
      commitFastMoney,
    ],
  );
}
