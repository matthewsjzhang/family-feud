// One family's podium: name, score, and what they're doing right now.

import type { Team } from "../../engine/mainGame";
import { useCountUp, useTimeout } from "./boardHooks";
import { fitFontSize } from "./fitText";

export type FamilyStatus = "control" | "buzzed" | "faceOffWon" | "stealing" | "won" | null;

const STATUS_TEXT: Record<Exclude<FamilyStatus, null>, string> = {
  control: "In control",
  buzzed: "Buzzed in",
  faceOffWon: "Play or pass?",
  stealing: "Steal!",
  won: "Round won",
};

interface Props {
  team: Team;
  name: string;
  score: number;
  status: FamilyStatus;
  /** The player at the buzzer during a face-off. */
  faceOffPlayer: string | null;
  /** Key of a buzz event for this family; remounts the flash so it replays. */
  flashKey: number | null;
  gain: { key: number; points: number } | null;
  onGainDone: (key: number) => void;
}

function GainPop({ points, onDone }: { points: number; onDone: () => void }) {
  useTimeout(onDone, 2500);
  return <span className="gb-family__gain">+{points}</span>;
}

export function FamilyPanel({ team, name, score, status, faceOffPlayer, flashKey, gain, onGainDone }: Props) {
  const shown = useCountUp(score);
  const upper = name.toUpperCase();
  const statusText = status ? STATUS_TEXT[status] : null;

  return (
    <section
      className={`gb-family gb-family--${team}${status ? ` is-active is-${status}` : ""}`}
      aria-label={`${name} family`}
      data-status={status ?? "none"}
    >
      {flashKey !== null && <span key={flashKey} className="gb-family__flash" aria-hidden="true" />}
      <h2 className="gb-family__name" style={{ fontSize: `${fitFontSize(upper, { base: 2.4, fitChars: 9, min: 1.3 })}cqw` }}>
        {upper}
      </h2>
      <div className="gb-family__score">
        {/* The visible number counts up; screen readers get the real score straight away. */}
        <span aria-hidden="true">{shown}</span>
        <span className="gb-sr">Score: {score}</span>
        {gain && <GainPop key={gain.key} points={gain.points} onDone={() => onGainDone(gain.key)} />}
      </div>
      {/* Always rendered so the panels keep the same height whatever the status. */}
      <p className="gb-family__status">{statusText ?? " "}</p>
      {faceOffPlayer && (
        <p className="gb-family__player">
          <span className="gb-family__player-label">At the buzzer</span>
          <span className="gb-family__player-name">{faceOffPlayer.toUpperCase()}</span>
        </p>
      )}
    </section>
  );
}
