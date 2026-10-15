import { describe, expect, it } from "vitest";
import { memoryJsonStorage } from "./jsonStorage";
import { createQuestionSetStore, missingQuestions, validateQuestionSet, type QuestionSet } from "./questionSets";

const set = (changes: Partial<QuestionSet> = {}): QuestionSet => ({
  id: "set-1",
  name: "Holiday party",
  rounds: ["s20-a6-001", "custom-q-a", "s21-a5-010"],
  suddenDeath: ["s22-a1-003"],
  fastMoney: [],
  ...changes,
});

describe("validateQuestionSet", () => {
  it("accepts a set with rounds, Sudden Death and no Fast Money", () => {
    expect(validateQuestionSet(set())).toEqual([]);
  });

  it("needs a name and at least one question", () => {
    expect(validateQuestionSet(set({ name: " " })).join()).toMatch(/name/i);
    expect(validateQuestionSet(set({ rounds: [], suddenDeath: [], fastMoney: [] })).join()).toMatch(/at least one/i);
  });

  it("needs exactly five Fast Money questions, or none", () => {
    expect(validateQuestionSet(set({ fastMoney: ["a", "b", "c"] })).join()).toMatch(/five/i);
    expect(validateQuestionSet(set({ fastMoney: ["a", "b", "c", "d", "e"] }))).toEqual([]);
  });

  it("doesn't allow the same question twice", () => {
    expect(validateQuestionSet(set({ fastMoney: ["s20-a6-001", "b", "c", "d", "e"] })).join()).toMatch(/twice/i);
  });
});

describe("missingQuestions", () => {
  it("lists ids that no longer exist (e.g. a deleted custom question)", () => {
    const exists = (id: string) => id !== "custom-q-a";
    expect(missingQuestions(set(), exists)).toEqual(["custom-q-a"]);
  });
});

describe("question set store", () => {
  it("saves, lists, updates and deletes sets, kept in storage", () => {
    const storage = memoryJsonStorage();
    const store = createQuestionSetStore(storage);
    store.save(set());
    store.save(set({ id: "set-2", name: "Office" }));
    expect(createQuestionSetStore(storage).list().map((s) => s.name)).toEqual(["Holiday party", "Office"]);

    store.save(set({ name: "Holiday party 2" }));
    expect(createQuestionSetStore(storage).get("set-1")?.name).toBe("Holiday party 2");

    store.remove("set-1");
    expect(createQuestionSetStore(storage).list().map((s) => s.id)).toEqual(["set-2"]);
  });

  it("gives a new set an id when it has none", () => {
    const store = createQuestionSetStore(memoryJsonStorage());
    const saved = store.save(set({ id: "" }));
    expect(saved.id).toMatch(/^qset-/);
  });

  it("refuses an invalid set and ignores corrupt stored data", () => {
    expect(() => createQuestionSetStore(memoryJsonStorage()).save(set({ name: "" }))).toThrow(/name/i);
    expect(createQuestionSetStore(memoryJsonStorage(["junk", { id: 3 }])).list()).toEqual([]);
  });
});
