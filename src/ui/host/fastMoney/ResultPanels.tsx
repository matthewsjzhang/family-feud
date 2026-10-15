// Between the players (handoff), the final result (done), and the both-players
// answer summary the host always sees.

import type { GameHost } from "../../../app/useGameHost";
import { fastMoneyTotal, type FastMoneyState } from "../../../engine/fastMoney";
import { NextGame } from "../game/PhasePanel";
import { formatDollars } from "./fastMoneyView";

interface PanelProps {
  host: GameHost;
  fm: FastMoneyState;
}

export function HandoffPanel({ host, fm }: PanelProps) {
  const [p1, p2] = fm.players;
  const total = fastMoneyTotal(fm);
  return (
    <div className="hfm-panel">
      <h2 className="hfm-panel__title">
        {p1.name} scored {total}
      </h2>
      <p className="hfm-panel__lead">
        {p2.name} needs {Math.max(0, fm.rule.target - total)} more for {formatDollars(fm.rule.grandPrize)}, with{" "}
        {fm.rule.timers[1]} seconds.
      </p>
      <p className="hfm-note" role="note">
        Starting player 2 covers {p1.name}'s answers on the audience board.
      </p>
      <button
        type="button"
        className="hg-btn hg-btn--primary hg-btn--big"
        disabled={!host.canFastMoney({ type: "startPlayer2" })}
        onClick={() => host.applyFastMoney({ type: "startPlayer2" })}
      >
        Bring out player 2 — start
      </button>
      <AnswerSummary fm={fm} />
    </div>
  );
}

export function DonePanel({ host, fm }: PanelProps) {
  const outcome = fm.outcome;
  return (
    <div className="hfm-panel">
      {outcome && (
        <div className={`hfm-result${outcome.won ? " hfm-result--won" : ""}`} role="status">
          <p className="hfm-result__headline">
            {outcome.won ? `WON ${formatDollars(outcome.payout)}!` : formatDollars(outcome.payout)}
          </p>
          <p className="hfm-result__detail">
            {outcome.total} points{outcome.won ? "" : ` · ${formatDollars(fm.rule.perPoint)} a point`}
          </p>
        </div>
      )}
      <button type="button" className="hg-btn hg-btn--primary hg-btn--big" onClick={host.endFastMoney}>
        Back to the game
      </button>
      {/* Leave Fast Money first; finishGame then records the payout the hook kept from the outcome. */}
      {host.state && <NextGame host={host} state={host.state} primary={false} before={host.endFastMoney} />}
      <AnswerSummary fm={fm} />
    </div>
  );
}

/** Both players' answers side by side, with points once judged. */
export function AnswerSummary({ fm }: { fm: FastMoneyState }) {
  const cell = (player: 0 | 1, q: number) => {
    const a = fm.players[player].answers[q];
    if (!a || (player === 1 && fm.turn === 0)) return <span className="hg-muted">–</span>;
    return (
      <>
        {a.text ?? <span className="hg-muted">{a.judged ? "No answer" : "–"}</span>}
        {a.judged && <span className="hfm-summary__points">{a.points}</span>}
      </>
    );
  };
  return (
    <table className="hfm-summary" aria-label="All answers">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">{fm.players[0].name}</th>
          <th scope="col">{fm.players[1].name}</th>
        </tr>
      </thead>
      <tbody>
        {fm.surveys.map((survey, q) => (
          <tr key={q} title={survey.question}>
            <th scope="row">{q + 1}</th>
            <td>{cell(0, q)}</td>
            <td>{cell(1, q)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
