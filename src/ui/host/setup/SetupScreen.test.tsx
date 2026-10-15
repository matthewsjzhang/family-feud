// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "../../../app/useGameHost";
import { createPresetStore, memoryPresetStorage, type PresetStore } from "../../../engine/presets";
import { DEFAULT_RULES, FIXED_ROUNDS_RULES, SINGLE_POINTS_RULES, type GameRules } from "../../../engine/rules";
import { SetupScreen } from "../SetupScreen";
import { SETUP_STORAGE_KEY } from "./setupStorage";

function setup(store: PresetStore = createPresetStore(memoryPresetStorage())) {
  const onStart = vi.fn<(setup: GameSetup) => void>();
  const user = userEvent.setup();
  const utils = render(<SetupScreen onStart={onStart} presetStore={store} />);
  const started = () => onStart.mock.calls.at(-1)![0];
  return { ...utils, onStart, user, store, started };
}

const family = (n: 1 | 2) => screen.getByRole("group", { name: `Family ${n}` });

function summaryText(): Record<string, string> {
  const dl = screen.getByLabelText(/^Summary of/);
  const terms = within(dl).getAllByRole("term");
  const defs = within(dl).getAllByRole("definition");
  return Object.fromEntries(terms.map((t, i) => [t.textContent ?? "", defs[i]!.textContent ?? ""]));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("SetupScreen", () => {
  it("starts with the Default rules and five players per family", async () => {
    const { user, onStart, started } = setup();
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    const s = started();
    expect(s.rules).toBe(DEFAULT_RULES);
    expect(s.families).toEqual([
      { name: "Blue", players: ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"] },
      { name: "Red", players: ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"] },
    ]);
  });

  it("passes renamed families and players to onStart", async () => {
    const { user, started } = setup();
    const name = within(family(1)).getByLabelText("Family name");
    await user.clear(name);
    await user.type(name, "Smith");
    const p2 = within(family(2)).getByLabelText("Player 2");
    await user.clear(p2);
    await user.type(p2, "  Ann  ");
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(started().families[0].name).toBe("Smith");
    expect(started().families[1].players[1]).toBe("Ann");
  });

  it("fills blank names with the defaults when starting", async () => {
    const { user, started } = setup();
    await user.clear(within(family(2)).getByLabelText("Family name"));
    await user.clear(within(family(1)).getByLabelText("Player 3"));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(started().families[1].name).toBe("Red");
    expect(started().families[0].players[2]).toBe("Player 3");
  });

  it("adds players up to 8 and removes down to 1", async () => {
    const { user, started } = setup();
    const panel = within(family(1));
    const add = panel.getByRole("button", { name: "Add player" });
    for (let i = 0; i < 3; i += 1) await user.click(add);
    expect(panel.getAllByRole("textbox")).toHaveLength(9); // family name + 8 players
    expect(add).toBeDisabled();
    expect(panel.getByLabelText("Player 8")).toHaveValue("Player 8");

    await user.click(panel.getByRole("button", { name: "Remove player 2" }));
    expect(add).toBeEnabled();
    while (panel.getAllByRole("textbox").length > 2) {
      await user.click(panel.getByRole("button", { name: "Remove player 1" }));
    }
    expect(panel.getByRole("button", { name: "Remove player 1" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(started().families[0].players).toEqual(["Player 8"]);
    expect(started().families[1].players).toHaveLength(5);
  });

  it("summarises each built-in preset", async () => {
    const { user } = setup();
    expect(summaryText()).toEqual({
      Rounds: "1. Single ×1 · 2. Single ×1 · 3. Double ×2 · 4. Triple ×3",
      "Last round": "The last round doesn't repeat",
      Win: "First to 300",
      "Sudden Death": "On, ×3 (single-answer questions)",
      "Fast Money": "200 points wins $20,000, otherwise $5 per point; timers 20 s / 25 s",
      Champions: "Retire after 5 wins",
    });

    await user.selectOptions(screen.getByLabelText("Rules preset"), "Single points");
    expect(summaryText()).toMatchObject({
      Rounds: "1. Single ×1 · 2. Single ×1 · 3. Single ×1 · 4. Single ×1",
      "Last round": "The last round repeats until someone reaches the target",
      Win: "First to 300",
      "Sudden Death": "On, ×1 (single-answer questions)",
    });

    await user.selectOptions(screen.getByLabelText("Rules preset"), "Fixed rounds");
    expect(summaryText()).toMatchObject({
      Rounds: "1. Single ×1 · 2. Single ×1 · 3. Single ×1 · 4. Single ×1 · 5. Single ×1",
      "Last round": "The last round doesn't repeat",
      Win: "Highest score after round 5",
    });
  });

  it("lists built-ins first, then custom presets, and starts with the chosen one", async () => {
    const store = createPresetStore(memoryPresetStorage());
    const custom: GameRules = { ...structuredClone(DEFAULT_RULES), id: "custom-x", name: "House", builtIn: false, championLimit: null };
    store.save(custom);
    const { user, started } = setup(store);
    const options = within(screen.getByLabelText("Rules preset")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Default", "Single points", "Fixed rounds", "House"]);
    await user.selectOptions(screen.getByLabelText("Rules preset"), "House");
    expect(summaryText().Champions).toBe("No limit");
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(started().rules).toMatchObject({ id: "custom-x", name: "House" });
  });

  it("remembers the last preset and the names", async () => {
    const first = setup();
    await first.user.selectOptions(screen.getByLabelText("Rules preset"), "Fixed rounds");
    const name = within(family(2)).getByLabelText("Family name");
    await first.user.clear(name);
    await first.user.type(name, "Jones");
    await first.user.click(within(family(2)).getByRole("button", { name: "Add player" }));
    first.unmount();
    expect(localStorage.getItem(SETUP_STORAGE_KEY)).toContain("Jones");

    const second = setup();
    expect(screen.getByLabelText("Rules preset")).toHaveValue(FIXED_ROUNDS_RULES.id);
    expect(within(family(2)).getByLabelText("Family name")).toHaveValue("Jones");
    await second.user.click(screen.getByRole("button", { name: "Start game" }));
    expect(second.started().rules).toBe(FIXED_ROUNDS_RULES);
    expect(second.started().families[1].players).toHaveLength(6);
  });

  it("ignores a remembered preset that no longer exists", () => {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ presetId: "custom-gone", families: "nonsense" }));
    setup();
    expect(screen.getByLabelText("Rules preset")).toHaveValue(DEFAULT_RULES.id);
    expect(within(family(1)).getByLabelText("Family name")).toHaveValue("Blue");
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { user, started } = setup();
    await user.selectOptions(screen.getByLabelText("Rules preset"), "Single points");
    await user.type(within(family(1)).getByLabelText("Family name"), "!");
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(started().rules).toBe(SINGLE_POINTS_RULES);
    expect(started().families[0].name).toBe("Blue!");
  });

  it("works with the default localStorage-backed store when none is injected", async () => {
    const onStart = vi.fn<(setup: GameSetup) => void>();
    render(<SetupScreen onStart={onStart} />);
    await userEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(onStart.mock.calls[0]![0].rules).toBe(DEFAULT_RULES);
  });
});
