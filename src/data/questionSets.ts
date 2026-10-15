// Question sets ("preset games"): hand-picked questions, in order, for a game.
// Separate from the rules preset: the rules decide how many rounds and their
// multipliers; the set decides which questions are asked. Any round, Sudden
// Death or Fast Money question the set doesn't cover is picked at random.

import type { JsonStorage } from "./jsonStorage";

export const FAST_MONEY_QUESTION_COUNT = 5;

export interface QuestionSet {
  id: string;
  name: string;
  /** Survey ids for round 1, 2, 3... in order. */
  rounds: string[];
  /** Sudden Death questions; the first not yet asked this game is used. */
  suddenDeath: string[];
  /** Exactly five survey ids, or empty for random Fast Money questions. */
  fastMoney: string[];
}

export function validateQuestionSet(set: QuestionSet): string[] {
  const errors: string[] = [];
  if (!set.name?.trim()) errors.push("Give the question set a name.");
  const all = [...set.rounds, ...set.suddenDeath, ...set.fastMoney];
  if (all.length === 0) errors.push("Pick at least one question.");
  if (set.fastMoney.length !== 0 && set.fastMoney.length !== FAST_MONEY_QUESTION_COUNT) {
    errors.push(`Fast Money needs exactly five questions, or none for random ones.`);
  }
  if (new Set(all).size !== all.length) errors.push("A question is used twice in this set.");
  return errors;
}

/** Ids in the set that `exists` doesn't recognise (e.g. a deleted custom question). */
export function missingQuestions(set: QuestionSet, exists: (id: string) => boolean): string[] {
  return [...set.rounds, ...set.suddenDeath, ...set.fastMoney].filter((id) => !exists(id));
}

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function isStoredSet(value: unknown): value is QuestionSet {
  if (!value || typeof value !== "object") return false;
  const s = value as QuestionSet;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    isIdList(s.rounds) &&
    isIdList(s.suddenDeath) &&
    isIdList(s.fastMoney)
  );
}

export interface QuestionSetStore {
  list(): QuestionSet[];
  get(id: string): QuestionSet | undefined;
  /** Add or replace by id (a blank id gets a new one). Throws with the reasons if invalid. */
  save(set: QuestionSet): QuestionSet;
  remove(id: string): void;
}

export function createQuestionSetStore(storage: JsonStorage): QuestionSetStore {
  const stored = storage.load();
  let sets: QuestionSet[] = Array.isArray(stored) ? stored.filter(isStoredSet) : [];
  const persist = () => storage.save(sets);

  return {
    list: () => sets.map((s) => structuredClone(s)),
    get: (id) => {
      const found = sets.find((s) => s.id === id);
      return found && structuredClone(found);
    },
    save(set) {
      const errors = validateQuestionSet(set);
      if (errors.length) throw new Error(errors.join(" "));
      const clean: QuestionSet = {
        ...structuredClone(set),
        id: set.id || `qset-${crypto.randomUUID()}`,
        name: set.name.trim(),
      };
      const at = sets.findIndex((s) => s.id === clean.id);
      sets = at >= 0 ? sets.with(at, clean) : [...sets, clean];
      persist();
      return structuredClone(clean);
    },
    remove(id) {
      sets = sets.filter((s) => s.id !== id);
      persist();
    },
  };
}
