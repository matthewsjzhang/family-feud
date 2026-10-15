import { describe, expect, it } from "vitest";
import rawBank from "../../data/question_bank.json";
import type { Survey } from "../data/bank";
import { matchAnswer, sameAnswer, stem } from "./match";
import { MATCH_FIXTURE, type SurveyCases } from "./matchFixture";
import { MATCH_HOLDOUT } from "./matchHoldout";

const board = (...texts: string[]) => texts.map((text) => ({ text }));

describe("stem", () => {
  it("gives the same stem to different forms of a word", () => {
    const groups = [
      ["smoke", "smoking", "smokes"],
      ["lie", "lies", "lying"],
      ["kiss", "kissed", "kisses", "kissing"],
      ["purr", "purring", "purrs"],
      ["speed", "speeding", "speeds"],
      ["rub", "rubbing", "rubbed"],
      ["cry", "crying", "cries"],
      ["glass", "glasses"],
    ];
    for (const words of groups) expect(new Set(words.map(stem)), words.join()).toHaveProperty("size", 1);
  });

  it("keeps different words apart", () => {
    expect(stem("dancer")).not.toBe(stem("prancer"));
    expect(stem("bus")).not.toBe(stem("bu"));
  });
});

describe("matchAnswer", () => {
  const animals = board("DOG/PUPPY", "CAT", "MTN. LION", "BRUSH/FLOSS TEETH", "PROSTHETIC LEG/FOOT");

  it("matches exact answers and either side of a slash with full confidence", () => {
    expect(matchAnswer(animals, "cat")).toMatchObject({ index: 1, confidence: 1 });
    expect(matchAnswer(animals, "Puppy!")).toMatchObject({ index: 0, confidence: 1 });
  });

  it("handles plurals, tenses and filler words", () => {
    expect(matchAnswer(animals, "cats").index).toBe(1);
    expect(matchAnswer(animals, "a dog").index).toBe(0);
    expect(matchAnswer(board("SMOKING", "LYING"), "smoke").index).toBe(0);
    expect(matchAnswer(board("SMOKING", "LYING"), "lies").index).toBe(1);
  });

  it("expands the board's abbreviations and joins split words", () => {
    expect(matchAnswer(animals, "mountain lion").index).toBe(2);
    expect(matchAnswer(board("CHAIN SAW", "HAMMER"), "chainsaw").index).toBe(0);
  });

  it("shares words across a slash", () => {
    expect(matchAnswer(animals, "brush teeth").index).toBe(3);
    expect(matchAnswer(animals, "prosthetic foot").index).toBe(4);
  });

  it("forgives small typos", () => {
    expect(matchAnswer(board("SPAGHETTI", "PIZZA"), "spagetti").index).toBe(0);
  });

  it("accepts a longer answer that contains the board answer", () => {
    expect(matchAnswer(animals, "a big fat cat").index).toBe(1);
  });

  it("returns no match, listing weak partial matches for the host, when nothing is close enough", () => {
    expect(matchAnswer(animals, "giraffe")).toMatchObject({ index: null, candidates: [] });
    const partial = matchAnswer(animals, "lion king");
    expect(partial.index).toBeNull();
    expect(partial.candidates[0]).toMatchObject({ index: 2 });
    expect(partial.candidates[0]!.score).toBeLessThan(0.75);
  });

  it("refuses to guess when two answers fit equally well", () => {
    const result = matchAnswer(board("CHRISTMAS", "NEW YEAR'S/EVE"), "christmas eve");
    expect(result).toMatchObject({ index: null, ambiguous: true });
    expect(result.candidates.map((c) => c.index).sort()).toEqual([0, 1]);
  });

  it("can skip answers that are already on the board", () => {
    expect(matchAnswer(animals, "cat", { exclude: [1] }).index).toBeNull();
  });

  it("returns no match for an empty guess", () => {
    expect(matchAnswer(animals, "  ").index).toBeNull();
  });
});

describe("sameAnswer", () => {
  const answers = board("CAT/KITTEN", "DOG", "BIRD");

  it("treats two guesses as the same when they match the same board answer", () => {
    expect(sameAnswer(answers, "kitten", "cats")).toBe(true);
    expect(sameAnswer(answers, "Cat", "CAT!")).toBe(true);
  });

  it("treats different board answers, or unmatched different words, as different", () => {
    expect(sameAnswer(answers, "cat", "dog")).toBe(false);
    expect(sameAnswer(answers, "hamster", "goldfish")).toBe(false);
  });

  it("still catches identical wording that isn't on the board", () => {
    expect(sameAnswer(answers, "hamster", "Hamsters")).toBe(true);
  });
});

const bank = new Map((rawBank as Survey[]).map((s) => [s.id, s]));

function measure(fixture: SurveyCases[]) {
  const m = { regular: 0, found: 0, suggested: 0, wrong: 0, negatives: 0, falseMatches: 0, misses: [] as string[] };
  for (const group of fixture) {
    const survey = bank.get(group.surveyId)!;
    const cases = [
      ...group.regular.map((c) => ({ ...c, synonym: false })),
      ...(group.synonyms ?? []).map((c) => ({ ...c, synonym: true })),
    ];
    for (const c of cases) {
      const { index } = matchAnswer(survey.answers, c.guess);
      if (index !== null) m.suggested += 1;
      if (index !== null && index !== c.expected) {
        m.wrong += 1;
        m.misses.push(`WRONG ${group.surveyId} "${c.guess}" -> ${index} (expected ${c.expected})`);
      }
      if (c.expected === null) {
        m.negatives += 1;
        if (index !== null) m.falseMatches += 1;
      } else if (!c.synonym) {
        m.regular += 1;
        if (index === c.expected) m.found += 1;
        else m.misses.push(`MISSED ${group.surveyId} "${c.guess}" -> ${index} (expected ${c.expected})`);
      }
    }
  }
  if (process.env.MATCH_REPORT) {
    console.info([`found ${m.found}/${m.regular}`, `wrong ${m.wrong}/${m.suggested}`, `false ${m.falseMatches}/${m.negatives}`, ...m.misses].join("\n"));
  }
  return m;
}

describe("accuracy on real surveys (targets set before tuning)", () => {
  const m = measure(MATCH_FIXTURE);

  it("uses real surveys from the bank", () => {
    expect(MATCH_FIXTURE.every((g) => bank.has(g.surveyId))).toBe(true);
    expect(m.regular).toBeGreaterThanOrEqual(150);
  });

  it("finds at least 90% of regular answers", () => {
    expect(m.found / m.regular, m.misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });

  it("is right at least 97% of the time when it suggests an answer", () => {
    expect(1 - m.wrong / m.suggested, m.misses.join("\n")).toBeGreaterThanOrEqual(0.97);
  });

  it("wrongly matches at most 5% of answers that aren't on the board", () => {
    expect(m.falseMatches / m.negatives, m.misses.join("\n")).toBeLessThanOrEqual(0.05);
  });
});

describe("accuracy on held-out surveys (never used for tuning)", () => {
  // Measured once when written: found 63/67, wrong 1/66, false matches 1/16.
  // These thresholds guard against regressions; do not tune the matcher on this set.
  const m = measure(MATCH_HOLDOUT);

  it("still finds at least 90% of regular answers", () => {
    expect(m.found / m.regular, m.misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });

  it("is still right at least 97% of the time when it suggests an answer", () => {
    expect(1 - m.wrong / m.suggested, m.misses.join("\n")).toBeGreaterThanOrEqual(0.97);
  });

  it("wrongly matches no more than 1 in 16 answers that aren't on the board", () => {
    expect(m.falseMatches / m.negatives, m.misses.join("\n")).toBeLessThanOrEqual(1 / 16);
  });
});
