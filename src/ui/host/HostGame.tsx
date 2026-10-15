// The host console during a game: scores, the question and full answer key, and
// the controls for the current step. Every change goes through the GameHost.

import { useMemo, useRef, useState } from "react";
import type { GameHost } from "../../app/useGameHost";
import type { Team } from "../../engine/mainGame";
import { answerAction, isTakingAnswers } from "./game/answerAction";
import { AnswerEntry } from "./game/AnswerEntry";
import { AnswerKey } from "./game/AnswerKey";
import { PhasePanel } from "./game/PhasePanel";
import { Scoreboard } from "./game/Scoreboard";
import { SHORTCUTS, useHostShortcuts } from "./game/useHostShortcuts";
import "./hostGame.css";

export interface HostGameProps {
  host: GameHost;
}

export function HostGame({ host }: HostGameProps) {
  const state = host.state;
  const round = state?.round ?? null;
  const [guess, setGuess] = useState("");
  const entryRef = useRef<HTMLInputElement>(null);

  const actionFor = (answer: number | null) => answerAction(round, answer);
  const canJudge = (answer: number | null) => {
    const action = actionFor(answer);
    return action !== null && host.can(action);
  };
  const judge = (answer: number | null) => {
    const action = actionFor(answer);
    if (!action || !host.can(action)) return;
    host.apply(action);
    setGuess("");
  };
  const buzz = (team: Team) => {
    if (host.can({ type: "buzz", team })) host.apply({ type: "buzz", team });
  };
  const nextRound = () => {
    if (host.upcoming) {
      setGuess("");
      host.startNextRound();
    }
  };
  const undo = () => {
    if (host.canUndo) {
      setGuess("");
      host.undo();
    }
  };

  const taking = isTakingAnswers(round);
  const suggestion = useMemo(
    () => (taking && guess.trim() ? host.suggest(guess) : null),
    // host.suggest changes whenever the round does, which is what should refresh it.
    [taking, guess, host],
  );

  useHostShortcuts({
    answer: (i) => judge(i),
    miss: () => judge(null),
    buzz,
    undo,
    nextRound,
    focusEntry: () => entryRef.current?.focus(),
  });

  if (!state) return null;

  const entry = round && taking && (
    <AnswerEntry
      label={round.phase === "steal" ? "Their steal answer" : "What did they say?"}
      value={guess}
      onChange={setGuess}
      suggestion={suggestion}
      answers={round.survey.answers}
      onlyFirstCounts={round.kind === "suddenDeath"}
      canPick={(i) => canJudge(i)}
      onPick={(i) => judge(i)}
      inputRef={entryRef}
    />
  );

  return (
    <div className="hg">
      <Scoreboard
        state={state}
        canAdjust={(team, delta) => host.can({ type: "adjustScore", team, delta })}
        onAdjust={(team, delta) => host.apply({ type: "adjustScore", team, delta })}
      />

      {host.lastError && (
        <p role="alert" className="hg-error">
          {host.lastError}
        </p>
      )}

      <div className="hg-main">
        <section className="hg-question" aria-label="Question">
          {round ? (
            <>
              <p className="hg-question__text">{round.survey.question}</p>
              {round.kind === "suddenDeath" && <p className="hg-warn">Only answer #1 counts.</p>}
              <AnswerKey
                round={round}
                verb={round.phase === "over" ? "Reveal" : "Accept"}
                canPick={(i) => canJudge(i)}
                onPick={(i) => judge(i)}
              />
            </>
          ) : (
            <p className="hg-muted">The question appears here when the round starts.</p>
          )}
        </section>

        <section className="hg-controls" aria-label="Controls">
          <PhasePanel host={host} state={state} entry={entry} canJudge={canJudge} judge={judge} />
          <div className="hg-toolbar">
            <button type="button" className="hg-btn" disabled={!host.canUndo} onClick={undo}>
              Undo <kbd className="hg-kbd">U</kbd>
            </button>
          </div>
          <details className="hg-legend" open>
            <summary>Keyboard shortcuts</summary>
            <dl>
              {SHORTCUTS.map((s) => (
                <div key={s.keys}>
                  <dt>{s.keys}</dt>
                  <dd>{s.does}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      </div>
    </div>
  );
}
