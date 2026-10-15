// Returning champions, as on the show: the winning family comes back for the next
// game until they lose or reach the preset's win limit and retire undefeated.

export interface ChampionFamily {
  name: string;
  players: string[];
}

export interface ChampionRecord {
  family: ChampionFamily;
  /** Games won in a row. */
  wins: number;
  /** Fast Money winnings across those games, in dollars. */
  winnings: number;
}

export interface GameResult {
  winner: ChampionFamily;
  /** The winner was the returning champion family (not a challenger). */
  winnerWasChampion: boolean;
  /** Fast Money payout for this game; 0 if it wasn't played. */
  payout: number;
}

export interface ChampionUpdate {
  /** Who defends the title next game; null if nobody (they just retired). */
  champion: ChampionRecord | null;
  /** Set when the winner just reached the win limit. */
  retired: ChampionRecord | null;
}

/** The champion record after a finished game. `limit` is the preset's championLimit (null = no limit). */
export function recordResult(current: ChampionRecord | null, result: GameResult, limit: number | null): ChampionUpdate {
  const defended = result.winnerWasChampion && current !== null;
  const next: ChampionRecord = defended
    ? { family: structuredClone(current.family), wins: current.wins + 1, winnings: current.winnings + result.payout }
    : { family: structuredClone(result.winner), wins: 1, winnings: result.payout };
  if (limit !== null && next.wins >= limit) return { champion: null, retired: next };
  return { champion: next, retired: null };
}
