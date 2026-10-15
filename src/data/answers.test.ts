import { describe, expect, it } from "vitest";
import { acceptedSpellings, normalize } from "./answers";

describe("normalize", () => {
  it("lowercases, strips punctuation and collapses spaces", () => {
    expect(normalize('  YES,  DEAR!  ')).toBe("yes dear");
    expect(normalize('SAY "NO"')).toBe("say no");
  });

  it("joins dotted initials", () => {
    expect(normalize("R.V.")).toBe("rv");
    expect(normalize("B.O.")).toBe("bo");
  });

  it("turns symbols into words and hyphens into spaces", () => {
    expect(normalize("SPENT $")).toBe("spent money");
    expect(normalize("# OF EX-LOVERS")).toBe("number of ex lovers");
    expect(normalize("MAC & CHEESE")).toBe("mac and cheese");
  });
});

describe("acceptedSpellings", () => {
  it("splits slash alternatives into separate answers", () => {
    expect(acceptedSpellings("PET/RUB BELLY")).toEqual(expect.arrayContaining(["pet", "rub belly"]));
  });

  it("expands the abbreviations the survey boards use", () => {
    expect(acceptedSpellings("MTN. LION")).toContain("mountain lion");
    expect(acceptedSpellings("BANK ACCT.")).toContain("bank account");
    expect(acceptedSpellings("DR. VISIT")).toContain("doctor visit");
    expect(acceptedSpellings("LOSE 10 LBS.")).toContain("lose 10 pounds");
  });

  it("keeps the abbreviated form too", () => {
    expect(acceptedSpellings("MTN. LION")).toContain("mtn lion");
  });

  it("skips empty alternatives and removes duplicates", () => {
    const spellings = acceptedSpellings("TIPS/$/TIPS");
    expect(spellings).toEqual(expect.arrayContaining(["tips", "money"]));
    expect(new Set(spellings).size).toBe(spellings.length);
    expect(spellings).not.toContain("");
  });

  it("strips punctuation from exclamations and questions", () => {
    expect(acceptedSpellings("YES!/OF COURSE!")).toEqual(expect.arrayContaining(["yes", "of course"]));
    expect(acceptedSpellings("HOW OLD?")).toContain("how old");
  });

  it("leaves a sentence-ending period alone instead of guessing an abbreviation", () => {
    expect(acceptedSpellings("GO TO BED.")).toContain("go to bed");
  });
});
