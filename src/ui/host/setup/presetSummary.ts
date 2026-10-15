// Plain-English description of a preset for the setup screen.

import type { GameRules } from "../../../engine/rules";

export interface PresetSummary {
  rounds: string;
  repeat: string;
  win: string;
  suddenDeath: string;
  fastMoney: string;
  champions: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function summarizePreset(rules: GameRules): PresetSummary {
  const { suddenDeath: sd, fastMoney: fm } = rules;
  return {
    rounds: rules.rounds.map((r, i) => `${i + 1}. ${r.name} ×${r.multiplier}`).join(" · "),
    repeat: rules.repeatLastRound
      ? "The last round repeats until someone reaches the target"
      : "The last round doesn't repeat",
    win: rules.win.type === "target" ? `First to ${rules.win.target}` : `Highest score after round ${rules.rounds.length}`,
    suddenDeath: sd.enabled ? `On, ×${sd.multiplier} (${sd.minAnswers}-${sd.maxAnswers} answers)` : "Off",
    fastMoney: fm.enabled
      ? `${fm.target} points wins ${money(fm.grandPrize)}, otherwise ${money(fm.perPoint)} per point; timers ${fm.timers[0]} s / ${fm.timers[1]} s`
      : "Off",
    champions: rules.championLimit === null ? "No limit" : `Retire after ${rules.championLimit} wins`,
  };
}
