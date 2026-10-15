// The 2 x 4 answer board. Always 8 tiles, like the show: answers 1-4 run down the
// left column, 5-8 down the right, and unused positions are blank.

import type { SlotView } from "../../app/boardSnapshot";
import { answerTextStyle } from "./fitText";

export const BOARD_SIZE = 8;
const ROWS = 4;

interface TileProps {
  number: number;
  slot: SlotView | null;
  /** Changes on each reveal event for this tile; remounts the glow so it replays. */
  glowKey?: number;
}

function tileLabel(number: number, slot: SlotView | null): string {
  if (!slot) return `Answer ${number}, not used`;
  if (slot.state === "hidden" || slot.text === null) return `Answer ${number}, hidden`;
  const points = slot.points === 1 ? "1 point" : `${slot.points ?? 0} points`;
  return `Answer ${number}: ${slot.text.toUpperCase()}, ${points}${slot.state === "shown" ? ", not scored" : ""}`;
}

export function AnswerTile({ number, slot, glowKey }: TileProps) {
  const column = number <= ROWS ? 1 : 2;
  const row = ((number - 1) % ROWS) + 1;
  // Explicit placement (not grid-auto-flow) so the column order can't drift with CSS changes.
  const placement = { style: { gridColumn: column, gridRow: row }, "data-col": column, "data-row": row };

  if (!slot) {
    return <li className="gb-tile gb-tile--empty" {...placement} aria-label={tileLabel(number, null)} />;
  }

  const revealed = slot.state !== "hidden" && slot.text !== null;
  const text = revealed ? (slot.text ?? "").toUpperCase() : "";
  const fit = answerTextStyle(text);

  return (
    <li
      className={`gb-tile gb-tile--${slot.state}${revealed ? " is-revealed" : ""}`}
      {...placement}
      aria-label={tileLabel(number, slot)}
      data-state={slot.state}
    >
      <div className="gb-tile__inner" aria-hidden="true">
        <div className="gb-tile__face gb-tile__front">
          <span className="gb-tile__oval">{number}</span>
        </div>
        <div className="gb-tile__face gb-tile__back">
          {revealed && (
            <>
              <span
                className={`gb-tile__text${fit.twoLines ? " gb-tile__text--two" : ""}`}
                style={{ fontSize: fit.fontSize }}
              >
                {text}
              </span>
              <span className="gb-tile__points">{slot.points}</span>
            </>
          )}
        </div>
      </div>
      {revealed && glowKey !== undefined && <span key={glowKey} className="gb-tile__glow" aria-hidden="true" />}
    </li>
  );
}

interface BoardProps {
  slots: SlotView[];
  glow: Record<number, number>;
}

export function AnswerBoard({ slots, glow }: BoardProps) {
  const numbers = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
  return (
    <ol className="gb-board" aria-label="Answer board">
      {numbers.map((n) => (
        <AnswerTile key={n} number={n} slot={slots[n - 1] ?? null} glowKey={glow[n]} />
      ))}
    </ol>
  );
}
