// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FastMoneyAction } from "../../../engine/fastMoney";
import { createManualClock, FakeFastMoneyHost } from "./fakeFastMoneyHost";

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const user = userEvent.setup();
  const clock = createManualClock();
  const onAction = vi.fn<(action: FastMoneyAction) => void>();
  render(<FakeFastMoneyHost clock={clock} onAction={onAction} />);
  return { user, clock, onAction };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });
const entry = () => screen.getByRole("textbox", { name: /what did they say/i });
const clockText = () => screen.getByTestId("fm-clock");
const total = () => screen.getByTestId("fm-total");
const player = () => screen.getByTestId("fm-player");
const current = () => screen.getByRole("region", { name: "Current question" });
const questionItem = (q: number) => screen.getByTestId(`fm-question-${q - 1}`);
const row = (q: number) => screen.getByRole("region", { name: `Question ${q}` });
const inRow = (q: number, name: string | RegExp) => within(row(q)).getByRole("button", { name });

/** Start the clock and give each answer with Enter; null = pass. */
async function answerAll(user: User, answers: (string | null)[]) {
  await user.click(button(/Start the clock/));
  for (const a of answers) {
    if (a === null) await user.click(button("Pass"));
    else await user.keyboard(`${a}{Enter}`);
  }
}

/** Show then judge each answer by clicking: a survey answer index or null (not on the board). */
async function judgeAll(user: User, choices: (number | null)[]) {
  for (const [i, choice] of choices.entries()) {
    const q = i + 1;
    await user.click(inRow(q, "Show answer"));
    if (choice === null) await user.click(inRow(q, "Not on the board"));
    else await user.click(within(row(q)).getByRole("button", { name: new RegExp(`^#${choice + 1} `) }));
  }
}

/** Player 1: TOWEL 30, DOG 40, "pizza" (not on board), RED 35, APPLE 55 = 160. */
async function player1Scores160(user: User) {
  await answerAll(user, ["towel", "dog", "pizza", "red", "apple"]);
  await judgeAll(user, [0, 0, null, 0, 0]);
}

describe("HostFastMoney", () => {
  it("shows every question and the full clock before it starts", () => {
    setup();
    expect(player()).toHaveTextContent("Player 1: Sam");
    expect(clockText()).toHaveTextContent("20");
    expect(total()).toHaveTextContent("0 / 200");
    expect(within(current()).getByText("Name something people bring to the beach")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Questions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(list).toHaveTextContent("Name a fruit");
    expect(button(/Undo/)).toBeDisabled();
    expect(queryButton("Pass")).not.toBeInTheDocument();
  });

  it("takes five answers with Enter, keeps focus, and returns to a passed question", async () => {
    const { user } = setup();
    await user.click(button(/Start the clock/));
    expect(entry()).toHaveFocus();
    expect(current()).toHaveTextContent("Question 1 of 5");

    await user.keyboard("towel{Enter}");
    expect(entry()).toHaveValue("");
    expect(entry()).toHaveFocus();
    expect(questionItem(1)).toHaveTextContent("towel");
    expect(current()).toHaveTextContent("Name a popular pet");

    await user.keyboard("cat{Enter}");
    await user.click(button("Pass"));
    expect(entry()).toHaveFocus(); // straight back to typing
    expect(questionItem(3)).toHaveTextContent("Passed");
    expect(current()).toHaveTextContent("Question 4 of 5");

    await user.keyboard("blue{Enter}banana{Enter}");
    // Back around to the passed question.
    expect(current()).toHaveTextContent("Name a breakfast food");
    expect(questionItem(3)).toHaveAttribute("aria-current", "step");
    await user.keyboard("cereal{Enter}");

    expect(screen.getByRole("heading", { name: "Judge Sam's answers" })).toBeInTheDocument();
    expect(within(row(3)).getByText("cereal")).toBeInTheDocument();
  });

  it("pauses and resumes, and ends the turn when time runs out", async () => {
    const { user, clock } = setup();
    await user.click(button(/Start the clock/));
    await user.keyboard("towel{Enter}");
    act(() => clock.tick(14_000));
    expect(clockText()).toHaveTextContent("6");
    expect(clockText()).not.toHaveClass("hfm-clock--low");

    await user.click(button("Pause clock"));
    act(() => clock.tick(5_000)); // paused: no time passes
    expect(clockText()).toHaveTextContent("6");
    expect(clockText()).toHaveTextContent("paused");
    await user.click(button("Resume clock"));
    act(() => clock.tick(1_500));
    expect(clockText()).toHaveTextContent("5");
    expect(clockText()).toHaveClass("hfm-clock--low");

    act(() => clock.tick(5_000));
    expect(screen.getByRole("heading", { name: "Judge Sam's answers" })).toBeInTheDocument();
    for (const q of [2, 3, 4, 5]) {
      expect(within(row(q)).getByText("No answer")).toBeInTheDocument();
      expect(within(row(q)).queryByRole("button", { name: "Show answer" })).not.toBeInTheDocument();
    }
    expect(inRow(1, "Show answer")).toBeEnabled();
  });

  it("judges with the suggestion, any survey answer, and not on the board, and allows re-judging", async () => {
    const { user } = setup();
    await answerAll(user, ["towels", "kitty cat", "pizza", null]);
    await user.click(button("End turn early"));

    expect(inRow(1, "Suggested: #1 TOWEL")).toBeInTheDocument();
    await user.click(inRow(1, "Show answer"));
    expect(inRow(1, "Show answer")).toBeDisabled();
    expect(within(row(1)).getByText("On the board, not judged")).toBeInTheDocument();
    await user.click(inRow(1, "Suggested: #1 TOWEL"));
    expect(screen.getByTestId("fm-points-0")).toHaveTextContent("30");
    expect(total()).toHaveTextContent("30 / 200");

    // Re-judge as a different answer.
    await user.click(inRow(1, "#2 SUNSCREEN (25)"));
    expect(inRow(1, "#2 SUNSCREEN (25)")).toHaveAttribute("aria-pressed", "true");
    expect(total()).toHaveTextContent("25 / 200");

    await user.click(inRow(2, "Show answer"));
    await user.click(inRow(2, "#2 CAT (30)"));
    expect(total()).toHaveTextContent("55 / 200");

    expect(within(row(3)).getByText("No match on the survey")).toBeInTheDocument();
    await user.click(inRow(3, "Show answer"));
    await user.click(inRow(3, "Not on the board"));
    // Questions 4 and 5 were blank and already scored 0, so judging is over.
    expect(screen.getByRole("heading", { name: "Sam scored 55" })).toBeInTheDocument();
  });

  it("player 1 wins outright at 200, judged from the keyboard", async () => {
    const { user } = setup();
    await answerAll(user, ["towel", "dog", "eggs", "red", "apple"]);
    for (let i = 0; i < 5; i++) await user.keyboard("s1");
    expect(screen.getByRole("status")).toHaveTextContent("WON $20,000!");
    expect(screen.getByRole("status")).toHaveTextContent("200 points");

    await user.click(button("Back to the game"));
    expect(screen.getByText("Main game screen")).toBeInTheDocument();
  });

  it("hands off to player 2, catches duplicates, and pays $5 a point on a loss", async () => {
    const { user, clock } = setup();
    await player1Scores160(user);

    expect(screen.getByRole("heading", { name: "Sam scored 160" })).toBeInTheDocument();
    expect(screen.getByText(/needs 40 more for \$20,000, with 25 seconds/)).toBeInTheDocument();
    expect(screen.getByText(/covers Sam's answers on the audience board/)).toBeInTheDocument();
    await user.click(button("Bring out player 2 — start"));

    expect(player()).toHaveTextContent("Player 2: Sue");
    expect(clockText()).toHaveTextContent("25");
    expect(screen.getByText("Sam's answers are covered on the audience board.")).toBeInTheDocument();
    expect(current()).toHaveTextContent("Sam said: towel");

    await user.click(button(/Start the clock/));
    await user.keyboard("sandcastle{Enter}");
    // Same answer as Sam: the engine buzzes the duplicate and stays on the question.
    await user.keyboard("dogs");
    expect(screen.getByText(/Enter will buzz a duplicate/)).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Duplicate! Ask again")).toBeInTheDocument();
    expect(current()).toHaveTextContent("Question 2 of 5");
    expect(entry()).toHaveFocus();
    await user.keyboard("cat{Enter}");
    expect(screen.queryByText("Duplicate! Ask again")).not.toBeInTheDocument();

    // The host can call a duplicate the matcher missed.
    await user.keyboard("scrambled");
    await user.click(button("Duplicate — try again"));
    expect(screen.getByText("Duplicate! Ask again")).toBeInTheDocument();
    expect(entry()).toHaveValue("");
    expect(entry()).toHaveFocus();
    await user.keyboard("waffles{Enter}black{Enter}");
    act(() => clock.tick(25_000));

    // Judging player 2 still shows player 1's answers.
    expect(screen.getByRole("heading", { name: "Judge Sue's answers" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "All answers" })).toHaveTextContent("pizza");
    await judgeAll(user, [null, 1, null, null]);

    expect(screen.getByRole("status")).toHaveTextContent("$950");
    expect(screen.getByRole("status")).toHaveTextContent("190 points");
    expect(screen.getByRole("status")).not.toHaveTextContent("WON");
  });

  it("player 2 brings the total past 200 for the grand prize", async () => {
    const { user } = setup();
    await player1Scores160(user);
    await user.click(button("Bring out player 2 — start"));
    await answerAll(user, ["sunscreen", "cat"]);
    await user.click(button("End turn early"));
    await judgeAll(user, [1, 1]);
    expect(screen.getByRole("status")).toHaveTextContent("WON $20,000!");
    expect(screen.getByRole("status")).toHaveTextContent("215 points");
  });

  it("undoes answers and judgements, with the button and the keyboard", async () => {
    const { user } = setup();
    await user.click(button(/Start the clock/));
    await user.keyboard("towel{Enter}");
    await user.click(button(/Undo/));
    expect(current()).toHaveTextContent("Question 1 of 5");
    expect(questionItem(1)).not.toHaveTextContent("towel");

    await user.keyboard("towel{Enter}");
    await user.click(button("End turn early"));
    await user.keyboard("s1");
    expect(total()).toHaveTextContent("30 / 200");
    // Judging finished (the rest were blank); undo goes back to judging.
    await user.keyboard("{Control>}z{/Control}");
    expect(total()).toHaveTextContent("0 / 200");
    expect(within(row(1)).getByText("On the board, not judged")).toBeInTheDocument();
    await user.keyboard("x");
    expect(screen.getByRole("heading", { name: "Sam scored 0" })).toBeInTheDocument();
  });

  it("ignores letter shortcuts while typing an answer", async () => {
    const { user, onAction } = setup();
    await user.click(button(/Start the clock/));
    onAction.mockClear();

    await user.keyboard("sux1 ");
    expect(entry()).toHaveValue("sux1 ");
    expect(onAction).not.toHaveBeenCalled();
    expect(button(/Undo/)).toBeEnabled(); // "u" didn't undo the clock start
    expect(current()).toHaveTextContent("Question 1 of 5");
    expect(clockText()).toHaveTextContent("seconds"); // still running

    await user.keyboard("{Escape}");
    expect(entry()).toHaveValue("");
    expect(entry()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(entry()).not.toHaveFocus();

    // Outside the box, Space pauses the clock.
    await user.keyboard(" ");
    expect(onAction).toHaveBeenLastCalledWith({ type: "pauseClock" });
    expect(clockText()).toHaveTextContent("paused");
  });

  it("shows a shortcut legend and ignores a blank Enter", async () => {
    const { user } = setup();
    const legend = screen.getByText("Keyboard shortcuts").closest("details")!;
    expect(legend).toHaveTextContent("Space");
    expect(legend).toHaveTextContent("U / Ctrl+Z");
    await user.click(button(/Start the clock/));
    // Blank Enter does nothing (and doesn't raise an error).
    await user.keyboard("   {Enter}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(current()).toHaveTextContent("Question 1 of 5");
  });
});
