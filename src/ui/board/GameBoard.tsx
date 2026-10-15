// The audience board (#/board): what the room sees on the TV. It renders only
// what's in the snapshot (never hidden answers) and uses event batches for the
// short animations in between.

import type { BoardEvent, BoardSnapshot, RoundView } from "../../app/boardSnapshot";
import { otherTeam, type Team } from "../../engine/mainGame";
import { AnswerBoard } from "./AnswerBoard";
import { FamilyPanel, type FamilyStatus } from "./FamilyPanel";
import { IdleScreen, StrikeOverlay, WinnerOverlay } from "./Overlays";
import { useBoardEvents } from "./useBoardEvents";
import "./board.css";

export interface EventBatch {
  /** Increases with every batch so effects can tell batches apart. */
  id: number;
  events: BoardEvent[];
}

export interface GameBoardProps {
  /** Null when no game is in progress. */
  snapshot: BoardSnapshot | null;
  /** The most recent things that happened, for animations. */
  eventBatch: EventBatch | null;
}

const TEAMS: readonly Team[] = [0, 1];

function familyStatus(round: RoundView, team: Team): FamilyStatus {
  switch (round.phase) {
    case "faceOff":
      return round.faceOff.buzzed === team ? "buzzed" : null;
    case "playOrPass":
      return round.faceOff.winner === team ? "faceOffWon" : null;
    case "playing":
      return round.control === team ? "control" : null;
    case "steal":
      return round.control !== null && otherTeam(round.control) === team ? "stealing" : null;
    case "over":
      return round.winner === team ? "won" : null;
  }
}

function statusLine(round: RoundView, names: [string, string]): string {
  switch (round.phase) {
    case "faceOff": {
      const [a, b] = round.faceOff.players;
      const intro = round.kind === "suddenDeath" ? "Sudden Death face-off - only the #1 answer counts" : "Face-off";
      return `${intro}: ${a} vs ${b}`;
    }
    case "playOrPass":
      return round.faceOff.winner === null ? "Play or pass?" : `The ${names[round.faceOff.winner]} family won the face-off`;
    case "playing":
      return round.control === null ? "" : `The ${names[round.control]} family is playing`;
    case "steal":
      return round.control === null ? "" : `The ${names[otherTeam(round.control)]} family can steal!`;
    case "over":
      return round.winner === null ? "Round over" : `The ${names[round.winner]} family wins ${round.awarded} points`;
  }
}

/** Banner only for rounds worth more than face value, or Sudden Death. Driven by the round's rules, not its number. */
function RoundBanner({ round }: { round: RoundView }) {
  const suddenDeath = round.kind === "suddenDeath";
  if (!suddenDeath && round.multiplier <= 1) return null;
  return (
    <div className={`gb-banner${suddenDeath ? " gb-banner--sudden" : ""}`} data-testid="round-banner">
      <span className="gb-banner__name">{round.name.toUpperCase()}</span>
      {!suddenDeath && <span className="gb-banner__mult">x{round.multiplier}</span>}
    </div>
  );
}

function StrikePips({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="gb-pips" aria-label={`Strikes: ${count}`} role="img">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="gb-pips__x" aria-hidden="true">
          X
        </span>
      ))}
    </span>
  );
}

export function GameBoard({ snapshot, eventBatch }: GameBoardProps) {
  // Phase 6: pass a sound player as the second argument; it gets every event once, in order.
  const { transients, endStrike, endGain } = useBoardEvents(eventBatch);

  if (!snapshot) {
    return (
      <main className="gb-root">
        <div className="gb-stage">
          <IdleScreen />
        </div>
      </main>
    );
  }

  const { families, round, winner } = snapshot;
  const names: [string, string] = [families[0].name, families[1].name];

  return (
    <main className="gb-root">
      <div className="gb-stage">
        <div className="gb-layout">
          <header className="gb-top">
            {round && <RoundBanner round={round} />}
            {round && (
              <div className="gb-bank" aria-label={`Round bank: ${round.bank} points`} role="img">
                <span aria-hidden="true">{round.bank}</span>
              </div>
            )}
          </header>

          {TEAMS.map((team) => (
            <div key={team} className={`gb-side gb-side--${team}`}>
              <FamilyPanel
                team={team}
                name={families[team].name}
                score={families[team].score}
                status={round ? familyStatus(round, team) : null}
                faceOffPlayer={round?.phase === "faceOff" ? round.faceOff.players[team] : null}
                flashKey={transients.buzz?.team === team ? transients.buzz.key : null}
                gain={transients.gain?.team === team ? transients.gain : null}
                onGainDone={endGain}
              />
            </div>
          ))}

          <div className="gb-center">
            {round ? (
              <div className="gb-frame" key={`${round.kind}-${round.number}-${round.question}`}>
                <AnswerBoard slots={round.slots} glow={transients.glow} />
              </div>
            ) : (
              <div className="gb-frame gb-frame--waiting">
                <p>Next round coming up</p>
              </div>
            )}
          </div>

          <footer className="gb-caption">
            {round && (
              <>
                <p className={`gb-caption__status gb-caption__status--${round.phase}`}>
                  {statusLine(round, names)}
                  {(round.phase === "playing" || round.phase === "steal") && <StrikePips count={round.strikes} />}
                </p>
                <p className="gb-caption__question">{round.question}</p>
              </>
            )}
          </footer>
        </div>

        <StrikeOverlay strike={transients.strike} onDone={endStrike} />
        {winner !== null && (
          <WinnerOverlay name={families[winner].name} score={families[winner].score} celebrateKey={transients.celebrate} />
        )}
      </div>
    </main>
  );
}
