// Maps "the host judged this answer" onto the engine action for whoever is answering now,
// so answer buttons, the typed-guess entry and the 1-8 / x shortcuts all share one rule.

import { otherTeam, type GameAction, type RoundState, type Team } from "../../../engine/mainGame";

/** answer: 0-based board index, or null for "not on the board" / strike. */
export function answerAction(round: RoundState | null, answer: number | null): GameAction | null {
  if (!round) return null;
  switch (round.phase) {
    case "faceOff":
      return round.faceOff.turn === null ? null : { type: "faceOffAnswer", team: round.faceOff.turn, answer };
    case "playing":
      return { type: "answer", answer };
    case "steal":
      return { type: "steal", answer };
    case "over":
      // After the round the host reveals the leftovers; "not on the board" means nothing here.
      return answer === null ? null : { type: "reveal", answer };
    case "playOrPass":
      return null;
  }
}

/** Whether the answer entry box makes sense right now (someone is giving an answer). */
export function isTakingAnswers(round: RoundState | null): boolean {
  if (!round) return false;
  if (round.phase === "faceOff") return round.faceOff.turn !== null;
  return round.phase === "playing" || round.phase === "steal";
}

/** The family that is "on" right now, so the host's eye goes to the right card. */
export function activeTeam(round: RoundState | null): Team | null {
  switch (round?.phase) {
    case "faceOff":
      return round.faceOff.turn;
    case "playOrPass":
      return round.faceOff.winner;
    case "playing":
      return round.control;
    case "steal":
      return round.control === null ? null : otherTeam(round.control);
    default:
      return null;
  }
}

export function roundLabel(r: { kind: "round" | "suddenDeath"; number: number; name: string; multiplier: number }) {
  if (r.kind === "suddenDeath") return `${r.name} ×${r.multiplier}`;
  return `Round ${r.number} · ${r.name}${r.multiplier !== 1 ? ` ×${r.multiplier}` : ""}`;
}
