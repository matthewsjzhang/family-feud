// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toFastMoneyView, toSnapshot, type BoardEvent } from "../../../app/boardSnapshot";
import type { Survey } from "../../../data/bank";
import {
  createFastMoney,
  fastMoneyReducer,
  type FastMoneyAction,
  type FastMoneyState,
} from "../../../engine/fastMoney";
import { DEFAULT_RULES } from "../../../engine/rules";
import { newGame } from "../boardTestGame";
import { GameBoard, type EventBatch } from "../GameBoard";
import { FastMoneyBoard } from "./FastMoneyBoard";
import { DUPLICATE_MS, TIME_UP_MS, UNCOVER_MS } from "./FastMoneyParts";

// Each survey's #1 answer is worth 40, #2 30, #3 20, #4 10 (five #1 answers = 200).
function survey(i: number): Survey {
  const points = [40, 30, 20, 10];
  return {
    id: `fm${i}`,
    season: 22,
    answerCount: 4,
    question: `Fast Money question ${i + 1}`,
    total: 100,
    answers: points.map((p, j) => ({ text: `Q${i + 1} answer ${j + 1}`, points: p })),
    source: "https://example.test",
  };
}

const SURVEYS = Array.from({ length: 5 }, (_, i) => survey(i));
const P1_SAYS = ["Cat", "Pizza", "Monday", "Red", "Dog"];

const fresh = () => createFastMoney(DEFAULT_RULES.fastMoney, SURVEYS, ["Ann", "Bob"]);
const run = (s: FastMoneyState, ...actions: FastMoneyAction[]) => actions.reduce(fastMoneyReducer, s);
const say = (text: string): FastMoneyAction => ({ type: "giveAnswer", text });
const show = (question: number): FastMoneyAction => ({ type: "showAnswer", question });
const judge = (question: number, answer: number | null): FastMoneyAction => ({ type: "judge", question, answer });
const view = (s: FastMoneyState) => toFastMoneyView(s, "Smith");

let batchId = 0;
const batch = (...events: BoardEvent[]): EventBatch => ({ id: ++batchId, events });

/** Player 1 answers four, runs out of time on the fifth (blank), all judged: 30+20+10+0+0 = 60. */
function player1Done(): FastMoneyState {
  let s = run(fresh(), { type: "startClock" }, ...P1_SAYS.slice(0, 4).map(say), { type: "endTurn" });
  s = run(s, judge(0, 1), judge(1, 2), judge(2, 3), judge(3, null));
  return s;
}

/** Player 2 out and answering, with player 1's answers covered. */
const player2Answering = () => run(player1Done(), { type: "startPlayer2" }, { type: "startClock" });

const cell = (player: 0 | 1, q: number) => screen.getByTestId(`fm-cell-${player}-${q}`);
const allCells = () => screen.getAllByRole("listitem");

afterEach(() => {
  vi.useRealTimers();
});

describe("Fast Money grid", () => {
  it("has two columns of five rows, all empty at the start", () => {
    render(<FastMoneyBoard view={view(fresh())} eventBatch={null} />);
    expect(screen.getByRole("heading", { name: "Fast Money" })).toBeInTheDocument();
    expect(screen.getByText("The Smith family")).toBeInTheDocument();
    for (const player of [0, 1] as const) {
      const col = screen.getByRole("list", { name: `Player ${player + 1} answers` });
      expect(within(col).getAllByRole("listitem")).toHaveLength(5);
    }
    expect(allCells()).toHaveLength(10);
    expect(cell(1, 2)).toHaveAccessibleName("Player 2, question 3, no answer yet");
    expect(cell(0, 0)).toHaveTextContent("");
    expect(screen.getByRole("region", { name: "Player 1: Ann" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Player 2: Bob" })).toBeInTheDocument();
  });

  it("keeps answers off the board until the host shows them, then points after judging", () => {
    let s = run(fresh(), { type: "startClock" }, ...P1_SAYS.map(say));
    const { rerender } = render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(screen.queryByText("CAT")).not.toBeInTheDocument();
    expect(cell(0, 0)).toHaveAccessibleName("Player 1, question 1, no answer yet");

    s = run(s, show(0));
    rerender(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(cell(0, 0)).toHaveTextContent("CAT");
    expect(cell(0, 0)).toHaveAccessibleName("Player 1, question 1: CAT");
    expect(cell(0, 0).querySelector(".fm-cell__points")).toHaveTextContent("");

    s = run(s, judge(0, 0), judge(1, null));
    rerender(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(cell(0, 0)).toHaveAccessibleName("Player 1, question 1: CAT, 40 points");
    expect(cell(0, 0).querySelector(".fm-cell__points")).toHaveTextContent("40");
    // A wrong answer still shows its text, and its points box says 0.
    expect(cell(0, 1)).toHaveTextContent("PIZZA");
    expect(cell(0, 1)).toHaveAccessibleName("Player 1, question 2: PIZZA, 0 points");
    const zero = cell(0, 1).querySelector(".fm-cell__score")!;
    expect(zero).toHaveTextContent("0");
    expect(zero).toHaveAttribute("data-zero");
  });

  it("shows a blank answer as an empty box scored 0", () => {
    const s = run(fresh(), { type: "startClock" }, say("Cat"), { type: "endTurn" });
    render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(cell(0, 4)).toHaveAccessibleName("Player 1, question 5: no answer, 0 points");
    expect(cell(0, 4).querySelector(".fm-cell__answer")).toHaveTextContent("");
    expect(cell(0, 4).querySelector(".fm-cell__points")).toHaveTextContent("0");
  });
});

describe("clock and current row", () => {
  it("shows whole seconds left for the player who is up", () => {
    render(<FastMoneyBoard view={view(fresh())} eventBatch={null} />);
    const clock = screen.getByRole("timer");
    expect(clock).toHaveTextContent("20");
    expect(clock).toHaveAccessibleName("20 seconds left for Ann, clock stopped");
    expect(clock).not.toHaveAttribute("data-urgent");
    expect(screen.getByText("Ann, get ready")).toBeInTheDocument();
  });

  it("turns urgent in the last five seconds", () => {
    const s = run(fresh(), { type: "startClock" }, { type: "tick", ms: 14_000 });
    const { rerender } = render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(screen.getByRole("timer")).toHaveTextContent("6");
    expect(screen.getByRole("timer")).not.toHaveAttribute("data-urgent");

    const late = run(s, { type: "tick", ms: 1_500 });
    rerender(<FastMoneyBoard view={view(late)} eventBatch={null} />);
    expect(screen.getByRole("timer")).toHaveTextContent("5"); // 4.5s rounds up
    expect(screen.getByRole("timer")).toHaveAttribute("data-urgent");
    expect(screen.getByRole("timer")).toHaveAccessibleName("5 seconds left for Ann");
  });

  it("hides the clock while answers are judged", () => {
    render(<FastMoneyBoard view={view(player1Done())} eventBatch={null} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("highlights the row the current player is on while answering", () => {
    const s = run(fresh(), { type: "startClock" }, say("Cat"), { type: "pass" });
    render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(view(s).current).toBe(2);
    expect(cell(0, 2)).toHaveClass("is-current");
    expect(cell(0, 2)).toHaveAttribute("aria-current", "true");
    expect(document.querySelectorAll(".fm-cell.is-current")).toHaveLength(1);
  });

  it("puts player 2's clock up with their own time", () => {
    render(<FastMoneyBoard view={view(run(player1Done(), { type: "startPlayer2" }))} eventBatch={null} />);
    expect(screen.getByRole("timer")).toHaveTextContent("25");
    expect(screen.getByRole("timer")).toHaveAccessibleName("25 seconds left for Bob, clock stopped");
  });
});

describe("covering player 1", () => {
  it("covers player 1's answers and the total while player 2 plays", () => {
    const s = run(player2Answering(), say("Dog"));
    render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    expect(screen.getByRole("img", { name: "Player 1 answers covered" })).toBeInTheDocument();
    for (const word of P1_SAYS) expect(screen.queryByText(word.toUpperCase())).not.toBeInTheDocument();
    expect(cell(0, 0)).toHaveAccessibleName("Player 1, question 1, covered");
    expect(screen.getByRole("img", { name: "Total hidden" })).toHaveTextContent("—");
    expect(cell(1, 1)).toHaveClass("is-current");
  });

  it("uncovers player 1 once player 2 has finished, with the lift animation from the event", () => {
    vi.useFakeTimers();
    const before = run(player2Answering(), say("Dog"));
    const { rerender } = render(<FastMoneyBoard view={view(before)} eventBatch={null} />);

    const after = run(before, { type: "endTurn" });
    rerender(<FastMoneyBoard view={view(after)} eventBatch={batch({ type: "fmUncover" })} />);
    expect(screen.queryByRole("img", { name: "Player 1 answers covered" })).not.toBeInTheDocument();
    expect(cell(0, 0)).toHaveTextContent("CAT");
    expect(cell(0, 0)).toHaveAccessibleName("Player 1, question 1: CAT, 30 points");
    expect(screen.getByRole("img", { name: "Total: 60 points" })).toBeInTheDocument();
    expect(document.querySelector(".fm-cover.is-lifting")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(UNCOVER_MS));
    expect(document.querySelector(".fm-cover")).not.toBeInTheDocument();
  });
});

describe("event flashes", () => {
  it("flashes TRY AGAIN on the current row for a duplicate, then clears", () => {
    vi.useFakeTimers();
    const s = run(player2Answering(), say("Dog"), say("Pizza")); // Pizza repeats player 1
    expect(s.duplicates).toBe(1);
    render(<FastMoneyBoard view={view(s)} eventBatch={batch({ type: "fmDuplicate" })} />);
    expect(within(cell(1, 1)).getByText("TRY AGAIN")).toBeInTheDocument();
    expect(screen.getByText("Already said. Try again.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(DUPLICATE_MS));
    expect(screen.queryByText("TRY AGAIN")).not.toBeInTheDocument();
  });

  it("flashes TIME! when the clock runs out, then clears", () => {
    vi.useFakeTimers();
    const s = run(fresh(), { type: "startClock" }, say("Cat"), { type: "tick", ms: 20_000 });
    render(<FastMoneyBoard view={view(s)} eventBatch={batch({ type: "fmTimeUp" })} />);
    expect(screen.getByTestId("fm-timeup")).toHaveTextContent("TIME!");

    act(() => vi.advanceTimersByTime(TIME_UP_MS));
    expect(screen.queryByTestId("fm-timeup")).not.toBeInTheDocument();
  });

  it("handles each batch once, and glows the cell an event names", () => {
    vi.useFakeTimers();
    const s = run(fresh(), { type: "startClock" }, ...P1_SAYS.map(say), judge(0, 0));
    const b = batch({ type: "fmPoints", player: 0, question: 0, points: 40 }, { type: "fmTimeUp" });
    const { rerender } = render(<FastMoneyBoard view={view(s)} eventBatch={b} />);
    expect(cell(0, 0).querySelector(".fm-cell__glow")).toBeInTheDocument();
    expect(cell(0, 1).querySelector(".fm-cell__glow")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TIME_UP_MS));
    // Re-rendering with the same batch must not replay it.
    rerender(<FastMoneyBoard view={view(s)} eventBatch={b} />);
    expect(screen.queryByTestId("fm-timeup")).not.toBeInTheDocument();
  });

  it("counts the total up to the new value", () => {
    vi.useFakeTimers();
    const s = run(fresh(), { type: "startClock" }, ...P1_SAYS.map(say));
    const { rerender } = render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    const total = () => screen.getByRole("img", { name: /^Total/ });
    expect(total()).toHaveTextContent("0");

    rerender(<FastMoneyBoard view={view(run(s, judge(0, 0)))} eventBatch={null} />);
    expect(total()).toHaveAccessibleName("Total: 40 points");
    act(() => vi.advanceTimersByTime(2000));
    expect(total()).toHaveTextContent("40");
    expect(screen.getByText("200 to win")).toBeInTheDocument();
  });
});

describe("result banner", () => {
  it("shows the grand prize when player 1 alone reaches 200", () => {
    const s = run(fresh(), { type: "startClock" }, ...P1_SAYS.map(say), ...[0, 1, 2, 3, 4].map((q) => judge(q, 0)));
    expect(s.outcome?.won).toBe(true);
    render(<FastMoneyBoard view={view(s)} eventBatch={batch({ type: "fmResult", ...s.outcome! })} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Winner!");
    expect(banner).toHaveTextContent("$20,000");
    expect(banner).toHaveTextContent("200 points");
    expect(banner.querySelector(".fm-result__card")).toHaveClass("is-celebrating");
  });

  it("shows $5 a point when the pair falls short", () => {
    // Player 1: 60. Player 2: 40 + 40 + 30 + 20 + 0 = 130. Total 190 -> $950.
    let s = run(player2Answering(), say("Dog"), say("Fish"), say("Tuesday"), say("Blue"), { type: "endTurn" });
    s = run(s, judge(0, 0), judge(1, 0), judge(2, 1), judge(3, 2));
    expect(s.outcome).toEqual({ won: false, total: 190, payout: 950 });
    render(<FastMoneyBoard view={view(s)} eventBatch={batch({ type: "fmResult", ...s.outcome! })} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("$950");
    expect(banner).toHaveTextContent("190 points");
    expect(banner).toHaveTextContent("10 short of 200");
    expect(banner).not.toHaveTextContent("Winner");
  });

  it("steps aside while the host reveals the rest of an early win, then comes back", () => {
    const early = createFastMoney({ ...DEFAULT_RULES.fastMoney, target: 120 }, SURVEYS, ["Ann", "Bob"]);
    const won = run(early, { type: "startClock" }, ...P1_SAYS.map(say), judge(0, 0), judge(1, 0), judge(2, 0)); // 120
    expect(won.outcome).toEqual({ won: true, total: 120, payout: 20000 });
    const { rerender } = render(<FastMoneyBoard view={view(won)} eventBatch={batch({ type: "fmResult", ...won.outcome! })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Winner!");

    const shown = run(won, show(3));
    rerender(<FastMoneyBoard view={view(shown)} eventBatch={batch({ type: "fmAnswerShown", player: 0, question: 3 })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(cell(0, 3)).toHaveTextContent("RED");

    const all = run(shown, judge(3, 0), judge(4, null));
    rerender(<FastMoneyBoard view={view(all)} eventBatch={batch({ type: "fmPoints", player: 0, question: 4, points: 0 })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("160 points");
  });

  it("is there from the view alone for a board opened afterwards", () => {
    const s = run(fresh(), { type: "startClock" }, ...P1_SAYS.map(say), ...[0, 1, 2, 3, 4].map((q) => judge(q, 0)));
    render(<FastMoneyBoard view={view(s)} eventBatch={null} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("$20,000");
    expect(banner.querySelector(".fm-result__card")).not.toHaveClass("is-celebrating");
  });

  it("has no banner before the round is decided", () => {
    render(<FastMoneyBoard view={view(player1Done())} eventBatch={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("GameBoard routing", () => {
  it("switches to the Fast Money screen when the snapshot has Fast Money", () => {
    const game = { ...newGame(), winner: 1 as const };
    const fm = run(fresh(), { type: "startClock" });
    render(<GameBoard snapshot={toSnapshot(game, fm)} eventBatch={null} />);
    expect(screen.getByRole("heading", { name: "Fast Money" })).toBeInTheDocument();
    expect(screen.getByText("The Jones family")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("20");
    expect(screen.queryByRole("list", { name: "Answer board" })).not.toBeInTheDocument();
  });
});
