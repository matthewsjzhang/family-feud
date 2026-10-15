// An editable copy of a GameRules object. Numbers are kept as the strings the
// host typed, so a half-typed or empty field never crashes the editor; they are
// only parsed when building the GameRules that validateRules checks.

import type { GameRules, RoundRule } from "../../../engine/rules";

export interface RoundDraft {
  /** Stable React key, so reordering keeps focus and input state with the round. */
  key: number;
  name: string;
  multiplier: string;
  minAnswers: string;
  maxAnswers: string;
}

export interface RulesDraft {
  name: string;
  rounds: RoundDraft[];
  winType: "target" | "highestScore";
  target: string;
  repeatLastRound: boolean;
  suddenDeath: { enabled: boolean; multiplier: string; minAnswers: string; maxAnswers: string };
  fastMoney: {
    enabled: boolean;
    target: string;
    grandPrize: string;
    perPoint: string;
    timer1: string;
    timer2: string;
  };
  noChampionLimit: boolean;
  championLimit: string;
}

let nextKey = 1;
const newKey = () => nextKey++;

export function roundDraft(round: RoundRule): RoundDraft {
  return {
    key: newKey(),
    name: round.name,
    multiplier: String(round.multiplier),
    minAnswers: String(round.minAnswers),
    maxAnswers: String(round.maxAnswers),
  };
}

export const newRoundDraft = (): RoundDraft =>
  roundDraft({ name: "Single", multiplier: 1, minAnswers: 4, maxAnswers: 8 });

export function toDraft(rules: GameRules): RulesDraft {
  const { suddenDeath: sd, fastMoney: fm } = rules;
  return {
    name: rules.name,
    rounds: rules.rounds.map(roundDraft),
    winType: rules.win.type,
    // Keep a sensible target ready if the host switches from "highest score".
    target: String(rules.win.type === "target" ? rules.win.target : 300),
    repeatLastRound: rules.repeatLastRound,
    suddenDeath: {
      enabled: sd.enabled,
      multiplier: String(sd.multiplier),
      minAnswers: String(sd.minAnswers),
      maxAnswers: String(sd.maxAnswers),
    },
    fastMoney: {
      enabled: fm.enabled,
      target: String(fm.target),
      grandPrize: String(fm.grandPrize),
      perPoint: String(fm.perPoint),
      timer1: String(fm.timers[0]),
      timer2: String(fm.timers[1]),
    },
    noChampionLimit: rules.championLimit === null,
    championLimit: String(rules.championLimit ?? 5),
  };
}

/** Empty or non-numeric text becomes NaN, which validateRules reports as an error. */
const num = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

export function toRules(draft: RulesDraft, id: string): GameRules {
  const { suddenDeath: sd, fastMoney: fm } = draft;
  const target = draft.winType === "target";
  return {
    id,
    name: draft.name.trim(),
    builtIn: false,
    rounds: draft.rounds.map((r) => ({
      name: r.name.trim(),
      multiplier: num(r.multiplier),
      minAnswers: num(r.minAnswers),
      maxAnswers: num(r.maxAnswers),
    })),
    // The checkbox is disabled without a target, so never carry a stale tick into the rules.
    repeatLastRound: target && draft.repeatLastRound,
    win: target ? { type: "target", target: num(draft.target) } : { type: "highestScore" },
    suddenDeath: {
      enabled: sd.enabled,
      multiplier: num(sd.multiplier),
      minAnswers: num(sd.minAnswers),
      maxAnswers: num(sd.maxAnswers),
    },
    fastMoney: {
      enabled: fm.enabled,
      target: num(fm.target),
      grandPrize: num(fm.grandPrize),
      perPoint: num(fm.perPoint),
      timers: [num(fm.timer1), num(fm.timer2)],
    },
    championLimit: draft.noChampionLimit ? null : num(draft.championLimit),
  };
}

/** "Default (copy)", or "Default (copy 2)" if that name is taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const base = `${name} (copy)`;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (copy ${n})`;
    if (!taken.includes(candidate)) return candidate;
  }
}
