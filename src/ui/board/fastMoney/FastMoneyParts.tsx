// The Fast Money screen's smaller pieces: the clock, the cover over player 1,
// the short flashes (TIME!, double buzzer) and the result banner.

import type { FastMoneyOutcome } from "../../../engine/fastMoney";
import { useCountUp, useTimeout } from "../boardHooks";

export const DUPLICATE_MS = 1200;
export const TIME_UP_MS = 1500;
export const UNCOVER_MS = 1000;
/** Seconds left at which the clock turns red. */
export const URGENT_SECONDS = 5;

export const formatMoney = (n: number) => `$${n.toLocaleString("en-US")}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface ClockProps {
  timeLeftMs: number;
  running: boolean;
  playerName: string;
}

export function FastMoneyClock({ timeLeftMs, running, playerName }: ClockProps) {
  const seconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const urgent = seconds <= URGENT_SECONDS;
  return (
    <div
      className={`fm-clock${urgent ? " is-urgent" : ""}${running ? " is-running" : ""}`}
      role="timer"
      aria-label={`${plural(seconds, "second")} left for ${playerName}${running ? "" : ", clock stopped"}`}
      data-urgent={urgent || undefined}
    >
      <span className="fm-clock__num" aria-hidden="true">
        {seconds}
      </span>
    </div>
  );
}

export function FastMoneyTotal({ total, target }: { total: number | null; target: number }) {
  const shown = useCountUp(total ?? 0);
  return (
    <div className="fm-total-wrap">
      <span className="fm-target">{target} to win</span>
      <div className="fm-total" role="img" aria-label={total === null ? "Total hidden" : `Total: ${plural(total, "point")}`}>
        <span className="fm-total__label" aria-hidden="true">
          Total
        </span>
        <span className="fm-total__num" aria-hidden="true">
          {total === null ? "—" : shown}
        </span>
      </div>
    </div>
  );
}

/** The blank panel over player 1's answers while player 2 plays. */
export function Cover() {
  return (
    <div className="fm-cover" role="img" aria-label="Player 1 answers covered">
      <span className="fm-cover__logo" aria-hidden="true">
        Fast Money
      </span>
    </div>
  );
}

/** The cover sliding off after player 2 has answered; removes itself. */
export function CoverLift({ onDone }: { onDone: () => void }) {
  useTimeout(onDone, UNCOVER_MS);
  return (
    <div className="fm-cover is-lifting" aria-hidden="true">
      <span className="fm-cover__logo">Fast Money</span>
    </div>
  );
}

/** Screen-reader text for a flash, plus the timer that ends it (the visual lives elsewhere). */
export function FlashAnnouncement({ text, ms, onDone }: { text: string; ms: number; onDone: () => void }) {
  useTimeout(onDone, ms);
  return <span className="gb-sr">{text}</span>;
}

export function TimeUpFlash() {
  return (
    <div className="fm-timeup" aria-hidden="true" data-testid="fm-timeup">
      <span className="fm-timeup__text">TIME!</span>
    </div>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => i);

interface ResultProps {
  outcome: FastMoneyOutcome;
  target: number;
  /** Set when fmResult just fired, to play the entrance; absent when the board opens later. */
  celebrateKey: number | null;
}

export function FastMoneyResult({ outcome, target, celebrateKey }: ResultProps) {
  const celebrating = celebrateKey !== null;
  const { won, total, payout } = outcome;
  const short = Math.max(0, target - total);
  return (
    <div className={`fm-result${won ? " fm-result--won" : " fm-result--lost"}`} role="alert" key={celebrateKey ?? "static"}>
      {won && celebrating && (
        <div className="fm-confetti" aria-hidden="true">
          {CONFETTI.map((i) => (
            <span key={i} className="fm-confetti__bit" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 140}ms` }} />
          ))}
        </div>
      )}
      <div className={`fm-result__card${celebrating ? " is-celebrating" : ""}`}>
        <p className="fm-result__kicker">{won ? "Winner!" : "Fast Money"}</p>
        <p className="fm-result__amount">{formatMoney(payout)}</p>
        <p className="fm-result__detail">
          {won
            ? `${plural(total, "point")}!`
            : `${plural(total, "point")} - ${short} short of ${target}`}
        </p>
      </div>
    </div>
  );
}
