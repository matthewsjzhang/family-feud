import { describe, expect, it } from "vitest";
import { createPresetStore, memoryPresetStorage } from "./presets";
import { DEFAULT_RULES, SINGLE_POINTS_RULES, type GameRules } from "./rules";

const custom = (name = "Our house rules"): GameRules => ({
  ...structuredClone(DEFAULT_RULES),
  id: "custom-1",
  name,
  builtIn: false,
});

describe("preset store", () => {
  it("lists the built-in presets first, Default at the top", () => {
    const store = createPresetStore(memoryPresetStorage());
    expect(store.list()[0]!.id).toBe(DEFAULT_RULES.id);
    expect(store.list().every((p) => p.builtIn)).toBe(true);
  });

  it("saves custom presets and keeps them in storage", () => {
    const storage = memoryPresetStorage();
    createPresetStore(storage).save(custom());
    const reopened = createPresetStore(storage);
    expect(reopened.list().map((p) => p.name)).toContain("Our house rules");
    expect(reopened.get("custom-1")?.builtIn).toBe(false);
  });

  it("updates a custom preset saved under the same id", () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom("First"));
    store.save(custom("Renamed"));
    const customs = store.list().filter((p) => !p.builtIn);
    expect(customs.map((p) => p.name)).toEqual(["Renamed"]);
  });

  it("refuses to save an invalid preset and says why", () => {
    const store = createPresetStore(memoryPresetStorage());
    expect(() => store.save({ ...custom(), rounds: [] })).toThrow(/at least one round/i);
  });

  it("never overwrites or deletes a built-in preset", () => {
    const store = createPresetStore(memoryPresetStorage());
    expect(() => store.save({ ...structuredClone(DEFAULT_RULES), builtIn: false, name: "Hacked" })).toThrow(/built-in/i);
    expect(() => store.remove(DEFAULT_RULES.id)).toThrow(/built-in/i);
  });

  it("deletes a custom preset", () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    store.remove("custom-1");
    expect(store.get("custom-1")).toBeUndefined();
  });

  it("copies any preset into a new, editable custom one", () => {
    const store = createPresetStore(memoryPresetStorage());
    const copy = store.copy(SINGLE_POINTS_RULES.id, "Single points (kids)");
    expect(copy.id).not.toBe(SINGLE_POINTS_RULES.id);
    expect(copy.builtIn).toBe(false);
    expect(copy.rounds).toEqual(SINGLE_POINTS_RULES.rounds);
    expect(store.get(copy.id)?.name).toBe("Single points (kids)");
  });

  it("exports and imports presets as JSON", () => {
    const a = createPresetStore(memoryPresetStorage());
    a.save(custom());
    const json = a.exportJson("custom-1");

    const b = createPresetStore(memoryPresetStorage());
    const imported = b.importJson(json);
    expect(imported.name).toBe("Our house rules");
    expect(b.get(imported.id)?.rounds).toEqual(DEFAULT_RULES.rounds);
  });

  it("gives an imported preset a new id if that id is taken, and never imports as built-in", () => {
    const store = createPresetStore(memoryPresetStorage());
    store.save(custom());
    const imported = store.importJson(JSON.stringify({ ...custom("Second copy"), builtIn: true }));
    expect(imported.id).not.toBe("custom-1");
    expect(imported.builtIn).toBe(false);
    expect(store.list().filter((p) => !p.builtIn)).toHaveLength(2);
  });

  it("rejects an import that isn't valid JSON or isn't a valid preset", () => {
    const store = createPresetStore(memoryPresetStorage());
    expect(() => store.importJson("not json")).toThrow(/json/i);
    expect(() => store.importJson(JSON.stringify({ name: "x" }))).toThrow();
  });

  it("ignores corrupt data in storage instead of crashing", () => {
    const store = createPresetStore(memoryPresetStorage("garbage" as unknown));
    expect(store.list().every((p) => p.builtIn)).toBe(true);
  });
});
