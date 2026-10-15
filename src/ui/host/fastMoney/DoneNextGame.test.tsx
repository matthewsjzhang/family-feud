// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createManualClock, FakeFastMoneyHost, FM_FAMILIES } from "./fakeFastMoneyHost";

describe("Next game after Fast Money", () => {
  it("leaves Fast Money, then finishes the game", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    render(
      <FakeFastMoneyHost
        clock={createManualClock()}
        overrides={{
          champion: { family: structuredClone(FM_FAMILIES[0]!), wins: 2, winnings: 5000 },
          championTeam: 0,
          endFastMoney: () => calls.push("endFastMoney"),
          finishGame: () => calls.push("finishGame"),
        }}
      />,
    );
    // Player 1 sweeps the #1 answers for 200 and the win.
    await user.click(screen.getByRole("button", { name: /Start the clock/ }));
    for (const a of ["towel", "dog", "eggs", "red", "apple"]) await user.keyboard(`${a}{Enter}`);
    for (let i = 0; i < 5; i++) await user.keyboard("s1");

    expect(screen.getByRole("button", { name: "Back to the game" })).toBeInTheDocument();
    expect(screen.getByTestId("next-game-outcome")).toHaveTextContent("Smith defend their title: 3 wins");
    await user.click(screen.getByRole("button", { name: "Next game" }));
    expect(calls).toEqual(["endFastMoney", "finishGame"]);
  });
});
