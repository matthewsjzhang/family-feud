// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "../../../app/useGameHost";
import type { ChampionRecord } from "../../../engine/champions";
import { createPresetStore, memoryPresetStorage, type PresetStore } from "../../../engine/presets";
import { DEFAULT_RULES, type GameRules } from "../../../engine/rules";
import { SetupScreen } from "../SetupScreen";
import { winsToRetire } from "./ChampionPanel";
import { SETUP_STORAGE_KEY } from "./setupStorage";

const SMITH: ChampionRecord = {
  family: { name: "Smith", players: ["Sam", "Sue", "Sid"] },
  wins: 3,
  winnings: 20950,
};

interface Options {
  champion?: ChampionRecord | null;
  retired?: ChampionRecord | null;
  store?: PresetStore;
}

/** Holds the champion like the hook does, so clearing re-renders without them. */
function setup({ champion = SMITH, retired = null, store = createPresetStore(memoryPresetStorage()) }: Options = {}) {
  const onStart = vi.fn<(setup: GameSetup) => void>();
  const onClear = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(champion);
    return (
      <SetupScreen
        onStart={onStart}
        presetStore={store}
        champion={current}
        retiredChampion={retired}
        onClearChampion={() => {
          onClear();
          setCurrent(null);
        }}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const started = () => onStart.mock.calls.at(-1)![0];
  return { user, onStart, onClear, started };
}

const champions = () => screen.getByRole("region", { name: "Returning champions" });
const challengers = () => screen.getByRole("group", { name: "Family 2 · Challengers" });
const start = () => screen.getByRole("button", { name: "Start game" });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("SetupScreen with returning champions", () => {
  it("shows the champions read-only with their record", () => {
    setup();
    const panel = within(champions());
    expect(panel.getByText("Smith")).toBeInTheDocument();
    expect(panel.getByText("3-time champions")).toBeInTheDocument();
    expect(panel.getByText("$20,950 won so far")).toBeInTheDocument();
    expect(panel.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Sam", "Sue", "Sid"]);
    expect(panel.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Family 1" })).not.toBeInTheDocument();
  });

  it("starts with the champions as family 1 and editable challengers", async () => {
    const { user, started } = setup();
    const name = within(challengers()).getByLabelText("Family name");
    await user.clear(name);
    await user.type(name, "Jones");
    await user.click(start());
    expect(started()).toMatchObject({
      rules: DEFAULT_RULES,
      championReturning: true,
      families: [SMITH.family, { name: "Jones" }],
    });
  });

  it("keeps saved names out of the champions panel but remembers the challengers", async () => {
    localStorage.setItem(
      SETUP_STORAGE_KEY,
      JSON.stringify({
        presetId: DEFAULT_RULES.id,
        families: [
          { name: "Old", players: ["A"] },
          { name: "Garcia", players: ["G1", "G2"] },
        ],
      }),
    );
    const { user, started } = setup();
    expect(within(champions()).queryByText("Old")).not.toBeInTheDocument();
    expect(within(challengers()).getByLabelText("Family name")).toHaveValue("Garcia");
    await user.click(start());
    expect(started().families[0]).toEqual(SMITH.family);
    expect(started().families[1]).toEqual({ name: "Garcia", players: ["G1", "G2"] });
  });

  it("doesn't offer the new champions as their own challengers", () => {
    localStorage.setItem(
      SETUP_STORAGE_KEY,
      JSON.stringify({ presetId: DEFAULT_RULES.id, families: [{ name: "Jones", players: ["J"] }, { name: "Smith", players: ["S"] }] }),
    );
    setup();
    expect(within(challengers()).getByLabelText("Family name")).toHaveValue("Red");
  });

  it("clears the champions only after confirming, then family 1 is editable", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user, onClear, started } = setup();
    const clear = screen.getByRole("button", { name: "New group — clear champions" });

    await user.click(clear);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
    expect(champions()).toBeInTheDocument();

    await user.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Returning champions" })).not.toBeInTheDocument();
    const family1 = screen.getByRole("group", { name: "Family 1" });
    await user.type(within(family1).getByLabelText("Family name"), "!");
    await user.click(start());
    expect(started().championReturning).toBeUndefined();
    expect(started().families[0].name).toBe("Blue!");
  });

  it("shows how many more wins until they retire, or no limit", async () => {
    const store = createPresetStore(memoryPresetStorage());
    const unlimited: GameRules = { ...structuredClone(DEFAULT_RULES), id: "custom-u", name: "Unlimited", builtIn: false, championLimit: null };
    store.save(unlimited);
    const { user } = setup({ store });
    expect(within(champions()).getByText("2 more wins to retire undefeated")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Rules preset"), "Unlimited");
    expect(within(champions()).getByText("No win limit")).toBeInTheDocument();
  });

  it("words the wins left for one win and a limit already reached", () => {
    expect(winsToRetire(4, 5)).toBe("1 more win to retire undefeated");
    expect(winsToRetire(1, 5)).toBe("4 more wins to retire undefeated");
    expect(winsToRetire(6, 5)).toBe("1 more win to retire undefeated");
    expect(winsToRetire(9, null)).toBe("No win limit");
  });

  it("congratulates a family that retired undefeated", () => {
    setup({ champion: null, retired: { ...SMITH, wins: 5, winnings: 81900 } });
    expect(screen.getByRole("status")).toHaveTextContent("The Smith family retires undefeated after 5 wins, with $81,900!");
    // Nobody is defending, so both families are editable.
    expect(screen.getByRole("group", { name: "Family 1" })).toBeInTheDocument();
  });

  it("leaves out the prize when the retired family won no Fast Money", () => {
    setup({ champion: null, retired: { ...SMITH, wins: 1, winnings: 0 } });
    expect(screen.getByRole("status")).toHaveTextContent(/^The Smith family retires undefeated after 1 win!$/);
  });
});
