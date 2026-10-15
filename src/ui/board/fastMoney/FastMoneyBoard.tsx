// The audience board's Fast Money screen: two columns of five answers (player 1
// left, player 2 right), the clock, and the running total. Persistent state comes
// from the view; event batches only drive short animations.

import type { FastMoneyView } from "../../../app/boardSnapshot";
import type { FastMoneyPhase } from "../../../engine/fastMoney";
import type { EventBatch } from "../GameBoard";
import { FastMoneyColumn } from "./FastMoneyColumn";
import {
  Cover,
  CoverLift,
  DUPLICATE_MS,
  FastMoneyClock,
  FastMoneyResult,
  FastMoneyTotal,
  FlashAnnouncement,
  TIME_UP_MS,
  TimeUpFlash,
} from "./FastMoneyParts";
import { cellKey, useFastMoneyEvents } from "./useFastMoneyEvents";
import "../board.css";
import "./fastMoney.css";

export interface FastMoneyBoardProps {
  view: FastMoneyView;
  /** The most recent things that happened (fm* events), for animations. */
  eventBatch: EventBatch | null;
}

const PLAYERS = [0, 1] as const;

const clockShown = (phase: FastMoneyPhase) => phase === "ready" || phase === "answering";

function statusLine(view: FastMoneyView): string {
  const up = view.players[view.turn];
  switch (view.phase) {
    case "ready":
      return `${up}, get ready`;
    case "answering":
      return `${up} is answering`;
    case "judging":
      return "Survey says...";
    case "handoff":
      return `${view.players[1]} is up next`;
    case "done":
      return "";
  }
}

export function FastMoneyBoard({ view, eventBatch }: FastMoneyBoardProps) {
  const { transients, endFlash } = useFastMoneyEvents(eventBatch);
  const playing = clockShown(view.phase);
  const { duplicate, timeUp, uncover } = transients;
  // After an early win the result steps aside while the host reveals the rest, and comes back once they're all up.
  const allJudged = view.rows.every((row) => row[view.turn]!.points !== null);
  const showResult = view.outcome !== null && (!transients.revealingRest || allJudged);

  return (
    <main className="gb-root fm-root">
      <div className="gb-stage">
        <div className="fm-layout">
          <header className="fm-top">
            <div className="fm-title">
              <h1 className="fm-title__name">Fast Money</h1>
              <p className="fm-title__family">The {view.family} family</p>
            </div>
            <div className="fm-top__clock">
              {playing && (
                <FastMoneyClock timeLeftMs={view.timeLeftMs} running={view.clockRunning} playerName={view.players[view.turn]} />
              )}
            </div>
            <div className="fm-up">
              {playing && <span className="fm-up__tag">Player {view.turn + 1}</span>}
              <p className="fm-up__status">{statusLine(view)}</p>
            </div>
          </header>

          <div className="fm-frame">
            {PLAYERS.map((player) => {
              const covered = player === 0 && view.player1Hidden;
              return (
                <FastMoneyColumn
                  key={player}
                  player={player}
                  name={view.players[player]}
                  cells={view.rows.map((row) => row[player])}
                  active={playing && view.turn === player}
                  covered={covered}
                  currentRow={view.phase === "answering" && view.turn === player ? view.current : null}
                  duplicateRow={view.turn === player ? view.current : null}
                  duplicateKey={duplicate}
                  glow={(q) => transients.highlight[cellKey(player, q)]}
                >
                  {covered && <Cover />}
                  {player === 0 && !covered && uncover !== null && (
                    <CoverLift key={uncover} onDone={() => endFlash("uncover", uncover)} />
                  )}
                </FastMoneyColumn>
              );
            })}
          </div>

          <footer className="fm-bottom">
            <FastMoneyTotal total={view.total} target={view.target} />
          </footer>
        </div>

        {timeUp !== null && <TimeUpFlash key={timeUp} />}

        {/* Stays mounted so screen readers announce each flash. */}
        <div className="fm-live" aria-live="assertive" aria-atomic="true">
          {duplicate !== null && (
            <FlashAnnouncement
              key={`d${duplicate}`}
              text="Already said. Try again."
              ms={DUPLICATE_MS}
              onDone={() => endFlash("duplicate", duplicate)}
            />
          )}
          {timeUp !== null && (
            <FlashAnnouncement key={`t${timeUp}`} text="Time!" ms={TIME_UP_MS} onDone={() => endFlash("timeUp", timeUp)} />
          )}
        </div>

        {showResult && view.outcome && <FastMoneyResult outcome={view.outcome} target={view.target} celebrateKey={transients.result} />}
      </div>
    </main>
  );
}
