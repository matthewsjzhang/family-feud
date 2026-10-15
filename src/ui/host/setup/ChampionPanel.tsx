// The returning champions on the setup screen: read-only, since they play as they are.

import { useId } from "react";
import type { ChampionRecord } from "../../../engine/champions";

export interface ChampionPanelProps {
  champion: ChampionRecord;
  /** The chosen preset's championLimit (null = no limit). */
  limit: number | null;
  /** Omitted when the parent can't forget champions. */
  onClear?(): void;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** "2 more wins to retire undefeated", or "No win limit". */
export function winsToRetire(wins: number, limit: number | null): string {
  if (limit === null) return "No win limit";
  // A smaller limit picked after the fact still means the next win retires them (see recordResult).
  const left = Math.max(1, limit - wins);
  return `${left} more ${left === 1 ? "win" : "wins"} to retire undefeated`;
}

export function ChampionPanel({ champion, limit, onClear }: ChampionPanelProps) {
  const id = useId();
  const { family, wins, winnings } = champion;

  const clear = () => {
    if (window.confirm(`Start with a new group? The ${family.name} family's champion record will be forgotten.`)) {
      onClear?.();
    }
  };

  return (
    <section className="setup-family setup-family--team-0 setup-champion" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="setup-champion__label">
        Returning champions
      </h2>
      <p className="setup-champion__name">{family.name}</p>
      <p className="setup-champion__record">
        <span className="setup-champion__badge">{wins}-time champions</span>{" "}
        <span>{money(winnings)} won so far</span>
      </p>
      <p className="setup-champion__limit">{winsToRetire(wins, limit)}</p>
      <div>
        <h3 className="setup-champion__players-title">Players ({family.players.length})</h3>
        <ol className="setup-champion__players">
          {family.players.map((player, i) => (
            // Read-only list that never reorders, so index keys are fine.
            <li key={i}>{player}</li>
          ))}
        </ol>
      </div>
      {onClear && (
        <button type="button" className="setup-button setup-button--quiet setup-champion__clear" onClick={clear}>
          New group — clear champions
        </button>
      )}
    </section>
  );
}
