// Judging: for each answer in order the host puts what the player said on the board,
// then "survey says" by picking the survey answer it matches, or "not on the board".
// The matcher only suggests; the host decides, and can re-judge until the last one.

import type { GameHost } from "../../../app/useGameHost";
import type { FastMoneyAnswer, FastMoneyState } from "../../../engine/fastMoney";
import type { Survey } from "../../../data/bank";
import { currentAnswers, nextToJudge, nextToShow } from "./fastMoneyView";

interface JudgingPanelProps {
  host: GameHost;
  fm: FastMoneyState;
  /** After an early win: the answers still to go up, for show (they can't change the result). */
  revealingRest?: boolean;
}

export function JudgingPanel({ host, fm, revealingRest = false }: JudgingPanelProps) {
  const answers = currentAnswers(fm);
  const showNext = nextToShow(fm);
  const judgeNext = nextToJudge(fm);
  return (
    <div className="hfm-panel">
      <h2 className="hfm-panel__title">
        {revealingRest ? `Reveal the rest of ${fm.players[fm.turn].name}'s answers` : `Judge ${fm.players[fm.turn].name}'s answers`}
      </h2>
      <p className="hg-muted hfm-panel__lead">
        {revealingRest
          ? "Optional: the target is already reached. Revealing these adds to the total but not the prize."
          : `Show each answer on the board, then "survey says": pick the survey answer it matches, or not on the board.`}
      </p>
      {answers.map((answer, q) => (
        <JudgeRow
          key={q}
          host={host}
          question={q}
          survey={fm.surveys[q]!}
          answer={answer}
          isNext={q === (judgeNext ?? showNext)}
        />
      ))}
    </div>
  );
}

interface JudgeRowProps {
  host: GameHost;
  question: number;
  survey: Survey;
  answer: FastMoneyAnswer;
  /** The answer the S / 1-8 / X shortcuts act on. */
  isNext: boolean;
}

function JudgeRow({ host, question, survey, answer, isNext }: JudgeRowProps) {
  const said = answer.text;
  const suggestion = said !== null ? host.suggestFastMoney(question, said) : null;
  const suggested = suggestion?.index ?? null;
  const judge = (choice: number | null) => {
    const action = { type: "judge", question, answer: choice } as const;
    if (host.canFastMoney(action)) host.applyFastMoney(action);
  };
  const canJudge = (choice: number | null) => host.canFastMoney({ type: "judge", question, answer: choice });
  const showAction = { type: "showAnswer", question } as const;

  const status =
    said === null
      ? "No answer · 0"
      : answer.judged
        ? answer.answer === null
          ? "Not on the board · 0"
          : `#${answer.answer + 1} ${survey.answers[answer.answer]?.text} · ${answer.points}`
        : answer.shown
          ? "On the board, not judged"
          : "Not shown yet";

  return (
    <section
      className={`hfm-judge${isNext ? " hfm-judge--next" : ""}${answer.judged ? " hfm-judge--done" : ""}`}
      aria-label={`Question ${question + 1}`}
    >
      <div className="hfm-judge__head">
        <span className="hfm-q__num">{question + 1}</span>
        <span className="hfm-judge__question">{survey.question}</span>
        <span className="hfm-judge__points" data-testid={`fm-points-${question}`}>
          {answer.judged ? answer.points : "–"}
        </span>
      </div>
      <p className="hfm-judge__said">
        {said === null ? <span className="hg-muted">No answer</span> : <>Said: <strong>{said}</strong></>}
        <span className="hfm-tag">{status}</span>
      </p>

      {said !== null && (
        <>
          <div className="hfm-judge__actions">
            <button
              type="button"
              className="hg-btn"
              disabled={answer.shown || !host.canFastMoney(showAction)}
              onClick={() => host.applyFastMoney(showAction)}
            >
              Show answer
            </button>
            {suggestion && (
              <span className="hfm-judge__suggestion">
                {suggested !== null ? (
                  <button
                    type="button"
                    className="hg-entry__suggestion hfm-judge__suggest-btn"
                    disabled={!canJudge(suggested)}
                    onClick={() => judge(suggested)}
                  >
                    Suggested: #{suggested + 1} {survey.answers[suggested]?.text}
                  </button>
                ) : (
                  <span className="hg-muted">{suggestion.ambiguous ? "Too close to call" : "No match on the survey"}</span>
                )}
              </span>
            )}
          </div>
          <ol className="hfm-survey" aria-label={`Survey answers for question ${question + 1}`}>
            {survey.answers.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`hfm-survey__btn${i === suggested ? " hfm-survey__btn--suggested" : ""}`}
                  aria-label={`#${i + 1} ${a.text} (${a.points})`}
                  aria-pressed={answer.judged && answer.answer === i}
                  disabled={!canJudge(i)}
                  onClick={() => judge(i)}
                >
                  <span className="hfm-survey__num">{i + 1}</span>
                  <span className="hfm-survey__text">{a.text}</span>
                  <span className="hfm-survey__points">{a.points}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="hg-btn hg-btn--bad"
            aria-pressed={answer.judged && answer.answer === null}
            disabled={!canJudge(null)}
            onClick={() => judge(null)}
          >
            Not on the board
          </button>
        </>
      )}
    </section>
  );
}
