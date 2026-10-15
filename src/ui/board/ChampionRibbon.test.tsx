// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { newGame, snap, start } from "./boardTestGame";
import { GameBoard } from "./GameBoard";

const family = (name: string) => screen.getByRole("region", { name: `${name} family` });

describe("champions ribbon", () => {
  it("is on the champion family's panel only, with their wins", () => {
    const snapshot = { ...snap(start(newGame(), 5)), champion: { team: 1 as const, wins: 2 } };
    render(<GameBoard snapshot={snapshot} eventBatch={null} />);
    expect(within(family("Jones")).getByTestId("champion-ribbon-1")).toHaveTextContent("CHAMPIONS · 2 WINS");
    expect(within(family("Smith")).queryByText("CHAMPIONS")).not.toBeInTheDocument();
  });

  it("says WIN for a single win", () => {
    render(<GameBoard snapshot={{ ...snap(newGame()), champion: { team: 0, wins: 1 } }} eventBatch={null} />);
    expect(within(family("Smith")).getByTestId("champion-ribbon-0")).toHaveTextContent("CHAMPIONS · 1 WIN");
  });

  it("is absent when there are no returning champions", () => {
    render(<GameBoard snapshot={snap(newGame())} eventBatch={null} />);
    expect(screen.queryByText("CHAMPIONS")).not.toBeInTheDocument();
  });
});
