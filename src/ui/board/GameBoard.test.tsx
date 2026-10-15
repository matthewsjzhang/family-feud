// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardEvent } from "../../app/boardSnapshot";
import { nextRound } from "../../engine/mainGame";
import {
  newGame,
  roundRule,
  run,
  smithInControl,
  smithSweeps,
  snap,
  start,
  testRules,
} from "./boardTestGame";
import { GameBoard, type EventBatch } from "./GameBoard";

let batchId = 0;
const batch = (...events: BoardEvent[]): EventBatch => ({ id: ++batchId, events });

const tiles = () => within(screen.getByRole("list", { name: "Answer board" })).getAllByRole("listitem");
const tile = (n: number) => tiles()[n - 1]!;
const family = (name: string) => screen.getByRole("region", { name: `${name} family` });

afterEach(() => {
  vi.useRealTimers();
});

describe("idle screen", () => {
  it("shows the title and no board when there is no game", () => {
    render(<GameBoard snapshot={null} eventBatch={null} />);
    expect(screen.getByRole("heading", { name: "Family Feud" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Answer board" })).not.toBeInTheDocument();
  });
});

describe("answer board", () => {
  it("always has 8 tiles, with the unused ones blank", () => {
    render(<GameBoard snapshot={snap(start(newGame(), 5))} eventBatch={null} />);
    expect(tiles()).toHaveLength(8);
    for (const n of [1, 2, 3, 4, 5]) expect(tile(n)).toHaveAccessibleName(`Answer ${n}, hidden`);
    for (const n of [6, 7, 8]) {
      expect(tile(n)).toHaveAccessibleName(`Answer ${n}, not used`);
      expect(tile(n)).toHaveClass("gb-tile--empty");
      expect(tile(n)).toHaveTextContent("");
    }
    expect(tile(5)).toHaveTextContent("5");
  });

  it("fills the left column 1-4 top to bottom, then the right column 5-8", () => {
    render(<GameBoard snapshot={snap(start(newGame(), 8))} eventBatch={null} />);
    const place = (n: number) => [tile(n).dataset.col, tile(n).dataset.row];
    expect(place(1)).toEqual(["1", "1"]);
    expect(place(4)).toEqual(["1", "4"]);
    expect(place(5)).toEqual(["2", "1"]);
    expect(place(8)).toEqual(["2", "4"]);
  });

  it("never renders the text or points of hidden answers", () => {
    const state = run(start(newGame(), 8), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 2 });
    const { container } = render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.getByText("BARBECUE GRILL")).toBeInTheDocument();
    for (const hidden of ["HOT TUB", "SWIMMING POOL", "TRAMPOLINE", "BIRD BATH"]) {
      expect(container.textContent?.toUpperCase()).not.toContain(hidden);
    }
    expect(container.textContent).not.toContain("32");
  });

  it("shows a revealed answer's text and points", () => {
    const state = run(start(newGame(), 5), { type: "buzz", team: 1 }, { type: "faceOffAnswer", team: 1, answer: 0 });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(tile(1)).toHaveAccessibleName("Answer 1: HOT TUB, 32 points");
    expect(tile(1)).toHaveClass("is-revealed");
    expect(within(tile(1)).getByText("HOT TUB")).toBeInTheDocument();
    expect(within(tile(1)).getByText("32")).toBeInTheDocument();
  });

  it("marks answers revealed after the round as shown, not scored", () => {
    let state = smithInControl(start(newGame(), 4));
    state = run(state, { type: "answer", answer: null }, { type: "answer", answer: null }, { type: "answer", answer: null });
    state = run(state, { type: "steal", answer: null }, { type: "reveal", answer: 3 });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(tile(4)).toHaveAttribute("data-state", "shown");
    expect(tile(4)).toHaveAccessibleName("Answer 4: TRAMPOLINE, 9 points, not scored");
    expect(tile(1)).toHaveAttribute("data-state", "won");
  });

  it("shrinks long answers to two smaller lines", () => {
    const long = "Something you would find in a shed";
    const state = run(start(newGame(), 4, [long, "B", "C", "D"]), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 0 });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    const text = within(tile(1)).getByText(long.toUpperCase());
    expect(text).toHaveClass("gb-tile__text--two");
    expect(parseFloat(text.style.fontSize)).toBeLessThan(2.8);
  });

  it("glows a tile on its reveal event", () => {
    const state = run(start(newGame(), 5), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 1 });
    render(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "reveal", slot: 1, earned: true })} />);
    expect(tile(2).querySelector(".gb-tile__glow")).not.toBeNull();
    expect(tile(1).querySelector(".gb-tile__glow")).toBeNull();
  });
});

describe("header and caption", () => {
  it("shows the bank, the question and the face-off players", () => {
    const state = run(start(newGame(), 5), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 1 });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.getByRole("img", { name: "Round bank: 24 points" })).toHaveTextContent("24");
    expect(screen.getByText(state.round!.survey.question)).toBeInTheDocument();
    expect(screen.getByText(/Face-off: Sam vs Jan/)).toBeInTheDocument();
    expect(within(family("Smith")).getByText("SAM")).toBeInTheDocument();
    expect(within(family("Jones")).getByText("JAN")).toBeInTheDocument();
  });

  it("has no banner for a x1 round", () => {
    render(<GameBoard snapshot={snap(start(newGame()))} eventBatch={null} />);
    expect(screen.queryByTestId("round-banner")).not.toBeInTheDocument();
  });

  it("shows the round name for x2 and x3 rounds", () => {
    let state = smithSweeps(start(newGame()));
    state = start(state);
    const { rerender } = render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.getByTestId("round-banner")).toHaveTextContent("DOUBLEx2");

    state = start(smithSweeps(state));
    rerender(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.getByTestId("round-banner")).toHaveTextContent("TRIPLEx3");
  });

  it("takes the banner from the rules, not the round number", () => {
    const rules = testRules([roundRule("Bonus", 2), roundRule("Single", 1)]);
    let state = start(newGame(rules));
    const { rerender } = render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.getByTestId("round-banner")).toHaveTextContent("BONUS");

    state = start(smithSweeps(state));
    rerender(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.queryByTestId("round-banner")).not.toBeInTheDocument();
  });

  it("shows SUDDEN DEATH with the normal board", () => {
    let state = smithSweeps(start(newGame(testRules([roundRule("Single", 1)]))));
    expect(nextRound(state)?.kind).toBe("suddenDeath");
    state = start(state, 6);
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(screen.getByTestId("round-banner")).toHaveTextContent("SUDDEN DEATH");
    expect(tiles()).toHaveLength(8);
    expect(screen.getByText(/only the #1 answer counts/)).toBeInTheDocument();
  });
});

describe("families", () => {
  it("highlights the family that buzzed during the face-off", () => {
    const state = run(start(newGame()), { type: "buzz", team: 1 });
    render(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "buzz", team: 1 })} />);
    expect(family("Jones")).toHaveAttribute("data-status", "buzzed");
    expect(family("Jones")).toHaveTextContent("Buzzed in");
    expect(family("Smith")).toHaveAttribute("data-status", "none");
    expect(family("Jones").querySelector(".gb-family__flash")).not.toBeNull();
    expect(family("Smith").querySelector(".gb-family__flash")).toBeNull();
  });

  it("highlights the face-off winner while they decide to play or pass", () => {
    const state = run(start(newGame()), { type: "buzz", team: 1 }, { type: "faceOffAnswer", team: 1, answer: 0 });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(family("Jones")).toHaveAttribute("data-status", "faceOffWon");
    expect(family("Jones")).toHaveTextContent("Play or pass?");
    expect(family("Smith")).toHaveAttribute("data-status", "none");
    expect(screen.getByText("The Jones family won the face-off")).toBeInTheDocument();
  });

  it("highlights the family in control", () => {
    render(<GameBoard snapshot={snap(smithInControl(start(newGame())))} eventBatch={null} />);
    expect(family("Smith")).toHaveAttribute("data-status", "control");
    expect(family("Smith")).toHaveTextContent("In control");
    expect(family("Jones")).toHaveAttribute("data-status", "none");
    expect(screen.getByText("The Smith family is playing")).toBeInTheDocument();
  });

  it("shows the other family stealing after three strikes", () => {
    let state = smithInControl(start(newGame()));
    state = run(state, { type: "answer", answer: null }, { type: "answer", answer: null }, { type: "answer", answer: null });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(family("Jones")).toHaveAttribute("data-status", "stealing");
    expect(screen.getByText("The Jones family can steal!")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Strikes: 3" })).toBeInTheDocument();
  });
});

describe("events", () => {
  it("flashes N strike X's, then clears them", () => {
    vi.useFakeTimers();
    let state = smithInControl(start(newGame()));
    state = run(state, { type: "answer", answer: null }, { type: "answer", answer: null });
    const { container } = render(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "strike", count: 2 })} />);
    const overlay = screen.getByTestId("strike-overlay");
    expect(overlay).toHaveAttribute("aria-live", "assertive");
    expect(container.querySelectorAll(".gb-strike__x")).toHaveLength(2);
    expect(within(overlay).getByText("2 strikes")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1600));
    expect(container.querySelectorAll(".gb-strike__x")).toHaveLength(0);
  });

  it("restarts the strike timer for a new strike", () => {
    vi.useFakeTimers();
    const state = smithInControl(start(newGame()));
    const { container, rerender } = render(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "strike", count: 1 })} />);
    act(() => vi.advanceTimersByTime(1000));
    rerender(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "strike", count: 3 })} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelectorAll(".gb-strike__x")).toHaveLength(3);
    act(() => vi.advanceTimersByTime(600));
    expect(container.querySelectorAll(".gb-strike__x")).toHaveLength(0);
  });

  it("clears overlays on a new round", () => {
    vi.useFakeTimers();
    const state = start(newGame());
    const { container, rerender } = render(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "strike", count: 1 })} />);
    expect(container.querySelectorAll(".gb-strike__x")).toHaveLength(1);
    rerender(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "newRound" })} />);
    expect(container.querySelectorAll(".gb-strike__x")).toHaveLength(0);
  });

  it("counts the winner's score up and shows +N", () => {
    vi.useFakeTimers();
    const before = smithInControl(start(newGame(), 4));
    const { rerender } = render(<GameBoard snapshot={snap(before)} eventBatch={null} />);
    const after = smithSweeps(start(newGame(), 4));
    const points = after.round!.awarded;
    expect(points).toBe(32 + 24 + 21 + 9);

    rerender(<GameBoard snapshot={snap(after)} eventBatch={batch({ type: "roundWon", team: 0, points })} />);
    const smith = family("Smith");
    expect(within(smith).getByText(`+${points}`)).toBeInTheDocument();
    // Screen readers get the real score at once; the big number counts up.
    expect(within(smith).getByText(`Score: ${points}`)).toBeInTheDocument();
    expect(smith.querySelector(".gb-family__score [aria-hidden]")).not.toHaveTextContent(String(points));

    act(() => vi.advanceTimersByTime(3000));
    expect(smith.querySelector(".gb-family__score [aria-hidden]")).toHaveTextContent(String(points));
    expect(within(smith).queryByText(`+${points}`)).not.toBeInTheDocument();
    expect(family("Smith")).toHaveAttribute("data-status", "won");
  });

  it("shows the winner screen with the family and final score", () => {
    let state = smithSweeps(start(newGame(testRules([roundRule("Single", 1)]))));
    state = start(state, 5);
    state = run(state, { type: "buzz", team: 1 }, { type: "faceOffAnswer", team: 1, answer: 0 });
    expect(state.winner).toBe(1);
    const score = state.families[1].score;
    render(<GameBoard snapshot={snap(state)} eventBatch={batch({ type: "gameWon", team: 1 })} />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "JONES" })).toBeInTheDocument();
    expect(alert).toHaveTextContent(`Final score ${score}`);
  });

  it("keeps the winner screen without an event (e.g. the board was reopened)", () => {
    let state = smithSweeps(start(newGame(testRules([roundRule("Single", 1)]))));
    state = run(start(state, 5), { type: "buzz", team: 0 }, { type: "faceOffAnswer", team: 0, answer: 0 });
    render(<GameBoard snapshot={snap(state)} eventBatch={null} />);
    expect(within(screen.getByRole("alert")).getByRole("heading", { name: "SMITH" })).toBeInTheDocument();
  });
});
