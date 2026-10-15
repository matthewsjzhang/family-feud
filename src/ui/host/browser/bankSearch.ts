// Pure search and filtering over the question banks, for the host's question browser.
// Each bank is indexed once (normalised question + answers); a search is then one O(n) pass.

import type { Survey } from "../../../data/bank";
import type { UpcomingRound } from "../../../engine/mainGame";

export type BankKind = "main" | "suddenDeath";

/** Which questions to list: everything, the show's own surveys, or the host's custom ones. */
export type SourceFilter = "all" | "original" | "custom";

export interface BrowserFilters {
  /** Free text; every word must appear in the question or an answer. */
  query: string;
  /** Season number, or null for any season. */
  season: number | null;
  /** Answer count, or null for any (ignored for the Sudden Death bank). */
  answers: number | null;
  hidePlayed: boolean;
  /**
   * Only surveys of the usual size for the next round (the size a random draw would use).
   * Any survey of the right kind can still be played next; this is a browsing aid.
   */
  fitsNext: boolean;
  /** Optional so older callers keep compiling; missing means "all". */
  source?: SourceFilter;
}

export const NO_FILTERS: BrowserFilters = {
  query: "",
  season: null,
  answers: null,
  hidePlayed: false,
  fitsNext: false,
  source: "all",
};

export interface FilterContext {
  bank: BankKind;
  isUsed(id: string): boolean;
  upcoming: UpcomingRound | null;
}

export interface IndexedSurvey {
  survey: Survey;
  /** Normalised question and answers, space separated. */
  text: string;
}

/**
 * Lower-case, strip accents, drop apostrophes ("don't" -> "dont") and turn any other
 * punctuation into spaces ("mother-in-law" -> "mother in law", "BAR/NIGHTCLUB" -> "bar nightclub").
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Query words after normalising; empty when the query has no letters or digits. */
export function queryWords(query: string): string[] {
  const n = normalize(query);
  return n ? n.split(" ") : [];
}

const indexCache = new WeakMap<readonly Survey[], IndexedSurvey[]>();

/** Index a bank for searching. Cached per bank array, so repeated calls are free. */
export function indexBank(bank: readonly Survey[]): IndexedSurvey[] {
  let index = indexCache.get(bank);
  if (!index) {
    index = bank.map((survey) => ({
      survey,
      // Leading space lets a word match at the start of the text like anywhere else.
      text: " " + normalize([survey.question, ...survey.answers.map((a) => a.text)].join(" ")),
    }));
    indexCache.set(bank, index);
  }
  return index;
}

const rangeText = (min: number, max: number) => (min === max ? `${min}` : `${min}-${max}`);

/**
 * Is this survey the usual size for the next round, i.e. the kind of survey a random
 * draw would pick? Stricter than "can play next" (see fitProblem): hand-picked surveys
 * of any size play, so this only drives the "Usual size for the next round" filter.
 */
export function fitsUpcoming(survey: Survey, bank: BankKind, upcoming: UpcomingRound | null): boolean {
  if (!upcoming || fitProblem(survey, bank, upcoming) !== null) return false;
  return upcoming.kind === "suddenDeath" || sizeNote(survey, bank, upcoming) === null;
}

/**
 * Why a survey would not be used by the very next round, or null when it would be.
 * Only the kind matters: a hand-picked main-game survey of any size plays at the next
 * main round. With no upcoming round (setup screen, game over) there is nothing to warn about.
 */
export function fitProblem(_survey: Survey, bank: BankKind, upcoming: UpcomingRound | null): string | null {
  if (!upcoming) return null;
  if (bank === "suddenDeath") {
    return upcoming.kind === "suddenDeath" ? null : "Sudden Death questions only play in Sudden Death";
  }
  if (upcoming.kind === "suddenDeath") return "The next round is Sudden Death, which uses its own questions";
  return null;
}

/**
 * A soft, non-blocking note when a main-game survey is a different size from what the
 * next round usually draws (e.g. a 3-answer custom question in a 6-8 answer round), else null.
 */
export function sizeNote(survey: Survey, bank: BankKind, upcoming: UpcomingRound | null): string | null {
  if (!upcoming || bank !== "main" || upcoming.kind !== "round") return null;
  const { minAnswers: min, maxAnswers: max } = upcoming;
  if (survey.answerCount >= min && survey.answerCount <= max) return null;
  return `${upcoming.name} usually has ${rangeText(min, max)} answers; this one has ${survey.answerCount}. That's fine, it still plays.`;
}

export const isCustomSurvey = (survey: Survey) => survey.custom !== undefined;

/** Surveys in board order that pass every filter. */
export function searchBank(bank: readonly Survey[], filters: BrowserFilters, ctx: FilterContext): Survey[] {
  const words = queryWords(filters.query).map((w) => " " + w);
  const answers = ctx.bank === "main" ? filters.answers : null;
  const fits = filters.fitsNext && ctx.upcoming !== null;
  const source = filters.source ?? "all";
  const out: Survey[] = [];
  for (const { survey, text } of indexBank(bank)) {
    // Cheap checks first; the text scan is the expensive part.
    // Custom questions have season 0, so choosing a season leaves them out.
    if (filters.season !== null && survey.season !== filters.season) continue;
    if (source !== "all" && isCustomSurvey(survey) !== (source === "custom")) continue;
    if (answers !== null && survey.answerCount !== answers) continue;
    if (fits && !fitsUpcoming(survey, ctx.bank, ctx.upcoming)) continue;
    if (filters.hidePlayed && ctx.isUsed(survey.id)) continue;
    // Words match from the start of a word: "law" finds "in law" but "aw" does not.
    if (!words.every((w) => text.includes(w))) continue;
    out.push(survey);
  }
  return out;
}

/** A random unplayed survey from the results, or null if all have been played. */
export function pickRandom(
  results: readonly Survey[],
  isUsed: (id: string) => boolean,
  random: () => number = Math.random,
): Survey | null {
  const fresh = results.filter((s) => !isUsed(s.id));
  return fresh.length ? fresh[Math.floor(random() * fresh.length)]! : null;
}

/** Distinct seasons in a bank, ascending. Custom questions (season 0) have no season. */
export function seasonsOf(bank: readonly Survey[]): number[] {
  return [...new Set(bank.filter((s) => !isCustomSurvey(s)).map((s) => s.season))].sort((a, b) => a - b);
}
