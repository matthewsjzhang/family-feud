import { describe, expect, it } from "vitest";
import {
  createCustomQuestionStore,
  isCustomId,
  validateCustomQuestion,
  type CustomQuestionInput,
} from "./customQuestions";
import { memoryJsonStorage } from "./jsonStorage";

const pets: CustomQuestionInput = {
  question: "Name a pet our family has owned.",
  answers: [
    { text: "Goldfish", points: 12 },
    { text: "Dog", points: 45 },
    { text: "Cat", points: 30 },
  ],
  suddenDeath: false,
};

describe("validateCustomQuestion", () => {
  it("accepts a normal question", () => {
    expect(validateCustomQuestion(pets)).toEqual([]);
  });

  it("needs question text and answers with text and whole positive points", () => {
    expect(validateCustomQuestion({ ...pets, question: "  " }).join()).toMatch(/question/i);
    expect(validateCustomQuestion({ ...pets, answers: [{ text: "", points: 5 }, ...pets.answers] }).join()).toMatch(/answer 1/i);
    expect(validateCustomQuestion({ ...pets, answers: [{ text: "Dog", points: 0 }, { text: "Cat", points: 2 }] }).join()).toMatch(/points/i);
    expect(validateCustomQuestion({ ...pets, answers: [{ text: "Dog", points: 2.5 }, { text: "Cat", points: 2 }] }).join()).toMatch(/points/i);
  });

  it("needs 2-8 answers for the main game and exactly 1 for Sudden Death", () => {
    expect(validateCustomQuestion({ ...pets, answers: [pets.answers[0]!] }).join()).toMatch(/2.*8/);
    const nine = Array.from({ length: 9 }, (_, i) => ({ text: `A${i}`, points: 9 - i }));
    expect(validateCustomQuestion({ ...pets, answers: nine }).join()).toMatch(/2.*8/);
    expect(validateCustomQuestion({ ...pets, suddenDeath: true }).join()).toMatch(/one answer/i);
    expect(validateCustomQuestion({ ...pets, suddenDeath: true, answers: [{ text: "Dog", points: 60 }] })).toEqual([]);
  });

  it("rejects the same answer twice", () => {
    const twice = { ...pets, answers: [{ text: "Dog", points: 10 }, { text: " dog ", points: 5 }] };
    expect(validateCustomQuestion(twice).join()).toMatch(/twice/i);
  });
});

describe("custom question store", () => {
  it("saves a question as a playable survey, answers sorted by points", () => {
    const store = createCustomQuestionStore(memoryJsonStorage());
    const survey = store.add(pets);
    expect(isCustomId(survey.id)).toBe(true);
    expect(survey).toMatchObject({
      question: "Name a pet our family has owned.",
      answerCount: 3,
      total: 87,
      custom: "main",
      season: 0,
      source: "custom",
    });
    expect(survey.answers.map((a) => a.text)).toEqual(["Dog", "Cat", "Goldfish"]);
    expect(store.list()).toEqual([survey]);
  });

  it("marks Sudden Death questions so they go in that bank", () => {
    const store = createCustomQuestionStore(memoryJsonStorage());
    const sd = store.add({ question: "Name a color.", answers: [{ text: "Blue", points: 40 }], suddenDeath: true });
    expect(sd.custom).toBe("suddenDeath");
  });

  it("keeps questions in storage, and edits and deletes them", () => {
    const storage = memoryJsonStorage();
    const first = createCustomQuestionStore(storage).add(pets);
    const reopened = createCustomQuestionStore(storage);
    expect(reopened.list()).toHaveLength(1);

    const edited = reopened.update(first.id, { ...pets, question: "Name a pet we've had." });
    expect(edited.id).toBe(first.id);
    expect(createCustomQuestionStore(storage).list()[0]!.question).toBe("Name a pet we've had.");

    reopened.remove(first.id);
    expect(createCustomQuestionStore(storage).list()).toEqual([]);
  });

  it("refuses an invalid question and says why", () => {
    const store = createCustomQuestionStore(memoryJsonStorage());
    expect(() => store.add({ ...pets, question: "" })).toThrow(/question/i);
    expect(() => store.update("custom-q-missing", pets)).toThrow(/no custom question/i);
  });

  it("ignores corrupt stored data", () => {
    const store = createCustomQuestionStore(memoryJsonStorage([{ nonsense: true }, "x", null]));
    expect(store.list()).toEqual([]);
  });

  it("turns a saved question back into editable input", () => {
    const store = createCustomQuestionStore(memoryJsonStorage());
    const survey = store.add(pets);
    expect(store.toInput(survey)).toEqual({
      question: pets.question,
      answers: [
        { text: "Dog", points: 45 },
        { text: "Cat", points: 30 },
        { text: "Goldfish", points: 12 },
      ],
      suddenDeath: false,
    });
  });
});
