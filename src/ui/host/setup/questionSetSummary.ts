// Plain-English description of a question set against the chosen rules, for the setup screen
// and the question set editor. Pure, so the wording is easy to test.

import type { QuestionBanks } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import { FAST_MONEY_QUESTION_COUNT, type QuestionSet } from "../../../data/questionSets";
import type { GameRules } from "../../../engine/rules";

export type SetSection = "rounds" | "suddenDeath" | "fastMoney";

/** Finds a survey by id; null while the banks are still loading (so nothing looks missing yet). */
export type SurveyLookup = ((id: string) => Survey | undefined) | null;

export interface MissingQuestion {
  id: string;
  /** "Round 2", "Sudden Death 1", "Fast Money 3". */
  where: string;
}

export interface QuestionSetSummary {
  rounds: string;
  suddenDeath: string;
  fastMoney: string;
  /** Gentle notes about how the set fits the rules (none = it fits). */
  notes: string[];
  missing: MissingQuestion[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const answerCountText = (n: number) => plural(n, "answer");

/** "Round 1 · Single ×1" from the rules, or "Extra round" past the rules' last round. */
export function roundLabel(rules: GameRules, index: number): string {
  const round = rules.rounds[index];
  return round ? `Round ${index + 1} · ${round.name} ×${round.multiplier}` : "Extra round";
}

const rangeText = (min: number, max: number) => (min === max ? `${min}` : `${min}-${max}`);

/** A note when a round's question is outside the size that round normally uses, else null. */
export function sizeNote(survey: Survey, rules: GameRules, index: number): string | null {
  const round = rules.rounds[index];
  if (!round || (survey.answerCount >= round.minAnswers && survey.answerCount <= round.maxAnswers)) return null;
  return `${round.name} rounds usually use ${rangeText(round.minAnswers, round.maxAnswers)} answers; this one has ${survey.answerCount}.`;
}

const countText = (n: number, none: string) => (n === 0 ? none : plural(n, "question"));

export function summarizeQuestionSet(set: QuestionSet, rules: GameRules, find: SurveyLookup): QuestionSetSummary {
  const notes: string[] = [];
  const ruleRounds = rules.rounds.length;
  const setRounds = set.rounds.length;

  if (setRounds === 0) {
    notes.push("The set has no round questions, so every round uses a random question.");
  } else if (setRounds < ruleRounds) {
    const rest =
      ruleRounds - setRounds === 1
        ? `round ${ruleRounds} uses a random question`
        : `rounds ${setRounds + 1}-${ruleRounds} use random questions`;
    notes.push(`The rules have ${ruleRounds} rounds; the set covers ${setRounds} — ${rest}.`);
  } else if (setRounds > ruleRounds) {
    const extra = setRounds - ruleRounds;
    // A repeating last round keeps counting up, so the extras do get played then.
    notes.push(
      rules.repeatLastRound
        ? `${plural(extra, "extra round question")} will only be used if the last round repeats.`
        : `${plural(extra, "extra round question")} won't be used.`,
    );
  }

  if (set.suddenDeath.length > 0 && !rules.suddenDeath.enabled) {
    notes.push("The rules have Sudden Death off, so the set's Sudden Death questions won't be used.");
  }
  if (set.fastMoney.length > 0 && !rules.fastMoney.enabled) {
    notes.push("The rules have Fast Money off, so the set's Fast Money questions won't be used.");
  }

  const missing: MissingQuestion[] = [];
  if (find) {
    set.rounds.forEach((id, i) => {
      const survey = find(id);
      if (!survey) missing.push({ id, where: `Round ${i + 1}` });
      else if (i < ruleRounds) {
        const note = sizeNote(survey, rules, i);
        if (note) notes.push(`Round ${i + 1}: ${note}`);
      }
    });
    set.suddenDeath.forEach((id, i) => {
      if (!find(id)) missing.push({ id, where: `Sudden Death ${i + 1}` });
    });
    set.fastMoney.forEach((id, i) => {
      if (!find(id)) missing.push({ id, where: `Fast Money ${i + 1}` });
    });
    // The game only uses the set's Fast Money when all five are there.
    if (set.fastMoney.some((id) => !find(id))) {
      notes.push("A Fast Money question is missing, so Fast Money uses five random questions.");
    }
  }

  return {
    rounds: countText(setRounds, "None (random)"),
    suddenDeath: countText(set.suddenDeath.length, "None (random)"),
    fastMoney: set.fastMoney.length === FAST_MONEY_QUESTION_COUNT ? plural(FAST_MONEY_QUESTION_COUNT, "question") : "Random",
    notes,
    missing,
  };
}

/** Looks up any question (main, Sudden Death or custom) by id. */
export function lookupFromBanks(banks: QuestionBanks): (id: string) => Survey | undefined {
  const byId = new Map<string, Survey>();
  for (const survey of [...banks.custom, ...banks.main, ...banks.suddenDeath]) {
    if (!byId.has(survey.id)) byId.set(survey.id, survey);
  }
  return (id) => byId.get(id);
}

/** What each section searches: custom questions first, since the host wrote them for a reason. */
export function searchSources(banks: QuestionBanks): { main: Survey[]; suddenDeath: Survey[] } {
  return {
    main: [...banks.custom.filter((s) => s.custom === "main"), ...banks.main],
    suddenDeath: [...banks.custom.filter((s) => s.custom === "suddenDeath"), ...banks.suddenDeath],
  };
}
