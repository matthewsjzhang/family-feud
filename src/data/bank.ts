// Question bank: loading, cleanup and non-repeating question selection.
// Source data is data/question_bank.json, built by tools/scrape_surveys.py.

export interface Answer {
  text: string;
  points: number;
}

export interface Survey {
  id: string;
  season: number;
  answerCount: number;
  question: string;
  total: number;
  /** Board order: #1 answer first. */
  answers: Answer[];
  source: string;
  /** Present only when the source page had a data problem; such surveys are never played. */
  reviewFlags?: string[];
}

export interface SizeRange {
  min: number;
  max: number;
  /** Survey ids that must not be picked (e.g. already in this game). */
  exclude?: readonly string[];
}

/** Where used survey ids are remembered between games. */
export interface UsedStore {
  load(): string[];
  save(ids: string[]): void;
}

const questionKey = (s: Survey) => s.question.toLowerCase().replace(/\s+/g, " ").trim();

/** Drop flagged surveys and repeated question wordings (keeps the first copy). */
export function prepareBank(raw: readonly Survey[]): Survey[] {
  const seen = new Set<string>();
  return raw.filter((s) => {
    if (s.reviewFlags?.length) return false;
    const key = questionKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Load and clean the bank. Kept as a separate chunk so the app shell loads fast. */
export async function loadBank(): Promise<Survey[]> {
  const mod = await import("../../data/question_bank.json");
  return prepareBank(mod.default as Survey[]);
}

/** Single-answer surveys used only for Sudden Death (data/sudden_death_bank.json). */
export async function loadSuddenDeathBank(): Promise<Survey[]> {
  const mod = await import("../../data/sudden_death_bank.json");
  return prepareBank(mod.default as Survey[]);
}

export function memoryStore(initial: string[] = []): UsedStore {
  let ids = [...initial];
  return {
    load: () => [...ids],
    save: (next) => {
      ids = [...next];
    },
  };
}

/** Browser store; falls back to memory if localStorage is unavailable (private mode, etc.). */
export function localStorageStore(key = "feud.usedSurveys"): UsedStore {
  const fallback = memoryStore();
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return fallback.load();
      }
    },
    save(ids) {
      fallback.save(ids);
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch {
        // Storage full or blocked: memory copy keeps this session non-repeating.
      }
    },
  };
}

export interface PickerOptions {
  store?: UsedStore;
  random?: () => number;
}

export interface QuestionPicker {
  /** Pick an unused survey whose answer count is within the range, and mark it used. */
  pick(range: SizeRange): Survey;
  /** Has this survey been played (and not yet recycled)? */
  isUsed(id: string): boolean;
  /** Record a survey the host chose by hand, so it isn't picked again. */
  markUsed(id: string): void;
}

export function createPicker(bank: readonly Survey[], options: PickerOptions = {}): QuestionPicker {
  const store = options.store ?? memoryStore();
  const random = options.random ?? Math.random;
  const used = new Set(store.load());

  return {
    pick({ min, max, exclude = [] }) {
      const excluded = new Set(exclude);
      const inRange = bank.filter(
        (s) => s.answerCount >= min && s.answerCount <= max && !excluded.has(s.id),
      );
      if (inRange.length === 0) {
        throw new Error(`No surveys with ${min}-${max} answers in the question bank.`);
      }

      let candidates = inRange.filter((s) => !used.has(s.id));
      if (candidates.length === 0) {
        // Every survey of this size has been played: start this size over.
        for (const s of inRange) used.delete(s.id);
        candidates = inRange;
      }

      const choice = candidates[Math.floor(random() * candidates.length)]!;
      used.add(choice.id);
      store.save([...used]);
      return choice;
    },
    isUsed: (id) => used.has(id),
    markUsed(id) {
      used.add(id);
      store.save([...used]);
    },
  };
}
