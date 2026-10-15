// Questions the host writes themselves. They are saved in the browser and play
// like any other survey, but are never drawn at random: the host picks them
// (from the question bank browser or a question set).

import type { Survey } from "./bank";
import type { JsonStorage } from "./jsonStorage";

export const CUSTOM_ID_PREFIX = "custom-q-";
export const MAX_ANSWERS = 8;

export interface CustomQuestionInput {
  question: string;
  answers: { text: string; points: number }[];
  /** A single-answer question for Sudden Death instead of a main-game survey. */
  suddenDeath: boolean;
}

export const isCustomId = (id: string) => id.startsWith(CUSTOM_ID_PREFIX);

const sameText = (a: string) => a.trim().toLowerCase().replace(/\s+/g, " ");

/** Every problem with a custom question, in plain words. Empty means it can be saved. */
export function validateCustomQuestion(input: CustomQuestionInput): string[] {
  const errors: string[] = [];
  if (!input.question?.trim()) errors.push("Write the question.");
  const answers = input.answers ?? [];
  if (input.suddenDeath) {
    if (answers.length !== 1) errors.push("A Sudden Death question has exactly one answer.");
  } else if (answers.length < 2 || answers.length > MAX_ANSWERS) {
    errors.push(`A main-game question needs 2 to ${MAX_ANSWERS} answers.`);
  }
  answers.forEach((a, i) => {
    if (!a.text?.trim()) errors.push(`Answer ${i + 1} needs text.`);
    if (!Number.isInteger(a.points) || a.points < 1) errors.push(`Answer ${i + 1}: points must be a whole number of at least 1.`);
  });
  const seen = new Set<string>();
  for (const a of answers) {
    const key = sameText(a.text ?? "");
    if (key && seen.has(key)) errors.push(`"${a.text.trim()}" is listed twice.`);
    seen.add(key);
  }
  return errors;
}

/** A saved custom question as a survey: answers in board order (most points first). */
export function toCustomSurvey(input: CustomQuestionInput, id: string): Survey {
  const answers = input.answers
    .map((a) => ({ text: a.text.trim(), points: a.points }))
    .sort((a, b) => b.points - a.points);
  return {
    id,
    season: 0,
    answerCount: answers.length,
    question: input.question.trim(),
    total: answers.reduce((sum, a) => sum + a.points, 0),
    answers,
    source: "custom",
    custom: input.suddenDeath ? "suddenDeath" : "main",
  };
}

function isStoredSurvey(value: unknown): value is Survey {
  if (!value || typeof value !== "object") return false;
  const s = value as Survey;
  return (
    typeof s.id === "string" &&
    isCustomId(s.id) &&
    (s.custom === "main" || s.custom === "suddenDeath") &&
    typeof s.question === "string" &&
    Array.isArray(s.answers) &&
    s.answers.every((a) => typeof a?.text === "string" && Number.isInteger(a?.points))
  );
}

export interface CustomQuestionStore {
  list(): Survey[];
  /** Throws with the reasons if the question is invalid. */
  add(input: CustomQuestionInput): Survey;
  update(id: string, input: CustomQuestionInput): Survey;
  remove(id: string): void;
  /** A saved question as form input, for editing. */
  toInput(survey: Survey): CustomQuestionInput;
}

export function createCustomQuestionStore(storage: JsonStorage): CustomQuestionStore {
  const stored = storage.load();
  let surveys: Survey[] = Array.isArray(stored) ? stored.filter(isStoredSurvey) : [];
  const persist = () => storage.save(surveys);

  const checked = (input: CustomQuestionInput) => {
    const errors = validateCustomQuestion(input);
    if (errors.length) throw new Error(errors.join(" "));
  };

  return {
    list: () => [...surveys],
    add(input) {
      checked(input);
      const survey = toCustomSurvey(input, `${CUSTOM_ID_PREFIX}${crypto.randomUUID()}`);
      surveys = [...surveys, survey];
      persist();
      return survey;
    },
    update(id, input) {
      const at = surveys.findIndex((s) => s.id === id);
      if (at < 0) throw new Error(`No custom question with id "${id}".`);
      checked(input);
      const survey = toCustomSurvey(input, id);
      surveys = surveys.with(at, survey);
      persist();
      return survey;
    },
    remove(id) {
      surveys = surveys.filter((s) => s.id !== id);
      persist();
    },
    toInput: (survey) => ({
      question: survey.question,
      answers: survey.answers.map((a) => ({ ...a })),
      suddenDeath: survey.custom === "suddenDeath",
    }),
  };
}
