// Ready and answering: the host reads the current question, types what the player
// says and presses Enter, as fast as possible. The answer box keeps focus throughout.

import { useEffect, useState, type RefObject } from "react";
import type { GameHost } from "../../../app/useGameHost";
import { isDuplicate, type FastMoneyAction, type FastMoneyState } from "../../../engine/fastMoney";
import { currentAnswers, passedQuestions } from "./fastMoneyView";

interface AnsweringPanelProps {
  host: GameHost;
  fm: FastMoneyState;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function AnsweringPanel({ host, fm, inputRef }: AnsweringPanelProps) {
  const [text, setText] = useState("");
  const answering = fm.phase === "answering";
  const player2 = fm.turn === 1;
  const answers = currentAnswers(fm);
  const passed = passedQuestions(fm);
  const player1 = fm.players[0];

  // The engine counts duplicates; a new one means "double buzzer, ask again".
  // Tracked during render (not in an effect) so the notice appears with the same update.
  const [seen, setSeen] = useState({ duplicates: fm.duplicates, current: fm.current });
  const [duplicateOn, setDuplicateOn] = useState<number | null>(null);
  if (seen.duplicates !== fm.duplicates || seen.current !== fm.current) {
    setDuplicateOn(fm.duplicates > seen.duplicates && seen.current === fm.current ? fm.current : null);
    setSeen({ duplicates: fm.duplicates, current: fm.current });
  }
  const showDuplicate = answering && duplicateOn === fm.current;

  // Put the cursor in the box the moment the clock starts.
  useEffect(() => {
    if (answering) inputRef.current?.focus();
  }, [answering, inputRef]);

  const run = (action: FastMoneyAction) => {
    if (!host.canFastMoney(action)) return false;
    host.applyFastMoney(action);
    return true;
  };
  const refocus = () => inputRef.current?.focus();

  const give = () => {
    if (run({ type: "giveAnswer", text })) setText("");
    refocus();
  };
  // The engine needs some text even for a forced duplicate; it isn't stored.
  const forcedDuplicate: FastMoneyAction = { type: "giveAnswer", text: text.trim() || "(duplicate)", duplicate: true };
  const forceDuplicate = () => {
    if (run(forcedDuplicate)) setText("");
    refocus();
  };
  const pass = () => {
    run({ type: "pass" });
    refocus();
  };
  const toggleClock = () => {
    run(fm.clockRunning ? { type: "pauseClock" } : { type: "startClock" });
    if (answering) refocus();
  };

  const question = fm.surveys[fm.current];
  const looksDuplicate = player2 && answering && text.trim() !== "" && isDuplicate(fm, fm.current, text);

  return (
    <div className="hfm-panel">
      {player2 && (
        <p className="hfm-note" role="note">
          {player1.name}'s answers are covered on the audience board.
        </p>
      )}

      <section className="hfm-current" aria-label="Current question">
        <p className="hfm-current__label">
          {answering ? `Question ${fm.current + 1} of ${fm.surveys.length}` : "First question"}
        </p>
        <p className="hfm-current__text">{question?.question}</p>
        {player2 && (
          <p className="hfm-current__p1">
            {player1.name} said: <strong>{player1.answers[fm.current]?.text ?? "no answer"}</strong>
          </p>
        )}
      </section>

      {showDuplicate && (
        <p className="hfm-duplicate" role="alert">
          Duplicate! Ask again
        </p>
      )}

      {fm.phase === "ready" ? (
        <button
          type="button"
          className="hg-btn hg-btn--primary hg-btn--big"
          disabled={!host.canFastMoney({ type: "startClock" })}
          onClick={toggleClock}
        >
          Start the clock <kbd className="hg-kbd">Space</kbd>
        </button>
      ) : (
        <>
          <form
            className="hfm-entry"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) give();
            }}
          >
            <label className="hfm-entry__label">
              What did they say?
              <input
                ref={inputRef}
                className="hg-entry__input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Type the answer, press Enter…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  // First Escape clears; on an empty box it leaves it so shortcuts work.
                  if (text) setText("");
                  else e.currentTarget.blur();
                }}
              />
            </label>
            {looksDuplicate && <p className="hg-warn">Same as {player1.name}'s answer: Enter will buzz a duplicate.</p>}
          </form>
          <div className="hfm-actions">
            <button type="button" className="hg-btn hg-btn--big" disabled={!host.canFastMoney({ type: "pass" })} onClick={pass}>
              Pass
            </button>
            {player2 && (
              <button
                type="button"
                className="hg-btn hg-btn--bad hg-btn--big"
                disabled={!host.canFastMoney(forcedDuplicate)}
                onClick={forceDuplicate}
              >
                Duplicate — try again
              </button>
            )}
            <button
              type="button"
              className="hg-btn"
              disabled={!host.canFastMoney(fm.clockRunning ? { type: "pauseClock" } : { type: "startClock" })}
              onClick={toggleClock}
            >
              {fm.clockRunning ? "Pause clock" : "Resume clock"}
            </button>
            <button
              type="button"
              className="hg-btn"
              disabled={!host.canFastMoney({ type: "endTurn" })}
              onClick={() => run({ type: "endTurn" })}
            >
              End turn early
            </button>
          </div>
        </>
      )}

      <ol className="hfm-questions" aria-label="Questions">
        {fm.surveys.map((survey, i) => {
          const said = answers[i]?.text ?? null;
          const isCurrent = i === fm.current;
          return (
            <li
              key={i}
              className={`hfm-q${isCurrent ? " hfm-q--current" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              data-testid={`fm-question-${i}`}
            >
              <span className="hfm-q__num">{i + 1}</span>
              <span className="hfm-q__text">{survey.question}</span>
              <span className="hfm-q__said">
                {said !== null ? (
                  <strong>{said}</strong>
                ) : passed.has(i) ? (
                  <span className="hfm-tag">Passed</span>
                ) : null}
              </span>
              {player2 && (
                <span className="hfm-q__p1">
                  P1: {player1.answers[i]?.text ?? "no answer"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
