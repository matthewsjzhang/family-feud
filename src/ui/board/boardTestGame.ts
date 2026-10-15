// Test helpers: build real board snapshots by playing the real engine, so the
// tests stay correct if the snapshot shape or the rules change.

import { toSnapshot, type BoardSnapshot } from "../../app/boardSnapshot";
import type { Survey } from "../../data/bank";
import { createGame, gameReducer, nextRound, type GameAction, type GameState } from "../../engine/mainGame";
import { DEFAULT_RULES, type GameRules, type RoundRule } from "../../engine/rules";

const POINTS = [32, 24, 21, 9, 6, 4, 2, 2];
const TEXTS = ["Hot tub", "Swimming pool", "Barbecue grill", "Trampoline", "Garden gnome", "Hammock", "Fire pit", "Bird bath"];

let surveyCount = 0;

/** The question never mentions the answers, so "answer text isn't on screen" checks are meaningful. */
export function survey(answerCount: number, texts: string[] = TEXTS, id = `survey-${++surveyCount}`): Survey {
  const points = POINTS.slice(0, answerCount);
  return {
    id,
    season: 20,
    answerCount,
    question: `Name something you might see in a neighbor's yard (${id})`,
    total: points.reduce((a, b) => a + b, 0),
    answers: points.map((p, i) => ({ text: texts[i] ?? `Answer ${i + 1}`, points: p })),
    source: "https://example.test",
  };
}

export const FAMILIES = [
  { name: "Smith", players: ["Sam", "Sue", "Sid"] },
  { name: "Jones", players: ["Jan", "Joe", "Jill"] },
];

const round = (name: string, multiplier: number): RoundRule => ({ name, multiplier, minAnswers: 4, maxAnswers: 8 });

/** Every round accepts any survey size, so tests can pick the board they need. */
export function testRules(rounds: RoundRule[] = [round("Single", 1), round("Double", 2), round("Triple", 3)]): GameRules {
  return { ...structuredClone(DEFAULT_RULES), id: "test", builtIn: false, rounds };
}
export { round as roundRule };

export function newGame(rules: GameRules = testRules()): GameState {
  return createGame(rules, FAMILIES);
}

export function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}

export function start(state: GameState, answerCount = 5, texts?: string[]): GameState {
  if (!nextRound(state)) throw new Error("no next round");
  return run(state, { type: "startRound", survey: survey(answerCount, texts) });
}

/** Smith takes control with the #1 answer and chooses to play. */
export function smithInControl(state: GameState): GameState {
  return run(
    state,
    { type: "buzz", team: 0 },
    { type: "faceOffAnswer", team: 0, answer: 0 },
    { type: "playOrPass", play: true },
  );
}

/** Smith wins the current round by clearing the board. */
export function smithSweeps(state: GameState): GameState {
  let s = smithInControl(state);
  for (let i = 1; i < s.round!.slots.length; i++) s = run(s, { type: "answer", answer: i });
  return s;
}

export const snap = (state: GameState): BoardSnapshot => toSnapshot(state);
