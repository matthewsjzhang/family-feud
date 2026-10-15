// Remembers the last preset, question set and family/player names between visits.
// Every access is guarded: the setup screen must work with storage blocked.

import type { FamilySetup } from "../../../app/useGameHost";

export const SETUP_STORAGE_KEY = "feud.setup";
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
export const DEFAULT_PLAYER_COUNT = 5;

export interface SavedSetup {
  presetId: string;
  families: [FamilySetup, FamilySetup];
  /** The last question set picked; null = random questions. */
  questionSetId: string | null;
}

// Colour names match the team colours and read naturally in "The Blue family wins".
export const defaultFamilyName = (team: number) => (team === 0 ? "Blue" : "Red");
export const defaultPlayerName = (index: number) => `Player ${index + 1}`;

export function defaultFamilies(): [FamilySetup, FamilySetup] {
  const family = (team: number): FamilySetup => ({
    name: defaultFamilyName(team),
    players: Array.from({ length: DEFAULT_PLAYER_COUNT }, (_, i) => defaultPlayerName(i)),
  });
  return [family(0), family(1)];
}

function isFamily(value: unknown): value is FamilySetup {
  if (typeof value !== "object" || value === null) return false;
  const { name, players } = value as Partial<FamilySetup>;
  return (
    typeof name === "string" &&
    Array.isArray(players) &&
    players.length >= MIN_PLAYERS &&
    players.length <= MAX_PLAYERS &&
    players.every((p) => typeof p === "string")
  );
}

export function loadSetup(): Partial<SavedSetup> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return {};
    const { presetId, families, questionSetId } = raw as Record<string, unknown>;
    const result: Partial<SavedSetup> = {};
    if (typeof presetId === "string") result.presetId = presetId;
    if (typeof questionSetId === "string" || questionSetId === null) result.questionSetId = questionSetId;
    if (Array.isArray(families)) {
      const [first, second] = families as unknown[];
      if (families.length === 2 && isFamily(first) && isFamily(second)) result.families = [first, second];
    }
    return result;
  } catch {
    return {};
  }
}

export function saveSetup(setup: SavedSetup): void {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Blocked or full: the names just won't be remembered next time.
  }
}

/** Blank names fall back to the defaults, so a quick game is never blocked by an empty field. */
export function finalizeFamilies(families: readonly [FamilySetup, FamilySetup]): [FamilySetup, FamilySetup] {
  const finish = (family: FamilySetup, team: number): FamilySetup => ({
    name: family.name.trim() || defaultFamilyName(team),
    players: family.players.map((p, i) => p.trim() || defaultPlayerName(i)),
  });
  return [finish(families[0], 0), finish(families[1], 1)];
}
