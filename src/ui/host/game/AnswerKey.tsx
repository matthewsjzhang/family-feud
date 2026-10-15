// The host's answer key: every answer with its points in board order. Each one is
// also the button the host clicks to accept it for whoever is answering now.

import type { CSSProperties } from "react";
import type { RoundState, SlotState } from "../../../engine/mainGame";

interface AnswerKeyProps {
  round: RoundState;
  canPick(index: number): boolean;
  onPick(index: number): void;
  /** What clicking does right now, e.g. "Reveal" after the round. */
  verb: string;
}

const STATUS: Record<SlotState, string> = { hidden: "Hidden", won: "Won", shown: "Shown" };

export function AnswerKey({ round, canPick, onPick, verb }: AnswerKeyProps) {
  const suddenDeath = round.kind === "suddenDeath";
  const rows = Math.ceil(round.survey.answers.length / 2);

  return (
    <ol
      className="hg-answers"
      aria-label="Answer key"
      // Two columns filled top-to-bottom, like the board itself.
      style={{ "--hg-rows": rows } as CSSProperties}
    >
      {round.survey.answers.map((answer, i) => {
        const slot = round.slots[i] ?? "hidden";
        const enabled = canPick(i);
        return (
          <li key={i}>
            <button
              type="button"
              className={`hg-answer hg-answer--${slot}${suddenDeath && i === 0 ? " hg-answer--counts" : ""}`}
              disabled={!enabled}
              title={enabled ? `${verb} #${i + 1} (key ${i + 1})` : undefined}
              onClick={() => onPick(i)}
            >
              <span className="hg-answer__num">{i + 1}</span>
              <span className="hg-answer__text">{answer.text}</span>
              <span className="hg-answer__points">{answer.points}</span>
              <span className="hg-answer__status">
                {suddenDeath && slot === "hidden" ? (i === 0 ? "Only this counts" : "Miss") : STATUS[slot]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
