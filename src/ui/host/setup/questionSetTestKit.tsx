// Shared fixtures for the question set tests: small hand-made banks and a SetupScreen
// backed by a real question set store (in memory), re-rendering with its list like the hook does.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import type { GameSetup, QuestionBanks } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import { memoryJsonStorage } from "../../../data/jsonStorage";
import { createQuestionSetStore, type QuestionSet, type QuestionSetStore } from "../../../data/questionSets";
import { createPresetStore, memoryPresetStorage, type PresetStore } from "../../../engine/presets";
import { SetupScreen } from "../SetupScreen";
import { lookupFromBanks } from "./questionSetSummary";

function survey(id: string, question: string, answerCount: number, extra: Partial<Survey> = {}): Survey {
  const answers = Array.from({ length: answerCount }, (_, i) => ({ text: `${question} answer ${i + 1}`, points: 40 - i * 5 }));
  return {
    id,
    season: 3,
    answerCount,
    question,
    total: answers.reduce((sum, a) => sum + a.points, 0),
    answers,
    source: "test",
    ...extra,
  };
}

export const FRUIT = survey("m-fruit", "Name a fruit", 6, { season: 1 });
export const COLOR = survey("m-color", "Name a color", 5, { season: 2 });
export const PET = survey("m-pet", "Name a pet", 8);
export const SPORT = survey("m-sport", "Name a sport", 4);
export const CAR = survey("m-car", "Name a car brand", 7);
export const VEG = survey("m-veg", "Name a vegetable", 6);
/** 25 more, so a search for "filler" needs a second page. */
export const FILLERS = Array.from({ length: 25 }, (_, i) => survey(`m-filler-${i + 1}`, `Filler question ${i + 1}`, 5));
export const HOT = survey("sd-hot", "Name something hot", 1);
export const PLANET = survey("sd-planet", "Name a planet", 1);
export const TRADITION = survey("c-tradition", "Name a family tradition", 3, { season: 0, custom: "main" });
export const TIEBREAK = survey("c-tiebreak", "Name a tiebreaker snack", 1, { season: 0, custom: "suddenDeath" });

export const BANKS: QuestionBanks = {
  main: [FRUIT, COLOR, PET, SPORT, CAR, VEG, ...FILLERS],
  suddenDeath: [HOT, PLANET],
  custom: [TRADITION, TIEBREAK],
};

export const makeSet = (patch: Partial<QuestionSet> = {}): QuestionSet => ({
  id: "",
  name: "Quick game",
  // Sizes fit the Default rules' rounds (6-8, 5-8, 4-6, 4-5).
  rounds: [FRUIT.id, COLOR.id, VEG.id, SPORT.id],
  suddenDeath: [],
  fastMoney: [],
  ...patch,
});

export interface Options {
  sets?: QuestionSet[];
  presetStore?: PresetStore;
  setStore?: QuestionSetStore;
  /** Make onSaveQuestionSet report a failure, like the hook does when the store throws. */
  failSave?: boolean;
  banks?: QuestionBanks | null;
}

export function renderSetup({
  sets = [],
  presetStore = createPresetStore(memoryPresetStorage()),
  setStore = createQuestionSetStore(memoryJsonStorage()),
  failSave = false,
  banks = BANKS,
}: Options = {}) {
  const saved = sets.map((s) => setStore.save(s));
  const onStart = vi.fn<(setup: GameSetup) => void>();
  const user = userEvent.setup();

  function Harness() {
    const [list, setList] = useState(() => setStore.list());
    return (
      <SetupScreen
        onStart={onStart}
        presetStore={presetStore}
        questionSets={list}
        onSaveQuestionSet={(set) => {
          if (failSave) return null;
          try {
            const result = setStore.save(set);
            setList(setStore.list());
            return result;
          } catch {
            return null;
          }
        }}
        onRemoveQuestionSet={(id) => {
          setStore.remove(id);
          setList(setStore.list());
        }}
        banks={banks}
        findSurvey={banks ? lookupFromBanks(banks) : undefined}
      />
    );
  }

  const utils = render(<Harness />);
  const started = () => onStart.mock.calls.at(-1)![0];
  return { ...utils, user, onStart, started, setStore, presetStore, saved };
}

export const button = (name: string | RegExp) => screen.getByRole("button", { name });
export const questionsSelect = () => screen.getByLabelText("Questions") as HTMLSelectElement;

/** Entry text in one section of the editor, e.g. "Round 1 · Single ×1Name a fruit6 answers · Season 1". */
export function entries(section: "Rounds" | "Sudden Death" | "Fast Money"): HTMLElement[] {
  const list = screen.queryByRole("list", { name: `${section} questions` });
  return list ? within(list).getAllByRole("listitem") : [];
}

export const entryQuestions = (section: "Rounds" | "Sudden Death" | "Fast Money") =>
  entries(section).map((li) => li.querySelector(".qs-entry__question")?.textContent ?? "");
