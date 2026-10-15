// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresetStore, memoryPresetStorage } from "../../../engine/presets";
import { DEFAULT_RULES, SINGLE_POINTS_RULES, type GameRules } from "../../../engine/rules";
import { SETUP_STORAGE_KEY } from "./setupStorage";
import {
  CAR,
  COLOR,
  FILLERS,
  FRUIT,
  HOT,
  PET,
  SPORT,
  TRADITION,
  VEG,
  button,
  makeSet,
  questionsSelect,
  renderSetup,
} from "./questionSetTestKit";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function setSummary(): Record<string, string> {
  const dl = screen.getByLabelText(/^Question set /);
  const terms = within(dl).getAllByRole("term");
  const defs = within(dl).getAllByRole("definition");
  return Object.fromEntries(terms.map((t, i) => [t.textContent ?? "", defs[i]!.textContent ?? ""]));
}

const notes = () => {
  const list = screen.queryByRole("list", { name: "Notes about this question set" });
  return list ? [...list.children].map((li) => li.firstChild?.textContent ?? "") : [];
};

const FIVE = [CAR.id, PET.id, FILLERS[0]!.id, FILLERS[1]!.id, FILLERS[2]!.id];

describe("Questions dropdown", () => {
  it("defaults to random questions and starts with questionSetId null", async () => {
    const { user, started } = renderSetup({ sets: [makeSet()] });
    expect(questionsSelect()).toHaveValue("");
    expect(within(questionsSelect()).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Random questions",
      "Quick game",
    ]);
    expect(screen.queryByLabelText(/^Question set /)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit set" })).not.toBeInTheDocument();
    await user.click(button("Start game"));
    expect(started().questionSetId).toBeNull();
    expect(started().rules).toBe(DEFAULT_RULES);
  });

  it("starts with the chosen set's id, separately from the rules preset", async () => {
    const { user, started, saved } = renderSetup({ sets: [makeSet(), makeSet({ name: "Family night" })] });
    await user.selectOptions(questionsSelect(), "Family night");
    await user.selectOptions(screen.getByLabelText("Rules preset"), "Single points");
    await user.click(button("Start game"));
    expect(started().questionSetId).toBe(saved[1]!.id);
    expect(started().rules).toBe(SINGLE_POINTS_RULES);
  });

  it("remembers the last choice, and falls back to random when the set is gone", async () => {
    const first = renderSetup({ sets: [makeSet()] });
    const id = first.saved[0]!.id;
    await first.user.selectOptions(questionsSelect(), "Quick game");
    first.unmount();
    expect(JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "{}").questionSetId).toBe(id);

    const second = renderSetup({ setStore: first.setStore });
    expect(questionsSelect()).toHaveValue(id);
    await second.user.click(button("Start game"));
    expect(second.started().questionSetId).toBe(id);
    second.unmount();

    first.setStore.remove(id);
    const third = renderSetup({ setStore: first.setStore });
    expect(questionsSelect()).toHaveValue("");
    await third.user.click(button("Start game"));
    expect(third.started().questionSetId).toBeNull();
  });

  it("disables New set while the questions are still loading", async () => {
    const { user, started } = renderSetup({ banks: null });
    expect(button("New set")).toBeDisabled();
    expect(screen.getByText("Questions are still loading…")).toBeInTheDocument();
    await user.click(button("Start game"));
    expect(started().questionSetId).toBeNull();
  });

  it("deletes the chosen set after confirming", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user, setStore } = renderSetup({ sets: [makeSet()] });
    await user.selectOptions(questionsSelect(), "Quick game");
    await user.click(button("Delete set"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"Quick game"'));
    expect(setStore.list()).toHaveLength(1);

    confirm.mockReturnValue(true);
    await user.click(button("Delete set"));
    expect(setStore.list()).toHaveLength(0);
    expect(questionsSelect()).toHaveValue("");
    expect(questionsSelect()).toHaveFocus();
  });
});

describe("Question set summary", () => {
  it("counts the questions in each part", async () => {
    const { user } = renderSetup({
      sets: [makeSet({ suddenDeath: [HOT.id], fastMoney: FIVE })],
    });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(setSummary()).toEqual({ Rounds: "4 questions", "Sudden Death": "1 question", "Fast Money": "5 questions" });
    expect(notes()).toEqual([]);
  });

  it("says random for parts the set leaves out", async () => {
    const { user } = renderSetup({ sets: [makeSet({ rounds: [], suddenDeath: [HOT.id] })] });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(setSummary()).toEqual({ Rounds: "None (random)", "Sudden Death": "1 question", "Fast Money": "Random" });
    expect(notes()).toEqual(["The set has no round questions, so every round uses a random question."]);
  });

  it("notes rounds the set doesn't cover", async () => {
    const { user } = renderSetup({ sets: [makeSet({ rounds: [FRUIT.id, COLOR.id] })] });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(notes()).toEqual(["The rules have 4 rounds; the set covers 2 — rounds 3-4 use random questions."]);
  });

  it("notes extra round questions, which only a repeating last round uses", async () => {
    const rounds = [FRUIT.id, COLOR.id, VEG.id, SPORT.id, CAR.id, PET.id];
    const { user } = renderSetup({ sets: [makeSet({ rounds })] });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(notes()).toEqual(["2 extra round questions won't be used."]);
    await user.selectOptions(screen.getByLabelText("Rules preset"), "Single points");
    expect(notes()).toEqual(["2 extra round questions will only be used if the last round repeats."]);
  });

  it("notes Sudden Death and Fast Money questions the rules turn off", async () => {
    const presetStore = createPresetStore(memoryPresetStorage());
    const quiet: GameRules = {
      ...structuredClone(DEFAULT_RULES),
      id: "custom-quiet",
      name: "Quiet",
      builtIn: false,
      repeatLastRound: true,
      suddenDeath: { enabled: false, multiplier: 1 },
      fastMoney: { ...DEFAULT_RULES.fastMoney, enabled: false },
    };
    presetStore.save(quiet);
    const { user } = renderSetup({ presetStore, sets: [makeSet({ suddenDeath: [HOT.id], fastMoney: FIVE })] });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(notes()).toEqual([]);
    await user.selectOptions(screen.getByLabelText("Rules preset"), "Quiet");
    expect(notes()).toEqual([
      "The rules have Sudden Death off, so the set's Sudden Death questions won't be used.",
      "The rules have Fast Money off, so the set's Fast Money questions won't be used.",
    ]);
  });

  it("lists missing (deleted) questions", async () => {
    const { user } = renderSetup({
      sets: [makeSet({ rounds: [FRUIT.id, "c-gone", VEG.id, SPORT.id], fastMoney: [...FIVE.slice(0, 4), "c-gone-2"] })],
    });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(notes()).toEqual([
      "A Fast Money question is missing, so Fast Money uses five random questions.",
      "2 questions no longer exist (deleted custom questions?), so random ones play instead:",
    ]);
    const missing = screen.getByRole("list", { name: "Missing questions" });
    expect(within(missing).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Round 2", "Fast Money 5"]);
  });

  it("gently notes a round question outside that round's usual size", async () => {
    const { user } = renderSetup({ sets: [makeSet({ rounds: [TRADITION.id, COLOR.id, PET.id, SPORT.id] })] });
    await user.selectOptions(questionsSelect(), "Quick game");
    expect(notes()).toEqual([
      "Round 1: Single rounds usually use 6-8 answers; this one has 3.",
      "Round 3: Double rounds usually use 4-6 answers; this one has 8.",
    ]);
  });
});
