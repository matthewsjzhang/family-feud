// One survey in the browser: summary line, and when expanded the full answer key
// plus "Play this next" (and Edit / Delete for custom questions). Host-only view,
// so answers are shown openly.

import type { ReactNode } from "react";
import type { Survey } from "../../../data/bank";

export interface SurveyRowProps {
  survey: Survey;
  expanded: boolean;
  played: boolean;
  queued: boolean;
  /** Why the next round would not use it (it still queues for a later round), or null. */
  problem: string | null;
  /** A non-blocking remark, e.g. an unusual size for the next round, or null. */
  note?: string | null;
  onToggle(): void;
  onQueue(): void;
  /** Custom questions only. */
  onEdit?(): void;
  onDelete?(): void;
  /** Replaces the answer key while this row is being edited. */
  editor?: ReactNode;
  /** Keeps element ids unique when the same survey is shown twice (surprise pick + list). */
  idPrefix?: string;
}

/** Id of a row's head button, so the browser can move focus back to it. */
export const rowHeadId = (surveyId: string, idPrefix = "") => `qb-head-${idPrefix}${surveyId}`;

export function SurveyRow({
  survey,
  expanded,
  played,
  queued,
  problem,
  note = null,
  onToggle,
  onQueue,
  onEdit,
  onDelete,
  editor,
  idPrefix = "",
}: SurveyRowProps) {
  const panelId = `qb-answers-${idPrefix}${survey.id}`;
  const warnId = `qb-warn-${idPrefix}${survey.id}`;
  const custom = survey.custom !== undefined;
  const open = expanded || editor !== undefined;
  return (
    <li className={`qb-row${open ? " qb-row--open" : ""}${queued ? " qb-row--queued" : ""}`}>
      <button
        type="button"
        id={rowHeadId(survey.id, idPrefix)}
        className="qb-row__head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="qb-row__question">{survey.question}</span>
        <span className="qb-row__meta">
          {/* Custom questions have no season (stored as 0). */}
          {custom ? <span className="qb-badge qb-badge--custom">Custom</span> : <span>Season {survey.season}</span>}
          <span>
            {survey.answerCount} {survey.answerCount === 1 ? "answer" : "answers"}
          </span>
          {played && <span className="qb-badge qb-badge--played">Played</span>}
          {queued && <span className="qb-badge qb-badge--queued">Queued</span>}
        </span>
      </button>
      {open && (
        <div id={panelId} className="qb-row__body">
          {editor ?? (
            <>
              <ol className="qb-answers" aria-label={`Answers: ${survey.question}`}>
                {survey.answers.map((a, i) => (
                  <li key={i} className="qb-answer">
                    <span className="qb-answer__num">{i + 1}</span>
                    <span className="qb-answer__text">{a.text}</span>
                    <span className="qb-answer__points">{a.points}</span>
                  </li>
                ))}
              </ol>
              <div className="qb-row__actions">
                <button
                  type="button"
                  className="hg-btn hg-btn--primary"
                  disabled={queued}
                  aria-describedby={problem ? warnId : undefined}
                  onClick={onQueue}
                >
                  {queued ? "Queued to play next" : "Play this next"}
                </button>
                {onEdit && (
                  <button type="button" className="hg-btn" onClick={onEdit}>
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="hg-btn hg-btn--bad" onClick={onDelete}>
                    Delete
                  </button>
                )}
                {played && <span className="hg-muted">Already played in an earlier game.</span>}
                {problem && (
                  <span id={warnId} className="qb-warn">
                    {problem}; it will wait for a round it fits.
                  </span>
                )}
                {!problem && note && <span className="hg-muted">{note}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
