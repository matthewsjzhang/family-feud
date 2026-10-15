// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GameHost } from "../../../app/useGameHost";
import { createGame } from "../../../engine/mainGame";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { PhasePanel } from "../game/PhasePanel";
import { FM_FAMILIES } from "./fakeFastMoneyHost";

/** The main game's game-over panel, with the Smith family as the winner. */
function setup({ canStart = true, rules = DEFAULT_RULES }: { canStart?: boolean; rules?: GameRules } = {}) {
  const state = createGame(rules, FM_FAMILIES);
  state.families[0].score = 320;
  state.winner = 0;
  const startFastMoney = vi.fn<(players: [number, number]) => void>();
  const host: GameHost = {
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
    canStartFastMoney: canStart,
    startFastMoney,
    applyFastMoney: () => {},
    canFastMoney: () => false,
    suggestFastMoney: () => null,
    endFastMoney: () => {},
  };
  render(<PhasePanel host={host} state={state} entry={null} canJudge={() => false} judge={() => {}} />);
  return { user: userEvent.setup(), startFastMoney };
}

const play = () => screen.getByRole("button", { name: "Play Fast Money" });

describe("Play Fast Money at game over", () => {
  it("starts with players 1 and 2 by default", async () => {
    const { user, startFastMoney } = setup();
    expect(screen.getByText("The Smith family wins the game!")).toBeInTheDocument();
    expect(screen.getByLabelText("Player 1")).toHaveDisplayValue("Sam");
    expect(screen.getByLabelText("Player 2")).toHaveDisplayValue("Sue");
    await user.click(play());
    expect(startFastMoney).toHaveBeenCalledWith([0, 1]);
  });

  it("needs two different players", async () => {
    const { user, startFastMoney } = setup();
    await user.selectOptions(screen.getByLabelText("Player 2"), "Sam");
    expect(screen.getByText("Pick two different players.")).toBeInTheDocument();
    expect(play()).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Player 1"), "Sid");
    expect(screen.queryByText("Pick two different players.")).not.toBeInTheDocument();
    await user.click(play());
    expect(startFastMoney).toHaveBeenCalledWith([2, 0]);
  });

  it("is hidden when the rules have Fast Money off", () => {
    const rules: GameRules = structuredClone(DEFAULT_RULES);
    rules.fastMoney.enabled = false;
    setup({ canStart: false, rules });
    expect(screen.queryByRole("button", { name: /Fast Money/ })).not.toBeInTheDocument();
    expect(screen.getByText("Fast Money is off in these rules.")).toBeInTheDocument();
  });
});
