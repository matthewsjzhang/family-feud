// Saved rule presets: the built-ins plus the host's own, with JSON import/export.

import { BUILT_IN_PRESETS, validateRules, type GameRules } from "./rules";

/** Where custom presets live. */
export interface PresetStorage {
  load(): unknown;
  save(presets: GameRules[]): void;
}

export function memoryPresetStorage(initial: unknown = []): PresetStorage {
  let data = initial;
  return {
    load: () => structuredClone(data),
    save: (presets) => {
      data = structuredClone(presets);
    },
  };
}

/** Browser storage; keeps working in memory if localStorage is blocked. */
export function localPresetStorage(key = "feud.presets"): PresetStorage {
  const fallback = memoryPresetStorage();
  return {
    load() {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "[]");
      } catch {
        return fallback.load();
      }
    },
    save(presets) {
      fallback.save(presets);
      try {
        localStorage.setItem(key, JSON.stringify(presets));
      } catch {
        // Storage full or blocked: presets last for this session only.
      }
    },
  };
}

export interface PresetStore {
  list(): GameRules[];
  get(id: string): GameRules | undefined;
  /** Add or replace a custom preset. Throws with the reasons if it is invalid. */
  save(preset: GameRules): void;
  remove(id: string): void;
  copy(id: string, name: string): GameRules;
  exportJson(id: string): string;
  importJson(json: string): GameRules;
}

const isBuiltIn = (id: string) => BUILT_IN_PRESETS.some((p) => p.id === id);

function isValidPreset(value: unknown): value is GameRules {
  try {
    return typeof value === "object" && value !== null && validateRules(value as GameRules).length === 0;
  } catch {
    return false; // missing nested fields
  }
}

const newId = () => `custom-${crypto.randomUUID()}`;

export function createPresetStore(storage: PresetStorage): PresetStore {
  const stored = storage.load();
  let customs: GameRules[] = Array.isArray(stored)
    ? stored.filter(isValidPreset).filter((p) => !isBuiltIn(p.id)).map((p) => ({ ...p, builtIn: false }))
    : [];

  const persist = () => storage.save(customs);
  const get = (id: string) => [...BUILT_IN_PRESETS, ...customs].find((p) => p.id === id);
  const require = (id: string) => {
    const preset = get(id);
    if (!preset) throw new Error(`No preset with id "${id}".`);
    return preset;
  };

  const store: PresetStore = {
    list: () => [...BUILT_IN_PRESETS, ...customs],
    get,
    save(preset) {
      if (isBuiltIn(preset.id)) throw new Error("Built-in presets can't be changed. Copy it first.");
      const errors = validateRules(preset);
      if (errors.length) throw new Error(errors.join(" "));
      const clean = { ...structuredClone(preset), builtIn: false };
      const at = customs.findIndex((p) => p.id === preset.id);
      customs = at >= 0 ? customs.with(at, clean) : [...customs, clean];
      persist();
    },
    remove(id) {
      if (isBuiltIn(id)) throw new Error("Built-in presets can't be deleted.");
      customs = customs.filter((p) => p.id !== id);
      persist();
    },
    copy(id, name) {
      const preset = { ...structuredClone(require(id)), id: newId(), name, builtIn: false };
      store.save(preset);
      return preset;
    },
    exportJson: (id) => JSON.stringify(require(id), null, 2),
    importJson(json) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      if (!isValidPreset(parsed)) {
        const errors = typeof parsed === "object" && parsed ? safeErrors(parsed as GameRules) : [];
        throw new Error(`That isn't a valid preset. ${errors.join(" ")}`.trim());
      }
      const id = !parsed.id || get(parsed.id) ? newId() : parsed.id;
      const preset = { ...parsed, id, builtIn: false };
      store.save(preset);
      return preset;
    },
  };
  return store;
}

function safeErrors(rules: GameRules): string[] {
  try {
    return validateRules(rules);
  } catch {
    return ["Some settings are missing."];
  }
}
