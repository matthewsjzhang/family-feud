// Full-screen moments: the idle title, the strike X's and the winner screen.

import { useTimeout } from "./boardHooks";
import { fitFontSize } from "./fitText";

export const STRIKE_MS = 1500;

export function IdleScreen() {
  return (
    <div className="gb-idle">
      <div className="gb-idle__plate">
        <h1 className="gb-idle__title">
          <span>Family</span> <span>Feud</span>
        </h1>
      </div>
      <p className="gb-idle__wait">Waiting for the host to start a game</p>
    </div>
  );
}

function StrikeMarks({ count, onDone }: { count: number; onDone: () => void }) {
  useTimeout(onDone, STRIKE_MS);
  return (
    <>
      <div className="gb-strike__row" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="gb-strike__x" style={{ animationDelay: `${i * 60}ms` }}>
            X
          </span>
        ))}
      </div>
      <span className="gb-sr">{count === 1 ? "Strike" : `${count} strikes`}</span>
    </>
  );
}

/** The live region stays mounted so screen readers announce each new strike. */
export function StrikeOverlay({ strike, onDone }: { strike: { key: number; count: number } | null; onDone: (key: number) => void }) {
  return (
    <div className={`gb-strike${strike ? " is-on" : ""}`} aria-live="assertive" aria-atomic="true" data-testid="strike-overlay">
      {strike && <StrikeMarks key={strike.key} count={strike.count} onDone={() => onDone(strike.key)} />}
    </div>
  );
}

interface WinnerProps {
  name: string;
  score: number;
  /** Set when the gameWon event just fired, to play the entrance; absent on a later reload. */
  celebrateKey: number | null;
}

export function WinnerOverlay({ name, score, celebrateKey }: WinnerProps) {
  const upper = name.toUpperCase();
  return (
    <div className="gb-winner" role="alert" key={celebrateKey ?? "static"}>
      <div className={`gb-winner__card${celebrateKey !== null ? " is-celebrating" : ""}`}>
        <p className="gb-winner__kicker">Winner</p>
        <h2 className="gb-winner__name" style={{ fontSize: `${fitFontSize(upper, { base: 8, fitChars: 10, min: 3.5 })}cqw` }}>
          {upper}
        </h2>
        <p className="gb-winner__score">
          Final score <strong>{score}</strong>
        </p>
      </div>
    </div>
  );
}
