// A JSON value kept in the browser (localStorage), with an in-memory version for tests.
// Reads of missing or corrupt data return undefined; writes never throw.

export interface JsonStorage {
  load(): unknown;
  save(value: unknown): void;
}

export function memoryJsonStorage(initial?: unknown): JsonStorage {
  let data = initial === undefined ? undefined : structuredClone(initial);
  return {
    load: () => (data === undefined ? undefined : structuredClone(data)),
    save: (value) => {
      data = structuredClone(value);
    },
  };
}

/** localStorage under `key`; keeps working in memory if storage is blocked or full. */
export function localJsonStorage(key: string): JsonStorage {
  const fallback = memoryJsonStorage();
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback.load() : JSON.parse(raw);
      } catch {
        return fallback.load();
      }
    },
    save(value) {
      fallback.save(value);
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage blocked or full: the data lasts for this session only.
      }
    },
  };
}
