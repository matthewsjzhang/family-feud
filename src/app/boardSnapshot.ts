// What the audience board is allowed to see, and the moments it should animate.
// The board window only ever receives snapshots, never the full game state, so
// unrevealed answers can't be read from the audience screen.

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
  faceOff: { buzzed: Team | null; players: [string, string] };
  winner: Team | null;
  awarded: number;
}

export interface BoardSnapshot {
  families: [{ name: string; score: number }, { name: string; score: number }];
  round: RoundView | null;
  winner: Team | null;
}

export type BoardEvent =
  | { type: "newRound" }
  | { type: "buzz"; team: Team }
  /** earned: revealed in play (scores); otherwise revealed after the round. */
  | { type: "reveal"; slot: number; earned: boolean }
  /** count: how many X's to flash (1 in a face-off or steal, else the strike total). */
  | { type: "strike"; count: number }
  | { type: "roundWon"; team: Team; points: number }
  | { type: "gameWon"; team: Team };

export function toSnapshot(state: GameState): BoardSnapshot {
  const [a, b] = state.families;
  const r = state.round;
  return {
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
