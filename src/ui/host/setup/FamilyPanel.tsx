// One family's name and player list on the setup screen.

import { useId } from "react";
import type { FamilySetup } from "../../../app/useGameHost";
import { defaultFamilyName, defaultPlayerName, MAX_PLAYERS, MIN_PLAYERS } from "./setupStorage";

export interface FamilyPanelProps {
  team: 0 | 1;
  family: FamilySetup;
  onChange(family: FamilySetup): void;
}

export function FamilyPanel({ team, family, onChange }: FamilyPanelProps) {
  const id = useId();
  const label = `Family ${team + 1}`;
  const { players } = family;

  const setPlayer = (index: number, name: string) => onChange({ ...family, players: players.with(index, name) });
  const removePlayer = (index: number) => onChange({ ...family, players: players.filter((_, i) => i !== index) });
  const addPlayer = () => onChange({ ...family, players: [...players, defaultPlayerName(players.length)] });

  return (
    <fieldset className={`setup-family setup-family--team-${team}`}>
      <legend className="setup-family__legend">{label}</legend>
      <div className="setup-field">
        <label htmlFor={`${id}-name`}>Family name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={family.name}
          placeholder={defaultFamilyName(team)}
          autoComplete="off"
          onChange={(e) => onChange({ ...family, name: e.target.value })}
        />
      </div>
      <fieldset className="setup-family__players">
        <legend>Players ({players.length})</legend>
        <ol className="setup-family__list">
          {players.map((player, i) => (
            // Index keys are fine: players are only appended or removed, never reordered.
            <li key={i} className="setup-family__player">
              <label htmlFor={`${id}-p${i}`} className="setup-family__player-label">
                Player {i + 1}
              </label>
              <input
                id={`${id}-p${i}`}
                type="text"
                value={player}
                placeholder={defaultPlayerName(i)}
                autoComplete="off"
                onChange={(e) => setPlayer(i, e.target.value)}
              />
              <button
                type="button"
                className="setup-button setup-button--quiet"
                aria-label={`Remove player ${i + 1}`}
                disabled={players.length <= MIN_PLAYERS}
                onClick={() => removePlayer(i)}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="setup-button" disabled={players.length >= MAX_PLAYERS} onClick={addPlayer}>
          Add player
        </button>
        <p className="setup-hint">
          {MIN_PLAYERS} to {MAX_PLAYERS} players. Blank names become "{defaultPlayerName(0)}" and so on.
        </p>
      </fieldset>
    </fieldset>
  );
}
