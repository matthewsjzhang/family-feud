// Both families' scores, the round and its bank, plus a manual score fix per family.

import { useState } from "react";
import type { GameState, Team } from "../../../engine/mainGame";
import { activeTeam, roundLabel } from "./answerAction";

interface ScoreboardProps {
  state: GameState;
  onAdjust(team: Team, delta: number): void;
  canAdjust(team: Team, delta: number): boolean;
}

export function Scoreboard({ state, onAdjust, canAdjust }: ScoreboardProps) {
  const round = state.round;
  const active = activeTeam(round);

  return (
    <section className="hg-scoreboard" aria-label="Scoreboard">
      <FamilyScore team={0} state={state} active={active === 0} onAdjust={onAdjust} canAdjust={canAdjust} />
      <div className="hg-scoreboard__round">
        <div className="hg-scoreboard__round-name">{round ? roundLabel(round) : "No round yet"}</div>
        {round && (
          <div className="hg-scoreboard__bank" aria-label="Round bank">
            Bank <strong>{round.bank}</strong>
            {round.multiplier !== 1 && (
              <span className="hg-muted">
                {" "}
                ×{round.multiplier} = {round.bank * round.multiplier}
              </span>
            )}
          </div>
        )}
      </div>
      <FamilyScore team={1} state={state} active={active === 1} onAdjust={onAdjust} canAdjust={canAdjust} />
    </section>
  );
}

interface FamilyScoreProps extends ScoreboardProps {
  team: Team;
  active: boolean;
}

function FamilyScore({ team, state, active, onAdjust, canAdjust }: FamilyScoreProps) {
  const family = state.families[team];
  const [amount, setAmount] = useState("10");
  const delta = Math.trunc(Number(amount));
  const valid = Number.isFinite(delta) && delta > 0;

  return (
    <div className={`hg-family hg-family--team${team}${active ? " hg-family--active" : ""}`}>
      <div className="hg-family__name">{family.name}</div>
      <div className="hg-family__score" data-testid={`score-${team}`}>
        {family.score}
      </div>
      <div className="hg-family__adjust">
        <button
          type="button"
          aria-label={`Subtract points from ${family.name}`}
          disabled={!valid || !canAdjust(team, -delta)}
          onClick={() => onAdjust(team, -delta)}
        >
          −
        </button>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          aria-label={`Score adjustment for ${family.name}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          type="button"
          aria-label={`Add points to ${family.name}`}
          disabled={!valid || !canAdjust(team, delta)}
          onClick={() => onAdjust(team, delta)}
        >
          +
        </button>
      </div>
    </div>
  );
}
