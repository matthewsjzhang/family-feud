import { describe, expect, it } from "vitest";
import { recordResult, type ChampionRecord } from "./champions";

const smith = { name: "Smith", players: ["S1", "S2", "S3", "S4", "S5"] };
const jones = { name: "Jones", players: ["J1", "J2", "J3", "J4", "J5"] };

describe("recordResult", () => {
  it("makes a first-time winner the champion with one win and their Fast Money winnings", () => {
    const next = recordResult(null, { winner: smith, winnerWasChampion: false, payout: 950 }, 5);
    expect(next).toEqual({ champion: { family: smith, wins: 1, winnings: 950 }, retired: null });
  });

  it("adds a win and the winnings when the champions defend their title", () => {
    const current: ChampionRecord = { family: smith, wins: 2, winnings: 20950 };
    const next = recordResult(current, { winner: smith, winnerWasChampion: true, payout: 20000 }, 5);
    expect(next.champion).toEqual({ family: smith, wins: 3, winnings: 40950 });
  });

  it("replaces the champions when the challengers win", () => {
    const current: ChampionRecord = { family: smith, wins: 3, winnings: 1000 };
    const next = recordResult(current, { winner: jones, winnerWasChampion: false, payout: 0 }, 5);
    expect(next).toEqual({ champion: { family: jones, wins: 1, winnings: 0 }, retired: null });
  });

  it("retires the champions undefeated when they reach the win limit", () => {
    const current: ChampionRecord = { family: smith, wins: 4, winnings: 60000 };
    const next = recordResult(current, { winner: smith, winnerWasChampion: true, payout: 20000 }, 5);
    expect(next).toEqual({ champion: null, retired: { family: smith, wins: 5, winnings: 80000 } });
  });

  it("can retire a family after a single win when the limit is 1", () => {
    const next = recordResult(null, { winner: jones, winnerWasChampion: false, payout: 0 }, 1);
    expect(next).toEqual({ champion: null, retired: { family: jones, wins: 1, winnings: 0 } });
  });

  it("never retires anyone with no limit", () => {
    const current: ChampionRecord = { family: smith, wins: 41, winnings: 0 };
    const next = recordResult(current, { winner: smith, winnerWasChampion: true, payout: 0 }, null);
    expect(next.champion?.wins).toBe(42);
    expect(next.retired).toBeNull();
  });

  it("does not change the record it was given", () => {
    const current: ChampionRecord = { family: smith, wins: 1, winnings: 0 };
    recordResult(current, { winner: smith, winnerWasChampion: true, payout: 5 }, 5);
    expect(current).toEqual({ family: smith, wins: 1, winnings: 0 });
  });
});
