// Small read-only helpers the Fast Money host screens share.

import type { FastMoneyAnswer, FastMoneyState } from "../../../engine/fastMoney";

export const formatDollars = (amount: number) => `$${amount.toLocaleString("en-US")}`;

/** The answers of whoever is playing now. */
export const currentAnswers = (fm: FastMoneyState): FastMoneyAnswer[] => fm.players[fm.turn].answers;

/** Whole seconds left on the clock, rounded up so it reads 20 at the start and 1 just before zero. */
export const secondsLeft = (fm: FastMoneyState) => Math.ceil(fm.timeLeftMs / 1000);

/**
 * Questions the current player passed. The engine doesn't record passes, so this is
 * inferred: an unanswered question they've already moved past (before the current one,
 * or anywhere once they've wrapped back around to a passed question).
 */
export function passedQuestions(fm: FastMoneyState): Set<number> {
  const passed = new Set<number>();
  if (fm.phase !== "answering") return passed;
  const answers = currentAnswers(fm);
  const wrapped = answers.some((a, i) => i > fm.current && a.text !== null);
  answers.forEach((a, i) => {
    if (a.text === null && i !== fm.current && (i < fm.current || wrapped)) passed.add(i);
  });
  return passed;
}

/** The next answer (in order) still waiting to go up on the board. */
export function nextToShow(fm: FastMoneyState): number | null {
  if (fm.phase !== "judging") return null;
  const i = currentAnswers(fm).findIndex((a) => a.text !== null && !a.shown);
  return i < 0 ? null : i;
}

/** The next answer that is up on the board but not judged yet. */
export function nextToJudge(fm: FastMoneyState): number | null {
  if (fm.phase !== "judging") return null;
  const i = currentAnswers(fm).findIndex((a) => a.text !== null && a.shown && !a.judged);
  return i < 0 ? null : i;
}
