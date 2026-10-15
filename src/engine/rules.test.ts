import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  DEFAULT_RULES,
  FIXED_ROUNDS_RULES,
  SINGLE_POINTS_RULES,
  validateRules,
  type GameRules,
} from "./rules";

const edit = (changes: Partial<GameRules>): GameRules => ({ ...structuredClone(DEFAULT_RULES), ...changes });

describe("built-in presets", () => {
  it("Default matches the show: single, single, double, triple, then Sudden Death to 300", () => {
    expect(DEFAULT_RULES.rounds.map((r) => r.multiplier)).toEqual([1, 1, 2, 3]);
    expect(DEFAULT_RULES.rounds.map((r) => r.name)).toEqual(["Single", "Single", "Double", "Triple"]);
    expect(DEFAULT_RULES.win).toEqual({ type: "target", target: 300 });
    expect(DEFAULT_RULES.repeatLastRound).toBe(false);
    expect(DEFAULT_RULES.suddenDeath).toMatchObject({ enabled: true, multiplier: 3 });
    expect(DEFAULT_RULES.fastMoney).toEqual({
      enabled: true,
      target: 200,
      grandPrize: 20000,
      perPoint: 5,
      timers: [20, 25],
    });
    expect(DEFAULT_RULES.championLimit).toBe(5);
  });

  it("Single points scores every round at x1 and repeats the last round to 300", () => {
    expect(SINGLE_POINTS_RULES.rounds.every((r) => r.multiplier === 1)).toBe(true);
    expect(SINGLE_POINTS_RULES.suddenDeath.multiplier).toBe(1);
    expect(SINGLE_POINTS_RULES.repeatLastRound).toBe(true);
    expect(SINGLE_POINTS_RULES.win).toEqual({ type: "target", target: 300 });
  });

  it("Fixed rounds plays 5 single rounds and the highest score wins", () => {
    expect(FIXED_ROUNDS_RULES.rounds).toHaveLength(5);
    expect(FIXED_ROUNDS_RULES.rounds.every((r) => r.multiplier === 1)).toBe(true);
    expect(FIXED_ROUNDS_RULES.win).toEqual({ type: "highestScore" });
    expect(FIXED_ROUNDS_RULES.repeatLastRound).toBe(false);
  });

  it("are all valid, marked built-in, and have unique ids", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(validateRules(preset)).toEqual([]);
      expect(preset.builtIn).toBe(true);
    }
    expect(new Set(BUILT_IN_PRESETS.map((p) => p.id)).size).toBe(BUILT_IN_PRESETS.length);
    expect(BUILT_IN_PRESETS[0]).toBe(DEFAULT_RULES);
  });

  it("are frozen so a game cannot change them by accident", () => {
    expect(Object.isFrozen(DEFAULT_RULES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_RULES.rounds[0])).toBe(true);
  });
});

describe("validateRules", () => {
  it("needs a name and at least one round", () => {
    expect(validateRules(edit({ name: " " })).join()).toMatch(/name/i);
    expect(validateRules(edit({ rounds: [] })).join()).toMatch(/at least one round/i);
  });

  it("needs whole-number multipliers of at least 1", () => {
    const rounds = [{ name: "R", multiplier: 0, minAnswers: 4, maxAnswers: 8 }];
    expect(validateRules(edit({ rounds })).join()).toMatch(/multiplier/i);
    rounds[0]!.multiplier = 1.5;
    expect(validateRules(edit({ rounds })).join()).toMatch(/multiplier/i);
  });

  it("needs survey sizes the bank has (4-8) with min <= max", () => {
    const tooBig = [{ name: "R", multiplier: 1, minAnswers: 4, maxAnswers: 9 }];
    const backwards = [{ name: "R", multiplier: 1, minAnswers: 7, maxAnswers: 5 }];
    expect(validateRules(edit({ rounds: tooBig })).join()).toMatch(/4.*8/);
    expect(validateRules(edit({ rounds: backwards })).join()).toMatch(/4.*8|min/i);
  });

  it("rejects a target-score game that could end with no winner", () => {
    const rules = edit({ suddenDeath: { ...DEFAULT_RULES.suddenDeath, enabled: false } });
    expect(validateRules(rules).join()).toMatch(/sudden death|repeat/i);
    expect(validateRules({ ...rules, repeatLastRound: true })).toEqual([]);
  });

  it("requires Sudden Death to break ties when the highest score wins", () => {
    const rules = edit({ win: { type: "highestScore" }, suddenDeath: { ...DEFAULT_RULES.suddenDeath, enabled: false } });
    expect(validateRules(rules).join()).toMatch(/tie/i);
  });

  it("only allows repeating the last round with a target score", () => {
    const rules = edit({ win: { type: "highestScore" }, repeatLastRound: true });
    expect(validateRules(rules).join()).toMatch(/repeat/i);
  });

  it("checks the target, Fast Money and champion settings", () => {
    expect(validateRules(edit({ win: { type: "target", target: 0 } })).join()).toMatch(/target/i);
    const fastMoney = { ...DEFAULT_RULES.fastMoney, timers: [20, 0] as [number, number] };
    expect(validateRules(edit({ fastMoney })).join()).toMatch(/timer/i);
    expect(validateRules(edit({ fastMoney: { ...DEFAULT_RULES.fastMoney, perPoint: -1 } })).join()).toMatch(/point/i);
    expect(validateRules(edit({ championLimit: 0 })).join()).toMatch(/champion/i);
    expect(validateRules(edit({ championLimit: null }))).toEqual([]);
  });
});
