// One survey in the browser: summary line, and when expanded the full answer key
// plus "Play this next". Host-only view, so answers are shown openly.

import type { Survey } from "../../../data/bank";

export interface SurveyRowProps {
  survey: Survey;
  expanded: boolean;
  played: boolean;
  queued: boolean;
  /** Why the next round would not use it (it still queues for a later round), or null. */
  problem: string | null;
  onToggle(): void;
  onQueue(): void;
  /** Keeps element ids unique when the same survey is shown twice (surprise pick + list). */
  idPrefix?: string;
}

export function SurveyRow({ survey, expanded, played, queued, problem, onToggle, onQueue, idPrefix = "" }: SurveyRowProps) {
  const panelId = `qb-answers-${idPrefix}${survey.id}`;
  const warnId = `qb-warn-${idPrefix}${survey.id}`;
  return (
    <li className={`qb-row${expanded ? " qb-row--open" : ""}${queued ? " qb-row--queued" : ""}`}>
      <button
        type="button"
        className="qb-row__head"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="qb-row__question">{survey.question}</span>
        <span className="qb-row__meta">
          <span>Season {survey.season}</span>
          <span>
            {survey.answerCount} {survey.answerCount === 1 ? "answer" : "answers"}
          </span>
          {played && <span className="qb-badge qb-badge--played">Played</span>}
          {queued && <span className="qb-badge qb-badge--queued">Queued</span>}
        </span>
      </button>
      {expanded && (
        <div id={panelId} className="qb-row__body">
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
            {played && <span className="hg-muted">Already played in an earlier game.</span>}
            {problem && (
              <span id={warnId} className="qb-warn">
                {problem}; it will wait for a round it fits.
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
