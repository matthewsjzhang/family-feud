// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { INERT_CHAMPIONS_AND_BROWSER } from "../../../app/hostStubs";
import type { GameHost } from "../../../app/useGameHost";
import type { ChampionRecord } from "../../../engine/champions";
import { createGame, type Team } from "../../../engine/mainGame";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { HostGame } from "../HostGame";
import { FAMILIES } from "./fakeHost";
import { PhasePanel } from "./PhasePanel";

const record = (wins: number): ChampionRecord => ({ family: structuredClone(FAMILIES[0]!), wins, winnings: 0 });

interface Options {
  winner?: Team;
  champion?: ChampionRecord | null;
  championTeam?: 0 | 1 | null;
  limit?: number | null;
  canStartFastMoney?: boolean;
}

/** A finished game between Smith (team 0) and Jones (team 1). */
function makeHost({ winner = 0, champion = null, championTeam = null, limit = 5, canStartFastMoney = false }: Options = {}) {
  const rules: GameRules = { ...structuredClone(DEFAULT_RULES), builtIn: false, championLimit: limit };
  const state = createGame(rules, FAMILIES);
  state.families[winner].score = 310;
  state.winner = winner;
  const finishGame = vi.fn();
  const host: GameHost = {
    ...INERT_CHAMPIONS_AND_BROWSER,
    champion,
    championTeam,
    finishGame,
    bankReady: true,
    bankSize: 10,
    suddenDeathBankSize: 0,
    state,
    upcoming: null,
    canUndo: false,
    lastError: null,
    newGame: () => {},
    endGame: () => {},
    apply: () => {},
    can: () => false,
    startNextRound: () => {},
    swapQuestion: () => {},
    canSwapQuestion: false,
    undo: () => {},
    suggest: () => null,
    openBoard: () => {},
    fastMoney: null,
    canStartFastMoney,
    startFastMoney: () => {},
    applyFastMoney: () => {},
    canFastMoney: () => false,
    suggestFastMoney: () => null,
    endFastMoney: () => {},
  };
  return { host, state, finishGame };
}

function renderPanel(options?: Options) {
  const made = makeHost(options);
  render(<PhasePanel host={made.host} state={made.state} entry={null} canJudge={() => false} judge={() => {}} />);
  return { ...made, user: userEvent.setup() };
}

const outcome = () => screen.getByTestId("next-game-outcome");
const nextGame = () => screen.getByRole("button", { name: "Next game" });

describe("Next game at game over", () => {
  it("calls finishGame and says the winners become champions", async () => {
    const { user, finishGame } = renderPanel();
    expect(outcome()).toHaveTextContent("Smith become champions (1 win)");
    expect(nextGame()).toHaveAccessibleDescription("Smith become champions (1 win)");
    expect(nextGame()).toHaveClass("hg-btn--primary");
    await user.click(nextGame());
    expect(finishGame).toHaveBeenCalledTimes(1);
  });

  it("says the champions defend their title", () => {
    renderPanel({ champion: record(2), championTeam: 0 });
    expect(outcome()).toHaveTextContent("Smith defend their title: 3 wins");
  });

  it("says the champions retire at the win limit", () => {
    renderPanel({ champion: record(4), championTeam: 0, limit: 5 });
    expect(outcome()).toHaveTextContent("Smith retire undefeated (5 wins)");
  });

  it("never retires anyone without a limit", () => {
    renderPanel({ champion: record(9), championTeam: 0, limit: null });
    expect(outcome()).toHaveTextContent("Smith defend their title: 10 wins");
  });

  it("says the challengers dethrone the champions", () => {
    renderPanel({ winner: 1, champion: record(3), championTeam: 0 });
    expect(outcome()).toHaveTextContent("Jones dethrone the champions");
  });

  it("keeps Fast Money first when it can still be played", () => {
    renderPanel({ canStartFastMoney: true });
    const buttons = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    expect(buttons.indexOf("Play Fast Money")).toBeGreaterThanOrEqual(0);
    expect(buttons.indexOf("Play Fast Money")).toBeLessThan(buttons.indexOf("Next game"));
    expect(nextGame()).not.toHaveClass("hg-btn--primary");
  });
});

describe("host scoreboard", () => {
  it("marks the returning champions with their wins", () => {
    const { host } = makeHost({ champion: record(2), championTeam: 0 });
    render(<HostGame host={host} />);
    expect(screen.getByTestId("champion-0")).toHaveTextContent("Champions · 2 wins");
    expect(screen.queryByTestId("champion-1")).not.toBeInTheDocument();
  });

  it("shows no badge without champions", () => {
    const { host } = makeHost();
    render(<HostGame host={host} />);
    expect(screen.queryByText(/^Champions ·/)).not.toBeInTheDocument();
  });
});
