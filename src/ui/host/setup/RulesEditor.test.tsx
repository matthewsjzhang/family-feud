// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "../../../app/useGameHost";
import { createPresetStore, memoryPresetStorage, type PresetStore } from "../../../engine/presets";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { SetupScreen } from "../SetupScreen";

function setup(store: PresetStore = createPresetStore(memoryPresetStorage())) {
  const onStart = vi.fn<(setup: GameSetup) => void>();
  const user = userEvent.setup();
  render(<SetupScreen onStart={onStart} presetStore={store} />);
  const started = () => onStart.mock.calls.at(-1)![0];
  return { onStart, user, store, started };
}

const custom = (patch: Partial<GameRules> = {}): GameRules => ({
  ...structuredClone(DEFAULT_RULES),
  id: "custom-house",
  name: "House rules",
  builtIn: false,
  ...patch,
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const round = (n: number) => screen.getByRole("group", { name: `Round ${n}` });
const roundNames = () =>
  screen.getAllByRole("group", { name: /^Round \d+$/ }).map((g) => (within(g).getByLabelText("Name") as HTMLInputElement).value);
const presetSelect = () => screen.getByLabelText("Rules preset") as HTMLSelectElement;
const selectedName = () => presetSelect().selectedOptions[0]?.textContent;

async function setNumber(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) {
  await user.clear(input);
  if (value) await user.type(input, value);
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("RulesEditor: built-in presets", () => {
  it("shows a built-in as read-only and offers a copy", async () => {
    const { user, store } = setup();
    await user.click(button("Edit rules"));
    expect(screen.getByRole("heading", { name: "Rules: Default" })).toHaveFocus();
    expect(screen.getByText(/Built-in presets are read-only/)).toBeInTheDocument();
    expect(screen.getByLabelText("Preset name")).toBeDisabled();
    expect(within(round(1)).getByLabelText("Multiplier (×)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await user.click(button("Copy to edit"));
    expect(screen.getByRole("heading", { name: "Edit rules: Default (copy)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Preset name")).toBeEnabled();
    expect(screen.getByLabelText("Preset name")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent('editing "Default (copy)"');
    expect(store.list().map((p) => p.name)).toContain("Default (copy)");

    await user.click(button("Close"));
    expect(selectedName()).toBe("Default (copy)");
    expect(button("Edit rules")).toHaveFocus();
  });

  it("numbers further copies of the same preset", async () => {
    const { user, store } = setup();
    await user.click(button("Edit rules"));
    await user.click(button("Copy to edit"));
    await user.click(button("Close"));
    await user.selectOptions(presetSelect(), "Default");
    await user.click(button("Edit rules"));
    await user.click(button("Copy to edit"));
    expect(store.list().map((p) => p.name)).toEqual(
      expect.arrayContaining(["Default (copy)", "Default (copy 2)"]),
    );
  });
});

describe("RulesEditor: editing a copy", () => {
  it("adds, removes and reorders rounds, sets all to ×1, then saves and starts with it", async () => {
    const { user, started, store } = setup();
    await user.click(button("Edit rules"));
    await user.click(button("Copy to edit"));

    const name = screen.getByLabelText("Preset name");
    await user.clear(name);
    await user.type(name, "Party");

    await user.click(button("Add round"));
    expect(roundNames()).toEqual(["Single", "Single", "Double", "Triple", "Single"]);
    const fifth = within(round(5)).getByLabelText("Name");
    await user.clear(fifth);
    await user.type(fifth, "Bonus");

    await user.click(button("Move round 5 up"));
    expect(roundNames()).toEqual(["Single", "Single", "Double", "Bonus", "Triple"]);
    await user.click(button("Move round 1 down"));
    await user.click(button("Remove round 3"));
    expect(roundNames()).toEqual(["Single", "Single", "Bonus", "Triple"]);
    expect(button("Move round 1 up")).toBeDisabled();
    expect(button("Move round 4 down")).toBeDisabled();

    await user.click(button("Set all multipliers to ×1"));
    for (let n = 1; n <= 4; n += 1) expect(within(round(n)).getByLabelText("Multiplier (×)")).toHaveValue(1);

    await user.click(button("Save"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    await user.click(button("Close"));

    expect(selectedName()).toBe("Party");
    expect(screen.getByLabelText(/^Summary of/)).toHaveTextContent("1. Single ×1 · 2. Single ×1 · 3. Bonus ×1 · 4. Triple ×1");
    await user.click(button("Start game"));
    const rules = started().rules;
    expect(rules.name).toBe("Party");
    expect(rules.rounds.map((r) => [r.name, r.multiplier])).toEqual([
      ["Single", 1],
      ["Single", 1],
      ["Bonus", 1],
      ["Triple", 1],
    ]);
    expect(store.get(rules.id)?.builtIn).toBe(false);
  });

  it("edits the win condition, Sudden Death, Fast Money and champion settings", async () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    const { user } = setup(store);
    await user.selectOptions(presetSelect(), "House rules");
    await user.click(button("Edit rules"));

    await setNumber(user, screen.getByLabelText("Target score (points)"), "500");
    await user.click(screen.getByLabelText("Repeat the last round until someone reaches the target"));
    const sd = within(screen.getByRole("group", { name: "Sudden Death" }));
    await setNumber(user, sd.getByLabelText("Multiplier (×)"), "2");
    const fm = within(screen.getByRole("group", { name: "Fast Money" }));
    await setNumber(user, fm.getByLabelText("Target (points)"), "180");
    await setNumber(user, fm.getByLabelText("Grand prize ($)"), "10000");
    await setNumber(user, fm.getByLabelText("$ per point"), "1");
    await setNumber(user, fm.getByLabelText("Player 1 timer (seconds)"), "15");
    await setNumber(user, fm.getByLabelText("Player 2 timer (seconds)"), "20");
    await user.click(screen.getByLabelText("No limit: champions never retire"));
    expect(screen.getByLabelText("Retire after this many wins")).toBeDisabled();
    await user.click(button("Save"));

    expect(store.get("custom-house")).toMatchObject({
      repeatLastRound: true,
      win: { type: "target", target: 500 },
      suddenDeath: { enabled: true, multiplier: 2 },
      fastMoney: { enabled: true, target: 180, grandPrize: 10000, perPoint: 1, timers: [15, 20] },
      championLimit: null,
    });
  });

  it("disables the repeat option without a target score", async () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom({ repeatLastRound: true }));
    const { user } = setup(store);
    await user.selectOptions(presetSelect(), "House rules");
    await user.click(button("Edit rules"));
    const repeat = screen.getByLabelText("Repeat the last round until someone reaches the target");
    expect(repeat).toBeChecked();
    await user.click(screen.getByLabelText("Highest score after the last round"));
    expect(repeat).toBeDisabled();
    expect(repeat).not.toBeChecked();
    expect(screen.getByLabelText("Target score (points)")).toBeDisabled();
    await user.click(button("Save"));
    expect(store.get("custom-house")).toMatchObject({ win: { type: "highestScore" }, repeatLastRound: false });
  });

  it("disables Save and explains why when the rules are invalid", async () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    const { user } = setup(store);
    await user.selectOptions(presetSelect(), "House rules");
    await user.click(button("Edit rules"));

    await user.click(screen.getByLabelText("Play Sudden Death"));
    expect(button("Save")).toBeDisabled();
    expect(button("Save as new")).toBeDisabled();
    expect(screen.getByText(/Nobody may reach the target score/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Play Sudden Death"));
    expect(button("Save")).toBeEnabled();

    // A half-typed number is a validation error, not a crash or a silent clamp.
    const multiplier = within(round(2)).getByLabelText("Multiplier (×)");
    await user.clear(multiplier);
    expect(button("Save")).toBeDisabled();
    expect(screen.getByText("Round 2: the multiplier must be a whole number of at least 1.")).toBeInTheDocument();
    await user.type(multiplier, "0");
    expect(button("Save")).toBeDisabled();
    await setNumber(user, within(round(1)).getByLabelText("Max answers"), "9");
    expect(screen.getByText(/Round 1: survey size must be between 4 and 8/)).toBeInTheDocument();
    expect(store.get("custom-house")?.rounds[1]?.multiplier).toBe(1);
  });

  it("saves as a new preset without changing the original", async () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    const { user } = setup(store);
    await user.selectOptions(presetSelect(), "House rules");
    await user.click(button("Edit rules"));
    await setNumber(user, screen.getByLabelText("Target score (points)"), "200");
    await user.click(button("Save as new"));
    expect(screen.getByRole("heading", { name: "Edit rules: House rules (copy)" })).toBeInTheDocument();
    await user.click(button("Close"));

    expect(selectedName()).toBe("House rules (copy)");
    const copy = store.list().find((p) => p.name === "House rules (copy)");
    expect(copy?.win).toEqual({ type: "target", target: 200 });
    expect(store.get("custom-house")?.win).toEqual({ type: "target", target: 300 });
  });

  it("asks before discarding unsaved changes, and Escape closes", async () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    const { user } = setup(store);
    await user.selectOptions(presetSelect(), "House rules");
    await user.click(button("Edit rules"));
    await user.type(screen.getByLabelText("Preset name"), "!");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(button("Cancel"));
    expect(screen.getByLabelText("Preset name")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Preset name")).not.toBeInTheDocument();
    expect(store.get("custom-house")?.name).toBe("House rules");
  });

  it("deletes a custom preset after confirming", async () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    const { user } = setup(store);
    await user.selectOptions(presetSelect(), "House rules");
    await user.click(button("Edit rules"));

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(button("Delete"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"House rules"'));
    expect(store.get("custom-house")).toBeDefined();

    confirm.mockReturnValueOnce(true);
    await user.click(button("Delete"));
    expect(store.get("custom-house")).toBeUndefined();
    expect(selectedName()).toBe("Default");
    expect(within(presetSelect()).queryByRole("option", { name: "House rules" })).not.toBeInTheDocument();
  });
});

describe("RulesEditor: import and export", () => {
  it("imports a valid preset file and selects it", async () => {
    const { user, store, started } = setup();
    await user.click(button("Edit rules"));
    const json = JSON.stringify(custom({ id: "imported", name: "From a friend", championLimit: 3 }));
    await user.upload(screen.getByLabelText(/Import/), new File([json], "friend.json", { type: "application/json" }));

    expect(await screen.findByRole("status")).toHaveTextContent('Imported "From a friend"');
    expect(screen.getByRole("heading", { name: "Edit rules: From a friend" })).toBeInTheDocument();
    expect(store.get("imported")?.championLimit).toBe(3);
    await user.click(button("Close"));
    expect(selectedName()).toBe("From a friend");
    await user.click(button("Start game"));
    expect(started().rules.id).toBe("imported");
  });

  it("shows the reason when an imported file is invalid", async () => {
    const { user, store } = setup();
    await user.click(button("Edit rules"));
    const input = screen.getByLabelText(/Import/);
    await user.upload(input, new File(["{not json"], "broken.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That file isn't valid JSON.");

    const bad = JSON.stringify(custom({ rounds: [] }));
    await user.upload(input, new File([bad], "bad.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't a valid preset.*at least one round/);
    expect(store.list().every((p) => p.builtIn)).toBe(true);
  });

  it("exports the preset as a JSON download", async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:preset");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    const { user } = setup();
    await user.click(button("Edit rules"));
    await user.click(button("Export"));

    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("default.json");
    expect(clicked[0]!.href).toBe("blob:preset");
    expect(clicked[0]!.isConnected).toBe(false);
    const blob = createObjectURL.mock.calls[0]![0];
    expect(JSON.parse(await blob.text())).toEqual(DEFAULT_RULES);
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:preset"));
  });
});
