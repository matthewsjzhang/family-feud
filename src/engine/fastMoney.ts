// Fast Money engine: a pure reducer for the bonus round.
// Player 1 answers five questions against the clock, the host judges each
// answer against the survey, then player 2 does the same with player 1's
// answers covered. Repeating player 1's answer gets the double buzzer.
// Reaching the target wins at once, as on the show; the rest can still be revealed.

import type { Survey } from "../data/bank";
import { sameAnswer } from "./match";
import type { FastMoneyRule } from "./rules";
import { IllegalActionError } from "./mainGame";

export const FAST_MONEY_QUESTIONS = 5;

export type FastMoneyPhase = "ready" | "answering" | "judging" | "handoff" | "done";

export interface FastMoneyAnswer {
  /** What the player said; null if they never answered. */
  text: string | null;
  /** Board answer index the host matched it to; null if not on the board. */
  answer: number | null;
  points: number;
  /** On the board: the answer text is shown before its points ("survey says"). */
  shown: boolean;
  judged: boolean;
}

export interface FastMoneyPlayer {
  name: string;
  answers: FastMoneyAnswer[];
}

export interface FastMoneyOutcome {
  won: boolean;
  total: number;
  payout: number;
}

export interface FastMoneyState {
  rule: FastMoneyRule;
  surveys: Survey[];
  players: [FastMoneyPlayer, FastMoneyPlayer];
  turn: 0 | 1;
  phase: FastMoneyPhase;
  /** Question the current player is on. */
  current: number;
  timeLeftMs: number;
  clockRunning: boolean;
  /** Increments on every duplicate, so the UI can play the double buzzer each time. */
  duplicates: number;
  outcome: FastMoneyOutcome | null;
}

export type FastMoneyAction =
  | { type: "startClock" }
  | { type: "pauseClock" }
  | { type: "tick"; ms: number }
  /** duplicate: the host's call; when omitted the engine checks automatically. */
  | { type: "giveAnswer"; text: string; duplicate?: boolean }
  | { type: "pass" }
  | { type: "endTurn" }
  /** Put the player's answer up on the board before judging it. */
  | { type: "showAnswer"; question: number }
  | { type: "judge"; question: number; answer: number | null }
  | { type: "startPlayer2" };

const blankAnswer = (): FastMoneyAnswer => ({ text: null, answer: null, points: 0, shown: false, judged: false });

export function createFastMoney(rule: FastMoneyRule, surveys: Survey[], playerNames: string[]): FastMoneyState {
  if (surveys.length !== FAST_MONEY_QUESTIONS) throw new IllegalActionError("Fast Money needs five surveys.");
  if (playerNames.length !== 2) throw new IllegalActionError("Fast Money needs two players.");
  const player = (name: string): FastMoneyPlayer => ({
    name,
    answers: Array.from({ length: FAST_MONEY_QUESTIONS }, blankAnswer),
  });
  return {
    rule: structuredClone(rule),
    surveys: structuredClone(surveys),
    players: [player(playerNames[0]!), player(playerNames[1]!)],
    turn: 0,
    phase: "ready",
    current: 0,
    timeLeftMs: rule.timers[0] * 1000,
    clockRunning: false,
    duplicates: 0,
    outcome: null,
  };
}

/** Points judged so far for both players. */
export function fastMoneyTotal(state: FastMoneyState): number {
  return state.players.flatMap((p) => p.answers).reduce((sum, a) => sum + a.points, 0);
}

/** Player 1's answers are covered from when player 2 comes out until player 2 stops answering. */
export function isPlayer1Hidden(state: FastMoneyState): boolean {
  return state.turn === 1 && (state.phase === "ready" || state.phase === "answering");
}

/** Would this be the same answer player 1 gave to the same question? */
export function isDuplicate(state: FastMoneyState, question: number, text: string): boolean {
  if (state.turn === 0) return false;
  const earlier = state.players[0].answers[question]?.text;
  return earlier != null && sameAnswer(state.surveys[question]!.answers, earlier, text);
}

export function fastMoneyReducer(state: FastMoneyState, action: FastMoneyAction): FastMoneyState {
  const s = structuredClone(state);
  switch (action.type) {
    case "startClock":
      if (s.phase !== "ready" && s.phase !== "answering") throw new IllegalActionError("The clock can't start now.");
      s.phase = "answering";
      s.clockRunning = true;
      break;
    case "pauseClock":
      if (!s.clockRunning) throw new IllegalActionError("The clock isn't running.");
      s.clockRunning = false;
      break;
    case "tick":
      if (s.phase === "answering" && s.clockRunning) {
        s.timeLeftMs = Math.max(0, s.timeLeftMs - action.ms);
        if (s.timeLeftMs === 0) endTurn(s);
      }
      break;
    case "giveAnswer": {
      requirePhase(s, "answering");
      const text = action.text.trim();
      if (!text) throw new IllegalActionError("That answer is blank.");
      if (action.duplicate ?? isDuplicate(s, s.current, text)) {
        s.duplicates += 1;
        break;
      }
      s.players[s.turn].answers[s.current]!.text = text;
      moveToNextQuestion(s);
      break;
    }
    case "pass":
      requirePhase(s, "answering");
      moveToNextQuestion(s);
      break;
    case "endTurn":
      requirePhase(s, "answering");
      endTurn(s);
      break;
    case "showAnswer": {
      const slot = s.players[s.turn].answers[action.question];
      if (!slot) throw new IllegalActionError(`There is no question ${action.question + 1}.`);
      requireJudging(s, slot);
      if (slot.text === null) throw new IllegalActionError(`There is no answer to question ${action.question + 1} to show.`);
      slot.shown = true;
      break;
    }
    case "judge":
      judge(s, action.question, action.answer);
      break;
    case "startPlayer2":
      requirePhase(s, "handoff");
      s.turn = 1;
      s.phase = "ready";
      s.current = 0;
      s.timeLeftMs = s.rule.timers[1] * 1000;
      s.clockRunning = false;
      break;
  }
  return s;
}

function requirePhase(s: FastMoneyState, phase: FastMoneyPhase) {
  if (s.phase !== phase) throw new IllegalActionError(`Not allowed now (needs the ${phase} step).`);
}

/** Next unanswered question after the current one, wrapping back to passed ones. */
function moveToNextQuestion(s: FastMoneyState) {
  const answers = s.players[s.turn].answers;
  for (let step = 1; step <= FAST_MONEY_QUESTIONS; step++) {
    const q = (s.current + step) % FAST_MONEY_QUESTIONS;
    if (answers[q]!.text === null) {
      s.current = q;
      return;
    }
  }
  endTurn(s); // all five answered
}

function endTurn(s: FastMoneyState) {
  s.phase = "judging";
  s.clockRunning = false;
  for (const a of s.players[s.turn].answers) {
    if (a.text === null) Object.assign(a, blankAnswer(), { shown: true, judged: true });
  }
  finishJudgingIfDone(s);
}

/** Judging, or revealing what's left after an early win (those answers can't change the result). */
function requireJudging(s: FastMoneyState, slot: FastMoneyAnswer) {
  if (s.phase === "judging") return;
  if (s.phase === "done" && s.outcome?.won && !slot.judged) return;
  throw new IllegalActionError("Not allowed now (needs the judging step).");
}

function judge(s: FastMoneyState, question: number, answer: number | null) {
  const slot = s.players[s.turn].answers[question];
  if (!slot) throw new IllegalActionError(`There is no question ${question + 1}.`);
  requireJudging(s, slot);
  if (slot.text === null) throw new IllegalActionError(`There is no answer to question ${question + 1} to judge.`);
  const board = s.surveys[question]!.answers;
  if (answer !== null && (!Number.isInteger(answer) || answer < 0 || answer >= board.length)) {
    throw new IllegalActionError(`There is no answer #${answer + 1} on that survey.`);
  }
  slot.answer = answer;
  slot.points = answer === null ? 0 : board[answer]!.points;
  slot.shown = true;
  slot.judged = true;
  finishJudgingIfDone(s);
}

function finishJudgingIfDone(s: FastMoneyState) {
  const total = fastMoneyTotal(s);
  if (s.phase === "done") {
    // Revealing the rest after an early win: the total grows, the prize stays.
    if (s.outcome) s.outcome.total = total;
    return;
  }
  if (total >= s.rule.target) {
    // The target is reached the moment the points go up, even with answers still to judge.
    s.phase = "done";
    s.outcome = { won: true, total, payout: s.rule.grandPrize };
    return;
  }
  if (!s.players[s.turn].answers.every((a) => a.judged)) return;
  if (s.turn === 0) {
    s.phase = "handoff";
  } else {
    s.phase = "done";
    s.outcome = { won: false, total, payout: total * s.rule.perPoint };
  }
}
