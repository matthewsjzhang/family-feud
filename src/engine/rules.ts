// Game rules: everything about scoring and round order that a host can change.
// The engine reads a GameRules object and never hard-codes the show's format.

/** Survey sizes available in the question bank. */
export const BANK_MIN_ANSWERS = 4;
export const BANK_MAX_ANSWERS = 8;

export interface RoundRule {
  /** Shown on the board, e.g. "Double". */
  name: string;
  multiplier: number;
  minAnswers: number;
  maxAnswers: number;
}

/** Sudden Death questions come from their own single-answer bank (data/sudden_death_bank.json). */
export interface SuddenDeathRule {
  enabled: boolean;
  multiplier: number;
}

export type WinCondition =
  | { type: "target"; target: number }
  /** Highest score after the last round; Sudden Death breaks a tie. */
  | { type: "highestScore" };

export interface FastMoneyRule {
  enabled: boolean;
  target: number;
  grandPrize: number;
  perPoint: number;
  /** Seconds for player 1 and player 2. */
  timers: [number, number];
}

export interface GameRules {
  id: string;
  name: string;
  builtIn: boolean;
  rounds: RoundRule[];
  /** With a target score: keep replaying the last round until someone reaches it. */
  repeatLastRound: boolean;
  win: WinCondition;
  suddenDeath: SuddenDeathRule;
  fastMoney: FastMoneyRule;
  /** Wins before a champion family retires; null = no limit. */
  championLimit: number | null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const SHOW_FAST_MONEY: FastMoneyRule = { enabled: true, target: 200, grandPrize: 20000, perPoint: 5, timers: [20, 25] };

/** The modern syndicated show (seasons 16-26). */
export const DEFAULT_RULES: GameRules = deepFreeze({
  id: "default",
  name: "Default",
  builtIn: true,
  rounds: [
    { name: "Single", multiplier: 1, minAnswers: 6, maxAnswers: 8 },
    { name: "Single", multiplier: 1, minAnswers: 5, maxAnswers: 8 },
    { name: "Double", multiplier: 2, minAnswers: 4, maxAnswers: 6 },
    { name: "Triple", multiplier: 3, minAnswers: 4, maxAnswers: 5 },
  ],
  repeatLastRound: false,
  win: { type: "target", target: 300 },
  suddenDeath: { enabled: true, multiplier: 3 },
  fastMoney: { ...SHOW_FAST_MONEY },
  championLimit: 5,
});

export const SINGLE_POINTS_RULES: GameRules = deepFreeze({
  id: "single-points",
  name: "Single points",
  builtIn: true,
  rounds: DEFAULT_RULES.rounds.map((r) => ({ ...r, name: "Single", multiplier: 1 })),
  repeatLastRound: true,
  win: { type: "target", target: 300 },
  suddenDeath: { enabled: true, multiplier: 1 },
  fastMoney: { ...SHOW_FAST_MONEY },
  championLimit: 5,
});

export const FIXED_ROUNDS_RULES: GameRules = deepFreeze({
  id: "fixed-rounds",
  name: "Fixed rounds",
  builtIn: true,
  rounds: Array.from({ length: 5 }, () => ({ name: "Single", multiplier: 1, minAnswers: 4, maxAnswers: 8 })),
  repeatLastRound: false,
  win: { type: "highestScore" },
  suddenDeath: { enabled: true, multiplier: 1 },
  fastMoney: { ...SHOW_FAST_MONEY },
  championLimit: 5,
});

export const BUILT_IN_PRESETS: readonly GameRules[] = [DEFAULT_RULES, SINGLE_POINTS_RULES, FIXED_ROUNDS_RULES];

const isWhole = (n: unknown, min: number): n is number => Number.isInteger(n) && (n as number) >= min;

function checkSize(label: string, min: number, max: number, errors: string[]) {
  const ok =
    isWhole(min, BANK_MIN_ANSWERS) && isWhole(max, BANK_MIN_ANSWERS) && max <= BANK_MAX_ANSWERS && min <= max;
  if (!ok) {
    errors.push(`${label}: survey size must be between ${BANK_MIN_ANSWERS} and ${BANK_MAX_ANSWERS} answers, with min no larger than max.`);
  }
}

/** Every problem with a rule set, in plain words. An empty list means it is playable. */
export function validateRules(rules: GameRules): string[] {
  const errors: string[] = [];
  if (!rules.name?.trim()) errors.push("The preset needs a name.");
  if (!rules.rounds?.length) errors.push("The game needs at least one round.");

  rules.rounds?.forEach((round, i) => {
    const label = `Round ${i + 1}`;
    if (!round.name?.trim()) errors.push(`${label} needs a name.`);
    if (!isWhole(round.multiplier, 1)) errors.push(`${label}: the multiplier must be a whole number of at least 1.`);
    checkSize(label, round.minAnswers, round.maxAnswers, errors);
  });

  const sd = rules.suddenDeath;
  if (sd.enabled) {
    if (!isWhole(sd.multiplier, 1)) errors.push("Sudden Death: the multiplier must be a whole number of at least 1.");
  }

  if (rules.win.type === "target") {
    if (!isWhole(rules.win.target, 1)) errors.push("The target score must be a whole number of at least 1.");
    if (!rules.repeatLastRound && !sd.enabled) {
      errors.push("Nobody may reach the target score: turn on Sudden Death or repeat the last round.");
    }
  } else {
    if (rules.repeatLastRound) errors.push("Repeating the last round only works with a target score.");
    if (!sd.enabled) errors.push("Turn on Sudden Death to break a tie for the highest score.");
  }

  const fm = rules.fastMoney;
  if (fm.enabled) {
    if (!isWhole(fm.target, 1)) errors.push("Fast Money: the target must be a whole number of at least 1.");
    if (!isWhole(fm.grandPrize, 0)) errors.push("Fast Money: the grand prize can't be negative.");
    if (!isWhole(fm.perPoint, 0)) errors.push("Fast Money: the amount per point can't be negative.");
    if (fm.timers?.length !== 2 || !fm.timers.every((t) => isWhole(t, 1))) {
      errors.push("Fast Money: both timers must be at least 1 second.");
    }
  }

  if (rules.championLimit !== null && !isWhole(rules.championLimit, 1)) {
    errors.push("The champion limit must be at least 1 win, or no limit.");
  }
  return errors;
}
