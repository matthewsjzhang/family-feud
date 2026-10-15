// Pure search and filtering over the question banks, for the host's question browser.
// Each bank is indexed once (normalised question + answers); a search is then one O(n) pass.

import type { Survey } from "../../../data/bank";
import type { UpcomingRound } from "../../../engine/mainGame";

export type BankKind = "main" | "suddenDeath";

export interface BrowserFilters {
  /** Free text; every word must appear in the question or an answer. */
  query: string;
  /** Season number, or null for any season. */
  season: number | null;
  /** Answer count, or null for any (ignored for the Sudden Death bank). */
  answers: number | null;
  hidePlayed: boolean;
  /** Only surveys the next round could use. */
  fitsNext: boolean;
}

export const NO_FILTERS: BrowserFilters = {
  query: "",
  season: null,
  answers: null,
  hidePlayed: false,
  fitsNext: false,
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

/** Could the next round use this survey? */
export function fitsUpcoming(survey: Survey, bank: BankKind, upcoming: UpcomingRound | null): boolean {
  return fitProblem(survey, bank, upcoming) === null && upcoming !== null;
}

/**
 * Why a survey would not be used by the very next round, or null when it would be.
 * With no upcoming round (setup screen, game over) there is nothing to warn about yet.
 */
export function fitProblem(survey: Survey, bank: BankKind, upcoming: UpcomingRound | null): string | null {
  if (!upcoming) return null;
  if (bank === "suddenDeath") {
    return upcoming.kind === "suddenDeath" ? null : "Sudden Death questions only play in Sudden Death";
  }
  if (upcoming.kind === "suddenDeath") return "The next round is Sudden Death, which uses its own questions";
  if (survey.answerCount < upcoming.minAnswers || survey.answerCount > upcoming.maxAnswers) {
    const range =
      upcoming.minAnswers === upcoming.maxAnswers
        ? `${upcoming.minAnswers}`
        : `${upcoming.minAnswers}-${upcoming.maxAnswers}`;
    return `${upcoming.name} needs a ${range} answer survey`;
  }
  return null;
}

/** Surveys in board order that pass every filter. */
export function searchBank(bank: readonly Survey[], filters: BrowserFilters, ctx: FilterContext): Survey[] {
  const words = queryWords(filters.query).map((w) => " " + w);
  const answers = ctx.bank === "main" ? filters.answers : null;
  const fits = filters.fitsNext && ctx.upcoming !== null;
  const out: Survey[] = [];
  for (const { survey, text } of indexBank(bank)) {
    // Cheap checks first; the text scan is the expensive part.
    if (filters.season !== null && survey.season !== filters.season) continue;
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

/** Distinct seasons in a bank, ascending. */
export function seasonsOf(bank: readonly Survey[]): number[] {
  return [...new Set(bank.map((s) => s.season))].sort((a, b) => a - b);
}
