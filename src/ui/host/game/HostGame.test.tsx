// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { FakeHostGame } from "./fakeHost";

function setup(rules?: GameRules) {
  const user = userEvent.setup();
  render(<FakeHostGame rules={rules} />);
  return user;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });
const answer = (text: string) =>
  within(screen.getByRole("list", { name: "Answer key" })).getByRole("button", { name: new RegExp(text) });
const score = (team: 0 | 1) => screen.getByTestId(`score-${team}`);
const entry = () => screen.getByRole("textbox", { name: /what did they say|steal answer/i });

/** Start round 1 and have the left family (Smith) win the face-off with TOWEL (#1). */
async function smithWinsFaceOff(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button(/Start Round 1/));
  await user.click(button(/Smith buzzed/));
  await user.click(answer("TOWEL"));
}

describe("HostGame", () => {
  it("shows the scoreboard and the next round before the game starts", () => {
    setup();
    expect(screen.getByText("No round yet")).toBeInTheDocument();
    expect(score(0)).toHaveTextContent("0");
    expect(button(/Start Round 1 · Single/)).toBeEnabled();
    expect(button(/Undo/)).toBeDisabled();
    expect(queryButton(/buzzed/)).not.toBeInTheDocument();
  });

  it("runs a face-off with the buttons: a lower answer then a miss", async () => {
    const user = setup();
    await user.click(button(/Start Round 1/));

    expect(screen.getByText("Name something people bring to the beach")).toBeInTheDocument();
    expect(screen.getByText("Round 1 · Single")).toBeInTheDocument();
    expect(screen.getByText(/At the buzzer/)).toHaveTextContent("Sam (Smith) vs Jan (Jones)");
    // Nobody has buzzed, so no answer can be accepted yet.
    expect(answer("TOWEL")).toBeDisabled();

    await user.click(button(/Smith buzzed/));
    expect(queryButton(/Jones buzzed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sam \(Smith\) is answering/)).toBeInTheDocument();

    await user.click(answer("UMBRELLA"));
    expect(answer("UMBRELLA")).toHaveTextContent("Won");
    expect(screen.getByText(/Jan must beat #3/)).toBeInTheDocument();
    expect(screen.getByLabelText("Round bank")).toHaveTextContent("15");

    await user.click(button(/Not on the board/));
    expect(screen.getByText("Smith won the face-off.")).toBeInTheDocument();
    expect(button("Play")).toBeEnabled();
    expect(answer("TOWEL")).toBeDisabled();
  });

  it("runs a face-off by typing guesses and pressing Enter", async () => {
    const user = setup();
    await user.click(button(/Start Round 1/));
    await user.click(button(/Jones buzzed/));

    await user.type(entry(), "sun screen");
    expect(button(/Suggested: #2 SUNSCREEN/)).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(answer("SUNSCREEN")).toHaveTextContent("Won");
    expect(entry()).toHaveValue("");
    expect(screen.getByText(/Sam \(Smith\) is answering/)).toBeInTheDocument();

    await user.type(entry(), "sandcastle");
    expect(screen.getByText("No match on the board.")).toBeInTheDocument();
    await user.clear(entry());
    await user.type(entry(), "towels");
    await user.keyboard("{Enter}");
    expect(screen.getByText("Smith won the face-off.")).toBeInTheDocument();
  });

  it("plays the board: three strikes, a failed steal, then reveals the rest", async () => {
    const user = setup();
    await smithWinsFaceOff(user);
    await user.click(button("Play"));

    expect(screen.getByRole("heading", { name: /Smith playing/ })).toBeInTheDocument();
    expect(screen.getByText(/Now answering/)).toHaveTextContent("Sue");
    expect(answer("TOWEL")).toBeDisabled(); // already on the board

    await user.click(answer("COOLER"));
    expect(screen.getByText(/Now answering/)).toHaveTextContent("Sid");
    for (let i = 1; i <= 3; i++) {
      await user.click(button(/Strike \/ not on board/));
      if (i < 3) expect(screen.getByLabelText(`${i} of 3 strikes`)).toBeInTheDocument();
    }

    expect(screen.getByRole("heading", { name: /Steal: Jones confer/ })).toBeInTheDocument();
    await user.click(button(/Steal failed/));
    expect(screen.getByText("The Smith family wins the round: +40")).toBeInTheDocument();
    expect(score(0)).toHaveTextContent("40");

    await user.click(button(/Reveal #2 SUNSCREEN/));
    expect(answer("SUNSCREEN")).toHaveTextContent("Shown");
    await user.click(button("Reveal all"));
    expect(queryButton(/Reveal #/)).not.toBeInTheDocument();
    expect(score(0)).toHaveTextContent("40"); // revealed answers score nothing
    expect(button(/Start Round 2 · Single/)).toBeEnabled();
  });

  it("awards the bank to a successful steal", async () => {
    const user = setup();
    await smithWinsFaceOff(user);
    await user.click(button(/Pass to Jones/));
    expect(screen.getByRole("heading", { name: /Jones playing/ })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await user.click(button(/Strike/));

    await user.type(screen.getByRole("textbox", { name: /steal answer/i }), "cooler{Enter}");
    expect(screen.getByText("The Smith family wins the round: +40")).toBeInTheDocument();
    expect(score(0)).toHaveTextContent("40");
    expect(score(1)).toHaveTextContent("0");
  });

  it("adjusts scores and ends the game at 300", async () => {
    const user = setup();
    const amount = screen.getByLabelText("Score adjustment for Smith");
    await user.clear(amount);
    await user.type(amount, "290");
    await user.click(button("Add points to Smith"));
    expect(score(0)).toHaveTextContent("290");
    await user.click(button("Subtract points from Jones"));
    expect(score(1)).toHaveTextContent("-10");

    await smithWinsFaceOff(user);
    await user.click(button("Play"));
    for (let i = 0; i < 3; i++) await user.click(button(/Strike/));
    await user.click(button(/Steal failed/));

    expect(screen.getByText("The Smith family wins the game!")).toBeInTheDocument();
    expect(screen.getByText(/Final score: Smith 320 · Jones -10/)).toBeInTheDocument();
    expect(button("Fast Money (coming soon)")).toBeDisabled();
    expect(queryButton(/Start Round/)).not.toBeInTheDocument();
    // The host can still reveal what was left on the board.
    expect(button(/Reveal #2 SUNSCREEN/)).toBeEnabled();
  });

  it("runs Sudden Death where only the #1 answer counts", async () => {
    const rules: GameRules = {
      ...structuredClone(DEFAULT_RULES),
      builtIn: false,
      rounds: [{ name: "Single", multiplier: 1, minAnswers: 4, maxAnswers: 8 }],
    };
    const user = setup(rules);
    await smithWinsFaceOff(user);
    await user.click(button("Play"));
    for (let i = 0; i < 4; i++) await user.keyboard("x"); // three strikes, then the steal fails

    await user.click(button(/Start Sudden Death ×3/));
    expect(screen.getByText(/only the #1 answer counts/i)).toBeInTheDocument();
    // Sudden Death questions come from the single-answer bank.
    expect(screen.getByText("Name the most popular pet")).toBeInTheDocument();
    expect(answer("DOG")).toHaveTextContent("Only this counts");

    await user.click(button(/Smith buzzed/));
    await user.type(entry(), "cat");
    await user.click(button(/Not on the board/));
    expect(answer("DOG")).toHaveTextContent("Only this counts"); // still hidden
    // The next pair in rotation is at the buzzer.
    expect(screen.getByText(/Joe \(Jones\) is answering/)).toBeInTheDocument();

    await user.click(answer("DOG"));
    expect(screen.getByText("The Jones family wins the game!")).toBeInTheDocument();
    expect(score(1)).toHaveTextContent("120");
  });

  it("swaps the question only before anyone buzzes", async () => {
    const user = setup();
    await user.click(button(/Start Round 1/));
    await user.click(button("Swap question"));
    expect(screen.getByText("Name a popular pet")).toBeInTheDocument();
    await user.click(button(/Jones buzzed/));
    expect(queryButton("Swap question")).not.toBeInTheDocument();
  });

  it("drives the game from the keyboard", async () => {
    const user = setup();
    await user.keyboard("n");
    expect(screen.getByText("Name something people bring to the beach")).toBeInTheDocument();

    await user.keyboard("p");
    expect(screen.getByText(/Jan \(Jones\) is answering/)).toBeInTheDocument();
    await user.keyboard("3");
    expect(answer("UMBRELLA")).toHaveTextContent("Won");
    await user.keyboard("x");
    expect(screen.getByText("Jones won the face-off.")).toBeInTheDocument();

    await user.keyboard("u");
    expect(screen.getByText(/Sam \(Smith\) is answering/)).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(answer("UMBRELLA")).toHaveTextContent("Hidden");
    await user.keyboard("u");
    await user.keyboard("q");
    expect(screen.getByText(/Sam \(Smith\) is answering/)).toBeInTheDocument();
    await user.keyboard("1");
    expect(screen.getByText("Smith won the face-off.")).toBeInTheDocument();

    // No answer is taken during play-or-pass.
    await user.keyboard("2");
    expect(answer("SUNSCREEN")).toHaveTextContent("Hidden");
  });

  it("reveals with number keys after the round", async () => {
    const user = setup();
    await smithWinsFaceOff(user);
    await user.click(button("Play"));
    await user.keyboard("xxxx");
    await user.keyboard("6");
    expect(answer("BOOK")).toHaveTextContent("Shown");
  });

  it("ignores shortcuts while typing in the answer box", async () => {
    const user = setup();
    await user.click(button(/Start Round 1/));
    await user.click(button(/Smith buzzed/));

    await user.type(entry(), "x1qpnu");
    expect(entry()).toHaveValue("x1qpnu");
    expect(screen.getByText(/Sam \(Smith\) is answering/)).toBeInTheDocument();
    expect(answer("TOWEL")).toHaveTextContent("Hidden");

    await user.keyboard("{Escape}");
    expect(entry()).toHaveValue("");
    expect(entry()).not.toHaveFocus();
    await user.keyboard("/");
    expect(entry()).toHaveFocus();
  });

  it("shows a compact shortcut legend", () => {
    setup();
    const legend = screen.getByText("Keyboard shortcuts").closest("details")!;
    expect(legend).toHaveTextContent("Q / P");
    expect(legend).toHaveTextContent("U / Ctrl+Z");
  });
});
