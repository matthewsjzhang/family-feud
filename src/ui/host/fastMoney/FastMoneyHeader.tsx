// Fast Money status bar: who is playing, the clock, the running total and Undo.

import { fastMoneyTotal, type FastMoneyState } from "../../../engine/fastMoney";
import { secondsLeft } from "./fastMoneyView";

interface FastMoneyHeaderProps {
  fm: FastMoneyState;
  familyName: string;
  canUndo: boolean;
  onUndo(): void;
}

/** The clock turns red for the last few seconds. */
const LOW_SECONDS = 5;

export function FastMoneyHeader({ fm, familyName, canUndo, onUndo }: FastMoneyHeaderProps) {
  const seconds = secondsLeft(fm);
  const timing = fm.phase === "ready" || fm.phase === "answering";
  const clockClass = [
    "hfm-clock",
    timing && seconds <= LOW_SECONDS ? "hfm-clock--low" : "",
    timing && !fm.clockRunning ? "hfm-clock--stopped" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className="hfm-header">
      <div className="hfm-header__who">
        <span className="hfm-header__label">Fast Money · {familyName} family</span>
        <span className="hfm-header__player" data-testid="fm-player">
          Player {fm.turn + 1}: <strong>{fm.players[fm.turn].name}</strong>
        </span>
      </div>
      <div className={clockClass} role="timer" aria-label="Clock" data-testid="fm-clock">
        <span className="hfm-clock__seconds">{seconds}</span>
        <span className="hfm-clock__state">
          {!timing ? "time" : fm.clockRunning ? "seconds" : fm.phase === "ready" ? "ready" : "paused"}
        </span>
      </div>
      <div className="hfm-header__total" aria-label="Total" data-testid="fm-total">
        <strong>{fastMoneyTotal(fm)}</strong> / {fm.rule.target}
      </div>
      <button type="button" className="hg-btn hfm-header__undo" disabled={!canUndo} onClick={onUndo}>
        Undo <kbd className="hg-kbd">U</kbd>
      </button>
    </header>
  );
}
