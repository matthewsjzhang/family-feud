// PLACEHOLDER - replaced in Phase 5 (setup agent).
import type { GameSetup } from "../../app/useGameHost";
import { DEFAULT_RULES } from "../../engine/rules";

export interface SetupScreenProps {
  onStart(setup: GameSetup): void;
}

export function SetupScreen({ onStart }: SetupScreenProps) {
  const players = (prefix: string) => [1, 2, 3, 4, 5].map((n) => `${prefix}${n}`);
  return (
    <button
      onClick={() =>
        onStart({
          rules: DEFAULT_RULES,
          families: [
            { name: "Smith", players: players("S") },
            { name: "Jones", players: players("J") },
          ],
        })
      }
    >
      Start game
    </button>
  );
}
