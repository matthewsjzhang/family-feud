// What the audience board is allowed to see, and the moments it should animate.
// The board window only ever receives snapshots, never the full game state, so
// unrevealed answers can't be read from the audience screen.

import {
  fastMoneyTotal,
  isPlayer1Hidden,
  type FastMoneyOutcome,
  type FastMoneyPhase,
  type FastMoneyState,
} from "../engine/fastMoney";
import type { GameState, RoundPhase, SlotState, Team } from "../engine/mainGame";

export interface SlotView {
  /** 1-based position on the board. */
  number: number;
  state: SlotState;
  /** Null while hidden. */
  text: string | null;
  points: number | null;
}

export interface RoundView {
  kind: "round" | "suddenDeath";
  number: number;
  name: string;
  multiplier: number;
  question: string;
  slots: SlotView[];
  bank: number;
  strikes: number;
  phase: RoundPhase;
  control: Team | null;
  /** winner: who won the face-off (decides play or pass). */
  faceOff: { buzzed: Team | null; winner: Team | null; players: [string, string] };
  winner: Team | null;
  awarded: number;
}

/** One Fast Money answer as the audience sees it. */
export interface FastMoneyCellView {
  /** Null until the host puts it on the board (or while covered). "" = no answer given. */
  text: string | null;
  /** Null until judged ("survey says"). */
  points: number | null;
}

export interface FastMoneyView {
  /** The winning family playing for the prize. */
  family: string;
  players: [string, string];
  turn: 0 | 1;
  phase: FastMoneyPhase;
  /** Question the current player is on (0-4). */
  current: number;
  timeLeftMs: number;
  clockRunning: boolean;
  /** 5 rows of [player 1, player 2]. Questions are never shown: the host reads them. */
  rows: [FastMoneyCellView, FastMoneyCellView][];
  /** Player 1's answers (and the total) are covered while player 2 plays. */
  player1Hidden: boolean;
  /** Points judged so far; null while covered. */
  total: number | null;
  target: number;
  outcome: FastMoneyOutcome | null;
}

export interface BoardSnapshot {
  families: [{ name: string; score: number }, { name: string; score: number }];
  round: RoundView | null;
  winner: Team | null;
  /** Set while Fast Money is being played; the board switches to the Fast Money screen. */
  fastMoney: FastMoneyView | null;
}

export type BoardEvent =
  | { type: "newRound" }
  | { type: "buzz"; team: Team }
  /** earned: revealed in play (scores); otherwise revealed after the round. */
  | { type: "reveal"; slot: number; earned: boolean }
  /** count: how many X's to flash (1 in a face-off or steal, else the strike total). */
  | { type: "strike"; count: number }
  | { type: "roundWon"; team: Team; points: number }
  | { type: "gameWon"; team: Team }
  // Fast Money
  | { type: "fmStart" }
  | { type: "fmClockStart" }
  /** The clock hit zero before all five answers. */
  | { type: "fmTimeUp" }
  /** Player 2 repeated player 1's answer: double buzzer, try again. */
  | { type: "fmDuplicate" }
  /** Player 1's covered answers come back up after player 2 has answered. */
  | { type: "fmUncover" }
  | { type: "fmAnswerShown"; player: 0 | 1; question: number }
  | { type: "fmPoints"; player: 0 | 1; question: number; points: number }
  | { type: "fmResult"; won: boolean; total: number; payout: number };

export function toFastMoneyView(fm: FastMoneyState, family: string): FastMoneyView {
  const hidden = isPlayer1Hidden(fm);
  const cell = (player: 0 | 1, q: number): FastMoneyCellView => {
    const a = fm.players[player].answers[q]!;
    if (player === 0 && hidden) return { text: null, points: null };
    return { text: a.shown ? (a.text ?? "") : null, points: a.judged ? a.points : null };
  };
  return {
    family,
    players: [fm.players[0].name, fm.players[1].name],
    turn: fm.turn,
    phase: fm.phase,
    current: fm.current,
    timeLeftMs: fm.timeLeftMs,
    clockRunning: fm.clockRunning,
    rows: fm.surveys.map((_, q) => [cell(0, q), cell(1, q)]),
    player1Hidden: hidden,
    total: hidden ? null : fastMoneyTotal(fm),
    target: fm.rule.target,
    outcome: fm.outcome,
  };
}

export function toSnapshot(state: GameState, fastMoney: FastMoneyState | null = null): BoardSnapshot {
  const [a, b] = state.families;
  const r = state.round;
  return {
    fastMoney: fastMoney && state.winner !== null ? toFastMoneyView(fastMoney, state.families[state.winner].name) : null,
    families: [
      { name: a.name, score: a.score },
      { name: b.name, score: b.score },
    ],
    winner: state.winner,
    round: r && {
      kind: r.kind,
      number: r.number,
      name: r.name,
      multiplier: r.multiplier,
      question: r.survey.question,
      slots: r.survey.answers.map((answer, i) => {
        const hidden = r.slots[i] === "hidden";
        return {
          number: i + 1,
          state: r.slots[i]!,
          text: hidden ? null : answer.text,
          points: hidden ? null : answer.points,
        };
      }),
      bank: r.bank,
      strikes: r.strikes,
      phase: r.phase,
      control: r.control,
      faceOff: {
        buzzed: r.faceOff.buzzed,
        winner: r.faceOff.winner,
        players: [a.players[r.faceOff.players[0]]!, b.players[r.faceOff.players[1]]!],
      },
      winner: r.winner,
      awarded: r.awarded,
    },
  };
}

const sameRound = (prev: GameState, next: GameState) =>
  !!prev.round &&
  !!next.round &&
  prev.round.number === next.round.number &&
  prev.round.kind === next.round.kind &&
  prev.round.survey.id === next.round.survey.id;

/** The things that just happened between two states, in the order the board should show them. */
export function deriveEvents(prev: GameState | null, next: GameState): BoardEvent[] {
  const r = next.round;
  if (!r) return [];
  if (!prev || !sameRound(prev, next)) return [{ type: "newRound" }];

  const p = prev.round!;
  const events: BoardEvent[] = [];

  if (p.faceOff.buzzed === null && r.faceOff.buzzed !== null) events.push({ type: "buzz", team: r.faceOff.buzzed });

  r.slots.forEach((slot, i) => {
    if (p.slots[i] === "hidden" && slot !== "hidden") events.push({ type: "reveal", slot: i, earned: slot === "won" });
  });

  const faceOffMiss =
    p.phase === "faceOff" &&
    // first player missed...
    ((p.faceOff.first === null && r.faceOff.first?.answer === null) ||
      // ...or the second did and the next pair comes up
      (p.faceOff.first !== null && r.phase === "faceOff" && r.faceOff.first === null && r.faceOff.buzzed === null));
  const strikeAdded = r.strikes > p.strikes;
  const stealFailed = p.phase === "steal" && r.phase === "over" && r.winner === p.control;
  if (faceOffMiss || stealFailed) events.push({ type: "strike", count: 1 });
  else if (strikeAdded) events.push({ type: "strike", count: r.strikes });

  if (p.phase !== "over" && r.phase === "over" && r.winner !== null) {
    events.push({ type: "roundWon", team: r.winner, points: r.awarded });
  }
  if (prev.winner === null && next.winner !== null) events.push({ type: "gameWon", team: next.winner });
  return events;
}

/** Fast Money moments for the board's sounds and animations. */
export function deriveFastMoneyEvents(prev: FastMoneyState | null, next: FastMoneyState): BoardEvent[] {
  if (!prev) return [{ type: "fmStart" }];
  const events: BoardEvent[] = [];
  if (!prev.clockRunning && next.clockRunning && prev.phase === "ready") events.push({ type: "fmClockStart" });
  if (next.duplicates > prev.duplicates) events.push({ type: "fmDuplicate" });
  if (prev.phase === "answering" && next.phase !== "answering" && next.timeLeftMs === 0) events.push({ type: "fmTimeUp" });
  if (isPlayer1Hidden(prev) && !isPlayer1Hidden(next)) events.push({ type: "fmUncover" });

  for (const player of [0, 1] as const) {
    next.players[player].answers.forEach((a, question) => {
      const before = prev.players[player].answers[question]!;
      // Blank answers are shown and scored automatically; they don't get their own moment.
      if (a.text === null) return;
      if (!before.shown && a.shown && !a.judged) events.push({ type: "fmAnswerShown", player, question });
      if ((!before.judged && a.judged) || (before.judged && a.judged && before.points !== a.points)) {
        events.push({ type: "fmPoints", player, question, points: a.points });
      }
    });
  }

  if (!prev.outcome && next.outcome) events.push({ type: "fmResult", ...next.outcome });
  return events;
}
