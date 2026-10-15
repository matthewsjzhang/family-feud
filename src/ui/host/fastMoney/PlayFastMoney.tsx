// Game over: the host picks two different players from the winning family and starts
// Fast Money. Shown by the main game's PhasePanel.

import { useId, useState } from "react";
import type { GameHost } from "../../../app/useGameHost";
import type { FamilyState } from "../../../engine/mainGame";
import "./hostFastMoney.css";

interface PlayFastMoneyProps {
  host: GameHost;
  family: FamilyState;
}

export function PlayFastMoney({ host, family }: PlayFastMoneyProps) {
  // Players 1 and 2 by default, like the show's usual order.
  const [picked, setPicked] = useState<[number, number]>([0, 1]);
  const id = useId();
  const same = picked[0] === picked[1];
  const enoughPlayers = family.players.length >= 2;

  const select = (slot: 0 | 1) => (
    <label className="hfm-pick__label" htmlFor={`${id}-${slot}`}>
      Player {slot + 1}
      <select
        id={`${id}-${slot}`}
        className="hfm-pick__select"
        value={picked[slot]}
        onChange={(e) => {
          const next: [number, number] = [...picked];
          next[slot] = Number(e.target.value);
          setPicked(next);
        }}
      >
        {family.players.map((name, i) => (
          <option key={i} value={i}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="hfm-pick" role="group" aria-label="Fast Money players">
      <p className="hfm-pick__title">Fast Money: pick two players from the {family.name} family</p>
      {enoughPlayers ? (
        <>
          <div className="hfm-pick__row">
            {select(0)}
            {select(1)}
          </div>
          {same && <p className="hg-warn">Pick two different players.</p>}
          <button
            type="button"
            className="hg-btn hg-btn--primary hg-btn--big"
            disabled={same}
            onClick={() => host.startFastMoney(picked)}
          >
            Play Fast Money
          </button>
        </>
      ) : (
        <p className="hg-warn">Fast Money needs two players in the family.</p>
      )}
    </div>
  );
}
