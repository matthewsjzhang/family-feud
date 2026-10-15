// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INERT_CHAMPIONS_AND_BROWSER } from "../../../app/hostStubs";
import type { GameHost } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import { createCustomQuestionStore, type CustomQuestionInput } from "../../../data/customQuestions";
import { memoryJsonStorage } from "../../../data/jsonStorage";
import type { QuestionSet } from "../../../data/questionSets";
import type { UpcomingRound } from "../../../engine/mainGame";
import { deleteConfirmText, QuestionBrowser } from "./QuestionBrowser";

function survey(id: string, question: string, answers: string[], season: number): Survey {
  return {
    id,
    season,
    answerCount: answers.length,
    question,
    total: 100,
    answers: answers.map((text, i) => ({ text, points: 50 - i * 5 })),
    source: "https://example.test",
  };
}

const MAIN = [
  survey("mil", "Name something your mother-in-law criticizes", ["COOKING", "CLEANING", "KIDS", "HUSBAND"], 16),
  survey("beach", "Name something people bring to the beach", ["TOWEL", "SUNSCREEN", "UMBRELLA", "COOLER", "CHAIR", "BOOK"], 18),
];
const SD = [survey("sd1", "Name the most popular pet", ["DOG"], 17)];

const PICNIC: CustomQuestionInput = {
  question: "Name a picnic food",
  answers: [
    { text: "Chips", points: 20 },
    { text: "Sandwich", points: 40 },
    { text: "Fruit", points: 10 },
  ],
  suddenDeath: false,
};
const RED: CustomQuestionInput = { question: "Name a red fruit", answers: [{ text: "Apple", points: 60 }], suddenDeath: true };

const ROUND_2: UpcomingRound = { kind: "round", number: 2, name: "Round 2", multiplier: 2, minAnswers: 6, maxAnswers: 8 };

interface FakeOptions {
  upcoming?: UpcomingRound | null;
  initial?: CustomQuestionInput[];
  /** Build the question sets from the saved custom questions (their ids are random). */
  sets?: (custom: Survey[]) => QuestionSet[];
  /** Make the host refuse every add, as if storage failed. */
  refuseAdds?: boolean;
  onClose?: () => void;
}

/** GameHost slice backed by a real custom question store, so validation is the real thing. */
function FakeHost({ upcoming = ROUND_2, initial = [PICNIC, RED], sets = () => [], refuseAdds = false, onClose = () => {} }: FakeOptions) {
  const [store] = useState(() => {
    const s = createCustomQuestionStore(memoryJsonStorage());
    initial.forEach((input) => s.add(input));
    return s;
  });
  const [custom, setCustom] = useState(() => store.list());
  const [queued, setQueued] = useState<Survey | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const attempt = (run: () => Survey): Survey | null => {
    try {
      const saved = run();
      setCustom(store.list());
      setLastError(null);
      return saved;
    } catch (error) {
      setLastError((error as Error).message);
      return null;
    }
  };

  const host = {
    ...INERT_CHAMPIONS_AND_BROWSER,
    state: null,
    upcoming,
    lastError,
    banks: { main: MAIN, suddenDeath: SD, custom },
    queued,
    queueSurvey: (id: string) => setQueued([...MAIN, ...SD, ...custom].find((s) => s.id === id) ?? null),
    clearQueue: () => setQueued(null),
    addCustomQuestion: (input: CustomQuestionInput) =>
      refuseAdds
        ? (setLastError("Your browser's storage is full."), null)
        : attempt(() => store.add(input)),
    updateCustomQuestion: (id: string, input: CustomQuestionInput) => attempt(() => store.update(id, input)),
    removeCustomQuestion(id: string) {
      store.remove(id);
      setCustom(store.list());
    },
    toCustomInput: (s: Survey) => store.toInput(s),
    questionSets: sets(custom),
  } as GameHost;
  return <QuestionBrowser host={host} onClose={onClose} />;
}

function setup(options: FakeOptions = {}) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<FakeHost onClose={onClose} {...options} />);
  return { user, onClose };
}

const results = () => screen.getByRole("list", { name: "Matching surveys" });
const rowButton = (name: RegExp) => within(results()).getByRole("button", { name });
const queryRow = (name: RegExp) => within(results()).queryByRole("button", { name });
const status = () => screen.getByRole("status");
const form = (name: RegExp) => screen.getByRole("form", { name });
const answerBox = (n: number) => screen.getByRole("textbox", { name: `Answer ${n}` });
const pointsBox = (n: number) => screen.getByRole("spinbutton", { name: `Points for answer ${n}` });

async function fillAnswers(user: ReturnType<typeof userEvent.setup>, answers: [string, number][]) {
  for (const [i, [text, points]] of answers.entries()) {
    await user.clear(answerBox(i + 1));
    await user.type(answerBox(i + 1), text);
    await user.clear(pointsBox(i + 1));
    await user.type(pointsBox(i + 1), String(points));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("custom questions in the question browser", () => {
  it("lists custom questions in the tab of their kind, with a Custom badge instead of a season", async () => {
    const { user } = setup();
    expect(screen.getByRole("tab", { name: /Main game/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /Sudden Death/ })).toHaveTextContent("2");
    expect(status()).toHaveTextContent("3 surveys match");

    const picnic = rowButton(/picnic food/);
    expect(within(picnic).getByText("Custom")).toBeInTheDocument();
    expect(picnic).not.toHaveTextContent("Season");
    expect(queryRow(/red fruit/)).not.toBeInTheDocument();

    // Answers are shown most points first.
    await user.click(picnic);
    const answers = within(screen.getByRole("list", { name: /Answers: Name a picnic food/ })).getAllByRole("listitem");
    expect(answers.map((li) => li.textContent)).toEqual(["1Sandwich40", "2Chips20", "3Fruit10"]);

    await user.click(screen.getByRole("tab", { name: /Sudden Death/ }));
    expect(within(rowButton(/red fruit/)).getByText("Custom")).toBeInTheDocument();
    expect(rowButton(/popular pet/)).toHaveTextContent("Season 17");
  });

  it("filters by source", async () => {
    const { user } = setup();
    const source = screen.getByRole("combobox", { name: "Source" });
    expect(source).toHaveValue("all");
    await user.selectOptions(source, "custom");
    expect(status()).toHaveTextContent("1 survey matches");
    expect(rowButton(/picnic food/)).toBeInTheDocument();

    await user.selectOptions(source, "original");
    expect(status()).toHaveTextContent("2 surveys match");
    expect(queryRow(/picnic food/)).not.toBeInTheDocument();
  });

  it("leaves custom questions out when a season is chosen, and offers no season 0", async () => {
    const { user } = setup();
    const season = screen.getByRole("combobox", { name: "Season" });
    const options = within(season).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Any", "16", "18"]);
    await user.selectOptions(season, "16");
    expect(status()).toHaveTextContent("1 survey matches");
    expect(queryRow(/picnic food/)).not.toBeInTheDocument();
  });

  it("adds a main-game question with live validation and answer-row limits", async () => {
    const { user } = setup({ initial: [] });
    await user.click(screen.getByRole("button", { name: "Add custom question" }));
    const add = form(/Add a custom question/);
    const question = within(add).getByRole("textbox", { name: "Question" });
    expect(question).toHaveFocus();
    expect(within(add).getByRole("radio", { name: /Main game/ })).toBeChecked();
    // No errors on a blank form until the host starts typing.
    expect(within(add).queryByRole("list", { name: "Problems to fix" })).not.toBeInTheDocument();

    await user.type(question, "Name a reason to be late");
    const problems = () => within(add).getByRole("list", { name: "Problems to fix" });
    expect(problems()).toHaveTextContent("Answer 1 needs text.");

    // Four rows to start; remove down to the minimum of two.
    expect(within(add).getAllByRole("textbox", { name: /^Answer \d$/ })).toHaveLength(4);
    await user.click(within(add).getByRole("button", { name: "Remove answer 4" }));
    await user.click(within(add).getByRole("button", { name: "Remove answer 3" }));
    expect(within(add).getAllByRole("textbox", { name: /^Answer \d$/ })).toHaveLength(2);
    expect(within(add).getByRole("button", { name: "Remove answer 1" })).toBeDisabled();

    // Add up to the maximum of eight.
    const addAnswer = within(add).getByRole("button", { name: "Add answer" });
    for (let i = 0; i < 6; i++) await user.click(addAnswer);
    expect(within(add).getAllByRole("textbox", { name: /^Answer \d$/ })).toHaveLength(8);
    expect(addAnswer).toBeDisabled();
    expect(answerBox(8)).toHaveFocus();
    for (let i = 8; i > 3; i--) await user.click(within(add).getByRole("button", { name: `Remove answer ${i}` }));

    await fillAnswers(user, [
      ["Traffic", 50],
      ["traffic", 0],
      ["Overslept", 30],
    ]);
    expect(problems()).toHaveTextContent('"traffic" is listed twice.');
    expect(problems()).toHaveTextContent("Answer 2: points must be a whole number of at least 1.");
    // Save with problems keeps the form open.
    await user.click(within(add).getByRole("button", { name: "Save question" }));
    expect(form(/Add a custom question/)).toBeInTheDocument();

    await fillAnswers(user, [
      ["Traffic", 50],
      ["Kids", 20],
    ]);
    expect(within(add).queryByRole("list", { name: "Problems to fix" })).not.toBeInTheDocument();
    await user.click(within(add).getByRole("button", { name: "Save question" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByText(/Saved "Name a reason to be late"/)).toBeInTheDocument();
    const saved = rowButton(/reason to be late/);
    expect(saved).toHaveAttribute("aria-expanded", "true");
    expect(saved).toHaveFocus();
    expect(saved).toHaveTextContent("3 answers");
    expect(screen.getByRole("tab", { name: /Main game/ })).toHaveTextContent("3");
  });

  it("adds a Sudden Death question from the main tab and switches to it", async () => {
    const { user } = setup({ initial: [] });
    await user.click(screen.getByRole("button", { name: "Add custom question" }));
    const add = form(/Add a custom question/);
    await user.click(within(add).getByRole("radio", { name: /Sudden Death/ }));
    expect(within(add).getAllByRole("textbox", { name: /^Answer \d$/ })).toHaveLength(1);
    expect(within(add).queryByRole("button", { name: "Add answer" })).not.toBeInTheDocument();
    expect(within(add).queryByRole("button", { name: /Remove answer/ })).not.toBeInTheDocument();

    await user.type(within(add).getByRole("textbox", { name: "Question" }), "Name a green vegetable");
    await fillAnswers(user, [["Broccoli", 45]]);
    await user.click(within(add).getByRole("button", { name: "Save question" }));

    expect(screen.getByRole("tab", { name: /Sudden Death/ })).toHaveAttribute("aria-selected", "true");
    const saved = rowButton(/green vegetable/);
    expect(saved).toHaveAttribute("aria-expanded", "true");
    expect(within(saved).getByText("Custom")).toBeInTheDocument();
    expect(screen.getByText("Broccoli")).toBeInTheDocument();
  });

  it("widens the filters so a new question is visible", async () => {
    const { user } = setup({ initial: [] });
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "zebra");
    expect(status()).toHaveTextContent("0 surveys match");
    await user.click(screen.getByRole("button", { name: "Add custom question" }));
    const add = form(/Add a custom question/);
    await user.type(within(add).getByRole("textbox", { name: "Question" }), "Name a pizza topping");
    for (let i = 4; i > 2; i--) await user.click(within(add).getByRole("button", { name: `Remove answer ${i}` }));
    await fillAnswers(user, [
      ["Pepperoni", 60],
      ["Mushrooms", 20],
    ]);
    await user.click(within(add).getByRole("button", { name: "Save question" }));
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveValue("custom");
    expect(screen.getByRole("searchbox", { name: /search/i })).toHaveValue("");
    expect(rowButton(/pizza topping/)).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the host's error when it refuses a save", async () => {
    const { user } = setup({ initial: [], refuseAdds: true });
    await user.click(screen.getByRole("button", { name: "Add custom question" }));
    const add = form(/Add a custom question/);
    await user.type(within(add).getByRole("textbox", { name: "Question" }), "Name a color");
    await user.click(within(add).getByRole("radio", { name: /Sudden Death/ }));
    await fillAnswers(user, [["Blue", 40]]);
    await user.click(within(add).getByRole("button", { name: "Save question" }));
    expect(within(add).getByText("Your browser's storage is full.")).toBeInTheDocument();
  });

  it("Escape and Cancel close the form without leaving the browser", async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Add custom question" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add custom question" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Add custom question" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("edits a custom question in place, prefilled", async () => {
    const { user } = setup();
    await user.click(rowButton(/picnic food/));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const edit = form(/Edit custom question/);
    const question = within(edit).getByRole("textbox", { name: "Question" });
    expect(question).toHaveValue("Name a picnic food");
    expect(answerBox(1)).toHaveValue("Sandwich");
    expect(pointsBox(1)).toHaveValue(40);

    await user.clear(question);
    await user.type(question, "Name a picnic snack");
    await user.clear(answerBox(3));
    await user.type(answerBox(3), "Grapes");
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByText(/Saved changes to "Name a picnic snack"/)).toBeInTheDocument();
    expect(rowButton(/picnic snack/)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Grapes")).toBeInTheDocument();
    expect(queryRow(/picnic food/)).not.toBeInTheDocument();
  });

  it("moves an edited question to the Sudden Death tab when its type changes", async () => {
    const { user } = setup();
    await user.click(rowButton(/picnic food/));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("radio", { name: /Sudden Death/ }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("tab", { name: /Sudden Death/ })).toHaveAttribute("aria-selected", "true");
    expect(rowButton(/picnic food/)).toHaveTextContent("1 answer");
  });

  it("show-original surveys cannot be edited or deleted", async () => {
    const { user } = setup();
    await user.click(rowButton(/beach/));
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("deletes after confirming, naming the question sets that use it", async () => {
    const sets = (custom: Survey[]): QuestionSet[] => {
      const picnic = custom.find((s) => s.question === "Name a picnic food")?.id ?? "gone";
      return [
        { id: "a", name: "Party night", rounds: [picnic], suddenDeath: [], fastMoney: [] },
        { id: "b", name: "Office", rounds: ["beach", picnic], suddenDeath: [], fastMoney: [] },
        { id: "c", name: "Unrelated", rounds: ["mil"], suddenDeath: [], fastMoney: [] },
      ];
    };
    const { user } = setup({ sets });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(rowButton(/picnic food/));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(
      'Delete the custom question "Name a picnic food"? This can\'t be undone. ' +
        'It is used in the question sets "Party night" and "Office"; those sets will skip it.',
    );
    expect(rowButton(/picnic food/)).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(queryRow(/picnic food/)).not.toBeInTheDocument();
    expect(screen.getByText(/Deleted "Name a picnic food"/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Main game/ })).toHaveTextContent("2");
  });

  it("queues a 3-answer custom question for a 6-8 answer round without a blocking warning", async () => {
    const { user } = setup();
    await user.click(rowButton(/picnic food/));
    const play = screen.getByRole("button", { name: "Play this next" });
    expect(play).not.toHaveAccessibleDescription();
    expect(screen.getByText(/Round 2 usually has 6-8 answers; this one has 3/)).toBeInTheDocument();
    await user.click(play);
    const banner = screen.getByLabelText("Next question");
    expect(banner).toHaveTextContent("Playing next: Name a picnic food");
    expect(banner).not.toHaveTextContent(/wait for a round/);
  });

  it("warns when a custom Sudden Death question is picked before a main round", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: /Sudden Death/ }));
    await user.click(rowButton(/red fruit/));
    const play = screen.getByRole("button", { name: "Play this next" });
    expect(play).toHaveAccessibleDescription(/Sudden Death questions only play in Sudden Death/);
    await user.click(play);
    expect(screen.getByLabelText("Next question")).toHaveTextContent(/only play in Sudden Death; it will wait/);
  });
});

describe("deleteConfirmText", () => {
  const s = survey("custom-q-x", "Name a fruit", ["APPLE", "PEAR"], 0);
  const set = (name: string, ids: Partial<QuestionSet>): QuestionSet => ({
    id: name,
    name,
    rounds: [],
    suddenDeath: [],
    fastMoney: [],
    ...ids,
  });

  it("names one, several or no sets", () => {
    expect(deleteConfirmText(s, [])).toBe(`Delete the custom question "Name a fruit"? This can't be undone.`);
    expect(deleteConfirmText(s, [set("Solo", { fastMoney: ["custom-q-x"] })])).toMatch(
      /used in the question set "Solo"; that set will skip it\.$/,
    );
    expect(
      deleteConfirmText(s, [
        set("A", { rounds: ["custom-q-x"] }),
        set("B", { suddenDeath: ["custom-q-x"] }),
        set("C", { fastMoney: ["custom-q-x"] }),
      ]),
    ).toMatch(/question sets "A", "B" and "C"; those sets/);
  });
});
