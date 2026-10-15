// Both families' scores, the round and its bank, plus a manual score fix per family.

import { useState } from "react";
import type { GameState, Team } from "../../../engine/mainGame";
import { activeTeam, roundLabel } from "./answerAction";

interface ScoreboardProps {
  state: GameState;
  onAdjust(team: Team, delta: number): void;
  canAdjust(team: Team, delta: number): boolean;
  /** The returning champions in this game and the games they've won so far. */
  champion?: { team: Team; wins: number } | null;
}

export function Scoreboard({ state, onAdjust, canAdjust, champion = null }: ScoreboardProps) {
  const round = state.round;
  const active = activeTeam(round);

  return (
    <section className="hg-scoreboard" aria-label="Scoreboard">
      <FamilyScore
        team={0}
        state={state}
        active={active === 0}
        championWins={champion?.team === 0 ? champion.wins : null}
        onAdjust={onAdjust}
        canAdjust={canAdjust}
      />
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
      <FamilyScore
        team={1}
        state={state}
        active={active === 1}
        championWins={champion?.team === 1 ? champion.wins : null}
        onAdjust={onAdjust}
        canAdjust={canAdjust}
      />
    </section>
  );
}

interface FamilyScoreProps extends Omit<ScoreboardProps, "champion"> {
  team: Team;
  active: boolean;
  championWins: number | null;
}

function FamilyScore({ team, state, active, championWins, onAdjust, canAdjust }: FamilyScoreProps) {
  const family = state.families[team];
  const [amount, setAmount] = useState("10");
  const delta = Math.trunc(Number(amount));
  const valid = Number.isFinite(delta) && delta > 0;

  return (
    <div className={`hg-family hg-family--team${team}${active ? " hg-family--active" : ""}`}>
      <div className="hg-family__name">{family.name}</div>
      {championWins !== null && (
        <div className="hg-family__champion" data-testid={`champion-${team}`}>
          Champions · {championWins} {championWins === 1 ? "win" : "wins"}
        </div>
      )}
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
