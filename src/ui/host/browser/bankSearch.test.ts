import { describe, expect, it } from "vitest";
import rawBank from "../../../../data/question_bank.json";
import { prepareBank, type Survey } from "../../../data/bank";
import type { UpcomingRound } from "../../../engine/mainGame";
import {
  fitProblem,
  indexBank,
  NO_FILTERS,
  normalize,
  pickRandom,
  queryWords,
  searchBank,
  seasonsOf,
  type BrowserFilters,
  type FilterContext,
} from "./bankSearch";

function survey(id: string, question: string, answers: string[], extra: Partial<Survey> = {}): Survey {
  return {
    id,
    season: 20,
    answerCount: answers.length,
    question,
    total: 100,
    answers: answers.map((text, i) => ({ text, points: 40 - i * 5 })),
    source: "https://example.test",
    ...extra,
  };
}

const MIL = survey("mil", "Name something your mother-in-law might criticize.", ["COOKING", "CLEANING", "KIDS", "HUSBAND"], {
  season: 16,
});
const BEACH = survey("beach", "Name something people bring to the beach", ["TOWEL", "SUNSCREEN", "UMBRELLA", "COOLER", "CHAIR", "BOOK"], {
  season: 18,
});
const DONT = survey("dont", "Name something you don't want to forget on vacation", ["PASSPORT", "WALLET", "PHONE", "TICKETS", "MEDICINE", "CHARGER", "KEYS"], {
  season: 18,
});
const CAFE = survey("cafe", "Name a place you'd buy coffee", ["CAFÉ", "GAS STATION", "DINER", "BAR/NIGHTCLUB", "OFFICE"], { season: 26 });
const SMALL: Survey[] = [MIL, BEACH, DONT, CAFE];

const round = (min: number, max: number): UpcomingRound => ({
  kind: "round",
  number: 2,
  name: "Round 2",
  multiplier: 1,
  minAnswers: min,
  maxAnswers: max,
});
const SUDDEN: UpcomingRound = { kind: "suddenDeath", number: 5, name: "Sudden Death", multiplier: 3, minAnswers: 1, maxAnswers: 1 };

const ctx = (extra: Partial<FilterContext> = {}): FilterContext => ({
  bank: "main",
  isUsed: () => false,
  upcoming: null,
  ...extra,
});
const ids = (list: Survey[]) => list.map((s) => s.id);
const search = (filters: Partial<BrowserFilters>, c: Partial<FilterContext> = {}, bank: Survey[] = SMALL) =>
  ids(searchBank(bank, { ...NO_FILTERS, ...filters }, ctx(c)));

describe("normalize", () => {
  it("lower-cases, strips accents and treats punctuation as spaces", () => {
    expect(normalize("Mother-in-Law")).toBe("mother in law");
    expect(normalize("BAR/NIGHTCLUB")).toBe("bar nightclub");
    expect(normalize("  CAFÉ!? ")).toBe("cafe");
    expect(normalize("Don't")).toBe("dont");
    expect(queryWords("  ?! ")).toEqual([]);
  });
});

describe("searchBank text", () => {
  it("returns everything in board order for an empty query", () => {
    expect(search({})).toEqual(["mil", "beach", "dont", "cafe"]);
  });

  it("matches the question and the answers, ignoring case", () => {
    expect(search({ query: "BEACH" })).toEqual(["beach"]);
    expect(search({ query: "sunscreen" })).toEqual(["beach"]);
  });

  it("needs every word to match (AND), across question and answers", () => {
    expect(search({ query: "name towel" })).toEqual(["beach"]);
    expect(search({ query: "towel passport" })).toEqual([]);
  });

  it("ignores punctuation in the query and the data", () => {
    expect(search({ query: "mother-in-law" })).toEqual(["mil"]);
    expect(search({ query: "mother in law" })).toEqual(["mil"]);
    expect(search({ query: "dont" })).toEqual(["dont"]);
    expect(search({ query: "don't" })).toEqual(["dont"]);
    expect(search({ query: "nightclub" })).toEqual(["cafe"]);
    expect(search({ query: "cafe" })).toEqual(["cafe"]);
  });

  it("matches from the start of words", () => {
    expect(search({ query: "sun" })).toEqual(["beach"]);
    expect(search({ query: "creen" })).toEqual([]);
  });
});

describe("searchBank filters", () => {
  it("filters by season and answer count", () => {
    expect(search({ season: 18 })).toEqual(["beach", "dont"]);
    expect(search({ answers: 6 })).toEqual(["beach"]);
    expect(search({ season: 18, answers: 7 })).toEqual(["dont"]);
  });

  it("ignores the answer-count filter in the Sudden Death bank", () => {
    expect(search({ answers: 6 }, { bank: "suddenDeath" })).toHaveLength(4);
  });

  it("hides played surveys", () => {
    expect(search({ hidePlayed: true }, { isUsed: (id) => id === "beach" || id === "mil" })).toEqual(["dont", "cafe"]);
  });

  it("keeps only surveys that fit the next round", () => {
    expect(search({ fitsNext: true }, { upcoming: round(6, 8) })).toEqual(["beach", "dont"]);
    expect(search({ fitsNext: true }, { upcoming: SUDDEN })).toEqual([]);
    expect(search({ fitsNext: true }, { upcoming: SUDDEN, bank: "suddenDeath" })).toHaveLength(4);
    expect(search({ fitsNext: true }, { upcoming: round(4, 8), bank: "suddenDeath" })).toEqual([]);
    // No upcoming round: the toggle has nothing to compare with, so it is ignored.
    expect(search({ fitsNext: true })).toHaveLength(4);
  });

  it("composes text and filters", () => {
    expect(search({ query: "name", season: 18, fitsNext: true }, { upcoming: round(7, 8) })).toEqual(["dont"]);
  });
});

describe("fitProblem", () => {
  it("explains why the next round would not use a survey", () => {
    expect(fitProblem(MIL, "main", round(6, 8))).toBe("Round 2 needs a 6-8 answer survey");
    expect(fitProblem(MIL, "main", round(6, 6))).toBe("Round 2 needs a 6 answer survey");
    expect(fitProblem(BEACH, "main", round(6, 8))).toBeNull();
    expect(fitProblem(MIL, "suddenDeath", round(4, 8))).toBe("Sudden Death questions only play in Sudden Death");
    expect(fitProblem(MIL, "suddenDeath", SUDDEN)).toBeNull();
    expect(fitProblem(MIL, "main", SUDDEN)).toMatch(/next round is Sudden Death/);
    expect(fitProblem(MIL, "main", null)).toBeNull();
  });
});

describe("pickRandom and seasonsOf", () => {
  it("picks only unplayed surveys", () => {
    const used = (id: string) => id !== "dont";
    expect(pickRandom(SMALL, used, () => 0.99)?.id).toBe("dont");
    expect(pickRandom(SMALL, () => true)).toBeNull();
    expect(pickRandom(SMALL, () => false, () => 0.5)?.id).toBe("dont");
  });

  it("lists distinct seasons in order", () => {
    expect(seasonsOf(SMALL)).toEqual([16, 18, 26]);
  });
});

describe("the real question bank", () => {
  const bank = prepareBank(rawBank as Survey[]);

  it("finds mother-in-law surveys and composes filters", () => {
    const all = searchBank(bank, { ...NO_FILTERS, query: "mother-in-law" }, ctx());
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) {
      const text = normalize([s.question, ...s.answers.map((a) => a.text)].join(" "));
      expect(text).toMatch(/\bmother\b/);
      expect(text).toMatch(/\blaw/);
    }

    const narrowed = searchBank(bank, { ...NO_FILTERS, query: "mother-in-law", answers: 4 }, ctx());
    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed.length).toBeLessThan(all.length);
    expect(narrowed.every((s) => s.answerCount === 4)).toBe(true);

    const season = all[0]!.season;
    const bySeason = searchBank(bank, { ...NO_FILTERS, query: "mother in law", season }, ctx());
    expect(bySeason.every((s) => s.season === season)).toBe(true);
    expect(ids(bySeason)).toContain(all[0]!.id);

    const fits = searchBank(bank, { ...NO_FILTERS, query: "mother-in-law", fitsNext: true }, ctx({ upcoming: round(6, 8) }));
    expect(fits.every((s) => s.answerCount >= 6)).toBe(true);
    expect(fits.length + all.filter((s) => s.answerCount < 6).length).toBe(all.length);
  });

  it("scans the whole bank quickly once indexed", () => {
    indexBank(bank);
    const start = performance.now();
    for (const q of ["a", "name something", "mother-in-law kids", "zzzz"]) {
      searchBank(bank, { ...NO_FILTERS, query: q }, ctx());
    }
    // Loose bound: four full scans of ~8,900 surveys; typically a few ms each.
    expect(performance.now() - start).toBeLessThan(200);
    expect(searchBank(bank, NO_FILTERS, ctx())).toHaveLength(bank.length);
  });
});
