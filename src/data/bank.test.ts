import { describe, expect, it } from "vitest";
import rawBank from "../../data/question_bank.json";
import { createPicker, loadSuddenDeathBank, memoryStore, prepareBank, type Survey } from "./bank";

function survey(id: string, answerCount: number, extra: Partial<Survey> = {}): Survey {
  return {
    id,
    season: 20,
    answerCount,
    question: `Question ${id}`,
    total: 100,
    answers: Array.from({ length: answerCount }, (_, i) => ({ text: `A${i}`, points: 10 - i })),
    source: "https://example.test",
    ...extra,
  };
}

// Deterministic stand-in for Math.random.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe("prepareBank", () => {
  it("drops surveys with review flags", () => {
    const bank = prepareBank([survey("a", 4), survey("b", 4, { reviewFlags: ["typo"] })]);
    expect(bank.map((s) => s.id)).toEqual(["a"]);
  });

  it("keeps only the first copy of a repeated question, ignoring case and spacing", () => {
    const bank = prepareBank([
      survey("a", 4, { question: "Name a fruit." }),
      survey("b", 6, { question: "name  a FRUIT." }),
      survey("c", 5, { question: "Name a vegetable." }),
    ]);
    expect(bank.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("leaves the real bank with only clean, unique surveys", () => {
    const bank = prepareBank(rawBank as Survey[]);
    expect(bank.length).toBeGreaterThan(8800);
    expect(bank.some((s) => s.reviewFlags)).toBe(false);
    const questions = bank.map((s) => s.question.toLowerCase().replace(/\s+/g, " "));
    expect(new Set(questions).size).toBe(bank.length);
    for (const s of bank) expect(s.answers).toHaveLength(s.answerCount);
  });
});

describe("Sudden Death bank", () => {
  it("is separate, single-answer only, and free of flagged surveys", async () => {
    const bank = await loadSuddenDeathBank();
    expect(bank.length).toBeGreaterThan(450);
    expect(bank.every((s) => s.answerCount === 1 && s.answers.length === 1)).toBe(true);
    expect(bank.some((s) => s.reviewFlags)).toBe(false);
    expect(bank.every((s) => /feud\d+_1$/.test(s.source))).toBe(true);
    // The site shows Sudden Death totals tripled: a built-in check that points were read right.
    expect(bank.every((s) => s.total === s.answers[0]!.points * 3)).toBe(true);
  });
});

describe("createPicker", () => {
  const bank = [4, 4, 5, 6, 6, 7, 8, 8].map((n, i) => survey(`s${i}`, n));

  it("only picks surveys inside the requested size range", () => {
    const picker = createPicker(bank, { store: memoryStore(), random: seeded() });
    for (let i = 0; i < 3; i++) {
      const s = picker.pick({ min: 6, max: 8 });
      expect(s.answerCount).toBeGreaterThanOrEqual(6);
      expect(s.answerCount).toBeLessThanOrEqual(8);
    }
  });

  it("never repeats a question until every survey in the range has been used", () => {
    const picker = createPicker(bank, { store: memoryStore(), random: seeded() });
    const ids = Array.from({ length: 8 }, () => picker.pick({ min: 4, max: 8 }).id);
    expect(new Set(ids).size).toBe(8);
  });

  it("recycles a range once it is used up instead of failing", () => {
    const picker = createPicker(bank, { store: memoryStore(), random: seeded() });
    const first = [picker.pick({ min: 5, max: 5 }).id];
    expect(picker.pick({ min: 5, max: 5 }).id).toBe(first[0]);
  });

  it("remembers used questions across pickers through the store", () => {
    const store = memoryStore();
    const used = new Set<string>();
    const a = createPicker(bank, { store, random: seeded(3) });
    for (let i = 0; i < 4; i++) used.add(a.pick({ min: 4, max: 8 }).id);
    const b = createPicker(bank, { store, random: seeded(3) });
    for (let i = 0; i < 4; i++) expect(used.has(b.pick({ min: 4, max: 8 }).id)).toBe(false);
  });

  it("throws a clear error when no survey has the requested size", () => {
    const picker = createPicker(bank, { store: memoryStore(), random: seeded() });
    expect(() => picker.pick({ min: 9, max: 12 })).toThrow(/9.*12/);
  });

  it("reports used surveys and never picks one the host chose by hand", () => {
    const store = memoryStore();
    const picker = createPicker(bank, { store, random: seeded() });
    expect(picker.isUsed("s0")).toBe(false);
    picker.markUsed("s0");
    expect(picker.isUsed("s0")).toBe(true);
    expect(store.load()).toContain("s0");
    expect(picker.pick({ min: 4, max: 4 }).id).toBe("s1");
  });

  it("can exclude specific surveys, e.g. ones already on screen", () => {
    const picker = createPicker(bank, { store: memoryStore(), random: seeded() });
    const s = picker.pick({ min: 4, max: 4, exclude: ["s0"] });
    expect(s.id).toBe("s1");
  });
});
