// Test helper: the GameHost fields for champions and the question browser, inert.
// Test fakes spread this in so they only implement the parts they exercise.

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
};
