// Test harness: a GameHost in Fast Money, backed by the real Fast Money reducer, undo
// history and matcher, with five hand-made surveys and a clock the test ticks by hand.

import { useEffect, useRef, useState } from "react";
import type { GameHost } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import {
  createFastMoney,
  fastMoneyReducer,
  type FastMoneyAction,
  type FastMoneyState,
} from "../../../engine/fastMoney";
import { createGame, type GameState } from "../../../engine/mainGame";
import { matchAnswer } from "../../../engine/match";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { createHistory, undoableReducer, type History } from "../../../engine/undo";
import { HostFastMoney } from "./HostFastMoney";

function survey(id: string, question: string, answers: [string, number][]): Survey {
  return {
    id,
    season: 20,
    answerCount: answers.length,
    question,
    total: answers.reduce((sum, [, p]) => sum + p, 0),
    answers: answers.map(([text, points]) => ({ text, points })),
    source: "https://example.test",
  };
}

/** The #1 answers add up to exactly 200, the default target. */
export const FM_SURVEYS: Survey[] = [
  survey("fm-beach", "Name something people bring to the beach", [
    ["TOWEL", 30],
    ["SUNSCREEN", 25],
    ["UMBRELLA", 15],
    ["COOLER", 10],
    ["CHAIR", 8],
    ["BOOK", 6],
  ]),
  survey("fm-pets", "Name a popular pet", [
    ["DOG", 40],
    ["CAT", 30],
    ["FISH", 12],
    ["BIRD", 8],
    ["HAMSTER", 5],
  ]),
  survey("fm-breakfast", "Name a breakfast food", [
    ["EGGS", 40],
    ["PANCAKES", 25],
    ["CEREAL", 15],
    ["BACON", 10],
  ]),
  survey("fm-rainbow", "Name a color of the rainbow", [
    ["RED", 35],
    ["BLUE", 25],
    ["GREEN", 15],
    ["YELLOW", 12],
    ["ORANGE", 8],
    ["PURPLE", 5],
  ]),
  survey("fm-fruit", "Name a fruit", [
    ["APPLE", 55],
    ["BANANA", 20],
    ["GRAPE", 10],
    ["STRAWBERRY", 7],
  ]),
];

export const FM_FAMILIES = [
  { name: "Smith", players: ["Sam", "Sue", "Sid"] },
  { name: "Jones", players: ["Jan", "Joe", "Jill"] },
];

/** The test's hand on the clock: tick(ms) advances it the way the real hook's timer does. */
export interface ManualClock {
  tick(ms: number): void;
  /** Set by the fake host while it is mounted. */
  listener: ((ms: number) => void) | null;
}

export function createManualClock(): ManualClock {
  const clock: ManualClock = {
    listener: null,
    tick: (ms) => clock.listener?.(ms),
  };
  return clock;
}

const reduce = undoableReducer(fastMoneyReducer);

interface FakeFastMoneyHostProps {
  clock: ManualClock;
  rules?: GameRules;
  /** Indexes into the Smith family's players. */
  players?: [number, number];
  /** Spy on the host's calls. */
  onAction?(action: FastMoneyAction): void;
}

function wonGame(rules: GameRules): GameState {
  const game = createGame(rules, FM_FAMILIES);
  game.families[0].score = 320;
  game.winner = 0;
  return game;
}

export function FakeFastMoneyHost({ clock, rules = DEFAULT_RULES, players = [0, 1], onAction }: FakeFastMoneyHostProps) {
  const [state] = useState(() => wonGame(rules));
  const [fmHistory, setFmHistory] = useState<History<FastMoneyState> | null>(() =>
    createHistory(
      createFastMoney(
        rules.fastMoney,
        FM_SURVEYS,
        players.map((i) => FM_FAMILIES[0]!.players[i]!),
      ),
    ),
  );
  const [lastError, setLastError] = useState<string | null>(null);
  // Like the real hook, read the latest history so several actions in one event chain up.
  const ref = useRef(fmHistory);

  const commit = (next: History<FastMoneyState> | null) => {
    ref.current = next;
    setFmHistory(next);
    setLastError(null);
  };

  // Ticks replace the present state without adding an undo step, as in useGameHost.
  useEffect(() => {
    clock.listener = (ms) => {
      const current = ref.current;
      if (!current) return;
      commit({ past: current.past, present: fastMoneyReducer(current.present, { type: "tick", ms }) });
    };
    return () => {
      clock.listener = null;
    };
  }, [clock]);

  if (!fmHistory) return <p>Main game screen</p>;
  const fm = fmHistory.present;

  const host: GameHost = {
    bankReady: true,
    bankSize: FM_SURVEYS.length,
    suddenDeathBankSize: 0,
    state,
    upcoming: null,
    canUndo: fmHistory.past.length > 0,
    lastError,
    newGame: () => {},
    endGame: () => {},
    apply: () => {},
    can: () => false,
    startNextRound: () => {},
    swapQuestion: () => {},
    canSwapQuestion: false,
    undo() {
      const current = ref.current;
      if (current?.past.length) commit(reduce(current, { type: "undo" }));
    },
    suggest: () => null,
    openBoard: () => {},
    fastMoney: fm,
    canStartFastMoney: false,
    startFastMoney: () => {},
    applyFastMoney(action) {
      onAction?.(action);
      const current = ref.current;
      if (!current) return;
      try {
        commit(reduce(current, action));
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
      }
    },
    canFastMoney(action) {
      const current = ref.current?.present;
      if (!current) return false;
      try {
        fastMoneyReducer(current, action);
        return true;
      } catch {
        return false;
      }
    },
    suggestFastMoney(question, guess) {
      const s = fm.surveys[question];
      return s ? matchAnswer(s.answers, guess) : null;
    },
    endFastMoney: () => commit(null),
  };

  return <HostFastMoney host={host} />;
}
