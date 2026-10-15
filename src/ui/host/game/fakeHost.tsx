// Test harness: a GameHost backed by the real engine and matcher, with fixed surveys
// instead of the 3.7 MB question bank. Mirrors useGameHost's behaviour closely.

import { useRef, useState } from "react";
import type { GameHost } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import {
  canApply,
  createGame,
  gameReducer,
  nextRound,
  type GameAction,
  type GameState,
} from "../../../engine/mainGame";
import { matchAnswer } from "../../../engine/match";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { HostGame } from "../HostGame";

interface History {
  past: GameState[];
  present: GameState;
}

export const BEACH: Survey = survey("beach", "Name something people bring to the beach", [
  ["TOWEL", 30],
  ["SUNSCREEN", 25],
  ["UMBRELLA", 15],
  ["COOLER", 10],
  ["CHAIR", 8],
  ["BOOK", 6],
]);

export const PETS: Survey = survey("pets", "Name a popular pet", [
  ["DOG", 40],
  ["CAT", 30],
  ["FISH", 12],
  ["BIRD", 8],
  ["HAMSTER", 5],
  ["RABBIT", 3],
]);

export const BREAKFAST: Survey = survey("breakfast", "Name a breakfast food", [
  ["EGGS", 40],
  ["PANCAKES", 25],
  ["CEREAL", 15],
  ["BACON", 10],
]);

/** A single-answer Sudden Death survey, like the ones in data/sudden_death_bank.json. */
export const SUDDEN_PET: Survey = survey("sudden-pet", "Name the most popular pet", [["DOG", 40]]);

export function survey(id: string, question: string, answers: [string, number][]): Survey {
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

export const FAMILIES = [
  { name: "Smith", players: ["Sam", "Sue", "Sid"] },
  { name: "Jones", players: ["Jan", "Joe", "Jill"] },
];

interface FakeHostGameProps {
  rules?: GameRules;
  /** Picked in order (skipping ones that don't fit the round size). */
  surveys?: Survey[];
}

export function FakeHostGame({ rules = DEFAULT_RULES, surveys = [BEACH, PETS, BREAKFAST, SUDDEN_PET] }: FakeHostGameProps) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: createGame(rules, FAMILIES) }));
  const [lastError, setLastError] = useState<string | null>(null);
  // Like the real hook, read the latest history so several applies in one event chain up.
  const ref = useRef(history);
  const used = useRef(new Set<string>());

  const commit = (next: History) => {
    ref.current = next;
    setHistory(next);
    setLastError(null);
  };
  const apply = (action: GameAction) => {
    const current = ref.current;
    try {
      commit({ past: [...current.past, current.present], present: gameReducer(current.present, action) });
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  };
  const pick = (min: number, max: number, exclude?: string) => {
    const found = surveys.find(
      (s) => !used.current.has(s.id) && s.id !== exclude && s.answerCount >= min && s.answerCount <= max,
    );
    if (!found) throw new Error("No test survey fits.");
    used.current.add(found.id);
    return found;
  };

  const state = history.present;
  const round = state.round;
  const canSwapQuestion =
    !!round && round.phase === "faceOff" && round.faceOff.buzzed === null && round.slots.every((s) => s === "hidden");

  const host: GameHost = {
    bankReady: true,
    bankSize: surveys.length,
    suddenDeathBankSize: 0,
    state,
    upcoming: nextRound(state),
    canUndo: history.past.length > 0,
    lastError,
    newGame: () => {},
    endGame: () => {},
    apply,
    can: (action) => canApply(state, action),
    startNextRound() {
      const next = nextRound(ref.current.present);
      if (next) apply({ type: "startRound", survey: pick(next.minAnswers, next.maxAnswers) });
    },
    swapQuestion() {
      const current = ref.current;
      const r = current.present.round;
      if (!r || !canSwapQuestion) return;
      const before = current.past.at(-1)!;
      const swapped = gameReducer(before, { type: "startRound", survey: pick(r.survey.answerCount, r.survey.answerCount, r.survey.id) });
      commit({ past: current.past, present: swapped });
    },
    canSwapQuestion,
    undo() {
      const current = ref.current;
      const previous = current.past.at(-1);
      if (previous) commit({ past: current.past.slice(0, -1), present: previous });
    },
    suggest(guess) {
      if (!round) return null;
      const revealed = round.slots.flatMap((slot, i) => (slot === "hidden" ? [] : [i]));
      return matchAnswer(round.survey.answers, guess, { exclude: revealed });
    },
    openBoard: () => {},
    // Fast Money isn't exercised by these main-game tests.
    fastMoney: null,
    canStartFastMoney: false,
    startFastMoney: () => {},
    applyFastMoney: () => {},
    canFastMoney: () => false,
    suggestFastMoney: () => null,
    endFastMoney: () => {},
  };

  return <HostGame host={host} />;
}
