// Main game engine: a pure reducer for face-offs, play/pass, strikes, steals,
// scoring and Sudden Death. Round order, multipliers and the win condition all
// come from GameRules. Surveys are picked outside the reducer (see data/bank.ts)
// and passed in with "startRound", which keeps this module free of randomness.

import type { Survey } from "../data/bank";
import { validateRules, type GameRules } from "./rules";

export type Team = 0 | 1;
export const otherTeam = (team: Team): Team => (team === 0 ? 1 : 0);

/** hidden: not revealed. won: revealed during play (scores). shown: revealed after the round (no points). */
export type SlotState = "hidden" | "won" | "shown";
export type RoundPhase = "faceOff" | "playOrPass" | "playing" | "steal" | "over";

export interface FamilyState {
  name: string;
  players: string[];
  score: number;
  /** Index of the player who faces off next. */
  faceOffNext: number;
}

export interface FaceOffState {
  /** Player index from each family at the buzzer. */
  players: [number, number];
  buzzed: Team | null;
  /** Whose player answers next. */
  turn: Team | null;
  first: { team: Team; answer: number | null } | null;
  winner: Team | null;
}

export interface RoundState {
  kind: "round" | "suddenDeath";
  number: number;
  name: string;
  multiplier: number;
  survey: Survey;
  slots: SlotState[];
  /** Points revealed so far, before the multiplier. */
  bank: number;
  phase: RoundPhase;
  faceOff: FaceOffState;
  control: Team | null;
  /** Player index answering on the board (controlling family). */
  currentPlayer: number | null;
  strikes: number;
  winner: Team | null;
  /** Points added to the winner's score (bank x multiplier). */
  awarded: number;
}

export interface GameState {
  rules: GameRules;
  families: [FamilyState, FamilyState];
  /** Normal rounds started so far (Sudden Death not counted). */
  roundsPlayed: number;
  round: RoundState | null;
  winner: Team | null;
}

/** Board answers are 0-based indexes into survey.answers; null means "not on the board". */
export type GameAction =
  | { type: "startRound"; survey: Survey }
  | { type: "buzz"; team: Team }
  | { type: "faceOffAnswer"; team: Team; answer: number | null }
  | { type: "playOrPass"; play: boolean }
  | { type: "answer"; answer: number | null }
  | { type: "steal"; answer: number | null }
  | { type: "reveal"; answer: number }
  | { type: "adjustScore"; team: Team; delta: number };

export interface UpcomingRound {
  kind: "round" | "suddenDeath";
  number: number;
  name: string;
  multiplier: number;
  minAnswers: number;
  maxAnswers: number;
}

export class IllegalActionError extends Error {}

const STRIKES_FOR_STEAL = 3;

export function createGame(rules: GameRules, families: { name: string; players: string[] }[]): GameState {
  const errors = validateRules(rules);
  if (errors.length) throw new IllegalActionError(errors.join(" "));
  if (families.length !== 2) throw new IllegalActionError("A game needs exactly two families.");
  for (const f of families) {
    if (!f.players.length) throw new IllegalActionError(`The ${f.name} family needs at least one player.`);
  }
  const [a, b] = families.map((f) => ({ name: f.name, players: [...f.players], score: 0, faceOffNext: 0 }));
  return { rules: structuredClone(rules), families: [a!, b!], roundsPlayed: 0, round: null, winner: null };
}

/** The round that "startRound" will begin, or null if the game is over or a round is still being played. */
export function nextRound(state: GameState): UpcomingRound | null {
  if (state.winner !== null) return null;
  if (state.round && state.round.phase !== "over") return null;
  const { rules, roundsPlayed } = state;

  if (roundsPlayed < rules.rounds.length || rules.repeatLastRound) {
    const rule = rules.rounds[Math.min(roundsPlayed, rules.rounds.length - 1)]!;
    return { kind: "round", number: roundsPlayed + 1, ...rule };
  }
  if (rules.suddenDeath.enabled) {
    // Sudden Death uses single-answer surveys from its own bank.
    const { multiplier } = rules.suddenDeath;
    return { kind: "suddenDeath", number: roundsPlayed + 1, name: "Sudden Death", multiplier, minAnswers: 1, maxAnswers: 1 };
  }
  return null;
}

/** Whether the reducer would accept this action (for enabling host buttons). */
export function canApply(state: GameState, action: GameAction): boolean {
  try {
    gameReducer(state, action);
    return true;
  } catch {
    return false;
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  const s = structuredClone(state);
  switch (action.type) {
    case "startRound":
      startRound(s, action.survey);
      break;
    case "buzz": {
      const fo = requirePhase(s, "faceOff").faceOff;
      if (fo.buzzed !== null) throw new IllegalActionError("Someone already buzzed in.");
      fo.buzzed = action.team;
      fo.turn = action.team;
      break;
    }
    case "faceOffAnswer":
      faceOffAnswer(s, action.team, action.answer);
      break;
    case "playOrPass": {
      const round = requirePhase(s, "playOrPass");
      const control = action.play ? round.faceOff.winner! : otherTeam(round.faceOff.winner!);
      round.control = control;
      round.currentPlayer = (round.faceOff.players[control] + 1) % s.families[control].players.length;
      round.strikes = 0;
      round.phase = "playing";
      break;
    }
    case "answer":
      boardAnswer(s, action.answer);
      break;
    case "steal": {
      const round = requirePhase(s, "steal");
      const stealer = otherTeam(round.control!);
      if (action.answer === null) {
        award(s, round.control!);
      } else {
        winSlot(round, action.answer);
        award(s, stealer);
      }
      break;
    }
    case "reveal": {
      const round = requirePhase(s, "over");
      checkHidden(round, action.answer);
      round.slots[action.answer] = "shown";
      break;
    }
    case "adjustScore":
      s.families[action.team].score += action.delta;
      break;
  }
  return s;
}

function requirePhase(s: GameState, phase: RoundPhase): RoundState {
  if (!s.round || s.round.phase !== phase) {
    throw new IllegalActionError(`Not allowed now (needs the ${phase} step).`);
  }
  return s.round;
}

function checkHidden(round: RoundState, answer: number) {
  if (!Number.isInteger(answer) || answer < 0 || answer >= round.slots.length) {
    throw new IllegalActionError(`There is no answer #${answer + 1} on this board.`);
  }
  if (round.slots[answer] !== "hidden") throw new IllegalActionError(`Answer #${answer + 1} is already on the board.`);
}

function winSlot(round: RoundState, answer: number) {
  checkHidden(round, answer);
  round.slots[answer] = "won";
  round.bank += round.survey.answers[answer]!.points;
}

function newFaceOff(s: GameState): FaceOffState {
  return {
    players: [s.families[0].faceOffNext, s.families[1].faceOffNext],
    buzzed: null,
    turn: null,
    first: null,
    winner: null,
  };
}

/** The pair at the buzzer is done; the next face-off uses the next players. */
function advanceFaceOffPlayers(s: GameState, fo: FaceOffState) {
  s.families.forEach((f, team) => {
    f.faceOffNext = (fo.players[team]! + 1) % f.players.length;
  });
}

function startRound(s: GameState, survey: Survey) {
  const upcoming = nextRound(s);
  if (!upcoming) throw new IllegalActionError("The game is over or a round is still being played.");
  if (survey.answerCount < upcoming.minAnswers || survey.answerCount > upcoming.maxAnswers) {
    throw new IllegalActionError(
      `${upcoming.name} needs a survey with ${upcoming.minAnswers}-${upcoming.maxAnswers} answers.`,
    );
  }
  if (upcoming.kind === "round") s.roundsPlayed += 1;
  s.round = {
    kind: upcoming.kind,
    number: upcoming.number,
    name: upcoming.name,
    multiplier: upcoming.multiplier,
    survey: structuredClone(survey),
    slots: survey.answers.map(() => "hidden"),
    bank: 0,
    phase: "faceOff",
    faceOff: newFaceOff(s),
    control: null,
    currentPlayer: null,
    strikes: 0,
    winner: null,
    awarded: 0,
  };
}

function faceOffAnswer(s: GameState, team: Team, answer: number | null) {
  const round = requirePhase(s, "faceOff");
  const fo = round.faceOff;
  if (fo.turn !== team) throw new IllegalActionError("It isn't that family's turn to answer.");
  if (answer !== null) checkHidden(round, answer);

  if (round.kind === "suddenDeath") {
    // Only the #1 answer counts; anything else is a miss and stays hidden.
    if (answer === 0) {
      winSlot(round, 0);
      fo.winner = team;
      fo.turn = null;
      advanceFaceOffPlayers(s, fo);
      award(s, team);
    } else if (fo.first === null) {
      fo.first = { team, answer: null };
      fo.turn = otherTeam(team);
    } else {
      advanceFaceOffPlayers(s, fo);
      round.faceOff = newFaceOff(s);
    }
    return;
  }

  if (answer !== null) winSlot(round, answer);

  if (fo.first === null) {
    if (answer === 0) return winFaceOff(s, round, team);
    fo.first = { team, answer };
    fo.turn = otherTeam(team);
    return;
  }

  const first = fo.first;
  if (first.answer === null && answer === null) {
    advanceFaceOffPlayers(s, fo);
    round.faceOff = newFaceOff(s);
    return;
  }
  const winner =
    first.answer === null ? team : answer === null ? first.team : answer < first.answer ? team : first.team;
  winFaceOff(s, round, winner);
}

function winFaceOff(s: GameState, round: RoundState, team: Team) {
  round.faceOff.winner = team;
  round.faceOff.turn = null;
  advanceFaceOffPlayers(s, round.faceOff);
  round.phase = "playOrPass";
}

function boardAnswer(s: GameState, answer: number | null) {
  const round = requirePhase(s, "playing");
  const family = s.families[round.control!];

  if (answer === null) {
    round.strikes += 1;
    if (round.strikes >= STRIKES_FOR_STEAL) {
      round.phase = "steal";
      round.currentPlayer = null;
      return;
    }
  } else {
    winSlot(round, answer);
    if (round.slots.every((slot) => slot !== "hidden")) {
      award(s, round.control!);
      return;
    }
  }
  round.currentPlayer = (round.currentPlayer! + 1) % family.players.length;
}

function award(s: GameState, team: Team) {
  const round = s.round!;
  round.winner = team;
  round.awarded = round.bank * round.multiplier;
  round.phase = "over";
  round.currentPlayer = null;
  s.families[team].score += round.awarded;
  s.winner = decideWinner(s);
}

function decideWinner(s: GameState): Team | null {
  const round = s.round!;
  if (round.kind === "suddenDeath") return round.winner;

  const [a, b] = s.families.map((f) => f.score) as [number, number];
  const { win, rounds } = s.rules;
  if (win.type === "target") {
    if (s.families[round.winner!].score >= win.target) return round.winner;
    if (Math.max(a, b) >= win.target) return a >= b ? 0 : 1;
    return null;
  }
  if (s.roundsPlayed >= rounds.length && a !== b) return a > b ? 0 : 1;
  return null;
}
