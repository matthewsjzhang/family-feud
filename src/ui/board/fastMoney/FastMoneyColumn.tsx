// One player's five answers: an answer box and a points box per row, like the
// show's Fast Money board. Questions are never shown (the host reads them).

import { useState, type ReactNode } from "react";
import type { FastMoneyCellView } from "../../../app/boardSnapshot";
import { fitFontSize } from "../fitText";

/**
 * True once a value has appeared after being absent. A board opened mid-way shows
 * what's already there without replaying every entrance. (State set during render
 * is React's "store info from previous renders" pattern.)
 */
function useJustAppeared(present: boolean): boolean {
  const [wasAbsent, setWasAbsent] = useState(!present);
  if (!present && !wasAbsent) setWasAbsent(true);
  return present && wasAbsent;
}

const pointsText = (n: number) => (n === 1 ? "1 point" : `${n} points`);

export function cellLabel(player: 0 | 1, question: number, cell: FastMoneyCellView, covered: boolean): string {
  const base = `Player ${player + 1}, question ${question + 1}`;
  if (covered) return `${base}, covered`;
  // Judged implies shown; treat a scored cell with no text as a blank answer.
  const text = cell.text ?? (cell.points !== null ? "" : null);
  if (text === null) return `${base}, no answer yet`;
  const answer = text === "" ? "no answer" : text.toUpperCase();
  return cell.points === null ? `${base}: ${answer}` : `${base}: ${answer}, ${pointsText(cell.points)}`;
}

interface CellProps {
  player: 0 | 1;
  question: number;
  cell: FastMoneyCellView;
  covered: boolean;
  current: boolean;
  /** Key of the latest show/points event for this cell; remounts the glow so it replays. */
  glowKey?: number;
  /** Key of a duplicate answer on this row; shows the double X while set. */
  duplicateKey: number | null;
}

function FastMoneyCell({ player, question, cell, covered, current, glowKey, duplicateKey }: CellProps) {
  const text = covered ? null : cell.text;
  const points = covered ? null : cell.points;
  const textIsNew = useJustAppeared(text !== null);
  const pointsIsNew = useJustAppeared(points !== null);
  const upper = text ? text.toUpperCase() : "";

  return (
    <li
      className={`fm-cell${current ? " is-current" : ""}${duplicateKey !== null ? " is-duplicate" : ""}`}
      aria-label={cellLabel(player, question, cell, covered)}
      aria-current={current ? "true" : undefined}
      data-testid={`fm-cell-${player}-${question}`}
    >
      <span className="fm-cell__answer" aria-hidden="true">
        {upper && (
          <span
            key={upper}
            className={`fm-cell__text${textIsNew ? " is-new" : ""}`}
            style={{ fontSize: `${fitFontSize(upper, { base: 3, fitChars: 16, min: 1.7 })}cqw` }}
          >
            {upper}
          </span>
        )}
      </span>
      <span className="fm-cell__points" aria-hidden="true">
        {points !== null && (
          <span key={points} className={`fm-cell__score${pointsIsNew ? " is-new" : ""}`} data-zero={points === 0 || undefined}>
            {points}
          </span>
        )}
      </span>
      {!covered && glowKey !== undefined && <span key={glowKey} className="fm-cell__glow" aria-hidden="true" />}
      {duplicateKey !== null && (
        <span key={duplicateKey} className="fm-cell__dup" aria-hidden="true">
          <span className="fm-cell__dup-x">X</span>
          <span className="fm-cell__dup-x">X</span>
          <span className="fm-cell__dup-text">TRY AGAIN</span>
        </span>
      )}
    </li>
  );
}

interface ColumnProps {
  player: 0 | 1;
  name: string;
  cells: FastMoneyCellView[];
  /** This player is up (ready or answering). */
  active: boolean;
  covered: boolean;
  /** Row to highlight (while answering), else null. */
  currentRow: number | null;
  /** Row the duplicate X's go on, else null. */
  duplicateRow: number | null;
  duplicateKey: number | null;
  glow: (question: number) => number | undefined;
  /** Rendered over the rows (the cover and its lift animation). */
  children?: ReactNode;
}

export function FastMoneyColumn({
  player,
  name,
  cells,
  active,
  covered,
  currentRow,
  duplicateRow,
  duplicateKey,
  glow,
  children,
}: ColumnProps) {
  return (
    <section className={`fm-col fm-col--${player}${active ? " is-active" : ""}`} aria-label={`Player ${player + 1}: ${name}`}>
      <header className="fm-col__head">
        <span className="fm-col__tag">Player {player + 1}</span>
        <span className="fm-col__name">{name.toUpperCase()}</span>
      </header>
      <div className="fm-col__body">
        <ol className="fm-rows" aria-label={`Player ${player + 1} answers`}>
          {cells.map((cell, q) => (
            <FastMoneyCell
              key={q}
              player={player}
              question={q}
              cell={cell}
              covered={covered}
              current={currentRow === q}
              glowKey={glow(q)}
              duplicateKey={duplicateRow === q ? duplicateKey : null}
            />
          ))}
        </ol>
        {children}
      </div>
    </section>
  );
}
