// The controls for the current step of the round: buzzers, play/pass, strikes,
// the steal, the post-round reveal and the next round / game over.

import { useId, type ReactNode } from "react";
import type { GameHost } from "../../../app/useGameHost";
import { recordResult } from "../../../engine/champions";
import { otherTeam, type GameState, type RoundState, type Team } from "../../../engine/mainGame";
import { PlayFastMoney } from "../fastMoney/PlayFastMoney";
import { roundLabel } from "./answerAction";

interface PhasePanelProps {
  host: GameHost;
  state: GameState;
  /** The typed-answer box, already wired up; shown wherever someone is answering. */
  entry: ReactNode;
  canJudge(answer: number | null): boolean;
  judge(answer: number | null): void;
}

export function PhasePanel(props: PhasePanelProps) {
  const round = props.state.round;
  if (!round || round.phase === "over") return <BetweenRounds {...props} round={round} />;
  switch (round.phase) {
    case "faceOff":
      return <FaceOff {...props} round={round} />;
    case "playOrPass":
      return <PlayOrPass {...props} round={round} />;
    case "playing":
      return <Playing {...props} round={round} />;
    case "steal":
      return <Steal {...props} round={round} />;
  }
}

type WithRound<R = RoundState> = PhasePanelProps & { round: R };

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="hg-kbd">{children}</kbd>;
}

function teamClass(team: Team) {
  return `hg-team${team}`;
}

function SuddenDeathNote() {
  return (
    <p className="hg-banner hg-banner--warn" role="note">
      Sudden Death: only the #1 answer counts. Any other answer is a miss.
    </p>
  );
}

function MissButton({ canJudge, judge, children }: Pick<PhasePanelProps, "canJudge" | "judge"> & { children: ReactNode }) {
  return (
    <button type="button" className="hg-btn hg-btn--bad hg-btn--big" disabled={!canJudge(null)} onClick={() => judge(null)}>
      {children} <Kbd>X</Kbd>
    </button>
  );
}

function FaceOff({ host, state, round, entry, canJudge, judge }: WithRound) {
  const fo = round.faceOff;
  const player = (team: Team) => state.families[team].players[fo.players[team]] ?? "?";
  const name = (team: Team) => state.families[team].name;
  const firstAnswer = fo.first?.answer ?? null;

  return (
    <div className="hg-phase">
      <h2 className="hg-phase__title">Face-off</h2>
      {round.kind === "suddenDeath" && <SuddenDeathNote />}
      <p className="hg-phase__lead">
        At the buzzer: <span className={teamClass(0)}>{player(0)} ({name(0)})</span> vs{" "}
        <span className={teamClass(1)}>{player(1)} ({name(1)})</span>
      </p>

      {fo.buzzed === null ? (
        <>
          <div className="hg-row">
            {([0, 1] as const).map((team) => (
              <button
                key={team}
                type="button"
                className={`hg-btn hg-btn--big hg-btn--team${team}`}
                disabled={!host.can({ type: "buzz", team })}
                onClick={() => host.apply({ type: "buzz", team })}
              >
                {name(team)} buzzed <Kbd>{team === 0 ? "Q" : "P"}</Kbd>
              </button>
            ))}
          </div>
          {host.canSwapQuestion && (
            <button type="button" className="hg-btn" onClick={host.swapQuestion}>
              Swap question
            </button>
          )}
        </>
      ) : (
        <>
          {fo.first && (
            <p className="hg-phase__note">
              {player(fo.first.team)} {firstAnswer === null ? "missed" : `said #${firstAnswer + 1} ${round.survey.answers[firstAnswer]?.text}`}
              .{" "}
              {fo.turn !== null &&
                (round.kind === "suddenDeath" || firstAnswer === null
                  ? `${player(fo.turn)} gets a chance.`
                  : `${player(fo.turn)} must beat #${firstAnswer + 1}.`)}
            </p>
          )}
          {fo.turn !== null && (
            <>
              <p className={`hg-phase__who ${teamClass(fo.turn)}`}>
                {player(fo.turn)} ({name(fo.turn)}) is answering
              </p>
              {entry}
              <MissButton canJudge={canJudge} judge={judge}>
                Not on the board
              </MissButton>
            </>
          )}
        </>
      )}
    </div>
  );
}

function PlayOrPass({ host, state, round }: WithRound) {
  const winner = round.faceOff.winner;
  if (winner === null) return null;
  const family = state.families[winner].name;
  return (
    <div className="hg-phase">
      <h2 className="hg-phase__title">Play or pass?</h2>
      <p className={`hg-phase__who ${teamClass(winner)}`}>{family} won the face-off.</p>
      <div className="hg-row">
        <button
          type="button"
          className={`hg-btn hg-btn--big hg-btn--team${winner}`}
          disabled={!host.can({ type: "playOrPass", play: true })}
          onClick={() => host.apply({ type: "playOrPass", play: true })}
        >
          Play
        </button>
        <button
          type="button"
          className={`hg-btn hg-btn--big hg-btn--team${otherTeam(winner)}`}
          disabled={!host.can({ type: "playOrPass", play: false })}
          onClick={() => host.apply({ type: "playOrPass", play: false })}
        >
          Pass to {state.families[otherTeam(winner)].name}
        </button>
      </div>
    </div>
  );
}

function Strikes({ count }: { count: number }) {
  return (
    <span className="hg-strikes" aria-label={`${count} of 3 strikes`}>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" className={i < count ? "hg-strike hg-strike--on" : "hg-strike"}>
          {i < count ? "●" : "○"}
        </span>
      ))}
    </span>
  );
}

function Playing({ state, round, entry, canJudge, judge }: WithRound) {
  const control = round.control;
  if (control === null) return null;
  const family = state.families[control];
  const player = round.currentPlayer === null ? null : family.players[round.currentPlayer];
  return (
    <div className="hg-phase">
      <h2 className="hg-phase__title">
        <span className={teamClass(control)}>{family.name}</span> playing <Strikes count={round.strikes} />
      </h2>
      {player && (
        <p className={`hg-phase__who ${teamClass(control)}`}>
          Now answering: <strong>{player}</strong>
        </p>
      )}
      {entry}
      <MissButton canJudge={canJudge} judge={judge}>
        Strike / not on board
      </MissButton>
    </div>
  );
}

function Steal({ state, round, entry, canJudge, judge }: WithRound) {
  if (round.control === null) return null;
  const stealer = otherTeam(round.control);
  return (
    <div className="hg-phase">
      <h2 className="hg-phase__title">
        Steal: <span className={teamClass(stealer)}>{state.families[stealer].name}</span> confer
      </h2>
      <p className="hg-phase__lead">
        One answer for the bank of {round.bank * round.multiplier}. If it misses, {state.families[round.control].name}{" "}
        keep it.
      </p>
      {entry}
      <MissButton canJudge={canJudge} judge={judge}>
        Steal failed
      </MissButton>
    </div>
  );
}

function BetweenRounds({ host, state, round }: WithRound<RoundState | null>) {
  const up = host.upcoming;
  const hidden = round ? round.slots.flatMap((s, i) => (s === "hidden" ? [i] : [])) : [];
  const revealAll = () => {
    for (const i of hidden) host.apply({ type: "reveal", answer: i });
  };

  return (
    <div className="hg-phase">
      {round && round.winner !== null && (
        <>
          <h2 className="hg-phase__title">{roundLabel(round)} over</h2>
          <p className={`hg-phase__who ${teamClass(round.winner)}`}>
            The {state.families[round.winner].name} family wins the round: +{round.awarded}
          </p>
        </>
      )}
      {round && hidden.length > 0 && (
        <div className="hg-reveal">
          <p className="hg-muted">Reveal the remaining answers (no points):</p>
          <div className="hg-row hg-row--wrap">
            {hidden.map((i) => (
              <button
                key={i}
                type="button"
                className="hg-btn"
                disabled={!host.can({ type: "reveal", answer: i })}
                onClick={() => host.apply({ type: "reveal", answer: i })}
              >
                Reveal #{i + 1} {round.survey.answers[i]?.text}
              </button>
            ))}
            {hidden.length > 1 && (
              <button type="button" className="hg-btn" onClick={revealAll}>
                Reveal all
              </button>
            )}
          </div>
        </div>
      )}

      {state.winner !== null ? (
        <div className={`hg-gameover ${teamClass(state.winner)}`} role="status">
          <h2 className="hg-gameover__title">The {state.families[state.winner].name} family wins the game!</h2>
          <p>
            Final score: {state.families[0].name} {state.families[0].score} · {state.families[1].name}{" "}
            {state.families[1].score}
          </p>
          {host.canStartFastMoney ? (
            <PlayFastMoney host={host} family={state.families[state.winner]} />
          ) : (
            !state.rules.fastMoney.enabled && <p className="hg-muted">Fast Money is off in these rules.</p>
          )}
          {/* Fast Money (when still available) comes first, so Next game is the quieter button then. */}
          <NextGame host={host} state={state} primary={!host.canStartFastMoney} />
        </div>
      ) : (
        <button
          type="button"
          className="hg-btn hg-btn--primary hg-btn--big"
          disabled={!up}
          onClick={host.startNextRound}
        >
          {up ? `Start ${roundLabel(up)}` : "No more rounds"} <Kbd>N</Kbd>
        </button>
      )}
    </div>
  );
}

const winsText = (wins: number) => `${wins} ${wins === 1 ? "win" : "wins"}`;

/** What "Next game" will do to the champion record, worded for the host. Null before anyone has won. */
export function nextGameOutcome(host: GameHost, state: GameState): string | null {
  if (state.winner === null) return null;
  const winner = state.families[state.winner];
  const winnerWasChampion = host.championTeam !== null && state.winner === host.championTeam;
  // The same engine call finishGame makes, so the preview can't disagree with what happens.
  // The payout doesn't change who is champion or the win count, so 0 is fine here.
  const update = recordResult(
    host.champion,
    { winner: { name: winner.name, players: [...winner.players] }, winnerWasChampion, payout: 0 },
    state.rules.championLimit,
  );
  if (update.retired) return `${winner.name} retire undefeated (${winsText(update.retired.wins)})`;
  const wins = update.champion?.wins ?? 1;
  if (winnerWasChampion && host.champion) return `${winner.name} defend their title: ${winsText(wins)}`;
  if (host.champion && host.championTeam !== null) return `${winner.name} dethrone the champions`;
  return `${winner.name} become champions (${winsText(wins)})`;
}

interface NextGameProps {
  host: GameHost;
  state: GameState;
  primary?: boolean;
  /** Runs before finishGame, e.g. leaving Fast Money. */
  before?(): void;
}

/** Records the result (champions, winnings) and goes to setup for the next game. */
export function NextGame({ host, state, primary = true, before }: NextGameProps) {
  const id = useId();
  const outcome = nextGameOutcome(host, state);
  if (outcome === null) return null;
  return (
    <div className="hg-nextgame">
      <p id={id} className="hg-nextgame__outcome" data-testid="next-game-outcome">
        {outcome}
      </p>
      <button
        type="button"
        className={`hg-btn hg-btn--big${primary ? " hg-btn--primary" : ""}`}
        aria-describedby={id}
        onClick={() => {
          before?.();
          host.finishGame();
        }}
      >
        Next game
      </button>
    </div>
  );
}
