// Test helper: the GameHost fields for champions, the question browser, custom
// questions and question sets, all inert. Test fakes spread this in so they only
// implement the parts they exercise.

import type { GameHost } from "./useGameHost";

export const INERT_CHAMPIONS_AND_BROWSER: Pick<
  GameHost,
  | "champion"
  | "championTeam"
  | "retiredChampion"
  | "finishGame"
  | "clearChampion"
  | "banks"
  | "isUsed"
  | "queued"
  | "queueSurvey"
  | "clearQueue"
  | "findSurvey"
  | "addCustomQuestion"
  | "updateCustomQuestion"
  | "removeCustomQuestion"
  | "toCustomInput"
  | "questionSets"
  | "saveQuestionSet"
  | "removeQuestionSet"
  | "activeQuestionSet"
> = {
  champion: null,
  championTeam: null,
  retiredChampion: null,
  finishGame: () => {},
  clearChampion: () => {},
  banks: null,
  isUsed: () => false,
  queued: null,
  queueSurvey: () => {},
  clearQueue: () => {},
  findSurvey: () => undefined,
  addCustomQuestion: () => null,
  updateCustomQuestion: () => null,
  removeCustomQuestion: () => {},
  toCustomInput: (survey) => ({
    question: survey.question,
    answers: survey.answers.map((a) => ({ ...a })),
    suddenDeath: survey.custom === "suddenDeath",
  }),
  questionSets: [],
  saveQuestionSet: () => null,
  removeQuestionSet: () => {},
  activeQuestionSet: null,
};
