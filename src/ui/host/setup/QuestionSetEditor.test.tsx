// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXED_ROUNDS_RULES } from "../../../engine/rules";
import {
  CAR,
  COLOR,
  FRUIT,
  HOT,
  PET,
  PLANET,
  SPORT,
  TIEBREAK,
  TRADITION,
  VEG,
  button,
  entries,
  entryQuestions,
  makeSet,
  questionsSelect,
  renderSetup,
} from "./questionSetTestKit";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

type Section = "Rounds" | "Sudden Death" | "Fast Money";

const searchBox = () => screen.getByLabelText("Search questions");
const results = () => within(screen.getByRole("list", { name: "Search results" })).queryAllByRole("listitem");
const resultQuestions = () => results().map((li) => li.querySelector(".qs-entry__question")?.textContent ?? "");

async function openSearch(user: UserEvent, section: Section) {
  await user.click(button(`Add questions to ${section}`));
}

/** Search one section and add each question by its text. */
async function add(user: UserEvent, section: Section, ...questions: string[]) {
  await openSearch(user, section);
  for (const q of questions) {
    await user.clear(searchBox());
    await user.type(searchBox(), q);
    await user.click(button(`Add ${q}`));
  }
  await user.click(button("Done adding"));
}

const errorList = () => screen.queryByText("Fix these before saving:")?.nextElementSibling?.textContent ?? "";

describe("QuestionSetEditor", () => {
  it("creates a set by searching, adding, reordering and removing round questions", async () => {
    const { user, setStore, started } = renderSetup();
    await user.click(button("New set"));
    expect(screen.getByRole("heading", { name: "New question set" })).toHaveFocus();
    expect(button("Save")).toBeDisabled();
    expect(errorList()).toContain("Give the question set a name.");
    expect(errorList()).toContain("Pick at least one question.");

    await user.type(screen.getByLabelText("Set name"), "Family night");
    await add(user, "Rounds", FRUIT.question, PET.question, TRADITION.question);
    expect(button("Add questions to Rounds")).toHaveFocus();
    expect(entryQuestions("Rounds")).toEqual([FRUIT.question, PET.question, TRADITION.question]);
    expect(entries("Rounds")[0]).toHaveTextContent("Round 1 · Single ×1Name a fruit6 answers · Season 1");
    expect(entries("Rounds")[2]).toHaveTextContent("Round 3 · Double ×2Name a family tradition3 answers · Custom");

    await user.click(button("Move round 3 up"));
    expect(entryQuestions("Rounds")).toEqual([FRUIT.question, TRADITION.question, PET.question]);
    expect(button("Move round 2 up")).toHaveFocus(); // focus follows the moved question
    await user.click(button("Move round 1 down"));
    expect(entryQuestions("Rounds")).toEqual([TRADITION.question, FRUIT.question, PET.question]);
    await user.click(button("Remove round 3"));
    expect(entryQuestions("Rounds")).toEqual([TRADITION.question, FRUIT.question]);
    expect(button("Remove round 2")).toHaveFocus();

    expect(button("Save")).toBeEnabled();
    await user.click(button("Save"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    const saved = setStore.list();
    expect(saved).toEqual([
      { id: expect.any(String), name: "Family night", rounds: [TRADITION.id, FRUIT.id], suddenDeath: [], fastMoney: [] },
    ]);

    await user.click(button("Close"));
    expect(button("New set")).toHaveFocus();
    expect(questionsSelect()).toHaveValue(saved[0]!.id);
    await user.click(button("Start game"));
    expect(started().questionSetId).toBe(saved[0]!.id);
  });

  it("labels rounds from the selected rules and gently notes sizes outside a round's range", async () => {
    const { user } = renderSetup();
    await user.click(button("New set"));
    await add(user, "Rounds", TRADITION.question, COLOR.question, PET.question, SPORT.question, CAR.question);
    const labels = entries("Rounds").map((li) => li.querySelector(".qs-entry__label")?.textContent);
    expect(labels).toEqual([
      "Round 1 · Single ×1",
      "Round 2 · Single ×1",
      "Round 3 · Double ×2",
      "Round 4 · Triple ×3",
      "Extra round",
    ]);
    const notes = entries("Rounds").map((li) => li.querySelector(".qs-entry__note")?.textContent ?? null);
    expect(notes).toEqual([
      "Single rounds usually use 6-8 answers; this one has 3.",
      null,
      "Double rounds usually use 4-6 answers; this one has 8.",
      null,
      null,
    ]);
  });

  it("follows another rules preset's rounds", async () => {
    const { user } = renderSetup();
    await user.selectOptions(screen.getByLabelText("Rules preset"), FIXED_ROUNDS_RULES.name);
    await user.click(button("New set"));
    await openSearch(user, "Rounds");
    for (let i = 0; i < 6; i += 1) await user.click(button("Add random"));
    const labels = entries("Rounds").map((li) => li.querySelector(".qs-entry__label")?.textContent);
    expect(labels).toEqual([1, 2, 3, 4, 5].map((n) => `Round ${n} · Single ×1`).concat("Extra round"));
    expect(new Set(entryQuestions("Rounds")).size).toBe(6); // random picks never repeat
  });

  it("prevents using a question twice, across sections", async () => {
    const { user } = renderSetup();
    await user.click(button("New set"));
    await add(user, "Rounds", FRUIT.question);
    await openSearch(user, "Fast Money");
    await user.type(searchBox(), "fruit");
    const addFruit = button(`Add ${FRUIT.question}`);
    expect(addFruit).toBeDisabled();
    expect(addFruit).toHaveTextContent("In set");
  });

  it("searches only Sudden Death questions (bank and custom) for Sudden Death", async () => {
    const { user, setStore } = renderSetup();
    await user.click(button("New set"));
    await user.type(screen.getByLabelText("Set name"), "Tiebreakers");
    await openSearch(user, "Sudden Death");
    expect(resultQuestions()).toEqual([TIEBREAK.question, HOT.question, PLANET.question]);
    expect(screen.queryByLabelText("Answers")).not.toBeInTheDocument();
    await user.click(button("Done adding"));
    await add(user, "Sudden Death", PLANET.question, TIEBREAK.question);
    expect(entries("Sudden Death")[0]).toHaveTextContent("Sudden Death 1Name a planet1 answer · Season 3");
    await user.click(button("Move Sudden Death question 2 up"));
    expect(entryQuestions("Sudden Death")).toEqual([TIEBREAK.question, PLANET.question]);
    await user.click(button("Save"));
    expect(setStore.list()[0]).toMatchObject({ rounds: [], suddenDeath: [TIEBREAK.id, PLANET.id], fastMoney: [] });
  });

  it("needs exactly five Fast Money questions, or none for random", async () => {
    const { user, setStore } = renderSetup();
    await user.click(button("New set"));
    await user.type(screen.getByLabelText("Set name"), "Money");
    const fm = screen.getByRole("group", { name: "Fast Money" });
    expect(within(fm).getByText("Random")).toBeInTheDocument();

    await add(user, "Fast Money", FRUIT.question, COLOR.question, VEG.question);
    expect(within(fm).getByText("3 of 5 picked.")).toBeInTheDocument();
    expect(button("Save")).toBeDisabled();
    expect(errorList()).toContain("Fast Money needs exactly five questions, or none for random ones.");

    await add(user, "Fast Money", SPORT.question, CAR.question);
    expect(entries("Fast Money")).toHaveLength(5);
    expect(errorList()).toBe("");
    expect(button("Save")).toBeEnabled();

    await openSearch(user, "Fast Money");
    expect(screen.getByText("Fast Money has all 5 questions.")).toBeInTheDocument();
    expect(button("Add random")).toBeDisabled();
    expect(button(`Add ${PET.question}`)).toBeDisabled();
    await user.click(button("Done adding"));

    await user.click(button("Save"));
    expect(setStore.list()[0]!.fastMoney).toEqual([FRUIT.id, COLOR.id, VEG.id, SPORT.id, CAR.id]);
  });

  it("pages search results, filters by size and expands a result to show its answers", async () => {
    const { user } = renderSetup();
    await user.click(button("New set"));
    await openSearch(user, "Rounds");
    expect(searchBox()).toHaveFocus();
    await user.type(searchBox(), "filler");
    expect(results()).toHaveLength(20);
    expect(screen.getByText("25 questions")).toBeInTheDocument();
    await user.click(button("Show more (5 left)"));
    expect(results()).toHaveLength(25);

    await user.clear(searchBox());
    await user.selectOptions(screen.getByLabelText("Answers"), "3");
    expect(resultQuestions()).toEqual([TRADITION.question]);

    await user.click(screen.getByRole("button", { name: /^Name a family tradition/, expanded: false }));
    const answers = screen.getByRole("list", { name: `Answers to ${TRADITION.question}` });
    expect(within(answers).getAllByRole("listitem")).toHaveLength(3);
    expect(answers).toHaveTextContent(`${TRADITION.question} answer 1 40`);
  });

  it("edits an existing set, and saves a copy as new", async () => {
    const { user, setStore, saved } = renderSetup({ sets: [makeSet({ suddenDeath: [HOT.id] })] });
    const id = saved[0]!.id;
    await user.selectOptions(questionsSelect(), "Quick game");
    await user.click(button("Edit set"));
    expect(screen.getByRole("heading", { name: "Edit question set: Quick game" })).toHaveFocus();
    expect(screen.getByLabelText("Set name")).toHaveValue("Quick game");
    expect(entryQuestions("Rounds")).toEqual([FRUIT.question, COLOR.question, VEG.question, SPORT.question]);
    expect(entryQuestions("Sudden Death")).toEqual([HOT.question]);

    await user.click(button("Remove round 4"));
    await user.click(button("Save"));
    expect(setStore.get(id)!.rounds).toEqual([FRUIT.id, COLOR.id, VEG.id]);

    await user.click(button("Save as new"));
    expect(screen.getByRole("status")).toHaveTextContent('Saved as "Quick game (copy)".');
    const list = setStore.list();
    expect(list.map((s) => s.name)).toEqual(["Quick game", "Quick game (copy)"]);
    expect(list[1]!.rounds).toEqual(list[0]!.rounds);
    await user.click(button("Close"));
    expect(questionsSelect()).toHaveValue(list[1]!.id);
  });

  it("shows a deleted question as missing so it can be removed", async () => {
    const { user } = renderSetup({ sets: [makeSet({ rounds: [FRUIT.id, "c-gone"] })] });
    await user.selectOptions(questionsSelect(), "Quick game");
    await user.click(button("Edit set"));
    expect(entries("Rounds")[1]).toHaveTextContent("Missing question");
    await user.click(button("Remove round 2"));
    expect(entryQuestions("Rounds")).toEqual([FRUIT.question]);
  });

  it("shows the problem when saving fails", async () => {
    const { user } = renderSetup({ failSave: true });
    await user.click(button("New set"));
    await user.type(screen.getByLabelText("Set name"), "Nope");
    await add(user, "Rounds", FRUIT.question);
    await user.click(button("Save"));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save this question set.");
    expect(screen.getByRole("heading", { name: "New question set" })).toBeInTheDocument();
  });

  it("deletes the set after confirming", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user, setStore } = renderSetup({ sets: [makeSet()] });
    await user.selectOptions(questionsSelect(), "Quick game");
    await user.click(button("Edit set"));
    await user.click(button("Delete"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(setStore.list()).toHaveLength(1);

    confirm.mockReturnValue(true);
    await user.click(button("Delete"));
    expect(setStore.list()).toHaveLength(0);
    expect(questionsSelect()).toHaveValue("");
    expect(questionsSelect()).toHaveFocus(); // "Edit set" is gone with the set
  });

  it("closes on Escape, asking first when there are unsaved changes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderSetup();
    await user.click(button("New set"));
    await user.keyboard("{Escape}");
    expect(confirm).not.toHaveBeenCalled();
    expect(button("New set")).toHaveFocus();

    await user.click(button("New set"));
    await user.type(screen.getByLabelText("Set name"), "Draft");
    await user.keyboard("{Escape}");
    expect(confirm).toHaveBeenCalledWith("Discard your unsaved changes to this question set?");
    expect(screen.getByLabelText("Set name")).toHaveValue("Draft");

    await user.click(button("Cancel"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Set name")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.click(button("Cancel"));
    expect(screen.queryByLabelText("Set name")).not.toBeInTheDocument();
    expect(button("New set")).toHaveFocus();
  });
});
